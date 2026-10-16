import assert from 'node:assert/strict';
import {createImportQueue} from '../import-queue.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
let busy=true,release;const batches=[],counts=[],errors=[];
const q=createImportQueue({blocked:()=>busy,pending:n=>counts.push(n),error:e=>errors.push(e),consume:async files=>{batches.push([...files]);if(files[0]===1)await new Promise(r=>release=r);}});
// The picker can return 50 files while recognition is busy. Nothing is lost.
q.add(Array.from({length:50},(_,i)=>i+1));await tick();assert.equal(batches.length,0);assert.equal(q.count(),50);
busy=false;q.resume();await tick();assert.equal(batches[0].length,50);
// Another selection arrives while the first selection is being stored.
q.add([51,52]);assert.equal(q.count(),52);release();await tick();
assert.deepEqual(batches.flat(),Array.from({length:52},(_,i)=>i+1));assert.equal(q.count(),0);assert.equal(counts.at(-1),0);assert.equal(errors.length,0);
// A batch error is visible and does not prevent a later selection.
const seen=[];const failed=createImportQueue({blocked:()=>false,error:e=>seen.push(e.message),consume:async files=>{if(files[0]==='bad')throw Error('storage failed');seen.push(files[0]);}});
failed.add(['bad']);failed.add(['next']);await tick();assert.deepEqual(seen,['storage failed','next']);
console.log('Import checks passed: 50-file selection, busy deferral, additional selections, and visible failures.');
