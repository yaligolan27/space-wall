-- A picture for a directorate event, uploaded from the remote to the wall-photos bucket: shown next to the event in
-- the wall's events panel, and large while the event is on the full screen.
alter table directorate_events add column if not exists photo_url text;
