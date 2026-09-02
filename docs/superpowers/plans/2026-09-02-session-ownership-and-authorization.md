# Session Ownership & Authorization

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give scan sessions an owner, and stop nine API routes from mutating and reading customer data on nothing more than a well-formed UUID.

**Architecture:** Two additive columns on `sessions` (`user_id`, `device_id`), populated at creation from the identities that already exist. One guard — `assertSessionAccess` — resolves the caller and is called by every route that touches session-scoped data, resolving upward from item → room → session where needed. No RLS: every query runs through the service key, so the guard must live in the application layer.

**Tech Stack:** unchanged. Next.js 15 App Router, Supabase, Vitest. **No new dependencies.**

**Inputs:**
- `feedback/review/2026-09-02-auth-and-quota-review.md` — the findings this closes
- `docs/superpowers/plans/2026-09-02-scan-rate-limiting-and-auth.md` — §16 deferred these columns

### Why this exists, given §16 already mentioned it

The rate-limiting plan deferred `sessions.device_id` / `sessions.user_id` deliberately,
describing them as *"would let a signed-in user see their scan history and let support
trace abuse. Additive migration; no behaviour change needed for limiting."*

That reasoning is correct **about limiting** and is why the deferral was sound at the time.
What it does not account for is that these columns are also the only thing that could
carry **authorization**. Without them, nine routes authorize on UUID shape alone, and
`GET /api/session/[sessionId]` hands out every item id in a session plus the customer's
email address to anyone holding the session URL. An edited item changes `cubic_feet`,
which changes a priced quote a human agent then confirms — so this is not a read-only
exposure.

This plan therefore promotes one §16 bullet from *feature* to *control*. The other §16
items (global daily cap, burst limit, retention job, IPv6 prefixing) stay deferred.

## Global Constraints

- **Verification gate:** `npx tsc --noEmit && npx vitest run && npx next build --turbopack` before any task is complete.
- **Commit as the repo identity.** No `-c user.email=…` — Vercel blocks unrecognised authors and the build will not run.
- **RLS is not the mechanism.** `lib/db.ts` builds its client with `SUPABASE_SERVICE_KEY`, which bypasses RLS by design. Do **not** add RLS policies and treat the problem as solved — they would have no effect on these routes while creating the impression that access is controlled.
- **Denial returns 404, never 403.** A 403 confirms the id exists. Every ownership failure is indistinguishable from a missing record.
- **Anonymous scanning must keep working.** The landing page still promises "No signup. No credit card. Just photos." A scan with no signed-in user is owned by its device and must complete end to end unchanged.
- **The agent console is exempt.** It authenticates separately and legitimately reads every session. `assertSessionAccess` is for customer routes only.
- **Additive migration.** Existing rows get `null` owners; Task 3 defines how they behave.

---

## Task 1: Set the IP hash salt

**Files:** Modify `lib/rate-limit.ts`, `.env.local`, `README.md`

Two minutes, and it makes the existing IP hashing mean something.

`lib/rate-limit.ts` currently reads:

```ts
const salt = process.env.RATE_LIMIT_IP_SALT ?? 'movescan';
```

The rate-limiting plan did list `RATE_LIMIT_IP_SALT` as an environment variable, so the
intent was right — but the fallback means an unset variable degrades silently. The whole
IPv4 space is ~4.3 billion addresses, so against a known salt every `bucket_key` is
reversible by brute force and the hashing provides close to no privacy.

- [ ] **Step 1: Fail loudly instead of defaulting**

```ts
function ipSalt(): string {
  const salt = process.env.RATE_LIMIT_IP_SALT;
  if (!salt || salt.length < 16) {
    throw new Error(
      'RATE_LIMIT_IP_SALT must be set to at least 16 characters. ' +
      'Generate one with: openssl rand -hex 16',
    );
  }
  return salt;
}
```

A security default that silently degrades is worse than one that refuses to start — the
degraded state looks identical to the working state.

- [ ] **Step 2: Set it locally and in Vercel**

```bash
openssl rand -hex 16
```

Add to `.env.local` and to the Vercel project's environment variables for Production and
Preview. **Changing the salt invalidates existing `scan_usage` rows** — every hashed key
changes — which resets today's IP counters once. Harmless, but do it knowingly.

- [ ] **Step 3: Document it in `README.md`** alongside the other variables, noting that it
      is required rather than optional.

- [ ] **Step 4: Gate and commit**

---

## Task 2: Ownership columns

**Files:** Create `db/migrations/0002_session_ownership.sql`; modify `lib/db.ts`, `lib/types.ts`, `app/api/session/route.ts`

- [ ] **Step 1: Write the migration**

```sql
-- Scan sessions gain an owner so authorization has something to check.
-- Both nullable: existing rows predate ownership, and device_id is absent for
-- sessions created by server-side scripts (the demo seeders).
alter table sessions add column user_id   uuid;
alter table sessions add column device_id text;

create index sessions_user_id_idx   on sessions (user_id)   where user_id is not null;
create index sessions_device_id_idx on sessions (device_id) where device_id is not null;
```

Partial indexes because the overwhelming majority of lookups are for a non-null owner.

- [ ] **Step 2: Extend the type**

```ts
export interface SessionDetails {
  id: string;
  customerEmail?: string;
  status: SessionStatus;
  rooms: Room[];
  latestQuote?: Quote;
  /** Owning account, when the scan was started signed in. */
  userId?: string;
  /** Owning device — always set for browser-created sessions. */
  deviceId?: string;
}
```

- [ ] **Step 3: Accept an owner at creation**

`createSession()` in `lib/db.ts` currently takes no arguments. Change to:

```ts
export async function createSession(
  owner: { userId?: string | null; deviceId?: string | null } = {},
): Promise<string> {
```

...inserting `user_id` and `device_id` when present. Keep the parameter optional and
defaulted so the two seed scripts, which have no request context, continue to work
unchanged and produce unowned sessions.

- [ ] **Step 4: Populate it in the route**

`app/api/session/route.ts` currently calls `createSession()` with nothing. It must resolve
both identities — the same two the rate limiter already uses — and pass them:

```ts
import { cookies } from 'next/headers';
import { DEVICE_COOKIE, resolveDeviceId, deviceCookieOptions } from '@/lib/device';
import { getUser } from '@/lib/supabase/server';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const device = resolveDeviceId(cookieStore.get(DEVICE_COOKIE)?.value);
    const user = await getUser();

    const sessionId = await createSession({ userId: user?.id ?? null, deviceId: device.id });

    const res = Response.json({ sessionId }, { status: 201 });
    // Mint the device cookie here too: a session must never be created with a device id
    // the browser is not also holding, or it becomes immediately inaccessible.
    if (device.mint) {
      return new Response(res.body, {
        status: 201,
        headers: { ...Object.fromEntries(res.headers), 'set-cookie': serializeDeviceCookie(device.id) },
      });
    }
    return res;
  } catch (error) {
    console.error('POST /api/session failed', error);
    return Response.json({ error: 'Unable to create a scan session.' }, { status: 500 });
  }
}
```

Use whichever cookie-setting form matches the pattern already used in
`app/api/analyze/route.ts` — it does this correctly with `NextResponse`, so copy that
rather than hand-rolling a `set-cookie` header.

**The comment above is the important part.** If the session records a freshly-minted
device id but the response fails to set the cookie, the user is locked out of the scan
they just started. Test that path explicitly.

- [ ] **Step 5: Apply the migration and verify**

Run `db/migrations/0002_session_ownership.sql` in the Supabase SQL editor. Create a scan
anonymously and confirm `device_id` is populated and `user_id` is null; sign in, create
another, and confirm both are set.

- [ ] **Step 6: Gate and commit**

---

## Task 3: The access guard

**Files:** Create `lib/session-access.ts`, `lib/session-access.test.ts`; modify `lib/db.ts`

**Interfaces produced:**
- `resolveCaller(): Promise<{ userId: string | null; deviceId: string | null }>`
- `canAccessSession(session, caller): boolean` — **pure, unit-tested**
- `assertSessionAccess(sessionId): Promise<SessionOwner>` — throws `AccessDeniedError`
- `getSessionOwner(sessionId)` and `getSessionOwnerForItem(itemId)` / `...ForRoom(roomId)` in `lib/db.ts`

### The ownership rule

| Session owner | Caller | Access |
|---|---|---|
| `user_id` set | same `user_id` | allow |
| `user_id` set | different or no user | **deny** |
| `user_id` null, `device_id` set | same `device_id` | allow |
| `user_id` null, `device_id` set | different device | **deny** |
| both null (legacy / seeded rows) | anyone | allow — see below |

**Legacy rows are allowed deliberately.** Every session created before this migration has
no owner, and denying them would break links already sent to customers and every demo
session already seeded. That is a conscious, temporary widening, not an oversight —
record it in the code comment, and note that it can be tightened once the pre-migration
rows have aged out.

- [ ] **Step 1: Write the failing tests for the pure predicate**

```ts
import { describe, it, expect } from 'vitest';
import { canAccessSession } from './session-access';

const USER = 'user-1';
const DEVICE = 'device-1';

describe('canAccessSession', () => {
  it('allows the owning account', () => {
    expect(canAccessSession({ userId: USER, deviceId: DEVICE }, { userId: USER, deviceId: null })).toBe(true);
  });

  it('denies a different account even from the owning device', () => {
    expect(canAccessSession({ userId: USER, deviceId: DEVICE }, { userId: 'user-2', deviceId: DEVICE })).toBe(false);
  });

  it('denies an anonymous caller when the session belongs to an account', () => {
    expect(canAccessSession({ userId: USER, deviceId: DEVICE }, { userId: null, deviceId: DEVICE })).toBe(false);
  });

  it('allows the owning device for an anonymous session', () => {
    expect(canAccessSession({ userId: null, deviceId: DEVICE }, { userId: null, deviceId: DEVICE })).toBe(true);
  });

  it('denies a different device for an anonymous session', () => {
    expect(canAccessSession({ userId: null, deviceId: DEVICE }, { userId: null, deviceId: 'device-2' })).toBe(false);
  });

  it('allows unowned legacy rows', () => {
    expect(canAccessSession({ userId: null, deviceId: null }, { userId: null, deviceId: 'anything' })).toBe(true);
  });

  it('denies a caller with no identity at all against an owned session', () => {
    expect(canAccessSession({ userId: null, deviceId: DEVICE }, { userId: null, deviceId: null })).toBe(false);
  });

  it('does not treat an empty-string identity as a match', () => {
    expect(canAccessSession({ userId: null, deviceId: '' }, { userId: null, deviceId: '' })).toBe(false);
  });
});
```

The last two matter most: a caller with no identity, and empty-string equality, are the
two ways a naive `===` check accidentally grants access to everyone.

- [ ] **Step 2: Run to confirm failure**, then implement `lib/session-access.ts`

```ts
import 'server-only';
import { cookies } from 'next/headers';
import { DEVICE_COOKIE, resolveDeviceId } from '@/lib/device';
import { getUser } from '@/lib/supabase/server';

export interface SessionOwner { userId: string | null; deviceId: string | null }
export interface Caller { userId: string | null; deviceId: string | null }

export class AccessDeniedError extends Error {}

const present = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.length > 0;

/**
 * Pure ownership predicate. An account-owned session is account-only; an anonymous
 * session belongs to its device. Sessions predating the ownership migration have no
 * owner and stay open — links already sent to customers must keep working.
 */
export function canAccessSession(owner: SessionOwner, caller: Caller): boolean {
  if (present(owner.userId)) return caller.userId === owner.userId;
  if (present(owner.deviceId)) return present(caller.deviceId) && caller.deviceId === owner.deviceId;
  return true; // legacy / seeded: unowned
}

export async function resolveCaller(): Promise<Caller> {
  const cookieStore = await cookies();
  // Do NOT mint here — reading must never create identity. An absent cookie means
  // "no device", not "a brand new device that happens to own nothing".
  const raw = cookieStore.get(DEVICE_COOKIE)?.value;
  const deviceId = raw && resolveDeviceId(raw).mint === false ? raw : null;
  const user = await getUser();
  return { userId: user?.id ?? null, deviceId };
}
```

The no-minting note is load-bearing: `resolveDeviceId` mints a fresh UUID when the cookie
is missing or malformed. Using that value as the caller identity would compare a
newly-invented id against stored ids — always false, which is safe — but it would also set
a cookie during a read, which is surprising. Read paths resolve identity; they do not
create it.

- [ ] **Step 3: Add the owner lookups to `lib/db.ts`**

```ts
export async function getSessionOwner(sessionId: string): Promise<SessionOwner | null>
export async function getSessionOwnerForRoom(roomId: string): Promise<SessionOwner | null>
export async function getSessionOwnerForItem(itemId: string): Promise<SessionOwner | null>
```

Each selects only `user_id, device_id` — joining upward for the room and item variants —
so the guard costs one narrow query rather than loading the whole session.

- [ ] **Step 4: Add `assertSessionAccess`**

Resolves the caller, loads the owner, and throws `AccessDeniedError` when
`canAccessSession` is false **or the session does not exist**. Collapsing both into one
error is what makes the 404 response indistinguishable.

- [ ] **Step 5: Gate and commit**

---

## Task 4: Apply the guard to every customer route

**Files:** Modify `app/api/session/[sessionId]/route.ts`, `app/api/room/route.ts`, `app/api/room/[roomId]/route.ts`, `app/api/item/route.ts`, `app/api/item/[itemId]/route.ts`, `app/api/analyze/route.ts`, `app/api/refine/route.ts`, `app/api/estimate/route.ts`, `app/api/quote/[quoteId]/route.ts`

Nine routes. **Do the two item routes first** — they are the ones that can change a price.

| Route | Resolve ownership via |
|---|---|
| `GET /api/session/[sessionId]` | `sessionId` |
| `POST /api/room` | `body.sessionId` |
| `PATCH /api/room/[roomId]` | `roomId` → session |
| `POST /api/item` | `body.roomId` → session |
| `PATCH`/`DELETE /api/item/[itemId]` | `itemId` → room → session |
| `POST /api/analyze` | `body.roomId` → session |
| `POST /api/refine` | `body.itemId` → room → session |
| `POST /api/estimate` | `body.sessionId` |
| `GET /api/quote/[quoteId]` | `quoteId` → session |

- [ ] **Step 1: Establish the pattern on `PATCH /api/item/[itemId]`**

```ts
if (!isUuid(itemId)) return Response.json({ error: 'Invalid item ID.' }, { status: 400 });

try {
  await assertSessionAccess(await getSessionOwnerForItem(itemId));
} catch {
  // Ownership failure and "does not exist" return the same response on purpose:
  // a 403 would confirm the id is real.
  return Response.json({ error: 'Item not found.' }, { status: 404 });
}
```

Order matters: validate shape, then authorize, **then** do any work. In particular
authorize *before* `saveCapture` in `/api/analyze` and before the quota spend, so an
unauthorized caller neither writes files nor burns someone's quota.

- [ ] **Step 2: Apply to the remaining eight**

- [ ] **Step 3: Stop leaking `customerEmail` unguarded**

`GET /api/session/[sessionId]` returns the whole session including `customerEmail`. With
the guard in place the route is authorized, so the field is no longer exposed to arbitrary
callers — but return it only when the caller is the owning **account**, not merely the
owning device. A shared device should not surface someone else's email address.

- [ ] **Step 4: Verify every path by hand**

For each route, three checks: the owner succeeds; a different device gets 404; a
non-existent id gets 404 and is byte-identical to the previous response. Run the
anonymous happy path end to end — landing → scan → review → estimate — and confirm no
regression. Then repeat signed in.

Then the adversarial check, which is the actual point of this task: take a session URL
from browser A, extract an item id from `GET /api/session/[sessionId]`, and attempt
`PATCH /api/item/[itemId]` from browser B. It must 404. Before this task it succeeds.

- [ ] **Step 5: Gate and commit**

---

## Task 5: Claim anonymous scans on sign-in

**Files:** Modify `app/api/auth/login/route.ts`, `app/api/auth/signup/route.ts`; add `claimDeviceSessions` to `lib/db.ts`

Without this, a customer who scans anonymously and *then* creates an account loses the
scan the moment they sign in on another device — and the account still shows no history.
It is also the cleanest answer to the parked "return access" problem.

- [ ] **Step 1: Add the claim function**

```ts
/**
 * Attach this device's unowned scans to the account that just signed in.
 * Scoped to `user_id is null` so a claim can never take a session from another account.
 */
export async function claimDeviceSessions(deviceId: string, userId: string): Promise<number>
```

The `user_id is null` predicate is the whole safety property. Without it, signing in on a
shared device would transfer someone else's scans.

- [ ] **Step 2: Call it after a successful login and signup**

Resolve the device cookie, call the claim, and log the count. A failure to claim must
**not** fail the sign-in — wrap it and log.

- [ ] **Step 3: Verify**

Scan anonymously, sign up, confirm the scan is now owned by the account and still opens.
Then on a second device sign in and confirm the scan is reachable there too. Finally,
confirm a session already owned by another account is never claimed.

- [ ] **Step 4: Gate and commit**

---

## Task 6: Two decisions to record, not code

- [ ] **Step 1: Verify Supabase project settings and write them down**

None of these live in the repo, and all bear on the review's findings:
- Is **email confirmation** required? It determines how cheap a fresh `user:` quota bucket
  is — and signing in raises the daily AI allowance from 3/device to 15.
- What are Supabase's **own auth rate limits** for this project? I did not verify them,
  and the app adds no signup limit of its own.
- What are the **session and refresh-token TTLs**?

Record the answers in `README.md`. An unwritten dashboard setting is a setting nobody can
review.

- [ ] **Step 2: Decide on user enumeration, explicitly**

`app/api/auth/signup/route.ts` returns 409 with *"That email is already registered."* That
is good UX and also confirms to an attacker which addresses hold accounts.

Either keep it and record the decision as deliberate, or return an identical response
either way — which needs transactional email to tell the real owner, and that was
deliberately cut. **Keeping it is defensible**; leaving it undecided is not.

---

## Recommended order

| Order | Task | Effort |
|---|---|---|
| 1 | Task 1 — IP salt | 15m |
| 2 | Task 2 — ownership columns | 1–1.5h |
| 3 | Task 3 — the guard | 1.5–2h |
| 4 | Task 4 — apply to nine routes | 2–3h |
| 5 | Task 5 — claim on sign-in | 1–1.5h |
| 6 | Task 6 — record decisions | 30m |

Roughly **7–9 hours**. Tasks 1–4 close the findings; Task 5 turns the columns into the
customer-visible benefit that justified them in the first place.

## Out of scope

- RLS policies — see the constraint above; they would not apply.
- The other §16 deferrals: global daily cap, burst limit, `scan_usage` retention, IPv6
  prefix normalisation.
- The agent console session, which has its own plan.
- Anything in the theming or demo-data plans.

## Proportionality

For a hackathon demo this is unlikely to be exploited — session ids are v4 UUIDs and
nobody is attacking an unknown deployment. Task 1 is fifteen minutes. Tasks 2–4 are worth
doing mainly because the app now has accounts, and "we added accounts" invites the
question of whether accounts protect anything. Today the honest answer is that they
protect the quota and nothing else.
