// Seoul-Tokyo 2026 trip app — crew proposals & voting API
// Storage: Upstash Redis via Vercel marketplace (env vars auto-injected)
const KEY = 'st26:proposals';
const FAMILIES = ['Clearwaters', 'Brysons', 'Becksteads'];

const REST_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function redis(cmd) {
  const r = await fetch(REST_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    let list = JSON.parse((await redis(['GET', KEY])) || '[]');

    if (req.method === 'POST') {
      const b = typeof req.body === 'object' && req.body ? req.body : {};

      if (b.action === 'propose') {
        if (list.filter((p) => p.status === 'pending').length >= 30)
          return res.status(429).json({ error: 'too many pending proposals' });
        list.push({
          id: Math.random().toString(36).slice(2, 10),
          ts: Date.now(),
          by: String(b.by || '?').slice(0, 30),
          family: FAMILIES.includes(b.family) ? b.family : '?',
          title: String(b.title || 'Schedule change').slice(0, 140),
          note: String(b.note || '').slice(0, 300),
          dayId: String(b.dayId || '').slice(0, 8),
          order: Array.isArray(b.order) ? b.order.slice(0, 40).map(String) : null,
          extra: Array.isArray(b.extra) ? b.extra.slice(0, 20).map(Number) : null,
          votes: FAMILIES.includes(b.family) ? { [b.family]: 1 } : {},
          status: 'pending',
        });
      } else if (b.action === 'vote') {
        const p = list.find((p) => p.id === b.id);
        if (p && p.status === 'pending' && FAMILIES.includes(b.family)) {
          p.votes[b.family] = b.vote > 0 ? 1 : -1;
          const vals = Object.values(p.votes);
          const yes = vals.filter((v) => v > 0).length;
          const no = vals.filter((v) => v < 0).length;
          if (yes >= 2) p.status = 'approved';
          else if (no >= 2) p.status = 'rejected';
        }
      } else if (b.action === 'withdraw') {
        const p = list.find((p) => p.id === b.id);
        if (p && p.status === 'pending' && p.family === b.family) p.status = 'withdrawn';
      }

      await redis(['SET', KEY, JSON.stringify(list)]);
    }

    res.status(200).json({ proposals: list });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
};
