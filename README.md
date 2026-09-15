# צג חלל · מנהלת החלל — Space Wall

Lobby display + fully automatic backend.

```
app/          the 1920×1080 display (static; deployed by Vercel, reads /api/feed)
api/feed.ts   Vercel function: builds the feed JSON from Supabase (cached 60 s)
api/telegram.ts  Telegram webhook: free text → Claude → confirm → database
lib/          shared: db client, feed builder, intake parser, dates
agent/        cron runner (GitHub Actions): OSINT, launches, space weather, numbers of the week
supabase/     schema migration (already applied to project rrbivwhratkmzcfxqjih)
project/, chats/   the original Claude Design handoff bundle
```

## How it flows

1. **GitHub Actions** runs `agent/` hourly (07–23 Israel time) and nightly.
   RSS from the approved sources (+ optional Claude web search) → dedupe → **Claude Opus 5** classifies, scores relevance,
   writes the Hebrew headline, the English headline and "למה חשוב למנהלת" (structured output) → `news_items`.
   Launch Library 2 → `launches` (site names translated once, cached). NOAA SWPC → `settings.space_weather`.
   Nightly: four grounded "numbers of the week".
2. **Vercel** serves `app/` and `/api/feed`, which assembles the display JSON from the database:
   24h loop, two feature cards with QR to the article, numbers, directorate block (life events + birthdays + internal events),
   events ticker, next launches. The display polls it every minute.
3. **Telegram bot**: anyone on the allow-list writes "יום הולדת לדנה כהן מאגף תכנון ב-3.10" or "הרמת כוסית ביום ג׳ 12:00 בלובי";
   Claude turns it into structured actions, the bot shows a summary with ✅/❌, and on confirm writes `people` /
   `life_events` / `directorate_events` / `industry_events`. Every message is logged in `intake_messages`.

Failures of any agent run are written to `agent_runs` and pushed to `TELEGRAM_ALERT_CHAT_ID`. The display keeps the last
good feed and turns the live dot amber when the feed is older than 3 hours.

## Setup checklist

**Secrets** (Vercel → Project → Settings → Environment Variables, and GitHub → Settings → Secrets → Actions):

| Name | Where | Value |
| --- | --- | --- |
| `SUPABASE_URL` | Vercel + GitHub | `https://rrbivwhratkmzcfxqjih.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel + GitHub | Supabase → Project Settings → API → service_role (secret) |
| `ANTHROPIC_API_KEY` | Vercel + GitHub | console.anthropic.com |
| `TELEGRAM_BOT_TOKEN` | Vercel + GitHub | from @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Vercel | any random string |
| `TELEGRAM_ADMIN_IDS` | Vercel | comma-separated chat ids allowed to edit (send `/whoami` to the bot to get yours) |
| `TELEGRAM_ALERT_CHAT_ID` | GitHub (optional) | chat id that receives failure alerts |
| `DISPLAY_KEY` | Vercel (optional) | if set, the wall must open `/?key=<DISPLAY_KEY>` |

**Telegram webhook** (once, in a browser):
`https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<your-vercel-domain>/api/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>`

**First run**: GitHub → Actions → `agent` → Run workflow with tasks `launches weather osint numbers`.
Until the first run the feed is empty apart from the seeded events; the display then fills within a minute.

**Local**: copy `.env.example` to `.env`, `npm install`, then `npm run agent:launches`, `npm run feed:preview`, or `npx vercel dev`.
Sources live in the `sources` table (enable/disable, weights); tag colours and feed sizes in `settings.feed`.

## Tuning

- `OSINT_WEB_SEARCH=1` (GitHub repository variable) adds a Claude web-search discovery pass per run, restricted to the source domains. Costs more; off by default.
- `OSINT_MAX_ITEMS` caps enrichment per run (default 40).
- `sources.weight` and the prompt in `lib/claude.ts` (`DIRECTORATE_PROFILE`) steer relevance.
- Anything can be edited by hand in the Supabase table editor; the feed reflects it within a minute.
