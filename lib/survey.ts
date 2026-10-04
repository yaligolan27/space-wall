// The staff survey: public submissions from /join, and the office's review that turns them into people.
// Submissions never touch `people` until someone approves them (on /join/review or through the connector).
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db, must } from './db.js';
import { addDays, isoDateIL } from './dates.js';
import { DATE, PERSON_KINDS } from './wall-ops.js';

const PRIVATE = 'people-submissions';
const PUBLIC = 'people-photos';
const MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_PHOTO = 4 * 1024 * 1024;

/** A problem the person filling the form (or the reviewer) can fix; shown to them as is. */
export class SurveyError extends Error {}

const txt = (max: number) => z.string().trim().max(max).optional().transform(v => v || undefined);

export const SubmissionInput = z.object({
  first_name: z.string().trim().min(1, 'חסר שם פרטי').max(40),
  last_name: z.string().trim().min(1, 'חסר שם משפחה').max(40),
  birthday: DATE,
  show_birthday: z.boolean().default(true),
  consent_wall: z.boolean().default(false),
  kind: z.enum(PERSON_KINDS).default('civilian'),
  rank: txt(30),
  unit: txt(60),
  role: txt(80),
  joined_on: DATE.optional().or(z.literal('').transform(() => undefined)),
  leaves_on: DATE.optional().or(z.literal('').transform(() => undefined)),
  email: z.string().trim().email('כתובת מייל לא תקינה').max(120).optional().or(z.literal('').transform(() => undefined)),
  phone: txt(20),
  profile: z.object({
    expertise: txt(200),
    hobbies: txt(200),
    fun_fact: txt(200),
    space_q: txt(200),
    upcoming: txt(300),
    notes: txt(500),
  }).optional(),
});
export type SubmissionInput = z.infer<typeof SubmissionInput>;

export const PhotoInput = z.object({ mime: z.enum(MIME), data: z.string().min(10) });

function realDate(d: string | undefined, label: string) {
  if (!d) return;
  const t = Date.parse(d + 'T00:00:00Z');
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== d) throw new SurveyError(`${label}: תאריך לא קיים`);
}

/** Public: store one survey answer, with its photo in the private bucket. */
export async function submit(raw: unknown, photoRaw?: unknown) {
  const s = SubmissionInput.parse(raw);
  realDate(s.birthday, 'תאריך לידה'); realDate(s.joined_on, 'תאריך הצטרפות'); realDate(s.leaves_on, 'תאריך שחרור');
  const year = Number(s.birthday.slice(0, 4)), now = Number(isoDateIL().slice(0, 4));
  if (year < now - 90 || year > now - 15) throw new SurveyError('תאריך לידה: נא לבדוק את השנה');

  let photo_path: string | null = null;
  if (photoRaw) {
    const p = PhotoInput.parse(photoRaw);
    const bytes = Buffer.from(p.data.replace(/^data:[^,]+,/, ''), 'base64');
    if (!bytes.length || bytes.length > MAX_PHOTO) throw new SurveyError('התמונה גדולה מדי');
    photo_path = `pending/${randomUUID()}.${EXT[p.mime]}`;
    must(await db().storage.from(PRIVATE).upload(photo_path, bytes, { contentType: p.mime, upsert: false }), 'photo upload');
  }

  const { profile, ...rest } = s;
  const cleanProfile = Object.fromEntries(Object.entries(profile ?? {}).filter(([, v]) => v));
  const row = must(await db().from('people_submissions').insert({ ...rest, profile: cleanProfile, photo_path }).select('id').single(), 'submission') as { id: string };
  return { id: row.id };
}

/** Review list, newest first, with short-lived photo links and any existing person of the same name. */
export async function listSubmissions(status: 'pending' | 'approved' | 'rejected' = 'pending') {
  const rows = must(await db().from('people_submissions').select('*').eq('status', status)
    .order('submitted_at', { ascending: false }).limit(300), 'submissions') as any[];
  const people = must(await db().from('people').select('id,display_name,unit,role,photo_url').eq('active', true), 'people') as any[];
  const norm = (x: string) => x.replace(/\s+/g, ' ').trim();
  return Promise.all(rows.map(async r => {
    let photo: string | null = null;
    if (r.photo_path) {
      const signed = await db().storage.from(PRIVATE).createSignedUrl(r.photo_path, 3600);
      photo = signed.data?.signedUrl || null;
    }
    const name = norm(`${r.first_name} ${r.last_name}`);
    const matches = people.filter(p => norm(p.display_name) === name);
    return { ...r, photo, matches };
  }));
}

/**
 * Approve: create the person, or update `person_id` when the submission is an existing person's update.
 * The photo moves to the public bucket only if the person agreed to appear on the wall.
 */
export async function approveSubmission(id: string, personId?: string) {
  const s = must(await db().from('people_submissions').select('*').eq('id', id).single(), 'submission') as any;
  if (s.status === 'approved') throw new SurveyError('הטופס כבר אושר');

  const name = `${s.first_name} ${s.last_name}`;
  if (!personId) {
    const dup = must(await db().from('people').select('id,display_name').eq('active', true).ilike('display_name', name), 'dup') as any[];
    if (dup.length) throw new SurveyError(`כבר קיים/ת במערכת: ${dup[0].display_name}. אשרו כעדכון של הרשומה הקיימת (person_id ${dup[0].id}).`);
  }

  let photo_url: string | undefined;
  if (s.photo_path && s.consent_wall) {
    const file = must(await db().storage.from(PRIVATE).download(s.photo_path), 'photo download') as Blob;
    const ext = s.photo_path.split('.').pop() || 'jpg';
    const dest = `${randomUUID()}.${ext}`;
    must(await db().storage.from(PUBLIC).upload(dest, Buffer.from(await file.arrayBuffer()), { contentType: file.type || 'image/jpeg' }), 'photo publish');
    photo_url = db().storage.from(PUBLIC).getPublicUrl(dest).data.publicUrl;
  }

  const person: Record<string, unknown> = {
    first_name: s.first_name, last_name: s.last_name, kind: s.kind,
    rank: s.rank, unit: s.unit, role: s.role,
    birthday: s.birthday, joined_on: s.joined_on, leaves_on: s.leaves_on,
    email: s.email, phone: s.phone, profile: s.profile,
    // No consent for the wall: keep the person in the directory, but nothing about them is celebrated on screen.
    show_birthday: s.consent_wall && s.show_birthday,
    active: true,
  };
  if (photo_url) person.photo_url = photo_url;
  for (const k of Object.keys(person)) if (person[k] === null || person[k] === undefined) delete person[k];

  const saved = personId
    ? must(await db().from('people').update(person).eq('id', personId).select('id,display_name').single(), 'update person') as any
    : must(await db().from('people').insert({ ...person, notes: 'via survey' }).select('id,display_name').single(), 'add person') as any;

  // Someone who joined in the last few days gets the "ברוכים הבאים" moment on the wall.
  const today = isoDateIL();
  if (!personId && s.consent_wall && s.joined_on && s.joined_on >= addDays(today, -3) && s.joined_on <= today) {
    must(await db().from('life_events').insert({ person_id: saved.id, type: 'joined', event_date: s.joined_on, created_by: 'survey' }), 'joined event');
  }

  must(await db().from('people_submissions').update({ status: 'approved', person_id: saved.id, reviewed_at: new Date().toISOString() }).eq('id', id), 'mark approved');
  return { person_id: saved.id, display_name: saved.display_name, photo_on_wall: Boolean(photo_url) };
}

export async function rejectSubmission(id: string, note?: string) {
  const s = must(await db().from('people_submissions').select('id,photo_path,status').eq('id', id).single(), 'submission') as any;
  if (s.status === 'approved') throw new SurveyError('אי אפשר לדחות טופס שכבר אושר');
  if (s.photo_path) await db().storage.from(PRIVATE).remove([s.photo_path]);
  must(await db().from('people_submissions').update({ status: 'rejected', photo_path: null, review_note: note ?? null, reviewed_at: new Date().toISOString() }).eq('id', id), 'reject');
  return { rejected: id };
}
