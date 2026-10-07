// A launch's official live broadcast on the wall, by itself: plain code on the launch schedule (no model, no tokens).
// From a few minutes before liftoff the broadcast fills the screen; some minutes after liftoff it shrinks into the space
// news corner and stays there until the broadcast ends. YouTube only (embedded muted), and only the broadcasts Launch
// Library lists for the launch, which are the official ones (YouTube's ads can't be skipped, so no other channels).
//
// Launch Library allows about 15 requests an hour, so it is asked only about the one launch on the wall, at most every
// few minutes, by one server at a time (a claim on the settings row), and what it said is kept in that row.
import { db } from './db.js';

type Row = Record<string, any>;
export type StreamCfg = { on: boolean; which: string; before: number; full: number; small: boolean };
export type LiveStream = { key: string; launchId: string; videoId: string; title: string; mode: 'full' | 'small'; net: string; until: string };

const LOOK_AHEAD = 60 * 60e3;        // start asking about a launch's broadcast an hour before liftoff
const MAX_AFTER = 4 * 3600e3;        // a broadcast never stays longer than this after liftoff
const ASK_BEFORE = 5 * 60e3, ASK_KNOWN = 15 * 60e3, ASK_AFTER = 10 * 60e3, ASK_BUSY = 15 * 60e3;
const ASK_WAIT = 4000;               // the wall's poll waits at most this for Launch Library; a slower answer is used next time
// Launches the wall may go live for when the schedules say "big launches only".
export const BIG = /Starship|Artemis|Crew|Dragon C2|Axiom|\bAx-\d|Polaris|Soyuz MS|Shenzhou|Gaganyaan|Starliner|New Glenn|Orion|Haven/i;
// Before liftoff only a launch that is Go; after it, while it flies (and its broadcast runs on).
const GO = new Set(['Go']), FLOWN = new Set(['Go', 'In Flight', 'Success', 'Partial Failure', 'Failure']);

/** A YouTube link (watch, live, embed or youtu.be) → the video id; null for a channel page or anything else. */
export function ytId(url: string): string | null {
  let u: URL;
  try { u = new URL(String(url || '').trim()); } catch { return null; }
  const host = u.hostname.replace(/^(www\.|m\.)/, '');
  const id = host === 'youtu.be' ? u.pathname.slice(1)
    : host === 'youtube.com' || host === 'youtube-nocookie.com' ? (u.searchParams.get('v') || u.pathname.match(/^\/(?:live|embed)\/([\w-]{11})/)?.[1] || '') : '';
  return /^[\w-]{11}$/.test(id) ? id : null;
}

/** Launch Library's detailed launch → what the wall needs: the best YouTube broadcast (by Launch Library's priority,
 *  English first), the launch's current time and status, and whether its broadcast is still live. */
export function webcastOf(j: Row): Row {
  const vids: Row[] = (Array.isArray(j.vid_urls) ? j.vid_urls : Array.isArray(j.vidURLs) ? j.vidURLs : []).filter((v: Row) => v && typeof v.url === 'string' && ytId(v.url));
  const en = (v: Row) => (v.language && typeof v.language === 'object' ? v.language.code || v.language.name : v.language || '').toString().toLowerCase().startsWith('en') ? 0 : 1;
  vids.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99) || en(a) - en(b));
  const v = vids[0];
  return { videoId: v ? ytId(v.url) : null, end: v?.end_time || null, net: j.net || null, status: j.status?.abbrev || j.status?.name || null,
    webcastLive: typeof j.webcast_live === 'boolean' ? j.webcast_live : null };
}

/** The launch whose broadcast belongs on the wall now, from the launches table: Go and within `before` minutes of
 *  liftoff, or flown in the last hours; the one nearest its liftoff. */
export function pickLaunch(rows: Row[], S: StreamCfg, t: number): Row | null {
  const ok = rows.filter(l => {
    const net = Date.parse(l.net), d = net - t;
    if (S.which === 'big' && !BIG.test([l.name, l.mission, l.vehicle].join(' '))) return false;
    return d > 0 ? d <= LOOK_AHEAD && GO.has(l.status) : -d < MAX_AFTER && FLOWN.has(l.status);
  });
  ok.sort((a, b) => Math.abs(Date.parse(a.net) - t) - Math.abs(Date.parse(b.net) - t));
  return ok[0] || null;
}

/** What the wall shows for a launch and what Launch Library last said about it (c): full, small, or nothing. */
export function streamPhase(l: Row, c: Row | null, S: StreamCfg, dismissed: Set<string>, t: number): LiveStream | null {
  if (!c || !c.videoId) return null;
  const net = Date.parse(c.net || l.net), key = l.id + '@' + new Date(net).toISOString().slice(0, 10);
  if (dismissed.has('stream:' + key)) return null;
  const status = c.status || l.status;
  if (t < net) { if (!GO.has(status) || net - t > S.before * 60e3) return null; }
  else if (!FLOWN.has(status) || t - net > MAX_AFTER) return null;
  const fullEnd = net + S.full * 60e3;
  // After the full part: over once Launch Library says the broadcast has ended (checked some minutes after liftoff).
  const ended = (c.end && Date.parse(c.end) < t) || (c.webcastLive === false && Number(c.checked) > net + 5 * 60e3);
  const full = t < fullEnd && !dismissed.has('streamfull:' + key);
  if (!full && (!S.small || ended)) return null;
  return { key, launchId: l.id, videoId: c.videoId, title: l.mission || l.name, mode: full ? 'full' : 'small', net: new Date(net).toISOString(),
    until: new Date(full ? fullEnd : net + MAX_AFTER).toISOString() };
}

const SETTING = (id: string) => 'webcast:' + id;
/** How long what Launch Library said about a launch stays good. */
const askEvery = (c: Row | null, net: number, t: number) => (c?.busy ? ASK_BUSY : t >= net ? ASK_AFTER : c?.videoId ? ASK_KNOWN : ASK_BEFORE);

/** One server asks Launch Library at a time: the claim is the settings row's updated_at (insert, or update an old one). */
async function claim(id: string, seen: boolean, staleBefore: number, t: number): Promise<boolean> {
  try {
    const s = db(), at = new Date(t).toISOString();
    const r = seen
      ? await s.from('settings').update({ updated_at: at }).eq('key', SETTING(id)).lt('updated_at', new Date(staleBefore).toISOString()).select('key')
      : await s.from('settings').insert({ key: SETTING(id), value: {}, updated_at: at }).select('key');
    return !r.error && !!r.data?.length;
  } catch { return false; }
}

async function ask(id: string, prev: Row | null, t: number): Promise<Row | null> {
  try {
    const res = await fetch(`https://ll.thespacedevs.com/2.3.0/launches/${encodeURIComponent(id)}/?mode=detailed`,
      { headers: { accept: 'application/json', 'user-agent': 'space-wall (lobby display)' }, signal: AbortSignal.timeout(10000) });
    const value = res.ok ? { ...webcastOf(await res.json()), checked: t } : { ...(prev || {}), checked: t, busy: res.status === 429 || undefined };
    await db().from('settings').upsert({ key: SETTING(id), value, updated_at: new Date(t).toISOString() });
    // (rows of launches long gone)
    await db().from('settings').delete().like('key', 'webcast:%').lt('updated_at', new Date(t - 3 * 864e5).toISOString());
    return value;
  } catch (e) { console.warn('webcast lookup failed', id, e); return prev; }
}

/** The launch broadcast for /api/live, or null. Never throws (the wall's other news must not depend on it). */
export async function launchStream(S: StreamCfg, dismissed: string[] = [], now = Date.now()): Promise<LiveStream | null> {
  if (!S.on) return null;
  try {
    const s = db();
    const rows = (await s.from('launches').select('id,name,mission,vehicle,net,status')
      .gte('net', new Date(now - MAX_AFTER).toISOString()).lte('net', new Date(now + LOOK_AHEAD).toISOString()).order('net')).data || [];
    const l = pickLaunch(rows, S, now);
    if (!l) return null;
    const r = await s.from('settings').select('value,updated_at').eq('key', SETTING(l.id)).maybeSingle();
    let c: Row | null = r.data?.value && Object.keys(r.data.value).length ? r.data.value : null;
    const net = Date.parse(c?.net || l.net), stale = now - askEvery(c, net, now);
    if (!r.data || Date.parse(r.data.updated_at) < stale) {
      if (await claim(l.id, !!r.data, stale, now)) {
        const p = ask(l.id, c, now);
        c = await Promise.race([p, new Promise<Row | null>(ok => setTimeout(() => ok(c), ASK_WAIT))]);
      }
    }
    return streamPhase(l, c, S, new Set(dismissed), now);
  } catch (e) { console.warn('launch stream failed', e); return null; }
}
