import {isISODate} from './core.js';
export function canReview(job){return job.status==='ready'&&!!job.grid&&isISODate(job.date)&&!job.alignmentDirty;}
export function batchSummary(jobs){
 const ready=jobs.filter(canReview).length,reviewed=jobs.filter(j=>canReview(j)&&j.reviewed).length;
 return {total:jobs.length,ready,reviewed,failed:jobs.filter(j=>j.status==='error').length,pending:jobs.filter(j=>['queued','processing'].includes(j.status)).length,canExport:jobs.length>0&&reviewed===jobs.length};
}
export function changeDate(job,date){job.date=date;job.dateSource='manual';job.dateNote='Date entered or corrected by you.';job.reviewed=false;}
export function toggleMark(job,row,col){
 job.history.push({grid:job.grid.map(r=>[...r]),uncertain:[...job.uncertain]});
 if(job.history.length>50)job.history.shift();
 job.grid[row][col]=!job.grid[row][col];job.uncertain=job.uncertain.filter(k=>k!==`${row}:${col}`);job.reviewed=false;
}
export function matchingTemplate(job,template){return template&&JSON.stringify(job.rows)===JSON.stringify(template.rows)&&JSON.stringify(job.times)===JSON.stringify(template.times)?template:null;}
