import {parseDates,metadataDate,handwritingDate} from './core.js';
import {canvas} from './vision.js';
import {dateCrop} from './date-crop.js';
function setResult(job,date,dateSource,dateNote){Object.assign(job,{date,dateSource,dateNote});}
function metadataFallback(job){const pdf=job.pdfInfo;const creation=metadataDate(pdf?.CreationDate),mod=metadataDate(pdf?.ModDate);if(creation)return {date:creation,label:'PDF creation date'};if(mod)return {date:mod,label:'PDF modification date'};if(job.photoDate)return {date:job.photoDate,label:'photo EXIF date'};if(job.file?.lastModified){const d=new Date(job.file.lastModified);return {date:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,label:'file modification date'};}return null;}
let ocrWorker,handwritingWorker;
function readHandwriting(crop,onProgress){return new Promise((resolve,reject)=>{
 if(!handwritingWorker)handwritingWorker=new Worker(new URL('./handwriting-worker.js',import.meta.url),{type:'module'});
 const timer=setTimeout(()=>{handwritingWorker?.terminate();handwritingWorker=null;reject(Error('Handwriting reader timed out.'));},120000);
 handwritingWorker.onerror=e=>{clearTimeout(timer);handwritingWorker?.terminate();handwritingWorker=null;reject(Error(e.message||'Handwriting reader could not start.'));};
 handwritingWorker.onmessage=({data})=>{if(data.progress!==undefined){onProgress('Loading handwriting reader: '+data.progress+'% (about 65 MB on first use)…');return;}clearTimeout(timer);data.error?reject(Error(data.error)):resolve(data.text);};
 const data=crop.getContext('2d').getImageData(0,0,crop.width,crop.height);handwritingWorker.postMessage({width:crop.width,height:crop.height,pixels:data.data.buffer},[data.data.buffer]);
});}
async function recognize(job,onProgress){
 if(!job.source)return;
 const crop=dateCrop(job.source,job.corners,job.rows.length);job.datePreview=crop.toDataURL('image/jpeg',.9);
 let text=job.pdfText||'',notes=[],result=null;
 const embedded=parseDates(text);if(embedded.length===1)result={date:embedded[0],repaired:false};
 if(!result)try{
  onProgress('Reading handwriting above the table (first use downloads about 65 MB)…');
  const handwritten=await readHandwriting(crop,onProgress);text+='\nHandwriting: '+handwritten;result=handwritingDate(handwritten);
 }catch(e){notes.push('Handwriting: '+e.message);}
 if(!result)try{
  if(!ocrWorker)ocrWorker=await Tesseract.createWorker('eng',1,{workerPath:new URL('./vendor/worker.min.js',location.href).href,corePath:new URL('./vendor/core/tesseract-core-lstm.wasm.js',location.href).href,langPath:new URL('./vendor/',location.href).href,workerBlobURL:false});
  await ocrWorker.setParameters({tessedit_pageseg_mode:'7'});
  const line=(await ocrWorker.recognize(crop)).data.text;text+='\nText reader: '+line;result=handwritingDate(line);
  if(!result){await ocrWorker.setParameters({tessedit_pageseg_mode:'11'});const top=Math.max(80,Math.min(job.source.height*.45,Math.min(...job.corners.map(p=>p.y))));const header=canvas(job.source.width,Math.ceil(top));header.getContext('2d').drawImage(job.source,0,0);const found=(await ocrWorker.recognize(header)).data.text;text+='\nHeader: '+found;const dates=parseDates(found);if(dates.length===1)result={date:dates[0],repaired:false};}
 }catch(e){notes.push('Text reader: '+e.message);ocrWorker=null;}
 job.ocrText=(text.trim()||'No readable date text.')+(notes.length?'\n'+notes.join('\n'):'');
 if(job.dateSource==='manual')return;
 if(result)setResult(job,result.date,result.repaired?'suggestion':'document',result.repaired?'Suggested from handwriting; ambiguous slashes were checked against the written weekday. Verify the date shown below.':'Date read from the document. Check it against the original below.');
 else{const meta=metadataFallback(job);setResult(job,meta?.date||'','metadata',meta?'Date not readable. Using '+meta.label+': '+meta.date+'. This may be the scanning date; check the original below and correct it.':'No readable date or usable metadata. Enter the activity date manually.');}
}

let queue=Promise.resolve();
export function recognizeDate(job,onProgress=()=>{}){const task=queue.then(()=>recognize(job,onProgress));queue=task.catch(()=>{});return task;}
