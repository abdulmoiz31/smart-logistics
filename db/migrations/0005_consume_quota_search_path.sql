-- Harden consume_quota: pin an empty search_path and fully-qualify every
-- reference, so the function cannot be hijacked by a caller-controlled
-- search_path (Supabase linter 0011_function_search_path_mutable).
--
-- Idempotent (create or replace); safe to re-run.
create or replace function public.consume_quota(p_keys text[], p_limits integer[])
returns text
language plpgsql
set search_path = ''
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
      from public.scan_usage
      where bucket_key = p_keys[i] and usage_date = v_day
      for update;
    if coalesce(v_count, 0) >= p_limits[i] then
      return p_keys[i];
    end if;
  end loop;

  -- Phase 2: all buckets have headroom — spend one unit from each.
  for i in 1 .. array_length(p_keys, 1) loop
    insert into public.scan_usage (bucket_key, usage_date, count)
      values (p_keys[i], v_day, 1)
      on conflict (bucket_key, usage_date)
      do update set count = public.scan_usage.count + 1;
  end loop;

  return null;
end;
$$;
