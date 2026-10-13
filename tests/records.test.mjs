import assert from 'node:assert/strict';
import {timeMinute,validateRecord,summarize,weekStart,dayOffset,planSave,parseBackup} from '../records.js';
const day={date:'2026-10-08',rows:['3','5'],times:['11a','1130a','12p','12a','1230a','1a'],grid:[[true,false,true,false,true,false],[true,true,false,false,true,false]]};
assert.equal(timeMinute('1130a'),690);assert.equal(timeMinute('12p'),720);assert.equal(timeMinute('12a'),0);assert.equal(timeMinute('1:30 PM'),810);assert.equal(timeMinute('24:00'),null);
validateRecord(day);assert.throws(()=>validateRecord({...day,grid:[[true]]}));assert.throws(()=>validateRecord({...day,grid:day.grid.map(r=>r.map(Number))}));assert.throws(()=>validateRecord({...day,times:['11a','11:00 AM']}));
const next={...day,date:'2026-10-09',rows:['3'],grid:[Array(6).fill(false)]};
let s=summarize([day,next]);assert.equal(s.marks,6);assert.equal(s.possible,18);assert.equal(s.occupancy,6/18);assert.equal(s.days.length,2);
assert.equal(s.hours.find(h=>h.minute===660).average,1.5/2); // 3 X / 4 observations, not divided by missing days
s=summarize([day,next],{start:'2026-10-08',end:'2026-10-08',table:'5',from:660,to:690});assert.equal(s.marks,2);assert.equal(s.possible,2);assert.equal(s.occupancy,1);
s=summarize([day],{from:720,to:30});assert.equal(s.marks,3);assert.equal(s.observations,3); // noon through 12:30 AM
s=summarize([day],{from:0});assert.equal(s.marks,2);assert.equal(s.observations,3);
s=summarize([day],{to:690});assert.equal(s.marks,3);assert.equal(s.observations,2);
assert.equal(summarize([day],{table:'99'}).days.length,0);
assert.equal(summarize([{...day,archived:true}]).days.length,0);
assert.equal(summarize([day],{start:'2026-10-10'}).occupancy,null);
assert.equal(weekStart('2026-10-11'),'2026-10-05');assert.equal(weekStart('2026-10-12'),'2026-10-12');assert.equal(dayOffset('2026-03-08',1),'2026-03-09');assert.equal(dayOffset('2026-12-31',1),'2027-01-01');
const jobs=[{...day,fileName:'test.pdf'}];assert.equal(planSave(jobs,[])[0].expected_revision,0);assert.equal(planSave(jobs,[{...day,revision:3}])[0].expected_revision,3);
const stalePlan=planSave([{...jobs[0],savedRevision:2,savedDate:day.date}],[{...day,revision:3}])[0];
assert.equal(stalePlan.expected_revision,3);assert.equal(stalePlan.changed_elsewhere,true); // show the newer record for explicit replacement approval; later writes still fail at the server
assert.throws(()=>planSave([...jobs,...jobs],[]),/more than one/);assert.throws(()=>planSave([{...jobs[0],savedDate:'2026-10-07'}],[]),/cannot be changed/);
assert.deepEqual(parseBackup(JSON.stringify({format:'table-activity-v1',days:[day,{...next,archived:true}]})),[day]);
console.log('Database records: explicit blanks, totals, overnight filters, missing dates, occupancy, archive, revisions and backups passed.');
