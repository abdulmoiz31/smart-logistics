# MoveScan — Consolidated Review, Suggestions & Enhancement Ideas

**Date:** 2026-09-01
**Deployment reviewed:** https://smart-logistics-taupe.vercel.app
**Build:** `48860cd` + subsequent gitignore hardening

**Companion documents (detail lives there, not repeated here):**
- `feedback/2026-09-01-code-review.md` — static review against the approved plan
- `feedback/2026-09-01-live-deployment-test.md` — live production testing, measured

---

## 1. Where the project stands

The build is in good shape. It works end to end in production against the real Gemini API,
the architecture matches the approved plan, and the design invariants that mattered most —
no dimension inputs, range-only pricing, uncertainty surfaced first — all survived
implementation. That is genuinely uncommon at this stage of a hackathon.

What remains is one dead-code bug, one half-implemented UI instruction, and a large
unmeasured assumption.

| Area | Status |
|---|---|
| Pipeline (session → room → upload → analyse → refine → estimate → quote) | Working in production |
| Gemini integration | Live on `gemini-3.5-flash-lite`, not falling back |
| Pricing correctness | Verified: base + labor = subtotal, range = ±tolerance |
| Security (agent endpoints, upload limits) | Correct: 401s and clean 400s |
| Secret hygiene | Fixed after three near-misses. No secret in git history |
| Timeout / fallback ladder | **Broken** — see 2.1 |
| Review screen presentation | **Half-implemented** — see 2.2 |
| Dedupe accuracy on real photos | **Never measured** — see 3 |
| Agent console UI | **Not verified** — see 5 |

---

## 2. Must fix before demo

### 2.1 The Gemini timeout is dead code (one-line fix)

`lib/gemini.ts` builds an `AbortController` and a 12s timer calling `controller.abort()`, but
never hands `controller.signal` to the SDK. The controller is wired to nothing, so **there is
no timeout**.

`abortSignal` is a valid config field in the installed SDK — confirmed at
`node_modules/@google/genai/dist/genai.d.ts:1581`. This is an omission, not a limitation.

The consequence is larger than a missing timeout: the cascade escalates to the fallback model
when it sees a timeout error. With no timeout, a hanging call never raises one, so **the
fallback can never fire on a hang** and the request runs to Vercel's 300s ceiling. The
three-tier ladder — the thing built specifically so a quota failure couldn't kill the demo —
is currently decorative.

```ts
config: {
  responseMimeType: 'application/json',
  responseJsonSchema,
  temperature: 0.1,
  abortSignal: controller.signal,   // <-- add this
}
```

**Verify after fixing:** temporarily set `TIMEOUT_MS = 1000`, run a scan, and confirm
`degraded: true` comes back with the fallback banner. If it doesn't, the fix didn't take.

### 2.2 The review screen looks empty on arrival

With four items in one room, everything visible is:

```
Check your inventory
We've surfaced anything uncertain first…
▶ Looks good
Total volume  164 cu ft   [Get my estimate]
```

The `<details>` collapses to the bare words "Looks good" — no room name, no item count, no
cubic feet — above a screenful of whitespace. A user instructed to "check your inventory" is
shown nothing to check.

Expanded, the content is good. The problem is entirely the collapsed state. Task 6 Step 2
specified collapse **with a summary line**; the collapse landed and the summary did not.

```tsx
<summary>{roomLabel} · {room.items.length} items · {roomCuFt} cu ft</summary>
```

Also auto-expand when the session has exactly one room — collapsing a single room hides
everything and gains nothing.

### 2.3 Cold start reads as a freeze

Measured: first `/api/analyze` after idle **25,178 ms**; warm calls **5,741 ms** and
**6,083 ms**. Roughly 19 seconds of cold Vercel function plus cold Supabase connection.

Not a code fix — a runbook item. Run one complete scan in the two minutes before presenting.
`npm run seed-demo` also works and fills the agent queue at the same time.

---

## 3. The largest open risk: dedupe accuracy is unmeasured

Every test I ran used synthetic canvas images — coloured rectangles. They prove the *pipeline*
works. They say **nothing** about whether Flash-Lite counts one sofa photographed from three
angles as one sofa.

That is the assumption the entire product rests on. It is still completely open.

**My latency figures also understate the demo path**, and this deserves emphasis. I measured
~6s for *one 8KB synthetic image*. Your demo is *12 real photos at ~200KB each* — around 25×
the pixel data. The real figure could plausibly be 15–30s. Three things compound:

1. With 2.1 unfixed, nothing bounds it.
2. The 3.5 MB payload budget has only been exercised on the rejection path, never a real load.
3. A 12-photo room is also where dedupe is hardest — accuracy and latency degrade together.

**One manual run resolves all three.** Real room, 12 photos, actual phone, stopwatch. If it
returns 25s or more, drop the per-room cap from 12 to 6–8 — and change it in **both**
`app/api/analyze/route.ts` and `lib/db.ts::getCaptureBase64`, or the cap is inconsistent.

Task 10 of the lite-tier plan (tier comparison against hand-counted ground truth) remains the
highest-value outstanding work in the project. It is worth more than every polish item in
section 6, because no amount of UI refinement rescues a demo where the model reports three
sofas in a one-sofa room.

---

## 4. Smaller issues

Full detail in the companion documents. Summary:

| # | Issue | Effort |
|---|---|---|
| 1 | Empty "Looks good" renders when every item is uncertain | 5 min |
| 2 | Scan page says "camera opens on your phone" but `capture` was removed in `48860cd` — a picker opens | 2 min |
| 3 | `/review/<bad-uuid>` dead-ends on "Session not found." with no recovery link, unlike the good 404 page | 10 min |
| 4 | Malformed UUID returns 500, not 400 (Postgres uuid-syntax error leaking) | 15 min |
| 5 | "We've surfaced anything uncertain first" shows even when nothing is uncertain | 5 min |
| 6 | Item names render lowercase as the model emits them ("artwork") | 5 min |
| 7 | `tolerance: 0.11999999999999998` float artifact in the API response | 2 min |
| 8 | Items at `confidence: 0.1` are still priced — no floor. Defensible, but should be deliberate | decision |

---

## 5. What I could not verify

Stated plainly so nobody assumes wider coverage than actually happened:

- **Agent console UI.** Logging in requires entering the console password, which I don't do. I
  verified its API returns 401 correctly on all three endpoints, but the rendering, live
  repricing, confirm prefill, out-of-range warning, and edit-rate display are unverified.
  Given the review screen shipped half-implemented, check this yourself rather than assume.
- **Real room photographs.** Pipeline proven, accuracy unproven.
- **A genuine 12-photo payload** at full size.
- **The cascade against real quota exhaustion.** Tested against mocks and an invalid key, never
  an actual 429 from Google.

---

## 6. Enhancement ideas — polish that earns its keep

Ordered by value per hour. **Nothing here should be started before section 2 is done and
section 3 is measured.**

### Tier 1 — high impact, under an hour

**6.1 Staged loading copy that teaches your architecture.** Currently one static line. Cycle
through the actual stages instead:

```
Uploading 8 photos…
Looking for furniture…
Checking for duplicates across your photos…
Matching to our catalogue…
```

This is the best-value item on the list. It makes 15–25s feel shorter, and — more importantly
— the third line **explains your differentiator to a judge while they wait**. You get to
narrate cross-frame dedupe without saying a word. Pure copy plus a `setInterval`.

**6.2 A "See a sample estimate" link on the landing page.** Points at a pre-seeded session.
This is demo insurance disguised as a feature: a judge can see the finished result instantly,
with no cold start, no upload wait, and no risk of a bad detection on unfamiliar furniture. It
takes the two riskiest things in your demo off the critical path while making the product feel
more considered. Strongly recommended.

**6.3 Confidence as a bar, not a percentage.** "50% confidence" is a number; a short amber bar
is instantly legible on a phone held at arm's length by someone who isn't reading carefully.

**6.4 Room progress indicator.** "Room 2 · 164 cu ft so far" in the scan header. Gives the
multi-room flow a sense of momentum, which it currently lacks.

**6.5 Animate the volume ticker** when an item changes. Makes the connection between a tap and
the estimate visible — currently the number just changes and nothing signals cause and effect.

### Tier 2 — 1 to 3 hours

**6.6 "We saw this in photos 2 and 4."** Add `seenInImages: number[]` to the analysis schema
and show it on each review row. This is the strongest feature idea in this document: it turns
your dedupe claim from an assertion into **visible evidence**. A judge reading "we saw this in
photos 2 and 4, counted once" understands the hard problem you solved without you explaining
it. Schema field, prompt line, and a small UI element.

**6.7 A volume anchor on the estimate.** "A typical 2-bedroom move is 800–1,200 cu ft. Yours is
950." A bare cubic-feet figure is meaningless to a customer; an anchor makes the number
trustworthy. One static lookup table.

**6.8 "Why this price" expander** showing the cu ft → dollars chain per line. Reinforces that
pricing is deterministic rather than an AI guess — which is true, and worth making obvious,
because "did the AI make up the price?" is a question you will be asked.

**6.9 Copy-link button on the estimate.** The URL is already shareable. One button turns that
into a feature.

### Tier 3 — worth naming, probably post-hackathon

- **Accessibility pass.** The size chips read as a group of buttons; they should be a
  `radiogroup` with proper labels, and the steppers need accessible names. I did not audit this
  properly — flagging it as unverified rather than broken. Judges rarely test it; real users
  depend on it.
- **Photo thumbnails per room on the review screen.** You already store `capturePaths`.
- **Agent console: photo alongside each item** rather than in a separate strip.
- **Room templates.** "Typical bedroom" one-tap prefill for users who won't photograph.
- **Confidence-weighted range instead of symmetric.** Uncertainty is usually asymmetric — you
  are more likely to have missed items than invented them, so the range should skew upward.
  Genuinely more correct than the current symmetric band.

---

## 7. Demo strategy

Your engineering is largely finished. What decides this now is the narrative, and I think you
are under-using your strongest asset.

Every team will demo "AI looks at a photo and identifies objects." Judges will have seen it
several times before yours. **Your actual differentiator is that the system admits what it
doesn't know** — uncertainty surfaced first, a range rather than false precision, an agent who
narrows rather than overrides. That is a trust argument, and it is rare.

**Lead with the amber "We weren't sure about these — 50% confidence" card**, not with a
successful detection. Then show the range tightening after agent review. Then show the **agent
edit rate** in the console — a measured accuracy figure almost no other team will have.

One framing note: do not pitch this as automating the surveyor away. It doesn't. It lets one
surveyor cover ten times the leads. That claim is more defensible and it survives the obvious
follow-up question, which someone will ask.

Have the roadmap slide ready too — the regulated-estimate constraint (FMCSA 49 CFR 375), photo
PII, and rate-card generality. Naming real constraints you haven't solved reads as competence,
not weakness.

---

## 8. Recommended order for remaining time

1. `abortSignal` one-liner (§2.1) — 2 minutes, restores the fallback ladder
2. Review screen `<summary>` + auto-expand (§2.2) — 20 minutes, largest visible gain
3. **One real 12-photo run on a phone** (§3) — the measurement most likely to change your plans
4. Task 10 tier comparison if step 3 raises doubts
5. Staged loading copy (§6.1) — 30 minutes, teaches your architecture during the wait
6. Sample-estimate link (§6.2) — 45 minutes, removes cold start and detection risk from the demo
7. Cold-start warm-up added to the runbook (§2.3)
8. Quick wins from §4 — items 2, 3, 5, 6 total under 30 minutes
9. `seenInImages` (§6.6) only if everything above is done and rehearsed

**Then stop and rehearse.** Three full runs on the actual demo device, on venue wifi. Every
remaining item in §6 is worth less than the third rehearsal.
