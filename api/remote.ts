// The remote control's API (app/remote). GET returns everything the remote shows; POST {action, ...} runs one
// operation from lib/remote-ops.ts and returns the fresh state.
// Access: the x-remote-token header must equal the remote's password (the operators' private link is
// /remote/?t=<token>): REMOTE_TOKEN in the environment, else the `remote_token` row of app_settings in Supabase,
// which can be set without access to the Vercel project.
// x-remote-who carries the operator's name for the history; it is a label, not an identity check.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'node:crypto';
import { ZodError } from 'zod';
import { db } from '../lib/db.js';
import { ACTIONS, snapshot } from '../lib/remote-ops.js';

let cached: { value: string; at: number } | null = null;
async function wantedToken(): Promise<string> {
  if (process.env.REMOTE_TOKEN) return process.env.REMOTE_TOKEN;
  if (cached && Date.now() - cached.at < 60e3) return cached.value;
  const r = await db().from('app_settings').select('value').eq('key', 'remote_token').maybeSingle();
  cached = { value: (!r.error && r.data?.value) || '', at: Date.now() };
  return cached.value;
}
async function tokenOk(given: string | undefined): Promise<boolean> {
  const want = await wantedToken();
  if (want.length < 24 || !given) return false;            // no token configured = closed, never open
  const a = Buffer.from(given), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
function whoOf(req: VercelRequest): string {
  let w = '';
  try { w = decodeURIComponent(String(req.headers['x-remote-who'] || '')); } catch { /* malformed: anonymous */ }
  return w.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40) || 'מפעיל/ה';
}
const config = () => ({ displayKey: process.env.DISPLAY_KEY || '', sheetUrl: process.env.PEOPLE_SHEET_URL || '' });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (!(await tokenOk(req.headers['x-remote-token'] as string | undefined))) return res.status(401).json({ error: 'unauthorized' });
  try {
    if (req.method === 'GET') return res.status(200).json({ ...(await snapshot()), config: config() });
    if (req.method !== 'POST') return res.status(405).setHeader('Allow', 'GET, POST').json({ error: 'method not allowed' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const fn = ACTIONS[body.action];
    if (!fn) return res.status(400).json({ error: 'פעולה לא מוכרת' });
    const result = await fn(body, whoOf(req));
    return res.status(200).json({ result: result ?? null, state: { ...(await snapshot()), config: config() } });
  } catch (e: any) {
    if (e instanceof ZodError) return res.status(400).json({ error: 'נתונים לא תקינים: ' + e.issues.map(i => i.path.join('.') + ' ' + i.message).join('; ') });
    console.error('remote failed', e);
    return res.status(400).json({ error: e?.message || 'הפעולה נכשלה' });
  }
}
