// Builds the JSON the v4 display consumes (see app/src/wall.js) from the database.
//
//   newsletter part  (issue, summary, featured, news, catColor, catImage, ticker)
//                    ← latest row in newsletter_issues; the bundled sample until the first import
//   directorate      ← directorate_events in the next 7 days
//   people           ← life_events + birthdays computed from people, next 10 days (and 3 back)
//   ticker           ← newsletter ticker + industry_events, merged by date
//   launches         ← launches table; the sample until the runner has filled it
import { db, must } from './db.js';
import { addDays, dayDiff, isoDateIL, nextYearly, shortDate, timeIL } from './dates.js';
import sample from '../app/data/feed.json' with { type: 'json' };

type Settings = { peopleHorizonDays: number; peopleBackDays: number; directorateDays: number; eventsHorizonDays: number; launchCount: number };
const DEFAULTS: Settings = { peopleHorizonDays: 10, peopleBackDays: 3, directorateDays: 7, eventsHorizonDays: 120, launchCount: 4 };

const DOW = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const MON = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
const dowOf = (iso: string) => DOW[new Date(iso + 'T00:00:00Z').getUTCDay()];

// Life-event types → the chip label and colour the design uses.
export const LIFE: Record<string, { type: string; color: string; line: (p: any, when: string) => string }> = {
  birthday:    { type: 'יום הולדת',    color: '#e9b872', line: (p, w) => [`חוגג/ת ${w}`, p.unit].filter(Boolean).join(' · ') },
  wedding:     { type: 'מזל טוב',      color: '#b9a6f5', line: (p) => ['לרגל הנישואין', p.unit].filter(Boolean).join(' · ') },
  birth:       { type: 'מזל טוב',      color: '#b9a6f5', line: (p) => ['להולדת התינוק/ת', p.unit].filter(Boolean).join(' · ') },
  promotion:   { type: 'עלייה בדרגה',  color: '#8fe0b8', line: (p) => [p.rank ? `הועלה/תה לדרגת ${p.rank}` : 'עלייה בדרגה', p.unit].filter(Boolean).join(' · ') },
  discharge:   { type: 'שחרור',        color: '#6fd6ea', line: (p) => ['משתחרר/ת מהמנהלת', p.unit].filter(Boolean).join(' · ') },
  joined:      { type: 'ברוכים הבאים', color: '#d4f25c', line: (p) => ['הצטרף/ה', p.unit].filter(Boolean).join(' · ') },
  bereavement: { type: 'משתתפים בצער', color: '#8b9dbd', line: (p) => ['כל המנהלת משתתפת בצערך', p.unit].filter(Boolean).join(' · ') },
  other:       { type: 'מזל טוב',      color: '#b9a6f5', line: (p) => p.unit || '' },
};

function whenWord(iso: string, today: string): string {
  const d = dayDiff(today, iso);
  if (d === 0) return 'היום';
  if (d === 1) return 'מחר';
  if (d === -1) return 'אתמול';
  return `ביום ${dowOf(iso)}`;
}
export function displayName(p: any): string { return [p.rank, p.display_name].filter(Boolean).join(' '); }

/** The card the wall shows for a life event (people panel and full-screen celebration). */
export function lifeCard(e: any, p: any, today: string) {
  const L = LIFE[e.type] || LIFE.other;
  const photo = e.photo_mode === 'none' ? null : e.photo_mode === 'upload' && e.photo_url ? e.photo_url : p.photo_url || null;
  return { type: e.type === 'other' && e.label ? e.label : L.type, color: L.color, name: displayName(p), line: e.text_he || L.line(p, whenWord(e.event_date, today)), date: shortDate(e.event_date), photo, celebrate: e.type !== 'bereavement' };
}
/** A life event is on the wall from show_from (default 10 days before) until show_until (default 3 days after). */
export function lifeShown(e: any, today: string): boolean {
  return (e.show_from || addDays(e.event_date, -10)) <= today && today <= (e.show_until || addDays(e.event_date, 3));
}
export function birthdayCard(p: any, date: string, today: string) {
  const L = LIFE.birthday;
  return { type: L.type, color: L.color, name: displayName(p), line: L.line(p, whenWord(date, today)), date: shortDate(date), photo: p.photo_url || null, celebrate: true };
}

export async function buildFeed() {
  const s = db();
  const now = new Date();
  const today = isoDateIL(now);

  const settingsRows = must(await s.from('settings').select('key,value'), 'settings') as { key: string; value: any }[];
  const cfg: Settings = { ...DEFAULTS, ...(settingsRows.find(r => r.key === 'feed')?.value || {}) };

  // ---- newsletter part
  const issueRows = must(await s.from('newsletter_issues').select('content,imported_at').order('issue_date', { ascending: false }).limit(1), 'newsletter') as any[];
  const nl = issueRows[0]?.content || sample;
  const base = {
    issue: nl.issue || sample.issue,
    summary: nl.summary || [],
    featured: (nl.featured || []).filter((i: number) => i < (nl.news || []).length),
    news: nl.news || [],
    catColor: { ...sample.catColor, ...(nl.catColor || {}) },
    catImage: { ...sample.catImage, ...(nl.catImage || {}) },
  };
  if (!base.featured.length) base.featured = base.news.slice(0, 6).map((_: unknown, i: number) => i);

  // ---- directorate events, next 7 days
  const dEvents = must(await s.from('directorate_events').select('*').eq('approved', true)
    .gte('starts_at', today + 'T00:00:00+03:00').lte('starts_at', addDays(today, cfg.directorateDays) + 'T23:59:59+03:00')
    .order('starts_at').limit(4), 'directorate_events') as any[];
  const directorate = dEvents.filter(e => (!e.show_from || e.show_from <= today) && (!e.show_until || e.show_until >= today)).map(e => {
    const d = new Date(e.starts_at), iso = isoDateIL(d), t = timeIL(d);
    return { day: iso.slice(8, 10), dow: dowOf(iso), mon: MON[Number(iso.slice(5, 7)) - 1], time: t === '00:00' ? '' : t, name: e.title, place: e.place || '' };
  });

  // ---- people: explicit life events + computed birthdays
  const from = addDays(today, -cfg.peopleBackDays), until = addDays(today, cfg.peopleHorizonDays);
  // Wide fetch, then each event's own window decides (events added from the remote carry show_from/show_until).
  const life = must(await s.from('life_events').select('*, people(display_name,rank,unit,photo_url,active)').eq('approved', true)
    .gte('event_date', addDays(today, -30)).lte('event_date', addDays(today, 60)).order('event_date'), 'life_events') as any[];
  const people: any[] = [];
  const seen = new Set<string>();
  for (const e of life) {
    const p = e.people; if (!p || p.active === false) continue;
    const windowed = e.show_from || e.show_until;
    if (windowed ? !lifeShown(e, today) : (e.event_date < from || e.event_date > until)) continue;
    seen.add(`${e.type}|${p.display_name}|${e.event_date}`);
    people.push({ ...lifeCard(e, p, today), sort: e.event_date });
  }
  const roster = must(await s.from('people').select('display_name,rank,unit,photo_url,birthday').eq('active', true).not('birthday', 'is', null), 'people') as any[];
  for (const p of roster) {
    const next = nextYearly(p.birthday.slice(5), from, cfg.peopleHorizonDays + cfg.peopleBackDays);
    if (!next || seen.has(`birthday|${p.display_name}|${next}`)) continue;
    people.push({ ...birthdayCard(p, next, today), sort: next });
  }
  // Nearest first, today's before tomorrow's; cap to the six tiles the panel holds.
  people.sort((a, b) => Math.abs(dayDiff(today, a.sort)) - Math.abs(dayDiff(today, b.sort)) || a.sort.localeCompare(b.sort));
  const peopleOut = people.slice(0, 6).map(({ sort, ...p }) => p);

  // ---- ticker: newsletter items + industry events from the database
  const ind = must(await s.from('industry_events').select('*').eq('approved', true)
    .lte('starts_on', addDays(today, cfg.eventsHorizonDays)).order('starts_on'), 'industry_events') as any[];
  const range = (a: string, b?: string | null) => (b && b !== a ? `${Number(a.slice(8, 10))}–${shortDate(b)}` : shortDate(a));
  const dbTicker = ind.filter(e => (e.ends_on || e.starts_on) >= today)
    .map(e => ({ kind: e.kind || 'אירוע', date: range(e.starts_on, e.ends_on), name: [e.name, e.place_he].filter(Boolean).join(' · '), sort: e.starts_on }));
  const names = new Set(dbTicker.map(t => t.name.split(' · ')[0].trim()));
  const nlTicker = (nl.ticker || []).filter((t: any) => !names.has(String(t.name).split(' · ')[0].trim()));
  const ticker = [...nlTicker, ...dbTicker.map(({ sort, ...t }) => t)];

  // ---- launches
  const lRows = must(await s.from('launches').select('*').gte('net', new Date(now.getTime() - 3 * 3600e3).toISOString())
    .order('net').limit(cfg.launchCount), 'launches') as any[];
  const launches = lRows.length
    ? lRows.map(l => ({ vehicle: [l.vehicle, l.provider].filter(Boolean).join(' · '), mission: l.mission || l.name, site: l.site_he || l.site_en || '', at: l.net, status: l.status === 'Go' ? 'אושר' : 'ממתין' }))
    : sample.launches;

  // ---- freshness: the newest successful update of any kind
  const lastRun = must(await s.from('agent_runs').select('finished_at').eq('status', 'ok')
    .order('finished_at', { ascending: false }).limit(1), 'runs') as any[];

  return {
    generatedAt: lastRun[0]?.finished_at || issueRows[0]?.imported_at || now.toISOString(),
    ...base,
    ticker,
    launches,
    tracked: sample.tracked,
    directorate,
    people: peopleOut,
    promoVideo: '/assets/promo.mp4',
  };
}
