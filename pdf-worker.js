import './compatibility.js?v=20261023-2';
const worker=await import('./vendor/pdf.worker.mjs');
export const WorkerMessageHandler=worker.WorkerMessageHandler;
