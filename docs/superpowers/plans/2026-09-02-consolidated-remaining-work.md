# Consolidated Remaining Work — Blocker, App-wide Theme, Agent Session, Authorization

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**This is the single hand-off file.** It merges everything still outstanding:

- one functional blocker found on the dev server (Task 1)
- `2026-09-02-app-wide-theme-and-agent-session.md` — never implemented (Tasks 3–4)
- `2026-09-02-session-ownership-and-authorization.md` — never implemented (Tasks 2, 5–9)

Those two source plans stay in the repo and carry longer code listings. Where a task says
*"full listing in <plan>"*, read it there rather than improvising. Everything needed to
decide *what* to build is in this file.

**Goal:** Fix the mobile blocker, make the theme switch work across the whole app, give the
agent console a session that actually expires, and stop nine customer routes authorizing on
UUID shape alone.

**State at time of writing:** `f26e544`, in sync with `origin/main`, working tree clean,
113 tests passing, production build succeeds. Seven of nine prior plans are implemented.

---

## Global Constraints

- **Verification gate:** `npx tsc --noEmit && npx vitest run && npx next build --turbopack` must all pass before a task is complete. `npm test` alone does not typecheck.
- **Commit as the repo identity.** Pass **no** `-c user.email=…`. Vercel blocks deployments whose head commit has an unrecognised author — a commit authored as anything other than `a.moiz28864@gmail.com` will not deploy, and the build never starts.
- **The next migration number is `0004`.** `0001_scan_usage`, `0002_item_box` and `0003_leads_summary_view` exist. The ownership migration was planned as `0002` and must be renumbered.
- **RLS is not the mechanism for Tasks 5–7.** `lib/db.ts` builds its client with `SUPABASE_SERVICE_KEY`, which bypasses RLS by design, and every app query goes through it. Adding RLS policies would have **no effect** while creating the impression access is controlled. Authorization lives in the route handlers.
- **Denial returns 404, never 403.** A 403 confirms the id exists. Ownership failure and "not found" must be byte-identical responses.
- **Anonymous scanning must keep working.** The landing page still promises "No credit card. Just photos." A scan with no signed-in user is owned by its device and must complete end to end.
- **The agent console is exempt from customer authorization.** It authenticates separately and legitimately reads every session.
- **Money is integer cents; volume is cubic feet** to one decimal.

---

## Task 1: Fix the AuthBadge collision — BLOCKER, do this first

**Files:** Modify `components/AuthBadge.tsx`, `app/layout.tsx`, `app/page.tsx`, `app/scan/[sessionId]/page.tsx`, `app/review/[sessionId]/page.tsx`, `app/estimate/[sessionId]/page.tsx`; create `components/AppHeader.tsx`

`components/AuthBadge.tsx` is `fixed right-4 top-4 z-50` and mounted globally in
`app/layout.tsx`, so it floats above whatever any page puts in its top-right corner.

**This is not cosmetic.** Measured live at 375×812 on `/estimate/[sessionId]`:

```
Edit inventory link : left 266  right 359  top 28  bottom 48
AuthBadge           : left 187  right 359  top 16  bottom 52   (z-index 50)
document.elementFromPoint(centre of "Edit inventory") → AuthBadge's "Sign in" anchor
editIsReachable     → false
```

On a phone, tapping "Edit inventory" opens the **sign-in page**. That is the estimate
screen's only route back to the inventory, on the device the product is designed around.
`c616d9c "fix: prevent mobile auth control overlap"` addressed part of this; the collision
is still present at 375px **and** at 1280px.

Three further symptoms, same cause:

1. **Desktop landing page** — the tagline chip (x 948–1152, y 42–66) overlaps "Sign in"
   (x 1092–1173, y 16–52) by roughly 60×10px at 1280px.
2. **`/agent/login` renders customer "Sign in / Sign up" buttons.** Verified live. The
   console is a staff tool with its own shared-password auth; offering a customer signup
   there is semantically wrong and confusing on stage.
3. **The console's theme toggle is probably covered.** `ConsoleShell`'s header is
   `sticky top-0 z-20`; the toggle is `ml-auto` in a `max-w-6xl px-5` container, which at
   1280px lands near x 1160–1196 — inside the badge's 1092–1264 span, and the badge wins at
   z-50. **This is arithmetic, not observation** — it could not be confirmed without the
   console password. Verify it while fixing.

### The fix is structural

A globally fixed top-right overlay will collide with anything, forever. Stop stacking and
let layout resolve it.

- [ ] **Step 1: Create `components/AppHeader.tsx`**

One header for the customer surfaces, containing the brand, an optional right-hand slot for
page-specific content, and the auth controls as **flex siblings** — not as an overlay.

```tsx
import { AuthBadge } from './AuthBadge';
import type { ReactNode } from 'react';

/** Customer-facing header. Auth controls are laid out, never floated over the page. */
export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="text-xl font-black tracking-tight text-u-ink">
        Move<span className="text-c-accent">Scan</span>
      </span>
      {children && <div className="min-w-0 flex-1">{children}</div>}
      <div className="ml-auto flex items-center gap-2">
        <AuthBadge />
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Strip the fixed positioning from `AuthBadge`**

Remove `fixed right-4 top-4 z-50` from **both** return branches (signed-out and signed-in).
It becomes a plain `flex items-center gap-2` that renders wherever it is placed.

- [ ] **Step 3: Remove `<AuthBadge />` from `app/layout.tsx`** and mount `AppHeader` in each
      customer page instead, moving each page's existing top-right content into its
      `children` slot. On `/estimate`, "Edit inventory" goes there; on the landing page, the
      tagline chip goes there.

- [ ] **Step 4: Keep it off the agent routes entirely**

`AppHeader` is only used by `/`, `/scan`, `/review`, `/estimate`, `/login`, `/signup`. The
console has its own `ConsoleShell` header. Since `AuthBadge` is no longer in the root
layout, `/agent/*` gets nothing by default — which is the desired outcome, and it also
frees the console header's right edge for the theme toggle.

- [ ] **Step 5: Verify the hit target, do not eyeball it**

At 375×812 and 1280×900, on every customer page:

```js
const el = document.querySelector('a[href*="review"]');      // or whatever the right-hand link is
const r  = el.getBoundingClientRect();
document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2) === el
```

That must be `true`. A screenshot cannot prove this — the earlier fix looked correct and
was not.

- [ ] **Step 6: Confirm the console theme toggle is now clickable** at 1280px, using the
      same `elementFromPoint` check.

- [ ] **Step 7: Gate and commit**

---

## Task 2: Set the IP hash salt

**Files:** Modify `lib/rate-limit.ts`, `.env.local`, `README.md`

Fifteen minutes, and it makes the IP hashing already in place mean something.

`lib/rate-limit.ts:39` reads `process.env.RATE_LIMIT_IP_SALT ?? 'movescan'`. The whole IPv4
space is ~4.3 billion addresses, so against a known salt every `bucket_key` in `scan_usage`
is reversible by brute force — the hashing currently provides close to no privacy.

- [ ] **Step 1: Fail loudly rather than defaulting**

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

A security default that silently degrades is worse than one that refuses to start: the
degraded state looks identical to the working state.

- [ ] **Step 2: Generate and set it**

```bash
openssl rand -hex 16
```

Into `.env.local` and the Vercel project (Production **and** Preview). **Changing the salt
invalidates existing `scan_usage` rows** — every hashed key changes — so today's IP counters
reset once. Harmless, but do it knowingly.

- [ ] **Step 3: Document it in `README.md`** as required, not optional.

- [ ] **Step 4: Gate and commit**

---

## Task 3: App-wide theme switching

**Files:** Modify `app/globals.css`, `app/scan/[sessionId]/page.tsx`, `app/review/[sessionId]/page.tsx`, `app/estimate/[sessionId]/page.tsx`, `app/error.tsx`, `app/not-found.tsx`, `components/HandlingBadge.tsx`, `components/AuditTrail.tsx`, `app/estimate/[sessionId]/print.css`, `components/AppHeader.tsx`; create `components/ThemeToggle.tsx`

**Full step-by-step listing:** `2026-09-02-app-wide-theme-and-agent-session.md`, Task 1.

### Resolve this conflict before starting

Two earlier plans disagree, and the one that shipped is the one being reversed:

- `2026-09-02-demo-data-customer-polish-annotations.md` Task 2 stated *"the customer flow
  stays light"* and deliberately defined `--u-*` tokens **without** dark variants. **That
  shipped.**
- `2026-09-02-app-wide-theme-and-agent-session.md` reversed it by request.

**The reversal wins — the theme goes app-wide.** This is recorded so nobody later reads the
light-only constraint in the demo-data plan and treats this task as a mistake. The reasoning
against it was that a homeowner's OS preference turning their moving estimate dark mid-scan
is a surprise rather than a feature; that was raised, considered and overruled.

One consequence to design around rather than re-argue: **dark mode changes the perceived
colour of the room photos the customer just took.** Pin photo surfaces (thumbnail
backgrounds, the lightbox backdrop) to a neutral mid-tone in both themes so a photo is never
judged against a coloured ground.

### Scope — this is bounded

Remaining hardcoded colour utilities:

| File | Count |
|---|---|
| `app/scan/[sessionId]/page.tsx` | 47 |
| `app/review/[sessionId]/page.tsx` | 45 |
| `app/estimate/[sessionId]/page.tsx` | 33 |
| `app/error.tsx` | 7 |
| `app/not-found.tsx` | 6 |
| `components/HandlingBadge.tsx` | 4 |
| `components/AuditTrail.tsx` | 1 |

`app/page.tsx`, `app/login/page.tsx`, `app/signup/page.tsx` and 8 of 10 shared components
are already at zero — tokenised during the console work. So ~143 utilities across 7 files,
not a rewrite.

- [ ] **Step 1: Add dark variants for the `--u-*` customer tokens** in `app/globals.css`,
      under `:root[data-theme='dark']`. They currently have **zero** dark overrides, which is
      why the customer flow is light-only today. Choose the dark steps deliberately against
      the dark surface — do not invert the light values.

- [ ] **Step 2: Promote the toggle out of the console.** `components/agent/theme.tsx`
      currently owns both `useTheme` and `ThemeToggle`. Move `ThemeToggle` to
      `components/ThemeToggle.tsx` so customer pages can use it, and keep `useTheme` shared.
      Re-export from the old path or update the console import — do not duplicate the hook.

- [ ] **Step 3: Mount it in `AppHeader`** (from Task 1) so every customer page gets it in one
      place. This is why Task 1 comes first: without a real header there is nowhere to put it
      that does not collide.

- [ ] **Step 4: Migrate the 143 utilities**, file by file, largest first.

- [ ] **Step 5: Pin the photo surfaces** as described above.

- [ ] **Step 6: Check the print stylesheet.** `app/estimate/[sessionId]/print.css` forces
      light values for printing. Dark mode must not leak into print output — a dark panel
      prints as a black block and wastes ink. Print to PDF in dark mode and confirm.

- [ ] **Step 7: Verify both themes on every customer page** at 375px and 1280px, including
      `error.tsx` and `not-found.tsx`, which are easy to forget and jarring when wrong.

- [ ] **Step 8: Gate and commit**

---

## Task 4: Agent session that actually expires

**Files:** Create `lib/agent-session.ts`, `lib/agent-session.test.ts`, `app/api/agent/logout/route.ts`; modify `app/api/agent/login/route.ts`, `lib/agent-auth.ts`, `middleware.ts`, `components/agent/console.tsx`

**Full step-by-step listing with the HMAC implementation and its tests:**
`2026-09-02-app-wide-theme-and-agent-session.md`, Task 2.

### What was asked, and what is actually possible

The request was that the agent password "expire on hard refresh or after some time."

**A hard refresh cannot be detected server-side.** It is indistinguishable from any other
navigation — same cookie, same headers. No cookie configuration expires on refresh. What
*is* achievable: expire when the browser closes, after a period of inactivity, and at an
absolute deadline.

### The defect that matters more than the TTL

`app/api/agent/login/route.ts:18` sets the cookie value to `expectedSecret` — **the cookie
literally carries the shared password** — and both `lib/agent-auth.ts:9` and
`middleware.ts:18` authenticate by comparing the cookie to that same secret.

1. **Expiry is not enforced at all.** `maxAge: 60 * 60 * 8` is a client-side hint. A client
   that ignores it, or any script replaying a captured cookie, authenticates indefinitely,
   because the check is only "does this equal the secret?" There is no server-side notion of
   when the session began.
2. **Anything that leaks the cookie leaks the password**, not a revocable token.

So shortening `maxAge` would not deliver what was asked. **The token must carry its own
expiry and the server must verify it.**

- [ ] **Step 1: Write `lib/agent-session.test.ts` first** — accepts a fresh token; rejects
      past the idle window; rejects past the absolute deadline even when recently renewed;
      rejects a tampered payload; rejects a token signed with a different secret.

- [ ] **Step 2: Implement `lib/agent-session.ts`** — `issueToken(secret, now, absoluteDeadline?)`
      and `verifyToken(token, secret, now)`. HMAC-SHA256 over a payload carrying `issuedAt`,
      `lastSeen` and `absoluteExpiry`, using Web Crypto (`globalThis.crypto.subtle`), which is
      available in both the Node and Edge runtimes. Compare signatures with a constant-time
      comparison, not `===`.

- [ ] **Step 3: Issue it on login** as a **session cookie** — omit `maxAge` and `expires`
      entirely, so the browser drops it when it closes. That is the closest achievable
      behaviour to what was asked, and the token's own expiry is what actually enforces the
      limit.

- [ ] **Step 4: Verify and renew in middleware.** 30-minute idle window, 8-hour absolute cap.
      On each authorized request, re-issue with a refreshed `lastSeen` but the **same**
      `absoluteExpiry` — sliding idle, hard ceiling.

- [ ] **Step 5: Add `app/api/agent/logout/route.ts`** clearing the cookie, and a visible
      "Sign out" control in `ConsoleShell`'s header. There is currently no way to sign out at
      all.

- [ ] **Step 6: Verify** — sign in, confirm access; wait past the idle window, confirm
      redirect to login; sign in, close and reopen the browser, confirm redirect; tamper with
      one character of the cookie, confirm rejection.

- [ ] **Step 7: Gate and commit**

---

## Task 5: Session ownership columns

**Files:** Create `db/migrations/0004_session_ownership.sql`; modify `lib/db.ts`, `lib/types.ts`, `app/api/session/route.ts`

**Full listing:** `2026-09-02-session-ownership-and-authorization.md`, Task 2. **Renumber the
migration from `0002` to `0004`** — slots 2 and 3 are taken.

Context worth carrying: `2026-09-02-scan-rate-limiting-and-auth.md` §16 deferred these
columns deliberately, describing them as *"would let a signed-in user see their scan history
and let support trace abuse. Additive migration; no behaviour change needed for limiting."*
That is correct **about limiting**, which is why the deferral was sound. What it misses is
that these columns are the only thing that can carry **authorization**. This promotes one
§16 bullet from feature to control.

- [ ] **Step 1: Write the migration**

```sql
-- Scan sessions gain an owner so authorization has something to check.
-- Both nullable: existing rows predate ownership, and device_id is absent for
-- sessions created by server-side scripts (the two seed generators).
alter table sessions add column user_id   uuid;
alter table sessions add column device_id text;

create index sessions_user_id_idx   on sessions (user_id)   where user_id is not null;
create index sessions_device_id_idx on sessions (device_id) where device_id is not null;
```

- [ ] **Step 2: Extend `SessionDetails`** with optional `userId` and `deviceId`.

- [ ] **Step 3: Accept an owner in `createSession()`**, as an optional defaulted parameter so
      both seed scripts keep working unchanged and produce unowned sessions.

- [ ] **Step 4: Populate it in `POST /api/session`** from `getUser()` and the device cookie —
      the same two identities `lib/rate-limit.ts` already resolves.

      **Critical:** if the session records a freshly-minted device id but the response fails
      to set the cookie, the user is locked out of the scan they just started. Copy the
      cookie-setting pattern from `app/api/analyze/route.ts`, which does this correctly, and
      test that path explicitly.

- [ ] **Step 5: Apply the migration** in the Supabase SQL editor and verify: an anonymous
      scan gets `device_id` with `user_id` null; a signed-in scan gets both.

- [ ] **Step 6: Gate and commit**

---

## Task 6: The access guard

**Files:** Create `lib/session-access.ts`, `lib/session-access.test.ts`; modify `lib/db.ts`

**Full listing including the eight-case test suite:**
`2026-09-02-session-ownership-and-authorization.md`, Task 3.

### The ownership rule

| Session owner | Caller | Access |
|---|---|---|
| `user_id` set | same `user_id` | allow |
| `user_id` set | different or no user | **deny** |
| `user_id` null, `device_id` set | same `device_id` | allow |
| `user_id` null, `device_id` set | different device | **deny** |
| both null (legacy / seeded) | anyone | allow — deliberate |

**Legacy rows stay open on purpose.** Every session created before Task 5 has no owner;
denying them would break links already sent to customers and every seeded demo session. Record
that in a code comment as a conscious, temporary widening that can be tightened once
pre-migration rows age out.

- [ ] **Step 1: Write the failing tests.** The two that matter most are a caller with **no**
      identity against an owned session, and empty-string equality — those are the two ways a
      naive `===` accidentally grants access to everyone.

- [ ] **Step 2: Implement `canAccessSession(owner, caller)` as a pure function**, plus
      `resolveCaller()` and `assertSessionAccess()`.

      **`resolveCaller` must not mint a device id.** `resolveDeviceId` invents a fresh UUID
      when the cookie is missing, and using that as the caller identity would set a cookie
      during a read. Read paths resolve identity; they do not create it. Pass `null` instead.

- [ ] **Step 3: Add narrow owner lookups to `lib/db.ts`** — `getSessionOwner(sessionId)`,
      `getSessionOwnerForRoom(roomId)`, `getSessionOwnerForItem(itemId)` — each selecting only
      `user_id, device_id`, joining upward, so the guard costs one small query.

- [ ] **Step 4: `assertSessionAccess` throws `AccessDeniedError` when access fails *or the
      session does not exist*.** Collapsing both is what makes the 404 indistinguishable.

- [ ] **Step 5: Gate and commit**

---

## Task 7: Apply the guard to nine customer routes

**Files:** Modify `app/api/session/[sessionId]/route.ts`, `app/api/room/route.ts`, `app/api/room/[roomId]/route.ts`, `app/api/item/route.ts`, `app/api/item/[itemId]/route.ts`, `app/api/analyze/route.ts`, `app/api/refine/route.ts`, `app/api/estimate/route.ts`, `app/api/quote/[quoteId]/route.ts`

**Do the two item routes first** — they are the ones that can change a price a human agent
then confirms.

| Route | Resolve ownership via |
|---|---|
| `GET /api/session/[sessionId]` | `sessionId` |
| `POST /api/room` | `body.sessionId` |
| `PATCH /api/room/[roomId]` | `roomId` → session |
| `POST /api/item` | `body.roomId` → session |
| `PATCH` / `DELETE /api/item/[itemId]` | `itemId` → room → session |
| `POST /api/analyze` | `body.roomId` → session |
| `POST /api/refine` | `body.itemId` → room → session |
| `POST /api/estimate` | `body.sessionId` |
| `GET /api/quote/[quoteId]` | `quoteId` → session |

- [ ] **Step 1: Establish the pattern**

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

**Order matters:** validate shape → authorize → then do work. In particular authorize
**before** `saveCapture` and **before** the quota spend in `/api/analyze`, so an unauthorized
caller neither writes files nor burns someone else's quota.

- [ ] **Step 2: Apply to the remaining eight.**

- [ ] **Step 3: Stop returning `customerEmail` unguarded.** `GET /api/session/[sessionId]`
      returns the whole session including the email. Return that field only when the caller is
      the owning **account**, not merely the owning device — a shared device should not surface
      someone else's address.

- [ ] **Step 4: Verify, including adversarially**

Per route: the owner succeeds; a different device gets 404; a non-existent id gets a 404 that
is byte-identical. Then the anonymous happy path end to end, then the signed-in path.

Then the test that is the actual point of this task: take a session URL in browser A, read an
item id from `GET /api/session/[sessionId]`, and attempt `PATCH /api/item/[itemId]` from
browser B. **It must 404.** Today it succeeds.

- [ ] **Step 5: Gate and commit**

---

## Task 8: Claim anonymous scans on sign-in

**Files:** Modify `app/api/auth/login/route.ts`, `app/api/auth/signup/route.ts`; add `claimDeviceSessions` to `lib/db.ts`

**Full listing:** `2026-09-02-session-ownership-and-authorization.md`, Task 5.

Without this, a customer who scans anonymously and then creates an account loses the scan the
moment they sign in elsewhere, and the account shows no history. It is also the cleanest
answer to the parked "return access" problem.

- [ ] **Step 1: Add `claimDeviceSessions(deviceId, userId)`**, scoped to `user_id is null`.
      **That predicate is the entire safety property** — without it, signing in on a shared
      device transfers someone else's scans.

- [ ] **Step 2: Call it after successful login and signup.** A claim failure must **not** fail
      the sign-in — wrap it and log.

- [ ] **Step 3: Verify** — scan anonymously, sign up, confirm the scan is owned and still
      opens; sign in on a second device and confirm it is reachable; confirm a session already
      owned by another account is never claimed.

- [ ] **Step 4: Gate and commit**

---

## Task 9: Two decisions to record, not code

- [ ] **Step 1: Verify Supabase project settings and write them into `README.md`**

None of these live in the repo, and all bear on the security posture:
- Is **email confirmation** required? It determines how cheap a fresh `user:` quota bucket is
  — and signing in raises the daily AI allowance from 3/device to 15.
- What are Supabase's **own auth rate limits** for this project? Not verified; the app adds no
  signup limit of its own.
- What are the **session and refresh-token TTLs**?

An unwritten dashboard setting is a setting nobody can review.

- [ ] **Step 2: Decide on user enumeration, explicitly**

`app/api/auth/signup/route.ts` returns 409 with *"That email is already registered."* Good UX,
and also an oracle for which addresses hold accounts. **Keeping it is defensible** — the
privacy-preserving alternative needs transactional email, which was deliberately cut. Leaving
it undecided is not. Record the decision.

---

## Recommended order

| Order | Task | Effort | Why here |
|---|---|---|---|
| 1 | Task 1 — AuthBadge collision | 1–2h | Functional blocker on mobile; also unblocks Task 3 |
| 2 | Task 2 — IP salt | 15m | Trivial, and makes existing hashing meaningful |
| 3 | Task 3 — app-wide theme | 4–5h | Needs Task 1's header to exist |
| 4 | Task 4 — agent session | 3–4h | Independent |
| 5 | Task 5 — ownership columns | 1–1.5h | |
| 6 | Task 6 — access guard | 1.5–2h | Needs Task 5 |
| 7 | Task 7 — apply to nine routes | 2–3h | Needs Task 6 |
| 8 | Task 8 — claim on sign-in | 1–1.5h | Needs Task 5 |
| 9 | Task 9 — record decisions | 30m | |

Roughly **15–20 hours**. Tasks 1–4 are user-visible; Tasks 5–8 close the authorization gap.

**If time is short, Tasks 1 and 2 are non-negotiable** — one is a blocker on the primary
device, the other is fifteen minutes.

---

## Out of scope

- RLS policies — see Global Constraints; they would not apply.
- The remaining `2026-09-02-scan-rate-limiting-and-auth.md` §16 deferrals: global daily cap,
  burst/per-minute limit, `scan_usage` retention job, IPv6 `/64` prefix normalisation.
- Transactional email. The copy fix already removed the false promise.
- Bounding-box annotations — shipped in `c4cbb3b`.

## Still open, and unchanged by this plan

**Real-photo dedupe accuracy has never been measured.** Every test to date used synthetic
canvas images. `scripts/seed-demo-data.ts` exists but had not been run at time of writing, so
whether the three Insights charts read well with real volume is also unconfirmed. One real
12-photo run on a phone remains cheaper than any task above, and it tests the assumption
everything else is built on.
