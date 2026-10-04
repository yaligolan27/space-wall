-- Settings the app reads at runtime that can be changed from Supabase without touching the Vercel project.
-- remote_token: the remote's password when REMOTE_TOKEN is not set in the environment.
-- Values are never committed here; set them with:
--   insert into app_settings (key, value) values ('remote_token', '<32+ random chars>')
--   on conflict (key) do update set value = excluded.value, updated_at = now();
create table if not exists app_settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);
alter table app_settings enable row level security;   -- service role only
