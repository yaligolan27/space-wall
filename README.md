# צג חלל · מנהלת החלל — Space Wall

A 1920×1080 lobby display for the directorate: the weekly space newsletter, the office's events and people,
industry events and opportunities, and upcoming launches. **There is no Anthropic API key and no always-on
machine**: operators update it by chatting with Claude through a dedicated MCP connector, on their subscription.

```
app/              the display (static; served by Vercel, polls /api/feed every minute and /api/live every 5 s)
app/remote/       the operators' remote control (/remote): live moments, events, design, undo
api/live.ts       Vercel function: the wall's live state (design, brightness, urgent banner, full-screen moment)
api/remote.ts     Vercel function: the remote's API, behind REMOTE_TOKEN
api/feed.ts       Vercel function: builds the feed JSON from Supabase (cached 60 s)
api/mcp.ts        Vercel function: the "צג חלל" MCP connector for operators
api/cron.ts       Vercel cron: daily launches + space weather + the weekly newsletter import
api/telegram.ts   optional Telegram intake (queues messages; the local runner parses them)
lib/              shared: db client, feed builder, wall operations (wall-ops.ts), remote operations with undo (remote-ops.ts), zod contracts, dates
agent/src/        the local runner: collection, enrichment, launches, weather, numbers, intake
agent/src/cc.ts   the bridge to the Claude Code CLI (task.json in, validated result.json out)
agent/test/       bridge tests against stub CLI binaries (npm test)
supabase/         schema migrations (already applied to project rrbivwhratkmzcfxqjih)
docs/             operator-guide.md (Hebrew, for the office) · local-runner.md · telegram-setup.md
project/, chats/  the original Claude Design handoff bundle
```

## How it flows

1. **Operators** (the directorate office, with a dedicated Claude account) update the wall by chatting
   with Claude through the **"צג חלל" MCP connector** (`api/mcp.ts`, served at `/mcp/<MCP_TOKEN>`).
   Its tools can only add, edit and remove people, life events, directorate events and ticker items, and
   import a newsletter issue; there is no raw SQL and people are soft-deleted. Guide: `docs/operator-guide.md`.
2. **The remote** (`/remote/?t=<REMOTE_TOKEN>`, `app/remote/`) is the button-first way to run the wall day to day:
   full-screen moments now (the 12:00 show, a greeting, an important event), personal and directorate events,
   the newsletter link, the urgent banner, brightness and the wall's design. Every change is stored in
   `remote_history` with its undo operations. Its agent panel hands free-text requests to Claude with the
   connector, so there is still no API key. The wall reads the live part from `/api/live` every 5 seconds.
3. **Vercel** serves the display (`app/`) and `/api/feed`, which assembles the v4 feed from Supabase.
   A daily Vercel cron (`api/cron.ts`) refreshes launches and space weather; neither needs a model.
4. **The weekly newsletter** is imported automatically: the daily cron checks the archive page of
   https://rakia-weekly.vercel.app, and when a new issue is listed it parses that issue's page
   (`lib/newsletter.ts`) into `newsletter_issues`: news, featured stories, and upcoming events and
   opportunities for the ticker. Nothing to upload by hand. To re-import the current issue on demand:
   `FORCE=1 npm run agent -- newsletter`. The connector's `import_newsletter_issue` still works for corrections.
5. **Optional:** the Telegram bot and the local Claude Code runner (`agent/`) still work for free-text intake
   and RSS enrichment, but nothing on the wall depends on them any more.

## Setup

**Vercel** → Project `space-wall` → Settings → Environment Variables, then Redeploy:

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | already set |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → `service_role` |
| `MCP_TOKEN` | a random string of at least 32 characters; it is the connector's password |
| `CRON_SECRET` | a random string; Vercel sends it to the cron endpoint |
| `DISPLAY_KEY` | optional; when set, the wall must open `/?key=<DISPLAY_KEY>` |
| `REMOTE_TOKEN` | a random string of at least 32 characters; the remote's password. Operators open `/remote/?t=<REMOTE_TOKEN>` |
| `PEOPLE_SHEET_URL` | optional; a link to the people sheet, shown in the remote next to the birthday list |

**Database:** apply `supabase/migrations/0006_remote.sql` (wall state, remote history, important events,
free-text life events with photos, and the public `wall-photos` storage bucket) before deploying the remote.

Also turn off Settings → Deployment Protection → Vercel Authentication so the lobby screen can load the page.

**Connector** for the operator: `https://space-wall.vercel.app/mcp/<MCP_TOKEN>`, added in Claude under
Settings → Connectors → Add custom connector. To revoke access, change `MCP_TOKEN` and redeploy.

## Commands

| Command | What it does |
| --- | --- |
| `npm run runner` | the always-on loop (this is the one you leave running) |
| `npm run doctor` | checks the CLI, the model, the keys and the queue depths |
| `npm run agent -- collect enrich launches weather numbers newsletter intake` | run tasks once, by name |
| `npm run feed:preview` | prints the JSON the display will receive |
| `npm test` | bridge tests against stub CLI binaries; no network or subscription needed |
| `npm run typecheck` | TypeScript, no emit |

## Tuning

- **Cadence and cost** live in `.env` (`COLLECT_EVERY_SEC`, `ENRICH_EVERY_SEC`, `ENRICH_BATCH`,
  `CLAUDE_MODEL`). The model is called only when there is pending work, one call at a time.
- **Editorial judgement** comes from `DIRECTORATE_PROFILE` in `lib/profile.ts`, shared by every
  prompt, plus `sources.weight` in the database.
- **Sources** are rows in `sources`: enable, disable or add an RSS feed with no code change.
- **Everything is editable by hand** in the Supabase table editor; the feed reflects it within a
  minute.
