import assert from 'node:assert/strict';
import {datePreviewCrop,trimDatePreview,refreshDatePreview} from '../date-crop.js';
import {projection,projectPoint} from '../vision.js';
import {draftRecord,restoredJob} from '../drafts.js';

// A small pixel canvas keeps these geometry checks independent of a browser.
function raster(width=1,height=1){
 const image={width,height};let data;
 const pixels=()=>{if(data?.length!==image.width*image.height*4)data=new Uint8ClampedArray(image.width*image.height*4);return data;};
 image.getContext=()=>({
  createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
  getImageData:()=>({data:pixels()}),putImageData:value=>{data=value.data;},
  drawImage(source,...args){
   let sx=0,sy=0,sw=source.width,sh=source.height,dx,dy,dw,dh;
   if(args.length===8)[sx,sy,sw,sh,dx,dy,dw,dh]=args;
   else [dx,dy,dw=sw,dh=sh]=args;
   const from=source.getContext('2d').getImageData().data,to=pixels();
   for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){
    const i=((dy+y)*image.width+dx+x)*4,j=((sy+Math.floor(y*sh/dh))*source.width+sx+Math.floor(x*sw/dw))*4;
    to.set(from.subarray(j,j+4),i);
   }
  }
 });
 image.toDataURL=()=>`data:image/png;base64,${Buffer.from(pixels()).toString('base64')}`;
 return image;
}
globalThis.document={createElement:()=>raster()};
const paint=(image,x,y,w,h,color)=>{const p=image.getContext('2d').getImageData().data;for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)if(xx>=0&&xx<image.width&&yy>=0&&yy<image.height)p.set([...color,255],(yy*image.width+xx)*4);};
const countColor=(image,color)=>{const p=image.getContext('2d').getImageData().data;let n=0;for(let i=0;i<p.length;i+=4)if(color.every((v,k)=>p[i+k]===v))n++;return n;};
const blue=[40,50,100],green=[30,100,30];
for(const corners of [
 [{x:100,y:220},{x:900,y:220},{x:900,y:760},{x:100,y:760}],
 [{x:130,y:280},{x:900,y:180},{x:920,y:760},{x:90,y:790}],
 [{x:100,y:170},{x:880,y:290},{x:930,y:780},{x:80,y:700}]
]){
 const source=raster(1000,900);paint(source,0,0,1000,900,[240,230,210]);
 const p=projection(corners);
 // First and last digits above the table, and inside the printed Date field.
 for(const [u,v,color] of [[.08,-1.55/6,blue],[.61,-1.55/6,blue],[.28,-.3/6,green],[.48,-.3/6,green]]){
  const q=projectPoint(p,u,v);paint(source,Math.round(q.x)-4,Math.round(q.y)-4,9,9,color);
 }
 const preview=datePreviewCrop(source,corners,6);
 assert.ok(countColor(preview,blue)>70,'both ends of handwriting above the header stay visible');
 assert.ok(countColor(preview,green)>70,'the Date field inside the header stays visible');
 const job={id:1,rows:Array(6),corners,date:'2026-09-11',dateSource:'manual',reviewed:true};
 assert.equal(refreshDatePreview(job,source),true);
 assert.equal(refreshDatePreview(job,source),false,'unchanged previews are reused');
 assert.equal(job.date,'2026-09-11');assert.equal(job.dateSource,'manual');assert.equal(job.reviewed,true);
 const restored=restoredJob(draftRecord(job));assert.equal(restored.datePreviewKey,job.datePreviewKey);
 assert.equal(refreshDatePreview(restored,source),false,'preview cache survives draft recovery');
}
const band=raster(240,100);paint(band,0,0,240,100,[240,230,210]);
paint(band,70,40,3,15,blue);paint(band,130,40,3,15,blue);
paint(band,90,42,2,10,[45,45,45]);
const trimmed=trimDatePreview(band);
assert.ok(trimmed.width<band.width);
assert.equal(countColor(trimmed,blue),90,'thin pen strokes retain their original colors');
assert.equal(countColor(trimmed,[45,45,45]),20,'nearby black strokes are not filtered out');
const black=raster(240,100);paint(black,0,0,240,100,[240,230,210]);paint(black,70,40,65,15,[30,30,30]);
const untrimmed=trimDatePreview(black);assert.equal(untrimmed.width,240);assert.equal(untrimmed.height,100,'black handwriting keeps the full header');
console.log('Date previews retain both header positions under tilt, preserve original ink, and refresh drafts without changing reviewed dates.');
