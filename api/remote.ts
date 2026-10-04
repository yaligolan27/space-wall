// The remote control's API (app/remote). GET returns everything the remote shows; POST {action, ...} runs one
// operation from lib/remote-ops.ts and returns the fresh state.
// Access: the x-remote-token header must equal the remote's password (the operators' private link is
// /remote/?t=<token>): REMOTE_TOKEN in the environment, else the `remote_token` row of app_settings in Supabase,
// which can be set without access to the Vercel project.
// x-remote-who carries the operator's name for the history; it is a label, not an identity check.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'node:crypto';
import { z, ZodError } from 'zod';
import { ACTIONS, snapshot } from '../lib/remote-ops.js';
import { setting } from '../lib/settings.js';

z.config(z.locales.he());   // validation messages in Hebrew; they reach the operator as toasts
const FIELD_HE: Record<string, string> = { title: 'שם האירוע', name: 'שם', first: 'שם פרטי', last: 'שם משפחה', date: 'תאריך', start: 'התחלה', end: 'סיום',
  place: 'מקום', url: 'קישור', type: 'מה קרה', note: 'ברכה', text: 'הודעה', birthday: 'תאריך לידה', joined: 'תאריך הצטרפות', leaves: 'תאריך שחרור',
  email: 'מייל', phone: 'טלפון', rank: 'דרגה', role: 'תפקיד', unit: 'אגף', notes: 'הערות', rows: 'שורות', dataUrl: 'תמונה', value: 'ערך' };

async function tokenOk(given: string | undefined): Promise<boolean> {
  const want = await setting('REMOTE_TOKEN', 'remote_token');
  if (want.length < 24 || !given) return false;            // no token configured = closed, never open
  const a = Buffer.from(given), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
function whoOf(req: VercelRequest): string {
  let w = '';
  try { w = decodeURIComponent(String(req.headers['x-remote-who'] || '')); } catch { /* malformed: anonymous */ }
  return w.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40) || 'מפעיל/ה';
}
const config = async () => ({ displayKey: await setting('DISPLAY_KEY', 'display_key') });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (!(await tokenOk(req.headers['x-remote-token'] as string | undefined))) return res.status(401).json({ error: 'unauthorized' });
  try {
    if (req.method === 'GET') return res.status(200).json({ ...(await snapshot()), config: await config() });
    if (req.method !== 'POST') return res.status(405).setHeader('Allow', 'GET, POST').json({ error: 'method not allowed' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const fn = ACTIONS[body.action];
    if (!fn) return res.status(400).json({ error: 'פעולה לא מוכרת' });
    const result = await fn(body, whoOf(req));
    return res.status(200).json({ result: result ?? null, state: { ...(await snapshot()), config: await config() } });
  } catch (e: any) {
    if (e instanceof ZodError) return res.status(400).json({ error: 'חלק מהפרטים לא תקינים: ' + [...new Set(e.issues.map(i => (FIELD_HE[String(i.path[0])] || i.path.join('.')) + ': ' + i.message))].join('; ') });
    const msg = String(e?.message || '');
    // Our own errors are Hebrew sentences for the operator; anything else is a server fault, shown with its detail.
    if (/[\u0590-\u05ff]/.test(msg)) return res.status(400).json({ error: msg });
    console.error('remote failed', e);
    return res.status(500).json({ error: 'הפעולה נכשלה בשרת' + (msg ? ' (' + msg.slice(0, 160) + ')' : '') });
  }
}
