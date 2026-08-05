# Head-to-head Compare Implementation Plan

**Goal:** Ship the v2 compare section per `docs/superpowers/specs/2026-08-05-head-to-head-compare-design.md`
— two metros for a role: shared-domain percentile bands, a target-salary overlay, and the H-1B
employer beeswarm (clamped at p99, n≤2 → note). Pure site work; adds a `vs` URL param.

## File Map

| File | Change |
|---|---|
| `site/lib/url-state.ts` | add `vs: string | null` to `UrlState` (parse/serialize, 5-digit CBSA) |
| `site/tests/url-state.test.ts` | extend for `vs` round-trip + validation |
| `site/lib/compare.ts` | NEW — `pctForSalary`, `sharedBandDomain`, `beeswarmAxisMax` (pure) |
| `site/tests/compare.test.ts` | NEW — unit tests |
| `site/components/HeadToHead.tsx` | NEW — the compare section (bands + target + beeswarm) |
| `site/tests/head-to-head.test.tsx` | NEW — component tests |
| `site/app/page.tsx` | parse/validate `vs`; mount `<HeadToHead>` after the hero-row; add `vs` to the URL-sync delete list |
| `site/app/globals.css` | `.h2h-*` styles, light/dark |
| `site/e2e/head-to-head.spec.ts` | NEW — renders, pick `vs`, target readout |

## Task 1: URL state — `vs` (tests-first)

Extend `url-state.test.ts`: `vs` round-trips a 5-digit CBSA; invalid/absent → null; default omitted
from the query. Then add `vs` to `UrlState`/`DEFAULT_STATE`/`parseState`/`serializeState`.

## Task 2: `compare.ts` + tests (tests-first)

`compare.test.ts`:
- `pctForSalary(row, salary, rpp, adjusted)` → `{kind:'in',pct}` at/between knots (exact at p50,
  linear midpoint between p25–p50), `{kind:'below'}` under p10, `{kind:'above'}` over p90, `null`
  when < 2 knots; respects COL adjust.
- `sharedBandDomain(rowA, rowB, rppA, rppB, adjusted)` = `[min p10, max p90]` across both.
- `beeswarmAxisMax(bundleA, bundleB, rppA, rppB, adjusted)` = max adjusted `p99`, excluding
  rpp-null-in-adjusted; fallback 1.

## Task 3: `HeadToHead.tsx` + component tests (tests-first)

`head-to-head.test.tsx` (fixtures: 2 metros with bands + employer files, one thin `n≤2` bundle,
one `lcaFilings:0` metro, one rpp-null):
- two selects default to distinct metros; changing A → `onSelect({metro})`, B → `onSelect({vs})`.
- both bands drawn on one shared domain.
- entering a target → a reference line + each metro's percentile readout (`in`/`below`/`above`).
- `n≤2` bundle → "…too few to plot" note, no dots; `lcaFilings:0` → "No H-1B filings on record".
- adjusted mode divides both band and beeswarm axes.

Component: props `{ meta, salaries, soc, adjusted, metroA, metroB, onSelect }`. Lazy `loadEmployers`
per metro (only when `lcaFilings > 0`), independent load/error state. Reuse `PercentileBand`;
deterministic vertical jitter for the swarm (no `Math.random`).

## Task 4: Page wiring + styles

- `page.tsx`: validate `vs` against `meta.metros` (like `metro`); default B to the first metro ≠ A;
  mount `<HeadToHead metroA={state.metro ?? defaultA} metroB={state.vs ?? defaultB} …>`; add `vs` to
  the `['role','metric','adj','metro']` delete list.
- `globals.css`: two-column compare layout, band rows, target line, beeswarm dots/axis, notes;
  theme-aware.

## Task 5: Full check + e2e

- `npx tsc --noEmit` + `npx vitest run` (site) green.
- e2e (`head-to-head.spec.ts`): section renders, choosing a `vs` metro updates the URL, a target
  shows a percentile readout. **Run the FULL e2e suite** (new sections have twice broken existing
  selectors).
- `NEXT_PUBLIC_BASE_PATH=/techpay-atlas npm run build` green.

## Done criteria

- All site tests + typecheck + build green; CI green on the PR; no `site/public/data` diff.
- Manual: pick A + B, bands compare on one scale, a target shows per-metro percentile, beeswarms
  render (thin ones noted), COL toggle rescales both.
