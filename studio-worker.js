(function(root){
 'use strict';
 const specs={
  echo:{label:'Echo',icon:'▥',mix:[.28,0,.8],time:[.24,.05,.75],feedback:[.35,0,.65]},
  chorus:{label:'Chorus',icon:'≈',mix:[.4,0,.8],rate:[.8,.1,5],depth:[.003,.0005,.006]},
  wah:{label:'Wah-wah',icon:'∿',mix:[.6,0,1],rate:[1.2,.1,4],frequency:[1100,400,3000]},
  reverb:{label:'Reverb',icon:'▦',mix:[.35,0,.8],size:[1,.5,2],decay:[.65,.25,.8]}
 };
 function validate(stack=[]){if(!Array.isArray(stack)||stack.length>6)throw new Error('Use up to six effects.');return Array.from(stack,v=>{if(!v||!Object.hasOwn(specs,v.type)||v.enabled!==undefined&&typeof v.enabled!=='boolean')throw new Error('Invalid effect module.');const out={type:v.type,enabled:v.enabled??true};for(const [k,limits]of Object.entries(specs[v.type]))if(Array.isArray(limits)){const x=v[k]??limits[0];if(typeof x!=='number'||!Number.isFinite(x)||x<limits[1]||x>limits[2])throw new Error('Invalid '+v.type+' '+k+'.');out[k]=x;}return out;});}
 function tail(stack=[]){return Math.min(6,validate(stack).filter(e=>e.enabled&&e.mix>0).reduce((s,e)=>s+(e.type==='echo'?e.time*(1+Math.ceil(Math.log(.001)/Math.log(Math.max(.01,e.feedback)))):e.type==='reverb'?.0437*e.size*(1+Math.ceil(Math.log(.001)/Math.log(e.decay))):e.type==='chorus'?.022:0),0));}
 function process(input,rate,stack=[],options={}){
  const list=validate(stack);if(!Number.isInteger(rate)||rate<8000||rate>192000||!input||input.length>rate*480)throw new Error('Invalid effect audio.');
  let data=new Float32Array(input.length+(options.tail?Math.ceil(tail(list)*rate):0));for(let i=0;i<input.length;i++){if(!Number.isFinite(input[i]))throw new Error('Invalid effect sample.');data[i]=input[i];}
  for(const e of list){if(!e.enabled||e.mix===0)continue;const out=new Float32Array(data.length);
   if(e.type==='echo'||e.type==='reverb'){
    const delays=e.type==='echo'?[e.time]:[.0297,.0371,.0411,.0437].map(t=>t*e.size),feedback=e.type==='echo'?e.feedback:e.decay;
    for(const seconds of delays){const n=Math.max(1,Math.round(seconds*rate)),ring=new Float32Array(n);for(let i=0;i<data.length;i++){const j=i%n,wet=ring[j];ring[j]=data[i]+wet*feedback;out[i]+=wet*(1-feedback)/delays.length;}}
    for(let i=0;i<data.length;i++)out[i]=data[i]*(1-e.mix)+out[i]*e.mix;
   }else if(e.type==='chorus'){
    for(let i=0;i<data.length;i++){const at=i-(.014+e.depth*Math.sin(2*Math.PI*e.rate*i/rate))*rate,j=Math.floor(at),f=at-j,wet=j<0?0:data[j]*(1-f)+(data[j+1]||0)*f;out[i]=data[i]*(1-e.mix)+wet*e.mix;}
   }else{
    let x1=0,x2=0,y1=0,y2=0,b0=0,b2=0,a1=0,a2=0;
    for(let i=0;i<data.length;i++){if(i%16===0){const frequency=Math.min(rate*.4,e.frequency*2**(.9*Math.sin(2*Math.PI*e.rate*i/rate))),w=2*Math.PI*frequency/rate,alpha=Math.sin(w)/5,a0=1+alpha;b0=alpha/a0;b2=-b0;a1=-2*Math.cos(w)/a0;a2=(1-alpha)/a0;}const x=data[i],y=b0*x+b2*x2-a1*y1-a2*y2;x2=x1;x1=x;y2=y1;y1=y;out[i]=x*(1-e.mix)+y*e.mix;}
   }
   data=out;
  }
  return data;
 }
 // The live graph uses the same delay, modulation and feedback settings as export.
 function create(context,stack,destination){
  const list=validate(stack),nodes=[],oscillators=[];const gain=value=>{const n=context.createGain();n.gain.value=value;nodes.push(n);return n;};const input=gain(1);let previous=input;
  for(const e of list){if(!e.enabled||e.mix===0)continue;const sum=gain(1),dry=gain(1-e.mix),wet=gain(e.mix);previous.connect(dry);dry.connect(sum);wet.connect(sum);
   if(e.type==='echo'||e.type==='reverb'){
    const delays=e.type==='echo'?[e.time]:[.0297,.0371,.0411,.0437].map(t=>t*e.size),feedback=e.type==='echo'?e.feedback:e.decay;
    for(const seconds of delays){const d=context.createDelay(2),fb=gain(feedback),level=gain((1-feedback)/delays.length);nodes.push(d);d.delayTime.value=seconds;previous.connect(d);d.connect(fb);fb.connect(d);d.connect(level);level.connect(wet);}
   }else if(e.type==='chorus'){
    const d=context.createDelay(.1),lfo=context.createOscillator(),depth=gain(e.depth);nodes.push(d,lfo);d.delayTime.value=.014;lfo.frequency.value=e.rate;lfo.connect(depth);depth.connect(d.delayTime);previous.connect(d);d.connect(wet);lfo.start();oscillators.push(lfo);
   }else{
    const f=context.createBiquadFilter(),lfo=context.createOscillator(),depth=gain(1080);nodes.push(f,lfo);f.type='bandpass';f.frequency.value=e.frequency;f.Q.value=2.5;lfo.frequency.value=e.rate;lfo.connect(depth);depth.connect(f.detune);previous.connect(f);f.connect(wet);lfo.start();oscillators.push(lfo);
   }previous=sum;
  }
  previous.connect(destination);let disposed=false;return {input,dispose(){if(disposed)return;disposed=true;for(const o of oscillators){try{o.stop();}catch{}}for(const n of nodes)n.disconnect();}};
 }
 const api={specs,validate,tail,process,create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.EffectsDSP=api;
})(typeof globalThis!=='undefined'?globalThis:this);

(function(root){
 'use strict';
 // RBJ shelving filters. Shared by drawn cycles, collision PCM and the live amp.
 // This input/output processor can also accept a future guitar voice.
 function shelf(rate,hz,db,high=false){
  const A=10**(db/40),w=2*Math.PI*Math.min(hz,rate*.45)/rate,c=Math.cos(w),s=Math.sin(w),alpha=s/2*Math.SQRT2,beta=2*Math.sqrt(A)*alpha;
  const b=high?[A*((A+1)+(A-1)*c+beta),-2*A*((A-1)+(A+1)*c),A*((A+1)+(A-1)*c-beta)]:[A*((A+1)-(A-1)*c+beta),2*A*((A-1)-(A+1)*c),A*((A+1)-(A-1)*c-beta)];
  const a=high?[(A+1)-(A-1)*c+beta,2*((A-1)-(A+1)*c),(A+1)-(A-1)*c-beta]:[(A+1)+(A-1)*c+beta,-2*((A-1)+(A+1)*c),(A+1)+(A-1)*c-beta];
  let x1=0,x2=0,y1=0,y2=0;return x=>{const y=(b[0]*x+b[1]*x1+b[2]*x2-a[1]*y1-a[2]*y2)/a[0];x2=x1;x1=x;y2=y1;y1=y;return y;};
 }
 function processor(rate,amp){if(!amp?.enabled||!(amp.low||amp.high))return x=>x;const low=shelf(rate,250,amp.low||0),high=shelf(rate,2500,amp.high||0,true);return x=>high(low(x));}
 function cycle(table,frequency,amp){const process=processor(table.length*frequency,amp),out=new Float64Array(table.length);for(let pass=0;pass<16;pass++)for(let i=0;i<table.length;i++)out[i]=process(table[i]);return out;}
 function connect(context,input,destination,amp){const nodes=[];let node=input;for(const [type,hz,db]of [['lowshelf',250,amp.low||0],['highshelf',2500,amp.high||0]]){if(!db)continue;const filter=context.createBiquadFilter();filter.type=type;filter.frequency.value=Math.min(hz,context.sampleRate*.45);filter.gain.value=db;node.connect(filter);node=filter;nodes.push(filter);}node.connect(destination);return nodes;}
 const api={processor,cycle,connect};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AmpTone=api;
})(typeof globalThis!=='undefined'?globalThis:this);

(function(root){
 'use strict';
 const FX=typeof module!=='undefined'&&module.exports?require('./effects-dsp.js'):root.EffectsDSP;
 const Tone=typeof module!=='undefined'&&module.exports?require('./amp-tone.js'):root.AmpTone;
 const SIZE=512,STEPS=32,HARMONICS=128;
 const TYPES=['sine','triangle','square','sawtooth','pulse','organ','softsquare','staircase','pluck','hollow','spike'];
 const MODES=['blend','subtract','multiply','fold'];
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const wrap=x=>((x%1)+1)%1;
 const cos=new Float64Array(SIZE*HARMONICS),sin=new Float64Array(SIZE*HARMONICS);
 for(let n=1;n<HARMONICS;n++)for(let i=0;i<SIZE;i++){const phase=2*Math.PI*n*i/SIZE;cos[n*SIZE+i]=Math.cos(phase);sin[n*SIZE+i]=Math.sin(phase);}
 function sample(table,phase){const at=wrap(phase)*table.length,j=Math.floor(at),t=at-j;return table[j]*(1-t)+table[(j+1)%table.length]*t;}
 function preset(type){
  if(!TYPES.includes(type))throw new Error('Unknown waveform shape.');
  return Array.from({length:STEPS},(_,i)=>{const p=i/STEPS,s=Math.sin(2*Math.PI*p);switch(type){
   case 'triangle':return 2/Math.PI*Math.asin(s);
   case 'square':return p<.5?1:-1;
   case 'sawtooth':return 2*(p-Math.floor(p+.5));
   case 'pulse':return p<.25?1:-1/3;
   case 'organ':return (s+.45*Math.sin(4*Math.PI*p)+.18*Math.sin(6*Math.PI*p)+.12*Math.sin(8*Math.PI*p))/1.35;
   case 'softsquare':return Math.tanh(2.5*s)/Math.tanh(2.5);
   case 'staircase':return Math.round(2*(p-Math.floor(p+.5))*4)/4;
   case 'pluck':return s*Math.exp(-3*p);
   case 'hollow':return (s+.5*Math.sin(6*Math.PI*p)+.25*Math.sin(10*Math.PI*p))/1.5;
   case 'spike':return p<.125?1:-1/7;
   default:return s;
  }});
 }
 function source(type='sine'){return {points:preset(type),shape:type,smoothness:0,level:1,phase:0,ratio:1,inverted:false};}
 function defaultProject(){return {version:1,a:source('sine'),b:{...source('triangle'),ratio:2},mode:'blend',amount:.5,normalize:false,amp:ampSettings(),effects:[]};}
 function centered(table){const mean=table.reduce((s,v)=>s+v,0)/table.length;return Float64Array.from(table,x=>x-mean);}
 function peakOf(table){let peak=0;for(const x of table)peak=Math.max(peak,Math.abs(x));return peak;}
 function shapePoints(voice){
  const amount=voice.smoothness??0;
  if(typeof amount!=='number'||!Number.isFinite(amount)||amount<0||amount>1)throw new Error('Smoothness must be between zero and one.');
  let points=Array.from(voice.points),passes=amount*8;
  for(let i=0;i<Math.floor(passes);i++)points=smoothPoints(points);
  const fraction=passes-Math.floor(passes);
  if(fraction){const next=smoothPoints(points);points=points.map((v,i)=>v+(next[i]-v)*fraction);}
  return points;
 }
 function shapeSample(points,phase,amount=0){
  if(amount===0)return sample(points,phase);
  const n=points.length,at=wrap(phase)*n,j=Math.floor(at),t=at-j,a=points[j],b=points[(j+1)%n];
  const before=a-points[(j+n-1)%n],delta=b-a,after=points[(j+2)%n]-b;
  const slope=(x,y)=>x*y>0?2*x*y/(x+y):0,m0=slope(before,delta),m1=slope(delta,after),t2=t*t,t3=t2*t;
  const curved=(2*t3-3*t2+1)*a+(t3-2*t2+t)*m0+(-2*t3+3*t2)*b+(t3-t2)*m1;
  return a+(b-a)*t+(curved-(a+(b-a)*t))*amount;
 }
 function sourceOutline(voice){const points=shapePoints(voice);return Float64Array.from({length:SIZE},(_,i)=>shapeSample(points,i/SIZE,voice.smoothness??0));}
 function renderSource(voice){
  const points=centered(shapePoints(voice)),scale=Math.max(1,peakOf(points));
  const gain=voice.level*(voice.inverted?-1:1)/scale;
  return Float64Array.from({length:SIZE},(_,i)=>shapeSample(points,i/SIZE*voice.ratio+voice.phase/360,voice.smoothness??0)*gain);
 }
 function coefficients(table){
  const real=new Float32Array(HARMONICS),imag=new Float32Array(HARMONICS);
  for(let n=1;n<HARMONICS;n++){let a=0,b=0;for(let i=0;i<SIZE;i++){a+=table[i]*cos[n*SIZE+i];b+=table[i]*sin[n*SIZE+i];}real[n]=Math.abs(a)<1e-9?0:2*a/SIZE;imag[n]=Math.abs(b)<1e-9?0:2*b/SIZE;}
  return {real,imag};
 }
 function reconstruct(real,imag,maxHarmonic=HARMONICS-1){
  const table=new Float64Array(SIZE);
  for(let n=1;n<=Math.min(maxHarmonic,real.length-1);n++)if(real[n]||imag[n])for(let i=0;i<SIZE;i++)table[i]+=real[n]*cos[n*SIZE+i]+imag[n]*sin[n*SIZE+i];
  return table;
 }
 function analyse(input,normalize=false){
  const {real,imag}=coefficients(centered(input));let table=reconstruct(real,imag),peak=peakOf(table);
  const scale=peak>1?1/peak:normalize&&peak>1e-6?1/peak:1;
  if(scale!==1){for(let i=1;i<real.length;i++){real[i]*=scale;imag[i]*=scale;}table=reconstruct(real,imag);peak=peakOf(table);}
  let sum=0;for(const x of table)sum+=x*x;
  return {table,real,imag,peak,rms:Math.sqrt(sum/SIZE)};
 }
 function fold(x){return 1-Math.abs(((x+1)%4+4)%4-2);}
 function combine(a,b,mode,amount){
  return Float64Array.from(a,(x,i)=>{const y=b[i];switch(mode){
   case 'subtract':return x*(1-amount)-y*amount;
   case 'multiply':return x*(1-amount)+x*y*amount;
   case 'fold':return fold((x+y)*.5*(1+amount*3));
   default:return x*(1-amount)+y*amount;
  }});
 }
 function ampSettings(a={}){const n=(v,d,min,max)=>{v=v??d;if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new Error('Invalid amp setting.');return v;};if(a.enabled!==undefined&&typeof a.enabled!=='boolean')throw new Error('Invalid amp switch.');return {enabled:a.enabled??false,drive:n(a.drive,2,1,12),color:n(a.color,.25,0,1),mix:n(a.mix,.7,0,1),output:n(a.output,.7,0,1),low:n(a.low,0,-12,12),high:n(a.high,0,-12,12)};}
 function ampSample(x,value){const a=value;if(!a?.enabled)return x;const soft=Math.tanh(x*a.drive)/Math.tanh(a.drive),hard=clamp(x*a.drive,-1,1),wet=soft*(1-a.color)+hard*a.color;return (x*(1-a.mix)+wet*a.mix)*a.output;}
 function compile(project,{frequency=134}={}){
  const a=analyse(renderSource(project.a)),b=analyse(renderSource(project.b));
  const result=analyse(combine(a.table,b.table,project.mode,project.amount),project.normalize);
  return {a,b,result:project.amp?.enabled?analyse(Tone.cycle(Float64Array.from(result.table,x=>ampSample(x,project.amp)),frequency,project.amp)):result};
 }
 function smoothPoints(points){return points.map((v,i)=>(points[(i+STEPS-1)%STEPS]+v*2+points[(i+1)%STEPS])/4);}
 function drawSegment(points,from,to){
  const low=Math.min(from.index,to.index),high=Math.max(from.index,to.index);
  for(let i=low;i<=high;i++){const t=from.index===to.index?1:(i-from.index)/(to.index-from.index);points[i]=clamp(from.value+(to.value-from.value)*t,-1,1);}
  return points;
 }
 function capture(table){return Array.from({length:STEPS},(_,i)=>clamp(sample(table,i/STEPS),-1,1));}
 function validatePatch(data){
  const number=(x,min,max,name)=>{if(typeof x!=='number'||!Number.isFinite(x)||x<min||x>max)throw new Error(`Invalid ${name}.`);return x;};
  const boolean=(x,name)=>{if(typeof x!=='boolean')throw new Error(`Invalid ${name}.`);return x;};
  if(!data||data.kind!=='dot-wave-studio'||!data.project||data.project.version!==1)throw new Error('Choose a Dot Wave Studio patch file.');
  const p=data.project;
  function voice(x){if(!x||!Array.isArray(x.points)||x.points.length!==STEPS)throw new Error('Each wave needs 32 points.');if(![1,2,3,4,8].includes(x.ratio))throw new Error('Invalid wave ratio.');return {points:x.points.map(v=>number(v,-1,1,'wave point')),shape:TYPES.includes(x.shape)?x.shape:'custom',smoothness:number(x.smoothness??0,0,1,'wave smoothness'),level:number(x.level,0,1,'wave level'),phase:number(x.phase,0,360,'wave phase'),ratio:x.ratio,inverted:boolean(x.inverted,'polarity')};}
  if(!MODES.includes(p.mode))throw new Error('Unknown battle mode.');
  const eq=data.eq??{gains:Array(10).fill(0),bypass:false},channel=data.channel??0;
  if(!eq||!Array.isArray(eq.gains)||eq.gains.length!==10)throw new Error('Invalid equalizer settings.');
  if(![-1,0,1].includes(channel))throw new Error('Invalid output channel.');
  const freePair=data.freePair==null?null:{a:number(data.freePair.a,20,20000,'Wave A pitch'),b:number(data.freePair.b,20,20000,'Wave B pitch')};
  return {kind:'dot-wave-studio',freePair,project:{version:1,a:voice(p.a),b:voice(p.b),mode:p.mode,amount:number(p.amount,0,1,'battle amount'),normalize:boolean(p.normalize,'normalization'),amp:ampSettings(p.amp),effects:FX.validate(p.effects)},pitch:number(data.pitch,20,20000,'pitch'),level:number(data.level,-60,0,'tone level'),volume:number(data.volume,0,1,'output volume'),inverted:boolean(data.inverted,'output polarity'),eq:{gains:eq.gains.map(v=>number(v,-12,12,'EQ gain')),bypass:boolean(eq.bypass,'EQ bypass')},throughEQ:boolean(data.throughEQ??false,'EQ routing'),channel};
 }
 function encodeWav(signal,{frequency=440,gain=.05,inverted=false,duration=2,rate=48000}={}){
  if(!Number.isFinite(frequency)||frequency<20||frequency>20000)throw new Error('Invalid export frequency.');
  if(!Number.isFinite(gain)||gain<0||gain>1)throw new Error('Invalid export level.');
  const frames=Math.round(rate*duration),buffer=new ArrayBuffer(44+frames*2),view=new DataView(buffer);
  const text=(at,str)=>{for(let i=0;i<str.length;i++)view.setUint8(at+i,str.charCodeAt(i));};
  text(0,'RIFF');view.setUint32(4,36+frames*2,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,frames*2,true);
  // Match the oscillator's harmonic cutoff, instead of aliasing the drawn corners.
  const table=reconstruct(signal.real,signal.imag,Math.floor(rate*.49/frequency));
  for(let i=0;i<frames;i++){const envelope=Math.min(1,i/(rate*.015),(frames-1-i)/(rate*.015));const value=sample(table,i*frequency/rate)*gain*envelope*(inverted?-1:1);view.setInt16(44+i*2,Math.round(clamp(value,-1,1)*32767),true);}
  return buffer;
 }
 const api={SIZE,STEPS,HARMONICS,TYPES,MODES,ampSettings,ampSample,sample,preset,source,defaultProject,centered,peakOf,shapePoints,shapeSample,sourceOutline,renderSource,coefficients,reconstruct,analyse,fold,combine,compile,smoothPoints,drawSegment,capture,validatePatch,encodeWav};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StudioDSP=api;
})(typeof globalThis!=='undefined'?globalThis:this);

(function(root){
 'use strict';
 const D=typeof module!=='undefined'&&module.exports?require('./studio-dsp.js'):root.StudioDSP;
 const Tone=typeof module!=='undefined'&&module.exports?require('./amp-tone.js'):root.AmpTone;
 if(!D)throw new Error('CollisionAudio needs StudioDSP.');
 const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
 function finite(value,low,high,label){if(typeof value!=='number'||!Number.isFinite(value)||value<low||value>high)throw new Error(`Invalid ${label}.`);return value;}
 function validatePair(pair,rate=48000){
  finite(rate,8000,192000,'audio sample rate');
  if(!pair||typeof pair!=='object')throw new Error('Choose two waveform pitches.');
  const max=Math.min(20000,rate*.45);
  return {a:finite(pair.a,20,max,'Wave A pitch'),b:finite(pair.b,20,max,'Wave B pitch')};
 }
 function checkProject(project){
  if(!project||!D.MODES.includes(project.mode))throw new Error('Invalid collision mode.');
  finite(project.amount,0,1,'collision amount');
  if(typeof project.normalize!=='boolean')throw new Error('Invalid normalization setting.');
  for(const id of ['a','b']){
   const voice=project[id];
   if(!voice||!Array.isArray(voice.points)||voice.points.length!==D.STEPS||Array.from(voice.points).some(v=>typeof v!=='number'||!Number.isFinite(v)||v< -1||v>1))throw new Error(`Wave ${id.toUpperCase()} needs 32 finite points.`);
   finite(voice.level,0,1,'wave level');finite(voice.phase,0,360,'wave phase');
   if(typeof voice.inverted!=='boolean')throw new Error('Invalid waveform inversion.');
  }
 }
 function source(voice,frequency,rate){
  const original=D.analyse(D.renderSource({...voice,ratio:1}));
  const real=Float32Array.from(original.real),imag=Float32Array.from(original.imag);
  const limit=Math.floor(rate*.45/frequency);
  for(let n=limit+1;n<real.length;n++){real[n]=0;imag[n]=0;}
  let table=D.reconstruct(real,imag),peak=D.peakOf(table);
  // Truncating a sharp spectrum can slightly increase its peak. Keep both the
  // real oscillator and the PCM renderer inside the same unit source bound.
  if(peak>1){for(let n=1;n<real.length;n++){real[n]/=peak;imag[n]/=peak;}table=D.reconstruct(real,imag);peak=D.peakOf(table);}
  return {real,imag,table,peak};
 }
 function bound(project,a,b){
  const mix=project.amount;
  if(project.mode==='multiply')return a*(1-mix)+a*b*mix;
  if(project.mode==='fold')return Math.min(1,(a+b)*.5*(1+3*mix));
  return a*(1-mix)+b*mix;
 }
 function prepare(project,pair,rate){
  checkProject(project);pair=validatePair(pair,rate);
  const a=source(project.a,pair.a,rate),b=source(project.b,pair.b,rate),peakBound=bound(project,a.peak,b.peak);
  // Different pitches need not share a short period. Normalize against a
  // conservative bound, not a short observation that could miss later peaks.
  const scale=project.normalize&&peakBound>1e-6?1/peakBound:1;
  return {a,b,pair,scale,peakBound};
 }
 function mixed(a,b,project){
  const m=project.amount;
  if(project.mode==='subtract')return a*(1-m)-b*m;
  if(project.mode==='multiply')return a*(1-m)+a*b*m;
  if(project.mode==='fold')return D.fold((a+b)*.5*(1+3*m));
  return a*(1-m)+b*m;
 }
 function targetValue(a,b,project,prepared,target){return target==='a'?a:target==='b'?b:D.ampSample(mixed(a,b,project)*prepared.scale,project.amp);}
 function selectedTarget(value){if(!['result','a','b'].includes(value))throw new Error('Invalid listening target.');return value;}
 function preview(project,pair,{rate=48000,offset=0}={}){
  finite(offset,0,1e9,'preview time');
  const p=prepare(project,pair,rate),duration=Math.min(2/Math.min(p.pair.a,p.pair.b),64/Math.max(p.pair.a,p.pair.b));
  const raw={a:new Float64Array(D.SIZE),b:new Float64Array(D.SIZE),result:new Float64Array(D.SIZE)};
  for(let i=0;i<D.SIZE;i++){
   const time=offset+i/D.SIZE*duration;
   raw.a[i]=D.sample(p.a.table,time*p.pair.a);raw.b[i]=D.sample(p.b.table,time*p.pair.b);
   raw.result[i]=D.ampSample(mixed(raw.a[i],raw.b[i],project)*p.scale,project.amp);
  }
  function signal(table){
   // Coefficients describe a centered, repeating snapshot for the wave library;
   // the graph's table is the actual time window, including any nonzero mean.
   const snapshot=D.analyse(table);let energy=0;for(const value of table)energy+=value*value;
   return {...snapshot,table,peak:D.peakOf(table),rms:Math.sqrt(energy/table.length)};
  }
  return {a:signal(raw.a),b:signal(raw.b),result:signal(Tone.cycle(raw.result,1/duration,project.amp)),duration,frequency:1/duration,scale:p.scale};
 }
 function render(project,pair,{rate=48000,duration=2,gain=1,inverted=false,target='result',fade=.015}={}){
  finite(duration,.001,30,'render duration');finite(gain,0,1,'render gain');finite(fade,0,1,'fade length');
  if(typeof inverted!=='boolean')throw new Error('Invalid output inversion.');
  target=selectedTarget(target);const p=prepare(project,pair,rate),frames=Math.max(1,Math.round(rate*duration)),result=new Float32Array(frames),tone=Tone.processor(rate,target==='result'?project.amp:null);
  for(let i=0;i<frames;i++){
   const time=i/rate,a=D.sample(p.a.table,time*p.pair.a),b=D.sample(p.b.table,time*p.pair.b);
   const envelope=fade===0?1:Math.min(1,i/(rate*fade),(frames-1-i)/(rate*fade));
   result[i]=clamp(tone(targetValue(a,b,project,p,target))*gain*(inverted?-1:1)*envelope,-1,1);
  }
  return result;
 }
 function encodeWav(samples,rate=48000){
  finite(rate,8000,192000,'WAV sample rate');
  if(!Number.isInteger(rate)||!samples||!Number.isInteger(samples.length)||samples.length<1||samples.length>rate*30)throw new Error('Invalid WAV samples.');
  const buffer=new ArrayBuffer(44+samples.length*2),view=new DataView(buffer);
  const write=(at,text)=>{for(let i=0;i<text.length;i++)view.setUint8(at+i,text.charCodeAt(i));};
  write(0,'RIFF');view.setUint32(4,buffer.byteLength-8,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,samples.length*2,true);
  for(let i=0;i<samples.length;i++){finite(samples[i],-1,1,'WAV sample');view.setInt16(44+i*2,Math.round(samples[i]*32767),true);}
  return buffer;
 }
 function create(context,project,pair,destination,{target='result',at=context.currentTime}={}){
  target=selectedTarget(target);finite(at,0,1e12,'oscillator start time');
  const p=prepare(project,pair,context.sampleRate),nodes=[],oscs=[];
  const gain=value=>{const node=context.createGain();node.gain.value=value;nodes.push(node);return node;};
  let ended=0,stopped=false,disconnected=false;
  function disconnect(){if(disconnected)return;disconnected=true;for(const node of nodes){try{node.disconnect();}catch(error){/* Node already detached. */}}}
  function stop(time=context.currentTime){if(stopped)return;stopped=true;for(const osc of oscs){try{osc.stop(time);}catch(error){/* Oscillator already ended. */}}}
  try{
   for(const id of ['a','b']){
    const osc=context.createOscillator();nodes.push(osc);oscs.push(osc);
    osc.setPeriodicWave(context.createPeriodicWave(p[id].real,p[id].imag,{disableNormalization:true}));osc.frequency.value=p.pair[id];
    osc.onended=()=>{if(++ended===oscs.length)disconnect();};
   }
   const [a,b]=oscs,output=gain(target==='result'?p.scale:1);if(target==='result'&&project.amp?.enabled){const amp=context.createWaveShaper(),curve=new Float32Array(4097);nodes.push(amp);for(let i=0;i<curve.length;i++)curve[i]=D.ampSample(i/(curve.length-1)*2-1,project.amp);amp.curve=curve;amp.oversample='4x';output.connect(amp);nodes.push(...Tone.connect(context,amp,destination,project.amp));}else output.connect(destination);
   if(target==='a')a.connect(output);
   else if(target==='b')b.connect(output);
   else if(project.mode==='multiply'){
    const dry=gain(1-project.amount),multiply=gain(0),wet=gain(project.amount);
    a.connect(dry);dry.connect(output);a.connect(multiply);b.connect(multiply.gain);multiply.connect(wet);wet.connect(output);
   }else if(project.mode==='fold'){
    const sum=gain(.5),fold=context.createWaveShaper(),curve=new Float32Array(4097);nodes.push(fold);
    const drive=1+3*project.amount;
    for(let i=0;i<curve.length;i++)curve[i]=D.fold((i/(curve.length-1)*2-1)*drive);
    fold.curve=curve;fold.oversample='4x';a.connect(sum);b.connect(sum);sum.connect(fold);fold.connect(output);
   }else{
    const ga=gain(1-project.amount),gb=gain(project.amount*(project.mode==='subtract'?-1:1));
    a.connect(ga);b.connect(gb);ga.connect(output);gb.connect(output);
   }
   a.start(at);b.start(at);
   return {stop,disconnect,nodes,oscs,scale:p.scale,startTime:at};
  }catch(error){stop(context.currentTime);disconnect();throw error;}
 }
 const api={validatePair,prepare,preview,render,encodeWav,create};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CollisionAudio=api;
})(typeof globalThis!=='undefined'?globalThis:this);

(function(root){
 'use strict';
 const FX=typeof module!=='undefined'&&module.exports?require('./effects-dsp.js'):root.EffectsDSP;
 const Studio=typeof module!=='undefined'&&module.exports?require('./studio-dsp.js'):root.StudioDSP;
 if(!Studio)throw new Error('DrumDSP needs StudioDSP.');
 const MODIFIERS=['','up','down','soft','short','long','double','triple','flam','accent'];
 function validateModifiers(value,length){if(value===undefined)return undefined;if(!Array.isArray(value)||value.length!==length||!value.every(v=>MODIFIERS.includes(v)))throw new Error('Invalid hit modifiers.');return [...value];}
 function modifiedTrack(track,step){const m=track.modifiers?.[step]||'';if(!m)return track;return {...track,pitch:clamp(track.pitch*2**((m==='up'?1:m==='down'?-1:0)/12),30,2000),decay:clamp(track.decay*(m==='short'?.65:m==='long'?1.35:1),.03,1.5),level:clamp(track.level*(m==='soft'?.65:m==='accent'?1.25:1),0,1)};}
 function hitEvents(track,step,span=1){const m=track.modifiers?.[step],hits=m==='double'?[[0,1],[.5,.7]]:m==='triple'?[[0,1],[1/3,.8],[2/3,.65]]:m==='flam'?[[0,.45],[.12,1]]:[[0,1]];return hits.map(([at,v],i)=>({offset:at*span,gate:((hits[i+1]?.[0]??1)-at)*span*.85,velocity:track.steps[step]*v,track:modifiedTrack(track,step)}));}
 function resizeModifiers(track,bars,oldCount,newCount){if(!track.modifiers)return {};const modifiers=Array(bars*newCount).fill('');for(let b=0;b<Math.min(bars,track.steps.length/oldCount);b++)for(let i=0;i<Math.min(oldCount,newCount);i++)modifiers[b*newCount+i]=track.modifiers[b*oldCount+i];return {modifiers};}
 const STEPS=16,MAX_TRACKS=8;
 const PAD_MAP={1:{name:'Kick',track:0},2:{name:'Snare',track:1},3:{name:'Hat',track:2},4:{name:'Low tom',track:3,pitch:.65},5:{name:'Perc',track:3},6:{name:'Open hat',track:2,decay:2.5},7:{name:'Soft kick',track:0,velocity:.5},8:{name:'Rim',track:1,decay:.4,pitch:1.5},9:{name:'High perc',track:3,pitch:1.7}};
 function defaultPads(length=16){return Array.from({length:9},(_,i)=>({number:i+1,waveId:null,steps:Array(length).fill(0)}));}
 function validatePads(pads,length){if(pads===undefined)return undefined;if(!Array.isArray(pads)||pads.length!==9)throw new Error('A pad kit needs nine pads.');const seen=new Set();return Array.from(pads,p=>{if(!p||!Number.isInteger(p.number)||p.number<1||p.number>9||seen.has(p.number)||p.waveId!==null&&(typeof p.waveId!=='string'||!/^[a-zA-Z0-9_-]{1,90}$/.test(p.waveId))||!Array.isArray(p.steps)||p.steps.length!==length||!Array.from(p.steps).every(v=>[0,.5,1].includes(v)))throw new Error('Invalid recorded pad.');seen.add(p.number);return {number:p.number,waveId:p.waveId,steps:[...p.steps],...(p.modifiers!==undefined?{modifiers:validateModifiers(p.modifiers,length)}:{})};}).sort((a,b)=>a.number-b.number);}
 function padTrack(pattern,pad){const map=PAD_MAP[pad.number],voice=pattern.tracks[map.track];return {...voice,id:'pad-'+pad.number,name:map.name,waveId:pad.waveId||voice.waveId,pitch:clamp(voice.pitch*(map.pitch||1),30,2000),decay:clamp(voice.decay*(map.decay||1),.03,1.5),noise:pad.waveId?0:voice.noise,steps:pad.steps,modifiers:pad.modifiers};}
 function allTracks(pattern){return [...pattern.tracks,...(pattern.pads||[]).map(p=>padTrack(pattern,p))];}
 function nearestStep(seconds,bpm,swing,length){const stepLength=60/bpm/4,cycle=length*stepLength,local=((seconds%cycle)+cycle)%cycle;let at=0,best=0,distance=Infinity;for(let i=0;i<length;i++){const d=Math.min(Math.abs(local-at),cycle-Math.abs(local-at));if(d<distance){distance=d;best=i;}at+=stepSeconds(bpm,swing,i);}return best;}
 const METERS=[[3,4],[4,4],[5,4],[6,8],[7,8]];
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 function number(x,min,max,name){if(typeof x!=='number'||!Number.isFinite(x)||x<min||x>max)throw new Error(`Invalid ${name}.`);return x;}
 function rateValue(rate){number(rate,8000,192000,'sample rate');if(!Number.isInteger(rate))throw new Error('Sample rate must be an integer.');return rate;}
 function numericArray(value){return (Array.isArray(value)||ArrayBuffer.isView(value))&&Number.isInteger(value.length);}
 function text(value,max,name){if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error(`Invalid ${name}.`);return value.trim();}
 function validateMeter(meter={numerator:4,denominator:4}){if(!meter||!METERS.some(([n,d])=>meter.numerator===n&&meter.denominator===d))throw new Error('Choose 3/4, 4/4, 5/4, 6/8, or 7/8 time.');return {numerator:meter.numerator,denominator:meter.denominator};}
 function stepsPerBar(meter){const m=validateMeter(meter);return m.numerator*16/m.denominator;}
 function patternLength(pattern){const count=stepsPerBar(pattern.meter),storedLength=pattern.tracks?.[0]?.steps?.length,bars=pattern.bars??(storedLength===undefined?1:storedLength/count);if(!Number.isInteger(bars)||bars<1||bars>8)throw new Error('A beat needs one to eight measures.');return count*bars;}
 function voiceSettings(track){
  if(!track||typeof track!=='object')throw new Error('Invalid drum voice.');
  return {pitch:number(track.pitch,30,2000,'drum pitch'),decay:number(track.decay,.03,1.5,'drum decay'),sweep:number(track.sweep,0,36,'pitch sweep'),noise:number(track.noise,0,1,'noise amount'),tone:number(track.tone,200,18000,'tone cutoff'),level:number(track.level,0,1,'drum level')};
 }
 function validateTrack(track){
  const voice=voiceSettings(track);
  const id=text(track.id,64,'track id'),name=text(track.name,40,'track name'),waveId=text(track.waveId,100,'waveform id');
  if(typeof track.mute!=='boolean')throw new Error('Invalid track mute.');
  if(!Array.isArray(track.steps)||track.steps.length<12||track.steps.length>160||!Array.from(track.steps).every(v=>v===0||v===.5||v===1))throw new Error('Each track needs valid measure steps with velocities 0, 0.5, or 1.');
  return {id,name,waveId,...voice,mute:track.mute,steps:[...track.steps],...(track.modifiers!==undefined?{modifiers:validateModifiers(track.modifiers,track.steps.length)}:{})};
 }
 function validateBeat(beat){
  if(!beat||!Array.isArray(beat.tracks)||beat.tracks.length<1||beat.tracks.length>MAX_TRACKS)throw new Error('A beat needs one to eight tracks.');
  const tracks=beat.tracks.map(validateTrack);
  if(new Set(tracks.map(t=>t.id)).size!==tracks.length)throw new Error('Track ids must be unique.');
  const meter=validateMeter(beat.meter),length=patternLength({...beat,meter}),bars=length/stepsPerBar(meter);
  if(tracks.some(t=>t.steps.length!==length))throw new Error('Every drum lane must match the measure count and time signature.');
  const pads=validatePads(beat.pads,length);return {bpm:number(beat.bpm,40,240,'tempo'),swing:number(beat.swing,0,.45,'swing'),bars,meter,tracks,...(pads?{pads}:{})};
 }
 function validatePattern(data){
  const beat=validateBeat(data),names={kick:'Kick',snare:'Snare',hat:'Hat',perc:'Perc'};
  if(beat.tracks.length!==4||beat.tracks.some(t=>!Object.hasOwn(names,t.id)||t.name!==names[t.id]))throw new Error('A drum machine pattern needs Kick, Snare, Hat, and Perc tracks.');
  // Always restore the same lane order, even if a JSON file reordered its tracks.
  return {...beat,tracks:Object.keys(names).map(id=>beat.tracks.find(t=>t.id===id))};
 }
 function defaultTracks(){
  const steps=(hits,soft=[])=>Array.from({length:STEPS},(_,i)=>hits.includes(i)?1:soft.includes(i)?.5:0);
  return [
   {id:'kick',name:'Kick',waveId:'stock-sine',pitch:52,decay:.42,sweep:28,noise:0,tone:2200,level:.85,mute:false,steps:steps([0,8],[6,14])},
   {id:'snare',name:'Snare',waveId:'stock-triangle',pitch:185,decay:.2,sweep:5,noise:.7,tone:8500,level:.55,mute:false,steps:steps([4,12])},
   {id:'hat',name:'Hat',waveId:'stock-square',pitch:1200,decay:.065,sweep:0,noise:.95,tone:16000,level:.3,mute:false,steps:steps([2,6,10,14],[0,4,8,12])},
   {id:'perc',name:'Perc',waveId:'stock-triangle',pitch:350,decay:.16,sweep:8,noise:.12,tone:6500,level:.4,mute:false,steps:steps([11],[3,15])}
  ];
 }
 function resizePattern(pattern,options={}){
  const current=validatePattern(pattern),bars=options.bars===undefined?current.bars:options.bars,nextMeter=validateMeter(options.meter===undefined?current.meter:options.meter);if(!Number.isInteger(bars)||bars<1||bars>8)throw new Error('Choose one to eight measures.');
  const oldCount=stepsPerBar(current.meter),newCount=stepsPerBar(nextMeter);
  const tracks=current.tracks.map(track=>{const steps=Array(bars*newCount).fill(0);for(let bar=0;bar<Math.min(bars,current.bars);bar++)for(let step=0;step<Math.min(oldCount,newCount);step++)steps[bar*newCount+step]=track.steps[bar*oldCount+step];return {...track,steps,...resizeModifiers(track,bars,oldCount,newCount)};});
  const pads=current.pads?.map(p=>{const steps=Array(bars*newCount).fill(0);for(let bar=0;bar<Math.min(bars,current.bars);bar++)for(let i=0;i<Math.min(oldCount,newCount);i++)steps[bar*newCount+i]=p.steps[bar*oldCount+i];return {...p,steps,...resizeModifiers(p,bars,oldCount,newCount)};});return {...current,bars,meter:nextMeter,tracks,...(pads?{pads}:{})};
 }
 function signalCoefficients(signal){
  if(!signal||typeof signal!=='object')throw new Error('Choose a saved waveform for this drum.');
  if(signal.real!==undefined||signal.imag!==undefined){
   const a=signal.real,b=signal.imag;
   if(!numericArray(a)||!numericArray(b)||a.length!==b.length||a.length<2||a.length>Studio.HARMONICS)throw new Error('Invalid waveform coefficients.');
   if(!Array.from(a).every(x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=16)||!Array.from(b).every(x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=16))throw new Error('Invalid waveform coefficient value.');
   const real=Float32Array.from(a),imag=Float32Array.from(b);real[0]=0;imag[0]=0;return {real,imag};
  }
  const table=signal.table;
  if(!numericArray(table)||table.length<16||table.length>4096||!Array.from(table).every(x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=16))throw new Error('Invalid waveform table.');
  const resampled=Float64Array.from({length:Studio.SIZE},(_,i)=>Studio.sample(table,i/Studio.SIZE));
  return Studio.coefficients(Studio.centered(resampled));
 }
 function seedFor(track){
  const key=String(track.id||'drum')+'|'+String(track.waveId||'wave');let seed=2166136261;
  for(let i=0;i<key.length;i++){seed^=key.charCodeAt(i);seed=Math.imul(seed,16777619);}
  return seed>>>0||1;
 }
 function renderHit(signal,track,sampleRate=48000){
  const rate=rateValue(sampleRate),voice=voiceSettings(track),frames=Math.max(2,Math.round(voice.decay*rate));
  if(track.mute!==undefined&&typeof track.mute!=='boolean')throw new Error('Invalid track mute.');
  const {real,imag}=signalCoefficients(signal);
  const output=new Float32Array(frames);
  if(track.mute||voice.level===0)return output;
  // The table is limited for the highest point of the pitch sweep, so corners
  // in a custom shape cannot fold back into audible aliases at the attack.
  const highestPitch=voice.pitch*2**(voice.sweep/12);
  const maxHarmonic=Math.max(0,Math.floor(rate*.45/highestPitch));
  const table=Studio.reconstruct(real,imag,maxHarmonic);
  const sourceScale=1/Math.max(1,Studio.peakOf(table));
  // Noise-rich hits need more time to open than tonal kicks. Ease both edges
  // so the first few random samples do not read as an isolated digital crack.
  const attack=Math.min(.006+voice.noise*.006,voice.decay*.18),tail=Math.min(.016,voice.decay*.2),pitchTime=Math.max(.006,voice.decay*.17);
  const cutoff=Math.min(voice.tone,rate*.45),alpha=1-Math.exp(-2*Math.PI*cutoff/rate);
  let phase=0,filtered=0,filteredNoise=0,seed=seedFor(track);
  for(let i=0;i<frames;i++){
   const t=i/rate;
   const pitched=Studio.sample(table,phase)*sourceScale;
   phase=(phase+voice.pitch*2**(voice.sweep*Math.exp(-t/pitchTime)/12)/rate)%1;
   seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
   const noise=(seed>>>0)/4294967295*2-1;
   // A second low-pass pole on noise suppresses the sample-to-sample spikes
   // measured in brush/snare exports, while leaving the tonal wave unchanged.
   filteredNoise+=alpha*(noise-filteredNoise);
   const raw=pitched*(1-voice.noise)+filteredNoise*voice.noise;
   filtered+=alpha*(raw-filtered);
   const ease=x=>.5-.5*Math.cos(Math.PI*Math.min(1,Math.max(0,x)));
   const envelope=ease(t/attack)*Math.exp(-5.5*t/voice.decay)*ease((frames-1-i)/(tail*rate));
   output[i]=clamp(filtered*envelope*voice.level,-1,1);
  }
  output[0]=0;output[frames-1]=0;
  return FX.process(output,rate,signal.effects,{tail:true});
 }
 function stepSeconds(bpm,swing,stepIndex){
  number(bpm,40,240,'tempo');number(swing,0,.45,'swing');
  if(!Number.isInteger(stepIndex)||stepIndex<0)throw new Error('Invalid step index.');
  return 60/bpm/4*(stepIndex%2===0?1+swing:1-swing);
 }
 function renderPattern(signalsById,tracks,{bpm=110,swing=0,bars=2,meter={numerator:4,denominator:4},rate=48000,gain=.5,loop=false,pads}={}){
  const beat=validateBeat({bpm,swing,meter,tracks,pads});rateValue(rate);number(gain,0,1,'render gain');if(typeof loop!=='boolean')throw new Error('Invalid loop export setting.');const voices=allTracks(beat);
  if(!Number.isInteger(bars)||bars<1||bars>8)throw new Error('Render one to eight bars.');
  if(!signalsById||typeof signalsById!=='object')throw new Error('Missing waveform library.');
  const getSignal=id=>signalsById instanceof Map?signalsById.get(id):Object.hasOwn(signalsById,id)?signalsById[id]:undefined;
  const hits=new Map();
  for(const track of voices){
   const signal=getSignal(track.waveId);if(!signal)throw new Error(`Missing waveform for ${track.name}.`);
   hits.set(track.id+':',renderHit(signal,track,rate));
  }
  const events=[];let time=0,lastEnd=0;
  const count=stepsPerBar(beat.meter),patternSteps=patternLength(beat);
  for(let step=0;step<count*bars;step++){
   const frame=Math.round(time*rate);
   for(const track of voices){const velocity=track.steps[step%patternSteps];if(!track.mute&&velocity>0){const variant=track.modifiers?.[step%patternSteps]||'',key=track.id+':'+variant;if(!hits.has(key))hits.set(key,renderHit(getSignal(track.waveId),modifiedTrack(track,step%patternSteps),rate));const hit=hits.get(key);for(const event of hitEvents(track,step%patternSteps,stepSeconds(bpm,swing,step))){const at=frame+Math.round(event.offset*rate);events.push({frame:at,hit,velocity:event.velocity});lastEnd=Math.max(lastEnd,at+hit.length);}}}
   time+=stepSeconds(bpm,swing,step);
  }
  const loopFrames=Math.round(time*rate),samples=new Float32Array(loop?loopFrames:Math.max(loopFrames,lastEnd));
  for(const event of events)for(let i=0;i<event.hit.length;i++)samples[loop?(event.frame+i)%loopFrames:event.frame+i]+=event.hit[i]*event.velocity*gain;
  // Apply one uniform reduction only when a dense pattern needs headroom.
  // This preserves the relative dynamics, and never amplifies quiet material.
  const peak=Studio.peakOf(samples),scale=peak>.98?.98/peak:1;
  if(scale!==1)for(let i=0;i<samples.length;i++)samples[i]*=scale;
  return {samples,rate};
 }
 function encodeWav(samples,rate=48000){
  rateValue(rate);
  if(!numericArray(samples)||samples.length<1||samples.length>rate*120)throw new Error('Invalid WAV sample length.');
  const buffer=new ArrayBuffer(44+samples.length*2),view=new DataView(buffer);
  const write=(offset,value)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
  write(0,'RIFF');view.setUint32(4,36+samples.length*2,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,samples.length*2,true);
  for(let i=0;i<samples.length;i++){if(typeof samples[i]!=='number'||!Number.isFinite(samples[i]))throw new Error('Invalid WAV sample.');view.setInt16(44+i*2,Math.round(clamp(samples[i],-1,1)*32767),true);}
  return buffer;
 }
 const api={MODIFIERS,validateModifiers,modifiedTrack,hitEvents,STEPS,MAX_TRACKS,METERS,PAD_MAP,defaultPads,validatePads,padTrack,allTracks,nearestStep,validateMeter,stepsPerBar,patternLength,resizePattern,defaultTracks,validateTrack,validateBeat,validatePattern,renderHit,stepSeconds,renderPattern,encodeWav};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DrumDSP=api;
})(typeof globalThis!=='undefined'?globalThis:this);

(function(root){
 'use strict';
 const FX=typeof module!=='undefined'&&module.exports?require('./effects-dsp.js'):root.EffectsDSP;
 const S=typeof module!=='undefined'&&module.exports?require('./studio-dsp.js'):root.StudioDSP;
 const num=(v,a,b,name)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<a||v>b)throw new Error('Invalid '+name+'.');return v;};
 function controls(v={}){return {volume:num(v.volume??1,0,1,'clip volume'),pan:num(v.pan??0,-1,1,'balance'),pitch:num(v.pitch??0,-24,24,'pitch'),fadeIn:num(v.fadeIn??0,0,320,'fade in'),fadeOut:num(v.fadeOut??0,0,320,'fade out'),mute:v.mute===undefined?false:typeof v.mute==='boolean'?v.mute:(()=>{throw new Error('Invalid mute.');})()};}
 function wave(v){
  if(!v||!v.wave||!Number.isFinite(v.start)||v.start<0||v.start>320)throw new Error('Invalid waveform clip.');
  const terms=a=>{if(!Array.isArray(a)||a.length!==128||a[0]!==0)throw new Error('Invalid clip waveform.');return a.map(x=>num(x,-2,2,'wave coefficient'));};
  const sourceBeats=num(v.sourceBeats??4,.0625,320,'source length'),trimStart=num(v.trimStart??0,0,sourceBeats,'trim start'),trimEnd=num(v.trimEnd??sourceBeats,0,sourceBeats,'trim end');
  if(trimEnd-trimStart<1/64)throw new Error('Keep at least 1/64 beat of the source.');
  const duration=num(v.duration,1/64,320,'clip length'),stretch=num(v.stretch??1,.125,64,'stretch');
  if(typeof v.loop!=='boolean'||typeof (v.reverse??false)!=='boolean')throw new Error('Invalid clip loop or reverse.');
  return {...v,...controls(v),sourceBeats,trimStart,trimEnd,duration,stretch,frequency:num(v.frequency??134,20,20000,'wave pitch'),reverse:v.reverse??false,wave:{real:terms(v.wave.real),imag:terms(v.wave.imag),effects:FX.validate(v.wave.effects)}};
 }
 // Minimum fade is three milliseconds, not three samples. Trimmed/custom
 // waves can begin at a peak, so a three-sample ramp was effectively a click.
 function envelope(local,duration,fx,rate,bpm){const edge=.003*bpm/60;return Math.max(0,Math.min(1,local/Math.max(edge,fx.fadeIn),(duration-local)/Math.max(edge,fx.fadeOut)));}
 function balance(pan){return [pan>0?1-pan:1,pan<0?1+pan:1];}
 function renderWave(value,{rate=44100,bpm=110}={}){
  const c=wave(value),seconds=60/bpm,length=Math.max(1,Math.round(c.duration*seconds*rate)),out=new Float32Array(length),freq=c.frequency*2**(c.pitch/12);
  if(c.mute||freq>rate*.45)return out;
  const table=S.reconstruct(c.wave.real,c.wave.imag,Math.floor(rate*.45/freq)),peak=S.peakOf(table),scale=1/Math.max(1,peak),span=c.trimEnd-c.trimStart,cycle=span*c.stretch;
  for(let i=0;i<length;i++){
   const local=i/rate/seconds;if(!c.loop&&local>=cycle)break;
   const source=c.trimStart+(local%cycle)/c.stretch;
   const gate=Math.max(0,Math.min(1,source*seconds/.004,(c.sourceBeats-source)*seconds/.03));
   const phase=(c.trimStart*c.stretch*seconds+i/rate)*(c.reverse?-freq:freq);
   out[i]=S.sample(table,phase)*scale*gate;
  }
  const effected=FX.process(out,rate,c.wave.effects);
  for(let i=0;i<effected.length;i++)effected[i]*=envelope(i/rate/seconds,c.duration,c,rate,bpm)*Math.min(1,(effected.length-1-i)/(rate*.003));
  return effected;
 }
 const api={controls,wave,envelope,balance,renderWave};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ClipDSP=api;
})(typeof globalThis!=='undefined'?globalThis:this);

(function(root){
 'use strict';
 const FX=typeof module!=='undefined'&&module.exports?require('./effects-dsp.js'):root.EffectsDSP;
 const S=typeof module!=='undefined'&&module.exports?require('./studio-dsp.js'):root.StudioDSP;
 const D=typeof module!=='undefined'&&module.exports?require('./drum-dsp.js'):root.DrumDSP;
 if(!S||!D)throw new Error('SongDSP needs StudioDSP and DrumDSP.');
 const C=typeof module!=='undefined'&&module.exports?require('./clip-dsp.js'):root.ClipDSP;
 const MAX_NOTES=10000,MAX_BEATS=320,DRUM_NOTES={kick:36,snare:38,hat:42,perc:75};
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function number(v,a,b,label){if(typeof v!=='number'||!Number.isFinite(v)||v<a||v>b)throw new Error(`Invalid ${label}.`);return v;}
 function integer(v,a,b,label){number(v,a,b,label);if(!Number.isInteger(v))throw new Error(`Invalid ${label}.`);return v;}
 function text(v,max,label){if(typeof v!=='string'||!v.trim()||v.length>max)throw new Error(`Invalid ${label}.`);return v.trim();}
 function id(v,label){if(typeof v!=='string'||!/^[a-zA-Z0-9_-]{1,90}$/.test(v))throw new Error(`Invalid ${label}.`);return v;}
 function flag(v,label){if(typeof v!=='boolean')throw new Error(`Invalid ${label}.`);return v;}
 function list(v,max,label){if(!Array.isArray(v)||v.length>max)throw new Error(`Invalid ${label}.`);return Array.from(v);}
 function meter(value={numerator:4,denominator:4}){
  if(!value||!Number.isInteger(value.numerator)||!Number.isInteger(value.denominator)||!['3/4','4/4','5/4','6/8','7/8'].includes(`${value.numerator}/${value.denominator}`))throw new Error('Choose 3/4, 4/4, 5/4, 6/8, or 7/8.');
  return {numerator:value.numerator,denominator:value.denominator};
 }
 function beatsPerBar(value){const m=meter(value);return m.numerator*4/m.denominator;}
 function midiFrequency(note){integer(note,0,127,'MIDI note');return 440*2**((note-69)/12);}
 function noteName(note){integer(note,0,127,'MIDI note');return ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][note%12]+(Math.floor(note/12)-1);}
 function defaultSong(){return {name:'My pixel song',bpm:110,bars:16,meter:{numerator:4,denominator:4},loop:{start:0,end:16},tracks:[{id:'lead',name:'Lead',instrument:'piano',...C.controls({volume:.7}),notes:[]},{id:'bass',name:'Bass',instrument:'stock-sine',...C.controls({volume:.65}),notes:[]},{id:'pad',name:'Pad',instrument:'stock-triangle',...C.controls({volume:.5}),notes:[]}],beats:[],clips:[],audio:[],waves:[]};}
 function signalAt(signals,key){return signals instanceof Map?signals.get(key):signals&&Object.hasOwn(signals,key)?signals[key]:undefined;}
 function unique(values,label){if(new Set(values.map(v=>v.id)).size!==values.length)throw new Error(`Duplicate ${label} IDs.`);}
 function checkedNote(note){if(!note||typeof note!=='object')throw new Error('Invalid piano note.');return {start:number(note.start,0,MAX_BEATS,'note start'),duration:number(note.duration,1/960,64,'note length'),midi:integer(note.midi,0,127,'MIDI note'),velocity:number(note.velocity,0,1,'note velocity')};}
 function validateSong(value,signals){
  if(!value||typeof value!=='object')throw new Error('Choose a continuityLAB song.');
  const bars=integer(value.bars,1,64,'song measures'),m=meter(value.meter),loop=value.loop;
  if(!loop||!Number.isInteger(loop.start)||!Number.isInteger(loop.end)||loop.start<0||loop.end>bars||loop.start>=loop.end)throw new Error('The loop needs a start measure before its end measure.');
  let count=0,phraseCount=0;const phraseIds=new Set();
  const tracks=list(value.tracks,8,'song tracks').map(track=>{
   if(!track||typeof track!=='object')throw new Error('Invalid song track.');
   const notes=list(track.notes,MAX_NOTES,'piano notes').map(checkedNote);count+=notes.length;if(count>MAX_NOTES)throw new Error('A song can hold at most 10,000 notes.');
   const instrument=['piano','drums'].includes(track.instrument)?track.instrument:id(track.instrument,'waveform instrument');
   if(signals&&!['piano','drums'].includes(instrument)&&!signalAt(signals,instrument))throw new Error(`Missing waveform for ${track.name||'a song track'}.`);
   if(signals&&instrument==='drums')for(const key of ['stock-sine','stock-triangle','stock-square'])if(!signalAt(signals,key))throw new Error('The pocket drums need the built-in waveform library.');
   const phrases=list(track.phrases??[],128,'melody pattern clips').map(c=>{
    if(!c||typeof c!=='object')throw Error('Invalid melody pattern clip.');
    const clipId=id(c.id,'pattern clip ID'),duration=number(c.duration,1/64,64,'pattern length'),repeats=integer(c.repeats,1,64,'pattern repeats'),start=number(c.start,0,MAX_BEATS,'pattern start'),local=list(c.notes,2048,'pattern notes').map(checkedNote);
    if(!local.length||local.some(n=>n.start+n.duration>duration+1e-8)||start+duration*repeats>MAX_BEATS+1e-8)throw Error('Pattern notes or repeats exceed the allowed length.');
    if(phraseIds.has(clipId)||++phraseCount>128)throw Error('Keep unique pattern clips within the 128-clip limit.');phraseIds.add(clipId);count+=local.length*repeats;if(count>MAX_NOTES)throw Error('A song can hold at most 10,000 notes, including pattern repeats.');
    return {id:clipId,name:text(c.name,48,'pattern name'),sourceId:id(c.sourceId||clipId,'pattern source ID'),start,duration,repeats,notes:local,...C.controls(c)};
   });
   return {id:id(track.id,'track ID'),name:text(track.name,48,'track name'),instrument,...C.controls(track),notes,...(phrases.length?{phrases}:{})};
  });unique(tracks,'track');
  const beats=list(value.beats??[],16,'saved beats').map(beat=>{
   if(!beat||typeof beat!=='object')throw new Error('Invalid saved beat.');
   const pattern=D.validatePattern(beat.pattern);
   // Older beatMAP projects had no meter/bars fields and exactly16 steps.
   pattern.meter=meter(pattern.meter);pattern.bars=pattern.bars??1;
   if(signals)for(const track of D.allTracks(pattern))if(!signalAt(signals,track.waveId))throw new Error(`Missing waveform for ${track.name}.`);
   return {id:id(beat.id,'beat ID'),name:text(beat.name,48,'beat name'),pattern,volume:number(beat.volume??1,0,1,'beat volume')};
  });unique(beats,'beat');
  const clips=list(value.clips??[],128,'beat placements').map(clip=>{if(!clip||typeof clip!=='object')throw new Error('Invalid beat placement.');const beatId=id(clip.beatId,'saved beat ID');if(!beats.some(b=>b.id===beatId))throw new Error('A placed beat is missing from the saved beats.');return {id:id(clip.id,'placement ID'),beatId,start:number(clip.start,0,MAX_BEATS,'beat position'),...C.controls(clip)};});unique(clips,'placement');
  let audioSeconds=0;
  const audio=list(value.audio??[],8,'audio clips').map(clip=>{
   if(!clip||typeof clip!=='object')throw new Error('Invalid audio clip.');
   const rate=integer(clip.rate,8000,192000,'audio sample rate'),samples=clip.samples;
   if(!(Array.isArray(samples)||ArrayBuffer.isView(samples))||!Number.isInteger(samples.length)||samples.length<1||samples.length>rate*60)throw new Error('Each imported audio clip must be at most 60 seconds.');
   audioSeconds+=samples.length/rate;if(audioSeconds>60.00001)throw new Error('Imported audio can total at most 60 seconds.');
   const copy=new Float32Array(samples.length);for(let i=0;i<samples.length;i++)copy[i]=number(samples[i],-1,1,'audio sample');
   return {id:id(clip.id,'audio ID'),name:text(clip.name,64,'audio clip name'),start:number(clip.start,0,MAX_BEATS,'audio position'),...C.controls(clip),rate,samples:copy};
  });unique(audio,'audio');
  const waves=list(value.waves??[],128,'waveform clips').map(v=>({...C.wave(v),id:id(v.id,'wave clip ID'),name:text(v.name,64,'wave clip name')}));unique(waves,'wave clip');
  return {name:text(value.name,64,'song name'),bpm:number(value.bpm,40,240,'song tempo'),bars,meter:m,loop:{start:loop.start,end:loop.end},tracks,beats,clips,audio,waves};
 }
 function checkedRate(rate){return integer(rate,8000,192000,'render sample rate');}
 function drumVoice(midi){const index=[35,36].includes(midi)?0:[38,40].includes(midi)?1:[42,44,46].includes(midi)?2:3;return D.defaultTracks()[index];}
 function sourceTable(signal,frequency,rate){
  if(!signal||!signal.real||!signal.imag||signal.real.length!==signal.imag.length||signal.real.length<2||signal.real.length>S.HARMONICS)throw new Error('This instrument needs a saved waveform.');
  const real=Float32Array.from(signal.real),imag=Float32Array.from(signal.imag);
  for(const terms of [real,imag])for(const value of terms)number(value,-16,16,'waveform coefficient');real[0]=0;imag[0]=0;
  const table=S.reconstruct(real,imag,Math.floor(rate*.45/frequency)),peak=S.peakOf(table);
  if(peak>1)for(let i=0;i<table.length;i++)table[i]/=peak;
  return table;
 }
 function renderNote(instrument,signal,note,{rate=44100,bpm=110,pitch=0}={}){
  checkedRate(rate);number(bpm,40,240,'note tempo');const n=checkedNote({start:0,...note}),frequency=midiFrequency(n.midi)*2**(number(pitch,-24,24,'pitch')/12);
  if(instrument==='drums'){const voice=drumVoice(n.midi);voice.pitch=clamp(voice.pitch*2**(pitch/12),30,2000);const hit=D.renderHit(signal,voice,rate);if(n.velocity!==1)for(let i=0;i<hit.length;i++)hit[i]*=n.velocity;return hit;}
  const hold=n.duration*60/bpm,release=instrument==='piano'?.12:.08,frames=Math.max(2,Math.round((hold+release)*rate)),output=new Float32Array(frames);
  if(n.velocity===0||frequency>rate*.45)return output;
  let table,bright;
  if(instrument==='piano'){
   const real=new Float32Array(S.HARMONICS),imag=new Float32Array(S.HARMONICS);imag[1]=.8;table=S.reconstruct(real,imag,Math.floor(rate*.45/frequency));imag[1]=0;imag[2]=.22;imag[3]=.1;imag[5]=.04;bright=S.reconstruct(real,imag,Math.floor(rate*.45/frequency));
  }else table=sourceTable(signal,frequency,rate);
  // Raised-cosine edges have zero slope at both ends. The old 4 ms linear
  // attack made low notes and stacked piano voices start with an audible tick.
  // Keep note times/durations unchanged; only soften the amplitude transition.
  const attack=instrument==='piano'?.012:.01,ease=x=>.5-.5*Math.cos(Math.PI*clamp(x,0,1));let phase=0;
  for(let i=0;i<frames;i++){
   const t=i/rate,gate=t<=hold?1:ease(1-(t-hold)/release),onset=ease(t/attack);
   const sustain=instrument==='piano'?Math.exp(-1.8*t):.72+.28*Math.exp(-12*t);
   const sample=S.sample(table,phase)+(bright?S.sample(bright,phase)*Math.exp(-4*t):0);
   output[i]=sample*onset*gate*sustain*n.velocity*.65;
   phase=(phase+frequency/rate)%1;
  }
  output[0]=0;output[frames-1]=0;return FX.process(output,rate,signal?.effects,{tail:true});
 }
 function patternEvents(beat,clipStart){
  const pattern=beat.pattern,steps=pattern.tracks[0].steps.length,stepsInBar=beatsPerBar(pattern.meter)*4,result=[];let at=clipStart;
  for(let i=0;i<steps;i++){
   for(const track of D.allTracks(pattern))if(!track.mute&&track.steps[i]>0)for(const event of D.hitEvents(track,i,.25*(i%2===0?1+pattern.swing:1-pattern.swing)))result.push({track:event.track,start:at+event.offset,velocity:event.velocity,gate:event.gate,volume:beat.volume});
   const local=i%stepsInBar;at+=.25*(local%2===0?1+pattern.swing:1-pattern.swing);
  }
  return result;
 }
 function expandedTracks(song){return song.tracks.flatMap((t,channel)=>[{...t,channel},...(t.phrases||[]).map(c=>({...t,...C.controls(c),volume:t.volume*c.volume,mute:t.mute||c.mute,pitch:clamp(t.pitch+c.pitch,-24,24),pan:clamp(t.pan+c.pan,-1,1),id:c.id,parentId:t.id,name:c.name,channel,range:{start:c.start,duration:c.duration*c.repeats},notes:Array.from({length:c.repeats},(_,i)=>c.notes.map(n=>({...n,start:c.start+i*c.duration+n.start}))).flat()}))]);}
 function render(value,signals,{rate=44100,loopOnly=false,stem=null,gain=.7,loopTails=true,normalize=false}={}){
  checkedRate(rate);number(gain,0,1,'song render gain');flag(loopOnly,'loop selection');flag(loopTails,'loop tails');flag(normalize,'normalization');
  const song=validateSong(value,signals),barBeats=beatsPerBar(song.meter),from=loopOnly?song.loop.start*barBeats:0,to=loopOnly?song.loop.end*barBeats:song.bars*barBeats,secondsPerBeat=60/song.bpm,duration=(to-from)*secondsPerBeat;
  if(duration>300)throw new Error('Render at most five minutes at a time. Shorten the song or select a smaller loop.');
  if(stem&&(!['notes','drums','audio','wave'].includes(stem.type)||(stem.type==='notes'&&!song.tracks.some(t=>t.id===stem.id))||(stem.type==='audio'&&!song.audio.some(t=>t.id===stem.id))||(stem.type==='wave'&&!song.waves.some(t=>t.id===stem.id))))throw new Error('Choose an existing song track to export.');
  const frames=Math.max(1,Math.round(duration*rate)),samples=new Float32Array(frames),left=new Float32Array(frames),right=new Float32Array(frames),noteCache=new Map(),hitCache=new Map();let cachedNoteFrames=0,workFrames=0;
  function add(buffer,start,level,wrap=true,fx={},range=null){
   const at=Math.round((start-from)*secondsPerBeat*rate),first=Math.max(0,-at);
   if(at>=frames||first>=buffer.length)return;
   const limit=wrap&&loopTails&&at>=0?buffer.length:Math.min(buffer.length,frames-at);
   workFrames+=Math.max(0,limit-first);if(workFrames>rate*3600)throw new Error('Too many overlapping sounds for one render. Shorten the selected loop or simplify the arrangement.');
   const [l,r]=C.balance(fx.pan||0),control=C.controls(fx);
   for(let i=first;i<limit;i++){const pos=(at+i)%frames,local=start+i/rate/secondsPerBeat-(range?.start??start),fade=range&&(control.fadeIn>0||control.fadeOut>0)?Math.max(0,Math.min(1,control.fadeIn?local/control.fadeIn:1,control.fadeOut?(range.duration-local)/control.fadeOut:1)):1,v=buffer[i]*level*gain*fade;left[pos]+=v*l;right[pos]+=v*r;}

  }
  if(!stem||stem.type==='notes')for(const track of expandedTracks(song)){
   if(track.mute||track.volume===0||stem&&stem.id!==(track.parentId||track.id))continue;
   const fromNote=Math.min(...track.notes.map(x=>x.start)),toNote=Math.max(...track.notes.map(x=>x.start+x.duration));
   for(const n of track.notes){
    const effectWave=signalAt(signals,track.instrument==='drums'?drumVoice(n.midi).waveId:track.instrument),effectTail=FX.tail(effectWave?.effects)/secondsPerBeat;
    const audibleBeats=(track.instrument==='drums'?drumVoice(n.midi).decay/secondsPerBeat:n.duration+.12/secondsPerBeat)+effectTail;
    if(n.start>=to||n.start+audibleBeats<=from||n.velocity===0)continue;
    const durationBeats=Math.max(1/960,Math.min(n.duration,to-n.start)),key=JSON.stringify([track.instrument,n.midi,durationBeats,n.velocity,track.pitch]);
    let buffer=noteCache.get(key);if(!buffer){const waveId=track.instrument==='drums'?drumVoice(n.midi).waveId:track.instrument;buffer=renderNote(track.instrument,signalAt(signals,waveId),{...n,duration:durationBeats},{rate,bpm:song.bpm,pitch:track.pitch});if(noteCache.size<64&&cachedNoteFrames+buffer.length<=rate*30){noteCache.set(key,buffer);cachedNoteFrames+=buffer.length;}}
    add(buffer,n.start,track.volume,true,track,track.range||{start:fromNote,duration:toNote-fromNote+.12/secondsPerBeat});
   }
  }
  if(!stem||stem.type==='drums')for(const clip of song.clips){
   if(clip.start>=to||clip.mute)continue;const beat=song.beats.find(b=>b.id===clip.beatId);
   for(const event of patternEvents(beat,clip.start)){
    if(event.start>=to||event.start+(event.track.decay+FX.tail(signalAt(signals,event.track.waveId)?.effects))/secondsPerBeat<=from)continue;
    const track={...event.track,pitch:Math.max(30,Math.min(2000,event.track.pitch*2**(clip.pitch/12)))},key=JSON.stringify([track.id,track.waveId,track.pitch,track.decay,track.sweep,track.noise,track.tone,track.level]);
    let buffer=hitCache.get(key);if(!buffer){buffer=D.renderHit(signalAt(signals,track.waveId),track,rate);hitCache.set(key,buffer);}
    add(buffer,event.start,event.velocity*event.volume*clip.volume,true,clip,{start:clip.start,duration:beat.pattern.bars*beatsPerBar(beat.pattern.meter)});
   }
  }
  if(!stem||stem.type==='audio')for(const clip of song.audio){
   if(clip.mute||clip.volume===0||stem&&stem.id!==clip.id)continue;
   const at=(clip.start-from)*secondsPerBeat*rate,speed=2**(clip.pitch/12),length=clip.samples.length/clip.rate*rate/speed,start=Math.max(0,Math.ceil(at)),end=Math.min(frames,Math.ceil(at+length)),edge=Math.max(1,Math.round(rate*.003));
   for(let i=start;i<end;i++){
    const source=(i-at)*clip.rate/rate*speed,index=Math.floor(source),fraction=source-index;
    const value=clip.samples[index]*(1-fraction)+(clip.samples[Math.min(index+1,clip.samples.length-1)]||0)*fraction;
    const fade=Math.min(1,(i-start)/edge,(end-1-i)/edge);
    const e=C.envelope((i-at)/rate/secondsPerBeat,length/rate/secondsPerBeat,clip,rate,song.bpm),[l,r]=C.balance(clip.pan),v=value*clip.volume*gain*fade*e;left[i]+=v*l;right[i]+=v*r;
   }
  }
  if(!stem||stem.type==='wave')for(const c of song.waves){if(c.mute||c.volume===0||c.start>=to||c.start+c.duration<=from||stem&&stem.id!==c.id)continue;add(C.renderWave(c,{rate,bpm:song.bpm}),c.start,c.volume,false,c);}
  // A finite export may end while a held note/FX tail is still nonzero. Apply
  // a five-millisecond boundary taper instead of cutting straight to silence.
  // Exact loops keep their wrapped tails; fading them would create a gap.
  if(!loopTails){const edge=Math.min(Math.ceil(rate*.005),Math.floor(frames/2));for(let i=0;i<edge;i++){const level=.5-.5*Math.cos(Math.PI*i/edge);left[i]*=level;right[i]*=level;left[frames-1-i]*=level;right[frames-1-i]*=level;}}
  for(let i=0;i<frames;i++)samples[i]=(left[i]+right[i])/2;
  const peak=Math.max(S.peakOf(left),S.peakOf(right)),scale=peak>.98?.98/peak:1;
  if(normalize&&scale!==1)for(let i=0;i<samples.length;i++){samples[i]*=scale;left[i]*=scale;right[i]*=scale;}
  return {samples,left,right,rate,duration:frames/rate,peak,scale,normalized:normalize,startBeat:from,endBeat:to};
 }
 function toMidi(value,{loopOnly=false}={}){
  const song=validateSong(value),bar=beatsPerBar(song.meter),from=loopOnly?song.loop.start*bar:0,to=loopOnly?song.loop.end*bar:song.bars*bar,tracks=[],noteTracks=new Map();
  for(const track of expandedTracks(song)){
   if(track.mute)continue;
   const notes=[];for(const note of track.notes){const start=Math.max(from,note.start),end=Math.min(to,note.start+note.duration);if(end>start&&note.velocity*track.volume>0)notes.push({...note,midi:clamp(Math.round(note.midi+track.pitch),0,127),start:start-from,duration:end-start,velocity:note.velocity*track.volume});}
   const key=track.parentId||track.id;if(noteTracks.has(key))noteTracks.get(key).notes.push(...notes);else{const out={name:track.name,channel:track.instrument==='drums'?9:track.channel,program:track.instrument==='drums'?undefined:track.instrument==='piano'?0:80,notes};noteTracks.set(key,out);tracks.push(out);}
  }
  const drums=[];for(const clip of song.clips){if(clip.start>=to||clip.mute)continue;const beat=song.beats.find(b=>b.id===clip.beatId);for(const event of patternEvents(beat,clip.start))if(event.start>=from&&event.start<to&&event.velocity*event.volume*event.track.level*clip.volume>0)drums.push({start:event.start-from,duration:Math.min(.125,event.gate??.125,to-event.start),midi:DRUM_NOTES[event.track.id]??DRUM_NOTES[["kick","snare","hat","perc"][D.PAD_MAP[+event.track.id.slice(4)]?.track]]??75,velocity:event.velocity*event.volume*event.track.level*clip.volume});}
  if(drums.length)tracks.push({name:'Drums',channel:9,notes:drums});
  for(const t of tracks)t.notes.sort((a,b)=>a.start-b.start||a.midi-b.midi);return {bpm:song.bpm,meter:{...song.meter},duration:to-from,tracks};
 }
 const api={MAX_NOTES,MAX_BEATS,DRUM_NOTES,defaultSong,validateSong,beatsPerBar,midiFrequency,noteName,drumVoice,renderNote,render,toMidi};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SongDSP=api;
})(typeof globalThis!=='undefined'?globalThis:this);

(function(root){
 'use strict';
 // Pure composer model: all edits return independent validated projects.
 // Times and lengths are quarter-note beats. Resize trims/drops notes past
 // the new end; callers should retain an undo snapshot before shortening.
 const Song=typeof module!=='undefined'&&module.exports?require('./song-dsp.js'):root.SongDSP;
 const MAX_NOTES=2048,MAX_BARS=16,MIN_DURATION=1/960;
 const TRACKS=[['melody','Melody','piano',.65],['chords','Chords','stock-triangle',.45],['bass','Bass','stock-sine',.6],['rhythm','Rhythm','drums',.5]];
 function number(value,min,max,label){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error('Invalid '+label+'.');return value;}
 function integer(value,min,max,label){number(value,min,max,label);if(!Number.isInteger(value))throw new Error('Invalid '+label+'.');return value;}
 function text(value,max,label){if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new Error('Invalid '+label+'.');return value.trim();}
 function defaultProject(){return {kind:'dot-melody-lab',version:1,name:'My melody',bpm:110,bars:4,root:0,mode:'major',tracks:TRACKS.map(([id,name,instrument,volume])=>({id,name,instrument,volume,mute:false,notes:[]}))};}
 function songObject(p){return {name:p.name,bpm:p.bpm,bars:p.bars,meter:{numerator:4,denominator:4},loop:{start:0,end:p.bars},tracks:p.tracks.map(t=>({...t,notes:t.notes.map(n=>({...n})),pan:0,pitch:0,fadeIn:0,fadeOut:0})),beats:[],clips:[],audio:[],waves:[]};}
 function checkedNote(n,end){
  if(!n||typeof n!=='object')throw new Error('Invalid composer note.');const start=number(n.start,0,end-MIN_DURATION,'note position'),duration=number(n.duration,MIN_DURATION,64,'note length');
  if(start+duration>end+1e-9)throw new Error('A note extends beyond the melody.');
  return {start,duration:Math.min(duration,end-start),midi:integer(n.midi,0,127,'note pitch'),velocity:number(n.velocity,0,1,'note velocity')};
 }
 function validate(value,signals){
  if(!value||value.kind!=='dot-melody-lab'||value.version!==1)throw new Error('Choose a melody & rhythm LAB project.');
  const bars=integer(value.bars,1,MAX_BARS,'measure count'),end=bars*4;
  if(!['major','minor'].includes(value.mode))throw new Error('Choose a major or minor key.');
  if(!Array.isArray(value.tracks)||value.tracks.length!==4)throw new Error('The composer needs its four instrument lanes.');
  const seen=new Set();let count=0;
  const tracks=value.tracks.map(t=>{
   if(!t||!TRACKS.some(([id])=>id===t.id)||seen.has(t.id))throw new Error('Invalid or repeated composer lane.');seen.add(t.id);
   if(typeof t.instrument!=='string'||!(/^[a-zA-Z0-9_-]{1,90}$/).test(t.instrument))throw new Error('Invalid composer instrument.');
   if(typeof t.mute!=='boolean')throw new Error('Invalid lane mute setting.');
   if(!Array.isArray(t.notes)||t.notes.length>MAX_NOTES)throw new Error('Keep the composer to 2,048 notes.');count+=t.notes.length;if(count>MAX_NOTES)throw new Error('Keep the composer to 2,048 notes.');
   const notes=Array.from(t.notes,n=>checkedNote(n,end)),positions=new Set();
   for(const n of notes){const key=n.start+':'+n.midi;if(positions.has(key))throw new Error('A lane has repeated notes at the same position.');positions.add(key);}
   notes.sort((a,b)=>a.start-b.start||a.midi-b.midi);
   return {id:t.id,name:text(t.name,48,'lane name'),instrument:t.instrument,volume:number(t.volume,0,1,'lane volume'),mute:t.mute,notes};
  });
  tracks.sort((a,b)=>TRACKS.findIndex(([id])=>id===a.id)-TRACKS.findIndex(([id])=>id===b.id));
  const result={kind:'dot-melody-lab',version:1,name:text(value.name,64,'melody name'),bpm:number(value.bpm,40,240,'tempo'),bars,root:integer(value.root,0,11,'key root'),mode:value.mode,tracks};
  // Also enforce the existing audio engine's instrument availability rules.
  if(signals)Song.validateSong(songObject(result),signals);
  return result;
 }
 function toSong(value,signals){return Song.validateSong(songObject(validate(value,signals)),signals);}
 function resize(value,bars){const p=validate(value);integer(bars,1,MAX_BARS,'measure count');const end=bars*4;p.bars=bars;for(const t of p.tracks)t.notes=t.notes.filter(n=>n.start<=end-MIN_DURATION).map(n=>({...n,duration:Math.min(n.duration,end-n.start)}));return validate(p);}
 function lane(p,id){const t=p.tracks.find(t=>t.id===id);if(!t)throw new Error('Choose a composer lane.');return t;}
 function stamp(value,trackId,note,erase=false){
  const p=validate(value),t=lane(p,trackId);if(typeof erase!=='boolean')throw new Error('Invalid eraser mode.');if(!note||typeof note!=='object')throw new Error('Choose a note position.');
  const start=number(note.start,0,p.bars*4-MIN_DURATION,'note position'),midi=integer(note.midi,0,127,'note pitch'),at=t.notes.findIndex(n=>n.start===start&&n.midi===midi);
  if(at>=0)t.notes.splice(at,1);else if(!erase){number(note.duration,MIN_DURATION,64,'note length');t.notes.push(checkedNote({...note,start,midi,duration:Math.min(note.duration,p.bars*4-start)},p.bars*4));}
  return validate(p);
 }
 function transpose(value,trackId,semitones){const p=validate(value),t=lane(p,trackId);integer(semitones,-127,127,'transpose interval');if(t.notes.some(n=>n.midi+semitones<0||n.midi+semitones>127))throw new Error('Transposing would move a note beyond MIDI 0–127.');t.notes=t.notes.map(n=>({...n,midi:n.midi+semitones}));return validate(p);}
 const api={MAX_NOTES,MAX_BARS,MIN_DURATION,defaultProject,validate,toSong,resize,stamp,transpose};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MelodyDSP=api;
})(typeof globalThis!=='undefined'?globalThis:this);

(function(root){
 'use strict';
 const FX=typeof module!=='undefined'&&module.exports?require('./effects-dsp.js'):root.EffectsDSP;
 const D=typeof module!=='undefined'&&module.exports?require('./studio-dsp.js'):root.StudioDSP;
 const MAX_WAVES=64;
 function cleanName(name){if(typeof name!=='string')throw new Error('Each waveform needs a name.');const value=name.trim().slice(0,48);if(!value)throw new Error('Give the waveform a name.');return value;}
 function validateWave(wave){
  if(!wave||typeof wave.id!=='string'||!/^[a-zA-Z0-9_-]{1,90}$/.test(wave.id))throw new Error('Invalid waveform ID.');
  function terms(values){if(!Array.isArray(values)||values.length!==128||Array.from(values).some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>2))throw new Error('Waveform coefficients are invalid.');if(values[0]!==0)throw new Error('Waveforms must have zero DC offset.');return Float32Array.from(values);}
  const real=terms(wave.real),imag=terms(wave.imag),signal=D.analyse(D.reconstruct(real,imag));
  if(wave.frequency!==undefined&&(typeof wave.frequency!=='number'||!Number.isFinite(wave.frequency)||wave.frequency<20||wave.frequency>20000))throw new Error('Invalid saved waveform pitch.');
  return {...(wave.frequency!==undefined?{frequency:wave.frequency}:{}),effects:FX.validate(wave.effects),id:wave.id,name:cleanName(wave.name),real:Array.from(signal.real),imag:Array.from(signal.imag)};
 }
 // Keep the six reserved library slots stable for older, full 64-wave libraries.
 // Additional presets live in the input/shape menus and can be saved normally.
 function stockWaves(){return D.TYPES.slice(0,6).map(type=>{const p=D.defaultProject();p.a=D.source(type);p.amount=0;const s=D.compile(p).result;return {id:`stock-${type}`,name:type[0].toUpperCase()+type.slice(1),real:Array.from(s.real),imag:Array.from(s.imag)};});}
 function snapshot(signal,name,id,inverted=false){const sign=inverted?-1:1;return validateWave({id,name,effects:signal.effects,real:Array.from(signal.real,v=>v*sign),imag:Array.from(signal.imag,v=>v*sign)});}
 function signal(wave){return {effects:FX.validate(wave.effects),real:Float32Array.from(wave.real),imag:Float32Array.from(wave.imag),table:D.reconstruct(wave.real,wave.imag)};}
 function validateBundle(data){
  if(!data||data.kind!=='dot-wave-library'||data.version!==1||!Array.isArray(data.waves)||data.waves.length>MAX_WAVES)throw new Error('Choose a Dot Wave Studio library file with at most 64 waves.');
  const seen=new Set();return Array.from(data.waves,wave=>{const checked=validateWave(wave);if(seen.has(checked.id))throw new Error('Duplicate waveform IDs in this library.');seen.add(checked.id);return checked;});
 }
 function merge(existing,incoming){const map=new Map(existing.map(w=>[w.id,w]));for(const wave of incoming)if(!map.has(wave.id))map.set(wave.id,wave);if(map.size>MAX_WAVES)throw new Error('The library is full (64 waves). Export a backup and remove a saved wave first.');return [...map.values()];}
 function prepareImport(existing,incoming,newId){
  const occupied=new Map(existing.map(w=>[w.id,w])),remap=new Map(),additions=[];
  const equivalent=(a,b)=>a.name===b.name&&JSON.stringify(FX.validate(a.effects))===JSON.stringify(FX.validate(b.effects))&&(a.frequency??134)===(b.frequency??134)&&['real','imag'].every(key=>a[key].every((v,i)=>Math.abs(v-b[key][i])<.000001));
  for(const original of incoming){
   let wave=original;const local=occupied.get(wave.id);
   if(local&&!equivalent(local,wave)){
    // An earlier import may already have resolved this same ID conflict.
    // Reuse its equivalent record instead of filling the bank with copies.
    const previous=[...occupied.values()].find(candidate=>equivalent(candidate,wave));
    if(previous){wave=previous;remap.set(original.id,previous.id);}
    else{
     let id=newId(),suffix=0;const base=id;
     while(occupied.has(id)||incoming.some(w=>w.id===id))id=base+'-'+(++suffix);
     wave={...wave,id};remap.set(original.id,id);
    }
   }
   if(!occupied.has(wave.id)){occupied.set(wave.id,wave);additions.push(wave);}
  }
  return {waves:merge(existing,additions),remap};
 }
 const api={MAX_WAVES,cleanName,validateWave,stockWaves,snapshot,signal,validateBundle,merge,prepareImport};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WaveLibrary=api;
})(typeof globalThis!=='undefined'?globalThis:this);

(function(root){
 'use strict';
 // MIDI 1.0 Standard MIDI Files (MMA RP-001), RIFF WAVE PCM, and store-only ZIP.
 // All timing in this public API is in quarter-note beats, not seconds.
 const MAX_MIDI=4*1024*1024,MAX_NOTES=30000,MAX_WAV=100*1024*1024;
 function fail(message){throw new Error(message);}
 function number(value,min,max,label,integer=false){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isInteger(value)))fail(`Invalid ${label}.`);return value;}
 function bytes(value){if(value instanceof ArrayBuffer)return new Uint8Array(value);if(ArrayBuffer.isView(value))return new Uint8Array(value.buffer,value.byteOffset,value.byteLength);fail('Expected binary file data.');}
 function ascii(text){return Uint8Array.from(text,c=>c.charCodeAt(0));}
 function utf8(text){
  const out=[];for(const letter of String(text)){let code=letter.codePointAt(0);if(code>=0xd800&&code<=0xdfff)code=0xfffd;if(code<128)out.push(code);else if(code<2048)out.push(192|(code>>6),128|(code&63));else if(code<65536)out.push(224|(code>>12),128|((code>>6)&63),128|(code&63));else out.push(240|(code>>18),128|((code>>12)&63),128|((code>>6)&63),128|(code&63));}return Uint8Array.from(out);
 }
 function text(bytes){
  // New exports are UTF-8; old SMF names commonly use a single-byte encoding.
  let result='';for(let i=0;i<bytes.length;){const first=bytes[i++];if(first<128){result+=String.fromCharCode(first);continue;}let count=first>=0xc2&&first<=0xdf?1:first>=0xe0&&first<=0xef?2:first>=0xf0&&first<=0xf4?3:0,code=first&([0,31,15,7][count]);if(!count||i+count>bytes.length||Array.from(bytes.subarray(i,i+count)).some(x=>(x&0xc0)!==0x80)){result+=String.fromCharCode(first);continue;}for(let j=0;j<count;j++)code=(code<<6)|(bytes[i++]&63);result+=code<=0x10ffff?String.fromCodePoint(code):'�';}return result;
 }
 function join(parts){const length=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(length);let at=0;for(const part of parts){out.set(part,at);at+=part.length;}return out;}
 function be16(value){return Uint8Array.of(value>>8&255,value&255);}
 function be32(value){return Uint8Array.of(value>>>24,value>>>16&255,value>>>8&255,value&255);}
 function variable(value){number(value,0,0x0fffffff,'MIDI delta time',true);const out=[value&127];while(value=Math.floor(value/128))out.unshift((value&127)|128);return Uint8Array.from(out);}
 function meter(value){const m=value??{numerator:4,denominator:4};number(m.numerator,1,32,'meter numerator',true);if(![1,2,4,8,16,32].includes(m.denominator))fail('Invalid meter denominator.');return {numerator:m.numerator,denominator:m.denominator};}
 function meta(type,data){return join([Uint8Array.of(255,type),variable(data.length),data]);}
 function chunk(name,data){return join([ascii(name),be32(data.length),data]);}
 function encode(song,{format=1,ppq=480}={}){
  if(!song||typeof song!=='object')fail('Choose a song to export.');if(![0,1].includes(format))fail('Choose MIDI format 0 or 1.');number(ppq,1,32767,'MIDI resolution',true);
  const bpm=number(song.bpm,4,1000,'MIDI tempo'),m=meter(song.meter);
  if(!Array.isArray(song.tracks)||song.tracks.length>127)fail('A MIDI song can contain at most 127 tracks.');
  const duration=number(song.duration??0,0,1e6,'MIDI duration'),durationTick=Math.round(duration*ppq);number(durationTick,0,0x0fffffff,'MIDI duration ticks',true);
  const tempo=Math.max(1,Math.min(0xffffff,Math.round(60000000/bpm)));
  const conductor=[{tick:0,priority:0,data:meta(81,Uint8Array.of(tempo>>16&255,tempo>>8&255,tempo&255))},{tick:0,priority:0,data:meta(88,Uint8Array.of(m.numerator,Math.log2(m.denominator),24,8))}];
  let count=0,end=durationTick;
  const groups=song.tracks.map((track,index)=>{
   if(!track||!Array.isArray(track.notes))fail('Each MIDI track needs a note list.');number(track.channel,0,15,'MIDI channel',true);
   const name=String(track.name||`Track ${index+1}`).slice(0,120),events=[{tick:0,priority:0,data:meta(3,utf8(name))}];
   if(track.program!==undefined){number(track.program,0,127,'MIDI program',true);events.push({tick:0,priority:1,data:Uint8Array.of(0xc0|track.channel,track.program)});}
   for(const note of track.notes){
    if(++count>MAX_NOTES)fail('MIDI export is limited to 30,000 notes.');if(!note)fail('Invalid MIDI note.');
    number(note.start,0,1e6,'note position');number(note.duration,0.000001,1e6,'note duration');number(note.midi,0,127,'note number',true);number(note.velocity,0,1,'note velocity');
    if(note.velocity===0)continue;
    const start=Math.round(note.start*ppq),finish=Math.max(start+1,Math.round((note.start+note.duration)*ppq));number(finish,0,0x0fffffff,'note end tick',true);end=Math.max(end,finish);
    events.push({tick:start,priority:3,data:Uint8Array.of(0x90|track.channel,note.midi,Math.max(1,Math.round(note.velocity*127)))});
    events.push({tick:finish,priority:2,data:Uint8Array.of(0x80|track.channel,note.midi,0)});
   }
   return events;
  });
  function trackChunk(events){const sorted=events.slice().sort((a,b)=>a.tick-b.tick||a.priority-b.priority),parts=[];let previous=0;for(const event of sorted){parts.push(variable(event.tick-previous),event.data);previous=event.tick;}parts.push(variable(end-previous),Uint8Array.of(255,47,0));return chunk('MTrk',join(parts));}
  const tracks=format===0?[trackChunk([...conductor,...groups.flat()])]:[trackChunk(conductor),...groups.map(trackChunk)];
  const out=join([chunk('MThd',join([be16(format),be16(tracks.length),be16(ppq)])),...tracks]);if(out.length>MAX_MIDI)fail('Exported MIDI exceeds the 4 MB limit.');return out.buffer;
 }
 function decode(input){
  const data=bytes(input);if(data.length>MAX_MIDI)fail('Choose a MIDI file no larger than 4 MB.');if(data.length<14)fail('The MIDI file is incomplete.');
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength),warnings=new Set(),tempoEvents=[],meterEvents=[],tracks=[];let offset=0,noteCount=0,order=0,maxTick=0;
  const tag=at=>String.fromCharCode(...data.subarray(at,at+4));
  if(tag(0)!=='MThd')fail('Choose a Standard MIDI File (.mid).');const headerSize=view.getUint32(4);if(headerSize<6||headerSize+8>data.length)fail('Invalid MIDI header length.');
  const format=view.getUint16(8),declared=view.getUint16(10),division=view.getUint16(12);
  if(format===2)fail('MIDI format 2 contains separate sequences. Export format 0 or 1 instead.');if(format!==0&&format!==1)fail('Unsupported MIDI file format.');if(division&0x8000)fail('SMPTE-timed MIDI is unsupported. Export a beat-timed MIDI file instead.');if(!division||!declared||declared>128||(format===0&&declared!==1))fail('Invalid MIDI track count or time division.');offset=8+headerSize;
  for(let trackIndex=0;trackIndex<declared;trackIndex++){
   if(offset+8>data.length||tag(offset)!=='MTrk')fail('A MIDI track chunk is missing.');const size=view.getUint32(offset+4),end=offset+8+size;if(end>data.length)fail('The MIDI track is truncated.');let pos=offset+8,tick=0,running=0,name='',ended=false;const channels=new Map(),programs=new Map(),pending=new Map();
   function read(){if(pos>=end)fail('The MIDI event is truncated.');return data[pos++];}
   function vlq(){let value=0;for(let i=0;i<4;i++){const valueByte=read();value=value*128+(valueByte&127);if(!(valueByte&128))return value;}fail('Invalid MIDI variable-length number.');}
   function take(length){if(length<0||pos+length>end)fail('The MIDI event data is truncated.');const result=data.subarray(pos,pos+length);pos+=length;return result;}
   function lane(channel){if(!channels.has(channel))channels.set(channel,{name:'',channel,program:programs.get(channel)??0,notes:[]});return channels.get(channel);}
   function close(channel,midi,at){const key=channel+':'+midi,queue=pending.get(key);if(!queue?.length){warnings.add('Unmatched note-off events were ignored.');return;}const item=queue.shift();if(!queue.length)pending.delete(key);const length=Math.max(1,at-item.tick);item.track.notes.push({start:item.tick/division,duration:length/division,midi,velocity:item.velocity/127});}
   while(pos<end){
    tick+=vlq();if(!Number.isSafeInteger(tick)||tick>0x7fffffff)fail('The MIDI timeline is too long.');let status=read();
    if(status<128){if(!running)fail('MIDI running status appears without a previous channel event.');pos--;status=running;}
    else if(status<240)running=status;else running=0;
    if(status===255){
     const type=read(),length=vlq(),payload=take(length);
     if(type===47){if(length!==0)fail('Invalid MIDI end-of-track event.');ended=true;break;}
     if(type===3){if(!name)name=text(payload).replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,120);}
     else if(type===81){if(length!==3)fail('Invalid MIDI tempo event.');const tempo=payload[0]*65536+payload[1]*256+payload[2];if(!tempo)fail('MIDI tempo cannot be zero.');tempoEvents.push({tick,order:order++,tempo});}
     else if(type===88){if(length!==4||!payload[0]||payload[1]>5)fail('Invalid MIDI time signature.');meterEvents.push({tick,order:order++,numerator:payload[0],denominator:2**payload[1]});}
     continue;
    }
    if(status===240||status===247){take(vlq());warnings.add('System-exclusive instrument data was skipped.');continue;}
    if(status>=240)fail('Unsupported system message inside a MIDI file.');
    const kind=status>>4,channel=status&15,a=read(),b=kind===12||kind===13?null:read();if(a>=128||(b!==null&&b>=128))fail('Invalid MIDI channel data byte.');
    if(kind===9&&b>0){
     if(++noteCount>MAX_NOTES)fail('MIDI import is limited to 30,000 notes.');const key=channel+':'+a,queue=pending.get(key)||[];queue.push({tick,velocity:b,track:lane(channel)});pending.set(key,queue);
    }else if(kind===8||(kind===9&&b===0))close(channel,a,tick);
    else if(kind===12){if(programs.has(channel)&&programs.get(channel)!==a)warnings.add('Program changes within a track were reduced to its first instrument.');if(!programs.has(channel)){programs.set(channel,a);if(channels.has(channel)){if(channels.get(channel).notes.length||[...pending.values()].some(q=>q.some(n=>n.track.channel===channel)))warnings.add('Program changes after notes began were reduced to one instrument.');else channels.get(channel).program=a;}}}
    else warnings.add('Controller, pitch-bend and pressure data were skipped; note timing and velocity were kept.');
   }
   if(!ended)warnings.add('A track had no end marker; its chunk boundary was used.');
   if(pending.size){warnings.add('Notes without note-off events were ended at their track boundary.');for(const [key,queue]of pending){const [channel,midi]=key.split(':').map(Number);while(queue.length)close(channel,midi,Math.max(tick,queue[0].tick+1));}}
   maxTick=Math.max(maxTick,tick);for(const record of channels.values()){record.name=(name||`Track ${trackIndex+1}`)+(channels.size>1?` · Ch ${record.channel+1}`:'');record.notes.sort((a,b)=>a.start-b.start||a.midi-b.midi);for(const note of record.notes)maxTick=Math.max(maxTick,Math.round((note.start+note.duration)*division));if(record.notes.length)tracks.push(record);}
   offset=end;
  }
  tempoEvents.sort((a,b)=>a.tick-b.tick||a.order-b.order);meterEvents.sort((a,b)=>a.tick-b.tick||a.order-b.order);
  const firstTempo=tempoEvents[0]?.tempo??500000,firstMeter=meterEvents[0]??{numerator:4,denominator:4};
  if(tempoEvents.some(event=>event.tempo!==firstTempo)||tempoEvents[0]?.tick>0)warnings.add('Tempo changes were reduced to the first tempo; note positions remain in beats.');
  if(meterEvents.some(event=>event.numerator!==firstMeter.numerator||event.denominator!==firstMeter.denominator)||meterEvents[0]?.tick>0)warnings.add('Time-signature changes were reduced to the first meter.');
  return {bpm:60000000/firstTempo,meter:{numerator:firstMeter.numerator,denominator:firstMeter.denominator},tracks,duration:maxTick/division,warnings:[...warnings]};
 }
 function encodeWav(input,rate=48000){
  number(rate,8000,192000,'WAV sample rate',true);const left=ArrayBuffer.isView(input)||Array.isArray(input)?input:input?.left,right=input?.right;
  if(!left||!Number.isInteger(left.length)||left.length<1||left.length>rate*600||(right&&right.length!==left.length))fail('Invalid WAV audio channels.');const channels=right?2:1,dataSize=left.length*channels*2,buffer=new ArrayBuffer(44+dataSize),view=new DataView(buffer);
  const write=(at,str)=>{for(let i=0;i<str.length;i++)view.setUint8(at+i,str.charCodeAt(i));};write(0,'RIFF');view.setUint32(4,36+dataSize,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);view.setUint32(24,rate,true);view.setUint32(28,rate*channels*2,true);view.setUint16(32,channels*2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,dataSize,true);
  let at=44;for(let i=0;i<left.length;i++)for(const data of right?[left,right]:[left]){if(typeof data[i]!=='number'||!Number.isFinite(data[i]))fail('Audio contains an invalid sample.');const sample=Math.max(-1,Math.min(1,data[i]));view.setInt16(at,Math.round(sample*(sample<0?32768:32767)),true);at+=2;}return buffer;
 }
 function decodeWav(input){
  const data=bytes(input);if(data.length>MAX_WAV)fail('Choose a WAV file no larger than 100 MB.');if(data.length<12)fail('The WAV file is incomplete.');const view=new DataView(data.buffer,data.byteOffset,data.byteLength),tag=at=>String.fromCharCode(...data.subarray(at,at+4));
  if(tag(0)!=='RIFF'||tag(8)!=='WAVE')fail('Choose an uncompressed RIFF WAV file.');const end=view.getUint32(4,true)+8;if(end>data.length||end<12)fail('The WAV file is truncated.');let fmt=null,audio=null;
  for(let pos=12;pos+8<=end;){const type=tag(pos),length=view.getUint32(pos+4,true),start=pos+8,next=start+length;if(next>end)fail('A WAV chunk is truncated.');if(type==='fmt '){if(fmt)fail('The WAV file contains conflicting format chunks.');if(length<16)fail('The WAV format chunk is incomplete.');let format=view.getUint16(start,true);const channels=view.getUint16(start+2,true),rate=view.getUint32(start+4,true),align=view.getUint16(start+12,true),bits=view.getUint16(start+14,true);if(format===0xfffe){if(length<40||view.getUint16(start+16,true)<22)fail('The extended WAV format is incomplete.');const suffix=[0,0,0,0,16,0,128,0,0,170,0,56,155,113];if(!suffix.every((v,i)=>data[start+26+i]===v))fail('Unsupported extended WAV codec.');format=view.getUint16(start+24,true);}fmt={format,channels,rate,align,bits};}else if(type==='data'){if(audio)fail('Multiple WAV data chunks are unsupported.');audio={start,length};}pos=next+(length&1);}
  if(!fmt||!audio)fail('The WAV file needs format and audio-data chunks.');const {format,channels,rate,align,bits}=fmt;number(channels,1,8,'WAV channel count',true);number(rate,8000,192000,'WAV sample rate',true);
  if(!((format===1&&[8,16,24,32].includes(bits))||(format===3&&bits===32)))fail('Import PCM 8/16/24/32-bit or 32-bit float WAV audio.');if(align!==channels*bits/8||audio.length%align)fail('Invalid WAV frame alignment.');const frames=audio.length/align;if(frames<1||frames>rate*60)fail('Import WAV clips of up to 60 seconds.');const samples=new Float32Array(frames),width=bits/8;
  for(let frame=0;frame<frames;frame++){let sum=0;for(let ch=0;ch<channels;ch++){const at=audio.start+frame*align+ch*width;let sample;if(format===3)sample=view.getFloat32(at,true);else if(bits===8)sample=(view.getUint8(at)-128)/128;else if(bits===16)sample=view.getInt16(at,true)/32768;else if(bits===24){let n=data[at]|data[at+1]<<8|data[at+2]<<16;if(n&0x800000)n-=0x1000000;sample=n/8388608;}else sample=view.getInt32(at,true)/2147483648;if(!Number.isFinite(sample))fail('The WAV file contains invalid floating-point samples.');sum+=Math.max(-1,Math.min(1,sample));}samples[frame]=sum/channels;}
  return {samples,rate,channels,duration:frames/rate};
 }
 const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
 function crc32(data){let crc=0xffffffff;for(const n of bytes(data))crc=crcTable[(crc^n)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
 function zipStore(files){
  if(!Array.isArray(files)||files.length<1||files.length>256)fail('A handoff ZIP needs one to 256 files.');const local=[],central=[],names=new Set();let offset=0,centralSize=0;
  for(const file of files){
   if(!file||typeof file.name!=='string'||!file.name||file.name.startsWith('/')||file.name.includes('\\')||file.name.includes('\0')||file.name.split('/').some(p=>p==='..'||p==='.'||!p)||names.has(file.name))fail('Invalid or duplicate ZIP filename.');names.add(file.name);const name=utf8(file.name);if(name.length>512)fail('ZIP filenames must be short.');const data=typeof file.data==='string'?utf8(file.data):bytes(file.data);if(data.length>512*1024*1024||offset+data.length>1024*1024*1024)fail('The handoff ZIP is too large.');const crc=crc32(data),head=new Uint8Array(30+name.length),v=new DataView(head.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);head.set(name,30);local.push(head,data);
   const record=new Uint8Array(46+name.length),c=new DataView(record.buffer);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(14,33,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);record.set(name,46);central.push(record);centralSize+=record.length;offset+=head.length+data.length;
  }
  const end=new Uint8Array(22),view=new DataView(end.buffer);view.setUint32(0,0x06054b50,true);view.setUint16(8,files.length,true);view.setUint16(10,files.length,true);view.setUint32(12,centralSize,true);view.setUint32(16,offset,true);return join([...local,...central,end]);
 }
 const api={encode,decode,encodeWav,decodeWav,zipStore,crc32};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MidiIO=api;
})(typeof globalThis!=='undefined'?globalThis:this);

(function(root) {
  'use strict';
  const N=32,EPS=1e-8;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),wrap=i=>(i%N+N)%N;
  function check(points){
    if(!Array.isArray(points)||points.length!==N||points.some(v=>!Number.isFinite(v)||v < -1||v > 1))throw new Error('A shape needs 32 finite dots between −1 and +1.');
    return [...points];
  }
  function indices(selection){
    if(!selection?.length)return Array.from({length:N},(_,i)=>i);
    if(!Array.isArray(selection)||selection.some(i=>!Number.isInteger(i)||i<0||i>=N))throw new Error('Select dots inside this cycle.');
    return [...new Set(selection)];
  }
  function landmarks(points){
    const p=check(points),peaks=[],troughs=[],crossings=[],groups=[];
    const start=p.findIndex((v,i)=>Math.abs(v-p[wrap(i-1)])>EPS);
    if(start>=0){
      let used=0;
      while(used<N){let length=1;const at=wrap(start+used),value=p[at];while(used+length<N&&Math.abs(p[wrap(at+length)]-value)<=EPS)length++;
        groups.push({index:wrap(at+Math.floor((length-1)/2)),value});used+=length;}
      groups.forEach((g,i)=>{const before=groups[(i+groups.length-1)%groups.length].value,after=groups[(i+1)%groups.length].value;
        if(g.value>before+EPS&&g.value>after+EPS)peaks.push(g.index);
        if(g.value<before-EPS&&g.value<after-EPS)troughs.push(g.index);
      });
      for(let i=0;i<N;i++){
        const a=p[i],b=p[wrap(i+1)];
        if(a*b < -EPS)crossings.push({at:i-a/(b-a),from:i,to:wrap(i+1)});
        else if(Math.abs(a)<=EPS&&Math.abs(b)>EPS){let j=1;while(j<N&&Math.abs(p[wrap(i-j)])<=EPS)j++;if(p[wrap(i-j)]*b<0)crossings.push({at:i,from:wrap(i-1),to:wrap(i+1)});}
      }
    }
    const gradients=p.map((v,i)=>Math.abs(p[wrap(i+1)]-v)),largest=Math.max(...gradients);
    const steep=gradients.flatMap((v,i)=>v>EPS&&v>=gradients[wrap(i-1)]-EPS&&v>=gradients[wrap(i+1)]-EPS&&v>largest*.7?[i]:[]);
    const edges=[...new Set((crossings.length?crossings.flatMap(c=>[wrap(Math.floor(c.at)-1),wrap(Math.floor(c.at)),wrap(Math.floor(c.at)+1)]):steep.flatMap(i=>[i,wrap(i+1)])))];
    return {peaks,troughs,crossings,edges,high:Math.max(...p),low:Math.min(...p),mean:p.reduce((s,v)=>s+v,0)/N,maxEdge:largest};
  }
  function arc(from,to){const low=Math.min(from,to),high=Math.max(from,to);if(!Number.isInteger(low)||low<0||high>=N)throw new Error('Select an arc within the cycle.');return Array.from({length:high-low+1},(_,i)=>low+i);}
  function arcBetween(from,to){if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||from>=N||to<0||to>=N)throw new Error('Choose arc endpoints from dot one to 32.');return Array.from({length:wrap(to-from)+1},(_,i)=>wrap(from+i));}
  function displayArc(from,to){if(![from,to].every(i=>Number.isInteger(i)&&i>=0&&i<=N))throw new Error('Choose points inside this cycle.');return [...new Set(Array.from({length:Math.abs(to-from)+1},(_,i)=>wrap(Math.min(from,to)+i)))];}
  function drawClosed(points,from,to){
    const out=check(points);displayArc(from.slot,to.slot);
    for(const value of [from.value,to.value])if(!Number.isFinite(value)||Math.abs(value)>1)throw new Error('Keep the height inside this wave.');
    for(let slot=Math.min(from.slot,to.slot);slot<=Math.max(from.slot,to.slot);slot++){const t=from.slot===to.slot?1:(slot-from.slot)/(to.slot-from.slot);out[wrap(slot)]=from.value+(to.value-from.value)*t;}
    return out;
  }
  function brushWeight(index,center,reach){const d=Math.min(wrap(index-center),wrap(center-index));return d<=reach?(1+Math.cos(Math.PI*d/(reach+1)))/2:0;}
  function reachValue(reach){if(!Number.isInteger(reach)||reach<0||reach>8)throw new Error('Choose a brush reach from zero to eight dots.');return reach;}
  function bump(points,center,target,reach=2){const p=check(points);indices([center]);reachValue(reach);if(!Number.isFinite(target)||Math.abs(target)>1)throw new Error('Keep the height between −1 and +1.');return p.map((v,i)=>{const w=brushWeight(i,center,reach);return clamp(v+(target-v)*w,-1,1);});}
  function grab(points,selection,delta,reach=0){const p=check(points),chosen=indices(selection);reachValue(reach);if(!Number.isFinite(delta))throw new Error('Choose a finite height.');return p.map((v,i)=>clamp(v+delta*Math.max(...chosen.map(c=>brushWeight(i,c,reach))),-1,1));}
  function edge(points,center,reach=2){const p=check(points);indices([center]);reachValue(reach);const r=Math.max(1,reach),left=p[wrap(center-r-1)],right=p[wrap(center+r+1)],out=[...p];out[center]=0;
    for(let d=1;d<=r;d++){out[wrap(center-d)]=left*d/(r+1);out[wrap(center+d)]=right*d/(r+1);}return out;}
  function levels(points,{peak,trough}={}){
    let p=check(points);for(const v of [peak,trough])if(v!==undefined&&(!Number.isFinite(v)||v<0||v>1))throw new Error('Peaks and troughs stay between zero and full height.');
    if(peak!==undefined){let high=Math.max(...p,0);if(high<EPS&&peak>0){p=bump(p,8,peak,4);high=Math.max(...p,0);}if(high>EPS)p=p.map(v=>v>0?v/high*peak:v);}
    if(trough!==undefined){let low=Math.max(...p.map(v=>-v),0);if(low<EPS&&trough>0){p=bump(p,24,-trough,4);low=Math.max(...p.map(v=>-v),0);}if(low>EPS)p=p.map(v=>v<0?v/low*trough:v);}
    return p.map(v=>clamp(v,-1,1));
  }
  function transform(points,selection,operation){
    const p=check(points),chosen=indices(selection),out=[...p],mean=chosen.reduce((s,i)=>s+p[i],0)/chosen.length;
    if(['line','curve'].includes(operation)){
      if(chosen.length<2||chosen.length===N||chosen.some((i,k)=>k&&wrap(i-chosen[k-1])!==1))throw new Error('Select a continuous arc of two to 31 dots first.');
      const first=p[chosen[0]],last=p[chosen.at(-1)];chosen.forEach((index,k)=>{if(k===0){out[index]=first;return;}if(k===chosen.length-1){out[index]=last;return;}let t=k/(chosen.length-1);if(operation==='curve')t=(1-Math.cos(Math.PI*t))/2;out[index]=first+(last-first)*t;});
    }else for(const i of chosen){const smooth=(p[wrap(i-1)]+p[i]*2+p[wrap(i+1)])/4;
      if(operation==='round')out[i]=smooth;
      else if(operation==='sharpen')out[i]=clamp(p[i]+(p[i]-smooth)*.9,-1,1);
      else if(operation==='flatten')out[i]=mean;
      else if(operation==='zero')out[i]=0;
      else if(operation==='invert')out[i]=-p[i];
      else if(operation==='center')out[i]=p[i]-mean;
      else throw new Error('Choose a shaping tool.');
    }
    if(operation==='center'){const max=Math.max(1,...out.map(Math.abs));return out.map(v=>v/max);}
    return out.map(v=>clamp(v,-1,1));
  }
  function shift(points,delta){const p=check(points);if(!Number.isInteger(delta))throw new Error('Shift by whole dots.');return p.map((_,i)=>p[wrap(i-delta)]);}
  const api={N,check,indices,landmarks,arc,arcBetween,displayArc,drawClosed,bump,grab,edge,levels,transform,shift};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WaveShape=api;
})(typeof globalThis!=='undefined'?globalThis:this);

(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const dep = (name, globalName) => node ? require('./dsp/' + name + '.js') : root[globalName];
  const S = dep('studio-dsp', 'StudioDSP'), D = dep('drum-dsp', 'DrumDSP');
  const Song = dep('song-dsp', 'SongDSP'), M = dep('melody-dsp', 'MelodyDSP');
  const W = dep('wave-library', 'WaveLibrary'), IO = dep('midi-io', 'MidiIO');
  const FX = dep('effects-dsp', 'EffectsDSP');
  const Collision = dep('collision-audio', 'CollisionAudio');
  const Shape = node ? require('./shaping.js') : root.WaveShape;
  const clone = value => JSON.parse(JSON.stringify(value));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  let sequence = 0;
  const id = prefix => prefix + '-' + Date.now().toString(36) + '-' + (++sequence).toString(36);
  const assert = (ok, text) => { if (!ok) throw new Error(text); };
  const name = (value, max = 64) => { assert(typeof value === 'string' && value.trim() && value.length <= max, 'Use a name of 1–' + max + ' characters.'); return value.trim(); };
  function signals(library) { return Object.fromEntries(library.map(w => [w.id, W.signal(w)])); }
  function patchDefault() {
    return {kind: 'dot-wave-studio', project: S.defaultProject(), freePair: null, pitch: 134,
      level: 0, volume: .5, inverted: false, eq: {gains: Array(10).fill(0), bypass: false}, throughEQ: false, channel: 0};
  }
  function blank() {
    const melody = M.defaultProject(), song = Song.defaultSong();
    melody.name = 'Little idea'; melody.bars = 2; melody.bpm = 96;
    song.name = 'Untitled session'; song.bpm = 96; song.bars = 8; song.loop = {start: 0, end: 8}; song.tracks = [];
    const pattern = D.validatePattern({bpm: 96, swing: 0, bars: 1, meter: {numerator: 4, denominator: 4}, tracks: D.defaultTracks()});
    return {kind: 'dot-studio-project', version: 2, library: W.stockWaves(), patch: patchDefault(),
      melody, beat: {name: 'Pocket groove', volume: .55, pattern}, song, patterns: [], beatShelf: [], compatibility: {}};
  }
  function syncTempo(p, bpm) {
    assert(Number.isFinite(bpm) && bpm >= 40 && bpm <= 240, 'Choose a tempo from 40 to 240 BPM.');
    p.song.bpm = p.melody.bpm = p.beat.pattern.bpm = bpm;
  }
  function checkedPattern(p, librarySignals) {
    assert(p && p.kind === 'dot-melody-pattern' && p.version === 1, 'Choose an editable melody pattern.');
    assert(typeof p.id === 'string' && /^[a-zA-Z0-9_-]{1,90}$/.test(p.id), 'Invalid pattern ID.');
    assert(Number.isFinite(p.duration) && p.duration > 0 && p.duration <= 64, 'A pattern needs 1/64–64 beats.');
    const test = Song.defaultSong(); test.bars = 16; test.loop = {start: 0, end: 16};
    test.tracks = [{id: 'check', name: name(p.name, 48), instrument: p.instrument, volume: p.volume ?? .65, mute: false,
      notes: [], phrases: [{id: 'check-clip', name: p.name, sourceId: p.id, start: 0, duration: p.duration, repeats: 1, notes: p.notes}]}];
    const track = Song.validateSong(test, librarySignals).tracks[0];
    return {kind: p.kind, version: 1, id: p.id, name: track.name, bpm: p.bpm || 96, root: p.root || 0,
      mode: p.mode === 'minor' ? 'minor' : 'major', partId: ['melody', 'chords', 'bass', 'rhythm'].includes(p.partId) ? p.partId : 'melody',
      duration: p.duration, instrument: p.instrument, volume: track.volume, notes: track.phrases[0].notes,
      waves: clone(p.waves || [])};
  }
  function fromBase64(text) {
    assert(typeof text === 'string' && text.length < 32000000 && /^[A-Za-z0-9+/]*={0,2}$/.test(text), 'Invalid saved audio.');
    const binary = node ? Buffer.from(text, 'base64') : Uint8Array.from(atob(text), c => c.charCodeAt(0));
    return binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
  }
  function toBase64(buffer) {
    if (node) return Buffer.from(buffer).toString('base64');
    const bytes = new Uint8Array(buffer); let text = '';
    for (let i = 0; i < bytes.length; i += 16384) text += String.fromCharCode(...bytes.subarray(i, i + 16384));
    return btoa(text);
  }
  function encodeSong(song) {
    return {...song, audio: song.audio.map(({samples, ...c}) => ({...c, wav: toBase64(IO.encodeWav(samples, c.rate))}))};
  }
  function decodeSong(song) {
    assert(song && Array.isArray(song.audio) && song.audio.length <= 8, 'The song audio list is invalid.');
    let duration = 0;
    return {...song, audio: song.audio.map(c => {
      if (!c.wav) { duration += c.samples?.length / c.rate; assert(duration <= 60.0001, 'Keep imported audio under one minute in total.'); return c; }
      const decoded = IO.decodeWav(fromBase64(c.wav)); duration += decoded.duration;
      assert(duration <= 60.0001, 'Keep imported audio under one minute in total.');
      const {wav, ...rest} = c; return {...rest, rate: decoded.rate, samples: decoded.samples};
    })};
  }
  function validate(value) {
    assert(value && value.kind === 'dot-studio-project' && value.version === 2, 'Choose a Dot Wave Studio 2 project.');
    const library = W.validateBundle({kind: 'dot-wave-library', version: 1, waves: value.library});
    const bank = signals(library), patch = S.validatePatch(value.patch), melody = M.validate(value.melody, bank);
    const beat = {name: name(value.beat?.name, 48), volume: value.beat?.volume, pattern: D.validatePattern(value.beat?.pattern)};
    assert(Number.isFinite(beat.volume) && beat.volume >= 0 && beat.volume <= 1, 'Invalid beat volume.');
    assert(D.allTracks(beat.pattern).every(t => bank[t.waveId]), 'A drum sound is missing.');
    const song = Song.validateSong(decodeSong(value.song), bank);
    assert(Array.isArray(value.patterns) && value.patterns.length <= 32, 'Keep up to 32 melody patterns.');
    const patterns = value.patterns.map(p => checkedPattern(p, bank));
    assert(new Set(patterns.map(p => p.id)).size === patterns.length, 'Pattern IDs must be unique.');
    const beatShelf = value.beatShelf || []; assert(Array.isArray(beatShelf) && beatShelf.length <= 16, 'Keep up to 16 beats.');
    const beats = beatShelf.map(b => {
      assert(b && typeof b.id === 'string' && /^[a-zA-Z0-9_-]{1,90}$/.test(b.id), 'Invalid saved beat.');
      const pattern = D.validatePattern(b.pattern); assert(D.allTracks(pattern).every(t => bank[t.waveId]), 'A saved beat sound is missing.');
      return {id: b.id, name: name(b.name, 48), pattern, volume: clamp(Number.isFinite(b.volume) ? b.volume : .55, 0, 1)};
    });
    const result = {kind: value.kind, version: 2, library, patch, melody, beat, song, patterns, beatShelf: beats,
      compatibility: value.compatibility && typeof value.compatibility === 'object' ? clone(value.compatibility) : {}};
    syncTempo(result, song.bpm); return result;
  }
  function importLegacy(data) {
    assert(data && data.kind === 'dot-studio-project' && data.version === 1, 'Choose a .studio.json project.');
    assert(data.song && data.song.kind === 'dot-midi-mix' && [1, 2, 3].includes(data.song.version), 'Invalid classic song.');
    const p = blank(); p.library = data.song.library; p.patch = data.patch; p.melody = data.melody;
    p.song = data.song.song; p.beat = {name: data.beat?.name, pattern: data.beat?.pattern, volume: data.beat?.drumVolume};
    p.patterns = data.patterns || []; p.beatShelf = (data.song.song.beats || []).slice(0, 16);
    p.compatibility = {bindings: data.song.bindings || {}, songLevel: data.song.level, program: data.beat.program,
      beatEditor: data.beat.editor, sourceVersion: 1};
    return validate(p);
  }
  function open(data) { return data?.version === 1 ? importLegacy(data) : validate(data); }
  function serialize(p) { const v = validate(p); return JSON.stringify({...v, song: encodeSong(v.song)}, null, 2); }
  function legacy(p) {
    const v = validate(p), c = v.compatibility;
    return {kind: 'dot-studio-project', version: 1,
      song: {kind: 'dot-midi-mix', version: 3, bindings: c.bindings || {}, level: c.songLevel ?? .8, library: v.library, song: encodeSong(v.song)},
      melody: v.melody, patterns: v.patterns, patch: v.patch,
      beat: {kind: 'dot-drum-machine', version: 3, name: v.beat.name, pattern: v.beat.pattern, drumVolume: v.beat.volume,
        program: c.program || {source: 'PLAY 1\nEND', loop: true}, editor: {...(c.beatEditor || {}), measure: 0, voice: 0, pad: 1, follow: true, chip: true}}};
  }
  function saveSound(p, title) {
    assert(p.library.length < 64, 'The sound library has 64 sounds. Export it or remove an unused sound first.');
    const signal = p.patch.freePair ? Collision.preview(p.patch.project, p.patch.freePair).result : S.compile(p.patch.project, {frequency: p.patch.pitch}).result;
    signal.effects = p.patch.project.effects;
    const wave = W.snapshot(signal, name(title, 48), id('sound'), p.patch.inverted);
    wave.frequency = p.patch.pitch; p.library.push(wave); return wave;
  }
  function setSoundFromWave(p, waveId, side = 'a') {
    const wave = p.library.find(w => w.id === waveId); assert(wave, 'Choose a sound.');
    p.patch.project[side] = {...S.source('sine'), points: S.capture(W.signal(wave).table), shape: 'custom'};
    p.patch.project.effects = clone(wave.effects || []); p.patch.project.amount = side === 'a' ? 0 : 1;
  }
  function patternFromPart(p, partId, selectedIds, title) {
    const track = p.melody.tracks.find(t => t.id === partId); assert(track, 'Choose a melody part.');
    const selected = selectedIds?.length ? track.notes.filter(n => selectedIds.includes(noteKey(n))) : track.notes;
    assert(selected.length, 'Paint a few notes first.');
    const first = Math.floor(Math.min(...selected.map(n => n.start)) / 4) * 4;
    const end = Math.ceil(Math.max(...selected.map(n => n.start + n.duration)) / 4) * 4;
    return checkedPattern({kind: 'dot-melody-pattern', version: 1, id: id('pattern'), name: name(title || track.name, 48),
      bpm: p.song.bpm, root: p.melody.root, mode: p.melody.mode, partId, duration: end - first, instrument: track.instrument,
      volume: track.volume, notes: selected.map(n => ({...n, start: n.start - first})), waves: p.library.filter(w => w.id === track.instrument)}, signals(p.library));
  }
  function extend(p, endBeat) {
    const barBeats = Song.beatsPerBar(p.song.meter), bars = Math.ceil(endBeat / barBeats);
    assert(bars <= 64 && endBeat <= 320, 'That placement runs past the 64-measure song limit.');
    p.song.bars = Math.max(p.song.bars, bars); p.song.loop.end = p.song.bars;
  }
  function addPattern(p, pattern, at, targetId) {
    const checked = checkedPattern(pattern, signals(p.library)); assert(at >= 0, 'Place music at or after the start.');
    let track = p.song.tracks.find(t => t.id === targetId && t.instrument === checked.instrument);
    if (!track) track = p.song.tracks.find(t => t.instrument === checked.instrument && t.name === checked.name);
    if (!track) { assert(p.song.tracks.length < 8, 'A song holds eight note tracks. Remove an unused track first.');
      track = {id: id('track'), name: checked.name, instrument: checked.instrument, volume: checked.volume, pan: 0, pitch: 0, mute: false, notes: [], phrases: []}; p.song.tracks.push(track); }
    assert(p.song.tracks.reduce((n, t) => n + (t.phrases?.length || 0), 0) < 128, 'Keep up to 128 melody clips.');
    extend(p, at + checked.duration);
    const clip = {id: id('clip'), sourceId: checked.id, name: checked.name, start: at, duration: checked.duration,
      repeats: 1, volume: 1, pan: 0, pitch: 0, fadeIn: 0, fadeOut: 0, mute: false, notes: clone(checked.notes)};
    (track.phrases ||= []).push(clip); return {type: 'phrase', trackId: track.id, id: clip.id};
  }
  function addBeat(p, beat, at) {
    assert(p.song.clips.length < 128, 'Keep up to 128 beat placements.');
    assert(p.song.beats.length < 16, 'This song holds 16 beat variations. Reuse a placed beat or remove an unused beat first.');
    const b = {id: id('beat'), name: name(beat.name, 48), pattern: D.validatePattern(beat.pattern), volume: beat.volume};
    const span = b.pattern.bars * Song.beatsPerBar(b.pattern.meter); extend(p, at + span); p.song.beats.push(b);
    const c = {id: id('beatclip'), beatId: b.id, start: at, volume: 1, pan: 0, pitch: 0, fadeIn: 0, fadeOut: 0, mute: false}; p.song.clips.push(c);
    return {type: 'beat', id: c.id};
  }
  function findClip(p, selection) {
    if (!selection) return null;
    if (selection.type === 'phrase') return p.song.tracks.find(t => t.id === selection.trackId)?.phrases?.find(c => c.id === selection.id);
    if (selection.type === 'notes') return p.song.tracks.find(t => t.id === selection.id);
    return (selection.type === 'beat' ? p.song.clips : selection.type === 'audio' ? p.song.audio : p.song.waves).find(c => c.id === selection.id);
  }
  function clipLength(p, selection) {
    const c = findClip(p, selection); if (!c) return 0;
    if (selection.type === 'phrase') return c.duration * c.repeats;
    if (selection.type === 'beat') { const b = p.song.beats.find(b => b.id === c.beatId); return b.pattern.bars * Song.beatsPerBar(b.pattern.meter); }
    if (selection.type === 'audio') return c.samples.length / c.rate * p.song.bpm / 60 / 2 ** ((c.pitch || 0) / 12);
    if (selection.type === 'notes') return c.notes.length ? Math.max(...c.notes.map(n => n.start + n.duration)) - Math.min(...c.notes.map(n => n.start)) : 0;
    return c.duration;
  }
  const noteKey = n => n.start + ':' + n.midi;
  function transformNotes(track, keys, deltaBeat, deltaPitch, deltaLength, end) {
    const moving = track.notes.filter(n => keys.includes(noteKey(n)));
    assert(moving.length, 'Select notes first.');
    const occupied = new Set(track.notes.filter(n => !keys.includes(noteKey(n))).map(noteKey));
    const changed = moving.map(n => ({...n, start: n.start + deltaBeat, midi: n.midi + deltaPitch, duration: n.duration + deltaLength}));
    assert(changed.every(n => n.start >= 0 && n.duration >= 1 / 64 && n.start + n.duration <= end + 1e-8 && n.midi >= 0 && n.midi <= 127), 'Those notes would leave the phrase.');
    assert(changed.every(n => !occupied.has(noteKey(n))), 'There is already a note at that position.');
    track.notes = [...track.notes.filter(n => !keys.includes(noteKey(n))), ...changed].sort((a, b) => a.start - b.start || a.midi - b.midi);
    return changed.map(noteKey);
  }
  function scopeSong(p, scope) {
    if (scope === 'song') return p.song;
    if (scope === 'melody') return M.toSong({...p.melody, bpm: p.song.bpm}, signals(p.library));
    const s = Song.defaultSong(); s.bpm = p.song.bpm; s.tracks = [];
    if (scope === 'beat') { s.bars = p.beat.pattern.bars; s.meter = p.beat.pattern.meter; s.loop = {start: 0, end: s.bars};
      s.beats = [{id: 'draft-beat', ...p.beat}]; s.clips = [{id: 'draft-clip', beatId: 'draft-beat', start: 0}];
    } else {
      const result = S.compile(p.patch.project, {frequency: p.patch.pitch}).result;
      s.bars = 1; s.loop = {start: 0, end: 1};
      s.waves = [{id: 'draft-sound', name: 'Current sound', start: 0, sourceBeats: 4, duration: 4, trimStart: 0, trimEnd: 4, stretch: 1,
        loop: true, frequency: p.patch.pitch, volume: .7, wave: {real: Array.from(result.real, x => p.patch.inverted ? -x : x), imag: Array.from(result.imag, x => p.patch.inverted ? -x : x), effects: p.patch.project.effects}}];
    }
    return s;
  }
  function render(p, scope, rate = 44100, options = {}) {
    if (scope === 'preview') return renderSoundPreview(p.wave,{rate});
    if (scope === 'patch-preview') return renderPatchPreview(p.patch,p.target,{rate});
    if (scope === 'sound' && p.patch.freePair) {
      const duration = 4 * 60 / p.song.bpm;
      const raw = Collision.render(p.patch.project, p.patch.freePair, {rate, duration: duration * 2, gain: .7, inverted: p.patch.inverted, fade: 0});
      const effected = FX.process(raw, rate, p.patch.project.effects), samples = effected.slice(Math.round(duration * rate));
      const edge = Math.min(Math.round(rate * .008), Math.floor(samples.length / 2));
      for (let i = 0; i < edge; i++) {const f = i / edge; samples[samples.length - edge + i] = samples[samples.length - edge + i] * (1 - f) + samples[i] * f;}
      const peak = S.peakOf(samples), scale = peak > .98 ? .98 / peak : 1;
      if (scale !== 1) for (let i = 0; i < samples.length; i++) samples[i] *= scale;
      return {samples, left: Float32Array.from(samples), right: Float32Array.from(samples), rate, duration: samples.length / rate, peak, scale};
    }
    return Song.render(scopeSong(p, scope), signals(p.library), {rate, gain: .7, normalize: true, loopTails: true, ...options});
  }
  function encodeStereo(audio) {
    const frames = audio.left.length, buffer = new ArrayBuffer(44 + frames * 4), v = new DataView(buffer);
    const text = (at, value) => [...value].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
    text(0, 'RIFF'); v.setUint32(4, 36 + frames * 4, true); text(8, 'WAVE'); text(12, 'fmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, audio.rate, true); v.setUint32(28, audio.rate * 4, true);
    v.setUint16(32, 4, true); v.setUint16(34, 16, true); text(36, 'data'); v.setUint32(40, frames * 4, true);
    for (let i = 0; i < frames; i++) { v.setInt16(44 + i * 4, Math.round(clamp(audio.left[i], -1, 1) * 32767), true); v.setInt16(46 + i * 4, Math.round(clamp(audio.right[i], -1, 1) * 32767), true); }
    return buffer;
  }
  function renderSoundPreview(wave,{rate=44100}={}) {
    const w=W.validateWave(wave);assert(Number.isInteger(rate)&&rate>=8000&&rate<=192000,'Choose a supported audio sample rate.');
    const frequency=w.frequency??134,table=S.reconstruct(w.real,w.imag,Math.floor(rate*.45/frequency));
    const warm=Math.min(2,FX.tail(w.effects)),pre=Math.ceil(warm*rate),frames=rate*3;
    const raw=Float32Array.from({length:pre+frames},(_,i)=>S.sample(table,i*frequency/rate)*.65);
    const processed=FX.process(raw,rate,w.effects),samples=processed.slice(pre,pre+frames);
    const peak=S.peakOf(samples),scale=peak>.95?.95/peak:1;
    for(let i=0;i<frames;i++){const on=Math.min(1,i/(rate*.012)),off=Math.min(1,(frames-1-i)/(rate*.03));const edge=.5-.5*Math.cos(Math.PI*Math.min(on,off));samples[i]*=edge*scale;}
    return {samples,left:Float32Array.from(samples),right:Float32Array.from(samples),rate,duration:3,peak,scale};
  }
  function renderPatchPreview(value,target='result',{rate=44100}={}) {
    const patch=S.validatePatch(value);assert(['a','b','result'].includes(target),'Choose Wave A, Wave B, or the result.');
    if(target!=='result'){
      const voice={...patch.project[target],ratio:patch.freePair?1:patch.project[target].ratio},signal=S.analyse(S.renderSource(voice));
      const wave=W.snapshot(signal,'Wave '+target.toUpperCase(),'draft-'+target,patch.inverted);wave.frequency=patch.freePair?.[target]??patch.pitch;
      return renderSoundPreview(wave,{rate});
    }
    const audio=render({patch,library:[],song:{bpm:80}},'sound',rate);
    for(let i=0;i<audio.left.length;i++){const f=Math.min(1,i/(rate*.012),(audio.left.length-1-i)/(rate*.03)),gain=.5-.5*Math.cos(Math.PI*f);audio.left[i]*=gain;audio.right[i]*=gain;if(audio.samples)audio.samples[i]*=gain;}
    return audio;
  }
  function starter() {
    const p = blank(); p.song.name = 'Windowlight'; p.melody.name = 'Windowlight'; p.melody.bars = 4;
    const root = [0, 9, 5, 7];
    for (let b = 0; b < 4; b++) {
      const base = root[b], third = b === 1 ? 3 : 4;
      [0, third, 7, 12, 7, third].forEach((n, i) => p.melody.tracks[0].notes.push({start: b * 4 + i * .5, midi: 60 + base + n, duration: .4, velocity: .56}));
      [0, third, 7].forEach(n => p.melody.tracks[1].notes.push({start: b * 4, midi: 48 + base + n, duration: 3.5, velocity: .4}));
      [0, 2].forEach(at => p.melody.tracks[2].notes.push({start: b * 4 + at, midi: 36 + base, duration: 1.5, velocity: .6}));
    }
    for (const part of ['melody', 'chords', 'bass']) {
      const pattern = patternFromPart(p, part, null, part === 'melody' ? 'Window melody' : part === 'chords' ? 'Warm chords' : 'Round bass');
      p.patterns.push(pattern); const sel = addPattern(p, pattern, 0); findClip(p, sel).repeats = 2;
    }
    p.beat.pattern.tracks[3].steps.fill(0); p.beatShelf.push({...clone(p.beat), id: id('saved-beat')});
    const selection = addBeat(p, p.beat, 0), first = findClip(p, selection);
    for (let b = 1; b < 8; b++) p.song.clips.push({...clone(first), id: id('beatclip'), start: b * 4});
    return validate(p);
  }
  const api = {S, D, Song, M, W, IO, FX, Collision, Shape, renderSoundPreview, renderPatchPreview, clone, clamp, id, assert, blank, starter, validate, open, serialize, legacy,
    signals, syncTempo, saveSound, setSoundFromWave, patternFromPart, checkedPattern, extend, addPattern, addBeat,
    findClip, clipLength, noteKey, transformNotes, scopeSong, render, encodeStereo, encodeSong};
  if (node) module.exports = api; else root.DotWave = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

self.onmessage = e => { const {id, project, scope, options={}} = e.data; try { const checked = DotWave.open(project); const a = DotWave.render(checked, scope, options.rate || 44100, options); const audio = {left:a.left,right:a.right,rate:a.rate,duration:a.duration,peak:a.peak,scale:a.scale}; self.postMessage({id,audio}, [audio.left.buffer,audio.right.buffer]); } catch(error) { self.postMessage({id,error:error.message}); } };