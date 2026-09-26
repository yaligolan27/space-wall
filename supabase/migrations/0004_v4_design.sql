-- Space Wall v4 design: weekly newsletter issues, person photos, ticker kinds.

-- One row per weekly Rakia newsletter issue. `content` holds the newsletter part of the feed:
-- { issue:{range,url}, summary:[..], featured:[..], news:[..], catColor:{..}, catImage:{..}, ticker:[..] }
create table if not exists newsletter_issues (
  id           uuid primary key default gen_random_uuid(),
  issue_date   date not null unique,          -- the issue's publication date
  source_url   text not null,
  content      jsonb not null,
  imported_at  timestamptz not null default now(),
  run_id       uuid
);
alter table newsletter_issues enable row level security;

alter table people add column if not exists photo_url text;
alter table industry_events add column if not exists kind text not null default 'אירוע';   -- אירוע | הזדמנות
