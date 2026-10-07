// English for the wall (the remote's "English" switch, for visiting delegations). The wall's own labels are
// translated in app/src/wall.js; what changes (newsletter items, events, ticker, launches, people's moments, the
// urgent banner) is translated here with Claude through the remote agent's API key, once per text: translations
// are kept in memory and in the `settings` row `translations_en`, so the wall asks the model only about new text.
// Fixed vocabulary (event kinds, weekdays, months, launch statuses, moment types) never reaches the model.
// What is sent is only what the wall already shows in public; people's contact details, notes and survey answers
// are never part of the feed, so they never reach the model either.
// When there is no key, or the model is slow or down, the text stays in Hebrew and the next request tries again.
import { db } from './db.js';
import { setting } from './settings.js';
import { DOW, MON } from './feed.js';

const API = () => (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '');
const DEFAULT_MODEL = 'claude-sonnet-5-5';     // the remote agent's default (lib/remote-agent.ts); agent_model wins
const CACHE_ROW = 'translations_en';
const MAX_ENTRIES = 4000;                       // oldest dropped first
const CHUNK = 40;                               // texts per model call

export const hasHebrew = (s: unknown): s is string => typeof s === 'string' && /[֐-׿]/.test(s);

// ---- fixed vocabulary ----------------------------------------------------------------------------------------
const EN_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EN_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const FIXED: Record<string, string> = {
  ...Object.fromEntries(DOW.map((d, i) => [d, EN_DOW[i]])),
  ...Object.fromEntries(MON.map((m, i) => [m, EN_MON[i]])),
  'אירוע': 'Event', 'הזדמנות': 'Opportunity',
  // lifeCard's chip labels (lib/feed.ts LIFE); overlays.js greets by these
  'יום הולדת': 'Birthday', 'מזל טוב': 'Congratulations', 'עלייה בדרגה': 'Promotion', 'שחרור': 'Farewell',
  'ברוכים הבאים': 'Welcome', 'משתתפים בצער': 'Condolences',
};
/** Launch Library's status code → the chip, as lib/feed.ts LAUNCH_STATUS does in Hebrew. */
const LAUNCH_EN: Record<string, string> = { Go: 'Go', Hold: 'On hold', 'In Flight': 'In flight', Success: 'Launched', Failure: 'Failure', 'Partial Failure': 'Partial failure' };

// ---- the cache ---------------------------------------------------------------------------------------------------
const mem = new Map<string, string>();
let loadedAt = 0;
async function loadCache(): Promise<void> {
  if (Date.now() - loadedAt < 60e3) return;
  const r = await db().from('settings').select('value').eq('key', CACHE_ROW).maybeSingle();
  if (r.error) return;
  loadedAt = Date.now();
  for (const [k, v] of Object.entries((r.data?.value as Record<string, string>) || {})) if (typeof v === 'string' && !mem.has(k)) mem.set(k, v);
}
/** Adds to the stored row (read again first: another instance may have added its own). Best effort. */
async function saveCache(add: Record<string, string>): Promise<void> {
  try {
    const r = await db().from('settings').select('value').eq('key', CACHE_ROW).maybeSingle();
    if (r.error) return;
    const all = { ...((r.data?.value as Record<string, string>) || {}) };
    for (const [k, v] of Object.entries(add)) { delete all[k]; all[k] = v; }   // re-added = newest
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete all[k];
    await db().from('settings').upsert({ key: CACHE_ROW, value: all, updated_at: new Date().toISOString() });
  } catch (e) { console.warn('translation cache not saved', e); }
}

// ---- the model -------------------------------------------------------------------------------------------------
const INSTRUCTIONS = `You translate the text of a large lobby display at the Space Program Office (מנהלת החלל, Israel, Ministry of Defense) into English, for visiting foreign delegations.
Each item is one piece of on-screen text: a news headline or summary, a category, an event name or place, a launch mission or site, a person's name, a short greeting line, or an announcement.
- Natural, concise English that fits the same space on screen. Keep the tone: news reads like news, greetings warm.
- People's names: transliterate them in their common English spelling (דנה כהן → Dana Cohen). A military rank before a name becomes its English abbreviation: טוראי Pvt., רב"ט Cpl., סמל Sgt., סמ"ר SSgt., רס"ל SFC, רס"ר MSgt., רס"מ SgtMaj., רס"ב CWO, סג"ם 2nd Lt., סגן Lt., סרן Capt., רס"ן Maj., סא"ל Lt. Col., אל"ם Col., תא"ל Brig. Gen., אלוף Maj. Gen.
- Known organizations and programs by their official English names (סוכנות החלל הישראלית → Israel Space Agency, התעשייה האווירית → Israel Aerospace Industries, רקיע → Rakia, מנהלת החלל or המנהלת → the Space Program Office).
- Keep numbers, dates, times, URLs and the separators · – | exactly as they are. Text already in English stays as it is.
- Gendered Hebrew forms like חוגג/ת become plain English ("celebrating").
Return every item with its id and the English text.`;

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'en'], properties: { id: { type: 'integer' }, en: { type: 'string' } } } } },
};

async function askModel(key: string, model: string, texts: string[], timeoutMs: number): Promise<Record<string, string>> {
  const res = await fetch(API() + '/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model, max_tokens: 16000, system: INSTRUCTIONS,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: JSON.stringify(texts.map((text, id) => ({ id, text }))) }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`translation failed (HTTP ${res.status}): ${j?.error?.message || ''}`);
  if (j.stop_reason === 'refusal') throw new Error('translation refused');
  const text = (j.content || []).find((b: any) => b.type === 'text')?.text || '';
  const out: Record<string, string> = {};
  for (const it of JSON.parse(text).items || []) {
    const src = texts[it.id];
    if (src !== undefined && typeof it.en === 'string' && it.en.trim() && !hasHebrew(it.en)) out[src] = it.en.trim();
  }
  return out;
}

/** Texts already being translated by this instance, so the wall's polls don't ask twice. */
const inFlight = new Map<string, Promise<void>>();

export type Translated = { get: (s: string) => string; missing: number; error: string };

/** English for each Hebrew text: fixed words, the cache, else Claude (within `budgetMs`). A text with no English yet
 *  comes back as it is, and `missing` counts them. Never throws. */
export async function translateAll(texts: Iterable<string>, budgetMs: number): Promise<Translated> {
  let error = '';
  const want = [...new Set([...texts].filter(hasHebrew))].filter(t => !FIXED[t]);
  try { await loadCache(); } catch (e) { console.warn('translation cache not loaded', e); }
  let todo = want.filter(t => !mem.has(t));
  if (todo.length) {
    const key = await setting('ANTHROPIC_API_KEY', 'anthropic_api_key').catch(() => '');
    if (!key) error = 'no-key';
    else {
      const waits = todo.filter(t => inFlight.has(t)).map(t => inFlight.get(t)!);
      const mine = todo.filter(t => !inFlight.has(t));
      const model = (await setting('AGENT_MODEL', 'agent_model').catch(() => '')) || DEFAULT_MODEL;
      const runs: Promise<void>[] = [];
      for (let i = 0; i < mine.length; i += CHUNK) {
        const part = mine.slice(i, i + CHUNK);
        const run = askModel(key, model, part, budgetMs).then(async (got) => { for (const [k, v] of Object.entries(got)) mem.set(k, v); if (Object.keys(got).length) await saveCache(got); })
          .catch((e) => { console.warn(String(e?.message || e)); error = error || String(e?.name === 'TimeoutError' ? 'timeout' : e?.message || e); })
          .finally(() => { for (const t of part) inFlight.delete(t); });
        for (const t of part) inFlight.set(t, run);
        runs.push(run);
      }
      // Calls still running when the budget ends finish in the background (for the next request) where the
      // platform lets them; this request answers with what is ready.
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([Promise.allSettled([...runs, ...waits]), new Promise(r => { timer = setTimeout(r, budgetMs); })]);
      clearTimeout(timer);
      todo = want.filter(t => !mem.has(t));
    }
  }
  return { get: (s: string) => (typeof s === 'string' ? FIXED[s] || mem.get(s) || s : s), missing: todo.length, error };
}

// ---- the feed and the live state in English ------------------------------------------------------------------------
type Row = Record<string, any>;

/** The wall's feed (lib/feed.ts buildFeed) in English. */
export async function feedInEnglish(feed: Row, budgetMs: number): Promise<Row & { translated: { missing: number; error: string } }> {
  const texts: string[] = [];
  const add = (...v: unknown[]) => { for (const s of v) if (hasHebrew(s)) texts.push(s); };
  add(feed.issue?.range, ...(feed.summary || []));
  for (const n of feed.news || []) add(n.cat, n.title, n.dek, n.src, n.date);
  for (const t of feed.ticker || []) add(t.kind, t.date, t.name);
  for (const l of feed.launches || []) add(l.mission, l.vehicle, l.siteEn ? '' : l.site);
  // An occasion the office kept as added carries its English name (occ.en, lib/occasions.ts); one it renamed is translated.
  for (const d of feed.directorate || []) add(d.occ?.en ? '' : d.name, d.place, d.dow, d.mon);
  for (const o of feed.occasions || []) add(o.en ? '' : o.title);
  for (const p of feed.people || []) add(p.type, p.name, p.line);
  const T = await translateAll(texts, budgetMs), t = T.get;

  const recolor = (m: Row = {}) => Object.fromEntries(Object.entries(m).map(([k, v]) => [t(k), v]));
  return {
    ...feed,
    lang: 'en',
    issue: { ...feed.issue, range: t(feed.issue?.range) },
    summary: (feed.summary || []).map(t),
    news: (feed.news || []).map((n: Row) => ({ ...n, cat: t(n.cat), title: t(n.title), dek: t(n.dek), src: t(n.src), date: t(n.date) })),
    catColor: { ...feed.catColor, ...recolor(feed.catColor) },
    catImage: { ...feed.catImage, ...recolor(feed.catImage) },
    ticker: (feed.ticker || []).map((x: Row) => ({ ...x, kind: t(x.kind), date: t(x.date), name: t(x.name) })),
    launches: (feed.launches || []).map((l: Row) => ({ ...l, mission: t(l.mission), vehicle: t(l.vehicle), site: l.siteEn || t(l.site), status: LAUNCH_EN[l.code] || 'TBD' })),
    directorate: (feed.directorate || []).map((d: Row) => ({ ...d, name: d.occ?.en || t(d.name), place: t(d.place), dow: t(d.dow), mon: t(d.mon) })),
    occasions: (feed.occasions || []).map((o: Row) => ({ ...o, title: o.en || t(o.title), greet: o.greetEn })),
    people: (feed.people || []).map((p: Row) => ({ ...p, type: t(p.type), name: t(p.name), line: t(p.line) })),
    translated: { missing: T.missing, error: T.error },
  };
}

/** The live state (lib/remote-ops.ts live) in English: the urgent banner and the full-screen moment's text. */
export async function liveInEnglish(L: Row, budgetMs: number): Promise<Row> {
  const tk = L.takeover, p = tk?.person;
  const T = await translateAll([L.urgent, tk?.title, tk?.place, p?.type, p?.name, p?.line].filter(hasHebrew), budgetMs), t = T.get;
  return {
    ...L, lang: 'en', urgent: L.urgent ? t(L.urgent) : L.urgent,
    takeover: !tk ? tk : { ...tk, ...(tk.title ? { title: t(tk.title) } : {}), ...(tk.place ? { place: t(tk.place) } : {}),
      ...(p ? { person: { ...p, type: t(p.type), name: t(p.name), line: t(p.line) } } : {}) },
  };
}
