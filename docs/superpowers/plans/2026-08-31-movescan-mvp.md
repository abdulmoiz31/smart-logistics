# MoveScan MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed mobile-web app where a customer photographs their home room by room, AI produces a de-duplicated inventory with volume estimates, the customer corrects it, and an agent confirms a priced quote.

**Architecture:** One Next.js App Router repo on Vercel. Gemini Flash classifies items from a room's photos in a single batched call so it can de-duplicate across frames; a targeted second call resolves only ambiguous items. All arithmetic happens in pure TypeScript functions over plain data — the model never computes a price. Supabase provides Postgres plus image storage.

**Tech Stack:** Next.js 15 (App Router, TypeScript), Tailwind CSS, `@google/genai`, `@supabase/supabase-js` v2, Vitest, Vercel.

**Spec:** `docs/superpowers/specs/2026-08-31-movescan-design.md`

## Global Constraints

- **Node 22.** Package manager: `npm` (v10.9.2 is installed; pnpm is not).
- **Model id lives in `process.env.GEMINI_MODEL`**, defaulting to `gemini-2.5-flash`. Never hardcode a model id in application code. Verify the id and the current free-tier rate limits against Google's docs before demo day.
- **`@google/genai` is the current SDK.** The older `@google/generative-ai` package is deprecated — do not use it. If the SDK surface in this plan disagrees with the installed package's types, trust the installed types and flag the discrepancy in review.
- **Next.js 15 route params are async.** Signature is `{ params }: { params: Promise<{ id: string }> }` and must be awaited.
- **`lib/pricing.ts` and `lib/catalogue.ts` must not import anything** except types and JSON data. No network, no database, no env access. They are the only units with real unit tests, and they must be testable without consuming API quota.
- **Money is integer cents** everywhere. No floats in pricing. Format for display only.
- **Volume is cubic feet**, stored as a number with at most 1 decimal.
- **Every Gemini call goes through `lib/gemini.ts`.** No route handler calls the SDK directly.
- **Every Gemini call has a fixture fallback.** When `MOVESCAN_DEMO_MODE=1`, or after retries are exhausted, return the checked-in fixture and set `demoMode: true` on the response. This is required functionality, not a nice-to-have.
- **Copy rule:** the customer-facing price is always rendered as a range with the label `Confirmed within 2 hours`. There is no code path that shows a customer a single number before agent confirmation.
- **Uploads are downscaled client-side** to max 1024px on the long edge, JPEG quality 0.8, before leaving the phone.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/types.ts` | Every shared type. Single source of truth; imported everywhere. |
| `data/catalogue.json` | ~60 household items → cubic feet by size class. |
| `data/ratecard.json` | Demo company rate card. |
| `lib/catalogue.ts` | Pure. Resolve `(category, size_class)` → cubic feet. |
| `lib/pricing.ts` | Pure. Inventory + access flags + rate card → priced quote. |
| `lib/schema.ts` | Gemini response JSON schemas + runtime validation. |
| `lib/gemini.ts` | SDK client, `analyzeRoom`, `refineItem`, retry, fixture fallback. |
| `lib/fixtures/*.json` | Canned model responses for demo mode and tests. |
| `lib/db.ts` | Supabase client + all query functions. Only file that touches the DB. |
| `lib/image.ts` | Client-side downscale helper. |
| `db/schema.sql` | Table definitions, run once in Supabase SQL editor. |
| `app/api/*/route.ts` | Thin HTTP adapters. Validate input, call lib, return JSON. |
| `app/scan/[sessionId]/page.tsx` | Capture flow. |
| `app/review/[sessionId]/page.tsx` | Editable inventory. |
| `app/estimate/[sessionId]/page.tsx` | Range + email capture. |
| `app/agent/page.tsx` | Pending quote queue. |
| `app/agent/[quoteId]/page.tsx` | Review + confirm. |
| `components/*.tsx` | `Stepper`, `SizeChips`, `ItemRow`, `SimilarItemPicker`, `AccessFlags`, `PriceRange`. |

Route handlers stay thin on purpose: all logic lives in `lib/`, where it is testable.

---

## Task 1: Types, catalogue data, and rate card

**Files:**
- Create: `lib/types.ts`, `data/catalogue.json`, `data/ratecard.json`

**Interfaces:**
- Consumes: nothing.
- Produces: every type below. All later tasks import from `lib/types.ts`.

- [ ] **Step 1: Write `lib/types.ts`**

```ts
export type SizeClass = 's' | 'm' | 'l';

export type ItemSource = 'ai' | 'refined' | 'user_added';

export type AccessFlag = 'stairs' | 'elevator' | 'long_carry';

export type RoomType =
  | 'living_room' | 'bedroom' | 'kitchen' | 'dining_room'
  | 'bathroom' | 'garage' | 'basement' | 'office' | 'other';

/** One line of inventory, after catalogue snap. */
export interface Item {
  id: string;
  roomId: string;
  name: string;              // human label, e.g. "grey sectional sofa"
  category: string;          // catalogue key, e.g. "sofa_sectional"
  count: number;             // >= 1
  sizeClass: SizeClass;
  cubicFeet: number;         // per single unit, NOT multiplied by count
  confidence: number;        // 0..1
  source: ItemSource;
  editedByUser: boolean;
  ambiguousBetween?: string[];
}

/** What Gemini returns for one item, before catalogue snap. */
export interface DetectedItem {
  name: string;
  category: string;
  count: number;
  sizeClass: SizeClass;
  confidence: number;
  ambiguousBetween?: string[];
}

export interface RoomAnalysis {
  roomType: RoomType;
  items: DetectedItem[];
}

export interface Room {
  id: string;
  sessionId: string;
  roomType: RoomType;
  accessFlags: AccessFlag[];
  items: Item[];
}

/** A single image encoded for a model call. */
export interface ImageInput {
  base64: string;
  mimeType: string;
}

export interface CatalogueEntry {
  category: string;
  label: string;
  cubicFeet: Record<SizeClass, number>;
  commonIn: RoomType[];
}

export interface RateCard {
  companyName: string;
  perCubicFootCents: number;
  cuftPerCrewHour: number;
  crewHourlyCents: number;
  minimumCents: number;
  accessAdderCents: Record<AccessFlag, number>;
}

export interface QuoteBreakdown {
  totalCubicFeet: number;
  baseCents: number;
  laborCents: number;
  accessCents: number;
  subtotalCents: number;
  tolerance: number;   // 0..1
  lowCents: number;
  highCents: number;
}

export type QuoteStatus = 'draft' | 'pending_review' | 'confirmed';

export interface Quote {
  id: string;
  sessionId: string;
  breakdown: QuoteBreakdown;
  status: QuoteStatus;
  confirmedCents?: number;
  agentNotes?: string;
}
```

**Note on `cubicFeet`:** it is per-unit, never pre-multiplied by `count`. Multiplying happens exactly once, in `pricing.ts`. Getting this wrong is the most likely silent pricing bug in the project.

- [ ] **Step 2: Write `data/catalogue.json`**

Shape is `CatalogueEntry[]`. Below are 13 entries as the pattern; extend to ~60 covering: sofas, chairs, tables, beds, mattresses, dressers, wardrobes, desks, bookcases, TVs, appliances (fridge, washer, dryer, dishwasher, oven), boxes (small/medium/large/wardrobe), rugs, mirrors, lamps, exercise equipment, bicycles, pianos, patio furniture, filing cabinets.

```json
[
  { "category": "sofa_2seat",     "label": "Loveseat / 2-seat sofa", "cubicFeet": { "s": 25, "m": 32, "l": 40 }, "commonIn": ["living_room", "office"] },
  { "category": "sofa_3seat",     "label": "3-seat sofa",            "cubicFeet": { "s": 40, "m": 50, "l": 60 }, "commonIn": ["living_room"] },
  { "category": "sofa_sectional", "label": "Sectional sofa",         "cubicFeet": { "s": 70, "m": 90, "l": 120 }, "commonIn": ["living_room"] },
  { "category": "armchair",       "label": "Armchair",               "cubicFeet": { "s": 12, "m": 18, "l": 25 }, "commonIn": ["living_room", "bedroom", "office"] },
  { "category": "coffee_table",   "label": "Coffee table",           "cubicFeet": { "s": 8,  "m": 12, "l": 18 }, "commonIn": ["living_room"] },
  { "category": "dining_table",   "label": "Dining table",           "cubicFeet": { "s": 25, "m": 35, "l": 50 }, "commonIn": ["dining_room", "kitchen"] },
  { "category": "dining_chair",   "label": "Dining chair",           "cubicFeet": { "s": 5,  "m": 7,  "l": 9  }, "commonIn": ["dining_room", "kitchen"] },
  { "category": "bed_frame",      "label": "Bed frame",              "cubicFeet": { "s": 30, "m": 45, "l": 65 }, "commonIn": ["bedroom"] },
  { "category": "mattress",       "label": "Mattress",               "cubicFeet": { "s": 20, "m": 30, "l": 45 }, "commonIn": ["bedroom"] },
  { "category": "dresser",        "label": "Dresser",                "cubicFeet": { "s": 18, "m": 28, "l": 40 }, "commonIn": ["bedroom"] },
  { "category": "tv",             "label": "Television",             "cubicFeet": { "s": 4,  "m": 8,  "l": 14 }, "commonIn": ["living_room", "bedroom"] },
  { "category": "bookcase",       "label": "Bookcase / shelving unit", "cubicFeet": { "s": 15, "m": 25, "l": 35 }, "commonIn": ["living_room", "office", "bedroom"] },
  { "category": "box_medium",     "label": "Medium box",             "cubicFeet": { "s": 2,  "m": 3,  "l": 4  }, "commonIn": ["living_room", "bedroom", "kitchen", "garage", "basement", "office"] }
]
```

The last entry must be a catch-all:

```json
{ "category": "unknown_item", "label": "Other item", "cubicFeet": { "s": 5, "m": 15, "l": 30 }, "commonIn": ["other"] }
```

- [ ] **Step 3: Write `data/ratecard.json`**

```json
{
  "companyName": "Meridian Moving Co.",
  "perCubicFootCents": 145,
  "cuftPerCrewHour": 120,
  "crewHourlyCents": 14500,
  "minimumCents": 49500,
  "accessAdderCents": { "stairs": 7500, "elevator": 5000, "long_carry": 6000 }
}
```

- [ ] **Step 4: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors. If `data/*.json` imports complain, confirm `resolveJsonModule: true` in `tsconfig.json`.

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts data/catalogue.json data/ratecard.json
git commit -m "feat: add shared types, item catalogue, and demo rate card"
```

---

## Task 2: Catalogue lookup (pure)

**Files:**
- Create: `lib/catalogue.ts`, `lib/catalogue.test.ts`

**Interfaces:**
- Consumes: `CatalogueEntry`, `SizeClass`, `RoomType` from `lib/types.ts`; `data/catalogue.json`.
- Produces:
  - `resolveCubicFeet(category: string, sizeClass: SizeClass): number`
  - `getEntry(category: string): CatalogueEntry`
  - `listCategories(): CatalogueEntry[]`
  - `suggestForRoom(roomType: RoomType): CatalogueEntry[]`
  - `CATEGORY_IDS: string[]`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { resolveCubicFeet, getEntry, suggestForRoom, CATEGORY_IDS } from './catalogue';

describe('resolveCubicFeet', () => {
  it('returns the exact value for a known category and size', () => {
    expect(resolveCubicFeet('sofa_3seat', 'm')).toBe(50);
  });

  it('falls back to unknown_item for an unrecognised category', () => {
    expect(resolveCubicFeet('flux_capacitor', 'm')).toBe(15);
  });

  it('never returns zero or a negative number', () => {
    for (const id of CATEGORY_IDS) {
      for (const size of ['s', 'm', 'l'] as const) {
        expect(resolveCubicFeet(id, size)).toBeGreaterThan(0);
      }
    }
  });

  it('is monotonic in size class for every category', () => {
    for (const id of CATEGORY_IDS) {
      const s = resolveCubicFeet(id, 's');
      const m = resolveCubicFeet(id, 'm');
      const l = resolveCubicFeet(id, 'l');
      expect(m).toBeGreaterThanOrEqual(s);
      expect(l).toBeGreaterThanOrEqual(m);
    }
  });
});

describe('getEntry', () => {
  it('returns the unknown_item entry rather than throwing', () => {
    expect(getEntry('nope').category).toBe('unknown_item');
  });
});

describe('suggestForRoom', () => {
  it('returns entries tagged for that room, most relevant first', () => {
    const out = suggestForRoom('bedroom');
    expect(out.length).toBeGreaterThan(0);
    expect(out.map(e => e.category)).toContain('mattress');
  });

  it('always includes the catch-all so the picker is never empty', () => {
    expect(suggestForRoom('other').map(e => e.category)).toContain('unknown_item');
  });
});
```

The monotonicity test is the valuable one: it catches hand-edited catalogue rows where someone typos `l` smaller than `m`, which would otherwise surface as a nonsensical price.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/catalogue.test.ts`
Expected: FAIL — cannot resolve `./catalogue`.

- [ ] **Step 3: Implement `lib/catalogue.ts`**

```ts
import type { CatalogueEntry, RoomType, SizeClass } from './types';
import raw from '../data/catalogue.json';

const entries = raw as CatalogueEntry[];
const byCategory = new Map(entries.map(e => [e.category, e]));

const FALLBACK = byCategory.get('unknown_item')!;
if (!FALLBACK) throw new Error('catalogue.json must contain an unknown_item entry');

export const CATEGORY_IDS = entries.map(e => e.category);

export function getEntry(category: string): CatalogueEntry {
  return byCategory.get(category) ?? FALLBACK;
}

export function resolveCubicFeet(category: string, sizeClass: SizeClass): number {
  return getEntry(category).cubicFeet[sizeClass];
}

export function listCategories(): CatalogueEntry[] {
  return entries;
}

export function suggestForRoom(roomType: RoomType): CatalogueEntry[] {
  const relevant = entries.filter(e => e.commonIn.includes(roomType));
  const rest = entries.filter(e => !e.commonIn.includes(roomType));
  const ordered = [...relevant, ...rest];
  // Guarantee the catch-all is present so SimilarItemPicker never renders empty.
  return ordered.some(e => e.category === 'unknown_item')
    ? ordered
    : [...ordered, FALLBACK];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/catalogue.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/catalogue.ts lib/catalogue.test.ts
git commit -m "feat: add pure catalogue lookup with monotonicity guarantees"
```

---

## Task 3: Pricing engine (pure)

**Files:**
- Create: `lib/pricing.ts`, `lib/pricing.test.ts`

**Interfaces:**
- Consumes: `Item`, `AccessFlag`, `RateCard`, `QuoteBreakdown` from `lib/types.ts`.
- Produces:
  - `totalCubicFeet(items: Item[]): number`
  - `computeTolerance(items: Item[]): number`
  - `priceQuote(items: Item[], accessFlags: AccessFlag[], card: RateCard): QuoteBreakdown`
  - `formatCents(cents: number): string`

**Tolerance rule (exact):** start at `0.08`. Add `0.02` for each item with `confidence < 0.7`. Add `0.01` for each item with `source === 'user_added'`. Clamp to `[0.08, 0.30]`. An empty inventory returns the floor, `0.08`.

Rationale: the band widens with genuine uncertainty, so the range means something instead of being decoration.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { totalCubicFeet, computeTolerance, priceQuote, formatCents } from './pricing';
import type { Item, RateCard } from './types';

const card: RateCard = {
  companyName: 'Test Co.',
  perCubicFootCents: 100,
  cuftPerCrewHour: 100,
  crewHourlyCents: 10000,
  minimumCents: 0,
  accessAdderCents: { stairs: 7500, elevator: 5000, long_carry: 6000 },
};

function item(over: Partial<Item> = {}): Item {
  return {
    id: 'i1', roomId: 'r1', name: 'thing', category: 'sofa_3seat',
    count: 1, sizeClass: 'm', cubicFeet: 50, confidence: 0.9,
    source: 'ai', editedByUser: false, ...over,
  };
}

describe('totalCubicFeet', () => {
  it('multiplies per-unit volume by count exactly once', () => {
    expect(totalCubicFeet([item({ cubicFeet: 50, count: 3 })])).toBe(150);
  });

  it('returns 0 for an empty inventory', () => {
    expect(totalCubicFeet([])).toBe(0);
  });
});

describe('computeTolerance', () => {
  it('returns the floor for a confident inventory', () => {
    expect(computeTolerance([item(), item()])).toBeCloseTo(0.08);
  });

  it('widens for each low-confidence item', () => {
    expect(computeTolerance([item({ confidence: 0.4 }), item({ confidence: 0.5 })]))
      .toBeCloseTo(0.12);
  });

  it('widens for user-added items', () => {
    expect(computeTolerance([item({ source: 'user_added' })])).toBeCloseTo(0.09);
  });

  it('clamps at 0.30 however uncertain the inventory is', () => {
    const messy = Array.from({ length: 40 }, () => item({ confidence: 0.1 }));
    expect(computeTolerance(messy)).toBeCloseTo(0.30);
  });

  it('returns the floor for an empty inventory', () => {
    expect(computeTolerance([])).toBeCloseTo(0.08);
  });
});

describe('priceQuote', () => {
  it('computes base, labor, and access additively', () => {
    const q = priceQuote([item({ cubicFeet: 100, count: 1 })], ['stairs'], card);
    expect(q.totalCubicFeet).toBe(100);
    expect(q.baseCents).toBe(10000);   // 100 cuft * 100
    expect(q.laborCents).toBe(10000);  // ceil(100/100)=1 hr * 10000
    expect(q.accessCents).toBe(7500);
    expect(q.subtotalCents).toBe(27500);
  });

  it('rounds labor hours up, never down', () => {
    const q = priceQuote([item({ cubicFeet: 101, count: 1 })], [], card);
    expect(q.laborCents).toBe(20000); // ceil(101/100) = 2 hrs
  });

  it('applies the minimum when the computed subtotal is below it', () => {
    const withMin: RateCard = { ...card, minimumCents: 99999 };
    const q = priceQuote([item({ cubicFeet: 1, count: 1 })], [], withMin);
    expect(q.subtotalCents).toBe(99999);
  });

  it('counts each access flag once even if passed twice', () => {
    const q = priceQuote([item()], ['stairs', 'stairs'], card);
    expect(q.accessCents).toBe(7500);
  });

  it('returns integer cents for every money field', () => {
    const q = priceQuote([item({ cubicFeet: 37, count: 3 })], ['long_carry'], card);
    for (const v of [q.baseCents, q.laborCents, q.accessCents, q.subtotalCents, q.lowCents, q.highCents]) {
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('produces a range bracketing the subtotal', () => {
    const q = priceQuote([item()], [], card);
    expect(q.lowCents).toBeLessThan(q.subtotalCents);
    expect(q.highCents).toBeGreaterThan(q.subtotalCents);
  });

  it('handles an empty inventory without producing NaN', () => {
    const q = priceQuote([], [], card);
    expect(q.subtotalCents).toBe(0);
    expect(Number.isNaN(q.lowCents)).toBe(false);
  });
});

describe('formatCents', () => {
  it('renders whole dollars without decimals', () => {
    expect(formatCents(249500)).toBe('$2,495');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/pricing.test.ts`
Expected: FAIL — cannot resolve `./pricing`.

- [ ] **Step 3: Implement `lib/pricing.ts`**

```ts
import type { AccessFlag, Item, QuoteBreakdown, RateCard } from './types';

const TOLERANCE_FLOOR = 0.08;
const TOLERANCE_CEILING = 0.30;
const LOW_CONFIDENCE = 0.7;

export function totalCubicFeet(items: Item[]): number {
  const sum = items.reduce((acc, i) => acc + i.cubicFeet * i.count, 0);
  return Math.round(sum * 10) / 10;
}

export function computeTolerance(items: Item[]): number {
  let t = TOLERANCE_FLOOR;
  for (const i of items) {
    if (i.confidence < LOW_CONFIDENCE) t += 0.02;
    if (i.source === 'user_added') t += 0.01;
  }
  return Math.min(TOLERANCE_CEILING, Math.max(TOLERANCE_FLOOR, t));
}

export function priceQuote(
  items: Item[],
  accessFlags: AccessFlag[],
  card: RateCard,
): QuoteBreakdown {
  const cuft = totalCubicFeet(items);

  const baseCents = Math.round(cuft * card.perCubicFootCents);

  const hours = cuft > 0 ? Math.ceil(cuft / card.cuftPerCrewHour) : 0;
  const laborCents = hours * card.crewHourlyCents;

  const uniqueFlags = Array.from(new Set(accessFlags));
  const accessCents = uniqueFlags.reduce(
    (acc, f) => acc + (card.accessAdderCents[f] ?? 0), 0,
  );

  const raw = baseCents + laborCents + accessCents;
  // The minimum applies only to a non-empty move; an empty inventory prices at zero
  // so the review screen can show "add some items" rather than a spurious minimum.
  const subtotalCents = cuft > 0 ? Math.max(raw, card.minimumCents) : 0;

  const tolerance = computeTolerance(items);

  return {
    totalCubicFeet: cuft,
    baseCents,
    laborCents,
    accessCents,
    subtotalCents,
    tolerance,
    lowCents: Math.round(subtotalCents * (1 - tolerance)),
    highCents: Math.round(subtotalCents * (1 + tolerance)),
  };
}

export function formatCents(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/pricing.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/pricing.ts lib/pricing.test.ts
git commit -m "feat: add pure pricing engine with confidence-derived tolerance band"
```

---

## Task 4: Gemini response schema and validation

**Files:**
- Create: `lib/schema.ts`, `lib/schema.test.ts`, `lib/fixtures/living_room.json`, `lib/fixtures/bedroom.json`

**Interfaces:**
- Consumes: `RoomAnalysis`, `DetectedItem`, `SizeClass`, `RoomType`, `CATEGORY_IDS`.
- Produces:
  - `ROOM_ANALYSIS_SCHEMA` — the `responseSchema` object passed to Gemini.
  - `REFINE_SCHEMA` — schema for the refine call.
  - `parseRoomAnalysis(raw: unknown): RoomAnalysis` — throws `SchemaError` on invalid input.
  - `class SchemaError extends Error`

Validation is deliberately strict at the boundary and forgiving inside: unknown categories are coerced to `unknown_item` (the catalogue handles them), but structurally broken responses throw so the retry path can fire.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { parseRoomAnalysis, SchemaError } from './schema';
import livingRoom from './fixtures/living_room.json';

describe('parseRoomAnalysis', () => {
  it('accepts the checked-in fixture', () => {
    const out = parseRoomAnalysis(livingRoom);
    expect(out.items.length).toBeGreaterThan(0);
    expect(out.roomType).toBe('living_room');
  });

  it('coerces an unknown category to unknown_item', () => {
    const out = parseRoomAnalysis({
      roomType: 'living_room',
      items: [{ name: 'weird thing', category: 'nonexistent_thing', count: 1, sizeClass: 'm', confidence: 0.8 }],
    });
    expect(out.items[0].category).toBe('unknown_item');
    expect(out.items[0].name).toBe('weird thing');
  });

  it('coerces an unknown roomType to other', () => {
    const out = parseRoomAnalysis({ roomType: 'dungeon', items: [] });
    expect(out.roomType).toBe('other');
  });

  it('clamps confidence into 0..1', () => {
    const out = parseRoomAnalysis({
      roomType: 'bedroom',
      items: [{ name: 'x', category: 'mattress', count: 1, sizeClass: 'm', confidence: 4.2 }],
    });
    expect(out.items[0].confidence).toBe(1);
  });

  it('coerces count below 1 up to 1', () => {
    const out = parseRoomAnalysis({
      roomType: 'bedroom',
      items: [{ name: 'x', category: 'mattress', count: 0, sizeClass: 'm', confidence: 0.9 }],
    });
    expect(out.items[0].count).toBe(1);
  });

  it('defaults an invalid sizeClass to m', () => {
    const out = parseRoomAnalysis({
      roomType: 'bedroom',
      items: [{ name: 'x', category: 'mattress', count: 1, sizeClass: 'XXL', confidence: 0.9 }],
    });
    expect(out.items[0].sizeClass).toBe('m');
  });

  it('throws SchemaError when items is not an array', () => {
    expect(() => parseRoomAnalysis({ roomType: 'bedroom', items: 'lots' })).toThrow(SchemaError);
  });

  it('throws SchemaError on a null or non-object response', () => {
    expect(() => parseRoomAnalysis(null)).toThrow(SchemaError);
    expect(() => parseRoomAnalysis('{}')).toThrow(SchemaError);
  });

  it('drops items missing a name rather than failing the whole room', () => {
    const out = parseRoomAnalysis({
      roomType: 'bedroom',
      items: [
        { name: 'good', category: 'mattress', count: 1, sizeClass: 'm', confidence: 0.9 },
        { category: 'dresser', count: 1, sizeClass: 'm', confidence: 0.9 },
      ],
    });
    expect(out.items).toHaveLength(1);
  });
});
```

The last case matters: one malformed item should not cost the user the whole room. Partial success beats a retry the user waits for.

- [ ] **Step 2: Write `lib/fixtures/living_room.json`**

This doubles as the demo-mode payload, so make it a realistic, presentable living room including one deliberately ambiguous item.

```json
{
  "roomType": "living_room",
  "items": [
    { "name": "grey fabric sectional sofa", "category": "sofa_sectional", "count": 1, "sizeClass": "l", "confidence": 0.94 },
    { "name": "wooden coffee table", "category": "coffee_table", "count": 1, "sizeClass": "m", "confidence": 0.91 },
    { "name": "65-inch wall-mounted TV", "category": "tv", "count": 1, "sizeClass": "l", "confidence": 0.88 },
    { "name": "upholstered accent chair", "category": "armchair", "count": 2, "sizeClass": "m", "confidence": 0.62, "ambiguousBetween": ["armchair", "sofa_2seat"] },
    { "name": "tall bookcase", "category": "bookcase", "count": 1, "sizeClass": "l", "confidence": 0.79 },
    { "name": "cardboard moving boxes", "category": "box_medium", "count": 6, "sizeClass": "m", "confidence": 0.55 }
  ]
}
```

Create `lib/fixtures/bedroom.json` in the same shape with mattress, bed frame, dresser, two nightstands, and a wardrobe.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run lib/schema.test.ts`
Expected: FAIL — cannot resolve `./schema`.

- [ ] **Step 4: Implement `lib/schema.ts`**

```ts
import type { DetectedItem, RoomAnalysis, RoomType, SizeClass } from './types';
import { CATEGORY_IDS } from './catalogue';

export class SchemaError extends Error {}

const ROOM_TYPES: RoomType[] = [
  'living_room', 'bedroom', 'kitchen', 'dining_room',
  'bathroom', 'garage', 'basement', 'office', 'other',
];

const SIZES: SizeClass[] = ['s', 'm', 'l'];

/** Passed to Gemini as config.responseSchema. */
export const ROOM_ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    roomType: { type: 'string', enum: ROOM_TYPES },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          category: { type: 'string', enum: CATEGORY_IDS },
          count: { type: 'integer' },
          sizeClass: { type: 'string', enum: SIZES },
          confidence: { type: 'number' },
          ambiguousBetween: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'category', 'count', 'sizeClass', 'confidence'],
      },
    },
  },
  required: ['roomType', 'items'],
} as const;

export const REFINE_SCHEMA = {
  type: 'object',
  properties: {
    category: { type: 'string', enum: CATEGORY_IDS },
    sizeClass: { type: 'string', enum: SIZES },
    confidence: { type: 'number' },
  },
  required: ['category', 'sizeClass', 'confidence'],
} as const;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function parseItem(raw: unknown): DetectedItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;

  if (typeof r.name !== 'string' || r.name.trim() === '') return null;

  const category = typeof r.category === 'string' && CATEGORY_IDS.includes(r.category)
    ? r.category
    : 'unknown_item';

  const sizeClass = SIZES.includes(r.sizeClass as SizeClass)
    ? (r.sizeClass as SizeClass)
    : 'm';

  const rawCount = typeof r.count === 'number' ? Math.round(r.count) : 1;
  const count = Number.isFinite(rawCount) && rawCount >= 1 ? rawCount : 1;

  const rawConf = typeof r.confidence === 'number' ? r.confidence : 0.5;
  const confidence = Number.isFinite(rawConf) ? clamp01(rawConf) : 0.5;

  const ambiguousBetween = Array.isArray(r.ambiguousBetween)
    ? r.ambiguousBetween.filter((x): x is string => typeof x === 'string')
    : undefined;

  return {
    name: r.name.trim(),
    category,
    count,
    sizeClass,
    confidence,
    ...(ambiguousBetween && ambiguousBetween.length > 0 ? { ambiguousBetween } : {}),
  };
}

export function parseRoomAnalysis(raw: unknown): RoomAnalysis {
  if (typeof raw !== 'object' || raw === null) {
    throw new SchemaError('response is not an object');
  }
  const r = raw as Record<string, unknown>;

  if (!Array.isArray(r.items)) {
    throw new SchemaError('items is not an array');
  }

  const roomType = ROOM_TYPES.includes(r.roomType as RoomType)
    ? (r.roomType as RoomType)
    : 'other';

  // Drop individually malformed items; one bad row must not cost the user the room.
  const items = r.items
    .map(parseItem)
    .filter((i): i is DetectedItem => i !== null);

  return { roomType, items };
}
```

Note `bookcase` appears in the fixture, so it must exist in `catalogue.json` — the enum in `ROOM_ANALYSIS_SCHEMA` is generated from `CATEGORY_IDS`, and the fixture test will fail if it is missing. This coupling is intentional: it keeps fixtures honest.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/schema.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/schema.ts lib/schema.test.ts lib/fixtures/
git commit -m "feat: add Gemini response schemas with forgiving item-level validation"
```

---

## Task 5: Gemini client with retry and fixture fallback

**Files:**
- Create: `lib/gemini.ts`, `lib/gemini.test.ts`
- Modify: `.env.local.example`

**Interfaces:**
- Consumes: `ROOM_ANALYSIS_SCHEMA`, `REFINE_SCHEMA`, `parseRoomAnalysis`, `SchemaError`.
- Produces:
  - `ANALYZE_PROMPT: string` (declared at the top of `lib/gemini.ts`)
  - `analyzeRoom(images: ImageInput[], hint?: RoomType): Promise<AnalyzeResult>`
  - `refineItem(images: ImageInput[], itemName: string, candidates: string[]): Promise<RefineResult>`
  - `interface AnalyzeResult { analysis: RoomAnalysis; demoMode: boolean }`
  - `interface RefineResult { category: string; sizeClass: SizeClass; confidence: number; demoMode: boolean }`

**Environment variables:**

```
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
MOVESCAN_DEMO_MODE=0
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
AGENT_CONSOLE_SECRET=
```

**Fallback ladder — implement exactly this order:**

1. If `MOVESCAN_DEMO_MODE === '1'` or `GEMINI_API_KEY` is absent → return fixture, `demoMode: true`. Never call the network.
2. Call Gemini. On success, `parseRoomAnalysis`. Return with `demoMode: false`.
3. On `SchemaError` → retry once, appending a repair instruction to the prompt.
4. On network error, timeout (12s), 429, or 5xx → retry once after 1500ms.
5. If the retry also fails → return fixture, `demoMode: true`. **Never throw to the caller.**

Step 5 is why the demo cannot die on a rate limit. `analyzeRoom` has no failure mode that reaches the UI as an error.

- [ ] **Step 1: Write the prompt as an exported constant**

```ts
export const ANALYZE_PROMPT = `You are surveying a home for a moving company.

You are given several photographs of ONE room. They may show the same objects from
different angles and distances.

Identify every movable household item in the room and return a single consolidated
inventory.

Critical rules:
1. The photographs are of the SAME room. If one physical object appears in several
   photographs, report it ONCE. Do not add up appearances across photographs.
2. "count" is the number of distinct physical objects in the room, not the number of
   photographs an object appears in.
3. For identical items grouped together (dining chairs, moving boxes), give the total
   number of physical objects as "count" and one entry for the group.
4. Ignore anything not being moved: fitted carpet, built-in cabinetry, radiators,
   light fixtures, doors, windows, walls.
5. Set "confidence" below 0.7 when you are unsure of the item's identity, its size,
   or its count, especially when objects are partly hidden.
6. When an item could plausibly be one of several catalogue categories, put those
   category ids in "ambiguousBetween" and pick your best guess as "category".
7. Choose "sizeClass" by comparing the item to others in the photo: "s" small for its
   type, "m" typical, "l" large for its type.
8. Set "roomType" from what the photographs show.

Report honestly. An item marked uncertain is more useful than a confident guess.`;
```

The dedupe instruction is the single highest-leverage text in the codebase. Treat changes to it as changes to the product, and re-run the demo room afterwards.

- [ ] **Step 2: Write the failing tests (no network)**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import livingRoom from './fixtures/living_room.json';

describe('analyzeRoom in demo mode', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.MOVESCAN_DEMO_MODE = '1';
    delete process.env.GEMINI_API_KEY;
  });

  it('returns the fixture without calling the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { analyzeRoom } = await import('./gemini');
    const out = await analyzeRoom([], 'living_room');
    expect(out.demoMode).toBe(true);
    expect(out.analysis.items).toHaveLength(livingRoom.items.length);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls back to the living room fixture for an unseeded room type', async () => {
    const { analyzeRoom } = await import('./gemini');
    const out = await analyzeRoom([], 'garage');
    expect(out.analysis.items.length).toBeGreaterThan(0);
  });
});

describe('analyzeRoom with no API key', () => {
  it('treats a missing key as demo mode rather than throwing', async () => {
    vi.resetModules();
    process.env.MOVESCAN_DEMO_MODE = '0';
    delete process.env.GEMINI_API_KEY;
    const { analyzeRoom } = await import('./gemini');
    await expect(analyzeRoom([], 'bedroom')).resolves.toMatchObject({ demoMode: true });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run lib/gemini.test.ts`
Expected: FAIL — cannot resolve `./gemini`.

- [ ] **Step 4: Install the SDK and implement `lib/gemini.ts`**

```bash
npm install @google/genai
```

```ts
import { GoogleGenAI } from '@google/genai';
import type { ImageInput, RoomAnalysis, RoomType, SizeClass } from './types';
import { ROOM_ANALYSIS_SCHEMA, REFINE_SCHEMA, parseRoomAnalysis, SchemaError } from './schema';
import livingRoom from './fixtures/living_room.json';
import bedroom from './fixtures/bedroom.json';

export interface AnalyzeResult { analysis: RoomAnalysis; demoMode: boolean }
export interface RefineResult {
  category: string; sizeClass: SizeClass; confidence: number; demoMode: boolean;
}

const TIMEOUT_MS = 12_000;
const RETRY_DELAY_MS = 1_500;

const FIXTURES: Partial<Record<RoomType, unknown>> = {
  living_room: livingRoom,
  bedroom: bedroom,
};

function fixtureFor(hint?: RoomType): RoomAnalysis {
  return parseRoomAnalysis(FIXTURES[hint ?? 'living_room'] ?? livingRoom);
}

function isDemoMode(): boolean {
  return process.env.MOVESCAN_DEMO_MODE === '1' || !process.env.GEMINI_API_KEY;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function client(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
}

function modelId(): string {
  return process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
}

/** Verify this call shape against the installed @google/genai types; trust them over this plan. */
async function callGemini(
  prompt: string,
  images: ImageInput[],
  responseSchema: unknown,
): Promise<unknown> {
  const contents = [
    { text: prompt },
    ...images.map(img => ({
      inlineData: { data: img.base64, mimeType: img.mimeType },
    })),
  ];

  const result = await Promise.race([
    client().models.generateContent({
      model: modelId(),
      contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema,
        temperature: 0.1,
      },
    }),
    sleep(TIMEOUT_MS).then(() => { throw new Error('gemini timeout'); }),
  ]);

  const text = (result as { text?: string }).text;
  if (!text) throw new SchemaError('empty response text');
  return JSON.parse(text);
}

export async function analyzeRoom(
  images: ImageInput[],
  hint?: RoomType,
): Promise<AnalyzeResult> {
  if (isDemoMode()) {
    return { analysis: fixtureFor(hint), demoMode: true };
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const prompt = attempt === 0
        ? ANALYZE_PROMPT
        : `${ANALYZE_PROMPT}\n\nYour previous reply was not valid JSON matching the schema. Reply with ONLY the JSON object.`;
      return { analysis: parseRoomAnalysis(await callGemini(prompt, images, ROOM_ANALYSIS_SCHEMA)), demoMode: false };
    } catch (err) {
      console.error(`analyzeRoom attempt ${attempt + 1} failed:`, err);
      if (attempt === 0) await sleep(RETRY_DELAY_MS);
    }
  }

  // Ladder step 5: never throw. A dead API must degrade to a working demo.
  return { analysis: fixtureFor(hint), demoMode: true };
}

export async function refineItem(
  images: ImageInput[],
  itemName: string,
  candidates: string[],
): Promise<RefineResult> {
  const fallback: RefineResult = {
    category: candidates[0] ?? 'unknown_item',
    sizeClass: 'm',
    confidence: 0.5,
    demoMode: true,
  };

  if (isDemoMode()) return fallback;

  const prompt = `Look at these photographs of one room and consider ONLY the "${itemName}".

Decide which of these categories it is: ${candidates.join(', ')}.
Then judge its size relative to typical items of that type: "s", "m", or "l".
Ignore every other object in the photographs.`;

  try {
    const raw = await callGemini(prompt, images, REFINE_SCHEMA) as Record<string, unknown>;
    return {
      category: typeof raw.category === 'string' ? raw.category : fallback.category,
      sizeClass: (['s','m','l'] as const).includes(raw.sizeClass as SizeClass)
        ? raw.sizeClass as SizeClass : 'm',
      confidence: typeof raw.confidence === 'number'
        ? Math.min(1, Math.max(0, raw.confidence)) : 0.6,
      demoMode: false,
    };
  } catch (err) {
    console.error('refineItem failed:', err);
    return fallback;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/gemini.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Verify the real API once, manually**

Run a one-off script against a real photo with `MOVESCAN_DEMO_MODE=0` and a valid key. Confirm the response parses and `demoMode` is `false`. **This is the moment to check the SDK call shape against reality** — if `client().models.generateContent` or the `config.responseSchema` field differs from the installed types, fix `callGemini` and note it in review.

- [ ] **Step 7: Commit**

```bash
git add lib/gemini.ts lib/gemini.test.ts .env.local.example package.json package-lock.json
git commit -m "feat: add Gemini client with retry ladder and fixture fallback"
```

---

## Task 6: Database schema and access layer

**Files:**
- Create: `db/schema.sql`, `lib/db.ts`

**Interfaces:**
- Consumes: types from `lib/types.ts`.
- Produces:
  - `createSession(): Promise<string>`
  - `createRoom(sessionId: string, roomType: RoomType): Promise<string>`
  - `saveCapture(roomId: string, file: Buffer, mimeType: string): Promise<string>`
  - `getCaptureBase64(roomId: string): Promise<ImageInput[]>`
  - `replaceItems(roomId: string, items: Omit<Item,'id'|'roomId'>[]): Promise<Item[]>`
  - `updateItem(itemId: string, patch: Partial<Item>): Promise<Item>`
  - `createItem(roomId: string, item: Omit<Item,'id'|'roomId'>): Promise<Item>`
  - `deleteItem(itemId: string): Promise<void>`
  - `getItem(itemId: string): Promise<Item | null>`
  - `setAccessFlags(roomId: string, flags: AccessFlag[]): Promise<void>`
  - `getSessionRooms(sessionId: string): Promise<Room[]>`
  - `saveQuote(sessionId: string, breakdown: QuoteBreakdown): Promise<Quote>`
  - `getQuote(quoteId: string): Promise<Quote | null>`
  - `listPendingQuotes(): Promise<Quote[]>`
  - `confirmQuote(quoteId: string, cents: number, notes: string): Promise<Quote>`
  - `setSessionEmail(sessionId: string, email: string): Promise<void>`

- [ ] **Step 1: Write `db/schema.sql`**

```sql
create extension if not exists "pgcrypto";

create table sessions (
  id uuid primary key default gen_random_uuid(),
  customer_email text,
  status text not null default 'scanning',
  created_at timestamptz not null default now()
);

create table rooms (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  room_type text not null default 'other',
  access_flags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table captures (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  name text not null,
  category text not null,
  count integer not null default 1 check (count >= 1),
  size_class text not null default 'm' check (size_class in ('s','m','l')),
  cubic_feet numeric(6,1) not null check (cubic_feet > 0),
  confidence numeric(3,2) not null check (confidence >= 0 and confidence <= 1),
  source text not null default 'ai' check (source in ('ai','refined','user_added')),
  edited_by_user boolean not null default false,
  ambiguous_between text[],
  created_at timestamptz not null default now()
);

create table quotes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  breakdown jsonb not null,
  status text not null default 'pending_review'
    check (status in ('draft','pending_review','confirmed')),
  confirmed_cents integer,
  agent_notes text,
  created_at timestamptz not null default now()
);

create index on rooms (session_id);
create index on items (room_id);
create index on captures (room_id);
create index on quotes (status, created_at desc);
```

The `check` constraints mirror the coercions in `lib/schema.ts` deliberately: if a coercion is ever bypassed, the insert fails loudly instead of producing a silently wrong price.

- [ ] **Step 2: Run it in the Supabase SQL editor**

Then create a **private** Storage bucket named `captures`.

Access uses the service key from server-side route handlers only. RLS is not configured — acceptable for a demo with no real customer data, and listed in the spec's out-of-scope table. **Do not put the service key in any client component.**

- [ ] **Step 3: Implement `lib/db.ts`**

```bash
npm install @supabase/supabase-js
```

Implement each exported function above as a thin Supabase v2 query. Conventions to follow throughout:

- Snake_case in the database, camelCase in TypeScript. Map explicitly in a `rowToItem` / `rowToQuote` helper — do not scatter field renames across call sites.
- Every function throws on a Supabase error with a message naming the operation, e.g. `throw new Error(\`saveCapture failed: ${error.message}\`)`.
- `saveCapture` uploads to `captures/${roomId}/${crypto.randomUUID()}.jpg` and inserts the returned path.
- `getCaptureBase64` downloads every capture for the room and returns `ImageInput[]`. Cap at **12 images** — take the 12 most recent. This bounds request size and quota burn per room.
- `replaceItems` deletes existing rows for the room inside the same call before inserting, so re-analysing a room is idempotent rather than additive.
- `updateItem` always sets `edited_by_user = true`.

- [ ] **Step 4: Verify against the live database**

Write a throwaway script that creates a session, a room, inserts two items, and reads them back. Confirm camelCase mapping round-trips and that `replaceItems` called twice leaves two items, not four.

- [ ] **Step 5: Commit**

```bash
git add db/schema.sql lib/db.ts package.json package-lock.json
git commit -m "feat: add database schema and Supabase access layer"
```

---

## Task 7: API routes

**Files:**
- Create: `app/api/session/route.ts`, `app/api/analyze/route.ts`, `app/api/refine/route.ts`, `app/api/estimate/route.ts`, `app/api/item/route.ts`, `app/api/item/[itemId]/route.ts`, `app/api/quote/[quoteId]/confirm/route.ts`

**Interfaces:**
- Consumes: everything from `lib/`.
- Produces: the HTTP contract the UI tasks depend on.

| Route | Request | Response |
|---|---|---|
| `POST /api/session` | — | `{ sessionId }` |
| `POST /api/analyze` | `{ roomId }` | `{ items: Item[], roomType, demoMode }` |
| `POST /api/refine` | `{ itemId }` | `{ item: Item, demoMode }` |
| `POST /api/estimate` | `{ sessionId, email? }` | `{ quote: Quote }` |
| `POST /api/item` | `{ roomId, category, sizeClass }` | `{ item: Item }` |
| `PATCH /api/item/[itemId]` | `{ count?, sizeClass?, category? }` | `{ item: Item }` |
| `DELETE /api/item/[itemId]` | — | `{ ok: true }` |
| `POST /api/quote/[quoteId]/confirm` | `{ cents, notes }` | `{ quote: Quote }` |

Images are uploaded by `POST /api/analyze` as `multipart/form-data` with field `files[]` plus `roomId`, so capture and analysis are one round trip.

**`/api/analyze` sequence:**
1. Parse multipart; reject if more than 12 files or any file over 4MB (400).
2. `saveCapture` each file.
3. `getCaptureBase64(roomId)`.
4. `analyzeRoom(images, hint)`.
5. For each detected item, `resolveCubicFeet(category, sizeClass)` → build `Omit<Item,'id'|'roomId'>`.
6. `replaceItems(roomId, items)`.
7. Persist the inferred `roomType` on the room.
8. Return items, roomType, and `demoMode`.

**`/api/refine` sequence:** load the item; if it has no `ambiguousBetween` and `confidence >= 0.7`, return it unchanged (do not spend a call). Otherwise `refineItem`, then `updateItem` with the new category, size, confidence, and `source: 'refined'`.

**`/api/item` routes.** `PATCH` must recompute `cubicFeet` via `resolveCubicFeet(category, sizeClass)` whenever `category` or `sizeClass` changes, then call `updateItem` (which sets `editedByUser = true`). `POST` creates an item with `source: 'user_added'`, `confidence: 1.0`, and `cubicFeet` from the catalogue. `DELETE` removes the row.

Recomputing volume on every size change is the critical part: a size chip that does not move the price is a silent bug, and nothing in the demo path would reveal it.

**`/api/estimate` sequence:** `getSessionRooms`, flatten items, union access flags across rooms, `priceQuote`, `saveQuote` with status `pending_review`, set email if provided.

- [ ] **Step 1: Implement the routes**

Every handler follows this shape:

```ts
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (typeof body.roomId !== 'string') {
      return Response.json({ error: 'roomId is required' }, { status: 400 });
    }
    // ... call lib functions ...
    return Response.json(result);
  } catch (err) {
    console.error('POST /api/analyze failed:', err);
    return Response.json({ error: 'internal error' }, { status: 500 });
  }
}
```

Dynamic-segment handlers must await params:

```ts
export async function POST(
  req: Request,
  { params }: { params: Promise<{ quoteId: string }> },
) {
  const { quoteId } = await params;
  // ...
}
```

`app/api/quote/[quoteId]/confirm/route.ts` additionally requires header `x-agent-secret` to equal `process.env.AGENT_CONSOLE_SECRET`, returning 401 otherwise.

- [ ] **Step 2: Verify each route with curl**

```bash
curl -sX POST localhost:3000/api/session
curl -sX POST localhost:3000/api/analyze -F roomId=<id> -F files[]=@room.jpg
curl -sX POST localhost:3000/api/estimate -H 'content-type: application/json' -d '{"sessionId":"<id>"}'
```

Expected: 200 with the documented shape. Run once with `MOVESCAN_DEMO_MODE=1` and confirm `demoMode: true` comes back and no Gemini call is logged.

- [ ] **Step 3: Commit**

```bash
git add app/api
git commit -m "feat: add API routes for session, analyze, refine, estimate, and confirm"
```

---

## Task 8: Shared components

**Files:**
- Create: `components/Stepper.tsx`, `components/SizeChips.tsx`, `components/ItemRow.tsx`, `components/SimilarItemPicker.tsx`, `components/AccessFlags.tsx`, `components/PriceRange.tsx`
- Create: `lib/image.ts`

**Interfaces produced:**

```ts
Stepper:            { value: number; onChange: (n: number) => void; min?: number }
SizeChips:          { value: SizeClass; onChange: (s: SizeClass) => void }
ItemRow:            { item: Item; onChange: (patch: Partial<Item>) => void; onRemove: () => void }
SimilarItemPicker:  { roomType: RoomType; onPick: (category: string, sizeClass: SizeClass) => void; onCancel: () => void }
AccessFlags:        { value: AccessFlag[]; onChange: (f: AccessFlag[]) => void }
PriceRange:         { lowCents: number; highCents: number; tolerance: number }
downscaleImage:     (file: File) => Promise<Blob>
```

**`SimilarItemPicker` — exact required behavior.** This component is how a user adds an item the AI missed. It renders:
1. A scrollable list of `suggestForRoom(roomType)` entries, each showing `entry.label`, tappable.
2. On tap, a `SizeChips` control labeled "Smaller than usual / Typical / Larger than usual".
3. A confirm button that calls `onPick(category, sizeClass)`.

It contains **no numeric input of any kind** — no width, height, depth, volume, or dimension field. Users do not know their dresser's measurements; asking for them is the single biggest usability failure available here. The only inputs are a category tap and a size chip.

**`PriceRange` — exact required copy.** Renders `formatCents(lowCents) – formatCents(highCents)` as the headline, and beneath it, verbatim: `Confirmed within 2 hours`. It accepts no single-price prop, because no customer-facing screen may show one pre-confirmation.

**`lib/image.ts`:**

```ts
export async function downscaleImage(file: File, maxEdge = 1024, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      b => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
      'image/jpeg',
      quality,
    );
  });
}
```

- [ ] **Step 1: Implement the components**
- [ ] **Step 2: Verify on a real phone**

Deploy and open on a phone. Confirm tap targets are at least 44px, steppers are usable one-handed, and `SimilarItemPicker` scrolls without trapping the page scroll.

- [ ] **Step 3: Commit**

```bash
git add components lib/image.ts
git commit -m "feat: add shared UI components and client-side image downscaling"
```

---

## Task 9: Capture flow

**Files:**
- Create: `app/scan/[sessionId]/page.tsx`, `app/page.tsx`

**Capture input — use exactly this.** Do not use `getUserMedia`:

```tsx
<input
  type="file"
  accept="image/*"
  capture="environment"
  multiple
  onChange={handleFiles}
/>
```

This opens the native camera on iOS and Android, needs no permission dance, and works in every mobile browser. `getUserMedia` requires a custom viewfinder and shutter and fails in more ways under demo pressure.

**Screen flow:**
1. `app/page.tsx` — landing. One button: "Start your free scan". Calls `POST /api/session`, redirects to `/scan/[sessionId]`. **No signup, no email.**
2. `/scan/[sessionId]` — room loop:
   - Room label defaults to "Room 1"; user can pick a type, but it is optional because the model infers it.
   - Camera input; each selected file passes through `downscaleImage`, shown as a thumbnail strip with a remove affordance.
   - `AccessFlags` inline, phrased as questions: "Stairs to reach this room?", "Elevator?", "Long walk from the truck?"
   - "Analyse this room" → `POST /api/analyze` → shows detected item count → "Add another room" or "See my estimate".

**Loading state — required.** While `/api/analyze` is in flight, show a message naming the actual work: `Looking at 8 photos of your living room…`. Perceived speed matters more than real speed, and a generic spinner during a multi-second vision call reads as a hang.

**Edge cases to handle:**

| Case | Behavior |
|---|---|
| User picks 0 photos and taps analyse | Disable the button; hint "Add at least one photo" |
| User picks more than 12 | Keep the first 12, toast "Using your first 12 photos" |
| `downscaleImage` throws (HEIC edge case) | Upload the original file; do not block the flow |
| Analyse returns 0 items | "We didn't spot anything — add items yourself" + `SimilarItemPicker` |
| Analyse returns `demoMode: true` | Small banner: "Demo mode — using sample results" |
| Network failure on upload | Retry button that preserves selected photos; never lose the user's work |
| User backgrounds the app mid-upload | On return, re-check room state from the server rather than trusting local state |

- [ ] **Step 1: Implement the landing page and scan flow**
- [ ] **Step 2: Walk the full flow on a phone**

Photograph a real room, analyse, confirm items come back and the room persists on reload.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx app/scan
git commit -m "feat: add landing page and room-by-room capture flow"
```

---

## Task 10: Review and estimate screens

**Files:**
- Create: `app/review/[sessionId]/page.tsx`, `app/estimate/[sessionId]/page.tsx`

**`/review/[sessionId]` requirements:**
- Items grouped by room, room name as a header.
- Items with `confidence < 0.7` or a non-empty `ambiguousBetween` render **first**, under the heading `We weren't sure about these`. Each gets a "Check this" action calling `POST /api/refine`.
- Every other item renders under `Looks good`, collapsed by default.
- Each `ItemRow` allows: adjust count (`Stepper`), change size (`SizeChips`), remove. Any change calls `PATCH /api/item/[itemId]`, which sets `editedByUser`.
- "Add something we missed" opens `SimilarItemPicker`.
- Running total shows cubic feet, never a price. The price appears only on the estimate screen.
- Primary action: "Get my estimate" → `POST /api/estimate` → redirect to `/estimate/[sessionId]`.

Surfacing uncertain items first is the design's honesty mechanism: it presents model uncertainty as candour rather than letting the user discover an error themselves.

**`/estimate/[sessionId]` requirements:**
- `PriceRange` at the top. No single number anywhere.
- Breakdown: total cubic feet, base, labor, access adders. Read-only.
- Email field with a submit button labeled "Send me this estimate". This is the **only** place the app asks for contact details.
- On submit: `POST /api/estimate` with the email, then a confirmation state reading "A mover will confirm your price within 2 hours."
- An explicit line: "This is an estimate based on your photos. Your final price is confirmed by a moving specialist."

**Edge cases:**

| Case | Behavior |
|---|---|
| Session has no items | Redirect to `/scan/[sessionId]` with "Add some items first" |
| Invalid email format | Inline validation; do not block viewing the estimate |
| User reloads after submitting | Show the confirmation state, not the form again |
| Quote already confirmed by an agent | Show the firm confirmed price instead of the range |

- [ ] **Step 1: Implement both screens**
- [ ] **Step 2: Verify the full customer path on a phone**
- [ ] **Step 3: Commit**

```bash
git add app/review app/estimate
git commit -m "feat: add review screen with uncertainty-first ordering and estimate screen"
```

---

## Task 11: Agent review console

**Files:**
- Create: `app/agent/page.tsx`, `app/agent/[quoteId]/page.tsx`, `middleware.ts`

**Auth:** `middleware.ts` protects `/agent/*`. Accept a cookie `agent_secret` matching `AGENT_CONSOLE_SECRET`; if absent, render a single password field that sets the cookie. This is demo-grade and is listed as out-of-scope in the spec — do not represent it as real auth.

**`/agent` requirements:** table of `listPendingQuotes()` — session id, room count, total cubic feet, range, submitted time. Newest first. Row links to the detail page.

**`/agent/[quoteId]` requirements:**
- Left: inventory grouped by room, with capture thumbnails per room. Agent can adjust counts and sizes; edits reprice live via `priceQuote` client-side using the same pure function.
- Right: the range, plus a "Confirm at" numeric field **pre-filled with the subtotal**.
- Confirm button → `POST /api/quote/[quoteId]/confirm` with `x-agent-secret`.
- After confirming, show the firm price and mark the quote confirmed.
- Display the share of items with `editedByUser === true` as `Agent edit rate: N%`. This is the accuracy metric, and it is the number to put on a slide.

**The confirm field is pre-filled with the subtotal, and the customer sees a range that narrows to it.** The agent is narrowing an existing range, not issuing a new number — that is the whole point of the two-price design, and a free-text price field with no default would quietly break it.

**Edge cases:**

| Case | Behavior |
|---|---|
| Quote id does not exist | 404 page, "This quote no longer exists" |
| Quote already confirmed | Read-only view with the confirmed price and a "Reopen" action |
| Agent enters a price outside the range | Allow it, but warn: "Outside the range shown to the customer" |
| Agent enters 0 or a negative number | Block submission with inline validation |
| No pending quotes | Empty state pointing at the seed script from Task 12 |

- [ ] **Step 1: Implement middleware and both screens**
- [ ] **Step 2: Verify end to end**

Submit a quote as a customer on the phone, then confirm it in the console on a laptop, then reload the customer's estimate page and confirm the firm price replaces the range.

- [ ] **Step 3: Commit**

```bash
git add app/agent middleware.ts
git commit -m "feat: add agent review console with live repricing and edit-rate metric"
```

---

## Task 12: Demo hardening

**Files:**
- Create: `scripts/seed-demo.ts`, `app/error.tsx`, `app/not-found.tsx`
- Modify: `README.md`

- [ ] **Step 1: Write `scripts/seed-demo.ts`**

Creates one complete session: two rooms with real photos from `demo/photos/`, items from the fixtures, and a `pending_review` quote. Run before the demo so `/agent` is never empty on stage.

```bash
npx tsx scripts/seed-demo.ts
```

- [ ] **Step 2: Add error and not-found boundaries**

Every screen must fail to a readable message with a route back to the flow. No raw stack trace, no blank white screen. Judges notice a white screen more than a missing feature.

- [ ] **Step 3: Write the README demo runbook**

Include: env vars needed, `npm run dev`, the seed command, how to force demo mode (`MOVESCAN_DEMO_MODE=1`), the deployed URL, and the QR code.

- [ ] **Step 4: Rehearse three times on the demo device, on venue wifi**

Run the full path — landing → scan → review → estimate → agent confirm — three times end to end. Record the actual wall-clock time of `/api/analyze` and, if it exceeds 10 seconds, reduce the per-room image cap from 12 to 8.

- [ ] **Step 5: Verify the quota fallback deliberately**

Set an invalid `GEMINI_API_KEY`, run the flow, and confirm the app completes end to end in demo mode with the banner shown. **Do not skip this.** It is the difference between a rate limit being an inconvenience and being a failed demo.

- [ ] **Step 6: Commit**

```bash
git add scripts app/error.tsx app/not-found.tsx README.md
git commit -m "chore: add demo seed script, error boundaries, and runbook"
```

---

## Task 0 (do first): Scaffold

Listed last because it is mechanical, but it must be completed before Task 1.

- [ ] `npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --use-npm`
- [ ] `npm install -D vitest` and add `"test": "vitest run"` to scripts
- [ ] Confirm `resolveJsonModule: true` in `tsconfig.json`
- [ ] Create `.env.local.example` with the variables from Task 5
- [ ] Deploy an empty app to Vercel and confirm the URL loads on a phone
- [ ] Commit: `chore: scaffold Next.js app with Tailwind and Vitest`

**Deploy on day one, before any feature exists.** Deployment problems discovered at hour 44 are fatal; discovered at hour 1 they are a footnote.

---

## Suggested track assignment

| Track | Tasks | Depends on |
|---|---|---|
| Setup | 0 | — |
| A | 1, 2, 3 | 0 |
| B | 4, 5 | 1 |
| C | 6, 7 | 1, and B's interfaces |
| D | 8, 9, 10 | 7's HTTP contract |
| E | 11, 12 | 7, 8 |

Tasks 1–5 are pure logic with real tests and no UI, so they can be built and reviewed fast and in parallel. The HTTP contract in Task 7 is the seam that lets UI work start before the backend is finished — freeze that table early and treat changes to it as breaking.

Integration checkpoints at hour 16 and hour 24 are non-negotiable: merge to the deployed build rather than deferring. Code freeze at hour 40.
