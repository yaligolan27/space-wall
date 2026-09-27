// Every operation the wall's operators may perform, as plain functions over the database.
// The MCP server (api/mcp.ts) exposes these as tools; nothing here calls a model.
import { z } from 'zod';
import { db, must } from './db.js';
import { addDays, isoDateIL } from './dates.js';
import { buildFeed } from './feed.js';

// ---- validation primitives -----------------------------------------------------------------------
export const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך בפורמט YYYY-MM-DD');
export const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'שעה בפורמט HH:MM');
export const LIFE_TYPES = ['birthday', 'wedding', 'birth', 'bereavement', 'promotion', 'discharge', 'joined', 'other'] as const;
export const DIR_TYPES = ['toast', 'ceremony', 'conference', 'exhibition', 'fun_day', 'visit', 'meeting', 'other'] as const;
export const PERSON_KINDS = ['civilian', 'soldier', 'officer', 'reservist'] as const;

/** Israel wall-clock date + time → ISO with the correct offset for that day (handles DST). */
export function ilToIso(date: string, time = '09:00'): string {
  const guess = new Date(`${date}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', timeZoneName: 'longOffset' }).formatToParts(guess);
  const off = parts.find(p => p.type === 'timeZoneName')?.value.replace('GMT', '') || '+02:00';
  return `${date}T${time}:00${off === '' ? '+00:00' : off}`;
}
function assertRealDate(d: string) {
  const t = Date.parse(d + 'T00:00:00Z');
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== d) throw new Error(`תאריך לא קיים: ${d}`);
}
const clean = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

// ---- read ---------------------------------------------------------------------------------------
export async function overview() {
  const s = db(), today = isoDateIL(), until = addDays(today, 45);
  const [dir, life, ind, feed] = await Promise.all([
    s.from('directorate_events').select('id,title,type,starts_at,place,audience').gte('starts_at', today + 'T00:00:00+03:00').lte('starts_at', until + 'T23:59:59+03:00').order('starts_at'),
    s.from('life_events').select('id,type,event_date,text_he,people(id,display_name,rank,unit)').gte('event_date', addDays(today, -3)).lte('event_date', until).order('event_date'),
    s.from('industry_events').select('id,name,kind,starts_on,ends_on,place_he,url').gte('starts_on', addDays(today, -30)).order('starts_on').limit(60),
    buildFeed(),
  ]);
  return {
    today,
    on_screen_now: { directorate: feed.directorate, people: feed.people, ticker_count: feed.ticker.length, newsletter: feed.issue, launches: feed.launches.map((l: any) => `${l.mission} · ${l.at}`) },
    upcoming_directorate_events: must(dir, 'dir'),
    upcoming_life_events: must(life, 'life'),
    ticker_items: (must(ind, 'ind') as any[]).filter(e => (e.ends_on || e.starts_on) >= today),
    note: 'בבלוק "אירועים במנהלת" מוצגים אירועי 7 הימים הקרובים; בבלוק "אנשים" עד 6 רגעים אישיים מ-3 ימים אחורה עד 10 קדימה, כולל ימי הולדת שמחושבים אוטומטית מתאריך הלידה.',
  };
}

export async function findPeople(query?: string, includeInactive = false) {
  let q = db().from('people').select('id,first_name,last_name,display_name,rank,unit,role,kind,birthday,joined_on,leaves_on,photo_url,active').order('display_name').limit(200);
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
});

export async function addPerson(p: z.infer<typeof PersonFields>) {
  for (const d of [p.birthday, p.joined_on, p.leaves_on]) if (d) assertRealDate(d);
  const name = [p.first_name, p.last_name].filter(Boolean).join(' ');
  const dup = must(await db().from('people').select('id,display_name,unit').eq('active', true).ilike('display_name', name), 'dup') as any[];
  if (dup.length) throw new Error(`כבר קיים/ת: ${dup[0].display_name}${dup[0].unit ? ' (' + dup[0].unit + ')' : ''}, id ${dup[0].id}. אם זה אדם אחר, הוסיפו פרט מבדיל לשם.`);
  return must(await db().from('people').insert({ ...clean(p), kind: p.kind || 'civilian', notes: 'via mcp' }).select('id,display_name').single(), 'add_person');
}

export async function updatePerson(id: string, patch: Partial<z.infer<typeof PersonFields>>) {
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
export async function addLifeEvent(a: { person_id: string; type: typeof LIFE_TYPES[number]; event_date: string; text_he?: string; show_from?: string; show_until?: string }) {
  assertRealDate(a.event_date);
  const person = must(await db().from('people').select('id,display_name').eq('id', a.person_id).maybeSingle(), 'person') as any;
  if (!person) throw new Error('לא נמצא אדם עם המזהה הזה. חפשו קודם עם find_people.');
  if (a.type === 'promotion' || a.type === 'discharge') {
    const set = a.type === 'discharge' ? { leaves_on: a.event_date } : {};
    if (Object.keys(set).length) must(await db().from('people').update(set).eq('id', a.person_id), 'person side-effect');
  }
  const row = must(await db().from('life_events').insert({ ...clean(a), created_by: 'mcp' }).select('id,type,event_date').single(), 'add_life_event') as Record<string, unknown>;
  return { ...row, person: person.display_name };
}

export async function addDirectorateEvent(a: { title: string; type?: typeof DIR_TYPES[number]; date: string; time?: string; end_time?: string; place?: string; audience?: string }) {
  assertRealDate(a.date);
  const row = {
    title: a.title, type: a.type || 'other',
    starts_at: ilToIso(a.date, a.time || '09:00'),
    ends_at: a.end_time ? ilToIso(a.date, a.end_time) : null,
    place: a.place ?? null, audience: a.audience ?? null, created_by: 'mcp',
  };
  return must(await db().from('directorate_events').insert(row).select('id,title,starts_at,place').single(), 'add_directorate_event');
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
    const cur = must(await db().from('directorate_events').select('starts_at').eq('id', id).single(), 'cur') as any;
    const curDate = isoDateIL(new Date(cur.starts_at));
    const curTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(cur.starts_at));
    if (patch.date || patch.time) { const d = String(patch.date || curDate); assertRealDate(d); p.starts_at = ilToIso(d, String(patch.time || curTime)); }
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
  return must(await db().from(TABLE[kind]).update(p).eq('id', id).select('*').single(), 'update_event');
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
  ticker: z.array(z.object({ kind: z.enum(['אירוע', 'הזדמנות']), date: z.string(), name: z.string() })).default([]),
});

export async function importNewsletter(issue_date: string, source_url: string, content: z.infer<typeof NewsletterContent>) {
  assertRealDate(issue_date);
  content.featured = content.featured.filter(i => i < content.news.length);
  return must(await db().from('newsletter_issues').upsert({ issue_date, source_url, content, imported_at: new Date().toISOString() }, { onConflict: 'issue_date' }).select('id,issue_date').single(), 'import_newsletter');
}
