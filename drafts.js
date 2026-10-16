const FIELDS=['id','order','fileName','page','pageCount','expanded','status','rows','times','grid','uncertain','reviewed','date','dateSource','dateNote','datePreview','datePreviewKey','dateCropKey','corners','alignmentDirty','sensitivity','ocrText','error','gridWarning','gridVersion','savedDate','savedRevision','savedOwner','hasSource','thumbnail'];
export function draftRecord(job){
 const result=Object.fromEntries(FIELDS.filter(key=>job[key]!==undefined).map(key=>[key,job[key]]));
 result.hasSource=!!(job.sourceBlob||job.hasSource);result.status=job.status==='processing'?'queued':job.status;
 return structuredClone(result);
}
export function restoredJob(record){const job={...record,history:[],sourceBlob:null,file:null};if(job.dateSource==='metadata'&&!job.savedDate){job.date='';job.dateSource='';job.dateNote='Enter the date from the document.';job.reviewed=false;}return job;}
export function createDraftStore(indexedDB=globalThis.indexedDB){
 let database,queue=Promise.resolve();
 function open(){return database||(database=new Promise((resolve,reject)=>{
  if(!indexedDB){reject(Error('Local draft storage is unavailable.'));return;}
  const request=indexedDB.open('table-activity-scan-drafts',1);
  request.onupgradeneeded=()=>{request.result.createObjectStore('pages',{keyPath:'id'});request.result.createObjectStore('images',{keyPath:'id'});};
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Close other app tabs to enable local drafts.'));
 }));}
 async function transaction(stores,mode,run){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(stores,mode);let result;tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(tx.error||Error('Unable to save the local draft.'));run(tx,value=>{result=value;});});}
 function enqueue(run){const result=queue.then(run);queue=result.catch(()=>{});return result;}
 return {
  save(job){
   const record=draftRecord(job),images={id:job.id};for(const key of ['file','sourceBlob','dateCropBlob'])if(job[key])images[key]=job[key];
   return enqueue(()=>transaction(['pages','images'],'readwrite',tx=>{
    tx.objectStore('pages').put(record);
    if(Object.keys(images).length>1){const store=tx.objectStore('images'),request=store.get(job.id);request.onsuccess=()=>{const next={...request.result,...images};if(record.status==='ready'&&next.sourceBlob)delete next.file;store.put(next);};}
   }));
  },
  load(){return enqueue(()=>transaction(['pages'],'readonly',(tx,set)=>{const request=tx.objectStore('pages').getAll();request.onsuccess=()=>set(request.result.sort((a,b)=>(a.order??a.id)-(b.order??b.id)).map(restoredJob));}));},
  images(id){return enqueue(()=>transaction(['images'],'readonly',(tx,set)=>{const request=tx.objectStore('images').get(id);request.onsuccess=()=>set(request.result||{});}));},
  remove(id){return enqueue(()=>transaction(['pages','images'],'readwrite',tx=>{tx.objectStore('pages').delete(id);tx.objectStore('images').delete(id);}));},
  clear(){return enqueue(()=>transaction(['pages','images'],'readwrite',tx=>{tx.objectStore('pages').clear();tx.objectStore('images').clear();}));}
 };
}
