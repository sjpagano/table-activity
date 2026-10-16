import {isISODate} from './core.js?v=20261016-3';

export function timeMinute(label) {
  const s=String(label).trim().toLowerCase().replace(/\s|\./g,'');
  const m=/^(\d{1,2})(?::?(\d{2}))?(a|p)(?:m)?$/.exec(s);
  if(m&&+m[1]>=1&&+m[1]<=12&&+(m[2]||0)<60)return (+m[1]%12+(m[3]==='p'?12:0))*60+ +(m[2]||0);
  const h=/^(\d{1,2}):(\d{2})$/.exec(s);
  return h&&+h[1]<24&&+h[2]<60?+h[1]*60+ +h[2]:null;
}
export const timeLabel=m=>`${Math.floor(m/60)%12||12}:${String(m%60).padStart(2,'0')} ${m<720?'AM':'PM'}`;
export function validateRecord(record) {
  if(!isISODate(record.date))throw Error('Every page needs a valid activity date.');
  const {rows,times,grid}=record;
  if(!Array.isArray(rows)||rows.length<1||rows.length>40||rows.some(r=>typeof r!=='string'||!r.trim()||r.length>40)||new Set(rows).size!==rows.length)throw Error('Use 1–40 unique table labels.');
  if(!Array.isArray(times)||times.length<1||times.length>72||times.some(t=>typeof t!=='string'||t.length>20||timeMinute(t)===null)||new Set(times.map(timeMinute)).size!==times.length)throw Error('Use unique times such as 11a, 1130a, or 1:30 PM.');
  if(!Array.isArray(grid)||grid.length!==rows.length||grid.some(row=>!Array.isArray(row)||row.length!==times.length||row.some(x=>typeof x!=='boolean')))throw Error('Each table and time must have an X or a blank.');
  return record;
}
export function recordFromJob(job) {
  return validateRecord({date:job.date,rows:job.rows.map(String),times:[...job.times],grid:job.grid.map(row=>[...row]),source_name:job.fileName||'',date_source:job.dateSource||'manual'});
}
export const dayOffset=(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
export const weekStart=date=>dayOffset(date,-((new Date(date+'T12:00:00Z').getUTCDay()+6)%7));
export const localToday=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export function summarize(records,{start,end,table='',from=null,to=null}={}) {
  const days=[],hourMap=new Map(),slotMap=new Map();let marks=0,possible=0,observations=0;
  const first=from??660,last=to??659;
  const inWindow=m=>from===null&&to===null||(first<=last?m>=first&&m<=last:m>=first||m<=last);
  for(const record of records) {
    if(record.archived||(start&&record.date<start)||(end&&record.date>end))continue;
    const rowIndexes=record.rows.map((label,i)=>!table||label===table?i:-1).filter(i=>i>=0);
    const day={date:record.date,marks:0,possible:0,observations:0,slots:[]};
    for(let c=0;c<record.times.length;c++) {
      const minute=timeMinute(record.times[c]);if(minute===null||!inWindow(minute)||!rowIndexes.length)continue;
      const count=rowIndexes.reduce((n,r)=>n+Number(record.grid[r][c]),0),capacity=rowIndexes.length;
      day.marks+=count;day.possible+=capacity;day.observations++;
      day.slots.push({minute,marks:count,possible:capacity});
      for(const [map,key] of [[hourMap,Math.floor(minute/60)*60],[slotMap,minute]]) {
        const bucket=map.get(key)||{minute:key,marks:0,possible:0,observations:0};
        bucket.marks+=count;bucket.possible+=capacity;bucket.observations++;map.set(key,bucket);
      }
    }
    if(day.observations){days.push(day);marks+=day.marks;possible+=day.possible;observations+=day.observations;}
  }
  const withMetrics=x=>({...x,occupancy:x.possible?x.marks/x.possible:null,average:x.observations?x.marks/x.observations:null});
  const hours=[...hourMap.values()].map(withMetrics),slots=[...slotMap.values()].map(withMetrics);
  return {days:days.map(withMetrics),hours,slots,marks,possible,observations,occupancy:possible?marks/possible:null};
}
export function planSave(jobs,existing) {
  const dates=new Set(),existingMap=new Map(existing.map(r=>[r.date,r]));
  return jobs.map(job=>{
    const record=recordFromJob(job);
    if(dates.has(record.date))throw Error(`There is more than one scan dated ${record.date}. Remove the duplicate or correct its date before saving.`);
    dates.add(record.date);
    if(job.savedDate&&job.savedDate!==record.date)throw Error('A saved day’s date cannot be changed here. Archive the incorrect day and save a new scan with the correct date.');
    const previous=existingMap.get(record.date);
    return {...record,expected_revision:previous?.revision??0,previous,changed_elsewhere:job.savedRevision!=null&&job.savedRevision!==previous?.revision};
  });
}
export function parseBackup(text) {
  const data=JSON.parse(text);
  if(data.format!=='table-activity-v1'||!Array.isArray(data.days)||data.days.length>10000)throw Error('Choose a Table Activity JSON backup.');
  return data.days.filter(d=>!d.archived).map(validateRecord);
}
