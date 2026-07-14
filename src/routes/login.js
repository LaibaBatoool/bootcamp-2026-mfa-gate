// src/routes/login.js (updated for Temporal)
const express = require('express');
const router = express.Router();
const { Connection, Client } = require('@temporalio/client');
const { getUserById } = require('../users');

async function getTemporalClient() {
  const connection = await Connection.connect({ address: 'localhost:7233' });
  return new Client({ connection });
}

router.post('/', async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  if (!getUserById(userId)) {
    return res.status(404).json({ error: `No user found with id ${userId}` });
  }
  try {
    const client = await getTemporalClient();

    // Start the workflow — Temporal assigns it a unique ID
    const workflowId = `mfa-login-${userId}-${Date.now()}`;

    const handle = await client.workflow.start('mfaLoginWorkflow', {
      taskQueue: 'mfa-gate',
      workflowId,
      args: [userId],
    });

    console.log(`[routes/login] Started workflow ${workflowId} for user ${userId}`);

    res.status(201).json({
      workflowId,
      message: 'PIN sent to registered device',
    });
  } catch (err) {
    console.error('[routes/login] Error starting workflow:', err.message);
    res.status(404).json({ error: err.message });
  }
});

module.exports = router;