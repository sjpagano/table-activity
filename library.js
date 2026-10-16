import {cloud,loadDays,saveDays,archiveDay,check} from './cloud.js?v=20261016-3';
import {planSave,parseBackup,localToday} from './records.js?v=20261016-3';
import {createDashboard} from './dashboard.js?v=20261016-3';
const $=id=>document.getElementById(id);
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
export function createLibrary({edit,importDays,changed}) {
  let session=null,records=[],generation=0,loading=false,lastRefresh=0;
  const notice=(text,error=false)=>{const target=$('accountPanel').open?'accountMessage':'cloudMessage';for(const id of ['accountMessage','cloudMessage']){$(id).textContent=id===target?text:'';$(id).classList.toggle('error',id===target&&error);}};
  const dashboard=createDashboard({edit:r=>edit({...r,owner:session?.user.id}),archive:async(r,on)=>{try{const owner=session?.user.id;const saved=await archiveDay(r,on);if(owner!==session?.user.id)return;records=records.map(day=>day.date===saved.date?saved:day);dashboard.setRecords(records);await refresh(true);notice(on?'Day archived. Use “Show archived days” to restore it.':'Day restored.');}catch(e){notice(e.message,true);}}});
  function show(view){$('scanView').hidden=view!=='scan';$('dashboardView').hidden=view!=='dashboard';$('scanTab').setAttribute('aria-selected',view==='scan');$('dashboardTab').setAttribute('aria-selected',view==='dashboard');if(view==='dashboard')refresh();}
  const openAccount=()=>{if(!$('accountPanel').open)$('accountPanel').showModal();};
  $('accountBtn').addEventListener('click',openAccount);$('closeAccount').addEventListener('click',()=>$('accountPanel').close());
  $('scanTab').addEventListener('click',()=>show('scan'));$('dashboardTab').addEventListener('click',()=>show('dashboard'));$('beginScan').addEventListener('click',()=>show('scan'));
  async function refresh(force=false) {
    if(!session||loading||!force&&Date.now()-lastRefresh<1500)return;
    const token=generation;loading=true;$('refreshDays').disabled=true;$('syncStatus').textContent='Syncing…';
    try{const days=await loadDays();if(token!==generation)return;records=days;dashboard.setRecords(records);lastRefresh=Date.now();$('syncStatus').textContent=`Synced ${new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`;}
    catch(e){if(token===generation){$('syncStatus').textContent='Sync failed';notice(e.message+' Your unsaved scans have been kept.',true);}}
    finally{loading=false;$('refreshDays').disabled=!session;}
  }
  function updateSession(next,event) {
    const changedUser=session?.user.id!==next?.user.id;session=next;
    if(changedUser){generation++;records=[];lastRefresh=0;dashboard.setRecords([]);}
    $('signedOut').hidden=!!session;$('signedIn').hidden=!session;$('accountEmail').textContent=session?.user.email||'';
    $('backupBtn').disabled=!session;$('refreshDays').disabled=!session;
    if(!session)$('syncStatus').textContent='Sign in to load your saved days';
    if(event==='PASSWORD_RECOVERY'){$('passwordChange').hidden=false;openAccount();}
    if(session){if(event==='SIGNED_IN'&&$('accountPanel').open)$('accountPanel').close();refresh(true);}
    changed();
  }
  cloud.auth.onAuthStateChange((event,next)=>{setTimeout(()=>updateSession(next,event),0);});
  $('authForm').addEventListener('submit',async e=>{e.preventDefault();const button=$('signInBtn');button.disabled=true;notice('Signing in…');try{const {error}=await cloud.auth.signInWithPassword({email:$('authEmail').value.trim(),password:$('authPassword').value});check(error);$('authPassword').value='';notice('Signed in.');}catch(e){notice(e.message,true);}finally{button.disabled=false;}});
  $('signUpBtn').addEventListener('click',async()=>{if(!$('authForm').reportValidity())return;const button=$('signUpBtn');button.disabled=true;try{const {data,error}=await cloud.auth.signUp({email:$('authEmail').value.trim(),password:$('authPassword').value,options:{emailRedirectTo:new URL('./',location.href).href}});check(error);$('authPassword').value='';notice(data.session?'Your sign-in is ready.':'Check your email to confirm your sign-in, then return here.');}catch(e){notice(e.message,true);}finally{button.disabled=false;}});
  $('forgotPassword').addEventListener('click',async()=>{if(!$('authEmail').reportValidity())return;try{const {error}=await cloud.auth.resetPasswordForEmail($('authEmail').value.trim(),{redirectTo:new URL('./',location.href).href});check(error);notice('If that account exists, a reset link has been sent.');}catch(e){notice(e.message,true);}});
  $('newPasswordForm').addEventListener('submit',async e=>{e.preventDefault();try{const {error}=await cloud.auth.updateUser({password:$('newPassword').value});check(error);$('newPassword').value='';$('passwordChange').hidden=true;notice('Password updated.');}catch(e){notice(e.message,true);}});
  $('signOutBtn').addEventListener('click',async()=>{try{const {error}=await cloud.auth.signOut();check(error);notice('Signed out.');}catch(e){notice(e.message,true);}});
  $('refreshDays').addEventListener('click',()=>refresh(true));
  window.addEventListener('focus',()=>refresh(true));document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true);});
  setInterval(()=>{if(!document.hidden&&session)refresh(true);},60000);
  $('backupBtn').addEventListener('click',async()=>{try{if(!session)return;const owner=session.user.id;const days=await loadDays();if(owner!==session?.user.id)throw Error('Your sign-in changed. Try again.');const blob=new Blob([JSON.stringify({format:'table-activity-v1',exported_at:new Date().toISOString(),days},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=`Table Activity backup ${localToday()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);notice(`Backup downloaded: ${days.length} saved and archived days.`);}catch(e){notice(e.message,true);}});
  $('restoreFile').addEventListener('change',async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>20*1024*1024)throw Error('Choose a backup smaller than 20 MB.');const days=parseBackup(await file.text());importDays(days);show('scan');notice(`Loaded ${days.length} days for review. Nothing has been saved yet.`);}catch(e){notice(e.message,true);}});
  async function save(jobs) {
    if(!session){openAccount();throw Error('Sign in before saving your reviewed scans.');}
    if(jobs.length>200)throw Error('Save up to 200 days at a time.');
    const owner=session.user.id;
    if(jobs.some(j=>j.savedOwner&&j.savedOwner!==owner))throw Error('These saved days belong to another sign-in. Sign back into that account to edit them.');
    const existing=await loadDays();
    const plan=planSave(jobs,existing);
    if(owner!==session?.user.id)throw Error('Your sign-in changed. Review the batch again.');
    const saved=await saveDays(plan);
    for(const job of jobs){const record=saved.find(r=>r.date===job.date);job.savedRevision=record.revision;job.savedDate=record.date;job.savedOwner=owner;}
    await refresh(true);notice(`Saved ${saved.length} ${saved.length===1?'day':'days'}. Available on your other devices with the same sign-in.`);return true;
  }
  return {save,show,refresh,signedIn:()=>!!session};
}
