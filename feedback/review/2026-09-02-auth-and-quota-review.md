# Review — Supabase Auth, Device Identity & Quota Enforcement

**Date:** 2026-09-02
**Scope:** the authentication and rate-limiting work added outside any written plan —
`app/api/auth/*`, `lib/supabase/*`, `lib/device.ts`, `lib/rate-limit.ts`,
`db/migrations/0001_scan_usage.sql`, and the middleware changes.
**Method:** static read of the current tree. 107 tests passing, typecheck clean.

---

## Verdict

The quota work is **well built** and closes both parked abuse findings, including the
second AI entry point I flagged. The auth work is wired correctly as authentication.

But **there is no authorization anywhere on customer data.** Sign-in and the device
cookie feed the rate limiter and nothing else, `sessions` has no owner column, and the
item mutation endpoints check only that a UUID is well-formed. A signed-in user's scans
are not associated with their account, and anyone holding an item id can edit a stranger's
quote.

| Severity | Finding |
|---|---|
| **High** | Item mutations have no authorization — IDOR |
| **High** | No ownership model; auth is unused for access control |
| Medium | `RATE_LIMIT_IP_SALT` defaults to a known value |
| Medium | Signup discloses whether an email is registered |
| Low | Signing up *raises* your AI quota; no app-level signup limit |
| Low | `clientIp` trusts the first `x-forwarded-for` entry |

---

## What is done well

**`consume_quota` is genuinely good.** Two-phase: it locks every bucket row with
`for update` before checking, then only spends when all buckets have headroom. That makes
it atomic and all-or-nothing under concurrency, which is the part these implementations
usually get wrong. Returning the first blocked key rather than a boolean also lets the
caller report *which* limit was hit.

**Quota covers both AI routes.** `/api/analyze` and `/api/refine` both enforce it. `/refine`
was the second uncapped Gemini entry point in the parked findings, and it is closed.

**Layered, tunable buckets.** Device, IP and user scopes with env overrides and sensible
defaults — anonymous 3/device and 9/IP, signed-in 15/day and 40/IP. The IP tier is the
real backstop, which is the correct shape given a device cookie is client-controlled.

**IPs are hashed before storage** rather than kept raw. Right instinct — see the salt
finding below.

**Auth uses the SSR cookie pattern properly**, with `refreshSession` in middleware so
tokens refresh on navigation.

---

## High — Item mutations have no authorization (IDOR)

`app/api/item/[itemId]/route.ts` and `app/api/item/route.ts` validate only UUID **format**:

```ts
if (!isUuid(itemId)) return Response.json({ error: 'Invalid item ID.' }, { status: 400 });
```

There is no user check, no device check, and no session-ownership check on `PATCH`,
`DELETE` or `POST`. The same is true of `/api/room`, `/api/room/[roomId]`,
`/api/estimate`, `/api/quote/[quoteId]` and `/api/session/[sessionId]`.

**The chain is short.** `GET /api/session/[sessionId]` returns the entire session with no
authorization — and that payload contains every item id **and `customerEmail`**. So one
session URL yields the ids needed to mutate every item in it, plus the customer's email
address.

**Why it matters beyond privacy:** an edited item changes `cubic_feet`, which changes the
priced quote a human agent then confirms. This is not a read-only exposure; it can alter a
number the business acts on.

**What limits it today:** session ids are v4 UUIDs, so an attacker needs the URL rather
than being able to enumerate. That makes it a capability-URL design, which was acceptable
while everything was anonymous. It stops being acceptable now that accounts exist, because
a user who signs in reasonably expects their scans to be private *to their account* — and
session URLs travel: emailed, pasted, in browser history, in the print/PDF output.

---

## High — No ownership model; the auth is not used for access control

`sessions` has exactly four columns:

```sql
create table sessions (
  id uuid primary key default gen_random_uuid(),
  customer_email text,
  status text not null default 'scanning' check (...),
  created_at timestamptz not null default now()
);
```

No `user_id`. No `device_id`. Tracing both identities confirms they are used **only** for
rate limiting: `resolveDeviceId` appears in `middleware.ts` (mint the cookie) and in the
two AI routes (bucket keys); `getUser()` appears in the same two AI routes and in
`lib/supabase/*`. Neither is consulted anywhere that reads or writes scan data.

Consequences:
- A signed-in customer cannot list their own scans — there is nothing linking them.
- Signing in confers no privacy benefit, so the account is currently only a quota tier.
- The "return access" problem the accounts presumably address is only half-solved: the
  identity exists but nothing is attached to it.

**Row Level Security will not fix this.** `lib/db.ts:29-33` builds the client with
`SUPABASE_SERVICE_KEY`, which bypasses RLS by design. Every read and write in the app goes
through it. Adding RLS policies would have **no effect** on these routes while leaving the
impression that access is controlled. Authorization has to live in the application layer,
in the route handlers.

### Suggested shape

1. **Add ownership columns**

```sql
alter table sessions add column user_id uuid;      -- null for anonymous scans
alter table sessions add column device_id text;    -- always set at creation
create index sessions_user_id_idx   on sessions (user_id);
create index sessions_device_id_idx on sessions (device_id);
```

2. **Populate at creation.** `POST /api/session` reads `getUser()` and the device cookie
   and stores both. An anonymous scan is owned by its device; signing in later can claim
   it by setting `user_id` where `device_id` matches and `user_id is null`. That is also
   the cleanest answer to cross-device return access.

3. **One guard, used everywhere.** A single `assertSessionAccess(sessionId)` helper that
   resolves the caller's identity and returns 404 (not 403 — do not confirm the id exists)
   when neither the user nor the device owns the session. Item and room routes resolve
   upward — item → room → session — then call it.

4. **Do not leak `customerEmail`** from `GET /api/session/[sessionId]` until that guard is
   in place. It is the one field in that payload with value to an attacker.

---

## Medium — `RATE_LIMIT_IP_SALT` defaults to a known value

`lib/rate-limit.ts:38-40`:

```ts
const salt = process.env.RATE_LIMIT_IP_SALT ?? 'movescan';
```

Hashing IPs is the right instinct, but the entire IPv4 space is ~4.3 billion addresses —
trivially enumerable against a known salt. With the default in place, `bucket_key` values
are effectively reversible, so the privacy benefit is close to zero.

**Fix:** set `RATE_LIMIT_IP_SALT` to a random value in `.env.local` and in Vercel, and
make the code fail loudly rather than silently defaulting — a security default that
silently degrades is worse than one that refuses to start.

---

## Medium — Signup discloses whether an email is registered

`app/api/auth/signup/route.ts` returns `409` with *"That email is already registered.
Sign in instead."* That is a clean UX affordance and also a user-enumeration oracle: an
attacker can probe which addresses hold accounts.

This is a genuine trade-off rather than a straightforward bug, and plenty of products
accept it deliberately. Flagging it so the choice is explicit. The privacy-preserving
alternative is an identical response either way plus an email that says "you already have
an account" — which needs working transactional email, and that was deliberately cut.

---

## Low — Signing up raises your quota, and signup is uncapped

Defaults from `lib/rate-limit.ts`:

| Identity | Per-day limit | Per-IP limit |
|---|---|---|
| Anonymous | 3 per device | 9 |
| Signed in | 15 | 40 |

So creating an account **increases** available AI calls roughly fivefold, and there is no
app-level rate limit on `POST /api/auth/signup`. Supabase applies its own auth rate limits
— I have **not** verified what they are for this project, and that should be checked
rather than assumed.

The practical ceiling is the signed-in IP bucket at 40/day, which is a reasonable backstop.
Worth being deliberate about it: the IP tier is doing the real work, so that is the number
to tune, and whether Supabase requires email confirmation before a session is issued
directly affects how cheap a fresh `user:` bucket is.

---

## Low — `clientIp` trusts the first `x-forwarded-for` entry

`lib/rate-limit.ts:33-36` takes the leftmost value. On Vercel that header is
platform-controlled and this is correct. Behind any other proxy — or if the app is ever
self-hosted — a client could spoof it and mint unlimited IP buckets. Worth a comment in
the code recording the assumption, so it is not silently carried into a different
deployment.

---

## Not reviewed

- **Live behaviour.** This is a static read; I have not exercised the auth flows or
  attempted the IDOR against the deployment.
- **Supabase project settings** — email confirmation, auth rate limits, session TTLs. All
  live in the dashboard, none in the repo, all material to the findings above.
- **Whether `/login` and `/signup` pages handle errors well.** Not a security question.
- The agent console's shared-password session, which has its own plan
  (`2026-09-02-app-wide-theme-and-agent-session.md`).

## Suggested order

1. `RATE_LIMIT_IP_SALT` in env — two minutes, and it makes the existing hashing mean something.
2. Ownership columns plus `assertSessionAccess`, applied to the item and room mutation
   routes first, since those are the ones that can change a price.
3. Stop returning `customerEmail` unguarded.
4. Decide consciously on the enumeration trade-off and record the decision.
5. Verify Supabase's own auth rate limits and email-confirmation setting.

For a hackathon demo none of this is likely to be exploited — the URLs are unguessable and
nobody is attacking an unknown deployment. But items 1 and 2 are small, and "we added
accounts" invites exactly the question of whether accounts protect anything. Right now the
honest answer is that they do not.
