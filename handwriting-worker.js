import './compatibility.js?v=20261013-4';
import {pipeline,env,RawImage} from './vendor/transformers.min.js';
env.allowLocalModels=false;
env.backends.onnx.wasm.wasmPaths=new URL('./vendor/',self.location.href).href;
env.backends.onnx.wasm.numThreads=1;
let reader;
self.onmessage=async ({data})=>{
 try{
  if(!reader)reader=await pipeline('image-to-text','Xenova/trocr-small-handwritten',{
   revision:'2432e24d184b1d964d07ed04f5d9e21d31a59141',dtype:'q8',device:'wasm',
   progress_callback:p=>{if(p.status==='progress')self.postMessage({progress:Math.round(p.progress||0),file:p.file});}
  });
  const result=await reader(new RawImage(new Uint8ClampedArray(data.pixels),data.width,data.height,4),{max_new_tokens:32});
  self.postMessage({text:result[0]?.generated_text||''});
 }catch(e){reader=null;self.postMessage({error:e.message});}
};
