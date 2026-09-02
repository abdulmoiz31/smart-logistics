create extension if not exists "pgcrypto";

create table sessions (
  id uuid primary key default gen_random_uuid(),
  customer_email text,
  status text not null default 'scanning'
    check (status in ('scanning', 'reviewing', 'pending_review', 'confirmed')),
  created_at timestamptz not null default now()
);

create table rooms (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  room_type text not null default 'other',
  access_flags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table captures (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  name text not null,
  category text not null,
  count integer not null default 1 check (count >= 1),
  size_class text not null default 'm' check (size_class in ('s', 'm', 'l')),
  cubic_feet numeric(6,1) not null check (cubic_feet > 0),
  confidence numeric(3,2) not null check (confidence >= 0 and confidence <= 1),
  source text not null default 'ai' check (source in ('ai', 'refined', 'user_added')),
  edited_by_user boolean not null default false,
  ambiguous_between text[],
  uncertainty_reason text,
  seen_in_images integer[],
  box jsonb,
  created_at timestamptz not null default now()
);

create table quotes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  breakdown jsonb not null,
  status text not null default 'pending_review'
    check (status in ('draft', 'pending_review', 'confirmed')),
  confirmed_cents integer,
  agent_notes text,
  created_at timestamptz not null default now()
);

create index rooms_session_id_idx on rooms (session_id);
create index items_room_id_idx on items (room_id);
create index captures_room_id_idx on captures (room_id);
create index quotes_status_created_at_idx on quotes (status, created_at desc);

-- Per-identity daily counter for AI-call rate limiting.
create table scan_usage (
  bucket_key text not null,
  usage_date date not null,
  count      integer not null default 0,
  primary key (bucket_key, usage_date)
);

create index scan_usage_date_idx on scan_usage (usage_date);

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

  for i in 1 .. array_length(p_keys, 1) loop
    select count into v_count
      from scan_usage
      where bucket_key = p_keys[i] and usage_date = v_day
      for update;
    if coalesce(v_count, 0) >= p_limits[i] then
      return p_keys[i];
    end if;
  end loop;

  for i in 1 .. array_length(p_keys, 1) loop
    insert into scan_usage (bucket_key, usage_date, count)
      values (p_keys[i], v_day, 1)
      on conflict (bucket_key, usage_date)
      do update set count = scan_usage.count + 1;
  end loop;

  return null;
end;
$$;
