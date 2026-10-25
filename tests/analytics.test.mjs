import assert from 'node:assert/strict';
import {monthlyBreakdown,monthRange,runQuery,queryCSV} from '../analytics.js';
import {summarize} from '../records.js';

// In-memory fixtures only. These tests never connect to or seed the database.
const records=[
  {date:'2025-01-03',rows:['3','5'],times:['6p','630p','12a','2a'],grid:[[true,false,true,false],[true,true,false,true]]},
  {date:'2025-01-04',rows:['3'],times:['6p','12a'],grid:[[true,false]]},
  {date:'2025-02-01',rows:['3','5'],times:['6p'],grid:[[false],[false]]},
  {date:'2026-01-03',rows:['3','5'],times:['6p','12a'],grid:[[true,true],[true,true]]},
  {date:'2025-01-05',rows:['3'],times:['6p'],grid:[[true]],archived:true}
];
const before=JSON.stringify(records);
let months=monthlyBreakdown(records,'2025');
assert.equal(months.length,12);assert.equal(months[0].label,'January');assert.equal(months[11].label,'December');
assert.deepEqual([months[0].days,months[0].marks,months[0].possible,months[0].observations],[2,6,10,6]);
assert.equal(months[0].occupancy,.6,'Weight by recorded cells, not daily percentages');assert.equal(months[0].average,1);
assert.equal(months[1].occupancy,0,'A saved blank sheet is zero activity');assert.equal(months[1].days,1);
assert.equal(months[2].occupancy,null,'An absent month must not be zero activity');assert.equal(months[2].average,null);
assert.equal(monthlyBreakdown(records,2026)[0].marks,4);
assert.equal(monthlyBreakdown(records,2024).filter(m=>m.observations).length,0);
assert.deepEqual(monthRange('2024',2),{start:'2024-02-01',end:'2024-02-29'});
assert.deepEqual(monthRange('2025',2),{start:'2025-02-01',end:'2025-02-28'});
assert.deepEqual(monthRange('2025',12),{start:'2025-12-01',end:'2025-12-31'});
months=monthlyBreakdown(records,2025,{table:'5',from:1080,to:1110});
assert.equal(months[0].marks,2);assert.equal(months[0].observations,2);assert.equal(months[0].occupancy,1);

let q=runQuery(records,{start:'2025-01-01',end:'2025-12-31',tables:['3'],weekdays:[4],from:1080,to:0,group:'hour'});
assert.deepEqual(q.rows.map(r=>[r.label,r.marks,r.observations]),[['6:00 PM',1,2],['12:00 AM',1,1]]);
assert.equal(q.summary.days,1,'Post-midnight slots still belong to Friday on the sheet');
assert.equal(q.summary.possible,3);assert.equal(q.summary.marks,2);
q=runQuery(records,{group:'weekday'});assert.deepEqual(q.rows.map(r=>[r.label,r.days]),[['Friday',1],['Saturday',3]]);
q=runQuery(records,{group:'year'});assert.deepEqual(q.rows.map(r=>[r.key,r.marks]),[['2025',6],['2026',4]]);
q=runQuery(records,{group:'week',start:'2025-01-01',end:'2025-01-04'});assert.equal(q.rows.length,1);assert.equal(q.rows[0].key,'2024-12-30');assert.equal(q.rows[0].marks,6);
q=runQuery(records,{group:'table',tables:['5'],end:'2025-12-31'});assert.equal(q.rows.length,1);assert.equal(q.rows[0].marks,3);assert.equal(q.rows[0].days,2);assert.equal(q.rows[0].observations,5);assert.equal(q.rows[0].occupancy,.6);
assert.equal(runQuery(records,{group:'table',table:'3'}).rows.length,1);
q=runQuery(records,{group:'day',sort:'marks',minMarks:2});assert.deepEqual(q.rows.map(r=>r.date||r.key),['2025-01-03','2026-01-03']);assert.equal(q.summary.days,4,'Per-result minimum does not change the matched-day summary');
q=runQuery(records,{group:'day',sort:'occupancy'});assert.equal(q.rows[0].key,'2026-01-03');
q=runQuery(records,{group:'day',sort:'average'});assert.equal(q.rows[0].key,'2026-01-03');
assert.equal(runQuery(records,{tables:['unknown']}).rows.length,0);
assert.equal(runQuery([],{group:'total'}).summary.occupancy,null);
assert.equal(runQuery(records,{start:'2025-01-04',end:'2025-01-04'}).summary.marks,1,'Date endpoints are inclusive');
assert.equal(summarize(records,{tables:[]}).days.length,0);
assert.equal(summarize(records,{weekdays:[]}).days.length,0);
for(const bad of [{start:'2025-02-29'},{start:'2026-01-01',end:'2025-12-31'},{tables:[]},{weekdays:[]},{weekdays:[7]},{from:1440},{to:NaN},{minMarks:-1},{minMarks:1.5},{group:'bad'},{sort:'bad'}])assert.throws(()=>runQuery(records,bad));
const csv=queryCSV(runQuery(records,{group:'table'}).rows,'table');
assert.match(csv,/"Table","Recorded days","Total Xs"/);assert.match(csv,/"Ultimate Texas Holdem \(UTH\)"/);assert.ok(csv.endsWith('\r\n'));
const hostile={label:' =HYPERLINK("bad")\nnext',days:1,marks:0,possible:1,observations:1,average:0,occupancy:0};
assert.ok(queryCSV([hostile]).includes('"\' =HYPERLINK(""bad"")\nnext"'),'CSV escapes quotes/newlines and neutralizes formula prefixes');
assert.equal(JSON.stringify(records),before,'Analytics must not modify stored records');
console.log('Analytics: weighted months, missing vs blank, years, leap dates, overnight/weekday/table filters, all groups, sort, validation and CSV passed.');
