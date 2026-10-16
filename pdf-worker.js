import './compatibility.js?v=20261016-3';
const worker=await import('./vendor/pdf.worker.mjs');
export const WorkerMessageHandler=worker.WorkerMessageHandler;
