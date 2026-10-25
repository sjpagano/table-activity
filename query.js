import {runQuery,queryCSV,GROUPS,WEEKDAYS} from './analytics.js?v=20261024-1';
import {timeLabel,localToday} from './records.js?v=20261024-1';
import {tableName,hourWindow,formatHours,OPEN_TIME_NOTE} from './activity-display.js?v=20261024-1';
const $=id=>document.getElementById(id);
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const rate=n=>n===null?'—':`${(n*100).toFixed(1)}%`;

export function renderAnalyticsTable(container,rows,{heading='Month',select,selected='',bars=false,coverage=false,measure='marks'}={}) {
  container.replaceChildren();
  if(!rows.length){container.append(el('p','chart-empty','No results match these filters.'));return;}
  const table=el('table','analytics-table'),head=el('thead'),header=el('tr'),body=el('tbody');
  const labels=[heading,'Recorded days',measure==='hours'?'Est. table-hours':'Total X’s','Avg. active tables','Occupancy'];
  if(coverage)labels.push('Table/time cells','Observations');
  for(const label of labels){const th=el('th','',label);th.scope='col';header.append(th);}
  head.append(header);table.append(head,body);const max=Math.max(1,...rows.map(r=>r.marks));
  for(const r of rows){
    const tr=el('tr',r.key===selected?'selected':''),name=el('th');name.scope='row';
    if(select&&r.observations){const button=el('button','month-link',r.label);button.type='button';button.setAttribute('aria-pressed',r.key===selected);button.addEventListener('click',()=>select(r));name.append(button);}else name.textContent=r.label;
    const marks=el('td','marks-cell'),value=el('span','',r.observations?(measure==='hours'?formatHours(r.marks):r.marks.toLocaleString()):'No record');
    if(bars){const track=el('span','month-bar');track.setAttribute('aria-hidden','true');const fill=el('span');fill.style.width=`${r.marks/max*100}%`;track.append(fill);marks.append(track);}
    marks.append(value);tr.append(name,el('td','',r.days),marks,el('td','',r.average===null?'—':r.average.toFixed(2)),el('td','',rate(r.occupancy)));
    if(coverage)tr.append(el('td','',r.possible.toLocaleString()),el('td','',r.observations.toLocaleString()));
    body.append(tr);
  }
  container.append(table);
}

export function createQueryBuilder() {
  let records=[],tableChoices=[],allTables=null,weekdayChoices=[],result=null,lastQuery=null,dirty=true,visibleRows=100;
  function choice(container,text,value,checked=true) {
    const label=el('label','choice'),input=el('input');input.type='checkbox';input.value=value;input.checked=checked;label.append(input,el('span','',text));container.append(label);return input;
  }
  for(let d=0;d<7;d++)weekdayChoices.push(choice($('queryWeekdays'),WEEKDAYS[d].slice(0,3),String(d)));
  for(const [id,label] of [['queryFrom','Start of sheet'],['queryTo','End of sheet']]){
    const input=$(id),all=el('option','',label);all.value='';input.append(all);
    for(let i=0;i<24;i++){const m=((i+11)%24)*60,o=el('option','',timeLabel(m));o.value=String(m);input.append(o);}
  }
  $('queryEstimateNote').textContent=OPEN_TIME_NOTE;
  function invalidate() {dirty=true;$('queryResults').hidden=true;$('exportQuery').disabled=true;$('queryStatus').textContent='Filters changed. Run query to update results.';}
  function readQuery() {
    return {start:$('queryStart').value,end:$('queryEnd').value,...hourWindow($('queryFrom').value,$('queryTo').value),measure:$('queryMeasure').value,
      tables:allTables.checked?null:tableChoices.filter(c=>c.checked).map(c=>c.value),weekdays:weekdayChoices.filter(c=>c.checked).map(c=>Number(c.value)),group:$('queryGroup').value,sort:$('querySort').value,minMarks:$('queryMin').value===''?null:Number($('queryMin').value)};
  }
  function describe(q) {
    const dates=q.start||q.end?`${q.start||'First saved date'} through ${q.end||'last saved date'}`:'All saved dates';
    const times=q.from!==null||q.to!==null?`${q.from===null?'Start of sheet':timeLabel(q.from)} through ${q.to===null?'end of sheet':timeLabel(Math.floor(q.to/60)*60)+' (whole hour)'}`:'All times';
    return `${dates} · ${q.tables?q.tables.map(t=>tableName(t)).join(', '):'All tables'} · ${q.weekdays.length===7?'Every weekday':q.weekdays.map(d=>WEEKDAYS[d]).join(', ')} · ${times} · Grouped by ${GROUPS[q.group].toLowerCase()}${q.minMarks!==null?` · At least ${q.minMarks} X’s per result`:''}`;
  }
  function showRows() {
    renderAnalyticsTable($('queryTable'),result.rows.slice(0,visibleRows),{heading:GROUPS[lastQuery.group],coverage:true,measure:lastQuery.measure});
    $('moreQuery').hidden=visibleRows>=result.rows.length;
    $('moreQuery').textContent=`Show more (${Math.min(visibleRows,result.rows.length)} of ${result.rows.length})`;
  }
  function run() {
    try {
      const q=readQuery();result=runQuery(records,q);lastQuery=q;dirty=false;visibleRows=100;
      $('queryDescription').textContent=describe(q);
      const s=result.summary;
      $('querySummary').textContent=`Matched ${s.days} recorded days · ${q.measure==='hours'?formatHours(s.marks)+' estimated table-hours':s.marks.toLocaleString()+' X’s'} · ${rate(s.occupancy)} occupancy${q.minMarks!==null?' before the per-result minimum':''}.`;
      $('queryStatus').textContent=`${result.rows.length} result${result.rows.length===1?'':'s'}.`;
      $('queryResults').hidden=false;$('exportQuery').disabled=!result.rows.length;showRows();
    } catch(error) {result=null;dirty=true;$('queryResults').hidden=true;$('exportQuery').disabled=true;$('queryStatus').textContent=error.message;}
  }
  function reset() {
    for(const id of ['queryStart','queryEnd','queryFrom','queryTo','queryMin'])$(id).value='';
    $('queryGroup').value='month';$('querySort').value='key';$('queryMeasure').value='marks';
    for(const input of [...tableChoices,...weekdayChoices])input.checked=true;
    if(allTables){allTables.checked=true;allTables.indeterminate=false;}
    result=null;lastQuery=null;dirty=true;$('queryResults').hidden=true;$('exportQuery').disabled=true;$('queryStatus').textContent='Choose filters, then run your query.';
    // Remove any previous account's results from the DOM as well as hiding them.
    $('queryTable').replaceChildren();$('querySummary').textContent='';$('queryDescription').textContent='';
  }
  $('queryForm').addEventListener('submit',e=>{e.preventDefault();run();});
  $('queryForm').addEventListener('input',invalidate);
  $('queryForm').addEventListener('change',invalidate);
  $('resetQuery').addEventListener('click',reset);
  $('moreQuery').addEventListener('click',()=>{visibleRows+=100;showRows();});
  $('exportQuery').addEventListener('click',()=>{
    if(dirty||!result?.rows.length)return;
    const url=URL.createObjectURL(new Blob(['\ufeff',queryCSV(result.rows,lastQuery.group)],{type:'text/csv;charset=utf-8'}));
    const a=el('a');a.href=url;a.download=`table-activity-${lastQuery.group}-${localToday()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  function setRecords(days) {
    records=days;
    const all=allTables?.checked??true,checked=new Set(tableChoices.filter(c=>c.checked).map(c=>c.value)),container=$('queryTables');
    container.replaceChildren();allTables=choice(container,'All tables','',all);
    tableChoices=[...new Set(records.filter(r=>!r.archived).flatMap(r=>r.rows))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).map(t=>choice(container,tableName(t),t,all||checked.has(t)));
    allTables.addEventListener('change',()=>{for(const c of tableChoices)c.checked=allTables.checked;});
    for(const c of tableChoices)c.addEventListener('change',()=>{allTables.checked=tableChoices.every(c=>c.checked);allTables.indeterminate=!allTables.checked&&tableChoices.some(c=>c.checked);});
    if(!days.length)reset();else if(lastQuery&&!dirty)run();
  }
  setRecords([]);return {setRecords};
}
