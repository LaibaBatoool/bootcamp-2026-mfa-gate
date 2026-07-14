// src/temporal/worker.js
//
// The Temporal Worker — the process that actually executes Workflows
// and Activities. It connects to the Temporal server (localhost:7233)
// and polls for work to do.
//
// Run this in a SEPARATE terminal alongside your Express server:
//   node src/temporal/worker.js

const { Worker } = require('@temporalio/worker');
const path = require('path');

async function runWorker() {
  const worker = await Worker.create({
    workflowsPath: path.resolve(__dirname, './workflow.js'),
    activities: require('./activities'),
    taskQueue: 'mfa-gate',
  });

  console.log('[temporal/worker] Worker started, polling for tasks...');
  await worker.run();
}

runWorker().catch((err) => {
  console.error('[temporal/worker] Worker failed:', err);
  process.exit(1);
});