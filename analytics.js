import {summarize,weekStart,dayOffset,timeLabel} from './records.js?v=20261023-1';
import {isISODate} from './core.js?v=20261023-1';

export const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
export const WEEKDAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
export const GROUPS={month:'Month',day:'Date',week:'Week starting Monday',year:'Year',weekday:'Weekday',hour:'Hour',table:'Table',total:'Whole range'};
const metrics=b=>({...b,occupancy:b.possible?b.marks/b.possible:null,average:b.observations?b.marks/b.observations:null});
const sheetOrder=m=>(m-660+1440)%1440;
export function monthRange(year,month) {
  const start=`${year}-${String(month).padStart(2,'0')}-01`;
  const next=month===12?`${Number(year)+1}-01-01`:`${year}-${String(month+1).padStart(2,'0')}-01`;
  return {start,end:dayOffset(next,-1)};
}
export function validateQuery(q) {
  for(const key of ['start','end'])if(q[key]&&!isISODate(q[key]))throw Error('Enter a valid start and end date.');
  if(q.start&&q.end&&q.start>q.end)throw Error('The end date must be on or after the start date.');
  for(const key of ['from','to'])if(q[key]!=null&&(!Number.isInteger(q[key])||q[key]<0||q[key]>1439))throw Error('Choose a valid time.');
  if(q.tables!=null&&(!Array.isArray(q.tables)||!q.tables.length))throw Error('Select at least one table.');
  if(q.weekdays!=null&&(!Array.isArray(q.weekdays)||!q.weekdays.length||q.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6)))throw Error('Select at least one weekday.');
  if(q.group&&!Object.prototype.hasOwnProperty.call(GROUPS,q.group))throw Error('Choose a grouping.');
  if(q.sort&&!['key','marks','occupancy','average'].includes(q.sort))throw Error('Choose a result order.');
  if(q.minMarks!=null&&(!Number.isSafeInteger(q.minMarks)||q.minMarks<0))throw Error('Minimum X’s must be a whole number of zero or more.');
}
export function runQuery(records,query={}) {
  validateQuery(query);
  const group=query.group||'month',summary=summarize(records,query),buckets=new Map();
  function add(key,label,item,date,order=key) {
    const b=buckets.get(key)||{key,label,order,marks:0,possible:0,observations:0,dates:new Set()};
    b.marks+=item.marks;b.possible+=item.possible;b.observations+=item.observations;b.dates.add(date);buckets.set(key,b);
  }
  if(group==='table') {
    const labels=[...new Set(records.filter(r=>!r.archived).flatMap(r=>r.rows))].filter(t=>!query.table||query.table===t);
    for(const label of labels)for(const day of summarize(records,{...query,table:label}).days)add(label,`Table ${label}`,day,day.date);
  } else {
    for(const day of summary.days) {
      const date=day.date;
      if(group==='hour') {
        for(const slot of day.slots){const hour=Math.floor(slot.minute/60)*60;add(String(hour),timeLabel(hour),{...slot,observations:1},date,sheetOrder(hour));}
      } else if(group==='weekday') {
        const d=(new Date(date+'T12:00:00Z').getUTCDay()+6)%7;add(String(d),WEEKDAYS[d],day,date,d);
      } else {
        const key=group==='total'?'total':group==='week'?weekStart(date):group==='year'?date.slice(0,4):group==='month'?date.slice(0,7):date;
        const label=group==='total'?'Whole range':group==='month'?`${MONTHS[Number(date.slice(5,7))-1]} ${date.slice(0,4)}`:key;
        add(key,label,day,date);
      }
    }
  }
  const compare=(a,b)=>typeof a.order==='number'?a.order-b.order:String(a.order).localeCompare(String(b.order),undefined,{numeric:true});
  const rows=[...buckets.values()].map(({dates,...b})=>metrics({...b,days:dates.size})).filter(b=>b.marks>=(query.minMarks??0));
  rows.sort((a,b)=>query.sort&&query.sort!=='key'?(b[query.sort]??-1)-(a[query.sort]??-1)||compare(a,b):compare(a,b));
  return {rows,summary:{days:summary.days.length,marks:summary.marks,possible:summary.possible,observations:summary.observations,occupancy:summary.occupancy,average:summary.observations?summary.marks/summary.observations:null}};
}
export function monthlyBreakdown(records,year,filters={}) {
  const {rows}=runQuery(records,{...filters,start:`${year}-01-01`,end:`${year}-12-31`,group:'month'});
  return MONTHS.map((label,i)=>{
    const key=`${year}-${String(i+1).padStart(2,'0')}`;
    return {...(rows.find(r=>r.key===key)||{key,days:0,marks:0,possible:0,observations:0,occupancy:null,average:null}),label,month:i+1};
  });
}
export function queryCSV(rows,group='month') {
  // Quote fields and neutralize spreadsheet formulas in user-supplied table labels.
  const cell=value=>'"'+String(typeof value==='string'&&/^[\s]*[=+@-]/.test(value)?"'"+value:value).replaceAll('"','""')+'"';
  const headers=[GROUPS[group]||'Group','Recorded days','Total Xs','Average active tables','Occupancy %','Recorded table/time cells','Observations'];
  return [headers,...rows.map(r=>[r.label,r.days,r.marks,r.average===null?'':r.average.toFixed(4),r.occupancy===null?'':(r.occupancy*100).toFixed(4),r.possible,r.observations])].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
