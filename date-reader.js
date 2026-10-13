import {handwritingDate,parseDates,metadataDate,isISODate} from './core.js?v=20261013-1';

export function metadataFallback(job){
 const creation=metadataDate(job.pdfInfo?.CreationDate),modified=metadataDate(job.pdfInfo?.ModDate);
 if(creation)return {date:creation,label:'PDF creation date'};
 if(modified)return {date:modified,label:'PDF modification date'};
 if(isISODate(job.photoDate))return {date:job.photoDate,label:'photo EXIF date'};
 if(job.file?.lastModified){const d=new Date(job.file.lastModified);if(!Number.isNaN(d.valueOf()))return {date:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,label:'file modification date'};}
 return null;
}

// Readers run in priority order. Metadata is consulted only after every
// document reader fails, never as a competing candidate for an activity date.
export async function readActivityDate(job,readers){
 const log=[],errors=[];let result=null,origin='';
 const attempt=async(label,read,strict=false)=>{
  try{
   const text=await read();log.push(`${label}: ${text||'(no text)'}`);
   const dates=strict?parseDates(text):null;
   const candidate=strict?(dates.length===1?{date:dates[0],repaired:false}:null):handwritingDate(text);
   if(candidate&&(!result||result.weekdayMismatch&&!candidate.weekdayMismatch)){result=candidate;origin=label;}
  }catch(e){errors.push(label);log.push(`${label}: ${e.message||'Reader unavailable'}`);}
 };
 await attempt('Scanned handwriting',readers.handwriting);
 // A second rendering helps when punctuation is lost or the weekday conflicts.
 if(!result||result.weekdayMismatch)await attempt('Scanned handwriting retry',readers.retryHandwriting);
 if(!result||result.weekdayMismatch)await attempt('Scanned text',readers.text);
 if(!result)await attempt('Document header',readers.header,true);
 if(!result&&job.pdfText)await attempt('Embedded PDF text',()=>job.pdfText,true);
 job.ocrText=log.join('\n');
 if(job.dateSource==='manual')return;
 if(result){
  job.date=result.date;job.dateSource=result.repaired||result.weekdayMismatch?'suggestion':'document';
  job.dateNote=result.weekdayMismatch?'Scanned date used, but the read weekday disagrees. Check the date crop and correct it if needed.':result.repaired?'Scanned date read as M/D/Y. Check it against the crop.':`Date read from ${origin==='Embedded PDF text'?'embedded PDF text':origin.toLowerCase()}.`;
  job.ocrText+=`\nSelected document date: ${result.date}. Metadata was not used.`;
 }else if(['document','suggestion'].includes(job.dateSource)&&isISODate(job.date)){
  job.dateNote='Could not read the date again. Kept the previously scanned date; check the crop.';
 }else{
  const metadata=metadataFallback(job);job.date=metadata?.date||'';job.dateSource=metadata?'metadata':'';
  const reason=errors.length?'A date reader could not finish.':'No valid date was recognized in the scan.';
  job.dateNote=metadata?`${reason} Using ${metadata.label} (${metadata.date}) as a fallback. Check the crop; this may be the scanning date. Open the scan to retry.`:`${reason} Enter the activity date from the crop.`;
 }
}
