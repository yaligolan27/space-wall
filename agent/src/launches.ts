// Upcoming launches from Launch Library 2 (The Space Devs). No model: site names come from a
// keyword dictionary, and anything unmatched keeps its English name and can be fixed by hand
// in the `translations` table.
import { db, must } from '../../lib/db';
import { withRun, fetchJson, type RunCtx } from './run';

const LL2 = 'https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=20&mode=normal';

const ACTOR_BY_COUNTRY: Record<string, string> = {
  USA: 'us', RUS: 'ru', CHN: 'cn', ISR: 'il', PRK: 'other', IRN: 'other', IND: 'other', JPN: 'other',
  FRA: 'eu', GUF: 'eu', DEU: 'eu', ITA: 'eu', NOR: 'eu', GBR: 'eu', SWE: 'eu', ESP: 'eu', NLD: 'eu',
};

/** Longest match wins, so "Cape Canaveral" beats a bare "USA". */
const SITE_HE: [string, string][] = [
  ['cape canaveral', 'קייפ קנוורל, פלורידה'],
  ['kennedy space center', 'קנדי, פלורידה'],
  ['vandenberg', 'ונדנברג, קליפורניה'],
  ['starbase', 'סטארבייס, טקסס'],
  ['wallops', 'וולופס, וירג׳יניה'],
  ['kodiak', 'קודיאק, אלסקה'],
  ['baikonur', 'באיקונור, קזחסטן'],
  ['plesetsk', 'פלסצק, רוסיה'],
  ['vostochny', 'ווסטוצ׳ני, רוסיה'],
  ['kapustin yar', 'קפוסטין יאר, רוסיה'],
  ['jiuquan', 'ג׳יוצ׳ואן, סין'],
  ['taiyuan', 'טאייואן, סין'],
  ['xichang', 'שיצ׳אנג, סין'],
  ['wenchang', 'וונצ׳אנג, סין'],
  ['haiyang', 'האייאנג, סין'],
  ['guiana', 'קורו, גיאנה הצרפתית'],
  ['kourou', 'קורו, גיאנה הצרפתית'],
  ['andoya', 'אנדויה, נורווגיה'],
  ['esrange', 'אסראנג׳, שוודיה'],
  ['saxavord', 'סקסהוורד, סקוטלנד'],
  ['satish dhawan', 'סאטיש דהאוואן, הודו'],
  ['sriharikota', 'סאטיש דהאוואן, הודו'],
  ['mahia', 'מהיה, ניו זילנד'],
  ['launch complex 1', 'מהיה, ניו זילנד'],
  ['tanegashima', 'טנגשימה, יפן'],
  ['uchinoura', 'אוצ׳ינאורה, יפן'],
  ['naro', 'נארו, קוריאה הדרומית'],
  ['semnan', 'סמנאן, איראן'],
  ['imam khomeini', 'אימאם חומייני, איראן'],
  ['shahroud', 'שאהרוד, איראן'],
  ['sohae', 'סוהה, קוריאה הצפונית'],
  ['palmachim', 'פלמחים, ישראל'],
];

function siteHe(name: string | undefined, overrides: Map<string, string>): string {
  if (!name) return '';
  if (overrides.has(name)) return overrides.get(name)!;
  const lower = name.toLowerCase();
  let best = '';
  let bestLen = 0;
  for (const [needle, he] of SITE_HE) {
    if (lower.includes(needle) && needle.length > bestLen) { best = he; bestLen = needle.length; }
  }
  return best || name;
}

export async function runLaunches() {
  return withRun('launches', async (ctx: RunCtx) => {
    const s = db();
    const data = await fetchJson(LL2);
    const items = (data.results || []) as any[];
    ctx.found = items.length;
    if (!items.length) return 0;

    // Hand-written overrides live in `translations`; they win over the dictionary.
    const overrideRows = must(await s.from('translations').select('key,he'), 'translations') as { key: string; he: string }[];
    const overrides = new Map(overrideRows.map(r => [r.key, r.he]));

    const unmatched: string[] = [];
    const rows = items.map(l => {
      const cc = l.launch_service_provider?.country?.[0]?.alpha_3_code || l.pad?.country?.alpha_3_code || '';
      const vehicle = l.rocket?.configuration?.name || l.name;
      const mission = l.mission?.name || l.name.split('|').pop()?.trim() || '';
      const siteEn = l.pad?.location?.name as string | undefined;
      const he = siteHe(siteEn, overrides);
      if (siteEn && he === siteEn) unmatched.push(siteEn);
      return {
        id: l.id,
        name: mission && mission !== vehicle ? `${vehicle} · ${mission}` : l.name,
        provider: l.launch_service_provider?.name ?? null,
        vehicle, mission,
        site_en: siteEn ?? null,
        site_he: he,
        net: l.net,
        status: l.status?.abbrev ?? null,
        actor: ACTOR_BY_COUNTRY[cc] || 'other',
        updated_at: new Date().toISOString(),
      };
    });
    must(await s.from('launches').upsert(rows), 'launches');
    // Drop launches that have slipped out of the window so the footer never shows stale rows.
    must(await s.from('launches').delete().lt('net', new Date(Date.now() - 7 * 86400e3).toISOString()).select('id'), 'prune');
    ctx.published = rows.length;
    if (unmatched.length) ctx.log.untranslated_sites = [...new Set(unmatched)];
    return rows.length;
  });
}
