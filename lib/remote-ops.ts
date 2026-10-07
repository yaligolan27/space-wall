// The remote control's operations (app/remote → api/remote.ts) and the live wall state (api/live.ts).
// Every change is written to remote_history together with the operations that undo it, so the remote can
// undo the last change or roll back to any earlier point. Nothing here calls a model.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db, must } from './db.js';
import { addDays, dayDiff, isoDateIL, nextYearly, shortDate, timeIL } from './dates.js';
import { LIFE_LEAD_MAX, birthdayCard, buildFeed, displayName, eventEnd, greetsToday, lifeCard, lifeWindow, wallPanels, type PeopleTile } from './feed.js';
import { DATE, TIME, PERSON_KINDS, NewsletterContent, assertRealDate, ilToIso, importNewsletter } from './wall-ops.js';
import { NEWSLETTER_SITE, latestFromArchive, parseIssue } from './newsletter.js';
import { storeNewsletterImages } from './newsletter-images.js';
import { syncForumEvents } from './newsletter-forum.js';
import { launchStream } from './launch-stream.js';

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { accept: 'text/html', 'user-agent': 'space-wall-remote/1.0' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`דף הניוזלטר לא נטען (HTTP ${res.status})`);
  return res.text();
}

// ---- design (the wall's URL options, now stored) ----------------------------------------------------
export const PANELS = ['news', 'events', 'people', 'ticker', 'launches'] as const;
export const DESIGN_DEFAULTS = { noon: true, qr: true, feature: 12, list: 4, fx: true, globe: 90, globeStyle: 'holo' as 'holo' | 'real', sway: true, lang: 'he' as 'he' | 'en', vw: false,
  css: '', headline: '', headlineEn: '', hide: [] as string[], news: [] as Row[] };

/** The agent's style layer (design.css), which the wall puts in a <style> after its own: it can recolor, resize, move
 *  or hide, never load anything (no url(), @import or fonts from outside) and never leave its <style>. */
export function cssProblem(css: string): string | null {
  if (/<|@import|@font-face|@namespace|url\s*\(|image-set\s*\(|expression\s*\(|javascript:|behavio(u)?r\s*:|-moz-binding|\\/i.test(css))
    return 'אסור בשכבת העיצוב: תגיות, קישורים או טעינה מבחוץ (url, @import), ו-\\';
  let depth = 0;
  for (const ch of css) { if (ch === '{') depth++; else if (ch === '}' && --depth < 0) break; }
  return depth === 0 ? null : 'סוגריים מסולסלים לא מאוזנים בשכבת העיצוב';
}
export const DesignPatch = z.object({
  noon: z.boolean(), qr: z.boolean(), fx: z.boolean(), sway: z.boolean(),
  feature: z.number().int().min(6).max(30), list: z.number().int().min(2).max(10), globe: z.number().int().min(20).max(240),
  globeStyle: z.enum(['holo', 'real']),
  lang: z.enum(['he', 'en']).describe('שפת הצג: en = כל הצג באנגלית (למשלחות), he = עברית'),
  vw: z.boolean().describe('מצב קיר מסכים: טקסט גדול, עבה ובהיר יותר לקיר של 9 טלוויזיות בלובי'),
  css: z.string().max(6000).superRefine((v, c) => { const e = cssProblem(v); if (e) c.addIssue({ code: 'custom', message: e }); }),
  headline: z.string().trim().max(80), headlineEn: z.string().trim().max(80),
  hide: z.array(z.enum(PANELS)).max(PANELS.length),
}).partial().strict();

const NOON_MS = 150e3;            // 10 s countdown + the 107 s promo, with a margin
const EVENT_FALLBACK_MS = 30 * 60e3;
const EVENT_PREVIEW_MS = 10 * 60e3;
const LONG_EVENT_MS = 12 * 3600e3;   // an all-day or multi-day event: never on the full screen for its whole length
const EVENT_MAX_DAYS = 31;
const WELCOME_MS = 12 * 3600e3;   // the welcome screen waits for "enter" (endTakeover); a forgotten one still ends
const WELCOME_LEAVE_MS = 20e3;    // after "enter": the wall's entrance (about 12 s), during which nothing else takes the screen
const MEMORIAL_MS = 15 * 60e3;    // the Yizkor screen from the remote; "חזרה לצג הבית" ends it sooner
const MEMORIAL_AUTO_MIN = 5;      // …and by itself, the first minutes of every hour of a memorial day
const MEMORIAL_HOURS = [8, 20];   // (Israel time, first and last hour)
export const HE_TYPE: Record<string, string> = { birthday: 'יום הולדת', wedding: 'חתונה', birth: 'לידה', bereavement: 'אבל', promotion: 'העלאה בדרגה', discharge: 'שחרור', joined: 'קליטה', other: 'אירוע' };

/** Mourning words as whole words (with a ו/ב/ה/ל prefix), so "חתימות" or "השלמות" aren't read as "מות". Same list as the remote's tpl(). */
export const SAD = /(^|[\s,.;:()"'־-])[ובהל]?(אבל|אבלות|צער|נפטר|נפטרה|פטירה|פטירת|מות|לוויה|הלוויה|ז"ל|ז״ל)(?=$|[\s,.;:()"'־-])/;

/** The operator's free-text event wording → the stored life_event_type. */
export function classifyLife(label: string): string {
  const t = label || '';
  if (SAD.test(t)) return 'bereavement';
  if (/הולדת/.test(t)) return 'birthday';
  if (/חתונ|נישוא|אירוס/.test(t)) return 'wedding';
  if (/לידה|נולד/.test(t)) return 'birth';
  if (/דרג|העלא/.test(t)) return 'promotion';
  if (/שחרור|פרישה|פרידה/.test(t)) return 'discharge';
  if (/קליטה|הצטרפ|חדש/.test(t)) return 'joined';
  return 'other';
}

// ---- schedules: when the full-screen moments come up and for how long (the remote's "תזמונים" screen) -------
/** Stored as design.moments (only what the remote changed); momentsOf() fills in the rest. These defaults are the
 *  wall's behaviour before the schedules screen existed, plus the half-hourly space news. The 12:00 video's on/off
 *  stays design.noon. Times are minutes (every, lead, auto) or seconds (secs, manual). */
export const MOMENTS0 = {
  fx: true,                                         // the shared entry and exit transition
  news: { on: true, every: 30, secs: 30 },          // a space news item, every `every` minutes (at a quarter past and to)
  celebrate: { on: true, every: 30, secs: 14, manual: 60 },   // personal ads (birthdays, joys); manual: shown from the remote
  event: { on: true, every: 0, secs: 60 },          // directorate ads while their event runs: every 0 = the whole time
  noon: { at: '12:00' },                            // the promo video's time
  launch: { on: true, lead: 10 },                   // launch mode, `lead` minutes before a Go launch
  welcome: { auto: 0 },                             // minutes until the welcome enters the wall by itself; 0 = waits for "enter"
  // a launch's official broadcast (lib/launch-stream.ts): full screen from `before` minutes before liftoff to `full`
  // minutes after it, then (small) in the space news corner until it ends; which: 'all' launches or 'big' ones only
  stream: { on: true, which: 'all', before: 5, full: 15, small: true },
};
export type Moments = typeof MOMENTS0;
const on = z.boolean(), int = (min: number, max: number) => z.number().int().min(min).max(max);
export const MomentsPatch = z.object({
  fx: on,
  news: z.object({ on, every: int(5, 240), secs: int(10, 300) }).partial().strict(),
  celebrate: z.object({ on, every: int(5, 240), secs: int(8, 300), manual: int(10, 600) }).partial().strict(),
  event: z.object({ on, every: int(0, 240).refine(v => v === 0 || v >= 5, 'כל 5 דקות לפחות'), secs: int(15, 1800) }).partial().strict(),
  noon: z.object({ at: TIME }).partial().strict(),
  launch: z.object({ on, lead: int(2, 30) }).partial().strict(),
  welcome: z.object({ auto: int(0, 720) }).partial().strict(),
  stream: z.object({ on, which: z.enum(['all', 'big']), before: int(1, 60), full: int(1, 240), small: on }).partial().strict(),
}).partial().strict();
/** The stored schedules over the defaults (anything malformed falls back to its default). */
export function momentsOf(design: Row | null | undefined): Moments {
  const raw: Row = design && typeof design.moments === 'object' && design.moments ? design.moments : {};
  const out: Row = { fx: typeof raw.fx === 'boolean' ? raw.fx : MOMENTS0.fx };
  for (const [k, d] of Object.entries(MOMENTS0)) {
    if (typeof d !== 'object') continue;
    const r = raw[k] && typeof raw[k] === 'object' ? raw[k] : {};
    out[k] = Object.fromEntries(Object.entries(d).map(([f, v]) => [f, typeof r[f] === typeof v ? r[f] : v]));
  }
  if (!['all', 'big'].includes(out.stream.which)) out.stream.which = MOMENTS0.stream.which;
  return out as Moments;
}
const withMoments = <T extends Row>(design: T): T & { moments: Moments } => ({ ...design, moments: momentsOf(design) });

// ---- state -----------------------------------------------------------------------------------------
type Row = Record<string, any>;
type UndoOp = { op: 'state'; patch: Row } | { op: 'del'; table: string; id: string } | { op: 'put'; table: string; row: Row };
const TABLES = new Set(['life_events', 'directorate_events', 'newsletter_issues', 'people', 'industry_events']);
// Columns the database computes; an undo that writes a row back must leave them out.
const GENERATED: Record<string, string[]> = { people: ['display_name'] };
const writable = (table: string, row: Row) => { const r = { ...row }; for (const k of GENERATED[table] || []) delete r[k]; return r; };

async function wallState(): Promise<Row> {
  const r = must(await db().from('wall_state').select('*').eq('id', 1).maybeSingle(), 'wall_state') as Row | null;
  return r || { design: {}, brightness: 100, urgent: null, takeover: null, noon_skip: null, dismissed: [] };
}
const minutesIL = (d: Date) => { const [h, m] = timeIL(d).split(':').map(Number); return h * 60 + m; };

/** A directorate event's days and hours in Israel time. An all-day event runs from midnight to the midnight after its
 *  last day (the newsletter's Forum events are kept so); one that ends on a later day has a lastDay after its date. */
export function eventSpan(e: Row) {
  const s = new Date(e.starts_at), en = new Date(eventEnd(e));
  const date = isoDateIL(s), start = timeIL(s), end = timeIL(en), endDay = isoDateIL(en);
  const allDay = start === '00:00' && end === '00:00' && endDay > date;
  return { date, start, end, lastDay: allDay ? addDays(endDay, -1) : endDay, allDay };
}
/** "10:00–11:00", "21.10–22.10" (all day), "21.10 22:00 – 22.10 01:00"; '' for a single all-day. */
export function spanText(sp: ReturnType<typeof eventSpan>): string {
  if (sp.allDay) return sp.lastDay > sp.date ? `${shortDate(sp.date)}–${shortDate(sp.lastDay)}` : '';
  return sp.lastDay > sp.date ? `${shortDate(sp.date)} ${sp.start} – ${shortDate(sp.lastDay)} ${sp.end}` : `${sp.start}–${sp.end}`;
}

/** An event on the full screen until it ends, or for its turn under the schedules (slot). Shown from the remote ahead
 *  of time, it stays only a short preview (unless it starts within half an hour), so a click on next week's event can't
 *  hold the wall for days; so does an all-day or multi-day one. */
function evTakeover(e: Row, auto: boolean, now = Date.now(), slot?: { k: number; until: number }): Row {
  const start = new Date(e.starts_at), end = eventEnd(e), long = end - start.getTime() > LONG_EVENT_MS, sp = eventSpan(e);
  const until = slot ? slot.until : end <= now ? now + EVENT_FALLBACK_MS : (long && !auto) || start.getTime() - now > 30 * 60e3 ? now + EVENT_PREVIEW_MS : end;
  return { id: (auto ? 'event:' : 'rt:' + now + ':') + e.id + (slot ? ':' + slot.k : ''), kind: 'event', auto, eventId: e.id, title: e.title, place: e.place || '',
    start: sp.start, end: sp.end, when: spanText(sp), img: e.photo_url || null, until: new Date(until).toISOString() };
}

/** Important events running right now. An all-day or multi-day one isn't among them: it would hide the wall for a day. */
async function bigEventsNow(now: Date): Promise<Row[]> {
  const rows = must(await db().from('directorate_events').select('id,title,place,starts_at,ends_at,photo_url').eq('takeover', true).eq('approved', true)
    .lte('starts_at', now.toISOString()).gte('starts_at', new Date(now.getTime() - 864e5).toISOString()), 'big events') as Row[];
  return rows.filter(e => eventEnd(e) > now.getTime() && eventEnd(e) - Date.parse(e.starts_at) <= LONG_EVENT_MS);
}

/** A running important event's turn on the full screen under the schedules: the whole event (every 0), or `secs`
 *  seconds every `every` minutes from its start; null between turns. */
function eventSlot(e: Row, M: Moments, t: number): { k: number; until: number } | undefined | null {
  if (!M.event.every) return undefined;
  const start = Date.parse(e.starts_at), end = e.ends_at ? Date.parse(e.ends_at) : start + 60 * 60e3, p = M.event.every * 60e3;
  const k = Math.floor((t - start) / p), until = Math.min(end, start + k * p + M.event.secs * 1e3);
  return t < until ? { k, until } : null;
}

// ---- Yizkor: memorial days -----------------------------------------------------------------------------
// On a memorial day the home wall keeps a small Yizkor (a lit candle) under the emblem all day, and the full Yizkor
// screen comes up by itself for the first minutes of every hour; the remote can show it, or end Yizkor early (kept in
// `dismissed` as "memorial:<id>", so it is undoable). The 12:00 promo, the half-hourly celebrations and the space news
// pause on those days.
export const MEMORIALS = [{ id: 'oct7-2026', from: '2026-10-07', to: '2026-10-08', label: 'יזכור · 7 באוקטובר' }];
export function memorialPeriod(now = new Date()) { const d = isoDateIL(now); return MEMORIALS.find(m => m.from <= d && d <= m.to) || null; }
/** The memorial on the wall now: today's, unless the remote ended it. */
function memorialNow(st: Row, now: Date) { const m = memorialPeriod(now); return m && !(st.dismissed || []).includes('memorial:' + m.id) ? m : null; }
/** dismissed, with `id` added: the newest 20 automatic moments, and the memorial ends however many came after them. */
const withDismissed = (list: string[] = [], id: string) => { const all = [...list.filter(x => x !== id), id]; return [...all.filter(x => x.startsWith('memorial:')), ...all.filter(x => !x.startsWith('memorial:')).slice(-20)]; };

/** What is on the full screen now: a moment started from the remote, else a running important event (as the schedules
 *  say), else the Yizkor screen at the top of the hour on a memorial day, else the 12:00 show (not on a memorial day). */
function effectiveTakeover(st: Row, big: Row[], now: Date): Row | null {
  const t = now.getTime(), today = isoDateIL(now), dis = new Set<string>(st.dismissed || []);
  if (st.takeover && Date.parse(st.takeover.until) > t) return st.takeover;
  const design = { ...DESIGN_DEFAULTS, ...(st.design || {}) }, M = momentsOf(design);
  if (M.event.on) for (const e of big) {
    if (dis.has('event:' + e.id)) continue;
    const slot = eventSlot(e, M, t);
    if (slot === null) continue;
    const tk = evTakeover(e, true, t, slot);
    if (!dis.has(tk.id)) return tk;
  }
  const mem = memorialNow(st, now);
  if (mem) {
    const [hh, mm] = timeIL(now).split(':').map(Number), id = 'memorial:' + today + 'T' + String(hh).padStart(2, '0');
    if (hh >= MEMORIAL_HOURS[0] && hh <= MEMORIAL_HOURS[1] && mm < MEMORIAL_AUTO_MIN && !dis.has(id))
      return { id, kind: 'memorial', auto: true, until: ilToIso(today, String(hh).padStart(2, '0') + ':' + String(MEMORIAL_AUTO_MIN).padStart(2, '0')) };
  }
  const noonAt = Date.parse(ilToIso(today, M.noon.at));
  if (!mem && design.noon && st.noon_skip !== today && !dis.has('noon:' + today) && t >= noonAt && t < noonAt + NOON_MS)
    return { id: 'noon:' + today, kind: 'noon', auto: true, until: new Date(noonAt + NOON_MS).toISOString() };
  return null;
}

/** The deployment the server runs; the wall reloads itself when it changes. '' when unknown (no reloads). */
const BUILD = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || '';

/** For the wall (api/live.ts): polled every few seconds. */
export async function live() {
  const now = new Date();
  const [st, big] = await Promise.all([wallState(), bigEventsNow(now)]);
  const design = withMoments({ ...DESIGN_DEFAULTS, ...(st.design || {}) });
  design.news = liveNews(design.news, now.getTime());
  const stream = await launchStream(design.moments.stream, st.dismissed, now.getTime());
  return { design, brightness: st.brightness ?? 100, urgent: st.urgent || null,
    noonToday: st.noon_skip !== isoDateIL(now), takeover: effectiveTakeover(st, big, now), memorial: memorialNow(st, now), stream, at: now.toISOString(), build: BUILD };
}

// ---- snapshot for the remote ------------------------------------------------------------------------
const EVENTS_DAYS = 365;          // directorate events the remote lists ahead
const PERSON_COLS = 'id,first_name,last_name,display_name,rank,role,unit,kind,birthday,show_birthday,on_wall,joined_on,leaves_on,email,phone,notes,photo_url,active,profile';
/** A people row as the remote uses it (the people screen edits all of it; the rest reads name, bday, photo). */
const personOut = (p: Row) => ({
  id: p.id, name: p.display_name, first: p.first_name, last: p.last_name || '', rank: p.rank || '', role: p.role || '', unit: p.unit || '',
  kind: p.kind || 'civilian', birthday: p.birthday || null, bday: p.birthday ? p.birthday.slice(5) : null, showBday: p.show_birthday !== false,
  onWall: p.on_wall !== false, joined: p.joined_on || null, leaves: p.leaves_on || null, email: p.email || '', phone: p.phone || '',
  notes: p.notes || '', photo: p.photo_url || null, active: p.active !== false, profile: p.profile || {},
});

/** A tile of the wall's people panel, for the remote: what it is (ref), and whether the wall greets it full screen today. */
const tileOut = (c: PeopleTile, today: string) => ({ ref: c.ref, name: c.name, type: c.type, on: c.on, until: c.until, full: greetsToday(c, today), quiet: !c.celebrate });

export async function snapshot() {
  const s = db(), now = new Date(), today = isoDateIL(now), dayStart = new Date(ilToIso(today, '00:00')).toISOString();
  const [st, big, people, life, events, ticker, nl, hist, panels] = await Promise.all([
    wallState(), bigEventsNow(now),
    s.from('people').select(PERSON_COLS).order('display_name'),
    // the last month, and every one still showing (a window can start long after its day)
    s.from('life_events').select('id,person_id,name,type,label,event_date,show_from,show_until,text_he,photo_mode,photo_url')
      .or(`event_date.gte.${addDays(today, -30)},show_until.gte.${today}`).lte('event_date', addDays(today, 400)).order('event_date'),
    // today's and later ones, and those still running (an event of several days)
    s.from('directorate_events').select('id,title,starts_at,ends_at,place,takeover,photo_url').eq('approved', true)
      .or(`starts_at.gte.${dayStart},ends_at.gt.${dayStart}`).lt('starts_at', ilToIso(addDays(today, EVENTS_DAYS + 1), '00:00')).order('starts_at'),
    s.from('industry_events').select('id,name,kind,starts_on,ends_on,place_he,url').eq('approved', true)
      .gte('starts_on', addDays(today, -120)).lte('starts_on', addDays(today, EVENTS_DAYS)).order('starts_on'),
    s.from('newsletter_issues').select('source_url,content,imported_at').order('issue_date', { ascending: false }).limit(1),
    s.from('remote_history').select('id,at,who,label,undo').is('undone_at', null).order('id', { ascending: false }).limit(50),
    wallPanels(now),
  ]);
  const issue = (must(nl, 'newsletter') as Row[])[0];
  // The same moment entered twice (same person or name, wording and day): the wall shows one of them, and the others say
  // which one they repeat.
  const lifeAll = must(life, 'life') as Row[], dupKey = (l: Row) => [l.type, l.label || '', l.person_id || (l.name || '').trim(), l.event_date].join('|');
  const tiles = [...panels.people.shown, ...panels.people.waiting], onWall = new Set(tiles.map(c => (c.ref.kind === 'life' ? c.ref.id : '')));
  const keeper = new Map<string, string>();
  for (const l of lifeAll) { const k = dupKey(l), cur = keeper.get(k); if (!cur || (onWall.has(l.id) && !onWall.has(cur))) keeper.set(k, l.id); }
  const lifeRows = lifeAll.map(l => {
    const keep = keeper.get(dupKey(l)), w = lifeWindow(l);
    return { id: l.id, personId: l.person_id || null, name: l.name || '', kind: l.type, type: l.label || HE_TYPE[l.type] || 'אירוע', date: l.event_date,
      showFrom: w.from, showUntil: w.until, note: l.text_he || '', photo: l.photo_mode || 'crm', photoSrc: l.photo_url || null, dupOf: keep && keep !== l.id ? keep : null };
  });
  return {
    now: now.toISOString(), today,
    people: (must(people, 'people') as Row[]).map(personOut),
    life: lifeRows,
    events: (must(events, 'events') as Row[]).map(e => ({ id: e.id, title: e.title, ...eventSpan(e), startsAt: new Date(e.starts_at).toISOString(),
      endsAt: new Date(eventEnd(e)).toISOString(), place: e.place || '', big: !!e.takeover, photo: e.photo_url || null })),
    // What the wall's people and events panels show now, worked out as the wall's feed does (lib/feed.ts); `waiting`
    // are due too but the panel is full.
    wall: {
      people: panels.people.shown.map(c => tileOut(c, today)), waiting: panels.people.waiting.map(c => tileOut(c, today)), doubles: panels.people.doubles,
      events: panels.events.shown.map(e => e.id as string), eventsWaiting: panels.events.waiting.map(e => e.id as string),
    },
    // The wall's ticker ("אירועים והזדמנויות") items kept in the database; the newsletter adds its own on top.
    ticker: (must(ticker, 'ticker') as Row[]).filter(t => (t.ends_on || t.starts_on) >= today)
      .map(t => ({ id: t.id, name: t.name, kind: t.kind || 'אירוע', start: t.starts_on, end: t.ends_on || null, place: t.place_he || '', url: t.url || '' })),
    newsletter: issue ? { range: issue.content?.issue?.range || '', url: issue.source_url, count: (issue.content?.news || []).length, at: issue.imported_at } : null,
    state: { design: withMoments({ ...DESIGN_DEFAULTS, ...(st.design || {}) }), brightness: st.brightness ?? 100, urgent: st.urgent || '', noonToday: st.noon_skip !== today },
    takeover: effectiveTakeover(st, big, now),
    stream: await launchStream(momentsOf(st.design).stream, st.dismissed, now.getTime()),
    memorial: (() => { const m = memorialPeriod(now); return m ? { id: m.id, label: m.label, on: !!memorialNow(st, now) } : null; })(),
    history: (must(hist, 'history') as Row[]).map(h => ({ id: h.id, at: h.at, who: h.who, text: h.label, canRestore: Array.isArray(h.undo) && h.undo.length > 0 })),
  };
}

// ---- writing, with history ---------------------------------------------------------------------------
/** Writes a history entry; a change that changed nothing (no undo ops) leaves no entry. */
async function record(who: string, label: string, undo: (UndoOp | null)[]) {
  const ops = undo.filter(Boolean) as UndoOp[];
  if (!ops.length) return;
  must(await db().from('remote_history').insert({ who, label, undo: ops }).select('id').single(), 'history');
}
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** Patch wall_state; returns the undo op restoring the previous values, or null when nothing would change. */
async function patchState(patch: Row, who: string): Promise<UndoOp | null> {
  const cur = await wallState(), prev: Row = {};
  for (const k of Object.keys(patch)) prev[k] = cur[k] ?? null;
  if (Object.keys(patch).every(k => same(patch[k], prev[k]))) return null;
  must(await db().from('wall_state').upsert({ id: 1, ...patch, updated_at: new Date().toISOString(), updated_by: who }).select('id').single(), 'wall_state');
  return { op: 'state', patch: prev };
}
async function rowOf(table: string, id: string): Promise<Row | null> {
  return must(await db().from(table).select('*').eq('id', id).maybeSingle(), table) as Row | null;
}
async function applyUndo(ops: UndoOp[]) {
  // Newest first; a run of the same operation on the same table goes in one request (an import undoes in two).
  const rev = [...ops].reverse();
  for (let i = 0; i < rev.length;) {
    const o = rev[i];
    if (o.op === 'state') { must(await db().from('wall_state').update({ ...o.patch, updated_at: new Date().toISOString() }).eq('id', 1).select('id'), 'undo state'); i++; continue; }
    if (!TABLES.has(o.table)) throw new Error('undo: table not allowed');
    let j = i;
    while (j < rev.length && rev[j].op === o.op && (rev[j] as { table?: string }).table === o.table) j++;
    const run = rev.slice(i, j) as Exclude<UndoOp, { op: 'state' }>[];
    if (o.op === 'del') must(await db().from(o.table).delete().in('id', run.map(r => (r as { id: string }).id)).select('id'), 'undo del');
    else must(await db().from(o.table).upsert(run.map(r => writable(o.table, (r as { row: Row }).row)), { defaultToNull: false }).select('id'), 'undo put');
    i = j;
  }
}

// ---- actions ------------------------------------------------------------------------------------------
const UUID = z.string().uuid();

// ---- things from the remote's agent: news items, pictures and streams --------------------------------
const MAX_NEWS = 6;
const NewsIn = z.object({
  title: z.string().trim().min(1).max(160), dek: z.string().trim().max(400).optional(), src: z.string().trim().max(60).optional(),
  url: z.string().url().max(500).regex(/^https:\/\//).optional().or(z.literal('')), image: z.string().url().max(500).optional().or(z.literal('')),
  cat: z.string().trim().max(24).optional(), titleEn: z.string().trim().max(160).optional(), dekEn: z.string().trim().max(400).optional(),
  days: z.number().int().min(1).max(30).default(7),
});
/** The remote's news items that haven't expired. */
export const liveNews = (news: unknown, now = Date.now()): Row[] => (Array.isArray(news) ? news : []).filter((n: Row) => n && Date.parse(n.until) > now);
const bucketBase = () => db().storage.from('wall-photos').getPublicUrl('x').data.publicUrl.replace(/x$/, '');
/** The wall shows only pictures kept in its own storage: one from the internet is copied there first (storeWebImage). */
function assertOurImage(url: string) {
  if (!url.startsWith(bucketBase())) throw new Error('התמונה צריכה להישמר קודם באחסון של הצג');
}
/** A YouTube link (watch, live, shorts, embed or youtu.be) or a bare video id → the video id; null for anything else. */
export function youtubeId(s: string): string | null {
  const t = s.trim();
  if (/^[\w-]{11}$/.test(t)) return t;
  let u: URL;
  try { u = new URL(t); } catch { return null; }
  const host = u.hostname.replace(/^(www\.|m\.)/, '');
  const id = host === 'youtu.be' ? u.pathname.slice(1)
    : host === 'youtube.com' || host === 'youtube-nocookie.com' ? (u.searchParams.get('v') || u.pathname.match(/^\/(?:live|shorts|embed)\/([\w-]{11})/)?.[1] || '') : '';
  return /^[\w-]{11}$/.test(id) ? id : null;
}
const IMG_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
/** A picture from the internet → a copy in the wall-photos bucket (web/), so the wall never depends on someone else's site. */
export async function storeWebImage(url: string): Promise<string> {
  let u: URL;
  try { u = new URL(url); } catch { throw new Error('קישור לא תקין לתמונה'); }
  if (u.protocol !== 'https:' || /^(localhost|\d+\.\d+\.\d+\.\d+|\[.*\])$/i.test(u.hostname) || !u.hostname.includes('.')) throw new Error('אפשר להביא תמונה רק מקישור https רגיל');
  const res = await fetch(u, { headers: { accept: 'image/*', 'user-agent': 'Mozilla/5.0 (space-wall)' }, redirect: 'follow', signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`התמונה לא נטענה (HTTP ${res.status})`);
  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase(), ext = IMG_TYPES[type];
  if (!ext) throw new Error('הקישור לא מוביל לתמונה (JPG, PNG, WEBP או GIF)');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 6e6) throw new Error('התמונה גדולה מדי (יותר מ-6MB)');
  if (buf.length < 2000) throw new Error('התמונה קטנה מדי');
  const path = `web/${randomUUID()}.${ext}`;
  const up = await db().storage.from('wall-photos').upload(path, buf, { contentType: type, upsert: false });
  if (up.error) throw new Error('שמירת התמונה נכשלה: ' + up.error.message);
  return db().storage.from('wall-photos').getPublicUrl(path).data.publicUrl;
}

// Who: a person from the list (personId), or just a name for someone who isn't in it.
const LifeInput = z.object({
  id: UUID.optional(), personId: UUID.nullable().optional(), name: z.string().trim().max(60).optional(), free: z.boolean().optional(), type: z.string().trim().min(1).max(40), date: DATE, showFrom: DATE.optional(),
  photo: z.enum(['crm', 'upload', 'none']).default('crm'), photoSrc: z.string().url().nullable().optional(), note: z.string().trim().max(120).optional(), showNow: z.boolean().optional(),
});
const EventInput = z.object({
  id: UUID.optional(), title: z.string().trim().min(2).max(80), date: DATE, start: TIME, end: TIME, place: z.string().trim().max(60).optional(), big: z.boolean().optional(),
  lastDay: DATE.nullable().optional(),   // an event of several days: its last day (start and end are then the first day's start and the last day's end)
  allDay: z.boolean().optional(),        // no hours: start and end are ignored
  photo: z.string().url().nullable().optional(),   // left out: an edit keeps the event's picture
});
const TickerInput = z.object({
  id: UUID.optional(), name: z.string().trim().min(2, 'כתבו שם').max(120), kind: z.enum(['אירוע', 'הזדמנות']).default('אירוע'),
  start: DATE, end: DATE.nullable().optional(), place: z.string().trim().max(80).optional(),
  url: z.union([z.literal(''), z.string().trim().url('קישור לא תקין').regex(/^https?:\/\//, 'קישור לא תקין')]).optional(),
});
const txt = (max: number) => z.string().trim().max(max).optional();
/** A person as the remote's people screen and its import send it. Empty text clears a field. */
const PersonInput = z.object({
  first: z.string().trim().min(1, 'חסר שם פרטי').max(40), last: txt(40), rank: txt(30), role: txt(80), unit: txt(80),
  kind: z.enum(PERSON_KINDS).optional(), birthday: DATE.nullable().optional(), showBday: z.boolean().optional(), onWall: z.boolean().optional(),
  joined: DATE.nullable().optional(), leaves: DATE.nullable().optional(), email: txt(120), phone: txt(40), notes: txt(500),
  photo: z.string().url().nullable().optional(), active: z.boolean().optional(),
  profile: z.record(z.string(), z.string().max(1000)).optional(),   // from the survey form: expertise, hobbies, ...
});
const PROFILE_KEYS = ['expertise', 'hobbies', 'fun_fact', 'space_q', 'upcoming', 'photo_link', 'office_note'];

/** Only the fields that were sent, as people columns. */
function personPatch(f: z.infer<typeof PersonInput>): Row {
  for (const d of [f.birthday, f.joined, f.leaves]) if (d) assertRealDate(d);
  if (f.birthday && f.birthday > isoDateIL()) throw new Error('תאריך הלידה של ' + f.first + ' בעתיד');
  const nul = (v: string | undefined) => (v === undefined ? undefined : v || null);
  const row: Row = {
    first_name: f.first, last_name: nul(f.last), rank: nul(f.rank), role: nul(f.role), unit: nul(f.unit), kind: f.kind,
    birthday: f.birthday, show_birthday: f.showBday, on_wall: f.onWall, joined_on: f.joined, leaves_on: f.leaves,
    email: nul(f.email), phone: nul(f.phone), notes: nul(f.notes), photo_url: f.photo, active: f.active,
  };
  for (const k of Object.keys(row)) if (row[k] === undefined) delete row[k];
  return row;
}
const nameKey = (first: string, last?: string | null) => [first, last].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
const fullName = (r: Row) => [r.first_name, r.last_name].filter(Boolean).join(' ');
async function namesake(first: string, last: string | null | undefined, exceptId?: string): Promise<Row | null> {
  const key = nameKey(first, last);
  const rows = must(await db().from('people').select('id,first_name,last_name,display_name,unit,active'), 'people') as Row[];
  return rows.find(r => r.id !== exceptId && nameKey(r.first_name, r.last_name) === key) || null;
}

async function personRow(id: string): Promise<Row> {
  const p = must(await db().from('people').select('id,display_name,rank,unit,photo_url,birthday,on_wall,active').eq('id', id).maybeSingle(), 'person') as Row | null;
  if (!p) throw new Error('לא נמצא האדם');
  return p;
}
/** People who asked to stay off the wall, or who left, get no moment on it. */
function assertOnWall(p: Row) {
  if (p.on_wall === false) throw new Error(displayName(p) + ' ביקש/ה לא להופיע בצג (אפשר לשנות במסך האנשים)');
  if (p.active === false) throw new Error(displayName(p) + ' מסומן/ת כמי שכבר לא במנהלת');
}
/** Who a personal event is for: the chosen person, the one person whose full name is exactly the typed name, or
 *  (nobody by that name) just the name, shown as is. */
async function lifeWho(personId: string | null | undefined, name: string | undefined, free = false): Promise<{ p: Row; personId: string | null; name: string | null }> {
  if (personId) { const p = await personRow(personId); assertOnWall(p); return { p, personId, name: null }; }
  const n = (name || '').replace(/\s+/g, ' ').trim();
  if (n.length < 2) throw new Error('כתבו למי השמחה');
  if (free) return { p: { display_name: n }, personId: null, name: n };   // the operator unlinked a namesake on purpose
  const rows = must(await db().from('people').select('id,first_name,last_name'), 'people') as Row[];
  const same = rows.filter(r => nameKey(r.first_name, r.last_name) === nameKey(n));
  if (same.length > 1) throw new Error('יש ברשימה כמה אנשים בשם ' + n + '. בחרו את האדם מההצעות');
  if (same.length === 1) { const p = await personRow(same[0].id); assertOnWall(p); return { p, personId: p.id, name: null }; }
  return { p: { display_name: n }, personId: null, name: n };
}
/** The person a life event row is about: from the list, or its own name. */
const lifeRowPerson = async (e: Row): Promise<Row> => (e.person_id ? personRow(e.person_id) : { display_name: e.name || '' });

/** person = the wall's card; type/note = the operator's wording, for the remote's preview; lifeId = the life event
 *  greeted (none for a birthday from the people list), so deleting it ends the greeting too. */
function celebrateTakeover(card: Row, personId: string | null, type: string, note: string, M: Moments, lifeId: string | null = null, now = Date.now()): Row {
  return { id: 'rt:' + now, kind: 'celebrate', personId, lifeId, person: card, type, note, at: new Date(now).toISOString(), until: new Date(now + M.celebrate.manual * 1e3).toISOString() };
}
const momentsNow = async () => momentsOf((await wallState()).design);

export const ACTIONS: Record<string, (a: any, who: string) => Promise<unknown>> = {
  async noon(_a, who) {
    const now = Date.now();
    await record(who, 'הופעל סרטון התדמית', [await patchState({ takeover: { id: 'rt:' + now, kind: 'noon', until: new Date(now + NOON_MS).toISOString() } }, who)]);
  },
  /** The welcome screen for a delegation's visit, up until "enter" (endTakeover), which plays the wall's entrance.
   *  guest: an optional line under the title, as typed (e.g. "Delegation of Japan"). */
  async welcome(a, who) {
    const { guest } = z.object({ guest: z.string().trim().max(80, 'עד 80 תווים').optional() }).parse(a || {});
    const now = Date.now(), auto = (await momentsNow()).welcome.auto;
    await record(who, 'מסך ברוכים הבאים' + (guest ? ': ' + guest : ''),
      [await patchState({ takeover: { id: 'rt:' + now, kind: 'welcome', guest: guest || '', until: new Date(now + (auto ? auto * 60e3 : WELCOME_MS)).toISOString() } }, who)]);
  },
  /** A space news item on the whole wall now: the wall picks the next of the newsletter's central stories. */
  async showNews(_a, who) {
    const now = Date.now(), M = await momentsNow();
    await record(who, 'חדשות החלל על כל המסך',
      [await patchState({ takeover: { id: 'rt:' + now, kind: 'news', at: new Date(now).toISOString(), until: new Date(now + M.news.secs * 1e3).toISOString() } }, who)]);
  },
  /** The schedules screen: what comes up by itself, how often and for how long (only what is sent changes). */
  async moments(a, who) {
    const { patch, label } = z.object({ patch: MomentsPatch, label: z.string().trim().min(1).max(80) }).parse(a);
    const cur = (await wallState()).design || {}, prev: Row = cur.moments || {}, next: Row = { ...prev };
    for (const [k, v] of Object.entries(patch)) next[k] = v && typeof v === 'object' ? { ...(prev[k] || {}), ...v } : v;
    await record(who, 'תזמונים: ' + label, [await patchState({ design: { ...cur, moments: next } }, who)]);
  },
  async celebrate(a, who) {
    const { personId, lifeId } = z.object({ personId: UUID.nullable().optional(), lifeId: UUID.optional() })
      .refine(x => x.personId || x.lifeId, 'חסר למי המודעה').parse(a);
    const today = isoDateIL();
    let p: Row, card: Row, type = 'יום הולדת', note = '';
    if (lifeId) {
      const e = await rowOf('life_events', lifeId);
      if (!e || (personId && e.person_id !== personId)) throw new Error('האירוע לא נמצא');
      if (e.type === 'bereavement') throw new Error('הודעת אבל לא עולה על כל המסך');
      p = await lifeRowPerson(e);
      if (e.person_id) assertOnWall(p);
      card = lifeCard(e, p, today); type = e.label || HE_TYPE[e.type]; note = e.text_he || '';
    } else {
      p = await personRow(personId!);
      assertOnWall(p);
      // the birthday of the last two days ("חגג/ה אתמול" on a Sunday for Friday's), else today
      card = birthdayCard(p, (p.birthday && nextYearly(p.birthday.slice(5), addDays(today, -2), 2)) || today, today);
    }
    await record(who, 'מודעה אישית על כל המסך: ' + displayName(p), [await patchState({ takeover: celebrateTakeover(card, p.id || null, type, note, await momentsNow(), lifeId || null) }, who)]);
  },
  async showEvent(a, who) {
    const { eventId } = z.object({ eventId: UUID }).parse(a);
    const e = await rowOf('directorate_events', eventId);
    if (!e) throw new Error('האירוע לא נמצא');
    await record(who, 'על כל המסך: ' + e.title, [await patchState({ takeover: evTakeover(e, false) }, who)]);
  },
  async endTakeover(_a, who) {
    const now = new Date(), [st, big] = await Promise.all([wallState(), bigEventsNow(now)]);
    const tk = effectiveTakeover(st, big, now);
    if (!tk) return;
    // "Enter" on the welcome screen: kept a few seconds more, marked `leaving`, so every wall plays the entrance (and one
    // opened meanwhile goes straight to the home wall). Pressed again meanwhile: ended at once.
    const patch: Row = tk.auto ? { dismissed: withDismissed(st.dismissed, tk.id) }
      : tk.kind === 'welcome' && !tk.leaving ? { takeover: { ...tk, leaving: now.toISOString(), until: new Date(now.getTime() + WELCOME_LEAVE_MS).toISOString() } }
      : { takeover: null };
    await record(who, tk.kind === 'welcome' || tk.kind === 'memorial' ? 'כניסה לצג הבית' : 'חזרה לתצוגה רגילה', [await patchState(patch, who)]);
  },
  /** Yizkor on a memorial day: show: the full Yizkor screen now (and Yizkor back on, if it was ended); on: false ends
   *  Yizkor on the wall for the rest of the period (with the Yizkor screen, if it is up), on: true brings it back. */
  async memorial(a, who) {
    const { show, on } = z.object({ show: z.boolean().optional(), on: z.boolean().optional() }).parse(a || {});
    const now = new Date(), m = memorialPeriod(now);
    if (!m) throw new Error('היום אין יזכור בצג');
    const st = await wallState(), key = 'memorial:' + m.id, dis: string[] = st.dismissed || [], t = now.getTime();
    const back = { dismissed: dis.filter(x => x !== key) };
    if (show) return record(who, 'מסך יזכור על כל המסך', [await patchState({ ...back, takeover: { id: 'rt:' + t, kind: 'memorial', until: new Date(t + MEMORIAL_MS).toISOString() } }, who)]);
    if (on === false) return record(who, 'סיום היזכור בצג', [await patchState({ dismissed: withDismissed(dis, key), ...(st.takeover?.kind === 'memorial' ? { takeover: null } : {}) }, who)]);
    if (on === true) return record(who, 'היזכור חזר לצג', [await patchState(back, who)]);
  },
  /** The launch broadcast on the wall (live().stream): small: from full screen to the space news corner; else ended.
   *  Kept in `dismissed` per launch, so the remote's undo brings it back. */
  async stream(a, who) {
    const { key, small } = z.object({ key: z.string().max(80), small: z.boolean().optional() }).parse(a);
    const st = await wallState();
    await record(who, small ? 'שידור השיגור עבר לצד' : 'סיום שידור השיגור', [await patchState({ dismissed: withDismissed(st.dismissed, (small ? 'streamfull:' : 'stream:') + key) }, who)]);
  },
  async noonToday(a, who) {
    const { on } = z.object({ on: z.boolean() }).parse(a);
    await record(who, on ? 'סרטון התדמית יעלה היום' : 'דילוג על סרטון התדמית היום', [await patchState({ noon_skip: on ? null : isoDateIL() }, who)]);
  },
  async saveLife(a, who) {
    const f = LifeInput.parse(a);
    assertRealDate(f.date); if (f.showFrom) assertRealDate(f.showFrom);
    const { p, personId, name } = await lifeWho(f.personId, f.name, f.free), kind = classifyLife(f.type);
    if (f.photo === 'upload' && !f.photoSrc) throw new Error('בחרו תמונה להעלאה');
    // On the wall from showFrom (at most LIFE_LEAD_MAX days ahead) for ten days past the day, or past showFrom when it
    // starts after the day (a moment added late still shows).
    const lead = addDays(f.date, -LIFE_LEAD_MAX), from = !f.showFrom ? f.date : f.showFrom < lead ? lead : f.showFrom;
    const row: Row = { person_id: personId, name, type: kind, label: f.type, event_date: f.date, show_from: from, show_until: addDays(from > f.date ? from : f.date, 10),
      text_he: f.note || null, photo_mode: f.photo, photo_url: f.photo === 'upload' ? f.photoSrc : null };
    const undo: (UndoOp | null)[] = [];
    let saved: Row;
    if (f.id) {
      const prev = await rowOf('life_events', f.id);
      if (!prev) throw new Error('האירוע לא נמצא');
      saved = must(await db().from('life_events').update(row).eq('id', f.id).select('*').single(), 'update life') as Row;
      undo.push({ op: 'put', table: 'life_events', row: prev });
    } else {
      saved = must(await db().from('life_events').insert({ ...row, created_by: 'remote:' + who }).select('*').single(), 'add life') as Row;
      undo.push({ op: 'del', table: 'life_events', id: saved.id });
    }
    if (f.showNow && kind !== 'bereavement') undo.push(await patchState({ takeover: celebrateTakeover(lifeCard(saved, p, isoDateIL()), personId, f.type, f.note || '', await momentsNow(), saved.id) }, who));
    await record(who, (f.id ? 'עודכן: ' : 'נוסף: ') + f.type + ' · ' + displayName(p), undo);
    return { id: saved.id };
  },
  async deleteLife(a, who) {
    const { id } = z.object({ id: UUID }).parse(a);
    const prev = await rowOf('life_events', id);
    if (!prev) throw new Error('האירוע לא נמצא');
    const p = await lifeRowPerson(prev).catch(() => null);
    const undo: (UndoOp | null)[] = [];
    const st = await wallState();
    if (st.takeover?.kind === 'celebrate' && st.takeover.lifeId === id) undo.push(await patchState({ takeover: null }, who));   // its greeting on the full screen now
    must(await db().from('life_events').delete().eq('id', id).select('id'), 'delete life');
    undo.push({ op: 'put', table: 'life_events', row: prev });
    await record(who, 'נמחק: ' + (prev.label || HE_TYPE[prev.type]) + (p ? ' · ' + displayName(p) : ''), undo);
  },
  /** A birthday from the people list off the wall: the person's "לחגוג יום הולדת בצג" turned off (the remote's people
   *  screen turns it on again). */
  async hideBirthday(a, who) {
    const { personId } = z.object({ personId: UUID }).parse(a);
    const prev = await rowOf('people', personId);
    if (!prev) throw new Error('האדם לא נמצא');
    if (prev.show_birthday === false) return;
    const undo: (UndoOp | null)[] = [];
    const st = await wallState();
    if (st.takeover?.kind === 'celebrate' && st.takeover.personId === personId && !st.takeover.lifeId) undo.push(await patchState({ takeover: null }, who));
    must(await db().from('people').update({ show_birthday: false }).eq('id', personId).select('id'), 'hide birthday');
    undo.push({ op: 'put', table: 'people', row: prev });
    await record(who, 'יום ההולדת של ' + prev.display_name + ' לא יוצג בצג', undo);
  },
  async saveEvent(a, who) {
    const f = EventInput.parse(a);
    assertRealDate(f.date); if (f.lastDay) assertRealDate(f.lastDay);
    if (f.lastDay && f.lastDay < f.date) throw new Error('תאריך הסיום לפני תאריך ההתחלה');
    const last = f.lastDay && f.lastDay > f.date ? f.lastDay : f.date;
    if (dayDiff(f.date, last) > EVENT_MAX_DAYS) throw new Error('אירוע יכול להימשך עד חודש. בדקו את תאריך הסיום');
    if (!f.allDay && last === f.date && f.end <= f.start) throw new Error('שעת הסיום צריכה להיות אחרי שעת ההתחלה');
    // All day: from midnight to the midnight after the last day. Several days: from the first day's start to the last day's end.
    const row: Row = { title: f.title, starts_at: ilToIso(f.date, f.allDay ? '00:00' : f.start), ends_at: f.allDay ? ilToIso(addDays(last, 1), '00:00') : ilToIso(last, f.end),
      place: f.place || null, takeover: !!f.big };
    if (f.photo !== undefined) row.photo_url = f.photo;
    let undo: UndoOp, id: string;
    if (f.id) {
      const prev = await rowOf('directorate_events', f.id);
      if (!prev) throw new Error('האירוע לא נמצא');
      must(await db().from('directorate_events').update(row).eq('id', f.id).select('id'), 'update event');
      undo = { op: 'put', table: 'directorate_events', row: prev }; id = f.id;
    } else {
      const r = must(await db().from('directorate_events').insert({ ...row, type: 'other', created_by: 'remote:' + who }).select('id').single(), 'add event') as Row;
      undo = { op: 'del', table: 'directorate_events', id: r.id }; id = r.id;
    }
    await record(who, (f.id ? 'עודכן אירוע: ' : 'נוסף אירוע: ') + f.title, [undo]);
    return { id };
  },
  async deleteEvent(a, who) {
    const { id } = z.object({ id: UUID }).parse(a);
    const prev = await rowOf('directorate_events', id);
    if (!prev) throw new Error('האירוע לא נמצא');
    const undo: (UndoOp | null)[] = [];
    const st = await wallState();
    if (st.takeover && st.takeover.eventId === id) undo.push(await patchState({ takeover: null }, who));
    must(await db().from('directorate_events').delete().eq('id', id).select('id'), 'delete event');
    undo.push({ op: 'put', table: 'directorate_events', row: prev });
    await record(who, 'נמחק אירוע: ' + prev.title, undo);
  },
  // ---- the ticker's events and opportunities (industry_events) ----
  async saveTicker(a, who) {
    const f = TickerInput.parse(a);
    assertRealDate(f.start); if (f.end) assertRealDate(f.end);
    if (f.end && f.end < f.start) throw new Error('תאריך הסיום לפני תאריך ההתחלה');
    const row: Row = { name: f.name, kind: f.kind, starts_on: f.start, ends_on: f.end && f.end !== f.start ? f.end : null, place_he: f.place || null, url: f.url || null };
    let undo: UndoOp, id: string;
    if (f.id) {
      const prev = await rowOf('industry_events', f.id);
      if (!prev) throw new Error('הפריט לא נמצא');
      must(await db().from('industry_events').update(row).eq('id', f.id).select('id'), 'update ticker');
      undo = { op: 'put', table: 'industry_events', row: prev }; id = f.id;
    } else {
      const r = must(await db().from('industry_events').insert({ ...row, source: 'remote' }).select('id').single(), 'add ticker') as Row;
      undo = { op: 'del', table: 'industry_events', id: r.id }; id = r.id;
    }
    await record(who, (f.id ? 'עודכן ברצועת האירועים: ' : 'נוסף לרצועת האירועים: ') + f.name, [undo]);
    return { id };
  },
  async deleteTicker(a, who) {
    const { id } = z.object({ id: UUID }).parse(a);
    const prev = await rowOf('industry_events', id);
    if (!prev) throw new Error('הפריט לא נמצא');
    must(await db().from('industry_events').delete().eq('id', id).select('id'), 'delete ticker');
    await record(who, 'נמחק מרצועת האירועים: ' + prev.name, [{ op: 'put', table: 'industry_events', row: prev }]);
  },

  // ---- people (the remote's people screen) ----
  async savePerson(a, who) {
    const { id, ...f } = PersonInput.extend({ id: UUID.optional() }).parse(a);
    const row = personPatch(f);
    const dup = await namesake(f.first, f.last, id);
    if (dup) throw new Error('כבר יש ברשימה את ' + dup.display_name + (dup.unit ? ' (' + dup.unit + ')' : '') + (dup.active === false ? ', שמסומן/ת כמי שעזב/ה' : '') + '. אם זה אדם אחר, הוסיפו פרט מבדיל לשם.');
    const undo: (UndoOp | null)[] = [];
    let saved: Row;
    if (id) {
      const prev = await rowOf('people', id);
      if (!prev) throw new Error('האדם לא נמצא');
      if (f.profile) row.profile = { ...(prev.profile || {}), ...f.profile };
      saved = must(await db().from('people').update(row).eq('id', id).select('id,display_name').single(), 'update person') as Row;
      undo.push({ op: 'put', table: 'people', row: prev });
      const st = await wallState();
      if ((row.on_wall === false || row.active === false) && st.takeover?.personId === id) undo.push(await patchState({ takeover: null }, who));
    } else {
      if (f.profile) row.profile = f.profile;
      saved = must(await db().from('people').insert(row).select('id,display_name').single(), 'add person') as Row;
      undo.push({ op: 'del', table: 'people', id: saved.id });
    }
    await record(who, (id ? 'עודכנו הפרטים של ' : 'נוסף/ה לרשימת האנשים: ') + saved.display_name, undo);
    return { id: saved.id };
  },
  /** Deletes a person with their personal moments; undo brings both back. Someone who left is better marked inactive. */
  async deletePerson(a, who) {
    const { id } = z.object({ id: UUID }).parse(a);
    const prev = await rowOf('people', id);
    if (!prev) throw new Error('האדם לא נמצא');
    const life = must(await db().from('life_events').select('*').eq('person_id', id), 'life') as Row[];
    const undo: (UndoOp | null)[] = [];
    const st = await wallState();
    if (st.takeover?.personId === id) undo.push(await patchState({ takeover: null }, who));
    must(await db().from('people').delete().eq('id', id).select('id'), 'delete person');
    // applied newest first: the person comes back before their life events
    undo.push(...life.map(row => ({ op: 'put', table: 'life_events', row }) as UndoOp), { op: 'put', table: 'people', row: prev });
    await record(who, 'נמחק/ה מרשימת האנשים: ' + prev.display_name + (life.length ? ' (עם ' + life.length + ' אירועים אישיים)' : ''), undo);
  },
  /** Rows from an Excel/CSV file or the survey form's response sheet, already mapped to fields by the remote.
   *  A name that exists is updated with what the file adds (never blanked); a new name is added. */
  async importPeople(a, who) {
    const { rows, file } = z.object({ rows: z.array(z.unknown()).min(1).max(1000), file: z.string().max(120).optional() }).parse(a);
    const skipped: { row: number; reason: string }[] = [];
    // The same person twice (the form filled again): the later row wins, field by field.
    const merged = new Map<string, { n: number; f: z.infer<typeof PersonInput> }>();
    rows.forEach((raw, i) => {
      const p = PersonInput.safeParse(raw);
      if (!p.success) return skipped.push({ row: i + 1, reason: p.error.issues.map(x => x.path.join('.') + ': ' + x.message).join('; ') });
      const f = p.data, k = nameKey(f.first, f.last), prev = merged.get(k);
      const defined = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== ''));
      merged.set(k, { n: i + 1, f: prev ? { ...prev.f, ...defined, profile: { ...prev.f.profile, ...f.profile } } as typeof f : f });
    });
    const all = must(await db().from('people').select('*'), 'people') as Row[];
    const byKey = new Map(all.map(p => [nameKey(p.first_name, p.last_name), p]));
    const inserts: Row[] = [], updates: Row[] = [], undo: UndoOp[] = [];
    let same = 0;
    for (const [k, { n, f }] of merged) {
      let row: Row;
      try { row = personPatch(f); } catch (e) { skipped.push({ row: n, reason: (e as Error).message }); continue; }
      const profile = Object.fromEntries(Object.entries(f.profile || {}).filter(([pk, v]) => PROFILE_KEYS.includes(pk) && v.trim()));
      const cur = byKey.get(k);
      if (!cur) { inserts.push({ kind: 'civilian', ...row, ...(Object.keys(profile).length ? { profile } : {}) }); continue; }
      const patch: Row = {};
      for (const [c, v] of Object.entries(row)) if (v !== null && v !== cur[c]) patch[c] = v;
      const prof = { ...(cur.profile || {}), ...profile };
      if (JSON.stringify(prof) !== JSON.stringify(cur.profile || {})) patch.profile = prof;
      if (!Object.keys(patch).length) { same++; continue; }
      updates.push({ ...writable('people', cur), ...patch, updated_at: new Date().toISOString() });
      undo.push({ op: 'put', table: 'people', row: cur });
    }
    if (updates.length) must(await db().from('people').upsert(updates, { defaultToNull: false }).select('id'), 'import update');
    if (inserts.length) {
      const ins = must(await db().from('people').insert(inserts, { defaultToNull: false }).select('id'), 'import add') as Row[];
      undo.push(...ins.map(x => ({ op: 'del', table: 'people', id: x.id }) as UndoOp));
    }
    const n = (k: number, one: string, many: string) => (k === 1 ? one : k + ' ' + many);
    if (undo.length) await record(who, 'ייבוא אנשים' + (file ? ' מ-' + file : '') + ': ' + [inserts.length ? n(inserts.length, 'אחד חדש', 'חדשים') : '', updates.length ? n(updates.length, 'אחד עודכן', 'עודכנו') : ''].filter(Boolean).join(', '), undo);
    return { added: inserts.length, updated: updates.length, same, skipped };
  },

  /** Imports an issue of the Rakia newsletter site directly (the home or archive page means its newest issue),
   *  or a link that serves the newsletter as JSON; any other link answers handoff: true (the remote says which links work). */
  async newsletter(a, who) {
    const { url } = z.object({ url: z.string().url().regex(/^https?:\/\//) }).parse(a);
    let content: z.infer<typeof NewsletterContent> | null = null, issueDate = isoDateIL(), sourceUrl = url;
    const u = new URL(url), site = new URL(NEWSLETTER_SITE);
    if (u.hostname === site.hostname) {
      let page = u.pathname.match(/^\/(\d{4}-\d{2}-\d{2})\/?/)?.[1];
      if (!page) {
        page = latestFromArchive(await fetchText(`${NEWSLETTER_SITE}/archive/`)) || undefined;
        if (!page) throw new Error('לא נמצא גיליון באתר הניוזלטר');
      }
      const parsed = parseIssue(await fetchText(`${NEWSLETTER_SITE}/${page}/`), isoDateIL());
      await storeNewsletterImages(parsed);
      await syncForumEvents(parsed.forum);
      content = NewsletterContent.parse(parsed.content); issueDate = parsed.issue_date; sourceUrl = parsed.source_url;
    } else {
      try {
        const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
        if (res.ok && /json/.test(res.headers.get('content-type') || '')) {
          const parsed = NewsletterContent.safeParse(await res.json());
          if (parsed.success) content = parsed.data;
        }
      } catch { /* not reachable or not JSON: hand off */ }
    }
    if (!content) return { handoff: true };
    const prev = must(await db().from('newsletter_issues').select('*').eq('issue_date', issueDate).maybeSingle(), 'prev issue') as Row | null;
    const saved = await importNewsletter(issueDate, sourceUrl, content) as unknown as Row;
    await record(who, 'יובא גיליון הניוזלטר ' + content.issue.range, [prev ? { op: 'put', table: 'newsletter_issues', row: prev } : { op: 'del', table: 'newsletter_issues', id: saved.id }]);
    return { handoff: false, range: content.issue.range, count: content.news.length };
  },
  async urgent(a, who) {
    const { text } = z.object({ text: z.string().trim().max(200) }).parse(a);
    await record(who, text ? 'שודרה הודעה דחופה' : 'הוסרה ההודעה הדחופה', [await patchState({ urgent: text || null }, who)]);
  },
  async brightness(a, who) {
    const { value } = z.object({ value: z.number().int().min(10).max(100) }).parse(a);
    await record(who, 'בהירות ' + value + '%', [await patchState({ brightness: value }, who)]);
  },
  async design(a, who) {
    const { patch, label, warm } = z.object({ patch: DesignPatch, label: z.string().max(80), warm: z.boolean().default(true) }).parse(a);
    const cur = (await wallState()).design || {};
    await record(who, label, [await patchState({ design: { ...cur, ...patch } }, who)]);
    // Switching to English translates what the wall shows now, so it comes up in English at once (the remote waits;
    // the agent, with its own time limit, doesn't, and the wall translates on its next feed request).
    if (warm && patch.lang === 'en' && cur.lang !== 'en') {
      const { feedInEnglish } = await import('./translate.js');
      const { translated } = await feedInEnglish(await buildFeed(), 40e3);
      return { lang: 'en', missing: translated.missing, error: translated.error };
    }
  },
  async resetDesign(_a, who) {
    // The news items added from the remote and the schedules live in design too (design.news, design.moments), but they aren't the design.
    const { news, moments } = (await wallState()).design || {};
    await record(who, 'העיצוב אופס לברירת המחדל', [await patchState({ design: { ...(news?.length ? { news } : {}), ...(moments ? { moments } : {}) } }, who)]);
  },
  /** A news item from the remote (the agent's suggestion, after the operator approved it): first in the newsletter
   *  panel, as a featured story, until it expires. Hebrew and English, so the English mode needs no translation. */
  async addNews(a, who) {
    const f = NewsIn.parse(a);
    if (f.image) assertOurImage(f.image);
    const cur = (await wallState()).design || {}, now = Date.now();
    const item = { id: randomUUID(), title: f.title, dek: f.dek || '', src: f.src || '', url: f.url || '', image: f.image || '', cat: f.cat || '',
      titleEn: f.titleEn || '', dekEn: f.dekEn || '', added: new Date(now).toISOString(), until: new Date(now + f.days * 864e5).toISOString() };
    const news = [item, ...liveNews(cur.news, now)].slice(0, MAX_NEWS);
    await record(who, 'נוספה ידיעה לניוזלטר בצג: ' + f.title.slice(0, 60), [await patchState({ design: { ...cur, news } }, who)]);
    return { id: item.id };
  },
  async removeNews(a, who) {
    const { id } = z.object({ id: UUID }).parse(a);
    const cur = (await wallState()).design || {}, old: Row[] = cur.news || [], hit = old.find(n => n.id === id);
    if (!hit) throw new Error('הידיעה לא נמצאה');
    await record(who, 'הוסרה ידיעה מהצג: ' + String(hit.title).slice(0, 60), [await patchState({ design: { ...cur, news: old.filter(n => n.id !== id) } }, who)]);
  },
  /** A picture on the whole wall, with an optional caption, for some minutes (the remote's "back to normal" ends it). */
  async showImage(a, who) {
    const f = z.object({ url: z.string().url(), caption: z.string().trim().max(120).optional(), captionEn: z.string().trim().max(120).optional(),
      minutes: z.number().int().min(1).max(240).default(2) }).parse(a);
    assertOurImage(f.url);
    const now = Date.now();
    await record(who, 'תמונה על כל המסך' + (f.caption ? ': ' + f.caption.slice(0, 50) : ''), [await patchState({ takeover: { id: 'rt:' + now, kind: 'image',
      url: f.url, caption: f.caption || '', captionEn: f.captionEn || '', until: new Date(now + f.minutes * 60e3).toISOString() } }, who)]);
  },
  /** A live stream (a launch's webcast) on the whole wall: YouTube only, muted, until the remote ends it or `minutes` pass. */
  async showStream(a, who) {
    const f = z.object({ url: z.string().max(500), title: z.string().trim().max(120).optional(), minutes: z.number().int().min(5).max(480).default(180) }).parse(a);
    const videoId = youtubeId(f.url);
    if (!videoId) throw new Error('אפשר להציג בצג רק שידור מ-YouTube (קישור youtube.com או youtu.be)');
    const now = Date.now();
    await record(who, 'שידור חי על כל המסך' + (f.title ? ': ' + f.title.slice(0, 60) : ''), [await patchState({ takeover: { id: 'rt:' + now, kind: 'stream',
      videoId, title: f.title || '', until: new Date(now + f.minutes * 60e3).toISOString() } }, who)]);
  },
  async eventImportant(a, who) {
    const { id, important } = z.object({ id: UUID, important: z.boolean() }).parse(a);
    const prev = await rowOf('directorate_events', id);
    if (!prev) throw new Error('האירוע לא נמצא');
    must(await db().from('directorate_events').update({ takeover: important }).eq('id', id).select('id'), 'event important');
    await record(who, (important ? 'סומן כמודעה מנהלת: ' : 'בוטל סימון מודעה מנהלת: ') + prev.title, [{ op: 'put', table: 'directorate_events', row: prev }]);
  },
  /** Undo this change and everything after it. */
  async restore(a) {
    const { id } = z.object({ id: z.number().int() }).parse(a);
    const rows = must(await db().from('remote_history').select('id,label,undo').is('undone_at', null).gte('id', id).order('id', { ascending: false }), 'history') as Row[];
    if (!rows.length || rows[rows.length - 1].id !== id) throw new Error('השינוי לא נמצא בהיסטוריה');
    for (const r of rows) await applyUndo(r.undo || []);
    must(await db().from('remote_history').update({ undone_at: new Date().toISOString() }).in('id', rows.map(r => r.id)).select('id'), 'history');
    return { label: rows[rows.length - 1].label };
  },
  /** A photo for a life event, a person or a directorate event: a shrunk JPEG data URL → public URL in the wall-photos bucket. */
  async photo(a) {
    const { dataUrl, folder } = z.object({ dataUrl: z.string().regex(/^data:image\/(jpeg|png|webp);base64,/).max(2_000_000), folder: z.enum(['life', 'people', 'events', 'web']).default('life') }).parse(a);
    const [, type, b64] = dataUrl.match(/^data:image\/(\w+);base64,(.*)$/)!;
    const path = `${folder}/${randomUUID()}.${type === 'jpeg' ? 'jpg' : type}`;
    const up = await db().storage.from('wall-photos').upload(path, Buffer.from(b64, 'base64'), { contentType: 'image/' + type, upsert: false });
    if (up.error) throw new Error('העלאת התמונה נכשלה: ' + up.error.message);
    return { url: db().storage.from('wall-photos').getPublicUrl(path).data.publicUrl };
  },
};
