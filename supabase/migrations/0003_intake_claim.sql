-- Lets two runners (a local machine and a cloud Routine) coexist without both parsing the same
-- Telegram message: a runner claims a row before handing it to the model.
alter table intake_messages add column if not exists claimed_at timestamptz;
create index if not exists intake_pending_idx on intake_messages (status, received_at) where parsed is null;
