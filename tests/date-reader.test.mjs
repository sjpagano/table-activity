import assert from 'node:assert/strict';
import {readActivityDate} from '../date-reader.js';
import {handwritingDate} from '../core.js';
const makeJob=()=>({pdfInfo:{CreationDate:"D:20261009041141Z00'00'"},pdfText:'10/9/26',date:'2026-10-09',dateSource:'metadata'});
const run=async(texts,job=makeJob())=>{
 const calls=[];const readers=Object.fromEntries(['handwriting','retryHandwriting','text','header'].map(name=>[name,async()=>{calls.push(name);if(texts[name] instanceof Error)throw texts[name];return texts[name]||'';}]));
 await readActivityDate(job,readers);return {job,calls};
};
let r=await run({handwriting:'1018126 Thursday'});
assert.equal(r.job.date,'2026-10-08');assert.equal(r.job.dateSource,'suggestion');assert.deepEqual(r.calls,['handwriting']);
assert.match(r.job.ocrText,/Metadata was not used/);
// Common punctuation OCR errors no longer discard an otherwise readable date.
for(const text of ['10/8126','10 | 8 | 26','10,8,26 THU','10/8/26 Friday']){
 r=await run({handwriting:text});assert.equal(r.job.date,'2026-10-08',text);assert.notEqual(r.job.dateSource,'metadata');
}
assert.equal(handwritingDate('10/8/26 Friday').weekdayMismatch,true);
assert.equal(handwritingDate('1018126 Friday'),null);
r=await run({handwriting:'garbled',retryHandwriting:'10/8/26 THURSDAY'});
assert.deepEqual(r.calls,['handwriting','retryHandwriting']);assert.equal(r.job.date,'2026-10-08');
r=await run({handwriting:new Error('Model unavailable'),text:'10/8/26'});
assert.deepEqual(r.calls,['handwriting','text']);assert.equal(r.job.date,'2026-10-08');
r=await run({handwriting:'10/2/26 Thursday',retryHandwriting:'10/8/26 Thursday'});
assert.equal(r.job.date,'2026-10-08');
r=await run({});assert.equal(r.job.date,'2026-10-09');assert.equal(r.job.dateSource,'document');assert.match(r.job.dateNote,/embedded PDF/);
r=await run({}, {...makeJob(),pdfText:''});assert.equal(r.job.date,'2026-10-09');assert.equal(r.job.dateSource,'metadata');assert.match(r.job.dateNote,/fallback/);
r=await run({handwriting:new Error('Offline')},{...makeJob(),pdfText:''});assert.match(r.job.dateNote,/could not finish/);
r=await run({handwriting:'10/8/26'},{...makeJob(),date:'2026-10-07',dateSource:'manual'});assert.equal(r.job.date,'2026-10-07');assert.equal(r.job.dateSource,'manual');
r=await run({}, {...makeJob(),pdfText:'',date:'2026-10-08',dateSource:'suggestion'});assert.equal(r.job.date,'2026-10-08');assert.equal(r.job.dateSource,'suggestion');
r=await run({}, {date:'',dateSource:''});assert.equal(r.job.date,'');assert.match(r.job.dateNote,/Enter the activity date/);
console.log('Date priority checks passed: scan, retry, OCR, PDF text, metadata, errors and manual corrections.');
