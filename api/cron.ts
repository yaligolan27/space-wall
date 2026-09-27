// Daily refresh that needs no model: upcoming launches (Launch Library 2) and space weather (NOAA).
// Scheduled in vercel.json; Vercel calls it with `Authorization: Bearer $CRON_SECRET`.
// On the Hobby plan cron runs once a day, which is enough: countdowns are computed in the browser.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runLaunches } from '../agent/src/launches';
import { runWeather } from '../agent/src/weather';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' });
  const out: Record<string, unknown> = {};
  out.launches = await runLaunches();
  out.weather = await runWeather();
  return res.status(200).json({ ok: true, ...out });
}
