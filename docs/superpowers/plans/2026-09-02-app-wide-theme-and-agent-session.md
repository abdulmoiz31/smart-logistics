# App-Wide Theme Switching & Agent Session Expiry

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the dark/light switch to every page in the app, not just the agent console, and make the agent console session actually expire instead of persisting for eight hours on a client-controlled cookie.

**Architecture:** The theme token layer already exists from the console work; this extends it with dark variants for the customer surfaces and promotes the toggle out of the agent-only module. Agent auth changes from "the cookie *is* the password" to a signed, self-expiring session token verified server-side with Web Crypto in middleware.

**Tech Stack:** unchanged. Next.js 15 App Router, Tailwind v4, Supabase, Vitest. **No new dependencies.**

**Supersedes:** Task 2 of `2026-09-02-demo-data-customer-polish-annotations.md`, which scoped theming to the console and stated the customer flow stays light. That decision is reversed here by request — see the note in Task 1.

## Global Constraints

- **Verification gate:** `npx tsc --noEmit && npx vitest run && npx next build --turbopack` before any task is complete.
- **Commit as the repo identity.** No `-c user.email=…` — Vercel blocks unrecognised authors and the deployment will not build.
- **No secret ever appears in a cookie value.** After Task 2 the cookie carries a signed token, never `AGENT_CONSOLE_SECRET` itself.
- **Expiry is enforced server-side.** Cookie `maxAge` is a client-side hint; a hostile client can replay an "expired" cookie forever. The token must carry its own expiry and the server must check it.
- **Middleware runs on the Edge runtime.** Use Web Crypto (`crypto.subtle`), not Node's `crypto` module. `node:crypto` imports will fail to build in middleware.
- **`components/ItemRow.tsx` and `components/HandlingBadge.tsx` render in both the customer flow and the agent console.** Check both surfaces after touching either.
- **Print output must stay light** regardless of theme — see Task 1, Step 6.

---

## Task 1: App-wide theme switching

**Files:** Modify `app/globals.css`, `app/scan/[sessionId]/page.tsx`, `app/review/[sessionId]/page.tsx`, `app/estimate/[sessionId]/page.tsx`, `app/error.tsx`, `app/not-found.tsx`, `components/HandlingBadge.tsx`, `components/AuditTrail.tsx`, `app/estimate/[sessionId]/print.css`; create `components/ThemeToggle.tsx`, `components/AppHeader.tsx`; delete `components/agent/theme.tsx` (moved)

### Note on the reversal

The previous plan argued the customer flow should stay light: a homeowner photographing
their living room is a different audience from a dispatcher scanning a job board, and a
customer's OS preference turning their moving estimate dark mid-scan is a surprise rather
than a feature. **That has been overruled by request, and this plan implements the toggle
app-wide.** One consequence to design around rather than argue about: dark mode changes
the perceived colour of the room photos the customer just took, which is exactly why
Step 5 pins the photo surfaces to a neutral mid-tone in both themes.

### Current state — most of the work is already done

A survey of remaining hardcoded colour utilities:

| File | Fixed colour utilities |
|---|---|
| `app/scan/[sessionId]/page.tsx` | 47 |
| `app/review/[sessionId]/page.tsx` | 45 |
| `app/estimate/[sessionId]/page.tsx` | 33 |
| `app/error.tsx` | 7 |
| `app/not-found.tsx` | 6 |
| `components/HandlingBadge.tsx` | 4 |
| `components/AuditTrail.tsx` | 1 |

`app/page.tsx`, `app/login/page.tsx`, `app/signup/page.tsx` and 8 of the 10 shared
components are already at **zero** — they were tokenised during the console work. So this
is a bounded migration of ~143 utilities across 7 files, not a rewrite.

- [ ] **Step 1: Add dark variants for the customer surfaces**

The previous plan deliberately defined `--u-*` tokens **without** dark variants. Add them:

```css
:root {
  --u-bg:      #fbfcfd;
  --u-panel:   #ffffff;
  --u-panel-2: #f6f8fa;
  --u-border:  #e6ebf1;
  --u-ink:     #10151f;
  --u-ink-2:   #4a5568;
  --u-ink-3:   #6b7688;
  /* Neutral mount for photographs — see Step 5 */
  --u-photo-mat: #eef1f4;
}

:root[data-theme='dark'] {
  --u-bg:      #0b1017;
  --u-panel:   #141b25;
  --u-panel-2: #1a2230;
  --u-border:  rgb(255 255 255 / 0.10);
  --u-ink:     #e9eef6;
  --u-ink-2:   #a4b0c0;
  --u-ink-3:   #7d8899;
  --u-photo-mat: #222934;
}
```

Customer dark surfaces are deliberately **slightly warmer and lighter** than the console's
`#080c16`. The console is a dense ops tool where near-black aids scanning; the customer
flow is a calm consumer surface where near-black reads as heavy. Same system, different
step — this is the "both themes are selected, not flipped" rule applied twice.

Register each as a Tailwind colour in the existing `@theme inline` block so `bg-u-panel`
and `text-u-ink-2` work.

- [ ] **Step 2: Promote the toggle out of the agent module**

`components/agent/theme.tsx` is no longer agent-specific. Move it to
`components/ThemeToggle.tsx`, keeping `useTheme` and `ThemeToggle` exports unchanged, and
update the import in `components/agent/console.tsx`. Do not fork it — one toggle, one
storage key (`movescan-theme`), so switching on the estimate page is reflected in the
console and vice versa.

The pre-paint script in `app/layout.tsx` already applies the stored theme globally, so no
change is needed there. **Verify that** rather than assuming it: reload a customer page
with dark stored and confirm no white flash.

- [ ] **Step 3: Add a customer-facing header**

The customer pages have no shared header — each renders its own inline "MoveScan" mark plus
a right-hand link. Create `components/AppHeader.tsx` taking `{ action?: ReactNode }`,
rendering the wordmark on the left, the page's existing action link, and `<ThemeToggle />`.
Use it on scan, review and estimate.

This is the one place a new component is justified rather than more per-page markup: the
toggle has to appear on every page, and four copies of it will drift.

- [ ] **Step 4: Migrate the three flow pages**

Mechanical, using the mapping already established for the console:

| Fixed utility | Token |
|---|---|
| `bg-slate-50`, `bg-slate-100` | `bg-u-bg` |
| `bg-white` | `bg-u-panel` |
| `text-slate-950`, `text-slate-900` | `text-u-ink` |
| `text-slate-700`, `text-slate-800` | `text-u-ink-2` |
| `text-slate-500`, `text-slate-600` | `text-u-ink-3` |
| `border-slate-200`, `border-slate-300` | `border-u-border` |
| `text-cyan-700`, `bg-cyan-700` | `text-c-accent`, `bg-c-accent text-c-accent-ink` |
| amber uncertainty card | `border-c-waiting/30 bg-c-waiting/10 text-c-waiting` |
| emerald confirmed block | `bg-c-fresh text-c-accent-ink` |
| rose errors | `text-c-overdue`, `border-c-overdue/30 bg-c-overdue/10` |

Do `app/error.tsx` and `app/not-found.tsx` in the same pass — they are small and currently
render light-on-light if the theme is dark, which is the most visible possible bug.

- [ ] **Step 5: Pin photo surfaces to a neutral mat**

Photo thumbnails on the scan page and captures in the review flow currently sit on
`bg-white`. On a dark background a white mat glares, and a near-black mat makes a dim room
photo look darker than it is — the user then thinks their photo is bad.

Use `bg-u-photo-mat` behind every photo in both themes: a mid-tone that does not fight the
image. Same reasoning as the lightbox backdrop staying `bg-black/80` in both themes.

- [ ] **Step 6: Force the print stylesheet light — this is a real bug otherwise**

`app/estimate/[sessionId]/print.css` was written when the estimate page was light-only.
With app-wide theming, a customer in dark mode who prints gets a dark page: wasted ink,
and on many printers a solid black block.

Add to the print stylesheet:

```css
@media print {
  :root, :root[data-theme='dark'] {
    --u-bg: #ffffff;
    --u-panel: #ffffff;
    --u-panel-2: #ffffff;
    --u-border: #d8dee6;
    --u-ink: #000000;
    --u-ink-2: #333333;
    --u-ink-3: #555555;
    --u-photo-mat: #ffffff;
    --c-accent: #0f766e;
  }
}
```

Re-declaring the dark selector inside `@media print` is what makes this work — otherwise
the `[data-theme='dark']` block still wins on specificity.

- [ ] **Step 7: Verify both themes on every page**

Scan, review, estimate, landing, login, signup, error, not-found — in both themes, at
375px and desktop. Then print the estimate to PDF **while in dark mode** and confirm the
output is light. That last check is the one most likely to be skipped and most likely to
be broken.

- [ ] **Step 8: Gate and commit**

---

## Task 2: Agent session expiry

**Files:** Create `lib/agent-session.ts`, `lib/agent-session.test.ts`, `app/api/agent/logout/route.ts`; modify `app/api/agent/login/route.ts`, `lib/agent-auth.ts`, `middleware.ts`, `components/agent/console.tsx`

### What was asked, and what is actually possible

The request was that the password "expire on hard refresh or after some time." One half of
that is achievable and the other is not, so being precise matters:

**A hard refresh cannot be detected server-side.** To the server it is indistinguishable
from any other navigation — same cookie, same headers. No cookie configuration can expire
on refresh. What *is* achievable: expire when the browser closes, expire after a period of
inactivity, and expire at an absolute deadline.

### The defect that matters more than the TTL

`app/api/agent/login/route.ts:18` sets the cookie value to `expectedSecret` — **the cookie
literally carries the shared password** — and `lib/agent-auth.ts:9` plus `middleware.ts:18`
authenticate by comparing the cookie to that same secret.

Two consequences:

1. **Expiry is not enforced at all.** `maxAge: 60 * 60 * 8` is a client-side hint. A
   client that ignores it — or any script replaying a captured cookie — keeps
   authenticating indefinitely, because the check is only "does this equal the secret?"
   There is no server-side notion of when the session began.
2. **Anything that leaks the cookie leaks the password**, not a revocable token. It is
   `httpOnly`, which is good, but the blast radius of a leak is the credential itself.

So shortening `maxAge` would not deliver what was asked. The token has to carry its own
expiry and the server has to verify it.

- [ ] **Step 1: Write the failing tests**

Create `lib/agent-session.test.ts`. These run in Node, so the Web Crypto used by the
implementation is available via `globalThis.crypto`.

```ts
import { describe, it, expect } from 'vitest';
import { issueToken, verifyToken } from './agent-session';

const SECRET = 'test-secret-value';
const NOW = 1_800_000_000_000;

describe('issueToken / verifyToken', () => {
  it('accepts a freshly issued token', async () => {
    const token = await issueToken(SECRET, NOW);
    await expect(verifyToken(token, SECRET, NOW + 1000)).resolves.toMatchObject({ valid: true });
  });

  it('rejects a token past its idle window', async () => {
    const token = await issueToken(SECRET, NOW);
    const later = NOW + 31 * 60 * 1000;
    await expect(verifyToken(token, SECRET, later)).resolves.toMatchObject({ valid: false });
  });

  it('rejects a token past the absolute deadline even if recently renewed', async () => {
    const token = await issueToken(SECRET, NOW, NOW + 60_000);
    await expect(verifyToken(token, SECRET, NOW + 120_000)).resolves.toMatchObject({ valid: false });
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await issueToken(SECRET, NOW);
    await expect(verifyToken(token, 'other-secret', NOW + 1000)).resolves.toMatchObject({ valid: false });
  });

  it('rejects a tampered payload', async () => {
    const token = await issueToken(SECRET, NOW);
    const [, sig] = token.split('.');
    const forged = `${btoa(JSON.stringify({ exp: NOW + 1e9, abs: NOW + 1e9 }))}.${sig}`;
    await expect(verifyToken(forged, SECRET, NOW + 1000)).resolves.toMatchObject({ valid: false });
  });

  it('rejects malformed input without throwing', async () => {
    for (const bad of ['', 'nodot', 'a.b.c', '...', 'undefined']) {
      await expect(verifyToken(bad, SECRET, NOW)).resolves.toMatchObject({ valid: false });
    }
  });

  it('never contains the secret in the token', async () => {
    const token = await issueToken(SECRET, NOW);
    expect(token.includes(SECRET)).toBe(false);
  });

  it('reports when a valid token is close enough to expiry to renew', async () => {
    const token = await issueToken(SECRET, NOW);
    const result = await verifyToken(token, SECRET, NOW + 25 * 60 * 1000);
    expect(result).toMatchObject({ valid: true, shouldRenew: true });
  });
});
```

The last two are the ones that encode the design: the token must not be the secret, and
renewal must be decidable by the verifier.

- [ ] **Step 2: Run to confirm failure**, then implement `lib/agent-session.ts`

```ts
/**
 * Agent console session tokens.
 *
 * The cookie used to carry AGENT_CONSOLE_SECRET verbatim, which meant a leaked cookie
 * leaked the credential and expiry was only ever a client-side hint. A token carries its
 * own idle expiry and absolute deadline, signed with the secret, so the server decides
 * when a session ends.
 *
 * Web Crypto only — this runs in Next.js middleware on the Edge runtime, where
 * `node:crypto` is unavailable.
 */

export const IDLE_MS = 30 * 60 * 1000;      // inactivity before sign-out
export const ABSOLUTE_MS = 8 * 60 * 60 * 1000; // hard ceiling regardless of activity
const RENEW_WHEN_REMAINING_MS = 10 * 60 * 1000;

interface Payload { exp: number; abs: number }

const encoder = new TextEncoder();

function b64url(input: string): string {
  return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  return atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return b64url(String.fromCharCode(...new Uint8Array(mac)));
}

/** Length-independent comparison, so a mismatch reveals nothing through timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function issueToken(secret: string, now: number, absoluteDeadline?: number): Promise<string> {
  const payload: Payload = {
    exp: now + IDLE_MS,
    abs: absoluteDeadline ?? now + ABSOLUTE_MS,
  };
  const encoded = b64url(JSON.stringify(payload));
  return `${encoded}.${await sign(encoded, secret)}`;
}

export interface VerifyResult {
  valid: boolean;
  shouldRenew?: boolean;
  absoluteDeadline?: number;
}

export async function verifyToken(token: string, secret: string, now: number): Promise<VerifyResult> {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return { valid: false };
    const [encoded, signature] = parts;
    if (!encoded || !signature) return { valid: false };

    if (!safeEqual(signature, await sign(encoded, secret))) return { valid: false };

    const payload = JSON.parse(unb64url(encoded)) as Partial<Payload>;
    if (typeof payload.exp !== 'number' || typeof payload.abs !== 'number') return { valid: false };
    if (now >= payload.exp || now >= payload.abs) return { valid: false };

    return {
      valid: true,
      shouldRenew: payload.exp - now < RENEW_WHEN_REMAINING_MS,
      absoluteDeadline: payload.abs,
    };
  } catch {
    // Malformed base64, malformed JSON, anything — a bad token is simply invalid.
    return { valid: false };
  }
}
```

- [ ] **Step 3: Issue the token on login as a session cookie**

In `app/api/agent/login/route.ts`, keep the password comparison against
`AGENT_CONSOLE_SECRET`, then set:

```ts
response.cookies.set('agent_session', await issueToken(expectedSecret, Date.now()), {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  // No maxAge and no expires: a session cookie, cleared when the browser closes.
  // Real expiry lives inside the token and is checked server-side.
});
```

Rename the cookie from `agent_secret` to `agent_session`. The rename is deliberate: any
browser still holding the old cookie is instantly unauthenticated rather than silently
accepted, which is the correct outcome for a credential-bearing cookie being retired.

- [ ] **Step 4: Verify and slide in middleware**

Replace the equality check in `middleware.ts`:

```ts
if (pathname.startsWith(AGENT_PREFIX) && pathname !== '/agent/login') {
  const secret = process.env.AGENT_CONSOLE_SECRET;
  const token = request.cookies.get('agent_session')?.value;
  const result = secret && token
    ? await verifyToken(token, secret, Date.now())
    : { valid: false };

  if (!result.valid) {
    const loginUrl = new URL('/agent/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    const redirect = NextResponse.redirect(loginUrl);
    redirect.cookies.delete('agent_session');
    return redirect;
  }

  // Sliding window: activity extends the idle timer, never past the absolute deadline.
  if (result.shouldRenew) {
    response.cookies.set(
      'agent_session',
      await issueToken(secret!, Date.now(), result.absoluteDeadline),
      { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' },
    );
  }
}
```

Note it passes `result.absoluteDeadline` back into `issueToken`, so renewal extends the
idle window but **cannot** extend the 8-hour ceiling.

- [ ] **Step 5: Update `lib/agent-auth.ts`**

The API-route guard must use the same verification. It currently compares
`cookieStore.get('agent_secret')?.value === expectedSecret`. Make it `async` and delegate
to `verifyToken`, then update every caller — the agent API routes — to await it. Confirm
with `grep -rn "requireAgent\|agent-auth" app/api` that no route is left on the old check;
a missed route is an authentication bypass, not a cosmetic inconsistency.

- [ ] **Step 6: Add sign-out — currently there is none at all**

`app/api/agent/logout/route.ts`: a `POST` that deletes the cookie and returns `{ ok: true }`.
Then add a "Sign out" control to `ConsoleShell`'s header beside the theme toggle, which
posts to it and navigates to `/agent/login`.

An agent console with no way to sign out is a real gap independent of expiry — on a shared
back-office machine the next person inherits the session.

- [ ] **Step 7: Surface the timeout to the user**

A session that vanishes silently reads as a bug. When middleware redirects because of an
expired token, add `?expired=1` to the login URL and have the login page show "Your
session timed out. Sign in to continue." — in the interface's voice, stating what happened.

- [ ] **Step 8: Verify each expiry path**

| Scenario | Expected |
|---|---|
| Sign in, use the console | Works; cookie renews silently past 20 minutes of use |
| Sign in, close the browser, reopen | Signed out — session cookie is gone |
| Sign in, idle 31 minutes, click | Redirected to login with the timeout message |
| Sign in, stay active 8+ hours | Signed out at the absolute deadline regardless of activity |
| Hand-edit the cookie value | Signed out; signature check fails |
| Replay an old `agent_secret` cookie | Signed out; that cookie name is no longer accepted |
| Sign out, press Back | Login page, not the console |

Shorten `IDLE_MS` and `ABSOLUTE_MS` locally to test the timing paths rather than waiting.

- [ ] **Step 9: Gate and commit**

---

## Not in this plan, but worth knowing

While reading the current code I found **two authentication systems now coexisting**:
real Supabase auth (`app/api/auth/login`, `lib/supabase/server.ts`, `lib/supabase/middleware.ts`,
`/login`, `/signup`) alongside a year-long anonymous device cookie (`lib/device.ts`,
`msid`), plus the agent shared-password console this plan hardens.

That is three identity mechanisms in one app. None of it is broken, and it appears to
address the parked "return access" problem — but it was not in any plan I wrote, so it has
not been reviewed. **Worth a dedicated review pass**, particularly: whether customer
sessions can read other customers' scans, whether the device cookie grants access to
sessions created on that device, and whether `/signup` is rate-limited. Those are exactly
the questions the parked abuse/quota work was going to cover.

## Recommended order

| Order | Task | Effort |
|---|---|---|
| 1 | Task 2 — agent session | 3–4h |
| 2 | Task 1 — app-wide theme | 4–5h |

Task 2 first: it closes a security defect, and it is smaller and fully testable. Task 1 is
a broad mechanical migration whose main risk is missing a page — best done in one
uninterrupted pass with the verification checklist open.
