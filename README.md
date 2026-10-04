# צג חלל · מנהלת החלל — Space Wall

A 1920×1080 lobby display for the directorate: the weekly space newsletter, the office's events and people,
industry events and opportunities, and upcoming launches. **There is no Anthropic API key and no always-on
machine**: operators update it by chatting with Claude through a dedicated MCP connector, on their subscription.

```
app/              the display (static; served by Vercel, polls /api/feed every minute and /api/live every 5 s)
app/remote/       the operators' remote control (/remote): live moments, events, the people list, design, undo
api/live.ts       Vercel function: the wall's live state (design, brightness, urgent banner, full-screen moment), behind DISPLAY_KEY
api/remote.ts     Vercel function: the remote's API, behind REMOTE_TOKEN
api/feed.ts       Vercel function: builds the feed JSON from Supabase (cached 60 s), behind DISPLAY_KEY
api/mcp.ts        Vercel function: the "צג חלל" MCP connector for operators, behind MCP_TOKEN
api/cron.ts       Vercel cron: daily launches + space weather + the weekly newsletter import
api/telegram.ts   optional Telegram intake (queues messages; the local runner parses them)
lib/              shared: db client, feed builder, wall operations (wall-ops.ts), remote operations with undo (remote-ops.ts), the remote's agent (remote-agent.ts), zod contracts, dates, settings (env or app_settings)
agent/src/        the cron's tasks (launches, weather, newsletter) and the optional local runner: collection, enrichment, numbers, intake
agent/src/cc.ts   the bridge to the Claude Code CLI (task.json in, validated result.json out)
agent/test/       npm test: the bridge against stub CLI binaries, the newsletter parser against saved pages
supabase/         schema migrations 0001–0008 (see Database below)
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
   ticker items, the newsletter link, the urgent banner, brightness and the wall's design. Its "אנשים" tab is
   the people list: add, edit, delete, import from Excel (including the Google Form's response sheet) and
   export. Every change is stored in `remote_history` with its undo operations. Its agent panel ("סוכן הצג",
   `lib/remote-agent.ts`) carries out free-text requests on the server: Claude through the Anthropic API, with
   the remote's own operations as tools, so one tap undoes everything a request changed. It needs an API key,
   which an operator pastes once in the remote. The wall reads the live part from `/api/live` every 5 seconds.
3. **Vercel** serves the display (`app/`) and `/api/feed`, which assembles the v4 feed from Supabase.
   A daily Vercel cron (`api/cron.ts`, 03:00 UTC) refreshes launches and space weather and imports the
   newsletter; none of it needs a model. The three steps run side by side, each bounded by its fetch timeouts;
   the answer reports each one and is `ok: false` (HTTP 500) when any failed, and every run is a row in
   `agent_runs`. Space weather is collected (`space_weather`) but the current wall doesn't show it.
4. **The weekly newsletter** is imported automatically: the daily cron checks the archive page of
   https://rakia-weekly.vercel.app, and when a new issue is listed it parses that issue's page
   (`lib/newsletter.ts`) into `newsletter_issues`: news, featured stories, and upcoming events and
   opportunities for the ticker, each with its last day (`end`) so it leaves the ticker once it has passed.
   Nothing to upload by hand. The remote's "ניוזלטר השבוע" button imports a pasted issue link right away.
   To re-import the current issue from a terminal: `FORCE=1 npm run agent -- newsletter`. The connector's
   `import_newsletter_issue` still works for corrections.
5. **Optional:** the always-on runner (`npm run runner`, `agent/`) is needed only for the Telegram intake
   (it parses the queued messages with Claude Code) and the RSS news pipeline (collect, enrich, weekly numbers),
   whose output the current wall doesn't show. The wall, the remote, the connector and the cron work without it.

## Setup

**Vercel** → Project `space-wall` → Settings → Environment Variables, then Redeploy:

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | already set |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → `service_role` |
| `MCP_TOKEN` | the connector's password, at least 24 characters. Unset or shorter: the connector answers 404 to everyone |
| `CRON_SECRET` | a random string; Vercel sends it to the cron endpoint. Unset: the cron refuses every call |
| `DISPLAY_KEY` | the lobby screen's key. Once set, the wall must open `/?key=<DISPLAY_KEY>`, and the feed and the live state answer 401 without it. Until a key is set the feed (staff names, ranks, photos, birthdays) is open to anyone who has the URL, so set one |
| `REMOTE_TOKEN` | the remote's password, at least 24 characters. Operators open `/remote/?t=<REMOTE_TOKEN>`. Unset or shorter: the remote is closed |
| `ANTHROPIC_API_KEY` | optional: the remote's agent. Usually pasted in the remote instead (stored as the `anthropic_api_key` row of `app_settings`). `AGENT_MODEL` overrides the model (default `claude-sonnet-5-5`, else the newest Sonnet the key can use) |
| `TELEGRAM_*` | only for the optional Telegram intake, see `docs/telegram-setup.md`. Without `TELEGRAM_WEBHOOK_SECRET` the webhook refuses every update |

**Tokens kept in Supabase:** `MCP_TOKEN`, `DISPLAY_KEY` and `REMOTE_TOKEN` can instead be rows of `app_settings`
(migration 0007), keys `mcp_token`, `display_key` and `remote_token`, for when the Vercel environment can't be
edited. The environment variable wins when it is set. A changed row reaches every running function within a
minute, no redeploy needed. Make tokens with `openssl rand -hex 24` (48 characters, safe in a URL):

```sql
insert into app_settings (key, value) values ('display_key', '<openssl rand -hex 24>')
on conflict (key) do update set value = excluded.value, updated_at = now();
```

After setting a display key, reopen the lobby screen at `/?key=<key>`; the remote's "פתיחת הצג" link adds it.

**Database:** migrations 0001–0008, in order. 0005 (`people.profile`, `show_birthday`, `email`, `phone`) comes
from the staff-survey branch and is already applied in production, so it isn't in this branch; 0008 repeats
those columns (no-ops where they exist) and adds `people.on_wall`, the consent to appear on the wall. Apply 0008
before deploying this version: the feed, the remote and the connector read `on_wall`.

Also turn off Settings → Deployment Protection → Vercel Authentication so the lobby screen can load the page.

**Connector** for the operator: `https://space-wall.vercel.app/mcp/<MCP_TOKEN>`, added in Claude under
Settings → Connectors → Add custom connector. To revoke access, change the token: the environment variable
and a redeploy, or the `mcp_token` row.

## Commands

| Command | What it does |
| --- | --- |
| `npm run runner` | the optional always-on loop, for the Telegram intake and the RSS news pipeline |
| `npm run doctor` | checks the CLI, the model, the keys and the queue depths |
| `npm run agent -- collect enrich launches weather numbers newsletter intake` | run tasks once, by name |
| `npm run feed:preview` | prints the JSON the display will receive |
| `npm test` | the bridge against stub CLI binaries, the newsletter parser against saved pages; no network, database or subscription needed |
| `npm run typecheck` | TypeScript, no emit |

## Tuning

- **Cadence and cost** live in `.env` (`COLLECT_EVERY_SEC`, `ENRICH_EVERY_SEC`, `ENRICH_BATCH`,
  `CLAUDE_MODEL`). The model is called only when there is pending work, one call at a time.
- **Editorial judgement** comes from `DIRECTORATE_PROFILE` in `lib/profile.ts`, shared by every
  prompt, plus `sources.weight` in the database.
- **Sources** are rows in `sources`: enable, disable or add an RSS feed with no code change.
- **Everything is editable by hand** in the Supabase table editor; the feed reflects it within a
  minute.
