// Bridge to the locally installed Claude Code CLI. Every model task in this project goes through
// here: the runner writes task.json into a scratch directory, invokes `claude` in headless mode
// scoped to that directory, and validates the result.json it writes back against a zod schema.
//
// Consequences of this design: no ANTHROPIC_API_KEY anywhere in the project, the work runs on
// whatever account `claude` is logged in with, and a malformed answer is rejected, never stored.
//
// The invocation is deliberately narrow. Claude Code gets Read and Write only, Bash and network
// tools are denied, the working directory is a fresh temp dir holding nothing but task.json, and
// the turn count is bounded. It cannot touch the repository or the database.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ZodType } from 'zod';

/** The account's usage limit was reached. Callers must back off rather than retry. */
export class UsageLimitError extends Error {
  constructor(msg: string) { super(msg); this.name = 'UsageLimitError'; }
}
export class ClaudeCodeError extends Error {
  constructor(msg: string) { super(msg); this.name = 'ClaudeCodeError'; }
}

// Read lazily, not at module load, so a caller that loads its .env after importing still works.
const bin = () => process.env.CLAUDE_BIN || 'claude';
/** Model alias: opus | sonnet | haiku, or a full model id. */
const model = () => (process.env.CLAUDE_MODEL || 'sonnet').trim();
const maxTurns = () => process.env.CLAUDE_MAX_TURNS || '12';

// Claude Code prints these when an account limit is reached; it still exits non-zero, but the
// message is the only way to tell "out of quota" from "something broke". Matched case-insensitively
// against the CLI's own output only, and kept narrow so article text can never trip it.
const LIMIT_PATTERNS = [
  /hit your (session|weekly|opus|sonnet|haiku|usage) limit/i,
  /spend limit reached/i,
  /usage limit reached/i,
];
const isLimit = (s: string) => LIMIT_PATTERNS.some(re => re.test(s));

/**
 * The tool flags are variadic: the CLI keeps consuming values until the next flag, so a positional
 * prompt placed after them is swallowed as another permission rule. The prompt therefore goes in
 * on stdin, which the CLI accepts for `-p` and which no flag can eat.
 */
function buildArgs(): string[] {
  const m = model();
  return [
    '-p',
    ...(m ? ['--model', m] : []),
    '--max-turns', maxTurns(),
    '--permission-mode', 'acceptEdits',
    '--disallowedTools', 'Bash', 'WebFetch', 'WebSearch', 'Edit', 'Task', 'mcp__*',
    '--allowedTools', 'Read', 'Write',
  ];
}

function invoke(prompt: string, cwd: string, timeoutMs: number): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin(), buildArgs(), {
      cwd,
      env: {
        ...process.env,
        CI: '1',                                 // no TTY in a daemon; suppress progress UI
        FORCE_COLOR: '0',
        CLAUDE_CODE_SKIP_PROMPT_HISTORY: '1',    // do not accumulate transcripts from a long-running loop
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdin.on('error', () => {});           // the CLI may exit before the prompt is flushed
    child.stdin.end(prompt, 'utf8');
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new ClaudeCodeError(`claude timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    child.on('error', e => {
      clearTimeout(timer);
      reject(new ClaudeCodeError(`cannot run "${bin()}": ${e.message}. Install Claude Code, or set CLAUDE_BIN to its path.`));
    });
    child.on('close', code => { clearTimeout(timer); resolve({ code, out, err }); });
  });
}

/**
 * Hands one task to Claude Code and returns the validated result.
 * @throws UsageLimitError when the account limit was hit, ClaudeCodeError for everything else.
 */
export async function runClaudeTask<T>(opts: {
  name: string;
  input: unknown;
  instructions: string;
  schema: ZodType<T>;
  timeoutMs?: number;
}): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), `space-wall-${opts.name}-`));
  try {
    await writeFile(join(dir, 'task.json'), JSON.stringify(opts.input, null, 2), 'utf8');
    const prompt = [
      opts.instructions,
      '',
      'איך לעבוד:',
      '1. קרא את הקובץ task.json בתיקייה הנוכחית.',
      '2. כתוב את התשובה לקובץ result.json באותה תיקייה: JSON תקין בלבד, בלי הסברים ובלי גדרות קוד.',
      '3. אל תיגע בשום קובץ אחר.',
      '4. סיים מיד לאחר כתיבת result.json, בלי סיכום.',
    ].join('\n');

    const { code, out, err } = await invoke(prompt, dir, opts.timeoutMs ?? 300_000);
    const cliOutput = `${out}\n${err}`;
    if (isLimit(cliOutput)) throw new UsageLimitError(cliOutput.trim().slice(-300));

    let raw: string;
    try {
      raw = await readFile(join(dir, 'result.json'), 'utf8');
    } catch {
      throw new ClaudeCodeError(`claude exited ${code} without writing result.json. Output: ${cliOutput.trim().slice(-500)}`);
    }
    // Tolerate a fenced block or stray prose around the JSON.
    const start = raw.search(/[[{]/);
    const end = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'));
    if (start < 0 || end < start) throw new ClaudeCodeError('result.json contains no JSON');
    let parsed: unknown;
    try { parsed = JSON.parse(raw.slice(start, end + 1)); }
    catch (e: any) { throw new ClaudeCodeError(`result.json is not valid JSON: ${e.message}`); }

    const check = opts.schema.safeParse(parsed);
    if (!check.success) throw new ClaudeCodeError(`result.json failed validation: ${JSON.stringify(check.error.issues.slice(0, 5))}`);
    return check.data;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** The installed CLI's version string, or null when `claude` is absent or not runnable. */
export async function claudeAvailable(): Promise<string | null> {
  const dir = await mkdtemp(join(tmpdir(), 'space-wall-probe-'));
  try {
    const child = spawn(bin(), ['--version'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    return await new Promise<string | null>(resolve => {
      let out = '';
      child.stdout.on('data', d => { out += d; });
      child.on('error', () => resolve(null));
      child.on('close', c => resolve(c === 0 ? out.trim() : null));
    });
  } catch { return null; }
  finally { await rm(dir, { recursive: true, force: true }).catch(() => {}); }
}
