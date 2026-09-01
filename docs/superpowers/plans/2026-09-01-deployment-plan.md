# MoveScan — Deployment Plan (Zero-Cost Hackathon Demo)

**Date:** 2026-09-01
**Constraint:** $0 total spend. Demo must open on a judge's phone from a QR code.
**Target:** Vercel Hobby + Supabase Free + Gemini free tier.

---

## 1. Platform decision: Vercel, not Netlify

You asked about Netlify for cost reasons. **Cost is not the deciding factor — both are free
at this scale.** So the choice should be made on risk, and there Vercel wins clearly:

| | Vercel Hobby | Netlify Free |
|---|---|---|
| Cost for this demo | $0 | $0 |
| Next.js 15 App Router | First-party. Vercel builds Next.js. | Supported via Next Runtime, but a translation layer |
| Route handlers / middleware | Native | Mapped onto Netlify Functions + Edge Functions |
| Setup effort | Import repo, add env vars, done | Same, plus runtime quirks to debug |
| Risk of a framework edge case eating 3 hours | Low | Non-trivial |

Netlify is a perfectly good host; it is simply the wrong trade here. You would pay for it in
debugging time rather than money, and debugging time is the scarce resource in a 48h build.
There is no cost saving to offset that.

**Decision: Vercel Hobby.**

One honest caveat: Vercel's Hobby plan is for non-commercial use. A hackathon demo is
squarely within that. If MoveScan later becomes something you sell or show to paying
customers, that requires a Pro plan — a licensing question for later, not a technical one.

---

## 2. The one real blocker: the 4.5 MB request body limit

**This will fail on Vercel while working perfectly on localhost.** It is the single most
important item in this document.

Vercel Functions cap the request body from client to function at **4.5 MB**
([limits](https://vercel.com/docs/functions/limitations)). Your `/api/analyze` route accepts
a multipart upload of up to **12 files at up to 4 MB each** — a theoretical 48 MB.

`app/api/analyze/route.ts:26-27`:
```ts
if (files.length > 12) return Response.json({ error: 'Upload no more than 12 images.' }, { status: 400 });
if (files.some((file) => !file.type.startsWith('image/') || file.size > 4 * 1024 * 1024)) { ... }
```

Two things make this worse than it looks:

1. **Vercel rejects the request with a 413 before your handler runs.** Your carefully written
   error message never executes. The user sees a generic platform error.
2. **Even the happy path is marginal.** `downscaleImage` produces roughly 200–400 KB per photo
   at 1024px / q0.8. Twelve of those is 2.4–4.8 MB — straddling the limit. It will work in
   testing with 6 photos of a tidy room and fail on stage with 12 photos of a cluttered one.

That is the worst possible failure profile: passes every rehearsal, fails during the demo.

### Fix A — shrink the payload (recommended for 48h)

Two coordinated changes:

- `lib/image.ts`: reduce to `maxEdge = 800`, `quality = 0.7`. Yields roughly 100–200 KB per
  photo. Recognition accuracy is essentially unaffected — the model is identifying furniture
  classes, not reading serial numbers.
- `app/scan/[sessionId]/page.tsx`: enforce a **total** payload budget client-side, not just a
  per-file one. Sum the downscaled blob sizes and stop at 3.5 MB, leaving headroom under 4.5 MB:

```ts
const MAX_TOTAL_BYTES = 3.5 * 1024 * 1024;

const total = prepared.reduce((sum, p) => sum + p.file.size, 0);
if (total > MAX_TOTAL_BYTES) {
  setError('That is a lot of photos — analysing the first batch. You can add more after.');
  // trim from the end until under budget
}
```

Also lower the server-side per-file cap from 4 MB to 1 MB, so a client that skips downscaling
gets *your* clear error rather than the platform's opaque 413.

### Fix B — bypass the function entirely (correct, but more work)

Have the client upload directly to Supabase Storage using a signed upload URL, then post only
the resulting storage paths to `/api/analyze`. The image bytes never traverse a Vercel
function, so the 4.5 MB limit stops applying at all.

This is the right production architecture and it removes the constraint permanently rather
than working around it. It is also 3–4 hours of work touching the scan page, the analyze
route, and `lib/db.ts`.

**Recommendation: Fix A now, Fix B only if you have spare time after the demo path is solid.**
Fix A is about 30 minutes and removes the failure mode. Do not attempt Fix B on demo day.

---

## 3. Risk to verify on first deploy: function count

You have **14 route handlers** under `app/api/`. Vercel's Hobby plan has a documented limit of
**12 Vercel Functions per deployment**.

I could not confirm whether this limit applies to Next.js App Router route handlers, because
Next.js bundles routes rather than emitting one function per file — so 14 handlers may well
compile to fewer functions. **Treat this as unverified.** The first deploy will tell you
definitively, which is a good reason to deploy early rather than at hour 40.

If the build fails on function count, consolidate rather than upgrade. These merges are
mechanical and lose nothing:

| Merge | Into | Saves |
|---|---|---|
| `api/room/route.ts` + `api/room/[roomId]/route.ts` | one route, branch on presence of `roomId` | 1 |
| `api/item/route.ts` + `api/item/[itemId]/route.ts` | same pattern | 1 |
| `api/session/route.ts` + `api/session/[sessionId]/route.ts` | same pattern | 1 |
| `api/agent/quote/[quoteId]` + `api/quote/[quoteId]` | single quote route, agent auth via header | 1 |

Four merges take you from 14 to 10, comfortably clear.

---

## 4. Supabase free tier — the timing trap

Free tier gives you 500 MB Postgres and 1 GB storage. At roughly 200 KB per capture, 1 GB is
about 5,000 photos. Not a constraint for a hackathon.

**The actual risk is project pausing.** Supabase pauses free projects after a period of
inactivity (commonly cited as ~7 days). A paused project must be manually restored from the
dashboard, and restoration is not instant.

The failure mode: you set Supabase up today, build for two days, demo a week later — and the
database is paused when you open the app on stage.

**Mitigations, in order of reliability:**
1. Open the Supabase dashboard and run one query the morning of the demo. Cheapest insurance.
2. Run `npm run seed-demo` the morning of the demo. This exercises the database and storage
   *and* guarantees the agent console has content.
3. Know that `MOVESCAN_DEMO_MODE=1` bypasses Gemini but **not** Supabase — the app still needs
   the database. Demo mode is not a fallback for a paused project. Do not rely on it as one.

Verify the pausing policy against current Supabase docs rather than trusting the figure above;
I have not confirmed it.

---

## 5. Deployment steps

### 5.1 Pre-flight (before touching Vercel)

- [ ] Apply Fix A from §2. Deploying with the body-size bug just defers the failure.
- [ ] `npx tsc --noEmit && npx vitest run && npx next build --turbopack` — all three green.
- [ ] Push all commits. `origin/main` was behind local `HEAD`; the deploy builds what is
      *pushed*, not what is on your laptop. This is a common and confusing first mistake.

### 5.2 Create the Vercel project

- [ ] Import `abdulmoiz31/smart-logistics` from GitHub at [vercel.com/new](https://vercel.com/new).
- [ ] Framework preset: Next.js (auto-detected). Leave build settings alone.
- [ ] **Do not deploy yet** — add env vars first, or the first build ships a broken app and
      you will debug a stale deployment.

### 5.3 Environment variables

Add each of these in **Settings → Environment Variables**, scoped to Production **and**
Preview (preview deployments are how you test branches):

| Variable | Value | Notes |
|---|---|---|
| `GEMINI_API_KEY` | your key | Secret |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | |
| `GEMINI_FALLBACK_MODEL` | `gemini-3.1-flash-lite` | Separate quota bucket |
| `MOVESCAN_DEMO_MODE` | `0` | Set `1` to force fixtures |
| `SUPABASE_URL` | `https://<ref>.supabase.co` | **Base origin only.** No `/rest/v1/` |
| `SUPABASE_SERVICE_KEY` | your `sb_secret_…` key | Secret. Never `NEXT_PUBLIC_` |
| `AGENT_CONSOLE_SECRET` | your generated secret | Secret |

Every one of these is read server-side only — `grep -rhoE "process\.env\.[A-Z_]+"` confirms no
`NEXT_PUBLIC_` variables exist anywhere in the codebase. Nothing here reaches the browser
bundle, which is what makes it safe to hold the service key.

A `SUPABASE_URL` carrying a `/rest/v1/` suffix returns **401**, so this misconfiguration
impersonates a bad key. If Supabase auth appears broken after deploy, check the URL first.

### 5.4 Deploy and verify

- [ ] Deploy. Confirm the build succeeds — this is also the function-count check from §3.
- [ ] Open the deployment URL on a real phone, not a desktop browser at mobile width.
- [ ] Walk the full path: landing → scan a real room → review → estimate.
- [ ] **Verify the upload with 12 photos, not 3.** This is the §2 failure mode; a three-photo
      test proves nothing.
- [ ] Open `/agent`, log in with `AGENT_CONSOLE_SECRET`, confirm a quote and check the price
      updates on the customer's estimate page.

### 5.5 Demo-day assets

- [ ] Generate a QR code for the production URL. Print it and put it on a slide.
- [ ] Assign a short custom domain in Vercel project settings if the generated URL is unwieldy —
      free, and easier to read aloud than a hash-suffixed preview URL.
- [ ] Run `npm run seed-demo` the morning of the demo — wakes Supabase and fills the agent queue.

---

## 6. Cost

| Service | Tier | Cost | Binding limit for this demo |
|---|---|---|---|
| Vercel | Hobby | $0 | 4.5 MB request body — see §2 |
| Supabase | Free | $0 | Project pausing — see §4 |
| Gemini API | Free | $0 | Per-model daily requests; check `aistudio.google.com/rate-limit` |
| GitHub | Free | $0 | None |
| **Total** | | **$0** | |

No credit card is required for any of these. Nothing in this plan can generate a bill.

---

## 7. Demo-day failure playbook

Print this. Under pressure nobody reasons well.

| Symptom | Likely cause | Action |
|---|---|---|
| Upload fails on many photos, works on few | 4.5 MB body limit (§2) | Use fewer photos per room. Fix A prevents this |
| "Demo mode — using sample results" banner | Gemini quota exhausted | Expected degradation. Carry on; the flow still works |
| "Using our backup model" banner | Primary quota gone, cascade worked | Say so out loud — it is a feature, not a fault |
| Everything 500s, Supabase errors in logs | Project paused (§4) | Restore from the Supabase dashboard. Takes minutes — start immediately |
| Agent console rejects the password | `AGENT_CONSOLE_SECRET` missing in Vercel | Check env vars are set for **Production**, not just Preview |
| Supabase 401 with a key you know is right | `SUPABASE_URL` has a `/rest/v1/` suffix | Trim to the base origin, redeploy |
| Scan page blank on the judge's phone | iOS Safari version issue | Have your own phone ready as the primary demo device |

**Rehearse on the actual demo device, on venue wifi, three times.** Every item above is
cheaper to discover in rehearsal than on stage.

---

## 8. Explicitly out of scope

Named so nobody spends demo-day hours on them:

- Custom domain beyond a free Vercel subdomain
- CDN or image optimization tuning
- Monitoring, alerting, error tracking (Sentry and similar)
- Load testing — one concurrent user is the real requirement
- Multi-region deployment
- CI/CD beyond Vercel's automatic git deploys
- Database backups — the data is disposable demo content
- Row Level Security — documented as out of scope in the original design, acceptable only
  because no real customer data exists. This would be the **first** thing to fix before any
  real user touched the system.
