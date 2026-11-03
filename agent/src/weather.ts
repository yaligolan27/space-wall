// Planetary Kp from NOAA SWPC → settings.space_weather
import { db, must } from '../../lib/db.js';
import { withRun, fetchJson, type RunOpts } from './run.js';

const label = (kp: number) => kp < 4 ? 'QUIET' : kp < 5 ? 'UNSETTLED' : kp < 6 ? 'G1 MINOR STORM' : kp < 7 ? 'G2 MODERATE STORM' : 'G3+ STRONG STORM';

export async function runWeather(opts?: RunOpts) {
  return withRun('weather', async ctx => {
    // NOAA serves rows as objects ({time_tag, Kp}) since late 2026; before that as arrays with a header row.
    const rows = await fetchJson('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json') as any[];
    const last = rows[rows.length - 1];
    const kp = Math.round(Number(Array.isArray(last) ? last[1] : last?.Kp ?? last?.kp_index));
    if (!Number.isFinite(kp)) throw new Error('bad Kp payload');
    const value = { line1: `Kp ${kp} · ${label(kp)}`, line2: 'SPACE WEATHER · NOAA SWPC', observed: Array.isArray(last) ? last[0] : last.time_tag };
    must(await db().from('settings').upsert({ key: 'space_weather', value, updated_at: new Date().toISOString() }), 'settings');
    ctx.found = 1; ctx.published = 1; ctx.log.kp = kp;
    return { kp };
  }, opts);
}
