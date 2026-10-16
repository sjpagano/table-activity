import {isISODate} from './core.js?v=20261016-2';
export function canReview(job){return job.status==='ready'&&!!job.grid&&isISODate(job.date)&&!job.alignmentDirty&&!job.gridWarning;}
export function batchSummary(jobs){
 const ready=jobs.filter(canReview).length,reviewed=jobs.filter(j=>canReview(j)&&j.reviewed).length;
 return {total:jobs.length,ready,reviewed,failed:jobs.filter(j=>j.status==='error').length,pending:jobs.filter(j=>['queued','processing'].includes(j.status)).length,canExport:jobs.length>0&&reviewed===jobs.length};
}
export function changeDate(job,date){job.date=date;job.dateSource='manual';job.dateNote='Date entered or corrected by you.';job.reviewed=false;}
// Date results belong to the job. Saving unrelated editor controls must never
// copy an older date or fallback message from the form over a newer OCR result.
export function saveEditorChanges(job,editor){
 for(const key of ['rows','times','grid','uncertain','corners','history','alignmentDirty','gridWarning','gridVersion','sensitivity','reviewed'])if(key in editor)job[key]=editor[key];
}
export function toggleMark(job,row,col){
 job.history.push({grid:job.grid.map(r=>[...r]),uncertain:[...job.uncertain]});
 if(job.history.length>50)job.history.shift();
 job.grid[row][col]=!job.grid[row][col];job.uncertain=job.uncertain.filter(k=>k!==`${row}:${col}`);job.reviewed=false;
}
export function matchingTemplate(job,template){return template&&JSON.stringify(job.rows)===JSON.stringify(template.rows)&&JSON.stringify(job.times)===JSON.stringify(template.times)?template:null;}

export function reviewSequence(jobs,activeId=null){return jobs.filter(j=>j.status==='ready'&&(!j.reviewed||j.id===activeId));}
export function adjacentReview(jobs,activeId,direction=1){
 const sequence=reviewSequence(jobs,activeId),index=sequence.findIndex(j=>j.id===activeId);
 if(!sequence.length)return null;
 return sequence[(Math.max(0,index)+direction+sequence.length)%sequence.length];
}
export function acceptReview(jobs,job){
 if(!canReview(job))return null;
 job.reviewed=true;
 const at=jobs.indexOf(job),ordered=[...jobs.slice(at+1),...jobs.slice(0,at)];
 return ordered.find(j=>j.status==='ready'&&!j.reviewed)||null;
}
export async function submitReviewed(jobs,{save,forget}){
 const submitted=[...jobs];
 if(!batchSummary(submitted).canExport)throw Error('Review every scan before saving.');
 if(!await save(submitted))return {count:0,cleanupFailed:false};
 const ids=new Set(submitted.map(j=>j.id));
 jobs.splice(0,jobs.length,...jobs.filter(j=>!ids.has(j.id)));
 let cleanupFailed=false;
 for(const job of submitted){try{await forget(job.id);}catch{cleanupFailed=true;}}
 return {count:submitted.length,cleanupFailed};
}
