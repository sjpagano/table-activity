import './compatibility.js?v=20261013-1';
const worker=await import('./vendor/pdf.worker.mjs');
export const WorkerMessageHandler=worker.WorkerMessageHandler;
