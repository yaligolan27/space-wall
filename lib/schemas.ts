// Contracts for the file-based handoff between the runner and Claude Code.
// The runner writes task.json, Claude Code writes result.json, the runner validates it here.
import { z } from 'zod';
import { CATEGORIES } from './categories';

export const EnrichedItem = z.object({
  index: z.number().int(),
  category: z.enum(CATEGORIES),
  relevance: z.number().int().min(0).max(100),
  priority: z.enum(['push', 'weekly', 'archive', 'skip']),
  title_en: z.string().min(3).max(200),
  title_he: z.string().min(3).max(200),
  summary_he: z.string().max(600),
  why_he: z.string().max(400),
});
export const EnrichResult = z.object({ items: z.array(EnrichedItem) });
export type EnrichedItem = z.infer<typeof EnrichedItem>;

export const WeeklyNumbers = z.object({
  numbers: z.array(z.object({ value: z.string().min(1).max(20), label: z.string().min(2).max(60) })).length(4),
});

const nstr = z.string().nullable().optional().transform(v => v ?? null);
export const IntakeAction = z.object({
  type: z.enum(['add_person', 'update_person', 'add_life_event', 'add_directorate_event', 'add_industry_event', 'remove_event', 'set_setting', 'none']),
  person_name: nstr, first_name: nstr, last_name: nstr, role: nstr, unit: nstr, rank: nstr,
  kind: z.enum(['civilian', 'soldier', 'officer', 'reservist']).nullable().optional().transform(v => v ?? null),
  birthday: nstr, joined_on: nstr, leaves_on: nstr,
  life_event_type: z.enum(['birthday', 'wedding', 'birth', 'bereavement', 'promotion', 'discharge', 'joined', 'other']).nullable().optional().transform(v => v ?? null),
  event_date: nstr, text_he: nstr,
  title: nstr,
  directorate_event_type: z.enum(['toast', 'ceremony', 'conference', 'exhibition', 'fun_day', 'visit', 'meeting', 'other']).nullable().optional().transform(v => v ?? null),
  starts_at: nstr, ends_at: nstr, place: nstr, audience: nstr, url: nstr, starts_on: nstr, ends_on: nstr,
  event_kind: z.enum(['אירוע', 'הזדמנות']).nullable().optional().transform(v => v ?? null),
  show_from: nstr, show_until: nstr,
  remove_kind: z.enum(['life', 'directorate', 'industry']).nullable().optional().transform(v => v ?? null),
  match: nstr,
  setting_key: z.enum(['orbital', 'space_weather']).nullable().optional().transform(v => v ?? null),
  line1: nstr, line2: nstr,
});
export type IntakeAction = z.infer<typeof IntakeAction>;

export const IntakeResult = z.object({
  actions: z.array(IntakeAction),
  summary_he: z.string(),
  needs_clarification: z.boolean(),
  clarification_he: z.string().nullable().optional().transform(v => v ?? null),
});
export type IntakeResult = z.infer<typeof IntakeResult>;
