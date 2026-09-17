// Applies already-parsed intake actions to the database. Contains NO model call, so the
// Vercel webhook can run it when the user taps "confirm".
import { db, must } from './db';
import { isoDateIL } from './dates';
import type { IntakeAction } from './schemas';

async function findPerson(name: string | null) {
  if (!name) return null;
  const rows = must(await db().from('people').select('*').eq('active', true).ilike('display_name', `%${name.trim()}%`).limit(2), 'people') as any[];
  return rows[0] || null;
}
function splitName(name: string): { first_name: string; last_name: string | null } {
  const parts = name.trim().split(/\s+/);
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') || null };
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
        const existing = await findPerson(name);
        if (existing) { done.push(`קיים כבר: ${existing.display_name}`); break; }
        const nm = a.first_name ? { first_name: a.first_name, last_name: a.last_name } : splitName(name);
        must(await s.from('people').insert({ ...nm, role: a.role, unit: a.unit, rank: a.rank, kind: a.kind || 'civilian', birthday: a.birthday, joined_on: a.joined_on, leaves_on: a.leaves_on, notes: `via ${createdBy}` }), 'add_person');
        done.push(`נוסף: ${[nm.first_name, nm.last_name].filter(Boolean).join(' ')}`); break;
      }
      case 'update_person': {
        const p = await findPerson(a.person_name || a.match);
        if (!p) { done.push(`לא נמצא: ${a.person_name || a.match}`); break; }
        const set: Record<string, unknown> = {};
        for (const k of ['role', 'unit', 'rank', 'kind', 'birthday', 'joined_on', 'leaves_on', 'first_name', 'last_name'] as const) if (a[k] != null) set[k] = a[k];
        if (!Object.keys(set).length) { done.push(`אין מה לעדכן עבור ${p.display_name}`); break; }
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
        const needle = (a.match || a.title || a.person_name || '').trim();
        if (!needle) { done.push('הסרה בלי מזהה, דולג'); break; }
        const m = `%${needle}%`;
        let n = 0;
        if (a.remove_kind === 'directorate' || !a.remove_kind) { const r = must(await s.from('directorate_events').delete().ilike('title', m).select('id'), 'rm') as any[]; n += r.length; }
        if (a.remove_kind === 'industry' || (!a.remove_kind && n === 0)) { const r = must(await s.from('industry_events').delete().ilike('name', m).select('id'), 'rm') as any[]; n += r.length; }
        if (a.remove_kind === 'life' || (!a.remove_kind && n === 0)) {
          const p = await findPerson(a.person_name || needle);
          if (p) { let q = s.from('life_events').delete().eq('person_id', p.id); if (a.event_date) q = q.eq('event_date', a.event_date); const r = must(await q.select('id'), 'rm') as any[]; n += r.length; }
        }
        done.push(`הוסרו ${n} רשומות עבור "${needle}"`); break;
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
