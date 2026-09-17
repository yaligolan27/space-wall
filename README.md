# צג חלל · מנהלת החלל — Space Wall

A 1920×1080 lobby display of OSINT space news for the directorate, with a fully automatic backend
that updates it live. **There is no Anthropic API key anywhere in this project**: every model task
runs through the Claude Code CLI on one always-on machine, on that machine's subscription.

```
app/              the display (static; served by Vercel, polls /api/feed every minute)
api/feed.ts       Vercel function: builds the feed JSON from Supabase (cached 60 s)
api/telegram.ts   Vercel function: queues Telegram messages, applies confirmed actions — no model
lib/              shared: db client, feed builder, zod contracts, action applier, dates
agent/src/        the local runner: collection, enrichment, launches, weather, numbers, intake
agent/src/cc.ts   the bridge to the Claude Code CLI (task.json in, validated result.json out)
agent/test/       bridge tests against stub CLI binaries (npm test)
supabase/         schema migrations (already applied to project rrbivwhratkmzcfxqjih)
docs/             local-runner.md (setup, autostart, limits) · telegram-setup.md
project/, chats/  the original Claude Design handoff bundle
```

## How it flows

1. **The runner** (`npm run runner`, on the always-on machine) schedules itself. Every 10 minutes it
   pulls the approved RSS sources, dedupes, and stores new items unenriched. Every 10 minutes, *only
   if something is waiting*, it hands a batch to Claude Code, which classifies each item, scores its
   relevance and writes the Hebrew headline, the English headline and the "למה חשוב למנהלת" line.
   The result is validated against a zod schema before it is stored, so a malformed answer is
   retried rather than displayed. Launches come from Launch Library 2 and space weather from NOAA,
   both without a model.
2. **Vercel** serves `app/` and `/api/feed`, which assembles the display JSON from the database:
   the 24-hour loop, two feature cards with a QR to the article, the numbers of the week, the
   directorate block (life events, birthdays computed from the people table, internal events), the
   events ticker and the next launches.
3. **The Telegram bot** takes free Hebrew text from anyone on the allow-list. The webhook only
   queues it; the runner parses it within a minute and replies with a summary and ✅/❌; on confirm
   the webhook writes to `people`, `life_events`, `directorate_events` or `industry_events`.

Every run is recorded in `agent_runs`, every message in `intake_messages`. Failures and usage-limit
pauses are pushed to `TELEGRAM_ALERT_CHAT_ID`. Send `/status` to the bot for a health summary.

**When the machine is off**, the display keeps serving the last good feed and turns its live dot
amber once the feed is more than three hours old. Nothing is lost; the queue waits.

## Setup

1. **The runner** is the only part with prerequisites. Follow `docs/local-runner.md`: install Claude
   Code, log in once with the subscription account, fill `.env` with the two Supabase values, then
   `npm run doctor` and `npm run runner`. It also covers autostart on macOS, Linux and Windows.
2. **The bot**: `docs/telegram-setup.md`, from @BotFather to the webhook URL.
3. **Vercel** needs only these environment variables, and no Anthropic key:

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | `https://rrbivwhratkmzcfxqjih.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → `service_role` |
| `TELEGRAM_BOT_TOKEN` | from @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | any random string, matching the one in the webhook URL |
| `TELEGRAM_ADMIN_IDS` | comma-separated chat ids allowed to edit (send `/whoami` to get yours) |
| `DISPLAY_KEY` | optional; when set, the wall must open `/?key=<DISPLAY_KEY>` |

## Commands

| Command | What it does |
| --- | --- |
| `npm run runner` | the always-on loop (this is the one you leave running) |
| `npm run doctor` | checks the CLI, the model, the keys and the queue depths |
| `npm run agent -- collect enrich launches weather numbers intake` | run tasks once, by name |
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
