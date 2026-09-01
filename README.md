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
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
MOVESCAN_DEMO_MODE=1
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

## Demo mode and fallback

Set `MOVESCAN_DEMO_MODE=1` to force fixture inventory and avoid Gemini calls. Missing API credentials and exhausted/failed Gemini requests also fall back to fixtures, with a customer-facing demo-mode banner.

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
