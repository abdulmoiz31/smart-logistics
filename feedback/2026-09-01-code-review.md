# MoveScan — Code Review Against the Approved Plan

**Date:** 2026-09-01
**Reviewed:** `~/personal-workspace/smart-logistics` @ working tree (implementation is uncommitted)
**Against:** `docs/superpowers/plans/2026-08-31-movescan-mvp.md`
**Verification run:** `npx tsc --noEmit`, `npx vitest run`, `npx next build --turbopack`

---

## Verdict

The implementation is faithful to the plan and better than it in two places. Every
hard design invariant survived contact with the code — including the three most
likely to be silently dropped. Test suite is green (23/23).

**One issue blocks deployment.** Four issues will affect correctness or the live demo.
Nothing found is architectural; all of it is a contained fix.

| Severity | Count | Blocks demo? |
|---|---|---|
| P0 — blocks deploy | 1 | Yes |
| P1 — correctness / demo risk | 5 | Likely |
| P2 — polish / hygiene | 6 | No |

---

## Evidence

```
npx vitest run        →  4 files, 23 tests, all passed (186ms)
npx tsc --noEmit      →  4 errors, all in scripts/seed-demo.ts
npx next build        →  FAILED TO COMPILE
```

---

## P0 — The production build fails

**`scripts/seed-demo.ts:24,26,30,32`** — `npx next build` exits 1. You cannot deploy
to Vercel in this state.

Cause: `livingRoom.items` comes from a JSON import, so TypeScript widens `sizeClass`
to `string`. `ItemInput.sizeClass` requires `SizeClass` (`'s' | 'm' | 'l'`).

```
Type error: Types of property 'sizeClass' are incompatible.
  Type 'string' is not assignable to type 'SizeClass'.
```

This is worth dwelling on, because the failure mode is instructive: the *test suite
passes*. Vitest doesn't typecheck, and the seed script is never imported by the app.
So the only signal is `next build` — which nobody runs until deploy time. This is
precisely the hour-44 integration failure the plan's Phase 0 was designed to prevent,
and it is sitting in the tree right now.

**Fix** — reuse the parser that already normalises these values instead of casting:

```ts
import { parseRoomAnalysis } from '@/lib/schema';

const livingRoomItems = parseRoomAnalysis(livingRoom).items;
const bedroomItems = parseRoomAnalysis(bedroom).items;

await replaceItems(livingRoomId, livingRoomItems.map((item) => ({
  ...item,
  cubicFeet: resolveCubicFeet(item.category, item.sizeClass),
  source: 'ai' as const,
  editedByUser: false,
})));
```

`parseRoomAnalysis` returns `DetectedItem[]` with `sizeClass` correctly typed, so the
error disappears without a cast, and the seed data goes through the same validation
path as live model output. A cast would also compile — but it would let a bad fixture
into the database silently.

**Add to CI or the runbook:** `npx tsc --noEmit && npx next build` before every merge.
`npm test` alone does not protect you here.

---

## P1 — Correctness and demo risk

### 1. `GEMINI_MODEL` default is two generations stale

**`lib/gemini.ts:63`** — `return process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';`

This was my error in the plan, not the implementer's. Google's current free tier
covers `gemini-3.7-flash`, `3.6-flash`, `3.5-flash`, `3.5-flash-lite`, and
`3.1-flash-lite`, all with free image input.

**Fix:** default to `gemini-3.5-flash`; set `gemini-3.5-flash-lite` as the
quota-saving alternative. Because the plan required the id to live in an env var,
this is a one-line change — the constraint did its job.

Verified against [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing).
Note that Google no longer publishes free-tier RPM/RPD figures in the docs; check
`aistudio.google.com/rate-limit` for the account you'll demo on.

### 2. A failed refine is written to the database as a successful one

**`app/api/refine/route.ts:22-33`** — this is the most consequential logic bug found.

`refineItem` never throws (correct, per the plan's ladder). On failure it returns a
fallback: `category: candidates[0]`, `sizeClass: 'm'`, `confidence: 0.5`,
`demoMode: true`. The route then writes that fallback unconditionally:

```ts
const updated = await updateItem(item.id, {
  category: refinement.category,
  sizeClass: refinement.sizeClass,
  confidence: refinement.confidence,
  cubicFeet: resolveCubicFeet(refinement.category, refinement.sizeClass),
  source: 'refined',
  ambiguousBetween: [],   // <-- ambiguity signal destroyed
});
```

Consequences when the API call failed:
- `source` becomes `'refined'` — the item claims to have been verified.
- `ambiguousBetween` is cleared, so the item leaves the "We weren't sure about these"
  section and the "Check this" button disappears.
- `sizeClass` is forced to `'m'`, overwriting a possibly-correct `'l'`.

The user is told the item was checked when nothing was checked. On stage, a transient
429 during the refine step looks exactly like success.

**Fix** — distinguish a real refinement from a fallback and skip the write:

```ts
const refinement = await refineItem(images, item.name, candidates);

if (refinement.demoMode) {
  // No verification actually happened — leave the item flagged as uncertain.
  return Response.json({ item, demoMode: true, refined: false });
}
```

### 3. Refinement can silently collapse an item's volume

**`lib/schema.ts:104`** — `parseRefinement` coerces any unrecognised category to
`unknown_item`. `unknown_item` at size `m` is 15 cu ft.

So a sectional sofa correctly detected at 90 cu ft, flagged ambiguous, then refined
into a garbage category, becomes 15 cu ft. That is a **~6× underprice on a single
item**, and it happens on the path the plan explicitly routes uncertain items through.
Nothing in the UI signals it — the item just gets cheaper.

**Fix** — a refinement may only choose among the candidates it was offered:

```ts
const allowed = new Set(candidates);
const category = allowed.has(refinement.category) ? refinement.category : item.category;
```

Refinement should never be able to make the inventory worse than the detection it was
correcting. Right now it can.

### 4. Uncertain items render twice on the review screen

**`app/review/[sessionId]/page.tsx:163-164`** — `uncertain` is filtered correctly at
line 131, but the "Looks good" section below maps `room.items` unfiltered. Every
low-confidence item therefore appears in both sections.

The plan (Task 10) specified: *"Every other item renders under `Looks good`."*

This undercuts the exact moment the demo is built around. A judge sees the same sofa
in "We weren't sure" and in "Looks good" and reads it as a bug, not as candour.

**Fix:**

```ts
const uncertainIds = new Set(uncertain.map(({ item }) => item.id));
// ...
{room.items.filter((item) => !uncertainIds.has(item.id)).map((item) => <ItemRow ... />)}
```

Also unimplemented from Task 10: "Looks good" should be **collapsed by default**.
Lower priority, but it's what keeps a 40-item inventory scannable on a phone.

### 5. AI refinements inflate the agent-edit-rate metric

**`lib/db.ts` `updateItem`** sets `edited_by_user: true` unconditionally. The refine
route calls `updateItem`. So every AI refinement is recorded as a human edit.

The agent console displays this as `{editRate}% agent edit rate` — the number the plan
nominated as your accuracy metric and slide material. As written it measures
"AI touched this" plus "human touched this", which is not a quality signal at all.

**This is a defect in my plan**, which stated `updateItem` should always set the flag.
That was wrong: the flag should be set by the *caller* that represents a human action.

**Fix** — make it explicit rather than implicit:

```ts
export async function updateItem(
  itemId: string,
  patch: ItemPatch,
  markEdited = true,
): Promise<Item> {
  const update = { /* ... */ ...(markEdited ? { edited_by_user: true } : {}) };
```

Then the refine route passes `false`. Item PATCH/POST from the UI keep the default.

---

## P2 — Polish and hygiene

**6. `demoMode` conflates "demo mode" with "call failed."** `refineItem`'s failure
fallback returns `demoMode: true`, so a transient network error shows the customer a
"Demo mode — using sample inventory results" banner. Separate the flags:
`demoMode` for the deliberate fixture path, `degraded` for failure.

**7. The timeout timer is never cleared.** `lib/gemini.ts:88` races the request against
`sleep(TIMEOUT_MS)`. After the request wins, the 12s timer stays pending. Harmless on
Vercel, but it will keep a local dev process alive between requests and confuse
anyone debugging. Use an `AbortController`, or `clearTimeout` in a `finally`.

**8. Re-analysing a room silently destroys user edits.** `replaceItems` deletes all
rows for the room first — correct and idempotent per the plan — but the scan UI offers
no warning. A user who edits items, returns to the room, and adds one more photo loses
every correction. Add a confirm step: "Re-analysing replaces your edits for this room."

**9. `AGENT_CONSOLE_SECRET` unset locks the console with a misleading error.**
`middleware.ts:6` redirects to login when the env var is missing, and
`app/api/agent/login/route.ts:7` returns `Incorrect password.` for that same case. On
demo day, a forgotten env var presents as a wrong password and will cost you ten
minutes of confused retyping. Return a distinguishable message when the variable is
absent.

**10. `useEffect` missing dependency in the scan page.** `app/scan/[sessionId]/page.tsx:72`
warns on `createRoom`. Worth confirming this cannot create two rooms under React 19
Strict Mode double-invocation — a duplicate empty room would show up in the agent
console mid-demo.

**11. `<img>` instead of `next/image`** in the scan page and agent detail page. Lint
warnings only, and defensible for blob previews. Leave them; not worth the time.

**12. Implementation is entirely uncommitted.** `git status` shows 18 untracked
top-level entries; the only commits are the four spec/plan commits. Commit now, in the
task-sized chunks the plan laid out. An uncommitted 55-file tree with no restore point
is a real risk at hour 40.

---

## Where the implementation beat the plan

Credit where it's due — these are deliberate, correct deviations:

**`responseJsonSchema` instead of `responseSchema`.** The plan said to trust the
installed SDK types over the plan text. The implementer did. Verified in
`node_modules/@google/genai/dist/genai.d.ts:10955`, which documents the migration of
JSON Schema from `responseSchema` to `responseJsonSchema`. The plan's version would
have been wrong on SDK 2.19.0.

**`parseRefinement` extracted into `lib/schema.ts`.** The plan validated refine
responses inline in `gemini.ts`. Pulling it into the schema module made it unit-testable,
and it is now tested. Better boundary than I specified.

**Test consolidation.** 23 tests instead of the plan's 33, but coverage is intact —
each test asserts more. Every invariant I cared about is still verified: catalogue
monotonicity, the catch-all, empty-inventory pricing, labor round-up, the minimum,
integer-cents, and range bracketing. This was the right call, not a shortcut.

**Additions:** `SessionDetails`, `QuoteSummary`, `SessionStatus`, `Room.capturePaths`.
All needed by screens the plan described but did not fully type. Sensible.

---

## Design-invariant audit

The plan named several rules as most-likely-to-be-dropped. All held:

| Invariant | Status |
|---|---|
| `SimilarItemPicker` contains no numeric/dimension input | **Held.** Category tap + size chip only. Zero `<input>` elements. |
| `PriceRange` shows a range and the exact copy `Confirmed within 2 hours` | **Held.** Verbatim, and no single-price prop exists. |
| No customer-facing single price before confirmation | **Held.** Estimate page shows a firm number only when `status === 'confirmed'`. |
| Gemini ladder never throws to the caller | **Held.** `retry()` returns `null`; both entry points fall back to fixtures. |
| Volume recomputes on every size/category change | **Held.** `PATCH /api/item/[itemId]` calls `resolveCubicFeet` on every patch. |
| Agent confirm field pre-filled with subtotal | **Held.** `agent/[quoteId]/page.tsx:32`. |
| Out-of-range confirmation warns rather than blocks | **Held.** |
| Loading copy names the real work | **Held.** "Looking at 8 photos of your living room…" |
| 12-photo cap accounts for already-added photos | **Held.** `Math.max(0, 12 - photos.length)`. |
| `downscaleImage` failure falls back to the original file | **Held.** |
| Uncertain items surfaced first | **Held**, but see P1-4 — they also render again below. |
| "Looks good" collapsed by default | **Not implemented.** P2. |

---

## Recommended order of work

1. **P0** — fix `seed-demo.ts`, confirm `npx next build` passes, deploy to Vercel. Do
   this before anything else; until it's done you have no deployment.
2. **Commit the tree** in task-sized chunks.
3. **P1-1** — change the model default to `gemini-3.5-flash`, verify one real call.
4. **P1-2 and P1-3** — the refine route. Both are small and both are live price bugs.
5. **P1-4** — the double-render. Cheapest fix with the largest demo payoff.
6. **P1-5** — the edit-rate flag, if you intend to put that number on a slide.
7. **P2-9** — the agent-secret error message. Two minutes, saves ten on demo day.
8. Everything else only if Phase 2 finishes early.

## Not yet verified

Out of reach from a static review — carry these into your own testing:

- No live Gemini call was made. The `callGemini` shape typechecks against SDK 2.19.0,
  but the request has not been proven against the API. Task 5 Step 6 still stands.
- Supabase schema has not been applied or exercised. `db/schema.sql` and `lib/db.ts`
  round-tripping is unproven.
- The deliberate quota-failure drill (Task 12, Step 5) has not been run. Given that
  P1-2 and P1-3 both live on the failure path, run it **after** those fixes — it is
  the test that would have caught both.
