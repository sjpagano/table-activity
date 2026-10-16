import {findTable} from './grid-detector.js?v=20261016-1';
export function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
export function rotate(source,degrees){const swap=Math.abs(degrees)%180===90;const c=canvas(swap?source.height:source.width,swap?source.width:source.height),x=c.getContext('2d');x.translate(c.width/2,c.height/2);x.rotate(degrees*Math.PI/180);x.drawImage(source,-source.width/2,-source.height/2);return c;}
function thresholdImage(d,w,h,threshold,filterColor=false){
 const gray=new Uint8Array(w*h),sum=new (w*h*255<=4294967295?Uint32Array:Float64Array)((w+1)*(h+1));
 for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){const i=y*w+x;gray[i]=Math.round(.299*d[i*4]+.587*d[i*4+1]+.114*d[i*4+2]);row+=gray[i];sum[(y+1)*(w+1)+x+1]=sum[y*(w+1)+x+1]+row;}}
 const out=new Uint8Array(w*h),radius=Math.max(10,Math.round(w/100));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const x0=Math.max(0,x-radius),x1=Math.min(w,x+radius),y0=Math.max(0,y-radius),y1=Math.min(h,y+radius),i=y*w+x;
  const mean=(sum[y1*(w+1)+x1]-sum[y0*(w+1)+x1]-sum[y1*(w+1)+x0]+sum[y0*(w+1)+x0])/((x1-x0)*(y1-y0));
  out[i]=gray[i]<mean-threshold&&!(filterColor&&d[i*4+2]-d[i*4]>65&&d[i*4+2]>d[i*4]*1.8)?1:0;
 }
 return {data:out,w,h};
}
function lineImage(d,w,h,threshold=12){
 const scale=Math.min(1,1000/Math.max(w,h)),sw=Math.ceil(w*scale),sh=Math.ceil(h*scale),small=new Uint8ClampedArray(sw*sh*4);
 // Average before thresholding so high-resolution paper grain cannot turn into
 // connected dark lines when reduced. Nearest/maximum pooling amplifies grain.
 for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){
  const x0=Math.floor(x*w/sw),x1=Math.floor((x+1)*w/sw),y0=Math.floor(y*h/sh),y1=Math.floor((y+1)*h/sh);let r=0,g=0,b=0,n=0;
  for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++){const i=(yy*w+xx)*4;r+=d[i];g+=d[i+1];b+=d[i+2];n++;}
  const i=(y*sw+x)*4;small[i]=r/n;small[i+1]=g/n;small[i+2]=b/n;small[i+3]=255;
 }
 return thresholdImage(small,sw,sh,threshold,true);
}
export function binary(source,threshold=16,includeLines=false){
 const {width:w,height:h}=source,d=source.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data,result=thresholdImage(d,w,h,threshold);
 if(includeLines)result.lines=lineImage(d,w,h);return result;
}
// A faint-rule retry must have near-complete columns and agree with an
// independently thresholded pass. Keep mark sensitivity unchanged.
export function agreesOnFaintGrid(a,b,rows,cols){
 const strong=c=>c&&c.confidence.matchedColumns>=Math.ceil((cols+2)*.9)&&c.confidence.columnError<=.1&&c.confidence.rowError<=.04;
 if(!strong(a)||!strong(b))return false;
 const width=Math.min(Math.hypot(a.corners[1].x-a.corners[0].x,a.corners[1].y-a.corners[0].y),Math.hypot(a.corners[2].x-a.corners[3].x,a.corners[2].y-a.corners[3].y));
 const height=Math.min(Math.hypot(a.corners[3].x-a.corners[0].x,a.corners[3].y-a.corners[0].y),Math.hypot(a.corners[2].x-a.corners[1].x,a.corners[2].y-a.corners[1].y));
 const tolerance=Math.max(1.5,Math.min(width/cols,height/rows)*.18);
 return a.corners.every((p,i)=>Math.hypot(p.x-b.corners[i].x,p.y-b.corners[i].y)<=tolerance);
}
export function locateGrid(source,rowCount,colCount){
 const b=binary(source,16,true),options={rows:rowCount,cols:colCount},lineWidth=b.lines.w,lineHeight=b.lines.h;
 let found=findTable(b.lines,options);delete b.lines;
 if(!found){
  const d=source.getContext('2d',{willReadFrequently:true}).getImageData(0,0,b.w,b.h).data;let previous=null;
  for(const threshold of [8,6,4]){
   const candidate=findTable(lineImage(d,b.w,b.h,threshold),options);
   if(agreesOnFaintGrid(previous,candidate,rowCount,colCount)){found=candidate;found.confidence.lineThreshold=threshold;break;}
   previous=candidate;
  }
 }
 if(found)found.corners=found.corners.map(p=>({x:p.x*b.w/lineWidth,y:p.y*b.h/lineHeight}));
 return found?{...found,binary:b}:null;
}
// Map the printed rectangle through perspective, not a uniform screen-space grid.
export function projection(corners){
 const [a,b,c,d]=corners,dx1=b.x-c.x,dx2=d.x-c.x,dx3=a.x-b.x+c.x-d.x,dy1=b.y-c.y,dy2=d.y-c.y,dy3=a.y-b.y+c.y-d.y,den=dx1*dy2-dx2*dy1;
 const g=Math.abs(den)>1e-8?(dx3*dy2-dx2*dy3)/den:0,h=Math.abs(den)>1e-8?(dx1*dy3-dx3*dy1)/den:0;
 return {a:b.x-a.x+g*b.x,b:d.x-a.x+h*d.x,c:a.x,d:b.y-a.y+g*b.y,e:d.y-a.y+h*d.y,f:a.y,g,h};
}
export function projectPoint(p,u,v){const z=p.g*u+p.h*v+1;return {x:(p.a*u+p.b*v+p.c)/z,y:(p.d*u+p.e*v+p.f)/z};}
export function pointAt(corners,u,v){return projectPoint(projection(corners),u,v);}
export function gridCoordinates(corners,point){
 const p=projection(corners),a=p.a-point.x*p.g,b=p.b-point.x*p.h,d=p.d-point.y*p.g,e=p.e-point.y*p.h,det=a*e-b*d;
 if(Math.abs(det)<1e-8)return null;const x=point.x-p.c,y=point.y-p.f;return {u:(x*e-y*b)/det,v:(y*a-x*d)/det};
}
export function classifyCell(pixels,sw,sh,sensitivity=50){
 const clean=Uint8Array.from(pixels),removeX=[],removeY=[];
 // Remove printed rules from the mask used by component detection, not only a discarded count.
 for(let x=0;x<sw;x++){let n=0;for(let y=0;y<sh;y++)n+=pixels[y*sw+x];if(n>sh*.72)removeX.push(x);}
 for(let y=0;y<sh;y++){let n=0;for(let x=0;x<sw;x++)n+=pixels[y*sw+x];if(n>sw*.78)removeY.push(y);}
 for(const x of removeX)for(let y=0;y<sh;y++)clean[y*sw+x]=0;
 for(const y of removeY)for(let x=0;x<sw;x++)clean[y*sw+x]=0;
 const seen=new Uint8Array(clean.length);let largest=0;
 for(let i=0;i<clean.length;i++){
  if(!clean[i]||seen[i])continue;const stack=[i];seen[i]=1;let size=0,minX=sw,maxX=0,minY=sh,maxY=0;
  while(stack.length){const q=stack.pop(),xx=q%sw,yy=Math.floor(q/sw);size++;minX=Math.min(minX,xx);maxX=Math.max(maxX,xx);minY=Math.min(minY,yy);maxY=Math.max(maxY,yy);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=xx+dx,ny=yy+dy,n=ny*sw+nx;if(nx>=0&&nx<sw&&ny>=0&&ny<sh&&clean[n]&&!seen[n]){seen[n]=1;stack.push(n);}}
  }
  const ww=maxX-minX+1,hh=maxY-minY+1;if(ww>=sw*.28&&hh>=sh*.13&&ww/hh>.24&&ww/hh<3.5&&size<clean.length*.45)largest=Math.max(largest,size);
 }
 const density=largest/clean.length,cutoff=.025+(50-sensitivity)*.0004;
 return {marked:density>cutoff,uncertain:density>cutoff*.55&&density<cutoff*1.7,density};
}
export function readMarks(source,corners,rows,cols,sensitivity=50,preparedBinary=null){
 const b=preparedBinary||binary(source,16),transform=projection(corners),grid=[],uncertain=[],densities=[],sw=32,sh=64;
 for(let r=0;r<rows;r++){const row=[],ds=[];for(let c=0;c<cols;c++){
  const pixels=new Uint8Array(sw*sh);
  for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){
   const p=projectPoint(transform,(c+.12+.76*x/(sw-1))/cols,(r+.09+.82*y/(sh-1))/rows),px=Math.round(p.x),py=Math.round(p.y);
   if(px>=0&&px<b.w&&py>=0&&py<b.h)pixels[y*sw+x]=b.data[py*b.w+px];
  }
  const result=classifyCell(pixels,sw,sh,sensitivity);row.push(result.marked);ds.push(result.density);if(result.uncertain)uncertain.push(`${r}:${c}`);
 }grid.push(row);densities.push(ds);}
 return {grid,uncertain,densities};
}
export function defaultCorners(source){return [{x:source.width*.1,y:source.height*.28},{x:source.width*.91,y:source.height*.28},{x:source.width*.91,y:source.height*.77},{x:source.width*.1,y:source.height*.77}];}
