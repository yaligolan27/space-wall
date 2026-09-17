// The always-on runner. Start it once on the machine that stays powered on and logged into
// Claude Code; it owns its own schedule, so there is no cron, no CI and no API key.
//
//   npm run runner
//
// Two classes of work:
//   deterministic (RSS collection, launches, space weather) — free, never blocked
//   model work (enrichment, intake parsing, weekly numbers) — one Claude Code call at a time,
//   skipped entirely when there is nothing pending, and paused with backoff on a usage limit.
//
// The display keeps serving the last good feed whenever this process is down, and turns its
// live dot amber once the feed goes stale.
import { db, must } from '../../lib/db';
import { isoDateIL, timeIL } from '../../lib/dates';
import { alert } from '../../lib/telegram';
import { claudeAvailable, UsageLimitError } from './cc';
import { runCollect } from './collect';
import { expireStaleReview, pendingCount, runEnrich } from './enrich';
import { processIntake, queuedCount } from './intake';
import { runLaunches } from './launches';
import { runNumbers } from './numbers';
import { runWeather } from './weather';

const sec = (name: string, dflt: number) => Math.max(15, Number(process.env[name] || dflt));
const CFG = {
  intake: sec('INTAKE_EVERY_SEC', 45),
  collect: sec('COLLECT_EVERY_SEC', 600),
  enrich: sec('ENRICH_EVERY_SEC', 600),
  launches: sec('LAUNCHES_EVERY_SEC', 900),
  weather: sec('WEATHER_EVERY_SEC', 1800),
  heartbeat: sec('HEARTBEAT_EVERY_SEC', 120),
  numbersAt: process.env.NUMBERS_AT || '01:30',       // Israel time, once a day
  backoffMin: Number(process.env.MODEL_BACKOFF_MIN || 30),
  backoffMaxMin: Number(process.env.MODEL_BACKOFF_MAX_MIN || 240),
};

let stopping = false;
/** Only one Claude Code invocation at a time: keeps usage predictable and output easy to read. */
let modelBusy = false;
let modelPausedUntil = 0;
let backoff = CFG.backoffMin;
let lastNumbersDay = '';

const now = () => Date.now();
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

function noteLimit(e: UsageLimitError) {
  modelPausedUntil = now() + backoff * 60_000;
  log(`[limit] usage limit hit; pausing model work for ${backoff} min. ${e.message}`);
  void alert(`⏸ צג חלל · הגעת למגבלת השימוש של המנוי. עבודת המודל בהשהיה ל-${backoff} דקות. איסוף הנתונים הדטרמיניסטי ממשיך.`);
  backoff = Math.min(CFG.backoffMaxMin, backoff * 2);
}

/** Runs a model task under the mutex. Returns false when it was skipped. */
async function withModel(name: string, fn: () => Promise<unknown>): Promise<boolean> {
  if (stopping || modelBusy || now() < modelPausedUntil) return false;
  modelBusy = true;
  try {
    await fn();
    backoff = CFG.backoffMin;   // a clean run resets the backoff ladder
    return true;
  } catch (e: any) {
    if (e instanceof UsageLimitError) { noteLimit(e); return false; }
    log(`[${name}] failed:`, e?.message || e);
    return false;
  } finally { modelBusy = false; }
}

/** Deterministic tasks log and swallow their own errors via withRun, so this is just a guard. */
async function safely(name: string, fn: () => Promise<unknown>) {
  if (stopping) return;
  try { await fn(); } catch (e: any) { log(`[${name}] failed:`, e?.message || e); }
}

async function heartbeat() {
  try {
    const [enrichPending, intakeQueued] = await Promise.all([pendingCount(), queuedCount()]);
    must(await db().from('settings').upsert({
      key: 'runner',
      value: {
        at: new Date().toISOString(),
        host: process.env.HOSTNAME || process.env.COMPUTERNAME || 'local',
        pending_enrich: enrichPending,
        queued_intake: intakeQueued,
        model_paused_until: modelPausedUntil ? new Date(modelPausedUntil).toISOString() : null,
      },
      updated_at: new Date().toISOString(),
    }), 'heartbeat');
  } catch (e: any) { log('[heartbeat] failed:', e?.message || e); }
}

/**
 * Self-rescheduling timer: the next tick is set only after the current one finishes, so a slow
 * task can never overlap itself. The timers are intentionally not unref'd — they are what keeps
 * this process alive.
 */
function every(seconds: number, fn: () => Promise<void>, firstDelaySec = 5): void {
  const tick = async () => {
    if (stopping) return;
    await fn().catch(e => log('[tick] failed:', e?.message || e));
    if (!stopping) setTimeout(tick, seconds * 1000);
  };
  setTimeout(tick, firstDelaySec * 1000);
}

async function main() {
  const version = await claudeAvailable();
  if (!version) {
    console.error('Claude Code CLI not found. Install it and run `claude` once to log in, or set CLAUDE_BIN.');
    process.exit(1);
  }
  log(`[runner] starting · claude ${version} · model ${process.env.CLAUDE_MODEL || 'sonnet'}`);
  log(`[runner] intervals (s): ${JSON.stringify({ intake: CFG.intake, collect: CFG.collect, enrich: CFG.enrich, launches: CFG.launches, weather: CFG.weather })}`);

  // Fill the board immediately on boot, then settle into the schedule.
  await safely('launches', runLaunches);
  await safely('weather', runWeather);
  await safely('collect', runCollect);
  await heartbeat();

  // Staggered so the periodic tasks do not all wake in the same second.
  every(CFG.collect, async () => { await safely('collect', runCollect); await safely('expire', expireStaleReview); }, CFG.collect);
  every(CFG.launches, () => safely('launches', runLaunches), CFG.launches);
  every(CFG.weather, () => safely('weather', runWeather), CFG.weather);
  every(CFG.heartbeat, heartbeat, 30);

  every(CFG.enrich, async () => {
    if (await pendingCount() === 0) return;
    await withModel('enrich', runEnrich);
  }, 20);
  every(CFG.intake, async () => {
    if (await queuedCount() === 0) return;
    await withModel('intake', processIntake);
  }, 10);
  // Checked twice a minute so a slow tick cannot skip the target minute entirely.
  every(30, async () => {
    const today = isoDateIL();
    if (lastNumbersDay === today) return;
    if (timeIL(new Date()) !== CFG.numbersAt) return;
    if (await withModel('numbers', runNumbers)) lastNumbersDay = today;
  }, 45);

  log('[runner] up');
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    if (stopping) process.exit(1);
    stopping = true;
    log(`[runner] ${sig} received, finishing current work then exiting`);
    setTimeout(() => process.exit(0), 3000);
  });
}

main().catch(e => { console.error('[runner] fatal:', e); process.exit(1); });
