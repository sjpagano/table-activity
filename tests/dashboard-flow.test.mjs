import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as records from '../records.js';
import * as analytics from '../analytics.js';
import {weekday,totals} from '../core.js';

// Controller integration with a small in-memory DOM; no browser, auth or database.
class Element {
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.events={};this.attributes={};this.style={};this.hidden=false;this._value='';this._text='';}
  set textContent(text){this._text=String(text);this.children=[];}
  get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
  set value(value){this._value=String(value);}
  get value(){return this._value;}
  get options(){return this.children;}
  append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);if(this.tagName==='SELECT'&&(this.children.length===1||node.selected))this.value=node.value;}}
  replaceChildren(...nodes){this.children=[];this._text='';if(this.tagName==='SELECT')this.value='';this.append(...nodes);}
  setAttribute(name,value){this.attributes[name]=String(value);}
  addEventListener(name,fn){(this.events[name]??=[]).push(fn);}
  fire(name,event={}){for(const fn of this.events[name]||[])fn({preventDefault(){},...event});if(['change','input'].includes(name))this.parent?.fire(name,event);}
  click(){this.fire('click');}
}
const sourceUrl=new URL('../dashboard.js',import.meta.url),html=readFileSync(new URL('./index.html',sourceUrl),'utf8');
const elements=new Map();
for(const match of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){
  const [,tag,attributes,id]=match;assert(!elements.has(id),`Duplicate ID ${id}`);const n=new Element(tag);n.hidden=/\bhidden\b/.test(attributes);elements.set(id,n);
}
const $=id=>{assert(elements.has(id),`Missing #${id}`);return elements.get(id);};
for(const [,id,body] of html.matchAll(/<select\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g))for(const [,value,attrs,text] of body.matchAll(/<option value="([^"]*)"([^>]*)>([^<]*)<\/option>/g)){const o=new Element('option');o.value=value;o.textContent=text;o.selected=attrs.includes('selected');$(id).append(o);}
for(const id of ['queryStart','queryEnd','queryFrom','queryTo','queryMin','queryGroup','querySort','queryTables','queryWeekdays'])$(id).parent=$('queryForm');
const downloads=[];
const sandbox={...records,...analytics,weekday,totals,document:{getElementById:$,createElement:tag=>new Element(tag)},Blob,URL:{createObjectURL:blob=>{downloads.push(blob);return 'blob:test';},revokeObjectURL(){}},setTimeout(){}};
const strip=s=>s.replace(/^import .*;\r?\n/gm,'').replaceAll('export function','function');
vm.runInNewContext(strip(readFileSync(new URL('./query.js',sourceUrl),'utf8'))+'\nglobalThis.createQueryBuilder=createQueryBuilder;globalThis.renderAnalyticsTable=renderAnalyticsTable;',sandbox);
// Separate module scope for dashboard helpers.
vm.runInNewContext(strip(readFileSync(sourceUrl,'utf8'))+'\nglobalThis.dashboard=createDashboard({edit(){},archive(){}});',{...sandbox,createQueryBuilder:sandbox.createQueryBuilder,renderAnalyticsTable:sandbox.renderAnalyticsTable,globalThis:sandbox});
const dashboard=sandbox.dashboard;
const data=[
 {date:'2025-01-03',rows:['3','5'],times:['6p','12a'],grid:[[true,false],[true,true]],archived:false},
 {date:'2025-02-01',rows:['3'],times:['6p'],grid:[[false]],archived:false},
 {date:'2026-03-01',rows:['3','5'],times:['6p'],grid:[[true],[true]],archived:false}
];
const descendants=(n,tag)=>n.children.flatMap(c=>[...(c.tagName===tag.toUpperCase()?[c]:[]),...descendants(c,tag)]);
const change=(id,value)=>{$(id).value=value;$(id).fire('change');};
dashboard.setRecords(data);
assert.equal($('period').value,'year');assert.equal($('yearSelect').value,'2026');assert.equal($('statDays').textContent,'1');
assert.equal($('weekNav').hidden,true);assert.equal($('monthlyCard').hidden,false);
assert.equal(descendants($('monthTable'),'tbody')[0].children.length,12);
change('yearSelect','2025');assert.equal($('statMarks').textContent,'3');assert.equal($('statDays').textContent,'2');assert.equal($('savedCount').textContent,'(2)');
descendants($('monthTable'),'button')[0].click();assert.equal($('statDays').textContent,'1');assert.equal($('savedCount').textContent,'(1)');assert.match($('rangeNote').textContent,/January 2025/);assert.equal($('clearMonth').hidden,false);
$('clearMonth').click();assert.equal($('statDays').textContent,'2');
change('period','week');assert.equal($('weekDaysCard').hidden,false);assert.equal($('monthlyCard').hidden,true);
change('weekDate','2025-01-03');assert.equal($('statMarks').textContent,'3');assert.equal($('weekDate').value,'2024-12-30');
change('period','all');assert.equal($('statDays').textContent,'3');assert.equal($('weekHeatmapCard').hidden,true);
$('queryBtn').click();assert.equal($('activityOverview').hidden,true);assert.equal($('queryPanel').hidden,false);
change('queryStart','2025-01-01');change('queryEnd','2025-12-31');change('queryFrom','18:00');change('queryTo','00:00');
const weekdays=descendants($('queryWeekdays'),'input');for(let i=0;i<7;i++)weekdays[i].checked=i===4;
$('queryForm').fire('submit');assert.equal($('queryResults').hidden,false);assert.equal($('queryStatus').textContent,'1 result.');assert.match($('querySummary').textContent,/Matched 1 recorded days · 3 X’s/);
assert.match($('queryDescription').textContent,/Friday/);assert.match($('queryDescription').textContent,/6:00 PM through 12:00 AM/);
$('exportQuery').click();assert.equal(downloads.length,1);assert.match(await downloads[0].text(),/January 2025/);
change('queryEnd','2024-12-31');assert.equal($('queryResults').hidden,true);assert.equal($('exportQuery').disabled,true);$('exportQuery').click();assert.equal(downloads.length,1,'Stale results cannot be exported');
$('queryForm').fire('submit');assert.match($('queryStatus').textContent,/end date must be/);
$('resetQuery').click();const tables=descendants($('queryTables'),'input');tables[0].checked=false;tables[0].fire('change');$('queryForm').fire('submit');assert.match($('queryStatus').textContent,/at least one table/);
tables[2].checked=true;tables[2].fire('change');change('queryGroup','table');$('queryForm').fire('submit');assert.equal($('queryStatus').textContent,'1 result.');assert.match($('queryTable').textContent,/Table 5/);
dashboard.setRecords([...data,{date:'2026-04-01',rows:['3','5'],times:['6p'],grid:[[false],[true]],archived:false}]);assert.match($('querySummary').textContent,/Matched 3 recorded days · 4 X’s/,'A refresh updates a completed query without resetting its filters');
change('queryMin','99');dashboard.setRecords(data);assert.equal($('queryResults').hidden,true,'A refresh must not auto-run unsent filter edits');
$('resetQuery').click();const many=Array.from({length:120},(_,i)=>({...data[0],date:records.dayOffset('2025-01-01',i)}));dashboard.setRecords(many);change('queryGroup','day');$('queryForm').fire('submit');assert.equal(descendants($('queryTable'),'tbody')[0].children.length,100);assert.equal($('moreQuery').hidden,false);$('exportQuery').click();assert.equal((await downloads.at(-1).text()).trim().split('\r\n').length,121,'CSV includes every result, not only the visible page');$('moreQuery').click();assert.equal(descendants($('queryTable'),'tbody')[0].children.length,120);assert.equal($('moreQuery').hidden,true);
dashboard.setRecords([]);assert.equal($('queryResults').hidden,true);assert.equal($('queryTable').textContent,'');assert.equal($('queryStart').value,'');assert.equal($('activityOverview').hidden,false);assert.equal($('statDays').textContent,'0');
dashboard.setRecords([data[0]]);assert.equal($('yearSelect').value,'2025','A new account starts on its latest saved year');
console.log('Dashboard flows: year/month drilldown, week/all views, queries, validation, CSV, stale results, refresh, pagination and account reset passed.');
