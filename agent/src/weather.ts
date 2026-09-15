// Planetary Kp from NOAA SWPC → settings.space_weather
import { db, must } from '../../lib/db';
import { withRun, fetchJson } from './run';

const label = (kp: number) => kp < 4 ? 'QUIET' : kp < 5 ? 'UNSETTLED' : kp < 6 ? 'G1 MINOR STORM' : kp < 7 ? 'G2 MODERATE STORM' : 'G3+ STRONG STORM';

export async function runWeather() {
  return withRun('weather', async ctx => {
    const rows = await fetchJson('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json') as string[][];
    const last = rows[rows.length - 1];
    const kp = Math.round(Number(last[1]));
    if (!Number.isFinite(kp)) throw new Error('bad Kp payload');
    const value = { line1: `Kp ${kp} · ${label(kp)}`, line2: 'SPACE WEATHER · NOAA SWPC', observed: last[0] };
    must(await db().from('settings').upsert({ key: 'space_weather', value, updated_at: new Date().toISOString() }), 'settings');
    ctx.found = 1; ctx.published = 1; ctx.log.kp = kp;
  });
}
