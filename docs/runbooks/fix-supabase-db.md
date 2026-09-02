# Runbook — Fix the Supabase database

**Audience:** an AI agent (Claude Sonnet 5) working with a human teammate.
**Repo:** `smart-logistics` (MoveScan)
**Written:** 2026-09-02

---

## Read this first: what the agent cannot do

**The agent cannot apply these changes.** All of them are DDL — `create table`,
`alter table`, `create function` — and the only database credential in the repo is
`SUPABASE_SERVICE_KEY`, which reaches the database through PostgREST. **PostgREST does not
execute DDL.** There is no connection string or database password in the repo.

So the work splits cleanly:

| Step | Who |
|---|---|
| Diagnose current state | **Agent** — `npm run check-db` |
| Paste SQL into the Supabase SQL editor | **Human only** |
| Verify each step landed | **Agent** — `npm run check-db` |
| Verify the app works end to end | **Agent** — `npm run dev` + the checks below |

**Agent: do not attempt to work around this.** Do not try the Supabase Management API, do
not look for a personal access token, and do not install the Supabase CLI to push
migrations. If the human is unavailable, stop and say so. Fabricating progress here is
worse than waiting.

---

## The problem

Two migrations were never applied to the live database. `npm run check-db` currently
reports:

```
MISSING  relation scan_usage            db/migrations/0001_scan_usage.sql
MISSING  rpc consume_quota()            db/migrations/0001_scan_usage.sql
MISSING  sessions(user_id, device_id)   db/migrations/0004_session_ownership.sql
```

### Consequence 1 — session creation is completely broken

`createSession` in `lib/db.ts` inserts `user_id` and `device_id`. Those columns do not
exist, so **every new scan fails with a 500.** `POST /api/session` returns
`Unable to create a scan session.` The app cannot be used at all until this is fixed.

### Consequence 2 — rate limiting has never worked, and failed silently

`consume_quota` does not exist. `lib/rate-limit.ts` **fails open** on RPC error:

```ts
if (error) {
  console.error('[rate-limit] consume_quota rpc failed', error);
  return { ok: true, blockedScope: null, authenticated };
}
```

So every scan is allowed. All the abuse protection — device, IP and user buckets, the
tuned daily limits — is inert, and the only symptom is a `console.error` nobody reads.

Fail-open is the correct design (a database blip must not block a customer mid-scan), but
it makes a permanent misconfiguration look exactly like a transient one. That is why the
fix must be verified rather than assumed.

**What is already fine:** base tables (`sessions`, `rooms`, `items`, `captures`, `quotes`),
`items.box`, `items.uncertainty_reason`, `items.seen_in_images`, and the `captures` storage
bucket, which exists and is correctly private. Migrations `0002` and `0003` are applied.

---

## Step 0 — Agent: confirm the starting state

```bash
npm run check-db
```

Expect the three `MISSING` lines above. **If the output differs from this runbook, stop and
report what it actually says** rather than proceeding — someone may have partly fixed it.

Both SQL scripts below are **idempotent** (`if not exists`, `create or replace`), so
re-running one that already succeeded is harmless. That is deliberate: a half-applied step
must be safe to repeat.

---

## Step 1 — Human: apply the rate-limiting migration

Supabase dashboard → **SQL Editor** → new query → paste all of this → **Run**.

Source of truth is `db/migrations/0001_scan_usage.sql`; this is the same content inline so
you do not have to open the repo.

```sql
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
```

Expected result: **Success. No rows returned.**

---

## Step 2 — Human: apply the session-ownership migration

Same place, new query. Source: `db/migrations/0004_session_ownership.sql`.

```sql
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
```

Expected result: **Success. No rows returned.**

**Do not add a `not null` constraint or a default to either column.** Existing rows
deliberately have no owner so that estimate links already sent to customers keep working —
`lib/session-access.ts` treats an unowned session as readable by design.

---

## Step 3 — Agent: verify the schema

```bash
npm run check-db
```

**Required output:** every line `OK`, ending with `Everything the app needs is present.`

If `scan_usage` or `consume_quota` still reports `MISSING`, Supabase's schema cache may be
stale — wait ~30 seconds and re-run before concluding the SQL failed. If a column still
reports missing after that, the SQL did not run; ask the human to re-check the SQL editor
output for an error.

---

## Step 4 — Agent: verify the app works

```bash
npm run dev
```

Then, against the dev server:

**4a. Session creation (was returning 500):**

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/session
```

Expect **201**. A 500 means Step 2 did not land.

**4b. Ownership is recorded.** Create a session in a browser (so a device cookie exists),
then confirm the row has a `device_id`:

```bash
npm run check-db   # schema only — for row data use the Supabase table editor
```

In the Supabase **Table Editor** → `sessions`, the newest row must show a `device_id`.
`user_id` will be null unless you were signed in, which is correct.

**4c. Rate limiting is live again.** The quickest proof is that the counter starts moving:
run one scan through the UI, then check the Supabase Table Editor → `scan_usage`. There
must be at least one row with today's date. Before Step 1 this table did not exist.

**Do not verify by trying to exceed the limit.** Anonymous limits are 3 scans/device and
9/IP per day; burning them makes further demo testing awkward for the rest of the day.

**4d. Full gate:**

```bash
npx tsc --noEmit && npx vitest run && npx next build --turbopack
```

Expect clean typecheck, **131 tests passing**, successful build.

---

## Step 5 — Human: confirm the two environment variables

These are not database changes but they belong to the same readiness check.

1. **`RATE_LIMIT_IP_SALT`** must be set to 16+ characters in `.env.local` **and** in the
   Vercel project (Production and Preview). `lib/rate-limit.ts` throws if it is missing —
   deliberately, because a silently-defaulted salt makes hashed IPs reversible.

   ```bash
   openssl rand -hex 16
   ```

   Changing it resets that day's IP counters once. Harmless, but expected.

2. **`AGENT_CONSOLE_SECRET`** — rotate it. The current value was pasted into a chat
   transcript. Same generator; update `.env.local` and Vercel.

---

## Step 6 — Agent: report, do not over-claim

Report exactly:
- the `check-db` output after Step 3
- the HTTP status from 4a
- whether `scan_usage` gained a row in 4c
- the gate result from 4d

**State plainly anything you could not verify.** Two things in particular are outside what
this runbook can confirm:

- **The adversarial authorization test.** Task 7 of the consolidated plan added an
  ownership guard to nine routes. Proving it works needs two browser profiles: take a
  session URL in profile A, read an item id from `GET /api/session/[sessionId]`, then
  attempt `PATCH /api/item/[itemId]` from profile B. It must return **404**. Do this if you
  can; if not, say it is unverified.
- **The agent console flow** (sign in, 30-minute idle expiry, browser-close expiry, sign
  out) needs the console password. If you do not have it, say so — do not ask the human to
  paste it into the chat.

---

## If something goes wrong

| Symptom | Cause | Action |
|---|---|---|
| `POST /api/session` → 500, log says "apply db/migrations/0004…" | Step 2 not applied | Re-run Step 2; it is idempotent |
| `check-db` shows `consume_quota` MISSING after Step 1 succeeded | Schema cache stale | Wait 30s, re-run. If it persists, re-run Step 1 |
| `column already exists` error in the SQL editor | Partly applied earlier | Safe to ignore — the scripts use `if not exists`, so re-run the whole block |
| `npm run check-db` → "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set" | No `.env.local` | Ask the human for the values; do not guess |
| Scans allowed past the limit | `RATE_LIMIT_DISABLED=1` or `MOVESCAN_DEMO_MODE=1` | Both bypass limiting by design — check the env |

---

## Context worth knowing

**Row Level Security is not the access-control mechanism here** and must not be treated as
one. `lib/db.ts` builds its client with `SUPABASE_SERVICE_KEY`, which bypasses RLS by
design, and every application query goes through it. Adding RLS policies would have **no
effect** on the API routes while creating a false impression that access is controlled.
Authorization lives in the route handlers via `lib/session-access.ts`.

**Migration order matters** only in that `0004` must come after the base `db/schema.sql`.
`0001` and `0004` are independent of each other and of `0002`/`0003`, which are already
applied.

**`npm run check-db` is safe to run any time.** It only reads, and its `consume_quota`
probe passes empty arrays, which the function returns `NULL` for without touching a
counter. Add it to the pre-demo checklist — it would have caught both of these problems a
week earlier.
