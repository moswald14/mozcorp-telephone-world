// SPDX-License-Identifier: GPL-3.0-only
// Explicit listening only. Uses the existing Studio renderer; it cannot sign or alter a project.
export function createCreativeScorePlayer({onStatus=()=>{},createContext=()=>new AudioContext(),createWorker=()=>new Worker(new URL('./studio-worker.js',import.meta.url))}={}){
  let context=null,worker=null,source=null,gain=null,cancel=null,ticket=0,playing=false;
  function stop(){
    ticket++;cancel?.();cancel=null;worker?.terminate();worker=null;
    try{source?.stop();source?.disconnect();}catch{}source=null;gain?.disconnect();gain=null;playing=false;
    try{context?.suspend().catch(()=>{});}catch{}
  }
  async function play(record){
    stop();const ownTicket=ticket;
    if(!record?.soundtrack)throw new Error('Save a soundtrack with this world in Dot Studio first.');
    try{
      context ||= createContext();await context.resume();if(ownTicket!==ticket)return false;
      onStatus('Rendering the attached Studio soundtrack…');
      const audio=await new Promise((resolve,reject)=>{
        const ownWorker=createWorker();worker=ownWorker;
        let ownCancel;
        const finish=()=>{clearTimeout(timer);ownWorker.terminate();if(worker===ownWorker)worker=null;if(cancel===ownCancel)cancel=null;};
        const timer=setTimeout(()=>{finish();reject(new Error('The soundtrack took too long. Shorten it in Studio, then try again.'));},60000);
        ownCancel=()=>{finish();resolve(null);};cancel=ownCancel;
        ownWorker.onmessage=event=>{finish();event.data.error?reject(new Error(event.data.error)):resolve(event.data.audio);};
        ownWorker.onerror=()=>{finish();reject(new Error('The soundtrack could not render. Open it in Dot Studio to review it.'));};
        try{ownWorker.postMessage({id:ownTicket,project:record.soundtrack,scope:'song',options:{rate:44100}});}catch(e){finish();reject(e);}
      });
      if(ownTicket!==ticket||!audio)return false;
      const buffer=context.createBuffer(2,audio.left.length,audio.rate);buffer.copyToChannel(audio.left,0);buffer.copyToChannel(audio.right,1);
      source=context.createBufferSource();source.buffer=buffer;source.loop=true;gain=context.createGain();gain.gain.value=.22;
      source.connect(gain);gain.connect(context.destination);source.start();playing=true;
      onStatus('Attached Studio soundtrack is playing. Stop sound & motion ends playback.');return true;
    }catch(e){if(ownTicket!==ticket)return false;stop();throw e;}
  }
  return{play,stop,isPlaying:()=>playing};
}
