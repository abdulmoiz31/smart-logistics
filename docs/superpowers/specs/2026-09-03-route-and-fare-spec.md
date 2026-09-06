# SPEC — Pickup, destination and travel fare in the estimate

**Date:** 2026-09-03
**Status:** spec only, no implementation
**Built for:** `decompose SPEC.md` → `buildall` (local-first opencode pipeline)

---

## 1. Goal

Let the customer set a **pickup address** and a **destination address** during the scan, and
fold travel into the estimate. Distance changes the price, so the estimate is wrong without it.

## 2. The domain insight this hinges on

**Movers do not price a 5-mile move and a 500-mile move with the same formula.** Adding a
per-mile line to the existing rate card would be the obvious move and it would be wrong.

| Mode | Trigger | How it prices |
|---|---|---|
| **Local** | under ~50 miles | Hourly crew + truck, as today. Travel is a **flat trip fee**, not per-mile — it covers getting the truck to you and back to the yard. |
| **Long-distance** | 50 miles or more | A **line haul** priced on volume × distance, plus a fuel surcharge. Hourly labour stops being the basis. |

So this feature does not add a line item — **it adds a pricing mode**, and `priceQuote` has to
choose between two formulas. Getting that wrong produces a $600 quote for a cross-country move.

The 50-mile threshold is a configurable rate-card value, not a constant in code. Real tariffs
vary by carrier and state.

### Second-order consequence: destination access

Access flags today are **per room, at the origin only** (`rooms.access_flags`). Stairs at the
destination cost exactly as much labour as stairs at the origin, and the app currently cannot
express that. Adding a destination makes this gap real, so it is in scope.

---

## 3. Location capture — map pin, not typed address

### Why the address approach was wrong for this market

The first draft of this spec assumed typed addresses with autocomplete. **That does not work in
Pakistan.** Street-level address data is sparse in both OSM and Google, so a typed address
frequently resolves to the wrong place or to nothing. This is exactly why every local ride app
— Careem, inDrive, Bykea — uses coarse search to *centre* a map and then a **pin drop** for the
actual point. Copy that pattern.

**This makes the feature cheaper, not more expensive**, because a pin gives you coordinates
directly and geocoding stops being on the critical path at all.

| Need | Solution | Cost |
|---|---|---|
| Centre the map | **Bundled JSON of ~40 Pakistani cities** with coordinates | **Zero API calls** |
| Pick the exact point | **Map pin drop** → lat/lon straight from the click | **Zero API calls** |
| Human-readable label | Reverse geocode, *optional*, degrades to "Pinned location" | Nominatim, 1 req/s |
| Distance | Haversine × road factor | **Zero API calls** |

Forward geocoding and autocomplete are **both dropped**. Nominatim forbids autocomplete anyway
(*"you must not implement such a service on the client side using the API"*), and Photon is no
longer needed. One less provider, one less failure mode.

### Tiles — verified allowed

The OSMF tile policy **permits web-app use** of `https://tile.openstreetmap.org/{z}/{x}/{y}.png`
subject to: visible "© OpenStreetMap contributors" attribution, valid Referer, HTTPS, local
caching, and no bulk pre-seeding or offline download. A handful of pin-drops is well within
moderate use.

Two caveats to design around rather than ignore:

- **No SLA, and "access may be blocked without prior notice."** For a demo that risk is small
  but real. Put the tile URL in `NEXT_PUBLIC_TILE_URL` so a backup provider (MapTiler or Stadia
  free tier, both key-based) can be swapped in from an env var if tiles fail on the day.
- **Offline use is explicitly prohibited** — do not add tile pre-caching "to make the demo safe."
  That would breach the policy, and the fallback for tile failure is the env var above.

### New dependency — this is a real exception

Section "Tech Stack" of previous plans said no new dependencies. A pin-drop map cannot be
hand-rolled sensibly, so this feature **adds `leaflet` + `@types/leaflet`** (~42 KB gzipped, MIT,
no key, raster tiles). MapLibre GL is the nicer vector option but needs a vector tile source,
which needs a key — so Leaflet is the zero-key choice.

**Next.js gotcha to specify up front:** Leaflet touches `window` at import time, so the map
component must be client-only and loaded with
`dynamic(() => import('./MapPicker'), { ssr: false })`. Importing it directly breaks the build.
Leaflet's CSS must also be imported, and its default marker icons are known to 404 under
bundlers — set an explicit icon or use a CSS-styled `divIcon`.

## 4. Data model

Migration `db/migrations/0006_session_route.sql` — **additive and idempotent** (`add column if
not exists`), matching 0001/0004.

```
sessions
  pickup_label        text      -- what the user saw and picked
  pickup_lat          numeric(9,6)
  pickup_lon          numeric(9,6)
  destination_label   text
  destination_lat     numeric(9,6)
  destination_lon     numeric(9,6)
  destination_access  text[]    -- same vocabulary as rooms.access_flags
```

All nullable. **A scan with no route must still produce an estimate** — the customer may not
know their destination yet, and blocking the scan on it would break the funnel. When the route
is absent, price in local mode with zero travel and say so.

Coordinates are stored so the geocode is never repeated: Nominatim's policy requires caching,
and it also means the estimate is reproducible.

---

## 5. New pure module — `lib/route.ts`

Pure like `lib/pricing.ts`, `lib/moving-plan.ts` and `lib/chart.ts`: **no network, no DB, no
`process.env`.** Unit-tested without quota.

```ts
export interface Coordinates { lat: number; lon: number }
export type MoveMode = 'local' | 'long_distance';

/** Great-circle distance in miles. */
export function haversineMiles(a: Coordinates, b: Coordinates): number;

/** Straight-line distance scaled by the road-circuity factor, rounded to 1 decimal. */
export function roadMiles(a: Coordinates, b: Coordinates, factor: number): number;

/**
 * Full resolution in one call: straight-line → mode → the factor that mode uses →
 * road miles. Local and intercity use different factors (see section 6), so mode
 * must be decided on the straight-line distance before the factor is applied.
 */
export function resolveRoute(a: Coordinates, b: Coordinates, card: RateCard): {
  miles: number;
  mode: MoveMode;
};

/** Which pricing formula applies. */
export function moveMode(miles: number, thresholdMiles: number): MoveMode;
```

### Required test cases

Write these **before** the implementations.

`haversineMiles`
- two identical points → `0`
- a known pair, asserted to ±1 mile (e.g. roughly 2,445 mi between LAX and JFK)
- symmetric: `d(a,b) === d(b,a)`
- crosses the antimeridian without returning a wrong-way-round distance
- negative latitudes (southern hemisphere) behave

`roadMiles`
- scales by the factor: identical points stay `0`
- rounds to one decimal
- a factor of `1` equals `haversineMiles`

`moveMode`
- below the threshold → `local`
- **exactly at the threshold → `long_distance`** (pin the boundary; an off-by-one here silently
  misprices every move at exactly 50 miles)
- `0` miles → `local`

`resolveRoute` — use real Pakistani coordinates so the numbers are checkable:
- Lahore (31.5204, 74.3587) → Islamabad (33.6844, 73.0479): ~168 straight miles, mode
  `long_distance`, road miles ~226 at factor 1.35
- Lahore Model Town (31.4820, 74.3294) → DHA (31.4697, 74.4114): ~4.9 straight miles, mode
  `local`, road miles ~7.4 at factor 1.50
- **A pair straddling the threshold must pick the mode from the straight-line distance, then
  apply that mode's factor** — not the reverse. Applying the local factor first can push a
  49-mile move over 50 and flip it to long-distance, which changes the entire formula.

---

## 6. Pricing changes — the risky part

`lib/pricing.ts` currently exports:

```ts
priceQuote(items: Item[], accessFlags: AccessFlag[], card: RateCard): QuoteBreakdown
```

This is a **pure function with 15 existing tests, consumed by `/api/estimate`, the agent detail
page's live repricing, and both seed scripts.** Changing its signature breaks all of them at once.

**Required approach: add an optional parameter, do not replace the signature.**

```ts
export interface RouteInput {
  miles: number;
  mode: MoveMode;
  destinationAccess: AccessFlag[];
}

priceQuote(
  items: Item[],
  accessFlags: AccessFlag[],
  card: RateCard,
  route?: RouteInput,           // omitted → today's behaviour, unchanged
): QuoteBreakdown
```

**Every existing pricing test must still pass untouched.** That is the acceptance criterion for
this step — if an existing test needs editing, the change is wrong.

### The two formulas

Local (`mode === 'local'`), unchanged except for two additions:

```
base         = volume × perCubicFootCents
labor        = ceil(volume / cuftPerCrewHour) × crewHourlyCents
access       = unique(originFlags ∪ destinationFlags) → flat adders
travel       = card.localTripFeeCents                  ← flat, not per-mile
subtotal     = max(base + labor + access + travel, minimumCents)
```

Long-distance (`mode === 'long_distance'`):

```
lineHaul     = volume × miles × card.lineHaulCentsPerCuFtMile
fuel         = round(lineHaul × card.fuelSurchargePct)
access       = unique(originFlags ∪ destinationFlags) → flat adders
subtotal     = max(lineHaul + fuel + access, card.longDistanceMinimumCents)
```

Note **hourly labour is absent** from long-distance — that is deliberate and is the whole point
of section 2. Line haul already prices the crew's time.

`QuoteBreakdown` gains `mode`, `miles`, `travelCents`, `lineHaulCents`, `fuelCents`. Existing
fields keep their meaning; the ones that do not apply to a mode are `0`, never absent, so the
type stays non-optional and the UI never has to branch on `undefined`.

### Tolerance

`computeTolerance` currently widens on low-confidence and user-added items. **Add: widen by
`0.02` when the route is absent**, because an estimate with no destination is genuinely less
certain. That keeps the band honest rather than decorative — the same principle the existing
tolerance follows.

### Rate card additions

`data/ratecard.json`:

```
localThresholdMiles          50
roadCircuityFactorLocal      1.50
roadCircuityFactorIntercity  1.35
localTripFeeCents            8500
lineHaulCentsPerCuFtMile     0.9
fuelSurchargePct             0.08
longDistanceMinimumCents     95000
```

Any of these must be settable to `0` to disable that term, so the engine stays data-driven
rather than fitted to one carrier.

### The road factor was calibrated, not guessed

The generic 1.25 figure in the first draft is **too low for Pakistan**. Measured straight-line
distance against published road distance:

| Route | Straight | Road | Factor |
|---|---|---|---|
| Karachi → Hyderabad | 149 km | 165 km | 1.11 |
| Karachi → Lahore | 1033 km | 1210 km | 1.17 |
| Islamabad → Peshawar | 145 km | 185 km | 1.27 |
| Lahore → Islamabad | 270 km | 375 km | 1.39 |
| Lahore → Faisalabad | 122 km | 185 km | 1.52 |
| Lahore intra-city (Model Town → DHA) | 7.9 km | 12 km | 1.52 |

Intercity mean is **1.29**, overall **1.33**, and short/intra-city routes sit at the top of the
range because dense street networks and one-way systems add more detour per kilometre than a
motorway corridor does.

Hence **two factors**: `roadCircuityFactorLocal` (1.50) applied below the mode threshold, and
`roadCircuityFactorIntercity` (1.35) above it. One factor cannot serve both — a single 1.25
underestimates a Lahore cross-town move by roughly 20%.

Long corridors like Karachi → Lahore come in *lower* (1.17) because the motorway is nearly
direct; the estimate range absorbs that overshoot comfortably.

---

## 7. Reverse geocoding — optional, cosmetic only

Forward geocoding is **out**. The pin supplies coordinates; nothing needs to resolve an address
string. What remains is turning a pin into a readable label, which is a nicety.

`lib/geo.ts`, server-side only (`import 'server-only'`):

```ts
/** Coordinates → a human label. Returns null on any failure. */
export function reverseGeocode(lat: number, lon: number): Promise<string | null>;
```

Requirements:

- **Never throws, and the feature works without it.** On `null` the UI stores and shows
  "Pinned location" plus the coordinates. Same discipline as `lib/gemini.ts`, whose cascade never
  throws to the caller.
- Nominatim `/reverse`, **one request per confirmed pin** — not per map move. Rate-limit to 1
  request/second process-wide with a simple timestamp gate; `consume_quota` is the wrong tool
  (daily, per-identity).
- Send a `User-Agent` identifying the app; Nominatim rejects requests without one.
- Cache by rounded coordinate (4 decimals ≈ 11 m) so re-confirming the same pin costs nothing.
- Attribution: "© OpenStreetMap contributors", already required for the tiles.

**Because this is cosmetic, it must not gate the flow.** Confirming a pin stores coordinates
immediately; the label arrives after, or never.

One route, behind `assertSessionAccess`:

```
PATCH /api/session/[sessionId]/route → { pickup?, destination?, destinationAccess? }
```

Body carries `{ lat, lon, label? }` per point. The server may attempt `reverseGeocode` when
`label` is absent, but must persist the coordinates regardless.

There is **no `/api/places` endpoint** — that belonged to the dropped autocomplete design, and
removing it also removes an unauthenticated outbound-request endpoint, which is the shape that
tends to get abused.

## 8. UI — city search, then pin

Described, not coded.

**Where:** a step *before* the first room on `/scan/[sessionId]`. Asking after five rooms wastes
the customer's work if they abandon, and asking first means the estimate is complete the moment
the last room is analysed.

**It must be skippable.** "I don't know my destination yet" proceeds with pickup only, or with
neither. The landing page promises "just photos"; a hard gate before any value breaks that.

### The flow, per point

1. **Pick a city** from a `<select>` populated by `data/pk-cities.json` (~40 entries, bundled,
   no API). This only sets the map's initial centre and zoom.
2. **Drag the map / tap to place the pin.** A centred crosshair with a draggable map reads better
   on a phone than a draggable marker — the thumb never covers the target. Show the pin's
   coordinates as they change.
3. **Confirm.** Only then does anything persist, and only then is a reverse geocode attempted.

### Requirements

- Map height fixed (~55vh on mobile), full width, `touch-action` set so the page does not fight
  the map for pan gestures. Getting this wrong makes the map unusable on a phone — test it.
- The map component is client-only via `dynamic(..., { ssr: false })`.
- Visible attribution: **"© OpenStreetMap contributors"**, non-negotiable — it is a licence
  condition, not styling.
- Destination access asks the same three questions as a room (stairs / elevator / long carry),
  reusing `components/AccessFlags.tsx` unchanged.
- Both themes: the map is raster tiles and will look light in dark mode. Do **not** CSS-filter
  the tiles to fake a dark map — it makes labels illegible and, at 100% zoom, misrepresents the
  data. Frame it in a `--c-panel` container and leave the tiles alone.
- No keyboard trap: the map must be skippable by keyboard to reach the confirm button.

### On the estimate screen

Inside the existing `MovingPlan` block, not a new card:

```
Distance   242 miles          Long-distance move
Line haul  $1,180
Fuel       $94
```

Local mode shows `Travel fee` instead. The mode label is what explains the number's shape.

Print stylesheet: new rows must appear in the PDF, and **the map must not** — add it to the
`@media print` hidden set in `app/estimate/[sessionId]/print.css`.

## 9. Out of scope

- Driving time and turn-by-turn routing. The map is for **picking a point**, not for showing a
  route line — no directions API, no polyline.
- Address autocomplete and forward geocoding, both dropped (section 3).
- Multi-stop moves, storage-in-transit, shuttle legs.
- Interstate tariff compliance. Long-distance household-goods pricing is regulated (FMCSA,
  49 CFR 375); this is a plausible demo model, **not** a compliant tariff. Say so on the slide.
- Reverse geocoding, saved addresses, address validation.

## 9b. One decision this feature forces: currency

`lib/pricing.ts` stores integer **cents** and `formatCents` hardcodes `$` and `en-US`. The whole
rate card is dollar-denominated. If the customer is pinning a location in Lahore, an estimate in
US dollars is incoherent, and it is the kind of mismatch a judge notices immediately.

Three options, and this is a product call rather than a technical one:

| Option | Effort | Note |
|---|---|---|
| **Leave USD** | none | Defensible only if the demo is framed as a US product that happens to be built here. Then the map should centre on a US city, not Karachi. |
| **Relabel to PKR** | ~1h | `formatCents` → `formatMinor` with a currency token; rate-card values rescaled to plausible PKR. Integer-minor-unit maths is unchanged, so no pricing logic moves. |
| **Multi-currency** | ~4h | Out of scope for a hackathon. |

**Decide before implementing section 8**, because the map's default centre and the rate-card
numbers have to agree with the choice. Do not ship a Karachi pin next to a `$` figure.

## 10. Acceptance

- `npx tsc --noEmit && npx vitest run && npx next build --turbopack` all pass.
- **All 15 existing `lib/pricing.test.ts` tests pass unmodified.**
- A scan with no route still reaches an estimate, priced in local mode, with widened tolerance.
- A 5-mile route prices local; a 500-mile route prices long-distance with no hourly labour term.
- A route straddling the threshold picks its mode from straight-line distance, then applies that
  mode's factor.
- With tiles blocked (DevTools request blocking on `tile.openstreetmap.org`), the picker still
  lets a pin be placed and confirmed — the map is a backdrop, not a dependency.
- `npm run check-db` reports the new columns present after `0006` is applied.
- Killing network access to the geocoder still lets a scan complete end to end.

---

## 11. Notes for `decompose`

**Step sizing is the binding constraint, not token cost.** Measured on this machine:
`build-qwen` (Qwen3-14B-AWQ) has a 12,288 window, and opencode's system prompt plus tool schemas
consume ~5,900 of it — leaving **~6,400 usable**. A step whose file, the sources it must read,
the diff and its output exceed that will produce stub files, as already observed once.

So:

| Step content | Route to |
|---|---|
| `lib/route.ts` + its tests — greenfield, pure, no existing files to read | `build-qwen` |
| `data/ratecard.json`, the migration, `lib/types.ts` additions | `build-qwen` |
| `lib/pricing.ts` changes — must read an existing 15-test file and not break it | **`build`** (32K) |
| `lib/geo.ts` + the two API routes | **`build`** (32K) |
| Scan UI: Leaflet picker, city select, dynamic import | **`build`** (32K) — new dependency + SSR gotcha |
| Estimate UI rows, print CSS | **`build`** (32K) |

Suggested order, each independently testable:

1. `lib/route.ts` + tests (pure, no dependencies)
2. Rate card fields + `lib/types.ts` + migration `0006`
3. `lib/pricing.ts` optional `route` parameter — existing tests must stay green
4. `data/pk-cities.json` + `lib/geo.ts` reverse-only, degrading to `null`
5. `PATCH /api/session/[sessionId]/route`
6. Leaflet map picker component, client-only, skippable
7. Scan-flow wiring + estimate + print rendering

Steps 1–2 have no dependencies and could run in parallel across the two builders if the
worktree-per-builder problem is solved; steps 3–7 are sequential.

**One instruction to carry into every step:** green tests do not prove the step is done. The
builder writes both the code and the tests, so a forgotten requirement is forgotten in both.
The reviewer must tick each requirement in this spec off against the diff.
