// The staff survey API.
//   POST /api/survey                     public: one submission from /join (JSON: { fields, photo?, k?, website? })
//   GET  /api/survey?t=<token>&status=   the office's review list
//   POST /api/survey?t=<token>           { action: 'approve', id, person_id? } | { action: 'reject', id, note? }
// The review token is REMOTE_TOKEN (the remote's link) or MCP_TOKEN (the connector's), whichever is set.
// FORM_KEY, when set, must arrive as `k` so only people with the distributed link can submit.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'node:crypto';
import { ZodError } from 'zod';
import * as survey from '../lib/survey.js';

function same(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function reviewer(given: unknown): boolean {
  if (typeof given !== 'string' || !given) return false;
  return [process.env.REMOTE_TOKEN, process.env.MCP_TOKEN].some(t => !!t && t.length >= 24 && same(given, t));
}
function message(e: unknown): string {
  if (e instanceof ZodError) return e.issues.map(i => i.message).join(' · ');
  return (e as Error)?.message || String(e);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const token = req.query.t;
  try {
    if (token !== undefined) {
      if (!reviewer(token)) return res.status(401).json({ error: 'הקישור לא תקף' });
      if (req.method === 'GET') {
        const status = (['pending', 'approved', 'rejected'] as const).find(s => s === req.query.status) || 'pending';
        return res.status(200).json({ items: await survey.listSubmissions(status), formKey: process.env.FORM_KEY || '' });
      }
      if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
      const b = req.body || {};
      if (typeof b.id !== 'string') return res.status(400).json({ error: 'חסר מזהה' });
      if (b.action === 'approve') return res.status(200).json(await survey.approveSubmission(b.id, typeof b.person_id === 'string' && b.person_id ? b.person_id : undefined));
      if (b.action === 'reject') return res.status(200).json(await survey.rejectSubmission(b.id, typeof b.note === 'string' ? b.note : undefined));
      return res.status(400).json({ error: 'פעולה לא מוכרת' });
    }

    if (req.method !== 'POST') return res.status(405).setHeader('Allow', 'POST').json({ error: 'method not allowed' });
    const b = req.body || {};
    const formKey = process.env.FORM_KEY;
    if (formKey && !(typeof b.k === 'string' && same(b.k, formKey))) return res.status(403).json({ error: 'הקישור לטופס לא תקף. בקשו את הקישור המעודכן מהלשכה.' });
    if (b.website) return res.status(200).json({ ok: true });            // honeypot: bots fill every field
    const out = await survey.submit(b.fields, b.photo || undefined);
    return res.status(200).json({ ok: true, ...out });
  } catch (e) {
    const status = e instanceof ZodError || e instanceof survey.SurveyError ? 400 : 500;
    if (status === 500) console.error('survey failed', e);
    return res.status(status).json({ error: status === 500 ? 'משהו השתבש בשמירה. נסו שוב בעוד רגע.' : message(e) });
  }
}
