import assert from 'node:assert/strict';
import {handwritingDate} from '../core.js';
import {readActivityDate} from '../date-reader.js';

for(const [text,date] of [
 ['10( 8126 Thursday','2026-10-08'], // Actual first-pass OCR output.
 ['1018126','2026-10-08'],           // Both slashes read as vertical strokes.
 ['Date: 10 / 8 / 2026 THURSDAY','2026-10-08'],
 ['6/5/2025','2025-06-05'],
 ['12/31126','2026-12-31'],
 ['3( 14125','2025-03-14'],
 ['2/29/24','2024-02-29'],
 ['1/11/26','2026-01-11'],
 ['11/1/26','2026-11-01'],
 ['10/2/26 Thursday','2026-10-02']  // Never rewrite an actual digit to fit a weekday.
])assert.equal(handwritingDate(text)?.date,date,text);
for(const text of ['1111126','13/8/26','2/29/25','2/30/26','10/8','10/8/2','10/8/126','2026/10/8','10/8/26 10/9/26','no date']){
 assert.equal(handwritingDate(text),null,text);
}
assert.equal(handwritingDate('1111126 Sunday'),null); // Both alternatives are Sundays.
assert.equal(handwritingDate('1121126 Wednesday')?.date,'2026-01-21');
assert.equal(handwritingDate('10( 8126 Thursday')?.repaired,true);

// A transient model failure must get an automatic retry, not require a click.
const job={pdfInfo:{CreationDate:'D:20261009'},dateSource:''},calls=[];
await readActivityDate(job,{
 handwriting:async()=>{calls.push('first');throw Error('Worker initialization failed');},
 retryHandwriting:async()=>{calls.push('retry');return '10( 8126 Thursday';},
 text:async()=>{throw Error('Lower-priority reader should not run');},
 header:async()=>{throw Error('Lower-priority reader should not run');}
});
assert.deepEqual(calls,['first','retry']);assert.equal(job.date,'2026-10-08');
assert.equal(job.dateSource,'suggestion');assert.match(job.ocrText,/Worker initialization failed/);
console.log('M/D/Y checks passed: observed OCR error, missing weekday, unique separator repairs, ambiguity, valid calendar dates and automatic error recovery.');
