import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildFeed } from '../lib/feed';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const key = process.env.DISPLAY_KEY;
  if (key) {
    const given = (req.query.key as string) || (req.headers['x-display-key'] as string) || '';
    if (given !== key) return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const feed = await buildFeed();
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(feed);
  } catch (e: any) {
    console.error('feed failed', e);
    return res.status(500).json({ error: e?.message || 'feed failed' });
  }
}
