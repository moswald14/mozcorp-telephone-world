window.DOT_HOSTED_STUDIO=true;window.DOT_WORKER_URL=new URL("./studio-worker.js",document.currentScript.src).href;
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

(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const C = node ? require('./core.js') : root.DotWave;
  function checked(record) {
    C.assert(record && record.kind === 'doodleverse-telephone-project' && record.version === 1, 'Choose a Telephone World project.');
    C.assert(typeof record.id === 'string' && /^[a-zA-Z0-9_-]{1,90}$/.test(record.id), 'Invalid Telephone project identifier.');
    C.assert(typeof record.title === 'string' && record.title.trim() && record.title.length <= 160, 'Invalid Telephone project title.');
    C.assert(['fiction', 'personal', 'observer', 'talky'].includes(record.sourceMode), 'Invalid source handling mode.');
    for (const key of ['sourceText', 'storyText', 'characterText', 'poemText', 'masterText', 'asciiText']) C.assert(typeof record[key] === 'string' && record[key].length <= 250000, 'Invalid Telephone text.');
    return record;
  }
  function seedOf(text) {
    let seed = 2166136261;
    for (let i = 0; i < text.length; i++) { seed ^= text.charCodeAt(i); seed = Math.imul(seed, 16777619) >>> 0; }
    return seed;
  }
  function provenance(record) {
    checked(record);
    return {projectId: record.id, title: record.title, sourceMode: record.sourceMode, sourceText: record.sourceText,
      storyText: record.storyText, characterText: record.characterText, generatedBy: 'Telephone Score 1'};
  }
  function make(record) {
    checked(record);
    // A text-derived composition is editable music. Source writing is never rewritten.
    const text = (record.sourceText + '\n' + record.storyText + '\n' + record.characterText) || record.title;
    const seed = seedOf(text), codes = Array.from(text, c => c.codePointAt(0));
    if (!codes.length) codes.push(seed);
    const p = C.blank(), minor = (seed & 1) === 1, scale = minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
    const rootNote = (seed >>> 3) % 12, bpm = 72 + (seed >>> 8) % 49;
    C.syncTempo(p, bpm); p.song.name = (record.title + ' · Telephone').slice(0, 64); p.melody.name = p.song.name;
    p.melody.bars = 4; p.melody.root = rootNote; p.melody.mode = minor ? 'minor' : 'major';
    const melody = p.melody.tracks[0], chords = p.melody.tracks[1], bass = p.melody.tracks[2];
    const progression = [0, (seed >>> 16) % 7, 3, 4];
    for (let bar = 0; bar < 4; bar++) {
      const degree = progression[bar], root = rootNote + scale[degree];
      for (let step = 0; step < 8; step++) {
        const code = codes[(bar * 8 + step) % codes.length], start = bar * 4 + step * .5;
        if (step % 4 === 0 || code % 5 !== 0) melody.notes.push({start,
          midi: 60 + rootNote + scale[(degree + code) % 7] + (code % 4 === 0 ? 12 : 0), duration: Math.min(code % 3 === 0 ? .75 : .4, p.melody.bars * 4 - start), velocity: .42 + (code % 5) * .055});
      }
      for (const offset of [0, 2, 4]) {
        const index = degree + offset;
        chords.notes.push({start: bar * 4, midi: 48 + rootNote + scale[index % 7] + Math.floor(index / 7) * 12, duration: 3.6, velocity: .33});
      }
      for (const beat of [0, 2]) bass.notes.push({start: bar * 4 + beat, midi: 36 + root, duration: 1.6, velocity: .57});
    }
    for (const part of ['melody', 'chords', 'bass']) {
      const pattern = C.patternFromPart(p, part, null, part === 'melody' ? 'Telephone melody' : part === 'chords' ? 'Story chords' : 'Phone cord bass');
      p.patterns.push(pattern); const selection = C.addPattern(p, pattern, 0); C.findClip(p, selection).repeats = 2;
    }
    p.beat.name = 'Telephone footsteps'; p.beat.pattern.swing = (seed % 3) * .06;
    for (const track of p.beat.pattern.tracks) track.steps.fill(0);
    const [kick, snare, hat, perc] = p.beat.pattern.tracks;
    for (const i of [0, 8]) kick.steps[i] = 1;
    for (const i of [4, 12]) snare.steps[i] = .5;
    for (let i = 0; i < 16; i += 2) hat.steps[i] = codes[i % codes.length] % 3 === 0 ? 1 : .5;
    perc.steps[(seed >>> 22) % 16] = .5;
    const selection = C.addBeat(p, p.beat, 0), first = C.findClip(p, selection);
    for (let bar = 1; bar < 8; bar++) p.song.clips.push({...C.clone(first), id: C.id('beatclip'), start: bar * 4});
    p.compatibility.telephone = provenance(record);
    return C.validate(p);
  }
  const api = {make, checked, provenance, seedOf};
  if (node) module.exports = api; else root.TelephoneScore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

'use strict';
class DotAudio {
  constructor(changed) {
    this.changed = changed; this.context = null; this.worker = null; this.jobs = new Map(); this.serial = 0;
    this.intent = 0; this.playing = false; this.pending = false; this.scope = 'song'; this.origin = 0;
    this.length = 0; this.sources = new Set(); this.loop = true; this.volume = .45; this.eqGains = Array(10).fill(0);
    this.positionWhenStopped = 0; this.refreshTimer = null; this.refreshRevision = 0; this.workerURL = null;
    this.bpm = 96;
    this.mini = null; this.miniPending = null; this.miniTicket = 0;
  }
  async init() {
    if (!this.context) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('This browser does not support studio audio. Try a current desktop browser.');
      this.context = new Audio({latencyHint: 'interactive'});
      this.master = this.context.createGain(); this.master.gain.value = this.volume;
      this.filters = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000].map((frequency, i) => {
        const filter = this.context.createBiquadFilter(); filter.type = i === 0 ? 'lowshelf' : i === 9 ? 'highshelf' : 'peaking';
        filter.frequency.value = frequency; filter.Q.value = 1; filter.gain.value = this.eqGains[i]; return filter;
      });
      this.compressor = this.context.createDynamicsCompressor();
      this.compressor.threshold.value = -18; this.compressor.knee.value = 6; this.compressor.ratio.value = 16;
      this.compressor.attack.value = .003; this.compressor.release.value = .12;
      this.ceiling = this.context.createWaveShaper();
      this.ceiling.curve = Float32Array.from({length: 8193}, (_, i) => Math.max(-.25, Math.min(.25, i / 4096 - 1)));
      this.analyser = this.context.createAnalyser(); this.analyser.fftSize = 256;
      const graph = [this.master, ...this.filters, this.compressor, this.ceiling, this.analyser, this.context.destination];
      for (let i = 0; i < graph.length - 1; i++) graph[i].connect(graph[i + 1]);
    }
    await this.context.resume(); return this.context;
  }
  makeWorker() {
    if (this.worker) return;
    if (!window.Worker || (!window.DOT_WORKER_SOURCE && !window.DOT_WORKER_URL)) return;
    try {
      if (window.DOT_WORKER_URL) this.worker = new Worker(window.DOT_WORKER_URL);
      else {
        this.workerURL = URL.createObjectURL(new Blob([window.DOT_WORKER_SOURCE], {type: 'text/javascript'}));
        this.worker = new Worker(this.workerURL);
      }
      this.worker.onmessage = event => {
        const job = this.jobs.get(event.data.id); if (!job) return;
        this.jobs.delete(event.data.id); clearTimeout(job.timer);
        if (event.data.error) job.reject(new Error(event.data.error)); else job.resolve(event.data.audio);
      };
      this.worker.onerror = () => {
        for (const job of this.jobs.values()) { clearTimeout(job.timer); job.reject(new Error('The audio renderer stopped. Save your project and reload to continue.')); }
        this.jobs.clear(); this.worker?.terminate(); this.worker = null;
      };
    } catch { this.worker = null; }
  }
  render(project, scope, options = {}) {
    this.makeWorker();
    if (!this.worker) return new Promise((resolve, reject) => setTimeout(() => {
      try { resolve(DotWave.render(project, scope, options.rate || 44100, options)); } catch (e) { reject(e); }
    }, 15));
    return new Promise((resolve, reject) => {
      const id = ++this.serial;
      const timer = setTimeout(() => { this.jobs.delete(id); reject(new Error('Rendering is taking too long. Try a shorter arrangement.')); }, 90000);
      this.jobs.set(id, {resolve, reject, timer});
      this.worker.postMessage({id, project, scope, options});
    });
  }
  position() {
    if (!this.playing || !this.context) return this.positionWhenStopped;
    const elapsed = Math.max(0, this.context.currentTime - this.origin);
    return this.loop && this.length ? elapsed % this.length : Math.min(elapsed, this.length);
  }
  install(audio, offset, fade = false) {
    const context = this.context, source = context.createBufferSource(), gain = context.createGain();
    const buffer = context.createBuffer(2, audio.left.length, audio.rate);
    buffer.copyToChannel(audio.left, 0); buffer.copyToChannel(audio.right, 1);
    source.buffer = buffer; source.loop = this.loop; source.connect(gain); gain.connect(this.master);
    const start = context.currentTime + .035, old = this.current, advanced = offset + (fade && old ? .035 : 0);
    const safeOffset = this.loop ? advanced % audio.duration : Math.min(advanced, Math.max(0, audio.duration - .002));
    gain.gain.setValueAtTime(fade ? 0 : 1, start); if (fade) gain.gain.linearRampToValueAtTime(1, start + .035);
    if (old) { old.gain.gain.cancelScheduledValues(start); old.gain.gain.setValueAtTime(old.gain.gain.value, start); old.gain.gain.linearRampToValueAtTime(0, start + .035); try { old.source.stop(start + .04); } catch {} }
    const entry = {source, gain}; this.current = entry; this.sources.add(entry);
    source.onended = () => {
      source.disconnect(); gain.disconnect(); this.sources.delete(entry);
      if (this.current === entry && this.playing && !this.loop) { this.current = null; this.playing = false; this.positionWhenStopped = 0; this.changed(); }
    };
    this.length = audio.duration; this.origin = start - safeOffset; this.playing = true;
    source.start(start, safeOffset); return entry;
  }
  async play(project, scope, fromBeat = 0) {
    this.stop(); const ticket = this.intent; this.pending = true; this.scope = scope; this.changed();
    try {
      await this.init(); if (ticket !== this.intent) return;
      const audio = await this.render(project, scope);
      if (ticket !== this.intent) return;
      this.install(audio, fromBeat * 60 / project.song.bpm); this.bpm = project.song.bpm; this.positionWhenStopped = 0;
    } finally { if (ticket === this.intent) { this.pending = false; this.changed(); } }
  }
  refresh(project) {
    clearTimeout(this.refreshTimer); const revision = ++this.refreshRevision;
    if (!this.playing && !this.pending) return;
    const snapshot = structuredClone(project), ticket = this.intent, scope = this.scope;
    this.refreshTimer = setTimeout(async () => {
      try {
        const audio = await this.render(snapshot, scope);
        if (ticket !== this.intent || revision !== this.refreshRevision || (!this.playing && !this.pending)) return;
        const seconds = this.position() * this.bpm / snapshot.song.bpm; await this.init(); if (ticket !== this.intent) return;
        this.install(audio, seconds, true); this.bpm = snapshot.song.bpm; this.pending = false; this.changed();
      } catch (e) { this.changed(e); }
    }, 110);
  }
  stop() {
    this.intent++; this.refreshRevision++; clearTimeout(this.refreshTimer); this.playing = false; this.pending = false;
    this.stopMiniPreview();
    for (const entry of this.sources) { try { entry.source.stop(); } catch {} entry.source.disconnect(); entry.gain.disconnect(); }
    this.sources.clear(); this.current = null; this.positionWhenStopped = 0; this.changed();
  }
  pause() { const position = this.position(); this.stop(); this.positionWhenStopped = position; this.changed(); }
  stopMiniPreview() {
    this.miniTicket++; this.miniPending=null;
    const current=this.mini;this.mini=null;
    if(current){try{current.entry.source.stop();}catch{}current.entry.source.disconnect();current.entry.gain.disconnect();this.sources.delete(current.entry);}
    this.changed();
  }
  miniRemaining() { return this.mini&&this.context?Math.max(0,Math.min(3,this.mini.end-this.context.currentTime)):0; }
  async previewSound(wave,patchRequest=null) {
    if(this.mini?.id===wave.id||this.miniPending===wave.id){this.stopMiniPreview();return;}
    this.stopMiniPreview();const ticket=++this.miniTicket;
    this.miniPending=wave.id;this.changed();
    try{
      await this.init();if(ticket!==this.miniTicket)return;
      const rendered=await this.render(patchRequest?structuredClone(patchRequest):{wave:structuredClone(wave)},patchRequest?'patch-preview':'preview',{rate:this.context.sampleRate});
      if(ticket!==this.miniTicket)return;
      const source=this.context.createBufferSource(),gain=this.context.createGain();
      const buffer=this.context.createBuffer(2,rendered.left.length,rendered.rate);buffer.copyToChannel(rendered.left,0);buffer.copyToChannel(rendered.right,1);
      source.buffer=buffer;source.loop=false;gain.gain.value=1;source.connect(gain);gain.connect(this.master);
      const entry={source,gain},start=this.context.currentTime+.01;this.sources.add(entry);
      this.mini={id:wave.id,ticket,entry,start,end:start+3};this.miniPending=null;
      source.onended=()=>{source.disconnect();gain.disconnect();this.sources.delete(entry);if(this.mini?.ticket===ticket){this.mini=null;this.changed();}};
      source.start(start);source.stop(start+3);this.changed();
    }catch(error){if(ticket===this.miniTicket){this.miniPending=null;this.changed();throw error;}}
  }
  async preview(project, midi, instrument = 'piano', velocity = .6) {
    const ticket = this.intent; await this.init(); if (ticket !== this.intent) return;
    const waveId = instrument === 'drums' ? DotWave.Song.drumVoice(midi).waveId : instrument;
    const signal = project.library.find(w => w.id === waveId);
    const samples = DotWave.Song.renderNote(instrument, signal && DotWave.W.signal(signal), {start: 0, duration: .65, midi, velocity}, {rate: this.context.sampleRate, bpm: project.song.bpm});
    if (ticket !== this.intent) return;
    const source = this.context.createBufferSource(), gain = this.context.createGain();
    const buffer = this.context.createBuffer(1, samples.length, this.context.sampleRate); buffer.copyToChannel(samples, 0);
    source.buffer = buffer; gain.gain.value = .6; source.connect(gain); gain.connect(this.master);
    const entry = {source, gain}; this.sources.add(entry);
    source.onended = () => { source.disconnect(); gain.disconnect(); this.sources.delete(entry); };
    source.start();
  }
  setVolume(value) { this.volume = value; if (this.master) this.master.gain.setTargetAtTime(value, this.context.currentTime, .02); }
  setEQ(index, value) { this.eqGains[index] = value; if (this.filters) this.filters[index].gain.setTargetAtTime(value, this.context.currentTime, .02); }
  setLoop(loop) { this.loop = loop; if (this.current) this.current.source.loop = loop; }
  destroy() {
    this.stop(); this.worker?.terminate(); if (this.workerURL) URL.revokeObjectURL(this.workerURL);
    for (const job of this.jobs.values()) { clearTimeout(job.timer); job.reject(new Error('Studio closed.')); }
    this.jobs.clear(); this.context?.close();
  }
}
window.DotAudio = DotAudio;

window.DOT_STARTER_LIBRARY={"kind":"dot-wave-library","version":1,"waves":[{"id":"stock-sine","name":"Sine","real":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"imag":[0,0.996803879737854,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,-0.0010498445481061935,0,0.000927940069232136,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,-0.0002640367019921541,0,0.0002488447935320437,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,-0.00012385562877170742,0,0.0001193885036627762,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,-0.00007599001401104033]},{"id":"stock-triangle","name":"Triangle","real":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"imag":[0,0.8105796575546265,0,-0.09007344394922256,0,0.032432954758405685,0,-0.016552411019802094,0,0.010017208755016327,0,-0.0067091030068695545,0,0.004806454759091139,0,-0.003612720873206854,0,0.0028149334248155355,0,-0.002255544997751713,0,0.0018482323503121734,0,-0.0015424805460497737,0,0.0013071317225694656,0,-0.0011221208842471242,0,0.0009740535169839859,0,-0.0008537111571058631,0,0.0007545810658484697,0,-0.0006719563971273601,0,0.000602366984821856,0,-0.0005432089092209935,0,0.0004924974055029452,0,-0.00044869835255667567,0,0.0004106107517145574,0,-0.00037728354800492525,0,0.0003479557344689965,0,-0.0003220125217922032,0,0.0002989529457408935,0,-0.0002783653326332569,0,0.00025990905123762786,0,-0.00024330016458407044,0,0.00022830047237221152,0,-0.00021470902720466256,0,0.0002023552660830319,0,-0.0001910937571665272,0,0.00018079979054164141,0,-0.00017136597307398915,0,0.00016269944899249822,0,-0.00015471955703105778,0,0.00014735596778336912,0,-0.00014054715575184673,0,0.00013423907512333244,0,-0.00012838417023885995,0,0.00012294032785575837,0,-0.00011787030234700069,0,0.00011314093717373908,0,-0.00010872269922401756,0,0.00010458918404765427,0,-0.00010071675933431834,0,0.00009708417928777635,0,-0.00009367235179524869,0,0.00009046404011314735,0,-0.00008744365914026275,0,0.00008459712262265384,0,-0.00008191161032300442,0,0.00007937550981296226,0,-0.0000769782200222835,0,0.00007471007847925648,0,-0.00007256225944729522,0,0.00007052668661344796,0,-0.00006859595305286348,0,0.00006676326302113011,0,-0.0000650223737466149,0,0.00006336753722280264,0,-0.0000617934565525502]},{"id":"stock-square","name":"Square","real":[0,0.12334419041872025,0,0.12021646648645401,0,0.11415070295333862,0,0.1055109053850174,0,0.09480613470077515,0,0.08265003561973572,0,0.06971296668052673,0,0.056670986115932465,0,0.04415648430585861,0,0.032714493572711945,0,0.022768540307879448,0,0.014598540030419827,0,0.008332119323313236,0,0.003949405625462532,0,0.0013000199105590582,0,0.00012990743562113494,0,0.00011482300760690123,0,0.0008968262118287385,0,0.0021200848277658224,0,0.0034626051783561707,0,0.004661155864596367,0,0.005527555011212826,0,0.0059555103071033955,0,0.005918262526392937,0,0.005458211060613394,0,0.0046704793348908424,0,0.0036828278098255396,0,0.0026345402002334595,0,0.0016567521961405873,0,0.0008563168812543154,0,0.0003047010686714202,0,0.00003267181818955578,0,0.0000307919763145037,0,0.0002550431527197361,0,0.0006363411666825414,0,0.0010923473164439201,0,0.0015398405957967043,0,0.001906004035845399,0,0.0021372551564127207,0,0.002204694552347064,0,0.0021057429257780313,0,0.0018620877526700497,0,0.001514512812718749,0,0.0011155629763379693,0,0.0007212002528831363,0,0.000382659345632419,0,0.0001395899016642943,0,0.000015325855201808736,0,0.00001477309524489101,0,0.0001250197528861463,0,0.00031839634175412357,0,0.0005573967937380075,0,0.0008006546995602548,0,0.0010090763680636883,0,0.0011512647615745664,0,0.0012075196718797088,0,0.0011719404719769955,0,0.0010524452663958073,0,0.0008688245434314013,0,0.0006492144893854856,0,0.0004255726234987378,0,0.00022885212092660367,0,0.00008457344665657729,0,0.000009402980140293948],"imag":[0,1.2523345947265625,0,0.3963005840778351,0,0.21356095373630524,0,0.12856541574001312,0,0.07780538499355316,0,0.04417736455798149,0,0.021147195249795914,0,0.005581604782491922,0,-0.004349033813923597,0,-0.009923833422362804,0,-0.012170037254691124,0,-0.011980711482465267,0,-0.010152717120945454,0,-0.007388818543404341,0,-0.004285591654479504,0,-0.0013189722085371614,0,0.0011658176081255078,0,0.0029564399737864733,0,0.003966399934142828,0,0.0042191967368125916,0,0.00382531201466918,0,0.002954539842903614,0,0.001806584419682622,0,0.000582897977437824,0,-0.0005375868640840054,0,-0.0014167744666337967,0,-0.0019685125444084406,0,-0.002162111457437277,0,-0.0020187583286315203,0,-0.0016020562034100294,0,-0.0010044649243354797,0,-0.0003317225491628051,0,0.00031263616983778775,0,0.0008407646673731506,0,0.0011905105784535408,0,0.0013310288777574897,0,0.0012637146282941103,0,0.0010187802836298943,0,0.0006483293254859746,0,0.0002171434462070465,0,-0.00020739756291732192,0,-0.0005648581427522004,0,-0.0008095239754766226,0,-0.0009155188454315066,0,-0.0008787850965745747,0,-0.0007159052765928209,0,-0.00046016619307920337,0,-0.0001556060160510242,0,0.00014999376435298473,0,0.00041213486110791564,0,0.0005956777022220194,0,0.0006791899795643985,0,0.0006570803234353662,0,0.0005393626051954925,0,0.00034923237399198115,0,0.00011893030750798061,0,-0.00011542606807779521,0,-0.00031925574876368046,0,-0.00046439640573225915,0,-0.0005327965482138097,0,-0.0005185616901144385,0,-0.00042815221240743995,0,-0.0002788012789096683,0,-0.00009547005174681544]},{"id":"stock-sawtooth","name":"Sawtooth","real":[0,0.062300242483615875,-0.06170402467250824,0.060720451176166534,-0.05936449393630028,0.057656679302453995,-0.05562267825007439,0.05329278111457825,-0.05070130154490471,0.04788587987422943,-0.044886741787195206,0.04174592345952988,-0.03850644454360008,0.03521150350570679,-0.03190366551280022,0.028624096885323524,-0.025411833077669144,0.022303113713860512,-0.019330795854330063,0.016523849219083786,-0.013906958512961864,0.0115002216771245,-0.009318954311311245,0.007373614702373743,-0.005669821985065937,0.004208492115139961,-0.0029860634822398424,0.001994815655052662,-0.0012232655426487327,0.0006566304946318269,-0.00027734480681829154,0.0000656152842566371,0,0.0000579962543270085,-0.00021662251674570143,0.00045298031182028353,-0.0007447829120792449,0.0010708392364904284,-0.0014114826917648315,0.0017489363672211766,-0.0020676087588071823,0.0023543154820799828,-0.002598424907773733,0.002791927196085453,-0.0029294302221387625,0.0030080843716859818,-0.0030274440068751574,0.0029892707243561745,-0.002897289115935564,0.0027569022495299578,-0.002574879676103592,0.002359024714678526,-0.002117835683748126,0.00186016911175102,-0.0015949137741699815,0.0013306868495419621,-0.001075558946467936,0.0008368132985197008,-0.0006207476835697889,0.0004325193294789642,-0.0002760372299235314,0.00015390226326417178,-0.00006739402306266129,0.000016502293874509633,0,0.00001555279959575273,-0.00005985998723190278,0.00012882042210549116,-0.0002177168062189594,0.00032141123665496707,-0.0004345451307017356,0.0005517365643754601,-0.000667768414132297,0.0007777621503919363,-0.0008773308363743126,0.0009627085528336465,-0.0010308518540114164,0.0010795118287205696,-0.0011072753695771098,0.0011135749518871307,-0.00109866913408041,0.0010635951766744256,-0.001010096282698214,0.0009405267774127424,-0.0008577412227168679,0.0007649692706763744,-0.0006656832993030548,0.0005634626140818,-0.00046185986138880253,0.00036427294253371656,-0.0002738283947110176,0.00019327840709593147,-0.00012491531379055232,0.0000705058264429681,-0.00003124645081697963,0.000007740976798231713,0,0.000007461781478923513,-0.00002903289168898482,0.00006314655183814466,-0.00010783597826957703,0.00016081964713521302,-0.00021959499281365424,0.00028153700986877084,-0.0003439979627728462,0.0004044047964271158,-0.0004603505658451468,0.0005096770473755896,-0.0005505458684638143,0.0005814953474327922,-0.0006014827522449195,0.0006099093006923795,-0.0006066286005079746,0.0005919385002925992,-0.0005665567587129772,0.0005315823364071548,-0.0004884437075816095,0.00043883686885237694,-0.0003846550825983286,0.0003279134398326278,-0.0002706710365600884,0.0002149535866919905,-0.00016267949831672013,0.00011559151607798412,-0.00007519686914747581,0.00004271742363926023,-0.000019051649360335432,0.000004749375875690021],"imag":[0,0.632544994354248,-0.3102070689201355,0.20016850531101227,-0.1433185636997223,0.10786806046962738,-0.08324521780014038,0.06493744254112244,-0.05070130154490471,0.039298925548791885,-0.0299923624843359,0.022313661873340607,-0.01594989188015461,0.010681292042136192,-0.0063460334204137325,0.002819227520376444,0,-0.002196664921939373,0.0038451342843472958,-0.005012454930692911,0.0057604508474469185,-0.006146996282041073,0.006226726341992617,-0.00605136901140213,0.005669821985065937,-0.005128062330186367,0.004468959756195545,-0.003732037730515003,0.0029532243497669697,-0.0021646206732839346,0.00139430642593652,-0.000666203151922673,0,0.0005888458690606058,-0.0010890349512919784,0.0014932759804651141,-0.001798065030016005,0.002003399422392249,-0.0021124330814927816,0.002131085144355893,-0.0020676087588071823,0.0019321368308737874,-0.0017362120561301708,0.0014923162525519729,-0.0012134097050875425,0.0009124924545176327,-0.0006021960871294141,0.000294417463010177,0,-0.0002715311711654067,0.0005121753783896565,-0.0007156023057177663,0.0008772362489253283,-0.0009942811448127031,0.0010656872764229774,-0.0010920665226876736,0.001075558946467936,-0.0010196599178016186,0.0009290145826525986,-0.0008091867784969509,0.0006664128159172833,-0.0005073478096164763,0.00033881262061186135,-0.00016755060642026365,0,0.00015791022451594472,-0.00030093645909801126,0.00042466403101570904,-0.0005256148288026452,0.0006013181409798563,-0.0006503427284769714,0.0006722928956151009,-0.000667768414132297,0.0006382929277606308,-0.0005862137186340988,0.0005145784234628081,-0.00042699280311353505,0.00032746634678915143,-0.0002202507748734206,0.00010967755224555731,0,-0.00010475498129380867,0.0002009206364164129,-0.00028530569397844374,0.00035528806620277464,-0.00040888460353016853,0.00044479535426944494,-0.0004624218272510916,0.00046185986138880253,-0.00044386787340044975,0.0004098131612408906,-0.00036159847513772547,0.0003015722322743386,-0.0002324265515198931,0.00015708651335444301,-0.00007859545439714566,0,0.0000757607413106598,-0.0001459582126699388,0.00020816628239117563,-0.00026033908943645656,0.000300872401567176,-0.0003286471182946116,0.0003430538345128298,-0.0003439979627728462,0.00033188643283210695,-0.00030759640503674746,0.00027242806390859187,-0.0002280435583088547,0.00017639469297137111,-0.00011964236182393506,0.00006007082265568897,0,-0.000058300855016568676,0.00011269514652667567,-0.0001612537307664752,0.00020232000679243356,-0.00023456319468095899,0.0002570183132775128,-0.0002691115951165557,0.0002706710365600884,-0.0002619216975290328,0.0002434670750517398,-0.00021625652152579278,0.00018154129793401808,-0.00014082046982366592,0.00009577911259839311,-0.000048221219913102686]},{"id":"stock-pulse","name":"Pulse","real":[0,0.46011051535606384,0.08171796798706055,-0.09233929216861725,0,0.10960667580366135,0.0736641138792038,-0.007710826117545366,0,0.05773177370429039,0.05944593623280525,0.012867596931755543,0,0.030389152467250824,0.042251743376255035,0.017087390646338463,0,0.013314028270542622,0.025600815191864967,0.014260844327509403,0,0.0035447825212031603,0.012341594323515892,0.008889716118574142,0,-0.0006089183152653277,0.00395460519939661,0.003792190458625555,0,-0.0009985563810914755,0.000367302680388093,0.00048459332901984453,0,0.0004283239832147956,0.00028688489692285657,-0.0006888598436489701,0,0.0020356900058686733,0.0018693028250709176,-0.000253050122410059,0,0.0028383899480104446,0.003441234352067113,0.0008605725015513599,0,0.0025961159262806177,0.004009407479315996,0.001784469815902412,0,0.001645755604840815,0.003410052042454481,0.002035947283729911,0,0.0005733711295761168,0.0021122305188328028,0.0016042916104197502,0,-0.00012107684597140178,0.0008220897288993001,0.0008222292526625097,0,-0.0002340434875804931,0.00008925353904487565,0.00012187560059828684,0,0.00011486322182463482,0.00007927580736577511,-0.0001959008222911507,0,0.000611010123975575,0.0005754915764555335,-0.00007982966053532436,0,0.0009376790840178728,0.0011618966236710548,0.0002967414620798081,0,0.0009316686191596091,0.0014664246700704098,0.0006647576810792089,0,0.0006349219474941492,0.0013377249706536531,0.0008117180550470948,0,0.00023579108528792858,0.0008816003100946546,0.0006793170468881726,0,-0.000052705927373608574,0.0003626457473728806,0.00036742669180966914,0,-0.00010722017759690061,0.00004138136500841938,0.00005717000021832064,0,0.00005510803748620674,0.00003844982711598277,-0.00009602873615222052,0,0.0003057218564208597,0.0002908215101342648,-0.00004073502714163624,0,0.00048755513853393495,0.0006096670986153185,0.00015710083243902773,0,0.0005018573137931526,0.0007965760887600482,0.0003640904033090919,0,0.0003533625858835876,0.0007503217202611268,0.00045878009404987097,0,0.00013526533439289778,0.0005094195366837084,0.00039533627568744123,0,-0.0000311012081510853,0.00021544525225181133,0.0002197421417804435,0,-0.0000649615831207484,0.000025231129257008433,0.00003507591100060381],"imag":[0,0.3776029646396637,0.4108240008354187,0.1727546602487564,0,0.03324882313609123,0.11024613678455353,0.07828933000564575,0,-0.005686083342880011,0.039720505475997925,0.04241878166794777,0,-0.01624334044754505,0.00840439461171627,0.020821046084165573,0,-0.01622319035232067,-0.005092318635433912,0.007622580509632826,0,-0.01168558094650507,-0.008246390148997307,0.0008755605667829514,0,-0.006182451732456684,-0.0059184846468269825,-0.0011503483401611447,0,-0.0018681675428524613,-0.0018465552711859345,-0.0003976954612880945,0,0.0003515163843985647,0.0014422677922993898,0.0012887661578133702,0,0.0006175198359414935,0.002797609195113182,0.0025692610070109367,0,-0.00027955701807513833,0.0022993593011051416,0.0028369275387376547,0,-0.0013876528246328235,0.0007975207408890128,0.002174382796511054,0,-0.0020053591579198837,-0.0006783015560358763,0.0010882364585995674,0,-0.0018901512958109379,-0.001411347184330225,0.00015800893015693873,0,-0.0012293137842789292,-0.0012303441762924194,-0.0002494205255061388,0,-0.0004378645680844784,-0.000448707869509235,-0.00010002071940107271,0,0.00009426580800209194,0.00039854642818681896,0.00036650465335696936,0,0.0001853479043347761,0.0008612840319983661,0.0008105241577140987,0,-0.00009235332981916144,0.000776354456320405,0.0009782254928722978,0,-0.0004979872610419989,0.00029168996843509376,0.0008100096019916236,0,-0.0007736546103842556,-0.0002660900354385376,0.0004338723374530673,0,-0.0007772990502417088,-0.0005890664760954678,0.0000669068904244341,0,-0.0005351322470232844,-0.000542737718205899,-0.0001114576734835282,0,-0.0002005948481382802,-0.00020803816732950509,-0.000046918208681745455,0,0.00004522599556366913,0.00019330033683218062,0.00017965711595024914,0,0.00009273971227230504,0.000435245136031881,0.0004135896742809564,0,-0.00004801998511538841,0.0004073665477335453,0.00051789206918329,0,-0.0002682483464013785,0.00015844883455429226,0.00044364543282426894,0,-0.00043057353468611836,-0.0001492482697358355,0.0002452230837661773,0,-0.00044591003097593784,-0.00034038323792628944,0.000038937221688684076,0,-0.00031577583285979927,-0.00032243659370578825,-0.00006665804539807141,0,-0.00012153457646491006,-0.00012684545072261244,-0.00002878605664591305]},{"id":"stock-organ","name":"Organ","real":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"imag":[0,0.7383732199668884,0.32908812165260315,0.129536971449852,0.08442950248718262,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,-0.001739755505695939,-0.0014008117141202092,-0.001479172264225781,-0.0007776626152917743,0,0.0006873630336485803,0.0011553200893104076,0.0009663579985499382,0.001059246831573546,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,-0.0003925862838514149,-0.00032832485157996416,-0.00035943477996625006,-0.00019558274652808905,0,0.00018432947399560362,0.0003192532458342612,0.00027481690631248057,0.0003096416767220944,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,-0.00017765733355190605,-0.00015041242295410484,-0.00016664774739183486,-0.00009174491424346343,0,0.00008843592513585463,0.00015484209870919585,0.0001347126526525244,0.00015336672367993742,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,-0.00010694665979826823,-0.00009113050327869132,-0.00010160879901377484,-0.00005628889994113706]},{"effects":[],"id":"wave-mvihrnij-3x1c3wt","name":"My collision","real":[0,-0.011695521883666515,-0.2221590280532837,0.006659104023128748,-0.04320332035422325,-0.05448726937174797,-0.09421414881944656,-0.0362607017159462,-0.031750649213790894,-0.032275017350912094,0.012333611957728863,-0.049043089151382446,-0.01604403182864189,0.012612779624760151,0.014910380356013775,-0.0015844762092456222,-0.0000011642932804534212,-0.004876496735960245,-0.013939493335783482,0.01509450376033783,0.01276816800236702,-0.03925392031669617,0.0035622799769043922,-0.022719236090779305,0.019992690533399582,-0.013361901044845581,0.0361316055059433,-0.028498239815235138,0.02124338038265705,0.024706708267331123,0.02924356795847416,0.013668199069797993,0.017790522426366806,0.0062214694917202,0.0034991593565791845,0.023061716929078102,0.01192614994943142,-0.021334193646907806,0.002116128569468856,-0.009966441430151463,0.0060461158864200115,0.00015301616804208606,0.01306244172155857,-0.013461214490234852,0.001859839423559606,0.025148358196020126,0.005720319226384163,0.016395309939980507,5.898974677620572e-7,0.006448478903621435,-0.008035128936171532,0.017910487949848175,0.00009564566425979137,-0.013985525816679,-0.0033168101217597723,-0.007774979341775179,0.0011745922965928912,0.0007359188166446984,0.008510180748999119,-0.00950817670673132,0.0022108349949121475,0.01431832741945982,0.005512052681297064,0.008709363639354706,0.0025651908945292234,0.00023769355902913958,-0.003419068641960621,0.007215184159576893,0.0021488124039024115,-0.01105550117790699,-0.000601564475800842,-0.0077603585086762905,0.0012892280938103795,-0.0015186634846031666,0.005956216715276241,-0.00694301025941968,0.00045318499905988574,0.005187250208109617,0.001980789704248309,0.002855184255167842,-0.000007949313840072136,-0.0017488636076450348,-0.004544008057564497,0.0018413643119856715,-0.000011076258488174062,-0.005342958495020866,-0.001288890023715794,-0.0036767541896551847,0.0002546492323745042,-0.0004777956928592175,0.004329483490437269,-0.0021146449726074934,0.0004898945917375386,0.0017530453624203801,0.0015856687678024173,0.0011638161959126592,0.0005020512035116553,-0.00006559152097906917,-0.0030353160109370947,0.000718755298294127,0.0002975142269860953,-0.0001696001272648573,-0.0006294172490015626,0.00024203292559832335,0.00002050680632237345,0.00040293936035595834,0.0029409362468868494,0.0006083818734623492,-0.00013682074495591223,-0.00008850830636220053,0.00045234421850182116,-0.00020128171308897436,-0.000010997726349160075,0.0005083900759927928,-0.0024689165875315666,-0.0002327917463844642,0.0004112215538043529,0.0011959904804825783,0.00027809408493340015,0.0010714685777202249,0.0009122821502387524,-0.0001843071513576433,0.0033845342695713043,0.000604787957854569,0.0011931248009204865,-0.0009799799881875515,0.0014647176722064614,-0.0008274409337900579],"imag":[0,-0.2781904637813568,-0.16280196607112885,-0.09247058629989624,0.017895394936203957,-0.05562475696206093,0.0853356197476387,-0.0574256032705307,0.031750671565532684,0.013606654480099678,0.06893199682235718,0.003741589840501547,0.038732901215553284,0.004752105101943016,0.01278723031282425,0.026775488629937172,0.03800470754504204,-0.02863725833594799,0.017924081534147263,-0.01105664111673832,0.030829736962914467,-0.0029904774855822325,0.042985908687114716,-0.01935591734945774,0.01999456062912941,0.03547479957342148,0.025345737114548683,0.02224148064851761,0.008799646981060505,0.014063285663723946,-0.008974777534604073,0.030182121321558952,4.325512179548241e-7,-0.018854735419154167,-0.010842961259186268,-0.007922789081931114,-0.004937656223773956,0.000545382674317807,0.004427667707204819,-0.015221481211483479,-0.006041024811565876,0.025787832215428352,0.00033847190206870437,0.015145063400268555,-0.004482753574848175,0.004431145265698433,-0.011804490350186825,0.016421914100646973,-0.0019121257355436683,-0.019377950578927994,-0.00516161834821105,-0.012396764941513538,0.00023041624808683991,-0.003507195506244898,0.008158015087246895,-0.014712076634168625,0.0011705595534294844,0.012848412618041039,0.004593388177454472,0.006784479599446058,0.0009097474394366145,-0.0018686371622607112,-0.005795870441943407,0.006706972606480122,-0.000004505891865846934,-0.014223510399460793,-0.0031505750957876444,-0.009708395227789879,-0.000890753697603941,-0.0021716742776334286,0.0043052369728684425,-0.008171730674803257,-0.0012881795410066843,0.007121982052922249,0.0008064799476414919,0.004560390952974558,-0.001102400361560285,-0.0006553208222612739,-0.00563926063477993,0.004031462594866753,-0.0005547835025936365,-0.005298363044857979,-0.0018545904895290732,-0.0031557618640363216,-0.000009021012374432757,0.0008866245625540614,0.0043680714443326,-0.0015629434492439032,0.00025482155615463853,0.003919168375432491,0.0014769110130146146,0.00288203707896173,0.00019945812528021634,0.0007287238840945065,-0.0035849744454026222,0.0018976300489157438,0.000002988020241900813,-0.00036877437378279865,-0.000989680178463459,0.00006982852937653661,-0.00011016280768672004,0.000670341367367655,0.003146205097436905,0.00036769724101759493,-0.00000529036469743005,0.0002830594021361321,0.0008067594026215374,-0.000024469394702464342,0.00032326040673069656,0.00024160288739949465,-0.002294435165822506,-0.0003299397067166865,0.0007371289539150894,0.000785177806392312,0.00042190603562630713,0.0007303593447431922,0.0009837166871875525,-0.00033653093851171434,0.0034369926434010267,0.0004532492603175342,0.0008713497663848102,-0.0011514556827023625,0.0010139148216694593,-0.0010173686314374208,0.00047391848056577146,0.0002642517501953989,-0.0018678539199754596,-0.0004448744875844568]},{"effects":[],"id":"wave-mviwcygg-b5umb10","name":"rmro","real":[0,0.11921802163124084,0.388412743806839,-0.16406357288360596,-0.04686770588159561,-0.018907925114035606,0.07042764127254486,0.10100109875202179,-0.03968735411763191,-0.02179361693561077,0.049941133707761765,-0.013238292187452316,0.05862436071038246,-0.010996341705322266,0.049192167818546295,-0.012244251556694508,-0.01792016439139843,0.03675345703959465,0.052612464874982834,-0.0041073961183428764,-0.007760738953948021,-0.018666617572307587,0.06651315838098526,0.0038919260259717703,0.00006697879871353507,-0.0034942608326673508,0.01826333813369274,0.012377282604575157,0.004378503654152155,0.0021534496918320656,0.026091134175658226,-0.013710414990782738,0.005800004582852125,0.0033117958810180426,0.020197609439492226,0.002139826538041234,-0.009912990964949131,0.0019126014085486531,0.011532356962561607,0.0021876918617635965,0.0030562682077288628,-0.006288650445640087,0.0029843298252671957,0.0006186907412484288,0.00130600412376225,0.00288118002936244,-0.005885591264814138,-0.0005069596227258444,-0.0000730529282009229,0.0004955384065397084,-0.004612554330378771,-0.001385110430419445,-0.0003679553628899157,-0.00025344331515952945,-0.00930671114474535,0.0008683735504746437,-0.0003368757606949657,-0.00003688464130391367,-0.010946529917418957,0.000017921309336088598,-0.00012856913963332772,-0.000006120959824329475,-0.011066528968513012,0.00011467597505543381,0.0003138514584861696,-0.0007452012505382299,-0.010929245501756668,0.00020768489048350602,0.00024058371491264552,0.0007192311459220946,-0.01076661329716444,-0.00029231826192699373,0.00007073750748531893,0.00019332524971105158,-0.007520668674260378,-0.0007342901662923396,-0.00041942487587220967,-0.00010229943291051313,-0.007112094666808844,0.0010569830192252994,-0.0003799186961259693,-0.0003964386123698205,-0.0060238405130803585,-0.00015538118896074593,0.0008132511284202337,-0.00004712692316388711,-0.005010799039155245,-0.00017730772378854454,-0.00018712847668211907,0.00036789802834391594,-0.0038579010870307684,-0.00011202039604540914,-0.0000745180223020725,0.00001913217784021981,-0.0036790547892451286,0.00011024900595657527,-0.0000484922893519979,0.0000020160987332928926,-0.0029604462906718254,-0.000490357750095427,-0.000048772479203762487,-0.00011673209519358352,-0.0036154105328023434,0.0010762575548142195,-0.0006170873530209064,-0.0002331963332835585,-0.004092455841600895,-0.00038965619751252234,0.0016822869656607509,-0.00047413891297765076,-0.004440363496541977,-0.00046432108501903713,-0.0009621495846658945,0.0021165909711271524,-0.004521517548710108,-0.0002377260389039293,-0.0005181488813832402,-0.0017144493758678436,-0.0023079097736626863,0.000296764395898208,0.000016199781384784728,-0.00034083359059877694,-0.007057201582938433,0.0020340061746537685,0.0006462244782596827,0.0003652118903119117,-0.004259195644408464,-0.0031426947098225355],"imag":[0,0.005810847505927086,0.40218546986579895,-0.024697374552488327,-0.009284595027565956,-0.0046907514333724976,0.10914754867553711,0.03587048128247261,-0.01624603383243084,-0.009961169213056564,0.04107672721147537,-0.007699277251958847,0.0367889329791069,-0.007617070805281401,0.011073685251176357,-0.009675903245806694,-0.01568245328962803,0.0342893972992897,0.000045151286030886695,-0.004425149876624346,-0.00861966423690319,-0.0227813720703125,0.01619669981300831,0.005277913995087147,-0.000021250651116133668,-0.0051480671390891075,-0.04911118373274803,0.021557096391916275,0.00804968923330307,0.003999039065092802,-0.026324300095438957,-0.03019326739013195,0.013539347797632217,0.00824719201773405,-0.022234413772821426,0.0062627331353724,-0.029556119814515114,0.00605438370257616,-0.022800616919994354,0.007527720183134079,0.012150230817496777,-0.026271747425198555,-0.02765166386961937,0.003347313031554222,0.006382318213582039,0.016811499372124672,-0.04609302803874016,-0.0038192174397408962,0.000042458908865228295,0.0036086179316043854,-0.001925440737977624,-0.014974519610404968,-0.005537917371839285,-0.002685333602130413,-0.01773724891245365,0.02014792151749134,-0.008940405212342739,-0.005390577483922243,-0.0179941114038229,-0.004052814096212387,0.018713004887104034,-0.003800672013312578,-0.014089667238295078,-0.004546678625047207,-0.007409366779029369,0.01575436443090439,-0.007096995133906603,-0.0019839112646877766,-0.003618428483605385,-0.0096744941547513,0.007366557605564594,0.0021169940009713173,-0.00006489276711363345,-0.0018813415663316846,-0.013432340696454048,0.008014450781047344,0.002900975290685892,0.0013333290116861463,-0.0015384331345558167,-0.01027376763522625,0.004516304470598698,0.0026607478503137827,0.000852404918987304,0.0020576491951942444,-0.008952227421104908,0.0018259031930938363,0.0008299594046548009,0.0019649402238428593,0.003444282105192542,-0.007056130561977625,-0.001102473004721105,0.0008959718979895115,0.001408608048222959,0.0041669136844575405,-0.006458062678575516,-0.0008281858172267675,0.00009521906031295657,0.0005973454681225121,0.0025163418613374233,-0.0031420045997947454,-0.001080699497833848,-0.00039529375499114394,-0.0021078577265143394,0.0038162190467119217,-0.0016683980356901884,-0.0009428597404621542,-0.0024407824967056513,-0.0008582284790463746,0.0030977444257587194,-0.0006540394970215857,-0.002312077907845378,-0.0004740751173812896,-0.001244527637027204,0.0022900323383510113,-0.001327867736108601,-0.00034323037834838033,-0.00024862916325218976,-0.0013814263511449099,0.0008288185927085578,0.0002200572198489681,-0.0001302456803387031,0.00001291508033318678,-0.0014114518417045474,0.0009503630571998656,0.00030360656091943383,-0.000021161898985155858,0.0008156738476827741,-0.0011752770515158772]},{"effects":[],"id":"wave-mviwvnbj-wuesa18","name":"dialtone","real":[0,0.14968302845954895,0.3430030643939972,-0.29717445373535156,-0.08218379318714142,-0.04254617914557457,-0.026748692616820335,-0.01857747882604599,-0.013726110570132732,-0.010583831928670406,-0.008422501385211945,-0.0068655614741146564,-0.005705919582396746,-0.004817030858248472,-0.004120411816984415,-0.003563805716112256,-0.003111811587586999,-0.0027394616045057774,-0.002429673448204994,-0.002169685671105981,-0.001943531446158886,-0.001753740943968296,-0.001588984508998692,-0.001445333007723093,-0.0013183201663196087,-0.0012114611454308033,-0.0011124024167656898,-0.0010247734608128667,-0.0009469070355407894,-0.0008769670967012644,-0.0008139743586070836,-0.000757024681661278,-0.0007055416936054826,-0.0006584842340089381,-0.0006156841409392655,-0.0005764082889072597,-0.0005404495168477297,-0.000507386343088001,-0.0004769159131683409,-0.00044869526755064726,-0.0004227815952617675,-0.0003988185490015894,-0.0003759453829843551,-0.00035515628405846655,-0.0003357063978910446,-0.00031752829090692103,-0.0003004696627613157,-0.0002847228606697172,-0.00026980164693668485,-0.0002555033133830875,-0.00024245133681688458,-0.00023005067487247288,-0.00021834658400621265,-0.00020726882212329656,-0.00019708926265593618,-0.0001870922715170309,-0.00017774240404833108,-0.00016889382095541805,-0.00016050627164077014,-0.00015254822210408747,-0.00014499263488687575,-0.00013780576409772038,-0.00013102072989568114,-0.00012482584861572832,-0.00011800805077655241,-0.00011220518354093656,-0.00010658701648935676,-0.00010119235957972705,-0.00009578273602528498,-0.000091629583039321,-0.00008720581536181271,-0.00008102101855911314,-0.00007754448597552255,-0.00007364473276538774,-0.00006992545240791515,-0.00006648125417996198,-0.0000639871068415232,-0.00006315327482298017,0.00003801409911829978,-0.000045782926463289186,-0.00004494841778068803,-0.000042551462684059516,-0.00003944954733015038,-0.00007909606938483194,-0.000036801207897951826,-0.000034618449717527255,-0.00003046404162887484,-0.00002819538531184662,-0.000025854709747363813,-0.000023510336177423596,-0.000020511142793111503,-0.000019936476746806875,-0.000017810942154028453,-0.000015125966456253082,-0.000013423789823718835,-0.00001157966471510008,-0.000009755262908583973,-0.000007866871783335228,-0.000006806765213696053,-0.000004963137143931817,-0.000002305492671439424,-0.000001550795332150301,-8.119389605099059e-8,0.0000013738572306465358,0.0000028141348593635485,0.000003448338702582987,0.000005389537363953423,0.000006624913112318609,0.000008017390427994542,0.000009230402611137833,0.000010418114470667206,0.00001157759743364295,0.00001278096988244215,0.000013704593584407121,0.000014646223462477792,0.000016140551451826468,0.000017001886590151116,0.000017965547158382833,0.0000189350812433986,0.000019982957383035682,0.000020460507585084997,0.000021490071958396584,0.00002245508585474454,0.000023247879653354175,0.000024065015168162063,0.000024862192731234245,0.00002564158603490796,0.0000263296806224389],"imag":[0,-0.002672412898391485,0.48615097999572754,0.015928035601973534,0.005876895040273666,0.003804620122537017,0.002873663790524006,0.0023310387041419744,0.0019708224572241306,0.0017119342228397727,0.0015175373991951346,0.0013622542610391974,0.0012369481846690178,0.0011342696379870176,0.00104725721757859,0.0009729036828503013,0.0009085803176276386,0.0008527116733603179,0.000802470138296485,0.000758037029299885,0.0007193891797214746,0.0006835692329332232,0.0006512889522127807,0.0006219522329047322,0.0005952974315732718,0.0005701498594135046,0.0005476280930452049,0.0005264559877105057,0.0005071313935332,0.0004890491836704314,0.00047217373503372073,0.00045637847506441176,0.0004417625314090401,0.0004277699044905603,0.00041436441824771464,0.00040242739487439394,0.0003907897335011512,0.0003797905519604683,0.00036937903496436775,0.0003598039038479328,0.00035001832293346524,0.00034101257915608585,0.00033268675906583667,0.0003245262778364122,0.0003167638787999749,0.00030935098766349256,0.0003022789896931499,0.0002954367082566023,0.0002889638999477029,0.0002825352130457759,0.00027661907370202243,0.00027085436158813536,0.00026529686874710023,0.00025992028531618416,0.0002549687051214278,0.00024989614030346274,0.0002415978378849104,0.00024047071929089725,0.0002360080397920683,0.00023169870837591588,0.0002275357983307913,0.00022364806500263512,-0.0003053321852348745,0.00021563436894211918,0.00021242247021291405,0.00020886132551822811,0.0006694594630971551,0.00020227499771863222,0.0001993521727854386,0.00019607161812018603,0.0001935016189236194,0.00019017620070371777,0.00018813868518918753,0.00018615734006743878,0.00018468700000084937,0.00018422752327751368,0.0001865373196778819,0.00019936334865633398,-0.00034203255199827254,0.00013498298358172178,0.00014476881187874824,0.0001447629474569112,0.0001379584427922964,0.0006057272548787296,0.00016171626339200884,0.00015313118638005108,0.00015083907055668533,0.00014788190310355276,0.00014548366016242653,0.00014336475578602403,0.00014196000120136887,0.00013878560275770724,0.0001371042599203065,0.00013514507736545056,0.00013340602163225412,0.00013164959091227502,0.00012991728726774454,0.00012818574032280594,0.00012675841571763158,0.00012518823496066034,0.00012083311594324186,0.00012138793681515381,0.00011992103100055829,0.00011838675709441304,0.00011677553993649781,0.0001179538230644539,0.00011425259435782209,0.00011261192412348464,0.00011134109081467614,0.00010991498857038096,0.0001085314797819592,0.00010718078556237742,0.00010594513878459111,0.00010446446685818955,0.00010319347347831354,0.00010189939348492771,0.00010064736852655187,0.00009940568270394579,0.00009817802492761984,0.00009695372136775404,0.00009582116035744548,0.00009463412425247952,0.00009333604975836352,0.00009227819828083739,0.00009114928980125114,0.00009002804290503263,-0.00004310718577471562,0.00008795014582574368]},{"effects":[],"id":"wave-mvixs58x-vw97x2h","name":"statictone","real":[0,-0.0006114993593655527,-0.002279771724715829,-0.006872607860714197,-0.002159981755539775,0.0003501762403175235,-0.00891892146319151,-0.023881539702415466,-0.027909107506275177,-0.26395735144615173,0.04803331941366196,0.00931097287684679,0.01967182569205761,0.026152851060032845,0.008675777353346348,-0.012119906954467297,0.005735909566283226,0.024158040061593056,0.004057096317410469,-0.018382707610726357,0.022022275254130363,0.007551845628768206,-0.012057517655193806,-0.039740413427352905,-0.005728630814701319,-0.025624457746744156,-0.08131051063537598,-0.32262569665908813,0.2581077516078949,0.10961779206991196,0.059876877814531326,0.022329632192850113,0.06031009554862976,0.04773634299635887,0.027760151773691177,0.0031635018531233072,0.046252790838479996,0.03514280542731285,0.01957811415195465,-0.0008763396763242781,0.04082927852869034,0.029670340940356255,0.018509801477193832,0.004190352279692888,0.047552499920129776,0.06166296452283859,-0.1036430224776268,-0.0332319512963295,0.007738711312413216,-0.0007931307191029191,-0.005393877625465393,-0.013922851532697678,0.00990923773497343,-0.0029870213475078344,-0.005205661058425903,-0.011135777458548546,0.003497621277347207,-0.0003273757465649396,-0.005326971877366304,-0.008530725724995136,-0.0018414868973195553,-0.004982035607099533,-0.0066242823377251625,-0.0071309953927993774,-0.008170085959136486,-0.007527253590524197,-0.00747100543230772,-0.005999444052577019,-0.012597235850989819,-0.009163017384707928,-0.007985985837876797,-0.005351922009140253,-0.01655762642621994,-0.009823585860431194,-0.008038140833377838,-0.005067052319645882,-0.01919759251177311,-0.009708734229207039,-0.007716746535152197,-0.0051896944642066956,-0.020704524591565132,-0.009657859802246094,-0.011725449934601784,-0.0030250928830355406,-0.019065050408244133,-0.006853272207081318,-0.004851044621318579,-0.004732381086796522,-0.018232567235827446,-0.006572924554347992,-0.0026493973564356565,-0.004272439517080784,-0.014765438623726368,-0.0005545256426557899,-0.003956356551498175,-0.00600923877209425,-0.013406598009169102,-0.00197012722492218,-0.004450238775461912,-0.010522670112550259,-0.026636559516191483,0.02596978098154068,0.008573380298912525,0.0012325930874794722,-0.0008044769638217986,0.0062219444662332535,0.004553598817437887,-0.0005344755481928587,0.0008413245668634772,0.00612865062430501,0.004782145842909813,0.000032966974686132744,0.003041702089831233,0.00641044182702899,0.005250193644315004,0.0012860207352787256,0.005036717280745506,0.007090819999575615,0.00729308370500803,-0.00989902950823307,0.003433078993111849,0.00473038898780942,0.004018454812467098,0.0027528880164027214,0.0047718556597828865,0.0047342171892523766,0.003451406257227063,0.004188098944723606],"imag":[0,0.023473700508475304,-0.005262687802314758,-0.03447072580456734,-0.01002401765435934,0.007911577820777893,-0.024148615077137947,-0.06251987814903259,-0.068649522960186,-0.5648943781852722,0.09485044330358505,0.01921597681939602,0.02947668544948101,0.03762384504079819,0.012641385197639465,-0.011523362249135971,0.00447154650464654,0.023401031270623207,0.004595229402184486,-0.012364950031042099,0.014621264301240444,0.004344679415225983,-0.0064854491502046585,-0.01882071979343891,-0.00408247159793973,-0.010611298494040966,-0.026812516152858734,-0.08755819499492645,0.05472477152943611,0.01716260053217411,0.006201102398335934,0.0012261454248800874,-0.001482611638493836,-0.0033922402653843164,-0.003776614088565111,-0.0014316701563075185,-0.011659420095384121,-0.010828058235347271,-0.007915929891169071,-0.0015399057883769274,-0.020293204113841057,-0.017034929245710373,-0.012793599627912045,-0.005164392292499542,-0.035777755081653595,-0.04814709350466728,0.07430892437696457,0.02385655790567398,-0.015457116067409515,-0.006871344521641731,-0.0011568680638447404,0.010971696116030216,-0.025195444002747536,-0.007302622310817242,-0.002273817313835025,0.010807969607412815,-0.025747504085302353,-0.015216052532196045,-0.003595520043745637,0.00936892256140709,-0.026999423280358315,-0.011077337898314,-0.00248507596552372,0.008759217336773872,-0.012163174338638783,-0.007746920455247164,-0.0007802479667589068,0.008490889333188534,-0.02218031696975231,-0.004735766910016537,0.0008752989233471453,0.00790560245513916,-0.017944032326340675,-0.0016337260603904724,0.002629268914461136,0.007346483878791332,-0.013023092411458492,0.0011778309708461165,0.004230202175676823,0.006830006372183561,-0.008118156343698502,0.0028960490599274635,0.001502088736742735,0.00890353787690401,-0.00172122020740062,0.006218275520950556,0.007765831425786018,0.0075741661712527275,0.002257435815408826,0.006718633230775595,0.009134826250374317,0.008347606286406517,0.00656158709898591,0.009598137810826302,0.008120302110910416,0.008343526162207127,0.00875622034072876,0.008865069597959518,0.008743133395910263,0.009770945645868778,0.012761368416249752,0.003862830577418208,0.006513422355055809,0.008642223663628101,0.00941463839262724,0.006217634305357933,0.006601321045309305,0.009631804190576077,0.00882392656058073,0.0050439732149243355,0.00565775902941823,0.010055786930024624,0.007175699342042208,0.0035079976078122854,0.004321631509810686,0.009891055524349213,0.004409051034599543,0.0009120094473473728,-0.00008798021008260548,0.03149138391017914,0.006246850825846195,0.003150678938254714,0.004265858791768551,0.011280568316578865,0.0017097042873501778,0.001081871334463358,0.004085108637809753,0.010552448220551014]},{"frequency":417.5,"effects":[],"id":"wave-mvjckfxk-donab4l","name":"wowowowowowowowoo","real":[0,-0.0002697132877074182,-0.0001433553989045322,0.0006698892684653401,0.0007037927280180156,0.0011014272458851337,0.04421909525990486,-0.0008507429738529027,-0.00019381397578399628,0.00042557460255920887,0.02464544214308262,-0.0013824977213516831,-0.0008550005732104182,-0.0004742064338643104,0.005079837515950203,-0.0011296289740130305,-0.0010539075592532754,-0.0011172964004799724,-0.00804685615003109,-0.00029043288668617606,-0.0006969429086893797,-0.0011294946307316422,-0.011873888783156872,0.0005739359767176211,-0.000042486677557462826,-0.0005474843201227486,-0.00791408121585846,0.000894507858902216,0.00047163316048681736,0.00021302989625837654,-0.0006744037964381278,0.0004635727673303336,0.0005129211931489408,0.0006481915479525924,0.004988917149603367,-0.0004264238814357668,0.0000679701697663404,0.0004939400823786855,0.006280901841819286,-0.0011811157455667853,-0.0005559659330174327,-0.00011554868251550943,0.0034429191146045923,-0.001298523973673582,-0.0009440738358534873,-0.0007590623572468758,-0.001017174101434648,-0.0007017494062893093,-0.0008485732832923532,-0.0010181379038840532,-0.004161783494055271,0.00021073903189972043,-0.0003468189388513565,-0.000749101978726685,-0.004368396010249853,0.0008335179882124066,0.00022040397743694484,-0.00015839310071896762,-0.0020294468849897385,0.0007571144960820675,0.0004809162637684494,0.00035288522485643625,0.0010218836832791567,0.00003851296060020104,0.0002767044643405825,0.0004620744730345905,0.0028290213085711002,-0.000841638189740479,-0.0002411257883068174,0.00012841640273109078,0.002494815504178405,-0.0013020419282838702,-0.000723050266969949,-0.00040134129812940955,0.0005531675415113568,-0.001046761404722929,-0.0008582407026551664,-0.0007733851089142263,-0.0015699510695412755,-0.0002557401603553444,-0.000575685000512749,-0.0007635712390765548,-0.0025520515628159046,0.0005420799716375768,-0.0000787963144830428,-0.0004109116271138191,-0.0019610808230936527,0.0008245501085184515,0.0003003796737175435,0.000029798249670420773,-0.000388703600037843,0.0004198364622425288,0.0003240939986426383,0.00027091315132565796,0.001059225294739008,-0.00038946548011153936,-0.0000019980686829512706,0.00017936636868398637,0.0015129379462450743,-0.001063922536559403,-0.0004465954552870244,-0.00015284169057849795,0.0008379174978472292,-0.001168798073194921,-0.0007166675059124827,-0.0004904736415483057,-0.00038787027006037533,-0.0006554149440489709,-0.0006510711973533034,-0.0006203954108059406,-0.0013318193377926946,0.00012010615319013596,-0.0003159503685310483,-0.00048523879377171397,-0.001455562305636704,0.0006445457111112773,0.000054313695727614686,-0.00020217722340021282,-0.0008038572850637138,0.0005887699080631137,0.00022073884611018002,0.00003282804391346872,0.00010825278150150552,0.000014845045370748267,0.00009419523848919198,0.00007948344864416867,0.0006821230053901672,-0.0006818869733251631],"imag":[0,0.0009630852728150785,-0.012770218774676323,0.003800689708441496,0.006315287668257952,0.013446152210235596,0.6504048705101013,-0.013328094966709614,-0.004687495995312929,0.0015230387216433883,0.21641188859939575,-0.012254174798727036,-0.0072913337498903275,-0.004814257845282555,0.0309317447245121,-0.007331477478146553,-0.006303349044173956,-0.006804805248975754,-0.039978623390197754,-0.0019423289922997355,-0.003554437542334199,-0.005403581541031599,-0.04766947403550148,0.0015458301641047,-0.0008128296467475593,-0.0024402516428381205,-0.026906609535217285,0.002208460122346878,0.0006897576386108994,0.00015882131992839277,-0.0024966932833194733,0.0006563003407791257,0.0006441156729124486,0.001215821597725153,0.011889847926795483,-0.0015694223111495376,-0.00040354597149416804,0.0006682267412543297,0.013344191014766693,-0.0029634677339345217,-0.001529139932245016,-0.0006811064667999744,0.006349370814859867,-0.00283504044637084,-0.002004557754844427,-0.0018008899642154574,-0.0021413019858300686,-0.0015191503334790468,-0.001650905585847795,-0.002048972062766552,-0.0069422912783920765,0.000016769450667197816,-0.0008172254892997444,-0.0014413362368941307,-0.006616909988224506,0.0008516141679137945,-0.00006543319614138454,-0.0004937882767990232,-0.002974425908178091,0.0006441358709707856,0.00020407010742928833,0.00018707705021370202,0.0009256268385797739,-0.00026551756309345365,-0.000042410712921991944,0.0002802481467369944,0.0028176249470561743,-0.0011771105928346515,-0.0005253051640465856,-0.0001210278642247431,0.0022407080978155136,-0.0015149259706959128,-0.0008829228463582695,-0.0006510646198876202,0.00026744575006887317,-0.0011563394218683243,-0.00090800691395998,-0.0009472561068832874,-0.001544274273328483,-0.0004283132730051875,-0.0006416835240088403,-0.0008665965870022774,-0.0021788785234093666,0.00017236804706044495,-0.00029595926753245294,-0.0005248276866041124,-0.0015944824554026127,0.00031717080855742097,-0.0000852101220516488,-0.00017086626030504704,-0.00047194166108965874,0.000019484554286464117,-0.0000916703138500452,-0.000007200424988695886,0.00038866253453306854,-0.0004366791690699756,-0.00024370901519432664,-0.00007735453982604668,0.0005736377788707614,-0.0007269324269145727,-0.000397694471757859,-0.0002749344566836953,0.00019042617350351065,-0.000699700613040477,-0.0004481456708163023,-0.00044224929297342896,-0.0003494064440019429,-0.00043723281123675406,-0.0003868954663630575,-0.0004774894332513213,-0.0006693650502711535,-0.00015221034118440002,-0.00028229973395355046,-0.00038325096829794347,-0.0006469051004387438,-0.000019467594029265456,-0.00021048024063929915,-0.00023939758830238134,-0.00040913300472311676,-0.00006882256275275722,-0.000198436071514152,-0.00013593066250905395,-0.00017185157048515975,-0.00020073223276995122,-0.00021764224220532924,-0.00011667903163470328,-0.00007141851529013366,-0.00028957496397197247]},{"frequency":104.99999999999999,"effects":[],"id":"wave-mvjckoq2-7oc5hfd","name":"vuvuvuvuvuvuuvuvu","real":[0,0.008429188281297684,0.00032972695771604776,0.009550243616104126,0.00032647582702338696,-0.005969070829451084,0.000025001043468364514,0.018261609598994255,0.0005848947330377996,-0.005747544579207897,-0.0006403790903277695,0.009536654688417912,-0.002511062193661928,0.008344575762748718,-0.00044124649139121175,0.00817909650504589,0.003154309233650565,0.009704426862299442,0.0014078107196837664,-0.006098820362240076,-0.0004098747158423066,0.018237901851534843,0.0012402946595102549,-0.0054122069850564,-0.0014557072427123785,0.009657933376729488,-0.005251122172921896,0.007992731407284737,-0.000738672271836549,0.007557675242424011,0.005868837703019381,0.009973571635782719,0.00254997075535357,-0.006133995484560728,-0.0007045672391541302,0.018160764127969742,0.0019736685790121555,-0.0049330806359648705,-0.0021177944727241993,0.009901330806314945,-0.007755295839160681,0.007440233137458563,-0.0012356521328911185,0.006580826360732317,0.008384143002331257,0.010298911482095718,0.003712370293214917,-0.006057867780327797,-0.000877754355315119,0.01799560710787773,0.002786219585686922,-0.004301480948925018,-0.002650593174621463,0.010268351063132286,-0.0099002905189991,0.0067386748269200325,-0.00190107396338135,0.005309391301125288,0.010598606429994106,0.010613353922963142,0.0048805298283696175,-0.005867160391062498,-0.0009741578251123428,0.01772906258702278,0.003678030101582408,-0.0035434826277196407,-0.003075060434639454,0.010770861059427261,-0.011606450192630291,0.005937403999269009,-0.002661221893504262,0.003819517558440566,0.012405025772750378,0.010871733538806438,0.0060509503819048405,-0.0055880118161439896,-0.001034572604112327,0.017371203750371933,0.004621339030563831,-0.002704253187403083,-0.003389297053217888,0.01140481885522604,-0.012845326215028763,0.005105757154524326,-0.003417813451960683,0.0021783129777759314,0.01372110191732645,0.011059301905333996,0.007203623186796904,-0.005263062193989754,-0.0010706792818382382,0.0169318038970232,0.00555462297052145,-0.0018177423626184464,-0.003576795570552349,0.012127509340643883,-0.013617952354252338,0.0043372102081775665,-0.004083697684109211,0.00044649787014350295,0.01451811846345663,0.011171176098287106,0.008291262201964855,-0.0049199508503079414,-0.0010678449179977179,0.016394250094890594,0.0064065842889249325,-0.0008904869318939745,-0.003635635832324624,0.012862833216786385,-0.013926279731094837,0.0037237033247947693,-0.0046059670858085155,-0.00129669439047575,0.014821460470557213,0.011183633469045162,0.009259101003408432,-0.00455045560374856,-0.0010133577743545175,0.01571458764374256,0.007130582816898823,0.00008323514339281246,-0.00359973288141191,0.013534718193113804,-0.01376667432487011,0.0033183221239596605,-0.004957018420100212,-0.0029350267723202705],"imag":[0,0.02143283560872078,-0.21593008935451508,0.05860501527786255,-0.007179707754403353,-0.227288156747818,-0.06727513670921326,0.4056911766529083,-0.02333223633468151,-0.20994099974632263,-0.031039422377943993,0.14897872507572174,-0.06764592975378036,0.11376116424798965,-0.01022921409457922,0.1093541756272316,0.015092046931385994,0.11554168164730072,0.0034205301199108362,-0.04489123448729515,-0.018582021817564964,0.16563616693019867,-0.003582689445465803,-0.046656534075737,-0.017708532512187958,0.06810945272445679,-0.04695868119597435,0.05456405133008957,-0.00851757638156414,0.046977024525403976,0.028819935396313667,0.05950663611292839,0.007060859818011522,-0.027900418266654015,-0.009656453505158424,0.09615956991910934,0.0024627347011119127,-0.024444453418254852,-0.013140653260052204,0.04255564510822296,-0.03922460600733757,0.031605303287506104,-0.007600035518407822,0.026397183537483215,0.03196455165743828,0.03924389183521271,0.009937024675309658,-0.020307686179876328,-0.00622553238645196,0.06519237160682678,0.006157371681183577,-0.01535468827933073,-0.010454567149281502,0.03164592385292053,-0.03426008298993111,0.020179519429802895,-0.006811504252254963,0.016553394496440887,0.031566232442855835,0.02967096120119095,0.012199604883790016,-0.013645355589687824,-0.004719807766377926,0.049394864588975906,0.00865500420331955,-0.011514107696712017,-0.008647598326206207,0.02387123554944992,-0.03012724593281746,0.010034026578068733,-0.006433261092752218,0.006605290342122316,0.029839249327778816,0.021123487502336502,0.013285438530147076,-0.012383238412439823,-0.003637776244431734,0.03788088262081146,0.009818198159337044,-0.007591970264911652,-0.0070528569631278515,0.02151477336883545,-0.02656388096511364,0.006206370424479246,-0.006245208438485861,0.0024374492932111025,0.027378253638744354,0.017782142385840416,0.013350484892725945,-0.009928210638463497,-0.002711500274017453,0.030468512326478958,0.009945151396095753,-0.005318002309650183,-0.0056142923422157764,0.0186531450599432,-0.023371124640107155,0.0034306931775063276,-0.00607787910848856,-0.001114863553084433,0.0243778508156538,0.014923538081347942,0.012827311642467976,-0.007984085008502007,-0.0021346549037843943,0.024782298132777214,0.009602993726730347,-0.0031847460195422173,-0.004594824276864529,0.01657414622604847,-0.020212531089782715,0.0017611338989809155,-0.005990115460008383,-0.0035367358941584826,0.021156568080186844,0.012672679498791695,0.011915701441466808,-0.006082648877054453,-0.0018763260450214148,0.02050195448100567,0.009043690748512745,-0.0010788132203742862,-0.003976886160671711,0.015144748613238335,-0.017041288316249847,0.0013684480218216777,-0.005900065880268812,-0.004581943619996309]},{"frequency":145,"effects":[],"id":"wave-mvjckxo1-v7q405p","name":"errrnnntttt","real":[0,-0.01618615724146366,0.09495078027248383,0.011142023839056492,0.059834763407707214,-0.13528281450271606,-0.12059494107961655,-0.03517640754580498,-0.14929185807704926,0.1565900295972824,-0.02845006063580513,-0.03165141120553017,0.06092074140906334,0.16286009550094604,-0.08525977283716202,-0.029287004843354225,0.035123568028211594,0.06276754289865494,-0.059132494032382965,0.06848259270191193,-0.009686407633125782,0.05536312982439995,0.08047618716955185,0.026459187269210815,0.005328341852873564,0.013364944607019424,0.0003673566097859293,0.025297431275248528,0.013238626532256603,0.0002362252853345126,0.00661490997299552,0.007731553632766008,0.003834119299426675,0.009063171222805977,-0.006219029426574707,-0.027139265090227127,0.028686467558145523,-0.0020382592920213938,-0.030964085832238197,0.014027631841599941,0.05334407463669777,-0.01519857719540596,-0.002391480840742588,-0.006667933892458677,0.019508782774209976,-0.032476283609867096,0.014653784222900867,-0.020423246547579765,0.009584575891494751,0.03321468457579613,0.015567565336823463,0.001168200047686696,0.012384884990751743,-0.002488805679604411,0.017917582765221596,0.010884620249271393,-0.003600877011194825,-0.0014201345620676875,-0.005763274151831865,0.005897135473787785,0.017562013119459152,-0.004115348216146231,-0.013605264946818352,0.009999114088714123,0.005459681153297424,-0.02349143847823143,0.0029543770942837,0.02451028861105442,-0.0006724406266584992,0.007907288148999214,-0.005803117528557777,0.013787560164928436,-0.01733194850385189,0.005403595976531506,-0.016810286790132523,-0.003047790378332138,0.01518120989203453,0.011457967571914196,-0.0014245884958654642,0.014317255467176437,0.0010385647183284163,0.016643807291984558,0.01801328733563423,0.003073651110753417,0.002312528667971492,-0.00792333111166954,0.0030712962616235018,0.020126910880208015,0.0010008602403104305,-0.0068397982977330685,0.0037342102732509375,0.008867582306265831,-0.015704592689871788,-0.0006694943876937032,0.008448131382465363,0.0016675848746672273,0.011136112734675407,-0.0019073798321187496,0.011129786260426044,-0.00589023670181632,0.0034016286954283714,-0.010339321568608284,-0.00570271722972393,0.00386500870808959,0.006571154110133648,-0.008466931991279125,0.009016618132591248,0.00023106181470211595,0.01081821322441101,0.01935584284365177,0.006680858321487904,0.006418462842702866,-0.007122271228581667,-0.0007009527762420475,0.0178063977509737,0.005399065557867289,-0.002249026671051979,0.00042123455205000937,0.009001647122204304,-0.008883820846676826,0.00023776567832101136,-0.00010287630720995367,0.00004550595622276887,0.009866069070994854,0.00034928458626382053,0.008459968492388725,0.0020365361124277115,0.003863000310957432],"imag":[0,0.027711085975170135,0.43798205256462097,0.054003965109586716,0.17595289647579193,-0.11271481215953827,-0.054930489510297775,0.234749898314476,0.16309261322021484,-0.053349487483501434,0.0019447056110948324,0.11777306348085403,-0.053963057696819305,0.03318815678358078,-0.021256854757666588,-0.07512768357992172,0.08487191796302795,0.04201571270823479,-0.009707975201308727,0.033699508756399155,0.09734266251325607,0.0031644627451896667,0.008702409453690052,0.010312375612556934,0.0427921861410141,-0.018522074446082115,0.03551863878965378,0.0002789214486256242,0.034858182072639465,0.015618904493749142,0.03723001107573509,0.02989627793431282,-0.006765258964151144,-0.031145954504609108,0.05149800330400467,0.021955901756882668,0.008049874566495419,-0.004676922224462032,0.03291710466146469,-0.010006548836827278,0.026800939813256264,-0.013379814103245735,-0.040052007883787155,0.013738342560827732,0.013656425289809704,-0.022469036281108856,0.004334987141191959,0.023906173184514046,0.00439092330634594,0.015292816795408726,0.002454584464430809,0.024120427668094635,-0.016887245699763298,0.005923784803599119,-0.001938070054166019,0.009523587301373482,0.00737212598323822,0.01854007877409458,0.021491676568984985,0.004852801561355591,-0.016777751967310905,0.02427849918603897,0.015831228345632553,0.014638951979577541,0.00045405744458548725,0.016012445092201233,-0.00009157323802355677,0.028555769473314285,0.0015012596268206835,-0.019941475242376328,0.0025050616823136806,0.01330061536282301,-0.019008222967386246,-0.0013429627288132906,0.003823729231953621,-0.0014570598723366857,0.01651107892394066,0.003974546678364277,0.021293997764587402,-0.008132456801831722,-0.0029702538158744574,-0.0009660304640419781,0.0016560357762500644,0.002471366198733449,0.0063726338557899,0.010642580687999725,0.004934370983392,-0.0088368384167552,0.009115524590015411,0.01067417673766613,0.012583623640239239,0.0027148278895765543,0.006188721861690283,-0.0011434158077463508,0.024187970906496048,0.007863877341151237,-0.007100854534655809,-0.0013928106054663658,0.014899011701345444,-0.015053635463118553,-0.002159268129616976,-0.005544174928218126,-0.00884757749736309,0.010820381343364716,0.0022591049782931805,0.017787842079997063,-0.00005496471203514375,-0.004364088177680969,0.00040999625343829393,0.002205836120992899,0.0012400151463225484,0.002616768702864647,0.002747341524809599,0.0024460169952362776,-0.0033627559896558523,0.0016623835545033216,0.006337606348097324,0.009701205417513847,0.005189176183193922,0.0016929249977692962,-0.002344348933547735,0.016954638063907623,0.010157015174627304,0.0019581897649914026,-0.0014143040170893073,0.017158357426524162,-0.0075368876568973064,0.00041479329229332507]},{"frequency":275,"effects":[],"id":"wave-mvjclp6v-xkpedon","name":"wobblestatic","real":[0,-0.10047981142997742,0.41271334886550903,-0.29917144775390625,-0.00023676878481637686,0.07953193783760071,0.1487751305103302,-0.05716177821159363,-0.16899792850017548,-0.048615824431180954,-0.03519639000296593,0.034114204347133636,-0.029521038755774498,-0.03370837867259979,-0.010742082260549068,-0.04682919383049011,-0.01617925800383091,-0.007104106713086367,-0.0156787671148777,0.0036352998577058315,-0.02779444120824337,0.007665506564080715,0.006934177130460739,-0.005102353170514107,-0.004904768895357847,-0.007934952154755592,-0.00019778110436163843,0.01152243185788393,-0.0009996637236326933,0.008737177588045597,0.001865010242909193,-0.006817459594458342,0.002590414136648178,-0.001945729716680944,0.00622969027608633,0.001546560786664486,-0.005750040989369154,0.002716050948947668,-0.00019997128401882946,-0.000916124030482024,-0.0009156764135695994,-0.006207589525729418,0.0007435512379743159,-0.002791974227875471,0.00019474630244076252,0.001452360418625176,-0.0005336846224963665,-0.003084902884438634,-0.0026028838474303484,-0.0011073092464357615,0.0029212068766355515,0.00066276645520702,-0.00014357702457346022,0.0008601589361205697,0.000662960868794471,0.001661761081777513,0.0002489121106918901,0.001425806200131774,0.0008824834367260337,0.0006220130599103868,0.0015179580077528954,0.002188134705647826,0.002277397783473134,-0.000037569501728285104,-0.0013825820060446858,0.0010130141163244843,0.00030216004233807325,0.00218674773350358,-0.00019312127551529557,0.0003562956990208477,0.000355048367055133,-0.0008921685512177646,0.00030693941516801715,0.0005289679975248873,0.000026834059099201113,0.0003453870886005461,-0.0003573127614799887,0.001021800097078085,0.0019412462133914232,-0.0003817739197984338,0.0005655554705299437,0.00022024819918442518,0.0008434070623479784,0.001622321200557053,0.0006984975188970566,0.0014097000239416957,0.0009495575213804841,0.00019368961511645466,0.0017093503847718239,0.0009815988596528769,0.0019153315806761384,0.00042550850776024163,0.0002708706888370216,0.0012292821193113923,0.001026183133944869,0.0010929828276857734,0.0006274313782341778,0.0002864169655367732,0.0007629223982803524,0.0004151362518314272,0.0006874600076116621,0.0011883308179676533,0.00019041304767597467,0.0004929778515361249,0.00016876643348950893,0.000970416353084147,0.0012975181452929974,0.00040770258055999875,0.0005947801982983947,0.0007364029297605157,0.0007743627647869289,0.001466837478801608,0.0006162123172543943,0.0013695122906938195,0.0007124987314455211,0.00072025804547593,0.001296905567869544,0.0011675722198560834,0.0013657276285812259,0.0006945119239389896,0.000591337273363024,0.0012055758852511644,0.0011163102462887764,0.0009726395946927369,0.0009081005118787289,0.00047685528988949955,0.0009927257196977735,0.0006061063031665981],"imag":[0,-0.03783593699336052,0.18590418994426727,-0.162289097905159,0.12645788490772247,0.03160308673977852,0.034550853073596954,0.3028858006000519,0.023437442258000374,0.033725980669260025,0.001752057229168713,0.04601547494530678,0.051048148423433304,0.021259015426039696,0.005747835151851177,0.020782290026545525,-0.01269788108766079,0.01026970986276865,0.011470603756606579,0.009217330254614353,0.005807711277157068,-0.01805296540260315,0.00640246132388711,0.00926528312265873,0.004719636403024197,0.004473981447517872,-0.0039954520761966705,0.006442948244512081,0.006207432132214308,0.0029825016390532255,0.013365383259952068,0.0027793277986347675,0.006548117846250534,0.002400871366262436,0.008659545332193375,0.011853910982608795,0.006246132310479879,0.002687014639377594,0.00605414854362607,0.005386119242757559,0.008322163484990597,0.004355131182819605,0.0037773787043988705,0.005145019385963678,0.0005936405505053699,0.0045243967324495316,0.0040811533108353615,0.0037503233179450035,0.0023663495667278767,-0.0009483624598942697,0.003125732531771064,0.004067847039550543,0.0018317282665520906,0.002908367896452546,-0.00009900715667754412,0.0036312940064817667,0.001974318642169237,0.002898124046623707,0.0038214372470974922,0.002536121755838394,0.0019593609031289816,0.002584590343758464,0.0033339890651404858,0.004902717657387257,0.0025953934527933598,0.0018009505001828074,0.0032662826124578714,0.0027033931110054255,0.003967739641666412,0.002306858077645302,0.00242312322370708,0.0026078468654304743,0.0012709705624729395,0.0024737180210649967,0.002766290446743369,0.0018220351776108146,0.0019528393168002367,-0.00004495888060773723,0.0024848023895174265,0.0019503877265378833,0.0017051228787750006,0.001363722956739366,0.0008364292443729937,0.0016835220158100128,0.00172904331702739,0.0015493215760216117,0.002320809755474329,0.0013317139819264412,0.001209589303471148,0.0018474075477570295,0.001897516893222928,0.002863906556740403,0.0013200576649978757,0.0014016052009537816,0.001967379357665777,0.0018542970065027475,0.0023053421173244715,0.0016717477701604366,0.001438993844203651,0.0018964047776535153,0.0008166071493178606,0.002101747551932931,0.0015611856942996383,0.0015181396156549454,0.0010468742111697793,0.0006123834173195064,0.0016180201200768352,0.0014845173573121428,0.0010715024545788765,0.001016151043586433,0.0007682311697863042,0.0011424014810472727,0.0012893867678940296,0.000996482907794416,0.0015942774480208755,0.0007785607594996691,0.0009477563435211778,0.0012122347252443433,0.0013944936217740178,0.0016846462385728955,0.0009764001006260514,0.0008497880189679563,0.0015187221579253674,0.001107927761040628,0.0017040615202859044,0.0009875118266791105,0.0011617975542321801,0.0011503022396937013]},{"frequency":374.5,"effects":[],"id":"wave-mvjcm14i-26r1x09","name":"earbeam","real":[0,0.19620855152606964,0.2058945596218109,-0.1535409688949585,-0.021745480597019196,-0.13815906643867493,0.08395825326442719,-0.04247133433818817,0.037738241255283356,-0.11392345279455185,-0.02034243568778038,-0.07572254538536072,0.01957917958498001,-0.05984342843294144,-0.01882670633494854,-0.07920649647712708,0.005080990493297577,-0.016179459169507027,0.04093585163354874,-0.022812586277723312,-0.0010751915397122502,-0.03406870365142822,0.008365199901163578,-0.0036297410260885954,-0.005485698115080595,-0.02807317115366459,-0.03585103526711464,-0.008833406493067741,0.0008078427636064589,0.0236046202480793,0.0013582368846982718,0.004306484945118427,0.0023859699722379446,0.016674572601914406,0.026594286784529686,0.0017909680027514696,-0.00037393582169897854,-0.03165877237915993,0.001471599331125617,-0.0108583252876997,0.017962032929062843,-0.009511475451290607,0.0018952175742015243,-0.0003290492168162018,0.017524145543575287,0.029258491471409798,0.010947116650640965,0.009547139517962933,-0.01872100494801998,0.0032389438711106777,-0.008500744588673115,0.006649804767221212,-0.013357737101614475,-0.013425997458398342,-0.005678968504071236,0.004132675006985664,0.028655491769313812,0.009391906671226025,0.01765047386288643,-0.011123656295239925,0.011002923361957073,0.00028146273689344525,0.007809266913682222,-0.00477482657879591,-0.012647309340536594,-0.0065286653116345406,-0.006384395528584719,0.0127187455072999,0.004226268269121647,0.0116934385150671,-0.00044150991016067564,0.006948939058929682,0.0067148711532354355,0.007791484240442514,0.0058716763742268085,-0.00583879929035902,-0.002105233259499073,-0.007832798175513744,0.005400259513407946,0.0006106384680606425,0.006139326374977827,-0.00007784806075505912,0.0028952087741345167,0.006056415848433971,0.006313385907560587,0.008605577982962132,-0.0011366188991814852,0.00047747811186127365,-0.005851143971085548,0.0014663342153653502,-0.0007372558466158807,0.0014729719841852784,-0.0009821053827181458,-0.0014586398610845208,0.0034318293910473585,0.003335251472890377,0.008292712271213531,0.0016053495928645134,0.0027089102659374475,-0.0023973393253982067,0.0010892815189436078,0.0005959711270406842,0.00028970386483706534,-0.0003335617948323488,-0.0032851207070052624,0.0014166394248604774,0.0008487605955451727,0.006632351782172918,0.002740141237154603,0.003897596849128604,0.0005359377828426659,0.0019954910967499018,0.002591314259916544,0.0012316586216911674,0.0010662729619070888,-0.0029221035074442625,-0.00010723242303356528,-0.0007837253506295383,0.0036330337170511484,0.002378485631197691,0.0026860071811825037,0.0017161122523248196,0.0014949466567486525,0.0037835610564798117,0.0017563519068062305,0.002704126527532935,-0.0019544134847819805,-0.00026933179469779134],"imag":[0,-0.2890627384185791,0.24252179265022278,0.10726849734783173,0.12222416698932648,-0.026209305971860886,0.0008249064558185637,0.06010527163743973,0.11828697472810745,0.08077285438776016,0.004550791811197996,0.03873728588223457,0.040204714983701706,0.08966188132762909,0.07171495258808136,0.05226802080869675,0.02277355082333088,0.022784611210227013,0.04401038587093353,0.03297491744160652,0.02857019752264023,-0.02144668996334076,-0.002903546206653118,-0.014628508128225803,0.0334479957818985,0.010710267350077629,0.0214951504021883,-0.003252109047025442,0.01598331891000271,0.028921538963913918,0.029576359316706657,0.024361440911889076,-0.012101459316909313,-0.0025531724095344543,-0.013806174509227276,0.016001157462596893,0.0009910601656883955,0.0023271469399333,-0.006112660281360149,0.002310404321178794,0.029312768951058388,0.02302509918808937,0.03470705822110176,-0.003339728806167841,0.012546814978122711,-0.00593035202473402,0.018607815727591515,-0.00007591123721795157,-0.003962715622037649,-0.012555058114230633,-0.010157906450331211,0.01722787506878376,0.012403251603245735,0.02917952463030815,0.00020371701975818723,0.01694328896701336,0.004167597740888596,0.02547663077712059,0.011262016370892525,-0.011871138587594032,-0.008346968330442905,-0.021772323176264763,0.007170895580202341,-0.0033568625804036856,0.015536148101091385,-0.0037143307272344828,0.00744515610858798,0.0030538628343492746,0.012497874908149242,0.012107769027352333,0.002733388915657997,0.0003894026158377528,-0.009803726337850094,0.0005955559900030494,-0.001973899779841304,0.005204394459724426,-0.0002400998491793871,-0.00020632236555684358,0.0037373192608356476,0.004916767589747906,0.013673138804733753,0.0043990472331643105,0.00744776101782918,-0.00450473465025425,0.00291995657607913,-0.0014075770741328597,0.0038946480490267277,-0.0006116952863521874,-0.0018194467993453145,-0.00003544467836036347,0.0011746768141165376,0.008380775339901447,0.005063473246991634,0.006569489371031523,0.0003783060528803617,0.0019579080399125814,0.001817879150621593,0.0018165442161262035,0.0018760485108941793,-0.003759772516787052,-0.0005898577510379255,-0.0032966898288577795,0.004796143621206284,0.0019804169423878193,0.005505573470145464,0.0008542632567696273,0.0024752775207161903,0.0025814997497946024,0.0030475796665996313,0.0032675270922482014,-0.001241175690665841,-0.000677413132507354,-0.0029011976439505816,0.0014302015770226717,0.0014738361351191998,0.0027435095980763435,0.0019313761731609702,0.0010141433449462056,0.003854766022413969,0.0027719205245375633,0.005586898420006037,0.0006319452659226954,0.0015926449559628963,-0.002019008621573448,0.0010199161479249597,0.0005727700190618634,0.001582216820679605,0.0009637748589739203]},{"frequency":203.5,"effects":[],"id":"wave-mvjcm9kz-a4x3fwg","name":"demonictone","real":[0,0.11954426765441895,-0.1424882411956787,0.09480848163366318,-0.23643702268600464,-0.20055150985717773,0.19791756570339203,0.12499567866325378,0.013165355660021305,0.036599624902009964,0.03279123455286026,0.0656655952334404,-0.017459604889154434,0.06830546259880066,0.07097732275724411,-0.028753142803907394,0.014430017210543156,0.016926640644669533,0.0140529815107584,-0.0008266637451015413,-0.029742807149887085,0.004788568243384361,0.007652816828340292,-0.06285063922405243,0.03975128382444382,0.03993900120258331,-0.006942301988601685,0.020432958379387856,-0.003911730367690325,0.01368995662778616,-0.003243128303438425,0.0071522630751132965,0.017222877591848373,0.004191416781395674,-0.021325405687093735,0.011028123088181019,0.01609073206782341,0.001777977915480733,-0.012235218659043312,-0.008646844886243343,0.01235404796898365,-0.028096448630094528,0.02627754583954811,0.0253197830170393,0.007575471419841051,0.013981145806610584,0.001683813869021833,0.007857995107769966,0.008655867539346218,-0.010148611851036549,-0.005606302060186863,0.008505123667418957,-0.030215198174118996,0.012003057636320591,0.014755603857338428,0.004443272016942501,0.0016716283280402422,-0.004741097334772348,0.006277856417000294,-0.002597292186692357,0.012817281298339367,0.008850273676216602,0.0122537175193429,0.0003940867318306118,0.005541244987398386,0.00704572256654501,0.010110498405992985,-0.011552834883332253,-0.010501234792172909,0.0039269705303013325,-0.020549699664115906,0.012712276540696621,0.011310686357319355,0.008028257638216019,0.00981917418539524,0.0035818363539874554,0.0037643450777977705,0.011271810159087181,0.0007439422188326716,-0.004028304014354944,0.0076459432020783424,-0.011433200910687447,0.005632871296256781,0.006838876288384199,0.006432083901017904,-0.0029737227596342564,-0.00343614281155169,0.0005364110111258924,-0.0030438813846558332,0.01066549587994814,0.004545285832136869,0.008894314989447594,0.006412113551050425,0.006474892608821392,0.00434613274410367,0.011570222675800323,-0.004383584950119257,-0.006523910444229841,0.0012245087418705225,-0.011474601924419403,0.006735255941748619,0.005291935987770557,0.004489324055612087,0.00472671166062355,0.004747374914586544,0.0012146943481639028,0.00862125214189291,0.005118130706250668,-0.0013709506019949913,0.005332445725798607,-0.002306225011125207,0.005743771325796843,0.004736762028187513,0.004724950063973665,-0.0006301805842667818,0.00042210848187096417,0.000011023194929293822,0.0005905102589167655,0.006082613952457905,0.0024306352715939283,0.004569260403513908,0.004356084391474724,0.00727073336020112,0.003540583187714219,0.007848791778087616,0.0003459626459516585,-0.00151086098048836,0.0018182976637035608],"imag":[0,0.17458860576152802,0.4818572700023651,0.006948653142899275,0.07809114456176758,0.07579713314771652,0.12608125805854797,-0.0011941815027967095,0.1414971500635147,-0.15496163070201874,0.07766750454902649,0.12355699390172958,0.00015798004460521042,0.04842591658234596,0.02518652379512787,0.058603331446647644,0.028046246618032455,0.009399529546499252,0.036835502833127975,0.04400933161377907,-0.03969014436006546,0.01481647603213787,0.02745923213660717,0.016893774271011353,0.009042108431458473,0.0026922482065856457,0.033346399664878845,-0.0390566885471344,0.006208065431565046,0.039148904383182526,0.018465474247932434,0.021215271204710007,0.015890570357441902,0.02147649973630905,0.03579854220151901,0.0061594522558152676,0.00602041045203805,0.03111468069255352,-0.03571736440062523,-0.0009186844108626246,0.019845591858029366,0.006235064938664436,0.01262645609676838,0.001698983134701848,0.012621631845831871,-0.0007380242459475994,0.0043163360096514225,0.012464717961847782,0.021730875596404076,0.0034944789949804544,0.005916822701692581,0.013710050843656063,0.024462850764393806,0.007077432703226805,-0.0036193092819303274,0.015668561682105064,-0.027145616710186005,-0.0021486508194357157,0.010147749446332455,0.005810115486383438,0.014619557186961174,0.005742106586694717,0.007428652141243219,0.01967327669262886,0.01013525016605854,0.0008316236198879778,0.019797122105956078,-0.011352467350661755,-0.0011202568421140313,0.00747927138581872,0.00984465517103672,0.006382816471159458,-0.0010078232735395432,0.00402606138959527,-0.008435324765741825,0.00406664190813899,0.0018832850037142634,0.009502056986093521,0.0067906309850513935,0.006381935440003872,0.006251630373299122,0.021306606009602547,0.00959361344575882,-0.0013169553130865097,0.010524597950279713,-0.015775810927152634,-0.0010283596348017454,0.00196413928642869,0.0021940588485449553,0.005301742348819971,0.004490297753363848,0.0004244001174811274,0.009180422872304916,0.009481510147452354,-0.00030558358412235975,0.010735159739851952,-0.002980064135044813,0.0027872626669704914,0.004064243286848068,0.010649191215634346,0.0044069113209843636,0.0016001192852854729,0.0012084911577403545,-0.007496432401239872,0.0032003128435462713,-0.0007816017023287714,0.0019530270947143435,0.0025330944918096066,0.006409052759408951,0.0019997726194560528,0.013101152144372463,0.0074162972159683704,0.0016874611610546708,0.00522301672026515,-0.005562538281083107,0.0006113462150096893,0.002039824379608035,0.0005942601710557938,0.0000981475823209621,0.004235306289047003,-0.0011273098643869162,0.00552686583250761,0.005737341940402985,0.0004235728702042252,0.004763058852404356,-0.00039444983121939003,0.0025888560339808464,0.0036191954277455807]},{"frequency":317.5,"effects":[],"id":"wave-mvjcmjcq-9lgr9d1","name":"earmixer","real":[0,0.009541182778775692,0.13722798228263855,0.1966102421283722,0.017568841576576233,0.20281559228897095,-0.05520164221525192,0.1872446984052658,-0.09640882164239883,-0.04552619531750679,-0.04940192773938179,0.01649715192615986,-0.017010927200317383,-0.04523024708032608,0.004867298528552055,0.018635578453540802,-0.024741198867559433,-0.025083793327212334,-0.004114189650863409,0.043964140117168427,-0.006470850203186274,-0.0028477534651756287,-0.0038719100411981344,0.01202511228621006,-0.01838802546262741,-0.018090425059199333,0.018637485802173615,0.022487645968794823,0.00814016442745924,-0.022035669535398483,0.004306445829570293,-0.005588711705058813,-0.005948285572230816,-0.011484815739095211,0.013801105320453644,0.014140755869448185,-0.017480626702308655,-0.014806506223976612,-0.012478485703468323,0.014520293101668358,-0.00809565745294094,0.0065513355657458305,0.007411963772028685,0.0018635157030075788,-0.013054120354354382,-0.023200232535600662,0.013747688382863998,0.0023828288540244102,0.013202453032135963,-0.01054227165877819,0.008411455899477005,-0.00763543089851737,-0.01274906937032938,-0.0021034276578575373,0.00693533243611455,0.019037751480937004,-0.012427386827766895,-0.002872846554964781,-0.012634648010134697,0.00035528637818060815,-0.007754375226795673,0.0025102871004492044,0.016098124906420708,-0.001243898761458695,-0.004518985282629728,-0.02303183823823929,0.006000771652907133,-0.007704264484345913,0.009607100859284401,0.0011566688772290945,0.00920209102332592,-0.0027290969155728817,-0.023173583671450615,-0.0016593221807852387,0.0014744593063369393,0.013508726842701435,-0.01129187922924757,0.0018121449975296855,-0.0036050209309905767,-0.004201526753604412,-0.010691067203879356,-0.001078276545740664,0.01197855919599533,-0.0015618675388395786,-0.0046788365580141544,-0.00986378826200962,0.003182515036314726,-0.004864433780312538,-0.0021373366471379995,0.002087534638121724,0.004463513847440481,-0.0015395180089399219,-0.01179185789078474,-0.0006711629102937877,-0.0008364813402295113,0.004433532245457172,-0.004698906559497118,0.002940690377727151,-0.0014995802193880081,-0.004652240313589573,-0.00620695436373353,-0.0017223611939698458,0.005608842242509127,-0.0022634638007730246,-0.0008022752008400857,-0.005105657037347555,-0.00033838083618320525,-0.004951743874698877,-0.0021757162176072598,0.0021050088107585907,0.0007860968471504748,-0.00031054328428581357,-0.007055694703012705,-0.000844237394630909,-0.003512465627864003,0.0009691299055702984,-0.0014971166383475065,0.0016304273158311844,-0.0009555182186886668,-0.004125240258872509,-0.0029461574740707874,-0.0028757313266396523,0.001994673628360033,-0.0016223308630287647,0.0009986241348087788,-0.0032624893356114626,-0.002074832795187831,-0.00392124243080616],"imag":[0,-0.142762690782547,0.4661884009838104,0.046793654561042786,0.006580333225429058,0.08109738677740097,0.11813946813344955,0.020533060654997826,-0.06149955466389656,-0.02216920256614685,0.019364843145012856,-0.05683240666985512,-0.04330085217952728,-0.020739229395985603,0.041687656193971634,-0.019828498363494873,-0.03620303422212601,-0.018962223082780838,-0.011706375516951084,-0.033795036375522614,-0.04160849750041962,-0.0027274740859866142,0.02101759985089302,-0.022345243021845818,-0.017622610554099083,-0.02408475987613201,0.015112302266061306,-0.023773541674017906,-0.0025870916433632374,0.006507257930934429,0.010549343191087246,-0.014626624062657356,-0.035147227346897125,0.0005512081552296877,-0.0027074413374066353,0.00344441388733685,-0.009908651001751423,0.006658598314970732,-0.0005780241917818785,-0.027019934728741646,-0.015560132451355457,-0.008277044631540775,0.01819303072988987,-0.01361352764070034,-0.0023800849448889494,-0.012353657744824886,-0.0038761631585657597,-0.01888842135667801,-0.008904951624572277,0.014145911671221256,0.004496011883020401,-0.0006268210709095001,-0.0232172179967165,0.0001134341218858026,-0.011443844065070152,-0.0019730760250240564,-0.0009836610406637192,0.009250705130398273,0.005681183654814959,-0.02153879962861538,-0.006875284016132355,-0.011752498336136341,0.01314507145434618,-0.008367674425244331,0.007084867917001247,-0.0036846366710960865,-0.010129139758646488,-0.017667923122644424,-0.019048461690545082,0.018498525023460388,0.0005847502034157515,0.0016664896393194795,-0.01310021709650755,0.0037341951392591,-0.010577796958386898,-0.010905494913458824,0.0003343669231981039,0.008415632881224155,0.005539721809327602,-0.015725841745734215,-0.0038444267120212317,-0.005169442389160395,0.001546605140902102,-0.007812931202352047,0.002882466185837984,0.004830508027225733,-0.006285156589001417,-0.009446782059967518,-0.009345403872430325,0.006668975111097097,-0.0033762194216251373,0.0002253939164802432,-0.0036491169594228268,0.0011890900786966085,-0.00657407334074378,-0.008681347593665123,0.0011249718954786658,0.0019340425496920943,0.002926906570792198,-0.007687493693083525,-0.0008031492470763624,-0.004335992969572544,-0.002299270126968622,-0.0038445868995040655,0.0017560188425704837,0.0032076342031359673,-0.004134634044021368,-0.004223490599542856,-0.005829730071127415,0.0011193564860150218,-0.003268501255661249,0.000652975810226053,-0.0007396028959192336,-0.0008084131986834109,-0.004153513349592686,-0.005943440366536379,0.0003205779939889908,-0.0013659180840477347,0.002345761051401496,-0.003506347071379423,-0.0000033793587590480456,-0.004449362400919199,-0.0027575171552598476,-0.0019290007185190916,-0.000022124550014268607,0.0019054794684052467,-0.0023787403479218483,-0.0008885047282092273]},{"frequency":191.5,"effects":[],"id":"wave-mvjcqo33-sp5h1ne","name":"ocarina","real":[0,0.00033026537857949734,0.0005242906627245247,-0.023173600435256958,-0.0003656843909993768,-0.0001834178256103769,-0.0001535804767627269,-0.0001886474492494017,-0.0003936768916901201,0.007752192672342062,0.0004907678230665624,0.000320817664032802,0.0002938413235824555,0.00033116326085291803,0.0005462401895783842,-0.004456293769180775,-0.000327212706906721,-0.00016995094483718276,-0.00014588635531254113,-0.00018512850510887802,-0.00040913536213338375,0.0032210643403232098,0.000448054721346125,0.0003036579873878509,0.00028251908952370286,0.0003233087481930852,0.0005549467750824988,-0.0022922425996512175,-0.00028090307023376226,-0.0001493874442530796,-0.00013109638530295342,-0.0001729964860714972,-0.0004107888089492917,0.0019207518780604005,0.0003989894757978618,0.0002802114759106189,0.0002646580687724054,0.00030722146038897336,0.0005495779332704842,-0.001410078490152955,-0.0002297259634360671,-0.00012335958308540285,-0.00011038851516786963,-0.00015310528397094458,-0.00039828079752624035,0.0012758247321471572,0.0003466429770924151,0.0002522800932638347,0.00024166624643839896,0.00028407046920619905,0.0005302622448652983,-0.0009143982897512615,-0.00017677960568107665,-0.000093846618256066,-0.00008532108768122271,-0.00012688654533121735,-0.0003721748071257025,0.0008818311034701765,0.00029408090631477535,0.0002219660673290491,0.0002153028326574713,0.0002555556711740792,0.0004980418016202748,-0.0005934883956797421,-0.0001249588531209156,-0.00006290178862400353,-0.00005776108446298167,-0.00009623026562621817,-0.00033391843317076564,0.0006166472448967397,0.00024402675626333803,0.00019132629677187651,0.00018747412832453847,0.0002237946173409,0.0004548306460492313,-0.00037163819069974124,-0.00007673599611734971,-0.00003248871871619485,-0.00002956889511551708,-0.00006334881618386135,-0.0002857611689250916,0.0004305564798414707,0.0001989011070691049,0.00016236782539635897,0.0001602052361704409,0.00019120254728477448,0.000403346901293844,-0.00021439527336042374,-0.000033966105547733605,-0.00000431254375143908,-0.0000025077990812860662,-0.000030336550480569713,-0.0002303944929735735,0.00029908912256360054,0.00016043272626120597,0.00013691159256268293,0.00013550840958487242,0.00016036746092140675,0.00034664259874261916,-0.00010309412755304947,0.0000021992905203660484,0.000020745043002534658,0.00002236112777609378,0.000001103418412640167,-0.00016996925114654005,0.00020889716688543558,0.0001309839281020686,0.00011718155292328447,0.0001164634304586798,0.0001353540865238756,0.0002916349039878696,-0.000021712921807193197,0.000037292902561603114,0.00005130370846018195,0.00005919825707678683,0.00006142696656752378,0.0000635944670648314,0.0000651069640298374,0.0000660400910419412,0.00006707242573611438,0.00006575677980436012,0.00006740650860592723,0.00006775465590180829,0.00006802887219237164,0.00006838519766461104,0.00006868795026093721,0.00006890376243973151,0.00006883170135552064],"imag":[0,-0.0018222002545371652,0.3993520736694336,0.40580418705940247,0.008577045053243637,0.004972331691533327,-0.04117627069354057,0.003583167912438512,0.004450960550457239,-0.04258093237876892,0.01522738765925169,-0.00010575015767244622,0.000032324973290087655,-0.00012340799730736762,-0.00916571356356144,0.016010617837309837,0.001978935906663537,0.0013954589376226068,0.006248466204851866,0.0012805641163140535,0.001765368739143014,-0.006807803176343441,-0.0036642400082200766,0.000011591527254495304,0.00006258097710087895,-0.00002045429755526129,0.001963292481377721,0.004556251689791679,0.0010012484854087234,0.0007523969397880137,-0.0011155455140396953,0.0007311359513550997,0.0010405683424323797,-0.0021592462435364723,0.0013179873349145055,0.00006487701466539875,0.00008889658056432381,0.00003631720392149873,-0.001359436078928411,0.001880032941699028,0.0005962169962003827,0.0004727626801468432,0.0013661397388204932,0.0004709314671345055,0.0006735001225024462,-0.0007707927725277841,-0.0007498213090002537,0.00009769309690454975,0.00010975889017572626,0.00007652080239495263,0.0005598621210083365,0.0008792398148216307,0.00037575411261059344,0.00031487835804000497,-0.0002632958348840475,0.00031522888457402587,0.0004381281032692641,-0.0002186476776842028,0.0005706303054466844,0.0001177625308628194,0.0001241940335603431,0.0001052825027727522,-0.00041684971074573696,0.00042428550659678876,0.00024221230705734342,0.00021561788162216544,0.0005822965176776052,0.00021246376854833215,0.00027009256882593036,0.000024381593902944587,-0.00021895638201385736,0.0001277746050618589,0.00013171348837204278,0.00012389212497510016,0.00039160330197773874,0.00020086612494196743,0.0001585783902555704,0.00015083829930517823,-0.00012828240869566798,0.00014270609244704247,0.00014505445142276585,0.0001283488963963464,0.0003774056094698608,0.00012949095980729908,0.00013255883823148906,0.00013294217933434993,-0.00007291187648661435,0.00009136206062976271,0.0001069448990165256,0.00010874365398194641,0.00030798889929428697,0.00009608327673049644,0.00005203543696552515,0.00016293104272335768,-0.00005676947330357507,0.00012467335909605026,0.00012755056377500296,0.0001335522683802992,0.00036899748374707997,0.00004255026578903198,0.00007680559065192938,0.00008275907021015882,-0.000083475599240046,0.000067382694396656,-0.000014296406334324274,0.0001625194272492081,0.00027407961897552013,0.00011740688933059573,0.00011933601490454748,0.00012880846043117344,0.00008539242116967216,0.000029790022381348535,0.00006576460145879537,0.00007364669727394357,0.00007512050069635734,0.0000770028491388075,0.00007744348840788007,0.00007763494068058208,0.00007673376967431977,0.00007616155198775232,0.00007675383676541969,0.00007548192661488429,0.0000746292935218662,0.00007354219997068867,0.0000732856206013821,0.00007238054240588099,0.00007161092798924074,0.00007078926864778623]},{"frequency":929.0000000000001,"effects":[],"id":"wave-mvjd4mj6-cz6amjz","name":"crystaldial","real":[0,0.035971034318208694,0.042489077895879745,0.06336957216262817,0.326625257730484,-0.053790971636772156,-0.015732888132333755,-0.004002789035439491,0.002678623655810952,0.008388244546949863,0.015559911727905273,0.029422761872410774,0.09020006656646729,-0.11178502440452576,-0.0360460989177227,-0.02175770327448845,-0.015673378482460976,-0.012325865216553211,-0.010277092456817627,-0.009066242724657059,-0.008989722467958927,0.01293154712766409,-0.0037496027071028948,-0.003986236173659563,-0.0038082811515778303,-0.003567732637748122,-0.0033291070722043514,-0.00310850259847939,-0.0029088177252560854,-0.002729577012360096,-0.00256890757009387,-0.002424687845632434,-0.0022950901184231043,-0.002178194932639599,-0.002072408329695463,-0.001976530998945236,-0.001889350009150803,-0.0018094185506924987,-0.001736668054945767,-0.0016698664985597134,-0.0016083455411717296,-0.001551697961986065,-0.0014993413351476192,-0.0014508909080177546,-0.0014059325912967324,-0.0013640846591442823,-0.0013252102071419358,-0.0012889071367681026,-0.0012550289975479245,-0.0012232738081365824,-0.001193518633954227,-0.001165617024526,-0.001139372237958014,-0.0011146316537633538,-0.0010914577869698405,-0.0010695017408579588,-0.0010486938990652561,-0.0010291991056874394,-0.001010651933029294,-0.0009930776432156563,-0.0009764208807609975,-0.0009605266386643052,-0.0009457715204916894,-0.0009313807240687311,-0.000917662400752306,-0.0009050755179487169,-0.000892694282811135,-0.0008809641585685313,-0.0008698683232069016,-0.0008593738311901689,-0.0008495337096974254,-0.0008421006496064365,-0.0008204613695852458,-0.0008178249117918313,-0.0008100519771687686,-0.0008020325331017375,-0.0007943214732222259,-0.0007867916719987988,-0.0007795028504915535,-0.0007724910974502563,-0.000764909666031599,-0.0007593424525111914,-0.0007530794246122241,-0.0007470195414498448,-0.0007412468548864126,-0.0007356909336522222,-0.0007302685407921672,-0.0007252460345625877,-0.0007211980991996825,-0.0007139378576539457,-0.0007098371861502528,-0.0007054069428704679,-0.0007010764675214887,-0.0006968383095227182,-0.0006926950300112367,-0.0006886866758577526,-0.0006846514879725873,-0.0006823028088547289,-0.0006778063834644854,-0.0006741812685504556,-0.0006707640131935477,-0.0006674013566225767,-0.0006641198415309191,-0.0006609621341340244,-0.0006577121093869209,-0.0006514276610687375,-0.0006528912344947457,-0.0006497748545370996,-0.0006469054496847093,-0.0006441849982365966,-0.0006414141389541328,-0.0006387059693224728,-0.0006355601362884045,-0.000629544083494693,-0.0006381444400176406,-0.0006324145360849798,-0.0006294973427429795,-0.0006271288148127496,-0.0006249394500628114,-0.0006228393176570535,-0.0006209961138665676,-0.0006183561636134982,-0.0006169140688143671,-0.0006151848938316107,-0.0006132785929366946,-0.0006116642034612596,-0.0006100141908973455,-0.0006083748303353786],"imag":[0,0.008359271101653576,0.5114589333534241,0.049638811498880386,0.3859546482563019,-0.09722564369440079,-0.048968177288770676,-0.03512166440486908,-0.028972962871193886,-0.026182731613516808,-0.025920385494828224,-0.029769420623779297,-0.05569443106651306,0.03782682865858078,0.0042734830640256405,-0.0015203200746327639,-0.003837037133052945,-0.005213103722780943,-0.006466339807957411,-0.00837225653231144,-0.013951847329735756,0.09555739909410477,0.005231222603470087,0.0011603385210037231,-0.00022902028285898268,-0.0008974258089438081,-0.001268940046429634,-0.0014904580311849713,-0.0016268788604065776,-0.0017099448014050722,-0.001759377308189869,-0.001785959117114544,-0.0017963008722290397,-0.0017956370720639825,-0.0017869716975837946,-0.001772564952261746,-0.0017540680710226297,-0.001732517033815384,-0.001709006610326469,-0.001684074872173369,-0.00165811856277287,-0.001631657825782895,-0.0016049167606979609,-0.001578057650476694,-0.0015513105317950249,-0.0015248445561155677,-0.0014985577436164021,-0.0014727043453603983,-0.0014472112525254488,-0.0014222717145457864,-0.00139779900200665,-0.001373798819258809,-0.0013503405498340726,-0.001327362610027194,-0.0013049972476437688,-0.001283090328797698,-0.001261561643332243,-0.0012408255133777857,-0.0012204336235299706,-0.0012004842283204198,-0.0011810933938249946,-0.0011621688026934862,-0.001143478904850781,-0.0011254748096689582,-0.001107867225073278,-0.0010905253002420068,-0.0010737670818343759,-0.0010572226019576192,-0.0010411700932309031,-0.001025462057441473,-0.0010096633341163397,-0.0009947995422407985,-0.0009812714997678995,-0.0009663283708505332,-0.0009522231994196773,-0.0009384600562043488,-0.0009250047733075917,-0.0009119384922087193,-0.0008989740163087845,-0.0008864979608915746,-0.0008798607159405947,-0.0008614429971203208,-0.0008497392991557717,-0.0008381732041016221,-0.0008267845842055976,-0.0008156299591064453,-0.0008046801085583866,-0.000793994462583214,-0.0007838502642698586,-0.0007725083851255476,-0.0007625875296071172,-0.0007526641129516065,-0.0007428754470311105,-0.0007332689128816128,-0.0007238449179567397,-0.0007145995041355491,-0.0007057032198645175,-0.0006947445217519999,-0.0006871261866763234,-0.0006785566220059991,-0.0006699964869767427,-0.0006615981110371649,-0.000653291994240135,-0.0006450737710110843,-0.0006368380272760987,-0.000625081651378423,-0.000622366089373827,-0.0006143785431049764,-0.0006066901260055602,-0.0005993188242428005,-0.0005920644616708159,-0.0005849216831848025,-0.0005781821091659367,-0.0005730314878746867,-0.0005605666083283722,-0.0005556942778639495,-0.0005490775220096111,-0.0005426206043921411,-0.0005361650255508721,-0.0005296349991112947,-0.0005233432166278362,-0.0005172475939616561,-0.0005109281628392637,-0.0005047877784818411,-0.0004987225402146578,-0.0004927243571728468,-0.000486843753606081,-0.00048094571684487164]},{"frequency":289.5,"effects":[{"type":"wah","enabled":true,"mix":0.55,"rate":3.2,"frequency":950},{"type":"echo","enabled":true,"mix":0.42,"time":0.15,"feedback":0.37},{"type":"chorus","enabled":true,"mix":0.8,"rate":5,"depth":0.006}],"id":"wave-mvjdtcln-bwbkcg0","name":"rogoajofofogor","real":[0,0.06692954152822495,0.49230125546455383,0.008462803438305855,0.07644382864236832,0.029608240351080894,0.048940591514110565,0.014558269642293453,0.08667007833719254,-0.027538906782865524,0.06219243258237839,-0.012672800570726395,0.039640747010707855,-0.017530400305986404,0.006394575349986553,-0.023800643160939217,0.008500545285642147,-0.025579731911420822,0.02282562106847763,-0.022470524534583092,0.015508019365370274,-0.016770148649811745,0.00032661695149727166,-0.011799384839832783,0.002850855467841029,-0.008693132549524307,0.014130549505352974,-0.005262649618089199,0.01315829437226057,-0.0002279158215969801,0.002877347869798541,0.0016164049739018083,0.0010884565999731421,0.0010921683860942721,0.00581698352470994,0.0011623005848377943,0.004348656162619591,0.0025617368519306183,-0.002501856070011854,0.0028541753999888897,-0.0044644963927567005,0.0017213765531778336,-0.0010694025550037622,0.0016069542616605759,-0.0013047727989032865,0.0030312545131891966,-0.004299180582165718,0.0035027319099754095,-0.004200898110866547,0.0026034207548946142,-0.001488097128458321,0.002082069171592593,-0.0018331286264583468,0.0026014980394393206,-0.003991499077528715,0.0026473100297152996,-0.003009156323969364,0.000686491490341723,-0.0010708741610869765,0.0003064593765884638,-0.0018984087510034442,0.00048569022328592837,-0.003591950051486492,0.00002859743472072296,-0.0017697877483442426,-0.0006711824098601937,0.0009077594731934369,-0.0009307409054599702,-0.0000813299193396233,-0.00019228454038966447,-0.0020570133347064257,-0.00015798612730577588,0.0005247456720098853,-0.0008427187567576766,0.0025872138794511557,-0.0014470251044258475,-0.0001557353971293196,-0.000953255279455334,-0.00024107626813929528,-0.0009538469603285193,0.0010804972844198346,-0.0016933911247178912,0.0012706685811281204,-0.0018153081182390451,0.00016195967327803373,-0.0014082302805036306,-0.00020169245544821024,-0.0011997307883575559,0.0006981409969739616,-0.001487775589339435,0.000980535987764597,-0.0014986464520916343,0.00012613079161383212,-0.0010433950228616595,-0.0002597310522105545,-0.000804843963123858,0.00032316273427568376,-0.0010632944758981466,0.0004005430091638118,-0.0011675675632432103,-0.0003553481656126678,-0.0007850135443732142,-0.0007393379346467555,-0.0005422846297733486,-0.0002985179889947176,-0.0007107025012373924,-0.00017166975885629654,-0.0007342050084844232,-0.0007055038004182279,-0.00031500059412792325,-0.0009252658346667886,-0.00004206789526506327,-0.0005394731415435672,-0.00018060419824905694,-0.0004099536454305053,-0.00027855182997882366,-0.000855894002597779,-8.274551532849728e-7,-0.0010689693735912442,0.00015714163600932807,-0.0007796044228598475,-0.00007210222247522324,-0.0006647465634159744,-0.00022593620815314353,-0.0009825292509049177,-0.00002827681601047516,-0.0010846421355381608,0.0001299824216403067],"imag":[0,0.03630046546459198,0.6324998140335083,-0.03285511955618858,0.3124786615371704,-0.068800188601017,0.044246651232242584,-0.03333519026637077,0.001545180450193584,-0.041297733783721924,0.0042460146360099316,-0.04384218528866768,0.013157854788005352,-0.02551751397550106,-0.0001619211252545938,-0.01671532355248928,-0.021764950826764107,-0.008389565162360668,-0.012883736751973629,-0.0029104165732860565,0.0052791484631598,0.0032519397791475058,0.0024877393152564764,0.007941196672618389,-0.010376673191785812,0.009811912663280964,-0.009970622137188911,0.0074854460544884205,-0.0012269854778423905,0.005995046813040972,-0.0026770068798214197,0.006153668276965618,-0.011689350940287113,0.004655548837035894,-0.012353772297501564,0.002071168040856719,-0.006395501084625721,0.000892339856363833,-0.0048527708277106285,0.0016999577637761831,-0.008422832936048508,0.001641361159272492,-0.007532994728535414,0.00015382483252324164,-0.002826728392392397,-0.000591783260460943,-0.0017909008311107755,-0.00004912749500363134,-0.0037025362253189087,-0.0004745906626340002,-0.003003858495503664,-0.002007128670811653,-0.0001368721277685836,-0.003164995461702347,-0.0005113082006573677,-0.00248569343239069,-0.002065657638013363,-0.002377215074375272,-0.0005904767895117402,-0.004032599739730358,0.0017465663840994239,-0.00361805222928524,0.0010171395260840654,-0.0028622252866625786,-0.000568688556086272,-0.002131545450538397,0.001124572241678834,-0.0024494139943271875,0.003399267792701721,-0.0024784356355667114,0.0013873850693926215,-0.0018852492794394493,-0.0011816605692729354,-0.0016800947487354279,0.0013182536931708455,-0.0020516137592494488,0.001357140252366662,-0.002311272546648979,-0.0008351040887646377,-0.0014441830571740866,-0.0011544511653482914,-0.0011641649762168527,-0.00015542305482085794,-0.0013739301357418299,0.00007634602661710232,-0.0012053651735186577,-0.0009975904831662774,-0.0005822467501275241,-0.0014075444778427482,-0.00025182549143210053,-0.0006699500372633338,-0.0005085915327072144,-0.00048484126455150545,-0.0005550503847189248,-0.0013662357814610004,-0.00017219567962456495,-0.0017145713791251183,0.00005490758121595718,-0.0011127054458484054,-0.00020552441128529608,-0.0008787003462202847,-0.00027827947633340955,-0.0014058280503377318,0.00009556270379107445,-0.0015681524528190494,0.0003213300078641623,-0.0009668211569078267,0.00007094859756762162,-0.0007123274845071137,-0.00008311759302159771,-0.0011029703309759498,0.00012998034071642905,-0.0012470026267692447,0.00020793415023945272,-0.0008003750699572265,-0.00012033664825139567,-0.0005923189455643296,-0.0003724223643075675,-0.0008906751754693687,-0.00020832465088460594,-0.0009561019251123071,-0.00012708210851997137,-0.0005263892817310989,-0.0003800505364779383,-0.0002813475439324975,-0.0005757295293733478,-0.0004714464012067765,-0.0004134786722715944]},{"frequency":53.74495056877585,"effects":[{"type":"wah","enabled":true,"mix":0.34,"rate":2,"frequency":2980}],"id":"wave-mvjib00v-v955rjv","name":"nohedidnt","real":[0,-0.022111915051937103,-0.17684710025787354,-0.1329316943883896,0.06280841678380966,0.09381835162639618,-0.03696570545434952,-0.032488130033016205,0.147273987531662,0.15390807390213013,-0.0075842165388166904,-0.10302633047103882,0.08651720732450485,-0.013124450109899044,-0.05240827426314354,-0.041446052491664886,0.03740580007433891,0.0573587529361248,-0.004109113942831755,0.07465372234582901,0.05994774401187897,-0.07739829272031784,-0.006368816364556551,0.048725660890340805,0.03272628039121628,-0.06695154309272766,-0.03017621487379074,0.019783619791269302,-0.03452588990330696,-0.04611755162477493,-0.008551182225346565,-0.028851959854364395,-0.025388233363628387,0.006779230199754238,0.059288833290338516,0.01650048978626728,0.0014217480784282088,-0.0020291474647819996,0.011156806722283363,-0.016606144607067108,-0.008219041861593723,0.027651745826005936,0.019773384556174278,0.010936805978417397,0.013317854143679142,0.006303738337010145,0.02385529689490795,-0.014276674948632717,0.011060593649744987,-0.006798185873776674,-0.010426628403365612,0.014244518242776394,0.007223978638648987,0.012234647758305073,-0.004570686724036932,-0.041795339435338974,0.00685077952221036,-0.00829531904309988,0.016844527795910835,-0.005870535038411617,-0.00556101743131876,0.005937935318797827,-0.010292516089975834,-0.005948209669440985,0.006778891663998365,-0.013909188099205494,-0.006819650065153837,-0.0018482754239812493,0.02578098326921463,0.006098906975239515,0.009486842900514603,0.006559779867529869,0.013183719478547573,-0.014711618423461914,-0.004948663990944624,0.015296028926968575,0.002010402735322714,-0.0019034647848457098,0.003613134380429983,-0.0025799861177802086,0.0158504918217659,-0.005244839005172253,0.024308238178491592,-0.0006822410505264997,-0.013331545516848564,0.008294038474559784,0.0020523262210190296,0.008997435681521893,-0.0028731338679790497,-0.015060176141560078,0.010943576693534851,-0.009704888798296452,0.011138183064758778,0.0029836276080459356,-0.0038444120436906815,-0.000125832375488244,-0.00347310584038496,0.007001427933573723,0.006052924320101738,-0.006132421549409628,0.003834588686004281,-0.004903435707092285,0.0015178624307736754,-0.0016205855645239353,0.00432652747258544,0.002491182181984186,0.009265734814107418,0.0009890621295198798,0.002817324595525861,0.006666197441518307,0.003051891690120101,0.00030606385553255677,-0.0018527910578995943,-0.0015497190179303288,0.006309742573648691,-0.0022883096244186163,0.017698047682642937,0.004028856288641691,-0.005875889211893082,0.0024741326924413443,0.0020198074635118246,0.003675927175208926,-0.0036901137791574,-0.0031795790418982506,0.006987506058067083,-0.007982057519257069,0.005669635254889727,0.003942364826798439],"imag":[0,0.13085220754146576,-0.184441938996315,0.11118247359991074,-0.03948722034692764,0.08631960302591324,0.02595105953514576,0.1693830043077469,-0.36417385935783386,0.014064905233681202,-0.0016870397375896573,0.045038238167762756,0.3485987186431885,0.17122496664524078,0.01457004901021719,0.06405885517597198,0.020579122006893158,0.16139747202396393,-0.10139545053243637,0.09482438117265701,-0.00386446644552052,-0.06296507269144058,0.13249295949935913,0.06293211132287979,-0.034849897027015686,-0.007024076767265797,-0.0105357700958848,0.02035469003021717,-0.04213858023285866,0.046031732112169266,0.012214086018502712,-0.024332448840141296,0.015210977755486965,0.02041737549006939,-0.013670737855136395,0.026956984773278236,0.026396825909614563,0.0004765594203490764,-0.00437441049143672,0.016018981114029884,-0.010087661445140839,0.01666094735264778,-0.0035484510008245707,-0.0003986117080785334,-0.02402479201555252,0.009663901291787624,0.03542540967464447,0.00011265938519500196,0.013803115114569664,0.01245875470340252,-0.003191698808223009,0.03349350392818451,0.0067747971042990685,0.009109839797019958,-0.007091859355568886,-0.008721481077373028,0.004964830819517374,0.004865027964115143,0.012331523001194,0.006671512965112925,0.0038988341111689806,0.03126289322972298,0.0005110450438223779,-0.005551480688154697,0.007660679053515196,-0.0015973522095009685,-0.01493146177381277,0.0031500328332185745,0.008108699694275856,-0.004448581486940384,-0.0016524503007531166,0.0159185528755188,-0.0035952511243522167,-0.019776955246925354,0.008095710538327694,0.01406934391707182,-0.004617821890860796,0.007159966975450516,0.007917845621705055,0.0008942548302002251,0.003566967323422432,0.006859151646494865,0.0005843265098519623,-0.0003738404484465718,0.01165663544088602,0.016475608572363853,0.010605515912175179,0.011245952919125557,0.0002762732619885355,-0.004964425228536129,0.008519405499100685,0.0030816555954515934,-0.007230720948427916,0.0034852330572903156,0.010872229002416134,0.00557671207934618,0.004963656887412071,0.004182454664260149,-0.0009856849210336804,-0.008244791999459267,0.0027670585550367832,0.003163548419252038,-0.002275757724419236,-0.00021006868337281048,0.0001156021753558889,0.001386633375659585,0.0029385362286120653,-0.004592048469930887,0.002223395509645343,0.004876899532973766,0.006772652268409729,-0.00259874714538455,0.007173200137913227,0.00919963326305151,-0.004108755383640528,0.0012362214038148522,0.006270671263337135,-0.004431812092661858,-0.001292817760258913,0.0087582441046834,0.014483194798231125,-0.007828978821635246,0.002864397829398513,0.010386083275079727,0.00005372622035793029,0.0007812565308995545,0.0035257551353424788,-0.0012998903403058648]},{"frequency":183,"effects":[{"type":"wah","enabled":true,"mix":0.34,"rate":2,"frequency":2980}],"id":"wave-mvjjinp0-6qu72jy","name":"winwinwinwinwinw","real":[0,-0.008487439714372158,0.820299506187439,0.0016406094655394554,0.002295069396495819,0.001161057036370039,-0.35545068979263306,-0.008146507665514946,-0.006451969500631094,-0.008685757406055927,0.11449860781431198,0.0020725170616060495,0.0022579834330826998,0.0006401212885975838,-0.17766173183918,-0.007677804213017225,-0.00626404071226716,-0.008732154965400696,0.042882829904556274,0.0024528480134904385,0.0021857821848243475,0.00008702281047590077,-0.11817889660596848,-0.007101162802428007,-0.0059589906595647335,-0.00862446241080761,0.023267529904842377,0.002780111273750663,0.0020830894354730844,-0.0004868928517680615,-0.0807889774441719,-0.0064422329887747765,-0.005548066925257444,-0.008365279994904995,0.0196010023355484,0.0030516500119119883,0.001954766223207116,-0.001068896846845746,-0.052021995186805725,-0.005728764925152063,-0.005041251424700022,-0.00795519258826971,0.02186265029013157,0.003243675222620368,0.0018275972688570619,-0.0016225693980231881,-0.0289456844329834,-0.00493191834539175,-0.004480668809264898,-0.00741873774677515,0.025674501433968544,0.0034253436606377363,0.0016699625412002206,-0.0021634779404848814,-0.01088239997625351,-0.004140697419643402,-0.0038643255829811096,-0.00677464297041297,0.028847891837358475,0.0035675561521202326,0.001505239401012659,-0.002659296151250601,0.0025291931815445423,-0.0033617897424846888,-0.0032171302009373903,-0.006039554253220558,0.03045583888888359,0.003682731883600354,0.0013389133382588625,-0.0030974573455750942,0.01179086696356535,-0.0026132373604923487,-0.002557351952418685,-0.005235686432570219,0.030328946188092232,0.003779076039791107,0.0011762112844735384,-0.003466346999630332,0.01757236383855343,-0.0019098860211670399,-0.001902808086015284,-0.004386528395116329,0.02868782728910446,0.003864323254674673,0.0010215053334832191,-0.0037572206929326057,0.020577983930706978,-0.001261817291378975,-0.0012689469149336219,-0.0035142265260219574,0.025872550904750824,0.003944475203752518,0.0008775377064011991,-0.0039646136574447155,0.021427065134048462,-0.0006736188661307096,-0.0006684671971015632,-0.0026394587475806475,0.022193511947989464,0.004023642744868994,0.0007459997432306409,-0.004086772445589304,0.020613230764865875,-0.00014523955178447068,-0.000110889486677479,-0.0017801349749788642,0.01790127158164978,0.004103417042642832,0.0006271511665545404,-0.004125678911805153,0.018544089049100876,0.0003276288043707609,0.00039767392445355654,-0.0009507150389254093,0.013232989236712456,0.004182685166597366,0.0005202320171520114,-0.004086293745785952,0.015616522170603275,0.0007524655666202307,0.0008543090661987662,-0.00016175252676475793,0.008474808186292648,0.004257990512996912,0.000423704506829381,-0.003976285923272371,0.0122713977470994,0.0011390740983188152],"imag":[0,-0.0017788943368941545,-0.023215018212795258,0.004972654394805431,-0.00010142039536731318,-0.005137190688401461,0.04038337618112564,0.0027264151722192764,0.0008250625687651336,-0.0007754851831123233,-0.006306386552751064,0.004756739363074303,-0.0002999576972797513,-0.005239774007350206,0.05558529123663902,0.0035930699668824673,0.0016272116918116808,0.0002568125200923532,0.00822755042463541,0.004500087350606918,-0.0004866757954005152,-0.005270741879940033,0.06695974618196487,0.004358147270977497,0.0023846449330449104,0.001290244865231216,0.018822243437170982,0.004211504943668842,-0.0006542439805343747,-0.005220678169280291,0.0733812227845192,0.005003327503800392,0.0030776935163885355,0.0022973918821662664,0.024741699919104576,0.0038953754119575024,-0.0007924240198917687,-0.005084204953163862,0.07461782544851303,0.005507353227585554,0.003699755994603038,0.0032523407135158777,0.0261163879185915,0.0035010019782930613,-0.0008582210866734385,-0.004825538024306297,0.07130557298660278,0.006031272001564503,0.004189320839941502,0.00412371102720499,0.023794973269104958,0.0032198340632021427,-0.0009619377669878304,-0.004513281397521496,0.06451023370027542,0.006350630894303322,0.00459754653275013,0.004905258771032095,0.018963785842061043,0.0029322090558707714,-0.0010345694608986378,-0.004122038371860981,0.05561010167002678,0.006545418873429298,0.004906401038169861,0.005577069241553545,0.012858274392783642,0.002653965726494789,-0.0010795046109706163,-0.0036601789761334658,0.045840878039598465,0.006633162498474121,0.005114661529660225,0.006129862274974585,0.006491165142506361,0.00238796672783792,-0.0011006536660715938,-0.003139805980026722,0.036136746406555176,0.006631499622017145,0.005226707551628351,0.006558943539857864,0.0005400375230237842,0.0021327505819499493,-0.0011015317868441343,-0.0025750489439815283,0.027088934555649757,0.006558575667440891,0.005250310059636831,0.00686459057033062,-0.004623166751116514,0.0018847075989469886,-0.0010863032657653093,-0.0019818549044430256,0.019022157415747643,0.006433081813156605,0.005195949226617813,0.007051652297377586,-0.008820309303700924,0.0016384380869567394,-0.0010594407794997096,-0.0013763024471700191,0.01211855374276638,0.006272612605243921,0.005075526423752308,0.007128632161766291,-0.011946522630751133,0.001387709635309875,-0.00102508463896811,-0.0007739783031865954,0.006515425629913807,0.006092485040426254,0.004901987966150045,0.007106841541826725,-0.013903288170695305,0.0011260577011853456,-0.0009868218330666423,-0.00018905580509454012,0.002334914170205593,0.005905153229832649,0.004688243381679058,0.006999002769589424,-0.014606245793402195,0.0008479754324071109,-0.0009474120452068746,0.0003663861134555191,-0.0003547559608705342,0.0057195695117115974]},{"frequency":131.5,"effects":[],"id":"wave-mwcpabnh-a1q1m47","name":"Wander 263 + 309 Hz","real":[0,0.20477667450904846,0.5509438514709473,-0.17628753185272217,0.025354856625199318,-0.23191428184509277,-0.0591372512280941,-0.011874464340507984,-0.011961273849010468,0.03424297645688057,-0.05159512534737587,-0.025952689349651337,-0.01852506212890148,-0.01455801259726286,-0.011982535012066364,-0.01014791615307331,-0.008767493069171906,-0.007691120263189077,-0.006829330697655678,-0.006127936765551567,-0.0055371536873281,-0.005047081504017115,-0.004623604007065296,-0.004267300479114056,-0.003956956788897514,-0.0036858473904430866,-0.003449289361014962,-0.003235277719795704,-0.0030494509264826775,-0.002882695058360696,-0.0027332818135619164,-0.0025979545898735523,-0.0024767713621258736,-0.002364180516451597,-0.0022708778269588947,-0.0021776952780783176,-0.002097741002216935,-0.0020184158347547054,-0.0019460385665297508,-0.0018835075898095965,-0.0018238291377201676,-0.001767920097336173,-0.0017169539351016283,-0.0016692832577973604,-0.001625371864065528,-0.001584355835802853,-0.0015461439033970237,-0.0015106459613889456,-0.0014773256843909621,-0.001446454436518252,-0.001417503459379077,-0.0013907140819355845,-0.001365451025776565,-0.0013425330398604274,-0.0013208284508436918,-0.0013016355223953724,-0.0012834201334044337,-0.0012674083700403571,-0.0012529788073152304,-0.0012408887268975377,-0.0012318153167143464,-0.0012261688243597746,-0.0012258989736437798,-0.001235361909493804,-0.0012674074387177825,-0.0013938922202214599,-0.0003218259662389755,-0.001080708228982985,-0.0016398143488913774,-0.0011507794260978699,-0.0017624308820813894,-0.00011410826118662953,-0.0006843139999546111,-0.0004146718711126596,-0.0007102114032022655,-0.0007247093599289656,-0.0006877224077470601,-0.00046048019430600107,-0.0012109383242204785,-0.0008911728509701788,-0.0011774186277762055,-0.0007954649045132101,-0.00030903180595487356,-0.000931840855628252,-0.0005372790619730949,-0.0016278598923236132,-0.001134634716436267,-0.001040555303916335,-0.0009970447281375527,-0.0009705371921882033,-0.0009518886217847466,-0.0009376650559715927,-0.0009261394152417779,-0.0009169558179564774,-0.0009102094336412847,-0.0008962865103967488,-0.000891728384885937,-0.0008841773960739374,-0.0008806157275103033,-0.0008778960909694433,-0.0008695648284628987,-0.000866426678840071,-0.0008585448376834393,-0.0008559650741517544,-0.0008520410628989339,-0.0008480705437250435,-0.0008432245231233537,-0.000841825210954994,-0.000837202649563551,-0.0008396420162171125,-0.0008340897038578987,-0.000831088051199913,-0.0008272174745798111,-0.000821704335976392,-0.0008242756011895835,-0.0008208775543607771,-0.000817699998151511,-0.0008153964299708605,-0.0008132391376420856,-0.0008109991322271526,-0.0008090167539194226,-0.0008065836154855788,-0.0008047654409892857,-0.000802521244622767,-0.0008008814766071737,-0.000798901601228863,-0.000797453336417675,-0.0007956965127959847],"imag":[0,0.03378493711352348,0.2690248489379883,-0.1656806915998459,-0.1212415099143982,0.11239781975746155,0.005393247120082378,0.11177564412355423,-0.00790222268551588,0.007491045631468296,-0.01881389319896698,-0.012813354842364788,-0.010459684766829014,-0.00914941169321537,-0.009356620721518993,-0.007548514753580093,-0.006985425483435392,-0.00651265773922205,-0.005433736834675074,-0.005755512043833733,-0.005439009051769972,-0.005160798784345388,-0.005364998243749142,-0.004685970488935709,-0.004485092591494322,-0.0042905970476567745,-0.003794871736317873,-0.003956444561481476,-0.0038087686989456415,-0.0036712787114083767,-0.003785952227190137,-0.0034208691213279963,-0.0033122587483376265,-0.003206613240763545,-0.0029205537866801023,-0.003016549162566662,-0.0029242592863738537,-0.002843650057911873,-0.0029121560510247946,-0.0026919355150312185,-0.002620708430185914,-0.00255306507460773,-0.0023642440792173147,-0.0024275488685816526,-0.002368710469454527,-0.002312896540388465,-0.0023624468594789505,-0.002207217738032341,-0.0021575307473540306,-0.002110033994540572,-0.0019760592840611935,-0.0020199392456561327,-0.001977133098989725,-0.0019361604936420918,-0.001971775433048606,-0.0018574646674096584,-0.0018198920879513025,-0.0017827675910666585,-0.0016813684487715364,-0.0017109067412093282,-0.0016754490789026022,-0.0016385730123147368,-0.0016567419515922666,-0.0015526092611253262,-0.0014845579862594604,-0.0013035584706813097,-0.002691179048269987,-0.0018271428998559713,-0.002651512622833252,-0.0013356070267036557,-0.0014394139871001244,-0.0013438211753964424,-0.0012815042864531279,-0.001955929212272167,-0.00139719492290169,-0.0013859213795512915,-0.001363285700790584,-0.0013737593544647098,-0.0012955382699146867,-0.001328617101535201,-0.00024460264830850065,-0.00103656854480505,-0.000591834366787225,-0.0013770044315606356,-0.0013536231126636267,-0.0009747248259373009,-0.0011213172692805529,-0.0010944410460069776,-0.001084603019990027,-0.001073705148883164,-0.0010331460507586598,-0.0010477222967892885,-0.0010337495477870107,-0.0010204450227320194,-0.0010323426686227322,-0.0009940210729837418,-0.0009810230694711208,-0.0009727068245410919,-0.0009336368530057371,-0.0009472827659919858,-0.0009302406688220799,-0.0009185877279378474,-0.0009292361792176962,-0.0008955025114119053,-0.0008842179668135941,-0.0008725575753487647,-0.0008405210683122277,-0.0008520830888301134,-0.0008414997137151659,-0.0008287393720820546,-0.0008376758196391165,-0.0008045817958191037,-0.0007985704578459263,-0.0007868576794862747,-0.0007632062770426273,-0.0007704140152782202,-0.0007611410110257566,-0.0007515449542552233,-0.0007590866298414767,-0.0007333423127420247,-0.0007245289161801338,-0.0007153638289310038,-0.0006913062534295022,-0.0006980634061619639,-0.0006895679980516434,-0.0006811680505052209,-0.0006872970843687654,-0.0006647726404480636]},{"frequency":227.5,"effects":[],"id":"wave-mwcpakwr-2zipkm7","name":"Wander 455 + 472 Hz","real":[0,0.07741737365722656,0.5364609360694885,0.017979515716433525,0.2332170605659485,-0.022629447281360626,0.03565202280879021,-0.0037962847854942083,0.005524525418877602,0.022118590772151947,0.07138600200414658,-0.004378096666187048,0.06785505264997482,-0.05803291127085686,0.017278699204325676,-0.06856900453567505,-0.03564701974391937,-0.025023842230439186,-0.024971218779683113,0.013396701775491238,-0.009658612310886383,0.00720444368198514,0.002573274774476886,-0.013296098448336124,-0.007417932618409395,-0.0038955986965447664,-0.0011636815033853054,0.02698393538594246,-0.0021345268469303846,0.03785942867398262,-0.00015553817502222955,0.01774834468960762,-0.00756853399798274,-0.0039788223803043365,-0.0018359081586822867,-0.00486358068883419,-0.0014634280232712626,0.003914559260010719,-0.0026829398702830076,0.0029644472524523735,-0.010461762547492981,-0.006387106608599424,-0.005714569240808487,-0.01032333169132471,0.0025982530787587166,-0.005419803783297539,0.00863154698163271,0.00001236110256286338,0.003934623673558235,0.0007664549630135298,0.0003682642709463835,-0.0003770589246414602,0.00117732014041394,-0.00037637073546648026,0.004374264273792505,-0.000049851507355924696,0.003003522986546159,-0.00043602820369414985,-0.0004519751528277993,-0.000606581917963922,-0.0020158353727310896,-0.00018353134510107338,-0.0010208518942818046,0.00002300951018696651,-0.00016854390560183674,-0.00011597651609918103,-0.00011748354882001877,-0.00005892667832085863,0.00011810009164037183,-0.0001854329602792859,0.000473849504487589,-0.0010334146209061146,-0.00009238130587618798,-0.0015792388003319502,-0.0007131197489798069,-0.0006868455093353987,-0.0008489344618283212,0.0004614321806002408,-0.00012159250763943419,0.000022501521016238257,-0.0002907494199462235,-0.0010424669599160552,-0.00006975625728955492,-0.00015819711552467197,-0.0001771429815562442,0.002373653696849942,0.00022753940720576793,0.003295265370979905,-0.0008476529037579894,0.001352406688965857,-0.0009151416597887874,-0.0007627102895639837,-0.000866588787175715,-0.0006805373122915626,-0.00022793807147536427,-0.000453653687145561,-0.00044134657946415246,-0.00042378800571896136,-0.00041989164310507476,-0.00039746484253555536,-0.00039781921077519655,-0.0003792581846937537,-0.0003742458939086646,-0.0003647466655820608,-0.00035532109905034304,-0.00034965036320500076,-0.00034360980498604476,-0.00033661650377325714,-0.0003353689389768988,-0.00032967975130304694,-0.0003250053559895605,-0.000323642190778628,-0.0003104365023318678,-0.0003099037567153573,-0.0002972968795802444,-0.0002915493678301573,-0.0002916640951298177,-0.00028129247948527336,-0.00029035221086815,-0.000281766609987244,-0.00028388487407937646,-0.00027993781259283423,-0.0002720712509471923,-0.0002686043444555253,-0.00026726003852672875,-0.0002581969019956887,-0.00027470727218315005,-0.00025961254141293466],"imag":[0,0.01718570850789547,0.2923494875431061,0.013887264765799046,0.26131966710090637,-0.0431976318359375,0.13138805329799652,-0.08334720134735107,-0.0657455250620842,-0.05374852940440178,-0.08894635736942291,0.003939972724765539,-0.047397028654813766,0.01834692806005478,0.0033467570319771767,-0.008916101418435574,-0.015130438841879368,-0.01581474393606186,-0.025361260399222374,0.021145647391676903,-0.019584456458687782,0.05486784875392914,0.0043321652337908745,0.0421026237308979,0.006933009717613459,0.00416783569380641,0.0032533113844692707,-0.011265325360000134,-0.0004488791455514729,0.0016006650403141975,-0.00031451330869458616,0.009276124648749828,-0.004710588604211807,-0.004973729141056538,-0.007124227937310934,-0.021114015951752663,-0.00018566676590126008,-0.01836738921701908,0.007749021984636784,-0.003982929978519678,0.00836501270532608,0.00334593141451478,0.0013564444379881024,0.0005329556879587471,0.001067180885002017,-0.0021276152692735195,0.005345996469259262,0.0001776926510501653,0.00808127224445343,0.0027795543428510427,0.0017209494253620505,0.0021628604736179113,-0.003792249131947756,0.0004762214666698128,-0.004576818086206913,0.00002075816155411303,-0.0008998267003335059,0.00012222540681250393,-0.00010564056719886139,-0.00006818012479925528,-0.0008970446651801467,0.00002552804107835982,-0.0012568350648507476,0.0004097362980246544,-0.00024530195514671504,0.0003330935142003,0.00018282720702700317,0.000010569508049229626,-0.0002728283579926938,0.00016733443771954626,-0.000054191510571399704,0.0003217935445718467,-0.000013002767445868813,-0.00019843550398945808,-0.00004193337736069225,-0.00030674453591927886,-0.0007490905118174851,0.0012330234749242663,-0.00013958766066934913,0.002975283656269312,0.000169736536918208,0.002439782489091158,0.000491979590151459,0.00022852265101391822,0.00002181366471631918,-0.0005812373710796237,0.0003398721164558083,0.0006949175149202347,0.00003197386104147881,0.0012727933935821056,-0.0005153515958227217,-0.0004528928257059306,-0.0006962199113331735,-0.0021523137111216784,0.0011592198861762881,0.00042408891022205353,0.00025087237008847296,0.00017112825298681855,0.00012832839274778962,0.00009696583583718166,0.00007268910849234089,0.00005960726412013173,0.00004273416197975166,0.000034212658647447824,0.000028169379220344126,0.000017488297089585103,0.000019405391867621802,0.000010399554412288126,0.000009781964763533324,0.000006755441063432954,-0.000001299201358051505,-0.0000016290299527099705,-0.000009652948392613325,-0.00001168499693449121,-0.000011833932148874737,-0.000014694916899316013,-0.000013349560504138935,-0.000011683841876219958,-0.000021696474505006336,-0.000015452476873178966,-0.000034160293580498546,-0.00002992077133967541,-0.000038303140172502026,-0.000041495251934975386,-0.00003075332278967835,-0.00003958539309678599,-0.000025015187929966487,-0.00003224443207727745]},{"frequency":528.5,"effects":[],"id":"wave-mwcpapr4-6go0aup","name":"Wander 1,073 + 1,057 Hz","real":[0,0.002126116305589676,0.12515950202941895,0.0012840153649449348,0.0017630303045734763,0.0024844396393746138,0.12099707871675491,0.00012726490967907012,0.0012368785683065653,0.0023280680179595947,0.11310850828886032,-0.0010793583933264017,0.0005198933649808168,0.0017613675445318222,0.10228202491998672,-0.002052217023447156,-0.00020103395218029618,0.0009809781331568956,0.08951430767774582,-0.002570531563833356,-0.00075584149453789,0.00020746004884131253,0.07584334909915924,-0.0025409325025975704,-0.0010392346885055304,-0.00038077650242485106,0.06220166012644768,-0.0020209699869155884,-0.0010336153209209442,-0.0006900818552821875,0.04932123422622681,-0.0011837471975013614,-0.0008020318346098065,-0.0007208371534943581,0.03770016133785248,-0.00026669781072996557,-0.0004472679574973881,-0.0005357370828278363,0.027638085186481476,0.0005398897919803858,-0.00002315064557478763,-0.00010972442396450788,-0.0001361180911771953,-0.0001487324043409899,-0.00015191375860013068,-0.0001512453891336918,-0.0001464816596126184,-0.00014580834249500185,-0.00014197784184943885,-0.0001376653090119362,-0.00013136857887730002,-0.00013009124086238444,-0.00012598054308909923,-0.00012182469799881801,-0.00011648714280454442,-0.00011539431579876691,-0.00011179566354257986,-0.00010838047455763444,-0.0001057302943081595,-0.00010259918053634465,-0.00009971444524126127,-0.00009697196946945041,-0.00009460432920604944,-0.00009206380491377786,-0.0000897107383934781,-0.00008747868560021743,-0.00008526266174158081,-0.00008325222006533295,-0.00008132172661134973,-0.00007946159166749567,-0.00007730728975730017,-0.00007579848170280457,-0.00007416551670758054,-0.00007243178697535768,-0.00007113149331416935,-0.00006969451351324096,-0.00006827133620390669,-0.00006675651093246415,-0.00006574110739165917,-0.00006450864020735025,-0.00006328581366688013,-0.00006199835479492322,-0.00006118432065704837,-0.000060117537941550836,-0.000059067959227832034,-0.00005798499478260055,-0.000057315821322845295,-0.000056386241340078413,-0.00005549765774048865,-0.000054768537665950134,-0.00005391808008425869,-0.00005312485518516041,-0.000052364954171935096,-0.00005168548523215577,-0.00005095098458696157,-0.00005026338476454839,-0.00004960038495482877,-0.00004894884841633029,-0.00004832237755181268,-0.000047721448936499655,-0.00004713169619208202,-0.000046472938265651464,-0.000045975728426128626,-0.000045438904635375366,-0.00004487203113967553,-0.00004443091165740043,-0.000043944030039710924,-0.00004345593333709985,-0.000042943069274770096,-0.00004257740147295408,-0.000042141331505263224,-0.00004170518514001742,-0.00004125432315049693,-0.00004094345786143094,-0.00004055046883877367,-0.00004016186358057894,-0.00003976450170739554,-0.00003950133395846933,-0.00003914661647286266,-0.00003880538497469388,-0.000038524536648765206,-0.00003818696131929755,-0.00003787264722632244,-0.00003756979276658967,-0.00003729772652150132,-0.00003699506487464532,-0.00003671335070976056,-0.000036439549148781225],"imag":[0,0.0016992328455671668,1.173415184020996,-0.00252136355265975,-0.0007926864782348275,0.0006343483692035079,0.3673366606235504,-0.0028802177403122187,-0.0013949426356703043,-0.0004072758893016726,0.19374865293502808,-0.0026702620089054108,-0.0016752828378230333,-0.0011937818489968777,0.11294657737016678,-0.001937491470016539,-0.0015954794362187386,-0.0015887764748185873,0.06540476530790329,-0.0008655774872750044,-0.001219106954522431,-0.001578525174409151,0.03489745780825615,0.00027843521093018353,-0.000681068398989737,-0.0012563606724143028,0.014945738948881626,0.0012284577824175358,-0.00013964537356514484,-0.0007772236131131649,0.0021969221998006105,0.001788318157196045,0.0002774348249658942,-0.00029771437402814627,-0.005431756842881441,0.0018976449500769377,0.0005098735564388335,0.00007648035534657538,-0.009372720494866371,0.001646040240302682,0.0006064856424927711,0.0003950097016058862,0.00029542192351073027,0.00023164642334450036,0.00018843216821551323,0.000156454712850973,0.0001322648167842999,0.00011174946848768741,0.00009554803546052426,0.00008205664926208556,0.00007042561628622934,0.00006113025301601738,0.00005279561810311861,0.0000454523105872795,0.00003824400482699275,0.00003422038571443409,0.00002925123590102885,0.00002480922375980299,0.000021623694919981062,0.000018038856069324538,0.000014913599443389103,0.000012075027370883618,0.000010381600077380426,0.000007901368917373475,0.00000582337179366732,0.000003961284619435901,0.000003060255494347075,0.0000012575204664244666,-1.559259033001581e-7,-0.00000138720224640565,-0.0000018895949551733793,-0.000003227272827643901,-0.000004173076376901008,-0.000004885448561253725,-0.000005820809292345075,-0.000006519358066725545,-0.0000071407716859539505,-0.000007664159056730568,-0.000008277625966002233,-0.000008754624104767572,-0.000009195182428811677,-0.000009610410415916704,-0.000009957650036085397,-0.00001028773021971574,-0.000010607793228700757,-0.000010951310287055094,-0.000011027716936951037,-0.000011269357855780981,-0.000011486734365462326,-0.000011532103599165566,-0.000011728689969459083,-0.000011885464118677191,-0.000012017846529488452,-0.000011968377293669619,-0.000012121086001570802,-0.000012217667062941473,-0.000012283791875233874,-0.000012191540008643642,-0.000012310359124967363,-0.000012360048458504025,-0.000012378957762848586,-0.000012264403267181478,-0.000012358477761154063,-0.000012367273484414909,-0.000012326976502663456,-0.00001238031381944893,-0.000012366577720968053,-0.000012342945410637185,-0.000012302615687076468,-0.000012308771147218067,-0.000012272815183678176,-0.000012236448128533084,-0.000012199699995107949,-0.000012158187018940225,-0.000012107776456105057,-0.000012063725080224685,-0.000012034659448545426,-0.000011913177331734914,-0.000011861884559039026,-0.000011805128451669589,-0.000011689693565131165,-0.000011636408999038395,-0.000011572827133932151,-0.000011502354936965276,-0.000011368464583938476,-0.000011315889423713088,-0.000011244560482737143,-0.000011163223462062888]},{"frequency":403.5,"effects":[],"id":"wave-mwcpb1wc-0c4ek0o","name":"Wander 948 + 807 Hz","real":[0,0.009918616153299809,0.45534080266952515,-0.019104892387986183,0.06308445334434509,0.009013146162033081,-0.0845189020037651,0.0050133224576711655,-0.0026594859082251787,-0.008322251960635185,0.10592678934335709,0.0025684612337499857,0.06626784056425095,0.00012934957339894027,-0.011593529023230076,0.0018263376550748944,0.003983600065112114,-0.002557579427957535,0.05226271227002144,-0.0010810407111421227,0.05428988113999367,0.0033741809893399477,0.01028511393815279,-0.0020586897153407335,0.0007370989769697189,-0.00029270804952830076,0.02944994904100895,-0.00015313165204133838,0.03624116629362106,0.0008134275558404624,0.016279492527246475,0.00003379433837835677,0.00031646457500755787,-0.0017729626270011067,0.012273913249373436,0.0013114464236423373,0.022941961884498596,-0.0001084406758309342,0.01238364726305008,-0.00045436646905727684,0.0012222400400787592,-0.0002648938971105963,0.002528252312913537,-0.000025808158170548268,0.010945720598101616,0.0006099184392951429,0.008285736665129662,-0.000922560750041157,0.000023848251657909714,0.000040014623664319515,-0.0005051158950664103,0.00021359880338422954,0.002950406866148114,-0.0002147434715880081,-0.000154768509673886,-0.00013211187615524977,-0.00012087496725143865,-0.0001141156317316927,-0.00010978744830936193,-0.0001067436533048749,-0.00010439058678457513,-0.00010297470726072788,-0.00010182518599322066,-0.00010072194709209725,-0.00009994816355174407,-0.00009917296119965613,-0.00009873193630483001,-0.00009848656918620691,-0.00009792771015781909,-0.00009754789061844349,-0.00009727867291076109,-0.00009703125397209078,-0.00009701660746941343,-0.000096713105449453,-0.00009637200855650008,-0.00009633255103835836,-0.00009620477794669569,-0.0000961598998401314,-0.00009602927457308397,-0.00009588229295331985,-0.00009571545524522662,-0.00009574629802955315,-0.00009570221300236881,-0.0000955596988205798,-0.0000954859860939905,-0.0000953727649175562,-0.00009538453741697595,-0.00009541951294522732,-0.00009526428038952872,-0.000095192197477445,-0.00009516259888187051,-0.00009513917029835284,-0.00009519945160718635,-0.00009508278162684292,-0.00009496840357314795,-0.00009500871965428814,-0.00009499100997345522,-0.00009501204476691782,-0.00009496648999629542,-0.00009482616587774828,-0.00009488559589954093,-0.00009493799007032067,-0.00009498645522398874,-0.00009470935765421018,-0.00009473986574448645,-0.00009453912207391113,-0.00009477316780248657,-0.00009504834451945499,-0.00009457831038162112,-0.00009455010876990855,-0.00009462758316658437,-0.00009462276648264378,-0.00009496745769865811,-0.00009459264401812106,-0.00009431565558770671,-0.0000946808431763202,-0.00009462357411393896,-0.00009475598926655948,-0.00009465748007642105,-0.00009420156857231632,-0.00009459572174819186,-0.00009475275146542117,-0.00009455309191253036,-0.00009463509923079982,-0.00009430099453311414,-0.0000944904750213027,-0.00009499779844190925,-0.00009578755998518318],"imag":[0,0.00243029254488647,0.3591446578502655,-0.005999344866722822,0.378586083650589,-0.016515839844942093,0.1533152461051941,0.009166060015559196,-0.003848462598398328,-0.002805868163704872,0.02672240138053894,-0.004674756899476051,0.10635147988796234,-0.0005519870319403708,0.0667106881737709,-0.0006064421613700688,-0.002187163569033146,0.0016270419582724571,-0.003970761317759752,-0.004731294699013233,0.03552205115556717,0.00035761058097705245,0.038472436368465424,0.0010268966434523463,-0.0029221654403954744,-0.0018595721339806914,-0.013348528183996677,-0.0005963904550299048,0.0074324095621705055,-0.0011856663040816784,0.017051298171281815,0.0012399050174281001,0.000140487783937715,-0.0013421362964436412,-0.015328435227274895,-0.0012775481445714831,-0.004347308538854122,0.0006749551394023001,0.005475780460983515,-0.000626003195066005,-0.00030845412402413785,-0.0002924628206528723,-0.010181243531405926,-0.001007569837383926,-0.00854810792952776,0.0001946759148268029,0.0004987539723515511,-0.000015747249562991783,-0.00046466017374768853,-0.0010150499874725938,-0.00553969806060195,-0.000029446648113662377,-0.005871979519724846,-0.0002761708165053278,-0.00025966213434003294,-0.00025371002266183496,-0.0002495514345355332,-0.00024595853756181896,-0.0002427155413897708,-0.00023911289463285357,-0.00023550850164610893,-0.0002319827035535127,-0.00022839338635094464,-0.00022512750001624227,-0.00022168026771396399,-0.0002180546725867316,-0.00021476492111105472,-0.0002114644303219393,-0.00020831850997637957,-0.00020523599232546985,-0.0002018757804762572,-0.00019882644119206816,-0.00019597253412939608,-0.0001930300350068137,-0.00019024084031116217,-0.00018727830320131034,-0.00018443264707457274,-0.00018193924915976822,-0.00017936927906703204,-0.00017671652312856168,-0.00017413785099051893,-0.00017165936878882349,-0.00016922084614634514,-0.0001669597259024158,-0.00016460778715554625,-0.000162216616445221,-0.00016001827316358685,-0.00015783873095642775,-0.00015574249846395105,-0.00015365908620879054,-0.00015145463112276047,-0.0001494461903348565,-0.0001475293393013999,-0.0001455688034184277,-0.00014367644325830042,-0.0001416951126884669,-0.00013980967923998833,-0.0001381159236188978,-0.00013630989997182041,-0.00013452470011543483,-0.00013276145909912884,-0.00013098042109049857,-0.00012930238153785467,-0.0001280391588807106,-0.00012629528646357358,-0.00012431925279088318,-0.000122982106404379,-0.00012144785432610661,-0.00012008859630441293,-0.00011867775901919231,-0.0001166920192190446,-0.00011541532148839906,-0.00011427446588641033,-0.00011274460848653689,-0.00011148711200803518,-0.00010976221528835595,-0.00010834608838194981,-0.00010754485992947593,-0.00010605061834212393,-0.00010465987725183368,-0.00010334966646041721,-0.00010186671715928242,-0.00010111234587384388,-0.00009991093975258991,-0.00009830568160396069,-0.00009726489952299744,-0.00009599301847629249,-0.00009491962555330247]},{"frequency":32.686414708886616,"effects":[],"id":"wave-mwdaa4h3-i2yss2u","name":"Microphone wave","real":[0,-0.11232829093933105,-0.15578116476535797,-0.4051997661590576,0.36292096972465515,0.11276386678218842,0.06585264205932617,-0.1933673769235611,0.046206358820199966,0.04653332382440567,0.07929464429616928,-0.042968396097421646,-0.0036706468090415,0.005170473363250494,0.001768407761119306,0.011354093439877033,0.014950385317206383,0.03891739994287491,-0.02797103300690651,-0.008220743387937546,-0.004774284549057484,-0.012064582668244839,-0.0037946905940771103,-0.0017078164964914322,-0.00047372575500048697,0.005061732139438391,-0.005160285159945488,-0.003229586873203516,-0.03872959315776825,0.017261795699596405,0.008671248331665993,0.014018524438142776,-0.018694579601287842,-0.0032365641091018915,0.00019961017824243754,0.005045206286013126,-0.0008698239689692855,-0.0007617489900439978,-0.000242818656261079,0.00008305791561724618,0.0004246195894666016,0.0005293919239193201,0.00039717534673400223,0.00012432574294507504,0.0003371694474481046,0.0005334318266250193,0.0008151241927407682,0.00011997045658063143,0.00026164817973040044,-0.0006315522477962077,0.0008308511460199952,0.0008005797280929983,0.0008079266990534961,0.0008182337624020875,0.00015819983673281968,0.0003239520301576704,-0.003378370078280568,0.002797624096274376,0.001271468005143106,0.0015762225957587361,-0.00041049308492802083,0.00047116080531850457,0.0010520713403820992,0.0010057486360892653,0.00047666707541793585,0.0006554840947501361,0.0006314844940789044,0.000809055520221591,0.0007660049013793468,0.0010177565272897482,0.0007608566666021943,0.0011381945805624127,0.0008739958284422755,0.0007483205408789217,0.0012871547369286418,0.0009317600633949041,0.0007601972320117056,0.0008455847855657339,0.0010717010591179132,0.0008819206850603223,0.0005307216197252274,0.0006496916757896543,0.0008221230818890035,0.0011087657185271382,0.0009584086947143078,0.0010601602261886,0.001086869859136641,0.0008552265353500843,0.0007402048795484006,0.0011792824370786548,0.0007347557111643255,0.0003239700454287231,0.0010629164753481746,0.0010045320959761739,0.0007437242311425507,0.0011469025630503893,0.000847076007630676,0.0010341266170144081,0.0010552959283813834,0.0011783090885728598,0.0008894162019714713,0.001163185341283679,0.0006896898848935962,0.0007617486407980323,0.0011784074595198035,0.0009250408038496971,0.0011016869684681296,0.0008393843891099095,0.0007614559144712985,0.001086332369595766,0.0009671862935647368,0.0009497550781816244,0.0010636813240125775,0.000955433351919055,0.0009784912690520287,0.0010260395938530564,0.0008643879555165768,0.0008864719420671463,0.0007814490236341953,0.0008123788284137845,0.0008923303685151041,0.000939659948926419,0.0010368096409365535,0.0011886566644534469,0.0009683924727141857,0.0009246035479009151,0.0009782175766304135,0.0008625294431112707],"imag":[0,-0.014516731724143028,-0.03773849457502365,-0.12136828899383545,0.16287636756896973,0.05999930948019028,0.031007913872599602,-0.018602337688207626,0.02347636967897415,0.02216474898159504,0.013220679946243763,0.02723695896565914,0.01580509915947914,0.015460186637938023,0.03749852627515793,0.019484519958496094,0.021730974316596985,0.02927066572010517,-0.01657242141664028,0.004073418211191893,0.00664028013125062,0.030983034521341324,0.0002077323297271505,0.0034983763471245766,-0.000893654185347259,0.008285725489258766,0.004011912737041712,0.006139089819043875,-0.019434532150626183,0.00787417683750391,0.005498844664543867,0.006981860846281052,0.0028325170278549194,0.0028793178498744965,0.003627923084422946,-0.0015030967770144343,0.0047462815418839455,0.004784455988556147,0.004902039188891649,0.0015940734883770347,0.003076536115258932,0.0034384354948997498,0.0035462239757180214,0.003123836824670434,0.003254692303016782,0.0024660713970661163,0.004032195080071688,0.003391298931092024,0.0031253527849912643,0.0036362202372401953,0.0018044961616396904,0.002726241247728467,0.0024705275427550077,0.00442163273692131,0.002704496728256345,0.0021950823720544577,0.0005320591735653579,0.0026037960778921843,0.0029859915375709534,0.002067827619612217,0.001964279916137457,0.002077363897114992,0.0026142906863242388,0.002195108449086547,0.002247178228572011,0.002407127758488059,0.002032793127000332,0.0019730553030967712,0.002103768289089203,0.0020499681122601032,0.0021984241902828217,0.0017895534401759505,0.0019105237443000078,0.0016179886879399419,0.002108049113303423,0.0019124934915453196,0.0019230800680816174,0.002210118342190981,0.0019686080049723387,0.0016607011202722788,0.0016310279024764895,0.0016177783254534006,0.0017511126352474093,0.001678971340879798,0.0014114659279584885,0.0019288327312096953,0.0016072721919044852,0.0016822986071929336,0.0010168632725253701,0.0018856596434488893,0.001514311763457954,0.0025482692290097475,0.0009688894497230649,0.0011581109138205647,0.0013795376289635897,0.0017603728920221329,0.001295091351494193,0.0012462891172617674,0.0012537901056930423,0.0014003028627485037,0.0011459039524197578,0.0010919240303337574,0.0014229569351300597,0.001297242590226233,0.0014734873548150063,0.0012887927005067468,0.0011745019583031535,0.0011088750325143337,0.0010680845007300377,0.0013694774825125933,0.0013680612901225686,0.0013165646232664585,0.0009551423136144876,0.0011424781987443566,0.0009397775284014642,0.0010754421819001436,0.00111000903416425,0.001053780666552484,0.0009916448034346104,0.0007346301572397351,0.0009928065119311213,0.0009901047451421618,0.0008511174819432199,0.000901788123883307,0.0009619573247618973,0.001110128010623157,0.0010345986811444163,0.0008368616690859199]},{"frequency":100,"effects":[],"id":"wave-mwdaaqox-u05g37c","name":"Hot capture 3:26:36 AM","real":[0,0.14878228306770325,-0.07048191130161285,-0.10834603756666183,-0.07515204697847366,0.06810374557971954,0.12564586102962494,0.0662364661693573,-0.044282518327236176,-0.07019703835248947,-0.035232193768024445,0.02381483092904091,0.03964373841881752,0.021868951618671417,-0.002778127556666732,-0.003761058673262596,0.0028944271616637707,-0.011804623529314995,-0.02283484674990177,-0.011460338719189167,0.015156642533838749,0.035238344222307205,0.01563279889523983,-0.018793780356645584,-0.03030869923532009,-0.013713509775698185,0.012334922328591347,0.015707088634371758,0.007108064368367195,-0.0010873258579522371,0.0038236945401877165,0.0032581230625510216,-0.0033372826874256134,-0.014192666858434677,-0.0076708379201591015,0.016499891877174377,0.018031081184744835,0.013020144775509834,-0.012542015872895718,-0.018036263063549995,-0.010339421220123768,0.012590112164616585,0.01714550517499447,0.0026490979362279177,0.0012211434077471495,0.0016225873259827495,0.0009481515735387802,-0.0005217171856202185,-0.007763408590108156,-0.0002088763430947438,0.009466685354709625,0.013381294906139374,0.0054994854144752026,-0.006527555175125599,-0.01221390813589096,-0.009992517530918121,0.010732508264482021,0.011224349029362202,-0.001093301922082901,0.003690807381644845,0.0004884109366685152,-0.0010660316329449415,-0.0007098223431967199,-0.008526853285729885,0.00010129989095730707,0.00909413117915392,0.016535138711333275,0.009163205511868,-0.009037128649652004,-0.012065236456692219,-0.0010074767051264644,0.006172530818730593,0.012549281120300293,0.004320918116718531,0.002235532971099019,0.0016164345433935523,0.0017366937827318907,0.00035612547071650624,-0.006980456877499819,-0.0001046265970217064,0.009128115139901638,0.006633919198065996,0.0034682112745940685,-0.002119867829605937,-0.005403398536145687,-0.002509042154997587,0.002861315617337823,0.0067802839912474155,0.00216840417124331,0.00042562850285321474,-0.004801049362868071,-0.0011626314371824265,0.0005112629733048379,-0.0032738004811108112,0.002021580934524536,0.005422718822956085,0.009584440849721432,0.00545699056237936,-0.0043817623518407345,-0.008412466384470463,0.002636050572618842,0.004559450317174196,0.005719114560633898,0.0038154497742652893,0.00045945143210701644,-0.002647268818691373,0.0014714522985741496,-0.0008803103701211512,0.000692811154294759,0.00022877671290189028,0.006161669734865427,0.00798584520816803,0.002002398483455181,-0.0025199907831847668,-0.004849498625844717,-0.002213270403444767,0.006792889442294836,0.007739849388599396,0.0065512144938111305,-0.0002116757386829704,-0.0009720847010612488,0.0003373559156898409,-0.002201789291575551,-0.0010586439166218042,0.0004635763179976493,0.00445450097322464,0.008559764362871647,0.0014708756934851408],"imag":[0,0.14105860888957977,-0.007203174289315939,0.07291031628847122,0.16761791706085205,0.142289400100708,0.03255974501371384,-0.06033353507518768,-0.06311701983213425,0.01753009483218193,0.07114610821008682,0.05982040986418724,0.018125459551811218,-0.0013520610518753529,0.007998418062925339,0.01303597167134285,0.0016396718565374613,-0.0004980723606422544,0.009716820903122425,0.038957517594099045,0.03836803510785103,0.01353148277848959,-0.020715899765491486,-0.02254360541701317,0.014235143549740314,0.033736251294612885,0.028223559260368347,0.00996306911110878,0.002932874020189047,-0.000024291182853630744,0.0021383725106716156,0.00339147518388927,-0.0028139157220721245,0.009116617031395435,0.022506283596158028,0.02301986701786518,0.0033173123374581337,-0.013966338708996773,-0.009313603863120079,0.005576922558248043,0.019248459488153458,0.013623062521219254,0.006092552095651627,-0.0027690252754837275,-0.0007287465268746018,0.005287495441734791,0.0014232480898499489,0.0005268222303129733,-0.0019538612104952335,0.0176951102912426,0.015900861471891403,0.00285767181776464,-0.010970186442136765,-0.004989159293472767,0.0060150460340082645,0.017443716526031494,0.010807603597640991,0.0041893417946994305,-0.0013713421067222953,0.004787731450051069,-0.000010881665730266832,0.004654232412576675,0.001961794216185808,0.0018494224641472101,0.00796971470117569,0.007812918163836002,-0.0016508066328242421,-0.010561888106167316,-0.005120846442878246,0.0036556979175657034,0.008236812427639961,0.009548048488795757,0.005359750706702471,-0.002278969157487154,0.002423001453280449,0.0010569978039711714,0.0015152550768107176,-0.001002768287435174,0.0037039807066321373,0.014386412687599659,0.009401213377714157,-0.0012345038121566176,-0.00236477330327034,-0.0010713605443015695,0.008922946639358997,0.010482904501259327,0.007156418636441231,0.003874070942401886,-0.0008478384697809815,-0.0013633130583912134,0.0035508587025105953,0.0022129868157207966,0.003462279448285699,0.0018849136540666223,0.009113499894738197,0.005959972273558378,0.001591513049788773,-0.008433457463979721,-0.0032079287339001894,0.0072149597108364105,0.007706203497946262,0.008041976019740105,-0.0008959476253949106,-0.001669230405241251,-0.0028040320612490177,0.0025945384986698627,0.0025377916172146797,-0.00007247320172609761,0.0036308839917182922,0.004124381113797426,0.005398942623287439,0.000978774973191321,-0.0028977631591260433,-0.004559987690299749,0.00526778306812048,0.006745606195181608,0.007061193697154522,0.0007952774758450687,-0.001923718606121838,-0.0020765154622495174,0.0016415973659604788,-0.002014205092564225,0.0006477878778241575,0.004016402643173933,0.006081775762140751,0.003180881729349494,-0.0006323933484964073,-0.005235051270574331]},{"frequency":121.67300380228137,"effects":[],"id":"wave-mwdaiftx-jrmklwf","name":"yohfddf","real":[0,-0.23398974537849426,-0.2605627775192261,0.09322554618120193,-0.052972905337810516,0.09375465661287308,0.02137063257396221,0.016723942011594772,0.012210813350975513,-0.007596269715577364,0.007616015151143074,0.01862364076077938,0.010335502214729786,-0.023842889815568924,-0.03088751807808876,0.004475489724427462,-0.006329075898975134,0.0014769311528652906,-0.0022868579253554344,0.00010222748096566647,0.0005147133488208055,-0.013404385186731815,-0.010335381142795086,-0.010973242111504078,0.004081345163285732,0.0021309589501470327,0.0005350987776182592,0.00014132032811176032,-0.000031886782380752265,-0.00025944950175471604,-0.0014346984680742025,0.0004625003784894943,0.00016544570098631084,-0.0005180199514143169,0.00046230212319642305,-0.0008085910812951624,0.00042658959864638746,-0.0008406298002228141,-0.0004540949303191155,-0.0005532120703719556,-0.0000620189166511409,-0.00009580071491654962,-0.00009650797437643632,-0.000618474674411118,0.0011642974568530917,0.0009458480635657907,0.00028693463536910713,0.0001466560352127999,0.000576934777200222,-0.0005298044998198748,-0.00003167563409078866,0.0014280887553468347,0.00031821816810406744,0.0009555144351907074,-0.0012958854204043746,-0.004170747008174658,-0.002447710372507572,-0.001313020708039403,-0.0015370205510407686,-0.0017453194595873356,-0.0020305404905229807,-0.0021251230500638485,-0.0013597673969343305,-0.001566337770782411,-0.0020339887123554945,-0.0027229278348386288,-0.0028956388123333454,-0.00017487230070400983,-0.003405588446184993,-0.0010357132414355874,-0.0008469770546071231,-0.0009477711282670498,-0.0022059103939682245,-0.0017193598905578256,-0.00012987302034161985,-0.0012127043446525931,-0.0010203513083979487,-0.0008053765632212162,-0.0012533549452200532,-0.000648954592179507,-0.00005822937237098813,-0.0010482186917215586,-0.001067257602699101,-0.0005808796850033104,-0.000621969229541719,-0.0007573781185783446,-0.0007027648971416056,-0.0006459517171606421,-0.0008444817503914237,-0.0007922156946733594,-0.0007170307217165828,-0.0009026730549521744,-0.0008837999776005745,-0.0007791192037984729,-0.0009465560433454812,-0.0008482661214657128,-0.0007095934706740081,-0.0006942995823919773,-0.0006130100227892399,-0.0006020982400514185,-0.0005753146833740175,-0.000680115888826549,-0.0009699655347503722,-0.0009199597989208996,-0.0006419026758521795,-0.001154030323959887,-0.0008921203552745283,-0.00019515564781613648,-0.0009243814274668694,-0.0011377856135368347,-0.0008098117541521788,-0.000910113041754812,-0.0006838366971351206,-0.0010405650828033686,-0.000995462411083281,-0.0012229239800944924,-0.0008672311087138951,-0.0006210673600435257,-0.0007185357389971614,-0.0010039437329396605,-0.0010545512195676565,-0.0008608479984104633,-0.0006782266427762806,-0.0007465194794349372,-0.0006979284808039665,-0.001155239064246416,-0.0010137060889974236,-0.000670553941745311],"imag":[0,0.1646336168050766,-0.312946617603302,-0.33122384548187256,-0.028464144095778465,-0.0023497696965932846,0.008013092912733555,-0.010577429085969925,0.006906856782734394,-0.0023206209298223257,-0.0189156923443079,0.015426845289766788,-0.015881504863500595,0.029650170356035233,-0.026914551854133606,-0.0026454764883965254,-0.019637297838926315,-0.008806059136986732,-0.008327238261699677,-0.00799452606588602,-0.0026646447367966175,3.8528872892129584e-7,-0.008868878707289696,-0.021947968751192093,-0.014413670636713505,-0.008660951629281044,-0.007064971141517162,-0.0071714515797793865,-0.007034661713987589,-0.005899497307837009,-0.005521569866687059,-0.006489187013357878,-0.00588416401296854,-0.005361713469028473,-0.004896564409136772,-0.004640412516891956,-0.0044648488983511925,-0.004258111119270325,-0.004256909713149071,-0.004086324013769627,-0.004210112150758505,-0.004264371003955603,-0.0034446229692548513,-0.003720049513503909,-0.003937026485800743,-0.003612412139773369,-0.0025801025331020355,-0.0031507466919720173,-0.0029653890524059534,-0.002424401929602027,-0.0038242130540311337,-0.0028850368689745665,-0.0002608879585750401,-0.0017291053663939238,0.0007443050271831453,-0.0019157209899276495,-0.0041185710579156876,-0.003100403118878603,-0.0027453419752418995,-0.002486402401700616,-0.0023541145492345095,-0.0022940742783248425,-0.0028892983682453632,-0.0018019736744463444,-0.0008867860888130963,-0.0019498352194204926,-0.0035927221179008484,-0.002021074527874589,-0.0019973984453827143,-0.002733934670686722,-0.0020472544711083174,-0.0023803850635886192,-0.001276036142371595,-0.002019785810261965,-0.002195236273109913,-0.002168702892959118,-0.0012685781111940742,-0.0011688002850860357,-0.000954134447965771,-0.0010147696593776345,-0.0014596815453842282,-0.0018226472893729806,-0.001298504532314837,-0.0011899523669853806,-0.0016867449739947915,-0.0015692322049289942,-0.0011714539723470807,-0.0012400101404637098,-0.0009633176377974451,-0.0013235760852694511,-0.001308256876654923,-0.0011876323260366917,-0.0012936702696606517,-0.0012271468294784427,-0.0012235555332154036,-0.0011429717997089028,-0.0013834531418979168,-0.0010600422974675894,-0.0010963808745145798,-0.0012474828399717808,-0.0010124180698767304,-0.0009684516699053347,-0.0009813618380576372,-0.00129068607930094,-0.0010588886216282845,-0.0010531310690566897,-0.0013206676812842488,-0.0008850412559695542,-0.0005773738957941532,-0.0009600804187357426,-0.0009272628230974078,-0.0009075847337953746,-0.0008356500184163451,-0.0009394422522746027,-0.0006805572775192559,-0.0005544865853153169,-0.0007662131683900952,-0.0008694820571690798,-0.0009699463844299316,-0.0008334719459526241,-0.0005807348643429577,-0.0005917656235396862,-0.00016673587379045784,-0.0005139334825798869,-0.0009938740404322743,-0.0006811340572312474,-0.0005582363810390234,-0.0009902258170768619]},{"frequency":134,"effects":[],"id":"wave-mwdbr65n-n8yjrtp","name":"moz","real":[0,0,-0.21234148740768433,-0.11820120364427567,-0.07767283916473389,0,-0.12243952602148056,0.09131275862455368,-0.031241485849022865,0.06952589750289917,-0.07812584191560745,0,0,0,-0.03459089994430542,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"imag":[0,0.7132988572120667,0,0,0,-0.1424282342195511,0,0,0,0,0,-0.0482134111225605,0.07047168910503387,-0.01996486447751522,0,-0.04293303191661835,0.033867716789245605,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},{"frequency":33.5,"effects":[],"id":"wave-mwdbtajt-nuvxq0k","name":"wahhhh!!!!!!!!!","real":[0,0,0.05849258229136467,0,0.006122130434960127,0,-0.0546390525996685,0,-0.11066365987062454,0,-0.0067734019830822945,0,-0.05270453169941902,0,-0.0018262674566358328,0,-0.035068925470113754,0,-0.008713386952877045,0,0.0041288998909294605,0,0.008679487742483616,0,-0.053425341844558716,0,0.0006880050641484559,0,0.042140427976846695,0,0.0020879812072962523,0,-0.013983439654111862,0,0.0009774657664820552,0,0.028462620452046394,0,0.00027252043946646154,0,-0.029336636886000633,0,-0.0034879553131759167,0,0.0015727115096524358,0,0.00621625455096364,0,0.0006541647599078715,0,-0.003679242916405201,0,-0.00002925359149230644,0,0.000482194620417431,0,-0.009028454311192036,0,-0.0017141925636678934,0,0.0005026946309953928,0,0.0019075580639764667,0,0.0007530974107794464,0,0.0015444797463715076,0,0.0003575757145881653,0,-0.0013092240551486611,0,-0.005604020785540342,0,0.00017034031043294817,0,0.000062212573539,0,-0.0014456658391281962,0,0.000184282980626449,0,0.0020442709792405367,0,0.0004611287440638989,0,-0.0008666344219818711,0,-0.006306841503828764,0,-0.000010675071280275006,0,0.0046446481719613075,0,0.00022096006432548165,0,-0.0016496083699166775,0,0.00013271241914480925,0,0.003492706222459674,0,0.00008189403160940856,0,-0.003147901501506567,0,0.00025371581432409585,0,0.0001635139196878299,0,-0.000310958712361753,0,-0.0008123365696519613,0,-0.00002909985232690815,0,-0.0006080495077185333,0,-0.000013828856936015654,0,-0.00048161778249777853,0,-0.00005335075911716558,0,0.00006378220859915018,0,0.0001313170650973916,0],"imag":[0,0,0.019215071573853493,0,0.3617561161518097,0,0.030838390812277794,0,-0.009913278743624687,0,-0.011482549831271172,0,-0.003668369259685278,0,-0.004084386862814426,0,-0.00015294802142307162,0,-0.008693930692970753,0,-0.06615445017814636,0,0.004928897600620985,0,0.0010471746791154146,0,-0.013113531284034252,0,-0.0006813352229073644,0,0.007525505032390356,0,0.00041646399768069386,0,-0.005420806352049112,0,0.000603520660661161,0,0.008410652168095112,0,0.001124835922382772,0,-0.0049300421960651875,0,-0.0176264438778162,0,0.0002242456830572337,0,0.022822385653853416,0,0.0009519254672341049,0,-0.006055465433746576,0,0.001022127689793706,0,0.0004049894632771611,0,-0.0018105270573869348,0,-0.010391765274107456,0,-0.000601181061938405,0,0.00007397001172648743,0,0.0005484135472215712,0,0.00816288124769926,0,0.0012291434686630964,0,-0.00028572833980433643,0,-0.0007259448175318539,0,0.0027932929806411266,0,-0.0003379131085239351,0,-0.008453656919300556,0,-0.00018000062846112996,0,0.005026184022426605,0,0.0011541405692696571,0,-0.0002286627859575674,0,-0.001616532215848565,0,-0.00015240801440086216,0,0.0008037050138227642,0,0.0000031479989957006183,0,-0.0006982593913562596,0,0.000027011852580471896,0,0.0009232446318492293,0,-0.000004176768925390206,0,-0.00036076363176107407,0,0.0024071643128991127,0,0.0002070298360195011,0,-0.00007005647785263136,0,-0.00005449009040603414,0,-0.00002611436320876237,0,-0.000035185508750146255,0,-0.000016469068214064464,0,-0.00013188915909267962,0,-0.00045888929162174463,0,-0.00004744709440274164,0]},{"frequency":116.2227602905569,"effects":[],"id":"wave-mwdo4soh-62byw7b","name":"hmmmm","real":[0,-0.5952525734901428,-0.3209344744682312,0.03155655786395073,0.024768421426415443,0.01591213420033455,0.0061396146193146706,0.009742891415953636,0.00390248978510499,0.0042741382494568825,-0.0009813595097512007,0.0007359717274084687,0.0029581997077912092,0.005253728944808245,0.0018171172123402357,0.008086692541837692,0.002010812982916832,0.004865287337452173,0.0030322992242872715,0.0023182521108537912,0.0010856693843379617,0.001480187987908721,0.001692662830464542,0.001803324674256146,0.0016429886454716325,0.0016038280446082354,0.0014406845439225435,0.0014343265211209655,0.0015088521176949143,0.0012864057207480073,0.0009986709337681532,0.0014785716775804758,0.0015295804478228092,0.0009109761449508369,-0.00012758866068907082,0.0008346347021870315,0.0007384780910797417,0.0010541480733081698,0.0010384033666923642,0.0010093571618199348,0.0010901147034019232,0.0010095547186210752,0.0009697361383587122,0.0007889771950431168,0.0005112513317726552,0.0011824857210740447,0.0010290960781276226,0.0011001209495589137,0.0009558074525557458,0.0009535655262880027,0.0009094107081182301,0.0009008217020891607,0.0008949528564698994,0.0009138968889601529,0.0008588254568167031,0.0008555380045436323,0.0009281611419282854,0.0008143151644617319,0.0009052292443811893,0.0008646768401376903,0.0009550577960908413,0.0008893404738046229,0.0009278705692850053,0.0008744170190766454,0.0010551696177572012,0.0010451311245560646,0.0009594421717338264,0.0004788477090187371,0.0007026155944913626,0.0006537400186061859,0.0004748087376356125,0.0003582639619708061,0.0002971465000882745,0.0005542871658690274,0.0005372501909732819,0.0008427873253822327,0.0008313282742165029,0.0007637726957909763,0.0006910852971486747,0.0006837683031335473,0.0006678665522485971,0.0008494795765727758,0.000730084371753037,0.0006881782901473343,0.0007224662113003433,0.0008063462446443737,0.0007628297316841781,0.000770626706071198,0.0007105207187123597,0.0006965252105146646,0.0006949346861802042,0.000669857079628855,0.0006536418222822249,0.0007049818523228168,0.0006697720964439213,0.00066497822990641,0.0006711488822475076,0.0006399955018423498,0.0006968671223148704,0.0007066206308081746,0.0006097509176470339,0.0005741881905123591,0.0006598749896511436,0.0006381154526025057,0.0006402858416549861,0.0006599514163099229,0.0006649376591667533,0.000616512494161725,0.0006115107098594308,0.0006342158303596079,0.0006231592269614339,0.0006218069465830922,0.0006289853481575847,0.0006343364948406816,0.000588114548008889,0.0006187022081576288,0.0005723473732359707,0.0005895670037716627,0.0005559635465033352,0.000608219183050096,0.0005281773046590388,0.0004921330837532878,0.000508559518493712,0.0006856613326817751,0.0006530334358103573,0.0006145504303276539,0.0006281935493461788,0.0006100779864937067],"imag":[0,-0.19857703149318695,-0.13703127205371857,-0.05264187604188919,0.01838587410748005,0.020721089094877243,0.01847510226070881,0.013056750409305096,0.016361359506845474,0.012935830280184746,0.011597729288041592,0.006355644669383764,0.006887880153954029,0.0034080175682902336,0.009096581488847733,0.006251410581171513,0.0067015234380960464,0.009089954197406769,0.0059424289502203465,0.005868269130587578,0.0032745206262916327,0.003855789778754115,0.003586180042475462,0.00379287451505661,0.0037860197480767965,0.00355841894634068,0.0034386918414384127,0.0029312220867723227,0.0032393792644143105,0.002898609498515725,0.003284231061115861,0.002578119747340679,0.0034736923407763243,0.004173413850367069,0.00260722148232162,0.0026625064201653004,0.002552342601120472,0.002498937537893653,0.0022796860430389643,0.00237451633438468,0.0022427334915846586,0.0020706995856016874,0.0020166102331131697,0.0020015318877995014,0.0019601385574787855,0.0017541046254336834,0.001835091388784349,0.0017922401893883944,0.0017265641363337636,0.0017994098598137498,0.0016629990423098207,0.0016298660775646567,0.0015846365131437778,0.0015937413554638624,0.0014655851991847157,0.0015998571179807186,0.0014002792304381728,0.0013084852835163474,0.0013749535428360105,0.0012450647773221135,0.0011477596126496792,0.0011499543907120824,0.0011457409709692001,0.0009262235835194588,0.0009709238074719906,0.0012079555308446288,0.001329562976025045,0.001614148379303515,0.0018033134983852506,0.0012121641775593162,0.001433570752851665,0.0011734477011486888,0.0011204073671251535,0.0007380733150057495,0.0007327463245019317,0.0007567675202153623,0.0008551479550078511,0.0009463158203288913,0.0009856655960902572,0.0009248374262824655,0.0009271419257856905,0.0009645412210375071,0.0008719374891370535,0.0008415864431299269,0.0007334495312534273,0.0007616138900630176,0.0008043233538046479,0.0007378720911219716,0.0008025924325920641,0.0007726259063929319,0.0006758976960554719,0.0007190951728262007,0.0007418739260174334,0.000702616001944989,0.0006805442390032113,0.0006760355900041759,0.0006850684294477105,0.0006676539778709412,0.0006219721399247646,0.0006190920830704272,0.0006392548675648868,0.0005652910913340747,0.0005849432782270014,0.0005474204663187265,0.0005457437364384532,0.0005514802760444582,0.0005197512800805271,0.000479740061564371,0.0004999865195713937,0.00048400298692286015,0.00048338150372728705,0.0005132483202032745,0.0005166131304576993,0.0004780802992172539,0.0005262914928607643,0.00046313527855090797,0.0004894953453913331,0.00048290533595718443,0.00048523247824050486,0.000550228520296514,0.0005126758478581905,0.00037649433943443,0.0003839606943074614,0.0003743534325622022,0.000339647987857461,0.0003589065745472908,0.0003650526632554829,0.00037367030745372176]},{"effects":[],"id":"sleep-lantern","name":"Lantern triangle","real":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"imag":[0,0.8813448548316956,0,-0.055845536291599274,0,0.020108431577682495,0,-0.010262494906783104,0,0.006210669409483671,0,-0.004159643780440092,0,0.0029800019692629576,0,-0.0022398869041353464,0,0.001745258690789342,0,-0.0013984378892928362,0,0.0011459040688350797,0,-0.0009563379571773112,0,0.0008104216540232301,0,-0.0006957149598747492,0,0.0006039131549187005,0,-0.0009282418177463114,0,0.0008204574696719646,0,-0.0004166129801888019,0,0.0003734675410669297,0,-0.0003367895260453224,0,0.0003053483960684389,0,-0.00027819297974929214,0,0.00025457865558564663,0,-0.00023391579452436417,0,0.00021573255071416497,0,-0.0001996477658394724,0,0.000185350829269737,0,-0.0001725865004118532,0,0.00016114361642394215,0,-0.00015084609913174063,0,0.0001415462902514264,0,-0.00023345353838521987,0,0.00022002129117026925,0,-0.00011847812857013196,0,0.00011209586955374107,0,-0.00010624690185068175,0,0.00010087365808431059,0,-0.00009592612332198769,0,0.00009136070002568886,0,-0.00008713923307368532,0,0.00008322822395712137,0,-0.00007959818321978673,0,0.00007622300472576171,0,-0.00007307958730962127,0,0.00007014738366706297,0,-0.00006740807293681428,0,0.00006484529149020091,0,-0.00010950952855637297,0,0.0001055598258972168,0,-0.000058076857385458425,0,0.00005608770516118966,0,-0.00005421507012215443,0,0.000052450217481236905,0,-0.00005078519825474359,0,0.00004921281652059406,0,-0.00004772649481310509,0,0.00004632024865713902,0,-0.00004498859925661236,0,0.00004372654439066537,0,-0.00004252948929206468,0,0.0000413932248193305,0,-0.00004031387288705446,0,0.00003928787191398442,0,-0.00006718814984196797]},{"effects":[],"id":"sleep-velvet","name":"Velvet screen glow","real":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"imag":[0,0.9632835388183594,0,-0.016213219612836838,0,0.005837931763380766,0,-0.002979434095323086,0,0.0018030975479632616,0,-0.001207638531923294,0,0.0008651618845760822,0,-0.0006502897595055401,0,0.0005066880257800221,0,-0.0004059980856254697,0,0.000332681811414659,0,-0.00027764649712480605,0,0.00023528370365966111,0,-0.0002019817620748654,0,0.00017532963829580694,0,-0.0010145405540242791,0,0.0008967354660853744,0,-0.0001209521506098099,0,0.0001084260584320873,0,-0.00009777760715223849,0,0.00008864953269949183,0,-0.00008076570520643145,0,0.00007390993414446712,0,-0.00006791103805880994,0,0.00006263203249545768,0,-0.00005796225377707742,0,0.00005381153096095659,0,-0.00005010575841879472,0,0.00004678362893173471,0,-0.00004379402889753692,0,0.00004109408473595977,0,-0.00025515773450024426,0,0.00024047668557614088,0,-0.00003439687498030253,0,0.00003254396142438054,0,-0.00003084587660850957,0,0.000029285900382092223,0,-0.00002784952084766701,0,0.000026524074201006442,0,-0.00002529848825361114,0,0.000024163033231161535,0,-0.000023109150788513944,0,0.000022129259377834387,0,-0.000021216654204181395,0,0.000020365368982311338,0,-0.000019570084987208247,0,0.000018826052837539464,0,-0.00011969063052674755,0,0.00011537372483871877,0,-0.000016861024050740525,0,0.00001628352765692398,0,-0.000015739859009045176,0,0.000015227482435875572,0,-0.000014744089639862068,0,0.000014287591511674691,0,-0.000013856079931429122,0,0.000013447814126266167,0,-0.000013061207027931232,0,0.000012694803444901481,0,-0.000012347271876933519,0,0.000012017387234664056,0,-0.000011704027201631106,0,0.000011406156772864051,0,-0.00007343463221332058]},{"effects":[],"id":"sleep-bass","name":"Quiet sine bass","real":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"imag":[0,0.996803879737854,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,-0.0010498445481061935,0,0.000927940069232136,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,-0.0002640367019921541,0,0.0002488447935320437,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,-0.00012385562877170742,0,0.0001193885036627762,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,-0.00007599001401104033]},{"effects":[],"id":"sleep-stars","name":"Distant save point","real":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"imag":[0,0.9744569659233093,0,-0.010808813385665417,0,0.0038919546641409397,0,-0.001986289396882057,0,0.0012020650319755077,0,-0.0008050923352129757,0,0.0005767745897173882,0,-0.00043352649663574994,0,0.0003377920074854046,0,-0.0002706653904169798,0,0.00022178787912707776,0,-0.0001850976696005091,0,0.00015685580729041249,0,-0.00013465450319927186,0,0.00011688642553053796,0,-0.0010263085132464767,0,0.0009071370004676282,0,-0.0000806347670732066,0,0.00007228404138004407,0,-0.00006518507143482566,0,0.00005909968967898749,0,-0.0000538438034709543,0,0.000049273290642304346,0,-0.000045274024159880355,0,0.00004175468711764552,0,-0.00003864150130539201,0,0.000035874352761311457,0,-0.00003340384137118235,0,0.00003118908716714941,0,-0.000029196020477684215,0,0.000027396055884310044,0,-0.0002581173903308809,0,0.00024326605489477515,0,-0.000022931249986868352,0,0.00002169597428292036,0,-0.00002056391713267658,0,0.000019523933588061482,0,-0.000018566346625448205,0,0.000017682716134004295,0,-0.00001686565883574076,0,0.000016108688214444555,0,-0.00001540609991934616,0,0.000014752838978893124,0,-0.00001414443613612093,0,0.000013576912351709325,0,-0.0000130467242343002,0,0.000012550702194857877,0,-0.00012107896327506751,0,0.00011671198444673792,0,-0.000011240682397328783,0,0.000010855685104615986,0,-0.00001049323873303365,0,0.00001015165435092058,0,-0.000009829393093241379,0,0.000009525061614112929,0,-0.000009237386620952748,0,0.000008965209417510778,0,-0.000008707471351954155,0,0.000008463201993436087,0,-0.000008231514584622346,0,0.000008011591489776038,0,-0.000007802685104252305,0,0.000007604104666825151,0,-0.00007428642857121304]},{"effects":[{"type":"echo","enabled":true,"mix":0.24,"time":0.46875,"feedback":0.32},{"type":"reverb","enabled":true,"mix":0.24,"size":1.6,"decay":0.67}],"id":"recovered-1","name":"Lantern triangle","real":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"imag":[0,0.8813448548316956,0,-0.055845536291599274,0,0.020108431577682495,0,-0.010262494906783104,0,0.006210669409483671,0,-0.004159643780440092,0,0.0029800019692629576,0,-0.0022398869041353464,0,0.001745258690789342,0,-0.0013984378892928362,0,0.0011459040688350797,0,-0.0009563379571773112,0,0.0008104216540232301,0,-0.0006957149598747492,0,0.0006039131549187005,0,-0.0009282418177463114,0,0.0008204574696719646,0,-0.0004166129801888019,0,0.0003734675410669297,0,-0.0003367895260453224,0,0.0003053483960684389,0,-0.00027819297974929214,0,0.00025457865558564663,0,-0.00023391579452436417,0,0.00021573255071416497,0,-0.0001996477658394724,0,0.000185350829269737,0,-0.0001725865004118532,0,0.00016114361642394215,0,-0.00015084609913174063,0,0.0001415462902514264,0,-0.00023345353838521987,0,0.00022002129117026925,0,-0.00011847812857013196,0,0.00011209586955374107,0,-0.00010624690185068175,0,0.00010087365808431059,0,-0.00009592612332198769,0,0.00009136070002568886,0,-0.00008713923307368532,0,0.00008322822395712137,0,-0.00007959818321978673,0,0.00007622300472576171,0,-0.00007307958730962127,0,0.00007014738366706297,0,-0.00006740807293681428,0,0.00006484529149020091,0,-0.00010950952855637297,0,0.0001055598258972168,0,-0.000058076857385458425,0,0.00005608770516118966,0,-0.00005421507012215443,0,0.000052450217481236905,0,-0.00005078519825474359,0,0.00004921281652059406,0,-0.00004772649481310509,0,0.00004632024865713902,0,-0.00004498859925661236,0,0.00004372654439066537,0,-0.00004252948929206468,0,0.0000413932248193305,0,-0.00004031387288705446,0,0.00003928787191398442,0,-0.00006718814984196797]},{"effects":[{"type":"chorus","enabled":true,"mix":0.2,"rate":0.25,"depth":0.002},{"type":"reverb","enabled":true,"mix":0.4,"size":2,"decay":0.72}],"id":"recovered-2","name":"Velvet screen glow","real":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"imag":[0,0.9632835388183594,0,-0.016213219612836838,0,0.005837931763380766,0,-0.002979434095323086,0,0.0018030975479632616,0,-0.001207638531923294,0,0.0008651618845760822,0,-0.0006502897595055401,0,0.0005066880257800221,0,-0.0004059980856254697,0,0.000332681811414659,0,-0.00027764649712480605,0,0.00023528370365966111,0,-0.0002019817620748654,0,0.00017532963829580694,0,-0.0010145405540242791,0,0.0008967354660853744,0,-0.0001209521506098099,0,0.0001084260584320873,0,-0.00009777760715223849,0,0.00008864953269949183,0,-0.00008076570520643145,0,0.00007390993414446712,0,-0.00006791103805880994,0,0.00006263203249545768,0,-0.00005796225377707742,0,0.00005381153096095659,0,-0.00005010575841879472,0,0.00004678362893173471,0,-0.00004379402889753692,0,0.00004109408473595977,0,-0.00025515773450024426,0,0.00024047668557614088,0,-0.00003439687498030253,0,0.00003254396142438054,0,-0.00003084587660850957,0,0.000029285900382092223,0,-0.00002784952084766701,0,0.000026524074201006442,0,-0.00002529848825361114,0,0.000024163033231161535,0,-0.000023109150788513944,0,0.000022129259377834387,0,-0.000021216654204181395,0,0.000020365368982311338,0,-0.000019570084987208247,0,0.000018826052837539464,0,-0.00011969063052674755,0,0.00011537372483871877,0,-0.000016861024050740525,0,0.00001628352765692398,0,-0.000015739859009045176,0,0.000015227482435875572,0,-0.000014744089639862068,0,0.000014287591511674691,0,-0.000013856079931429122,0,0.000013447814126266167,0,-0.000013061207027931232,0,0.000012694803444901481,0,-0.000012347271876933519,0,0.000012017387234664056,0,-0.000011704027201631106,0,0.000011406156772864051,0,-0.00007343463221332058]},{"effects":[{"type":"echo","enabled":true,"mix":0.35,"time":0.703125,"feedback":0.4},{"type":"reverb","enabled":true,"mix":0.3,"size":1.8,"decay":0.7}],"id":"recovered-3","name":"Distant save point","real":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"imag":[0,0.9744569659233093,0,-0.010808813385665417,0,0.0038919546641409397,0,-0.001986289396882057,0,0.0012020650319755077,0,-0.0008050923352129757,0,0.0005767745897173882,0,-0.00043352649663574994,0,0.0003377920074854046,0,-0.0002706653904169798,0,0.00022178787912707776,0,-0.0001850976696005091,0,0.00015685580729041249,0,-0.00013465450319927186,0,0.00011688642553053796,0,-0.0010263085132464767,0,0.0009071370004676282,0,-0.0000806347670732066,0,0.00007228404138004407,0,-0.00006518507143482566,0,0.00005909968967898749,0,-0.0000538438034709543,0,0.000049273290642304346,0,-0.000045274024159880355,0,0.00004175468711764552,0,-0.00003864150130539201,0,0.000035874352761311457,0,-0.00003340384137118235,0,0.00003118908716714941,0,-0.000029196020477684215,0,0.000027396055884310044,0,-0.0002581173903308809,0,0.00024326605489477515,0,-0.000022931249986868352,0,0.00002169597428292036,0,-0.00002056391713267658,0,0.000019523933588061482,0,-0.000018566346625448205,0,0.000017682716134004295,0,-0.00001686565883574076,0,0.000016108688214444555,0,-0.00001540609991934616,0,0.000014752838978893124,0,-0.00001414443613612093,0,0.000013576912351709325,0,-0.0000130467242343002,0,0.000012550702194857877,0,-0.00012107896327506751,0,0.00011671198444673792,0,-0.000011240682397328783,0,0.000010855685104615986,0,-0.00001049323873303365,0,0.00001015165435092058,0,-0.000009829393093241379,0,0.000009525061614112929,0,-0.000009237386620952748,0,0.000008965209417510778,0,-0.000008707471351954155,0,0.000008463201993436087,0,-0.000008231514584622346,0,0.000008011591489776038,0,-0.000007802685104252305,0,0.000007604104666825151,0,-0.00007428642857121304]},{"effects":[],"id":"cafe-bass","name":"Round cafe bass","real":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"imag":[0,0.9632079005241394,0.04278145730495453,0.016839805990457535,0.010975834913551807,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,-0.00022616820933762938,-0.00018210551934316754,-0.0001922923984238878,-0.0010144609259441495,0,0.0008966650348156691,0.0001501916121924296,0.00012562653864733875,0.00013770208170171827,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,-0.00005103621515445411,-0.00004268222983228043,-0.000046726519940420985,-0.00025513768196105957,0,0.00024045779719017446,0.000041502920794300735,0.000035726196074392647,0.00004025341695523821,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,-0.000023095453798305243,-0.000019553615857148543,-0.000021664207451976836,-0.00011968123726546764,0,0.00011536466627148911,0.000020129473341512494,0.000017512644262751564,0.000019937673641834408,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,-0.000013903065337217413,-0.000011846965207951143,-0.000013209143617132213,-0.00007342886965489015]},{"effects":[{"type":"chorus","enabled":true,"mix":0.22,"rate":0.3,"depth":0.0015},{"type":"reverb","enabled":true,"mix":0.46,"size":1.7,"decay":0.67}],"id":"cafe-room","name":"Velvet room","real":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"imag":[0,0.9837681651115417,0,-0.006305140908807516,0,0.0022703069262206554,0,-0.0011586687760427594,0,0.0007012046407908201,0,-0.00046963721979409456,0,0.00033645183430053294,0,-0.00025289045879617333,0,0.00019704534497577697,0,-0.0001578881492605433,0,0.0001293762616114691,0,-0.00010797363938763738,0,0.00009149921970674768,0,-0.00007854845898691565,0,0.00006818374822614715,0,-0.0010361152235418558,0,0.0009158049360848963,0,-0.00004703694867203012,0,0.0000421656877733767,0,-0.0000380246237909887,0,0.00003447481867624447,0,-0.00003140888293273747,0,0.000028742751965182833,0,-0.000026409848942421377,0,0.000024356901121791452,0,-0.000022540876670973375,0,0.000020926705474266782,0,-0.000019485572920530103,0,0.000018193633877672255,0,-0.000017031012248480693,0,0.00001598103335709311,0,-0.0002605837653391063,0,0.00024559051962569356,0,-0.000013376563401834574,0,0.000012655985301535111,0,-0.000011995618478977121,0,0.000011388961866032332,0,-0.000010830369319592137,0,0.000010314917744835839,0,-0.000009838300684350543,0,0.000009396735549671575,0,-0.000008986891771201044,0,0.000008605822586105205,0,-0.000008250921382568777,0,0.00000791986531112343,0,-0.000007610588909301441,0,0.000007321242719626753,0,-0.00012223591329529881,0,0.00011782719957409427,0,-0.0000065570648075663485,0,0.000006332482826110208,0,-0.000006121056230767863,0,0.000005921798674535239,0,-0.000005733812940889038,0,0.000005556285486818524,0,-0.000005388475528889103,0,0.000005229705493547954,0,-0.0000050793582886399236,0,0.00000493686820846051,0,-0.000004801716841029702,0,0.000004673428520618472,0,-0.000004551566235022619,0,0.000004435727532836609,0,-0.00007499625644413754]},{"frequency":196,"effects":[],"id":"night-nylon","name":"Soft nylon patch","real":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"imag":[0,0.7799999713897705,0.2199999988079071,0.11999999731779099,0.054999999701976776,0.02500000037252903,0.012000000104308128,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},{"frequency":196,"effects":[],"id":"era-soft-reed","name":"Distant soft reed","real":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"imag":[0,0.8799999952316284,0.07500000298023224,0.11999999731779099,0.02800000086426735,0.014000000432133675,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},{"frequency":196,"effects":[],"id":"era-moon-harp","name":"Moonlit harp patch","real":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"imag":[0,0.8600000143051147,0.15000000596046448,0.06499999761581421,0.03500000014901161,0.012000000104308128,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},{"frequency":196,"effects":[],"id":"era-horizon","name":"Quiet horizon pad","real":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"imag":[0,0.9300000071525574,0,0.04500000178813934,0,0.012000000104308128,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},{"effects":[{"type":"echo","enabled":true,"mix":0.16,"time":0.3125,"feedback":0.25},{"type":"reverb","enabled":true,"mix":0.18,"size":1.2,"decay":0.56}],"id":"sunrise-lead","name":"Golden triangle","real":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"imag":[0,0.8595794439315796,0,-0.0472579263150692,0,0.036802660673856735,0,-0.01199765782803297,0,0.009373250417411327,0,-0.005662101786583662,0,0.004225487820804119,0,-0.003135278820991516,0,0.0024429236073046923,0,-0.001982912188395858,0,0.0015598030295222998,0,-0.0014433219330385327,0,0.0009474462131038308,0,-0.0012733046896755695,0,0.0005110468482598662,0,-0.000905318243894726,0,0.0008001957321539521,0,-0.0003525485808495432,0,0.0006835241219960153,0,-0.0003937332658097148,0,0.00046083712368272245,0,-0.00037867590435780585,0,0.0003609793202485889,0,-0.0003274233313277364,0,0.00030197136220522225,0,-0.0002830901648849249,0,0.00025229930179193616,0,-0.0002604705805424601,0,0.0001883894728962332,0,-0.0002760800998657942,0,0.00011978011025348678,0,-0.0002276882587466389,0,0.00021458770788740367,0,-0.00010025923984358087,0,0.0002051590126939118,0,-0.00012421092833392322,0,0.00015224028902594,0,-0.0001305745099671185,0,0.0001295447291340679,0,-0.00012197303294669837,0,0.00011649860243778676,0,-0.0001128660878748633,0,0.00010375465353718027,0,-0.00011029298912035301,0,0.00008200776937883347,0,-0.0001233709481311962,0,0.00005487375528900884,0,-0.00010680512059479952,0,0.00010295295214746147,0,-0.00004914612873108126,0,0.00010265229502692819,0,-0.00006338165258057415,0,0.00007915878086350858,0,-0.00006912874232511967,0,0.00006978121382417157,0,-0.00006680509977741167,0,0.00006483670586021617,0,-0.00006379149999702349,0,0.00005952051651547663,0,-0.0000641862498014234,0,0.00004839191024075262,0,-0.00007378286682069302,0,0.00003324640783830546,0,-0.00006552888953592628]},{"effects":[{"type":"chorus","enabled":true,"mix":0.16,"rate":0.45,"depth":0.0015},{"type":"reverb","enabled":true,"mix":0.24,"size":1.4,"decay":0.6}],"id":"sunrise-chords","name":"Daylight chords","real":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"imag":[0,0.9451177716255188,0.06581762433052063,0.025907393544912338,0.016885900869965553,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,-0.0003479511069599539,-0.00028016234864480793,-0.000295834441203624,-0.0009954081615433097,0,0.0008798246853984892,0.00023106401204131544,0.0001932715967996046,0.00021184937213547528,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,-0.00007851725968066603,-0.00006566497177118436,-0.00007188695599325001,-0.0002503459108993411,0,0.00023594172671437263,0.00006385064625646919,0.00005496338053490035,0.00006192833825480193,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,-0.00003553146598278545,-0.00003008248495461885,-0.00003332955020596273,-0.00011743348295567557,0,0.00011319798795739189,0.00003096841828664765,0.000026942530894302763,0.000030673345463583246,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,-0.000021389332687249407,-0.000018226101019536145,-0.00002032176053035073,-0.00007204979192465544]},{"effects":[],"id":"sunrise-bass","name":"Pocket stride bass","real":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"imag":[0,0.8999673128128052,0,-0.0468381904065609,0,0.016865136101841927,0,-0.008607253432273865,0,0.005208948627114296,0,-0.0034887336660176516,0,0.0024993564002215862,0,-0.0018786148866638541,0,0.001463765394873917,0,-0.0011728834360837936,0,0.0009610808338038623,0,-0.0008020898676477373,0,0.0006797084934078157,0,-0.0005835028714500368,0,0.000506507814861834,0,-0.0009478551801294088,0,0.0008377933991141617,0,-0.0003494173288345337,0,0.00031323081930167973,0,-0.0002824686234816909,0,0.00025609866133891046,0,-0.00023332313867285848,0,0.00021351758914534003,0,-0.00019618745136540383,0,0.00018093698599841446,0,-0.00016744651657063514,0,0.00015545553469564766,0,-0.0001447499671485275,0,0.00013515270256903023,0,-0.00012651608267333359,0,0.00011871624883497134,0,-0.0002383863175055012,0,0.0002246702351840213,0,-0.0000993687572190538,0,0.00009401589340995997,0,-0.00008911030454328284,0,0.00008460371464025229,0,-0.00008045417052926496,0,0.00007662510324735194,0,-0.00007308452040888369,0,0.00006980432226555422,0,-0.0000667597705614753,0,0.00006392897194018587,0,-0.00006129255780251697,0,0.000058833287766901776,0,-0.00005653580228681676,0,0.000054386375268222764,0,-0.00011182341404492036,0,0.0001077902561519295,0,-0.000048709622205933556,0,0.0000470412996946834,0,-0.000045470704208128154,0,0.00004399050521897152,0,-0.00004259403795003891,0,0.00004127526335651055,0,-0.000040028673538472503,0,0.00003884924080921337,0,-0.0000377323740394786,0,0.000036673878639703616,0,-0.000035669894714374095,0,0.000034716897062025964,0,-0.000033811633329605684,0,0.00003295112037449144,0,-0.00006860780558781698]},{"effects":[{"type":"echo","enabled":true,"mix":0.23,"time":0.46875,"feedback":0.28},{"type":"reverb","enabled":true,"mix":0.15,"size":1.1,"decay":0.55}],"id":"sunrise-arps","name":"Coffee pixels","real":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"imag":[0,0.8925183415412903,0,-0.05044112727046013,0,0.018162455409765244,0,-0.009269350208342075,0,0.005609637126326561,0,-0.0037570977583527565,0,0.0026916146744042635,0,-0.0020231236703693867,0,0.0015763627598062158,0,-0.0012631051940843463,0,0.0010350100928917527,0,-0.000863789115101099,0,0.0007319937576539814,0,-0.0006283876718953252,0,0.0005454699858091772,0,-0.0009400098351761699,0,0.0008308590040542185,0,-0.00037629558937624097,0,0.0003373255021870136,0,-0.0003041969903279096,0,0.00027579854940995574,0,-0.00025127106346189976,0,0.00022994201572146267,0,-0.00021127879153937101,0,0.00019485520897433162,0,-0.000180327013367787,0,0.00016741364379413426,0,-0.00015588458336424083,0,0.00014554907102137804,0,-0.00013624809798784554,0,0.00012784826685674489,0,-0.00023641320876777172,0,0.00022281066048890352,0,-0.00010701250721467659,0,0.00010124788241228089,0,-0.00009596494783181697,0,0.00009111169492825866,0,-0.0000866429545567371,0,0.00008251934195868671,0,-0.00007870640547480434,0,0.0000751738843973726,0,-0.00007189513416960835,0,0.00006884658068884164,0,-0.00006600737106055021,0,0.00006335892248898745,0,-0.00006088471127441153,0,0.00005856994175701402,0,-0.00011089786130469292,0,0.00010689808550523594,0,-0.00005245651846053079,0,0.00005065986260888167,0,-0.0000489684498461429,0,0.00004737438939628191,0,-0.000045870503527112305,0,0.00004445028389454819,0,-0.00004310780423111282,0,0.00004183764394838363,0,-0.00004063486630911939,0,0.00003949494566768408,0,-0.000038413734728237614,0,0.00003738742816494778,0,-0.000036412529880180955,0,0.00003548582026269287,0,-0.00006803993892390281]}]};
(function () {
  'use strict';
  const C = DotWave, $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = (value, min, max, fallback = min) => Number.isFinite(+value) ? C.clamp(+value, min, max) : fallback;
  const steps = ['sound', 'beat', 'melody', 'arrange', 'export', 'telephone'];
  const titles = {sound:'Sound', beat:'Beat', melody:'Melody', arrange:'Arrange', export:'Export', telephone:'Telephone'};
  const colors = {sound:'#b8f58b', beat:'#ffb783', melody:'#c7b1ff', arrange:'#99d4f8', export:'#b8f58b', telephone:'#f4a8c7'};
  const roots = ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
  const STORE = 'mozcorp-public-studio-v2-draft', MASTER = 'mozcorp-public-studio-v2-master', LIBRARY = 'mozcorp-public-studio-v2-library';
  let p = C.blank(), undo = [], redo = [], savedVersion = null, revision = 0, fileMode = 'project', fileTicket = 0;
  let saveTimer, toastTimer, gesture = null, lastExportAudio = null;
  const telephone = {items:[], selected:null, loading:false, loaded:false, error:'', ticket:0};
  const studioParams = new URLSearchParams(location.search);
  const embeddedTelephone = window.parent !== window && studioParams.get('embed') === 'telephone';
  let requestedTelephone = studioParams.get('project');
  const ui = {step:'sound', part:'melody', sound:'stock-sine', drum:0, beatBar:0, grid:.25, length:.5, velocity:.65,
    noteMode:'draw', selected:[], cursor:0, zoom:1, songZoom:1, clip:null, editTarget:null, pattern:null,
    noteBase:48, recover:null, recovered:false, busy:false, exportScope:'song', exportRate:44100, noteCursor:0,
    soundName:'Little green wave', patternNames:{}, backing:false,
    shaper:{side:'a',tool:'draw',reach:2,selection:{a:[],b:[]},cursor:{a:8,b:8},markers:true}};
  const audio = new DotAudio(error => { if (error) notify(error.message, true); renderTransport(); renderMiniPlayers(); });
  try { audio.volume = num(localStorage.getItem(MASTER) ?? 45, 0, 100) / 100; } catch {}
  function notify(text, error = false) {
    $('status').textContent = text; $('status').classList.toggle('busy', error);
    $('toast').textContent = text; $('toast').classList.add('visible'); clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), error ? 6500 : 3600);
  }
  function announce(text) { $('status').textContent = text; $('status').classList.remove('busy'); }
  function estimate(project) { return project.song.audio.reduce((sum, c) => sum + c.samples.length * 4, 0) + JSON.stringify({...project, song:{...project.song,audio:[]}}).length * 2; }
  function checkpoint() { return {project:structuredClone(p), clip:ui.clip && {...ui.clip}, bytes:estimate(p)}; }
  function trimHistory() { while (undo.length > 24 || (undo.length > 1 && undo.reduce((sum, s) => sum + s.bytes, 0) > 64000000)) undo.shift(); }
  function changed(text, paint = true) {
    revision++; lastExportAudio = null; $('save-state').textContent = 'Unsaved changes · keeping a browser draft';
    audio.refresh(p); clearTimeout(saveTimer); saveTimer = setTimeout(saveDraft, 900);
    if (paint) render(); else renderTransport(); if (text) announce(text);
  }
  function commit(fn, text, paint = true) {
    const before = checkpoint();
    try { fn(); undo.push(before); trimHistory(); redo = []; changed(text, paint); }
    catch (error) { p = before.project; ui.clip = before.clip; render(); notify(error.message, true); }
  }
  function history(direction) {
    const from = direction === 'undo' ? undo : redo, to = direction === 'undo' ? redo : undo;
    if (!from.length) return;
    to.push(checkpoint()); const previous = from.pop(); p = previous.project; ui.clip = previous.clip; ui.selected = []; ui.editTarget = null;
    ui.beatBar = Math.min(ui.beatBar, p.beat.pattern.bars - 1); changed(direction === 'undo' ? 'Previous edit restored.' : 'Edit restored.');
  }
  function saveDraft() {
    try {
      const text = C.serialize(p); if (text.length > 8500000) throw new Error('This project is too large for browser recovery.');
      localStorage.setItem(STORE, text);
      localStorage.setItem(LIBRARY, JSON.stringify({kind:'dot-wave-library',version:1,waves:p.library}));
      $('save-state').textContent = savedVersion === revision ? 'Project file saved · browser draft current' : 'Draft kept in this browser · save a file to keep it';
    } catch { $('save-state').textContent = 'Save a project file to keep your work'; }
  }
  function shareSounds(project) {
    project.library=C.W.prepareImport(project.library,p.library,()=>C.id('sound')).waves;
    return project;
  }
  function setStep(step) {
    if (!steps.includes(step)) return; ui.step = step; ui.selected = [];
    document.documentElement.style.setProperty('--accent', colors[step]);
    if (location.hash !== '#' + step) window.history.replaceState(null, '', '#' + step);
    render();
  }
  function renderTransport() {
    const scope = scopeForStep(); $('play').innerHTML = `${audio.playing || audio.pending ? 'Ⅱ' : '▶'} <span>${audio.pending ? 'Preparing…' : audio.playing ? 'Pause' : 'Play ' + (scope === 'song' ? 'song' : scope)}</span>`;
    if($('bpm')!==document.activeElement)$('bpm').value = p.song.bpm; $('meter').textContent = p.song.meter.numerator + '/' + p.song.meter.denominator;
    $('master').value = Math.round(audio.volume * 100); $('master-value').textContent = Math.round(audio.volume * 100) + '%';
    $('live-dot').classList.toggle('on', audio.playing); $('playing-scope').textContent = audio.pending ? 'RENDERING' : audio.playing ? audio.scope.toUpperCase() : 'STOPPED';
    $('undo').disabled = !undo.length; $('redo').disabled = !redo.length;
    $('song-play').textContent = audio.playing && audio.scope === 'song' ? '♪ Song playing' : '▶ Hear song';
  }
  function scopeForStep() { return ['arrange','export','telephone'].includes(ui.step) ? 'song' : ui.step; }
  function renderNav() {
    const details = {sound: `${p.library.length} sounds`, beat:`${p.beat.pattern.bars} measure${p.beat.pattern.bars === 1 ? '' : 's'} · ${Math.round(p.beat.pattern.swing * 100)}% swing`,
      melody:`${p.melody.tracks.reduce((s,t) => s+t.notes.length,0)} notes · ${p.melody.bars} measures`, arrange:`${p.song.bars} measures · ${p.song.tracks.length} tracks`, export:'WAV · MIDI · project', telephone:'Story · world · soundtrack'};
    $('workflow').innerHTML = '<span class="nav-title">MAKE SOMETHING YOURS</span>' + steps.map((step, i) => `<button data-action="step" data-step="${step}" class="${ui.step === step ? 'active' : ''}" ${ui.step === step ? 'aria-current="step"' : ''}><span class="step-number">0${i+1}</span><span><span class="step-label">${titles[step]}</span><span class="step-detail">${esc(details[step])}</span></span></button>${i<4?'<span class="trail">·</span>':''}`).join('') +
      '<div class="nav-bottom"><button data-action="starter"><span class="nav-star">✦</span> Try a starter</button><button data-action="classic"><span>▦</span> More studio tools</button><button data-action="help"><span>?</span> A little guidance</button><p>Small ideas become<br>whole songs.<br>One step at a time.</p></div>';
  }
  const waveDecor = '<svg class="decor-wave" viewBox="0 0 120 42" fill="none" aria-hidden="true"><path d="M0 21h15l4-8 6 18 6-28 6 37 6-28 6 18 6-9h10l5-12 6 24 6-30 6 35 6-26 6 16 6-7h14" stroke="currentColor" stroke-width="2" stroke-linejoin="miter"/></svg>';
  function heading(index, title, description) { return `<div class="stage-heading"><div><span class="eyebrow">0${index} / ${titles[steps[index-1]].toUpperCase()}</span><h1>${title}</h1><p>${description}</p></div>${waveDecor}</div>`; }
  function panel(title, content, right = '', classes = '') { return `<section class="panel ${classes}"><div class="panel-head"><h2>${title}</h2>${right}</div>${content}</section>`; }
  function range(key, label, value, min, max, step = 1, suffix = '', options = '') { return `<div class="range-field"><label for="r-${key.replaceAll('.','-')}">${label}</label><output>${esc(value)}${suffix}</output><input id="r-${key.replaceAll('.','-')}" type="range" data-range="${key}" data-suffix="${suffix}" min="${min}" max="${max}" step="${step}" value="${value}" ${options}></div>`; }
  function fxFactor(key) { return ['mix','feedback','decay'].includes(key)?100:['time','depth'].includes(key)?1000:1; }
  function effectControls() {
    return p.patch.project.effects.map((fx,i)=>`<div class="effect-block"><div class="effect-item"><span>${esc(C.FX.specs[fx.type].label)}</span><input type="checkbox" data-change="fx-enabled" data-index="${i}" aria-label="Enable ${fx.type}" ${fx.enabled?'checked':''}><button data-action="remove-effect" data-index="${i}" aria-label="Remove ${fx.type}">×</button></div><div class="effect-parameters">${Object.entries(C.FX.specs[fx.type]).filter(([,v])=>Array.isArray(v)).map(([key,limits])=>{
      const factor=fxFactor(key),suffix=factor===100?'%':factor===1000?' ms':key==='rate'||key==='frequency'?' Hz':'×';
      return range('fx-'+i+'-'+key,key.charAt(0).toUpperCase()+key.slice(1),Math.round(fx[key]*factor*10)/10,limits[1]*factor,limits[2]*factor,factor===1&&key!=='frequency'?.1:1,suffix);
    }).join('')}</div></div>`).join('')||'<span class="subtle">Start simple. Add a little space.</span>';
  }
  function selectOptions(values, selected) { return values.map(v => { const [value, label] = Array.isArray(v) ? v : [v, v]; return `<option value="${esc(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${esc(label)}</option>`; }).join(''); }
  function soundOptions(selected, drums = false) { return (drums ? '<option value="drums" '+(selected==='drums'?'selected':'')+'>Pocket drums</option>' : '<option value="piano" '+(selected==='piano'?'selected':'')+'>Pocket piano</option>') + selectOptions(p.library.map(w => [w.id,w.name]), selected); }
  function next(to, title, text) { return `<div class="stage-next"><p>${text}</p><button class="next-button" data-action="step" data-step="${to}">${title} <span aria-hidden="true">→</span></button></div>`; }
  function smallWave(wave, color = '#b8f58b') {
    const signal = C.W.signal(wave).table, points = Array.from({length:64},(_,i)=>`${i*1.57},${15-C.S.sample(signal,i/63)*12}`).join(' ');
    return `<svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}" stroke="${color}" fill="none" stroke-width="1.5"/></svg>`;
  }
  function soundShelf() {
    return `<section class="panel shelf"><div class="shelf-head"><h2>YOUR SOUND BOX <span class="mini-badge">${p.library.length}/64</span></h2><div><button class="quiet" data-action="import-library">Import</button><button class="quiet" data-action="export-library">Export</button><button class="quiet danger" data-action="remove-sound">Remove chosen</button></div></div><p class="shelf-preview-hint">Pick the wave to edit it. Press its little play button for a three-second listen.</p><div class="shelf-tiles">${p.library.map(w => `<article class="sound-tile ${ui.sound===w.id?'selected':''}"><button class="sound-pick" data-action="pick-sound" data-id="${esc(w.id)}" title="Load ${esc(w.name)} into the editor">${smallWave(w)}<strong>${esc(w.name)}</strong><small>${w.id.startsWith('stock-')?'BUILT-IN':'YOUR SOUND'}</small></button><button class="mini-play" data-action="preview-sound" data-id="${esc(w.id)}" data-name="${esc(w.name)}" aria-label="Play ${esc(w.name)} for 3 seconds" aria-pressed="false"><span class="mini-icon">▶</span><span class="mini-time">3s</span><span class="mini-pitch">${Math.round(w.frequency??134)} Hz</span></button></article>`).join('')}</div></section>`;
  }
  function renderMiniPlayers() {
    if(typeof audio==='undefined')return;
    for(const button of document.querySelectorAll('.mini-play')){
      const active=audio.mini?.id===button.dataset.id,pending=audio.miniPending===button.dataset.id,left=audio.miniRemaining();
      button.classList.toggle('previewing',active);button.classList.toggle('preparing',pending);button.setAttribute('aria-pressed',String(active||pending));
      button.setAttribute('aria-label',`${active?'Stop preview of':pending?'Cancel preview of':'Play'} ${button.dataset.name}${active||pending?'':' for 3 seconds'}`);
      button.querySelector('.mini-icon').textContent=active?'■':pending?'·':'▶';
      button.querySelector('.mini-time').textContent=active?Math.max(.1,Math.ceil(left*10)/10).toFixed(1)+'s':pending?'…':'3s';
      button.style.setProperty('--preview-progress',active?(1-left/3)*100+'%':'0%');
    }
  }
  function patternShelf() {
    return `<section class="panel shelf"><div class="shelf-head"><h2>YOUR PATTERN BOX <span class="mini-badge">${p.patterns.length+p.beatShelf.length}</span></h2><div><button class="quiet" data-action="import-pattern">Import</button><button class="quiet" data-action="export-pattern">Export selected</button><button class="quiet danger" data-action="remove-pattern">Remove</button></div></div><div class="shelf-tiles">${p.patterns.map(item => `<button draggable="true" class="pattern-tile ${ui.pattern===item.id?'selected':''}" data-action="pick-pattern" data-id="${esc(item.id)}" data-kind="pattern"><span class="pattern-icon">▂ ▆ ▃ ▅</span><strong>${esc(item.name)}</strong><small>${item.duration/4} measures · ${item.notes.length} notes</small></button>`).join('')}${p.beatShelf.map(item => `<button draggable="true" class="pattern-tile beat" data-action="pick-pattern" data-id="${esc(item.id)}" data-kind="beat"><span class="pattern-icon">▪ · ▪ · ▪ ▪ · ▪</span><strong>${esc(item.name)}</strong><small>${item.pattern.bars} measures · BEAT</small></button>`).join('')}${!p.patterns.length&&!p.beatShelf.length?'<p class="empty-shelf">Keep a beat or melody, then drag it into your song.</p>':''}</div></section>`;
  }
  function shapeWorkshop() {
    const s=ui.shaper,side=s.side,points=p.patch.project[side].points,marks=C.Shape.landmarks(points),cursor=s.cursor[side],selected=s.selection[side];
    const tools=[['draw','✎ Draw'],['grab','↕ Grab'],['peak','▲ Peak'],['trough','▼ Trough'],['edge','╱ Zero edge'],['select','▧ Select arc']];
    return `<section class="shape-workshop"><div class="shape-workshop-head"><div><h3>Peaks, troughs & edges</h3><p>Find the outline. Then pull it into shape.</p></div><div class="shape-side-tabs">${['a','b'].map(key=>`<button data-action="shape-side" data-side="${key}" aria-pressed="${side===key}" class="${side===key?'active':''}">Wave ${key.toUpperCase()}</button>`).join('')}</div></div><div class="shape-tool-row">${tools.map(([tool,label])=>`<button data-action="shape-tool" data-tool="${tool}" class="${s.tool===tool?'active':''}" aria-pressed="${s.tool===tool}">${label}</button>`).join('')}<label>Reach<select data-change="shape-reach" aria-label="Shaping brush reach">${selectOptions([[0,'One dot'],[1,'Fine'],[2,'Small'],[4,'Medium'],[6,'Wide']],s.reach)}</select></label></div><div class="shape-legend"><span class="peak-legend">▲ peak</span><span class="trough-legend">▼ trough</span><span class="edge-legend">┊ zero crossing</span><span id="shape-selection-summary">Wave ${side.toUpperCase()} · ${selected.length?selected.length+' selected dots':'whole cycle'}</span></div><div class="shape-selection-row"><span>Find</span><button data-action="shape-select" data-kind="all">Whole cycle</button><button data-action="shape-select" data-kind="peaks">Peaks</button><button data-action="shape-select" data-kind="troughs">Troughs</button><button data-action="shape-select" data-kind="edges">Zero edges</button><label class="shape-marker-toggle"><input type="checkbox" data-change="shape-markers" ${s.markers?'checked':''}> Show markers</label></div><div class="shape-levels"><div>${range('shape-peak','Peak height · whole wave',Math.round(Math.max(0,marks.high)*100),0,100,1,'%')}</div><div>${range('shape-trough','Trough depth · whole wave',Math.round(Math.max(0,-marks.low)*100),0,100,1,'%')}</div></div><div class="shape-point-row"><label>Dot<input type="number" data-change="shape-dot" min="1" max="32" value="${cursor+1}" aria-label="Selected waveform dot"></label><label>Height<input type="number" data-change="shape-height" min="-1" max="1" step=".05" value="${points[cursor].toFixed(3)}" aria-label="Selected dot height"></label><span>−1 trough · 0 edge · +1 peak</span></div><div class="shape-operation-row"><span>Sculpt</span><button data-action="shape-transform" data-operation="round">Round edges</button><button data-action="shape-transform" data-operation="sharpen">Sharpen edges</button><button data-action="shape-transform" data-operation="flatten">Flatten</button><button data-action="shape-transform" data-operation="zero">To zero</button><button data-action="shape-transform" data-operation="invert">Flip</button></div><div class="shape-point-row shape-arc-row"><label>Arc from<input id="shape-arc-from" type="number" min="1" max="32" value="${selected.length?selected[0]+1:1}" aria-label="Arc start dot"></label><label>to<input id="shape-arc-to" type="number" min="1" max="32" value="${selected.length?selected.at(-1)+1:17}" aria-label="Arc end dot"></label><button data-action="shape-select-arc">Select arc</button><span>Wraps through the cycle end.</span></div><div class="shape-operation-row"><span>Arc</span><button data-action="shape-transform" data-operation="line">Straighten arc</button><button data-action="shape-transform" data-operation="curve">Curve arc</button><span class="shape-cycle-label">Cycle</span><button data-action="shape-center">Center</button><button data-action="shape-shift" data-delta="-1" aria-label="Shift waveform left one dot">◂ Shift</button><button data-action="shape-shift" data-delta="1" aria-label="Shift waveform right one dot">Shift ▸</button></div><p class="shape-help" id="shape-help">${shapeToolHelp()}</p></section>`;
  }
  function shapeToolHelp() {
    return {draw:'Draw across the dots. The first dot is shared by both ends. One stroke is one Undo.',grab:'Grab a dot and drag up or down. Reach gently carries its neighbours. Highlighted dots move together.',peak:'Place a peak anywhere in the cycle. Reach controls its width; Grab adjusts its height.',trough:'Place a trough anywhere in the cycle. Reach controls its width; Grab adjusts its depth.',edge:'Place a zero-height anchor. Reach straightens the neighbouring transition through it.',select:'Drag across the cycle to highlight an arc. Straighten, curve, flatten, or sculpt just those dots.'}[ui.shaper.tool];
  }
  function soundView() {
    const patch=p.patch.project;
    const voices=['a','b'].map(side=>{const v=patch[side],marks=C.Shape.landmarks(v.points);return `<div class="sound-voice"><div class="control-row" style="justify-content:space-between"><button class="voice-title voice-focus ${side}" data-action="shape-side" data-side="${side}" aria-label="Edit wave ${side.toUpperCase()}" aria-pressed="${ui.shaper.side===side}">WAVE ${side.toUpperCase()}</button><select data-change="shape" data-side="${side}" aria-label="Wave ${side.toUpperCase()} shape">${selectOptions([...C.S.TYPES.map(t=>[t,t.charAt(0).toUpperCase()+t.slice(1)]),['custom','Your drawing']],v.shape)}</select></div><div class="wave-frame ${ui.shaper.side===side?'editing-wave':''}"><canvas id="wave-${side}" data-wave="${side}" tabindex="0" aria-label="Shape wave ${side.toUpperCase()} with ${ui.shaper.tool} tool; start and end are linked"></canvas><span class="wave-caption">32 DOTS · LINKED ENDS</span></div><div class="live-wave-preview"><button class="mini-play" data-action="preview-source" data-id="draft-${side}" data-side="${side}" data-name="Wave ${side.toUpperCase()}" aria-label="Play Wave ${side.toUpperCase()} for 3 seconds" aria-pressed="false" title="Hear this wave before blending"><span class="mini-icon">▶</span><span class="mini-time">3s</span><span class="mini-pitch">Wave ${side.toUpperCase()}</span></button><span>Hear the outline</span></div><div class="wave-contour-readout" id="wave-readout-${side}"><span class="peak-legend">▲ ${marks.high.toFixed(2)}</span><span class="trough-legend">▼ ${marks.low.toFixed(2)}</span><span>${marks.crossings.length} zero crossings</span></div><div class="voice-meta"><div class="wave-tools"><button data-action="random-wave" data-side="${side}">Random</button><button data-action="clear-wave" data-side="${side}">Clear</button></div><label>×<select data-change="ratio" data-side="${side}" aria-label="Wave ${side.toUpperCase()} pitch multiple">${selectOptions([1,2,3,4,8],v.ratio)}</select></label></div><div class="voice-settings">${range('wave-'+side+'-smoothness','Smoothness',Math.round((v.smoothness??0)*100),0,100,1,'%')}<p class="smoothness-hint">Round the curve. Your original dots stay editable.</p>${range('wave-'+side+'-level','Level',Math.round(v.level*100),0,100,1,'%')}${range('wave-'+side+'-phase','Phase',v.phase,0,360,1,'°')}</div></div>`;}).join('');
    const editor=panel('<span class="dot"></span> Shape the outline',`<div class="panel-body"><div class="split">${voices}</div></div>${shapeWorkshop()}<div class="blend-strip"><select data-change="collision" aria-label="Combine waves">${selectOptions([['blend','Blend A + B'],['subtract','Subtract A − B'],['multiply','Multiply A × B'],['fold','Wavefold']],patch.mode)}</select>${range('blend','A ↔ B · amount',Math.round(patch.amount*100),0,100,1,'%')}</div><div class="panel-body"><div class="result-head"><h3>THE RESULT</h3><button class="mini-play result-mini" data-action="preview-source" data-id="draft-result" data-side="result" data-name="Current result" aria-label="Play Current result for 3 seconds" aria-pressed="false"><span class="mini-icon">▶</span><span class="mini-time">3s</span><span class="mini-pitch">Result</span></button><label><input type="checkbox" data-change="normalize" ${patch.normalize?'checked':''}> Fill waveform</label></div><div class="wave-frame result"><canvas id="wave-result" aria-label="Combined sound waveform"></canvas><span class="wave-caption">YOUR SHAPE, HEARD TOGETHER</span></div><div class="result-meta"><span id="sound-pitch">${p.patch.pitch} Hz</span><span>SHAPE → LISTEN → KEEP</span></div></div>`,'<span class="chip">waveLAB / contour tools</span>');
    const inspector=panel('Make it yours',`<div class="panel-body"><div class="caption">PITCH & CHARACTER</div><label class="field">Listen at / Hz<input type="number" data-change="pitch" min="20" max="20000" value="${p.patch.pitch}" aria-label="Sound pitch in Hz"></label><label class="field-inline" style="margin-bottom:12px"><input type="checkbox" data-change="independent-pitches" ${p.patch.freePair?'checked':''}> Independent A / B pitches</label>${p.patch.freePair?`<div class="split"><label class="field">A / Hz<input type="number" min="20" max="19000" data-change="free-pitch" data-side="a" value="${p.patch.freePair.a}"></label><label class="field">B / Hz<input type="number" min="20" max="19000" data-change="free-pitch" data-side="b" value="${p.patch.freePair.b}"></label></div>`:''}${range('drive','Warmth',Math.round((patch.amp.enabled?(patch.amp.drive-1)/11:0)*100),0,100,1,'%')}<label class="field-inline"><input type="checkbox" data-change="invert" ${p.patch.inverted?'checked':''}> Invert polarity</label><hr><div class="caption">A LITTLE ATMOSPHERE</div><div class="effect-list">${effectControls()}</div><label class="field"><select data-change="add-effect" aria-label="Add an effect"><option value="">＋ Add an effect</option>${selectOptions(Object.entries(C.FX.specs).map(([key,v])=>[key,v.label]),'')}</select></label><hr><div class="caption">KEEP WHAT YOU MAKE</div><label class="field">Sound name<input id="sound-name" maxlength="48" value="${esc(ui.soundName)}" aria-label="Sound name"></label><button class="primary button-full" data-action="save-sound">＋ Keep this sound</button><p class="subtle" style="margin-top:12px">The little play buttons in your sound box give each saved sound a three-second listen.</p></div>`,'','inspector');
    return heading(1,'Find the shape.','Place peaks and troughs, bend their edges, then listen to what changes.')+`<div class="stage-content"><div>${editor}</div>${inspector}</div>`+soundShelf()+next('beat','Build a beat','<b>Found a shape you like?</b> Keep it as a sound and give it a heartbeat.');
  }
  function beatView() {
    const pattern = p.beat.pattern, count=C.D.stepsPerBar(pattern.meter), selected=pattern.tracks[ui.drum];
    const ruler = `<div class="beat-ruler" style="--steps:${count}"><span></span>${Array.from({length:count},(_,i)=>`<span>${i%4===0?i/4+1:'·'}</span>`).join('')}</div>`;
    const rows = pattern.tracks.map((track,row)=>`<div class="beat-row ${track.mute?'visually-muted':''}" style="--steps:${count}"><div class="drum-name ${row===ui.drum?'selected':''}"><button data-action="drum-select" data-row="${row}">${esc(track.name)}</button><button class="mute" data-action="drum-mute" data-row="${row}" aria-label="${track.mute?'Unmute':'Mute'} ${esc(track.name)}">${track.mute?'M':'·'}</button></div>${track.steps.slice(ui.beatBar*count,(ui.beatBar+1)*count).map((velocity,i)=>`<button class="step-pad ${velocity===1?'on':velocity===.5?'soft':''}" data-action="hit" data-row="${row}" data-step="${ui.beatBar*count+i}" data-local-step="${i}" aria-label="${esc(track.name)} step ${i+1}, ${velocity===1?'strong':velocity===.5?'soft':'off'}" aria-pressed="${velocity>0}">${velocity?'<span></span>':''}</button>`).join('')}</div>`).join('');
    const beatPanel = panel('<span class="dot" style="background:var(--orange)"></span> Find your pocket', `<div class="panel-body control-row" style="justify-content:space-between"><div class="segments">${Array.from({length:pattern.bars},(_,i)=>`<button class="${ui.beatBar===i?'active':''}" data-action="beat-bar" data-bar="${i}">M${i+1}</button>`).join('')}</div><label>Measures <select data-change="beat-bars" aria-label="Beat measures">${selectOptions([1,2,3,4,6,8],pattern.bars)}</select></label></div><div class="beat-grid">${ruler}${rows}</div><div class="beat-footer"><span>CLICK a hit · SHIFT + CLICK for a soft hit</span><span>${pattern.meter.numerator}/${pattern.meter.denominator} · ${count} STEPS / MEASURE</span></div><div class="panel-body"><div class="section-title" style="margin-top:0">START WITH A GROOVE</div><div class="control-row"><button data-action="beat-preset" data-preset="pocket">Pocket</button><button data-action="beat-preset" data-preset="four">Four on the floor</button><button data-action="beat-preset" data-preset="half">Half time</button><button data-action="repeat-beat">Copy measure → next</button><button data-action="clear-beat" class="quiet danger">Clear measure</button></div><div style="margin-top:20px">${range('swing','A little swing',Math.round(pattern.swing*100),0,45,1,'%')}</div></div>`, `<span class="chip" style="color:var(--orange);border-color:#755640;background:#362a24">beatMAP / reimagined</span>`);
    const inspector=panel(esc(selected.name)+' / sound', `<div class="panel-body"><div class="caption">SHAPE THIS DRUM</div><label class="field">Wave<select data-change="drum-wave">${selectOptions(p.library.map(w=>[w.id,w.name]),selected.waveId)}</select></label>${range('drum-pitch','Pitch',selected.pitch,30,2000,1,' Hz')}${range('drum-decay','Decay',Math.round(selected.decay*1000),30,1500,1,' ms')}${range('drum-noise','Texture / noise',Math.round(selected.noise*100),0,100,1,'%')}${range('drum-level','Drum level',Math.round(selected.level*100),0,100,1,'%')}<hr><label class="field">Beat name<input id="beat-name" maxlength="48" value="${esc(p.beat.name)}"></label><button class="secondary button-full" data-action="save-beat">＋ Keep beat in box</button><button class="primary button-full" style="margin-top:8px" data-action="beat-to-song">Add beat to song →</button>${ui.editTarget?.type==='beat'?'<button class="secondary button-full" style="margin-top:8px" data-action="apply-beat">Update this song beat →</button>':''}<p class="subtle" style="margin-top:10px">Each placement keeps its own beat. Your other clips stay as you made them.</p></div>`,'','inspector');
    return heading(2,'Give it a heartbeat.','Tap a few steps. Leave a little space. The groove is yours.')+`<div class="stage-content"><div>${beatPanel}${patternShelf()}</div>${inspector}</div>`+next('melody','Paint a melody','<b>Keep a beat going.</b> Audition your notes over it at the shared tempo.');
  }
  function pianoPaper(track) {
    const beatWidth=43*ui.zoom, total=p.melody.bars*4*beatWidth, notes=track.notes, low=ui.noteBase, high=low+24;
    const rows=[]; for(let midi=high;midi>=low;midi--) {
      const pc=midi%12, scale=p.melody.mode==='minor'?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11];
      const inside=scale.includes((pc-p.melody.root+12)%12);
      rows.push(`<div class="piano-row ${[1,3,6,8,10].includes(pc)?'black':''} ${pc===p.melody.root?'root':''}" data-midi="${midi}" data-name="${pc===0||pc===p.melody.root?esc(C.Song.noteName(midi)):''}" style="${inside?'':'opacity:.65'}">${notes.filter(n=>n.midi===midi).map(n=>`<button class="note ${ui.selected.includes(C.noteKey(n))?'selected':''}" data-note="${C.noteKey(n)}" aria-label="${C.Song.noteName(n.midi)} at beat ${n.start+1}, length ${n.duration}" style="left:${n.start*beatWidth}px;width:${Math.max(7,n.duration*beatWidth)}px">${n.duration>=.5?esc(C.Song.noteName(n.midi)):''}<span class="note-grip"></span></button>`).join('')}</div>`);
    }
    const outside=notes.filter(n=>n.midi<low||n.midi>high).length;
    return `<div class="piano-scroll" id="piano-scroll"><div id="piano-paper" class="piano-paper" style="width:${49+total}px;--bar-width:${beatWidth*4}px;--cell-width:${beatWidth*ui.grid}px" data-beat-width="${beatWidth}"><div class="piano-ruler">${Array.from({length:p.melody.bars},(_,b)=>`<span style="width:${beatWidth*4}px" data-action="note-cursor" data-beat="${b*4}">M${b+1}</span>`).join('')}</div>${rows.join('')}<div class="melody-playhead" id="melody-playhead" hidden></div></div></div><div class="editor-hint"><span>Drag to move · right edge to resize · Shift-click to group${outside?` · ${outside} notes outside this octave view`:''}</span><span>${track.notes.length} NOTES · ${ui.selected.length} SELECTED</span></div>`;
  }
  function melodyView() {
    const track=p.melody.tracks.find(t=>t.id===ui.part);
    const editor=panel('<span class="dot" style="background:var(--purple)"></span> A place for your notes', `<div class="part-tabs">${p.melody.tracks.map(t=>`<button class="${t.id===ui.part?'active':''}" data-action="part" data-part="${t.id}">${esc(t.name)}<small>${t.notes.length}</small></button>`).join('')}</div><div class="editor-toolbar">${[['draw','✎ Paint'],['select','▧ Select'],['erase','⌫ Erase']].map(([mode,label])=>`<button data-action="note-mode" data-mode="${mode}" class="${ui.noteMode===mode?'active':''}">${label}</button>`).join('')}<span class="toolbar-divider"></span><label>Grid<select data-change="grid">${selectOptions([[1,'¼'],[.5,'⅛'],[.25,'1/16'],[.125,'1/32']],ui.grid)}</select></label><label>Length<select data-change="note-length">${selectOptions([[.25,'1/16'],[.5,'⅛'],[1,'¼'],[2,'½'],[4,'Whole']],ui.length)}</select></label><button data-action="octave" data-delta="-12">Oct −</button><button data-action="octave" data-delta="12">Oct ＋</button><button data-action="zoom-notes" aria-label="Zoom note grid">${ui.zoom===1?'Zoom ＋':'Zoom −'}</button></div>${pianoPaper(track)}<div class="piano-key-row">${Array.from({length:13},(_,i)=>`<button data-action="key" data-midi="${60+i}" class="${[1,3,6,8,10].includes(i%12)?'black':''}" aria-label="Hear ${C.Song.noteName(60+i)}">${i%12===0?C.Song.noteName(60+i):[1,3,6,8,10].includes(i%12)?'':roots[i%12]}</button>`).join('')}</div><div class="panel-body control-row"><button data-action="select-notes">Select part</button><button data-action="duplicate-notes">Duplicate →</button><button data-action="transpose" data-delta="12">＋ Octave</button><button data-action="transpose" data-delta="-12">− Octave</button><button data-action="delete-notes" class="quiet danger">Delete selected</button><button data-action="clear-part" class="quiet">Clear part</button></div>`, '<span class="chip" style="color:var(--purple);border-color:#605076;background:#30273d">melodyLAB / reimagined</span>');
    const inspector=panel('Notes & possibilities', `<div class="panel-body"><div class="caption">THIS PART</div><label class="field">Sound<select data-change="part-sound">${soundOptions(track.instrument,ui.part==='rhythm')}</select></label>${range('part-level','Part level',Math.round(track.volume*100),0,100,1,'%')}<label class="field-inline"><input type="checkbox" data-change="part-mute" ${track.mute?'checked':''}> Mute this part</label><div class="split" style="margin-top:12px"><label class="field">Key<select data-change="root">${selectOptions(roots.map((n,i)=>[i,n]),p.melody.root)}</select></label><label class="field">Scale<select data-change="mode">${selectOptions([['major','Major'],['minor','Minor']],p.melody.mode)}</select></label></div><label class="field">Measures<select data-change="melody-bars">${selectOptions([1,2,4,8,12,16],p.melody.bars)}</select></label><hr><div class="caption">CHORD POCKET</div><div class="chord-buttons">${chordChoices().map(c=>`<button data-action="stamp-chord" data-degree="${c.degree}" title="Stamp ${c.label} at the note cursor">${esc(c.label)}</button>`).join('')}</div><p class="subtle">Click an M label to place the cursor. A chord stamps editable notes there.</p><hr><label class="field">Pattern name<input id="pattern-name" maxlength="48" value="${esc(ui.patternNames[ui.part]||track.name+' idea')}"></label><button class="secondary button-full" data-action="save-pattern">＋ Keep selected / part</button><button class="primary button-full" style="margin-top:8px" data-action="melody-to-song">Add parts to song →</button>${ui.editTarget?'<button class="primary button-full" style="margin-top:8px" data-action="apply-clip">Update this song clip →</button><p class="subtle">Editing one placement. Your other copies keep their notes.</p>':''}</div>`,'','inspector');
    return heading(3,'Paint what you hear.','A note. A phrase. A happy little accident. There’s no wrong place to start.')+`<div class="stage-content"><div>${editor}${patternShelf()}</div>${inspector}</div>`+next('arrange','Arrange your song','<b>Your notes stay editable.</b> Keep a phrase, place it, and make it grow.');
  }
  function chordChoices() {
    const scale=p.melody.mode==='minor'?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11];
    return scale.map((offset,degree)=>({degree,label:roots[(p.melody.root+offset)%12]+((p.melody.mode==='minor'?[false,false,false,true,true,false,false]:[false,true,true,false,false,true,false])[degree]?'m':'')+(degree===(p.melody.mode==='minor'?1:6)?'°':'')}));
  }
  function clipSvg(notes, duration, color = 'currentColor') {
    if (!notes.length) return '<svg viewBox="0 0 100 20"><path d="M0 10h100" stroke="currentColor" stroke-dasharray="2 5"/></svg>';
    const low=Math.min(...notes.map(n=>n.midi)),high=Math.max(...notes.map(n=>n.midi))+1;
    return `<svg viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">${notes.slice(0,150).map(n=>`<rect x="${n.start/duration*100}" y="${17-(n.midi-low)/(high-low)*15}" width="${Math.max(1,n.duration/duration*100)}" height="2.5" fill="${color}"/>`).join('')}</svg>`;
  }
  function arrangementRows() {
    const rows=[];
    for(const t of p.song.tracks) {
      const clips=(t.phrases||[]).map(c=>({selection:{type:'phrase',trackId:t.id,id:c.id},name:c.name,start:c.start,duration:c.duration*c.repeats,notes:c.notes,cycle:c.duration,kind:'phrase',muted:c.mute}));
      if(t.notes.length) { const start=Math.min(...t.notes.map(n=>n.start)),end=Math.max(...t.notes.map(n=>n.start+n.duration)); clips.unshift({selection:{type:'notes',id:t.id},name:t.name,start,duration:end-start,notes:t.notes.map(n=>({...n,start:n.start-start})),cycle:end-start,kind:'notes'}); }
      rows.push({id:t.id,name:t.name,subtitle:t.instrument==='piano'?'POCKET PIANO':t.instrument==='drums'?'POCKET DRUMS':p.library.find(w=>w.id===t.instrument)?.name||t.instrument,clips,mute:t.mute});
    }
    rows.push({id:'drums',name:'Beat track',subtitle:'THE POCKET',clips:p.song.clips.map(c=>{const b=p.song.beats.find(b=>b.id===c.beatId);return {selection:{type:'beat',id:c.id},name:b.name,start:c.start,duration:b.pattern.bars*C.Song.beatsPerBar(b.pattern.meter),kind:'beat',muted:c.mute,notes:[]};})});
    if(p.song.audio.length) rows.push({id:'audio',name:'Audio',subtitle:'RECORDINGS / WAV',clips:p.song.audio.map(c=>({selection:{type:'audio',id:c.id},name:c.name,start:c.start,duration:C.clipLength(p,{type:'audio',id:c.id}),kind:'audio',muted:c.mute,notes:[]}))});
    if(p.song.waves.length) rows.push({id:'waves',name:'Wave clips',subtitle:'WAVEFORMS',clips:p.song.waves.map(c=>({selection:{type:'wave',id:c.id},name:c.name,start:c.start,duration:c.duration,kind:'wave',muted:c.mute,notes:[]}))});
    return rows;
  }
  function sameSelection(a,b) { return a && b && a.type===b.type && a.id===b.id; }
  function arrangementView() {
    const barBeats=C.Song.beatsPerBar(p.song.meter), barWidth=78*ui.songZoom, beatWidth=barWidth/barBeats, total=p.song.bars*barWidth;
    const rows=arrangementRows();
    const timeline=`<div class="timeline-scroll" id="timeline-scroll"><div class="timeline" id="timeline" style="width:${130+total}px;--bar-width:${barWidth}px" data-beat-width="${beatWidth}"><div class="timeline-ruler">${Array.from({length:p.song.bars},(_,i)=>`<span data-action="song-cursor" data-beat="${i*barBeats}" style="width:${barWidth}px">${i+1}</span>`).join('')}</div>${rows.map(row=>`<div class="timeline-row"><div class="track-heading"><strong>${esc(row.name)}${!['drums','audio','waves'].includes(row.id)?`<button data-action="track-mute" data-id="${esc(row.id)}" title="${row.mute?'Unmute':'Mute'} track">${row.mute?'M':'·'}</button>`:''}</strong><small>${esc(row.subtitle)}</small></div><div class="track-lane ${row.mute?'visually-muted':''}" data-lane="${esc(row.id)}">${row.clips.map(c=>`<button class="song-clip ${c.kind} ${sameSelection(ui.clip,c.selection)?'selected':''} ${c.muted?'visually-muted':''}" data-clip="${esc(JSON.stringify(c.selection))}" style="left:${c.start*beatWidth}px;width:${Math.max(12,c.duration*beatWidth)}px" aria-label="${esc(c.name)} at measure ${(c.start/barBeats+1).toFixed(1)}"><strong>${esc(c.name)}</strong>${c.notes.length?clipSvg(c.notes,c.cycle):'<svg viewBox="0 0 100 20" preserveAspectRatio="none"><path d="M0 10h5v-6h3v12h3v-6h8v-4h3v8h3v-4h13v-8h3v16h3v-8h10v-5h3v10h3v-5h15v-8h3v16h3v-8h18" stroke="currentColor" fill="none"/></svg>'}${['phrase','wave'].includes(c.kind)?'<span class="clip-grip"></span>':''}</button>`).join('')}</div></div>`).join('')}<div class="song-cursor" id="song-cursor" style="left:${130+ui.cursor*beatWidth}px"></div>${!p.song.tracks.length&&!p.song.clips.length&&!p.song.audio.length&&!p.song.waves.length?'<div class="timeline-empty">Your song starts here.<br>Bring in a beat or melody, or try the starter from the guide.</div>':''}</div></div>`;
    const editor=panel('<span class="dot" style="background:var(--blue)"></span> A little idea, a whole song', `<div class="editor-toolbar"><label>Length<select data-change="song-bars">${selectOptions([4,8,12,16,24,32,48,64].includes(p.song.bars)?[4,8,12,16,24,32,48,64]:[p.song.bars,4,8,12,16,24,32,48,64].sort((a,b)=>a-b),p.song.bars)}</select> measures</label><button data-action="zoom-song">${ui.songZoom===1?'Zoom ＋':'Zoom −'}</button><button data-action="import-midi">Import MIDI</button><button data-action="import-audio">Import WAV</button><button data-action="recording">Record a sound</button></div>${timeline}<div class="editor-hint"><span>Drag a pattern here · drag clips to move · right edge to repeat</span><span>CURSOR M${(ui.cursor/barBeats+1).toFixed(1)}</span></div><div class="panel-body control-row"><button data-action="place-pattern">＋ Place selected pattern</button><button data-action="duplicate-clip">Duplicate after</button><button data-action="edit-clip">Edit notes / beat</button><button data-action="delete-clip" class="quiet danger">Delete clip</button></div>`,'<span class="chip" style="color:var(--blue);border-color:#425d75;background:#253342">continuityLAB / reimagined</span>');
    return heading(4,'Let the idea grow.','Place your patterns. Repeat a good moment. Leave room for the next one.')+`<div class="stage-content"><div>${editor}${patternShelf()}</div>${clipInspector()}</div>`+next('export','Keep & export','<b>All the pieces, in one place.</b> Ready to take it with you?');
  }
  function clipInspector() {
    const c=C.findClip(p,ui.clip);
    if(!c) return panel('The little details','<div class="panel-body"><div class="inspector-empty">Choose a clip in your song to adjust its level, position, repeats, and feel.</div><hr><div class="caption">A SHARED WORKFLOW</div><p class="subtle">Keep patterns in the box.<br>Drag them into the song.<br>Edit each copy independently.<br>Undo whenever you like.</p></div>','','inspector');
    const type=ui.clip.type, at=type==='notes'?Math.min(...c.notes.map(n=>n.start)):c.start;
    return panel('This placement',`<div class="panel-body"><div class="caption">${esc(type.toUpperCase())} CLIP</div><label class="field">Name<input maxlength="48" data-change="clip-name" value="${esc(c.name||p.song.beats.find(b=>b.id===c.beatId)?.name||'Beat')}"></label><label class="field">At beat<input type="number" min="0" max="316" step="0.25" data-change="clip-start" value="${at}"></label>${type==='phrase'?`<label class="field">Repeats<input type="number" min="1" max="64" data-change="clip-repeats" value="${c.repeats}"></label>`:''}${range('clip-volume','Level',Math.round((c.volume??1)*100),0,100,1,'%')}${range('clip-pan','Balance',Math.round((c.pan||0)*100),-100,100,1,'%')}${range('clip-pitch','Pitch',c.pitch||0,-24,24,1,' st')}<label class="field-inline"><input type="checkbox" data-change="clip-mute" ${c.mute?'checked':''}> Mute this clip</label><hr>${type==='phrase'||type==='beat'||type==='notes'?'<button class="secondary button-full" data-action="edit-clip">Edit this clip →</button>':''}<button class="button-full quiet danger" data-action="delete-clip" style="margin-top:9px">Delete placement</button><p class="subtle" style="margin-top:10px">${type==='phrase'?'Edits affect this copy. Your pattern box and other placements keep their own notes.':'Changes belong to this placement.'}</p></div>`,'','inspector');
  }
  function exportView() {
    const count=p.song.tracks.reduce((sum,t)=>sum+t.notes.length+(t.phrases||[]).reduce((n,c)=>n+c.notes.length*c.repeats,0),0), seconds=p.song.bars*C.Song.beatsPerBar(p.song.meter)*60/p.song.bpm;
    const options=[['wav','WAV','Hear it anywhere.','Stereo audio with your sounds and effects. 16-bit PCM, ready to share.'],['midi','MIDI','Make it a starting point.','Editable notes and drums for another music app. Sounds stay in the project.'],['project','PROJECT','Keep making it yours.','Every sound, pattern, recording, and editable clip in one studio file.'],['pack','HANDOFF ZIP','Take the whole little world.','Your WAV, MIDI, editable project, and a short guide in one download.'],['stems','STEMS ZIP','Mix it your way.','Individual song tracks, drums, and recordings. All start at the same time.'],['classic','CLASSIC PROJECT','Keep the connection.','Open your work in the original studio and use the specialized tools.']];
    const cards=options.map(([type,format,title,description])=>`<article class="export-card ${type==='pack'?'featured':''}"><span class="format">${format}</span><h3>${title}</h3><p>${description}</p><button ${ui.busy?'disabled':''} data-action="export" data-format="${type}">${ui.busy?'Preparing…':'Download '+(type==='project'?'project':type==='classic'?'classic file':format)}</button></article>`).join('');
    return heading(5,'You made a thing. Keep it.','Save the idea. Share the sound. Come back and make something else tomorrow.')+`<div class="stage-content"><div><div class="panel panel-body"><div class="control-row" style="justify-content:space-between"><h2>${esc(p.song.name)}</h2><span class="chip">${ui.exportScope.toUpperCase()}</span></div><div class="stats-row"><div class="stat"><strong>${p.song.bars}</strong><small>MEASURES</small></div><div class="stat"><strong>${p.song.bpm}</strong><small>BPM</small></div><div class="stat"><strong>${Math.floor(seconds/60)}:${String(Math.round(seconds%60)).padStart(2,'0')}</strong><small>SONG LENGTH</small></div><div class="stat"><strong>${count}</strong><small>NOTES</small></div></div><div class="review-wave"><canvas id="export-wave" aria-label="Audio export waveform"></canvas><span id="render-label">A SOUND YOU CAN TAKE WITH YOU</span></div><button data-action="review-export" class="quiet">↻ Preview export waveform</button></div><div class="export-options" style="margin-top:16px">${cards}</div></div>${panel('The finishing touches',`<div class="panel-body"><div class="caption">EXPORT WHAT YOU NEED</div><label class="field">From<select data-change="export-scope">${selectOptions([['song','The whole song'],['melody','Melody draft'],['beat','Beat draft'],['sound','Current sound']],ui.exportScope)}</select></label><label class="field">Sample rate<select data-change="export-rate">${selectOptions([[44100,'44.1 kHz'],[48000,'48 kHz']],ui.exportRate)}</select></label><hr><div class="caption">WHAT GOES WITH IT</div><p class="subtle">WAV keeps the actual sounds, effects, clip levels, and stereo balance.</p><p class="subtle" style="margin-top:12px">Master volume and listening EQ belong to your speakers. They don’t change your exported music.</p><p class="subtle" style="margin-top:12px">Peaks are reduced only when needed to fit the file. Quiet music stays quiet.</p><hr><button class="secondary button-full" data-action="save">Save project first</button></div>`,'','inspector')}</div>`+next('sound','Back to making','<b>The studio is always here.</b> Keep a file so the idea is, too.');
  }
  function telephoneView() {
    const item = telephone.selected, unavailable = !window.DoodleBridge;
    const worldLink = item && !embeddedTelephone ? `<a class="telephone-link" href="${esc(DoodleBridge.route(item))}">Open ${item.machine.mozcorp ? 'MozCorp world' : 'Telephone World'} ↗</a>` : '';
    const selected = item ? `<div class="telephone-project"><span class="eyebrow">${esc(item.sourceMode === 'fiction' ? 'FICTION / REMIX ENABLED IN TELEPHONE' : 'SOURCE HELD / EXACT WORDS PRESERVED')}</span><h2>${esc(item.title)}</h2><p class="telephone-caption">Music is a separate composition. Your source and story stay as written.</p><div class="telephone-actions">${worldLink}<button data-action="telephone-make" ${telephone.loading?'disabled':''}>Make an editable soundtrack</button><button class="quiet" data-action="telephone-load" ${telephone.loading||!item.soundtrack?'disabled':''}>Load saved soundtrack</button><button class="small-primary" data-action="telephone-save" ${telephone.loading?'disabled':''}>Keep this song with the world</button></div><div class="telephone-texts"><section><h3>Original source</h3><pre>${esc(item.sourceText || 'No source yet.')}</pre></section><section><h3>Story</h3><pre>${esc(item.storyText || 'Run the machine in Telephone World, then save its session.')}</pre></section><section><h3>Character</h3><pre>${esc(item.characterText || 'No generated character.')}</pre></section></div></div>` : '<p class="telephone-empty">Choose a saved session, or open Telephone World to make one. Its source, story, characters and soundtrack can travel together.</p>';
    const shelf = telephone.items.map(record=>`<button class="telephone-tile ${item?.id===record.id?'selected':''}" data-action="telephone-select" data-id="${esc(record.id)}"><strong>${esc(record.title)}</strong><small>${esc(record.sourceMode)} · ${record.hasSoundtrack?'soundtrack saved':'ready for music'}</small></button>`).join('');
    return heading(6,'A story with a sound.','Bring Telephone World and MozCorp into your studio. Keep the words, make the music, carry it all back.')+`<div class="telephone-layout"><aside class="panel telephone-shelf"><div class="panel-head"><h2>YOUR TELEPHONE WORLDS</h2><button data-action="telephone-refresh" class="quiet" ${telephone.loading?'disabled':''}>Refresh</button></div>${embeddedTelephone ? '' : '<a class="telephone-link" href="./">＋ Open Telephone World</a><a class="telephone-keeper" href="./">← Back to MozCorp</a>'}<p class="telephone-caption">Saved on this browser and address. Export a Telephone project to carry it to another device.</p>${unavailable?'<p role="status">Open this studio from the complete Doodleverse package to connect your Telephone projects.</p>':telephone.loading?'<p role="status">Opening the shared project shelf…</p>':''}${telephone.error?`<p role="alert">${esc(telephone.error)}</p>`:''}<div class="telephone-tiles">${shelf||(!telephone.loading?'<p class="telephone-caption">Your first world starts with a few words.</p>':'')}</div></aside><section class="panel panel-body">${selected}</section></div>`;
  }
  async function refreshTelephone(id) {
    if (!window.DoodleBridge) return;
    if (id) requestedTelephone = id;
    const ticket = ++telephone.ticket; telephone.loading = true; telephone.error = '';
    if (ui.step === 'telephone') render();
    try {
      const items = await DoodleBridge.list();
      const target = requestedTelephone || telephone.selected?.id || items[0]?.id;
      const selected = target ? await DoodleBridge.get(target) : null;
      if (ticket !== telephone.ticket) return;
      telephone.items = items; telephone.selected = selected ? TelephoneScore.checked(selected) : null;
      if (target && !selected) telephone.error = 'That Telephone session is not saved at this browser address. Open or import it in Telephone World.';
    } catch (error) { if (ticket === telephone.ticket) telephone.error = error.message; }
    finally { if (ticket === telephone.ticket) { telephone.loading = false; telephone.loaded = true; if (ui.step === 'telephone') render(); } }
  }
  function replaceWithTelephone(value, record) {
    const next = shareSounds(C.open(value));
    next.compatibility.telephone = TelephoneScore.provenance(record);
    const occupied = revision > 0 || p.song.tracks.length || p.song.clips.length || p.song.audio.length || p.song.waves.length || (ui.recover && !ui.recovered);
    if (occupied && !window.confirm('Open this Telephone soundtrack in the studio? Your current song will be replaced. Undo restores it; save a project file first to keep a separate copy.')) return false;
    audio.stop(); cancelRecording();
    commit(()=>{p=next;Object.assign(ui,{selected:[],clip:null,editTarget:null,cursor:0,beatBar:0,recovered:true,noteBase:48});},'Telephone soundtrack opened. Every sound, note and placement is editable. Playback is stopped.');
    setStep('arrange'); return true;
  }
  async function telephoneProject(generate) {
    C.assert(telephone.selected, 'Choose a Telephone session first.');
    const record = await DoodleBridge.get(telephone.selected.id);
    C.assert(record, 'This Telephone session is no longer on the shelf.'); TelephoneScore.checked(record);
    if (generate && record.soundtrack && !window.confirm('Make a new soundtrack idea for this world? The saved soundtrack stays on its shelf until you choose Keep this song with the world.')) return;
    const value = generate ? TelephoneScore.make(record) : record.soundtrack;
    C.assert(value, 'This world has no saved soundtrack yet. Make one first.');
    telephone.selected = record; replaceWithTelephone(value, record);
  }
  async function saveTelephoneSoundtrack() {
    C.assert(telephone.selected, 'Choose a Telephone session first.');
    const record = await DoodleBridge.get(telephone.selected.id);
    C.assert(record, 'This Telephone session is no longer on the shelf.'); TelephoneScore.checked(record);
    if (record.soundtrack && !window.confirm('Replace this world’s saved soundtrack with the current Studio song? Its story and original source will stay unchanged.')) return;
    const snapshot = C.open(JSON.parse(C.serialize(p))); snapshot.compatibility.telephone = TelephoneScore.provenance(record);
    record.soundtrack = JSON.parse(C.serialize(snapshot));
    const saved = await DoodleBridge.save(record);
    telephone.selected = saved; await refreshTelephone(saved.id);
    notify('Song kept with '+saved.title+'. Reopen its world to hear it or edit it here again.');
  }
  const scrollMemory = new Map(); let renderedStep = 'sound';
  function render() {
    const previousScroll = $('piano-scroll') || $('timeline-scroll');
    if (previousScroll) scrollMemory.set(renderedStep, [previousScroll.scrollLeft, previousScroll.scrollTop]);
    if($('project-name')!==document.activeElement) $('project-name').value=p.song.name;
    renderNav(); renderTransport();
    let html=({sound:soundView,beat:beatView,melody:melodyView,arrange:arrangementView,export:exportView,telephone:telephoneView})[ui.step]();
    if(ui.recover&&!ui.recovered) html=`<div class="recovery-banner"><span>A previous studio draft is here when you need it.</span><button data-action="recover">Recover draft</button><button class="quiet" data-action="dismiss-recover">Keep starting fresh</button></div>`+html;
    $('workspace').innerHTML=html;
    renderedStep = ui.step;
    const nextScroll = $('piano-scroll') || $('timeline-scroll'), savedScroll = scrollMemory.get(ui.step);
    if (nextScroll && savedScroll) { nextScroll.scrollLeft = savedScroll[0]; nextScroll.scrollTop = savedScroll[1]; }
    if(ui.step==='sound') paintWaves(); if(ui.step==='export'&&lastExportAudio) paintExport(lastExportAudio);renderMiniPlayers();
  }
  function drawCanvas(canvas, table, color, dots=false, side=null) {
    if(!canvas) return;
    const rect=canvas.getBoundingClientRect(), ratio=Math.min(window.devicePixelRatio||1,2), width=Math.max(1,rect.width),height=Math.max(1,rect.height);
    canvas.width=width*ratio; canvas.height=height*ratio;
    const ctx=canvas.getContext('2d'); ctx.scale(ratio,ratio); ctx.clearRect(0,0,width,height);
    ctx.strokeStyle='#293946'; ctx.lineWidth=1;
    for(let i=0;i<=8;i++){ctx.beginPath();ctx.moveTo(i*width/8,0);ctx.lineTo(i*width/8,height);ctx.stroke();}
    for(let i=1;i<=3;i++){ctx.beginPath();ctx.moveTo(0,i*height/4);ctx.lineTo(width,i*height/4);ctx.stroke();}
    const selected=side?ui.shaper.selection[side]:[];
    if(selected.length){ctx.fillStyle=color+'15';for(const i of selected){ctx.fillRect((i-.45)/32*width,0,width/32*.9,height);if(i===0)ctx.fillRect((32-.45)/32*width,0,width/32*.9,height);}}
    const voice=side?p.patch.project[side]:null,outline=voice?C.S.sourceOutline(voice):table;
    if(dots&&voice?.smoothness){ctx.strokeStyle=color+'50';ctx.lineWidth=1;ctx.setLineDash([3,3]);ctx.beginPath();for(let i=0;i<=32;i++){const x=i/32*width,y=height/2-table[i%32]*height*.36;if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();ctx.setLineDash([]);}
    ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();
    const size=Math.max(2,Math.ceil(width));for(let i=0;i<size;i++){const t=i/(size-1),x=t*width,y=height/2-C.S.sample(outline,t)*height*.36;if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();
    if(dots){ctx.fillStyle=color;for(let slot=0;slot<=32;slot++){const i=slot%32,x=slot/32*width,y=height/2-table[i]*height*.36;ctx.fillRect(x-2,y-2,4,4);if(selected.includes(i)||i===0){ctx.strokeStyle=i===0?'#e0f8d0':'#f7f5e7';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.stroke();}}}
    if(side&&ui.shaper.markers){const marks=C.Shape.landmarks(table);
      for(const [list,fill,direction] of [[marks.peaks,'#ffb783',-1],[marks.troughs,'#99d4f8',1]])for(const i of list){const x=i/32*width,y=height/2-table[i]*height*.36+direction*12;ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(x,y+direction*4);ctx.lineTo(x-4,y-direction*3);ctx.lineTo(x+4,y-direction*3);ctx.closePath();ctx.fill();}
      ctx.strokeStyle='#dce5e2';ctx.lineWidth=1;for(const edge of marks.crossings){const x=edge.at/32*width;ctx.beginPath();ctx.moveTo(x,height/2-7);ctx.lineTo(x,height/2+7);ctx.stroke();}
    }
  }
  function paintWaves() {
    const c=p.patch.freePair?C.Collision.preview(p.patch.project,p.patch.freePair):C.S.compile(p.patch.project,{frequency:p.patch.pitch});
    for(const side of ['a','b']){const voice=p.patch.project[side];drawCanvas($('wave-'+side),voice.points,side==='a'?'#b8f58b':'#c7b1ff',true,side);const marks=C.Shape.landmarks(voice.points),readout=$('wave-readout-'+side),seam=C.S.sourceOutline(voice)[0];if(readout)readout.innerHTML=`<span class="peak-legend">▲ ${marks.high.toFixed(2)}</span><span class="trough-legend">▼ ${marks.low.toFixed(2)}</span><span>${marks.crossings.length} zero crossings</span><span class="seam-readout">↔ Start = end <b>${seam.toFixed(3)}</b></span>`;$('wave-'+side)?.parentElement.classList.toggle('editing-wave',ui.shaper.side===side);}
    drawCanvas($('wave-result'),c.result.table,'#ffb783');updateShapeReadout();
  }
  function updateShapeReadout(){
    const s=ui.shaper,side=s.side,points=p.patch.project[side].points,selection=s.selection[side],marks=C.Shape.landmarks(points);
    if($('shape-selection-summary'))$('shape-selection-summary').textContent=`Wave ${side.toUpperCase()} · ${selection.length?selection.length+' selected dots':'whole cycle'} · dot ${s.cursor[side]+1}: ${points[s.cursor[side]].toFixed(3)}`;
    for(const button of document.querySelectorAll('[data-action="shape-side"]')){button.classList.toggle('active',button.dataset.side===side);button.setAttribute('aria-pressed',String(button.dataset.side===side));}
    for(const [key,value] of [['shape-peak',Math.round(Math.max(0,marks.high)*100)],['shape-trough',Math.round(Math.max(0,-marks.low)*100)]]){const input=$('r-'+key);if(input&&input!==document.activeElement){input.value=value;input.previousElementSibling.textContent=value+'%';}}
    const dot=document.querySelector('[data-change="shape-dot"]'),height=document.querySelector('[data-change="shape-height"]');if(dot&&dot!==document.activeElement)dot.value=s.cursor[side]+1;if(height&&height!==document.activeElement)height.value=points[s.cursor[side]].toFixed(3);
    const from=$('shape-arc-from'),to=$('shape-arc-to');if(from&&from!==document.activeElement)from.value=selection.length?selection[0]+1:1;if(to&&to!==document.activeElement)to.value=selection.length?selection.at(-1)+1:17;
  }
  function paintExport(a) {
    const canvas=$('export-wave');if(!canvas)return;
    const rect=canvas.getBoundingClientRect(),r=window.devicePixelRatio||1;canvas.width=rect.width*r;canvas.height=rect.height*r;const ctx=canvas.getContext('2d');ctx.scale(r,r);ctx.strokeStyle='#a9db89';
    for(let x=0;x<rect.width;x+=3){let peak=0;const from=Math.floor(x/rect.width*a.left.length),to=Math.floor((x+3)/rect.width*a.left.length),skip=Math.max(1,Math.floor((to-from)/32));for(let i=from;i<to;i+=skip)peak=Math.max(peak,Math.abs(a.left[i]),Math.abs(a.right[i]));ctx.beginPath();ctx.moveTo(x,rect.height/2-peak*rect.height*.45);ctx.lineTo(x,rect.height/2+peak*rect.height*.45);ctx.stroke();}
    $('render-label').textContent=`${a.rate/1000} kHz · ${a.duration.toFixed(2)} SEC · STEREO`;
  }
  async function togglePlay(scope=scopeForStep()) {
    if(audio.playing||audio.pending){audio.pause();return;}
    const from = audio.scope === scope && audio.positionWhenStopped ? audio.positionWhenStopped * p.song.bpm / 60 : scope==='song'?ui.cursor:0;
    await audio.play(p,scope,from);
  }
  const actions={
    'telephone-refresh':()=>refreshTelephone(), 'telephone-select':b=>refreshTelephone(b.dataset.id),
    'telephone-make':()=>telephoneProject(true), 'telephone-load':()=>telephoneProject(false), 'telephone-save':()=>saveTelephoneSoundtrack(),
    step:b=>setStep(b.dataset.step), play:()=>togglePlay(), stop:()=>{audio.stop();announce('All sound stopped. Your work is here.');},
    'song-play':()=>audio.playing&&audio.scope==='song'?audio.stop():audio.play(p,'song',ui.cursor),
    undo:()=>history('undo'),redo:()=>history('redo'),open:()=>chooseFile('project'),save:()=>saveProject(),
    new:()=>newDialog(),starter:()=>{audio.stop();commit(()=>{p=shareSounds(C.starter());ui.clip=null;ui.editTarget=null;ui.selected=[];ui.cursor=0;ui.noteBase=48;ui.beatBar=0;ui.recovered=true;},'Windowlight is ready. Every note and placement is yours to edit.');setStep('arrange');$('modal').close();},
    recover:()=>{const data=shareSounds(C.open(JSON.parse(ui.recover)));audio.stop();commit(()=>{p=data;ui.recovered=true;ui.selected=[];ui.clip=null;ui.cursor=0;},'Your previous draft is back. Save a project file to keep it.');},
    'dismiss-recover':()=>{ui.recovered=true;ui.recover=null;render();},
    help:()=>helpDialog(),listen:()=>listenDialog(),classic:()=>classicDialog(),
    'close-modal':()=>$('modal').close(),
    'confirm-new':()=>{audio.stop();commit(()=>{p=shareSounds(C.blank());Object.assign(ui,{selected:[],clip:null,editTarget:null,cursor:0,beatBar:0,recovered:true});},'A fresh page. Previous work is one Undo away.');$('modal').close();setStep('sound');},
    'random-wave':b=>commit(()=>{p.patch.project[b.dataset.side].points=C.S.smoothPoints(Array.from({length:32},()=>Math.random()*2-1));p.patch.project[b.dataset.side].shape='custom';},'A new shape to play with.'),
    'clear-wave':b=>commit(()=>{p.patch.project[b.dataset.side].points.fill(0);p.patch.project[b.dataset.side].shape='custom';},'Wave cleared. Draw a new one.'),
    'remove-effect':b=>commit(()=>p.patch.project.effects.splice(+b.dataset.index,1),'Effect removed.'),
    'save-sound':()=>{const title=$('sound-name').value;commit(()=>{const wave=C.saveSound(p,title);ui.sound=wave.id;p.melody.tracks.find(t=>t.id===ui.part).instrument=wave.id;},'Sound kept. It is ready for your melody.');},
    'preview-sound':b=>{const wave=p.library.find(w=>w.id===b.dataset.id);C.assert(wave,'That sound is no longer in the box.');return audio.previewSound(wave);},
    'preview-source':b=>audio.previewSound({id:b.dataset.id,name:b.dataset.name},{patch:p.patch,target:b.dataset.side}),
    'shape-side':b=>{ui.shaper.side=b.dataset.side;render();},
    'shape-tool':b=>{ui.shaper.tool=b.dataset.tool;render();},
    'shape-select-arc':()=>{const side=ui.shaper.side,from=Math.round(num($('shape-arc-from').value,1,32,1))-1,to=Math.round(num($('shape-arc-to').value,1,32,17))-1;ui.shaper.selection[side]=C.Shape.arcBetween(from,to);ui.shaper.cursor[side]=to;paintWaves();announce(`Selected the arc from dot ${from+1} to dot ${to+1}.`);},
    'shape-select':b=>{const side=ui.shaper.side,kind=b.dataset.kind,marks=C.Shape.landmarks(p.patch.project[side].points);const chosen=kind==='all'?[]:marks[kind];if(kind!=='all'&&!chosen.length){notify('No '+kind+' yet. Place a peak or trough, or draw a shape first.');return;}ui.shaper.selection[side]=[...chosen];if(chosen.length)ui.shaper.cursor[side]=chosen[0];paintWaves();announce(kind==='all'?'Whole cycle selected.':`Selected ${chosen.length} ${kind==='edges'?'dots around the zero crossings':kind}.`);},
    'shape-transform':b=>commit(()=>{const side=ui.shaper.side;p.patch.project[side].points=C.Shape.transform(p.patch.project[side].points,ui.shaper.selection[side],b.dataset.operation);p.patch.project[side].shape='custom';},'Shape sculpted. Undo brings the previous contour back.'),
    'shape-center':()=>commit(()=>{const side=ui.shaper.side;p.patch.project[side].points=C.Shape.transform(p.patch.project[side].points,[],'center');p.patch.project[side].shape='custom';},'Wave centered around zero.'),
    'shape-shift':b=>commit(()=>{const side=ui.shaper.side,delta=+b.dataset.delta;p.patch.project[side].points=C.Shape.shift(p.patch.project[side].points,delta);p.patch.project[side].shape='custom';ui.shaper.selection[side]=ui.shaper.selection[side].map(i=>(i+delta+32)%32);ui.shaper.cursor[side]=(ui.shaper.cursor[side]+delta+32)%32;},'Contour shifted one dot around the cycle.'),
    'pick-sound':b=>{ui.sound=b.dataset.id;if(ui.step==='sound'){commit(()=>C.setSoundFromWave(p,ui.sound),'Sound loaded into Wave A.');}else if(ui.step==='melody'){commit(()=>p.melody.tracks.find(t=>t.id===ui.part).instrument=ui.sound,'Sound assigned to this part.');}else render();},
    'import-library':()=>chooseFile('library'),'export-library':()=>download(JSON.stringify({kind:'dot-wave-library',version:1,waves:p.library},null,2),'application/json','sounds.library.json'),
    'remove-sound':()=>commit(()=>{const id=ui.sound;C.assert(!id.startsWith('stock-'),'The built-in sounds stay in the studio. Choose one of your own sounds to remove.');
      const used=p.melody.tracks.some(t=>t.instrument===id)||p.song.tracks.some(t=>t.instrument===id)||p.patterns.some(t=>t.instrument===id)||[p.beat,...p.beatShelf,...p.song.beats].some(b=>C.D.allTracks(b.pattern).some(t=>t.waveId===id));
      C.assert(!used,'This sound is used in your music. Assign another sound to those parts before removing it.');p.library=p.library.filter(w=>w.id!==id);ui.sound='stock-sine';
    },'Sound removed. Undo restores it.'),
    'remove-pattern':()=>commit(()=>{C.assert(ui.pattern,'Choose a saved pattern first.');p.patterns=p.patterns.filter(x=>x.id!==ui.pattern);p.beatShelf=p.beatShelf.filter(x=>x.id!==ui.pattern);ui.pattern=null;},'Pattern removed from the box. Placed clips kept their own music.'),
    'drum-select':b=>{ui.drum=+b.dataset.row;render();},'drum-mute':b=>commit(()=>{const t=p.beat.pattern.tracks[+b.dataset.row];t.mute=!t.mute;},'Drum mute changed.'),
    hit:(b,e)=>{const row=+b.dataset.row,step=+b.dataset.step;commit(()=>{const t=p.beat.pattern.tracks[row];t.steps[step]=e.shiftKey?(t.steps[step]===.5?0:.5):(t.steps[step]?0:1);ui.drum=row;},'Beat updated.');},
    'beat-bar':b=>{ui.beatBar=+b.dataset.bar;render();},
    'clear-beat':()=>commit(()=>{const count=C.D.stepsPerBar(p.beat.pattern.meter);p.beat.pattern.tracks.forEach(t=>t.steps.fill(0,ui.beatBar*count,(ui.beatBar+1)*count));},'This measure cleared.'),
    'repeat-beat':()=>commit(()=>{const count=C.D.stepsPerBar(p.beat.pattern.meter);if(ui.beatBar+1>=p.beat.pattern.bars){C.assert(p.beat.pattern.bars<8,'The beat already has eight measures.');p.beat.pattern=C.D.resizePattern(p.beat.pattern,{bars:p.beat.pattern.bars+1});}for(const t of p.beat.pattern.tracks)t.steps.splice((ui.beatBar+1)*count,count,...t.steps.slice(ui.beatBar*count,(ui.beatBar+1)*count));ui.beatBar++;},'Measure copied to the next one.'),
    'beat-preset':b=>commit(()=>{const count=C.D.stepsPerBar(p.beat.pattern.meter),at=ui.beatBar*count;for(const t of p.beat.pattern.tracks)t.steps.fill(0,at,at+count);const hits=b.dataset.preset==='four'?[[0,4,8,12],[4,12],[2,6,10,14],[]]:b.dataset.preset==='half'?[[0,10],[8],[0,2,4,6,8,10,12,14],[14]]:[[0,6,8],[4,12],[0,2,4,6,8,10,12,14],[]];hits.forEach((lane,r)=>lane.filter(i=>i<count).forEach(i=>p.beat.pattern.tracks[r].steps[at+i]=r===2?.5:1));},'Groove loaded into this measure. Undo brings yours back.'),
    'save-beat':()=>commit(()=>{C.assert(p.beatShelf.length<16,'Keep up to 16 beats. Export a project before starting a new collection.');p.beat.name=$('beat-name').value.trim()||'Little beat';p.beatShelf.push({...C.clone(p.beat),id:C.id('saved-beat')});},'Beat kept in your pattern box.'),
    'beat-to-song':()=>{const title=$('beat-name').value;commit(()=>{p.beat.name=title.trim()||'Little beat';ui.clip=C.addBeat(p,p.beat,ui.cursor);},'Beat placed at your song cursor.');setStep('arrange');},
    'apply-beat':()=>commit(()=>{const clip=C.findClip(p,ui.editTarget);C.assert(clip&&ui.editTarget.type==='beat','The original beat placement is no longer here.');
      const next={id:C.id('beat'),name:p.beat.name,pattern:C.clone(p.beat.pattern),volume:p.beat.volume};
      C.extend(p,clip.start+next.pattern.bars*C.Song.beatsPerBar(next.pattern.meter));
      const other=p.song.clips.filter(c=>c.id!==clip.id);p.song.beats=p.song.beats.filter(b=>other.some(c=>c.beatId===b.id));C.assert(p.song.beats.length<16,'This song holds sixteen beat variations.');p.song.beats.push(next);clip.beatId=next.id;
    },'This beat placement updated. Your other copies kept their original beat.'),
    part:b=>{ui.part=b.dataset.part;ui.selected=[];render();},
    'note-mode':b=>{ui.noteMode=b.dataset.mode;render();},
    octave:b=>{ui.noteBase=C.clamp(ui.noteBase+(+b.dataset.delta),12,96);render();},
    'zoom-notes':()=>{ui.zoom=ui.zoom===1?2:1;render();},
    key:b=>audio.preview(p,+b.dataset.midi,p.melody.tracks.find(t=>t.id===ui.part).instrument),
    'select-notes':()=>{ui.selected=p.melody.tracks.find(t=>t.id===ui.part).notes.map(C.noteKey);render();},
    'delete-notes':()=>deleteNotes(),
    transpose:b=>moveNotes(0,+b.dataset.delta,0),
    'duplicate-notes':()=>duplicateNotes(),
    'clear-part':()=>commit(()=>{p.melody.tracks.find(t=>t.id===ui.part).notes=[];ui.selected=[];},'This part is a fresh page.'),
    'note-cursor':b=>{ui.noteCursor=+b.dataset.beat;announce('Note cursor at measure '+(ui.noteCursor/4+1)+'.');},
    'stamp-chord':b=>stampChord(+b.dataset.degree),
    'save-pattern':()=>commit(()=>{C.assert(p.patterns.length<32,'The pattern box holds 32 melodies.');const pattern=C.patternFromPart(p,ui.part,ui.selected,$('pattern-name').value);p.patterns.push(pattern);ui.pattern=pattern.id;},'Editable pattern kept in your box.'),
    'melody-to-song':()=>{commit(()=>{for(const t of p.melody.tracks.filter(t=>t.notes.length&&!t.mute)){const pattern=C.patternFromPart(p,t.id,null,t.name+' idea');ui.clip=C.addPattern(p,pattern,ui.cursor);}C.assert(p.melody.tracks.some(t=>t.notes.length&&!t.mute),'Paint some notes first.');},'Your parts are in the song, still editable.');setStep('arrange');},
    'pick-pattern':b=>{ui.pattern=b.dataset.id;announce('Selected '+(p.patterns.find(x=>x.id===ui.pattern)||p.beatShelf.find(x=>x.id===ui.pattern)).name+'. Drag it to the timeline or choose Place selected pattern.');render();},
    'place-pattern':()=>commit(()=>placePattern(ui.pattern,ui.cursor),'Pattern placed at the song cursor.'),
    'import-pattern':()=>chooseFile('pattern'),'export-pattern':()=>exportPattern(),
    'song-cursor':b=>{ui.cursor=+b.dataset.beat;render();},
    'zoom-song':()=>{ui.songZoom=ui.songZoom===1?2:1;render();},
    'track-mute':b=>commit(()=>{const track=p.song.tracks.find(t=>t.id===b.dataset.id);track.mute=!track.mute;},'Track mute changed.'),
    'duplicate-clip':()=>duplicateClip(),'delete-clip':()=>deleteClip(),'edit-clip':()=>editClip(),'apply-clip':()=>applyClip(),
    'import-midi':()=>chooseFile('midi'),'import-audio':()=>chooseFile('audio'),recording:()=>recordDialog(),
    'start-recording':()=>startRecording(),'stop-recording':()=>stopRecording(),
    'export':b=>doExport(b.dataset.format),'review-export':()=>reviewExport(),
    'eq-reset':()=>{for(let i=0;i<10;i++)audio.setEQ(i,0);listenDialog();}
  };
  function placePattern(patternId,at,trackId) {
    const melody=p.patterns.find(x=>x.id===patternId), beat=p.beatShelf.find(x=>x.id===patternId);
    C.assert(melody||beat,'Keep or choose a pattern in your box first.');
    ui.clip=melody?C.addPattern(p,melody,at,trackId):C.addBeat(p,beat,at);
  }
  function moveNotes(time,pitch,length) { commit(()=>{const track=p.melody.tracks.find(t=>t.id===ui.part);ui.selected=C.transformNotes(track,ui.selected,time,pitch,length,p.melody.bars*4);},'Notes updated.'); }
  function deleteNotes() { if(!ui.selected.length)return;commit(()=>{const t=p.melody.tracks.find(t=>t.id===ui.part);t.notes=t.notes.filter(n=>!ui.selected.includes(C.noteKey(n)));ui.selected=[];},'Selected notes removed.'); }
  function duplicateNotes() {
    commit(()=>{const t=p.melody.tracks.find(t=>t.id===ui.part),notes=t.notes.filter(n=>ui.selected.includes(C.noteKey(n)));C.assert(notes.length,'Select notes to repeat.');
      const from=Math.floor(Math.min(...notes.map(n=>n.start))/4)*4,to=Math.ceil(Math.max(...notes.map(n=>n.start+n.duration))/4)*4,delta=to-from;
      const copies=notes.map(n=>({...n,start:n.start+delta})),end=Math.max(...copies.map(n=>n.start+n.duration));
      C.assert(end<=64,'That copy would go past sixteen measures.');C.assert(copies.every(n=>!t.notes.some(existing=>C.noteKey(existing)===C.noteKey(n))),'That destination already has notes.');
      p.melody.bars=Math.max(p.melody.bars,Math.ceil(end/4));t.notes.push(...copies);ui.selected=copies.map(C.noteKey);
    },'Phrase repeated. Each copy is editable.');
  }
  function stampChord(degree) {
    commit(()=>{const scale=p.melody.mode==='minor'?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11], track=p.melody.tracks.find(t=>t.id==='chords');
      const pitches=[degree,degree+2,degree+4].map(i=>48+p.melody.root+scale[i%7]+Math.floor(i/7)*12),start=Math.min(ui.noteCursor,p.melody.bars*4-ui.length);
      const notes=pitches.map(midi=>({midi,start,duration:ui.length,velocity:ui.velocity}));C.assert(notes.every(n=>!track.notes.some(old=>C.noteKey(n)===C.noteKey(old))),'That chord position already has notes.');track.notes.push(...notes);ui.part='chords';ui.selected=notes.map(C.noteKey);
    },'Chord stamped as editable notes.');
  }
  function duplicateClip() {
    commit(()=>{const c=C.findClip(p,ui.clip);C.assert(c,'Choose a clip to duplicate.');const type=ui.clip.type;
      C.assert(type!=='notes','Use Edit notes to make an independent pattern first.');const next=structuredClone(c);next.id=C.id('clip');next.start+=C.clipLength(p,ui.clip);C.extend(p,next.start+C.clipLength(p,ui.clip));
      if(type==='phrase'){C.assert(p.song.tracks.reduce((n,t)=>n+(t.phrases?.length||0),0)<128,'Keep up to 128 melody clips.');p.song.tracks.find(t=>t.id===ui.clip.trackId).phrases.push(next);}
      else if(type==='beat'){C.assert(p.song.clips.length<128,'Keep up to 128 beat placements.');p.song.clips.push(next);}
      else if(type==='audio'){C.assert(p.song.audio.reduce((s,a)=>s+a.samples.length/a.rate,0)+c.samples.length/c.rate<=60,'Keep imported audio under one minute in total.');p.song.audio.push(next);}
      else p.song.waves.push(next);ui.clip={...ui.clip,id:next.id};
    },'Independent copy placed after this clip.');
  }
  function deleteClip() {
    commit(()=>{const c=C.findClip(p,ui.clip);C.assert(c,'Choose a clip first.');const type=ui.clip.type;
      if(type==='phrase'){const t=p.song.tracks.find(t=>t.id===ui.clip.trackId);t.phrases=t.phrases.filter(c=>c.id!==ui.clip.id);}
      else if(type==='notes') c.notes=[];
      else if(type==='beat'){p.song.clips=p.song.clips.filter(c=>c.id!==ui.clip.id);p.song.beats=p.song.beats.filter(b=>p.song.clips.some(c=>c.beatId===b.id));}
      else if(type==='audio')p.song.audio=p.song.audio.filter(c=>c.id!==ui.clip.id);
      else p.song.waves=p.song.waves.filter(c=>c.id!==ui.clip.id);
      p.song.tracks=p.song.tracks.filter(t=>t.notes.length||(t.phrases||[]).length);ui.clip=null;
    },'Placement removed. Your pattern box is still here.');
  }
  function editClip() {
    const c=C.findClip(p,ui.clip);C.assert(c,'Choose a clip first.');
    if(ui.clip.type==='beat') {
      const beat=p.song.beats.find(b=>b.id===c.beatId);ui.editTarget={...ui.clip};
      commit(()=>{p.beat={name:beat.name,pattern:C.clone(beat.pattern),volume:beat.volume};ui.beatBar=0;},'Beat opened as a draft. Add it to the song to make a new independent placement.');setStep('beat');return;
    }
    C.assert(['phrase','notes'].includes(ui.clip.type),'Recordings and wave clips use the placement controls.');
    const track=ui.clip.type==='notes'?c:p.song.tracks.find(t=>t.id===ui.clip.trackId), notes=c.notes;
    const begin=ui.clip.type==='notes'?Math.floor(Math.min(...notes.map(n=>n.start))/4)*4:0;
    const span=ui.clip.type==='notes'?Math.ceil((Math.max(...notes.map(n=>n.start+n.duration))-begin)/4)*4:c.duration;
    C.assert(span<=64,'This phrase is longer than the sixteen-measure note editor. Use Classic for its full-length editing.');
    const target={...ui.clip};
    commit(()=>{p.melody=C.M.defaultProject();p.melody.name=c.name||track.name;p.melody.bpm=p.song.bpm;p.melody.bars=Math.max(1,Math.ceil(span/4));const part=p.melody.tracks[0];part.notes=notes.map(n=>({...n,start:n.start-begin}));part.instrument=track.instrument;part.volume=track.volume;ui.part=part.id;ui.editTarget={...target,begin};ui.noteBase=C.clamp(Math.floor(Math.min(...notes.map(n=>n.midi))/12)*12,12,96);},'This copy is open in Melody. Update the song clip when you are ready.');
    setStep('melody');
  }
  function applyClip() {
    commit(()=>{const c=C.findClip(p,ui.editTarget);C.assert(c,'The original clip is no longer here. Add this melody as a new pattern.');const track=p.melody.tracks.find(t=>t.id===ui.part);C.assert(track.notes.length,'Keep at least one note to update this clip.');
      if(ui.editTarget.type==='notes'){c.notes=track.notes.map(n=>({...n,start:n.start+ui.editTarget.begin}));c.instrument=track.instrument;}
      else {const lane=p.song.tracks.find(t=>t.id===ui.editTarget.trackId);C.assert(lane.instrument===track.instrument,'This track uses another sound. Add the edited part as a new song track to use its new sound.');c.notes=C.clone(track.notes);c.duration=p.melody.bars*4;C.extend(p,c.start+c.duration*c.repeats);}
      ui.clip={...ui.editTarget};
    },'This song placement now has your edited notes. Other copies kept their notes.');
  }
  function chooseFile(mode) { fileMode=mode;$('file-input').accept=mode==='midi'?'.mid,.midi':mode==='audio'?'.wav':'.json';$('file-input').value='';$('file-input').click(); }
  function filename() { return p.song.name.replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-|-$/g,'').slice(0,45)||'Dot-Wave'; }
  function download(data,type,suffix) {
    const blob=new Blob([data],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
    const stem=filename(),stamp=new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,17);a.download=stem+'-'+stamp+'-'+suffix;a.href=url;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);return a.download;
  }
  function saveProject() { const name=download(C.serialize(p),'application/json','studio.json');savedVersion=revision;$('save-state').textContent='Project sent to Downloads';saveDraft();notify('Saved '+name+'. Keep this file to edit again.'); }
  async function readFile(file,mode) {
    C.assert(file.size<45*1024*1024,'Choose a file under 45 MB.');const ticket=++fileTicket;
    const buffer=await file.arrayBuffer();if(ticket!==fileTicket)return;
    if(mode==='project'){
      const value=shareSounds(C.open(JSON.parse(new TextDecoder().decode(buffer))));audio.stop();commit(()=>{p=value;ui.selected=[];ui.clip=null;ui.editTarget=null;ui.cursor=0;ui.beatBar=0;ui.recovered=true;},'Project opened with its sounds and editable music. Playback is stopped.');setStep('arrange');return;
    }
    if(mode==='midi') { const midi=C.IO.decode(buffer);commit(()=>{
      const tracks=midi.tracks.filter(t=>t.notes.length);C.assert(tracks.length,'This MIDI file has no notes.');C.assert(p.song.tracks.length+tracks.length<=8,'This import would exceed eight note tracks.');
      for(const t of tracks)p.song.tracks.push({id:C.id('midi'),name:(t.name||file.name).slice(0,48),instrument:t.channel===9?'drums':'piano',volume:.65,mute:false,notes:t.notes.map(n=>({...n,start:n.start+ui.cursor}))});C.extend(p,ui.cursor+midi.duration);p.song=C.Song.validateSong(p.song,C.signals(p.library));
    },'MIDI imported as editable notes using pocket piano and drums. '+midi.warnings.join(' '));setStep('arrange');return; }
    if(mode==='audio') { const decoded=C.IO.decodeWav(buffer);addAudio(decoded,file.name);return; }
    const data=JSON.parse(new TextDecoder().decode(buffer));
    if(mode==='library'){const waves=C.W.validateBundle(data);commit(()=>{p.library=C.W.prepareImport(p.library,waves,()=>C.id('sound')).waves;},'Sound library imported. Existing sounds kept their names and shapes.');return;}
    if(mode==='pattern'){commit(()=>{
      C.assert(p.patterns.length<32,'The pattern box holds 32 melodies.');const incoming=C.W.validateBundle({kind:'dot-wave-library',version:1,waves:data.waves||[]});const merge=C.W.prepareImport(p.library,incoming,()=>C.id('sound'));p.library=merge.waves;const pattern=C.checkedPattern({...data,id:C.id('pattern'),instrument:merge.remap.get(data.instrument)||data.instrument},C.signals(p.library));p.patterns.push(pattern);ui.pattern=pattern.id;
    },'Editable pattern added to your box.');}
  }
  function addAudio(decoded,title) {
    commit(()=>{C.assert(p.song.audio.length<8,'Keep up to eight recordings.');C.assert(decoded.duration+p.song.audio.reduce((s,c)=>s+c.samples.length/c.rate,0)<=60.0001,'Keep imported recordings under one minute in total.');
      const clip={id:C.id('audio'),name:title.slice(0,64),start:ui.cursor,volume:.7,pan:0,pitch:0,mute:false,rate:decoded.rate,samples:decoded.samples};p.song.audio.push(clip);C.extend(p,ui.cursor+decoded.duration*p.song.bpm/60);ui.clip={type:'audio',id:clip.id};
    },'Recording added to your song. Stereo files are mixed to mono; their original speed is kept.');setStep('arrange');
  }
  function exportPattern() {
    const pattern=p.patterns.find(x=>x.id===ui.pattern);C.assert(pattern,'Choose a melody pattern first.');
    download(JSON.stringify({...pattern,waves:p.library.filter(w=>w.id===pattern.instrument)},null,2),'application/json','pattern.json');
  }
  async function reviewExport() { const data=await audio.render(p,ui.exportScope,{rate:ui.exportRate});lastExportAudio=data;paintExport(data);notify('Real export waveform ready.'); }
  async function doExport(type) {
    if(ui.busy)return;
    if(type==='project'){saveProject();return;}
    if(type==='classic'){download(JSON.stringify(C.legacy(p),null,2),'application/json','classic.studio.json');notify('Classic-compatible project downloaded.');return;}
    ui.busy=true;render();announce('Preparing '+type.toUpperCase()+'… your music can keep playing.');
    const snapshot=structuredClone(p),scope=ui.exportScope,rate=ui.exportRate;
    try{
      const song=C.scopeSong(snapshot,scope),midi=scope==='sound'?null:C.IO.encode(C.Song.toMidi(song));
      if(type==='midi'){C.assert(midi,'A raw waveform has no note events. Choose the melody, beat, or song for MIDI.');download(midi,'audio/midi','notes.mid');}
      else if(type==='stems'){
        C.assert(scope==='song','Choose The whole song to export track stems.');const files=[],stems=[...song.tracks.map(t=>({type:'notes',id:t.id,name:t.name})),...(song.clips.length?[{type:'drums',id:'drums',name:'Drums'}]:[]),...song.audio.map(t=>({type:'audio',id:t.id,name:t.name})),...song.waves.map(t=>({type:'wave',id:t.id,name:t.name}))];
        C.assert(stems.length,'Put some music into your song first.');let i=0;for(const stem of stems){announce(`Rendering stem ${++i}/${stems.length}: ${stem.name}`);const data=await audio.render(snapshot,'song',{rate,stem,normalize:false});const peak=Math.max(C.S.peakOf(data.left),C.S.peakOf(data.right));const scale=peak>.98?.98/peak:1;for(let n=0;n<data.left.length;n++){data.left[n]*=scale;data.right[n]*=scale;}files.push({name:String(i).padStart(2,'0')+'-'+stem.name.replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,40)+'.wav',data:C.encodeStereo(data)});}
        files.push({name:'READ-ME.txt',data:'Dot Wave Studio 2 stems. All files start at song time zero. Muted tracks are silent. Playback Master and listening EQ are excluded. Individual stems reduce peaks only if required to fit PCM; do not assume all stem levels sum exactly to the normalized full mix.'});
        download(C.IO.zipStore(files),'application/zip','stems.zip');
      }else{
        const data=await audio.render(snapshot,scope,{rate});lastExportAudio=data;const wav=C.encodeStereo(data);
        if(type==='wav')download(wav,'audio/wav',scope+'.wav');
        else{const files=[{name:'Listen.wav',data:wav},{name:'Editable.studio.json',data:C.serialize(snapshot)},{name:'READ-ME.txt',data:`Made in Dot Wave Studio 2. Open Editable.studio.json in the studio to edit every sound, note, and placement. Listen.wav exports the ${scope} at ${rate} Hz, stereo 16-bit PCM. Listening Master and EQ are not included. MIDI contains notes, not these custom sounds. No audio was uploaded.`}];if(midi)files.push({name:'Notes.mid',data:midi});download(C.IO.zipStore(files),'application/zip','handoff.zip');}
      }
      notify(type.toUpperCase()+' sent to Downloads. Your project is still open.');
    }finally{ui.busy=false;render();}
  }
  function showModal(title,body,actions='<button class="secondary" data-action="close-modal">Back to studio</button>') {
    $('modal-body').innerHTML=`<div class="modal-head"><h2>${title}</h2><button class="quiet" data-action="close-modal" aria-label="Close dialog">×</button></div><div class="modal-content">${body}</div><div class="modal-actions">${actions}</div>`;
    if(!$('modal').open)$('modal').showModal();
  }
  function newDialog(){showModal('A fresh little idea.','<p>Your current session will be one Undo away. Save a project file first if you want to keep a separate copy.</p>','<button class="quiet" data-action="close-modal">Keep working</button><button class="secondary" data-action="save">Save project</button><button class="primary" data-action="confirm-new">Start fresh</button>');}
  function helpDialog(){showModal('A little guidance.',`<p><b>Sound → Beat → Melody → Arrange → Export.</b> Start anywhere, come back whenever. Switching steps keeps the music playing.</p><ul><li><b>Sound:</b> draw A and B, blend, add effects, and keep your own instrument.</li><li><b>Beat:</b> click a step for a hit. Shift-click makes a soft hit. Keep it in your box.</li><li><b>Melody:</b> paint notes. Drag the body to move, the right edge to resize. Shift-click groups notes; Select draws a selection box.</li><li><b>Arrange:</b> drag a saved pattern onto the timeline. Drag clips to move them; pull a melody clip’s edge to repeat it. Edit a clip, then Update this song clip.</li><li><b>Export:</b> WAV is the sound; MIDI is the notes; project files keep everything editable.</li></ul><div class="shortcut"><span>Play / pause</span><code>Space</code></div><div class="shortcut"><span>Stop every sound</span><code>Escape</code></div><div class="shortcut"><span>Undo / Redo</span><code>Ctrl Z / Ctrl Shift Z</code></div><div class="shortcut"><span>Save / Open project</span><code>Ctrl S / Ctrl O</code></div><div class="shortcut"><span>Move selected notes / change length</span><code>Arrows / Shift + ← →</code></div><div class="shortcut"><span>Duplicate selected notes or clip</span><code>Ctrl D</code></div><p style="margin-top:15px">The studio starts quietly. Keep device volume comfortable. The digital output guard limits peaks; your speakers still control how loud the room is.</p>`,'<button class="secondary" data-action="starter">✦ Try a starter</button><button class="primary" data-action="close-modal">Back to studio</button>');}
  function listenDialog(){showModal('For your ears.',`<p>Listening EQ and Master affect your speakers. Your exported music keeps its own mix.</p><div class="eq-grid">${[32,64,125,250,500,1000,2000,4000,8000,16000].map((hz,i)=>`<label>${hz>=1000?hz/1000+'k':hz} Hz<input type="range" data-eq="${i}" min="-12" max="12" step="1" value="${audio.eqGains[i]}" aria-label="${hz} Hz EQ"><output>${audio.eqGains[i]} dB</output></label>`).join('')}</div><p style="margin-top:15px">Output peaks are guarded at −12 dBFS. This controls digital peaks, not the loudness of your device.</p>`,'<button class="quiet" data-action="eq-reset">Reset EQ</button><button class="primary" data-action="close-modal">Back to studio</button>');}
  function classicDialog(){showModal('The rest of your studio.',`<p>The music tools and Telephone World have a new home here. The specialized tools remain available in the included Classic Studio: room tuning, WOOFpad, voiceLAB, ROM sound importing, SNES DJ, YouTube, engine and humming tools, and the landline beta.</p><p>Save a <b>Classic project</b> here, then open it in Classic to keep working with those tools. To return, save its project and open that file in this studio.</p><p><a href="./studio-classic.html" download>Download Classic Studio ↗</a></p><p class="tiny">The Classic file is included in the download ZIP. The Home Assistant bridge still uses the installed edition.</p>`,'<button class="secondary" data-action="export" data-format="classic">Save Classic project</button><button class="primary" data-action="close-modal">Back to studio</button>');}
  let recording=null,recordCancel=0;
  function recordDialog(){showModal('Catch a little sound.','<p>Record up to 30 seconds from this browser’s microphone. It becomes an audio clip at your song cursor. Recording starts only when you press Record; nothing is uploaded.</p><p id="record-status">Ready when you are. Use headphones to avoid recording the studio playback.</p>','<button class="quiet" data-action="close-modal">Cancel</button><button id="record-start" class="primary" data-action="start-recording">● Record</button><button id="record-stop" class="secondary" data-action="stop-recording" disabled>■ Keep recording</button>');}
  async function startRecording(){
    C.assert(navigator.mediaDevices?.getUserMedia&&window.MediaRecorder,'Recording needs microphone support on localhost or HTTPS. Import a WAV instead.');
    C.assert(!recording,'A recording is already in progress.');const ticket=++recordCancel;$('record-start').disabled=true;$('record-status').textContent='Waiting for microphone access…';
    let stream;
    try{stream=await navigator.mediaDevices.getUserMedia({audio:true});if(ticket!==recordCancel||!$('modal').open){stream.getTracks().forEach(t=>t.stop());return;}
      const recorder=new MediaRecorder(stream),chunks=[],started=Date.now();recording={recorder,stream,chunks,timer:null,cancelled:false};
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recorder.onstop=async()=>{const finished=recording;recording=null;clearInterval(finished?.timer);stream.getTracks().forEach(t=>t.stop());if(!finished||finished.cancelled)return;try{const context=await audio.init(),buffer=await context.decodeAudioData(await new Blob(chunks,{type:recorder.mimeType}).arrayBuffer());const samples=new Float32Array(Math.min(buffer.length,buffer.sampleRate*30));for(let c=0;c<buffer.numberOfChannels;c++){const channel=buffer.getChannelData(c);for(let i=0;i<samples.length;i++)samples[i]+=channel[i]/buffer.numberOfChannels;}addAudio({samples,rate:buffer.sampleRate,duration:samples.length/buffer.sampleRate},'My recording');$('modal').close();}catch(e){notify(e.message,true);}};
      recorder.start();$('record-stop').disabled=false;
      recording.timer=setInterval(()=>{const elapsed=(Date.now()-started)/1000;if($('record-status'))$('record-status').textContent='Recording · '+Math.floor(elapsed)+' / 30 seconds';if(elapsed>=30)stopRecording();},200);
    }catch(e){stream?.getTracks().forEach(t=>t.stop());if($('record-status'))$('record-status').textContent='Microphone could not start: '+e.message;if($('record-start'))$('record-start').disabled=false;throw e;}
  }
  function stopRecording(){if(recording?.recorder.state==='recording')recording.recorder.stop();if($('record-stop'))$('record-stop').disabled=true;}
  function cancelRecording(){recordCancel++;if(recording){recording.cancelled=true;clearInterval(recording.timer);recording.stream.getTracks().forEach(t=>t.stop());if(recording.recorder.state==='recording')recording.recorder.stop();}}
  $('modal').addEventListener('close',cancelRecording);
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-action]');if(!button||button.disabled)return;
    const action=actions[button.dataset.action];if(!action)return;
    try{await action(button,event);}catch(error){notify(error.message,true);}
  });
  $('file-input').addEventListener('change',async e=>{const file=e.target.files[0],mode=fileMode;if(file)try{await readFile(file,mode);}catch(error){notify(error instanceof SyntaxError?'That file is not readable JSON. Your current music is unchanged.':error.message,true);}});
  $('project-name').addEventListener('change',e=>{const value=e.target.value.trim();if(!value){e.target.value=p.song.name;return;}commit(()=>p.song.name=value,'Project renamed.',false);});
  $('bpm').addEventListener('change',e=>commit(()=>C.syncTempo(p,num(e.target.value,40,240,96)),'Tempo shared across the studio.'));
  $('master').addEventListener('input',e=>{audio.setVolume(+e.target.value/100);$('master-value').textContent=e.target.value+'%';try{localStorage.setItem(MASTER,e.target.value);}catch{}});
  $('loop').addEventListener('change',e=>audio.setLoop(e.target.checked));
  const changes={
    shape:e=>{const side=e.dataset.side;if(e.value!=='custom')commit(()=>p.patch.project[side]=C.S.source(e.value),'New waveform selected.');},
    ratio:e=>commit(()=>p.patch.project[e.dataset.side].ratio=+e.value,'Pitch multiple updated.'),
    collision:e=>commit(()=>p.patch.project.mode=e.value,'Waves combined with '+e.options[e.selectedIndex].text+'.'),
    normalize:e=>commit(()=>p.patch.project.normalize=e.checked,'Waveform fill updated.'),invert:e=>commit(()=>p.patch.inverted=e.checked,'Output polarity updated.'),
    pitch:e=>commit(()=>{const pitch=num(e.value,20,20000,134),factor=pitch/p.patch.pitch;if(p.patch.freePair)for(const side of ['a','b'])p.patch.freePair[side]=C.clamp(p.patch.freePair[side]*factor,20,19000);p.patch.pitch=pitch;},'Sound pitch updated.'),
    'independent-pitches':e=>commit(()=>{p.patch.freePair=e.checked?{a:Math.min(p.patch.pitch*p.patch.project.a.ratio,19000),b:Math.min(p.patch.pitch*p.patch.project.b.ratio,19000)}:null;},'Wave pitches updated.'),
    'free-pitch':e=>commit(()=>p.patch.freePair[e.dataset.side]=num(e.value,20,19000,134),'Independent pitch updated.'),
    'add-effect':e=>{if(!e.value)return;commit(()=>{C.assert(p.patch.project.effects.length<6,'Use up to six effects.');p.patch.project.effects.push(C.FX.validate([{type:e.value}])[0]);},'Effect added.');},
    'fx-enabled':e=>commit(()=>p.patch.project.effects[+e.dataset.index].enabled=e.checked,'Effect switched.'),
    'shape-reach':e=>{ui.shaper.reach=+e.value;announce('Brush reach updated.');},
    'shape-markers':e=>{ui.shaper.markers=e.checked;paintWaves();},
    'shape-dot':e=>{const side=ui.shaper.side,index=Math.round(num(e.value,1,32,1))-1;ui.shaper.cursor[side]=index;ui.shaper.selection[side]=[index];paintWaves();},
    'shape-height':e=>commit(()=>{const side=ui.shaper.side,index=ui.shaper.cursor[side],points=p.patch.project[side].points,target=num(e.value,-1,1,0),selection=ui.shaper.selection[side];p.patch.project[side].points=C.Shape.grab(points,selection.includes(index)?selection:[index],target-points[index],ui.shaper.reach);p.patch.project[side].shape='custom';},'Dot height adjusted with its neighbours.'),
    'beat-bars':e=>commit(()=>{const next=+e.value;if(next<p.beat.pattern.bars){const end=C.D.stepsPerBar(p.beat.pattern.meter)*next;C.assert(p.beat.pattern.tracks.every(t=>t.steps.slice(end).every(n=>!n)),'Later measures contain hits. Clear them before shortening the beat.');}p.beat.pattern=C.D.resizePattern(p.beat.pattern,{bars:next});ui.beatBar=Math.min(ui.beatBar,next-1);},'Beat length updated.'),
    'drum-wave':e=>commit(()=>p.beat.pattern.tracks[ui.drum].waveId=e.value,'Drum sound updated.'),
    grid:e=>{ui.grid=+e.value;render();},'note-length':e=>{ui.length=+e.value;},
    'part-sound':e=>commit(()=>p.melody.tracks.find(t=>t.id===ui.part).instrument=e.value,'Part sound updated.'),
    'part-mute':e=>commit(()=>p.melody.tracks.find(t=>t.id===ui.part).mute=e.checked,'Part mute updated.'),
    root:e=>commit(()=>p.melody.root=+e.value,'Key guide updated. Your note pitches are unchanged.'),
    mode:e=>commit(()=>p.melody.mode=e.value,'Scale guide updated. Your note pitches are unchanged.'),
    'melody-bars':e=>commit(()=>{const bars=+e.value;C.assert(p.melody.tracks.every(t=>t.notes.every(n=>n.start+n.duration<=bars*4)),'There are notes in later measures. Move or remove them before shortening.');p.melody.bars=bars;},'Melody length updated.'),
    'song-bars':e=>commit(()=>{const bars=+e.value,end=bars*C.Song.beatsPerBar(p.song.meter);C.assert(arrangementRows().every(r=>r.clips.every(c=>c.start+c.duration<=end+1e-8)),'Later measures contain music. Move those clips before shortening the song.');p.song.bars=bars;p.song.loop={start:0,end:bars};ui.cursor=Math.min(ui.cursor,end-1);},'Song length updated.'),
    'clip-name':e=>commit(()=>{const c=C.findClip(p,ui.clip);C.assert(c,'Choose a clip.');if(ui.clip.type==='beat'){const source=p.song.beats.find(b=>b.id===c.beatId),copy={...C.clone(source),id:C.id('beat'),name:e.value.trim()||'Little beat'};C.assert(p.song.beats.length<16,'This song has sixteen beat variations.');p.song.beats.push(copy);c.beatId=copy.id;}else c.name=e.value.trim()||'Little idea';},'Clip renamed.'),
    'clip-start':e=>commit(()=>setClipStart(num(e.value,0,316)),'Placement moved.'),
    'clip-repeats':e=>commit(()=>{const c=C.findClip(p,ui.clip);c.repeats=Math.round(num(e.value,1,64,1));C.extend(p,c.start+c.duration*c.repeats);},'Clip repeats updated.'),
    'clip-mute':e=>commit(()=>C.findClip(p,ui.clip).mute=e.checked,'Clip mute updated.'),
    'export-scope':e=>{ui.exportScope=e.value;lastExportAudio=null;render();},'export-rate':e=>{ui.exportRate=+e.value;lastExportAudio=null;}
  };
  document.addEventListener('change',event=>{const el=event.target;if(!el.dataset.change)return;try{changes[el.dataset.change]?.(el);}catch(error){notify(error.message,true);}});
  function setClipStart(start){const c=C.findClip(p,ui.clip);C.assert(c,'Choose a clip first.');if(ui.clip.type==='notes'){const min=Math.min(...c.notes.map(n=>n.start)),delta=start-min;C.extend(p,Math.max(...c.notes.map(n=>n.start+n.duration))+delta);c.notes.forEach(n=>n.start+=delta);}else{C.extend(p,start+C.clipLength(p,ui.clip));c.start=start;}}
  function applyRange(key,value) {
    if(key==='shape-peak'||key==='shape-trough'){const side=ui.shaper.side,original=rangeBefore?.project.patch.project[side].points||p.patch.project[side].points;p.patch.project[side].points=C.Shape.levels(original,{[key==='shape-peak'?'peak':'trough']:value/100});p.patch.project[side].shape='custom';}
    else if(key.startsWith('fx-')){const [,index,parameter]=key.split('-');p.patch.project.effects[+index][parameter]=value/fxFactor(parameter);}
    else if(key==='blend')p.patch.project.amount=value/100;
    else if(key.startsWith('wave-')){const [,side,control]=key.split('-');p.patch.project[side][control]=['level','smoothness'].includes(control)?value/100:value;}
    else if(key==='drive'){p.patch.project.amp.enabled=value>0;p.patch.project.amp.drive=1+value/100*11;}
    else if(key==='swing')p.beat.pattern.swing=value/100;
    else if(key.startsWith('drum-')){const control=key.slice(5);p.beat.pattern.tracks[ui.drum][control]=control==='decay'?value/1000:['noise','level'].includes(control)?value/100:value;}
    else if(key==='part-level')p.melody.tracks.find(t=>t.id===ui.part).volume=value/100;
    else if(key.startsWith('clip-')){const c=C.findClip(p,ui.clip);C.assert(c,'Choose a clip first.');c[key.slice(5)]=key==='clip-pitch'?value:value/100;}
  }
  let rangeBefore=null,rangeElement=null;
  document.addEventListener('input',event=>{
    const el=event.target;
    if(el.id==='sound-name'){ui.soundName=el.value;return;}
    if(el.id==='pattern-name'){ui.patternNames[ui.part]=el.value;return;}
    if(el.dataset.eq!==undefined){audio.setEQ(+el.dataset.eq,+el.value);el.nextElementSibling.textContent=el.value+' dB';return;}
    const key=el.dataset.range;if(!key)return;
    if(!rangeBefore){rangeBefore=checkpoint();rangeElement=el;}
    try{applyRange(key,+el.value);const output=el.previousElementSibling;output.textContent=el.value+(el.dataset.suffix||'');audio.refresh(p);if(ui.step==='sound')paintWaves();}catch(e){notify(e.message,true);}
  });
  document.addEventListener('change',event=>{if(event.target===rangeElement&&rangeBefore){undo.push(rangeBefore);trimHistory();redo=[];rangeBefore=null;rangeElement=null;changed('Sound and mix updated.',false);}});
  document.addEventListener('dragstart',event=>{const tile=event.target.closest('[draggable]');if(!tile)return;ui.pattern=tile.dataset.id;event.dataTransfer.setData('application/x-dot-wave-pattern',tile.dataset.id);event.dataTransfer.effectAllowed='copy';});
  document.addEventListener('dragover',event=>{if(event.target.closest('.track-lane,.timeline-empty')){event.preventDefault();event.dataTransfer.dropEffect='copy';}});
  document.addEventListener('drop',event=>{const lane=event.target.closest('.track-lane'),timeline=$('timeline');if(!timeline)return;const id=event.dataTransfer.getData('application/x-dot-wave-pattern');if(!id)return;event.preventDefault();const rect=timeline.getBoundingClientRect(),beatWidth=+timeline.dataset.beatWidth,at=Math.max(0,Math.floor((event.clientX-rect.left-130)/beatWidth));commit(()=>placePattern(id,at,lane?.dataset.lane),'Pattern placed, with its own editable notes.');});
  // Each drag is a single history entry. The clock keeps running while the worker prepares edits.
  document.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    const wave=event.target.closest('canvas[data-wave]');
    if(wave){
      event.preventDefault();const side=wave.dataset.wave,point=wavePoint(wave,event),tool=ui.shaper.tool;ui.shaper.side=side;ui.shaper.cursor[side]=point.index;
      if(tool==='select'){gesture={kind:'wave-select',side,element:wave,from:point.slot,previous:[...ui.shaper.selection[side]],add:event.shiftKey};ui.shaper.selection[side]=[point.index];wave.setPointerCapture(event.pointerId);paintWaves();return;}
      const selection=ui.shaper.selection[side];
      if(tool==='grab'){
        if(event.shiftKey){ui.shaper.selection[side]=selection.includes(point.index)?selection.filter(i=>i!==point.index):[...selection,point.index];paintWaves();return;}
        if(!selection.includes(point.index))ui.shaper.selection[side]=[point.index];
      }else if(tool!=='draw')ui.shaper.selection[side]=[point.index];
      else ui.shaper.selection[side]=[];
      gesture={kind:'wave',side,before:checkpoint(),element:wave,previous:null,tool,index:point.index,selection:[...ui.shaper.selection[side]],base:[...p.patch.project[side].points]};wave.setPointerCapture(event.pointerId);drawWaveAt(event);return;
    }
    const note=event.target.closest('[data-note]'),row=event.target.closest('.piano-row');
    if(note){event.preventDefault();const key=note.dataset.note;if(event.shiftKey||event.ctrlKey||event.metaKey){ui.selected=ui.selected.includes(key)?ui.selected.filter(k=>k!==key):[...ui.selected,key];render();return;}
      if(ui.noteMode==='erase'){ui.selected=[key];deleteNotes();return;}
      if(!ui.selected.includes(key))ui.selected=[key];const paper=$('piano-paper'),t=p.melody.tracks.find(t=>t.id===ui.part),keys=[...ui.selected];
      gesture={kind:event.target.closest('.note-grip')?'resize-notes':'move-notes',element:paper,before:checkpoint(),keys,startX:event.clientX,startY:event.clientY,beatWidth:+paper.dataset.beatWidth,track:structuredClone(t),moved:false};paper.setPointerCapture(event.pointerId);
      document.querySelectorAll('[data-note]').forEach(el=>el.classList.toggle('selected',ui.selected.includes(el.dataset.note)));return;
    }
    if(row){event.preventDefault();const paper=$('piano-paper'),rect=paper.getBoundingClientRect(),x=event.clientX-rect.left-49,y=event.clientY-rect.top,beatWidth=+paper.dataset.beatWidth;
      if(ui.noteMode==='select'){gesture={kind:'box',element:paper,startX:x+49,startY:y,currentX:x+49,currentY:y,add:event.shiftKey,previous:[...ui.selected]};paper.setPointerCapture(event.pointerId);const box=document.createElement('div');box.className='selection-box';box.id='selection-box';paper.append(box);return;}
      if(x<0){audio.preview(p,+row.dataset.midi,p.melody.tracks.find(t=>t.id===ui.part).instrument).catch(e=>notify(e.message,true));return;}
      const start=C.clamp(Math.floor(x/beatWidth/ui.grid)*ui.grid,0,p.melody.bars*4-ui.grid),midi=+row.dataset.midi;ui.noteCursor=start;
      const t=p.melody.tracks.find(t=>t.id===ui.part),key=start+':'+midi;if(ui.noteMode==='erase'){ui.selected=[key];deleteNotes();return;}
      commit(()=>{C.assert(!t.notes.some(n=>C.noteKey(n)===key),'There is already a note here.');C.assert(p.melody.tracks.reduce((s,t)=>s+t.notes.length,0)<2048,'Keep up to 2,048 melody notes.');t.notes.push({start,midi,duration:Math.min(ui.length,p.melody.bars*4-start),velocity:ui.velocity});ui.selected=[key];},'Note painted.');audio.preview(p,midi,t.instrument).catch(e=>notify(e.message,true));return;
    }
    const clip=event.target.closest('[data-clip]');
    if(clip){event.preventDefault();ui.clip=JSON.parse(clip.dataset.clip);const timeline=$('timeline');gesture={kind:event.target.closest('.clip-grip')?'resize-clip':'move-clip',element:timeline,before:checkpoint(),startX:event.clientX,beatWidth:+timeline.dataset.beatWidth,moved:false,clip:structuredClone(C.findClip(p,ui.clip))};timeline.setPointerCapture(event.pointerId);document.querySelectorAll('[data-clip]').forEach(el=>el.classList.toggle('selected',sameSelection(JSON.parse(el.dataset.clip),ui.clip)));return;}
    const lane=event.target.closest('.track-lane');if(lane){const rect=lane.getBoundingClientRect(),beatWidth=+$('timeline').dataset.beatWidth;ui.cursor=C.clamp(Math.floor((event.clientX-rect.left)/beatWidth),0,p.song.bars*C.Song.beatsPerBar(p.song.meter)-1);ui.clip=null;render();}
  });
  function wavePoint(element,event){const rect=element.getBoundingClientRect(),slot=Math.round(C.clamp((event.clientX-rect.left)/rect.width,0,1)*32);return {index:slot%32,slot,value:C.clamp((rect.height/2-(event.clientY-rect.top))/(rect.height*.36),-1,1)};}
  function drawWaveAt(event){
    const g=gesture,point=wavePoint(g.element,event),voice=p.patch.project[g.side];
    if(g.tool==='draw')voice.points=C.Shape.drawClosed(voice.points,g.previous||point,point);
    else if(g.tool==='grab')voice.points=C.Shape.grab(g.base,g.selection,point.value-g.base[g.index],ui.shaper.reach);
    else if(g.tool==='peak'||g.tool==='trough'){voice.points=C.Shape.bump(g.base,point.index,g.tool==='peak'?1:-1,ui.shaper.reach);ui.shaper.selection[g.side]=[point.index];}
    else if(g.tool==='edge'){voice.points=C.Shape.edge(g.base,point.index,ui.shaper.reach);ui.shaper.selection[g.side]=[point.index];}
    ui.shaper.cursor[g.side]=g.tool==='grab'?g.index:point.index;voice.shape='custom';g.previous=point;paintWaves();
  }
  document.addEventListener('pointermove',event=>{
    const g=gesture;if(!g)return;
    if(g.kind==='wave'){drawWaveAt(event);return;}
    if(g.kind==='wave-select'){const point=wavePoint(g.element,event),arc=C.Shape.displayArc(g.from,point.slot);ui.shaper.selection[g.side]=g.add?[...new Set([...g.previous,...arc])]:arc;ui.shaper.cursor[g.side]=point.index;paintWaves();return;}
    if(g.kind==='box'){const rect=g.element.getBoundingClientRect();g.currentX=event.clientX-rect.left;g.currentY=event.clientY-rect.top;const box=$('selection-box');Object.assign(box.style,{left:Math.min(g.startX,g.currentX)+'px',top:Math.min(g.startY,g.currentY)+'px',width:Math.abs(g.startX-g.currentX)+'px',height:Math.abs(g.startY-g.currentY)+'px'});return;}
    const dx=event.clientX-g.startX,dy=event.clientY-g.startY;if(Math.abs(dx)+Math.abs(dy||0)>4)g.moved=true;if(!g.moved)return;
    try{
      if(g.kind.endsWith('notes')){
        const track=p.melody.tracks.find(t=>t.id===ui.part);track.notes=structuredClone(g.track.notes);const dt=Math.round(dx/g.beatWidth/ui.grid)*ui.grid,dp=g.kind==='move-notes'?-Math.round(dy/21):0;
        ui.selected=C.transformNotes(track,g.keys,g.kind==='move-notes'?dt:0,dp,g.kind==='resize-notes'?dt:0,p.melody.bars*4);
        const paper=g.element;for(const el of paper.querySelectorAll('[data-note]')){const old=g.track.notes.find(n=>C.noteKey(n)===el.dataset.note);if(!old||!g.keys.includes(el.dataset.note))continue;const n={...old,start:old.start+(g.kind==='move-notes'?dt:0),midi:old.midi+dp,duration:old.duration+(g.kind==='resize-notes'?dt:0)};el.style.left=n.start*g.beatWidth+'px';el.style.width=Math.max(7,n.duration*g.beatWidth)+'px';el.style.transform=`translateY(${-dp*21}px)`;}
      }else{
        const c=C.findClip(p,ui.clip),delta=Math.round(dx/g.beatWidth);Object.assign(c,structuredClone(g.clip));
        if(g.kind==='resize-clip'){if(ui.clip.type==='phrase'){c.repeats=Math.max(1,Math.round((g.clip.duration*g.clip.repeats+delta)/g.clip.duration));C.assert(c.start+c.duration*c.repeats<=p.song.bars*C.Song.beatsPerBar(p.song.meter),'Resize within the song, or add measures first.');}else{c.duration=Math.max(.25,g.clip.duration+delta);C.assert(c.start+c.duration<=p.song.bars*C.Song.beatsPerBar(p.song.meter),'Resize within the song, or add measures first.');}}
        else{const start=ui.clip.type==='notes'?Math.min(...g.clip.notes.map(n=>n.start)):g.clip.start;C.assert(start+delta>=0,'Keep the clip inside the song.');const length=C.clipLength(p,ui.clip);C.assert(start+delta+length<=p.song.bars*C.Song.beatsPerBar(p.song.meter),'Move within the song, or add measures first.');if(ui.clip.type==='notes')c.notes=g.clip.notes.map(n=>({...n,start:n.start+delta}));else c.start=start+delta;}
        const el=[...document.querySelectorAll('[data-clip]')].find(el=>sameSelection(JSON.parse(el.dataset.clip),ui.clip));const start=ui.clip.type==='notes'?Math.min(...c.notes.map(n=>n.start)):c.start;if(el){el.style.left=start*g.beatWidth+'px';el.style.width=Math.max(12,C.clipLength(p,ui.clip)*g.beatWidth)+'px';}
      }
      g.valid=true;
    }catch{g.valid=false;}
  });
  function finishGesture(cancel=false){const g=gesture;if(!g)return;gesture=null;
    if(g.kind==='wave-select'){if(cancel)ui.shaper.selection[g.side]=g.previous;paintWaves();announce(`Wave ${g.side.toUpperCase()} · ${ui.shaper.selection[g.side].length} dots selected.`);return;}
    if(g.kind==='box'){
      const rect=g.element.getBoundingClientRect(),x1=Math.min(g.startX,g.currentX),x2=Math.max(g.startX,g.currentX),y1=Math.min(g.startY,g.currentY),y2=Math.max(g.startY,g.currentY);const selected=[...g.element.querySelectorAll('[data-note]')].filter(el=>{const r=el.getBoundingClientRect();return r.right-rect.left>=x1&&r.left-rect.left<=x2&&r.bottom-rect.top>=y1&&r.top-rect.top<=y2;}).map(el=>el.dataset.note);ui.selected=g.add?[...new Set([...g.previous,...selected])]:selected;render();return;
    }
    if(cancel||((g.moved||g.kind==='wave')&&g.valid===false)){p=g.before.project;ui.clip=g.before.clip;if(g.keys)ui.selected=g.keys;render();if(!cancel)notify('That edit would leave the available space or collide with another note.',true);return;}
    if(g.kind==='wave'||g.moved){undo.push(g.before);trimHistory();redo=[];changed('Edit kept. One Undo brings it back.');}else render();
  }
  document.addEventListener('pointerup',()=>finishGesture());document.addEventListener('pointercancel',()=>finishGesture(true));
  document.addEventListener('keydown',event=>{
    const editing=event.target.closest('input,textarea,select,[contenteditable]');const mod=event.ctrlKey||event.metaKey;
    if(event.key==='Escape'){audio.stop();cancelRecording();finishGesture(true);return;}
    if(mod&&event.key.toLowerCase()==='s'){event.preventDefault();saveProject();return;}
    if(mod&&event.key.toLowerCase()==='o'){event.preventDefault();chooseFile('project');return;}
    if(editing||$('modal').open)return;
    if(mod&&event.key.toLowerCase()==='z'){event.preventDefault();history(event.shiftKey?'redo':'undo');return;}
    if(mod&&event.key.toLowerCase()==='y'){event.preventDefault();history('redo');return;}
    if(event.code==='Space'&&event.target.closest('.mini-play'))return;
    if(event.code==='Space'){event.preventDefault();togglePlay().catch(e=>notify(e.message,true));return;}
    if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();if(ui.step==='melody')deleteNotes();else if(ui.step==='arrange'&&ui.clip)deleteClip();return;}
    if(mod&&event.key.toLowerCase()==='d'){event.preventDefault();if(ui.step==='melody')duplicateNotes();else if(ui.step==='arrange')duplicateClip();return;}
    if(ui.step==='melody'&&ui.selected.length&&event.key.startsWith('Arrow')){event.preventDefault();if(event.key==='ArrowLeft'||event.key==='ArrowRight'){const delta=event.key==='ArrowLeft'?-ui.grid:ui.grid;moveNotes(event.shiftKey?0:delta,0,event.shiftKey?delta:0);}else moveNotes(0,event.key==='ArrowUp'?1:-1,0);}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden){audio.stop();cancelRecording();}});
  window.addEventListener('beforeunload',event=>{if(revision&&savedVersion!==revision){event.preventDefault();event.returnValue='';}});
  window.addEventListener('pagehide',()=>{audio.stop();cancelRecording();});
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(ui.step==='sound')paintWaves();if(ui.step==='export'&&lastExportAudio)paintExport(lastExportAudio);},150);});
  window.addEventListener('hashchange',()=>{const step=location.hash.slice(1);if(steps.includes(step))setStep(step);});
  let lastStep=-1,lastMiniPaint=0;
  function tick(now=0){
    if((audio.mini||audio.miniPending)&&now-lastMiniPaint>80){renderMiniPlayers();lastMiniPaint=now;}
    const seconds=audio.position(),beat=seconds*p.song.bpm/60,bar=C.Song.beatsPerBar(p.song.meter);$('clock').innerHTML=`${String(Math.floor(beat/bar)+1).padStart(2,'0')}<span> : </span>${Math.floor(beat%bar)+1}<span> : </span>${String(Math.floor(beat%1*100)).padStart(2,'0')}`;
    if(ui.step==='beat'){const step=Math.floor(beat*4)%C.D.stepsPerBar(p.beat.pattern.meter);if(step!==lastStep||!audio.playing){lastStep=step;document.querySelectorAll('[data-local-step]').forEach(el=>el.classList.toggle('playhead',audio.playing&&audio.scope==='beat'&&+el.dataset.localStep===step));}}
    if(ui.step==='melody'&&$('melody-playhead')){const line=$('melody-playhead');line.hidden=!(audio.playing&&audio.scope==='melody');line.style.left=49+beat*(43*ui.zoom)+'px';}
    if(ui.step==='arrange'&&$('song-cursor')){const bw=+$('timeline').dataset.beatWidth;$('song-cursor').style.left=130+(audio.playing&&audio.scope==='song'?beat:ui.cursor)*bw+'px';}
    requestAnimationFrame(tick);
  }
  try{const library=localStorage.getItem(LIBRARY);if(library)p.library=C.W.prepareImport(p.library,C.W.validateBundle(JSON.parse(library)),()=>C.id('sound')).waves;}catch{announce('Your saved sound box could not be opened. Import a library backup to restore it.');}
  try{if(window.DOT_STARTER_LIBRARY)p.library=C.W.prepareImport(p.library,C.W.validateBundle(window.DOT_STARTER_LIBRARY),()=>C.id('sound')).waves;}catch{announce('The bundled sound box could not be opened. Your existing saved sounds are preserved.');}
  try{const recovery=localStorage.getItem(STORE);if(recovery)ui.recover=recovery;}catch{}
  setStep(steps.includes(location.hash.slice(1))?location.hash.slice(1):requestedTelephone?'telephone':'sound');requestAnimationFrame(tick);
  refreshTelephone();
  if(window.DoodleBridge) DoodleBridge.watch(()=>refreshTelephone());
  window.DotWaveStudio=Object.freeze({version:'2.3.0',snapshot:()=>C.serialize(p),refreshTelephone,
    openTelephone(id){setStep('telephone');return refreshTelephone(id);},
    stop(){audio.stop();cancelRecording();},
    get state(){return {step:ui.step,playing:audio.playing,pending:audio.pending,scope:audio.scope,revision,selected:[...ui.selected],telephoneId:telephone.selected?.id||null};}});
})();
