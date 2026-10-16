import {createCameraSession,captureVideoFrame,captureFiles} from './camera-session.js?v=20261016-2';

export function createCamera({onFinish,canOpen=()=>true,document:doc=globalThis.document,mediaDevices=globalThis.navigator?.mediaDevices}){
 const dialog=doc.createElement('dialog');dialog.className='camera-dialog';dialog.setAttribute('aria-labelledby','cameraTitle');
 dialog.innerHTML=`<div class="camera-shell">
  <header class="camera-heading"><div><h2 id="cameraTitle">Scan with camera</h2><span id="cameraCount">0 pages captured</span></div><button type="button" id="cameraClose" class="button secondary">Close</button></header>
  <p class="camera-direction">Keep the whole table and handwritten date in view. Capture, turn the page, then capture again.</p>
  <div class="camera-view"><video id="cameraVideo" autoplay muted playsinline aria-label="Live rear camera preview"></video><div id="cameraPlaceholder">Opening camera…</div><span id="cameraFlash" hidden>Captured</span></div>
  <div class="camera-feedback"><img id="cameraThumbnail" alt="Last captured page" hidden><p id="cameraStatus" role="status" aria-live="polite"></p></div>
  <div class="camera-controls"><button type="button" id="cameraUndo" class="button secondary" disabled>Undo last</button><button type="button" id="cameraCapture" class="camera-shutter" disabled>Capture</button><button type="button" id="cameraPause" class="button secondary" disabled>Pause</button></div>
  <button type="button" id="cameraFinish" class="button primary camera-finish" disabled>Finish &amp; review</button>
  <p class="camera-note">Dates and X’s are read after you finish. Keep this page open until then.</p>
 </div>`;
 doc.body.append(dialog);
 const $=id=>dialog.querySelector('#'+id),video=$('cameraVideo');
 let thumbnail=null,lastPage=null,flashTimer=null,lastStatus='closed';
 const tell=(text,error=false)=>{$('cameraStatus').textContent=text;$('cameraStatus').classList.toggle('error',error);};
 const session=createCameraSession({
  getUserMedia:constraints=>{if(!mediaDevices?.getUserMedia)throw Error('Live camera is unavailable in this browser. Close this view and use “Add files”.');return mediaDevices.getUserMedia(constraints);},
  attachStream:async stream=>{
   video.muted=true;video.srcObject=stream;let timeout;
   try{await Promise.race([video.play(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('The camera did not provide a live picture. Tap Resume to try again.')),15000);})]);}
   finally{clearTimeout(timeout);}
  },
  detachStream:()=>{video.pause();video.srcObject=null;},
  captureFrame:()=>captureVideoFrame(video,{document:doc}),
  changed:state=>{
   $('cameraCount').textContent=`${state.count} ${state.count===1?'page':'pages'} captured`;
   $('cameraCapture').disabled=state.status!=='live'||state.busy;
   $('cameraCapture').textContent=state.busy?'Capturing…':'Capture';
   $('cameraUndo').disabled=!state.count||state.busy;
   $('cameraFinish').disabled=!state.count||state.busy;
   $('cameraFinish').textContent=state.count?`Finish & review (${state.count})`:'Finish & review';
   $('cameraPause').disabled=state.status==='starting'||state.busy;
   $('cameraPause').textContent=state.status==='live'?'Pause':'Resume';
   $('cameraClose').disabled=state.busy;
   $('cameraPlaceholder').hidden=state.status==='live';
   $('cameraPlaceholder').textContent=state.status==='starting'?'Opening camera…':'Camera paused';
   if(state.status!==lastStatus){
    if(state.status==='starting')tell('Allow camera access if your browser asks.');
    else if(state.status==='live')tell('Ready. Hold the page steady and tap Capture.');
    else if(state.status==='paused')tell('Camera paused. Your captured pages are still here.');
    lastStatus=state.status;
   }
   if(state.last!==lastPage){
    if(thumbnail)URL.revokeObjectURL(thumbnail);
    lastPage=state.last;thumbnail=state.last?URL.createObjectURL(state.last.blob):null;
    $('cameraThumbnail').hidden=!thumbnail;
    if(thumbnail)$('cameraThumbnail').src=thumbnail;else $('cameraThumbnail').removeAttribute('src');
   }
  }
 });
 function cameraError(error){
  const text=['NotAllowedError','SecurityError'].includes(error.name)?'Camera access was not allowed. Enable camera access for this website, then tap Resume. You can also close this view and use “Add files”.':error.name==='NotFoundError'?'No camera was found. Close this view and use “Add files”, or open the website on your phone.':error.name==='NotReadableError'?'The camera could not start. Close other camera apps, then tap Resume.':error.message||'The camera could not start. Tap Resume to try again.';
  tell(text,true);
 }
 function close(){if(session.snapshot().busy)return;if(session.snapshot().count&&!globalThis.confirm('Discard the pages captured in this camera session? Choose Cancel to keep them, then Finish & review.'))return;session.close();dialog.close();}
 $('cameraClose').addEventListener('click',close);
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.addEventListener('close',()=>{session.close();doc.body.classList.remove('camera-open');clearTimeout(flashTimer);$('cameraFlash').hidden=true;});
 $('cameraPause').addEventListener('click',async()=>{if(session.snapshot().status==='live')session.pause();else try{await session.resume();}catch(error){cameraError(error);}});
 $('cameraCapture').addEventListener('click',async()=>{
  try{if(await session.capture()){
   tell(`Page ${session.snapshot().count} captured. Turn to the next page.`);
   $('cameraFlash').hidden=false;clearTimeout(flashTimer);flashTimer=setTimeout(()=>$('cameraFlash').hidden=true,650);
  }}catch(error){cameraError(error);}
 });
 $('cameraUndo').addEventListener('click',()=>{if(session.undo())tell('Last capture removed. You can capture that page again.');});
 $('cameraFinish').addEventListener('click',()=>{
  if(session.snapshot().busy||!session.snapshot().count)return;
  // Make the files before clearing the session, so an allocation error retains photos.
  try{const files=session.finish(captureFiles);dialog.close();onFinish(files);}catch(error){cameraError(error);}
 });
 doc.addEventListener('visibilitychange',()=>{if(doc.hidden&&dialog.open)session.pause();});
 globalThis.addEventListener('pagehide',()=>session.pause());
 return {
  async open(){if(dialog.open||!canOpen())return;doc.body.classList.add('camera-open');dialog.showModal();try{await session.open();}catch(error){cameraError(error);}},
  hasCaptures:()=>session.snapshot().count>0
 };
}
