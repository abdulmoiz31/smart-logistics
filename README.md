# MoveScan

MoveScan is a mobile-first moving survey demo. Customers photograph rooms, check an AI-assisted inventory, and receive an estimate range. A moving specialist then reviews and confirms the final price.

## Requirements

- Node.js 22+
- A Supabase project with a private `captures` Storage bucket
- A Gemini API key for live recognition (optional in demo mode)

## Setup

```bash
npm install
touch .env.local
```

No env template is committed — every `.env*` file is gitignored without exception, so a
real key can never reach the repository. Create `.env.local` yourself with these keys:

```bash
# Recognition models. Rate limits are per-model within a project, so the fallback
# has its own quota bucket. Limits are NOT per-key — extra keys in one project
# share one quota. Check your limits at https://aistudio.google.com/rate-limit
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_FALLBACK_MODEL=gemini-3.1-flash-lite

# Set to 1 to bypass every model call and serve checked-in fixtures.
MOVESCAN_DEMO_MODE=0

SUPABASE_URL=
SUPABASE_SERVICE_KEY=
SUPABASE_ANON_KEY=
AGENT_CONSOLE_SECRET=

# Rate limiting (thresholds are optional; defaults shown)
RATE_LIMIT_ANON_PER_DEVICE=3
RATE_LIMIT_ANON_PER_IP=9
RATE_LIMIT_USER_PER_DAY=15
RATE_LIMIT_USER_IP_PER_DAY=40

# Required: at least 16 random characters. Generate with `openssl rand -hex 32`.
RATE_LIMIT_IP_SALT=
RATE_LIMIT_DISABLED=0
```

### Where each value comes from

| Variable | Source |
|---|---|
| `GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → *Get API key*. Free tier. |
| `GEMINI_MODEL` / `GEMINI_FALLBACK_MODEL` | Model ids above. Not secrets. |
| `MOVESCAN_DEMO_MODE` | `0` calls the real API, `1` serves fixtures. |
| `SUPABASE_URL` | Supabase → Settings → API → **Project URL**. Base origin only — no `/rest/v1/` suffix. |
| `SUPABASE_SERVICE_KEY` | Same page → the **secret** key (`sb_secret_…`), not the publishable/anon key. |
| `SUPABASE_ANON_KEY` | Same page → the **anon / publishable** key. Used for email+password auth. NOT the service key. |
| `AGENT_CONSOLE_SECRET` | You choose it. Generate with `openssl rand -hex 16`. |
| `RATE_LIMIT_ANON_PER_DEVICE` | Max scans/day per device cookie for anonymous visitors (default: 3). |
| `RATE_LIMIT_ANON_PER_IP` | Max scans/day per IP for anonymous visitors (default: 9). |
| `RATE_LIMIT_USER_PER_DAY` | Max scans/day per signed-in account (default: 15). |
| `RATE_LIMIT_USER_IP_PER_DAY` | Max scans/day per IP for signed-in users — account-farming backstop (default: 40). |
| `RATE_LIMIT_IP_SALT` | Required secret of at least 16 random characters used to hash IPs before storage. Generate with `openssl rand -hex 32`; rotating it changes every IP bucket hash and resets IP quota continuity. |
| `RATE_LIMIT_DISABLED` | Set to `1` locally to bypass all limiting (no Vercel IP headers on localhost). |

A `SUPABASE_URL` with a `/rest/v1/` suffix returns **401**, not a routing error — so this
misconfiguration impersonates a bad key. Check the URL before suspecting the key.

Then run `db/schema.sql` once in the Supabase SQL editor and create a **private** Storage
bucket named exactly `captures` — `lib/db.ts` hardcodes that name, so a typo surfaces as a
vague upload failure rather than a clear error.

### Supabase auth configuration (for rate limiting + email/password signup)

In the Supabase dashboard:

1. **Authentication → Providers → Email**: enable, turn **"Confirm email" OFF**.
2. **Authentication → Providers → Email**: set minimum password length to **8**.
3. Run every file in `db/migrations/` in the Supabase SQL editor, in order:

   | Migration | What it adds |
   |---|---|
   | `0001_scan_usage.sql` | Rate-limiting table and the `consume_quota` function |
   | `0002_item_box.sql` | `items.box` for photo annotations |
   | `0003_leads_summary_view.sql` | Aggregated Insights summary |
   | `0004_session_ownership.sql` | `sessions.user_id` / `sessions.device_id` — **required for authorization** |

   **`0004` is not optional.** Without it every session operation fails, because
   `createSession` and the ownership lookups reference those columns. The error is made
   actionable in `lib/db.ts` — if you see "apply db/migrations/0004_session_ownership.sql",
   this step was skipped.

No redirect URL configuration is needed (password flow, not magic link).

### Scan rate limiting

Anonymous visitors get 3 scans/day per device cookie and 9 per IP. Signed-up users (free email+password) get 15/day per account and 40 per IP. All limits are configurable via env vars — no code change needed. `MOVESCAN_DEMO_MODE=1` also bypasses rate limiting.

Verify all four at once:

```bash
npm run seed-demo
```

If the seed completes, the URL, key, schema, and bucket are all correct — it exercises
every one of them, and fails with the real Postgres or Storage error if not.

`SUPABASE_SERVICE_KEY` bypasses Row Level Security. It is confined to `lib/db.ts` and
server-side route handlers. Never expose it as a `NEXT_PUBLIC_` variable.

## Run locally

```bash
npm run dev
```

Open the local development server in a phone browser. Use the customer flow:

1. Start a scan.
2. Photograph each room.
3. Review uncertain inventory items and request an estimate.
4. Open `/agent`, sign in with `AGENT_CONSOLE_SECRET`, and confirm the quote.

## Demo mode and model cascade

Set `MOVESCAN_DEMO_MODE=1` to force fixture inventory and avoid Gemini calls. Missing API credentials also trigger demo mode automatically.

The recognition tier uses **Flash-Lite as primary** for quota headroom, not quality. A fallback model (`GEMINI_FALLBACK_MODEL`) has its own quota bucket, so a 429 on the primary escalates to the fallback automatically. If both models fail, the app falls back to fixtures with a customer-facing demo-mode banner. Cross-frame dedupe (counting one object photographed from two angles as one item, not two) is the task most at risk on a Lite model. To escalate quality, set `GEMINI_MODEL=gemini-3.5-flash` — one env var, no code change.

Seed a presentable pending quote for the agent console with:

```bash
npm run seed-demo
```

The seed requires configured Supabase credentials. It creates two rooms from the checked-in fixtures and a pending quote.

## Demo data

Two seed scripts are available:

```bash
npm run seed-demo          # single session from fixtures, for end-to-end checks
npm run seed-demo-data     # larger deterministic demo set for charts and queue
npm run seed-demo-data -- --reset                 # remove previous demo rows first
npm run seed-demo-data -- --sessions 60 --days 21 # tune volume and window
```

`seed-demo-data` writes sessions with `customer_email` ending in `@seed.movescan.test`. The `--reset` flag deletes **only** rows with that marker, so real customer data is never touched. It is safe to run repeatedly against a development project.

## Verification

```bash
npx tsc --noEmit
npm test
npm run build
```

Before a live demo, run one complete production scan within two minutes of presenting to warm the hosting, database, and model connections. Then complete the customer-to-agent journey three times on the demo phone and venue network. Test forced fallback mode once with an invalid Gemini key, and ensure the agent queue is populated with `npm run seed-demo-data`.

## Security decisions on record

Recorded deliberately so they can be reviewed rather than rediscovered.

**Session ownership.** Scans are owned by `sessions.user_id` when created signed in, and
otherwise by `sessions.device_id` (the `msid` cookie). Nine customer API routes call
`assertSessionAccess` before doing any work. Ownership failure and "does not exist" both
answer **404** — a 403 would confirm the id is real.

Sessions created *before* migration `0004` have neither owner and stay readable, so estimate
links already sent to customers keep working. That is a temporary widening; it can be
tightened once pre-migration rows have aged out.

**`customerEmail` is withheld** from `GET /api/session/[sessionId]` unless the caller is the
owning **account** — a shared device must not surface someone else's address.

**Row Level Security is not the mechanism.** `lib/db.ts` uses `SUPABASE_SERVICE_KEY`, which
bypasses RLS by design, and every app query goes through it. Adding RLS policies would have
no effect on these routes. Authorization lives in the route handlers.

**Agent console sessions** carry a signed HMAC token (`lib/agent-session.ts`), not the raw
shared password. 30-minute idle window, 8-hour absolute ceiling, both enforced server-side;
the cookie is a session cookie so it also dies when the browser closes. `POST
/api/agent/logout` clears it. A hard refresh cannot be detected server-side — it is
indistinguishable from any other navigation — so "expire on refresh" is not achievable; the
idle window is the closest equivalent.

**`RATE_LIMIT_IP_SALT` is required**, not optional. `lib/rate-limit.ts` throws when it is
unset or shorter than 16 characters. Without a secret salt, hashed IPv4 buckets are
reversible by brute force over a 4.3-billion-address space. Changing the salt resets that
day's IP counters once.

**Email confirmation is deliberately OFF** (see Supabase setup above) to keep signup a
single mobile step. Consequence: a fresh account is cheap, and signing in raises the daily
AI allowance from 3/device to 15/account. The signed-in per-IP cap of 40/day is therefore
the real backstop — tune that number, not the per-account one.

**Signup discloses whether an email is registered** (409 "already registered"). Kept
deliberately for usable error messaging; the privacy-preserving alternative needs
transactional email, which is out of scope. This is a known, accepted trade-off.

## Deployment

Deploy the Next.js app with the environment variables above configured in the hosting provider. Add the final deployment address and QR code to the demo materials after deployment.
