import {DEFAULT_ROWS,DEFAULT_TIMES,blankGrid,totals,isISODate,weekday,exifDate} from './core.js';
import {canvas,rotate,locateGrid,defaultCorners,readMarks,pointAt} from './vision.js';
import {recognizeDate} from './recognition.js';
import {openWorkbook,exportBatch} from './excel.js';
import {batchSummary,canReview,changeDate,toggleMark,matchingTemplate} from './batch.js';
const $=id=>document.getElementById(id);
const jobs=[];
let nextId=1,processing=false,exporting=false,exported=false,activeId=null,selectionToken=0;
let workbook=null,template=null,workbookName='',layout={rows:[...DEFAULT_ROWS],times:[...DEFAULT_TIMES]};
const state={...layout,grid:null,uncertain:[],source:null,corners:null,busy:false,history:[],aligning:false,alignmentDirty:false,alignPoints:[],dateSource:'',selected:null,job:null};
const pause=()=>new Promise(r=>setTimeout(r,0));
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
function progress(text,value=50){$('progressWrap').hidden=false;$('progressText').textContent=text;$('progress').value=value;}
function setBusy(on,text='Reading this page…',value=50){state.busy=on;if(on)progress(text,value);else if(!processing&&!exporting)$('progressWrap').hidden=true;updateExport();}
function saveActive(){
 if(!state.job)return;
 Object.assign(state.job,{rows:state.rows,times:state.times,grid:state.grid,uncertain:state.uncertain,corners:state.corners,history:state.history,alignmentDirty:state.alignmentDirty,sensitivity:+$('sensitivity').value,date:$('activityDate').value,dateSource:state.dateSource,dateNote:$('dateNote').textContent,reviewed:$('reviewed').checked});
}
function updateExport(){
 const summary=batchSummary(jobs),locked=state.busy||exporting;
 $('exportBtn').disabled=processing||locked||state.aligning||!summary.canExport;
 $('exportBtn').textContent=jobs.length?`Download Excel (${jobs.length} ${jobs.length===1?'tab':'tabs'})`:'Download Excel';
 $('exportHint').textContent=summary.total?`${summary.reviewed} of ${summary.total} pages reviewed${summary.pending?' · '+summary.pending+' still reading':''}${summary.failed?' · remove or retry '+summary.failed+' failed '+(summary.failed===1?'page':'pages'):''}. One workbook, one tab per page.`:'Add scans to begin.';
 $('reviewAll').checked=summary.canExport;
 $('reviewAll').disabled=processing||locked||state.aligning||summary.ready!==summary.total||!summary.total;
 for(const id of ['scanFile','cameraFile','manualBtn'])$(id).disabled=processing||locked;
 for(const id of ['workbookFile','templateSelect','applyLayout','removeWorkbook','rowLabels','timeLabels'])$(id).disabled=processing||locked;
 for(const id of ['retryDate','rotateBtn','rescanBtn','alignBtn','sensitivity','activityDate','undoBtn','reviewed','reviewNext'])$(id).disabled=locked||!state.job||state.job.status!=='ready';
 $('undoBtn').disabled=locked||!state.history.length;
 $('reviewed').disabled=locked||state.aligning||!state.job||!canReview(state.job);
 $('reviewNext').disabled=$('reviewed').disabled;
 document.querySelectorAll('.cell-toggle').forEach(b=>b.disabled=locked);
 for(const card of $('batchCards').children){const job=jobs.find(j=>String(j.id)===card.dataset.jobId);if(!job)continue;for(const control of card.querySelectorAll('button,input')){const label=control.getAttribute('aria-label')||'';if(control.type==='checkbox')control.disabled=locked||!canReview(job);else if(label.startsWith('Remove ')||control.textContent==='Retry')control.disabled=locked||processing;else if(control.type!=='range'&&!label.startsWith('Scroll '))control.disabled=locked;}}
 $('nextReview').disabled=locked||!jobs.some(j=>j.status==='ready'&&!j.reviewed);
 $('batchCount').textContent=jobs.length?`(${jobs.length})`:'';
 $('batchSummary').textContent=`${summary.reviewed} reviewed · ${summary.pending} reading · ${summary.failed} failed`;
 const dates=jobs.filter(j=>isISODate(j.date)).map(j=>j.date),duplicates=dates.length-new Set(dates).size;
 if(duplicates)$('batchSummary').textContent+=' · Repeated dates will get separate numbered tabs.';
}
function invalidate(){
 $('reviewed').checked=false;exported=false;saveActive();
 if(state.job){state.job.reviewed=false;renderCard(state.job);}
 updateExport();
}
function setDate(date,source,note){$('activityDate').value=date||'';state.dateSource=source;$('dateNote').textContent=note;$('dateNote').classList.toggle('fallback',source!=='document'&&source!=='manual');$('weekday').textContent=weekday(date)||'—';invalidate();}
function refreshActive(){saveActive();if(state.job)renderCard(state.job);updateExport();}
function jobLabel(job){return job.fileName+(job.pageCount>1?` · page ${job.page}/${job.pageCount}`:'');}
function newJob(file=null){return {id:nextId++,file,fileName:file?.name||'Blank sheet',page:1,pageCount:1,status:'queued',rows:[...layout.rows],times:[...layout.times],grid:null,uncertain:[],history:[],reviewed:false,date:'',dateSource:'',dateNote:'',alignmentDirty:false,sensitivity:50,sourceBlob:null};}
function gridForCard(job){
 const wrap=el('div','batch-grid'),scroll=el('div','grid-scroll batch-grid-scroll'),table=el('table');
 scroll.tabIndex=0;scroll.setAttribute('aria-label',`Grid for ${jobLabel(job)}`);scroll.append(table);
 const counts=totals(job.grid),head=el('thead'),hr=el('tr');
 ['Table',...job.times,'Total'].forEach((v,i)=>{const th=el('th',i===job.times.length+1?'total':'',v);th.scope='col';hr.append(th);});head.append(hr);table.append(head);
 const body=el('tbody');job.rows.forEach((v,r)=>{const row=el('tr'),th=el('th','',v);th.scope='row';row.append(th);job.times.forEach((time,c)=>{
  const td=el('td'),button=el('button','cell-toggle'+(job.grid[r][c]?' marked':'')+(job.uncertain.includes(`${r}:${c}`)?' uncertain':''),job.grid[r][c]?'X':'');
  button.type='button';button.dataset.row=r;button.dataset.col=c;button.setAttribute('aria-label',`${jobLabel(job)}: table ${v}, ${time}: ${job.grid[r][c]?'X':'blank'}`);button.setAttribute('aria-pressed',job.grid[r][c]);
  button.addEventListener('click',()=>{if(state.busy||exporting)return;toggleMark(job,r,c);exported=false;renderCard(job);updateExport();document.querySelector(`[data-job-id="${job.id}"] button[data-row="${r}"][data-col="${c}"]`)?.focus({preventScroll:true});});
  td.append(button);row.append(td);
 });row.append(el('td','total',counts.rows[r]));body.append(row);});table.append(body);
 const foot=el('tfoot'),fr=el('tr');['SCORE',...counts.cols,counts.grand].forEach((v,i)=>fr.append(el('th',i===job.times.length+1?'total':'',v)));foot.append(fr);table.append(foot);
 const bar=el('div','horizontal-scroll'),range=el('input');range.type='range';range.min=0;range.max=1000;range.value=0;range.setAttribute('aria-label',`Scroll times for ${jobLabel(job)}`);
 bar.append(range);wrap.append(bar,scroll);
 const sync=()=>{const max=scroll.scrollWidth-scroll.clientWidth;range.value=max>0?scroll.scrollLeft/max*1000:0;range.disabled=max<=0;};
 range.addEventListener('input',()=>{scroll.scrollLeft=+range.value/1000*(scroll.scrollWidth-scroll.clientWidth);sync();});
 scroll.addEventListener('scroll',sync,{passive:true});
 requestAnimationFrame(()=>{scroll.scrollLeft=job.scrollLeft||0;sync();});scroll.addEventListener('scroll',()=>job.scrollLeft=scroll.scrollLeft,{passive:true});
 return wrap;
}
function renderCard(job){
 let card=document.querySelector(`[data-job-id="${job.id}"]`);if(!card){card=el('article','batch-item');card.dataset.jobId=job.id;$('batchCards').append(card);}
 card.classList.toggle('is-reviewed',!!job.reviewed);card.replaceChildren();
 const heading=el('div','batch-item-heading'),title=el('h3','',`${jobs.indexOf(job)+1}. ${jobLabel(job)}`),remove=el('button','text-button','Remove');remove.setAttribute('aria-label',`Remove ${jobLabel(job)}`);remove.disabled=processing||state.busy||exporting;remove.addEventListener('click',()=>removeJob(job));heading.append(title,remove);card.append(heading);
 if(job.status!=='ready'){
  card.append(el('p',job.status==='error'?'error':'hint',job.status==='error'?job.error:job.status==='processing'?'Reading…':'Waiting to read…'));
  if(job.status==='error'){const retry=el('button','button secondary','Retry');retry.disabled=processing||exporting;retry.addEventListener('click',()=>{job.status='queued';job.error='';processQueue();});card.append(retry);}return;
 }
 if(job.datePreview){const crop=el('img','batch-date-crop');crop.src=job.datePreview;crop.alt=`Original date for ${jobLabel(job)}`;card.append(crop);}
 const fields=el('div','batch-fields'),label=el('label','','Date'),date=el('input');date.type='date';date.min='1900-01-01';date.max='2199-12-31';date.value=job.date;date.setAttribute('aria-label',`Date for ${jobLabel(job)}`);date.addEventListener('change',()=>{changeDate(job,date.value);exported=false;renderCard(job);updateExport();});label.append(date);
 fields.append(label,el('span','batch-weekday',weekday(job.date)||'Enter date'),el('strong','batch-score',`${totals(job.grid).grand} X’s`));card.append(fields);
 const note=job.alignmentDirty?'Grid alignment changed — open this scan and read marks again.':job.dateNote||'Enter a valid activity date.';
 card.append(el('p','hint'+(['metadata','suggestion'].includes(job.dateSource)||job.alignmentDirty?' needs-check':''),note));
 card.append(gridForCard(job));
 const actions=el('div','batch-actions'),reviewLabel=el('label','review-check'),checked=el('input');checked.type='checkbox';checked.checked=job.reviewed;checked.disabled=!canReview(job);checked.setAttribute('aria-label',`Reviewed ${jobLabel(job)}`);checked.addEventListener('change',()=>{job.reviewed=checked.checked;exported=false;card.classList.toggle('is-reviewed',job.reviewed);updateExport();});reviewLabel.append(checked,document.createTextNode('Reviewed'));
 const open=el('button','button secondary','Open scan');open.setAttribute('aria-label',`Open ${jobLabel(job)}`);open.addEventListener('click',()=>selectJob(job.id));actions.append(reviewLabel,open);card.append(actions);
}
function renderBatch(force=true){
 const valid=new Set(jobs.map(j=>String(j.id)));for(const card of $('batchCards').children)if(!valid.has(card.dataset.jobId))card.remove();
 jobs.forEach((j,i)=>{let card=document.querySelector(`[data-job-id="${j.id}"]`);if(force||!card){renderCard(j);card=document.querySelector(`[data-job-id="${j.id}"]`);}card.querySelector('h3').textContent=`${i+1}. ${jobLabel(j)}`;if($('batchCards').children[i]!==card)$('batchCards').insertBefore(card,$('batchCards').children[i]||null);});updateExport();
}
function showOverview(){if(state.busy||exporting)return;saveActive();selectionToken++;state.aligning=false;state.alignPoints=[];state.source=null;state.job=null;activeId=null;$('sourceCanvas').width=1;$('sourceCanvas').height=1;$('detailPanel').hidden=jobs.length>0;$('batchPanel').hidden=!jobs.length;renderBatch();if(!jobs.length){$('reviewContent').hidden=true;$('emptyState').hidden=false;$('sourceCard').hidden=true;$('detailNav').hidden=true;$('detailReview').hidden=true;$('dateCropWrap').hidden=true;$('activityDate').value='';$('weekday').textContent='—';$('grandTotal').textContent='—';}}
async function decodeBlob(blob){const url=URL.createObjectURL(blob),img=new Image();try{await new Promise((ok,no)=>{img.onload=ok;img.onerror=()=>no(Error('This image could not be opened. Use JPEG, PNG, WebP or PDF.'));img.src=url;});const scale=Math.min(1,2200/Math.max(img.naturalWidth,img.naturalHeight)),c=canvas(Math.round(img.naturalWidth*scale),Math.round(img.naturalHeight*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c;}finally{URL.revokeObjectURL(url);}}
const sourceBlob=source=>new Promise((resolve,reject)=>source.toBlob(b=>b?resolve(b):reject(Error('Unable to keep the page preview.')),'image/jpeg',.95));
async function selectJob(id){
 if(state.busy||exporting)return;saveActive();const job=jobs.find(j=>j.id===id);if(!job||job.status!=='ready')return;
 const token=++selectionToken;setBusy(true,'Opening scan…');
 try{const source=job.sourceBlob?await decodeBlob(job.sourceBlob):null;if(token!==selectionToken)return;
  activeId=id;Object.assign(state,job,{job,source,aligning:false,alignPoints:[],selected:null});state.busy=true;
  $('batchPanel').hidden=true;$('detailPanel').hidden=false;$('detailNav').hidden=false;$('detailReview').hidden=false;
  $('detailTitle').textContent=`${jobs.indexOf(job)+1} of ${jobs.length} · ${jobLabel(job)}`;$('sourceName').textContent=`${jobs.length} ${jobs.length===1?'page':'pages'} in batch`;
  $('activityDate').value=job.date;$('weekday').textContent=weekday(job.date)||'—';$('dateNote').textContent=job.dateNote;$('dateNote').classList.toggle('fallback',['metadata','suggestion'].includes(job.dateSource));$('reviewed').checked=job.reviewed;$('sensitivity').value=job.sensitivity;
  $('dateCropWrap').hidden=!job.datePreview;if(job.datePreview)$('dateCrop').src=job.datePreview;
  $('ocrText').textContent=job.ocrText||'';$('cellDetail').hidden=true;$('sourceCard').hidden=!source;$('alignBtn').textContent='Adjust grid corners';$('sourceCanvas').classList.remove('aligning');$('alignmentHint').textContent=job.alignmentDirty?'Read marks again to apply your adjusted grid.':'The outline should cover only the X cells, excluding table numbers and time headings.';
  renderGrid();if(source)drawSource();$('detailNav').scrollIntoView({behavior:'smooth',block:'start'});
 }catch(e){message(e.message,true);}finally{setBusy(false);renderBatch();}
}
function removeJob(job){if(processing||state.busy||exporting)return;if(activeId===job.id){state.job=null;activeId=null;}jobs.splice(jobs.indexOf(job),1);exported=false;showOverview();$('sourceName').textContent=`${jobs.length} pages in batch`;}
async function addFiles(files){if(!files.length||processing||state.busy||exporting)return;saveActive();for(const file of files)jobs.push(newJob(file));exported=false;$('sourceName').textContent=`${jobs.length} scans queued`;
 showOverview();await processQueue();}
async function processQueue(){
 if(processing)return;processing=true;message('');renderBatch(false);updateExport();let pdf=null,pdfFile=null;
 try{for(let index=0;index<jobs.length;index++){
  const job=jobs[index];if(job.status!=='queued')continue;job.status='processing';renderCard(job);updateExport();
  progress(`Reading ${index+1} of ${jobs.length}: ${jobLabel(job)}`,index/jobs.length*100);await pause();
  try{
   if(job.file.size>25*1024*1024)throw Error('This file is larger than 25 MB. Remove it or choose a smaller copy.');
   let source;
   if(job.file.type==='application/pdf'||/\.pdf$/i.test(job.file.name)){
    if(pdfFile!==job.file){if(pdf)await pdf.destroy();pdf=null;pdfFile=null;const pdfjs=await import('./vendor/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',location.href).href;pdf=await pdfjs.getDocument({data:new Uint8Array(await job.file.arrayBuffer()),isEvalSupported:false}).promise;pdfFile=job.file;}
    job.pdfInfo=(await pdf.getMetadata()).info;
    if(!job.expanded){job.expanded=true;job.pageCount=pdf.numPages;const rest=[];for(let p=2;p<=pdf.numPages;p++)rest.push({...newJob(job.file),page:p,pageCount:pdf.numPages,expanded:true,rows:[...job.rows],times:[...job.times]});jobs.splice(index+1,0,...rest);renderBatch(false);}
    const page=await pdf.getPage(job.page),base=page.getViewport({scale:1}),viewport=page.getViewport({scale:2200/Math.max(base.width,base.height)});source=canvas(Math.ceil(viewport.width),Math.ceil(viewport.height));await page.render({canvasContext:source.getContext('2d'),viewport}).promise;job.pdfText=(await page.getTextContent()).items.map(t=>t.str).join(' ');page.cleanup();
   }else{job.photoDate=exifDate(await job.file.arrayBuffer());source=await decodeBlob(job.file);}
   if(source.height>source.width*1.05)source=rotate(source,-90);
   const found=locateGrid(source,job.rows.length,job.times.length);job.corners=found?.corners||defaultCorners(source);job.gridWarning=!found;
   const marks=readMarks(source,job.corners,job.rows.length,job.times.length,job.sensitivity);Object.assign(job,{grid:marks.grid,uncertain:marks.uncertain});
   job.source=source;await recognizeDate(job,text=>progress(`${index+1} of ${jobs.length}: ${text}`,index/jobs.length*100));job.sourceBlob=await sourceBlob(source);delete job.source;source.width=source.height=1;job.status='ready';
   if(job.gridWarning)job.dateNote+=' Grid not located reliably: open this scan and check its corners.';
  }catch(e){delete job.source;job.status='error';job.error=e.message||'Unable to read this page.';}
  renderCard(job);updateExport();await pause();
 }}finally{if(pdf)await pdf.destroy();processing=false;$('progressWrap').hidden=true;$('sourceName').textContent=`${jobs.length} ${jobs.length===1?'page':'pages'} in batch`;renderBatch(false);const summary=batchSummary(jobs);message(summary.failed?`Finished with ${summary.failed} failed page(s). Retry or remove them before downloading.`:`${jobs.length} page(s) ready. Check the dates and marks, then download one workbook.`,!!summary.failed);}
}

function renderGrid(){const container=$('activityGrid');container.replaceChildren();if(!state.grid)return;const t=totals(state.grid);$('grandTotal').textContent=t.grand;const head=document.createElement('thead'),tr=document.createElement('tr');['Table',...state.times,'Total'].forEach((v,i)=>{const th=document.createElement('th');th.textContent=v;th.scope='col';if(i===state.times.length+1)th.className='total';tr.append(th);});head.append(tr);container.append(head);const body=document.createElement('tbody');state.rows.forEach((v,r)=>{const tr=document.createElement('tr'),th=document.createElement('th');th.textContent=v;th.scope='row';tr.append(th);state.times.forEach((time,c)=>{const td=document.createElement('td'),b=document.createElement('button');b.type='button';b.className='cell-toggle'+(state.grid[r][c]?' marked':'')+(state.uncertain.includes(`${r}:${c}`)?' uncertain':'');b.textContent=state.grid[r][c]?'X':'';b.setAttribute('aria-label',`Table ${v}, ${time}: ${state.grid[r][c]?'X':'blank'}`);b.setAttribute('aria-pressed',state.grid[r][c]);b.dataset.row=r;b.dataset.col=c;b.addEventListener('click',()=>{state.history.push({grid:state.grid.map(row=>[...row]),uncertain:[...state.uncertain]});if(state.history.length>50)state.history.shift();state.grid[r][c]=!state.grid[r][c];state.uncertain=state.uncertain.filter(k=>k!==`${r}:${c}`);invalidate();renderGrid();showCell(r,c);container.querySelector(`[data-row="${r}"][data-col="${c}"]`).focus({preventScroll:true});});b.addEventListener('focus',()=>showCell(r,c));td.append(b);tr.append(td);});const td=document.createElement('td');td.className='total';td.textContent=t.rows[r];tr.append(td);body.append(tr);});container.append(body);const foot=document.createElement('tfoot'),fr=document.createElement('tr');['SCORE',...t.cols,t.grand].forEach((v,i)=>{const th=document.createElement('th');th.textContent=v;if(i===state.times.length+1)th.className='total';fr.append(th);});foot.append(fr);container.append(foot);$('gridSummary').textContent=`${state.rows.length} tables · ${state.times.length} time slots · ${t.grand} X’s`;$('uncertainNote').textContent=state.uncertain.length?`${state.uncertain.length} borderline cells underlined in amber`:'Check all marks against the original';$('undoBtn').disabled=!state.history.length||state.busy;$('emptyState').hidden=true;$('reviewContent').hidden=false;$('reviewStatus').textContent='Ready to review';$('reviewStatus').classList.add('ready');updateExport();requestAnimationFrame(syncGridScroll);}
function showCell(r,c){if(!state.source||!state.corners)return;state.selected={r,c};$('cellDetail').hidden=false;$('cellLabel').textContent=`Table ${state.rows[r]} · ${state.times[c]}`;const a=pointAt(state.corners,c/state.times.length,r/state.rows.length),b=pointAt(state.corners,(c+1)/state.times.length,(r+1)/state.rows.length);const target=$('cellCrop'),ctx=target.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,target.width,target.height);const w=Math.max(1,b.x-a.x),h=Math.max(1,b.y-a.y),s=Math.min(target.width/w,target.height/h);ctx.drawImage(state.source,a.x,a.y,w,h,(target.width-w*s)/2,(target.height-h*s)/2,w*s,h*s);drawSource();}
function drawSource(){if(!state.source)return;const target=$('sourceCanvas');target.width=state.source.width;target.height=state.source.height;const x=target.getContext('2d');x.drawImage(state.source,0,0);const corners=state.corners;x.lineWidth=Math.max(2,state.source.width/650);x.strokeStyle='#62a54b';x.setLineDash([10,5]);x.beginPath();corners.forEach((p,i)=>i?x.lineTo(p.x,p.y):x.moveTo(p.x,p.y));x.closePath();x.stroke();x.setLineDash([]);if(state.selected&&!state.aligning){const {r,c}=state.selected;const pts=[[c,r],[c+1,r],[c+1,r+1],[c,r+1]].map(([u,v])=>pointAt(corners,u/state.times.length,v/state.rows.length));x.fillStyle='#dbf28477';x.beginPath();pts.forEach((p,i)=>i?x.lineTo(p.x,p.y):x.moveTo(p.x,p.y));x.closePath();x.fill();x.stroke();}if(state.aligning){state.alignPoints.forEach((p,i)=>{x.fillStyle='#dbf284';x.beginPath();x.arc(p.x,p.y,state.source.width/70,0,2*Math.PI);x.fill();x.fillStyle='#162b28';x.font=`bold ${state.source.width/65}px sans-serif`;x.fillText(String(i+1),p.x-state.source.width/220,p.y+state.source.width/180);});}}
function marks(){const result=readMarks(state.source,state.corners,state.rows.length,state.times.length,+$('sensitivity').value);state.grid=result.grid;state.uncertain=result.uncertain;state.history=[];state.selected=null;state.alignmentDirty=false;$('exportHint').textContent='Your Excel totals will update automatically.';invalidate();renderGrid();drawSource();}

$('alignBtn').addEventListener('click',()=>{state.aligning=!state.aligning;state.alignPoints=[];$('sourceCanvas').classList.toggle('aligning',state.aligning);$('alignBtn').textContent=state.aligning?'Cancel alignment':'Adjust grid corners';$('alignmentHint').textContent=state.aligning?'Tap the TOP LEFT corner of the data cells. Exclude table numbers and time headings.':'The outline should cover only the X cells, excluding table numbers and time headings.';invalidate();drawSource();});
$('sourceCanvas').addEventListener('click',e=>{if(!state.aligning)return;const rect=e.target.getBoundingClientRect();state.alignPoints.push({x:(e.clientX-rect.left)/rect.width*e.target.width,y:(e.clientY-rect.top)/rect.height*e.target.height});if(state.alignPoints.length===4){const p=state.alignPoints;const area=Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%4];return s+a.x*b.y-b.x*a.y;},0))/2;if(area<state.source.width*state.source.height*.005||p[0].x>=p[1].x||p[3].x>=p[2].x||p[0].y>=p[3].y||p[1].y>=p[2].y){state.alignPoints=[];message('Those corners do not form a usable grid. Start at top left, then top right, bottom right, bottom left.',true);drawSource();return;}state.corners=[...p];state.alignmentDirty=true;state.aligning=false;state.selected=null;$('sourceCanvas').classList.remove('aligning');$('alignBtn').textContent='Adjust grid corners';$('alignmentHint').textContent='Corners updated. Select “Read marks again” to apply the new alignment.';$('exportHint').textContent='Read marks again to apply your adjusted grid before export.';invalidate();message('Grid outline updated. Read marks again before reviewing.');}else $('alignmentHint').textContent=`Tap the ${['TOP LEFT','TOP RIGHT','BOTTOM RIGHT','BOTTOM LEFT'][state.alignPoints.length]} corner of the data cells.`;drawSource();});

$('activityDate').addEventListener('input',()=>setDate($('activityDate').value,'manual','Date entered or corrected by you.'));
$('reviewed').addEventListener('change',()=>{saveActive();exported=false;renderCard(state.job);updateExport();});
$('reviewAll').addEventListener('change',()=>{const checked=$('reviewAll').checked;saveActive();for(const job of jobs)job.reviewed=checked&&canReview(job);if(state.job)$('reviewed').checked=state.job.reviewed;exported=false;renderBatch();});
for(const id of ['scanFile','cameraFile'])$(id).addEventListener('change',e=>{const files=[...e.target.files];e.target.value='';addFiles(files);});
$('dropzone').addEventListener('dragover',e=>{e.preventDefault();$('dropzone').classList.add('drag');});
$('dropzone').addEventListener('dragleave',()=>$('dropzone').classList.remove('drag'));
$('dropzone').addEventListener('drop',e=>{e.preventDefault();$('dropzone').classList.remove('drag');addFiles([...e.dataTransfer.files]);});
$('allScans').addEventListener('click',showOverview);
$('nextReview').addEventListener('click',()=>{const job=jobs.find(j=>j.status==='ready'&&!j.reviewed);if(job)selectJob(job.id);});
$('previousScan').addEventListener('click',()=>{const ready=jobs.filter(j=>j.status==='ready'),i=ready.findIndex(j=>j.id===activeId);if(i>0)selectJob(ready[i-1].id);});
$('nextScan').addEventListener('click',()=>{const ready=jobs.filter(j=>j.status==='ready'),i=ready.findIndex(j=>j.id===activeId);if(i<ready.length-1)selectJob(ready[i+1].id);});
$('reviewNext').addEventListener('click',()=>{if(!state.job||!canReview(state.job))return;$('reviewed').checked=true;saveActive();const next=jobs.find(j=>j.status==='ready'&&!j.reviewed);if(next)selectJob(next.id);else showOverview();});
$('retryDate').addEventListener('click',async()=>{
 if(!state.source||!state.job)return;setBusy(true,'Reading date…');
 try{const job=state.job;saveActive();if(job.dateSource==='manual')job.dateSource='';job.source=state.source;await recognizeDate(job,progress);delete job.source;$('dateCrop').src=job.datePreview;$('ocrText').textContent=job.ocrText;setDate(job.date,job.dateSource,job.dateNote);}
 catch(e){message(e.message,true);}finally{delete state.job?.source;setBusy(false);renderBatch();}
});
$('rotateBtn').addEventListener('click',async()=>{
 if(!state.source)return;setBusy(true,'Rotating scan…');
 try{state.source=rotate(state.source,-90);state.corners=locateGrid(state.source,state.rows.length,state.times.length)?.corners||defaultCorners(state.source);state.selected=null;marks();state.job.sourceBlob=await sourceBlob(state.source);state.job.source=state.source;state.job.dateSource='';await recognizeDate(state.job,progress);delete state.job.source;$('dateCrop').src=state.job.datePreview;$('ocrText').textContent=state.job.ocrText;setDate(state.job.date,state.job.dateSource,state.job.dateNote);}
 catch(e){message(e.message,true);}finally{delete state.job?.source;setBusy(false);renderBatch();}
});
$('rescanBtn').addEventListener('click',()=>{if(!state.source)return;marks();message('Marks reread for this page. Its previous manual edits were replaced.');});
$('undoBtn').addEventListener('click',()=>{const prev=state.history.pop();if(prev){state.grid=prev.grid;state.uncertain=prev.uncertain;invalidate();renderGrid();}});
function setLayout(rows,times){layout={rows:[...rows],times:[...times]};$('rowLabels').value=rows.join(', ');$('timeLabels').value=times.join(', ');}
$('applyLayout').addEventListener('click',()=>{const rows=$('rowLabels').value.split(',').map(s=>s.trim()).filter(Boolean),times=$('timeLabels').value.split(',').map(s=>s.trim()).filter(Boolean);if(!rows.length||rows.length>40||times.length<8||times.length>72||new Set(rows).size!==rows.length||rows.some(s=>s.length>40)||times.some(s=>s.length>20)){message('Use 1–40 unique table labels and 8–72 time labels. Keep labels short.',true);return;}template=null;if(workbook)$('templateSelect').value='';setLayout(rows,times);exported=false;message('Layout saved for files added next. Existing pages keep their corrections.');});
$('workbookFile').addEventListener('change',async e=>{
 const file=e.target.files[0];e.target.value='';if(!file)return;if(file.size>25*1024*1024){message('Choose a workbook smaller than 25 MB.',true);return;}setBusy(true,'Reading workbook layout…');
 try{const book=await openWorkbook(await file.arrayBuffer());workbook=book;workbookName=file.name;$('workbookName').textContent=`${file.name} · ${book.sheets.length} existing tabs`;$('templateSelect').replaceChildren();book.templates.forEach((t,i)=>{const option=el('option','',t.name);option.value=i;$('templateSelect').append(option);});const plain=el('option','','Use current layout');plain.value='';$('templateSelect').append(plain);const index=book.templates.findIndex(t=>/blank/i.test(t.name)),chosen=index>=0?index:book.templates.length?0:null;template=chosen===null?null:book.templates[chosen];$('templateSelect').value=chosen===null?'':chosen;if(template)setLayout(template.rows,template.times);$('templateWrap').hidden=false;exported=false;message('Workbook loaded. All reviewed pages will be added as new tabs. Existing scan layouts and corrections are kept.');}
 catch(e){message(e.message||'Unable to read this workbook.',true);}finally{setBusy(false);renderBatch();}
});
$('templateSelect').addEventListener('change',()=>{template=$('templateSelect').value===''?null:workbook.templates[+$('templateSelect').value];if(template)setLayout(template.rows,template.times);exported=false;message('Matching pages will use this template’s formatting. New scans will use its layout.');});
$('removeWorkbook').addEventListener('click',()=>{workbook=null;template=null;workbookName='';$('templateWrap').hidden=true;$('workbookName').textContent='Leave empty to create a new workbook.';exported=false;updateExport();});
$('manualBtn').addEventListener('click',()=>{const job=newJob();Object.assign(job,{status:'ready',dateSource:'manual',dateNote:'Enter the activity date, then tap cells to add X’s.',grid:blankGrid(job.rows.length,job.times.length)});jobs.push(job);exported=false;renderBatch();selectJob(job.id);});
$('exportBtn').addEventListener('click',async()=>{
 saveActive();if($('exportBtn').disabled||!batchSummary(jobs).canExport)return;exporting=true;updateExport();progress('Preparing Excel workbook…',90);
 try{const result=await exportBatch({workbook,jobs:jobs.map(job=>({...job,template:matchingTemplate(job,template)})),onProgress:(n,total)=>progress(`Adding Excel tab ${n} of ${total}…`,90+n/total*9)});const url=URL.createObjectURL(result.blob),a=el('a');a.href=url;a.download=(workbookName?workbookName.replace(/\.xlsx$/i,'')+' - updated':jobs.length===1?'Table Activity '+jobs[0].date:'Table Activity - '+jobs.length+' pages')+'.xlsx';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);exported=true;message(`Downloaded one workbook with ${result.names.length} new ${result.names.length===1?'tab':'tabs'}. All row, column and grand totals are Excel formulas.`);}
 catch(e){message('Export failed: '+e.message,true);}finally{exporting=false;$('progressWrap').hidden=true;renderBatch();}
});
window.addEventListener('beforeunload',e=>{if(jobs.length&&!exported){e.preventDefault();e.returnValue='';}});
if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
const gridScroller=$('activityGrid').parentElement;
function syncGridScroll(){const max=gridScroller.scrollWidth-gridScroller.clientWidth;$('gridPosition').value=max>0?Math.round(gridScroller.scrollLeft/max*1000):0;$('gridPosition').disabled=max<=0;const index=Math.max(0,Math.min(state.times.length-1,Math.round(gridScroller.scrollLeft/49)));$('scrollPosition').textContent=state.times[index]||'';}
$('gridPosition').addEventListener('input',e=>{gridScroller.scrollLeft=+e.target.value/1000*(gridScroller.scrollWidth-gridScroller.clientWidth);syncGridScroll();});
gridScroller.addEventListener('scroll',syncGridScroll,{passive:true});new ResizeObserver(syncGridScroll).observe(gridScroller);
setLayout(layout.rows,layout.times);updateExport();
