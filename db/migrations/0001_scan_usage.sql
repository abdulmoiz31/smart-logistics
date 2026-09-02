-- Per-identity daily counter for AI-call rate limiting.
create table if not exists scan_usage (
  bucket_key text not null,
  usage_date date not null,
  count      integer not null default 0,
  primary key (bucket_key, usage_date)
);

create index if not exists scan_usage_date_idx on scan_usage (usage_date);

-- Atomic "can this identity spend one unit?" check.
-- p_keys / p_limits are parallel arrays. Returns the first key that is at or over
-- its limit (nothing is incremented in that case), or NULL when the spend is allowed
-- (every key incremented by 1).
create or replace function consume_quota(p_keys text[], p_limits integer[])
returns text
language plpgsql
as $$
declare
  v_day   date := (now() at time zone 'utc')::date;
  i       integer;
  v_count integer;
begin
  if p_keys is null or array_length(p_keys, 1) is null then
    return null;
  end if;

  -- Phase 1: check every bucket, locking existing rows to serialise concurrent calls.
  for i in 1 .. array_length(p_keys, 1) loop
    select count into v_count
      from scan_usage
      where bucket_key = p_keys[i] and usage_date = v_day
      for update;
    if coalesce(v_count, 0) >= p_limits[i] then
      return p_keys[i];
    end if;
  end loop;

  -- Phase 2: all buckets have headroom — spend one unit from each.
  for i in 1 .. array_length(p_keys, 1) loop
    insert into scan_usage (bucket_key, usage_date, count)
      values (p_keys[i], v_day, 1)
      on conflict (bucket_key, usage_date)
      do update set count = scan_usage.count + 1;
  end loop;

  return null;
end;
$$;
