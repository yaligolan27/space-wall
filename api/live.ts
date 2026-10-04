// The wall's live state: design, brightness, urgent banner and the full-screen moment set from the remote.
// Polled by the wall every few seconds (the content feed, /api/feed, stays on its one-minute cycle).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { live } from '../lib/remote-ops.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const key = process.env.DISPLAY_KEY;
  if (key) {
    const given = (req.query.key as string) || (req.headers['x-display-key'] as string) || '';
    if (given !== key) return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const body = await live();
    res.setHeader('Cache-Control', 's-maxage=4, stale-while-revalidate=10');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(body);
  } catch (e: any) {
    console.error('live failed', e);
    return res.status(500).json({ error: e?.message || 'live failed' });
  }
}
