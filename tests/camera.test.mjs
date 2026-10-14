import assert from 'node:assert/strict';
import {createCameraSession,captureVideoFrame,captureFiles} from '../camera-session.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((ok,no)=>{resolve=ok;reject=no;});return {promise,resolve,reject};};
function fakeStream(){const track={stopped:false,listeners:{},stop(){this.stopped=true;},addEventListener(name,fn){this.listeners[name]=fn;}};return {track,getTracks:()=>[track],getVideoTracks:()=>[track]};}
function setup(overrides={}){
 const streams=[],frames=[],requests=[];let attached=null;
 const session=createCameraSession({getUserMedia:async constraints=>{requests.push(constraints);const s=fakeStream();streams.push(s);return s;},attachStream:async s=>{attached=s;},detachStream:()=>{attached=null;},captureFrame:async()=>{const b=new Blob([`frame ${frames.length}`],{type:'image/jpeg'});frames.push(b);return b;},now:()=>1791475200000,...overrides});
 return {session,streams,frames,requests,attached:()=>attached};
}
// Multiple shutter presses reuse one camera; recognition has no place in capture.
const a=setup();await a.session.open();assert.equal(a.session.snapshot().status,'live');
assert.equal(a.requests[0].audio,false);assert.equal(a.requests[0].video.facingMode.ideal,'environment');
await a.session.capture();await a.session.capture();await a.session.capture();
assert.equal(a.streams.length,1);assert.equal(a.session.snapshot().count,3);assert.equal(a.streams[0].track.stopped,false);
a.session.undo();assert.equal(a.session.snapshot().count,2);
a.session.pause();assert.equal(a.streams[0].track.stopped,true);assert.equal(a.attached(),null);assert.equal(a.session.snapshot().count,2);assert.equal(await a.session.capture(),false);
await a.session.resume();assert.equal(a.streams.length,2);assert.equal(a.session.snapshot().count,2);
const files=a.session.finish(captureFiles);assert.equal(files.length,2);assert.equal(files[0].type,'image/jpeg');assert.equal(files[0].lastModified,1791475200000);assert.notEqual(files[0].name,files[1].name);assert.equal(await files[1].text(),'frame 1');
assert.equal(a.streams[1].track.stopped,true);assert.equal(a.session.snapshot().count,0);assert.equal(a.session.snapshot().active,false);
// A late camera permission response after closing must immediately stop its tracks.
const permission=deferred(),lateStream=fakeStream();const late=setup({getUserMedia:()=>permission.promise});
const opening=late.session.open();late.session.close();permission.resolve(lateStream);await opening;
assert.equal(lateStream.track.stopped,true);assert.equal(late.attached(),null);assert.equal(late.session.snapshot().status,'closed');
// Permission denial allows retry; interrupted camera retains captured pages.
let attempts=0;const retry=setup({getUserMedia:async()=>{if(!attempts++)throw Object.assign(Error('denied'),{name:'NotAllowedError'});return fakeStream();}});
await assert.rejects(retry.session.open(),/denied/);assert.equal(retry.session.snapshot().status,'paused');await retry.session.resume();await retry.session.capture();
retry.attached().track.listeners.ended();assert.equal(retry.session.snapshot().status,'paused');assert.equal(retry.session.snapshot().count,1);
const playback=setup({attachStream:async()=>{throw Error('playback failed');}});await assert.rejects(playback.session.open(),/playback failed/);assert.equal(playback.streams[0].track.stopped,true);assert.equal(playback.session.snapshot().status,'paused');
// A double tap cannot enqueue the same pending frame twice. Failed encoding recovers.
const encoding=deferred();let calls=0;const pending=setup({captureFrame:()=>{calls++;return encoding.promise;}});await pending.session.open();
const first=pending.session.capture();assert.equal(await pending.session.capture(),false);assert.equal(calls,1);assert.equal(pending.session.undo(),false);assert.equal(pending.session.finish(),null);
encoding.resolve(new Blob(['photo']));await first;assert.equal(pending.session.snapshot().count,1);
const failed=setup({captureFrame:async()=>{throw Error('encode failed');}});await failed.session.open();await assert.rejects(failed.session.capture(),/encode failed/);assert.equal(failed.session.snapshot().busy,false);assert.equal(failed.session.snapshot().count,0);
// Closing while encoding invalidates the result, even if a fresh session opens.
const oldFrame=deferred();const stale=setup({captureFrame:()=>oldFrame.promise});await stale.session.open();const oldCapture=stale.session.capture();stale.session.close();await stale.session.open();oldFrame.resolve(new Blob(['stale']));await oldCapture;assert.equal(stale.session.snapshot().count,0);assert.equal(stale.session.snapshot().status,'live');
// Conversion failure preserves photos; limits preserve the already captured batch.
const limited=setup({maxPages:1,maxBytes:100});await limited.session.open();await limited.session.capture();assert.throws(()=>limited.session.finish(()=>{throw Error('conversion failed');}),/conversion failed/);assert.equal(limited.session.snapshot().count,1);await assert.rejects(limited.session.capture(),/1 pages/);
const memory=setup({maxBytes:1});await memory.session.open();await assert.rejects(memory.session.capture(),/batch is full/);assert.equal(memory.session.snapshot().count,0);assert.equal(memory.session.snapshot().bytes,0);
// Preserve the whole frame and its aspect ratio, cap resolution, and release canvas memory.
let drawn,encoded;const canvas={width:0,height:0,getContext:()=>({drawImage:(...args)=>{drawn=args;}}),toBlob(cb,type,quality){encoded={width:this.width,height:this.height,type,quality};cb(new Blob(['jpeg']));}};
const video={videoWidth:4000,videoHeight:3000,readyState:2};await captureVideoFrame(video,{document:{createElement:()=>canvas}});
assert.deepEqual(drawn,[video,0,0,2200,1650]);assert.deepEqual(encoded,{width:2200,height:1650,type:'image/jpeg',quality:.95});assert.equal(canvas.width,1);assert.equal(canvas.height,1);
await assert.rejects(captureVideoFrame({videoWidth:0,videoHeight:0,readyState:0}),/live picture/);
canvas.toBlob=cb=>cb(null);await assert.rejects(captureVideoFrame(video,{document:{createElement:()=>canvas}}),/Unable to capture/);assert.equal(canvas.width,1);
console.log('Camera checks passed: continuous capture, pause/resume, undo, transfer, denial, interruption, late permissions, duplicate taps, limits and full-frame encoding.');
