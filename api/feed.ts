// The wall's content: staff names, ranks, units, photos, birthdays and internal events. Once a display key is set
// (DISPLAY_KEY, or the display_key row of app_settings) the lobby screen must open /?key=<key>; until then the feed
// stays open. The key is read from the URL only: the CDN caches by URL, so a key sent in a header could let a
// cached copy reach a request without one. No CORS header: the wall is served from this origin.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, timingSafeEqual } from 'node:crypto';
import { buildFeed } from '../lib/feed.js';
import { setting } from '../lib/settings.js';
import { feedInEnglish } from '../lib/translate.js';

const digest = (s: string) => createHash('sha256').update(s).digest();
async function keyOk(req: VercelRequest): Promise<boolean> {
  const want = await setting('DISPLAY_KEY', 'display_key');
  if (!want) return true;
  return timingSafeEqual(digest(typeof req.query.key === 'string' ? req.query.key : ''), digest(want));   // same length: constant time
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!(await keyOk(req))) return res.status(401).json({ error: 'unauthorized' });
    const feed = await buildFeed();
    // ?lang=en: the wall in English (the remote's switch). Text with no English yet stays Hebrew, and that answer is
    // cached only briefly, so the next poll picks up what the model has finished meanwhile.
    if (req.query.lang === 'en') {
      const en = await feedInEnglish(feed, 12e3);
      res.setHeader('Cache-Control', en.translated.missing ? 's-maxage=5' : 's-maxage=60, stale-while-revalidate=300');
      return res.status(200).json(en);
    }
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(feed);
  } catch (e: any) {
    console.error('feed failed', e);
    return res.status(500).json({ error: e?.message || 'feed failed' });
  }
}
