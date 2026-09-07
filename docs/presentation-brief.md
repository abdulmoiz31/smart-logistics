# Brief — build the MoveScan hackathon presentation

**For:** Claude Sonnet 5, working in this repo.
**Deliverable:** a presentation file (see §7 for format) plus real screenshots.
**Written:** 2026-09-07, against commit `3bd32c2`.

---

## 0. Read this first

**Do not write the deck from this brief alone.** Every number below was true at
`3bd32c2`, but you must re-verify the ones you put on a slide. A judge asking "is that
number real?" and getting a wrong answer costs more than the slide is worth.

Three rules:

1. **Run the project locally and take your own screenshots.** Instructions in §5. Do not
   describe a screen you have not seen, and do not reuse a screenshot from any doc in
   `feedback/` — they are from earlier builds and the UI has changed.
2. **Verify before you claim.** Test counts, model names, route counts: re-run the command,
   do not trust this file.
3. **If something does not work when you run it, say so in your handback** rather than
   quietly leaving it off the deck. A known-broken thing is a demo risk the team needs to
   hear about before they present.

---

## 1. What the product is

**MoveScan** replaces the in-person moving survey. A customer photographs each room on
their phone; Gemini identifies the furniture; the app computes cubic feet, prices the move
from the mover's rate card, and a human specialist confirms the quote.

The audience is a **moving company** (the demo tenant is "Meridian Moving Co."), and there
are two distinct users:

- **The customer** — a homeowner on a phone, anxious about cost. Light UI, calm, spacious.
- **The dispatcher** — a mover's agent working a queue under time pressure. Dark ops
  console, dense, mono numerics.

That two-audience split is a deliberate design decision, not an accident, and it is worth
one slide.

---

## 2. The pitch — lead with this, not with recognition

Every AI hackathon project this year demos "the model looks at a photo and identifies
things." Judges have seen it. **That is not the interesting part of this project.**

The interesting claim is: **the system tells you what it does not know.**

- Items the model is unsure about are surfaced **first**, under "We weren't sure about
  these," with the confidence percentage and the model's own stated reason.
- The customer never sees a single fake-precise number. They see a **range**, and the range
  **widens** when the inventory is uncertain — `computeTolerance` in `lib/pricing.ts` adds
  to the band for every low-confidence or user-added item.
- A human specialist **narrows** the range to a firm price. It never jumps to a different
  number, so nothing reads as a bait-and-switch.
- The console reports **inventory accuracy as a measured figure** — the share of AI items a
  human accepted unchanged. Not a claim; an observation, computed from `items.edited_by_user`.

That is a trust story, and it is rarer than a recognition demo. Build the deck around it.

**Second-strongest claim: cross-frame de-duplication.** All of a room's photos go into a
**single** Gemini call so the model can reason about object identity across frames — the
same sofa shot from three angles is one sofa, not three. Each item carries `seenInImages`,
so the review screen can say "seen in photos 2 and 4 · counted once." That turns the claim
into visible evidence. Prompt is `ANALYZE_PROMPT` in `lib/gemini.ts`.

**Third: it is not just an estimate, it is a moving plan.** Truck class, crew size, hours,
packing materials and special-handling flags are all derived from the inventory —
deterministically, in `lib/moving-plan.ts`, with no extra AI calls. Pure functions, unit
tested.

---

## 3. Engineering decisions worth a slide

Judges reward evidence of judgement. Pick 3–4 of these; do not list all of them.

**The model classifies, the code computes.** Gemini returns
`{name, category, count, sizeClass, confidence}`. Every arithmetic step — cubic feet,
pricing, truck sizing, tolerance — happens in pure TypeScript. `lib/pricing.ts`,
`lib/moving-plan.ts`, `lib/catalogue.ts` and `lib/chart.ts` import no network, no database
and no `process.env`, which is why they can be unit-tested without spending API quota.

**A three-tier model cascade that cannot throw.** `lib/gemini.ts` tries
`gemini-3.5-flash-lite`, escalates to `gemini-3.1-flash-lite` on a quota or transport
error, and falls back to checked-in fixtures if both fail. It classifies the error first: a
malformed-JSON response is a formatting fault, so it retries the *same* model; a 429 means
that model's quota is gone, so it escalates immediately rather than wasting time. The
customer-facing failure mode is a banner, never an error page.

**Flash-Lite was chosen for quota headroom, and the choice is reversible in one env var.**
Rate limits are per-model within a project, so the fallback has its own bucket.

**Cost: $0.** Vercel Hobby, Supabase free tier, Gemini free tier. No card on file anywhere.

**Charts are hand-built inline SVG with a computationally validated palette.** No chart
library. The categorical colours were run through a colour-blindness and contrast validator
in both light and dark mode; light mode failed the 3:1 contrast check on three slots, so
every chart ships direct labels and a table view rather than relying on colour alone.
Geometry lives in pure, tested functions in `lib/chart.ts`.

**Authorization is in the application layer, deliberately.** Every query uses the Supabase
service key, which bypasses Row Level Security by design — so RLS policies would have no
effect. `lib/session-access.ts` guards nine customer routes; ownership failure and
"not found" return an identical **404**, because a 403 would confirm the id exists.

**Rate limiting is one atomic Postgres function.** `consume_quota` locks every bucket row
before checking, then spends from all of them or none — so concurrent scans cannot both
slip through the last unit. Buckets are per-device, per-IP and per-account.

---

## 4. Verify these before you put them on a slide

| Claim | Command | Value at `3bd32c2` |
|---|---|---|
| Tests passing | `npx vitest run` | 131 across 13 files |
| Typecheck clean | `npx tsc --noEmit` | no output |
| Build succeeds | `npx next build --turbopack` | compiles |
| Database ready | `npm run check-db` | every line `OK` |
| Code size | `find app lib components -name '*.ts*' \| wc -l` | 96 files, ~7,900 lines |
| Commits | `git log --oneline \| wc -l` | 78, from 2026-08-31 |
| Catalogue size | `node -e "console.log(require('./data/catalogue.json').length)"` | 58 items |
| Live demo data | `npm run check-db` then Supabase table editor | 75 sessions, 37 quotes, 1331 items |
| Deployed | `curl -o /dev/null -w '%{http_code}' https://smart-logistics-taupe.vercel.app/` | 200 |

**Do not state a number you did not just see.** If a command fails, put that in the
handback instead of guessing.

---

## 5. Run it locally and capture screenshots

```bash
cd ~/personal-workspace/smart-logistics
npm install
npm run check-db     # must be all OK before anything else
npm run dev
```

`.env.local` already holds the keys. If `check-db` reports anything missing, stop and read
`docs/runbooks/fix-supabase-db.md`.

### Screenshots to take

Save to `docs/presentation/img/`. **Use a mobile viewport (390×844) for customer screens
and desktop (1440×900) for the console** — the customer flow is designed phone-first and
looks wrong wide.

| # | Screen | URL | Viewport | Why it earns a slide |
|---|---|---|---|---|
| 1 | Landing | `/` | mobile | "No credit card. Just photos." |
| 2 | Room capture | `/scan/[id]` | mobile | Access questions asked in-room; staged loading copy |
| 3 | **Review — uncertainty first** | `/review/[id]` | mobile | **The money shot.** Amber card, confidence %, "Check this" |
| 4 | Estimate — range | `/estimate/[id]` | mobile | Range + "Confirmed within 2 hours" + tolerance explained |
| 5 | Estimate — moving plan | same, scrolled | mobile | Truck, crew, hours, handling flags, packing list |
| 6 | **Dispatch queue** | `/agent` | desktop | Urgency rails, handling chips, mono ticket rows |
| 7 | Insights | `/agent/leads` | desktop | Accuracy hero + funnel, trend, composition charts |
| 8 | Quote detail | `/agent/[quoteId]` | desktop | Photo thumbnails, live repricing, confirm-at prefilled |
| 9 | Dark/light pair | `/agent` both themes | desktop | Two shots side by side; the toggle is in the header |

**Getting a session with data:** the fastest path is `npm run seed-demo-data`, then open
`/agent` and follow a quote through to its customer estimate. Alternatively walk the flow
yourself with photos of any room.

**The agent console needs a password** (`AGENT_CONSOLE_SECRET` in `.env.local`). If you
cannot or will not sign in, say so in the handback — do not fake those four screenshots.

**Screenshot hygiene:** no real email addresses, no `localhost:PORT` in the frame if
avoidable, and crop out browser chrome. If a screenshot looks wrong, verify with the DOM
before assuming it is a bug — this project has three recorded instances of a screenshot
artifact being mistaken for a real defect.

---

## 6. Suggested slide order

Adjust freely; this is a starting shape for a 5-minute slot with ~2 minutes of live demo.

1. **Title** — MoveScan, one line: "A moving estimate from your phone, in minutes."
2. **The problem** — in-person surveys are slow and cap how many leads a mover can quote.
3. **The demo** — screenshots 1 → 3 → 4. Land on the uncertainty card.
4. **Why it's trustworthy** — §2. Uncertainty surfaced, range not a number, human confirms,
   accuracy measured.
5. **How de-dup works** — one call per room, `seenInImages`, "counted once."
6. **Not an estimate, a moving plan** — screenshot 5.
7. **The dispatcher side** — screenshots 6 and 7.
8. **Architecture** — one diagram: phone → `/api/analyze` → Gemini cascade → catalogue snap
   → pure pricing → agent review. Mark clearly which box is AI and which is deterministic.
9. **Engineering choices** — 3–4 from §3.
10. **Cost** — $0, with the tiers named.
11. **What's next** — §8. Name the limits honestly.

Keep one number per slide where you can. Do not put the full metrics table on a slide;
it belongs in the appendix or the speaker notes.

---

## 7. Format

Produce **`docs/presentation/movescan.html`** — a single self-contained HTML file, one
`<section>` per slide, arrow-key navigation, no external CDN (inline the CSS, reference the
local screenshots relatively). It opens in any browser, projects reliably, needs no
install, and survives a venue with bad wifi.

Reasons not to use the alternatives: a `.pptx` needs PowerPoint and mangles custom type;
Markdown slides need a renderer installed; Google Slides needs the network.

**Visual direction — match the product, do not invent a new one.** The app's identity is
already defined in `app/globals.css`:

- Console ink `#080c16`, panel `#111827`, accent teal `#2dd4bf`
- Customer light: bg `#fbfcfd`, panel `#ffffff`, ink `#10151f`
- Mono, tabular numerics for every figure — this is the strongest through-line
- State colours: amber = needs attention, teal = confirmed, rose = overdue

A dark deck using the console palette will look like the product. Read the token block at
the top of `app/globals.css` and use those values.

Also write **`docs/presentation/speaker-notes.md`** — per slide: what to say, which number
to quote, and the one question a judge is most likely to ask.

---

## 8. Be honest about the limits

A slide naming real constraints reads as competence. Do not overstate the product.

- **Recognition accuracy on real photographs has never been formally measured.** There is a
  spec for a tier-comparison harness against hand-counted ground truth
  (`docs/superpowers/specs/`), and it has not been run. **Do not put an accuracy percentage
  on a slide unless you measured it yourself.** The console's "accepted unchanged" figure is
  computed from seeded demo data, so it is a demonstration of the mechanism, not a
  validated model claim — say so if asked.
- **Regulated estimates.** US interstate household-goods moves fall under FMCSA rules
  (49 CFR Part 375) covering binding vs non-binding estimates. Agent review is the
  compliance control, and this would need legal review before a real customer saw a price.
  Frame it as understood, not solved.
- **Photo PII.** Interior home photos incidentally capture faces, documents and screens.
  Production needs retention limits, encryption and deletion-on-request. Currently
  demo-grade with a private bucket and signed 1-hour URLs.
- **Rate-card generality.** Real movers price per cu ft, per lb, hourly, or from tariff
  tables. One demo rate card is modelled; a general engine is its own project.
- **Not yet built:** travel fare from pickup/destination distance. The spec is written
  (`docs/superpowers/specs/2026-09-03-route-and-fare-spec.md`) — map pin-drop rather than
  typed addresses, because street addresses do not resolve reliably in Pakistan. Present it
  as the next feature, with the reasoning; that reasoning is itself a good slide.
- **Currency mismatch.** Pricing is USD (`formatCents` hardcodes `$`). If the demo is framed
  as a Pakistani product, mention that localisation is pending rather than letting a judge
  notice it first.

---

## 9. Where to find things

| Need | File |
|---|---|
| Product rationale, original design | `docs/superpowers/specs/2026-08-31-movescan-design.md` |
| Next feature (travel fare) | `docs/superpowers/specs/2026-09-03-route-and-fare-spec.md` |
| Setup, env vars, security decisions | `README.md` |
| Recognition prompt and cascade | `lib/gemini.ts` |
| Pricing and tolerance | `lib/pricing.ts` |
| Truck, crew, packing derivation | `lib/moving-plan.ts` |
| Authorization model | `lib/session-access.ts` |
| Rate limiting | `lib/rate-limit.ts`, `db/migrations/0001_scan_usage.sql` |
| Design tokens | `app/globals.css` |
| Honest self-assessment | `feedback/review/` |

---

## 10. Hand back

When done, report:

1. Which numbers you verified, and any that differed from §4.
2. Which screenshots you captured, and which you could not (with the reason).
3. Anything that did not work when you ran it locally.
4. Any claim in this brief you found to be wrong — that is useful, not rude.

Do not report the deck as finished if screenshots are missing or a number is unverified.
Say which parts are provisional.
