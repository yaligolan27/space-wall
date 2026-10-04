-- Remote control (app/remote, api/remote.ts): the live wall state, the change history with undo,
-- "important" directorate events that take over the screen, and free-text life events with photos.

-- One row: what the remote controls live. Read by /api/live every few seconds.
create table if not exists wall_state (
  id          smallint primary key default 1 check (id = 1),
  design      jsonb not null default '{}'::jsonb,   -- noon, qr, feature, list, fx, globe, globeStyle, sway
  brightness  smallint not null default 100 check (brightness between 10 and 100),
  urgent      text,                                  -- red banner on top of the wall; null = none
  takeover    jsonb,                                 -- a full-screen moment started from the remote
  noon_skip   date,                                  -- the automatic 12:00 show is skipped on this date
  dismissed   jsonb not null default '[]'::jsonb,    -- automatic moments ended early ("noon:2026-10-04", "event:<id>")
  updated_at  timestamptz not null default now(),
  updated_by  text
);
insert into wall_state (id) values (1) on conflict do nothing;
alter table wall_state enable row level security;

-- Every remote change, with the operations that undo it.
create table if not exists remote_history (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  who        text not null,
  label      text not null,
  undo       jsonb not null default '[]'::jsonb,    -- [{op:'state',patch}|{op:'del',table,id}|{op:'put',table,row}]
  undone_at  timestamptz
);
create index if not exists remote_history_at_idx on remote_history (at desc);
alter table remote_history enable row level security;

-- An important directorate event takes over the full screen while it runs.
alter table directorate_events add column if not exists takeover boolean not null default false;

-- Life events: the operator's free-text wording ("נולד בן", "סיום תואר") and the photo choice.
alter table life_events add column if not exists label text;
alter table life_events add column if not exists photo_mode text not null default 'crm' check (photo_mode in ('crm', 'upload', 'none'));
alter table life_events add column if not exists photo_url text;

-- Public bucket for photos uploaded from the remote (written only with the service key).
insert into storage.buckets (id, name, public) values ('wall-photos', 'wall-photos', true) on conflict (id) do nothing;
