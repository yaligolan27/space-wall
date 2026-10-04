// Builds the JSON the v4 display consumes (see app/src/wall.js) from the database.
//
//   newsletter part  (issue, summary, featured, news, catColor, catImage, ticker)
//                    ← latest row in newsletter_issues; empty until the first import (the bundled sample lends only
//                      the category colours and images, which are style, not content)
//   directorate      ← directorate_events in the next 7 days that have not ended
//   people           ← life_events + birthdays computed from people, next 10 days (and 3 back);
//                      only people on the wall (on_wall) and birthdays they agreed to (show_birthday); a life event
//                      can also name someone outside the people list
//   ticker           ← newsletter ticker + industry_events, one item per event, by date, nothing that has ended
//   launches         ← launches table, empty until the cron has filled it; refreshed here when stale near a launch
import { db, must } from './db.js';
import { addDays, dayDiff, ilToIso, isoDateIL, nextYearly, shortDate, timeIL } from './dates.js';
import { endDate } from './newsletter.js';
import sample from '../app/data/feed.json' with { type: 'json' };

type Settings = { peopleHorizonDays: number; peopleBackDays: number; directorateDays: number; eventsHorizonDays: number; launchCount: number };
const DEFAULTS: Settings = { peopleHorizonDays: 10, peopleBackDays: 3, directorateDays: 7, eventsHorizonDays: 120, launchCount: 4 };
/** settings.feed over the defaults. Production's row calls the people horizon lifeEventsHorizonDays. */
function feedSettings(raw: any): Settings {
  const given = { peopleHorizonDays: raw?.lifeEventsHorizonDays, ...raw }, cfg = { ...DEFAULTS };
  for (const k of Object.keys(cfg) as (keyof Settings)[]) { const v = Number(given[k] ?? NaN); if (Number.isFinite(v)) cfg[k] = v; }
  return cfg;
}

const DOW = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const MON = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
const dowOf = (iso: string) => DOW[new Date(iso + 'T00:00:00Z').getUTCDay()];

// Life-event types → the chip label and colour the design uses. `d` = days from today to the event (negative once it
// has passed), so the wording keeps to the right tense.
export const LIFE: Record<string, { type: string; color: string; line: (p: any, when: string, d: number) => string }> = {
  birthday:    { type: 'יום הולדת',    color: '#e9b872', line: (p, w, d) => [`${d < 0 ? 'חגג/ה' : 'חוגג/ת'} ${w}`, p.unit].filter(Boolean).join(' · ') },
  wedding:     { type: 'מזל טוב',      color: '#b9a6f5', line: (p) => ['לרגל הנישואין', p.unit].filter(Boolean).join(' · ') },
  birth:       { type: 'מזל טוב',      color: '#b9a6f5', line: (p) => ['להולדת התינוק/ת', p.unit].filter(Boolean).join(' · ') },
  promotion:   { type: 'עלייה בדרגה',  color: '#8fe0b8', line: (p, _w, d) => [p.rank ? `${d < 0 ? 'הועלה/תה' : 'עולה'} לדרגת ${p.rank}` : 'עלייה בדרגה', p.unit].filter(Boolean).join(' · ') },
  discharge:   { type: 'שחרור',        color: '#6fd6ea', line: (p, _w, d) => [d < 0 ? 'השתחרר/ה מהמנהלת' : 'משתחרר/ת מהמנהלת', p.unit].filter(Boolean).join(' · ') },
  joined:      { type: 'ברוכים הבאים', color: '#d4f25c', line: (p, _w, d) => [d > 0 ? 'מצטרף/ת' : 'הצטרף/ה', p.unit].filter(Boolean).join(' · ') },
  bereavement: { type: 'משתתפים בצער', color: '#8b9dbd', line: (p) => ['כל המנהלת משתתפת בצערך', p.unit].filter(Boolean).join(' · ') },
  other:       { type: 'מזל טוב',      color: '#b9a6f5', line: (p) => p.unit || '' },
};

/** "היום" / "מחר" / "ביום ג׳" (within the week) / "ב-14.10"; once passed "אתמול" / "ב-26.9". */
function whenWord(iso: string, today: string): string {
  const d = dayDiff(today, iso);
  if (d === 0) return 'היום';
  if (d === 1) return 'מחר';
  if (d === -1) return 'אתמול';
  return d > 1 && d < 7 ? `ביום ${dowOf(iso)}` : `ב-${shortDate(iso)}`;
}
export function displayName(p: any): string { return [p.rank, p.display_name].filter(Boolean).join(' '); }

/** The card the wall shows for a life event (people panel and full-screen celebration). `on` is the event's date: the
 *  wall greets full-screen only from that day to two days after it, and never for bereavement (`celebrate`). */
export function lifeCard(e: any, p: any, today: string) {
  const L = LIFE[e.type] || LIFE.other;
  const photo = e.photo_mode === 'none' ? null : e.photo_mode === 'upload' && e.photo_url ? e.photo_url : p.photo_url || null;
  return { type: e.type === 'other' && e.label ? e.label : L.type, color: L.color, name: displayName(p), line: e.text_he || L.line(p, whenWord(e.event_date, today), dayDiff(today, e.event_date)),
    date: shortDate(e.event_date), on: e.event_date, photo, celebrate: e.type !== 'bereavement' };
}
/** A life event is on the wall from show_from (default 10 days before) until show_until (default 3 days after). */
export function lifeShown(e: any, today: string): boolean {
  return (e.show_from || addDays(e.event_date, -10)) <= today && today <= (e.show_until || addDays(e.event_date, 3));
}
export function birthdayCard(p: any, date: string, today: string) {
  const L = LIFE.birthday;
  return { type: L.type, color: L.color, name: displayName(p), line: L.line(p, whenWord(date, today), dayDiff(today, date)), date: shortDate(date), on: date, photo: p.photo_url || null, celebrate: true };
}

// ---- ticker -----------------------------------------------------------------------------------------
type Tick = { kind: string; date: string; name: string; key: string; start: string | null; end: string | null };
/** "5.10", "27–29.10", across months "28.10–2.11". */
const range = (a: string, b?: string | null) =>
  !b || b === a ? shortDate(a) : a.slice(0, 7) === b.slice(0, 7) ? `${Number(a.slice(8, 10))}–${shortDate(b)}` : `${shortDate(a)}–${shortDate(b)}`;
/** The first day of a ticker date text ("10–11.10" → 10.10, "28.9–2.10" → 28.9), in the year of its last day. */
function startOf(text: string, end: string): string | null {
  const m = /(\d{1,2})(?:[–-]\d{1,2})?\.(\d{1,2})/.exec(text);
  if (!m) return null;
  const mo = Number(m[2]), y = Number(end.slice(0, 4)) - (mo > Number(end.slice(5, 7)) ? 1 : 0);
  return `${y}-${String(mo).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
}
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/** One event listed twice ("Space Tech Expo Europe" / "המשלחת הישראלית ל-Space Tech Expo Europe"): one name holds the
 *  other, case and punctuation aside, and the dates overlap where both are known. */
function sameEvent(a: Tick, b: Tick): boolean {
  const x = norm(a.key), y = norm(b.key);
  if (x.length < 3 || y.length < 3 || !(` ${x} `.includes(` ${y} `) || ` ${y} `.includes(` ${x} `))) return false;
  return !(a.start && a.end && b.start && b.end) || (a.start <= b.end && b.start <= a.end);
}

// ---- launches ---------------------------------------------------------------------------------------
// Launch Library's status → the chip. `code` keeps the status itself: the wall goes into launch mode, and says
// "שוגר", only for a launch that is Go.
const LAUNCH_STATUS: Record<string, string> = { Go: 'אושר', Hold: 'מושהה', 'In Flight': 'בטיסה', Success: 'שוגר', Failure: 'כשל', 'Partial Failure': 'כשל חלקי' };
const MAX_LAUNCHES = 12;
const REFRESH_KEY = 'launches_refresh';            // settings row: when a feed last tried to refresh launches
const REFRESH_EVERY = 2 * 3600e3, REFRESH_AHEAD = 12 * 3600e3, REFRESH_WAIT = 5000;

/** The refresh of this two-hour window goes to one caller: the first insert, or the update of a claim older than that. */
async function claimRefresh(seen: boolean, t: number): Promise<boolean> {
  try {
    const s = db(), at = new Date(t).toISOString(), row = { key: REFRESH_KEY, value: { at }, updated_at: at };
    const r = seen
      ? await s.from('settings').update(row).eq('key', REFRESH_KEY).lt('updated_at', new Date(t - REFRESH_EVERY).toISOString()).select('key')
      : await s.from('settings').insert(row).select('key');
    return !r.error && !!r.data?.length;
  } catch { return false; }
}
/** Launch Library through the cron's own code (agent/src/launches.ts), waiting at most five seconds; a slower run
 *  finishes in the background. Never throws. */
async function refreshLaunches(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = import('../agent/src/launches.js').then(m => m.runLaunches()).then(n => (n ?? 0) > 0, e => { console.warn('launch refresh failed', e); return false; });
  const late = new Promise<boolean>(r => { timer = setTimeout(() => r(false), REFRESH_WAIT); });
  try { return await Promise.race([run, late]); } finally { clearTimeout(timer); }
}

export async function buildFeed() {
  const s = db();
  const now = new Date(), t = now.getTime();
  const today = isoDateIL(now);
  const launchQuery = () => s.from('launches').select('*').gte('net', new Date(t - 3 * 3600e3).toISOString()).order('net').limit(MAX_LAUNCHES);

  // All at once. The settings only narrow what comes back, so they are applied afterwards.
  const [settingsR, issueR, dirR, lifeR, rosterR, indR, launchR, newestR, runR] = await Promise.all([
    s.from('settings').select('key,value,updated_at'),
    s.from('newsletter_issues').select('content,imported_at').order('issue_date', { ascending: false }).limit(1),
    // Not over yet; an event without an end time lasts an hour.
    s.from('directorate_events').select('*').eq('approved', true)
      .or(`ends_at.gt.${now.toISOString()},and(ends_at.is.null,starts_at.gt.${new Date(t - 3600e3).toISOString()})`)
      .lt('starts_at', ilToIso(addDays(today, 61), '00:00')).order('starts_at'),
    // Wide fetch, then each event's own window decides (events added from the remote carry show_from/show_until).
    s.from('life_events').select('*, people(display_name,rank,unit,photo_url,active,on_wall)').eq('approved', true)
      .gte('event_date', addDays(today, -30)).lte('event_date', addDays(today, 60)).order('event_date'),
    s.from('people').select('display_name,rank,unit,photo_url,birthday').eq('active', true).eq('on_wall', true).eq('show_birthday', true)
      .not('birthday', 'is', null),
    s.from('industry_events').select('*').eq('approved', true).or(`ends_on.gte.${today},starts_on.gte.${today}`).order('starts_on'),
    launchQuery(),
    s.from('launches').select('updated_at').order('updated_at', { ascending: false }).limit(1),
    // freshness: the newest successful update of any kind
    s.from('agent_runs').select('finished_at').eq('status', 'ok').order('finished_at', { ascending: false }).limit(1),
  ]);
  const settingsRows = must(settingsR, 'settings') as { key: string; value: any; updated_at?: string }[];
  const cfg = feedSettings(settingsRows.find(r => r.key === 'feed')?.value);

  // ---- newsletter part
  const issueRows = must(issueR, 'newsletter') as any[];
  const nl = issueRows[0]?.content || {};
  const base = {
    issue: nl.issue || { range: '', url: '' },
    summary: nl.summary || [],
    featured: (nl.featured || []).filter((i: number) => i < (nl.news || []).length),
    news: nl.news || [],
    catColor: { ...sample.catColor, ...(nl.catColor || {}) },
    catImage: { ...sample.catImage, ...(nl.catImage || {}) },
  };
  if (!base.featured.length) base.featured = base.news.slice(0, 6).map((_: unknown, i: number) => i);

  // ---- directorate events, next 7 days: the ones still to come or running, filtered before the panel's four
  const endOf = (e: any) => (e.ends_at ? Date.parse(e.ends_at) : Date.parse(e.starts_at) + 3600e3);
  const dirUntil = Date.parse(ilToIso(addDays(today, cfg.directorateDays + 1), '00:00'));
  const directorate = (must(dirR, 'directorate_events') as any[])
    .filter(e => endOf(e) > t && Date.parse(e.starts_at) < dirUntil && (!e.show_from || e.show_from <= today) && (!e.show_until || e.show_until >= today))
    .slice(0, 4).map(e => {
      const d = new Date(e.starts_at), iso = isoDateIL(d), tm = timeIL(d);
      return { day: iso.slice(8, 10), dow: dowOf(iso), mon: MON[Number(iso.slice(5, 7)) - 1], time: tm === '00:00' ? '' : tm, name: e.title, place: e.place || '',
        start: d.toISOString(), end: new Date(endOf(e)).toISOString() };
    });

  // ---- people: explicit life events + computed birthdays
  const from = addDays(today, -cfg.peopleBackDays), until = addDays(today, cfg.peopleHorizonDays);
  const life = must(lifeR, 'life_events') as any[];
  const people: any[] = [];
  const seen = new Set<string>();
  for (const e of life) {
    // Someone outside the people list carries just a name (life_events.name): no rank or unit, a photo only if uploaded.
    const named = !e.people && typeof e.name === 'string' && e.name.trim();
    const p = e.people || (named ? { display_name: named } : null);
    if (!p || (e.people && (p.active === false || p.on_wall === false))) continue;
    const windowed = e.show_from || e.show_until;
    if (windowed ? !lifeShown(e, today) : (e.event_date < from || e.event_date > until)) continue;
    seen.add(`${e.type}|${p.display_name}|${e.event_date}`);
    people.push({ ...lifeCard(e, p, today), sort: e.event_date });
  }
  for (const p of must(rosterR, 'people') as any[]) {
    const next = nextYearly(p.birthday.slice(5), from, cfg.peopleHorizonDays + cfg.peopleBackDays);
    if (!next || seen.has(`birthday|${p.display_name}|${next}`)) continue;
    people.push({ ...birthdayCard(p, next, today), sort: next });
  }
  // Nearest first, today's before tomorrow's; cap to the six tiles the panel holds.
  people.sort((a, b) => Math.abs(dayDiff(today, a.sort)) - Math.abs(dayDiff(today, b.sort)) || a.sort.localeCompare(b.sort));
  const peopleOut = people.slice(0, 6).map(({ sort, ...p }) => p);

  // ---- ticker: industry events from the database, then the newsletter's items that are not the same event
  const evUntil = addDays(today, cfg.eventsHorizonDays);
  const dbTicks: Tick[] = (must(indR, 'industry_events') as any[]).filter(e => (e.ends_on || e.starts_on) >= today && e.starts_on <= evUntil)
    .map(e => ({ kind: e.kind || 'אירוע', date: range(e.starts_on, e.ends_on), name: [e.name, e.place_he].filter(Boolean).join(' · '),
      key: String(e.name).split(' · ')[0], start: e.starts_on, end: e.ends_on || e.starts_on }));
  // A newsletter item ends on its `end` (set at import), else on its date text read near today; one that ended goes.
  const nlTicks: Tick[] = (nl.ticker || []).map((x: any) => {
    const text = String(x.date || ''), name = String(x.name || ''), end = /^\d{4}-\d{2}-\d{2}$/.test(x.end || '') ? x.end : endDate(text, today);
    return { kind: x.kind || 'אירוע', date: text, name, key: name.split(' · ')[0], start: end && startOf(text, end), end };
  }).filter((x: Tick) => x.name && !(x.end && x.end < today));
  const ticks: Tick[] = [];
  for (const x of [...dbTicks, ...nlTicks]) if (!ticks.some(k => sameEvent(k, x))) ticks.push(x);
  const ticker = ticks.sort((a, b) => (a.start || a.end || '~').localeCompare(b.start || b.end || '~') || (a.end || '~').localeCompare(b.end || '~'))
    .map(({ kind, date, name }) => ({ kind, date, name }));

  // ---- launches. The daily cron is their only source, so near a launch they can be most of a day old (slips,
  // scrubs, holds): when the newest row is over two hours old and a listed launch is due within twelve, refresh
  // first, at most once per two hours for all the walls together.
  let lRows = must(launchR, 'launches') as any[];
  const newest = Date.parse((must(newestR, 'launches') as any[])[0]?.updated_at || '') || 0;
  const tried = settingsRows.find(r => r.key === REFRESH_KEY);
  if (lRows.some(l => Date.parse(l.net) - t <= REFRESH_AHEAD) && t - newest > REFRESH_EVERY && t - (Date.parse(tried?.updated_at || '') || 0) > REFRESH_EVERY
    && await claimRefresh(!!tried, t) && await refreshLaunches()) {
    const r = await launchQuery();
    if (!r.error && r.data) lRows = r.data;
  }
  const launches = lRows.slice(0, cfg.launchCount).map(l => ({ vehicle: [l.vehicle, l.provider].filter(Boolean).join(' · '), mission: l.mission || l.name,
    site: l.site_he || l.site_en || '', at: l.net, status: LAUNCH_STATUS[l.status] || 'ממתין', code: l.status || '', checked: l.updated_at || null }));

  const lastRun = must(runR, 'runs') as any[];

  return {
    generatedAt: lastRun[0]?.finished_at || issueRows[0]?.imported_at || now.toISOString(),
    ...base,
    ticker,
    launches,
    tracked: [],
    directorate,
    people: peopleOut,
    promoVideo: '/assets/promo.mp4',
  };
}
