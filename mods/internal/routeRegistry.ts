import express from 'express';

const router = express.Router();

// Internal-only: register route
router.post('/register', async (req, res) => {
  // TODO: authenticate (mTLS/HMAC), validate payload
  // Expected body: { agent_id, protocol, host, port, socket_path, tls, meta }
  // Upsert into DB and respond with { route_id, expires_in }
  res.status(201).json({ route_id: null, expires_in: 90 });
});

// heartbeat
router.post('/heartbeat', async (req, res) => {
  // Expected body: { route_id } OR { agent_id, host, port }
  res.json({ route_id: null, expires_in: 90 });
});

// deregister
router.post('/deregister', async (req, res) => {
  res.json({ ok: true });
});

// resolve
router.get('/resolve', async (req, res) => {
  // query: agent_id
  const { agent_id } = req.query;
  if (!agent_id) return res.status(400).json({ error: 'missing agent_id' });
  // TODO: lookup active route(s), apply health/weight selection
  return res.json({ route: null, resolved_at: new Date().toISOString() });
});

// list
router.get('/list', async (req, res) => {
  res.json({ routes: [] });
});

// health-check trigger
router.post('/health-check', async (req, res) => {
  res.json({ checked: true, results: [] });
});

export default router;
