// Bundles the server (edge/server.ts + api/ + lib/ + agent/src/ + npm packages) into one ES module,
// dist/edge/api.js, for the Supabase Edge Function "api" (supabase/functions/api/index.ts imports it by commit).
// Run: node scripts/build-edge.mjs   (then commit dist/edge/api.js and redeploy the function; see docs/hosting.md)
import { build } from 'esbuild';
import { execSync } from 'node:child_process';

let sha = '';
try { sha = execSync('git rev-parse --short HEAD').toString().trim(); } catch { /* not a checkout */ }
await build({
  entryPoints: ['edge/server.ts'],
  outdir: 'dist/edge',
  entryNames: 'api',
  chunkNames: 'chunk-[hash]',
  splitting: true,   // dynamic import() stays lazy as its own file; one big file wraps modules and broke zod's init order
  bundle: true,
  format: 'esm',
  platform: 'node',
  mainFields: ['module', 'main'],   // ES builds first: a CommonJS copy requiring zod breaks zod's init order
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  define: { 'process.env.APP_BUILD': JSON.stringify(sha) },
  // CommonJS packages call require() for Node built-ins; Deno gives ES modules a require through node:module.
  banner: { js: "import { createRequire as __cr } from 'node:module'; import __process from 'node:process'; import { Buffer as __Buffer } from 'node:buffer'; const require = __cr(import.meta.url); globalThis.process ??= __process; globalThis.Buffer ??= __Buffer;" },
});
console.log('dist/edge/api.js built', sha);
