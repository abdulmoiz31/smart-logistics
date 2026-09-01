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
