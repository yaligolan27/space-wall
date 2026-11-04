// Builds the static site for GitHub Pages (free) into _site/: the wall (/), the remote (/remote/) and their files.
// GitHub Pages serves a project at https://<user>.github.io/<repo>/, so absolute paths ("/assets/...") get that
// prefix, and the server calls ("/api/...") go to the Supabase Edge Function "api" (edge/server.ts).
// Run by .github/workflows/pages.yml on every push to main. Locally: node scripts/build-pages.mjs
//   SITE_BASE  path prefix, default "/space-wall" ("" when the site has its own domain)
//   API_BASE   where /api/... lives, default the Supabase project's functions
import { cpSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const BASE = process.env.SITE_BASE ?? '/space-wall';
const API = process.env.API_BASE ?? 'https://rrbivwhratkmzcfxqjih.supabase.co/functions/v1';
const OUT = '_site';

rmSync(OUT, { recursive: true, force: true });
cpSync('app', OUT, { recursive: true });
writeFileSync(join(OUT, '.nojekyll'), '');            // serve every file as is

const TEXT = new Set(['.html', '.js', '.css', '.webmanifest', '.json']);
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'vendor' && name !== 'rakia-weekly') walk(p); continue; }   // the newsletter's pages are served as sent
    if (!TEXT.has(extname(name))) continue;
    const before = readFileSync(p, 'utf8');
    const after = before
      .replace(/(["'(`])\/api\//g, `$1${API}/api/`)
      .replace(/(["'(`])\/(assets|src|vendor|remote|data)\//g, `$1${BASE}/$2/`)
      .replace(/(["'(`])\/(styles\.css|manifest\.webmanifest)/g, `$1${BASE}/$2`)
      .replace(/(["'`])\/\?/g, `$1${BASE}/?`)
      .replace(/"(start_url|scope)": "\/"/g, `"$1": "${BASE}/"`);
    if (after !== before) writeFileSync(p, after);
  }
}
walk(OUT);
console.log(`${OUT}/ built: base "${BASE}", api ${API}`);
