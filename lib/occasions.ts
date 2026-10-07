// The year's occasions (מועדים): the Jewish holidays, Israel's national and memorial days, and a few days of space,
// worked out every year from the Hebrew calendar (the runtime's Intl, no table to keep up to date).
//
// Each occasion is added once, 60 days ahead, to directorate_events as an all-day event (created_by "occasion:<key>"),
// so it shows in the wall's events panel and the remote lists it like any other event: the office can edit it (its
// wording, its days) or delete it, and a deleted one does not come back (its id is kept in settings 'occasions', as
// lib/newsletter-forum.ts does for the Forum's events). The wall dresses each one by its key and kind (lib/feed.ts):
//   holiday   a festive full screen in the half-hourly celebrations, from the day before (the office is closed on most)
//   national  the same, blue and white, on its day only
//   space     the same, the directorate's own days
//   memorial  the Yizkor screen (lib/remote-ops.ts memorialPeriod): 7/10, Holocaust Remembrance Day, Memorial Day
//   remember  a quiet candle under the emblem, no full screen (Tisha B'Av, the Columbia crew)
import { db, must } from './db.js';
import { addDays, dayDiff, ilToIso } from './dates.js';

export type OccasionKind = 'holiday' | 'national' | 'space' | 'memorial' | 'remember';
export type OccasionDef = {
  key: string; kind: OccasionKind; he: string; en: string; greet: string; greetEn: string;
  /** a glyph for the panel and the full screen, and the occasion's two colours (accent, deep background) */
  icon: string; color: string; deep: string;
  /** its first and last day in Hebrew year y (or Gregorian year g for `greg`), from the calendar index */
  at: (ix: Index, y: number) => [string, string] | null;
  greg?: boolean;
};
type Index = { day: (y: number, m: string, d: number) => string | null };

// ---- the Hebrew calendar ----------------------------------------------------------------------------
const HEB = new Intl.DateTimeFormat('en-u-ca-hebrew', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' });
/** The Hebrew date of a Gregorian day. Adar of a common year and Adar II of a leap year are both "Adar" (Purim). */
export function hebrewDate(iso: string): { y: number; m: string; d: number } {
  const p = Object.fromEntries(HEB.formatToParts(new Date(iso + 'T12:00:00Z')).map(x => [x.type, x.value]));
  const m = p.month === 'Adar II' ? 'Adar' : p.month === 'Adar I' ? 'Adar I' : p.month;
  return { y: Number(p.year), m, d: Number(p.day) };
}
/** Every day from `from` to `to` by its Hebrew date. */
function index(from: string, to: string): Index {
  const map = new Map<string, string>();
  for (let d = from; d <= to; d = addDays(d, 1)) { const h = hebrewDate(d); map.set(`${h.y}|${h.m}|${h.d}`, d); }
  return { day: (y, m, d) => map.get(`${y}|${m}|${d}`) || null };
}
const dow = (iso: string) => new Date(iso + 'T00:00:00Z').getUTCDay();   // 0 Sunday … 6 Saturday
const span = (a: string | null, days = 1): [string, string] | null => (a ? [a, addDays(a, days - 1)] : null);
const one = (y: number, m: string, d: number, days = 1) => (ix: Index) => span(ix.day(y, m, d), days);
const hd = (m: string, d: number, days = 1) => (ix: Index, y: number) => one(y, m, d, days)(ix);

/** Holocaust Remembrance Day: 27 Nisan, a day earlier when that is a Friday and a day later when it is a Sunday. */
function shoah(ix: Index, y: number) {
  const d = ix.day(y, 'Nisan', 27);
  return d ? span(dow(d) === 5 ? addDays(d, -1) : dow(d) === 0 ? addDays(d, 1) : d) : null;
}
/** Independence Day (5 Iyar) moves back to Thursday when it falls on a Friday or Saturday, and on a day when Memorial
 *  Day, the day before it, would fall on a Sunday (5 Iyar on Monday) both move a day on. */
function atzmaut(ix: Index, y: number) {
  const d = ix.day(y, 'Iyar', 5);
  if (!d) return null;
  const w = dow(d);
  return span(w === 5 ? addDays(d, -1) : w === 6 ? addDays(d, -2) : w === 1 ? addDays(d, 1) : d);
}
function zikaron(ix: Index, y: number) { const a = atzmaut(ix, y); return a ? span(addDays(a[0], -1)) : null; }
/** Tisha B'Av on a Saturday is kept on the Sunday. */
function tishaBeAv(ix: Index, y: number) { const d = ix.day(y, 'Av', 9); return d ? span(dow(d) === 6 ? addDays(d, 1) : d) : null; }
/** A Gregorian day (and days) every year. */
const greg = (mmdd: string, days = 1) => (_: Index, g: number) => span(`${g}-${mmdd}`, days);

const GOLD = '#e9b872', NIGHT = '#120c06';
export const OCCASIONS: OccasionDef[] = [
  { key: 'rosh-hashana', kind: 'holiday', he: 'ראש השנה', en: 'Rosh Hashanah', greet: 'שנה טובה ומתוקה', greetEn: 'A good and sweet new year', icon: '🍎', color: '#ff7a59', deep: '#2a0d08', at: hd('Tishri', 1, 2) },
  { key: 'yom-kippur', kind: 'holiday', he: 'יום כיפור', en: 'Yom Kippur', greet: 'גמר חתימה טובה', greetEn: 'May you be sealed for a good year', icon: '🕊️', color: '#dfe8f5', deep: '#0d1424', at: hd('Tishri', 10) },
  { key: 'sukkot', kind: 'holiday', he: 'סוכות', en: 'Sukkot', greet: 'חג סוכות שמח', greetEn: 'Happy Sukkot', icon: '🌿', color: '#9be36f', deep: '#0b1d0c', at: hd('Tishri', 15, 7) },
  { key: 'simchat-torah', kind: 'holiday', he: 'שמחת תורה', en: 'Simchat Torah', greet: 'חג שמח', greetEn: 'Happy Simchat Torah', icon: '📜', color: '#f2d27a', deep: '#1d1406', at: hd('Tishri', 22) },
  { key: 'hanukkah', kind: 'holiday', he: 'חנוכה', en: 'Hanukkah', greet: 'חג אורים שמח', greetEn: 'Happy Hanukkah', icon: '🕎', color: '#ffc84a', deep: '#0a1430', at: hd('Kislev', 25, 8) },
  { key: 'tu-bishvat', kind: 'holiday', he: 'ט״ו בשבט', en: 'Tu BiShvat', greet: 'חג האילנות שמח', greetEn: 'Happy New Year of the Trees', icon: '🌳', color: '#7fdc8c', deep: '#08190d', at: hd('Shevat', 15) },
  { key: 'purim', kind: 'holiday', he: 'פורים', en: 'Purim', greet: 'פורים שמח', greetEn: 'Happy Purim', icon: '🎭', color: '#ff6fd8', deep: '#1c0a26', at: hd('Adar', 14) },
  { key: 'pesach', kind: 'holiday', he: 'פסח', en: 'Passover', greet: 'חג פסח כשר ושמח', greetEn: 'Happy Passover', icon: '🍷', color: '#ff8fa3', deep: '#22070f', at: hd('Nisan', 15, 7) },
  { key: 'shoah', kind: 'memorial', he: 'יום השואה והגבורה', en: 'Holocaust Remembrance Day', greet: 'יזכור', greetEn: 'We remember', icon: '🕯️', color: GOLD, deep: NIGHT, at: shoah },
  { key: 'zikaron', kind: 'memorial', he: 'יום הזיכרון לחללי מערכות ישראל', en: 'Memorial Day', greet: 'יזכור', greetEn: 'We remember', icon: '🕯️', color: GOLD, deep: NIGHT, at: zikaron },
  { key: 'atzmaut', kind: 'national', he: 'יום העצמאות', en: 'Independence Day', greet: 'חג עצמאות שמח', greetEn: 'Happy Independence Day', icon: '✡️', color: '#5aa9ff', deep: '#051a3f', at: atzmaut },
  { key: 'lag-baomer', kind: 'holiday', he: 'ל״ג בעומר', en: 'Lag BaOmer', greet: 'ל״ג בעומר שמח', greetEn: 'Happy Lag BaOmer', icon: '🔥', color: '#ff9a3c', deep: '#1f0b03', at: hd('Iyar', 18) },
  { key: 'yom-yerushalayim', kind: 'national', he: 'יום ירושלים', en: 'Jerusalem Day', greet: 'יום ירושלים שמח', greetEn: 'Happy Jerusalem Day', icon: '🦁', color: '#f0c674', deep: '#0b1631', at: hd('Iyar', 28) },
  { key: 'shavuot', kind: 'holiday', he: 'שבועות', en: 'Shavuot', greet: 'חג שבועות שמח', greetEn: 'Happy Shavuot', icon: '🌾', color: '#f5d76e', deep: '#141a07', at: hd('Sivan', 6) },
  { key: 'tisha-beav', kind: 'remember', he: 'תשעה באב', en: "Tisha B'Av", greet: 'יום אבל וזיכרון', greetEn: 'A day of mourning', icon: '🕯️', color: '#b9a98f', deep: NIGHT, at: tishaBeAv },
  { key: 'tu-beav', kind: 'holiday', he: 'ט״ו באב', en: "Tu B'Av", greet: 'חג האהבה שמח', greetEn: 'Happy day of love', icon: '💗', color: '#ff7eb3', deep: '#250918', at: hd('Av', 15) },
  // Gregorian
  { key: 'oct7', kind: 'memorial', he: 'יום הזיכרון ל־7 באוקטובר', en: 'October 7 Remembrance', greet: 'יזכור', greetEn: 'We remember', icon: '🕯️', color: GOLD, deep: NIGHT, at: greg('10-07'), greg: true },
  { key: 'columbia', kind: 'remember', he: 'לזכר אילן רמון וצוות קולומביה', en: 'Remembering Ilan Ramon and the Columbia crew', greet: 'האסטרונאוט הישראלי הראשון', greetEn: "Israel's first astronaut", icon: '🕯️', color: '#9fdcff', deep: '#050b18', at: greg('02-01'), greg: true },
  { key: 'gagarin', kind: 'space', he: 'יום טיסת האדם לחלל', en: 'International Day of Human Space Flight', greet: '12.4.1961 · גגארין מקיף את כדור הארץ', greetEn: '12 April 1961 · Gagarin orbits the Earth', icon: '🚀', color: '#9fdcff', deep: '#040a1c', at: greg('04-12'), greg: true },
  { key: 'space-week', kind: 'space', he: 'שבוע החלל העולמי', en: 'World Space Week', greet: 'שבוע חלל שמח', greetEn: 'Happy World Space Week', icon: '🛰️', color: '#d4f25c', deep: '#040a1c', at: greg('10-04', 7), greg: true },
];
export const occasionDef = (key: string) => OCCASIONS.find(o => o.key === key) || null;

export type Occasion = { id: string; key: string; kind: OccasionKind; title: string; from: string; to: string };
/** The occasions that touch the days from..to (both included), first day first. The id is the key and the year it
 *  starts in. */
export function occasionsBetween(from: string, to: string): Occasion[] {
  // A margin wide enough for any rule (a week either side) and every Hebrew year the window touches.
  const lo = addDays(from, -40), hi = addDays(to, 40), ix = index(lo, hi);
  const hy = new Set<number>(), gy = new Set<number>();
  for (let d = lo; d <= hi; d = addDays(d, 20)) { hy.add(hebrewDate(d).y); gy.add(Number(d.slice(0, 4))); }
  hy.add(hebrewDate(hi).y); gy.add(Number(hi.slice(0, 4)));
  const out: Occasion[] = [];
  for (const o of OCCASIONS) for (const y of o.greg ? gy : hy) {
    const r = o.at(ix, y);
    if (!r || r[1] < from || r[0] > to) continue;
    out.push({ id: `${o.key}-${r[0].slice(0, 4)}`, key: o.key, kind: o.kind, title: o.he, from: r[0], to: r[1] });
  }
  return out.sort((a, b) => a.from.localeCompare(b.from) || a.key.localeCompare(b.key));
}

// ---- into directorate_events -------------------------------------------------------------------------
const SETTING = 'occasions';
const KEEP = 200;
/** How far ahead an occasion is added (the remote lists events two months ahead; the wall's panel shows a week). */
export const OCCASION_LEAD = 60;
export const OCCASION_BY = 'occasion:';

/** The directorate_events row for an occasion: all day, midnight to the midnight after its last day. */
export const occasionRow = (o: Occasion) => ({
  title: o.title, type: 'other', starts_at: ilToIso(o.from, '00:00'), ends_at: ilToIso(addDays(o.to, 1), '00:00'),
  place: null, approved: true, created_by: OCCASION_BY + o.key,
});
/** The occasions from today to OCCASION_LEAD days ahead that were not added before (one already running counts only
 *  if it started today), and the id list to keep once they are. */
export function planOccasions(today: string, seen: string[]) {
  const known = new Set(seen);
  const fresh = occasionsBetween(today, addDays(today, OCCASION_LEAD)).filter(o => o.from >= today && !known.has(o.id));
  return { fresh, ids: [...seen, ...fresh.map(o => o.id)].slice(-KEEP) };
}
export async function syncOccasions(today: string): Promise<{ added: number }> {
  const s = db();
  const cur = must(await s.from('settings').select('value').eq('key', SETTING).maybeSingle(), 'settings') as { value?: { ids?: string[] } } | null;
  const { fresh, ids } = planOccasions(today, cur?.value?.ids || []);
  if (!fresh.length) return { added: 0 };
  must(await s.from('directorate_events').insert(fresh.map(occasionRow)).select('id'), 'occasions');
  must(await s.from('settings').upsert({ key: SETTING, value: { ids }, updated_at: new Date().toISOString() }), 'settings');
  return { added: fresh.length };
}

/** How the wall dresses an event the occasions added (null for any other event). `en` is the English name while the
 *  office kept the Hebrew one. */
export function occasionLook(e: { created_by?: string | null; title?: string }) {
  if (!e.created_by || !e.created_by.startsWith(OCCASION_BY)) return null;
  const o = occasionDef(e.created_by.slice(OCCASION_BY.length));
  if (!o) return null;
  return { key: o.key, kind: o.kind, icon: o.icon, color: o.color, deep: o.deep, greet: o.greet, greetEn: o.greetEn, en: e.title === o.he ? o.en : null };
}
/** Whether the wall greets an occasion on `today`: a holiday from the day before (most close the office), the others
 *  on their own days. `first` and `last` are its first and last days. */
export const occasionGreets = (kind: OccasionKind, first: string, last: string, today: string) =>
  today <= last && dayDiff(today, first) <= (kind === 'holiday' ? 1 : 0);
/** An occasion as today's, for a demo (the wall's ?occ=<key>, through /api/feed). */
export function occasionDemo(key: string, today: string) {
  const o = occasionDef(key);
  return o ? { ...occasionLook({ created_by: OCCASION_BY + key, title: o.he })!, id: 'demo', title: o.he, first: today, last: today } : null;
}
