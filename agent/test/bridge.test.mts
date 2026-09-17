// Exercises the Claude Code bridge against stub CLI binaries: happy path, usage-limit handling,
// the false-positive guard, missing output and schema violations. Needs no network, no
// subscription and no database.
//
//   npm test
//
// POSIX only (the stubs are shell scripts). It once caught the bridge passing the prompt as a
// positional argument, which the variadic tool flags silently swallowed.
import { readFileSync } from 'node:fs';
import { runClaudeTask, claudeAvailable, UsageLimitError, ClaudeCodeError } from '../src/cc.js';
import { EnrichResult, IntakeResult } from '../../lib/schemas.js';

const DIR = process.env.STUB_DIR || new URL('stubs', import.meta.url).pathname;
let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}

const input = { items: [{ index: 0, title: 'US Space Force tracks Chinese satellite', snippet: 's', source: 'SpaceNews', published_at: null }] };
const call = (schema: any, timeoutMs = 30000) => runClaudeTask({ name: 't', input, instructions: 'x', schema, timeoutMs });

process.env.ARGLOG = DIR + '/args.log';

process.env.CLAUDE_BIN = DIR + '/fake-ok.sh';
try {
  const out = await call(EnrichResult);
  check('happy path returns validated items', out.items.length === 1 && out.items[0].category === 'defense');
} catch (e: any) { check('happy path returns validated items', false, e.message); }

const args = readFileSync(DIR + '/args.log', 'utf8');
for (const flag of ['-p', '--permission-mode acceptEdits', '--allowedTools Read Write', '--max-turns', '--model'])
  check(`passes ${flag}`, args.includes(flag));
check('denies Bash and MCP tools', args.includes('--disallowedTools') && args.includes('Bash') && args.includes('mcp__*'));
check('no positional prompt in argv', !args.includes('task.json'));
const sentPrompt = readFileSync(DIR + '/prompt.txt', 'utf8');
check('prompt arrives on stdin', sentPrompt.includes('task.json') && sentPrompt.includes('result.json'));

process.env.CLAUDE_BIN = DIR + '/fake-limit.sh';
try { await call(EnrichResult); check('usage limit throws UsageLimitError', false, 'no throw'); }
catch (e: any) { check('usage limit throws UsageLimitError', e instanceof UsageLimitError, e.name); }

process.env.CLAUDE_BIN = DIR + '/fake-quota-words.sh';
try {
  const out = await call(EnrichResult);
  check('news text mentioning quota is not a usage limit', out.items.length === 1);
} catch (e: any) { check('news text mentioning quota is not a usage limit', false, `${e.name}: ${e.message}`); }

process.env.CLAUDE_BIN = DIR + '/fake-silent.sh';
try { await call(EnrichResult); check('missing result.json throws ClaudeCodeError', false, 'no throw'); }
catch (e: any) { check('missing result.json throws ClaudeCodeError', e instanceof ClaudeCodeError, e.name); }

process.env.CLAUDE_BIN = DIR + '/fake-badschema.sh';
try { await call(EnrichResult); check('bad schema throws ClaudeCodeError', false, 'no throw'); }
catch (e: any) { check('bad schema throws ClaudeCodeError', e instanceof ClaudeCodeError, e.message.slice(0, 50)); }

process.env.CLAUDE_BIN = DIR + '/does-not-exist';
check('claudeAvailable returns null when absent', (await claudeAvailable()) === null);

const lean = IntakeResult.safeParse({
  actions: [{ type: 'add_life_event', person_name: 'דנה', life_event_type: 'birthday', event_date: '2026-10-03' }],
  summary_he: 'ok', needs_clarification: false,
});
check('intake schema accepts sparse actions', lean.success, lean.success ? '' : JSON.stringify(lean.error.issues[0]));
check('intake schema nulls omitted fields', lean.success && lean.data.actions[0].place === null);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall green');
process.exit(failures ? 1 : 0);
