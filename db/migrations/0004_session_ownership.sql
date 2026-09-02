-- Scan sessions gain an owner so authorization has something to check.
--
-- Both columns are nullable on purpose:
--   * rows created before this migration have no owner and stay readable, so
--     estimate links already sent to customers keep working (see lib/session-access.ts)
--   * device_id is absent for sessions created by the seed scripts, which have no
--     request context
alter table sessions add column if not exists user_id   uuid;
alter table sessions add column if not exists device_id text;

-- Partial: almost every lookup is for a non-null owner.
create index if not exists sessions_user_id_idx   on sessions (user_id)   where user_id is not null;
create index if not exists sessions_device_id_idx on sessions (device_id) where device_id is not null;
