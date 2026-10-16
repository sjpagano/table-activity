import {handwritingDate,parseDates,isISODate} from './core.js?v=20261016-2';

// Only text on the document can supply an activity date. Metadata is ignored.
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
  job.date='';job.dateSource='';
  const reason=errors.length?'A date reader could not finish.':'No valid date was recognized in the scan.';
  job.dateNote=`${reason} Enter the activity date from the crop.`;
 }
}
