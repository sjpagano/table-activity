export const DEFAULT_ROWS=['3','5','6','7','8','9'];
export const DEFAULT_TIMES=Array.from({length:36},(_,i)=>{const h=(11+Math.floor(i/2))%24;return `${h%12||12}${i%2?'30':''}${h<12?'a':'p'}`;});
export const blankGrid=(rows,cols)=>Array.from({length:rows},()=>Array(cols).fill(false));
export function totals(grid){const rows=grid.map(r=>r.reduce((s,v)=>s+Number(!!v),0));const cols=(grid[0]||[]).map((_,c)=>grid.reduce((s,r)=>s+Number(!!r[c]),0));return {rows,cols,grand:rows.reduce((a,b)=>a+b,0)};}
export function validDate(y,m,d){if(y<1900||y>2199)return null;const dt=new Date(Date.UTC(y,m-1,d));return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d?`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`:null;}
export function isISODate(s){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s||'');return !!m&&validDate(+m[1],+m[2],+m[3])===s;}
export function parseDates(text){const found=[];const add=(y,m,d)=>{if(y<100)y+=y<70?2000:1900;const v=validDate(y,m,d);if(v&&!found.includes(v))found.push(v);};
 for(const m of String(text).matchAll(/\b(20\d{2}|19\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g))add(+m[1],+m[2],+m[3]);
 for(const m of String(text).matchAll(/\b(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4}|\d{2})\b/g))add(+m[3],+m[1],+m[2]);
 const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
 for(const m of String(text).matchAll(/\b(Jan\w*|Feb\w*|Mar\w*|Apr\w*|May|Jun\w*|Jul\w*|Aug\w*|Sep\w*|Oct\w*|Nov\w*|Dec\w*)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})\b/gi))add(+m[3],months.indexOf(m[1].slice(0,3).toLowerCase())+1,+m[2]);
 return found;
}
export const weekday=date=>isISODate(date)?new Date(date+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'long',timeZone:'UTC'}):'';
// Read only the cropped date line here. Do not let a misread weekday veto a
// clearly written numeric date; keep the conflict visible for review instead.
export function handwritingDate(text){
 const days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
 const token=String(text).match(/\b(Mon(?:day)?|Tue(?:s(?:day)?)?|Wed(?:nesday)?|Thu(?:rs(?:day)?)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)\b/i)?.[1];
 const day=token&&days.find(d=>d.toLowerCase().startsWith(token.slice(0,3).toLowerCase())).toLowerCase();
 const normalized=String(text).replace(/[⁄∕\\|]/g,'/').replace(/(?<=\d)\s*[,;]\s*(?=\d)/g,'/');
 const literal=parseDates(normalized),matching=literal.filter(d=>!day||weekday(d).toLowerCase()===day);
 if(matching.length===1)return {date:matching[0],repaired:normalized!==String(text),day};
 if(literal.length===1)return {date:literal[0],repaired:false,day,weekdayMismatch:true};
 if(literal.length>1)return null;
 const found=new Set();
 for(const token of normalized.replace(/\s*([/.-])\s*/g,'$1').matchAll(/(?<![\w])([\d/Il.\-]{6,12})(?![\w])/g)){
  const s=token[1];
  for(let a=1;a<=2;a++)for(let b=a+2;b<=a+3;b++){
   if(!/[1/|Il.\-]/.test(s[a]||'')||!/[1/|Il.\-]/.test(s[b]||''))continue;
   const normalized=s.slice(0,a)+'/'+s.slice(a+1,b)+'/'+s.slice(b+1);
   for(const d of parseDates(normalized))if((day&&weekday(d).toLowerCase()===day)||(!day&&/[/.\-]/.test(s)))found.add(d);
  }
 }
 return found.size===1?{date:[...found][0],repaired:true,day}:null;
}
export function metadataDate(s){const m=/^(?:D:)?(\d{4})[:\-]?(\d{2})[:\-]?(\d{2})/.exec(s||'');return m?validDate(+m[1],+m[2],+m[3]):null;}
export function excelSerial(date,date1904=false){if(!isISODate(date))throw Error('Choose a valid activity date.');const ms=Date.parse(date+'T00:00:00Z');let n=(ms-Date.UTC(date1904?1904:1899,date1904?0:11,date1904?1:31))/86400000;if(!date1904&&n>=60)n++;return n;}
export function colName(n){let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
export function uniqueSheetName(date,existing){const [y,m,d]=date.split('-');const base=`Table Activity ${+m}.${+d}.${y.slice(2)}`;let name=base,n=2;while(existing.some(s=>s.toLowerCase()===name.toLowerCase())){const suffix=` (${n++})`;name=base.slice(0,31-suffix.length)+suffix;}return name;}
export function exifDate(buffer){try{const v=new DataView(buffer);if(v.getUint16(0)!==0xffd8)return null;let p=2;while(p+4<v.byteLength){if(v.getUint8(p)!==255)break;const marker=v.getUint8(p+1),len=v.getUint16(p+2);if(len<2||p+2+len>v.byteLength)break;if(marker===225&&v.getUint32(p+4)===0x45786966){const t=p+10,little=v.getUint16(t)===0x4949;const u16=o=>v.getUint16(t+o,little),u32=o=>v.getUint32(t+o,little);const readIFD=(offset,depth=0)=>{if(depth>1)return null;const n=u16(offset);let fallback=null;for(let i=0;i<Math.min(n,300);i++){const a=offset+2+i*12,tag=u16(a),count=u32(a+4);if(tag===0x8769){const r=readIFD(u32(a+8),depth+1);if(r)return r;}if([0x9003,0x9004,0x0132].includes(tag)&&u16(a+2)===2&&count>=10&&count<80){const start=t+(count<=4?a+8:u32(a+8));const str=new TextDecoder().decode(new Uint8Array(buffer,start,count));const date=metadataDate(str);if(tag===0x9003&&date)return date;fallback=date||fallback;}}return fallback;};return readIFD(u32(4));}p+=2+len;}return null;}catch{return null;}}
