# Scan Rate Limiting + Email/Password Auth — Implementation Plan

> **For agentic workers (Qoder):** implement task-by-task, in the order given. Each task
> ends with a verification gate that must pass before moving on. Do not skip the gate.
> Checkbox (`- [ ]`) steps are for progress tracking.

**Date:** 2026-09-02

---

## 1. Goal

Anyone can currently open MoveScan and run unlimited AI room scans. Each scan spends
from a shared **Gemini free-tier quota of ~500 requests/day**. We want to stop one
visitor from burning the whole quota, while keeping the "no signup" first experience.

**Target behaviour:**

| Who | Daily AI-call allowance |
|---|---|
| Anonymous visitor | **3** per device cookie, **9** per IP address (whichever is hit first) |
| Signed-up user (email + password) | **15** per account, **40** per IP address (account-farming backstop) |

An "AI call" = one `POST /api/analyze` (room analysis) **or** one `POST /api/refine`
that actually reaches Gemini. Both draw from the same counter (cost 1 each).

All numbers are environment variables — changing them is a config edit, no code change.

---

## 2. Decisions (already made — do not relitigate)

1. **Auth = Supabase Auth, email + password.** Supabase is already a dependency. It
   handles password hashing and session cookies. Email confirmation is **disabled** for
   v1 (signup → immediately signed in). The per-IP cap on authenticated users is the
   backstop against scripted fake signups.
2. **Anonymous identity = device cookie AND IP, metered independently.** Block when
   *either* limit is reached. Clearing the cookie still hits the IP cap; a small office
   behind one NAT still gets 9 scans/day before anyone must sign up.
3. **No global daily cap.** Accepted risk: a distributed attacker across many IPs could
   still collectively exhaust 500/day. Mitigation already in place — `lib/gemini.ts`
   cascades to checked-in fixtures on a real 429 with a customer-facing banner, so the
   app degrades rather than breaks. A global cap is a documented follow-up (§13).
4. **Refine shares the scan counter.** Cost 1, only charged when the refine call will
   actually hit Gemini (i.e. after the existing `confidence >= 0.7` short-circuit).

---

## 3. Architecture

```
Request → middleware.ts
            ├── ensures `msid` device cookie exists (mints a UUID if absent)
            ├── refreshes the Supabase auth session (@supabase/ssr)
            └── (unchanged) guards /agent/* with AGENT_CONSOLE_SECRET

POST /api/analyze  ┐
POST /api/refine   ┘→ consumeQuota({ deviceId, ip, userId })
                       ├── DEMO / disabled → allow, no DB
                       ├── picks buckets by identity (user vs device+ip)
                       └── one Postgres RPC `consume_quota(keys[], limits[])`
                             → atomic check-all-then-increment-all
                             → returns the blocking key, or null when allowed
                     on block → 429 { code: 'quota_exceeded', scope, authenticated }

/signup, /login  → client forms → /api/auth/{signup,login,logout}
                   → @supabase/ssr server client sets auth cookies
```

New persistent state: one table, `scan_usage`, keyed by `(bucket_key, usage_date)`.

**What does NOT change:** `lib/gemini.ts` cascade, pricing, the agent console,
`sessions`/`rooms`/`items`/`quotes` schema, the estimate flow. `/api/session`,
`/api/room`, `/api/item`, `/api/estimate` are **not** rate limited (no Gemini cost).

---

## 4. New environment variables

Add to the README env section and to Vercel (Production + Preview):

```bash
# --- Supabase auth (new) ---
# Supabase → Settings → API → Project API keys → "anon / publishable" key.
# NOT the service key. Server-only; do not prefix NEXT_PUBLIC_.
SUPABASE_ANON_KEY=

# --- Rate limiting (new; all optional, defaults shown) ---
RATE_LIMIT_ANON_PER_DEVICE=3
RATE_LIMIT_ANON_PER_IP=9
RATE_LIMIT_USER_PER_DAY=15
RATE_LIMIT_USER_IP_PER_DAY=40
# Random hex, used to hash IPs before storage. Generate: openssl rand -hex 16
RATE_LIMIT_IP_SALT=
# Set to 1 locally to bypass all limiting (no Vercel IP headers on localhost).
RATE_LIMIT_DISABLED=0
```

`MOVESCAN_DEMO_MODE=1` also bypasses rate limiting (it already bypasses Gemini, so no
quota is spent).

**Supabase dashboard steps (do once, document in README):**
- Authentication → Providers → **Email**: enabled, **"Confirm email" OFF**.
- Authentication → Providers → Email: **"Secure password change" / min length** — set
  minimum password length to 8.
- No redirect URL config needed (password flow, not magic link).

---

## 5. Database migration

**Create:** `db/migrations/0001_scan_usage.sql` — and also append the same statements
to `db/schema.sql` so a fresh setup gets it.

```sql
-- Per-identity daily counter for AI-call rate limiting.
create table scan_usage (
  bucket_key text not null,
  usage_date date not null,
  count      integer not null default 0,
  primary key (bucket_key, usage_date)
);

create index scan_usage_date_idx on scan_usage (usage_date);

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

**Optional housekeeping** (mention in README, do not block on it): a weekly
`delete from scan_usage where usage_date < current_date - 7;` via Supabase scheduled
job or pg_cron. Table growth is tiny; skipping it is fine for the demo.

- [ ] Run the migration in the Supabase SQL editor.
- [ ] `select consume_quota(array['device:test'], array[2]);` three times → `null`,
      `null`, `device:test`.

---

## 6. Dependencies

```bash
npm install @supabase/ssr
```

No other packages. IP parsing uses request headers directly. UUIDs use
`crypto.randomUUID()` (available in Node and the edge runtime).

---

## 7. New module: `lib/rate-limit.ts`

```ts
import 'server-only';

import { createHash } from 'node:crypto';
import { db } from './db';

export interface Identity {
  deviceId: string | null;
  ip: string | null;
  userId: string | null;
}

export interface QuotaResult {
  ok: boolean;
  blockedScope: 'device' | 'ip' | 'user' | null;
  authenticated: boolean;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function limits() {
  return {
    anonDevice: positiveInt(process.env.RATE_LIMIT_ANON_PER_DEVICE, 3),
    anonIp: positiveInt(process.env.RATE_LIMIT_ANON_PER_IP, 9),
    userDay: positiveInt(process.env.RATE_LIMIT_USER_PER_DAY, 15),
    userIp: positiveInt(process.env.RATE_LIMIT_USER_IP_PER_DAY, 40),
  };
}

/** First public IP from Vercel's forwarding headers. Null on localhost. */
export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim() || null;
  return request.headers.get('x-real-ip');
}

function hashIp(ip: string): string {
  const salt = process.env.RATE_LIMIT_IP_SALT ?? 'movescan';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

/** Parallel arrays of bucket keys, their limits, and a scope label for messaging. */
export function bucketsFor(identity: Identity): {
  keys: string[];
  limitsList: number[];
  scopes: Array<'device' | 'ip' | 'user'>;
} {
  const L = limits();
  const keys: string[] = [];
  const limitsList: number[] = [];
  const scopes: Array<'device' | 'ip' | 'user'> = [];

  if (identity.userId) {
    keys.push(`user:${identity.userId}`);
    limitsList.push(L.userDay);
    scopes.push('user');
    if (identity.ip) {
      keys.push(`ip:${hashIp(identity.ip)}`);
      limitsList.push(L.userIp);
      scopes.push('ip');
    }
  } else {
    if (identity.deviceId) {
      keys.push(`device:${identity.deviceId}`);
      limitsList.push(L.anonDevice);
      scopes.push('device');
    }
    if (identity.ip) {
      keys.push(`ip:${hashIp(identity.ip)}`);
      limitsList.push(L.anonIp);
      scopes.push('ip');
    }
  }
  return { keys, limitsList, scopes };
}

/**
 * Spend one AI-call unit for this identity. Fails OPEN on infra errors — an outage
 * degrades protection, it must not break scanning. DEMO / disabled modes never touch
 * the database.
 */
export async function consumeQuota(identity: Identity): Promise<QuotaResult> {
  const authenticated = Boolean(identity.userId);

  if (process.env.RATE_LIMIT_DISABLED === '1' || process.env.MOVESCAN_DEMO_MODE === '1') {
    return { ok: true, blockedScope: null, authenticated };
  }

  const { keys, limitsList, scopes } = bucketsFor(identity);
  if (!keys.length) return { ok: true, blockedScope: null, authenticated };

  try {
    const { data, error } = await db().rpc('consume_quota', {
      p_keys: keys,
      p_limits: limitsList,
    });
    if (error) {
      console.error('[rate-limit] consume_quota rpc failed', error);
      return { ok: true, blockedScope: null, authenticated };
    }
    if (typeof data === 'string' && data) {
      const index = keys.indexOf(data);
      return {
        ok: false,
        blockedScope: index >= 0 ? scopes[index] : 'ip',
        authenticated,
      };
    }
    return { ok: true, blockedScope: null, authenticated };
  } catch (cause) {
    console.error('[rate-limit] consume_quota threw', cause);
    return { ok: true, blockedScope: null, authenticated };
  }
}
```

**`lib/db.ts` change:** the `db()` factory is currently module-private. Export it:

```ts
// was: function db(): SupabaseClient {
export function db(): SupabaseClient {
```

(One-word change. Every existing call site is unaffected.)

---

## 8. New module: `lib/device.ts`

```ts
export const DEVICE_COOKIE = 'msid';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns the existing device id, or a freshly minted one with `mint: true`. */
export function resolveDeviceId(existing: string | undefined): { id: string; mint: boolean } {
  if (existing && UUID_RE.test(existing)) return { id: existing, mint: false };
  return { id: crypto.randomUUID(), mint: true };
}

export const deviceCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 24 * 365, // 1 year
};
```

The device id is an opaque random UUID. It is **not** signed — signing would not stop
a visitor deleting the cookie (that is what the IP cap covers), and there is no
impersonation value in guessing someone else's id.

---

## 9. Supabase auth wiring

### 9.1 `lib/supabase/server.ts` (new)

```ts
import 'server-only';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // called from a Server Component render — safe to ignore, middleware refreshes.
          }
        },
      },
    },
  );
}

/** The authenticated user, or null. Safe to call in any route handler. */
export async function getUser() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}
```

### 9.2 `lib/supabase/middleware.ts` (new) — session refresh

Standard `@supabase/ssr` pattern, adapted so the caller owns the response:

```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** Refreshes the Supabase session cookies onto `response`. Returns the user id or null. */
export async function refreshSession(
  request: NextRequest,
  response: NextResponse,
): Promise<string | null> {
  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
```

### 9.3 Auth API routes (new)

All three use `supabaseServer()` (its cookie adapter writes auth cookies onto the
route's response automatically).

**`app/api/auth/signup/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!emailPattern.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Use a password of at least 8 characters.' }, { status: 400 });
    }
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      const alreadyRegistered = /already registered/i.test(error.message);
      return NextResponse.json(
        { error: alreadyRegistered ? 'That email is already registered. Sign in instead.' : 'Unable to create your account.' },
        { status: alreadyRegistered ? 409 : 400 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unable to create your account.' }, { status: 400 });
  }
}
```

**`app/api/auth/login/route.ts`** — same shape, `signInWithPassword({ email, password })`,
returns `{ error: 'Incorrect email or password.' }` with 401 on failure.

**`app/api/auth/logout/route.ts`** — `await supabase.auth.signOut()`, return `{ ok: true }`.

### 9.4 Auth pages (new) — model on `app/agent/login/page.tsx`

**`app/signup/page.tsx`** and **`app/login/page.tsx`** — client components,
`<Suspense>`-wrapped (they read `?next=`), email + password fields, POST to the
matching route, on success `router.replace(safeNext)` where `safeNext` is the `next`
param only if it starts with `/` and not `//`, else `/`. Each page links to the other
("Already have an account? Sign in" / "Need an account? Sign up").

Keep styling consistent with the existing app (cyan/slate, `min-h-11` controls,
`rounded-xl`).

---

## 10. Middleware rewrite

**Replace `middleware.ts` entirely:**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { DEVICE_COOKIE, resolveDeviceId, deviceCookieOptions } from '@/lib/device';
import { refreshSession } from '@/lib/supabase/middleware';

const AGENT_PREFIX = '/agent';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // 1. Ensure a device cookie on every page response.
  const { id, mint } = resolveDeviceId(request.cookies.get(DEVICE_COOKIE)?.value);
  if (mint) response.cookies.set(DEVICE_COOKIE, id, deviceCookieOptions);

  // 2. Keep the Supabase session fresh (writes refreshed auth cookies onto `response`).
  await refreshSession(request, response);

  // 3. Agent console guard (unchanged behaviour).
  const { pathname } = request.nextUrl;
  if (pathname.startsWith(AGENT_PREFIX) && pathname !== '/agent/login') {
    const expectedSecret = process.env.AGENT_CONSOLE_SECRET;
    if (!expectedSecret || request.cookies.get('agent_secret')?.value !== expectedSecret) {
      const loginUrl = new URL('/agent/login', request.url);
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/',
    '/scan/:path*',
    '/review/:path*',
    '/estimate/:path*',
    '/signup',
    '/login',
    '/agent/:path*',
  ],
};
```

Notes:
- API routes are deliberately **not** in the matcher. `/api/analyze` and `/api/refine`
  resolve the device id themselves (§11) — by the time they run, page navigation has
  already set the cookie in almost every real flow, and the self-mint covers the rest.
- The agent redirect still short-circuits before returning `response`; that is fine —
  the agent area does not need the device cookie.

---

## 11. Wire limiting into the AI routes

### 11.1 `app/api/analyze/route.ts`

Switch the file from `Response.json` to `NextResponse.json` (so we can attach the
device cookie), and add the quota gate **before any Gemini work**.

At the top of `POST`, after the `multipart/form-data` check and `formData` parse, but
**before** `saveCapture` / `analyzeRoom`:

```ts
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { consumeQuota, clientIp } from '@/lib/rate-limit';
import { DEVICE_COOKIE, resolveDeviceId, deviceCookieOptions } from '@/lib/device';

// ...inside POST, after formData validation:
const cookieStore = await cookies();
const device = resolveDeviceId(cookieStore.get(DEVICE_COOKIE)?.value);
const user = await getUser();

const quota = await consumeQuota({
  deviceId: device.id,
  ip: clientIp(request),
  userId: user?.id ?? null,
});

if (!quota.ok) {
  const message = quota.authenticated
    ? "You've reached today's limit of 15 scans. It resets tomorrow."
    : "You've used your 3 free scans for today. Create a free account for 15 scans a day.";
  const res = NextResponse.json(
    { error: message, code: 'quota_exceeded', scope: quota.blockedScope, authenticated: quota.authenticated },
    { status: 429 },
  );
  if (device.mint) res.cookies.set(DEVICE_COOKIE, device.id, deviceCookieOptions);
  return res;
}
```

On the **success path**, when returning the analysis result, also set the device
cookie if it was minted:

```ts
const res = NextResponse.json({ items, roomType: result.analysis.roomType, demoMode: result.demoMode, degraded: result.degraded });
if (device.mint) res.cookies.set(DEVICE_COOKIE, device.id, deviceCookieOptions);
return res;
```

Convert the two other `Response.json(...)` returns (400/500) to `NextResponse.json`
for consistency; they do not need the cookie.

### 11.2 `app/api/refine/route.ts`

Add the gate **after** the existing short-circuit that returns early for
already-confident items — that path does not call Gemini and must stay free:

```ts
const item = await getItem(body.itemId);
if (!item) return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
if (item.confidence >= 0.7 && !item.ambiguousBetween?.length) {
  return NextResponse.json({ item, demoMode: false }); // unchanged, no charge
}

// This call WILL hit Gemini — meter it.
const cookieStore = await cookies();
const device = resolveDeviceId(cookieStore.get(DEVICE_COOKIE)?.value);
const user = await getUser();
const quota = await consumeQuota({ deviceId: device.id, ip: clientIp(request), userId: user?.id ?? null });
if (!quota.ok) {
  const message = quota.authenticated
    ? "You've reached today's limit of 15 checks. It resets tomorrow."
    : "You've used your 3 free AI checks for today. Create a free account for 15 a day.";
  const res = NextResponse.json(
    { error: message, code: 'quota_exceeded', scope: quota.blockedScope, authenticated: quota.authenticated },
    { status: 429 },
  );
  if (device.mint) res.cookies.set(DEVICE_COOKIE, device.id, deviceCookieOptions);
  return res;
}
```

Attach the minted cookie to the final success response the same way as §11.1.
Switch this file to `NextResponse.json` throughout.

---

## 12. Frontend: handle the 429

The goal is a clear "sign up for more" moment, not a raw error string.

### 12.1 Shared helper `lib/quota-error.ts` (new)

```ts
export interface QuotaError {
  code: 'quota_exceeded';
  authenticated: boolean;
  message: string;
}

export function asQuotaError(status: number, data: unknown): QuotaError | null {
  if (status !== 429 || typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  if (record.code !== 'quota_exceeded') return null;
  return {
    code: 'quota_exceeded',
    authenticated: Boolean(record.authenticated),
    message: typeof record.error === 'string' ? record.error : 'Daily limit reached.',
  };
}
```

### 12.2 `app/scan/[sessionId]/page.tsx`

In `analyse()`, where the `/api/analyze` response is handled:

```ts
const response = await fetch('/api/analyze', { method: 'POST', body: formData });
const data = await response.json() as { /* existing */ code?: string; authenticated?: boolean };

const quota = asQuotaError(response.status, data);
if (quota) {
  setQuotaBlock(quota);          // new state: useState<QuotaError | null>(null)
  return;                        // in finally, setAnalysing(false) still runs
}
if (!response.ok || !data.items || !data.roomType) throw new Error(data.error ?? 'Unable to analyse this room.');
```

Render, when `quotaBlock` is set, a card in place of / above the analyse button:

- Not authenticated:
  > **You've used your 3 free scans today.**
  > Create a free account to scan 15 rooms a day. It takes a few seconds.
  > `[ Create free account ]`  → `/signup?next=/scan/{sessionId}`
  > `Already have an account? Sign in` → `/login?next=/scan/{sessionId}`
- Authenticated:
  > **Daily limit reached (15 scans).** Your allowance resets tomorrow.

### 12.3 `app/review/[sessionId]/page.tsx`

In `refine()`, same treatment — on a quota error, set a `quotaBlock` state and render
the same card (copy: "AI checks" instead of "scans"). The item simply stays in the
"We weren't sure about these" list, which is already the correct resting state.

### 12.4 Auth status affordance (small, optional but recommended)

Add a lightweight indicator so a signed-in user knows it worked and can sign out:

- A server component in `app/layout.tsx` (or a small `<AuthBadge />`) that calls
  `getUser()` and renders either `Sign in` (link to `/login`) or the email + a
  `Sign out` button (POSTs `/api/auth/logout`, then `router.refresh()`).

Keep it out of the way — a text link in the header is enough.

---

## 13. Tests

**`lib/rate-limit.test.ts` (new)** — pure logic, mock `./db`:

- `bucketsFor` with a `userId` → `['user:<id>', 'ip:<hash>']` and limits `[15, 40]`.
- `bucketsFor` anonymous → `['device:<id>', 'ip:<hash>']` and limits `[3, 9]`.
- `bucketsFor` anonymous with no IP (localhost) → just `['device:<id>']`.
- Env overrides (`RATE_LIMIT_ANON_PER_DEVICE=5`) are respected.
- `consumeQuota` returns `ok: true` without calling the db when
  `RATE_LIMIT_DISABLED=1` or `MOVESCAN_DEMO_MODE=1`.
- `consumeQuota` maps an RPC return of `'device:x'` → `{ ok: false, blockedScope: 'device' }`.
- `consumeQuota` maps an RPC `error` → `{ ok: true }` (fail-open) and logs.
- `clientIp` parses `x-forwarded-for: 1.2.3.4, 5.6.7.8` → `1.2.3.4`; falls back to
  `x-real-ip`; returns `null` when neither is present.

**`lib/device.test.ts` (new):**

- `resolveDeviceId(undefined)` → `{ mint: true }` and a valid UUID.
- `resolveDeviceId('<valid uuid>')` → `{ mint: false, id: <same> }`.
- `resolveDeviceId('garbage')` → `{ mint: true }`.

Route-handler and Supabase-auth integration are verified manually in §14 (they need a
live Supabase project).

---

## 14. Manual verification

Run with `RATE_LIMIT_DISABLED=0` and real Supabase creds, `MOVESCAN_DEMO_MODE=0`
(a valid `GEMINI_API_KEY` is *not* required — the cascade will serve fixtures, and the
quota is still consumed and enforced because `consumeQuota` runs before the Gemini
call).

- [ ] **Anon device cap.** Fresh browser. Scan 3 rooms → all work. 4th → 429 card,
      "Create a free account". `select * from scan_usage` shows `device:… = 3` and
      `ip:… = 3`.
- [ ] **Cookie clear still capped by IP.** Delete the `msid` cookie, scan again.
      Works until `ip:…` reaches 9, then blocked regardless of the fresh device id.
- [ ] **Signup lifts the limit.** From the 429 card, create an account. Redirected
      back to the scan. Scan again → works. `scan_usage` now increments `user:<id>`
      (and `ip:…`), not `device:…`.
- [ ] **Login persists.** Reload the page — still signed in (session cookie). Header
      shows the email.
- [ ] **User cap.** With `RATE_LIMIT_USER_PER_DAY=2` in `.env.local`, confirm the
      3rd scan for a signed-in user is blocked with the "resets tomorrow" copy.
- [ ] **Refine is metered and short-circuit is free.** Set the caps low. A "Check
      this" on a low-confidence item consumes a unit; once an item is confident,
      pressing anything that would re-refine it does not (route returns early).
- [ ] **Refine block is graceful.** When blocked, the item stays under "We weren't
      sure about these" and no error toast dead-ends the flow.
- [ ] **Demo mode bypass.** `MOVESCAN_DEMO_MODE=1` → unlimited scans, `scan_usage`
      untouched.
- [ ] **Agent console unaffected.** `/agent` still redirects to `/agent/login` and
      works after entering `AGENT_CONSOLE_SECRET`.
- [ ] **Reset.** `delete from scan_usage;` (or wait for UTC midnight) restores limits.

---

## 15. Task breakdown (implementation order)

Each task ends with the gate: **`npx tsc --noEmit && npx vitest run && npx next build --turbopack`** must pass.

| # | Task | Files | Gate |
|---|---|---|---|
| 1 | DB migration + `db()` export | `db/migrations/0001_scan_usage.sql`, `db/schema.sql`, `lib/db.ts` | migration runs; `consume_quota` smoke test (§5) |
| 2 | `lib/device.ts` + `lib/device.test.ts` | new | gate + new tests pass |
| 3 | `lib/rate-limit.ts` + `lib/rate-limit.test.ts` | new | gate + new tests pass |
| 4 | `npm i @supabase/ssr`; `lib/supabase/server.ts`, `lib/supabase/middleware.ts` | new | gate |
| 5 | Auth routes: `app/api/auth/{signup,login,logout}/route.ts` | new | gate; manual signup via curl sets `sb-*` cookies |
| 6 | Auth pages: `app/signup/page.tsx`, `app/login/page.tsx` | new | gate; pages render |
| 7 | Rewrite `middleware.ts` | `middleware.ts` | gate; `/agent` still guarded; `msid` cookie appears on `/` |
| 8 | Gate `POST /api/analyze` | `app/api/analyze/route.ts` | gate; §14 anon-device + signup checks |
| 9 | Gate `POST /api/refine` | `app/api/refine/route.ts` | gate; §14 refine checks |
| 10 | Frontend: `lib/quota-error.ts`, scan page, review page | `lib/quota-error.ts`, `app/scan/[sessionId]/page.tsx`, `app/review/[sessionId]/page.tsx` | gate; 429 card shows, links work |
| 11 | `<AuthBadge />` in layout (optional) | `app/layout.tsx`, new component | gate |
| 12 | Docs: README env table, Supabase dashboard steps, deployment plan env additions | `README.md`, `docs/superpowers/plans/2026-09-01-deployment-plan.md` | — |

Commit after each task with a focused message.

---

## 16. Edge cases & follow-ups (not v1 scope)

- **Global daily cap.** Add a `global:all` bucket to `bucketsFor` (always appended,
  limit ~450). On block with `scope === 'global'`, `/api/analyze` should skip Gemini
  and return the fixture path (`demoMode: true, degraded: true`) rather than a 429, so
  the app stays usable. ~15 lines. This is the strongest protection for the stated
  goal and is only omitted because it was explicitly deprioritised.
- **Burst / per-minute limit.** Gemini also caps requests-per-minute. A short-window
  bucket (`device:<id>:<yyyymmddhhmm>`, limit ~4) would protect RPM. Cheap to add to
  the same RPC call.
- **Email confirmation.** Turning it on in Supabase materially raises the bar against
  scripted signups, at the cost of a mobile round-trip. Revisit if account-farming is
  observed in `scan_usage` (many `user:*` rows sharing one `ip:*`).
- **`sessions.device_id` / `sessions.user_id` columns.** Would let a signed-in user
  see their scan history and let support trace abuse. Additive migration; no behaviour
  change needed for limiting.
- **`scan_usage` retention job.** pg_cron weekly delete of rows older than 7 days.
- **IPv6.** `hashIp` treats the full address as the key; a `/64`-prefix normalisation
  would be more correct for IPv6 ISPs but is not worth it at this scale.
- **CGNAT / shared IPs.** Mobile carriers and large offices share one IPv4. The
  per-IP cap of 9 (anon) is a deliberate compromise; raise `RATE_LIMIT_ANON_PER_IP`
  if real users on shared networks hit it before the device cap.
