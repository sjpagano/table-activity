import assert from 'node:assert/strict';
import {batchSummary,canReview,changeDate,toggleMark,matchingTemplate} from '../batch.js';
function job(){return {status:'ready',date:'2026-10-08',grid:[[true,false],[false,true]],uncertain:['0:1'],history:[],rows:['3','5'],times:['11a','1130a'],reviewed:true};}
const batch=Array.from({length:10},job);
assert.equal(batchSummary(batch).canExport,true);
changeDate(batch[0],'');assert.equal(canReview(batch[0]),false);assert.equal(batchSummary(batch).canExport,false);assert.equal(batch[1].reviewed,true);
changeDate(batch[0],'2026-10-09');assert.equal(batch[0].reviewed,false);assert.equal(batch[0].dateSource,'manual');
toggleMark(batch[1],0,1);assert.equal(batch[1].grid[0][1],true);assert.equal(batch[2].grid[0][1],false);assert.equal(batch[1].reviewed,false);assert.deepEqual(batch[1].history[0].grid,[[true,false],[false,true]]);assert.deepEqual(batch[1].uncertain,[]);
batch[2].status='error';assert.equal(batchSummary(batch).failed,1);assert.equal(batchSummary(batch).canExport,false);
batch[3].status='processing';assert.equal(batchSummary(batch).pending,1);
batch[4].alignmentDirty=true;assert.equal(canReview(batch[4]),false);
assert.equal(batchSummary([]).canExport,false);
assert.equal(matchingTemplate(batch[0],{rows:['9'],times:['11a']}),null);
const template={rows:['3','5'],times:['11a','1130a']};assert.equal(matchingTemplate(batch[0],template),template);
console.log('Batch checks passed: independent corrections, review invalidation, failed/pending/alignment export gates and matching templates.');
