-- Staff survey: everyone in the directorate fills /join, the office reviews at /join/review,
-- and an approved submission becomes (or updates) a row in `people`.

do $$ begin
  create type submission_status as enum ('pending','approved','rejected');
exception when duplicate_object then null; end $$;

create table if not exists people_submissions (
  id            uuid primary key default gen_random_uuid(),
  status        submission_status not null default 'pending',
  first_name    text not null,
  last_name     text not null,
  birthday      date not null,
  show_birthday boolean not null default true,     -- celebrate on the wall
  consent_wall  boolean not null default false,    -- name and photo may appear on the lobby screen
  kind          text not null default 'civilian',  -- civilian | soldier | officer | reservist
  rank          text,
  unit          text,
  role          text,
  joined_on     date,
  leaves_on     date,
  email         text,
  phone         text,
  photo_path    text,                              -- object in the private people-submissions bucket
  profile       jsonb not null default '{}'::jsonb, -- expertise, hobbies, fun_fact, space_q, upcoming, notes
  person_id     uuid references people(id) on delete set null,
  review_note   text,
  submitted_at  timestamptz not null default now(),
  reviewed_at   timestamptz
);
create index if not exists people_submissions_status_idx on people_submissions (status, submitted_at desc);
alter table people_submissions enable row level security;

-- The richer profile the survey collects, and the person's own choice about birthdays on the wall.
alter table people add column if not exists profile jsonb not null default '{}'::jsonb;
alter table people add column if not exists show_birthday boolean not null default true;
alter table people add column if not exists email text;
alter table people add column if not exists phone text;

-- Photos: submissions land in a private bucket; approval copies the photo to the public one the wall reads.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('people-submissions', 'people-submissions', false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('people-photos',      'people-photos',      true,  5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
