import './compatibility.js?v=20261023-2';
import {DEFAULT_ROWS,DEFAULT_TIMES,blankGrid,totals,isISODate,weekday} from './core.js?v=20261023-2';
import {canvas,rotate,locateGrid,defaultCorners,readMarks,pointAt} from './vision.js?v=20261023-2';
import {recognizeDate,releaseRecognition} from './recognition.js?v=20261023-2';
import {createLibrary} from './library.js?v=20261023-2';
import {batchSummary,canReview,changeDate,toggleMark,saveEditorChanges,reviewSequence,adjacentReview,acceptReview,submitReviewed} from './batch.js?v=20261023-2';
import {createDraftStore} from './drafts.js?v=20261023-2';
import {REVIEW_PAGE_SIZE,reviewPage,displayDate,enteredDate,cellAt,drawMarkOverlay} from './review.js?v=20261023-2';
import {createCamera} from './camera.js?v=20261023-2';
import {createImportQueue} from './import-queue.js?v=20261023-2';
import {refreshDatePreview} from './date-crop.js?v=20261023-2';
const $=id=>document.getElementById(id);
const jobs=[];
let nextId=1,processing=false,exporting=false,exported=false,activeId=null,selectionToken=0;
let library,batchPage=0,draftLoading=true,pauseReading=false,pendingSelection=null;
let importQueue;
const drafts=createDraftStore(),draftTimers=new Map();let draftFailed=false;
function queueDraft(job){if(!job?.id)return;clearTimeout(draftTimers.get(job.id));$('draftStatus').textContent='Saving local draft…';draftTimers.set(job.id,setTimeout(()=>{draftTimers.delete(job.id);persistJob(job);},150));}
async function persistJob(job){try{await drafts.save(job);$('draftStatus').textContent=draftFailed?'Some draft changes could not be saved. Keep this page open.':'Draft saved on this device';return true;}catch(e){draftFailed=true;$('draftStatus').textContent='Local draft could not be saved. Keep this page open until you save the reviewed days.';return false;}}
function removeDraft(id){clearTimeout(draftTimers.get(id));draftTimers.delete(id);drafts.remove(id).catch(()=>{$('draftStatus').textContent='Could not remove this local draft.';});}
let layout={rows:[...DEFAULT_ROWS],times:[...DEFAULT_TIMES]};
const state={...layout,grid:null,uncertain:[],source:null,corners:null,busy:false,history:[],aligning:false,alignmentDirty:false,alignPoints:[],dateSource:'',selected:null,job:null};
const pause=()=>new Promise(r=>setTimeout(r,0));
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
function progress(text,value=50){$('progressWrap').hidden=false;$('progressText').textContent=text;$('progress').value=value;$('detailProgress').textContent=text;$('detailProgress').hidden=false;}
function setBusy(on,text='Reading this page…',value=50){state.busy=on;if(on)progress(text,value);else if(!processing&&!exporting){$('progressWrap').hidden=true;$('detailProgress').hidden=true;}updateExport();}
function saveActive(){
 if(!state.job)return;
 saveEditorChanges(state.job,{...state,sensitivity:+$('sensitivity').value,reviewed:state.job.reviewed});queueDraft(state.job);
}
function renderActiveDate(){
 if(!state.job)return;
 const {date,dateSource,dateNote}=state.job;
 if(document.activeElement!==$('activityDate'))$('activityDate').value=displayDate(date);
 state.dateSource=dateSource;$('dateNote').textContent=dateNote||'';
 $('dateNote').classList.toggle('fallback',['suggestion'].includes(dateSource));$('weekday').textContent=weekday(date)||'—';
 $('ocrText').textContent=`App version: 20261023-2\nCurrent activity date: ${date||'(empty)'} (${dateSource||'not selected'})\n\nLast recognition attempt:\n${state.job.ocrText||'No date read yet.'}`;
}
function updateExport(){
 renderActiveDate();
 renderAlignment();const summary=batchSummary(jobs),locked=state.busy||exporting||draftLoading;
 $('exportBtn').disabled=processing||locked||state.aligning||!summary.canExport||!library?.signedIn();
 $('exportBtn').textContent=jobs.length?`Submit ${jobs.length} ${jobs.length===1?'scan':'scans'}`:'Submit scans';
 $('exportHint').textContent=summary.total?`${summary.reviewed} of ${summary.total} pages reviewed${summary.pending?' · '+summary.pending+' still reading':''}${summary.failed?' · remove or retry '+summary.failed+' failed '+(summary.failed===1?'page':'pages'):''}. ${library?.signedIn()?'':'Sign in to save.'}`:'Add scans to begin.';
 $('scanFile').disabled=false;
 $('openCamera').disabled=processing||locked||!!importQueue?.count();
 for(const id of ['rotateBtn','rescanBtn','findGridBtn','alignBtn','sensitivity','activityDate','undoBtn','reviewNext','showOverlay','overlayZoom'])$(id).disabled=locked||!state.job||state.job.status!=='ready';
 $('activityDate').disabled=locked||!state.job||!!state.job.savedDate;
 $('batchPrevious').disabled=locked||batchPage===0;$('batchNext').disabled=locked||batchPage>=Math.ceil(jobs.length/REVIEW_PAGE_SIZE)-1;
 $('undoBtn').disabled=locked||!state.history.length||!!state.gridWarning||state.alignmentDirty;$('rescanBtn').disabled=locked||!state.source||!!state.gridWarning;
 $('reviewNext').disabled=locked||state.aligning||!state.job||!canReview(state.job);
 $('findGridBtn').disabled=locked||processing||!state.source;
 const sequence=reviewSequence(jobs,activeId);$('previousScan').disabled=$('nextScan').disabled=locked||sequence.length<2;
 if(state.job)$('detailTitle').textContent=`${sequence.findIndex(j=>j.id===activeId)+1} of ${sequence.length} scans`;
 document.querySelectorAll('#activityGrid .cell-toggle').forEach(b=>b.disabled=locked||!!state.gridWarning||state.alignmentDirty);
 for(const card of $('batchCards').children){const job=jobs.find(j=>String(j.id)===card.dataset.jobId);if(!job)continue;for(const control of card.querySelectorAll('button,input')){const label=control.getAttribute('aria-label')||'';if(control.classList.contains('cell-toggle'))control.disabled=locked||!!job.gridWarning||job.alignmentDirty;else if(label.startsWith('Remove ')||control.dataset.retry==='true')control.disabled=locked||processing;else control.disabled=locked||control.dataset.pending==='true'||(control.classList.contains('quick-date')&&(job.status!=='ready'||!!job.savedDate));}}
 $('pauseQueue').hidden=!processing;$('pauseQueue').disabled=locked||pauseReading;
 $('resumeQueue').hidden=!jobs.some(j=>j.status==='queued')||processing;$('resumeQueue').disabled=locked;
 $('nextReview').disabled=locked||!jobs.some(j=>j.status==='ready'&&!j.reviewed);
 $('batchCount').textContent=jobs.length?`(${jobs.length})`:'';
 $('batchSummary').textContent=[summary.pending?`${summary.pending} reading`:'',summary.failed?`${summary.failed} could not be read. Tap their images to retry.`:''].filter(Boolean).join(' · ');
 const dates=jobs.filter(j=>isISODate(j.date)).map(j=>j.date),duplicates=dates.length-new Set(dates).size;
 const needsAlignment=jobs.filter(j=>j.status==='ready'&&(j.gridWarning||j.alignmentDirty)).length;if(needsAlignment)$('batchSummary').textContent+=` · ${needsAlignment} need table alignment`;if(duplicates)$('batchSummary').textContent+=' · Correct or remove repeated dates before saving.';
 $('batchSummary').textContent=$('batchSummary').textContent.replace(/^ · /,'');$('batchSummary').hidden=!$('batchSummary').textContent;
 $('exportBtn').closest('.export-bar').hidden=!jobs.length;
 importQueue?.resume();
}
function invalidate(){
 if(state.job)state.job.reviewed=false;exported=false;saveActive();
 if(state.job){state.job.reviewed=false;renderCard(state.job);}
 updateExport();
}
function setDate(date,source,note){if(!state.job)return;Object.assign(state.job,{date:date||'',dateSource:source,dateNote:note});renderActiveDate();invalidate();}
function refreshActive(){saveActive();if(state.job)renderCard(state.job);updateExport();}
function jobLabel(job){return job.fileName+(job.pageCount>1?` · page ${job.page}/${job.pageCount}`:'');}
function newJob(file=null){const id=nextId++;return {id,order:id,file,fileName:file?.name||'Blank sheet',page:1,pageCount:1,status:'queued',rows:[...layout.rows],times:[...layout.times],grid:null,uncertain:[],history:[],reviewed:false,date:'',dateSource:'',dateNote:'',alignmentDirty:false,sensitivity:50,sourceBlob:null};}
function makeThumbnail(source){
 const scale=Math.min(1,500/source.width),small=canvas(Math.max(1,Math.round(source.width*scale)),Math.max(1,Math.round(source.height*scale)));
 try{small.getContext('2d').drawImage(source,0,0,small.width,small.height);return small.toDataURL('image/jpeg',.8);}finally{small.width=small.height=1;}
}
let thumbnailQueue=Promise.resolve();
function loadThumbnail(job,image){
 if(job.thumbnail){image.src=job.thumbnail;return;}
 thumbnailQueue=thumbnailQueue.then(async()=>{
  if(!image.isConnected||!jobs.includes(job))return;
  const blob=job.sourceBlob||(await drafts.images(job.id)).sourceBlob;
  if(!blob)return;const source=await decodeBlob(blob);
  try{job.thumbnail=makeThumbnail(source);if(image.isConnected)image.src=job.thumbnail;if(jobs.includes(job))queueDraft(job);}finally{source.width=source.height=1;}
 }).catch(()=>{image.alt='Preview unavailable. Open scan to review.';});
}
function renderCard(job){
 if($('batchPanel').hidden||!reviewPage(jobs,batchPage).items.includes(job))return;
 let card=document.querySelector(`[data-job-id="${job.id}"]`);if(!card){card=el('article','batch-item');card.dataset.jobId=job.id;$('batchCards').append(card);}
 card.classList.toggle('is-reviewed',!!job.reviewed);card.replaceChildren();
 const photo=el('button','scan-thumbnail');photo.type='button';photo.setAttribute('aria-label',`Open ${jobLabel(job)}`);
 if(job.status==='ready'){
  if(job.thumbnail||job.sourceBlob||job.hasSource){const image=el('img');image.alt=jobLabel(job);photo.append(image);loadThumbnail(job,image);}
  else photo.append(el('span','scan-placeholder','Saved table'));
  photo.addEventListener('click',()=>selectJob(job.id));
 }else if(job.status==='error'){
  photo.append(el('span','scan-placeholder','Unable to read. Tap to retry.'));photo.title=job.error;photo.dataset.retry='true';
  photo.addEventListener('click',()=>{if(processing||state.busy||exporting)return;job.status='queued';job.error='';processQueue();});
 }else{photo.append(el('span','scan-placeholder',job.status==='processing'?'Reading…':'Waiting to read…'));photo.dataset.pending='true';photo.disabled=true;}
 card.append(photo);
 const fields=el('div','scan-caption'),date=el('input','quick-date');date.setAttribute('aria-label',`Date for ${jobLabel(job)}`);
 const accepted=el('span','accepted-mark','✓');accepted.setAttribute('role','img');accepted.setAttribute('aria-label','Reviewed and accepted');accepted.hidden=!job.reviewed;
 bindDateInput(date,job,()=>{accepted.hidden=true;card.classList.remove('is-reviewed');});date.placeholder='Date';date.disabled=job.status!=='ready'||!!job.savedDate;
 const remove=el('button','text-button','Remove');remove.setAttribute('aria-label',`Remove ${jobLabel(job)}`);remove.disabled=processing||state.busy||exporting;remove.addEventListener('click',()=>removeJob(job));
 fields.append(date,accepted,remove);card.append(fields);
}
function renderBatch(force=true){
 if($('batchPanel').hidden){$('batchCards').replaceChildren();updateExport();return;}
 const page=reviewPage(jobs,batchPage);batchPage=page.page;
 const valid=new Set(page.items.map(j=>String(j.id)));for(const card of [...$('batchCards').children])if(!valid.has(card.dataset.jobId))card.remove();
 page.items.forEach((j,i)=>{let card=document.querySelector(`[data-job-id="${j.id}"]`);if(force||!card){renderCard(j);card=document.querySelector(`[data-job-id="${j.id}"]`);}if($('batchCards').children[i]!==card)$('batchCards').insertBefore(card,$('batchCards').children[i]||null);});
 $('batchPageLabel').textContent=jobs.length?`${batchPage*REVIEW_PAGE_SIZE+1}–${Math.min(jobs.length,(batchPage+1)*REVIEW_PAGE_SIZE)} of ${jobs.length}`:'0 scans';updateExport();
}
function releaseSource(){if(state.source)state.source.width=state.source.height=1;state.source=null;for(const id of ['sourceCanvas','cellCrop'])$(id).width=$(id).height=1;}
function showOverview(){if(state.busy||exporting)return;$('scanView').classList.remove('focused-review');saveActive();selectionToken++;state.aligning=false;state.alignPoints=[];releaseSource();state.job=null;activeId=null;$('activityGrid').replaceChildren();$('detailPanel').hidden=true;$('batchPanel').hidden=!jobs.length;renderBatch();if(!jobs.length){$('reviewContent').hidden=true;$('emptyState').hidden=false;$('sourceCard').hidden=true;$('detailNav').hidden=true;$('detailReview').hidden=true;$('dateCropWrap').hidden=true;$('activityDate').value='';$('weekday').textContent='—';$('grandTotal').textContent='—';}}
function bindDateInput(input,job,updated=()=>{}){
 input.type='text';input.inputMode='numeric';input.placeholder='M/D/YY';input.maxLength=10;input.autocomplete='off';input.enterKeyHint='next';input.value=displayDate(job.date);input.disabled=!!job.savedDate;
 input.addEventListener('focus',()=>input.select());
 input.addEventListener('input',()=>{if(job.savedDate)return;const date=enteredDate(input.value);changeDate(job,date||'');input.setAttribute('aria-invalid',!date&&!!input.value);exported=false;updated();if(state.job===job){renderActiveDate();}queueDraft(job);updateExport();});
 input.addEventListener('blur',()=>{if(job.date)input.value=displayDate(job.date);});
 input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(!job.date)return;const dates=[...$('batchCards').querySelectorAll('.quick-date')],index=dates.indexOf(input);if(index>=0&&dates[index+1])dates[index+1].focus();else if(index>=0&&batchPage<Math.ceil(jobs.length/REVIEW_PAGE_SIZE)-1){batchPage++;renderBatch();$('batchCards').querySelector('.quick-date')?.focus();}else input.blur();}});
}
async function decodeBlob(blob){const url=URL.createObjectURL(blob),img=new Image();try{await new Promise((ok,no)=>{img.onload=ok;img.onerror=()=>no(Error('This image could not be opened. Use JPEG, PNG, WebP or PDF.'));img.src=url;});const scale=Math.min(1,2200/Math.max(img.naturalWidth,img.naturalHeight)),c=canvas(Math.round(img.naturalWidth*scale),Math.round(img.naturalHeight*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c;}finally{img.src='';URL.revokeObjectURL(url);}}
const sourceBlob=source=>new Promise((resolve,reject)=>source.toBlob(b=>b?resolve(b):reject(Error('Unable to keep the page preview.')),'image/jpeg',.95));
async function selectJob(id){
 if(state.busy||exporting)return;if(processing){pauseReading=true;pendingSelection=id;message('Finishing the current page, then opening your scan. Remaining pages will wait.');return;}saveActive();const job=jobs.find(j=>j.id===id);if(!job||job.status!=='ready')return;
 const alreadyOpen=!!state.job,pan=$('sourceCanvas').parentElement,scroll={x:pan.scrollLeft/Math.max(1,pan.scrollWidth),y:pan.scrollTop/Math.max(1,pan.scrollHeight)};const token=++selectionToken;setBusy(true,'Opening scan…');releaseSource();$('activityGrid').replaceChildren();$('batchCards').replaceChildren();$('batchPanel').hidden=true;await pause();
 try{const images=job.sourceBlob||!job.hasSource?{}:await drafts.images(job.id);if(images.dateCropBlob)job.dateCropBlob=images.dateCropBlob;const blob=job.sourceBlob||images.sourceBlob;const source=blob?await decodeBlob(blob):null;if(token!==selectionToken){if(source)source.width=source.height=1;return;}
  if(refreshDatePreview(job,source))queueDraft(job);
  activeId=id;Object.assign(state,{gridWarning:false,gridVersion:0,alignmentDirty:false},job,{job,source,aligning:false,alignPoints:[],selected:null});state.busy=true;
  $('batchPanel').hidden=true;$('detailPanel').hidden=false;$('detailNav').hidden=false;$('detailReview').hidden=false;
  $('sourceName').textContent=`${jobs.length} ${jobs.length===1?'page':'pages'} in batch`;
  $('activityDate').value=displayDate(job.date);$('weekday').textContent=weekday(job.date)||'—';$('dateNote').textContent=job.dateNote;$('dateNote').classList.toggle('fallback',['metadata','suggestion'].includes(job.dateSource));$('sensitivity').value=job.sensitivity;
  $('dateCropWrap').hidden=!job.datePreview;if(job.datePreview)$('dateCrop').src=job.datePreview;
  $('ocrText').textContent=job.ocrText||'';$('cellDetail').hidden=true;$('sourceCard').hidden=!source;$('alignBtn').textContent='Adjust grid corners';$('sourceCanvas').classList.remove('aligning');$('alignmentHint').textContent=job.alignmentDirty?'Read marks again to apply your adjusted grid.':'The outline should cover only the X cells, excluding table numbers and time headings.';
  $('scanView').classList.add('focused-review');$('scanTools').open=!!job.gridWarning||job.alignmentDirty;$('gridDetails').open=!source;if(!alreadyOpen){$('overlayZoom').value='1';$('showOverlay').checked=true;}$('sourceCanvas').style.width=`${+$('overlayZoom').value*100}%`;renderGrid();if(source)drawSource();message('');requestAnimationFrame(()=>{pan.scrollLeft=alreadyOpen?scroll.x*pan.scrollWidth:0;pan.scrollTop=alreadyOpen?scroll.y*pan.scrollHeight:0;});$('detailNav').scrollIntoView({block:'start'});
 }catch(e){message(e.message,true);$('scanView').classList.remove('focused-review');$('batchPanel').hidden=false;}finally{setBusy(false);renderBatch(false);}
}
function removeJob(job){if(processing||state.busy||exporting)return;if(activeId===job.id){state.job=null;activeId=null;}jobs.splice(jobs.indexOf(job),1);removeDraft(job.id);exported=false;showOverview();$('sourceName').textContent=`${jobs.length} pages in batch`;}
importQueue=createImportQueue({
 blocked:()=>processing||state.busy||exporting||draftLoading,
 pending:n=>{$('importStatus').textContent=n?`${n} selected ${n===1?'file':'files'} waiting to be added. Keep this page open.`:'';},
 consume:async files=>{
  saveActive();const added=files.map(file=>newJob(file));jobs.push(...added);files.length=0;
  setBusy(true,`Saving ${added.length} selected files on this device…`);await pause();
  try{for(let i=0;i<added.length;i++){
   progress(`Saving file ${i+1} of ${added.length} on this device…`,(i+1)/added.length*100);
   // The queue loads one original at a time from IndexedDB. Retain the File
   // only when storage failed, so a large selection does not pin every blob.
   if(await persistJob(added[i]))added[i].file=null;
  }}finally{setBusy(false);}
  exported=false;library.show('scan');$('sourceName').textContent=`${jobs.length} scans queued`;showOverview();
 },
 idle:()=>{updateExport();if(!pauseReading&&jobs.some(j=>j.status==='queued'))processQueue();},
 error:e=>message(`Could not finish adding this selection: ${e.message}. Your existing scans are kept.`,true)
});
function addFiles(files){importQueue.add(files);}
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
    if(pdfFile!==job.file){if(pdf)await pdf.destroy();pdf=null;pdfFile=null;const pdfjs=await import('./vendor/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('./pdf-worker.js?v=20261023-2',location.href).href;pdf=await pdfjs.getDocument({data:new Uint8Array(await job.file.arrayBuffer()),isEvalSupported:false}).promise;pdfFile=job.file;}
    if(!job.expanded){job.expanded=true;job.pageCount=pdf.numPages;const rest=[];for(let p=2;p<=pdf.numPages;p++)rest.push({...newJob(job.file),order:(job.order??job.id)+(p-1)/pdf.numPages,page:p,pageCount:pdf.numPages,expanded:true,rows:[...job.rows],times:[...job.times]});jobs.splice(index+1,0,...rest);for(const pageJob of [job,...rest])await persistJob(pageJob);renderBatch(false);}
    const page=await pdf.getPage(job.page),base=page.getViewport({scale:1}),viewport=page.getViewport({scale:2200/Math.max(base.width,base.height)});source=canvas(Math.ceil(viewport.width),Math.ceil(viewport.height));await page.render({canvasContext:source.getContext('2d'),viewport}).promise;try{job.pdfText=(await page.getTextContent()).items.map(t=>t.str).join(' ');}catch(e){job.pdfText='';job.pdfTextError=e.message;}page.cleanup();
   }else{source=await decodeBlob(job.file);}
   if(source.height>source.width*1.05){const old=source;source=rotate(old,-90);old.width=old.height=1;}
   const found=locateGrid(source,job.rows.length,job.times.length);job.corners=found?.corners||defaultCorners(source);job.gridWarning=!found;job.gridVersion=2;
   const marks=found?readMarks(source,job.corners,job.rows.length,job.times.length,job.sensitivity,found.binary):{grid:blankGrid(job.rows.length,job.times.length),uncertain:[]};if(found)delete found.binary;Object.assign(job,{grid:marks.grid,uncertain:marks.uncertain});
   job.thumbnail=makeThumbnail(source);job.source=source;await recognizeDate(job,text=>progress(`${index+1} of ${jobs.length}: ${text}`,index/jobs.length*100));if(job.pdfTextError)job.ocrText+='\nPDF text layer unavailable; date read from the image: '+job.pdfTextError;job.sourceBlob=await sourceBlob(source);job.hasSource=true;delete job.source;job.status='ready';job.file=null;

  }catch(e){delete job.source;job.status='error';job.error=e.message||'Unable to read this page.';}finally{if(source)source.width=source.height=1;}
  if(await persistJob(job)){if(job.status==='ready'){job.sourceBlob=null;job.dateCropBlob=null;}}
  renderCard(job);updateExport();await pause();
 }}finally{if(pdf)await pdf.destroy();await releaseRecognition();processing=false;$('progressWrap').hidden=true;$('detailProgress').hidden=true;$('sourceName').textContent=`${jobs.length} ${jobs.length===1?'page':'pages'} in batch`;renderBatch(false);const summary=batchSummary(jobs);if(pendingSelection!==null){const id=pendingSelection;pendingSelection=null;selectJob(id);}else message(summary.failed?`Finished with ${summary.failed} failed page(s). Retry or remove them before saving.`:summary.pending?'Reading paused. Review ready pages or tap Resume reading.':`${jobs.length} page(s) ready. Check the dates and marks, then save the reviewed days.`,!!summary.failed);}
}

function renderGrid(){const container=$('activityGrid');container.replaceChildren();if(!state.grid)return;const t=totals(state.grid);$('grandTotal').textContent=t.grand;const head=document.createElement('thead'),tr=document.createElement('tr');['Table',...state.times,'Total'].forEach((v,i)=>{const th=document.createElement('th');th.textContent=v;th.scope='col';if(i===state.times.length+1)th.className='total';tr.append(th);});head.append(tr);container.append(head);const body=document.createElement('tbody');state.rows.forEach((v,r)=>{const tr=document.createElement('tr'),th=document.createElement('th');th.textContent=v;th.scope='row';tr.append(th);state.times.forEach((time,c)=>{const td=document.createElement('td'),b=document.createElement('button');b.type='button';b.className='cell-toggle'+(state.grid[r][c]?' marked':'')+(state.uncertain.includes(`${r}:${c}`)?' uncertain':'');b.textContent=state.grid[r][c]?'X':'';b.setAttribute('aria-label',`Table ${v}, ${time}: ${state.grid[r][c]?'X':'blank'}`);b.setAttribute('aria-pressed',state.grid[r][c]);b.dataset.row=r;b.dataset.col=c;b.addEventListener('click',()=>{editCell(r,c);container.querySelector(`[data-row="${r}"][data-col="${c}"]`)?.focus({preventScroll:true});});b.addEventListener('focus',()=>showCell(r,c));td.append(b);tr.append(td);});const td=document.createElement('td');td.className='total';td.textContent=t.rows[r];tr.append(td);body.append(tr);});container.append(body);const foot=document.createElement('tfoot'),fr=document.createElement('tr');['SCORE',...t.cols,t.grand].forEach((v,i)=>{const th=document.createElement('th');th.textContent=v;if(i===state.times.length+1)th.className='total';fr.append(th);});foot.append(fr);container.append(foot);$('gridSummary').textContent=`${state.rows.length} tables · ${state.times.length} time slots · ${t.grand} X’s`;$('uncertainNote').textContent=state.uncertain.length?`${state.uncertain.length} borderline cells underlined in amber`:'Check all marks against the original';$('undoBtn').disabled=!state.history.length||state.busy;$('emptyState').hidden=true;$('reviewContent').hidden=false;$('reviewStatus').textContent=state.gridWarning?'Align table first':state.alignmentDirty?'Read X marks again':'Ready to review';$('reviewStatus').classList.add('ready');updateExport();requestAnimationFrame(syncGridScroll);}
function editCell(r,c){if(state.gridWarning||state.alignmentDirty)return;saveActive();toggleMark(state.job,r,c);Object.assign(state,{grid:state.job.grid,uncertain:state.job.uncertain,history:state.job.history});invalidate();renderGrid();showCell(r,c);}
function showCell(r,c){if(!state.source||!state.corners)return;state.selected={r,c};$('cellDetail').hidden=false;$('cellLabel').textContent=`Table ${state.rows[r]} · ${state.times[c]}`;const a=pointAt(state.corners,c/state.times.length,r/state.rows.length),b=pointAt(state.corners,(c+1)/state.times.length,(r+1)/state.rows.length);const target=$('cellCrop');target.width=110;target.height=90;const ctx=target.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,target.width,target.height);const w=Math.max(1,b.x-a.x),h=Math.max(1,b.y-a.y),s=Math.min(target.width/w,target.height/h);ctx.drawImage(state.source,a.x,a.y,w,h,(target.width-w*s)/2,(target.height-h*s)/2,w*s,h*s);drawSource();}
function drawSource(){if(!state.source)return;const target=$('sourceCanvas');const scale=Math.min(1,1600/Math.max(state.source.width,state.source.height));target.width=Math.round(state.source.width*scale);target.height=Math.round(state.source.height*scale);const x=target.getContext('2d');x.scale(scale,scale);x.drawImage(state.source,0,0);if($('showOverlay').checked&&!state.aligning&&!state.gridWarning&&!state.alignmentDirty)drawMarkOverlay(x,state.corners,state.grid,state.uncertain);const corners=state.corners;x.lineWidth=Math.max(2,state.source.width/650);x.strokeStyle=state.gridWarning?'#b96b12':'#62a54b';x.setLineDash([10,5]);x.beginPath();corners.forEach((p,i)=>i?x.lineTo(p.x,p.y):x.moveTo(p.x,p.y));x.closePath();x.stroke();x.setLineDash([]);if(state.selected&&!state.aligning){const {r,c}=state.selected;const pts=[[c,r],[c+1,r],[c+1,r+1],[c,r+1]].map(([u,v])=>pointAt(corners,u/state.times.length,v/state.rows.length));x.strokeStyle='#dc7500';x.lineWidth=Math.max(2,state.source.width/550);x.beginPath();pts.forEach((p,i)=>i?x.lineTo(p.x,p.y):x.moveTo(p.x,p.y));x.closePath();x.stroke();}if(state.aligning){state.alignPoints.forEach((p,i)=>{x.fillStyle='#dbf284';x.beginPath();x.arc(p.x,p.y,state.source.width/70,0,2*Math.PI);x.fill();x.fillStyle='#162b28';x.font=`bold ${state.source.width/65}px sans-serif`;x.fillText(String(i+1),p.x-state.source.width/220,p.y+state.source.width/180);});}}
function marks(preparedBinary=null){if(state.gridWarning){message('Set the four table corners or use Find table before reading X marks.',true);return;}const result=readMarks(state.source,state.corners,state.rows.length,state.times.length,+$('sensitivity').value,preparedBinary);state.gridVersion=2;state.grid=result.grid;state.uncertain=result.uncertain;state.history=[];state.selected=null;state.alignmentDirty=false;$('exportHint').textContent='Totals update automatically.';invalidate();renderGrid();drawSource();}

function renderAlignment(){
 const job=state.job;if(!job){$('gridAlert').hidden=true;return;}
 const legacy=!!state.source&&job.gridVersion!==2;
 $('gridAlert').hidden=!job.gridWarning&&!job.alignmentDirty&&!legacy;
 $('gridAlertText').textContent=job.gridWarning?'Table not located reliably. X marks will stay unread until the table is aligned. Use Find table, or open Scan adjustments and set the four corners.':job.alignmentDirty?'Corners updated. Select Read marks again to apply them.':'This scan used the older detector. Find table to recheck alignment and X marks; this replaces previous X corrections.';
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

$('alignBtn').addEventListener('click',()=>{state.aligning=!state.aligning;state.alignPoints=[];$('sourceCanvas').classList.toggle('aligning',state.aligning);$('alignBtn').textContent=state.aligning?'Cancel alignment':'Adjust grid corners';$('alignmentHint').textContent=state.aligning?'Tap the TOP LEFT corner of the data cells. Exclude table numbers and time headings.':'The outline should cover only the X cells, excluding table numbers and time headings.';invalidate();drawSource();});
let pointerStart=null;
$('sourceCanvas').addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY};});
$('sourceCanvas').addEventListener('click',e=>{if(pointerStart&&Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>10)return;if(!state.source||state.busy)return;if(!state.aligning){if(!$('showOverlay').checked||state.gridWarning||state.alignmentDirty)return;const rect=e.target.getBoundingClientRect(),hit=cellAt(state.corners,{x:(e.clientX-rect.left)/rect.width*state.source.width,y:(e.clientY-rect.top)/rect.height*state.source.height},state.rows.length,state.times.length);if(hit)editCell(hit.r,hit.c);return;}const rect=e.target.getBoundingClientRect();state.alignPoints.push({x:(e.clientX-rect.left)/rect.width*state.source.width,y:(e.clientY-rect.top)/rect.height*state.source.height});if(state.alignPoints.length===4){const p=state.alignPoints;const area=Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%4];return s+a.x*b.y-b.x*a.y;},0))/2;if(area<state.source.width*state.source.height*.005||p[0].x>=p[1].x||p[3].x>=p[2].x||p[0].y>=p[3].y||p[1].y>=p[2].y){state.alignPoints=[];message('Those corners do not form a usable grid. Start at top left, then top right, bottom right, bottom left.',true);drawSource();return;}state.corners=[...p];state.alignmentDirty=true;state.gridWarning=false;state.gridVersion=2;state.aligning=false;state.selected=null;$('sourceCanvas').classList.remove('aligning');$('alignBtn').textContent='Adjust grid corners';$('alignmentHint').textContent='Corners updated. Select “Read marks again” to apply the new alignment.';$('exportHint').textContent='Read marks again to apply your adjusted grid before saving.';invalidate();message('Grid outline updated. Read marks again before reviewing.');}else $('alignmentHint').textContent=`Tap the ${['TOP LEFT','TOP RIGHT','BOTTOM RIGHT','BOTTOM LEFT'][state.alignPoints.length]} corner of the data cells.`;drawSource();});

const activeDateProxy={get date(){return state.job?.date||'';},set date(value){if(state.job)state.job.date=value;},get savedDate(){return state.job?.savedDate;},set dateSource(value){if(state.job)state.job.dateSource=value;},set dateNote(value){if(state.job)state.job.dateNote=value;},set reviewed(value){if(state.job)state.job.reviewed=value;}};
bindDateInput($('activityDate'),activeDateProxy,()=>{if(state.job)queueDraft(state.job);});
$('batchPrevious').addEventListener('click',()=>{batchPage--;renderBatch();$('batchPanel').scrollIntoView({block:'start'});});
$('batchNext').addEventListener('click',()=>{batchPage++;renderBatch();$('batchPanel').scrollIntoView({block:'start'});});
$('showOverlay').addEventListener('change',drawSource);
$('overlayZoom').addEventListener('input',()=>{$('sourceCanvas').style.width=`${+$('overlayZoom').value*100}%`;});
for(const id of ['scanFile'])$(id).addEventListener('change',e=>{const files=[...e.target.files];e.target.value='';addFiles(files);});
const camera=createCamera({onFinish:files=>addFiles(files),canOpen:()=>!processing&&!state.busy&&!exporting&&!draftLoading});
$('openCamera').addEventListener('click',()=>camera.open());
$('dropzone').addEventListener('dragover',e=>{e.preventDefault();$('dropzone').classList.add('drag');});
$('dropzone').addEventListener('dragleave',()=>$('dropzone').classList.remove('drag'));
$('dropzone').addEventListener('drop',e=>{e.preventDefault();$('dropzone').classList.remove('drag');addFiles([...e.dataTransfer.files]);});
$('allScans').addEventListener('click',showOverview);
$('nextReview').addEventListener('click',()=>{const job=jobs.find(j=>j.status==='ready'&&!j.reviewed);if(job)selectJob(job.id);});
for(const [id,direction] of [['previousScan',-1],['nextScan',1]])$(id).addEventListener('click',()=>{const next=adjacentReview(jobs,activeId,direction);if(next)selectJob(next.id);});
$('reviewNext').addEventListener('click',()=>{
 if(!state.job||!canReview(state.job))return;
 saveActive();const job=state.job,next=acceptReview(jobs,job);queueDraft(job);exported=false;
 if(next)selectJob(next.id);else{showOverview();message('Review complete. Submit the scans when you are ready.');}
});
$('rotateBtn').addEventListener('click',async()=>{
 if(!state.source)return;setBusy(true,'Rotating scan…');
 try{const oldSource=state.source;state.source=rotate(oldSource,-90);oldSource.width=oldSource.height=1;const found=locateGrid(state.source,state.rows.length,state.times.length);applyGridDetection(found);state.job.thumbnail=makeThumbnail(state.source);state.job.sourceBlob=await sourceBlob(state.source);state.job.source=state.source;state.job.dateSource='';state.job.dateCropKey=null;state.job.datePreviewKey=null;await recognizeDate(state.job,progress);delete state.job.source;$('dateCrop').src=state.job.datePreview;$('ocrText').textContent=state.job.ocrText;setDate(state.job.date,state.job.dateSource,state.job.dateNote);}
 catch(e){message(e.message,true);}finally{delete state.job?.source;if(!processing)await releaseRecognition();setBusy(false);renderBatch(false);queueDraft(state.job);}
});
$('rescanBtn').addEventListener('click',()=>{if(!state.source)return;marks();message('Marks reread for this page. Its previous manual edits were replaced.');});
$('undoBtn').addEventListener('click',()=>{const prev=state.history.pop();if(prev){state.grid=prev.grid;state.uncertain=prev.uncertain;invalidate();renderGrid();drawSource();}});
$('exportBtn').addEventListener('click',async()=>{
 saveActive();if($('exportBtn').disabled||!batchSummary(jobs).canExport)return;exporting=true;updateExport();progress('Saving reviewed days…',90);let completed=false;
 try{
  const result=await submitReviewed(jobs,{save:batch=>library.save(batch),forget:async id=>{clearTimeout(draftTimers.get(id));draftTimers.delete(id);await drafts.remove(id);}});
  if(result.count){completed=true;state.job=null;activeId=null;releaseSource();batchPage=0;exported=!jobs.length;$('sourceName').textContent=jobs.length?`${jobs.length} scans`:'';
   $('draftStatus').textContent=result.cleanupFailed?'Saved successfully, but local draft cleanup failed. Old previews may return after a reload.':'';
   message(`Saved ${result.count} ${result.count===1?'day':'days'}. The submitted scans have been cleared.`);
  }
 }catch(e){message('Save failed: '+e.message,true);}finally{exporting=false;$('progressWrap').hidden=true;if(completed)showOverview();else renderBatch();}
});
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
window.addEventListener('beforeunload',e=>{if(jobs.length&&!exported||importQueue.count()||camera.hasCaptures()){e.preventDefault();e.returnValue='';}});
if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js?v=20261023-2').catch(()=>{});
const gridScroller=$('activityGrid').parentElement;
function syncGridScroll(){const max=gridScroller.scrollWidth-gridScroller.clientWidth;$('gridPosition').value=max>0?Math.round(gridScroller.scrollLeft/max*1000):0;$('gridPosition').disabled=max<=0;const index=Math.max(0,Math.min(state.times.length-1,Math.round(gridScroller.scrollLeft/49)));$('scrollPosition').textContent=state.times[index]||'';}
$('gridPosition').addEventListener('input',e=>{gridScroller.scrollLeft=+e.target.value/1000*(gridScroller.scrollWidth-gridScroller.clientWidth);syncGridScroll();});
gridScroller.addEventListener('scroll',syncGridScroll,{passive:true});new ResizeObserver(syncGridScroll).observe(gridScroller);
new ResizeObserver(()=>{$('detailPanel').style.setProperty('--review-nav-height',`${$('detailNav').getBoundingClientRect().height+8}px`);}).observe($('detailNav'));
updateExport();

$('resumeQueue').addEventListener('click',processQueue);
(async()=>{try{const recovered=await drafts.load();if(recovered.length){jobs.push(...recovered);nextId=Math.max(...jobs.map(j=>j.id))+1;library.show('scan');showOverview();message(`Restored ${jobs.length} scans from this device. Your corrections are kept. ${jobs.some(j=>j.status==='queued')?'Tap Resume reading to finish the remaining pages.':''}`);$('draftStatus').textContent='Local draft restored';}}catch(e){draftFailed=true;$('draftStatus').textContent='Local drafts are unavailable in this browser.';}finally{draftLoading=false;updateExport();}})();

$('pauseQueue').addEventListener('click',()=>{pauseReading=true;$('pauseQueue').disabled=true;message('Finishing the current page before pausing.');});
