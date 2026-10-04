// Daily refresh that needs no model: upcoming launches (Launch Library 2), space weather (NOAA)
// and the weekly Rakia newsletter (imported once, the first run after a new issue is published).
// Scheduled in vercel.json; Vercel calls it with `Authorization: Bearer $CRON_SECRET`.
// On the Hobby plan cron runs once a day, which is enough: countdowns are computed in the browser.
// The three steps run side by side and each is bounded by its fetch timeouts (20 s; the newsletter's two pages
// 15 s each), so even with every upstream hanging the run ends near 30 s, inside the function's 60 s, and every
// agent_runs row gets closed. The answer reports each step; ok is false (HTTP 500) when any of them failed.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runLaunches } from '../agent/src/launches.js';
import { runWeather } from '../agent/src/weather.js';
import { runNewsletter } from '../agent/src/newsletter.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' });
  const strict = { throwErrors: true };
  const steps = { launches: runLaunches(strict), weather: runWeather(strict), newsletter: runNewsletter(false, strict) };
  const settled = await Promise.allSettled(Object.values(steps));
  const out = Object.fromEntries(Object.keys(steps).map((name, i) => {
    const r = settled[i];
    return [name, r.status === 'fulfilled' ? { ok: true, result: r.value ?? null } : { ok: false, error: String(r.reason?.message || r.reason) }];
  }));
  const ok = settled.every(r => r.status === 'fulfilled');
  return res.status(ok ? 200 : 500).json({ ok, ...out });
}
