# Live Deployment Test — smart-logistics-taupe.vercel.app

**Date:** 2026-09-01
**Method:** Mobile viewport (375×812) browser session + direct API exercise from page context
**Build tested:** `48860cd` (deployed, matches local `main`, nothing unpushed)

---

## Verdict

**The app works end to end in production against the real Gemini API.** Session, room,
upload, analysis, refinement, estimate, and quote persistence all function. Security on the
agent endpoints is correct. The body-size fix from the deployment plan is in place and
verified working.

Three issues would affect the demo. One is a dead-code bug that silently disables your
timeout, one makes the centerpiece screen look empty on arrival, and one is a cold-start
delay that will look like a freeze on stage.

| Severity | Count |
|---|---|
| P1 — will affect the demo | 3 |
| P2 — polish | 8 |
| Verified working | 15 |

---

## Confirmed working

Measured, not assumed:

- **Real Gemini is live.** `/api/analyze` returned `demoMode: false, degraded: false` —
  `gemini-3.5-flash-lite` is responding and the cascade is not falling back.
- **The model doesn't hallucinate on garbage input.** Fed a flat grey rectangle, it returned
  `items: []` rather than inventing furniture. Fed coloured blocks, it returned one item at
  `confidence: 0.5`. That is honest behaviour and it is what makes the uncertainty UI truthful.
- **Room type inference works.** A plausible room image returned `roomType: "living_room"`.
- **Body-size fix verified.** A 2 MB upload returned `400` with *your* message — "Each upload
  must be an image no larger than 1 MB" — not Vercel's opaque 413. `image.ts` is at 800px/q0.7
  and the scan page enforces a 3.5 MB total budget. This was the deployment plan's headline
  risk and it is closed.
- **Agent endpoints are properly locked.** `/api/agent/queue` → 401, wrong password → 401,
  `/api/quote/[id]/confirm` without the secret → 401.
- **The Task 7 fix works in production.** After a refine, `editedByUser` stayed `false` while
  `source` became `refined`. The agent-edit-rate metric is honest.
- **The refine candidate guard holds.** Confidence went 0.5 → 0.8 with the category preserved.
  No collapse to `unknown_item`, which was the ~6× underprice bug.
- **Pricing is correct and transparent.** 164 cu ft → base $238 + labor $290 + access $0 =
  $528, range $464–$591 at 12% tolerance. The breakdown adds up to the midpoint.
- **Required copy is present verbatim:** "Confirmed within 2 hours".
- **No dimension inputs anywhere.** The hardest rule in the spec still holds in production.
- **Uncertainty section renders correctly** — amber card, "50% confidence", "Check this".
- **Warm latency is acceptable:** analyze 5.7s / 6.1s, refine 2.8s, estimate 1.9s.
- **No horizontal overflow** at 375px (`scrollWidth === innerWidth`).
- **404 page is good** — "That page is not here" with a "Start a new scan" recovery action.
- **Missing session returns 404**, not a crash.

---

## P1 — Will affect the demo

### 1. The 12-second Gemini timeout is dead code

`lib/gemini.ts` creates an `AbortController` and a timer that calls `controller.abort()` —
but **never passes `controller.signal` to the SDK call**:

```ts
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
try {
  const response = await client().models.generateContent({
    model,
    contents: [...],
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema,
      temperature: 0.1,
      // <-- abortSignal is missing. The controller is wired to nothing.
    },
  });
```

The timer fires at 12s and aborts a controller nothing is listening to. **There is no timeout
at all.**

`abortSignal` *is* a valid field on the config in the installed SDK — confirmed at
`node_modules/@google/genai/dist/genai.d.ts:1581` and four other locations. So this is not an
SDK limitation, it is an omission.

Why it matters: the cascade classifies `'timed out'` as a quota-ish error and escalates to the
fallback model. With no timeout, a hanging call never produces that error, so **the escalation
can never fire on a hang** — the request blocks until Vercel's 300s ceiling. On stage that is
a five-minute frozen spinner with no fallback, which is precisely the failure the three-tier
ladder exists to prevent.

**Fix — one line:**

```ts
config: {
  responseMimeType: 'application/json',
  responseJsonSchema,
  temperature: 0.1,
  abortSignal: controller.signal,
}
```

Then verify: point `GEMINI_MODEL` at a valid model, set `TIMEOUT_MS` to 1000 temporarily, and
confirm the fallback engages and `degraded: true` comes back.

### 2. The review screen looks empty on arrival

This is the app's centerpiece and it currently reads as broken.

Arriving at `/review/[sessionId]` with four items in one room, the entire visible content is:

```
Check your inventory
We've surfaced anything uncertain first. Tap through changes…

▶ Looks good

Total volume  164 cu ft   [Get my estimate]
```

The `<details>` element collapses to the bare words "Looks good" — **no room name, no item
count, no cubic feet.** A user told to "check your inventory" is shown nothing to check, above
a large area of empty screen.

Expanded, the content is genuinely good: room heading, per-item cu ft, steppers, size chips
with plain-language labels. The problem is purely the collapsed state.

This came from Task 6 Step 2, which specified collapse **with a summary line reading
`{room.roomType} · {n} items · {cuft} cu ft`**. The collapse was implemented; the summary was
not. Half the instruction landed.

**Fix:** put the summary in the `<summary>` element, and expand by default when the session
has only one room — collapsing a single room hides everything for no benefit.

```tsx
<summary>{roomLabel} · {room.items.length} items · {roomCuFt} cu ft</summary>
```

### 3. Cold start is ~25 seconds

Measured on the first `/api/analyze` after an idle period: **25,178 ms**. Two subsequent warm
calls on the same route: 5,741 ms and 6,083 ms.

So a cold Vercel function plus a cold Supabase connection costs roughly 19 extra seconds. If
the app has been idle when you present, the first scan looks frozen — and because of P1-1
there is currently no timeout to bound it.

**Mitigations, cheapest first:**
1. Hit the deployed URL and run one full scan in the 2–3 minutes before presenting. Keeps the
   function warm and wakes Supabase in one action.
2. Run `npm run seed-demo` as part of your pre-demo routine — it exercises the database and
   fills the agent queue at the same time.
3. Consider a trivial `/api/health` route that touches Supabase, and hit it from your phone
   while walking to the stage.

Do not rely on the demo starting warm. This is the single most likely thing to make the app
look bad through no fault of the code.

---

## P2 — Polish

**4. Empty "Looks good" section renders when every item is uncertain.** With a single
low-confidence item, the page shows the uncertainty card *and* an empty "Looks good"
disclosure. Task 6 Step 3 asked for rooms with no certain items to be skipped; not done.

**5. Copy contradicts behaviour on the scan page.** It reads "Up to 12 photos · camera opens on
your phone", but the file input has `capture="null"` — removed in `48860cd`. The picker opens,
not the camera. Keep the removal (letting users choose saved photos is better for a demo) and
change the copy to "camera or photo library".

**6. `/review/<nonexistent-uuid>` is a dead end.** It renders a bare "Session not found." with
no link out — inconsistent with your genuinely good 404 page. Give it the same "Start a new
scan" action.

**7. A malformed UUID returns 500, not 400.** `/api/session/not-a-uuid` → 500. Postgres's
invalid-uuid-syntax error is leaking through as a server error. Validate the format, or map
that Postgres error code to 400.

**8. Uncertainty copy shows unconditionally.** "We've surfaced anything uncertain first"
appears even when nothing is uncertain. Render it only when the uncertain list is non-empty.

**9. Item names render lowercase**, as the model emits them — "artwork" rather than "Artwork".
Title-case for display only; don't mutate stored data.

**10. Float artifact in the API response.** `tolerance: 0.11999999999999998`. Displayed
correctly as 12% via `Math.round`, so cosmetic — but round it at the source.

**11. Very-low-confidence items are still priced.** An item at `confidence: 0.1` contributed
15 cu ft to the total. Defensible — the review screen surfaces it for correction, which is the
design — but there is no floor. Worth a conscious decision rather than an accident.

---

## Not tested — and one of these matters a lot

**The agent console UI was not tested.** Logging in requires entering the console password, and
entering credentials to authenticate is not something I do. I verified the API layer returns
401 correctly on all three agent endpoints, but the console's rendering, live repricing,
confirm prefill, and edit-rate display need your own eyes. Given the review screen's collapsed
state shipped half-implemented, I would not assume the console is correct without looking.

**Dedupe accuracy is still completely unmeasured, and it is the core product risk.** Every
test above used synthetic canvas images — coloured rectangles, not rooms. They prove the
*pipeline* works. They say nothing about whether Flash-Lite counts one sofa photographed from
three angles as one sofa.

That is the question the whole design rests on, and it is still open. **Task 10 of the
lite-tier plan — the tier comparison harness with hand-counted ground truth — is now the
highest-value outstanding work in the project.** It is worth more than every P2 in this
document combined, because a 10-minute fix to a copy string cannot save a demo where the model
reports three sofas in a one-sofa room.

**Also untested:** a real 12-photo payload against the 3.5 MB budget. I verified the *rejection*
path with an oversized file, not the happy path at full load. Worth one manual run.

---

## Suggested order

1. **P1-1** — add `abortSignal: controller.signal`. One line, restores the whole fallback ladder.
2. **P1-2** — the `<summary>` line and single-room auto-expand. Highest visible payoff.
3. **Task 10** — measure dedupe on real photos. Do this before any P2.
4. **P1-3** — add the warm-up step to the demo runbook.
5. **P2-5 and P2-6** — copy fix and the dead-end recovery link. Minutes each.
6. Everything else only if time remains.
