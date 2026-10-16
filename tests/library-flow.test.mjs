import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {planSave,parseBackup,localToday} from '../records.js';

// Exercise the real controller with an in-memory cloud and a small event/DOM
// fixture. This performs no browser automation or writes to a real account.
const sourceUrl=new URL('../library.js',import.meta.url);
const html=readFileSync(new URL('./index.html',sourceUrl),'utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.equal(new Set(ids).size,ids.length,'HTML IDs must be unique');
const elements=new Map(ids.map(id=>[id,{
 id,open:false,hidden:false,events:{},classList:{toggle(){}},
 addEventListener(name,fn){this.events[name]=fn;},setAttribute(){},
 showModal(){this.open=true;},close(){this.open=false;}
}]));
const document={hidden:false,addEventListener(){},getElementById(id){assert(elements.has(id),`Missing #${id}`);return elements.get(id);}};
let authChanged,stored=[],written=[],saveError=null,loads=0;
const sandbox={document,window:{addEventListener(){}},setTimeout:fn=>queueMicrotask(fn),setInterval(){},
 cloud:{auth:{onAuthStateChange(fn){authChanged=fn;},signInWithPassword:async()=>({error:{message:'Invalid password'}})}},
 loadDays:async()=>{loads++;return structuredClone(stored);},
 saveDays:async plan=>{if(saveError)throw saveError;written.push(structuredClone(plan));stored=plan.map(r=>({...r,revision:r.expected_revision+1,archived:false}));return stored;},
 archiveDay:async()=>{},check:err=>{if(err)throw Error(err.message);},planSave,parseBackup,localToday,
 createDashboard:()=>({setRecords(){}})
};
const source=readFileSync(sourceUrl,'utf8').replace(/^import .*;\r?\n/gm,'').replace('export function createLibrary','function createLibrary');
vm.runInNewContext(source+'\nglobalThis.controller=createLibrary({edit(){},importDays(){},changed(){}});',sandbox);
const library=sandbox.controller,account=elements.get('accountPanel');
assert.equal(account.open,false);
elements.get('accountBtn').events.click();assert.equal(account.open,true);
elements.get('closeAccount').events.click();assert.equal(account.open,false);
await assert.rejects(library.save([]),/Sign in/);assert.equal(account.open,true);
elements.get('authEmail').value='test@example.invalid';elements.get('authPassword').value='invalid-password';
await elements.get('authForm').events.submit({preventDefault(){}});
assert.equal(elements.get('accountMessage').textContent,'Invalid password','Auth errors must be visible inside the modal');
assert.equal(elements.get('cloudMessage').textContent,'');
authChanged('SIGNED_IN',{user:{id:'owner-1',email:'test@example.invalid'}});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(account.open,false,'Successful sign-in closes the account dialog');
const scan={date:'2026-10-08',rows:['3'],times:['11a','1130a'],grid:[[true,false]],savedDate:'2026-10-08',savedRevision:1,savedOwner:'owner-1'};
stored=[{...scan,grid:[[false,true]],revision:4,archived:true}];
assert.equal(await library.save([scan]),true);
assert.equal(written.length,1,'Existing dates save directly without a replacement dialog');
assert.equal(written[0][0].expected_revision,4,'Replacement uses the latest stored revision');
assert.deepEqual(written[0][0].grid,[[true,false]]);
assert.equal(scan.savedRevision,5);assert.equal(stored[0].archived,false);
assert.equal(account.open,false);
saveError=Error('Concurrent change');
await assert.rejects(library.save([scan]),/Concurrent change/);
assert.equal(scan.savedRevision,5,'A failed save must not advance the local revision');
const before=loads;
await assert.rejects(library.save([{...scan,savedOwner:'another-owner'}]),/another sign-in/);
assert.equal(loads,before,'Foreign-account edits fail before loading or writing records');
authChanged('PASSWORD_RECOVERY',{user:{id:'owner-1'}});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(account.open,true);assert.equal(elements.get('passwordChange').hidden,false);

// Every literal app/controller ID must exist after removing obsolete controls.
for(const file of ['app.js','library.js','dashboard.js']){
 const code=readFileSync(new URL('./'+file,sourceUrl),'utf8');
 for(const [,id] of code.matchAll(/\$\('([^']+)'\)/g))assert(elements.has(id),`${file} references missing #${id}`);
}
console.log('Library flow passed: account dialog, automatic date replacement, latest revisions, write failure and owner isolation.');
