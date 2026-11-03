# Hosting (since 2026-11-03)

The Vercel account stopped serving space-wall.vercel.app, so the wall moved to two free services:

| What | Where | Updates |
|---|---|---|
| The wall, the remote and their files (`app/`) | GitHub Pages: https://yaligolan27.github.io/space-wall/ and `/space-wall/remote/?t=<token>` | by itself on every push to `main` (`.github/workflows/pages.yml` builds with `scripts/build-pages.mjs` and pushes the `gh-pages` branch) |
| The server (`api/*.ts` through `edge/server.ts`) | Supabase Edge Function `api`: `https://rrbivwhratkmzcfxqjih.supabase.co/functions/v1/api/<feed\|live\|remote\|cron\|telegram>` and `/api/mcp/<token>` | by hand, see below |
| The daily 06:00 refresh | `pg_cron` job `space-wall-daily` (03:00 UTC) calls `/api/cron` with the cron secret | — |

Secrets: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` come with every Edge Function; `CRON_SECRET` is an Edge Function
secret; the remote token, the Anthropic key and the agent's model stay in `app_settings`. Telegram (`TELEGRAM_*`)
and the connector's `MCP_TOKEN` were Vercel variables and are not set on Supabase; set them as Edge Function secrets
(or the connector's `mcp_token` row in `app_settings`) to bring those back.

## Shipping a server change

1. `node scripts/build-edge.mjs` and commit `dist/edge/` with the change; merge to `main`.
2. Redeploy the function `api` (verify_jwt off) with `supabase/functions/api/index.ts`, `COMMIT` replaced by the merged
   commit's SHA. Supabase fetches `dist/edge/api.js` from jsDelivr at that commit and bundles it. A thread can do
   this with the Supabase connector (deploy_edge_function); no keys are needed.

The front end calls the server cross-origin (CORS is open; each route checks its own key). The wall polls
`/api/live` every 8 s (was 5 s) to stay inside the free plan's 500k function calls a month.

The Vercel files (`vercel.json`, `api/*.ts` as Vercel functions) still work if the project ever goes back there.
