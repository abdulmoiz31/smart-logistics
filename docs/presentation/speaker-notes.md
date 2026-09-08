# MoveScan — speaker notes

Deck: `docs/presentation/movescan.html` — open in any browser, arrow keys to
navigate, `F` for fullscreen. 13 slides, ~5 minutes with ~2 minutes of live demo.

Every figure on a slide was re-verified against commit `f73b989` on 2026-09-07.
See the handback at the bottom for the few that drifted from the brief.

Run one real production scan within two minutes of presenting to warm the
hosting, DB and model connections (`README.md` → Verification).

---

## 1 · Title

**Say:** "MoveScan replaces the in-person moving survey. A customer photographs
each room on their phone, an AI builds the inventory, the app prices the move
from the mover's rate card, and a human specialist confirms the number. The
whole thing runs on free tiers."

**Number:** none — this slide is the one-liner.

**Likely question:** *"Who's the customer — the mover or the person moving?"*
Answer: the tenant is the moving company (demo tenant "Meridian Moving Co."),
and there are two users — the homeowner and the mover's dispatcher. That split
is slide 8.

---

## 2 · The problem

**Say:** "Every full-service moving quote starts with someone driving out to walk
the house with a clipboard. It's slow, it has to be scheduled, and it caps how
many leads a mover can quote in a week. The customer waits days; the mover loses
whoever booked with the company that answered first."

**Number:** **1 in-person visit** per estimate, today.

**Likely question:** *"Don't movers already do phone or video estimates?"*
Some do video walkthroughs, but those still need a scheduled call and a person on
the other end. MoveScan is asynchronous — the customer does it at 11pm with no
appointment.

---

## 3 · Demo — capture

**Say:** "No account, no card. Each room asks the three things a mover needs on
site — stairs, elevator, long carry — then you take a few wide photos. The
loading copy narrates the real work: 'Checking for duplicates across your
photos.'"

**Do (live):** start a scan, add a room, photograph it. If the venue wifi is
bad, fall back to the screenshots.

**Number:** **3 free AI scans/day** per device before a signup prompt (9/IP;
15/day for a free account). Configurable via env vars.

**Likely question:** *"What if the photos are bad?"* Low-confidence items get
surfaced for a check (next slide); genuinely unusable rooms can be re-analysed
or the customer adds items by hand.

---

## 4 · Demo — what it doesn't know  ← land here

**Say:** "Every AI hackathon demo this year is 'the model looks at a photo and
names things.' You've all seen it. The interesting part of this project is the
other direction — **the system tells you what it isn't sure about, first.**
Uncertain items sit at the top under 'We weren't sure about these,' each with a
confidence percentage and the model's own stated reason: 'partly hidden behind
the sofa,' 'only visible from one angle.' One tap re-checks a single item."

**Number:** the confidence percentages on screen are real (`items.confidence`);
the prompt forces `confidence < 0.7` plus an `uncertaintyReason` under 12 words
when the model is unsure (`ANALYZE_PROMPT` in `lib/gemini.ts`).

**Likely question:** *"Is the model actually uncertain, or did you prompt it to
look humble?"* Both — the prompt asks for calibrated confidence and a reason,
and the reasons are specific enough ("could not tell the size") that they're
clearly grounded in the image, not boilerplate. We have not formally measured
calibration (slide 12).

---

## 5 · Why it's trustworthy

**Say:** "The customer never sees a fake-precise number. They see a range, and
the range **widens** when the inventory is uncertain — `computeTolerance` adds
to the band for every low-confidence or user-added item. A human specialist
**narrows** it to a firm price; it never jumps to a different number, so nothing
reads as bait-and-switch. And the console reports inventory accuracy as a
*measured* figure — the share of AI items a human accepted unchanged. An
observation, not a claim."

**Numbers:** tolerance floor **8%**, ceiling **30%** (`lib/pricing.ts`); the
screenshot shows a **28%** band on an uncertain 41-item inventory
(`$1,918–$3,411`).

**Likely question:** *"What stops an agent from just rubber-stamping the AI
number?"* Nothing forces a review edit — but every edit is recorded, and the
"accepted unchanged" rate is visible to the mover as a quality signal. If it's
suspiciously high, that's on the dashboard.

---

## 6 · Cross-frame de-duplication

**Say:** "Second-strongest claim. All of a room's photos go into a **single**
Gemini call, so the model can reason about object identity across frames — the
same sofa shot from three angles is one sofa, not three. Every item carries
`seenInImages`, so the review and the dispatcher both show the evidence: 'seen
in photos 1 and 2 · counted once.'"

**Number:** **1 model call per room**, N photos in.

**Likely question:** *"Does that actually work on a Flash-Lite model?"* It's the
task most at risk on a Lite model — the README says so. If it degrades, the fix
is one env var: `GEMINI_MODEL=gemini-3.5-flash`. The `seenInImages` evidence on
screen is how you'd catch it failing.

---

## 7 · Not an estimate — a moving plan

**Say:** "It's not just a price. Truck class, crew size, hours, packing materials
and special-handling flags are all derived from the inventory —
**deterministically**, in `lib/moving-plan.ts`, with no extra AI calls. Pure
functions, unit tested. '20ft box truck · 3 movers · 11 hours' is arithmetic."

**Numbers:** rate card is **$1.45/cu ft**, **$145/crew-hour**, **$495 minimum**
(`data/ratecard.json`, "Meridian Moving Co."); crew throughput **120 cu ft/hour**.

**Likely question:** *"Where do the packing quantities come from?"*
`data/packing.json` — boxes/paper/wrap per 100 cu ft of non-box volume, plus
per-item rules (a mattress bag per mattress, a TV box per TV).

---

## 8 · The dispatcher side

**Say:** "The customer flow is deliberately light and calm. The dispatcher is a
different person — a mover's agent working a queue under time pressure — so it's
a different product: a dark ops console. Urgency rails, handling chips, mono
ticket rows, and an accuracy hero computed from real edits. Same data, opposite
design."

**Numbers on screen:** **15 quotes** awaiting confirmation, oldest ~**26d**,
median estimate **$1,195**; accuracy hero **91%** "accepted unchanged." (The
"oldest" figure ticks up in real time — it's `now − created_at`.)

**Likely question:** *"Is that 91% real?"* It's computed live from
`leads_summary` (`1 − mean_edit_rate` over confirmed quotes; 90.5% before
rounding) — but the underlying rows are **seeded demo data**, so it's a
demonstration of the mechanism, not a validated model accuracy. Say that
plainly. (Slide 12.)

---

## 9 · Architecture

**Say:** "One AI box. Everything after it is deterministic. The phone downscales
photos in-browser and sends them with the access flags to `/api/analyze`, which
is ownership-checked. Gemini **classifies only** — it returns name, category,
count, size class, confidence, and which photos each item was seen in. Then pure
TypeScript takes over: snap to the 58-item catalogue, price from the rate card,
size the truck and crew, compute the tolerance band. A human narrows the range."

**Number:** exactly **one** box on the diagram is AI.

**Likely question:** *"Why not let the model do the pricing too?"* Because then
you can't unit-test it, you can't audit it, and it costs API quota every time.
`pricing.ts`, `moving-plan.ts`, `catalogue.ts` and `chart.ts` import no network,
no DB and no `process.env` — 131 tests run without touching the API.

---

## 10 · Engineering choices

Pick the two or three that match the room. All four are on the slide.

- **Model classifies, code computes** — see slide 9's answer.
- **A cascade that cannot throw** — `lib/gemini.ts` classifies the error first: a
  malformed-JSON response is a formatting fault, so it retries the *same* model;
  a 429 means that model's quota is gone, so it escalates immediately to a
  fallback model that has its **own** quota bucket (rate limits are per-model
  within a project). If both fail, it serves checked-in fixtures behind a
  customer-facing banner. Never an error page.
- **Authorization in the app layer** — every query uses the Supabase service
  key, which bypasses Row Level Security *by design*, so RLS policies would do
  nothing. `lib/session-access.ts` guards the customer routes; an ownership
  failure and a "not found" both return an identical **404**, because a 403
  would confirm the id exists.
- **Rate limiting is one atomic Postgres function** — `consume_quota` locks
  every bucket row, checks them all, then spends from all or none, so two
  concurrent scans can't both take the last unit
  (`db/migrations/0001_scan_usage.sql`).

**Number:** **131 tests / 13 files**, `tsc --noEmit` clean, `next build`
compiles.

**Likely question:** *"Why is bypassing RLS a good idea?"* It's not that RLS is
bad — it's that if *every* query goes through the service key, RLS policies are
dead code that give a false sense of safety. Better to put the check where it
actually runs and test it (`lib/session-access.test.ts`).

---

## 11 · Cost

**Say:** "Zero. Vercel Hobby for the Next.js app, Supabase free tier for
Postgres and the private storage bucket, Gemini free tier for recognition. No
card on file anywhere. Flash-Lite is the primary model for quota headroom, not
because it's the best — and that choice is reversible in one environment
variable."

**Number:** **$0**.

**Likely question:** *"What breaks first at scale?"* Gemini free-tier quota.
The cascade already handles it (escalate, then fixtures + banner); the real fix
is a paid key, which is a config change, not a rewrite.

---

## 12 · What we're not claiming

**Say:** "A slide of real limits, because overstating this stuff is how you lose
a judge. Recognition accuracy on real photographs has **never been formally
measured** — there's a spec for a tier-comparison harness, and it hasn't been
run. The console's accuracy figure is computed from seeded data. US interstate
moves are regulated under FMCSA rules — agent review is the compliance control,
but a real price needs legal review. Interior photos catch faces and documents;
it's demo-grade today with a private bucket and 1-hour signed URLs. One rate
card is modelled. Pricing is hard-coded USD."

**Number:** none — resist the urge to put an accuracy percentage here.

**Likely question:** *"So how do you know it works at all?"* The mechanism is
demonstrably sound — deterministic pricing is unit-tested, de-dup evidence is
visible per item, uncertainty is surfaced. What's unproven is model recognition
accuracy on real-world photos, and we're not hiding that.

---

## 13 · What's next

**Say:** "The next feature is travel fare — distance-based cost from pickup and
destination. The spec is written, and it calls for a **map pin-drop, not typed
addresses**, because street addresses don't resolve reliably in Pakistan, where
this is aimed. Designing for where the users actually are is the point."

**Numbers (verified at demo build):** 131/13 tests · 0 typecheck errors · build
compiles · 58 catalogue items · ~7,900 lines across 96 files · 79 commits since
2026-08-31 · 91% accepted-unchanged (seeded) · deployment returns 200.

**Likely question:** *"Why Pakistan?"* It's the target market for the product;
the address-resolution problem is real there and drives a concrete design
decision (pin-drop UI) rather than a generic "add maps later."

---

# Handback

## Numbers verified

| Claim | Command | Result |
|---|---|---|
| Tests | `npx vitest run` | **131 passed across 13 files** ✓ matches brief |
| Typecheck | `npx tsc --noEmit` | clean, exit 0 ✓ |
| Build | `npx next build --turbopack` | compiles, exit 0 ✓ |
| Database | `npm run check-db` | every line `OK` ✓ |
| Catalogue | `node -e "…catalogue.json.length"` | **58** ✓ |
| Code size | `find app lib components -name '*.ts*'` | **96 files**, **7,892 lines** ✓ (~7,900) |
| Deploy | `curl … vercel.app` | **200** ✓ |
| Accuracy hero | `leads_summary` view | **90.5%**, displays as **91%** |
| Live demo data | Supabase | **37 quotes, 1,331 items** ✓ |

## Numbers that drifted from the brief

- **Commits: 79, not 78.** The brief was written at `3bd32c2` (78 commits); the
  brief itself was then committed as `f73b989`, making 79. Slide 13 says 79.
- **Demo sessions: 77, not 75.** The brief expected 75. I ran the real
  "start a free scan → add a room" flow **twice** while capturing the room-capture
  screenshot, which created two empty sessions (no items, no quotes — so quote
  and item counts are unchanged). Nothing on a slide cites the session count;
  the Insights screenshot shows 76 (captured between the two test scans).
- **`session-access.ts` guards *ten* route files, not nine.** `grep -rl
  assertSessionAccess app/api` returns 10 (`analyze`, `estimate`, `refine`,
  `item`, `item/[id]`, `room`, `room/[id]`, `quote/[id]`, `session/[id]`,
  `session/[id]/photos`). The deck says "the customer routes" without a number
  to stay safe.

## Screenshots captured

All in `docs/presentation/img/`, taken from the app running locally against the
live Supabase data (real seeded + a few real walkthrough sessions). Mobile
shots at 390×844, console shots at 1440×900, both at 2× DPR. The Next.js dev
overlay was hidden for all of them.

| File | Screen | Session used | Notes |
|---|---|---|---|
| `01-landing.png` | Landing | — | "No card. Just photos." |
| `02-scan.png` | Room capture | fresh scan | Access questions + staged "Add photos" |
| `03-review.png` | **Review — uncertainty first** | seeded (41 items, 10 low-conf) | The money shot; 10 amber cards with confidence % and reasons |
| `03b-dedup.png` | Review — de-dup evidence | real walkthrough | "Seen in photos 1 and 2 · counted once" on real items; long page, used as backup |
| `04-estimate.png` | Estimate — range | seeded | `$1,918–$3,411`, "Confirmed within 2 hours", 28% allowance |
| `05-plan.png` | Estimate — moving plan | same | Truck / crew / hours / handling / packing |
| `06-queue.png` | Dispatch queue | live data | 15 quotes, urgency rails, handling chips |
| `07-insights.png` | Insights | live data | 91% accuracy hero, funnel, trend, composition |
| `08-quote-detail.png` | Quote detail | real walkthrough | Photo thumbnails, live repricing, "outside the range" guard, confirm-at prefilled, de-dup evidence per item |
| `09-queue-dark.png` / `09-queue-light.png` | Dark/light pair | live data | Theme toggle is in the console header |

The deck uses 01, 02, 03, 04, 05, 06, 07, 08. `03b` and the `09` pair are
available if you want to add a de-dup slide or a "two audiences, one system"
slide.

**Branding note (2026-09-08):** the console header used to read "Meridian
Dispatch"; it now shows the **MoveScan** wordmark + a new "MS" logo mark, so both
audiences see one name. New assets: `app/icon.svg` (favicon, teal tile / dark
"MS"), `app/icon.png` + `app/apple-icon.png` + `app/favicon.ico` (raster
fallbacks, generated from the SVG), and `public/logo.svg` (the mark, used in both
headers). All console screenshots above were re-captured with the new branding;
the deck's inlined copies and `movescan.pdf` are regenerated to match.

## Things that did not work / worth knowing

- **The agent console password is in `.env.local`** (`AGENT_CONSOLE_SECRET`).
  I used it to capture screens 6–9. Rotate it before this repo goes anywhere
  public — it, the Supabase service key, and the Gemini key are all live in that
  file (see the `supabase-setup` memo).
- **No pending live quote for the demo.** The DB currently has 0 `pending`
  quotes and 15 `pending_review`. If you want a clean "confirm a fresh quote"
  moment on stage, run `npm run seed-demo` right before presenting, or walk a
  real scan through to `/agent`.
- **`08-quote-detail.png` shows a confirm-at value of $858 flagged "outside the
  range shown to the customer."** That's the seeded median landing outside that
  particular quote's band — the guard-rail working as intended, but if it looks
  odd on a slide, pick a different quote or just confirm within-range live.
- **Seeded customer emails** (`…@seed.movescan.test`) are visible in the dispatch
  queue screenshots. They're obviously synthetic, but if you'd rather not show
  them, the queue's per-row `ref` style (used for non-seeded sessions) is
  cleaner — walk a couple of real scans through first.
- **`npm run dev` and `npm run build` share `.next`.** I killed the dev server
  before the final build; if you re-run the build with dev still up you may get
  a stale or corrupt `.next` — `rm -rf .next` fixes it.

## Claims in the brief that were slightly off

- "§3: `lib/session-access.ts` guards **nine** customer routes" — it's ten (see
  above).
- "§4: Commits **78**" — 79 now, because of the brief's own commit.
- "§4: **75 sessions**" — 77 after my screenshot run (two empty test sessions).
- "§5: `cd ~/personal-workspace/smart-logistics`" — the repo is actually at
  `~/Documents/Personal/smart-logistics` on this machine.

Nothing in the brief's product or architecture description was wrong — the
cascade, the tolerance model, the 404 authz, the atomic rate-limit function and
the pure-function pricing all check out against the code.
