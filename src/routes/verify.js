// src/routes/verify.js (updated for Temporal)
const express = require('express');
const router = express.Router();
const { Connection, Client } = require('@temporalio/client');
const { verifyTotp } = require('../totpService');

let temporalClientPromise;

async function getTemporalClient() {
  if (!temporalClientPromise) {
    temporalClientPromise = (async () => {
      const connection = await Connection.connect({
        address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
      });
      return new Client({ connection });
    })();
  }
  return temporalClientPromise;
}

router.post('/', async (req, res) => {
  const { workflowId, pin, userId, totp } = req.body;

  // TOTP path — unchanged, still stateless
  if (userId && totp) {
    try {
      const isValid = await verifyTotp(userId, totp);
      if (isValid) return res.status(200).json({ success: true, method: 'totp' });
      return res.status(401).json({ success: false, reason: 'INVALID_TOTP' });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  // PIN path — send signal to the running Temporal workflow
  if (workflowId && pin) {
    try {
      const client = await getTemporalClient();
      const handle = client.workflow.getHandle(workflowId);

      // Send the PIN to the workflow via signal
      await handle.signal('submitPin', pin);

      // Wait briefly for the workflow to process the signal and complete
      const result = await handle.result();

      const statusCode = result.success ? 200 : 401;
      return res.status(statusCode).json({ ...result, method: 'pin' });
    } catch (err) {
      console.error('[routes/verify] Error signalling workflow:', err.message);
      return res.status(400).json({ error: err.message });
    }
  }

  return res.status(400).json({
    error: 'Provide either { workflowId, pin } or { userId, totp }',
  });
});

module.exports = router;