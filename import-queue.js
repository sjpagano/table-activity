// A file chooser can finish after the page becomes busy. Keep that selection
// until it can be saved, including further batches selected during recognition.
export function createImportQueue({blocked,consume,pending=()=>{},idle=()=>{},error=()=>{}}){
 const batches=[];let running=false,scheduled=false,active=0;
 const count=()=>active+batches.reduce((n,b)=>n+b.length,0);
 const report=()=>pending(count());
 async function drain(){
  scheduled=false;if(running||blocked()||!batches.length)return;
  running=true;
  try{
   while(batches.length&&!blocked()){
    const batch=batches.shift();active=batch.length;report();
    try{await consume(batch);}catch(e){error(e,batch);}
    active=0;report();
   }
  }finally{running=false;if(!batches.length)idle();else resume();}
 }
 function resume(){if(!running&&!scheduled&&batches.length&&!blocked()){scheduled=true;queueMicrotask(drain);}}
 return {add(files){if(!files.length)return;batches.push(Array.from(files));report();resume();},resume,count};
}
