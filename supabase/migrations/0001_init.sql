-- Space Wall — initial schema. All tables have RLS enabled with no public policies:
-- the API and the agent use the service-role key; nothing is readable with the anon key.

create extension if not exists pgcrypto;

create type news_category as enum ('defense','geopolitics','launches','industry','israel','policy','tech','ssa','exploration','weather');
create type news_priority as enum ('push','weekly','archive','skip');
create type news_status   as enum ('published','review','hidden');
create type life_event_type as enum ('birthday','wedding','birth','bereavement','promotion','discharge','joined','other');
create type directorate_event_type as enum ('toast','ceremony','conference','exhibition','fun_day','visit','meeting','other');
create type intake_status as enum ('pending','confirmed','rejected','applied','failed');

-- ---------- OSINT ----------
create table sources (
  id          serial primary key,
  name        text not null,
  domain      text not null,
  rss_url     text,
  lang        text not null default 'en',
  weight      smallint not null default 1,     -- 1..3, nudges relevance
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);

create table news_items (
  id             uuid primary key default gen_random_uuid(),
  url            text not null unique,
  source_name    text not null,
  source_id      int references sources(id),
  published_at   timestamptz,
  fetched_at     timestamptz not null default now(),
  title_original text not null,
  title_en       text,                        -- cleaned English headline
  title_he       text,
  summary_he     text,
  why_he         text,                        -- "למה חשוב למנהלת"
  category       news_category,
  relevance      smallint check (relevance between 0 and 100),
  priority       news_priority not null default 'archive',
  image_url      text,
  image_credit   text,
  status         news_status not null default 'published',
  run_id         uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index news_items_published_idx on news_items (published_at desc);
create index news_items_priority_idx on news_items (priority, status, published_at desc);

create table launches (
  id          text primary key,               -- Launch Library 2 id
  name        text not null,
  provider    text,
  vehicle     text,
  mission     text,
  site_en     text,
  site_he     text,
  net         timestamptz not null,
  status      text,
  actor       text not null default 'other',  -- us | ru | cn | il | eu | other
  updated_at  timestamptz not null default now()
);
create index launches_net_idx on launches (net);

create table industry_events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  place_he    text,
  starts_on   date not null,
  ends_on     date,
  url         text,
  source      text not null default 'curated',  -- curated | agent | telegram
  approved    boolean not null default true,
  created_at  timestamptz not null default now()
);

create table weekly_numbers (
  id          uuid primary key default gen_random_uuid(),
  week_start  date not null,
  position    smallint not null,
  value       text not null,
  label       text not null,
  run_id      uuid,
  created_at  timestamptz not null default now(),
  unique (week_start, position)
);

create table translations (
  key         text primary key,
  he          text not null,
  created_at  timestamptz not null default now()
);

create table settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- ---------- Directorate (internal) ----------
create table people (
  id           uuid primary key default gen_random_uuid(),
  first_name   text not null,
  last_name    text,
  display_name text generated always as (case when last_name is null then first_name else first_name || ' ' || last_name end) stored,
  role         text,
  unit         text,
  rank         text,
  kind         text not null default 'civilian',   -- civilian | soldier | officer | reservist
  birthday     date,
  joined_on    date,
  leaves_on    date,
  telegram_id  bigint,
  active       boolean not null default true,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table life_events (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid references people(id) on delete cascade,
  type        life_event_type not null,
  event_date  date not null,
  text_he     text,                            -- display text; if null the API composes one
  show_from   date,
  show_until  date,
  approved    boolean not null default true,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index life_events_date_idx on life_events (event_date);

create table directorate_events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  type        directorate_event_type not null default 'other',
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  place       text,
  audience    text,
  show_from   date,
  show_until  date,
  approved    boolean not null default true,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index directorate_events_starts_idx on directorate_events (starts_at);

-- ---------- Intake (Telegram / email) ----------
create table telegram_users (
  chat_id     bigint primary key,
  name        text,
  role        text not null default 'editor',   -- admin | editor
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table intake_messages (
  id          uuid primary key default gen_random_uuid(),
  channel     text not null,                    -- telegram | email
  external_id text,
  sender      text,
  received_at timestamptz not null default now(),
  raw_text    text not null,
  parsed      jsonb,                            -- {actions:[...], reply:"..."}
  status      intake_status not null default 'pending',
  applied_at  timestamptz,
  error       text
);

-- ---------- Ops ----------
create table agent_runs (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null,                -- osint | launches | weather | numbers
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  status          text not null default 'running',
  items_found     int default 0,
  items_published int default 0,
  input_tokens    int default 0,
  output_tokens   int default 0,
  log             jsonb,
  error           text
);

-- updated_at triggers
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger news_items_updated before update on news_items for each row execute function set_updated_at();
create trigger people_updated before update on people for each row execute function set_updated_at();

-- RLS: deny everything to anon/authenticated; service role bypasses RLS.
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------- Seed ----------
insert into settings (key, value) values
  ('orbital', '{"line1":"ORBITAL PICTURE · LEO / GEO","line2":"54,120 עצמים >10 ס״מ במעקב"}'),
  ('space_weather', '{"line1":"Kp — · —","line2":"SPACE WEATHER · NOAA SWPC"}'),
  ('feed', '{"pushCount":7,"weeklyCount":2,"launchCount":4,"eventsHorizonDays":120,"lifeEventsHorizonDays":10}');

insert into sources (name, domain, rss_url, lang, weight) values
  ('SpaceNews',         'spacenews.com',           'https://spacenews.com/feed/',                                  'en', 3),
  ('Breaking Defense',  'breakingdefense.com',     'https://breakingdefense.com/category/space/feed/',             'en', 3),
  ('Payload',           'payloadspace.com',        'https://payloadspace.com/feed/',                               'en', 2),
  ('Air & Space Forces','airandspaceforces.com',   'https://www.airandspaceforces.com/category/space/feed/',       'en', 2),
  ('Defense News',      'defensenews.com',         'https://www.defensenews.com/arc/outboundfeeds/rss/category/space/?outputType=xml', 'en', 2),
  ('NASASpaceflight',   'nasaspaceflight.com',     'https://www.nasaspaceflight.com/feed/',                        'en', 1),
  ('The Space Review',  'thespacereview.com',      'https://www.thespacereview.com/rss.xml',                       'en', 1),
  ('ESA',               'esa.int',                 'https://www.esa.int/rssfeed/Our_Activities/Space_Safety',      'en', 1),
  ('Space.com',         'space.com',               'https://www.space.com/feeds/all',                              'en', 1),
  ('Ars Technica Space','arstechnica.com',         'https://arstechnica.com/space/feed/',                          'en', 1),
  ('Israel Defense',    'israeldefense.co.il',     'https://www.israeldefense.co.il/en/rss.xml',                   'en', 3),
  ('כלכליסט',            'calcalist.co.il',         'https://www.calcalist.co.il/GeneralRSS/0,16335,L-8,00.xml',     'he', 2);

insert into industry_events (name, place_he, starts_on, ends_on, source) values
  ('ESA Industry Days', 'נורדווייק, הולנד', '2026-09-16', '2026-09-17', 'curated'),
  ('IAC 2026', 'אנטליה, טורקיה', '2026-10-05', '2026-10-09', 'curated'),
  ('Silicon Valley Space Week', 'מאונטיין ויו', '2026-10-27', '2026-10-29', 'curated'),
  ('MilSat Symposium', 'קליפורניה', '2026-10-28', '2026-10-29', 'curated'),
  ('Space Tech Expo Europe · משלחת ישראלית', 'ברמן', '2026-11-17', '2026-11-19', 'curated'),
  ('שבוע החלל הישראלי 2027', 'ישראל', '2027-01-24', '2027-01-28', 'curated');

insert into directorate_events (title, type, starts_at, place, created_by) values
  ('הרמת כוסית לראש השנה', 'toast', '2026-09-15 12:00+03', 'לובי', 'seed'),
  ('מפגש עם אנשי מפא״ת', 'meeting', '2026-09-22 10:00+03', 'אולם א׳', 'seed');
