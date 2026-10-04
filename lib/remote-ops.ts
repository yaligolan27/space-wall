// The remote control's operations (app/remote → api/remote.ts) and the live wall state (api/live.ts).
// Every change is written to remote_history together with the operations that undo it, so the remote can
// undo the last change or roll back to any earlier point. Nothing here calls a model.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db, must } from './db.js';
import { addDays, isoDateIL, timeIL } from './dates.js';
import { birthdayCard, displayName, lifeCard } from './feed.js';
import { DATE, TIME, NewsletterContent, assertRealDate, ilToIso, importNewsletter } from './wall-ops.js';
import { NEWSLETTER_SITE, latestFromArchive, parseIssue } from './newsletter.js';

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
const HE_TYPE: Record<string, string> = { birthday: 'יום הולדת', wedding: 'חתונה', birth: 'לידה', bereavement: 'אבל', promotion: 'העלאה בדרגה', discharge: 'שחרור', joined: 'קליטה', other: 'אירוע' };

/** The operator's free-text event wording → the stored life_event_type. */
export function classifyLife(label: string): string {
  const t = label || '';
  if (/אבל|צער|נפטר|נפטרה|מות/.test(t)) return 'bereavement';
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
const TABLES = new Set(['life_events', 'directorate_events', 'newsletter_issues']);

async function wallState(): Promise<Row> {
  const r = must(await db().from('wall_state').select('*').eq('id', 1).maybeSingle(), 'wall_state') as Row | null;
  return r || { design: {}, brightness: 100, urgent: null, takeover: null, noon_skip: null, dismissed: [] };
}
const minutesIL = (d: Date) => { const [h, m] = timeIL(d).split(':').map(Number); return h * 60 + m; };

function evTakeover(e: Row, auto: boolean, now = Date.now()): Row {
  const start = new Date(e.starts_at), end = e.ends_at ? Date.parse(e.ends_at) : start.getTime() + 60 * 60e3;
  return { id: (auto ? 'event:' : 'rt:' + now + ':') + e.id, kind: 'event', auto, eventId: e.id, title: e.title, place: e.place || '',
    start: timeIL(start), end: timeIL(new Date(end)), until: new Date(end > now ? end : now + EVENT_FALLBACK_MS).toISOString() };
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

/** For the wall (api/live.ts): polled every few seconds. */
export async function live() {
  const now = new Date();
  const [st, big] = await Promise.all([wallState(), bigEventsNow(now)]);
  return { design: { ...DESIGN_DEFAULTS, ...(st.design || {}) }, brightness: st.brightness ?? 100, urgent: st.urgent || null,
    noonToday: st.noon_skip !== isoDateIL(now), takeover: effectiveTakeover(st, big, now), at: now.toISOString() };
}

// ---- snapshot for the remote ------------------------------------------------------------------------
export async function snapshot() {
  const s = db(), now = new Date(), today = isoDateIL(now);
  const [st, big, people, life, events, nl, hist] = await Promise.all([
    wallState(), bigEventsNow(now),
    s.from('people').select('id,display_name,rank,role,unit,birthday,photo_url').eq('active', true).order('display_name'),
    s.from('life_events').select('id,person_id,type,label,event_date,show_from,show_until,text_he,photo_mode,photo_url')
      .gte('event_date', addDays(today, -30)).lte('event_date', addDays(today, 120)).order('event_date'),
    s.from('directorate_events').select('id,title,starts_at,ends_at,place,takeover').eq('approved', true)
      .gte('starts_at', today + 'T00:00:00+03:00').lte('starts_at', addDays(today, 60) + 'T23:59:59+03:00').order('starts_at'),
    s.from('newsletter_issues').select('source_url,content,imported_at').order('issue_date', { ascending: false }).limit(1),
    s.from('remote_history').select('id,at,who,label,undo').is('undone_at', null).order('id', { ascending: false }).limit(50),
  ]);
  const issue = (must(nl, 'newsletter') as Row[])[0];
  return {
    now: now.toISOString(), today,
    people: (must(people, 'people') as Row[]).map(p => ({ id: p.id, name: p.display_name, rank: p.rank || '', role: p.role || '', unit: p.unit || '', bday: p.birthday ? p.birthday.slice(5) : null, photo: p.photo_url || null })),
    life: (must(life, 'life') as Row[]).map(l => ({ id: l.id, personId: l.person_id, kind: l.type, type: l.label || HE_TYPE[l.type] || 'אירוע', date: l.event_date,
      showFrom: l.show_from || addDays(l.event_date, -10), showUntil: l.show_until || addDays(l.event_date, 3), note: l.text_he || '', photo: l.photo_mode || 'crm', photoSrc: l.photo_url || null })),
    events: (must(events, 'events') as Row[]).map(e => { const st0 = new Date(e.starts_at), en = e.ends_at ? new Date(e.ends_at) : new Date(st0.getTime() + 60 * 60e3);
      return { id: e.id, title: e.title, date: isoDateIL(st0), start: timeIL(st0), end: timeIL(en), place: e.place || '', big: !!e.takeover }; }),
    newsletter: issue ? { range: issue.content?.issue?.range || '', url: issue.source_url, count: (issue.content?.news || []).length, at: issue.imported_at } : null,
    state: { design: { ...DESIGN_DEFAULTS, ...(st.design || {}) }, brightness: st.brightness ?? 100, urgent: st.urgent || '', noonToday: st.noon_skip !== today },
    takeover: effectiveTakeover(st, big, now),
    history: (must(hist, 'history') as Row[]).map(h => ({ id: h.id, at: h.at, who: h.who, text: h.label, canRestore: Array.isArray(h.undo) && h.undo.length > 0 })),
  };
}

// ---- writing, with history ---------------------------------------------------------------------------
async function record(who: string, label: string, undo: UndoOp[]) {
  must(await db().from('remote_history').insert({ who, label, undo }).select('id').single(), 'history');
}
/** Patch wall_state; returns the undo op restoring the previous values. */
async function patchState(patch: Row, who: string): Promise<UndoOp> {
  const cur = await wallState(), prev: Row = {};
  for (const k of Object.keys(patch)) prev[k] = cur[k] ?? null;
  must(await db().from('wall_state').upsert({ id: 1, ...patch, updated_at: new Date().toISOString(), updated_by: who }).select('id').single(), 'wall_state');
  return { op: 'state', patch: prev };
}
async function rowOf(table: string, id: string): Promise<Row | null> {
  return must(await db().from(table).select('*').eq('id', id).maybeSingle(), table) as Row | null;
}
async function applyUndo(ops: UndoOp[]) {
  for (const o of [...ops].reverse()) {
    if (o.op === 'state') { must(await db().from('wall_state').update({ ...o.patch, updated_at: new Date().toISOString() }).eq('id', 1).select('id'), 'undo state'); continue; }
    if (!TABLES.has(o.table)) throw new Error('undo: table not allowed');
    if (o.op === 'del') must(await db().from(o.table).delete().eq('id', o.id).select('id'), 'undo del');
    else must(await db().from(o.table).upsert(o.row).select('id'), 'undo put');
  }
}

// ---- actions ------------------------------------------------------------------------------------------
const UUID = z.string().uuid();
const LifeInput = z.object({
  id: UUID.optional(), personId: UUID, type: z.string().trim().min(1).max(40), date: DATE, showFrom: DATE.optional(),
  photo: z.enum(['crm', 'upload', 'none']).default('crm'), photoSrc: z.string().url().nullable().optional(), note: z.string().trim().max(120).optional(), showNow: z.boolean().optional(),
});
const EventInput = z.object({
  id: UUID.optional(), title: z.string().trim().min(2).max(80), date: DATE, start: TIME, end: TIME, place: z.string().trim().max(60).optional(), big: z.boolean().optional(),
});

async function personRow(id: string): Promise<Row> {
  const p = must(await db().from('people').select('id,display_name,rank,unit,photo_url,birthday').eq('id', id).maybeSingle(), 'person') as Row | null;
  if (!p) throw new Error('לא נמצא האדם');
  return p;
}
/** person = the wall's card; type/note = the operator's wording, for the remote's preview. */
function celebrateTakeover(card: Row, personId: string, type: string, note: string, now = Date.now()): Row {
  return { id: 'rt:' + now, kind: 'celebrate', personId, person: card, type, note, until: new Date(now + CELEBRATE_MS).toISOString() };
}

export const ACTIONS: Record<string, (a: any, who: string) => Promise<unknown>> = {
  async noon(_a, who) {
    const now = Date.now();
    await record(who, 'הופעל מופע הצהריים', [await patchState({ takeover: { id: 'rt:' + now, kind: 'noon', until: new Date(now + NOON_MS).toISOString() } }, who)]);
  },
  async celebrate(a, who) {
    const { personId, lifeId } = z.object({ personId: UUID, lifeId: UUID.optional() }).parse(a);
    const p = await personRow(personId), today = isoDateIL();
    let card: Row, type = 'יום הולדת', note = '';
    if (lifeId) {
      const e = await rowOf('life_events', lifeId);
      if (!e || e.person_id !== personId) throw new Error('האירוע לא נמצא');
      if (e.type === 'bereavement') throw new Error('הודעת אבל לא עולה על כל המסך');
      card = lifeCard(e, p, today); type = e.label || HE_TYPE[e.type]; note = e.text_he || '';
    } else card = birthdayCard(p, today, today);
    await record(who, 'ברכה על כל המסך: ' + displayName(p), [await patchState({ takeover: celebrateTakeover(card, personId, type, note) }, who)]);
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
    const p = await personRow(f.personId), kind = classifyLife(f.type);
    if (f.photo === 'upload' && !f.photoSrc) throw new Error('בחרו תמונה להעלאה');
    const row: Row = { person_id: f.personId, type: kind, label: f.type, event_date: f.date, show_from: f.showFrom || f.date, show_until: addDays(f.date, 10),
      text_he: f.note || null, photo_mode: f.photo, photo_url: f.photo === 'upload' ? f.photoSrc : null };
    const undo: UndoOp[] = [];
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
    if (f.showNow && kind !== 'bereavement') undo.push(await patchState({ takeover: celebrateTakeover(lifeCard(saved, p, isoDateIL()), p.id, f.type, f.note || '') }, who));
    await record(who, (f.id ? 'עודכן: ' : 'נוסף: ') + f.type + ' · ' + displayName(p), undo);
    return { id: saved.id };
  },
  async deleteLife(a, who) {
    const { id } = z.object({ id: UUID }).parse(a);
    const prev = await rowOf('life_events', id);
    if (!prev) throw new Error('האירוע לא נמצא');
    const p = await personRow(prev.person_id).catch(() => null);
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
    const undo: UndoOp[] = [];
    const st = await wallState();
    if (st.takeover && st.takeover.eventId === id) undo.push(await patchState({ takeover: null }, who));
    must(await db().from('directorate_events').delete().eq('id', id).select('id'), 'delete event');
    undo.push({ op: 'put', table: 'directorate_events', row: prev });
    await record(who, 'נמחק אירוע: ' + prev.title, undo);
  },
  /** Imports an issue of the Rakia newsletter site directly (the home or archive page means its newest issue),
   *  or a link that serves the newsletter as JSON; any other link is handed to Claude by the remote. */
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
  /** A photo for a life event: a shrunk JPEG data URL → public URL in the wall-photos bucket. */
  async photo(a) {
    const { dataUrl } = z.object({ dataUrl: z.string().regex(/^data:image\/(jpeg|png|webp);base64,/).max(2_000_000) }).parse(a);
    const [, type, b64] = dataUrl.match(/^data:image\/(\w+);base64,(.*)$/)!;
    const path = `life/${randomUUID()}.${type === 'jpeg' ? 'jpg' : type}`;
    const up = await db().storage.from('wall-photos').upload(path, Buffer.from(b64, 'base64'), { contentType: 'image/' + type, upsert: false });
    if (up.error) throw new Error('העלאת התמונה נכשלה: ' + up.error.message);
    return { url: db().storage.from('wall-photos').getPublicUrl(path).data.publicUrl };
  },
};
