import assert from 'node:assert/strict';
import {reviewSequence,adjacentReview,acceptReview,submitReviewed,changeDate} from '../batch.js';

const scan=id=>({id,status:'ready',date:`2026-10-${String(id).padStart(2,'0')}`,grid:[[true,false]],reviewed:false});
const scans=Array.from({length:7},(_,i)=>scan(i+1));
assert.equal(adjacentReview(scans,7).id,1);
assert.equal(adjacentReview(scans,1,-1).id,7);
let next=acceptReview(scans,scans[0]);
assert.equal(next.id,2);
assert.equal(reviewSequence(scans,next.id).length,6);
assert.equal(scans.length,7,'Accepted scans remain in the overview until submitted');
assert.equal(adjacentReview(scans,2,-1).id,7);
assert.equal(adjacentReview(scans,7).id,2);
for(let i=1;i<7;i++)next=acceptReview(scans,scans[i]);
assert.equal(next,null,'The last acceptance returns to the overview');
assert.equal(reviewSequence(scans).length,0);
assert.deepEqual(reviewSequence(scans,3).map(j=>j.id),[3],'An accepted image can still be reopened');
assert.equal(scans[2].reviewed,true,'Inspection alone preserves acceptance');
changeDate(scans[2],'2026-10-13');
assert.deepEqual(reviewSequence(scans).map(j=>j.id),[3],'Editing brings a scan back into the review sequence');
acceptReview(scans,scans[2]);
const incomplete={...scan(8),date:''};
assert.equal(acceptReview([incomplete],incomplete),null);
assert.equal(incomplete.reviewed,false);
assert.equal(adjacentReview([],null),null);

const forgotten=[];
await assert.rejects(submitReviewed(scans,{save:async()=>{throw Error('Offline');},forget:async id=>forgotten.push(id)}),/Offline/);
assert.equal(scans.length,7);
assert.equal(forgotten.length,0,'Failed saves must keep both the queue and drafts');
assert.equal((await submitReviewed(scans,{save:async()=>false,forget:async id=>forgotten.push(id)})).count,0);
assert.equal(scans.length,7);
const result=await submitReviewed(scans,{save:async submitted=>{
 assert.equal(submitted.length,7);assert(submitted.every(j=>j.reviewed));
 scans.push(scan(8)); // A later selection must survive the submitted snapshot.
 return true;
},forget:async id=>forgotten.push(id)});
assert.deepEqual(result,{count:7,cleanupFailed:false});
assert.deepEqual(scans.map(j=>j.id),[8]);
assert.deepEqual(forgotten,[1,2,3,4,5,6,7]);
await assert.rejects(submitReviewed(scans,{save:()=>assert.fail('Unreviewed scans cannot be saved')}),/Review every scan/);
acceptReview(scans,scans[0]);
assert.deepEqual(await submitReviewed(scans,{save:async()=>true,forget:async()=>{throw Error('Storage unavailable');}}),{count:1,cleanupFailed:true});
assert.equal(scans.length,0,'A local cleanup problem must not pretend the cloud save failed');
console.log('Review flow passed: wrapping, shrinking sequence, reopening, edit invalidation, successful clearing and failed-save retention.');
