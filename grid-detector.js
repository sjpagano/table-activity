// Detect the printed row and column rules at their actual slopes. Fit a regular
// table under perspective, including its label column and excluding short headers.
// Keep analysis under 1000 pixels and release this temporary data after each page.
function median(a){a=[...a].sort((x,y)=>x-y);return a[a.length>>1];}
function linePixels(b){
 const scale=Math.min(1,1000/Math.max(b.w,b.h)),w=Math.ceil(b.w*scale),h=Math.ceil(b.h*scale),data=new Uint8Array(w*h);
 for(let y=0;y<b.h;y++)for(let x=0;x<b.w;x++)if(b.data[y*b.w+x]){data[Math.min(h-1,Math.floor(y*scale))*w+Math.min(w-1,Math.floor(x*scale))]=1;}
 return {w,h,data,scale};
}
function lines(b,vertical=false,top=null,bottom=null){
 const {w,h,data}=b,W=vertical?h:w,H=vertical?w:h,xs=new Uint16Array(w*h),ys=new Uint16Array(w*h);let count=0;
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++)if(data[y*w+x]&&(!top||(y>top.b+top.m*(x-w/2)+3&&y<bottom.b+bottom.m*(x-w/2)-3))){xs[count]=vertical?y:x;ys[count]=vertical?x:y;count++;}
 const candidates=[],padding=Math.ceil(W*.32)+8,length=H+2*padding;
 for(let s=-65;s<=65;s++){
  const m=s*.004,acc=new Uint32Array(length);
  for(let i=0;i<count;i++){const x=xs[i],y=ys[i],at=Math.round(y-m*(x-W/2))+padding;if(at>=0&&at<length)acc[at]++;}
  const smooth=new Uint32Array(length);for(let i=2;i<length-2;i++)smooth[i]=acc[i-1]+acc[i]+acc[i+1];
  const threshold=(vertical&&top?(bottom.b-top.b):W)*.24;
  for(let i=3;i<length-3;i++)if(smooth[i]>threshold&&smooth[i]>=smooth[i-1]&&smooth[i]>smooth[i+1])candidates.push({m,b:i-padding,score:smooth[i]});
 }
 candidates.sort((a,b)=>b.score-a.score);
 const selected=[];
 for(const line of candidates){if(selected.some(o=>Math.abs(line.b-o.b)+Math.abs(line.m-o.m)*W*.3<5))continue;let hits=0,first=W,last=0;const trace=new Uint8Array(W);for(let x=0;x<W;x++){if(vertical&&top&&(x<top.b-3||x>bottom.b+3))continue;const y=Math.round(line.b+line.m*(x-W/2));let ink=false;for(let d=-2;d<=2;d++){const xx=vertical?y+d:x,yy=vertical?x:y+d;if(xx>=0&&xx<w&&yy>=0&&yy<h&&data[yy*w+xx]){ink=true;break;}}if(ink){trace[x]=1;hits++;first=Math.min(first,x);last=x;}}const span=last-first+1;if(span<(vertical&&top?(bottom.b-top.b)*.5:W*.32)||hits/span<.48)continue;let runStart=0,lastHit=-99,bestStart=0,bestEnd=0;for(let x=0;x<W;x+=8){let filled=0;for(let i=x;i<Math.min(W,x+8);i++)filled+=trace[i];if(filled<4)continue;if(x-lastHit>16)runStart=x;lastHit=x;if(x+8-runStart>bestEnd-bestStart){bestStart=runStart;bestEnd=x+8;}}if(bestEnd-bestStart<(vertical&&top?(bottom.b-top.b)*.5:W*.32))continue;line.start=bestStart;line.end=bestEnd;line.score=hits;selected.push(line);if(selected.length>=160)break;}
 // Refine each line using pixels near the detected stroke.
 for(const line of selected){let n=0,sx=0,sy=0,sxx=0,sxy=0;for(let i=0;i<count;i++){const x=xs[i],y=ys[i],xx=x-W/2;if(Math.abs(y-line.b-line.m*xx)>1.7)continue;n++;sx+=xx;sy+=y;sxx+=xx*xx;sxy+=xx*y;}if(n>20){const den=n*sxx-sx*sx;line.m=(n*sxy-sx*sy)/den;line.b=(sy-line.m*sx)/n;}}
 // Slope alternatives for the same physical line are not independent rules.
 selected.sort((a,b)=>b.score-a.score);const merged=[];for(const line of selected)if(!merged.some(o=>Math.abs(line.b-o.b)<5))merged.push(line);
 return merged.sort((a,b)=>a.b-b.b);
}
function fit(lines,intervals,minStep,maxStep,minFraction=1,bounds=null){
 let best=null;
 function nearest(target){let lo=0,hi=lines.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(lines[mid].b<target)lo=mid+1;else hi=mid;}return lo&&Math.abs(lines[lo-1].b-target)<Math.abs(lines[lo].b-target)?lines[lo-1]:lines[lo];}
 for(let i=0;i<lines.length;i++)for(let j=i+1;j<lines.length;j++){
  const width=lines[j].b-lines[i].b,step=width/intervals;if(step<minStep||step>maxStep)continue;if(bounds&&(Math.abs(lines[i].b-bounds[0])>step*.8||Math.abs(lines[j].b-bounds[1])>step*.8))continue;
  for(let qi=-12;qi<=12;qi++){
   const q=qi*.02;let error=0,matches=0,strength=0;const found=[];
   for(let k=0;k<=intervals;k++){const t=k/intervals,target=lines[i].b+width*t*(1+q)/(1+q*t),line=nearest(target),distance=Math.abs(line.b-target);if(distance<step*.24){matches++;strength+=line.score;found.push(line);}else found.push(null);error+=Math.min(1,distance/step);}
   if(matches<(intervals+1)*minFraction||found.filter(Boolean).length!==new Set(found.filter(Boolean)).size)continue;
   const first=found[0],last=found.at(-1);if(found.some((line,k)=>line&&Math.abs(line.m-(first.m+(last.m-first.m)*k/intervals))>.025))continue;
   const meanError=error/(intervals+1);if(meanError>.14)continue;const quality=meanError+(1-matches/(intervals+1))*.4-strength/(intervals+1)/10000;
   if(!best||quality<best.quality)best={lines:found,step,quality,meanError,matches,q};
  }
 }
 return best;
}
function intersection(h,v,w,height){const hb=h.b-h.m*w/2,vb=(v.originalB??v.b)-v.m*height/2,x=(vb+v.m*hb)/(1-v.m*h.m);return {x,y:hb+h.m*x};}
export function findTable(binary,{rows,cols}={}){
 const b=linePixels(binary),hs=lines(b),rowFit=fit(hs,rows,Math.min(b.h*.028,b.h*.3/rows),b.h*.96/rows,1);if(!rowFit)return null;
 const top=rowFit.lines[0],bottom=rowFit.lines.at(-1),midY=(top.b+bottom.b)/2,bounds=[median(rowFit.lines.map(l=>l.start)),median(rowFit.lines.map(l=>l.end))],vs=lines(b,true,top,bottom).map(l=>({...l,originalB:l.b,b:l.b+l.m*(midY-b.h/2)})).sort((a,b)=>a.b-b.b),colFit=fit(vs,cols+1,b.w*.36/(cols+1),b.w*.98/(cols+1),.82,bounds);
 if(!colFit)return null;
 const left=colFit.lines[1],right=colFit.lines.at(-1);if(!left||!right)return null;
 const corners=[intersection(top,left,b.w,b.h),intersection(top,right,b.w,b.h),intersection(bottom,right,b.w,b.h),intersection(bottom,left,b.w,b.h)].map(p=>({x:p.x/b.scale,y:p.y/b.scale}));
 if(corners.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>=binary.w||p.y<0||p.y>=binary.h))return null;
 return {corners,confidence:{rowError:rowFit.meanError,columnError:colFit.meanError,matchedColumns:colFit.matches}};
}

