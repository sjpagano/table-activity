import assert from 'node:assert/strict';
import {installStreamIteration} from '../compatibility.js';
class OlderStream {
  constructor(stream) { this.stream = stream; }
  getReader() { return this.stream.getReader(); }
}
installStreamIteration(OlderStream);
const stream = new ReadableStream({start(c) {c.enqueue('date'); c.enqueue('marks'); c.close();}});
const values = [];
for await (const chunk of new OlderStream(stream)) values.push(chunk);
assert.deepEqual(values, ['date', 'marks']);
assert.equal(stream.locked, false);
let cancelled = false;
const early = new ReadableStream({start(c) {c.enqueue(1);}, cancel() {cancelled = true;}});
for await (const chunk of new OlderStream(early)) break;
assert.equal(cancelled, true); assert.equal(early.locked, false);
const retained = new ReadableStream({start(c) {c.enqueue(1); c.enqueue(2); c.close();}});
for await (const chunk of new OlderStream(retained).values({preventCancel:true})) break;
assert.equal(retained.locked, false);
assert.equal((await retained.getReader().read()).value, 2);
const failed = new ReadableStream({start(c) {c.error(Error('read failed'));}});
await assert.rejects(async()=>{for await (const c of new OlderStream(failed)) {}}, /read failed/);
assert.equal(failed.locked, false);
const native = ReadableStream.prototype[Symbol.asyncIterator];
installStreamIteration(ReadableStream); assert.equal(ReadableStream.prototype[Symbol.asyncIterator], native);
console.log('Stream compatibility: data, cancellation, retained streams, errors and native support passed.');
