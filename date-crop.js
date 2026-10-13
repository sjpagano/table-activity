import {canvas} from './vision.js?v=20261013-1';

// Keep the small date crop losslessly. The full review image is a JPEG to
// conserve batch memory; recomputing the crop from it changes OCR input.
export async function recognitionCrop(job){
 const key=JSON.stringify([job.corners,job.rows.length]);
 if(job.dateCropKey===key&&job.datePreview){
  const image=new Image();image.src=job.datePreview;await image.decode();
  const saved=canvas(image.naturalWidth,image.naturalHeight);saved.getContext('2d').drawImage(image,0,0);return saved;
 }
 const crop=dateCrop(job.source,job.corners,job.rows.length);
 job.datePreview=crop.toDataURL('image/png');job.dateCropKey=key;
 return crop;
}

export function dateCrop(source,corners,rowCount){
 const left=Math.min(corners[0].x,corners[3].x),right=Math.max(corners[1].x,corners[2].x);
 const top=Math.min(corners[0].y,corners[1].y),step=((corners[2].y+corners[3].y)/2-top)/rowCount;
 const x=Math.max(0,Math.floor(left-(right-left)*.025));
 const y=Math.max(0,Math.floor(top-step*1.4));
 const w=Math.min(source.width-x,Math.ceil((right-left)*.57));
 const h=Math.max(1,Math.min(source.height-y,Math.floor(top-step*.58)-y));
 const band=canvas(w,h),ctx=band.getContext('2d',{willReadFrequently:true});
 ctx.drawImage(source,x,y,w,h,0,0,w,h);
 const pixels=ctx.getImageData(0,0,w,h),gray=new Uint8Array(w*h),hist=new Uint32Array(256);
 for(let i=0;i<gray.length;i++){const v=Math.round(pixels.data[i*4]*.299+pixels.data[i*4+1]*.587+pixels.data[i*4+2]*.114);gray[i]=v;hist[v]++;}
 let lo=0,hi=255,n=0;while(lo<254&&n<gray.length*.02)n+=hist[lo++];n=0;while(hi>lo+1&&n<gray.length*.02)n+=hist[hi--];
 for(let i=0;i<gray.length;i++){gray[i]=Math.max(0,Math.min(255,Math.round((gray[i]-lo)/(hi-lo)*255)));pixels.data[i*4]=pixels.data[i*4+1]=pixels.data[i*4+2]=gray[i];}
 ctx.putImageData(pixels,0,0);
 let x0=w,y0=h,x1=0,y1=0;
 // Three-by-three solid ink rejects paper grain before trimming whitespace.
 for(let py=1;py<h-1;py++)for(let px=1;px<w-1;px++){
  let ink=true;for(let dy=-1;dy<=1&&ink;dy++)for(let dx=-1;dx<=1;dx++)if(gray[(py+dy)*w+px+dx]>=70){ink=false;break;}
  if(ink){x0=Math.min(x0,px);x1=Math.max(x1,px);y0=Math.min(y0,py);y1=Math.max(y1,py);}
 }
 if(x1<=x0||y1<=y0){x0=0;y0=0;x1=w-1;y1=h-1;}
 x0=Math.max(0,x0-8);y0=Math.max(0,y0-8);x1=Math.min(w,x1+9);y1=Math.min(h,y1+9);
 const out=canvas((x1-x0)*3,(y1-y0)*3);
 out.getContext('2d').drawImage(band,x0,y0,x1-x0,y1-y0,0,0,out.width,out.height);
 return out;
}
