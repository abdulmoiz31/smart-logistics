# Lite Tier Migration + Review Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move recognition onto Gemini Flash-Lite with a model-cascade fallback, and clear every finding from the 2026-09-01 code review so the build deploys and the demo path is correct.

**Architecture:** `lib/gemini.ts` gains a three-tier ladder — primary model, fallback model, fixture — driven entirely by env vars. Every other change is a contained fix to an existing file. No new subsystems.

**Tech Stack:** unchanged. Next.js 15, `@google/genai` 2.19.0, Supabase, Vitest.

**Inputs:** `docs/superpowers/plans/2026-08-31-movescan-mvp.md` (original plan), `feedback/2026-09-01-code-review.md` (findings this plan closes).

## Global Constraints

- **Primary model: `gemini-3.5-flash-lite`. Fallback: `gemini-3.1-flash-lite`.** Both live in env vars; neither appears as a literal in application code outside the documented default.
- **Rate limits are per-model within a project.** The fallback model has its own quota bucket, which is the point of the cascade. Limits are *not* per-API-key — additional keys in one project share one quota. For extra headroom, use separate Google Cloud projects.
- **The cascade must never throw to a caller.** Three tiers: primary → fallback → fixture. `analyzeRoom` and `refineItem` always resolve.
- **`demoMode` and `degraded` are separate flags.** `demoMode` means the fixture path was taken deliberately. `degraded` means a model call failed. Never overload one for the other.
- **A refinement may never make an item worse.** It may only select among the candidate categories it was offered; anything else keeps the original category.
- **`edited_by_user` is set by the caller representing a human action**, never unconditionally inside `updateItem`.
- **Verification gate:** `npx tsc --noEmit && npx vitest run && npx next build` must all pass before any task is considered complete. `npm test` alone is insufficient — it does not typecheck.
- **No API keys are required to complete any task in this plan.** Every task is testable with `MOVESCAN_DEMO_MODE=1`, except Task 10, which is explicitly gated on keys arriving.

---

## Task 1: Fix the production build (P0)

**Files:**
- Modify: `scripts/seed-demo.ts:24-33`

**Interfaces:** none changed.

`npx next build` currently exits 1. JSON imports widen `sizeClass` to `string`, which is not assignable to `SizeClass`. Until this is fixed there is no deployment.

- [ ] **Step 1: Confirm the failure**

Run: `npx next build --turbopack`
Expected: `Failed to compile.` with four `TS2345` errors in `scripts/seed-demo.ts`.

- [ ] **Step 2: Route fixture data through the existing parser**

Do not cast. `parseRoomAnalysis` already returns correctly-typed `DetectedItem[]`, and using it puts seed data through the same validation as live model output — so a malformed fixture fails loudly instead of reaching the database.

```ts
import { parseRoomAnalysis } from '../lib/schema';

const livingRoomItems = parseRoomAnalysis(livingRoom).items;
const bedroomItems = parseRoomAnalysis(bedroom).items;

await replaceItems(livingRoomId, livingRoomItems.map((item) => ({
  ...item,
  cubicFeet: resolveCubicFeet(item.category, item.sizeClass),
  source: 'ai' as const,
  editedByUser: false,
})));

await replaceItems(bedroomId, bedroomItems.map((item) => ({
  ...item,
  cubicFeet: resolveCubicFeet(item.category, item.sizeClass),
  source: 'ai' as const,
  editedByUser: false,
})));
```

- [ ] **Step 3: Verify the full gate**

```bash
npx tsc --noEmit && npx vitest run && npx next build --turbopack
```
Expected: zero type errors, 23 tests passing, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-demo.ts
git commit -m "fix: route seed fixtures through parseRoomAnalysis to restore the build"
```

- [ ] **Step 5: Commit the existing implementation and deploy**

The working tree is currently 18 untracked top-level entries with no restore point. Commit it in coherent chunks (lib, components, app/api, app pages, db, scripts, config), then deploy to Vercel and confirm the URL loads on a phone.

Deployment must be proven working before any further task. A broken deploy discovered later costs far more than it does now.

---

## Task 2: Model cascade configuration

**Files:**
- Modify: `.env.local.example`, `README.md`

**Interfaces:**
- Produces: the env contract Task 3 consumes.

- [ ] **Step 1: Update `.env.local.example`**

```
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

- [ ] **Step 2: Document the tier decision in `README.md`**

Record three things, because whoever picks this up later will ask:
1. Flash-Lite is the primary tier for quota headroom, not for quality.
2. Cross-frame dedupe is the task most at risk on a Lite model — see Task 10 for how to measure it.
3. To escalate, set `GEMINI_MODEL=gemini-3.5-flash`. One env var, no code change.

- [ ] **Step 3: Commit**

```bash
git add .env.local.example README.md
git commit -m "docs: configure Flash-Lite primary with Flash-Lite fallback model chain"
```

---

## Task 3: Three-tier cascade in the Gemini client

**Files:**
- Modify: `lib/gemini.ts`
- Modify: `lib/gemini.test.ts`

**Interfaces:**
- Consumes: `parseRoomAnalysis`, `parseRefinement`, schemas from `lib/schema.ts`.
- Produces (both interfaces gain `degraded`):
  - `interface AnalyzeResult { analysis: RoomAnalysis; demoMode: boolean; degraded: boolean; modelUsed: string | null }`
  - `interface RefineResult { category: string; sizeClass: SizeClass; confidence: number; demoMode: boolean; degraded: boolean }`

**Cascade semantics — implement exactly this:**

| Situation | Action |
|---|---|
| `MOVESCAN_DEMO_MODE=1` or no `GEMINI_API_KEY` | Fixture. `demoMode: true`, `degraded: false`. No network. |
| Primary succeeds | Return it. `demoMode: false`, `degraded: false`, `modelUsed: primary`. |
| Primary returns malformed JSON | Retry **once on the primary** with a repair instruction. Schema failure is a formatting problem; a different model will not fix it. |
| Primary returns 429 / quota / 5xx / timeout | Escalate to the fallback model immediately. Do **not** burn the repair retry — the primary's quota is gone. |
| Fallback succeeds | Return it. `demoMode: false`, `degraded: true`, `modelUsed: fallback`. |
| Fallback also fails | Fixture. `demoMode: true`, `degraded: true`, `modelUsed: null`. |

The distinction in rows 3 and 4 is the substance of this task. Retrying the same exhausted model wastes ~1.5s of a live demo; escalating on a schema error wastes a separate quota bucket on a formatting fault. Classify the error before deciding.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import livingRoom from './fixtures/living_room.json';

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe('demo mode', () => {
  it('serves the fixture without a network call and is not degraded', async () => {
    vi.stubEnv('MOVESCAN_DEMO_MODE', '1');
    vi.stubEnv('GEMINI_API_KEY', '');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { analyzeRoom } = await import('./gemini');

    const out = await analyzeRoom([], 'living_room');

    expect(out.demoMode).toBe(true);
    expect(out.degraded).toBe(false);
    expect(out.modelUsed).toBeNull();
    expect(out.analysis.items).toHaveLength(livingRoom.items.length);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('treats a missing API key as demo mode rather than throwing', async () => {
    vi.stubEnv('MOVESCAN_DEMO_MODE', '0');
    vi.stubEnv('GEMINI_API_KEY', '');
    const { analyzeRoom } = await import('./gemini');
    await expect(analyzeRoom([], 'bedroom')).resolves.toMatchObject({ demoMode: true, degraded: false });
  });
});

describe('error classification', () => {
  it('treats 429, quota, 503, and timeout as quota-ish and everything else as not', async () => {
    const { isQuotaError } = await import('./gemini');
    expect(isQuotaError(new Error('429 Too Many Requests'))).toBe(true);
    expect(isQuotaError(new Error('RESOURCE_EXHAUSTED'))).toBe(true);
    expect(isQuotaError(new Error('503 Service Unavailable'))).toBe(true);
    expect(isQuotaError(new Error('Gemini request timed out'))).toBe(true);
    expect(isQuotaError(new Error('invalid argument'))).toBe(false);
  });

  it('does not classify a SchemaError as a quota error', async () => {
    const { isQuotaError } = await import('./gemini');
    const { SchemaError } = await import('./schema');
    expect(isQuotaError(new SchemaError('items is not an array'))).toBe(false);
  });
});

describe('cascade', () => {
  it('escalates to the fallback model on a quota error and reports degraded', async () => {
    vi.stubEnv('MOVESCAN_DEMO_MODE', '0');
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.stubEnv('GEMINI_MODEL', 'primary-model');
    vi.stubEnv('GEMINI_FALLBACK_MODEL', 'fallback-model');

    const calls: string[] = [];
    vi.doMock('@google/genai', () => ({
      GoogleGenAI: class {
        models = {
          generateContent: async ({ model }: { model: string }) => {
            calls.push(model);
            if (model === 'primary-model') throw new Error('429 RESOURCE_EXHAUSTED');
            return { text: JSON.stringify({ roomType: 'bedroom', items: [] }) };
          },
        };
      },
    }));

    const { analyzeRoom } = await import('./gemini');
    const out = await analyzeRoom([{ base64: 'x', mimeType: 'image/jpeg' }], 'bedroom');

    expect(calls).toEqual(['primary-model', 'fallback-model']);
    expect(out.degraded).toBe(true);
    expect(out.demoMode).toBe(false);
    expect(out.modelUsed).toBe('fallback-model');
  });

  it('retries the primary on a schema error instead of escalating', async () => {
    vi.stubEnv('MOVESCAN_DEMO_MODE', '0');
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.stubEnv('GEMINI_MODEL', 'primary-model');
    vi.stubEnv('GEMINI_FALLBACK_MODEL', 'fallback-model');

    const calls: string[] = [];
    vi.doMock('@google/genai', () => ({
      GoogleGenAI: class {
        models = {
          generateContent: async ({ model }: { model: string }) => {
            calls.push(model);
            if (calls.length === 1) return { text: 'not json at all' };
            return { text: JSON.stringify({ roomType: 'bedroom', items: [] }) };
          },
        };
      },
    }));

    const { analyzeRoom } = await import('./gemini');
    const out = await analyzeRoom([{ base64: 'x', mimeType: 'image/jpeg' }], 'bedroom');

    expect(calls).toEqual(['primary-model', 'primary-model']);
    expect(out.degraded).toBe(false);
    expect(out.modelUsed).toBe('primary-model');
  });

  it('falls back to the fixture when both models fail', async () => {
    vi.stubEnv('MOVESCAN_DEMO_MODE', '0');
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.doMock('@google/genai', () => ({
      GoogleGenAI: class {
        models = { generateContent: async () => { throw new Error('429 RESOURCE_EXHAUSTED'); } };
      },
    }));

    const { analyzeRoom } = await import('./gemini');
    const out = await analyzeRoom([{ base64: 'x', mimeType: 'image/jpeg' }], 'living_room');

    expect(out.demoMode).toBe(true);
    expect(out.degraded).toBe(true);
    expect(out.modelUsed).toBeNull();
    expect(out.analysis.items.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/gemini.test.ts`
Expected: FAIL — `isQuotaError` is not exported; `degraded` and `modelUsed` are undefined.

- [ ] **Step 3: Implement the cascade**

Replace the existing `retry` helper and both entry points. Keep `ANALYZE_PROMPT`, `callGemini`'s request shape (including `responseJsonSchema` — verified correct for SDK 2.19.0), and `isDemoMode` as they are.

```ts
const QUOTA_PATTERNS = [
  '429', 'resource_exhausted', 'quota', 'rate limit',
  '500', '502', '503', '504', 'timed out', 'unavailable',
];

/** Exported for tests. True when a different model is worth trying. */
export function isQuotaError(error: unknown): boolean {
  if (error instanceof SchemaError) return false;
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return QUOTA_PATTERNS.some((pattern) => message.includes(pattern));
}

function primaryModel(): string {
  return process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite';
}

function fallbackModel(): string {
  return process.env.GEMINI_FALLBACK_MODEL ?? 'gemini-3.1-flash-lite';
}

interface CascadeOutcome<T> {
  value: T | null;
  degraded: boolean;
  modelUsed: string | null;
}

/**
 * Primary (with one repair retry on malformed output) then fallback model.
 * A schema error is a formatting fault — retry the same model.
 * A quota or transport error means escalate; retrying it wastes demo seconds.
 */
async function cascade<T>(
  attempt: (model: string, repair: boolean) => Promise<T>,
): Promise<CascadeOutcome<T>> {
  const primary = primaryModel();

  for (let tryIndex = 0; tryIndex < 2; tryIndex += 1) {
    try {
      return { value: await attempt(primary, tryIndex === 1), degraded: false, modelUsed: primary };
    } catch (error) {
      console.error(`[gemini] ${primary} attempt ${tryIndex + 1} failed`, error);
      if (isQuotaError(error)) break;            // primary is exhausted; stop retrying it
      if (tryIndex === 0) await sleep(RETRY_DELAY_MS);
    }
  }

  const fallback = fallbackModel();
  if (fallback && fallback !== primary) {
    try {
      return { value: await attempt(fallback, false), degraded: true, modelUsed: fallback };
    } catch (error) {
      console.error(`[gemini] fallback ${fallback} failed`, error);
    }
  }

  return { value: null, degraded: true, modelUsed: null };
}
```

`callGemini` takes the model as a parameter rather than reading env itself:

```ts
async function callGemini(
  model: string,
  prompt: string,
  images: ImageInput[],
  responseJsonSchema: unknown,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await client().models.generateContent({
      model,
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          ...images.map((image) => ({
            inlineData: { data: image.base64, mimeType: image.mimeType },
          })),
        ],
      }],
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema,
        temperature: 0.1,
        abortSignal: controller.signal,
      },
    });
    const text = response.text;
    if (!text) throw new SchemaError('Gemini returned no response text');
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);   // closes the leaked-timer finding from the review
  }
}
```

If `abortSignal` is not a valid field on `GenerateContentConfig` in the installed SDK
types, keep the `Promise.race` timeout but still `clearTimeout` in a `finally`. Trust
the installed types over this plan and note the deviation in review.

Both entry points then read:

```ts
export async function analyzeRoom(images: ImageInput[], hint?: RoomType): Promise<AnalyzeResult> {
  if (isDemoMode()) {
    return { analysis: fixtureFor(hint), demoMode: true, degraded: false, modelUsed: null };
  }

  const outcome = await cascade(async (model, repair) => parseRoomAnalysis(await callGemini(
    model,
    repair ? `${ANALYZE_PROMPT}\n\nYour previous response was invalid. Reply with only a JSON object matching the schema.` : ANALYZE_PROMPT,
    images,
    ROOM_ANALYSIS_SCHEMA,
  )));

  return outcome.value
    ? { analysis: outcome.value, demoMode: false, degraded: outcome.degraded, modelUsed: outcome.modelUsed }
    : { analysis: fixtureFor(hint), demoMode: true, degraded: true, modelUsed: null };
}
```

`refineItem` follows the same shape. **Its fallback must set `degraded: true` and
`demoMode` to whether the fixture path was taken** — the two must not be conflated,
because Task 5 branches on exactly this distinction.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/gemini.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Full gate**

```bash
npx tsc --noEmit && npx vitest run && npx next build --turbopack
```

- [ ] **Step 6: Commit**

```bash
git add lib/gemini.ts lib/gemini.test.ts
git commit -m "feat: add primary-fallback-fixture model cascade with error classification"
```

---

## Task 4: Harden the prompt for a Lite model

**Files:**
- Modify: `lib/gemini.ts` (`ANALYZE_PROMPT`)

Smaller models follow terse rules less reliably and are weakest at exactly this task's
core: deciding whether two views show one object or two. The current prompt states the
dedupe rule abstractly. Make it concrete and give it a worked example.

- [ ] **Step 1: Strengthen rules 1–3 with an explicit procedure and example**

Insert after the existing numbered rules:

```
How to count correctly:
Work object by object, not photograph by photograph. For each object you see, ask
whether you have already recorded that same physical object from another angle. Use
position in the room, colour, material, and neighbouring objects to decide.

Worked example. Given three photographs where a grey sofa is visible in the first two
from different angles, and a single armchair appears in the third:
  correct   -> [{ "name": "grey sofa", "count": 1 }, { "name": "armchair", "count": 1 }]
  incorrect -> [{ "name": "grey sofa", "count": 2 }, { "name": "armchair", "count": 1 }]
The sofa is one object photographed twice, not two sofas.

If you cannot tell whether two views show the same object or two similar objects,
record the lower count and set confidence below 0.7.
```

That last line is the important one: it biases the model toward under-counting rather
than over-counting. Both are errors, but they are not equally bad on stage. Reporting
three sofas in a room with one destroys credibility instantly; reporting one when there
are two is corrected by the user in a single tap, which is the review screen doing
exactly what it was built for.

- [ ] **Step 2: Verify the fixture tests still pass**

Run: `npx vitest run`
Expected: 23+ tests passing. Prompt text is not asserted, so this is a regression check only.

- [ ] **Step 3: Commit**

```bash
git add lib/gemini.ts
git commit -m "feat: harden dedupe instructions with worked example and under-count bias"
```

---

## Task 5: Fix the refine route (P1-2, P1-3)

> **Do Task 7 first.** Step 5 below passes a third argument to `updateItem` that Task 7
> introduces. Running this task first produces a type error.

**Files:**
- Modify: `app/api/refine/route.ts`
- Create: `app/api/refine/refine-guard.test.ts`

Two live pricing bugs, both on the path uncertain items are deliberately routed through.

**Bug A — a failed refine is persisted as a successful one.** The route writes
`refineItem`'s fallback unconditionally: `source: 'refined'`, `ambiguousBetween: []`,
`sizeClass: 'm'`. The item then claims to have been verified, leaves the uncertain
section, and loses its "Check this" button. A transient 429 is indistinguishable from
a real check.

**Bug B — refinement can collapse an item's volume.** `parseRefinement` coerces an
unrecognised category to `unknown_item`, which is 15 cu ft at size `m`. A sectional
correctly detected at 90 cu ft can therefore refine down to 15 — roughly a 6×
underprice, with no signal in the UI.

- [ ] **Step 1: Write the failing test for the guard**

Extract the decision so it is testable without HTTP or a database.

```ts
import { describe, it, expect } from 'vitest';
import { chooseRefinedCategory } from './refine-guard';

describe('chooseRefinedCategory', () => {
  it('accepts a refinement that picks one of the offered candidates', () => {
    expect(chooseRefinedCategory('sofa_2seat', ['sofa_2seat', 'armchair'], 'armchair'))
      .toBe('sofa_2seat');
  });

  it('keeps the original when the refinement invents a category', () => {
    expect(chooseRefinedCategory('unknown_item', ['sofa_2seat', 'armchair'], 'sofa_sectional'))
      .toBe('sofa_sectional');
  });

  it('keeps the original rather than collapsing to unknown_item', () => {
    expect(chooseRefinedCategory('unknown_item', ['sofa_sectional'], 'sofa_sectional'))
      .toBe('sofa_sectional');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run app/api/refine/refine-guard.test.ts`
Expected: FAIL — cannot resolve `./refine-guard`.

- [ ] **Step 3: Implement the guard**

```ts
// app/api/refine/refine-guard.ts

/**
 * A refinement may only choose among the candidates it was offered. Anything else —
 * including the unknown_item coercion from parseRefinement — keeps the original
 * category, because refinement must never make the inventory worse than the
 * detection it was correcting.
 */
export function chooseRefinedCategory(
  refined: string,
  candidates: string[],
  original: string,
): string {
  return candidates.includes(refined) ? refined : original;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run app/api/refine/refine-guard.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Apply both fixes in the route**

```ts
const refinement = await refineItem(await getCaptureBase64(item.roomId), item.name, candidates);

// Bug A: no verification actually happened. Leave the item flagged so the user can retry.
if (refinement.degraded && refinement.demoMode) {
  return Response.json({ item, demoMode: true, degraded: true, refined: false });
}

// Bug B: never accept a category outside the offered candidates.
const category = chooseRefinedCategory(refinement.category, candidates, item.category);

const updated = await updateItem(item.id, {
  category,
  sizeClass: refinement.sizeClass,
  confidence: refinement.confidence,
  cubicFeet: resolveCubicFeet(category, refinement.sizeClass),
  source: 'refined',
  ambiguousBetween: [],
}, false);   // false = not a human edit; see Task 7

return Response.json({ item: updated, demoMode: refinement.demoMode, degraded: refinement.degraded, refined: true });
```

- [ ] **Step 6: Verify by simulating exhaustion**

Set `GEMINI_API_KEY` to an invalid value, run the flow, tap "Check this" on an
uncertain item, and confirm the item **stays** in "We weren't sure about these" and the
button remains available. Before this fix it would move to "Looks good".

- [ ] **Step 7: Commit**

```bash
git add app/api/refine
git commit -m "fix: never persist a failed refinement or accept an off-candidate category"
```

---

## Task 6: Fix the review screen (P1-4)

**Files:**
- Modify: `app/review/[sessionId]/page.tsx:131-164`

Uncertain items currently render **twice** — once under "We weren't sure about these"
and again under "Looks good", which maps `room.items` unfiltered. This lands on the
single screen the demo is built around, and reads as a bug rather than candour.

- [ ] **Step 1: Exclude uncertain items from "Looks good"**

```tsx
const uncertain = entries.filter(({ item }) => item.confidence < 0.7 || item.ambiguousBetween?.length);
const uncertainIds = new Set(uncertain.map(({ item }) => item.id));
```

Then in the "Looks good" section:

```tsx
{room.items
  .filter((item) => !uncertainIds.has(item.id))
  .map((item) => <ItemRow key={item.id} ... />)}
```

- [ ] **Step 2: Collapse "Looks good" by default**

Specified in the original plan (Task 10) and not implemented. Render each room as a
`<details>` element, or a `useState` toggle, with a summary line reading
`{room.roomType} · {n} items · {cuft} cu ft`. A 40-item inventory is unscannable on a
phone otherwise, and the uncertain section is what you want in the viewport.

- [ ] **Step 3: Hide a room that has no certain items**

Edge case created by step 1: a room where every item is uncertain would render an empty
"Looks good" group. Skip rooms whose filtered list is empty.

- [ ] **Step 4: Verify on a phone**

Confirm each item appears exactly once, uncertain items are above the fold, and rooms
expand on tap.

- [ ] **Step 5: Commit**

```bash
git add "app/review/[sessionId]/page.tsx"
git commit -m "fix: render each item once and collapse reviewed rooms by default"
```

---

## Task 7: Make `edited_by_user` caller-controlled (P1-5)

**Files:**
- Modify: `lib/db.ts` (`updateItem`)
- Modify: `app/api/refine/route.ts` (pass `false` — already done in Task 5)
- Create: `lib/db-edit-flag.test.ts`

`updateItem` currently sets `edited_by_user: true` unconditionally, and the refine route
calls it. Every AI refinement is therefore recorded as a human edit, which corrupts the
`{editRate}% agent edit rate` figure in the agent console — the number nominated as the
accuracy metric and slide material. As written it measures "something touched this".

This was a defect in the original plan, which specified the unconditional behavior.

- [ ] **Step 1: Add the parameter**

```ts
export async function updateItem(
  itemId: string,
  patch: ItemPatch,
  markEdited = true,
): Promise<Item> {
  const update = {
    ...(patch.name === undefined ? {} : { name: patch.name }),
    ...(patch.category === undefined ? {} : { category: patch.category }),
    ...(patch.count === undefined ? {} : { count: patch.count }),
    ...(patch.sizeClass === undefined ? {} : { size_class: patch.sizeClass }),
    ...(patch.cubicFeet === undefined ? {} : { cubic_feet: patch.cubicFeet }),
    ...(patch.confidence === undefined ? {} : { confidence: patch.confidence }),
    ...(patch.source === undefined ? {} : { source: patch.source }),
    ...(patch.ambiguousBetween === undefined ? {} : { ambiguous_between: patch.ambiguousBetween }),
    ...(markEdited ? { edited_by_user: true } : {}),
  };
  // ... unchanged
}
```

The default stays `true`, so `PATCH`/`POST /api/item` — the genuinely human paths —
need no change. Only the refine route opts out.

- [ ] **Step 2: Audit every `updateItem` call site**

```bash
grep -rn "updateItem(" app lib --include=*.ts --include=*.tsx
```

Expected: the refine route passes `false`; every other call site omits the argument.
Any new call site must make a deliberate choice.

- [ ] **Step 3: Verify the metric**

Seed a demo session, refine one item via the API, then open `/agent/[quoteId]` and
confirm the edit rate stays at 0%. Then edit an item as a customer and confirm it rises.

- [ ] **Step 4: Commit**

```bash
git add lib/db.ts app/api/refine
git commit -m "fix: let callers decide whether an item update counts as a human edit"
```

---

## Task 8: Surface `degraded` in the UI

**Files:**
- Modify: `app/scan/[sessionId]/page.tsx`, `app/review/[sessionId]/page.tsx`

`demoMode` and `degraded` now mean different things, and the UI should say so. A
transient failure currently shows "Demo mode — using sample inventory results", which
is misleading and, on stage, alarming.

- [ ] **Step 1: Render three distinct states**

| State | Banner |
|---|---|
| `demoMode && !degraded` | `Demo mode — using sample inventory results.` |
| `degraded && !demoMode` | `Using our backup model — results may be less precise.` |
| `degraded && demoMode` | `We couldn't reach our AI just now — showing sample results. Tap to retry.` |

The third state must offer a retry, because it is the only one where the user's real
photos were never actually analysed.

- [ ] **Step 2: Thread the flags through**

`/api/analyze` already returns `demoMode`; add `degraded`. Update the client's response
type in both pages.

- [ ] **Step 3: Verify all three**

Force each: `MOVESCAN_DEMO_MODE=1`; a valid primary with an invalid fallback; both invalid.

- [ ] **Step 4: Commit**

```bash
git add app/api/analyze "app/scan/[sessionId]/page.tsx" "app/review/[sessionId]/page.tsx"
git commit -m "feat: distinguish demo mode from degraded model fallback in the UI"
```

---

## Task 9: Remaining review findings (P2)

**Files:**
- Modify: `app/api/agent/login/route.ts`, `middleware.ts`, `app/scan/[sessionId]/page.tsx`

- [ ] **Step 1: Distinguish a missing secret from a wrong password**

`AGENT_CONSOLE_SECRET` unset currently returns `Incorrect password.` On demo day a
forgotten env var will present as a typo and cost ten minutes of confused retyping.

```ts
if (!expectedSecret) {
  console.error('AGENT_CONSOLE_SECRET is not set');
  return NextResponse.json(
    { error: 'Agent console is not configured. Set AGENT_CONSOLE_SECRET.' },
    { status: 503 },
  );
}
```

- [ ] **Step 2: Warn before re-analysing a room**

`replaceItems` deletes every row for the room, by design. But a user who corrects items,
returns to the room, and adds one more photo loses every correction with no warning.

Add a confirm step when the room already has items: *"Re-analysing replaces the changes
you made to this room."*

- [ ] **Step 3: Fix the `useEffect` dependency warning**

`app/scan/[sessionId]/page.tsx:72` warns on a missing `createRoom` dependency. Confirm
it cannot create two rooms under React 19 Strict Mode double-invocation — a duplicate
empty room appearing in the agent console mid-demo is a visible defect. Wrap in
`useCallback` or guard with a ref.

- [ ] **Step 4: Verify the gate and commit**

```bash
npx tsc --noEmit && npx vitest run && npx next build --turbopack
git add app/api/agent middleware.ts "app/scan/[sessionId]/page.tsx"
git commit -m "fix: clarify agent config errors, warn before re-analysis, guard room creation"
```

Leave the `<img>` lint warnings. They are defensible for blob previews and not worth the time.

---

## Task 10: Tier accuracy harness

**Files:**
- Create: `scripts/compare-tiers.ts`, `demo/photos/README.md`

**Gated on API keys arriving.** Everything above is testable without them; this task is not.

This is the task that makes the Lite decision a measurement rather than an assumption.
Flash-Lite is the primary tier for quota reasons, and cross-frame dedupe is the task most
at risk on a smaller model. Right now nobody knows the size of that risk.

- [ ] **Step 1: Assemble ground truth**

Photograph 3–5 real rooms, 5–10 photos each, into `demo/photos/<room-name>/`. For each
room write `expected.json` by hand — the true inventory, counted by a person:

```json
{ "roomType": "living_room", "items": [{ "category": "sofa_3seat", "count": 1 }] }
```

Hand-counting is the entire value here. Without it you are comparing two models'
opinions, not their accuracy.

- [ ] **Step 2: Write `scripts/compare-tiers.ts`**

For each room, call `analyzeRoom` once per model in
`['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.5-flash']` by overriding
`process.env.GEMINI_MODEL`, then print:

| Metric | Why it matters |
|---|---|
| Total cu ft vs ground truth (% error) | Directly proportional to price error |
| Over-count events (predicted > actual) | The failure that loses the room on stage |
| Under-count events | Recoverable by the user in one tap |
| Missed categories | Items the user must add manually |
| Mean confidence, and whether low confidence correlates with being wrong | Whether the uncertainty flag is honest |
| Wall-clock latency | Feeds the per-room image cap decision |

That fifth row is the subtle one. If the model is confidently wrong as often as it is
confidently right, then the "We weren't sure about these" section is decoration and the
demo's honesty claim does not hold. Worth knowing before you say it to a judge.

- [ ] **Step 3: Run it and decide**

```bash
npx tsx scripts/compare-tiers.ts
```

Decision rule, set in advance so the result isn't rationalised after the fact:

- Lite over-counts on **no** room and total cu ft error is within ~15% → keep Lite.
- Lite over-counts on **one** room → keep Lite, and strengthen the Task 4 prompt.
- Lite over-counts on **two or more** rooms → set `GEMINI_MODEL=gemini-3.5-flash` and
  demote Lite to the fallback slot. One env var, no code change.

- [ ] **Step 4: Record the numbers in `feedback/`**

Write the table to `feedback/2026-09-01-tier-comparison.md`. This is slide material — a
team that measured its model choice is materially more credible than one that didn't.

- [ ] **Step 5: Commit**

```bash
git add scripts/compare-tiers.ts demo/photos/README.md feedback/
git commit -m "test: add tier comparison harness and record accuracy measurements"
```

---

## Task 11: Demo hardening and final gate

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run the deliberate quota-failure drill**

Original plan Task 12, Step 5 — still not done, and now more important, because Tasks 3
and 5 both live on the failure path. Set an invalid `GEMINI_API_KEY`, run the whole flow,
and confirm: the scan completes, the correct banner shows, uncertain items stay flagged
after a failed "Check this", and an estimate is still produced.

This is the drill that would have caught both refine bugs. Run it after those fixes, not before.

- [ ] **Step 2: Verify the cascade against real quota**

Set `GEMINI_MODEL` to a nonexistent model id and a valid `GEMINI_FALLBACK_MODEL`.
Confirm the flow completes on the fallback and the "backup model" banner appears.
This proves the cascade against the real API rather than a mock.

- [ ] **Step 3: Update the runbook**

Add: the model chain and how to escalate tiers; the per-project (not per-key) quota
note; the three banner states and what each means; `npx tsc --noEmit && npx vitest run
&& npx next build` as the pre-merge gate; and the seed command.

- [ ] **Step 4: Three full rehearsals on the demo device, on venue wifi**

Record actual `/api/analyze` wall-clock time. If it exceeds 10 seconds, drop the
per-room image cap from 12 to 8 in both `app/api/analyze/route.ts` and
`lib/db.ts::getCaptureBase64` — **both**, or the cap is inconsistent.

- [ ] **Step 5: Final gate and commit**

```bash
npx tsc --noEmit && npx vitest run && npx next build --turbopack
git add README.md
git commit -m "docs: record model cascade, quota notes, and demo runbook"
```

---

## Execution order

Tasks 1–9 need no API keys. Do them now, in order; each ends deployable.

| Order | Task | Blocked on keys? |
|---|---|---|
| 1 | Task 1 — build fix, commit tree, deploy | No |
| 2 | Task 2 — env config | No |
| 3 | Task 3 — cascade | No (mocked SDK) |
| 4 | Task 7 — edit flag (adds the `markEdited` param) | No |
| 5 | Task 5 — refine fixes (uses that param) | No |
| 6 | Task 6 — review screen | No |
| 7 | Task 4 — prompt hardening | No |
| 8 | Task 8 — degraded UI | No |
| 9 | Task 9 — P2 batch | No |
| 10 | Task 10 — tier harness | **Yes** |
| 11 | Task 11 — hardening | Partly |

Task 7 precedes Task 5 because Task 5's fix calls `updateItem` with the parameter
Task 7 adds. The dependency runs opposite to the numbering.

Task 1 first and alone: an uncommitted 55-file tree with a failing build has no restore
point, and every later task compounds that risk.

Tasks 4 and 10 are the pair that matter for the Lite decision — one improves the odds,
the other tells you whether it worked. If time runs short, Task 10 is worth more than
any polish task, because it is the difference between choosing a model and hoping about one.
