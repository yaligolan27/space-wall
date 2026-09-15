import { db, must } from '../../lib/db';
import { alert } from '../../lib/telegram';
import type { Usage } from '../../lib/claude';

export type RunCtx = { id: string; usage: Usage; log: Record<string, unknown>; found: number; published: number };

/** Wraps a task: records an agent_runs row, token usage and errors; alerts Telegram on failure. */
export async function withRun<T>(kind: string, fn: (ctx: RunCtx) => Promise<T>): Promise<T | undefined> {
  const s = db();
  const row = must(await s.from('agent_runs').insert({ kind }).select('id').single(), 'agent_runs') as { id: string };
  const ctx: RunCtx = { id: row.id, usage: { input: 0, output: 0 }, log: {}, found: 0, published: 0 };
  const t0 = Date.now();
  try {
    const out = await fn(ctx);
    must(await s.from('agent_runs').update({ finished_at: new Date().toISOString(), status: 'ok', items_found: ctx.found, items_published: ctx.published, input_tokens: ctx.usage.input, output_tokens: ctx.usage.output, log: ctx.log }).eq('id', row.id), 'agent_runs');
    console.log(`[${kind}] ok in ${((Date.now() - t0) / 1000).toFixed(1)}s · found ${ctx.found} · published ${ctx.published} · tokens ${ctx.usage.input}/${ctx.usage.output}`);
    return out;
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.error(`[${kind}] FAILED:`, e);
    must(await s.from('agent_runs').update({ finished_at: new Date().toISOString(), status: 'error', error: msg, log: ctx.log, input_tokens: ctx.usage.input, output_tokens: ctx.usage.output }).eq('id', row.id), 'agent_runs');
    await alert(`⚠️ צג חלל · ריצת ${kind} נכשלה:\n${msg.slice(0, 500)}`);
    return undefined;
  }
}

export async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 20000): Promise<any> {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, headers: { 'user-agent': 'space-wall-agent/1.0', accept: 'application/json', ...(init.headers || {}) } });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}
