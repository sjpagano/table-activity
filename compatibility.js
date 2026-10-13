// Safari versions that support streams may still lack asynchronous iteration.
// PDF.js and the handwriting model both consume streams with `for await`.
export function installStreamIteration(Stream = globalThis.ReadableStream) {
  if (!Stream || typeof Symbol.asyncIterator === 'undefined') return;
  if (!Stream.prototype.values) {
    Object.defineProperty(Stream.prototype, 'values', { configurable: true, writable: true,
      value: async function* ({ preventCancel = false } = {}) {
        const reader = this.getReader();
        let finished = false;
        try {
          while (true) {
            const result = await reader.read();
            if (result.done) { finished = true; return; }
            yield result.value;
          }
        } finally {
          try { if (!finished && !preventCancel) await reader.cancel(); }
          finally { reader.releaseLock(); }
        }
      }
    });
  }
  if (!Stream.prototype[Symbol.asyncIterator]) {
    Object.defineProperty(Stream.prototype, Symbol.asyncIterator, {
      configurable: true, writable: true, value: Stream.prototype.values
    });
  }
}
installStreamIteration();
