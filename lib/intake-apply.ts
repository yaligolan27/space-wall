// Applies already-parsed intake actions to the database. Contains NO model call, so the
// Vercel webhook can run it when the user taps "confirm".
import { db, must } from './db.js';
import { addDays, ilToIso, isoDateIL, shortDate, timeIL } from './dates.js';
import type { IntakeAction } from './schemas.js';

/** Active people with this name: the exact name when someone has it, else everyone whose name contains it. */
async function peopleNamed(name: string | null): Promise<any[]> {
  const n = name?.trim();
  if (!n) return [];
  const q = (pattern: string) => db().from('people').select('*').eq('active', true).ilike('display_name', pattern).limit(5);
  const exact = must(await q(n), 'people') as any[];
  return exact.length ? exact : must(await q(`%${n}%`), 'people') as any[];
}
const names = (rows: any[]) => rows.map(r => r.display_name).join(', ');
const several = (name: string | null, rows: any[]) => `יותר מאדם אחד מתאים ל"${name}" (${names(rows)}), דולג. שלחו שוב עם השם המלא.`;
function splitName(name: string): { first_name: string; last_name: string | null } {
  const parts = name.trim().split(/\s+/);
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') || null };
}

const dateIn = (s: string | null) => /^\d{4}-\d{2}-\d{2}/.exec(s?.trim() || '')?.[0] || null;
const timeIn = (s: string | null) => { const m = /(?:^|[T ])([01]?\d|2[0-3]):([0-5]\d)/.exec(s?.trim() || ''); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null; };
/** A directorate event's date and Israel wall-clock times. The model gives event_date plus HH:MM in starts_at/ends_at;
 *  a full timestamp (an older prompt) is read as wall-clock too, so a hardcoded +03:00 can't move a winter event. */
export function eventClock(a: IntakeAction): { date: string; time: string; end: string | null } {
  return { date: a.event_date || dateIn(a.starts_at) || isoDateIL(), time: timeIn(a.starts_at) || '09:00', end: timeIn(a.ends_at) };
}

/** The rows a removal could mean, for one kind. More than one means the request was not specific enough. */
async function removalCandidates(kind: 'directorate' | 'industry' | 'life', needle: string, a: IntakeAction): Promise<{ table: string; id: string; label: string }[] | string> {
  const s = db(), today = isoDateIL(), m = `%${needle}%`;
  if (kind === 'directorate') {
    // Upcoming only, or the given day: a past event is history, not something to cancel.
    let q = s.from('directorate_events').select('id,title,starts_at').ilike('title', m).gte('starts_at', ilToIso(a.event_date || today, '00:00'));
    if (a.event_date) q = q.lt('starts_at', ilToIso(addDays(a.event_date, 1), '00:00'));
    const rows = must(await q.limit(5), 'rm') as any[];
    return rows.map(r => ({ table: 'directorate_events', id: r.id, label: `${r.title} · ${shortDate(isoDateIL(new Date(r.starts_at)))} ${timeIL(new Date(r.starts_at))}` }));
  }
  if (kind === 'industry') {
    const rows = (must(await s.from('industry_events').select('id,name,starts_on,ends_on').ilike('name', m).limit(20), 'rm') as any[])
      .filter(r => (r.ends_on || r.starts_on) >= today && (!a.event_date || (r.starts_on <= a.event_date && a.event_date <= (r.ends_on || r.starts_on))));
    return rows.map(r => ({ table: 'industry_events', id: r.id, label: `${r.name} · ${shortDate(r.starts_on)}` }));
  }
  const people = await peopleNamed(a.person_name || needle);
  if (people.length > 1) return several(a.person_name || needle, people);
  if (!people.length) return [];
  let q = s.from('life_events').select('id,type,event_date').eq('person_id', people[0].id);
  q = a.event_date ? q.eq('event_date', a.event_date) : q.gte('event_date', addDays(today, -30));
  const rows = must(await q.limit(5), 'rm') as any[];
  return rows.map(r => ({ table: 'life_events', id: r.id, label: `${r.type} · ${people[0].display_name} · ${shortDate(r.event_date)}` }));
}

export async function applyActions(actions: IntakeAction[], createdBy: string): Promise<string[]> {
  const s = db();
  const done: string[] = [];
  for (const a of actions) {
    switch (a.type) {
      case 'none': break;
      case 'add_person': {
        const name = a.person_name || [a.first_name, a.last_name].filter(Boolean).join(' ');
        if (!name) { done.push('אדם בלי שם, דולג'); break; }
        const existing = await peopleNamed(name);
        if (existing.length) { done.push(`קיים כבר: ${names(existing)}`); break; }
        const nm = a.first_name ? { first_name: a.first_name, last_name: a.last_name } : splitName(name);
        must(await s.from('people').insert({ ...nm, role: a.role, unit: a.unit, rank: a.rank, kind: a.kind || 'civilian', birthday: a.birthday, joined_on: a.joined_on, leaves_on: a.leaves_on, notes: `via ${createdBy}` }), 'add_person');
        done.push(`נוסף: ${[nm.first_name, nm.last_name].filter(Boolean).join(' ')}`); break;
      }
      case 'update_person': {
        const name = a.person_name || a.match, found = await peopleNamed(name);
        if (found.length !== 1) { done.push(found.length ? several(name, found) : `לא נמצא: ${name}`); break; }
        const p = found[0], set: Record<string, unknown> = {};
        for (const k of ['role', 'unit', 'rank', 'kind', 'birthday', 'joined_on', 'leaves_on', 'first_name', 'last_name'] as const) if (a[k] != null) set[k] = a[k];
        if (!Object.keys(set).length) { done.push(`אין מה לעדכן עבור ${p.display_name}`); break; }
        must(await s.from('people').update(set).eq('id', p.id), 'update_person');
        done.push(`עודכן: ${p.display_name}`); break;
      }
      case 'add_life_event': {
        const found = await peopleNamed(a.person_name);
        if (found.length > 1) { done.push(several(a.person_name, found)); break; }
        let p = found[0] || null;
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
        const c = eventClock(a), starts_at = ilToIso(c.date, c.time);
        let ends_at = c.end ? ilToIso(c.date, c.end) : null;
        const endDropped = !!ends_at && Date.parse(ends_at) <= Date.parse(starts_at);
        if (endDropped) ends_at = null;
        must(await s.from('directorate_events').insert({ title: a.title || 'אירוע', type: a.directorate_event_type || 'other', starts_at, ends_at, place: a.place, audience: a.audience, show_from: a.show_from, show_until: a.show_until, created_by: createdBy }), 'add_directorate_event');
        done.push(`אירוע מנהלת: ${a.title} · ${shortDate(c.date)} ${c.time}${ends_at ? '–' + c.end : ''}${endDropped ? ' (שעת הסיום לפני ההתחלה, לא נשמרה)' : ''}`); break;
      }
      case 'add_industry_event': {
        must(await s.from('industry_events').insert({ name: a.title || a.match || 'אירוע', place_he: a.place, starts_on: a.starts_on || a.event_date || isoDateIL(), ends_on: a.ends_on, url: a.url, kind: a.event_kind || 'אירוע', source: 'telegram' }), 'add_industry_event');
        done.push(`אירוע תעשייה: ${a.title} · ${a.starts_on}`); break;
      }
      case 'remove_event': {
        // One row at a time: a vague match ("הרמת כוסית") must not delete every toast on the calendar.
        const needle = (a.match || a.title || a.person_name || '').trim();
        if (!needle) { done.push('הסרה בלי מזהה, דולג'); break; }
        let line = `לא נמצא מה להסיר עבור "${needle}"`;
        for (const kind of a.remove_kind ? [a.remove_kind] : (['directorate', 'industry', 'life'] as const)) {
          const found = await removalCandidates(kind, needle, a);
          if (typeof found === 'string') { line = found; break; }
          if (!found.length) continue;
          if (found.length > 1) { line = `נמצאו ${found.length} התאמות ל"${needle}" (${found.map(f => f.label).join('; ')}), לא הוסר דבר. שלחו שוב עם שם מדויק או תאריך.`; break; }
          must(await s.from(found[0].table).delete().eq('id', found[0].id).select('id'), 'rm');
          line = `הוסר: ${found[0].label}`; break;
        }
        done.push(line); break;
      }
      case 'set_setting': {
        if (!a.setting_key) break;
        const cur = must(await s.from('settings').select('value').eq('key', a.setting_key).maybeSingle(), 'setting') as any;
        const value = { ...(cur?.value || {}), ...(a.line1 ? { line1: a.line1 } : {}), ...(a.line2 ? { line2: a.line2 } : {}) };
        must(await s.from('settings').upsert({ key: a.setting_key, value, updated_at: new Date().toISOString() }), 'set_setting');
        done.push(`הגדרה עודכנה: ${a.setting_key}`); break;
      }
    }
  }
  return done;
}
