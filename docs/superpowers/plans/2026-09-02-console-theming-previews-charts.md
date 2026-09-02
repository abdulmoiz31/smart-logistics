# Agent Console — Theming, Image Previews & Charts

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the whole agent console themeable with a dark/light toggle, end the light-shell/dark-aside inconsistency on the quote detail page, let an agent actually preview the customer's photos, and replace the Insights bar-stubs with validated charts.

**Architecture:** A CSS custom-property token layer on `<html data-theme>` replaces hardcoded Tailwind colour utilities inside the console. Charts are hand-built inline SVG — no charting library — so both themes come from the same tokens and the bundle stays small. Chart geometry is computed by pure, unit-tested functions in `lib/chart.ts`; components only render.

**Tech Stack:** unchanged. Next.js 15 App Router, Tailwind v4, Supabase, Vitest. **No new runtime dependencies.**

**Inputs:**
- `docs/superpowers/plans/2026-09-01-feature-expansion.md` (previous plan, complete)
- `components/agent/console.tsx` (dispatch console primitives, already shipped)

## Global Constraints

- **Verification gate:** `npx tsc --noEmit && npx vitest run && npx next build --turbopack` must all pass before a task is complete.
- **No new dependencies.** Charts are inline SVG. If a task seems to need a chart library, stop and flag it.
- **`lib/chart.ts` must be pure** — geometry and scale maths only. No React, no DOM, no fetch. It is unit-tested like `lib/pricing.ts` and `lib/moving-plan.ts`.
- **Scope the theme to the agent console.** Customer-facing pages (`/`, `/scan`, `/review`, `/estimate`) stay light and must not change appearance. They keep their existing explicit utility classes; do not migrate them to tokens in this plan.
- **Never set a colour on a console element with a hardcoded hex or a fixed Tailwind colour utility.** Use the token classes from Task 1. A `bg-slate-950` inside the console is the bug this plan exists to remove.
- **Both themes are *selected*, not flipped.** The dark palette is separately chosen and separately validated; it is not a filter or an inversion of the light one.
- **Chart colours are fixed by Task 5 and already validated** (`scripts/validate_palette.js`, six checks, both modes). Do not substitute other hues without re-running that validator.
- **Light mode carries a contrast WARN** on three categorical slots. That obligates visible direct labels **and** a table view on every chart. It is not dismissable.
- **Money stays integer cents; volume stays cubic feet** to one decimal.

---

## File Structure

| File | Responsibility | New? |
|---|---|---|
| `app/globals.css` | Console token definitions for both themes. | Modify |
| `app/layout.tsx` | Pre-paint theme script (no flash of wrong theme). | Modify |
| `components/agent/theme.tsx` | `ThemeToggle` + `useTheme` hook. | **New** |
| `components/agent/console.tsx` | Migrate primitives to tokens; host the toggle. | Modify |
| `app/agent/page.tsx` | Token migration only. | Modify |
| `app/agent/[quoteId]/page.tsx` | Token migration + kill the dark aside + photo previews. | Modify |
| `app/agent/leads/page.tsx` | Token migration + charts. | Modify |
| `app/agent/login/page.tsx` | Token migration. | Modify |
| `components/agent/Lightbox.tsx` | Accessible full-size photo viewer. | **New** |
| `lib/chart.ts` | Pure geometry: scales, ticks, line paths, stack layout. | **New** |
| `lib/chart.test.ts` | Unit tests for the above. | **New** |
| `components/agent/charts/FunnelChart.tsx` | Stage drop-off bars. | **New** |
| `components/agent/charts/TrendChart.tsx` | Two-series line with crosshair. | **New** |
| `components/agent/charts/CompositionChart.tsx` | Volume share, stacked bar. | **New** |
| `components/agent/charts/ChartFrame.tsx` | Title, legend, table-view toggle. | **New** |
| `lib/db.ts` | `getLeadsTrend()` and category composition. | Modify |
| `app/api/agent/leads/route.ts` | Return trend + composition. | Modify |

---

## Task 1: Theme token layer

**Files:** Modify `app/globals.css`, `app/layout.tsx`; create `components/agent/theme.tsx`

**Interfaces produced:**
- `type Theme = 'light' | 'dark'`
- `useTheme(): { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void }`
- `<ThemeToggle />`
- The token class names every later task consumes.

`app/globals.css` currently hardcodes `--background: #f8fafc` and applies it to both `html` and `body`. That is why the console needs a fixed overlay to stay dark, and why the detail page is stranded light. Tokens replace that.

- [ ] **Step 1: Define the tokens**

Add to `app/globals.css`. Light is the bare `:root` default; dark is selected, not derived.

```css
:root {
  /* Console surfaces — light */
  --c-bg:        #f1f5f9;
  --c-panel:     #ffffff;
  --c-panel-2:   #f8fafc;
  --c-border:    #e2e8f0;
  --c-border-hi: #cbd5e1;
  --c-ink:       #0f172a;
  --c-ink-2:     #475569;
  --c-ink-3:     #64748b;
  --c-accent:    #0f766e;
  --c-accent-ink:#ffffff;

  /* State — urgency rails and status */
  --c-fresh:     #0f766e;
  --c-waiting:   #b45309;
  --c-overdue:   #be123c;

  /* Chart surface + categorical slots (validated: see Task 5) */
  --viz-surface: #ffffff;
  --viz-1: #2a78d6;
  --viz-2: #eb6834;
  --viz-3: #1baf7a;
  --viz-4: #eda100;
  --viz-5: #e87ba4;
  --viz-grid: #e2e8f0;
}

:root[data-theme='dark'] {
  --c-bg:        #080c16;
  --c-panel:     #111827;
  --c-panel-2:   #0f1626;
  --c-border:    rgb(255 255 255 / 0.10);
  --c-border-hi: rgb(255 255 255 / 0.25);
  --c-ink:       #e8edf7;
  --c-ink-2:     #94a3b8;
  --c-ink-3:     #64748b;
  --c-accent:    #2dd4bf;
  --c-accent-ink:#080c16;

  --c-fresh:     #2dd4bf;
  --c-waiting:   #fbbf24;
  --c-overdue:   #fb7185;

  --viz-surface: #0f1626;
  --viz-1: #3987e5;
  --viz-2: #d95926;
  --viz-3: #199e70;
  --viz-4: #c98500;
  --viz-5: #d55181;
  --viz-grid: rgb(255 255 255 / 0.10);
}
```

**Leave `body`'s existing `--background` rule alone.** Customer pages depend on it. The
console sets its own background from `--c-bg` on its own wrapper.

- [ ] **Step 2: Expose the tokens as Tailwind utilities**

Tailwind v4 reads `@theme`. Add:

```css
@theme inline {
  --color-c-bg: var(--c-bg);
  --color-c-panel: var(--c-panel);
  --color-c-panel-2: var(--c-panel-2);
  --color-c-border: var(--c-border);
  --color-c-border-hi: var(--c-border-hi);
  --color-c-ink: var(--c-ink);
  --color-c-ink-2: var(--c-ink-2);
  --color-c-ink-3: var(--c-ink-3);
  --color-c-accent: var(--c-accent);
  --color-c-accent-ink: var(--c-accent-ink);
  --color-c-fresh: var(--c-fresh);
  --color-c-waiting: var(--c-waiting);
  --color-c-overdue: var(--c-overdue);
}
```

That yields `bg-c-panel`, `text-c-ink-2`, `border-c-border` and so on. If `@theme inline`
behaves differently in the installed Tailwind version, fall back to `bg-[var(--c-panel)]`
arbitrary values — **trust the installed Tailwind over this plan** and note the deviation.

- [ ] **Step 3: Prevent a flash of the wrong theme**

A client-side `useEffect` reads `localStorage` *after* first paint, so the wrong theme
shows for a frame. Add a blocking inline script in `app/layout.tsx`, inside `<head>`:

```tsx
<script
  dangerouslySetInnerHTML={{
    __html: `(function(){try{var t=localStorage.getItem('movescan-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`,
  }}
/>
```

Three deliberate choices: it runs before paint; it falls back to the OS preference when
nothing is stored; and the `catch` defaults to **dark** because the console is
dark-first — a private-mode agent should not get a white flash.

- [ ] **Step 4: Write `components/agent/theme.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'movescan-theme';

function current(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('dark');

  // The pre-paint script already set the attribute; adopt it rather than re-deciding.
  useEffect(() => setThemeState(current()), []);

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch { /* private mode: session-only */ }
    setThemeState(next);
  }, []);

  const toggle = useCallback(() => {
    setTheme(current() === 'dark' ? 'light' : 'dark');
  }, [setTheme]);

  return { theme, setTheme, toggle };
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      className="ml-auto grid size-9 place-items-center rounded-lg border border-c-border text-c-ink-2 transition hover:border-c-border-hi hover:text-c-ink"
    >
      <span aria-hidden className="text-sm">{theme === 'dark' ? '☀' : '☾'}</span>
    </button>
  );
}
```

The `localStorage` write is wrapped because it throws in some private-browsing modes;
losing persistence is acceptable, crashing the console is not.

- [ ] **Step 5: Verify both themes and persistence**

Toggle, reload, confirm the choice sticks. Then clear storage and confirm the OS
preference is honoured. Confirm no flash on reload in either mode.

- [ ] **Step 6: Gate and commit**

```bash
npx tsc --noEmit && npx vitest run && npx next build --turbopack
git commit -m "feat: add console theme tokens with pre-paint theme resolution"
```

---

## Task 2: Migrate the console shell and queue to tokens

**Files:** Modify `components/agent/console.tsx`, `app/agent/page.tsx`, `app/agent/login/page.tsx`

- [ ] **Step 1: Replace the fixed dark overlay**

`ConsoleShell` currently paints `fixed inset-0 bg-[#080C16]` to cover the light body.
With tokens, set the background on the wrapper instead:

```tsx
<div className="relative min-h-dvh bg-c-bg text-c-ink">
```

If overscroll still shows the body colour, add a `fixed inset-0 bg-c-bg` layer and give
the header and content wrappers `relative z-10` so they stack above it. **Do not use a
negative z-index** — a `fixed` child with `-z-10` paints behind the parent background,
which cost an hour of debugging the first time. Test whether the layer is needed at all
before adding it.

- [ ] **Step 2: Mount the toggle in the header**

Add `<ThemeToggle />` after the nav in `ConsoleShell`'s header row. It uses `ml-auto`, so
it sits hard right on every console page automatically.

- [ ] **Step 3: Swap every fixed colour for a token**

| Current | Replace with |
|---|---|
| `bg-[#080C16]` | `bg-c-bg` |
| `bg-[#111827]`, `bg-[#151F31]` | `bg-c-panel`, `hover:bg-c-panel-2` |
| `border-white/10`, `border-white/25` | `border-c-border`, `hover:border-c-border-hi` |
| `text-slate-100`, `text-white` | `text-c-ink` |
| `text-slate-400` | `text-c-ink-2` |
| `text-slate-500`, `text-slate-600` | `text-c-ink-3` |
| `text-teal-300`, `bg-teal-400` | `text-c-accent`, `bg-c-accent` |
| `bg-teal-400`/`bg-amber-400`/`bg-rose-400` rails | `bg-c-fresh`/`bg-c-waiting`/`bg-c-overdue` |
| `text-teal-300`/`text-amber-300`/`text-rose-300` | `text-c-fresh`/`text-c-waiting`/`text-c-overdue` |
| Handling chips `border-amber-400/30 bg-amber-400/10 text-amber-200` | `border-c-waiting/30 bg-c-waiting/10 text-c-waiting` |

- [ ] **Step 4: Check contrast in light mode specifically**

The urgency and handling colours were chosen against a dark surface. In light mode the
token values differ (`--c-waiting: #b45309` rather than `#fbbf24`) precisely so text stays
readable on white. Verify each of the three urgency states and the handling chips at both
themes; anything that reads washed out means the light token needs a darker step, not an
opacity tweak.

- [ ] **Step 5: Gate and commit**

---

## Task 3: Fix the quote detail page

**Files:** Modify `app/agent/[quoteId]/page.tsx`

The reported inconsistency: the page shell is `bg-slate-100`, item cards are `bg-white`,
and the live-estimate aside is `bg-slate-950` with white text. That aside was styled dark
to look deliberate while the rest of the page stayed light — the result reads as a bug,
and it does not respond to the theme at all.

- [ ] **Step 1: Wrap the page in `ConsoleShell`**

It currently rolls its own `<main>` and header with a back-link. Using `ConsoleShell`
gives it the tabs, the theme toggle and the same background for free. Add a third nav
state so neither tab shows as current:

```tsx
active: 'queue' | 'insights' | 'detail'
```

`Tab` already takes `current`, so `'detail'` simply matches neither. Keep the "← Quote
queue" back-link inside the page body.

- [ ] **Step 2: Retire the dark aside**

Replace `bg-slate-950 p-5 text-white` with `bg-c-panel border border-c-border text-c-ink`.
The aside should read as **elevated**, not inverted — it stays visually distinct through
its sticky position and border, not by fighting the page's theme.

Inside it: `text-cyan-300` → `text-c-accent`; the confirmed block's `bg-emerald-600` →
`bg-c-fresh` with `text-c-accent-ink`; the out-of-range warning's amber → `--c-waiting`
tokens; the confirm button's `bg-cyan-400 text-slate-950` → `bg-c-accent text-c-accent-ink`.

- [ ] **Step 3: Token-migrate the rest**

`bg-slate-100` → `bg-c-bg` (or drop it, since `ConsoleShell` supplies it), `bg-white` →
`bg-c-panel`, `text-slate-950` → `text-c-ink`, `text-slate-500` → `text-c-ink-3`.

The number input needs explicit theming or it renders with the browser default: add
`bg-c-panel-2 border-c-border text-c-ink`.

- [ ] **Step 4: Verify in both themes**

Confirm no element stays light in dark mode or vice versa. The specific regression to
watch for: `ItemRow` is shared with the customer-facing review page, so **do not**
token-migrate `components/ItemRow.tsx` — it would change the customer pages. If it looks
wrong inside the dark console, that is a real finding: report it rather than editing the
shared component, because the fix is a console-specific variant, not a global change.

- [ ] **Step 5: Gate and commit**

---

## Task 4: Photo previews

**Files:** Create `components/agent/Lightbox.tsx`; modify `app/agent/[quoteId]/page.tsx`

Today the detail page renders each capture as a fixed `h-20 w-20 object-cover` thumbnail.
An agent verifying whether the AI missed a wardrobe cannot see anything at that size.

**Read this before writing code — the signed-URL constraint.** `lib/db.ts:159` builds
these URLs with `createSignedUrls(paths, 60 * 60)` — a **one-hour TTL**. A detail page
left open past an hour will show broken images, and a lightbox makes that far more
visible than a thumbnail did. Handle it explicitly; do not assume the URL stays valid.

- [ ] **Step 1: Build `components/agent/Lightbox.tsx`**

Props: `{ urls: string[]; index: number; onClose: () => void; onNavigate: (i: number) => void; label: string }`

Required behaviour:
- Fixed full-viewport backdrop, `bg-black/80`, image `max-h-[90vh] max-w-[90vw] object-contain`.
- **Keyboard:** `Escape` closes, `←`/`→` navigate, and focus is trapped inside while open.
- Focus moves to the close button on open and returns to the invoking thumbnail on close.
- `role="dialog"` `aria-modal="true"` `aria-label={label}`.
- A counter — "3 of 8" — so the agent knows how many photos exist.
- Lock body scroll while open; restore on close.
- Backdrop click closes; a click on the image itself does not.
- Respect `prefers-reduced-motion` — no transition when set.

The backdrop is `bg-black/80` in **both** themes and is deliberately not tokenised: a
photo viewer wants a neutral dark surround regardless of console theme, because a light
backdrop shifts the apparent colour of the photo.

- [ ] **Step 2: Handle URL expiry**

On the lightbox `<img>`'s `onError`, re-fetch the quote endpoint to get fresh signed URLs
and retry once. If it fails again, show "This photo link expired — reload the page"
inside the lightbox rather than a broken image icon.

- [ ] **Step 3: Make thumbnails real controls**

The thumbnail strip is currently plain `<img>` elements. Wrap each in a `<button>` with
`aria-label={`Open photo ${i + 1} of ${urls.length} for ${roomLabel}`}`, a visible
focus ring, and `cursor-zoom-in`. Keep them keyboard reachable in DOM order.

Also change the thumbnail box from square to landscape: `h-20 w-20` becomes
`h-24 w-32` (keeping `object-cover`). A square crop of a wide room photo discards most of
the room, which defeats the point of a preview — the aspect ratio is the fix, not the
object-fit.

- [ ] **Step 4: Verify**

Open a seeded quote, click each thumbnail, navigate with the arrow keys, close with
`Escape`, and confirm focus returns to the thumbnail you opened. Tab through the strip
with no mouse. Then leave the page open, wait for expiry (or shorten the TTL locally),
and confirm the expiry message appears instead of a broken image.

- [ ] **Step 5: Gate and commit**

---

## Task 5: Chart data and pure geometry

**Files:** Create `lib/chart.ts`, `lib/chart.test.ts`; modify `lib/db.ts`, `app/api/agent/leads/route.ts`

**There is currently no time-series data.** `getLeadsSummary` returns scalars only, so a
trend chart needs a new query — this is a data task before it is a rendering task.

**Interfaces produced:**
- `interface TrendPoint { date: string; scans: number; confirmed: number }`
- `getLeadsTrend(days: number): Promise<TrendPoint[]>`
- `interface CompositionSlice { label: string; cubicFeet: number }`
- `getVolumeComposition(): Promise<CompositionSlice[]>`
- From `lib/chart.ts`: `niceTicks`, `linearScale`, `linePath`, `stackLayout`, `bucketByDay`

- [ ] **Step 1: Write the failing tests for `lib/chart.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { niceTicks, linearScale, linePath, stackLayout, bucketByDay } from './chart';

describe('niceTicks', () => {
  it('returns round numbers spanning the data', () => {
    const ticks = niceTicks(0, 87, 4);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(87);
    expect(ticks.every((t) => Number.isInteger(t))).toBe(true);
  });

  it('never returns a single tick for a flat series', () => {
    expect(niceTicks(5, 5, 4).length).toBeGreaterThanOrEqual(2);
  });

  it('handles an all-zero series without NaN', () => {
    const ticks = niceTicks(0, 0, 4);
    expect(ticks.some(Number.isNaN)).toBe(false);
    expect(ticks[ticks.length - 1]).toBeGreaterThan(0);
  });
});

describe('linearScale', () => {
  it('maps domain start to range start', () => {
    expect(linearScale(0, 100, 0, 200)(0)).toBe(0);
  });

  it('maps domain end to range end', () => {
    expect(linearScale(0, 100, 0, 200)(100)).toBe(200);
  });

  it('returns the range midpoint for a zero-width domain rather than dividing by zero', () => {
    const scale = linearScale(7, 7, 0, 200);
    expect(Number.isNaN(scale(7))).toBe(false);
    expect(scale(7)).toBe(100);
  });
});

describe('linePath', () => {
  it('produces one move and n-1 line commands', () => {
    const d = linePath([[0, 0], [10, 5], [20, 2]]);
    expect(d.startsWith('M')).toBe(true);
    expect((d.match(/L/g) ?? []).length).toBe(2);
  });

  it('returns an empty string for no points, so SVG renders nothing', () => {
    expect(linePath([])).toBe('');
  });

  it('returns a lone move for a single point', () => {
    expect(linePath([[3, 4]])).toBe('M 3 4');
  });
});

describe('stackLayout', () => {
  it('converts values to cumulative percentage offsets', () => {
    const out = stackLayout([25, 25, 50]);
    expect(out.map((s) => Math.round(s.percent))).toEqual([25, 25, 50]);
    expect(Math.round(out[2].offset)).toBe(50);
  });

  it('returns an empty array for an all-zero input rather than NaN offsets', () => {
    expect(stackLayout([0, 0])).toEqual([]);
  });

  it('percentages sum to 100', () => {
    const total = stackLayout([3, 7, 11]).reduce((s, x) => s + x.percent, 0);
    expect(Math.round(total)).toBe(100);
  });
});

describe('bucketByDay', () => {
  it('counts timestamps into their UTC day', () => {
    const out = bucketByDay(
      ['2026-09-01T10:00:00Z', '2026-09-01T22:00:00Z', '2026-09-02T01:00:00Z'],
      ['2026-09-01', '2026-09-02'],
    );
    expect(out).toEqual({ '2026-09-01': 2, '2026-09-02': 1 });
  });

  it('returns zero for days with no activity, so the line has no gaps', () => {
    const out = bucketByDay([], ['2026-09-01', '2026-09-02']);
    expect(out).toEqual({ '2026-09-01': 0, '2026-09-02': 0 });
  });

  it('ignores timestamps outside the requested days', () => {
    const out = bucketByDay(['2025-01-01T00:00:00Z'], ['2026-09-01']);
    expect(out).toEqual({ '2026-09-01': 0 });
  });
});
```

The zero-and-empty cases matter more than the happy paths: this console will be demoed
with sparse data, and a `NaN` in an SVG `d` attribute renders as nothing with no error.

- [ ] **Step 2: Run to confirm failure**, then implement `lib/chart.ts`

```ts
/** Pure chart geometry. No React, no DOM — unit-tested like lib/pricing.ts. */

export function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min;
  if (span <= 0) {
    const step = Math.max(1, Math.ceil(Math.abs(max) / count) || 1);
    return Array.from({ length: count + 1 }, (_, i) => min + i * step);
  }
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v < max + step; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

export function linearScale(d0: number, d1: number, r0: number, r1: number) {
  // A zero-width domain would divide by zero; centre it instead.
  if (d1 === d0) return () => (r0 + r1) / 2;
  return (value: number) => r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
}

export function linePath(points: [number, number][]): string {
  if (!points.length) return '';
  const [first, ...rest] = points;
  return rest.reduce(
    (d, [x, y]) => `${d} L ${x} ${y}`,
    `M ${first[0]} ${first[1]}`,
  );
}

export function stackLayout(values: number[]): { percent: number; offset: number }[] {
  const total = values.reduce((sum, v) => sum + Math.max(0, v), 0);
  if (total <= 0) return [];
  let offset = 0;
  return values.map((value) => {
    const percent = (Math.max(0, value) / total) * 100;
    const slice = { percent, offset };
    offset += percent;
    return slice;
  });
}

export function bucketByDay(timestamps: string[], days: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const day of days) counts[day] = 0;
  for (const stamp of timestamps) {
    const day = stamp.slice(0, 10);
    if (day in counts) counts[day] += 1;
  }
  return counts;
}
```

- [ ] **Step 3: Add the queries to `lib/db.ts`**

`getLeadsTrend(days)`: select `created_at` from `sessions`, and `created_at` from
`quotes` where `status = 'confirmed'`, both filtered to the window. Build the day list
in code, then `bucketByDay` each set. Return `TrendPoint[]` ordered oldest-first with
**no missing days** — a gap makes a line chart lie.

`getVolumeComposition()`: group items by a coarse category family and sum
`cubic_feet * count`. Map the 58 catalogue ids into **at most 5** families, because the
validated palette has five slots and the skill caps meaningful colour classes:

| Family | Catalogue ids |
|---|---|
| Furniture | sofas, chairs, tables, beds, dressers, wardrobes, desks, bookcases, storage |
| Appliances | fridge, freezer, oven, dishwasher, microwave, washer, dryer |
| Boxes | box_small, box_medium, box_large, wardrobe_box |
| Fitness & outdoor | treadmill, exercise_bike, elliptical, bicycle, patio_*, grill, lawn_mower, tool_chest |
| Other | everything else, including `unknown_item` |

Put that mapping in `data/catalogue-families.json` so it is data, not a switch statement.

**Note the existing inefficiency:** `getLeadsSummary` already does
`.from('sessions').select('id')` and `.from('quotes').select()` — full scans counted in
JS. These two new queries add two more. Acceptable at demo scale, but do not add a
fourth without aggregating; say so in review if the page feels slow.

- [ ] **Step 4: Extend the API**

`GET /api/agent/leads` returns `{ summary, trend, composition }`. Keep it behind the
existing agent auth. Default the trend window to **14 days**.

- [ ] **Step 5: Gate and commit**

---

## Task 6: Charts

**Files:** Create `components/agent/charts/{ChartFrame,FunnelChart,TrendChart,CompositionChart}.tsx`; modify `app/agent/leads/page.tsx`

### Form decisions — read before building

The request was "bar chart, line chart, pie chart." Two of those are right. The third
needs a different form, and here is why, because the reasoning matters more than the rule:

**Funnel → horizontal bars, not a pie.** Scans, estimates and confirmed are **nested
subsets**: every confirmed quote is also an estimate, and every estimate is also a scan.
A pie asserts that its slices are mutually exclusive parts of a whole, so a pie of these
three would count the same scan up to three times and show a total exceeding 100%. That
is not a style preference — the chart would be arithmetically false. Bars comparing each
stage against the first are correct and read faster.

**Trend → line.** Two series over 14 days. Exactly the right form.

**Where a part-to-whole chart genuinely fits: volume composition.** Cubic feet by
category family *is* mutually exclusive and sums to the total, with five families. The
default form for part-to-whole is a **horizontal stacked bar**, which is what this plan
specifies: it labels well, survives long category names, and compares across renders.
If you specifically want a pie for the demo, this is the one dataset where it would not
be misleading — swap the stacked bar for a donut and keep everything else. Say so
explicitly in review if you make that swap.

**Not a chart:** the accuracy figure and the four counts stay as the hero number and
metric strips from the last plan. A one-bar bar chart is worse than the number alone.

### Colour — already validated, do not substitute

The palette below passed all six checks of `scripts/validate_palette.js` in **both**
modes, including CVD separation and the normal-vision floor:

| Slot | Light | Dark |
|---|---|---|
| 1 | `#2a78d6` | `#3987e5` |
| 2 | `#eb6834` | `#d95926` |
| 3 | `#1baf7a` | `#199e70` |
| 4 | `#eda100` | `#c98500` |
| 5 | `#e87ba4` | `#d55181` |

Already wired as `--viz-1`…`--viz-5` in Task 1. Two consequences that are **requirements,
not suggestions**:

1. **Light mode returned a contrast WARN** for slots 3, 4 and 5 (2.74, 2.11, 2.62 against
   white — all below 3:1). Every chart therefore ships **visible direct labels** and a
   **table view**. Colour alone may never be the only way to read a value.
2. Adjacent-pair CVD separation sits at ΔE 9.1 (light) and 8.4 (dark) — above the floor,
   but close enough that direct labels are doing real work. Do not reorder the slots.

- [ ] **Step 1: Build `ChartFrame.tsx`**

Props: `{ title: string; description?: string; legend?: {label,color}[]; children: ReactNode; table: ReactNode }`

- Title as a `<h3>`, description as muted text below.
- Legend rendered whenever there are **2 or more** series; omitted for one (the title
  names it). Each legend entry is a colour swatch **plus a text label** — never colour alone.
- A "Table" toggle that swaps the SVG for the `table` node. This is the accessibility
  path the contrast WARN obliges, so it is not optional.
- `role="img"` with an `aria-label` summarising the chart on the SVG wrapper.
- Chart surface uses `--viz-surface`; grid and axes use `--viz-grid`; **all text uses
  the ink tokens, never a series colour.**

- [ ] **Step 2: `FunnelChart.tsx`**

Horizontal bars, one row per stage, each `width = count / totalScans * 100%`.

- Single hue (`--viz-1`) at descending opacity, or one hue plus gray de-emphasis — this
  is magnitude, not identity, so **no categorical colours here** and no legend.
- Bar height ~14px with `rx=4` on the data end only; 2px surface gap between bars.
- Direct label at the end of each bar: `68 · 55%`. Never a label inside a short bar.
- Stage name to the left in ink, not on the bar.
- A zero stage renders as an empty track with a visible `0` label, so it reads as
  measured-zero rather than missing.
- Hover tooltip per bar: stage name, count, percent of scans, percent of previous stage.

- [ ] **Step 3: `TrendChart.tsx`**

Two series — scans and confirmed — over 14 days.

- 2px lines, `--viz-1` and `--viz-2`, no fill (two overlapping areas obscure each other).
- Markers ≥8px only on hover; not on every point.
- Crosshair + tooltip on pointer move, snapped to the nearest day, listing both series.
- Y axis from `niceTicks(0, max)`, grid lines in `--viz-grid`, axis labels in `--c-ink-3`.
- X axis labels thinned to ~5 dates so they never collide; the rest are tick marks only.
- Legend required (2 series), plus direct end-of-line labels for both.
- **Single axis only.** If someone later asks to overlay estimate value on the same
  chart, that is a second chart, not a second y-axis.
- Sparse data: with fewer than 2 points, render "Not enough history yet — check back
  after a few more scans" instead of a one-point line.

- [ ] **Step 4: `CompositionChart.tsx`**

One horizontal stacked bar, five families, from `stackLayout`.

- Slots 1–5 in fixed order. **Order is by the family list, not by size** — colour follows
  the entity, so a family must keep its colour when the data changes.
- 2px surface-coloured gap between segments.
- Segments ≥8% get an inline label; smaller ones are labelled in the legend only.
- Legend shows family, cubic feet and percent.
- Hover tooltip per segment.
- Empty inventory renders the empty-state message, not a zero-width bar.

- [ ] **Step 5: Wire into the Insights page**

Order top to bottom: hero accuracy figure → metric strips → funnel → trend →
composition. The hero and strips already exist and stay as they are.

- [ ] **Step 6: Render it and look at it — in both themes**

The validator checks colour, not layout. Screenshot each chart in light **and** dark and
check for: label collisions, text overflowing the SVG viewBox, bars extending past the
plot area, tooltips clipped at the container edge, and axis labels colliding at narrow
widths. Then re-check at 768px.

- [ ] **Step 7: Check against the anti-patterns**

Explicitly confirm none of these apply: no dual axis; no pie of nested subsets; no
one-bar bar chart; no more than ~7 colour classes; no colour-only encoding; no label on
every data point; no rainbow sequential ramp; no series colour used for text.

- [ ] **Step 8: Gate and commit**

---

## Recommended execution order

| Order | Task | Effort | Note |
|---|---|---|---|
| 1 | Task 1 — theme tokens | 2–3h | Everything else depends on it |
| 2 | Task 2 — shell + queue migration | 1–2h | Proves the tokens on shipped UI |
| 3 | Task 3 — detail page | 2h | Closes the reported inconsistency |
| 4 | Task 4 — photo previews | 2–3h | Independent of the charts |
| 5 | Task 5 — chart data + geometry | 3–4h | Pure logic, fully testable |
| 6 | Task 6 — charts | 4–5h | Needs 1 and 5 done |

Roughly **14–19 hours**. Tasks 1–4 deliver the three reported problems and can ship
without any chart work; Tasks 5–6 are separable and can be cut if time runs short.

## Out of scope

- Theming the customer-facing pages. They stay light. The tokens make it straightforward
  later, but changing them here risks the demo path for no benefit.
- Migrating `components/ItemRow.tsx` — shared with the customer review page.
- A charting library. Everything here is inline SVG by design.
- Aggregating `getLeadsSummary` into SQL. Flagged in Task 5, not fixed.
- The two parked problem areas (return access, abuse/quota control) and the still-open
  real-photo dedupe measurement.
