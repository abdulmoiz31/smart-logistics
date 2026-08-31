# MoveScan — AI Self-Service Moving Survey (Hackathon MVP)

**Date:** 2026-08-31
**Status:** Design approved pending review
**Constraint:** 24–48h build window, team of 2–4 (humans review; AI agents implement)

---

## 1. Problem

Moving companies estimate relocation cost via in-person surveys: an agent visits the
home, inventories items, and prices the move. This is slow, expensive, and limits how
many leads a company can quote.

MoveScan replaces the visit with a self-service phone scan. The customer photographs
each room, AI produces a de-duplicated inventory with volume estimates, the customer
corrects anything wrong, and the system prices the move from the company's rate card.
An agent reviews and confirms before the quote is binding.

## 2. Scope

### In scope (demo-critical)

- Mobile-web capture flow, room by room, no signup
- Gemini-based room-batch recognition producing a consolidated inventory
- Targeted second-pass refinement for low-confidence / size-ambiguous items
- Deterministic catalogue lookup mapping item class → canonical cubic feet
- Customer review screen: adjust counts, sizes, remove items, add missed items
- Per-room access questions (stairs, elevator, long carry)
- Rate-card pricing engine producing an estimate **range**
- Agent review console: see inventory + photos, adjust, confirm quote

### Explicitly out of scope

| Cut | Reason |
|---|---|
| Multi-tenancy / white labeling | One hardcoded demo company is indistinguishable on stage |
| Real authentication | Anonymous session tokens only; agent console behind a shared secret |
| Offline upload queue | Demo runs on venue wifi |
| AR / depth measurement | Not available in mobile web |
| CRM integration | Roadmap slide, not code |
| PCI / PII retention controls | Demo uses team-owned photos only. See §9 |
| Video sweep capture | ffmpeg on serverless + large uploads = integration risk |
| Voice item description | Unreliable on iOS Safari (likely demo device). Stretch goal only |

### Stretch goals (only if ahead of schedule at hour 30)

1. Voice description for unmatched items
2. Second demo rate card to show pricing is data-driven, not hardcoded
3. Accuracy telemetry screen (agent-edit rate as a quality metric)

## 3. Architecture

Single Next.js (App Router) repository deployed to Vercel. One language, one repo,
so implementing agents can hold the whole system in context.

```
/app
  /scan/[sessionId]         camera capture, room by room
  /review/[sessionId]       editable inventory
  /estimate/[sessionId]     quote range + email capture
  /agent                    queue of pending quotes
  /agent/[quoteId]          review + confirm
/app/api
  /session                  POST  create anonymous session
  /analyze                  POST  room images -> inventory (Gemini)
  /refine                   POST  one item, room images -> size class (Gemini)
  /estimate                 POST  inventory + access -> price range
  /quote/[id]/confirm       POST  agent confirmation
/lib
  gemini.ts                 client + schemas
  catalogue.ts              class -> cubic feet lookup
  pricing.ts                pure pricing functions
  db.ts                     Supabase client
/data
  catalogue.json            ~60 curated household items
  ratecard.json             demo company rate card
```

**Storage:** Supabase — Postgres plus object storage plus a free tier in one service.
Images go to a Storage bucket; rows reference the object path.

**Boundaries.** `pricing.ts` and `catalogue.ts` are pure functions over plain data
with no network and no database access. They are unit-testable without touching the
Gemini API, which matters because API quota is a finite demo resource and agents
writing tests must not consume it.

### Data model

```
sessions      id, created_at, customer_email?, status
rooms         id, session_id, room_type, access_flags[]
captures      id, room_id, storage_path, created_at
items         id, room_id, name, category, count, size_class,
              cubic_feet, confidence, source, edited_by_user
quotes        id, session_id, subtotal, low, high, breakdown_json,
              status, agent_notes
```

`source` on `items` is one of `ai` | `refined` | `user_added`, and
`edited_by_user` is a boolean. Together these two fields are what make the accuracy
story measurable — the share of AI items a human had to touch is the quality metric,
and it is also the labeling signal a production system would train on.

## 4. Recognition pipeline

Three stages. The model classifies; application code computes.

**Stage 1 — room-batch detect.** All images for one room go into a *single* Gemini
call with a JSON response schema. Because the model sees every frame in one context,
it resolves cross-frame identity itself: the same sectional in images 2, 4, and 7 is
one sectional. This is the design's central decision — it turns double-counting from
an object-tracking problem into a prompt-design problem.

Returns per item: `name`, `category`, `count`, `size_class` (`s`/`m`/`l`),
`confidence` (0–1), `ambiguous_between` (optional array), plus an inferred
`room_type` for the room.

**Stage 2 — targeted refine.** Only items with `confidence < 0.7` **or** a non-empty
`ambiguous_between` get a second call. That call re-sends the same room images with a
single focused question: "consider only the {name}; which of {ambiguous_between} is it,
and what size class?" Typically 2–4 items per room, not all 30.

Deliberately **no image cropping**. Cropping would require bounding boxes from stage 1
and an image-processing dependency, for an accuracy gain the focused prompt mostly
already captures. Precision where it moves the price, without a new library to debug.

**Stage 3 — catalogue snap.** `catalogue.ts` maps `(category, size_class)` to
canonical cubic feet from `catalogue.json`. Unmatched classes fall back to a
category default. No model arithmetic anywhere in the pricing path.

### Failure handling

| Failure | Behavior |
|---|---|
| Gemini timeout or 5xx | Retry once, then surface "add items manually" with the tap-based picker |
| Free-tier quota exhausted | Serve a cached fixture inventory; banner reads "demo mode". **Required before demo day, not optional** |
| Malformed model JSON | Schema-validate; on failure retry once with a repair instruction, then treat as empty room |
| Empty room result | Show "we didn't spot anything — add items manually", never a blank screen |

The quota fallback is a hard requirement. A live demo that dies on a rate limit is
the most preventable way to lose this hackathon.

## 5. Pricing

`pricing.ts` is pure and deterministic:

```
volume        = sum(item.cubic_feet * item.count)
base          = volume * ratecard.per_cubic_foot
accessorials  = per-room access flags -> flat adders
labor         = ceil(volume / ratecard.cuft_per_hour) * ratecard.crew_hourly
subtotal      = base + accessorials + labor
low, high     = subtotal * (1 - tolerance), subtotal * (1 + tolerance)
```

Base and labor both scale with volume, which is intentional for the demo card but
means either term can be zeroed in `ratecard.json` to model a purely volumetric or
purely hourly company. Say this if asked — it demonstrates the engine is data-driven
rather than fitted to one example.

`tolerance` derives from inventory confidence: more low-confidence or user-edited
items widens the band. This makes the range *mean* something rather than being
decoration.

### The two-price problem

The customer is never shown a single number pre-review. They see a **range**, labeled
"confirmed within 2 hours". Agent review **narrows** the range to a firm number; it
does not replace one number with a different number.

A range that tightens reads as progress. A single number that moves reads as a
bait-and-switch. This costs nothing to build and defuses the sharpest question a
judge can ask.

## 6. UX principles (binding on implementation)

1. **No signup before value.** Email is captured on the estimate screen, never before.
2. **No typing in the happy path.** Counts use +/− steppers; sizes use S/M/L chips.
3. **Manual fallback must NOT be a dimensions form.** Users do not know their dresser
   is 52 inches. The fallback is "pick something similar" from the catalogue plus a
   size chip. This is the highest-impact usability decision in the app and the one
   most likely to be implemented wrong by default — hence stated as a prohibition.
4. **Room type is pre-filled by the model** and confirmed with a tap.
5. **Access questions are asked in-room**, as taps, while the user is standing there.
6. **Low-confidence items are pre-flagged** on the review screen: "we weren't sure
   about these 3." Model uncertainty presented as product honesty.

## 7. Build sequence

The organizing principle: **a working end-to-end skeleton before any layer is
thickened.** Because agents write the code, review throughput and integration
debugging are the real bottleneck — not code volume. The specific failure mode to
avoid is broad, unintegrated progress through hour 30 followed by a seam failure at
hour 44 that nobody has the mental model to debug.

There must be a demo-able build at the end of every phase.

### Phase 0 — Skeleton (hours 0–8) · integration owner

Ugly but end-to-end and deployed. One room, three hardcoded catalogue items, one
real Gemini call, a fake flat price. Live on Vercel before anyone optimizes anything.

Exit: a phone can walk photo → inventory → number, on the deployed URL.

### Phase 1 — Parallel thickening (hours 8–24)

Three tracks, each behind a stable interface established in Phase 0:

- **Track A — capture + review UI.** Multi-room flow, steppers/chips, pre-flagged
  low-confidence items, tap-based manual fallback.
- **Track B — recognition.** Room-batch prompt and schema, refine pass, full
  60-item catalogue, quota fallback fixtures.
- **Track C — pricing + agent console.** `pricing.ts` with unit tests, rate card
  JSON, agent queue and confirm screen.

Integration checkpoint at hour 16 and again at hour 24. Non-negotiable: merge to a
deployed build, do not defer.

### Phase 2 — Polish and demo hardening (hours 24–40)

- Loading states that explain what is happening ("looking at 8 photos of your
  living room") — perceived speed matters more than actual speed
- Empty and error states for every screen
- Seed one complete demo session so the agent console is never empty on stage
- Run the full flow on the actual demo phone, on venue wifi, at least three times

### Phase 3 — Freeze (hours 40–48)

Code freeze at hour 40. Remaining time is script, slides, and rehearsal only.
Stretch goals are picked up **only** if Phase 2 finished early.

## 8. Demo script

1. Open on the phone from a QR code — no install, no signup
2. Photograph a real room freely, no aiming instructions
3. Inventory appears, de-duplicated, with 2–3 items pre-flagged as uncertain
4. Correct one item with a tap; add one missed item via the similar-item picker
5. Instant range appears with the confidence band explained
6. Switch to the agent console on a laptop, review, narrow to a firm price
7. Close on the roadmap: what production requires (§9)

Step 3 is the moment that wins or loses the room. Rehearse the room used in step 2
and know what the model returns for it.

## 9. Production roadmap (slide, not code)

Named explicitly because identifying these is itself a signal of seriousness:

- **Regulated estimates.** US interstate household-goods moves are governed by FMCSA
  rules (49 CFR Part 375) covering binding vs non-binding estimates and how they may
  be revised. Agent review is the compliance control, not a convenience. Requires
  legal review before any real customer sees a price.
- **Photo PII.** Interior home photos incidentally capture faces, documents, screens,
  medication, and safes. Production needs encryption at rest, retention limits,
  deletion on request, and access control. Route to the Information Security team;
  this design makes no compliance claim.
- **Rate-card generality.** Real rate cards vary widely: per cu ft, per lb, hourly
  crew plus truck, tariff tables, accessorials, seasonal multipliers, mileage bands.
  A general model is its own project and is typically where these integrations stall.
- **Accuracy flywheel.** Agent corrections are labeled training and eval data. The
  `source` and `edited_by_user` fields already capture it.
- **Access factors beyond goods.** Packing materials, disassembly, shuttle, storage,
  valuation coverage.
- **CRM integration.** Movers work inside SmartMoving / MoveitPro / Supermove.
  Adoption usually depends on fitting into that, not replacing it.

## 10. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Miscount visible on stage | High | Room-batch dedupe; pre-flagged uncertainty; rehearse the demo room |
| Free-tier quota hit live | High | Cached fixture fallback built in Phase 1, not Phase 3 |
| Integration failure at hour 44 | High | Phase 0 skeleton first; checkpoints at 16 and 24; freeze at 40 |
| Review throughput becomes bottleneck | Medium | Stable interfaces set in Phase 0 so tracks review independently |
| Venue wifi | Medium | Test on venue network; keep payloads small; fixture fallback covers total failure |
| Scope creep via stretch goals | Medium | Gated behind Phase 2 completion |

## 11. Testing

- `pricing.ts` and `catalogue.ts` — unit tests, pure functions, no API calls
- Gemini responses — schema validation on every call, with fixtures checked in so
  the review screen can be developed and tested without consuming quota
- One end-to-end happy-path walkthrough, run manually on the demo device each phase

Given the 48h window, tests exist to protect the pricing math and the demo path.
Broad coverage is not a goal.
