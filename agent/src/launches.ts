// Upcoming launches from Launch Library 2 (The Space Devs), site names translated to Hebrew once and cached.
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { db, must } from '../../lib/db';
import { claude, MODEL, addUsage } from '../../lib/claude';
import { withRun, fetchJson } from './run';

const LL2 = 'https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=20&mode=normal';
const ACTOR: Record<string, string> = { USA: 'us', RUS: 'ru', CHN: 'cn', ISR: 'il', FRA: 'eu', GUF: 'eu', DEU: 'eu', ITA: 'eu', NOR: 'eu', GBR: 'eu', SWE: 'eu' };
const Translations = z.object({ items: z.array(z.object({ key: z.string(), he: z.string() })) });

export async function runLaunches() {
  return withRun('launches', async ctx => {
    const s = db();
    const data = await fetchJson(LL2);
    const items = (data.results || []) as any[];
    ctx.found = items.length;
    const sites = [...new Set(items.map(l => l.pad?.location?.name).filter(Boolean))] as string[];
    const have = must(await s.from('translations').select('key,he').in('key', sites), 'translations') as { key: string; he: string }[];
    const missing = sites.filter(k => !have.some(h => h.key === k));
    if (missing.length) {
      const res = await claude().messages.parse({
        model: MODEL, max_tokens: 2000,
        messages: [{ role: 'user', content: `תרגם שמות אתרי שיגור לעברית קצרה לצג (למשל "Vandenberg SFB, CA, USA" → "ונדנברג, קליפורניה"; "Wenchang Space Launch Site, People's Republic of China" → "וונצ׳אנג, סין"). החזר key זהה למקור.\n${missing.join('\n')}` }],
        output_config: { format: zodOutputFormat(Translations), effort: 'low' },
      });
      addUsage(ctx.usage, res);
      const tr = res.parsed_output?.items || [];
      if (tr.length) must(await s.from('translations').upsert(tr), 'translations');
      have.push(...tr);
    }
    const he = (k: string | undefined) => have.find(h => h.key === k)?.he || k || '';
    const rows = items.map(l => {
      const cc = l.launch_service_provider?.country?.[0]?.alpha_3_code || l.pad?.country?.alpha_3_code || '';
      const vehicle = l.rocket?.configuration?.name || l.name;
      const mission = l.mission?.name || l.name.split('|').pop()?.trim() || '';
      return { id: l.id, name: mission && mission !== vehicle ? `${vehicle} · ${mission}` : l.name, provider: l.launch_service_provider?.name, vehicle, mission, site_en: l.pad?.location?.name, site_he: he(l.pad?.location?.name), net: l.net, status: l.status?.abbrev, actor: ACTOR[cc] || 'other', updated_at: new Date().toISOString() };
    });
    if (rows.length) must(await s.from('launches').upsert(rows), 'launches');
    ctx.published = rows.length;
  });
}
