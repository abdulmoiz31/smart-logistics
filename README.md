# MoveScan

MoveScan is a mobile-first moving survey demo. Customers photograph rooms, check an AI-assisted inventory, and receive an estimate range. A moving specialist then reviews and confirms the final price.

## Requirements

- Node.js 22+
- A Supabase project with a private `captures` Storage bucket
- A Gemini API key for live recognition (optional in demo mode)

## Setup

```bash
npm install
cp .env.local.example .env.local
```

Set these values in `.env.local`:

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

Run `db/schema.sql` once in the Supabase SQL editor, then create a private Storage bucket named `captures`. Keep `SUPABASE_SERVICE_KEY` server-only; never expose it as a public browser variable.

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

Before a live demo, complete the customer-to-agent journey three times on the demo phone and venue network. Test forced fallback mode once with an invalid Gemini key, and ensure the agent queue is populated with `npm run seed-demo`.

## Deployment

Deploy the Next.js app with the environment variables above configured in the hosting provider. Add the final deployment address and QR code to the demo materials after deployment.
