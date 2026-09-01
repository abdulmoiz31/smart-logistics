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
AGENT_CONSOLE_SECRET=
```

### Where each value comes from

| Variable | Source |
|---|---|
| `GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → *Get API key*. Free tier. |
| `GEMINI_MODEL` / `GEMINI_FALLBACK_MODEL` | Model ids above. Not secrets. |
| `MOVESCAN_DEMO_MODE` | `0` calls the real API, `1` serves fixtures. |
| `SUPABASE_URL` | Supabase → Settings → API → **Project URL**. Base origin only — no `/rest/v1/` suffix. |
| `SUPABASE_SERVICE_KEY` | Same page → the **secret** key (`sb_secret_…`), not the publishable/anon key. |
| `AGENT_CONSOLE_SECRET` | You choose it. Generate with `openssl rand -hex 16`. |

A `SUPABASE_URL` with a `/rest/v1/` suffix returns **401**, not a routing error — so this
misconfiguration impersonates a bad key. Check the URL before suspecting the key.

Then run `db/schema.sql` once in the Supabase SQL editor and create a **private** Storage
bucket named exactly `captures` — `lib/db.ts` hardcodes that name, so a typo surfaces as a
vague upload failure rather than a clear error.

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

## Verification

```bash
npx tsc --noEmit
npm test
npm run build
```

Before a live demo, run one complete production scan within two minutes of presenting to warm the hosting, database, and model connections. Then complete the customer-to-agent journey three times on the demo phone and venue network. Test forced fallback mode once with an invalid Gemini key, and ensure the agent queue is populated with `npm run seed-demo`.

## Deployment

Deploy the Next.js app with the environment variables above configured in the hosting provider. Add the final deployment address and QR code to the demo materials after deployment.
