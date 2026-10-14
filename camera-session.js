// Capture first, recognize afterward. Keep camera lifecycle separate from the UI
// so late permission responses and interrupted captures cannot reopen a session.
export function createCameraSession({getUserMedia,attachStream,detachStream,captureFrame,changed=()=>{},now=Date.now,maxPages=200,maxBytes=100*1024*1024}) {
 let stream=null,active=false,status='closed',busy=false,request=0,session=0,bytes=0;
 const pages=[];
 const snapshot=()=>({active,status,busy,count:pages.length,bytes,last:pages.at(-1)||null});
 const emit=()=>changed(snapshot());
 function release(){const old=stream;stream=null;if(old)for(const track of old.getTracks())track.stop();detachStream();}
 function pause(){if(!active)return;request++;release();status='paused';emit();}
 async function resume(){
  if(!active||busy||status==='starting'||status==='live')return;
  const token=++request;status='starting';emit();
  try{
   const next=await getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:2560},height:{ideal:1920}}});
   if(token!==request||!active){next.getTracks().forEach(track=>track.stop());return;}
   stream=next;
   for(const track of next.getVideoTracks())track.addEventListener('ended',()=>{if(stream===next)pause();},{once:true});
   await attachStream(next);
   if(token!==request||!active)return;
   status='live';emit();
  }catch(error){if(token!==request||!active)return;release();status='paused';emit();throw error;}
 }
 async function open(){if(active)return;active=true;status='paused';session++;emit();await resume();}
 async function capture(){
  if(!active||status!=='live'||busy)return false;
  if(pages.length>=maxPages)throw Error(`This batch has ${maxPages} pages. Finish and review it before starting another.`);
  const token=session;busy=true;emit();
  try{
   const capturedAt=now(),blob=await captureFrame();
   if(token!==session||!active)return false;
   if(!blob?.size)throw Error('The photo was empty. Hold the page steady and try again.');
   if(bytes+blob.size>maxBytes)throw Error('This camera batch is full. Finish and review it, then start another batch.');
   pages.push({blob,capturedAt});bytes+=blob.size;return true;
  }finally{if(token===session){busy=false;emit();}}
 }
 function undo(){if(busy||!pages.length)return false;bytes-=pages.pop().blob.size;emit();return true;}
 function close(){request++;session++;active=false;status='closed';busy=false;pages.length=0;bytes=0;release();emit();}
 function finish(convert=items=>items){if(busy)return null;const result=convert([...pages]);close();return result;}
 return {open,resume,pause,capture,undo,close,finish,snapshot};
}

export async function captureVideoFrame(video,{document:doc=globalThis.document,maxDimension=2200}={}){
 if(video.readyState<2||!video.videoWidth||!video.videoHeight)throw Error('The camera is still focusing. Wait for the live picture, then capture again.');
 const scale=Math.min(1,maxDimension/Math.max(video.videoWidth,video.videoHeight));
 const canvas=doc.createElement('canvas');canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
 try{
  canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
  return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?.size?resolve(blob):reject(Error('Unable to capture this page. Please try again.')),'image/jpeg',.95));
 }finally{canvas.width=canvas.height=1;}
}

export function captureFiles(pages){return pages.map((page,index)=>new File([page.blob],`Camera ${new Date(page.capturedAt).toISOString().replace(/[:.]/g,'-')} page ${index+1}.jpg`,{type:'image/jpeg',lastModified:page.capturedAt}));}
