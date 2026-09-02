# Demo Data, Customer-Flow Polish, Photo Annotations & Accessibility

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the new charts data worth charting, bring the customer-facing flow up to the console's visual standard, put bounding-box annotations where they help rather than where they hurt, and close the accessibility gaps flagged across three reviews.

**Architecture:** No new subsystems. The seed generator is a standalone script with its own Supabase client so it can backdate rows without adding seed-only parameters to `lib/db.ts`. The customer flow adopts the console's *type and state tokens* while keeping light surfaces — family resemblance, not a copy. Annotations are an optional field on the existing analyze call plus an overlay inside the already-built `Lightbox`.

**Tech Stack:** unchanged. Next.js 15 App Router, Tailwind v4, `@google/genai` 2.19.0, Supabase, Vitest. **No new dependencies.**

**Inputs:**
- `docs/superpowers/plans/2026-09-02-console-theming-previews-charts.md` (complete, **uncommitted at time of writing**)
- `docs/superpowers/plans/2026-09-01-feature-expansion.md` — Task 13 is superseded by Task 3 here

## Task 0: Commit the outstanding work first

**Do this before anything else.** The theming, chart and lightbox work is finished and
sitting in the working tree with no restore point — 17 changed entries, including all
four new chart components, `lib/chart.ts`, `components/agent/theme.tsx` and
`components/agent/Lightbox.tsx`.

- [ ] **Step 1: Confirm the gate still passes**

```bash
npx tsc --noEmit && npx vitest run && npx next build --turbopack
```
Expected: clean typecheck, 93 tests passing, successful build.

- [ ] **Step 2: Review the two stray untracked entries**

`scripts/verify-themes.ts` and `tmp/` are untracked. Decide deliberately: if
`verify-themes.ts` is a real verification tool, commit it; if it was scratch, delete it.
`tmp/` should almost certainly be deleted and added to `.gitignore` — a committed `tmp/`
is how build junk enters a repo.

- [ ] **Step 3: Commit in coherent chunks and push**

Commit with the repo's own git identity — **pass no author override**. A commit authored
as anything other than `a.moiz28864@gmail.com` is blocked by Vercel and will not deploy.

## Global Constraints

- **Verification gate:** `npx tsc --noEmit && npx vitest run && npx next build --turbopack` before any task is complete.
- **Commit as the repo identity.** No `-c user.email=…`. Vercel blocks unrecognised authors.
- **The seed script must never run against production data unprompted.** It writes only rows it can identify as its own, and destructive behaviour is opt-in behind a flag.
- **Seeding is deterministic.** A fixed PRNG seed, so two runs produce the same demo and the numbers on your slides match what a judge sees.
- **The customer flow stays light.** Adopt the type scale, accent and state tokens; do **not** give it the dark console surfaces or a theme toggle.
- **`components/ItemRow.tsx` is shared** between the customer review page and the agent detail page. Any change to it must be checked in both places.
- **Annotations are agent-only.** They never render on `/review` or `/estimate`.
- **Money is integer cents; volume is cubic feet** to one decimal.

---

## Task 1: Realistic demo data

**Files:** Create `scripts/seed-demo-data.ts`, `data/demo-personas.json`; modify `package.json`, `README.md`

**This is a prerequisite for the charts, not a nice-to-have.** Current live data is
`totalScans=17, estimatedScans=5, confirmedScans=0, meanEditRate=0`, and
`scripts/seed-demo.ts` creates exactly one session with one never-confirmed quote. Against
that, the three charts just built will render a funnel whose final stage is empty, a
14-day trend that is nearly flat, a composition chart drawn from ~5 sessions, and an
accuracy hero reading "100% accepted unchanged" that is meaningless because no quote has
ever been confirmed or edited.

Keep the existing `scripts/seed-demo.ts` — it is the single-session fixture used to check
one quote end to end. This is a second, larger generator.

**Interfaces produced:**
- `npm run seed-demo-data` — additive
- `npm run seed-demo-data -- --reset` — removes previously generated demo rows first
- `npm run seed-demo-data -- --sessions 60 --days 21`

- [ ] **Step 1: Understand why this needs its own Supabase client**

A trend chart needs **backdated** rows. `createSession()` in `lib/db.ts` takes no
arguments and `created_at` defaults to `now()`, so every seeded row would land today and
the trend would be a single spike. Rather than adding a seed-only `createdAt` parameter to
production data functions, this script builds its own Supabase client and inserts directly
with explicit `created_at`. Seeding concerns stay out of app code.

- [ ] **Step 2: Make generated rows identifiable**

Every generated session gets `customer_email` ending `@seed.movescan.test`. That is the
**only** marker `--reset` uses to decide what to delete, so nothing a real customer created
can be destroyed by it. State this in the script's header comment.

- [ ] **Step 3: Deterministic randomness**

```ts
/** Mulberry32 — small, deterministic, good enough for demo shaping. */
function makeRng(seed: number) {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = makeRng(20260902);
const pick = <T,>(items: T[]): T => items[Math.floor(rng() * items.length)];
const between = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
```

Deterministic matters for a demo: the median estimate you quote on a slide must be the
number a judge sees on screen.

- [ ] **Step 4: Shape the funnel so the charts read correctly**

Target proportions, over the requested window:

| Stage | Share | Why |
|---|---|---|
| Sessions created | 100% (default 45) | The trend chart's first series |
| Reached an estimate | ~62% | A believable drop; abandoned scans are real |
| Confirmed by an agent | ~55% of estimates | The trend chart's second series |
| Still pending review | 4–6 quotes | So the queue is never empty on stage |

Daily distribution must **not** be uniform. Weight weekdays roughly 1.4× weekends and
add per-day jitter, so the trend line has shape instead of reading as a straight bar. A
perfectly flat trend looks synthetic, which defeats the purpose.

- [ ] **Step 5: Generate realistic inventories**

Per session: 2–5 rooms drawn from `data/catalogue-families.json` groupings, 4–12 items per
room, sizes weighted toward `m`. Include a piano, marble-adjacent or artwork item in
roughly 1 session in 6 so handling chips actually appear in the queue.

**Confidence distribution matters.** Roughly 80% of items above 0.85, 12% between 0.5 and
0.7, 8% below 0.5 with an `uncertainty_reason` drawn from a short list ("partly hidden
behind the sofa", "only visible from one angle", "could not tell the size"). That gives the
review screen's uncertainty section something to show and makes the confidence bands honest.

- [ ] **Step 6: Produce a believable edit rate**

On confirmed sessions only, mark ~10–14% of items `edited_by_user = true` and nudge their
`size_class`. This is the single most important detail in the task: the Insights hero reads
`100 - meanEditRate`, so with zero edits it currently claims **100% accuracy**, which is
both meaningless and the sort of number a judge will probe. A measured 88% is far stronger
than an unmeasured 100%.

Set `confirmed_cents` on confirmed quotes to the subtotal ±4%, and `agent_notes` on some.

- [ ] **Step 7: Implement `--reset` safely**

```
1. Select ids from sessions where customer_email like '%@seed.movescan.test'
2. Delete those sessions — rooms, items, captures and quotes cascade (db/schema.sql
   declares `on delete cascade` on every child table)
3. Report the count deleted before inserting
```

Without `--reset`, the script is purely additive and must not delete anything.

- [ ] **Step 8: Print a summary the operator can check**

On completion, log the resulting funnel, date span, median estimate, total cubic feet and
edit rate. Then open `/agent/leads` and confirm the printed numbers match the charts. That
comparison is the actual test of this task.

- [ ] **Step 9: Wire up and document**

Add the script to `package.json`; document both commands in `README.md` under the demo
runbook, including the note that `--reset` only touches `@seed.movescan.test` rows.

- [ ] **Step 10: Gate and commit**

---

## Task 2: Customer-flow design pass

**Files:** Modify `app/page.tsx`, `app/scan/[sessionId]/page.tsx`, `app/review/[sessionId]/page.tsx`, `app/estimate/[sessionId]/page.tsx`, `components/{Stepper,SizeChips,ItemRow,SimilarItemPicker,AccessFlags,PriceRange,MovingPlan,HandlingBadge}.tsx`, `app/globals.css`

The console now has a deliberate identity — mono numerics, urgency colours, ink-on-panel
hierarchy. The four customer pages still carry the original generic styling: `bg-slate-50`,
`text-cyan-700`, mixed `font-black` headings. **That is the surface a judge sees first and
spends most of the demo inside**, and it now looks like a different product from the console.

### The direction — deliberately not the console's

Do **not** make the customer flow dark. The two audiences are opposites: a dispatcher scans
a board of jobs under time pressure; a homeowner photographs their living room while
anxious about what it will cost. The console is dense and dark because density serves
scanning. The customer flow should be calm, light and spacious.

Family resemblance comes from three shared things only:

1. **Mono, tabular numerics for every figure** — cubic feet, prices, counts, percentages.
   This is the strongest single unifier and the cheapest to apply. A price set in the same
   face as the console's ticket rows reads as the same product instantly.
2. **The same accent and state tokens** — `--c-accent` for primary actions, and the
   `--c-waiting` / `--c-fresh` / `--c-overdue` family for uncertainty, confirmation and
   errors. The amber on the "We weren't sure about these" card becomes the same amber as
   the queue's waiting rail. That consistency is meaningful, not decorative: amber means
   *needs attention* in both places.
3. **One type scale**, shared via tokens rather than per-page `text-3xl font-black`.

- [ ] **Step 1: Add customer surface tokens**

Extend `app/globals.css` with a light-only customer set, alongside the console tokens:

```css
:root {
  /* Customer surfaces — light only, no dark variant by design */
  --u-bg:      #fbfcfd;
  --u-panel:   #ffffff;
  --u-border:  #e6ebf1;
  --u-ink:     #10151f;
  --u-ink-2:   #4a5568;
  --u-ink-3:   #6b7688;
}
```

These are intentionally **not** under `[data-theme='dark']`. The customer flow has one
appearance, and a homeowner's OS preference must not turn their moving estimate dark
mid-scan.

- [ ] **Step 2: Apply the numeric treatment**

Every figure gets `font-mono tabular-nums`. Specifically: `PriceRange`'s headline, the
estimate breakdown values, "Total volume 191 cu ft", `MovingPlan`'s truck/crew/hours,
packing quantities, per-item "120 cu ft each", and confidence percentages.

`tabular-nums` matters beyond looks: it stops the total from jittering horizontally as the
user taps a stepper, which currently makes the number look unstable.

- [ ] **Step 3: Unify headings and actions**

One heading scale across all four pages. Retire ad-hoc `text-cyan-700` for `--c-accent`,
and `bg-cyan-700` buttons for `bg-c-accent text-c-accent-ink`. Keep the existing 44px
minimum tap targets — they are already correct and must not regress.

- [ ] **Step 4: Re-check the two components shared with the console**

`ItemRow` and `HandlingBadge` render in **both** the customer review page and the agent
detail page. After changing them, screenshot both surfaces. If a change improves one and
harms the other, the answer is a variant prop, not a compromise that suits neither.

- [ ] **Step 5: Verify on a real phone at 375px**

All four pages. Confirm no horizontal overflow, tap targets still ≥44px, and the sticky
estimate footer does not cover the last item in the list.

- [ ] **Step 6: Gate and commit**

---

## Task 3: Bounding-box annotations — in the agent lightbox

**Files:** Modify `lib/schema.ts`, `lib/gemini.ts`, `lib/types.ts`, `db/schema.sql`, `lib/db.ts`, `components/agent/Lightbox.tsx`, `app/agent/[quoteId]/page.tsx`; create `components/agent/PhotoAnnotations.tsx`

**This supersedes Task 13 of the feature-expansion plan**, which specified annotations on
customer-facing captures and was correctly left unbuilt.

### Why the placement changed

The original objection stands: a visibly misplaced box is worse than no box, and spatial
coordinates are where a Lite model is weakest. But that objection is about **audience**,
not about the feature. An agent verifying an inventory can use a box that is 20% off — it
still points them at the right region of the photo. A customer or a judge seeing the same
box just sees the AI being wrong.

Two things also changed since that assessment: boxes were never legible on the old 80px
thumbnails, and `components/agent/Lightbox.tsx` now exists as a full-size viewer. The
feature finally has somewhere to live where it helps.

**So: annotations render only inside the agent lightbox.** Never on `/review`, never on
`/estimate`.

- [ ] **Step 1: Add the optional field to the analyze schema**

In `ROOM_ANALYSIS_SCHEMA`'s item properties — **not** in `required`:

```ts
box: {
  type: 'object',
  properties: {
    image: { type: 'integer' },
    x: { type: 'number' }, y: { type: 'number' },
    w: { type: 'number' }, h: { type: 'number' },
  },
},
```

Coordinates are normalised 0–1 relative to the image, so they survive every display
scaling — including the client-side downscale in `lib/image.ts`, which is exactly where a
pixel-coordinate scheme would break.

- [ ] **Step 2: Add one prompt rule in `lib/gemini.ts`**

```
11. For each item you may add "box": the tightest rectangle around the object in ONE
    photograph, as {image, x, y, w, h} where image is the 1-based photo number and x, y,
    w, h are fractions of the image width and height between 0 and 1. Give a box only
    when you are confident of the object's position. Omit it rather than guessing.
```

"Omit rather than guess" is load-bearing — a missing box costs nothing, a wrong one costs
credibility.

- [ ] **Step 3: Validate hard, and drop silently**

In `parseItem`, accept a box only when **all** of these hold:
- `image` is an integer within `[1, imageCount]`
- `x`, `y`, `w`, `h` are finite numbers
- `x` and `y` are within `[0, 1)`; `w` and `h` are within `(0, 1]`
- `x + w <= 1.001` and `y + h <= 1.001` (small epsilon for model rounding)
- `w >= 0.02` and `h >= 0.02` — a sliver box is noise, not a detection

Anything else: **drop the box, keep the item.** Never render a box you are not sure about.
Mirror the existing bounds-checking pattern already used for `seenInImages`.

- [ ] **Step 4: Write the validation tests first**

Add to `lib/schema.test.ts`: a valid box survives; out-of-range `image` drops it;
negative coordinates drop it; `x + w > 1` drops it; a sub-2% box drops it; a non-object
`box` drops it; and in every case **the item itself is still returned**.

- [ ] **Step 5: Persist**

`alter table items add column box jsonb;` plus mapping in `rowToItem` and the insert in
`replaceItems`. Include `box` in the agent quote endpoint's item payload.

- [ ] **Step 6: Build `components/agent/PhotoAnnotations.tsx`**

Props: `{ boxes: { label: string; x: number; y: number; w: number; h: number }[] }`

- An absolutely-positioned overlay over the image, boxes positioned with **percentages**
  (`left: ${x*100}%` etc.) so no JavaScript coordinate maths is needed and the overlay is
  correct at any container size.
- 2px `--c-accent` border, a small label chip anchored to the box's top-left, flipping
  below the box when `y < 0.08` so it is never clipped at the top edge.
- `pointer-events-none` on the overlay so it never blocks lightbox navigation.
- A toggle in the lightbox chrome — "Show detections" — defaulting to **on**, so an agent
  can dismiss the boxes to see the bare photo. That toggle is also the graceful answer to
  a bad box: turn it off and the photo is unobstructed.

- [ ] **Step 7: Extend the Lightbox**

`Lightbox` currently takes `{ urls, index, onClose, onNavigate, label, onRefreshUrls }`.
Add `boxesByImage: Record<number, Box[]>` and render `PhotoAnnotations` for the current
index only. Keep the existing keyboard handling, focus trap and URL-refresh behaviour
untouched.

- [ ] **Step 8: The decision rule — set now, not later**

Test on at least **5 real room photographs**. **If boxes are visibly misplaced on 2 or
more of the 5, revert this task entirely.** Ship without annotations rather than with
wrong ones. Record the result in `feedback/` either way — a negative result is a genuine
finding about Flash-Lite's spatial accuracy and is worth writing down.

- [ ] **Step 9: Gate and commit**

---

## Task 4: Accessibility pass

**Files:** Modify `components/{SizeChips,Stepper,AccessFlags,SimilarItemPicker}.tsx`, `components/agent/console.tsx`, chart components

Flagged as unverified in two previous reviews and never audited. Judges rarely test this;
real users depend on it.

- [ ] **Step 1: `SizeChips` is a radio group, not three buttons**

It currently renders three `<button>` elements, so a screen reader announces three
unrelated controls with no indication that they are one choice or which is selected.

```tsx
<div role="radiogroup" aria-label="Item size">
  {options.map((option) => (
    <button
      key={option.value}
      role="radio"
      aria-checked={value === option.value}
      ...
```

Arrow keys should move between options, matching native radio behaviour.

- [ ] **Step 2: Give steppers accessible names**

`Stepper`'s `−` and `+` buttons announce as "minus" and "plus" with no object. Add
`aria-label={`Decrease ${itemName} count`}` / `Increase`, and put `aria-live="polite"` on
the value so a change is announced. This needs an `itemName` prop threaded from `ItemRow`.

- [ ] **Step 3: Access-flag rows are toggles**

The three "Stairs to reach this room?" rows read as plain buttons. They need
`aria-pressed={selected}` so their state is announced.

- [ ] **Step 4: Visible focus everywhere**

Audit every interactive element for a visible focus ring — especially the thumbnail
buttons from the lightbox work, the console tabs, the theme toggle and the chart
table-view toggle. `focus-visible:outline-2` with an offset; never `outline-none` without
a replacement.

- [ ] **Step 5: Respect reduced motion**

Wrap the staged analysis copy rotation, the lightbox transition and any chart animation in
`@media (prefers-reduced-motion: reduce)` guards. The staged loading text is the one to
check first — a 2.5s rotating label is exactly what that preference exists to stop.

- [ ] **Step 6: Verify with keyboard only, then with a screen reader**

Complete a full scan → review → estimate journey using only the keyboard. Then run
VoiceOver over the review screen and confirm the uncertainty section, size chips and
steppers all announce sensibly.

- [ ] **Step 7: Gate and commit**

---

## Task 5: Two smaller items

- [ ] **Step 1: Console at tablet width**

The console was built desktop-first, and agents plausibly work on an iPad. Check `/agent`,
`/agent/leads` and `/agent/[quoteId]` at 768px and 1024px. The likely problems: the
detail page's `lg:grid-cols-[1fr_22rem]` collapsing awkwardly, ticket rows wrapping into
four lines, and chart axis labels colliding. Fix by letting ticket rows stack their data
line below the wait time under `md`, rather than by shrinking type.

- [ ] **Step 2: Aggregate `getLeadsSummary`**

It runs `.from('sessions').select('id')` and `.from('quotes').select()` — full table scans
counted in JavaScript — and Task 5 of the previous plan added two more queries. With Task 1
raising the row count from ~20 to several hundred, this is worth fixing now: move the
counts into SQL aggregates or a single Postgres view. Not urgent at demo scale, but the
seeded data is what will expose it.

---

## Recommended order

| Order | Task | Effort | Why here |
|---|---|---|---|
| 1 | Task 0 — commit outstanding work | 15m | No restore point currently exists |
| 2 | Task 1 — demo data | 3–4h | The charts are unreadable without it |
| 3 | Task 2 — customer-flow design | 4–5h | The surface judges actually see |
| 4 | Task 4 — accessibility | 2–3h | Cheap, and overdue |
| 5 | Task 3 — annotations | 4–5h | Highest risk; has a revert rule |
| 6 | Task 5 — tablet + aggregation | 2h | Only if time remains |

Roughly **16–20 hours**. Tasks 0–2 are the ones that change what a judge experiences.

**Still open and unchanged by this plan:** real-photo dedupe accuracy has never been
measured. Tasks 1 and 3 both assume the underlying detection is sound — Task 1 fabricates
plausible data, and Task 3 draws boxes around whatever the model reports. Neither tells you
whether the model counts one sofa photographed three times as one sofa. One real 12-photo
run on a phone remains cheaper than any task above.

## Out of scope

- Theming the customer flow. It is light by design (Task 2).
- The two parked problems: return access and abuse/quota control.
- Transactional email — the copy fix already removed the false promise.
- Replacing `scripts/seed-demo.ts`; it stays as the single-quote fixture.
