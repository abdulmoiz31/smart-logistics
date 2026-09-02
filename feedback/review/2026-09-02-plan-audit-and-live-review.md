# Plan Audit & Live Review

**Date:** 2026-09-02
**Reviewed:** `c616d9c` — in sync with `origin/main`, working tree clean
**Method:** plan-by-plan artifact audit, verification gate, local dev server at 1280×900 and 375×812

---

## Verdict

Seven of nine plans are implemented. **Two are not** — and one of those was written before the
work it depends on, so it was never picked up.

The gate is green: typecheck clean, **113 tests passing**, production build succeeds. The
customer-flow design pass, annotations, accessibility pass and demo-data generator all landed.

One **functional blocker** on mobile: a globally fixed auth badge makes "Edit inventory"
untappable on the estimate screen, sending the user to a sign-in page instead of back to
their inventory.

---

## Plan audit

| # | Plan | Status | Evidence |
|---|---|---|---|
| 1 | `2026-08-31-movescan-mvp` | **Done** | Whole pipeline live |
| 2 | `2026-09-01-deployment-plan` | **Done** | Deployed; body-size fix in place |
| 3 | `2026-09-01-feature-expansion` | **Done** (T13 superseded) | Moving plan, handling, print, audit trail |
| 4 | `2026-09-01-lite-tier-and-review-fixes` | **Done** | Cascade, `abortSignal`, refine guards |
| 5 | `2026-09-02-app-wide-theme-and-agent-session` | **NOT DONE** | See below |
| 6 | `2026-09-02-console-theming-previews-charts` | **Done** | Tokens, `Lightbox`, 4 chart components |
| 7 | `2026-09-02-demo-data-customer-polish-annotations` | **Done** | `seed-demo-data.ts`, `PhotoAnnotations.tsx`, `0002_item_box.sql`, radiogroup, `--u-*` tokens |
| 8 | `2026-09-02-scan-rate-limiting-and-auth` | **Done** | `consume_quota`, `lib/rate-limit.ts`, device + user buckets |
| 9 | `2026-09-02-session-ownership-and-authorization` | **NOT DONE** | See below |

Also delivered beyond plan: `0003_leads_summary_view.sql`, which is the `getLeadsSummary`
aggregation flagged as a follow-up. Good catch by whoever did it.

### Plan 5 — app-wide theme + agent session expiry: not started

Three checks, all negative:

- **`ThemeToggle` is still mounted only in `components/agent/console.tsx`.** No customer page
  has it, so the theme switch remains console-only.
- **`--u-*` customer tokens have zero dark overrides.** `app/globals.css` defines
  `--u-bg`, `--u-panel`, `--u-ink*` under bare `:root` and nothing under
  `[data-theme='dark']`. The customer flow is light-only by construction.
- **Agent session is unchanged.** `app/api/agent/login/route.ts` still sets
  `maxAge: 60 * 60 * 8` with the **raw shared secret as the cookie value**, and there is no
  `app/api/agent/logout` route.

Worth noting *why* this is unimplemented rather than half-done: Plan 7's Task 2 explicitly
said "the customer flow stays light," and it shipped exactly that with the `--u-*` tokens.
Plan 5 then reversed that decision. The two plans disagree, Plan 7 was implemented, and
Plan 5 was never picked up. That is a planning conflict, not a Qoder failure — and it needs
resolving before Plan 5 is handed over, because implementing it means undoing a constraint
Plan 7 deliberately enforced.

### Plan 9 — session ownership & authorization: not started

- No `lib/session-access.ts`, no `lib/session-access.test.ts`.
- No `sessions.user_id` / `sessions.device_id` — zero owner references in `db/schema.sql`.
- No `assertSessionAccess` or `canAccessSession` anywhere in `app/` or `lib/`.
- Migration slot `0002` was taken by `0002_item_box.sql`, so the planned
  `0002_session_ownership.sql` needs renumbering to `0004`.
- Task 1 of that plan is also outstanding: `lib/rate-limit.ts:39` still reads
  `process.env.RATE_LIMIT_IP_SALT ?? 'movescan'`.

Everything in the review that produced this plan still stands: nine customer routes
authorize on UUID shape alone, and item mutations can still change a price on a stranger's
quote.

---

## Blocker — "Edit inventory" is untappable on mobile

**`components/AuthBadge.tsx` is `fixed right-4 top-4 z-50`, mounted globally in
`app/layout.tsx`.** It therefore floats above every page's own top-right content.

Measured at 375×812 on `/estimate/[sessionId]`:

```
Edit inventory link : left 266  right 359  top 28  bottom 48
AuthBadge           : left 187  right 359  top 16  bottom 52   (z-index 50)
document.elementFromPoint(centre of Edit inventory)
                    → the AuthBadge "Sign in" anchor
editIsReachable     → false
```

So on a phone, tapping "Edit inventory" opens the **sign-in page**. The estimate screen's
only route back to the inventory is gone, on the device the product is designed around.

`c616d9c "fix: prevent mobile auth control overlap"` addressed part of this, but the
collision is still present at both widths tested.

**Same root cause, three other symptoms:**

1. **Desktop landing page.** The tagline chip (x 948–1152, y 42–66) overlaps "Sign in"
   (x 1092–1173, y 16–52) by roughly 60×10px at 1280px.
2. **The agent console login page renders customer "Sign in / Sign up" buttons.** Verified
   live at `/agent/login`. The console is a staff tool with its own shared-password auth;
   offering a customer signup there is semantically wrong.
3. **The console's theme toggle is very likely covered.** `ConsoleShell`'s header is
   `sticky top-0 z-20` and the toggle is `ml-auto` inside a `max-w-6xl px-5` container — at
   1280px that puts it near x 1160–1196, inside the badge's 1092–1264 span, and the badge
   wins at z-50. **This one is arithmetic, not observation** — I could not sign in to the
   console to confirm it. Check it directly.

**The fix is structural, not a z-index tweak.** A globally fixed overlay in the top-right
corner will collide with anything any page puts there. Options, in order of preference:

- Render `AuthBadge` **inside each page's own header row** as a flex sibling, so layout
  resolves collisions instead of stacking hiding them.
- Or keep it fixed but **exclude it from `/agent/*`** and reserve top-right padding on
  pages that use it.

The second is quicker; the first is correct.

---

## What landed well

- **Volume anchor now shows its reference range** — "Similar to a typical studio apartment —
  typically 200–400 cu ft." The earlier version dropped the numbers and was just a label.
- **Mono tabular numerics throughout the customer flow.** 242 cu ft, the price range, the
  breakdown. This is the strongest single unifier with the console and it reads correctly.
- **Teal accent replaced the old cyan** consistently; no stray `text-cyan-700` on the pages
  checked.
- **Special handling groups render cleanly** and the ragged-wrap issue is gone.
- **`0003_leads_summary_view.sql`** — the aggregation follow-up, done unprompted.
- **113 tests**, up from 107.

---

## Not verified

- **The agent console's authed pages** — queue, insights, quote detail. They need the
  console password, which I do not enter. The charts, the lightbox, the annotations and the
  tablet work are all unverified visually. Given the theme-toggle collision above is
  inference rather than observation, these need your own pass.
- **The seeded demo data's effect on the charts.** `scripts/seed-demo-data.ts` exists; I did
  not run it, so whether the funnel, trend and composition charts now read well is open.
  That was the whole point of Task 1 in Plan 7 — worth confirming.
- **Real-photo dedupe accuracy.** Still never measured.

---

## Suggested order

1. **`AuthBadge` collision** — functional blocker on the primary device. Fix structurally.
2. **Run `seed-demo-data` and look at the three charts.** They were built for data that did
   not exist; confirm they now read correctly.
3. **Resolve the Plan 5 / Plan 7 conflict** before handing Plan 5 over — decide whether the
   customer flow is themeable or light-only, and amend the losing plan.
4. **`RATE_LIMIT_IP_SALT`** — fifteen minutes, and it makes existing IP hashing meaningful.
5. **Plan 9 Tasks 2–4**, renumbering the migration to `0004`.
