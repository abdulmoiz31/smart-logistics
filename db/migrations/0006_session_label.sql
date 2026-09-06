-- Optional human-friendly name for a saved scan, shown in the customer's
-- "My scans" history. Nullable: unnamed scans still list by date.
alter table sessions add column if not exists label text;
