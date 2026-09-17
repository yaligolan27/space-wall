import { db, must } from '../../lib/db';
import { alert } from '../../lib/telegram';
import { UsageLimitError } from './cc';

export type RunCtx = { id: string; log: Record<string, unknown>; found: number; published: number };

/**
 * Wraps one task: records an agent_runs row, its counts and any error, and alerts Telegram on
 * failure. Errors are swallowed so one bad task cannot take the runner down, with one exception:
 * a UsageLimitError is re-thrown, because the caller has to back off rather than carry on.
 */
export async function withRun<T>(kind: string, fn: (ctx: RunCtx) => Promise<T>): Promise<T | undefined> {
  const s = db();
  const row = must(await s.from('agent_runs').insert({ kind }).select('id').single(), 'agent_runs') as { id: string };
  const ctx: RunCtx = { id: row.id, log: {}, found: 0, published: 0 };
  const t0 = Date.now();
  try {
    const out = await fn(ctx);
    must(await s.from('agent_runs').update({
      finished_at: new Date().toISOString(), status: 'ok',
      items_found: ctx.found, items_published: ctx.published, log: ctx.log,
    }).eq('id', row.id), 'agent_runs');
    console.log(`[${kind}] ok in ${((Date.now() - t0) / 1000).toFixed(1)}s · found ${ctx.found} · wrote ${ctx.published}`);
    return out;
  } catch (e: any) {
    const msg = e?.message || String(e);
    const limited = e instanceof UsageLimitError;
    console.error(`[${kind}] ${limited ? 'usage limit' : 'FAILED'}:`, msg);
    must(await s.from('agent_runs').update({
      finished_at: new Date().toISOString(), status: limited ? 'limited' : 'error',
      error: msg.slice(0, 1000), log: ctx.log,
      items_found: ctx.found, items_published: ctx.published,
    }).eq('id', row.id), 'agent_runs');
    if (limited) throw e;                                  // the runner pauses model work
    await alert(`⚠️ צג חלל · ריצת ${kind} נכשלה:\n${msg.slice(0, 500)}`);
    return undefined;
  }
}

export async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 20000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init, signal: ctrl.signal,
      headers: { 'user-agent': 'space-wall-agent/1.0', accept: 'application/json', ...(init.headers || {}) },
    });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}
