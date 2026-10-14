import {summarize,weekStart,dayOffset,localToday,timeMinute,timeLabel} from './records.js?v=20261013-5';
import {weekday,totals} from './core.js?v=20261013-5';
const $=id=>document.getElementById(id);
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const pretty=date=>new Date(date+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
const rate=value=>value===null?'—':`${Math.round(value*100)}%`;
const ordered=m=>(m-660+1440)%1440;
export function createDashboard({edit,archive}) {
  let records=[],selectedDay='',initialized=false;
  $('weekDate').value=weekStart(localToday());
  const selectOptions=(id,values,label)=>{const input=$(id),old=input.value;input.replaceChildren();for(const [value,text] of values){const o=el('option','',text);o.value=value;input.append(o);}if([...input.options].some(o=>o.value===old))input.value=old;};
  function render() {
    const start=weekStart($('weekDate').value||localToday()),end=dayOffset(start,6);$('weekDate').value=start;
    $('weekTitle').textContent=`${pretty(start)} – ${pretty(end)}, ${start.slice(0,4)}`;
    const filters={start:$('period').value==='all'?null:start,end:$('period').value==='all'?null:end,table:$('tableFilter').value,from:$('fromTime').value===''?null:+$('fromTime').value,to:$('toTime').value===''?null:+$('toTime').value};
    const summary=summarize(records,filters),week=summarize(records,{...filters,start,end});
    const selected=selectedDay?summary.days.find(d=>d.date===selectedDay):null;
    if(!selected)selectedDay='';
    const hours=(selectedDay?summarize(records,{...filters,start:selectedDay,end:selectedDay}):summary).hours.sort((a,b)=>ordered(a.minute)-ordered(b.minute));
    const peak=summary.hours.filter(h=>h.marks>0).sort((a,b)=>b.average-a.average||ordered(a.minute)-ordered(b.minute))[0];
    $('statDays').textContent=summary.days.length;$('statMarks').textContent=summary.marks.toLocaleString();$('statOccupancy').textContent=rate(summary.occupancy);
    $('statPeak').textContent=peak?timeLabel(peak.minute):'—';
    const tied=peak?summary.hours.filter(h=>Math.abs(h.average-peak.average)<1e-9).length:0;
    $('peakNote').textContent=peak?`${peak.average.toFixed(1)} active tables on average${tied>1?` · ${tied} hours tied`:''}`:'No marked observations';
    $('rangeNote').textContent=`${$('period').value==='all'?'All saved dates':'Selected week'} · ${summary.observations} observations · Times after midnight belong to the date on the sheet.`;
    $('clearDay').hidden=!selectedDay;$('hourTitle').textContent=selectedDay?`Hours on ${weekday(selectedDay)}, ${pretty(selectedDay)}`:'Activity by hour';
    const metric=$('chartMetric').value;
    $('hourNote').textContent=metric==='average'?'Average number of active tables per recorded observation in each hour.':'Marked cells divided by recorded table/time cells in each hour.';
    drawBars($('hourChart'),hours.map(h=>({label:timeLabel(h.minute),value:metric==='average'?h.average:h.occupancy*100,display:metric==='average'?h.average.toFixed(1):rate(h.occupancy),detail:`${h.marks} X’s in ${h.observations} observations`})),metric==='occupancy'?100:null);
    const dayRecords=week.days;
    drawBars($('dayChart'),Array.from({length:7},(_,i)=>{
      const date=dayOffset(start,i),d=dayRecords.find(r=>r.date===date);
      return {label:`${weekday(date).slice(0,3)} ${pretty(date)}`,value:d?.marks??null,display:d?`${d.marks} X’s · ${rate(d.occupancy)}`:'No record',detail:d?`${d.observations} observations`:'No recorded observations in this filter',selected:date===selectedDay,click:d?()=>{selectedDay=selectedDay===date?'':date;render();}:null};
    }));
    const weekdayData=Array.from({length:7},(_,i)=>({label:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i],marks:0,possible:0,days:0}));
    for(const d of summary.days){const bucket=weekdayData[(new Date(d.date+'T12:00:00Z').getUTCDay()+6)%7];bucket.marks+=d.marks;bucket.possible+=d.possible;bucket.days++;}
    drawBars($('weekdayChart'),weekdayData.map(d=>({label:d.label,value:d.possible?d.marks/d.possible*100:null,display:d.possible?rate(d.marks/d.possible):'No record',detail:`${d.days} recorded days`})),100);
    renderHeatmap(week,start);
    renderRecords(start,end);
    $('dashboardEmpty').hidden=records.some(r=>!r.archived);
  }
  function drawBars(container,items,max=null) {
    container.replaceChildren();if(!items.length){container.append(el('p','chart-empty','No saved observations for these filters.'));return;}
    max=max||Math.max(1,...items.map(x=>x.value||0));
    for(const item of items){const row=el(item.click?'button':'div','chart-row'+(item.selected?' selected':'')+(item.value===null?' no-data':''));if(item.click){row.type='button';row.addEventListener('click',item.click);row.setAttribute('aria-pressed',!!item.selected);}row.title=item.detail;row.append(el('span','chart-label',item.label));const track=el('span','chart-track'),fill=el('span','chart-fill');fill.style.width=`${item.value===null?0:Math.max(0,Math.min(100,item.value/max*100))}%`;track.append(fill);row.append(track,el('span','chart-value',item.display));container.append(row);}
  }
  function renderHeatmap(week,start) {
    const container=$('heatmap');container.replaceChildren();const minutes=week.slots.map(s=>s.minute).sort((a,b)=>ordered(a)-ordered(b));
    if(!minutes.length){container.append(el('p','chart-empty','No observations saved for this week and filter.'));return;}
    const table=el('table'),head=el('thead'),header=el('tr');header.append(el('th','','Day'));for(const m of minutes)header.append(el('th','',timeLabel(m)));head.append(header);table.append(head);const body=el('tbody');
    for(let i=0;i<7;i++){const date=dayOffset(start,i),d=week.days.find(r=>r.date===date),row=el('tr');row.append(el('th','',`${weekday(date).slice(0,3)} ${pretty(date)}`));for(const m of minutes){const s=d?.slots.find(s=>s.minute===m),cell=el('td',s?'heat-cell':'heat-missing',s?s.marks:'—');if(s){cell.style.background=`hsl(207 52% ${97-s.marks/s.possible*56}%)`;if(s.marks/s.possible>.65)cell.style.color='white';}cell.title=s?`${date}, ${timeLabel(m)}: ${s.marks} of ${s.possible} tables active`:`${date}, ${timeLabel(m)}: no record`;row.append(cell);}body.append(row);}table.append(body);container.append(table);
  }
  function renderRecords(start,end) {
    const list=$('savedDays');list.replaceChildren();const archived=$('showArchived').checked;
    const shown=records.filter(r=>r.archived===archived&&($('period').value==='all'||r.date>=start&&r.date<=end)).sort((a,b)=>b.date.localeCompare(a.date));
    $('savedCount').textContent=`(${shown.length})`;
    if(!shown.length){list.append(el('p','chart-empty',archived?'No archived days in this range.':'No saved days in this range.'));return;}
    for(const r of shown){const row=el('article','saved-day'),text=el('div');text.append(el('strong','',`${weekday(r.date)}, ${pretty(r.date)}, ${r.date.slice(0,4)}`),el('p','hint',`${totals(r.grid).grand} X’s · ${r.rows.length} tables · ${r.times.length} times`));const actions=el('div','saved-actions');
      if(!archived){const open=el('button','button secondary','Review / edit');open.addEventListener('click',()=>edit(r));actions.append(open);}
      const archiveButton=el('button','text-button',archived?'Restore':'Archive');archiveButton.addEventListener('click',async()=>{archiveButton.disabled=true;try{await archive(r,!archived);}finally{archiveButton.disabled=false;}});actions.append(archiveButton);row.append(text,actions);list.append(row);}
  }
  for(const id of ['weekDate','period','tableFilter','fromTime','toTime','chartMetric','showArchived'])$(id).addEventListener('change',()=>{selectedDay='';render();});
  $('previousWeek').addEventListener('click',()=>{$('period').value='week';$('weekDate').value=dayOffset($('weekDate').value,-7);selectedDay='';render();});
  $('nextWeek').addEventListener('click',()=>{$('period').value='week';$('weekDate').value=dayOffset($('weekDate').value,7);selectedDay='';render();});
  $('latestWeek').addEventListener('click',()=>{const latest=records.filter(r=>!r.archived).map(r=>r.date).sort().at(-1);$('weekDate').value=weekStart(latest||localToday());$('period').value='week';selectedDay='';render();});
  $('clearDay').addEventListener('click',()=>{selectedDay='';render();});
  function setRecords(days) {records=days;const active=days.filter(r=>!r.archived);if(!initialized&&active.length){$('weekDate').value=weekStart(active.map(r=>r.date).sort().at(-1));initialized=true;}
    selectOptions('tableFilter',[['','All tables'],...[...new Set(active.flatMap(r=>r.rows))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).map(t=>[t,`Table ${t}`])]);
    const times=[...new Set(active.flatMap(r=>r.times.map(timeMinute)).filter(m=>m!==null))].sort((a,b)=>ordered(a)-ordered(b)).map(m=>[String(m),timeLabel(m)]);
    selectOptions('fromTime',[['','Start of sheet'],...times]);selectOptions('toTime',[['','End of sheet'],...times]);render();
  }
  setRecords([]);return {setRecords,render};
}
