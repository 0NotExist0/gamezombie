// Vercel Serverless Function: Persistent Game Checkpoints
// Endpoint: /api/checkpoint (GET & POST)

let serverCheckpoint = {
  version: 1,
  savedAt: Date.now(),
  hostId: null,
  zombiesDefeated: 0,
  gemsCollected: 0,
  zombies: []
};

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      let body = req.body;
      if (typeof body === 'string') {
        body = JSON.parse(body);
      }
      if (body && typeof body === 'object') {
        serverCheckpoint = {
          ...serverCheckpoint,
          ...body,
          serverSavedAt: Date.now()
        };
        return res.status(200).json({
          ok: true,
          savedAt: serverCheckpoint.serverSavedAt,
          zombiesDefeated: serverCheckpoint.zombiesDefeated
        });
      }
    } catch (err) {
      return res.status(400).json({ ok: false, error: 'Invalid payload' });
    }
  }

  // GET: return latest saved checkpoint
  return res.status(200).json(serverCheckpoint);
}
