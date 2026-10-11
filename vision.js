export function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
export function rotate(source,degrees){const swap=Math.abs(degrees)%180===90;const c=canvas(swap?source.height:source.width,swap?source.width:source.height),x=c.getContext('2d');x.translate(c.width/2,c.height/2);x.rotate(degrees*Math.PI/180);x.drawImage(source,-source.width/2,-source.height/2);return c;}
export function binary(source){const {width:w,height:h}=source;const d=source.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;const gray=new Uint8Array(w*h),sum=new Float64Array((w+1)*(h+1));for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){const i=y*w+x;gray[i]=Math.round(.299*d[i*4]+.587*d[i*4+1]+.114*d[i*4+2]);row+=gray[i];sum[(y+1)*(w+1)+x+1]=sum[y*(w+1)+x+1]+row;}}const out=new Uint8Array(w*h),radius=Math.max(10,Math.round(w/100));for(let y=0;y<h;y++)for(let x=0;x<w;x++){const x0=Math.max(0,x-radius),x1=Math.min(w,x+radius),y0=Math.max(0,y-radius),y1=Math.min(h,y+radius);const mean=(sum[y1*(w+1)+x1]-sum[y0*(w+1)+x1]-sum[y1*(w+1)+x0]+sum[y0*(w+1)+x0])/((x1-x0)*(y1-y0));out[y*w+x]=gray[y*w+x]<mean-25?1:0;}return {data:out,w,h};}
function groups(values,threshold,gap=5){const groups=[];for(let i=2;i<values.length-2;i++){if(values[i]<threshold)continue;const last=groups.at(-1);if(last&&i-last.end<=gap){last.end=i;if(values[i]>last.value){last.at=i;last.value=values[i];}}else groups.push({at:i,end:i,value:values[i]});}return groups.map(g=>g.at);}
export function locateGrid(source,rowCount,colCount){const b=binary(source),{w,h,data}=b;const hp=new Float32Array(h),vp=new Float32Array(w);for(let y=Math.round(h*.04);y<h*.96;y++)for(let x=Math.round(w*.03);x<w*.97;x++){const v=data[y*w+x];hp[y]+=v;vp[x]+=v;}
 const maxh=Math.max(...hp),maxv=Math.max(...vp);const hs=groups(hp,Math.max(w*.21,maxh*.47),Math.max(4,h*.005));const vs=groups(vp,Math.max(h*.16,maxv*.43),Math.max(3,w*.003));
 // Fit the long, regularly spaced data rows; the two short heading rows are excluded.
 let best=null;for(let i=0;i<hs.length;i++)for(let j=i+rowCount;j<hs.length;j++){const step=(hs[j]-hs[i])/rowCount;if(step<h*.025||step>h*.18)continue;let err=0;const fit=[];for(let r=0;r<=rowCount;r++){const target=hs[i]+r*step;const near=hs.reduce((a,v)=>Math.abs(v-target)<Math.abs(a-target)?v:a,hs[0]);fit.push(near);err+=Math.abs(near-target)/step;}if(new Set(fit).size!==rowCount+1)continue;const score=err+(h-(hs[j]-hs[i]))/h*.05;if(!best||score<best.score)best={fit,score};}
 if(!best||best.score>.9||vs.length<Math.max(8,colCount*.7))return null;
 const left=vs[0],right=vs.at(-1);const widths=vs.slice(1).map((x,i)=>x-vs[i]).sort((a,b)=>a-b);const step=widths[Math.floor(widths.length/2)];
 // The supplied form has one table-number column followed by the time columns.
 const x0=vs[1],x1=vs.length===colCount+2?right:x0+(right-x0)/Math.round((right-x0)/step)*colCount;
 if(x1>right+step*1.7||x1>source.width)return null;
 // Extrapolate past the printed heading, whose text can obscure the first rule.
 const gaps=best.fit.slice(2).map((y,i)=>y-best.fit[i+1]).sort((a,b)=>a-b);const rowStep=gaps.length?gaps[Math.floor(gaps.length/2)]:(best.fit.at(-1)-best.fit[0])/rowCount;
 const top=Math.abs(best.fit[1]-rowStep-best.fit[0])<rowStep*.2?best.fit[1]-rowStep:best.fit[0];
 const corners=[{x:x0,y:top},{x:Math.min(right,x1),y:top},{x:Math.min(right,x1),y:best.fit.at(-1)},{x:x0,y:best.fit.at(-1)}];
 return {corners,binary:b,hLines:hs,vLines:vs};
}
export function pointAt(corners,u,v){const [a,b,c,d]=corners;return {x:a.x*(1-u)*(1-v)+b.x*u*(1-v)+c.x*u*v+d.x*(1-u)*v,y:a.y*(1-u)*(1-v)+b.y*u*(1-v)+c.y*u*v+d.y*(1-u)*v};}
export function readMarks(source,corners,rows,cols,sensitivity=50){const b=binary(source);const grid=[],uncertain=[],densities=[];const cutoff=.038+(50-sensitivity)*.00065;for(let r=0;r<rows;r++){const row=[],ds=[];for(let c=0;c<cols;c++){const pixels=[];const sw=24,sh=52;for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){const p=pointAt(corners,(c+.19+.62*x/(sw-1))/cols,(r+.12+.76*y/(sh-1))/rows);const px=Math.max(0,Math.min(b.w-1,Math.round(p.x))),py=Math.max(0,Math.min(b.h-1,Math.round(p.y)));pixels.push(b.data[py*b.w+px]);}let count=pixels.reduce((a,v)=>a+v,0),density=count/pixels.length;
 // A remaining grid rule is a thin stroke across most of a crop. Ignore such rows/columns.
 for(let x=0;x<sw;x++){let n=0;for(let y=0;y<sh;y++)n+=pixels[y*sw+x];if(n>sh*.8)count-=n;}
 // Keep coherent pen strokes. Paper grain produces many isolated dark pixels.
 const seen=new Uint8Array(pixels.length);let largest=0;
 for(let i=0;i<pixels.length;i++){if(!pixels[i]||seen[i])continue;const stack=[i];seen[i]=1;let size=0,minX=sw,maxX=0,minY=sh,maxY=0;while(stack.length){const q=stack.pop(),xx=q%sw,yy=Math.floor(q/sw);size++;minX=Math.min(minX,xx);maxX=Math.max(maxX,xx);minY=Math.min(minY,yy);maxY=Math.max(maxY,yy);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=xx+dx,ny=yy+dy,n=ny*sw+nx;if(nx>=0&&nx<sw&&ny>=0&&ny<sh&&pixels[n]&&!seen[n]){seen[n]=1;stack.push(n);}}}const ww=maxX-minX+1,hh=maxY-minY+1;if(ww>=sw*.24&&hh>=sh*.13&&!(hh>sh*.85&&ww<sw*.3)&&ww/hh>.22)largest=Math.max(largest,size);}
 density=largest/pixels.length;row.push(density>cutoff);ds.push(density);if(density>cutoff*.55&&density<cutoff*1.7)uncertain.push(`${r}:${c}`);
 }grid.push(row);densities.push(ds);}return {grid,uncertain,densities};}
export function defaultCorners(source){return [{x:source.width*.1,y:source.height*.28},{x:source.width*.91,y:source.height*.28},{x:source.width*.91,y:source.height*.77},{x:source.width*.1,y:source.height*.77}];}
