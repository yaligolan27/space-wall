// The wall's live state: design, brightness, urgent banner and the full-screen moment set from the remote.
// Polled by the wall every few seconds (the content feed, /api/feed, stays on its one-minute cycle).
// Same access rule as /api/feed: once a display key is set, ?key=<key> is required (URL only, compared in constant
// time); no CORS header, the wall is served from this origin.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, timingSafeEqual } from 'node:crypto';
import { live } from '../lib/remote-ops.js';
import { setting } from '../lib/settings.js';
import { liveInEnglish } from '../lib/translate.js';

const digest = (s: string) => createHash('sha256').update(s).digest();
async function keyOk(req: VercelRequest): Promise<boolean> {
  const want = await setting('DISPLAY_KEY', 'display_key');
  if (!want) return true;
  return timingSafeEqual(digest(typeof req.query.key === 'string' ? req.query.key : ''), digest(want));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!(await keyOk(req))) return res.status(401).json({ error: 'unauthorized' });
    // ?lang=en (the wall in English): the urgent banner and a full-screen moment's text, translated once and cached.
    const body = req.query.lang === 'en' ? await liveInEnglish(await live(), 6e3) : await live();
    res.setHeader('Cache-Control', 's-maxage=4, stale-while-revalidate=10');
    return res.status(200).json(body);
  } catch (e: any) {
    console.error('live failed', e);
    return res.status(500).json({ error: e?.message || 'live failed' });
  }
}
