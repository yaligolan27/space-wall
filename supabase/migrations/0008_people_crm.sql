-- The people list is managed from the remote (שלט → אנשים): add, edit, import from Excel or the Google Form's
-- response sheet, export. Changes go through remote_history like every other remote change, so they can be undone.

-- First added by the staff-survey migration (0005, applied in production from the survey branch); repeated here
-- so a database built from this branch has them too. No-ops where they exist.
alter table people add column if not exists profile       jsonb not null default '{}'::jsonb;  -- expertise, hobbies, fun_fact, space_q, upcoming
alter table people add column if not exists show_birthday boolean not null default true;        -- celebrate the birthday on the wall
alter table people add column if not exists email         text;
alter table people add column if not exists phone         text;

-- Consent: false keeps the person in the office's list only. The wall never shows them: no birthday,
-- no personal moments, no photo.
alter table people add column if not exists on_wall boolean not null default true;
