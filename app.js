import './compatibility.js?v=20261014-1';
import {DEFAULT_ROWS,DEFAULT_TIMES,blankGrid,totals,isISODate,weekday} from './core.js?v=20261014-1';
import {canvas,rotate,locateGrid,defaultCorners,readMarks,pointAt} from './vision.js?v=20261014-1';
import {recognizeDate,releaseRecognition} from './recognition.js?v=20261014-1';
import {createLibrary} from './library.js?v=20261014-1';
import {timeMinute} from './records.js?v=20261014-1';
import {batchSummary,canReview,changeDate,toggleMark,saveEditorChanges} from './batch.js?v=20261014-1';
import {createDraftStore} from './drafts.js?v=20261014-1';
import {REVIEW_PAGE_SIZE,reviewPage,displayDate,enteredDate,shiftDate,cellAt,drawMarkOverlay} from './review.js?v=20261014-1';
import {createCamera} from './camera.js?v=20261014-1';
const $=id=>document.getElementById(id);
const jobs=[];
let nextId=1,processing=false,exporting=false,exported=false,activeId=null,selectionToken=0;
let library,batchPage=0,expandedGrid=null,draftLoading=true,pauseReading=false,pendingSelection=null;
const drafts=createDraftStore(),draftTimers=new Map();let draftFailed=false;
function queueDraft(job){if(!job?.id)return;clearTimeout(draftTimers.get(job.id));$('draftStatus').textContent='Saving local draft…';draftTimers.set(job.id,setTimeout(()=>{draftTimers.delete(job.id);persistJob(job);},150));}
async function persistJob(job){try{await drafts.save(job);$('draftStatus').textContent=draftFailed?'Some draft changes could not be saved. Keep this page open.':'Draft saved on this device';return true;}catch(e){draftFailed=true;$('draftStatus').textContent='Local draft could not be saved. Keep this page open until you save the reviewed days.';return false;}}
function removeDraft(id){clearTimeout(draftTimers.get(id));draftTimers.delete(id);drafts.remove(id).catch(()=>{$('draftStatus').textContent='Could not remove this local draft.';});}
function clearDrafts(){for(const timer of draftTimers.values())clearTimeout(timer);draftTimers.clear();drafts.clear().then(()=>{$('draftStatus').textContent='';}).catch(()=>{$('draftStatus').textContent='Could not clear local drafts.';});}
let layout={rows:[...DEFAULT_ROWS],times:[...DEFAULT_TIMES]};
const state={...layout,grid:null,uncertain:[],source:null,corners:null,busy:false,history:[],aligning:false,alignmentDirty:false,alignPoints:[],dateSource:'',selected:null,job:null};
const pause=()=>new Promise(r=>setTimeout(r,0));
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
function progress(text,value=50){$('progressWrap').hidden=false;$('progressText').textContent=text;$('progress').value=value;$('detailProgress').textContent=text;$('detailProgress').hidden=false;}
function setBusy(on,text='Reading this page…',value=50){state.busy=on;if(on)progress(text,value);else if(!processing&&!exporting){$('progressWrap').hidden=true;$('detailProgress').hidden=true;}updateExport();}
function saveActive(){
 if(!state.job)return;
 saveEditorChanges(state.job,{...state,sensitivity:+$('sensitivity').value,reviewed:$('reviewed').checked});queueDraft(state.job);
}
function renderActiveDate(){
 if(!state.job)return;
 const {date,dateSource,dateNote}=state.job;
 if(document.activeElement!==$('activityDate'))$('activityDate').value=displayDate(date);
 state.dateSource=dateSource;$('dateNote').textContent=dateNote||'';
 $('dateNote').classList.toggle('fallback',['suggestion'].includes(dateSource));$('weekday').textContent=weekday(date)||'—';
 $('ocrText').textContent=`App version: 20261014-1\nCurrent activity date: ${date||'(empty)'} (${dateSource||'not selected'})\n\nLast recognition attempt:\n${state.job.ocrText||'No date read yet.'}`;
}
function updateExport(){
 renderActiveDate();
 renderAlignment();const summary=batchSummary(jobs),locked=state.busy||exporting||draftLoading;
 $('exportBtn').disabled=processing||locked||state.aligning||!summary.canExport||!library?.signedIn();
 $('exportBtn').textContent=jobs.length?`Save ${jobs.length} ${jobs.length===1?'day':'days'}`:'Save reviewed days';
 $('exportHint').textContent=summary.total?`${summary.reviewed} of ${summary.total} pages reviewed${summary.pending?' · '+summary.pending+' still reading':''}${summary.failed?' · remove or retry '+summary.failed+' failed '+(summary.failed===1?'page':'pages'):''}. ${library?.signedIn()?'':'Sign in to save.'}`:'Add scans to begin.';
 $('reviewAll').checked=summary.canExport;
 $('reviewAll').disabled=processing||locked||state.aligning||summary.ready!==summary.total||!summary.total;
 for(const id of ['scanFile','cameraFile','openCamera','manualBtn'])$(id).disabled=processing||locked;
 for(const id of ['applyLayout','rowLabels','timeLabels','clearScans'])$(id).disabled=processing||locked;
 for(const id of ['retryDate','rotateBtn','rescanBtn','findGridBtn','fixGridBtn','alignBtn','sensitivity','activityDate','undoBtn','reviewed','reviewNext','dateBack','dateForward','showOverlay','overlayZoom'])$(id).disabled=locked||!state.job||state.job.status!=='ready';
 $('activityDate').disabled=locked||!state.job||!!state.job.savedDate;
 $('dateBack').disabled=$('dateForward').disabled=$('activityDate').disabled||!isISODate(state.job?.date);
 $('batchPrevious').disabled=locked||batchPage===0;$('batchNext').disabled=locked||batchPage>=Math.ceil(jobs.length/REVIEW_PAGE_SIZE)-1;
 $('undoBtn').disabled=locked||!state.history.length||!!state.gridWarning||state.alignmentDirty;$('rescanBtn').disabled=locked||!state.source||!!state.gridWarning;
 $('reviewed').disabled=locked||state.aligning||!state.job||!canReview(state.job);
 $('reviewNext').disabled=$('reviewed').disabled;$('reviewNext').textContent=jobs.some(j=>j!==state.job&&j.status==='ready'&&!j.reviewed)?'Reviewed & next':'Finish review';
 document.querySelectorAll('#activityGrid .cell-toggle').forEach(b=>b.disabled=locked||!!state.gridWarning||state.alignmentDirty);
 for(const card of $('batchCards').children){const job=jobs.find(j=>String(j.id)===card.dataset.jobId);if(!job)continue;for(const control of card.querySelectorAll('button,input')){const label=control.getAttribute('aria-label')||'';if(control.classList.contains('cell-toggle'))control.disabled=locked||!!job.gridWarning||job.alignmentDirty;else if(control.type==='checkbox')control.disabled=locked||!canReview(job);else if(label.startsWith('Remove ')||control.textContent==='Retry')control.disabled=locked||processing;else if(control.type!=='range'&&!label.startsWith('Scroll '))control.disabled=locked||(control.classList.contains('quick-date')&&!!job.savedDate);}}
 $('pauseQueue').hidden=!processing;$('pauseQueue').disabled=locked||pauseReading;
 $('resumeQueue').hidden=!jobs.some(j=>j.status==='queued')||processing;$('resumeQueue').disabled=locked;
 $('nextReview').disabled=locked||!jobs.some(j=>j.status==='ready'&&!j.reviewed);
 $('batchCount').textContent=jobs.length?`(${jobs.length})`:'';
 $('batchSummary').textContent=`${summary.reviewed} reviewed · ${summary.pending} reading · ${summary.failed} failed`;
 const dates=jobs.filter(j=>isISODate(j.date)).map(j=>j.date),duplicates=dates.length-new Set(dates).size;
 const needsAlignment=jobs.filter(j=>j.status==='ready'&&(j.gridWarning||j.alignmentDirty)).length;if(needsAlignment)$('batchSummary').textContent+=` · ${needsAlignment} need table alignment`;if(duplicates)$('batchSummary').textContent+=' · Correct or remove repeated dates before saving.';
}
function invalidate(){
 $('reviewed').checked=false;exported=false;saveActive();
 if(state.job){state.job.reviewed=false;renderCard(state.job);}
 updateExport();
}
function setDate(date,source,note){if(!state.job)return;Object.assign(state.job,{date:date||'',dateSource:source,dateNote:note});renderActiveDate();invalidate();}
function refreshActive(){saveActive();if(state.job)renderCard(state.job);updateExport();}
function jobLabel(job){return job.fileName+(job.pageCount>1?` · page ${job.page}/${job.pageCount}`:'');}
function newJob(file=null){const id=nextId++;return {id,order:id,file,fileName:file?.name||'Blank sheet',page:1,pageCount:1,status:'queued',rows:[...layout.rows],times:[...layout.times],grid:null,uncertain:[],history:[],reviewed:false,date:'',dateSource:'',dateNote:'',alignmentDirty:false,sensitivity:50,sourceBlob:null};}
function gridForCard(job){
 const wrap=el('div','batch-grid'),scroll=el('div','grid-scroll batch-grid-scroll'),table=el('table');
 scroll.tabIndex=0;scroll.setAttribute('aria-label',`Grid for ${jobLabel(job)}`);scroll.append(table);
 const counts=totals(job.grid),head=el('thead'),hr=el('tr');
 ['Table',...job.times,'Total'].forEach((v,i)=>{const th=el('th',i===job.times.length+1?'total':'',v);th.scope='col';hr.append(th);});head.append(hr);table.append(head);
 const body=el('tbody');job.rows.forEach((v,r)=>{const row=el('tr'),th=el('th','',v);th.scope='row';row.append(th);job.times.forEach((time,c)=>{
  const td=el('td'),button=el('button','cell-toggle'+(job.grid[r][c]?' marked':'')+(job.uncertain.includes(`${r}:${c}`)?' uncertain':''),job.grid[r][c]?'X':'');
  button.type='button';button.dataset.row=r;button.dataset.col=c;button.setAttribute('aria-label',`${jobLabel(job)}: table ${v}, ${time}: ${job.grid[r][c]?'X':'blank'}`);button.setAttribute('aria-pressed',job.grid[r][c]);
  button.addEventListener('click',()=>{if(state.busy||exporting)return;toggleMark(job,r,c);queueDraft(job);exported=false;renderCard(job);updateExport();document.querySelector(`[data-job-id="${job.id}"] button[data-row="${r}"][data-col="${c}"]`)?.focus({preventScroll:true});});
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
 if($('batchPanel').hidden||!reviewPage(jobs,batchPage).items.includes(job))return;
 let card=document.querySelector(`[data-job-id="${job.id}"]`);if(!card){card=el('article','batch-item');card.dataset.jobId=job.id;$('batchCards').append(card);}
 card.classList.toggle('is-reviewed',!!job.reviewed);card.replaceChildren();
 const heading=el('div','batch-item-heading'),title=el('h3','',`${jobs.indexOf(job)+1}. ${jobLabel(job)}`),remove=el('button','text-button','Remove');remove.setAttribute('aria-label',`Remove ${jobLabel(job)}`);remove.disabled=processing||state.busy||exporting;remove.addEventListener('click',()=>removeJob(job));heading.append(title,remove);card.append(heading);
 if(job.status!=='ready'){
  card.append(el('p',job.status==='error'?'error':'hint',job.status==='error'?job.error:job.status==='processing'?'Reading…':'Waiting to read…'));
  if(job.status==='error'){const retry=el('button','button secondary','Retry');retry.disabled=processing||exporting;retry.addEventListener('click',()=>{job.status='queued';job.error='';processQueue();});card.append(retry);}return;
 }
 if(job.datePreview){const crop=el('img','batch-date-crop');crop.src=job.datePreview;crop.alt=`Original date for ${jobLabel(job)}`;card.append(crop);}
 const fields=el('div','batch-fields'),label=el('label','','Date'),date=el('input');date.className='quick-date';date.setAttribute('aria-label',`Date for ${jobLabel(job)}`);bindDateInput(date,job,()=>{card.querySelector('.batch-weekday').textContent=weekday(job.date)||'Enter date';card.classList.remove('is-reviewed');card.querySelector('.review-check input').checked=false;});label.append(date);
 fields.append(label,el('span','batch-weekday',weekday(job.date)||'Enter date'),el('strong','batch-score',`${totals(job.grid).grand} X’s`));card.append(fields);
 const note=job.gridWarning?'Table not located. Open the scan to find the table or set its four corners.':job.alignmentDirty?'Grid alignment changed — open this scan and read marks again.':job.dateNote||'Enter a valid activity date.';
 card.append(el('p','hint'+(['metadata','suggestion'].includes(job.dateSource)||job.alignmentDirty?' needs-check':''),note));
 if(expandedGrid===job.id)card.append(gridForCard(job));
 else card.append(el('p','compact-grid-summary',`${job.rows.length} tables · ${job.times.length} times · ${job.uncertain.length} borderline cells`));
 const actions=el('div','batch-actions'),reviewLabel=el('label','review-check'),checked=el('input');checked.type='checkbox';checked.checked=job.reviewed;checked.disabled=!canReview(job);checked.setAttribute('aria-label',`Reviewed ${jobLabel(job)}`);checked.addEventListener('change',()=>{job.reviewed=checked.checked;queueDraft(job);exported=false;card.classList.toggle('is-reviewed',job.reviewed);updateExport();});reviewLabel.append(checked,document.createTextNode('Reviewed'));
 const gridButton=el('button','text-button',expandedGrid===job.id?'Hide grid':'Edit grid');gridButton.addEventListener('click',()=>{expandedGrid=expandedGrid===job.id?null:job.id;renderBatch();});
 const open=el('button','button secondary','View scan');open.setAttribute('aria-label',`Open ${jobLabel(job)}`);open.addEventListener('click',()=>selectJob(job.id));actions.append(reviewLabel,gridButton,open);card.append(actions);
}
function renderBatch(force=true){
 if($('batchPanel').hidden){$('batchCards').replaceChildren();updateExport();return;}
 const page=reviewPage(jobs,batchPage);batchPage=page.page;
 const valid=new Set(page.items.map(j=>String(j.id)));for(const card of [...$('batchCards').children])if(!valid.has(card.dataset.jobId))card.remove();
 page.items.forEach((j,i)=>{let card=document.querySelector(`[data-job-id="${j.id}"]`);if(force||!card){renderCard(j);card=document.querySelector(`[data-job-id="${j.id}"]`);}if($('batchCards').children[i]!==card)$('batchCards').insertBefore(card,$('batchCards').children[i]||null);});
 $('batchPageLabel').textContent=jobs.length?`${batchPage*REVIEW_PAGE_SIZE+1}–${Math.min(jobs.length,(batchPage+1)*REVIEW_PAGE_SIZE)} of ${jobs.length}`:'0 scans';updateExport();
}
function releaseSource(){if(state.source)state.source.width=state.source.height=1;state.source=null;for(const id of ['sourceCanvas','cellCrop'])$(id).width=$(id).height=1;}
function showOverview(){if(state.busy||exporting)return;$('scanView').classList.remove('focused-review');saveActive();selectionToken++;state.aligning=false;state.alignPoints=[];releaseSource();state.job=null;activeId=null;$('activityGrid').replaceChildren();$('detailPanel').hidden=jobs.length>0;$('batchPanel').hidden=!jobs.length;renderBatch();if(!jobs.length){$('reviewContent').hidden=true;$('emptyState').hidden=false;$('sourceCard').hidden=true;$('detailNav').hidden=true;$('detailReview').hidden=true;$('dateCropWrap').hidden=true;$('activityDate').value='';$('weekday').textContent='—';$('grandTotal').textContent='—';}}
function bindDateInput(input,job,updated=()=>{}){
 input.type='text';input.inputMode='numeric';input.placeholder='M/D/YY';input.maxLength=10;input.autocomplete='off';input.enterKeyHint='next';input.value=displayDate(job.date);input.disabled=!!job.savedDate;
 input.addEventListener('focus',()=>input.select());
 input.addEventListener('input',()=>{if(job.savedDate)return;const date=enteredDate(input.value);changeDate(job,date||'');input.setAttribute('aria-invalid',!date&&!!input.value);exported=false;updated();if(state.job===job){$('reviewed').checked=false;renderActiveDate();}queueDraft(job);updateExport();});
 input.addEventListener('blur',()=>{if(job.date)input.value=displayDate(job.date);});
 input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(!job.date)return;const dates=[...$('batchCards').querySelectorAll('.quick-date')],index=dates.indexOf(input);if(index>=0&&dates[index+1])dates[index+1].focus();else if(index>=0&&batchPage<Math.ceil(jobs.length/REVIEW_PAGE_SIZE)-1){batchPage++;renderBatch();$('batchCards').querySelector('.quick-date')?.focus();}else input.blur();}});
}
async function decodeBlob(blob){const url=URL.createObjectURL(blob),img=new Image();try{await new Promise((ok,no)=>{img.onload=ok;img.onerror=()=>no(Error('This image could not be opened. Use JPEG, PNG, WebP or PDF.'));img.src=url;});const scale=Math.min(1,2200/Math.max(img.naturalWidth,img.naturalHeight)),c=canvas(Math.round(img.naturalWidth*scale),Math.round(img.naturalHeight*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c;}finally{img.src='';URL.revokeObjectURL(url);}}
const sourceBlob=source=>new Promise((resolve,reject)=>source.toBlob(b=>b?resolve(b):reject(Error('Unable to keep the page preview.')),'image/jpeg',.95));
async function selectJob(id){
 if(state.busy||exporting)return;if(processing){pauseReading=true;pendingSelection=id;message('Finishing the current page, then opening your scan. Remaining pages will wait.');return;}saveActive();const job=jobs.find(j=>j.id===id);if(!job||job.status!=='ready')return;
 const alreadyOpen=!!state.job,pan=$('sourceCanvas').parentElement,scroll={x:pan.scrollLeft/Math.max(1,pan.scrollWidth),y:pan.scrollTop/Math.max(1,pan.scrollHeight)};const token=++selectionToken;setBusy(true,'Opening scan…');releaseSource();$('activityGrid').replaceChildren();$('batchCards').replaceChildren();$('batchPanel').hidden=true;await pause();
 try{const images=job.sourceBlob||!job.hasSource?{}:await drafts.images(job.id);if(images.dateCropBlob)job.dateCropBlob=images.dateCropBlob;const blob=job.sourceBlob||images.sourceBlob;const source=blob?await decodeBlob(blob):null;if(token!==selectionToken){if(source)source.width=source.height=1;return;}
  activeId=id;Object.assign(state,{gridWarning:false,gridVersion:0,alignmentDirty:false},job,{job,source,aligning:false,alignPoints:[],selected:null});state.busy=true;
  $('batchPanel').hidden=true;$('detailPanel').hidden=false;$('detailNav').hidden=false;$('detailReview').hidden=false;
  $('detailTitle').textContent=`${jobs.indexOf(job)+1} of ${jobs.length} · ${jobLabel(job)}`;$('sourceName').textContent=`${jobs.length} ${jobs.length===1?'page':'pages'} in batch`;
  $('activityDate').value=displayDate(job.date);$('weekday').textContent=weekday(job.date)||'—';$('dateNote').textContent=job.dateNote;$('dateNote').classList.toggle('fallback',['metadata','suggestion'].includes(job.dateSource));$('reviewed').checked=job.reviewed;$('sensitivity').value=job.sensitivity;
  $('dateCropWrap').hidden=!job.datePreview;if(job.datePreview)$('dateCrop').src=job.datePreview;
  $('ocrText').textContent=job.ocrText||'';$('cellDetail').hidden=true;$('sourceCard').hidden=!source;$('alignBtn').textContent='Adjust grid corners';$('sourceCanvas').classList.remove('aligning');$('alignmentHint').textContent=job.alignmentDirty?'Read marks again to apply your adjusted grid.':'The outline should cover only the X cells, excluding table numbers and time headings.';
  $('scanView').classList.add('focused-review');$('scanTools').open=!!job.gridWarning||job.alignmentDirty;$('gridDetails').open=!source;if(!alreadyOpen){$('overlayZoom').value='1';$('showOverlay').checked=true;}$('sourceCanvas').style.width=`${+$('overlayZoom').value*100}%`;renderGrid();if(source)drawSource();message('');requestAnimationFrame(()=>{pan.scrollLeft=alreadyOpen?scroll.x*pan.scrollWidth:0;pan.scrollTop=alreadyOpen?scroll.y*pan.scrollHeight:0;});$('detailNav').scrollIntoView({block:'start'});
 }catch(e){message(e.message,true);$('scanView').classList.remove('focused-review');$('batchPanel').hidden=false;}finally{setBusy(false);renderBatch(false);}
}
function removeJob(job){if(processing||state.busy||exporting)return;if(activeId===job.id){state.job=null;activeId=null;}jobs.splice(jobs.indexOf(job),1);removeDraft(job.id);exported=false;showOverview();$('sourceName').textContent=`${jobs.length} pages in batch`;}
async function addFiles(files){if(!files.length||processing||state.busy||exporting||draftLoading)return;saveActive();const added=files.map(file=>newJob(file));jobs.push(...added);files=null;setBusy(true,'Saving scans on this device…');try{for(const job of added)await persistJob(job);}finally{setBusy(false);}exported=false;library.show('scan');$('sourceName').textContent=`${jobs.length} scans queued`;
 showOverview();await processQueue();}
async function processQueue(){
 if(processing||draftLoading)return;pauseReading=false;processing=true;message('');renderBatch(false);updateExport();let pdf=null,pdfFile=null;
 try{for(let index=0;index<jobs.length;index++){
  if(pauseReading)break;const job=jobs[index];if(job.status!=='queued')continue;job.status='processing';renderCard(job);updateExport();
  progress(`Reading ${index+1} of ${jobs.length}: ${jobLabel(job)}`,index/jobs.length*100);await pause();
  let source;
  try{
   if(!job.file)job.file=(await drafts.images(job.id)).file;
   if(!job.file)throw Error('The original file is missing from this draft. Remove this page and add its file again.');
   if(job.file.size>25*1024*1024)throw Error('This file is larger than 25 MB. Remove it or choose a smaller copy.');
   if(job.file.type==='application/pdf'||/\.pdf$/i.test(job.file.name)){
    if(pdfFile!==job.file){if(pdf)await pdf.destroy();pdf=null;pdfFile=null;const pdfjs=await import('./vendor/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('./pdf-worker.js?v=20261014-1',location.href).href;pdf=await pdfjs.getDocument({data:new Uint8Array(await job.file.arrayBuffer()),isEvalSupported:false}).promise;pdfFile=job.file;}
    if(!job.expanded){job.expanded=true;job.pageCount=pdf.numPages;const rest=[];for(let p=2;p<=pdf.numPages;p++)rest.push({...newJob(job.file),order:(job.order??job.id)+(p-1)/pdf.numPages,page:p,pageCount:pdf.numPages,expanded:true,rows:[...job.rows],times:[...job.times]});jobs.splice(index+1,0,...rest);for(const pageJob of [job,...rest])await persistJob(pageJob);renderBatch(false);}
    const page=await pdf.getPage(job.page),base=page.getViewport({scale:1}),viewport=page.getViewport({scale:2200/Math.max(base.width,base.height)});source=canvas(Math.ceil(viewport.width),Math.ceil(viewport.height));await page.render({canvasContext:source.getContext('2d'),viewport}).promise;try{job.pdfText=(await page.getTextContent()).items.map(t=>t.str).join(' ');}catch(e){job.pdfText='';job.pdfTextError=e.message;}page.cleanup();
   }else{source=await decodeBlob(job.file);}
   if(source.height>source.width*1.05){const old=source;source=rotate(old,-90);old.width=old.height=1;}
   const found=locateGrid(source,job.rows.length,job.times.length);job.corners=found?.corners||defaultCorners(source);job.gridWarning=!found;job.gridVersion=2;
   const marks=found?readMarks(source,job.corners,job.rows.length,job.times.length,job.sensitivity,found.binary):{grid:blankGrid(job.rows.length,job.times.length),uncertain:[]};if(found)delete found.binary;Object.assign(job,{grid:marks.grid,uncertain:marks.uncertain});
   job.source=source;await recognizeDate(job,text=>progress(`${index+1} of ${jobs.length}: ${text}`,index/jobs.length*100));if(job.pdfTextError)job.ocrText+='\nPDF text layer unavailable; date read from the image: '+job.pdfTextError;job.sourceBlob=await sourceBlob(source);job.hasSource=true;delete job.source;job.status='ready';job.file=null;

  }catch(e){delete job.source;job.status='error';job.error=e.message||'Unable to read this page.';}finally{if(source)source.width=source.height=1;}
  if(await persistJob(job)){if(job.status==='ready'){job.sourceBlob=null;job.dateCropBlob=null;}}
  renderCard(job);updateExport();await pause();
 }}finally{if(pdf)await pdf.destroy();await releaseRecognition();processing=false;$('progressWrap').hidden=true;$('detailProgress').hidden=true;$('sourceName').textContent=`${jobs.length} ${jobs.length===1?'page':'pages'} in batch`;renderBatch(false);const summary=batchSummary(jobs);if(pendingSelection!==null){const id=pendingSelection;pendingSelection=null;selectJob(id);}else message(summary.failed?`Finished with ${summary.failed} failed page(s). Retry or remove them before saving.`:summary.pending?'Reading paused. Review ready pages or tap Resume reading.':`${jobs.length} page(s) ready. Check the dates and marks, then save the reviewed days.`,!!summary.failed);}
}

function renderGrid(){const container=$('activityGrid');container.replaceChildren();if(!state.grid)return;const t=totals(state.grid);$('grandTotal').textContent=t.grand;const head=document.createElement('thead'),tr=document.createElement('tr');['Table',...state.times,'Total'].forEach((v,i)=>{const th=document.createElement('th');th.textContent=v;th.scope='col';if(i===state.times.length+1)th.className='total';tr.append(th);});head.append(tr);container.append(head);const body=document.createElement('tbody');state.rows.forEach((v,r)=>{const tr=document.createElement('tr'),th=document.createElement('th');th.textContent=v;th.scope='row';tr.append(th);state.times.forEach((time,c)=>{const td=document.createElement('td'),b=document.createElement('button');b.type='button';b.className='cell-toggle'+(state.grid[r][c]?' marked':'')+(state.uncertain.includes(`${r}:${c}`)?' uncertain':'');b.textContent=state.grid[r][c]?'X':'';b.setAttribute('aria-label',`Table ${v}, ${time}: ${state.grid[r][c]?'X':'blank'}`);b.setAttribute('aria-pressed',state.grid[r][c]);b.dataset.row=r;b.dataset.col=c;b.addEventListener('click',()=>{editCell(r,c);container.querySelector(`[data-row="${r}"][data-col="${c}"]`)?.focus({preventScroll:true});});b.addEventListener('focus',()=>showCell(r,c));td.append(b);tr.append(td);});const td=document.createElement('td');td.className='total';td.textContent=t.rows[r];tr.append(td);body.append(tr);});container.append(body);const foot=document.createElement('tfoot'),fr=document.createElement('tr');['SCORE',...t.cols,t.grand].forEach((v,i)=>{const th=document.createElement('th');th.textContent=v;if(i===state.times.length+1)th.className='total';fr.append(th);});foot.append(fr);container.append(foot);$('gridSummary').textContent=`${state.rows.length} tables · ${state.times.length} time slots · ${t.grand} X’s`;$('uncertainNote').textContent=state.uncertain.length?`${state.uncertain.length} borderline cells underlined in amber`:'Check all marks against the original';$('undoBtn').disabled=!state.history.length||state.busy;$('emptyState').hidden=true;$('reviewContent').hidden=false;$('reviewStatus').textContent=state.gridWarning?'Align table first':state.alignmentDirty?'Read X marks again':'Ready to review';$('reviewStatus').classList.add('ready');updateExport();requestAnimationFrame(syncGridScroll);}
function editCell(r,c){if(state.gridWarning||state.alignmentDirty)return;saveActive();toggleMark(state.job,r,c);Object.assign(state,{grid:state.job.grid,uncertain:state.job.uncertain,history:state.job.history});invalidate();renderGrid();showCell(r,c);}
function showCell(r,c){if(!state.source||!state.corners)return;state.selected={r,c};$('cellDetail').hidden=false;$('cellLabel').textContent=`Table ${state.rows[r]} · ${state.times[c]}`;const a=pointAt(state.corners,c/state.times.length,r/state.rows.length),b=pointAt(state.corners,(c+1)/state.times.length,(r+1)/state.rows.length);const target=$('cellCrop');target.width=110;target.height=90;const ctx=target.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,target.width,target.height);const w=Math.max(1,b.x-a.x),h=Math.max(1,b.y-a.y),s=Math.min(target.width/w,target.height/h);ctx.drawImage(state.source,a.x,a.y,w,h,(target.width-w*s)/2,(target.height-h*s)/2,w*s,h*s);drawSource();}
function drawSource(){if(!state.source)return;const target=$('sourceCanvas');const scale=Math.min(1,1600/Math.max(state.source.width,state.source.height));target.width=Math.round(state.source.width*scale);target.height=Math.round(state.source.height*scale);const x=target.getContext('2d');x.scale(scale,scale);x.drawImage(state.source,0,0);if($('showOverlay').checked&&!state.aligning&&!state.gridWarning&&!state.alignmentDirty)drawMarkOverlay(x,state.corners,state.grid,state.uncertain);const corners=state.corners;x.lineWidth=Math.max(2,state.source.width/650);x.strokeStyle=state.gridWarning?'#b96b12':'#62a54b';x.setLineDash([10,5]);x.beginPath();corners.forEach((p,i)=>i?x.lineTo(p.x,p.y):x.moveTo(p.x,p.y));x.closePath();x.stroke();x.setLineDash([]);if(state.selected&&!state.aligning){const {r,c}=state.selected;const pts=[[c,r],[c+1,r],[c+1,r+1],[c,r+1]].map(([u,v])=>pointAt(corners,u/state.times.length,v/state.rows.length));x.strokeStyle='#dc7500';x.lineWidth=Math.max(2,state.source.width/550);x.beginPath();pts.forEach((p,i)=>i?x.lineTo(p.x,p.y):x.moveTo(p.x,p.y));x.closePath();x.stroke();}if(state.aligning){state.alignPoints.forEach((p,i)=>{x.fillStyle='#dbf284';x.beginPath();x.arc(p.x,p.y,state.source.width/70,0,2*Math.PI);x.fill();x.fillStyle='#162b28';x.font=`bold ${state.source.width/65}px sans-serif`;x.fillText(String(i+1),p.x-state.source.width/220,p.y+state.source.width/180);});}}
function marks(preparedBinary=null){if(state.gridWarning){message('Set the four table corners or use Find table again before reading X marks.',true);return;}const result=readMarks(state.source,state.corners,state.rows.length,state.times.length,+$('sensitivity').value,preparedBinary);state.gridVersion=2;state.grid=result.grid;state.uncertain=result.uncertain;state.history=[];state.selected=null;state.alignmentDirty=false;$('exportHint').textContent='Totals update automatically.';invalidate();renderGrid();drawSource();}

function renderAlignment(){
 const job=state.job;if(!job){$('gridAlert').hidden=true;return;}
 const legacy=!!state.source&&job.gridVersion!==2;
 $('gridAlert').hidden=!job.gridWarning&&!job.alignmentDirty&&!legacy;
 $('gridAlertText').textContent=job.gridWarning?'Table not located reliably. X marks will stay unread until the table is aligned. Use Find table again, or open Scan adjustments and set the four corners.':job.alignmentDirty?'Corners updated. Select Read marks again to apply them.':'This scan used the older detector. Find table again to recheck alignment and X marks; this replaces previous X corrections.';
 $('fixGridBtn').hidden=!!job.alignmentDirty;
}
function applyGridDetection(found){
 state.gridWarning=!found;state.gridVersion=2;state.alignmentDirty=false;state.selected=null;state.corners=found?.corners||defaultCorners(state.source);
 if(state.job)state.job.dateNote=(state.job.dateNote||'').replace(/ Grid not located reliably: open this scan and check its corners\./,'');
 if(found)marks(found.binary);else{state.grid=blankGrid(state.rows.length,state.times.length);state.uncertain=[];state.history=[];invalidate();renderGrid();drawSource();$('scanTools').open=true;}
 $('alignmentHint').textContent=found?'The outline follows the data cells. Check X marks against the paper.':'Select Adjust grid corners, then tap the four corners of the X cells: top left, top right, bottom right, bottom left.';
}
$('findGridBtn').addEventListener('click',async()=>{
 if(!state.source||state.busy||processing)return;setBusy(true,'Finding the printed table and reading X marks…');await pause();
 try{applyGridDetection(locateGrid(state.source,state.rows.length,state.times.length));message(state.gridWarning?'Table could not be located reliably. Set its four corners to continue.':'Table and X marks reread. Check the overlay before marking this page reviewed.',!!state.gridWarning);}
 catch(e){message(e.message,true);}finally{setBusy(false);queueDraft(state.job);}
});
$('fixGridBtn').addEventListener('click',()=>$('findGridBtn').click());

$('alignBtn').addEventListener('click',()=>{state.aligning=!state.aligning;state.alignPoints=[];$('sourceCanvas').classList.toggle('aligning',state.aligning);$('alignBtn').textContent=state.aligning?'Cancel alignment':'Adjust grid corners';$('alignmentHint').textContent=state.aligning?'Tap the TOP LEFT corner of the data cells. Exclude table numbers and time headings.':'The outline should cover only the X cells, excluding table numbers and time headings.';invalidate();drawSource();});
let pointerStart=null;
$('sourceCanvas').addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY};});
$('sourceCanvas').addEventListener('click',e=>{if(pointerStart&&Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>10)return;if(!state.source||state.busy)return;if(!state.aligning){if(!$('showOverlay').checked||state.gridWarning||state.alignmentDirty)return;const rect=e.target.getBoundingClientRect(),hit=cellAt(state.corners,{x:(e.clientX-rect.left)/rect.width*state.source.width,y:(e.clientY-rect.top)/rect.height*state.source.height},state.rows.length,state.times.length);if(hit)editCell(hit.r,hit.c);return;}const rect=e.target.getBoundingClientRect();state.alignPoints.push({x:(e.clientX-rect.left)/rect.width*state.source.width,y:(e.clientY-rect.top)/rect.height*state.source.height});if(state.alignPoints.length===4){const p=state.alignPoints;const area=Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%4];return s+a.x*b.y-b.x*a.y;},0))/2;if(area<state.source.width*state.source.height*.005||p[0].x>=p[1].x||p[3].x>=p[2].x||p[0].y>=p[3].y||p[1].y>=p[2].y){state.alignPoints=[];message('Those corners do not form a usable grid. Start at top left, then top right, bottom right, bottom left.',true);drawSource();return;}state.corners=[...p];state.alignmentDirty=true;state.gridWarning=false;state.gridVersion=2;state.aligning=false;state.selected=null;$('sourceCanvas').classList.remove('aligning');$('alignBtn').textContent='Adjust grid corners';$('alignmentHint').textContent='Corners updated. Select “Read marks again” to apply the new alignment.';$('exportHint').textContent='Read marks again to apply your adjusted grid before saving.';invalidate();message('Grid outline updated. Read marks again before reviewing.');}else $('alignmentHint').textContent=`Tap the ${['TOP LEFT','TOP RIGHT','BOTTOM RIGHT','BOTTOM LEFT'][state.alignPoints.length]} corner of the data cells.`;drawSource();});

const activeDateProxy={get date(){return state.job?.date||'';},set date(value){if(state.job)state.job.date=value;},get savedDate(){return state.job?.savedDate;},set dateSource(value){if(state.job)state.job.dateSource=value;},set dateNote(value){if(state.job)state.job.dateNote=value;},set reviewed(value){if(state.job)state.job.reviewed=value;}};
bindDateInput($('activityDate'),activeDateProxy,()=>{$('reviewed').checked=false;if(state.job)queueDraft(state.job);});
for(const [id,days] of [['dateBack',-1],['dateForward',1]])$(id).addEventListener('click',()=>{const date=shiftDate(state.job?.date,days);if(date)setDate(date,'manual','Date entered or corrected by you.');});
$('batchPrevious').addEventListener('click',()=>{batchPage--;renderBatch();$('batchPanel').scrollIntoView({block:'start'});});
$('batchNext').addEventListener('click',()=>{batchPage++;renderBatch();$('batchPanel').scrollIntoView({block:'start'});});
$('showOverlay').addEventListener('change',drawSource);
$('overlayZoom').addEventListener('input',()=>{$('sourceCanvas').style.width=`${+$('overlayZoom').value*100}%`;});
$('reviewed').addEventListener('change',()=>{saveActive();exported=false;renderCard(state.job);updateExport();});
$('reviewAll').addEventListener('change',()=>{const checked=$('reviewAll').checked;saveActive();for(const job of jobs){job.reviewed=checked&&canReview(job);queueDraft(job);}if(state.job)$('reviewed').checked=state.job.reviewed;exported=false;renderBatch();});
for(const id of ['scanFile','cameraFile'])$(id).addEventListener('change',e=>{const files=[...e.target.files];e.target.value='';addFiles(files);});
const camera=createCamera({onFinish:files=>addFiles(files),canOpen:()=>!processing&&!state.busy&&!exporting&&!draftLoading});
$('openCamera').addEventListener('click',()=>camera.open());
$('dropzone').addEventListener('dragover',e=>{e.preventDefault();$('dropzone').classList.add('drag');});
$('dropzone').addEventListener('dragleave',()=>$('dropzone').classList.remove('drag'));
$('dropzone').addEventListener('drop',e=>{e.preventDefault();$('dropzone').classList.remove('drag');addFiles([...e.dataTransfer.files]);});
$('allScans').addEventListener('click',showOverview);
$('nextReview').addEventListener('click',()=>{const job=jobs.find(j=>j.status==='ready'&&!j.reviewed);if(job)selectJob(job.id);});
$('previousScan').addEventListener('click',()=>{const ready=jobs.filter(j=>j.status==='ready'),i=ready.findIndex(j=>j.id===activeId);if(i>0)selectJob(ready[i-1].id);});
$('nextScan').addEventListener('click',()=>{const ready=jobs.filter(j=>j.status==='ready'),i=ready.findIndex(j=>j.id===activeId);if(i<ready.length-1)selectJob(ready[i+1].id);});
$('reviewNext').addEventListener('click',()=>{if(!state.job||!canReview(state.job))return;$('reviewed').checked=true;saveActive();const at=jobs.indexOf(state.job),ordered=[...jobs.slice(at+1),...jobs.slice(0,at)];const next=ordered.find(j=>j.status==='ready'&&!j.reviewed);if(next)selectJob(next.id);else showOverview();});
$('retryDate').addEventListener('click',async()=>{
 if(!state.source||!state.job)return;setBusy(true,'Reading date…');
 try{const job=state.job;saveActive();if(job.dateSource==='manual')job.dateSource='';job.source=state.source;await recognizeDate(job,progress);delete job.source;$('dateCrop').src=job.datePreview;$('ocrText').textContent=job.ocrText;setDate(job.date,job.dateSource,job.dateNote);}
 catch(e){message(e.message,true);}finally{delete state.job?.source;if(!processing)await releaseRecognition();setBusy(false);renderBatch(false);queueDraft(state.job);}
});
$('rotateBtn').addEventListener('click',async()=>{
 if(!state.source)return;setBusy(true,'Rotating scan…');
 try{const oldSource=state.source;state.source=rotate(oldSource,-90);oldSource.width=oldSource.height=1;const found=locateGrid(state.source,state.rows.length,state.times.length);applyGridDetection(found);state.job.sourceBlob=await sourceBlob(state.source);state.job.source=state.source;state.job.dateSource='';state.job.dateCropKey=null;await recognizeDate(state.job,progress);delete state.job.source;$('dateCrop').src=state.job.datePreview;$('ocrText').textContent=state.job.ocrText;setDate(state.job.date,state.job.dateSource,state.job.dateNote);}
 catch(e){message(e.message,true);}finally{delete state.job?.source;if(!processing)await releaseRecognition();setBusy(false);renderBatch(false);queueDraft(state.job);}
});
$('rescanBtn').addEventListener('click',()=>{if(!state.source)return;marks();message('Marks reread for this page. Its previous manual edits were replaced.');});
$('undoBtn').addEventListener('click',()=>{const prev=state.history.pop();if(prev){state.grid=prev.grid;state.uncertain=prev.uncertain;invalidate();renderGrid();drawSource();}});
function setLayout(rows,times){layout={rows:[...rows],times:[...times]};$('rowLabels').value=rows.join(', ');$('timeLabels').value=times.join(', ');}
$('applyLayout').addEventListener('click',()=>{const rows=$('rowLabels').value.split(',').map(s=>s.trim()).filter(Boolean),times=$('timeLabels').value.split(',').map(s=>s.trim()).filter(Boolean);if(!rows.length||rows.length>40||times.length<8||times.length>72||new Set(rows).size!==rows.length||rows.some(s=>s.length>40)||times.some(s=>s.length>20||timeMinute(s)===null)||new Set(times.map(timeMinute)).size!==times.length){message('Use 1–40 unique table labels and 8–72 time labels. Use unique times such as 11a, 1130a, or 1:30 PM.',true);return;}setLayout(rows,times);exported=false;message('Layout saved for files added next. Existing pages keep their corrections.');});
$('manualBtn').addEventListener('click',()=>{const job=newJob();Object.assign(job,{status:'ready',dateSource:'manual',dateNote:'Enter the activity date, then tap cells to add X’s.',grid:blankGrid(job.rows.length,job.times.length)});jobs.push(job);queueDraft(job);exported=false;renderBatch();selectJob(job.id);});
$('exportBtn').addEventListener('click',async()=>{
 saveActive();if($('exportBtn').disabled||!batchSummary(jobs).canExport)return;exporting=true;updateExport();progress('Saving reviewed days…',90);
 try{const saved=await library.save(jobs);if(saved){exported=true;for(const job of jobs)await persistJob(job);message(`Saved ${jobs.length} ${jobs.length===1?'day':'days'}. Open Activity to see the charts. Clear scans when finished to remove the local previews.`);}else message('Save cancelled. Your reviewed scans are still here.');}
 catch(e){message('Save failed: '+e.message,true);}finally{exporting=false;$('progressWrap').hidden=true;renderBatch();}
});
$('clearScans').addEventListener('click',()=>{if(processing||state.busy||exporting)return;if(!exported&&jobs.length&&!confirm('Clear these unsaved scans? Saved database records will be kept.'))return;state.job=null;activeId=null;jobs.splice(0);clearDrafts();batchPage=0;exported=true;showOverview();message('Scans cleared.');});
function addRecords(records,editing=false){
 if(processing||state.busy||exporting){message('Wait for the current scan or save to finish.',true);return;}
 saveActive();
 for(const record of records){
  if(editing){const existing=jobs.find(j=>j.savedDate===record.date&&j.savedOwner===record.owner);if(existing){library.show('scan');selectJob(existing.id);return;}}
  const job=newJob();Object.assign(job,{fileName:record.source_name||`Saved ${record.date}`,status:'ready',date:record.date,dateSource:record.date_source||'manual',dateNote:editing?'Saved day. Review and save to update its marks. Archive it if the date is incorrect.':'Restored backup: check the date and marks.',rows:[...record.rows],times:[...record.times],grid:record.grid.map(r=>[...r]),savedDate:editing?record.date:null,savedRevision:editing?record.revision:null,savedOwner:editing?record.owner:null});jobs.push(job);queueDraft(job);
 }
 exported=false;library.show('scan');showOverview();if(editing)selectJob(jobs.at(-1).id);
}
library=createLibrary({edit:record=>addRecords([record],true),importDays:records=>addRecords(records),changed:updateExport});
window.addEventListener('beforeunload',e=>{if(jobs.length&&!exported||camera.hasCaptures()){e.preventDefault();e.returnValue='';}});
if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js?v=20261014-1').catch(()=>{});
const gridScroller=$('activityGrid').parentElement;
function syncGridScroll(){const max=gridScroller.scrollWidth-gridScroller.clientWidth;$('gridPosition').value=max>0?Math.round(gridScroller.scrollLeft/max*1000):0;$('gridPosition').disabled=max<=0;const index=Math.max(0,Math.min(state.times.length-1,Math.round(gridScroller.scrollLeft/49)));$('scrollPosition').textContent=state.times[index]||'';}
$('gridPosition').addEventListener('input',e=>{gridScroller.scrollLeft=+e.target.value/1000*(gridScroller.scrollWidth-gridScroller.clientWidth);syncGridScroll();});
gridScroller.addEventListener('scroll',syncGridScroll,{passive:true});new ResizeObserver(syncGridScroll).observe(gridScroller);
new ResizeObserver(()=>{$('detailPanel').style.setProperty('--review-nav-height',`${$('detailNav').getBoundingClientRect().height+8}px`);}).observe($('detailNav'));
setLayout(layout.rows,layout.times);updateExport();

$('resumeQueue').addEventListener('click',processQueue);
(async()=>{try{const recovered=await drafts.load();if(recovered.length){jobs.push(...recovered);nextId=Math.max(...jobs.map(j=>j.id))+1;library.show('scan');showOverview();message(`Restored ${jobs.length} scans from this device. Your corrections are kept. ${jobs.some(j=>j.status==='queued')?'Tap Resume reading to finish the remaining pages.':''}`);$('draftStatus').textContent='Local draft restored';}}catch(e){draftFailed=true;$('draftStatus').textContent='Local drafts are unavailable in this browser.';}finally{draftLoading=false;updateExport();}})();

$('pauseQueue').addEventListener('click',()=>{pauseReading=true;$('pauseQueue').disabled=true;message('Finishing the current page before pausing.');});
