# Head-to-head Compare — v2 Design Spec

**Date:** 2026-08-05 · **Status:** Draft for review

## Purpose

Put two metros side by side for one role and answer "which is actually better for me?" — full
percentile bands on a shared scale, an optional **target-salary** overlay showing where a number
would land in each, and the real **H-1B employer beeswarm** for each metro. v2 item #5 from the v1
spec. It's the first section that reads the lazy `employers/{cbsa}.json` beeswarm `sample`/`p99`,
which nothing renders today.

## Decisions

1. **A = the selected metro, B = a new `vs` picker.** Metro A is the app's existing `state.metro`
   (shared with the map + panel); metro B is a new `vs` URL param. The section shows two selects —
   changing A calls `update({ metro })` (keeping everything in sync), changing B sets `vs`. Both
   default sensibly (A → selected metro or the top metro by pay for the role; B → the next distinct
   metro), so the section always renders a comparison and is deep-linkable via `metro` + `vs`. One
   new URL param, no parallel "selected metro" concept.
2. **Shared domain for both bands**, so widths are comparable — `[min p10, max p90]` across the two
   rows (COL-adjusted when the global adjust toggle is on). Reuses `PercentileBand`.
3. **Target-salary overlay** (optional input): a dollar amount draws a reference line across both
   bands and reports the interpolated percentile in each ("about the 60th percentile here").
   Interpolation is piecewise-linear over p10–p90; below p10 → "under the 10th", above p90 → "above
   the 90th". A caption flags it as an estimate from five percentiles, not a continuous CDF.
4. **Employer beeswarm from `sample`**, one row per metro, on a **shared salary axis clamped at
   `max(p99_A, p99_B)`** (the reason `p99` is emitted). Points are the deterministic `sample`; the
   axis and points COL-adjust with the toggle (each metro by its own `rpp`).
5. **Thin-bundle policy (the honesty call): `n ≤ 2` shows no swarm.** ~39% of bundles have n ≤ 2;
   a 1–2-point "swarm" reads as data it isn't. Those render a labeled note ("2 filings — too few to
   plot") instead, mirroring the panel's existing "treat medians as anecdotes" line. A metro with
   `lcaFilings === 0` (no employer file) shows "No H-1B filings on record."
6. **Cross-links stay live.** Picking A or B updates the shared selection so the map/panel/other
   sections follow; the beeswarm axis and bands honor the global COL toggle.

## Architecture

New component `site/components/HeadToHead.tsx` + a small pure `site/lib/compare.ts`
(percentile interpolation + shared-domain/axis helpers). Mounted in `page.tsx` after the hero-row
(near the map/panel it extends). Lazy-fetches `employers/{A}` and `employers/{B}` via the existing
`loadEmployers`, only for metros with `lcaFilings > 0`.

| Piece | Source |
|---|---|
| Bands | `PercentileBand` over each metro's `salaries[cbsa][soc]`, shared domain |
| Target → percentile | new `pctForSalary(row, salary, rpp, adjusted)` in `compare.ts` (piecewise-linear p10–p90) |
| Beeswarm points/axis | `EmployerBundle.sample` + `p99` (`employers/{cbsa}.json`), `adjust()` per metro |
| Metro selects | `meta.metros`; A→`update({metro})`, B→`update({vs})` |
| URL state | extend `url-state.ts` with `vs: string | null` (5-digit CBSA, else null) |

## UI

- **Header** + a compact control row: "Compare **[A ▼]** vs **[B ▼]**" and a "target salary"
  number input (empty by default).
- **Bands block**: two labeled rows (metro name + median), `PercentileBand` each on the shared
  domain; when a target is entered, a vertical reference line crosses both and each row shows the
  interpolated percentile.
- **Beeswarm block**: two rows on the shared clamped axis; dots are `sample`, median ticked;
  thin/empty bundles show their note instead of dots. Small axis labels at `0`/`p99`.
- **Loading / error**: each metro's employer row loads independently ("Loading employers…" →
  swarm / note / "couldn't load").

## Error handling

| Condition | Handling |
|---|---|
| A and B the same metro | allowed but a hint ("pick two different metros"); bands identical |
| Role suppressed in A or B | that side's band shows "no data"; beeswarm shows its note |
| `vs` missing/invalid in URL | fall back to the default B (next distinct metro) |
| `lcaFilings === 0` for a metro | "No H-1B filings on record" (no fetch) |
| `n ≤ 2` bundle | "N filings — too few to plot" instead of a swarm |
| target below p10 / above p90 | "under the 10th" / "above the 90th percentile" |
| adjusted mode, `rpp == null` (PR) | that metro can't be COL-adjusted — bands/beeswarm muted with the existing tooltip idiom |

## Testing

- Unit (`site/tests/compare.test.ts`): `pctForSalary` — exact percentile at each knot, linear
  midpoints, clamps below p10 / above p90, null-safe; shared-domain and clamped-axis helpers.
- Component (`site/tests/head-to-head.test.tsx`): two selects default to distinct metros; changing
  A fires `update({metro})`, B fires `update({vs})`; shared band domain; target overlay shows a
  reference line + per-metro percentile; a thin bundle (n≤2) renders the note not a swarm; an
  `lcaFilings:0` metro shows the no-filings note; adjusted mode divides both axes.
- e2e (extend `site/e2e`): section renders, choosing a `vs` metro updates the URL, entering a
  target shows the percentile readout. (Run the FULL e2e suite.)

## Out of scope (this section)

- More than two metros; saved/again comparisons; a continuous CDF (we interpolate five percentiles).
- The role-similarity matrix (separate v2 section) and any pipeline/emit change — pure site work on
  the shipped `salaries.json` + `employers/*.json`.
