// Every operation the wall's operators may perform, as plain functions over the database.
// The MCP server (api/mcp.ts) exposes these as tools; nothing here calls a model.
import { z } from 'zod';
import { db, must } from './db.js';
import { addDays, ilToIso, isoDateIL, timeIL } from './dates.js';
import { buildFeed } from './feed.js';

// ---- validation primitives -----------------------------------------------------------------------
export const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך בפורמט YYYY-MM-DD');
export const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'שעה בפורמט HH:MM');
export const LIFE_TYPES = ['birthday', 'wedding', 'birth', 'bereavement', 'promotion', 'discharge', 'joined', 'other'] as const;
export const DIR_TYPES = ['toast', 'ceremony', 'conference', 'exhibition', 'fun_day', 'visit', 'meeting', 'other'] as const;
export const PERSON_KINDS = ['civilian', 'soldier', 'officer', 'reservist'] as const;

export { ilToIso };   // moved to dates.ts; kept here for the modules that import it from wall-ops
export function assertRealDate(d: string) {
  const t = Date.parse(d + 'T00:00:00Z');
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== d) throw new Error(`תאריך לא קיים: ${d}`);
}
const clean = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
/** A directorate event's timestamps (UTC from the database) also on Israel's clock, so confirmations quote the right hour. */
function onIsraelClock<T extends { starts_at: string; ends_at?: string | null }>(e: T) {
  const s = new Date(e.starts_at), en = e.ends_at ? new Date(e.ends_at) : null, date = isoDateIL(s);
  return { ...e, date, time: timeIL(s), end_time: en ? timeIL(en) : null, ...(en && isoDateIL(en) !== date ? { end_date: isoDateIL(en) } : {}) };
}
function assertEndsAfterStart(startsAt: string, endsAt: string | null | undefined) {
  if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error('שעת הסיום צריכה להיות אחרי שעת ההתחלה');
}

// ---- read ---------------------------------------------------------------------------------------
export async function overview() {
  const s = db(), today = isoDateIL(), until = addDays(today, 45);
  const [dir, life, ind, feed, liveState] = await Promise.all([
    s.from('directorate_events').select('id,title,type,starts_at,ends_at,place,audience,takeover').gte('starts_at', ilToIso(today, '00:00')).lt('starts_at', ilToIso(addDays(until, 1), '00:00')).order('starts_at'),
    s.from('life_events').select('id,type,label,event_date,text_he,name,people(id,display_name,rank,unit)').gte('event_date', addDays(today, -3)).lte('event_date', until).order('event_date'),
    s.from('industry_events').select('id,name,kind,starts_on,ends_on,place_he,url').gte('starts_on', addDays(today, -30)).order('starts_on').limit(60),
    buildFeed(),
    import('./remote-ops.js').then(m => m.live()),   // lazy: remote-ops imports this module
  ]);
  return {
    today,
    live_controls: { fullscreen_now: liveState.takeover?.leaving ? null : liveState.takeover, urgent_message: liveState.urgent, brightness: liveState.brightness, design: liveState.design, noon_show_today: liveState.design.noon && liveState.noonToday },
    on_screen_now: { directorate: feed.directorate, people: feed.people, ticker_count: feed.ticker.length, newsletter: feed.issue,
      launches: feed.launches.map((l: any) => { const d = new Date(l.at); return `${l.mission} · ${Number.isFinite(d.getTime()) ? isoDateIL(d) + ' ' + timeIL(d) : l.at}`; }) },
    upcoming_directorate_events: (must(dir, 'dir') as any[]).map(onIsraelClock),
    upcoming_life_events: must(life, 'life'),
    ticker_items: (must(ind, 'ind') as any[]).filter(e => (e.ends_on || e.starts_on) >= today),
    note: 'בבלוק "אירועים" מוצגים אירועי 7 הימים הקרובים; בבלוק "אנשי המנהלת" עד 6 רגעים אישיים מ-3 ימים אחורה עד 10 קדימה, כולל ימי הולדת שמחושבים אוטומטית מתאריך הלידה.',
  };
}

export async function findPeople(query?: string, includeInactive = false) {
  let q = db().from('people').select('id,first_name,last_name,display_name,rank,unit,role,kind,birthday,show_birthday,on_wall,joined_on,leaves_on,photo_url,active').order('display_name').limit(500);
  if (!includeInactive) q = q.eq('active', true);
  if (query && query.trim()) {
    const t = `%${query.trim()}%`;
    q = q.or(`display_name.ilike.${t},unit.ilike.${t},role.ilike.${t},rank.ilike.${t}`);
  }
  return must(await q, 'people');
}

// ---- people --------------------------------------------------------------------------------------
export const PersonFields = z.object({
  first_name: z.string().min(1),
  last_name: z.string().optional(),
  rank: z.string().optional().describe('דרגה, למשל סרן, רס״ן. ריק לאזרח'),
  unit: z.string().optional().describe('אגף או ענף'),
  role: z.string().optional(),
  kind: z.enum(PERSON_KINDS).optional(),
  birthday: DATE.optional().describe('תאריך לידה מלא; ממנו מחושב יום ההולדת בכל שנה'),
  joined_on: DATE.optional(),
  leaves_on: DATE.optional(),
  photo_url: z.string().url().optional().describe('קישור ציבורי לתמונה; בלי תמונה מוצגות ראשי תיבות'),
  show_birthday: z.boolean().optional().describe('false = לא לחגוג את יום ההולדת בצג'),
  on_wall: z.boolean().optional().describe('false = האדם לא הסכים להופיע בצג: נשמר ברשימה בלבד'),
  email: z.string().optional(), phone: z.string().optional(),
  notes: z.string().optional().describe('הערות ללשכה, לא מוצגות בצג'),
});

export async function addPerson(p: z.infer<typeof PersonFields>) {
  for (const d of [p.birthday, p.joined_on, p.leaves_on]) if (d) assertRealDate(d);
  const name = [p.first_name, p.last_name].filter(Boolean).join(' ');
  const dup = must(await db().from('people').select('id,display_name,unit').eq('active', true).ilike('display_name', name), 'dup') as any[];
  if (dup.length) throw new Error(`כבר קיים/ת: ${dup[0].display_name}${dup[0].unit ? ' (' + dup[0].unit + ')' : ''}, id ${dup[0].id}. אם זה אדם אחר, הוסיפו פרט מבדיל לשם.`);
  return must(await db().from('people').insert({ ...clean(p), kind: p.kind || 'civilian' }).select('id,display_name').single(), 'add_person');
}

/** update_person: any field of PersonFields; null clears an optional column; active: true brings back someone remove_person hid. */
const CLEARABLE = ['last_name', 'rank', 'unit', 'role', 'birthday', 'joined_on', 'leaves_on', 'photo_url', 'email', 'phone', 'notes'] as const;
export const PersonPatch = PersonFields.partial().extend({
  ...Object.fromEntries(CLEARABLE.map(k => [k, PersonFields.shape[k].nullable()])) as { [K in typeof CLEARABLE[number]]: z.ZodNullable<typeof PersonFields.shape[K]> },
  active: z.boolean().optional().describe('true = מחזיר לצג אדם שהוסר; false = כמו remove_person'),
});

export async function updatePerson(id: string, patch: z.infer<typeof PersonPatch>) {
  for (const d of [patch.birthday, patch.joined_on, patch.leaves_on]) if (d) assertRealDate(d);
  const set = clean(patch);
  if (!Object.keys(set).length) throw new Error('אין שדות לעדכון');
  return must(await db().from('people').update(set).eq('id', id).select('id,display_name').single(), 'update_person');
}

/** Soft delete: the person disappears from the wall and from birthday calculation, history stays. */
export async function removePerson(id: string) {
  return must(await db().from('people').update({ active: false }).eq('id', id).select('id,display_name').single(), 'remove_person');
}

// ---- events ---------------------------------------------------------------------------------------
/** For someone in the people list (person_id), or anyone by name: a name that is exactly one listed person's full
 *  name links to them; any other name is kept as is and shown on the wall as written. */
export async function addLifeEvent({ rank, person_id, name, ...a }: { person_id?: string; name?: string; type: typeof LIFE_TYPES[number]; event_date: string; text_he?: string; show_from?: string; show_until?: string; rank?: string }) {
  assertRealDate(a.event_date);
  let personId: string | null = person_id || null, freeName: string | null = null, shown: string;
  if (personId) {
    const person = must(await db().from('people').select('id,display_name').eq('id', personId).maybeSingle(), 'person') as any;
    if (!person) throw new Error('לא נמצא אדם עם המזהה הזה. חפשו קודם עם find_people.');
    shown = person.display_name;
  } else {
    const n = (name || '').replace(/\s+/g, ' ').trim();
    if (n.length < 2) throw new Error('חסר person_id (מ-find_people) או name');
    const key = (x: string) => x.replace(/\s+/g, ' ').trim().toLowerCase();
    const rows = must(await db().from('people').select('id,first_name,last_name,display_name'), 'people') as any[];
    const same = rows.filter(r => key([r.first_name, r.last_name].filter(Boolean).join(' ')) === key(n));
    if (same.length > 1) throw new Error(`יש ברשימה ${same.length} אנשים בשם ${n}. בחר/י person_id עם find_people.`);
    if (same.length === 1) { personId = same[0].id; shown = same[0].display_name; } else { freeName = n; shown = n; }
  }
  // The person row carries what the wall shows: a promotion's line reads the new rank from it, a discharge sets the last day.
  const set = !personId ? null : a.type === 'promotion' && rank ? { rank } : a.type === 'discharge' ? { leaves_on: a.event_date } : null;
  if (set) must(await db().from('people').update(set).eq('id', personId), 'person side-effect');
  const row = must(await db().from('life_events').insert({ ...clean(a), person_id: personId, name: freeName, created_by: 'mcp' }).select('id,type,event_date').single(), 'add_life_event') as Record<string, unknown>;
  return { ...row, person: shown, in_people_list: !!personId, ...(set ? { person_updated: set } : {}) };
}

export async function addDirectorateEvent(a: { title: string; type?: typeof DIR_TYPES[number]; date: string; time?: string; end_time?: string; place?: string; audience?: string }) {
  assertRealDate(a.date);
  const row = {
    title: a.title, type: a.type || 'other',
    starts_at: ilToIso(a.date, a.time || '09:00'),
    ends_at: a.end_time ? ilToIso(a.date, a.end_time) : null,
    place: a.place ?? null, audience: a.audience ?? null, created_by: 'mcp',
  };
  assertEndsAfterStart(row.starts_at, row.ends_at);
  return onIsraelClock(must(await db().from('directorate_events').insert(row).select('id,title,starts_at,ends_at,place').single(), 'add_directorate_event') as { starts_at: string; ends_at: string | null });
}

export async function addTickerItem(a: { name: string; kind: 'אירוע' | 'הזדמנות'; starts_on: string; ends_on?: string; place?: string; url?: string }) {
  assertRealDate(a.starts_on); if (a.ends_on) assertRealDate(a.ends_on);
  return must(await db().from('industry_events').insert({ name: a.name, kind: a.kind, starts_on: a.starts_on, ends_on: a.ends_on ?? null, place_he: a.place ?? null, url: a.url ?? null, source: 'mcp' }).select('id,name,kind,starts_on').single(), 'add_ticker_item');
}

const TABLE = { directorate: 'directorate_events', life: 'life_events', ticker: 'industry_events' } as const;
export type EventKind = keyof typeof TABLE;

export async function updateEvent(kind: EventKind, id: string, patch: Record<string, unknown>) {
  const p: Record<string, unknown> = {};
  if (kind === 'directorate') {
    const cur = must(await db().from('directorate_events').select('starts_at,ends_at').eq('id', id).single(), 'cur') as any;
    for (const k of ['time', 'end_time'] as const) if (patch[k] && !TIME.safeParse(patch[k]).success) throw new Error(`${k}: שעה בפורמט HH:MM`);
    const start = new Date(cur.starts_at);
    if (patch.date || patch.time) {
      const d = String(patch.date || isoDateIL(start)); assertRealDate(d);
      p.starts_at = ilToIso(d, String(patch.time || timeIL(start)));
      // The end moves with the start: "moved to 14:00" keeps a 12:00–13:00 event an hour long instead of 14:00–13:00
      // (an important event's takeover runs until ends_at).
      if (cur.ends_at) p.ends_at = new Date(Date.parse(cur.ends_at) + Date.parse(p.starts_at as string) - start.getTime()).toISOString();
    }
    if (patch.end_time !== undefined) p.ends_at = patch.end_time ? ilToIso(isoDateIL(new Date((p.starts_at as string) || cur.starts_at)), String(patch.end_time)) : null;
    if ('starts_at' in p || 'ends_at' in p) assertEndsAfterStart((p.starts_at as string) || cur.starts_at, 'ends_at' in p ? p.ends_at as string | null : cur.ends_at);
    for (const k of ['title', 'type', 'place', 'audience'] as const) if (patch[k] !== undefined) p[k] = patch[k];
  } else if (kind === 'life') {
    if (patch.event_date) { assertRealDate(String(patch.event_date)); p.event_date = patch.event_date; }
    for (const k of ['type', 'text_he', 'show_from', 'show_until'] as const) if (patch[k] !== undefined) p[k] = patch[k];
  } else {
    for (const k of ['starts_on', 'ends_on'] as const) if (patch[k]) { assertRealDate(String(patch[k])); p[k] = patch[k]; }
    if (patch.name !== undefined) p.name = patch.name;
    if (patch.kind !== undefined) p.kind = patch.kind;
    if (patch.place !== undefined) p.place_he = patch.place;
    if (patch.url !== undefined) p.url = patch.url;
  }
  if (!Object.keys(p).length) throw new Error('אין שדות לעדכון');
  const row = must(await db().from(TABLE[kind]).update(p).eq('id', id).select('*').single(), 'update_event') as any;
  return kind === 'directorate' ? onIsraelClock(row) : row;
}

export async function deleteEvent(kind: EventKind, id: string) {
  const r = must(await db().from(TABLE[kind]).delete().eq('id', id).select('id'), 'delete_event') as any[];
  if (!r.length) throw new Error('לא נמצא פריט עם המזהה הזה');
  return { deleted: r.length };
}

// ---- newsletter -------------------------------------------------------------------------------------
export const NewsItem = z.object({
  cat: z.string(), il: z.boolean().optional(), date: z.string(), src: z.string(),
  title: z.string().min(3), dek: z.string().default(''), url: z.string().default(''), image: z.string().nullable().optional(),
});
export const NewsletterContent = z.object({
  issue: z.object({ range: z.string(), url: z.string().url() }),
  summary: z.array(z.string()).default([]),
  featured: z.array(z.number().int().min(0)).default([]),
  news: z.array(NewsItem).min(1),
  catColor: z.record(z.string(), z.string()).optional(),
  catImage: z.record(z.string(), z.string()).optional(),
  // end: the item's last day; the feed drops it from the ticker after that. Issues imported before it have none.
  ticker: z.array(z.object({ kind: z.enum(['אירוע', 'הזדמנות']), date: z.string(), name: z.string(), end: DATE.optional() })).default([]),
});

export async function importNewsletter(issue_date: string, source_url: string, content: z.infer<typeof NewsletterContent>) {
  assertRealDate(issue_date);
  content.featured = content.featured.filter(i => i < content.news.length);
  return must(await db().from('newsletter_issues').upsert({ issue_date, source_url, content, imported_at: new Date().toISOString() }, { onConflict: 'issue_date' }).select('id,issue_date').single(), 'import_newsletter');
}
