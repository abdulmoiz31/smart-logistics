# MoveScan — Feature Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn MoveScan from "an app that estimates your move" into "an app that produces your moving plan" — adding 11 features plus one outstanding bug fix, without touching the two parked problem areas (return access, abuse control).

**Architecture:** Most new value is **deterministic derivation** from data already stored. A new pure module `lib/moving-plan.ts` computes truck size, crew, hours, packing materials and volume context from the existing inventory — no new AI calls, no new quota, no new runtime failure modes, fully unit-testable. AI-facing changes are additive fields on the existing `ROOM_ANALYSIS_SCHEMA`. Three new surfaces (print view, email, mover dashboard) reuse existing data.

**Tech Stack:** unchanged. Next.js 15 App Router, `@google/genai` 2.19.0, Supabase, Vitest, Tailwind, Vercel Hobby.

**Inputs:**
- `docs/superpowers/plans/2026-09-01-lite-tier-and-review-fixes.md` (previous plan, complete)
- `feedback/review/2026-09-01-consolidated-review.md` (review this plan follows)

## Global Constraints

- **Verification gate:** `npx tsc --noEmit && npx vitest run && npx next build --turbopack` must all pass before a task is complete. `npm test` alone is insufficient — it does not typecheck.
- **`lib/moving-plan.ts` must be pure.** Imports types and JSON only. No network, no database, no `process.env`. It joins `lib/pricing.ts` and `lib/catalogue.ts` as testable-without-quota logic.
- **Money is integer cents. Volume is cubic feet** to at most 1 decimal. No floats in money.
- **No new AI call is introduced by any task.** Tasks 6, 7 and 9 add *fields* to the existing single analyze call. If a task appears to need a second model call, stop and flag it.
- **Every new schema field must be optional and degrade silently.** A model that omits `uncertaintyReason` or `seenInImages` must not break the review screen. Validate in `lib/schema.ts` and default.
- **Do not modify** `/api/analyze` or `/api/refine` rate/abuse behaviour, session resume, or `localStorage` — those belong to the parked problems in §Parked. Touching them creates merge conflicts with that later work.
- **Catalogue is 58 entries** in `data/catalogue.json` with keys `category`, `label`, `cubicFeet{s,m,l}`, `commonIn[]`. Any new key must be optional so existing rows stay valid.
- **Feature 12 (multi-language) is explicitly out of scope** and must not be implemented.

---

## File Structure

| File | Responsibility | New? |
|---|---|---|
| `lib/moving-plan.ts` | Pure. Volume → truck class, crew size, hours, packing materials, volume context. | **New** |
| `lib/moving-plan.test.ts` | Unit tests for the above. | **New** |
| `data/trucks.json` | Truck classes and volume thresholds. | **New** |
| `data/packing.json` | Packing-material derivation ratios. | **New** |
| `data/home-sizes.json` | Typical volume ranges for the volume anchor. | **New** |
| `data/catalogue.json` | Gains optional `handling` field on relevant rows. | Modify |
| `lib/types.ts` | New types for plan output, handling flags, audit entries. | Modify |
| `lib/schema.ts` | `uncertaintyReason`, `seenInImages`, optional `box` added to the analyze schema. | Modify |
| `lib/gemini.ts` | Prompt additions for the new fields. | Modify |
| `components/MovingPlan.tsx` | Renders truck/crew/hours + packing list. | **New** |
| `components/HandlingBadge.tsx` | Special-handling badge. | **New** |
| `components/AuditTrail.tsx` | Per-item provenance. | **New** |
| `components/PhotoAnnotations.tsx` | Bounding-box overlay. | **New** |
| `app/estimate/[sessionId]/page.tsx` | Hosts moving plan, volume anchor, print action. | Modify |
| `app/review/[sessionId]/page.tsx` | Hosts uncertainty reasons, handling badges, photo evidence. | Modify |
| `app/estimate/[sessionId]/print.css` | Print stylesheet. | **New** |
| `app/agent/leads/page.tsx` | Mover dashboard. | **New** |
| `app/api/agent/leads/route.ts` | Dashboard data. | **New** |
| `lib/mail.ts` | Transactional email. **Gated — see Task 11.** | **New** |

---

## Task 1: Fix the room-type override bug

**Files:** Modify `app/api/analyze/route.ts:43`

Carried over from `feedback/review/2026-09-01-consolidated-review.md`. Currently `updateRoomType` runs unconditionally with the model's inference, so a user who explicitly selects "Living room" and gets `other` back has their choice silently discarded. Verified live: a room created as `living_room` displayed as "Other".

The design intent was model-infers → user-confirms. The user's explicit selection must win.

- [ ] **Step 1: Write the failing test**

Create `app/api/analyze/room-type.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveRoomType } from './room-type';

describe('resolveRoomType', () => {
  it('keeps the user hint when the model is unsure', () => {
    expect(resolveRoomType('living_room', 'other')).toBe('living_room');
  });

  it('accepts a confident model inference when the user gave no hint', () => {
    expect(resolveRoomType(undefined, 'bedroom')).toBe('bedroom');
  });

  it('prefers the user hint over a conflicting model answer', () => {
    expect(resolveRoomType('office', 'bedroom')).toBe('office');
  });

  it('falls back to other when neither is available', () => {
    expect(resolveRoomType(undefined, 'other')).toBe('other');
  });
});
```

- [ ] **Step 2: Run it to confirm failure**

Run: `npx vitest run app/api/analyze/room-type.test.ts` — FAIL, module missing.

- [ ] **Step 3: Implement `app/api/analyze/room-type.ts`**

```ts
import type { RoomType } from '@/lib/types';

/**
 * The user's explicit selection always wins. Model inference only fills a gap.
 * A user who picks "Living room" and sees "Other" reads it as the app ignoring them.
 */
export function resolveRoomType(hint: RoomType | undefined, inferred: RoomType): RoomType {
  if (hint) return hint;
  return inferred;
}
```

- [ ] **Step 4: Use it in the route**

Replace line 43's unconditional `await updateRoomType(roomId, result.analysis.roomType);` with:

```ts
const finalRoomType = resolveRoomType(hint, result.analysis.roomType);
await updateRoomType(roomId, finalRoomType);
return Response.json({
  items,
  roomType: finalRoomType,
  demoMode: result.demoMode,
  degraded: result.degraded,
});
```

- [ ] **Step 5: Gate and commit**

```bash
npx tsc --noEmit && npx vitest run && npx next build --turbopack
git add app/api/analyze
git commit -m "fix: let the user's explicit room selection win over model inference"
```

---

## Task 2: Moving-plan engine — truck, crew, hours (Feature 1)

**Files:** Create `lib/moving-plan.ts`, `lib/moving-plan.test.ts`, `data/trucks.json`

**Interfaces produced:**
- `interface TruckPlan { truckLabel: string; truckFeet: number; crewSize: number; estimatedHours: number; trips: number }`
- `planTruckAndCrew(totalCubicFeet: number, accessFlags: AccessFlag[]): TruckPlan`

Effort: **1.5–2h.** Impact: high. This is a lookup table over a number you already compute, and it answers the question customers actually ask.

- [ ] **Step 1: Write `data/trucks.json`**

```json
[
  { "label": "Cargo van",        "feet": 10, "maxCubicFeet": 250,  "crewSize": 2 },
  { "label": "16ft box truck",   "feet": 16, "maxCubicFeet": 800,  "crewSize": 2 },
  { "label": "20ft box truck",   "feet": 20, "maxCubicFeet": 1200, "crewSize": 3 },
  { "label": "26ft box truck",   "feet": 26, "maxCubicFeet": 1800, "crewSize": 4 }
]
```

- [ ] **Step 2: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { planTruckAndCrew } from './moving-plan';

describe('planTruckAndCrew', () => {
  it('picks the smallest truck that fits the load', () => {
    expect(planTruckAndCrew(600, []).truckLabel).toBe('16ft box truck');
  });

  it('scales crew with truck class', () => {
    expect(planTruckAndCrew(1500, []).crewSize).toBe(4);
  });

  it('requires multiple trips when volume exceeds the largest truck', () => {
    const plan = planTruckAndCrew(3000, []);
    expect(plan.truckFeet).toBe(26);
    expect(plan.trips).toBe(2);
  });

  it('uses one trip for any load that fits', () => {
    expect(planTruckAndCrew(100, []).trips).toBe(1);
  });

  it('adds time for stairs and long carry', () => {
    const flat = planTruckAndCrew(600, []);
    const hard = planTruckAndCrew(600, ['stairs', 'long_carry']);
    expect(hard.estimatedHours).toBeGreaterThan(flat.estimatedHours);
  });

  it('counts each access flag once', () => {
    const a = planTruckAndCrew(600, ['stairs']);
    const b = planTruckAndCrew(600, ['stairs', 'stairs']);
    expect(a.estimatedHours).toBe(b.estimatedHours);
  });

  it('never returns fewer than 2 crew or less than 2 hours', () => {
    const plan = planTruckAndCrew(5, []);
    expect(plan.crewSize).toBeGreaterThanOrEqual(2);
    expect(plan.estimatedHours).toBeGreaterThanOrEqual(2);
  });

  it('returns a zero-ish plan for an empty inventory without NaN', () => {
    const plan = planTruckAndCrew(0, []);
    expect(Number.isNaN(plan.estimatedHours)).toBe(false);
    expect(plan.trips).toBe(1);
  });
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `npx vitest run lib/moving-plan.test.ts` — FAIL.

- [ ] **Step 4: Implement**

```ts
import trucks from '../data/trucks.json';
import type { AccessFlag } from './types';

interface TruckClass { label: string; feet: number; maxCubicFeet: number; crewSize: number }

const TRUCKS = trucks as TruckClass[];
const CUFT_PER_CREW_HOUR = 120;   // matches ratecard.cuftPerCrewHour
const MIN_HOURS = 2;
const ACCESS_HOURS: Record<AccessFlag, number> = {
  stairs: 1.5,
  elevator: 1,
  long_carry: 1,
};

export interface TruckPlan {
  truckLabel: string;
  truckFeet: number;
  crewSize: number;
  estimatedHours: number;
  trips: number;
}

export function planTruckAndCrew(totalCubicFeet: number, accessFlags: AccessFlag[]): TruckPlan {
  const largest = TRUCKS[TRUCKS.length - 1];
  const fitting = TRUCKS.find((truck) => totalCubicFeet <= truck.maxCubicFeet) ?? largest;
  const trips = Math.max(1, Math.ceil(totalCubicFeet / largest.maxCubicFeet));

  const accessHours = Array.from(new Set(accessFlags))
    .reduce((sum, flag) => sum + (ACCESS_HOURS[flag] ?? 0), 0);

  const loadHours = totalCubicFeet > 0
    ? (totalCubicFeet / CUFT_PER_CREW_HOUR) * trips
    : 0;

  return {
    truckLabel: fitting.label,
    truckFeet: fitting.feet,
    crewSize: Math.max(2, fitting.crewSize),
    estimatedHours: Math.max(MIN_HOURS, Math.round((loadHours + accessHours) * 2) / 2),
    trips,
  };
}
```

Hours round to the nearest half-hour because a moving quote reading "6.5 hours" is credible and "6.37 hours" is not.

- [ ] **Step 5: Verify, gate, commit**

```bash
npx vitest run lib/moving-plan.test.ts
npx tsc --noEmit && npx vitest run && npx next build --turbopack
git add lib/moving-plan.ts lib/moving-plan.test.ts data/trucks.json
git commit -m "feat: derive truck class, crew size and hours from inventory volume"
```

---

## Task 3: Packing materials estimator (Feature 2)

**Files:** Modify `lib/moving-plan.ts`, `lib/moving-plan.test.ts`; create `data/packing.json`

**Interfaces produced:**
- `interface PackingItem { label: string; quantity: number; unit: string }`
- `planPackingMaterials(items: Item[]): PackingItem[]`

Effort: **2–3h.** Impact: high — this is a real revenue line for movers, not decoration.

- [ ] **Step 1: Write `data/packing.json`**

Ratios are per 100 cu ft of non-box inventory, except tape which is per 20 boxes.

```json
{
  "smallBoxesPer100CuFt": 4,
  "mediumBoxesPer100CuFt": 3,
  "largeBoxesPer100CuFt": 2,
  "wardrobeBoxesPer100CuFt": 0.5,
  "packingPaperLbsPer100CuFt": 5,
  "bubbleWrapFeetPer100CuFt": 12,
  "tapeRollsPer20Boxes": 1,
  "mattressBagsPerMattress": 1,
  "tvBoxesPerTv": 1
}
```

- [ ] **Step 2: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { planPackingMaterials } from './moving-plan';
import type { Item } from './types';

function item(over: Partial<Item> = {}): Item {
  return {
    id: 'i', roomId: 'r', name: 'thing', category: 'sofa_3seat',
    count: 1, sizeClass: 'm', cubicFeet: 50, confidence: 0.9,
    source: 'ai', editedByUser: false, ...over,
  };
}

describe('planPackingMaterials', () => {
  it('returns an empty list for an empty inventory', () => {
    expect(planPackingMaterials([])).toEqual([]);
  });

  it('scales boxes with non-box volume', () => {
    const out = planPackingMaterials([item({ cubicFeet: 100, count: 1 })]);
    const medium = out.find((entry) => entry.label.includes('Medium'));
    expect(medium?.quantity).toBe(3);
  });

  it('excludes existing boxes from the volume that generates new boxes', () => {
    const withBoxes = planPackingMaterials([
      item({ cubicFeet: 100, count: 1 }),
      item({ category: 'box_medium', cubicFeet: 3, count: 20 }),
    ]);
    const onlyFurniture = planPackingMaterials([item({ cubicFeet: 100, count: 1 })]);
    const qty = (list: ReturnType<typeof planPackingMaterials>) =>
      list.find((entry) => entry.label.includes('Medium'))?.quantity;
    expect(qty(withBoxes)).toBe(qty(onlyFurniture));
  });

  it('adds one mattress bag per mattress', () => {
    const out = planPackingMaterials([item({ category: 'mattress', count: 3 })]);
    expect(out.find((entry) => entry.label.includes('Mattress'))?.quantity).toBe(3);
  });

  it('adds a TV box per television', () => {
    const out = planPackingMaterials([item({ category: 'tv', count: 2 })]);
    expect(out.find((entry) => entry.label.includes('TV'))?.quantity).toBe(2);
  });

  it('returns whole units only — you cannot buy 2.4 boxes', () => {
    const out = planPackingMaterials([item({ cubicFeet: 137, count: 1 })]);
    for (const entry of out) expect(Number.isInteger(entry.quantity)).toBe(true);
  });

  it('never returns a zero-quantity line', () => {
    const out = planPackingMaterials([item({ cubicFeet: 400, count: 1 })]);
    for (const entry of out) expect(entry.quantity).toBeGreaterThan(0);
  });
});
```

The third test is the important one: an inventory that already contains 20 boxes should not generate boxes to pack those boxes.

- [ ] **Step 3: Run to confirm failure**, then implement in `lib/moving-plan.ts`:

```ts
import packing from '../data/packing.json';
import type { Item } from './types';

export interface PackingItem { label: string; quantity: number; unit: string }

const BOX_CATEGORIES = new Set([
  'box_small', 'box_medium', 'box_large', 'wardrobe_box',
]);   // NB: the catalogue id is `wardrobe_box`, not `box_wardrobe`

export function planPackingMaterials(items: Item[]): PackingItem[] {
  if (!items.length) return [];

  // Boxes already in the inventory do not need boxes of their own.
  const packableCuFt = items
    .filter((i) => !BOX_CATEGORIES.has(i.category))
    .reduce((sum, i) => sum + i.cubicFeet * i.count, 0);

  const per100 = packableCuFt / 100;
  const countOf = (category: string) =>
    items.filter((i) => i.category === category).reduce((sum, i) => sum + i.count, 0);

  const smallBoxes    = Math.ceil(per100 * packing.smallBoxesPer100CuFt);
  const mediumBoxes   = Math.ceil(per100 * packing.mediumBoxesPer100CuFt);
  const largeBoxes    = Math.ceil(per100 * packing.largeBoxesPer100CuFt);
  const wardrobeBoxes = Math.ceil(per100 * packing.wardrobeBoxesPer100CuFt);
  const totalBoxes    = smallBoxes + mediumBoxes + largeBoxes + wardrobeBoxes;

  const lines: PackingItem[] = [
    { label: 'Small boxes',    quantity: smallBoxes,    unit: 'boxes' },
    { label: 'Medium boxes',   quantity: mediumBoxes,   unit: 'boxes' },
    { label: 'Large boxes',    quantity: largeBoxes,    unit: 'boxes' },
    { label: 'Wardrobe boxes', quantity: wardrobeBoxes, unit: 'boxes' },
    { label: 'Packing paper',  quantity: Math.ceil(per100 * packing.packingPaperLbsPer100CuFt), unit: 'lbs' },
    { label: 'Bubble wrap',    quantity: Math.ceil(per100 * packing.bubbleWrapFeetPer100CuFt),  unit: 'ft' },
    { label: 'Tape rolls',     quantity: Math.ceil(totalBoxes / 20 * packing.tapeRollsPer20Boxes), unit: 'rolls' },
    { label: 'Mattress bags',  quantity: countOf('mattress') * packing.mattressBagsPerMattress, unit: 'bags' },
    { label: 'TV boxes',       quantity: countOf('tv') * packing.tvBoxesPerTv, unit: 'boxes' },
  ];

  return lines.filter((line) => line.quantity > 0);
}
```

- [ ] **Step 4: Gate and commit**

```bash
git add lib/moving-plan.ts lib/moving-plan.test.ts data/packing.json
git commit -m "feat: derive packing material requirements from inventory"
```

---

## Task 4: Special-handling flags (Feature 3)

**Files:** Modify `data/catalogue.json`, `lib/types.ts`, `lib/catalogue.ts`; create `components/HandlingBadge.tsx`

**Interfaces produced:**
- `type HandlingFlag = 'fragile' | 'heavy' | 'high_value' | 'disassembly'`
- `getHandling(category: string): HandlingFlag[]`
- `handlingSummary(items: Item[]): { flag: HandlingFlag; items: string[] }[]`

Effort: **2h.** Impact: high — safety plus an insurance/valuation upsell.

- [ ] **Step 1: Add an optional `handling` array to relevant catalogue rows**

`handling` must be **optional** so the other rows stay valid against `CatalogueEntry`. Apply to at least:

These are verified against the actual 58 catalogue ids — use exactly these:

| Categories | Flags |
|---|---|
| `piano_upright`, `piano_grand` | `heavy`, `high_value`, `disassembly` |
| `artwork`, `mirror`, `china_cabinet` | `fragile`, `high_value` |
| `tv` | `fragile`, `high_value` |
| `fridge`, `freezer`, `washer`, `dryer`, `oven`, `dishwasher` | `heavy` |
| `treadmill`, `exercise_bike`, `elliptical` | `heavy` |
| `kitchen_island`, `tool_chest`, `lawn_mower` | `heavy` |
| `bed_frame`, `dining_table`, `wardrobe`, `crib`, `desk` | `disassembly` |
| `storage_shelf`, `tv_stand`, `bookcase` | `disassembly` |

Do **not** invent categories. `piano`, `glass_cabinet`, `marble_table`, `safe`, `bunk_bed`,
`aquarium` and `chandelier` do **not** exist in this catalogue — the piano ids are
`piano_upright` and `piano_grand`, and the glass-fronted cabinet is `china_cabinet`.
Adding a flag to a non-existent id is a silent no-op that looks like working code.

- [ ] **Step 2: Extend the type**

```ts
export type HandlingFlag = 'fragile' | 'heavy' | 'high_value' | 'disassembly';

export interface CatalogueEntry {
  category: string;
  label: string;
  cubicFeet: Record<SizeClass, number>;
  commonIn: RoomType[];
  handling?: HandlingFlag[];   // optional: absent means standard handling
}
```

- [ ] **Step 3: Write failing tests in `lib/catalogue.test.ts`**

```ts
it('returns no handling flags for an ordinary item', () => {
  expect(getHandling('coffee_table')).toEqual([]);
});

it('returns handling flags for a piano', () => {
  expect(getHandling('piano')).toContain('heavy');
});

it('returns an empty array, never undefined, for an unknown category', () => {
  expect(getHandling('nonexistent')).toEqual([]);
});

it('groups items by handling flag', () => {
  const base = {
    id: 'i', roomId: 'r', count: 1, sizeClass: 'm' as const, cubicFeet: 10,
    confidence: 0.9, source: 'ai' as const, editedByUser: false,
  };
  const summary = handlingSummary([
    { ...base, category: 'tv', name: 'Television' },
    { ...base, category: 'artwork', name: 'Artwork' },
  ]);
  const fragile = summary.find((entry) => entry.flag === 'fragile');
  expect(fragile?.items).toHaveLength(2);
});
```

- [ ] **Step 4: Implement in `lib/catalogue.ts`**

```ts
export function getHandling(category: string): HandlingFlag[] {
  return getEntry(category).handling ?? [];
}

export function handlingSummary(items: Item[]): { flag: HandlingFlag; items: string[] }[] {
  const grouped = new Map<HandlingFlag, string[]>();
  for (const item of items) {
    for (const flag of getHandling(item.category)) {
      const names = grouped.get(flag) ?? [];
      if (!names.includes(item.name)) names.push(item.name);
      grouped.set(flag, names);
    }
  }
  return [...grouped.entries()].map(([flag, names]) => ({ flag, items: names }));
}
```

- [ ] **Step 5: `components/HandlingBadge.tsx`**

Props: `{ flags: HandlingFlag[] }`. Renders small pills with copy: `fragile` → "Fragile", `heavy` → "Heavy — extra crew", `high_value` → "Consider extra valuation coverage", `disassembly` → "Needs disassembly". Render nothing for an empty array.

- [ ] **Step 6: Gate and commit**

```bash
git add data/catalogue.json lib/types.ts lib/catalogue.ts lib/catalogue.test.ts components/HandlingBadge.tsx
git commit -m "feat: add special-handling flags to the catalogue with grouped summary"
```

---

## Task 5: Volume anchor (Feature 4)

**Files:** Modify `lib/moving-plan.ts`, `lib/moving-plan.test.ts`; create `data/home-sizes.json`

**Interfaces produced:** `describeVolume(totalCubicFeet: number): { comparison: string; typicalLow: number; typicalHigh: number } | null`

Effort: **45m.** Impact: medium — a bare cubic-feet figure means nothing to a customer.

- [ ] **Step 1: `data/home-sizes.json`**

```json
[
  { "label": "studio apartment",   "low": 200,  "high": 400 },
  { "label": "1-bedroom home",     "low": 400,  "high": 700 },
  { "label": "2-bedroom home",     "low": 700,  "high": 1100 },
  { "label": "3-bedroom home",     "low": 1100, "high": 1600 },
  { "label": "4-bedroom home",     "low": 1600, "high": 2400 }
]
```

- [ ] **Step 2: Tests**

```ts
it('matches a volume to the band it falls in', () => {
  expect(describeVolume(900)?.comparison).toContain('2-bedroom');
});

it('returns null for an empty inventory rather than a misleading comparison', () => {
  expect(describeVolume(0)).toBeNull();
});

it('handles a volume above every band', () => {
  expect(describeVolume(5000)?.comparison).toContain('4-bedroom');
});

it('handles a volume below every band', () => {
  expect(describeVolume(50)?.comparison).toContain('studio');
});
```

Returning `null` for zero matters: "your move is like a studio apartment" on an empty inventory is worse than saying nothing.

- [ ] **Step 3: Implement, gate, commit**

```bash
git add lib/moving-plan.ts lib/moving-plan.test.ts data/home-sizes.json
git commit -m "feat: add typical-home volume anchor for estimate context"
```

---

## Task 6: Render the moving plan on the estimate screen

**Files:** Create `components/MovingPlan.tsx`; modify `app/estimate/[sessionId]/page.tsx`

This is where Tasks 2–5 become visible. Without it none of that work is in the demo.

- [ ] **Step 1: `components/MovingPlan.tsx`**

Props: `{ plan: TruckPlan; packing: PackingItem[]; handling: {flag,items}[]; volumeContext: ReturnType<typeof describeVolume> }`

Three sections, in this order:
1. **"What this move needs"** — truck label, crew size, estimated hours, trips (only show trips when > 1).
2. **"Special handling"** — `HandlingBadge` per group with the item names. Omit the section entirely when empty.
3. **"Packing materials"** — a two-column list. Collapsed behind `<details>` with a summary reading `{n} items · tap to see the list`, because it is long and secondary to the price.

- [ ] **Step 2: Wire into the estimate page**

Compute from the session already fetched — all four functions are pure, so this can run client-side with no new endpoint. Place the component **below** `PriceRange` and the existing breakdown; the price stays the headline. Put the volume anchor as a single line directly under the cubic-feet figure.

- [ ] **Step 3: Verify on a phone**

Confirm no horizontal overflow at 375px, the packing list scrolls inside its own container, and an empty-inventory session renders without the plan section rather than showing zeros.

- [ ] **Step 4: Gate and commit**

```bash
git add components/MovingPlan.tsx "app/estimate/[sessionId]/page.tsx"
git commit -m "feat: surface truck, crew, handling and packing plan on the estimate"
```

---

## Task 7: Uncertainty reasons (Feature 5)

**Files:** Modify `lib/schema.ts`, `lib/gemini.ts`, `lib/types.ts`, `db/schema.sql`, `lib/db.ts`, `app/review/[sessionId]/page.tsx`

Effort: **1h.** Impact: high — best value in the AI tier. Turns "50% confidence" into something a human can act on.

- [ ] **Step 1: Add the optional field to the analyze schema**

In `ROOM_ANALYSIS_SCHEMA`, add to item properties (**not** to `required`):

```ts
uncertaintyReason: { type: 'string' },
```

- [ ] **Step 2: Add one prompt rule in `lib/gemini.ts`**

```
9. When you set confidence below 0.7, add "uncertaintyReason": a short plain-English
   phrase naming what limited you — for example "partly hidden behind the sofa",
   "only visible from one angle", "could not tell the size". Keep it under 12 words.
   Do not use it for items you are confident about.
```

- [ ] **Step 3: Validate and default in `parseItem`**

```ts
const uncertaintyReason = typeof value.uncertaintyReason === 'string' && value.uncertaintyReason.trim()
  ? value.uncertaintyReason.trim().slice(0, 120)
  : undefined;
```

Truncate at 120 characters — a model that returns a paragraph must not break the card layout.

- [ ] **Step 4: Persist**

`alter table items add column uncertainty_reason text;` plus mapping in `rowToItem` and the insert in `replaceItems`.

- [ ] **Step 5: Render**

On the uncertainty card in the review screen, below the confidence percentage, in smaller muted text. When absent, render nothing — do not substitute a generic string.

- [ ] **Step 6: Test with a fixture**

Add `uncertaintyReason` to one item in `lib/fixtures/living_room.json` so demo mode exercises the rendering path. Add a schema test asserting a non-string value is dropped rather than rendered.

- [ ] **Step 7: Gate and commit**

```bash
git commit -m "feat: capture and display why the model was uncertain about an item"
```

---

## Task 8: Photo evidence — `seenInImages` (Feature 6)

**Files:** Modify `lib/schema.ts`, `lib/gemini.ts`, `lib/types.ts`, `db/schema.sql`, `lib/db.ts`, `app/review/[sessionId]/page.tsx`

Effort: **2–3h.** Impact: high — converts your dedupe claim from an assertion into visible evidence.

- [ ] **Step 1: Schema field (optional)**

```ts
seenInImages: { type: 'array', items: { type: 'integer' } },
```

- [ ] **Step 2: Prompt rule**

```
10. For each item add "seenInImages": the 1-based numbers of the photographs the object
    appears in. If the same object appears in photographs 2 and 4, report the item once
    with "seenInImages": [2, 4]. This is how you show your counting is correct.
```

Note the ordering dependency: the images are sent in the order `getCaptureBase64` returns them, which is **`created_at` descending, limit 12**. Photograph "1" is therefore the *most recent* capture, not the first one taken. Either reverse the array before sending, or label the UI accordingly. **Reversing is preferable** — "photo 1" should mean the first photo the user took.

- [ ] **Step 3: Validate strictly**

Filter to integers within `[1, imageCount]`. A model returning `[0]`, `[99]` or `["two"]` must produce an empty array, not a crash or a wrong badge. Pass the image count into `parseRoomAnalysis` so bounds can be enforced.

- [ ] **Step 4: Persist and render**

`alter table items add column seen_in_images integer[];`

Render as small text on each item row: `Seen in photos 2 and 4 · counted once`. For a single photo: `Seen in photo 3`. Omit entirely when empty. The phrase "counted once" is the point — it is what makes the dedupe visible.

- [ ] **Step 5: Tests**

Schema tests for: out-of-range indices dropped, non-integers dropped, empty array omitted, valid array preserved.

- [ ] **Step 6: Gate and commit**

```bash
git commit -m "feat: show which photos each item was seen in to evidence dedupe"
```

---

## Task 9: Audit trail (Feature 8)

**Files:** Create `components/AuditTrail.tsx`; modify `app/agent/[quoteId]/page.tsx`, `app/estimate/[sessionId]/page.tsx`

Effort: **2h** for the cheap version described here. Impact: medium–high — directly serves the FMCSA compliance narrative.

The data already exists: `items.source` (`ai` | `refined` | `user_added`) and `items.edited_by_user`. This task renders provenance from current state; it does **not** add a history table. That distinction matters — do not build one in this task.

- [ ] **Step 1: `components/AuditTrail.tsx`**

Props: `{ item: Item }`. Maps state to a provenance line:

| `source` | `editedByUser` | Rendered |
|---|---|---|
| `ai` | false | "Identified by AI" |
| `ai` | true | "Identified by AI · adjusted by customer" |
| `refined` | false | "Identified by AI · verified by second pass" |
| `refined` | true | "Identified by AI · verified · adjusted by customer" |
| `user_added` | any | "Added by customer" |

- [ ] **Step 2: Render in the agent console** under each item — the agent needs to know what to trust.

- [ ] **Step 3: Add a quote-level summary** on the agent page: `{n} of {m} items adjusted by a human`. This complements the existing `editRate` figure with absolute numbers, which read better on a slide than a percentage alone.

- [ ] **Step 4: Gate and commit**

```bash
git commit -m "feat: render item provenance for agent review and compliance narrative"
```

---

## Task 10: Printable estimate (Feature 10)

**Files:** Create `app/estimate/[sessionId]/print.css`; modify `app/estimate/[sessionId]/page.tsx`

Effort: **1h** for the print-stylesheet route. Impact: medium.

Use a print stylesheet, **not** a PDF library. It costs an hour instead of three, adds no dependency, and the browser's "Save as PDF" produces the same artifact the user wants.

- [ ] **Step 1: `@media print` rules** — hide nav, the email form, and all buttons; force the dark `PriceRange` panel to light background with dark text (dark panels waste ink and often print as black blocks); expand every `<details>` via `details { display: block } details > summary { display: none }`; add a footer with the company name and the estimate date.

- [ ] **Step 2: Add a "Print or save as PDF" button** calling `window.print()`. Hide the button itself in print.

- [ ] **Step 3: Verify** by printing to PDF from a desktop browser. Check the moving plan and packing list both appear expanded and nothing is clipped at the page margin.

- [ ] **Step 4: Gate and commit**

```bash
git commit -m "feat: add print stylesheet so customers can save a PDF estimate"
```

---

## Task 11: Email delivery (Feature 9) — DECISION GATE FIRST

**Files:** Create `lib/mail.ts`; modify `app/api/estimate/route.ts`, `app/estimate/[sessionId]/page.tsx`

**Do not start this task until Step 1 is resolved.** It is the only task here with an external dependency that may make it unviable.

Effort: **4–6h** if viable. Impact: medium.

### Background — the honest constraint

Investigation during design established that **Resend's free tier cannot email a stranger**: without a DNS-verified domain you send from `onboarding@resend.dev` and only to your own account address. The deployment plan puts a custom domain out of scope and `.vercel.app` gives no DNS control. The available $0 alternative is Nodemailer over Gmail SMTP with an App Password (Vercel blocks port 25 but leaves 465/587 open). That works to arbitrary recipients but runs on a personal Google account and may be flagged mid-demo.

- [ ] **Step 1: Decide, and record the decision in this file**

Three legitimate outcomes:

| Option | Do this |
|---|---|
| **A domain is available** | Verify it with a transactional provider and implement properly. Best outcome. |
| **No domain, accept Gmail SMTP** | Implement via Nodemailer. Accept the fragility; do not demo the email step live. |
| **Skip email** | **Change the copy instead** — "Send me this estimate" → "Save my estimate", and the confirmation to "Your estimate is saved. A mover will confirm your price within 2 hours." Five minutes, and it removes the false promise. |

**If in doubt, choose the third.** Shipping accurate copy beats shipping a fragile mailer. The current UI promises delivery and delivers nothing, and that is the actual defect — sending mail is one way to fix it, telling the truth is the other.

- [ ] **Step 2 (only if A or B): implement `lib/mail.ts`**

Plain-text plus minimal HTML, containing the absolute `/estimate/{sessionId}` URL. Called from `/api/estimate` **after** `setSessionEmail`, wrapped so a mail failure never fails the request — the estimate must save even if the email does not send. Log failures.

- [ ] **Step 3 (only if A or B): send again on `confirmQuote`** so the customer learns their price was confirmed.

- [ ] **Step 4: Gate and commit**

---

## Task 12: Mover lead dashboard (Feature 11)

**Files:** Create `app/agent/leads/page.tsx`, `app/api/agent/leads/route.ts`; modify `app/agent/page.tsx`

Effort: **4–6h.** Impact: medium — reframes the product as B2B SaaS rather than a consumer toy.

- [ ] **Step 1: `GET /api/agent/leads`**

Behind the existing agent auth (`lib/agent-auth.ts`, `x-agent-secret`). Returns aggregates computed in SQL or in a pure helper — not in the component:

- total scans started, scans that reached an estimate, scans confirmed → a funnel
- median estimate value
- total cubic feet quoted
- mean agent edit rate across confirmed quotes
- count of quotes still pending review, oldest first

- [ ] **Step 2: `app/agent/leads/page.tsx`**

Desktop-first — this is an internal tool. A funnel, the five figures as stat tiles, and a table of pending quotes. Link it from the existing `/agent` header.

- [ ] **Step 3: Empty state**

With no data it must read "No scans yet — run `npm run seed-demo`", never a wall of zeros or `NaN`.

- [ ] **Step 4: Gate and commit**

```bash
git commit -m "feat: add mover lead dashboard with funnel and quality metrics"
```

---

## Task 13: Bounding-box annotations (Feature 7) — LAST, AND OPTIONAL

**Files:** Modify `lib/schema.ts`, `libjson/gemini.ts`; create `components/PhotoAnnotations.tsx`

Effort: **5–8h.** Impact: high if it works, **negative if it does not.**

### Why this is last

This was the one feature recommended against in `feedback/review/2026-09-01-consolidated-review.md`, and that assessment has not changed. It is the most visually impressive option available and the worst risk-adjusted bet in this plan:

- A visibly misplaced box on stage does **more** damage than having no boxes at all. It converts "the AI is smart" into "the AI is wrong, and I can see it."
- Spatial coordinate accuracy is where smaller models are weakest, and the primary model is Flash-Lite — a tier whose recognition accuracy on real photographs **has still not been measured** (see §Parked).
- It needs coordinate-space mapping between the model's normalised output and the rendered image, including correct handling of the client-side downscale in `lib/image.ts`.

**Do not start this task unless every other task is complete, committed, and rehearsed.** If time is short, cut it — that is the expected outcome, not a failure.

- [ ] **Step 1: Gate check.** Confirm Tasks 1–12 are done and the demo has been rehearsed end to end at least twice. If not, stop here.

- [ ] **Step 2: Add an optional normalised box to the item schema**

```ts
box: {
  type: 'object',
  properties: {
    x: { type: 'number' }, y: { type: 'number' },
    w: { type: 'number' }, h: { type: 'number' },
    image: { type: 'integer' },
  },
},
```

Coordinates normalised 0–1 relative to the image, so they survive any display scaling.

- [ ] **Step 3: Validate hard.** Reject any box where `x`, `y`, `w`, `h` fall outside `[0, 1]`, where `w` or `h` is zero, or where `image` is out of range. An invalid box must be **dropped silently** — the item still renders, just without an overlay. Never render a box you are not sure about.

- [ ] **Step 4: `components/PhotoAnnotations.tsx`**

An absolutely-positioned `<div>` overlay over the capture image, boxes as percentage-positioned borders with the item label. Percentages mean no JS coordinate maths and correct behaviour at any container size.

- [ ] **Step 5: Honest visual check on at least 5 real photographs.**

Decision rule, set now so it is not rationalised later: **if boxes are visibly misplaced on 2 or more of 5 photos, revert this task entirely.** Ship without annotations rather than with wrong ones.

- [ ] **Step 6: Gate and commit**

```bash
git commit -m "feat: overlay bounding boxes on captures with strict validation"
```

---

## Parked — findings on the two problems raised, deliberately not implemented

Both problem areas discussed (returning to an estimate, and abuse/quota control) are **parked by decision**. Recorded here so nothing is lost. **No task in this plan touches them.**

### Problem 1 — returning to an estimate

Design debate outcome: a **read-only short code** plus `localStorage` beats email as the primary return mechanism, mainly because email cannot be delivered to strangers at $0 without a verified domain, and because the short-code position's own concession — that a guessable code granting *edit* rights is indefensible — is neutralised by scoping the code to read-only.

Verified findings:

1. **`setSessionEmail` (`lib/db.ts:371`) also sets `status: 'pending_review'`.** Email is the submit-to-agent action in the data model, so it cannot double as a login — entering an email to retrieve an old estimate would re-submit that session to the agent queue.
2. **The agent console never surfaces `customer_email`.** It is written by `setSessionEmail`, read back only on the customer's own estimate page, and appears nowhere in `app/agent/**` or `app/api/agent/**`. **This is an outright bug:** the flow captures the lead and hides it from the person whose job is to phone the customer. It would normally be fixed immediately.
3. **Quotes are identified by `sessionId.slice(0, 8)`** in `app/agent/page.tsx:29` and `app/agent/[quoteId]/page.tsx:111` — 8 hex characters, unusable over a phone, in a product whose confirmation step is a phone call.
4. **The session URL is a capability URL.** Anyone holding `/review/[sessionId]` can view *and edit* the inventory via `PATCH /api/item/[itemId]`. Acceptable with an unguessable v4 UUID; **not** acceptable if a short code is ever added without read-only scoping and rate limiting.

### Problem 2 — abuse and quota control

Design debate outcome: all three candidate approaches (per-IP cap, mid-scan email gate, Turnstile) independently conceded they do not solve the stated problem alone. The load-bearing protection is a **global daily cap whose limit-hit behaviour returns the existing fixture response with `demoMode: true`** rather than an error — degradation, not denial, reusing a path already built and tested.

Verified findings:

5. **There are TWO uncapped Gemini entry points, not one.** `/api/refine` validates only `isUuid(itemId)` and then calls `refineItem` — no session check, no ownership check. Any control applied only to `/api/analyze` leaves refine fully open.
6. **One analyze POST can consume up to 3 model requests** — `cascade` in `lib/gemini.ts` makes 2 primary attempts plus 1 fallback. Quota maths must use 3×, not 1×, per call.
7. **`POST /api/session` is anonymous and uncapped** and `createSession()` takes no input, so any per-session counter is defeated by looping session creation.
8. **Nothing in the codebase reads a client IP** — no `x-forwarded-for`, no `request.ip`, no `@vercel/functions`. Any IP-based approach starts from zero, and Vercel's client-IP header should be confirmed on the real deployment before being relied on.
9. **Mobile carrier NAT makes IP a poor identity for this app specifically** — it is a phone-camera product, so CGNAT is the dominant traffic pattern, not an edge case. A venue's shared NAT would also throttle judges.
10. **Quota exhaustion is embarrassing, not fatal.** `analyzeRoom` already degrades to fixtures and shows a "Demo mode — using sample inventory results" banner. This lowers the priority of this entire area relative to the item below.

### Still the highest-value outstanding work

**Dedupe accuracy on real photographs remains unmeasured.** Every test to date used synthetic canvas images. Task 10 of `2026-09-01-lite-tier-and-review-fixes.md` (tier comparison against hand-counted ground truth) is still open, and one real 12-photo run on a phone is still cheaper than any task in this plan and worth more than most of them. Tasks 2–5 compute a moving plan *from the inventory* — if the inventory is wrong, they amplify the error rather than adding value.

---

## Recommended execution order

| Order | Task | Effort | Why here |
|---|---|---|---|
| 1 | Task 1 — room-type fix | 30m | Outstanding bug, trivial |
| 2 | Task 2 — truck & crew | 2h | Pure, testable, high impact |
| 3 | Task 3 — packing materials | 3h | Pure, new revenue line |
| 4 | Task 4 — handling flags | 2h | Pure, upsell + safety |
| 5 | Task 5 — volume anchor | 45m | Pure, cheap |
| 6 | Task 6 — render the plan | 2h | **Without this, Tasks 2–5 are invisible** |
| 7 | Task 7 — uncertainty reasons | 1h | Best value in the AI tier |
| 8 | Task 10 — print stylesheet | 1h | Cheap, feels like a real deliverable |
| 9 | Task 9 — audit trail | 2h | Compliance narrative |
| 10 | Task 8 — photo evidence | 3h | Makes dedupe visible |
| 11 | Task 11 — email **decision** | 5m–6h | Decide first; the copy fix is 5 minutes |
| 12 | Task 12 — mover dashboard | 5h | New surface, needs its own rehearsal |
| 13 | Task 13 — bounding boxes | 8h | Last. Cut without regret |

Tasks 2–6 are one coherent block delivering the "moving plan" reframe — roughly **10 hours** for the change that most addresses the product feeling thin. Everything from order 7 down is genuinely optional.

**Stop and rehearse after order 8.** Three full runs on the demo device beat any remaining task.
