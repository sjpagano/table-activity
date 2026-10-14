import assert from 'node:assert/strict';
import {REVIEW_PAGE_SIZE,reviewPage,enteredDate,displayDate,shiftDate,cellAt,drawMarkOverlay} from '../review.js';
import {pointAt} from '../vision.js';
import {draftRecord,restoredJob} from '../drafts.js';
const jobs=Array.from({length:67},(_,id)=>({id}));
assert.equal(reviewPage(jobs).items.length,REVIEW_PAGE_SIZE);assert.equal(reviewPage(jobs).pages,12);
assert.deepEqual(Array.from({length:12},(_,p)=>reviewPage(jobs,p).items).flat(),jobs);assert.equal(reviewPage(jobs,99).page,11);assert.equal(reviewPage([],99).page,0);
for(const [text,date] of [['10/8/26','2026-10-08'],['100826','2026-10-08'],['10082026','2026-10-08'],['2/29/24','2024-02-29'],['1/1/2000','2000-01-01']])assert.equal(enteredDate(text),date);
for(const text of ['','10082','13/8/26','2/29/25','10/8','10/8/2','10/8/20260'])assert.equal(enteredDate(text),null,text);
assert.equal(displayDate('2026-10-08'),'10/8/2026');assert.equal(shiftDate('2026-12-31',1),'2027-01-01');assert.equal(shiftDate('2024-03-01',-1),'2024-02-29');assert.equal(shiftDate('',1),null);
const corners=[{x:30,y:45},{x:2100,y:80},{x:2040,y:1320},{x:55,y:1450}];
for(let r=0;r<6;r++)for(let c=0;c<36;c++)assert.deepEqual(cellAt(corners,pointAt(corners,(c+.5)/36,(r+.5)/6),6,36),{r,c});
assert.equal(cellAt(corners,{x:0,y:0},6,36),null);assert.equal(cellAt(Array(4).fill({x:0,y:0}),{x:0,y:0},6,36),null);
let fills=0;const ctx={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){fills++;},stroke(){},arc(){}};drawMarkOverlay(ctx,corners,[[true,false],[false,true]]);assert.equal(fills,4); // Two highlighted cells, two identifying dots; blanks remain unfilled.
const job={id:1,status:'processing',date:'2026-10-08',dateSource:'manual',grid:[[true,false]],sourceBlob:new Blob(['image']),source:{largeCanvas:true},history:[1],file:new Blob(['original'])};
const record=draftRecord(job);assert.equal(record.status,'queued');assert.equal(record.hasSource,true);assert.equal(record.source,undefined);assert.equal(record.sourceBlob,undefined);assert.equal(record.file,undefined);assert.equal(record.history,undefined);job.grid[0][0]=false;assert.equal(record.grid[0][0],true);
const recovered=restoredJob({...record,dateSource:'metadata',reviewed:true});assert.equal(recovered.date,'');assert.equal(recovered.reviewed,false);assert.equal(recovered.sourceBlob,null);assert.equal(restoredJob(record).date,'2026-10-08');
assert.equal(restoredJob({...record,dateSource:'metadata',savedDate:record.date}).date,record.date); // Previously reviewed database dates remain editable records.
console.log('Large-batch review: bounded pages, fast dates, skewed overlay hit-testing, explicit blanks and lightweight recovery records passed.');
