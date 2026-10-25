import {canvas,projection,projectPoint} from './vision.js?v=20261024-1';

// Keep the small date crop losslessly. The full review image is a JPEG to
// conserve batch memory; recomputing the crop from it changes OCR input.
export async function recognitionCrop(job){
 refreshDatePreview(job);
 const key=JSON.stringify(['header-preview-2',job.corners,job.rows.length]);
 if(job.dateCropKey===key&&job.dateCropBlob){
  const image=new Image(),url=job.dateCropBlob?URL.createObjectURL(job.dateCropBlob):null;
  try{image.src=url||job.datePreview;await image.decode();const saved=canvas(image.naturalWidth,image.naturalHeight);saved.getContext('2d').drawImage(image,0,0);return saved;}
  finally{image.src='';if(url)URL.revokeObjectURL(url);}
 }
 const crop=dateCrop(job.source,job.corners,job.rows.length);
 try{
  job.dateCropBlob=await new Promise(resolve=>crop.toBlob(resolve,'image/png'));
  job.dateCropKey=key;
 }catch(error){crop.width=crop.height=1;throw error;}
 return crop;
}

// Refresh older drafts when opened without rerunning OCR or changing a date.
export function refreshDatePreview(job,source=job.source){
 const key=JSON.stringify(['header-preview-2',job.corners,job.rows.length]);
 if(!source||!job.corners||job.datePreviewKey===key&&job.datePreview)return false;
 const band=datePreviewCrop(source,job.corners,job.rows.length),display=trimDatePreview(band);band.width=band.height=1;
 const scale=Math.min(1,900/display.width),preview=canvas(Math.max(1,Math.round(display.width*scale)),Math.max(1,Math.round(display.height*scale)));
 try{preview.getContext('2d').drawImage(display,0,0,preview.width,preview.height);job.datePreview=preview.toDataURL('image/png');job.datePreviewKey=key;}
 finally{preview.width=preview.height=1;display.width=display.height=1;}
 return true;
}

// The corners describe the data cells, not the form header. Include both the
// handwritten line above the border and the Date field inside it. Sample in
// table coordinates so camera tilt does not clip the end of a date.
export function datePreviewCrop(source,corners,rowCount){
 const p=projection(corners),width=Math.hypot(corners[1].x-corners[0].x,corners[1].y-corners[0].y),step=Math.hypot(corners[3].x-corners[0].x,corners[3].y-corners[0].y)/rowCount;
 const w=Math.max(1,Math.round(width*.7)),h=Math.max(1,Math.round(step*1.8));
 const out=canvas(w,h),ctx=out.getContext('2d'),pixels=ctx.createImageData(w,h),src=source.getContext('2d',{willReadFrequently:true}).getImageData(0,0,source.width,source.height).data;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const q=projectPoint(p,-.03+.7*x/w,(-1.9+1.8*y/h)/rowCount),sx=Math.round(q.x),sy=Math.round(q.y),i=(y*w+x)*4,j=(sy*source.width+sx)*4,inside=sx>=0&&sx<source.width&&sy>=0&&sy<source.height;
  for(let k=0;k<3;k++)pixels.data[i+k]=inside?src[j+k]:255;pixels.data[i+3]=255;
 }
 ctx.putImageData(pixels,0,0);return out;
}

// Color is used only to frame the preview. Display original pixels;
// filtering pen strokes is too destructive for
// thin digits, and must never change what the user sees on the paper.
export function trimDatePreview(band){
 const {width:w,height:h}=band,p=band.getContext('2d').getImageData(0,0,w,h).data,mask=new Uint8Array(w*h),values=[];
 for(let i=0;i<w*h;i++)values.push(p[i*4+1]);values.sort((a,b)=>a-b);const paper=values[Math.floor(values.length*.7)];
 for(let i=0;i<mask.length;i++){const r=p[i*4],g=p[i*4+1],b=p[i*4+2];mask[i]=g<paper*.86&&b-g>0&&b-r>-12?1:0;}
 const seen=new Uint8Array(mask.length);let x0=w,y0=h,x1=-1,y1=-1;
 for(let i=0;i<mask.length;i++){
  if(!mask[i]||seen[i])continue;const stack=[i];seen[i]=1;let count=0,l=w,t=h,r=0,b=0;
  while(stack.length){const j=stack.pop(),x=j%w,y=Math.floor(j/w);count++;l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy,k=yy*w+xx;if(xx>=0&&xx<w&&yy>=0&&yy<h&&mask[k]&&!seen[k]){seen[k]=1;stack.push(k);}}
  }
  if(count<8||r-l>w*.5||b-t>h*.7||r-l<2||b-t<3)continue;
  x0=Math.min(x0,l);x1=Math.max(x1,r);y0=Math.min(y0,t);y1=Math.max(y1,b);
 }
 if(x1-x0<40||y1-y0<10){x0=0;y0=0;x1=w-1;y1=h-1;}
 x0=Math.max(0,x0-24);y0=Math.max(0,y0-20);x1=Math.min(w,x1+25);y1=Math.min(h,y1+21);
 const out=canvas(x1-x0,y1-y0);out.getContext('2d').drawImage(band,x0,y0,out.width,out.height,0,0,out.width,out.height);return out;
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
 band.width=band.height=1;
 return out;
}
