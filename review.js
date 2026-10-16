import {isISODate,validDate} from './core.js?v=20261016-3';
import {pointAt,gridCoordinates} from './vision.js?v=20261016-3';

export const REVIEW_PAGE_SIZE=6;
export function reviewPage(jobs,page=0){const pages=Math.max(1,Math.ceil(jobs.length/REVIEW_PAGE_SIZE));page=Math.min(pages-1,Math.max(0,page));return {page,pages,items:jobs.slice(page*REVIEW_PAGE_SIZE,(page+1)*REVIEW_PAGE_SIZE)};}
export function displayDate(iso){return isISODate(iso)?`${+iso.slice(5,7)}/${+iso.slice(8,10)}/${iso.slice(0,4)}`:'';}
export function enteredDate(value){
 let text=value.trim();if(isISODate(text))return text;
 if(/^\d{6}$|^\d{8}$/.test(text))text=`${text.slice(0,2)}/${text.slice(2,4)}/${text.slice(4)}`;
 const m=/^(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/.exec(text);
 if(!m)return null;let year=+m[3];if(m[3].length===2)year+=year<70?2000:1900;
 return validDate(year,+m[1],+m[2]);
}
export function shiftDate(iso,days){if(!isISODate(iso))return null;const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);const result=d.toISOString().slice(0,10);return isISODate(result)?result:null;}
// Use exactly the same perspective transform for recognition, overlay and taps.
export function cellAt(corners,point,rows,cols){
 const coordinates=gridCoordinates(corners,point);if(!coordinates)return null;
 const {u,v}=coordinates;if(u<0||v<0||u>=1||v>=1)return null;
 return {r:Math.floor(v*rows),c:Math.floor(u*cols)};
}
export function drawMarkOverlay(ctx,corners,grid,uncertain=[]){
 const rows=grid.length,cols=grid[0].length,border=Math.max(1,corners[1].x-corners[0].x)/1000,ambiguous=new Set(uncertain);
 ctx.save();
 for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
  const pts=[[c,r],[c+1,r],[c+1,r+1],[c,r+1]].map(([u,v])=>pointAt(corners,u/cols,v/rows));
  ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();
  if(grid[r][c]){ctx.fillStyle='rgba(0,135,235,.24)';ctx.fill();}
  ctx.lineWidth=ambiguous.has(`${r}:${c}`)?border*2:border*.6;ctx.strokeStyle=ambiguous.has(`${r}:${c}`)?'#c67900':'rgba(0,107,176,.55)';ctx.stroke();
  if(grid[r][c]){const p=pointAt(corners,(c+.8)/cols,(r+.15)/rows);ctx.fillStyle='#006fb7';ctx.beginPath();ctx.arc(p.x,p.y,border*2,0,Math.PI*2);ctx.fill();}
 }
 ctx.restore();
}
