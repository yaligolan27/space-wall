// The remote control's operations (app/remote → api/remote.ts) and the live wall state (api/live.ts).
// Every change is written to remote_history together with the operations that undo it, so the remote can
// undo the last change or roll back to any earlier point. Nothing here calls a model.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db, must } from './db.js';
import { addDays, isoDateIL, timeIL } from './dates.js';
import { birthdayCard, displayName, lifeCard } from './feed.js';
import { DATE, TIME, PERSON_KINDS, NewsletterContent, assertRealDate, ilToIso, importNewsletter } from './wall-ops.js';
import { NEWSLETTER_SITE, latestFromArchive, parseIssue } from './newsletter.js';
import { storeNewsletterImages } from './newsletter-images.js';

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { accept: 'text/html', 'user-agent': 'space-wall-remote/1.0' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`דף הניוזלטר לא נטען (HTTP ${res.status})`);
  return res.text();
}

// ---- design (the wall's URL options, now stored) ----------------------------------------------------
export const DESIGN_DEFAULTS = { noon: true, qr: true, feature: 12, list: 4, fx: true, globe: 90, globeStyle: 'holo' as 'holo' | 'real', sway: true };
export const DesignPatch = z.object({
  noon: z.boolean(), qr: z.boolean(), fx: z.boolean(), sway: z.boolean(),
  feature: z.number().int().min(6).max(30), list: z.number().int().min(2).max(10), globe: z.number().int().min(20).max(240),
  globeStyle: z.enum(['holo', 'real']),
}).partial().strict();

const NOON_MS = 150e3;            // 10 s countdown + the 107 s promo, with a margin
const CELEBRATE_MS = 60e3;
const EVENT_FALLBACK_MS = 30 * 60e3;
const EVENT_PREVIEW_MS = 10 * 60e3;
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

/** An event on the full screen until it ends. Shown from the remote ahead of time, it stays only a short preview
 *  (unless it starts within half an hour), so a click on next week's event can't hold the wall for days. */
function evTakeover(e: Row, auto: boolean, now = Date.now()): Row {
  const start = new Date(e.starts_at), end = e.ends_at ? Date.parse(e.ends_at) : start.getTime() + 60 * 60e3;
  const until = end <= now ? now + EVENT_FALLBACK_MS : start.getTime() - now > 30 * 60e3 ? now + EVENT_PREVIEW_MS : end;
  return { id: (auto ? 'event:' : 'rt:' + now + ':') + e.id, kind: 'event', auto, eventId: e.id, title: e.title, place: e.place || '',
    start: timeIL(start), end: timeIL(new Date(end)), until: new Date(until).toISOString() };
}

/** Important events running right now. */
async function bigEventsNow(now: Date): Promise<Row[]> {
  const rows = must(await db().from('directorate_events').select('id,title,place,starts_at,ends_at').eq('takeover', true).eq('approved', true)
    .lte('starts_at', now.toISOString()).gte('starts_at', new Date(now.getTime() - 864e5).toISOString()), 'big events') as Row[];
  return rows.filter(e => (e.ends_at ? Date.parse(e.ends_at) : Date.parse(e.starts_at) + 60 * 60e3) > now.getTime());
}

/** What is on the full screen now: a moment started from the remote, else a running important event, else the 12:00 show. */
function effectiveTakeover(st: Row, big: Row[], now: Date): Row | null {
  const t = now.getTime(), today = isoDateIL(now), dis = new Set<string>(st.dismissed || []);
  if (st.takeover && Date.parse(st.takeover.until) > t) return st.takeover;
  const ev = big.find(e => !dis.has('event:' + e.id));
  if (ev) return evTakeover(ev, true, t);
  const design = { ...DESIGN_DEFAULTS, ...(st.design || {}) };
  const noonAt = Date.parse(ilToIso(today, '12:00'));
  if (design.noon && st.noon_skip !== today && !dis.has('noon:' + today) && t >= noonAt && t < noonAt + NOON_MS)
    return { id: 'noon:' + today, kind: 'noon', auto: true, until: new Date(noonAt + NOON_MS).toISOString() };
  return null;
}

/** The deployment the server runs; the wall reloads itself when it changes. '' when unknown (no reloads). */
const BUILD = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || '';

/** For the wall (api/live.ts): polled every few seconds. */
export async function live() {
  const now = new Date();
  const [st, big] = await Promise.all([wallState(), bigEventsNow(now)]);
  return { design: { ...DESIGN_DEFAULTS, ...(st.design || {}) }, brightness: st.brightness ?? 100, urgent: st.urgent || null,
    noonToday: st.noon_skip !== isoDateIL(now), takeover: effectiveTakeover(st, big, now), at: now.toISOString(), build: BUILD };
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

export async function snapshot() {
  const s = db(), now = new Date(), today = isoDateIL(now);
  const [st, big, people, life, events, ticker, nl, hist] = await Promise.all([
    wallState(), bigEventsNow(now),
    s.from('people').select(PERSON_COLS).order('display_name'),
    s.from('life_events').select('id,person_id,name,type,label,event_date,show_from,show_until,text_he,photo_mode,photo_url')
      .gte('event_date', addDays(today, -30)).lte('event_date', addDays(today, 365)).order('event_date'),
    s.from('directorate_events').select('id,title,starts_at,ends_at,place,takeover').eq('approved', true)
      .gte('starts_at', ilToIso(today, '00:00')).lt('starts_at', ilToIso(addDays(today, EVENTS_DAYS + 1), '00:00')).order('starts_at'),
    s.from('industry_events').select('id,name,kind,starts_on,ends_on,place_he,url').eq('approved', true)
      .gte('starts_on', addDays(today, -120)).lte('starts_on', addDays(today, EVENTS_DAYS)).order('starts_on'),
    s.from('newsletter_issues').select('source_url,content,imported_at').order('issue_date', { ascending: false }).limit(1),
    s.from('remote_history').select('id,at,who,label,undo').is('undone_at', null).order('id', { ascending: false }).limit(50),
  ]);
  const issue = (must(nl, 'newsletter') as Row[])[0];
  return {
    now: now.toISOString(), today,
    people: (must(people, 'people') as Row[]).map(personOut),
    life: (must(life, 'life') as Row[]).map(l => ({ id: l.id, personId: l.person_id || null, name: l.name || '', kind: l.type, type: l.label || HE_TYPE[l.type] || 'אירוע', date: l.event_date,
      showFrom: l.show_from || addDays(l.event_date, -10), showUntil: l.show_until || addDays(l.event_date, 3), note: l.text_he || '', photo: l.photo_mode || 'crm', photoSrc: l.photo_url || null })),
    events: (must(events, 'events') as Row[]).map(e => { const st0 = new Date(e.starts_at), en = e.ends_at ? new Date(e.ends_at) : new Date(st0.getTime() + 60 * 60e3);
      return { id: e.id, title: e.title, date: isoDateIL(st0), start: timeIL(st0), end: timeIL(en), place: e.place || '', big: !!e.takeover }; }),
    // The wall's ticker ("אירועים והזדמנויות") items kept in the database; the newsletter adds its own on top.
    ticker: (must(ticker, 'ticker') as Row[]).filter(t => (t.ends_on || t.starts_on) >= today)
      .map(t => ({ id: t.id, name: t.name, kind: t.kind || 'אירוע', start: t.starts_on, end: t.ends_on || null, place: t.place_he || '', url: t.url || '' })),
    newsletter: issue ? { range: issue.content?.issue?.range || '', url: issue.source_url, count: (issue.content?.news || []).length, at: issue.imported_at } : null,
    state: { design: { ...DESIGN_DEFAULTS, ...(st.design || {}) }, brightness: st.brightness ?? 100, urgent: st.urgent || '', noonToday: st.noon_skip !== today },
    takeover: effectiveTakeover(st, big, now),
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
// Who: a person from the list (personId), or just a name for someone who isn't in it.
const LifeInput = z.object({
  id: UUID.optional(), personId: UUID.nullable().optional(), name: z.string().trim().max(60).optional(), free: z.boolean().optional(), type: z.string().trim().min(1).max(40), date: DATE, showFrom: DATE.optional(),
  photo: z.enum(['crm', 'upload', 'none']).default('crm'), photoSrc: z.string().url().nullable().optional(), note: z.string().trim().max(120).optional(), showNow: z.boolean().optional(),
});
const EventInput = z.object({
  id: UUID.optional(), title: z.string().trim().min(2).max(80), date: DATE, start: TIME, end: TIME, place: z.string().trim().max(60).optional(), big: z.boolean().optional(),
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

/** person = the wall's card; type/note = the operator's wording, for the remote's preview. */
function celebrateTakeover(card: Row, personId: string | null, type: string, note: string, now = Date.now()): Row {
  return { id: 'rt:' + now, kind: 'celebrate', personId, person: card, type, note, until: new Date(now + CELEBRATE_MS).toISOString() };
}

export const ACTIONS: Record<string, (a: any, who: string) => Promise<unknown>> = {
  async noon(_a, who) {
    const now = Date.now();
    await record(who, 'הופעל מופע הצהריים', [await patchState({ takeover: { id: 'rt:' + now, kind: 'noon', until: new Date(now + NOON_MS).toISOString() } }, who)]);
  },
  async celebrate(a, who) {
    const { personId, lifeId } = z.object({ personId: UUID.nullable().optional(), lifeId: UUID.optional() })
      .refine(x => x.personId || x.lifeId, 'חסר למי הברכה').parse(a);
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
      card = birthdayCard(p, today, today);
    }
    await record(who, 'ברכה על כל המסך: ' + displayName(p), [await patchState({ takeover: celebrateTakeover(card, p.id || null, type, note) }, who)]);
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
    const patch: Row = tk.auto ? { dismissed: [...(st.dismissed || []), tk.id].slice(-20) } : { takeover: null };
    await record(who, 'חזרה לתצוגה רגילה', [await patchState(patch, who)]);
  },
  async noonToday(a, who) {
    const { on } = z.object({ on: z.boolean() }).parse(a);
    await record(who, on ? 'מופע הצהריים יעלה היום' : 'דילוג על מופע הצהריים היום', [await patchState({ noon_skip: on ? null : isoDateIL() }, who)]);
  },
  async saveLife(a, who) {
    const f = LifeInput.parse(a);
    assertRealDate(f.date); if (f.showFrom) assertRealDate(f.showFrom);
    const { p, personId, name } = await lifeWho(f.personId, f.name, f.free), kind = classifyLife(f.type);
    if (f.photo === 'upload' && !f.photoSrc) throw new Error('בחרו תמונה להעלאה');
    const row: Row = { person_id: personId, name, type: kind, label: f.type, event_date: f.date, show_from: f.showFrom || f.date, show_until: addDays(f.date, 10),
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
    if (f.showNow && kind !== 'bereavement') undo.push(await patchState({ takeover: celebrateTakeover(lifeCard(saved, p, isoDateIL()), personId, f.type, f.note || '') }, who));
    await record(who, (f.id ? 'עודכן: ' : 'נוסף: ') + f.type + ' · ' + displayName(p), undo);
    return { id: saved.id };
  },
  async deleteLife(a, who) {
    const { id } = z.object({ id: UUID }).parse(a);
    const prev = await rowOf('life_events', id);
    if (!prev) throw new Error('האירוע לא נמצא');
    const p = await lifeRowPerson(prev).catch(() => null);
    must(await db().from('life_events').delete().eq('id', id).select('id'), 'delete life');
    await record(who, 'נמחק: ' + (prev.label || HE_TYPE[prev.type]) + (p ? ' · ' + displayName(p) : ''), [{ op: 'put', table: 'life_events', row: prev }]);
  },
  async saveEvent(a, who) {
    const f = EventInput.parse(a);
    assertRealDate(f.date);
    if (f.end <= f.start) throw new Error('שעת הסיום צריכה להיות אחרי שעת ההתחלה');
    const row: Row = { title: f.title, starts_at: ilToIso(f.date, f.start), ends_at: ilToIso(f.date, f.end), place: f.place || null, takeover: !!f.big };
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
    await record(who, (f.id ? 'עודכן אירוע: ' : 'נוסף אירוע מנהלת: ') + f.title, [undo]);
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
    const { patch, label } = z.object({ patch: DesignPatch, label: z.string().max(80) }).parse(a);
    const cur = (await wallState()).design || {};
    await record(who, label, [await patchState({ design: { ...cur, ...patch } }, who)]);
  },
  async resetDesign(_a, who) {
    await record(who, 'העיצוב אופס לברירת המחדל', [await patchState({ design: {} }, who)]);
  },
  async eventImportant(a, who) {
    const { id, important } = z.object({ id: UUID, important: z.boolean() }).parse(a);
    const prev = await rowOf('directorate_events', id);
    if (!prev) throw new Error('האירוע לא נמצא');
    must(await db().from('directorate_events').update({ takeover: important }).eq('id', id).select('id'), 'event important');
    await record(who, (important ? 'סומן כאירוע חשוב: ' : 'בוטל סימון אירוע חשוב: ') + prev.title, [{ op: 'put', table: 'directorate_events', row: prev }]);
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
  /** A photo for a life event or a person: a shrunk JPEG data URL → public URL in the wall-photos bucket. */
  async photo(a) {
    const { dataUrl, folder } = z.object({ dataUrl: z.string().regex(/^data:image\/(jpeg|png|webp);base64,/).max(2_000_000), folder: z.enum(['life', 'people']).default('life') }).parse(a);
    const [, type, b64] = dataUrl.match(/^data:image\/(\w+);base64,(.*)$/)!;
    const path = `${folder}/${randomUUID()}.${type === 'jpeg' ? 'jpg' : type}`;
    const up = await db().storage.from('wall-photos').upload(path, Buffer.from(b64, 'base64'), { contentType: 'image/' + type, upsert: false });
    if (up.error) throw new Error('העלאת התמונה נכשלה: ' + up.error.message);
    return { url: db().storage.from('wall-photos').getPublicUrl(path).data.publicUrl };
  },
};
