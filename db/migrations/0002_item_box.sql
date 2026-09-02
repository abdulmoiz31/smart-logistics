-- Optional bounding-box annotation for agent lightbox.
-- Normalised 0-1 coordinates; invalid or unwanted boxes are dropped at parse time.
alter table items add column box jsonb;
