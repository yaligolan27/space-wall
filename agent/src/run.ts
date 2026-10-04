import { db, must } from '../../lib/db.js';
import { alert } from '../../lib/telegram.js';
import { UsageLimitError } from './cc.js';

export type RunCtx = { id: string; log: Record<string, unknown>; found: number; published: number };
/** throwErrors: hand the error back once it is recorded, for a caller that reports each task's outcome (api/cron.ts). */
export type RunOpts = { throwErrors?: boolean };

/**
 * Wraps one task: records an agent_runs row, its counts and any error, and alerts Telegram on
 * failure. Errors are swallowed so one bad task cannot take the runner down, with two exceptions:
 * a UsageLimitError is re-thrown, because the caller has to back off rather than carry on, and
 * every error is re-thrown with opts.throwErrors. The bookkeeping is inside the try, so a database
 * error while opening the run row is this task's failure, not an exception that skips the next task.
 */
export async function withRun<T>(kind: string, fn: (ctx: RunCtx) => Promise<T>, opts: RunOpts = {}): Promise<T | undefined> {
  const s = db();
  const ctx: RunCtx = { id: '', log: {}, found: 0, published: 0 };
  const t0 = Date.now();
  try {
    ctx.id = (must(await s.from('agent_runs').insert({ kind }).select('id').single(), 'agent_runs') as { id: string }).id;
    const out = await fn(ctx);
    must(await s.from('agent_runs').update({
      finished_at: new Date().toISOString(), status: 'ok',
      items_found: ctx.found, items_published: ctx.published, log: ctx.log,
    }).eq('id', ctx.id), 'agent_runs');
    console.log(`[${kind}] ok in ${((Date.now() - t0) / 1000).toFixed(1)}s · found ${ctx.found} · wrote ${ctx.published}`);
    return out;
  } catch (e: any) {
    const msg = e?.message || String(e);
    const limited = e instanceof UsageLimitError;
    console.error(`[${kind}] ${limited ? 'usage limit' : 'FAILED'}:`, msg);
    if (ctx.id) {                                          // best effort: the failure may be the database itself
      const r = await s.from('agent_runs').update({
        finished_at: new Date().toISOString(), status: limited ? 'limited' : 'error',
        error: msg.slice(0, 1000), log: ctx.log,
        items_found: ctx.found, items_published: ctx.published,
      }).eq('id', ctx.id);
      if (r.error) console.error(`[${kind}] could not record the failure: ${r.error.message}`);
    }
    if (limited) throw e;                                  // the runner pauses model work
    await alert(`⚠️ צג חלל · ריצת ${kind} נכשלה:\n${msg.slice(0, 500)}`);
    if (opts.throwErrors) throw e;
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
  } catch (e) {
    throw ctrl.signal.aborted ? new Error(`${url} → no answer in ${timeoutMs / 1000} s`) : e;
  } finally { clearTimeout(t); }
}
