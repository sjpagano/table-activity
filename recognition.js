import {canvas} from './vision.js?v=20261023-1';
import {recognitionCrop} from './date-crop.js?v=20261023-1';
import {readActivityDate} from './date-reader.js?v=20261023-1';
let ocrWorker,handwritingWorker;
function readHandwriting(crop,onProgress){return new Promise((resolve,reject)=>{
 if(!handwritingWorker)handwritingWorker=new Worker(new URL('./handwriting-worker.js?v=20261023-1',import.meta.url),{type:'module'});
 let timer;
 const timeout=()=>{handwritingWorker?.terminate();handwritingWorker=null;reject(Error('Handwriting reader timed out. Check your connection and try Read date again.'));};
 // Reset the idle timeout during the first model download, which can take
 // longer than two minutes on a phone without the reader having failed.
 const arm=()=>{clearTimeout(timer);timer=setTimeout(timeout,120000);};arm();
 handwritingWorker.onerror=e=>{clearTimeout(timer);handwritingWorker?.terminate();handwritingWorker=null;reject(Error(e.message||'Handwriting reader could not start.'));};
 handwritingWorker.onmessage=({data})=>{
  if(data.progress!==undefined){arm();onProgress('Loading handwriting reader: '+data.progress+'% (about 65 MB on first use)…');return;}
  clearTimeout(timer);
  if(data.error){handwritingWorker?.terminate();handwritingWorker=null;reject(Error(data.error));}
  else resolve(data.text);
 };
 const data=crop.getContext('2d').getImageData(0,0,crop.width,crop.height);handwritingWorker.postMessage({width:crop.width,height:crop.height,pixels:data.data.buffer},[data.data.buffer]);
});}
async function readText(crop,mode){
 if(!ocrWorker)ocrWorker=await Tesseract.createWorker('eng',1,{workerPath:new URL('./vendor/worker.min.js',location.href).href,corePath:new URL('./vendor/core/tesseract-core-lstm.wasm.js',location.href).href,langPath:new URL('./vendor/',location.href).href,workerBlobURL:false});
 try{await ocrWorker.setParameters({tessedit_pageseg_mode:mode});return (await ocrWorker.recognize(crop)).data.text;}
 catch(e){const failed=ocrWorker;ocrWorker=null;await failed?.terminate().catch(()=>{});throw e;}
}
async function recognize(job,onProgress){
 if(!job.source)return;
 const crop=await recognitionCrop(job);
 try{await readActivityDate(job,{
  handwriting:()=>{onProgress('Reading handwriting above the table (first use downloads about 65 MB)…');return readHandwriting(crop,onProgress);},
  retryHandwriting:async()=>{
   onProgress('Checking the scanned date again…');
   const pad=Math.ceil(crop.height*.18),retry=canvas(crop.width+2*pad,crop.height+2*pad),ctx=retry.getContext('2d');
   ctx.fillStyle='#fff';ctx.fillRect(0,0,retry.width,retry.height);ctx.drawImage(crop,pad,pad);
   try{return await readHandwriting(retry,onProgress);}finally{retry.width=retry.height=1;}
  },
  text:()=>{onProgress('Reading date text above the table…');return readText(crop,'7');},
  header:async()=>{
   const top=Math.max(80,Math.min(job.source.height*.45,Math.min(...job.corners.map(p=>p.y))));
   const header=canvas(job.source.width,Math.ceil(top));header.getContext('2d').drawImage(job.source,0,0);try{return await readText(header,'11');}finally{header.width=header.height=1;}
  }
 });}finally{crop.width=crop.height=1;}
}
let queue=Promise.resolve();
export function recognizeDate(job,onProgress=()=>{}){const task=queue.then(()=>recognize(job,onProgress));queue=task.catch(()=>{});return task;}
export function releaseRecognition(){const task=queue.then(async()=>{handwritingWorker?.terminate();handwritingWorker=null;const old=ocrWorker;ocrWorker=null;await old?.terminate().catch(()=>{});});queue=task.catch(()=>{});return task;}
