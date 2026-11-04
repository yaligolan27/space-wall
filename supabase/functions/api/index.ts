// The Supabase Edge Function "api": the wall's whole server (edge/server.ts, built by scripts/build-edge.mjs into
// dist/edge/). Supabase bundles that build at deploy time from the commit named below, so to ship a server change:
// build, commit dist/edge, merge, then redeploy this function with the new commit (docs/hosting.md).
// Deployed with verify_jwt off: each route checks its own key (remote token, display key, cron secret).
// raw.githubusercontent.com, not jsDelivr: jsDelivr refuses a repo over 50 MB, and the ceremony's promo video puts
// this one over it.
import { handle } from 'https://raw.githubusercontent.com/yaligolan27/space-wall/COMMIT/dist/edge/api.js';

Deno.serve(handle);
