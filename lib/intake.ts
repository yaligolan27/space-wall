// Intake: free text from Telegram (later: email) → structured actions via Claude → confirmation → database.
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { claude, MODEL, DIRECTORATE_PROFILE } from './claude';
import { db, must } from './db';
import { isoDateIL } from './dates';

const nstr = z.string().nullable();
export const IntakeAction = z.object({
  type: z.enum(['add_person', 'update_person', 'add_life_event', 'add_directorate_event', 'add_industry_event', 'remove_event', 'set_setting', 'none']),
  // person fields (add_person / update_person "set" / add_life_event target)
  person_name: nstr.describe('שם האדם כפי שנכתב (שם פרטי ומשפחה אם יש)'),
  first_name: nstr, last_name: nstr, role: nstr, unit: nstr, rank: nstr,
  kind: z.enum(['civilian', 'soldier', 'officer', 'reservist']).nullable(),
  birthday: nstr.describe('YYYY-MM-DD'), joined_on: nstr.describe('YYYY-MM-DD'), leaves_on: nstr.describe('YYYY-MM-DD'),
  // life event
  life_event_type: z.enum(['birthday', 'wedding', 'birth', 'bereavement', 'promotion', 'discharge', 'joined', 'other']).nullable(),
  event_date: nstr.describe('YYYY-MM-DD'),
  text_he: nstr.describe('טקסט תצוגה קצר לצג, אם המשתמש ניסח אחד; אחרת null'),
  // directorate / industry event
  title: nstr,
  directorate_event_type: z.enum(['toast', 'ceremony', 'conference', 'exhibition', 'fun_day', 'visit', 'meeting', 'other']).nullable(),
  starts_at: nstr.describe('ISO 8601 עם אזור זמן ישראל, למשל 2026-09-15T12:00:00+03:00'),
  ends_at: nstr, place: nstr, audience: nstr, url: nstr,
  starts_on: nstr.describe('YYYY-MM-DD (אירועי תעשייה)'), ends_on: nstr,
  show_from: nstr, show_until: nstr,
  // remove_event
  remove_kind: z.enum(['life', 'directorate', 'industry']).nullable(),
  match: nstr.describe('טקסט לזיהוי האירוע/האדם להסרה'),
  // set_setting
  setting_key: z.enum(['orbital', 'space_weather']).nullable(), line1: nstr, line2: nstr,
});
export type IntakeAction = z.infer<typeof IntakeAction>;

export const IntakeResult = z.object({
  actions: z.array(IntakeAction),
  summary_he: z.string().describe('תקציר קצר בעברית של מה יבוצע, שורה לכל פעולה, לאישור המשתמש'),
  needs_clarification: z.boolean(),
  clarification_he: z.string().nullable(),
});
export type IntakeResult = z.infer<typeof IntakeResult>;

export async function parseIntake(text: string, senderName: string): Promise<{ result: IntakeResult; usage: { input: number; output: number } }> {
  const s = db();
  const today = isoDateIL();
  const people = must(await s.from('people').select('display_name,unit,role,rank').eq('active', true).limit(300), 'people') as any[];
  const upcoming = must(await s.from('directorate_events').select('title,starts_at,place').gte('starts_at', new Date().toISOString()).order('starts_at').limit(30), 'events') as any[];

  const system = `${DIRECTORATE_PROFILE}

תפקידך כאן: לקבל הודעה חופשית ממי שמעדכן את הצג (מזכירות/משאבי אנוש/קצין) ולהפוך אותה לפעולות מובנות על בסיס הנתונים של הצג.
היום: ${today} (שעון ישראל). השבוע בישראל מתחיל ביום ראשון.
אנשים קיימים במערכת (התאם שמות לקיימים כשברור שמדובר באותו אדם): ${people.map(p => [p.display_name, p.unit, p.role, p.rank].filter(Boolean).join(' / ')).join('; ') || 'אין'}.
אירועי מנהלת קרובים: ${upcoming.map(e => `${e.title} (${e.starts_at}${e.place ? ', ' + e.place : ''})`).join('; ') || 'אין'}.

כללים:
- אירוע אישי (יום הולדת, חתונה, לידה, אבל, עלייה בדרגה, שחרור, קליטה) הוא add_life_event עם person_name; אם האדם לא קיים, הוסף גם add_person לפניו עם מה שידוע.
- "יום הולדת ל-X ב-3.4" ללא שנה: זה תאריך אירוע השנה (או הבא אם עבר), ולא תאריך לידה. אם ניתנה שנת לידה, מלא birthday ב-add_person.
- אירוע של המנהלת (הרמת כוסית, טקס, כנס, תערוכה, יום כיף, ביקור משלחת, מפגש) הוא add_directorate_event עם starts_at מלא. אם אין שעה, השתמש ב-09:00.
- כנס/תערוכה בתעשייה (חיצוני, לרצועת האירועים) הוא add_industry_event.
- בקשה למחוק/לבטל: remove_event עם match.
- טקסטים לצג: קצרים, בסגנון "יום הולדת · שם · אגף". השאר text_he ריק (null) אם אין ניסוח מיוחד; המערכת תרכיב אותו.
- אם חסר פרט מהותי (מי? מתי?) ואי אפשר להסיק בסבירות גבוהה: needs_clarification=true, שאל שאלה אחת קצרה, והחזר actions ריק.
- הודעה שאינה עדכון (שאלה, שיחה): type "none", ותשובה קצרה ב-summary_he.
- שדות שלא רלוונטיים לפעולה: null.`;

  const response = await claude().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system,
    messages: [{ role: 'user', content: `הודעה מאת ${senderName}:\n${text}` }],
    output_config: { format: zodOutputFormat(IntakeResult), effort: 'medium' },
  });
  if (response.stop_reason === 'refusal' || !response.parsed_output) throw new Error('intake parse failed: ' + response.stop_reason);
  return { result: response.parsed_output, usage: { input: response.usage.input_tokens, output: response.usage.output_tokens } };
}

// ---- apply -------------------------------------------------------------------------------------
async function findPerson(name: string | null) {
  if (!name) return null;
  const s = db();
  const rows = must(await s.from('people').select('*').eq('active', true).ilike('display_name', `%${name.trim()}%`).limit(2), 'people') as any[];
  return rows[0] || null;
}
function splitName(name: string): { first_name: string; last_name: string | null } {
  const parts = name.trim().split(/\s+/); return { first_name: parts[0], last_name: parts.slice(1).join(' ') || null };
}

export async function applyActions(actions: IntakeAction[], createdBy: string): Promise<string[]> {
  const s = db();
  const done: string[] = [];
  for (const a of actions) {
    switch (a.type) {
      case 'none': break;
      case 'add_person': {
        const name = a.person_name || [a.first_name, a.last_name].filter(Boolean).join(' ');
        const existing = await findPerson(name);
        if (existing) { done.push(`קיים כבר: ${existing.display_name}`); break; }
        const nm = a.first_name ? { first_name: a.first_name, last_name: a.last_name } : splitName(name);
        must(await s.from('people').insert({ ...nm, role: a.role, unit: a.unit, rank: a.rank, kind: a.kind || 'civilian', birthday: a.birthday, joined_on: a.joined_on, leaves_on: a.leaves_on, notes: `via ${createdBy}` }), 'add_person');
        done.push(`נוסף: ${nm.first_name}${nm.last_name ? ' ' + nm.last_name : ''}`); break;
      }
      case 'update_person': {
        const p = await findPerson(a.person_name || a.match);
        if (!p) { done.push(`לא נמצא: ${a.person_name || a.match}`); break; }
        const set: Record<string, unknown> = {};
        for (const k of ['role', 'unit', 'rank', 'kind', 'birthday', 'joined_on', 'leaves_on', 'first_name', 'last_name'] as const) if (a[k] != null) set[k] = a[k];
        must(await s.from('people').update(set).eq('id', p.id), 'update_person');
        done.push(`עודכן: ${p.display_name}`); break;
      }
      case 'add_life_event': {
        let p = await findPerson(a.person_name);
        if (!p && a.person_name) {
          const nm = splitName(a.person_name);
          p = must(await s.from('people').insert({ ...nm, unit: a.unit, role: a.role, rank: a.rank, kind: a.kind || 'civilian', birthday: a.birthday, notes: `via ${createdBy}` }).select('*').single(), 'add_person') as any;
        }
        if (!p) { done.push('אירוע אישי בלי שם, דולג'); break; }
        if (a.life_event_type === 'promotion' && a.rank) must(await s.from('people').update({ rank: a.rank }).eq('id', p.id), 'rank');
        if (a.life_event_type === 'discharge' && a.event_date) must(await s.from('people').update({ leaves_on: a.event_date }).eq('id', p.id), 'leaves');
        must(await s.from('life_events').insert({ person_id: p.id, type: a.life_event_type || 'other', event_date: a.event_date || isoDateIL(), text_he: a.text_he, show_from: a.show_from, show_until: a.show_until, created_by: createdBy }), 'add_life_event');
        done.push(`אירוע אישי: ${p.display_name} · ${a.life_event_type} · ${a.event_date || 'היום'}`); break;
      }
      case 'add_directorate_event': {
        must(await s.from('directorate_events').insert({ title: a.title || 'אירוע', type: a.directorate_event_type || 'other', starts_at: a.starts_at || `${isoDateIL()}T09:00:00+03:00`, ends_at: a.ends_at, place: a.place, audience: a.audience, show_from: a.show_from, show_until: a.show_until, created_by: createdBy }), 'add_directorate_event');
        done.push(`אירוע מנהלת: ${a.title} · ${a.starts_at}`); break;
      }
      case 'add_industry_event': {
        must(await s.from('industry_events').insert({ name: a.title || a.match || 'אירוע', place_he: a.place, starts_on: a.starts_on || a.event_date || isoDateIL(), ends_on: a.ends_on, url: a.url, source: 'telegram' }), 'add_industry_event');
        done.push(`אירוע תעשייה: ${a.title} · ${a.starts_on}`); break;
      }
      case 'remove_event': {
        const m = `%${(a.match || a.title || a.person_name || '').trim()}%`;
        let n = 0;
        if (a.remove_kind === 'directorate' || !a.remove_kind) { const r = must(await s.from('directorate_events').delete().ilike('title', m).select('id'), 'rm') as any[]; n += r.length; }
        if (a.remove_kind === 'industry' || (!a.remove_kind && n === 0)) { const r = must(await s.from('industry_events').delete().ilike('name', m).select('id'), 'rm') as any[]; n += r.length; }
        if (a.remove_kind === 'life' || (!a.remove_kind && n === 0)) {
          const p = await findPerson(a.person_name || a.match);
          if (p) { let q = s.from('life_events').delete().eq('person_id', p.id); if (a.event_date) q = q.eq('event_date', a.event_date); const r = must(await q.select('id'), 'rm') as any[]; n += r.length; }
        }
        done.push(`הוסרו ${n} רשומות עבור "${a.match}"`); break;
      }
      case 'set_setting': {
        if (!a.setting_key) break;
        const cur = must(await s.from('settings').select('value').eq('key', a.setting_key).single(), 'setting') as any;
        const value = { ...(cur?.value || {}), ...(a.line1 ? { line1: a.line1 } : {}), ...(a.line2 ? { line2: a.line2 } : {}) };
        must(await s.from('settings').upsert({ key: a.setting_key, value, updated_at: new Date().toISOString() }), 'set_setting');
        done.push(`הגדרה עודכנה: ${a.setting_key}`); break;
      }
    }
  }
  return done;
}
