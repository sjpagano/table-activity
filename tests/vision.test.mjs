import assert from 'node:assert/strict';
import {locateGrid,readMarks,classifyCell,projection,projectPoint,gridCoordinates,agreesOnFaintGrid} from '../vision.js';

// Render a known paper form through a camera-like perspective transform.
// No image/model/browser dependency: all cell truth is specified before drawing.
function sheet(corners,{blank=false,shadow=false,noise=false,ruleContrast=0}={}){
 const width=1200,height=950,data=new Uint8ClampedArray(width*height*4),transform=projection(corners);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4,v=shadow?225-55*x/width-25*y/height:230;data[i]=v;data[i+1]=v-8;data[i+2]=v-20;data[i+3]=255;}
 function line(u0,v0,u1,v1,ink,thickness=1){const a=projectPoint(transform,u0,v0),b=projectPoint(transform,u1,v1),steps=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)*2);for(let k=0;k<=steps;k++){const x=Math.round(a.x+(b.x-a.x)*k/steps),y=Math.round(a.y+(b.y-a.y)*k/steps);for(let dy=0;dy<thickness;dy++)for(let dx=0;dx<thickness;dx++){const xx=x+dx,yy=y+dy;if(xx<0||xx>=width||yy<0||yy>=height)continue;const i=(yy*width+xx)*4;data[i]=ink[0];data[i+1]=ink[1];data[i+2]=ink[2];}}}
 const rule=ruleContrast?[230-ruleContrast,222-ruleContrast,210-ruleContrast]:[65,60,53],pen=[55,65,92];
 for(let r=0;r<=6;r++)line(-1/36,r/6,1,r/6,rule);
 for(const y of [-.05,-.1])line(-1/36,y,1,y,rule);
 for(let c=-1;c<=36;c++)line(c/36,-.1,c/36,1,rule);
 const expected=Array.from({length:6},(_,r)=>Array.from({length:36},(_,c)=>!blank&&r!==3&&((c+3*r)%5===0||(r+c)%7===0)));
 for(let r=0;r<6;r++)for(let c=0;c<36;c++){
  if(expected[r][c]){line((c+.25)/36,(r+.25)/6,(c+.75)/36,(r+.72)/6,pen,2);line((c+.75)/36,(r+.25)/6,(c+.25)/36,(r+.72)/6,pen,2);}
  else if(noise){const p=projectPoint(transform,(c+.4)/36,(r+.5)/6),i=(Math.round(p.y)*width+Math.round(p.x))*4;data[i]=data[i+1]=data[i+2]=50;}
 }
 return {source:{width,height,getContext:()=>({getImageData:()=>({data})})},expected};
}
const layouts=[
 [{x:150,y:250},{x:1080,y:250},{x:1080,y:800},{x:150,y:800}],
 [{x:180,y:200},{x:1080,y:310},{x:1120,y:830},{x:100,y:740}],
 [{x:150,y:320},{x:1070,y:180},{x:1090,y:760},{x:190,y:840}],
 [{x:230,y:230},{x:1000,y:290},{x:1110,y:840},{x:100,y:780}]
];
for(const [i,corners] of layouts.entries()){
 const {source,expected}=sheet(corners,{shadow:i>0,noise:true}),found=locateGrid(source,6,36);assert.ok(found,`detect perspective ${i}`);
 for(let k=0;k<4;k++)assert.ok(Math.hypot(found.corners[k].x-corners[k].x,found.corners[k].y-corners[k].y)<7,`corner ${k} on perspective ${i}: ${JSON.stringify(found.corners)}`);
 const result=readMarks(source,found.corners,6,36,50,found.binary);assert.deepEqual(result.grid,expected,`X/blank classification on perspective ${i}`);
 for(let r=0;r<6;r++)for(let c=0;c<36;c++){const p=projectPoint(projection(found.corners),(c+.5)/36,(r+.5)/6),uv=gridCoordinates(found.corners,p);assert.ok(Math.abs(uv.u-(c+.5)/36)<1e-8&&Math.abs(uv.v-(r+.5)/6)<1e-8);}
}
const empty=sheet(layouts[1],{blank:true,shadow:true,noise:true}),located=locateGrid(empty.source,6,36);assert.ok(located);assert.equal(readMarks(empty.source,located.corners,6,36,50,located.binary).grid.flat().filter(Boolean).length,0);
// Thin, faded rules with handwriting previously lost enough columns to fail.
for(const blank of [false,true]){
 const {source,expected}=sheet(layouts[0],{ruleContrast:40,noise:true,blank}),found=locateGrid(source,6,36);assert.ok(found,'recover faint printed rules');
 assert.deepEqual(readMarks(source,found.corners,6,36,50,found.binary).grid,expected,'faint rules preserve exact X/blank cells');
}
const candidate={corners:layouts[0],confidence:{matchedColumns:38,columnError:.04,rowError:.01}};
assert.equal(agreesOnFaintGrid(candidate,structuredClone(candidate),6,36),true);
assert.equal(agreesOnFaintGrid(candidate,{...candidate,corners:candidate.corners.map(p=>({...p,x:p.x+26}))},6,36),false,'one-column displacement is not agreement');
assert.equal(agreesOnFaintGrid(candidate,{...candidate,confidence:{...candidate.confidence,matchedColumns:30}},6,36),false,'faint pass needs near-complete rules');
assert.equal(agreesOnFaintGrid(candidate,null,6,36),false,'a single pass cannot approve a faint grid');
const sw=32,sh=64;
for(const kind of ['vertical','horizontal','cross','noise']){
 const pixels=new Uint8Array(sw*sh);
 for(let y=0;y<sh;y++)for(let x=0;x<sw;x++)if((['vertical','cross'].includes(kind)&&x>=13&&x<=16)||(['horizontal','cross'].includes(kind)&&y>=29&&y<=31)||(kind==='noise'&&x%8===0&&y%8===0))pixels[y*sw+x]=1;
 assert.equal(classifyCell(pixels,sw,sh).marked,false,`${kind} must not count as X`);
}
const noPaper={width:300,height:200,getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray(300*200*4).fill(255)})})};assert.equal(locateGrid(noPaper,6,36),null);
console.log('Vision checks passed: perspective/rotation, header exclusion, exact X and blank cells, shadows, grain, printed-rule suppression, and failed detection.');
