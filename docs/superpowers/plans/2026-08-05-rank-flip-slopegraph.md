# Rank-flip Slopegraph Implementation Plan

**Goal:** Ship the v2 slopegraph per `docs/superpowers/specs/2026-08-05-rank-flip-slopegraph-design.md`
— top-N metros by nominal pay for the selected role, nominal vs COL-adjusted rank *within the
shown set*, connecting lines whose crossings are the flips. Pure site work, no pipeline change.

## File Map

| File | Change |
|---|---|
| `site/lib/slopegraph.ts` | NEW — pure `slopeRows(metros, salaries, soc, n)` → within-subset nominal/adjusted ranks + delta |
| `site/tests/slopegraph.test.ts` | NEW — unit tests |
| `site/components/RankSlopegraph.tsx` | NEW — SVG slopegraph section |
| `site/tests/rank-slopegraph.test.tsx` | NEW — component tests |
| `site/app/page.tsx` | Mount `<RankSlopegraph>` right after the hero-row |
| `site/app/globals.css` | `.slope-*` styles + a `.sr-only` utility; light/dark via `prefers-color-scheme` |
| `site/e2e/slopegraph.spec.ts` | NEW — renders, click a metro opens the panel |

## Task 1: `slopegraph.ts` + tests

Tests-first (`site/tests/slopegraph.test.ts`):
- `slopeRows` returns top-N by nominal pay, each with `nominalRank`/`adjustedRank` computed
  *within the returned subset* and `delta = nominalRank − adjustedRank`.
- a cheaper metro (lower nominal, lower rpp) leapfrogs a pricier one on the adjusted side (delta > 0
  for the riser, < 0 for the faller).
- excludes `rpp == null` and suppressed (`p50 == null`) metros; stable tie-break by name.
- `capped` flag set when `p50` is top-coded.
- shrinking N re-ranks within the smaller subset (rank basis is the shown set, not the nation).

## Task 2: `RankSlopegraph.tsx` + component tests

Tests-first (`site/tests/rank-slopegraph.test.tsx`, fixture ~4 metros incl. one rpp-null, one
capped, one clear mover):
- renders N left nodes + N right nodes; a known mover's line crosses (adjusted y-order ≠ nominal).
- metric ≠ `pay` → inert note, no chart.
- fewer than 2 rankable metros → "Not enough data".
- visually-hidden `<ol>` summary lists each metro's move; its buttons call `onSelect(cbsa)`.
- clicking an SVG row also calls `onSelect(cbsa)`.

Component: props `{ meta, salaries, soc, metric, onSelect }`. Pay-only (reads `soc`, not the adjust
toggle). SVG is `aria-hidden`; the `.sr-only` ordered list is the accessible/interactive layer.
Lines classed `slope-rise`/`slope-fall`/`slope-flat`, movers (`|delta| ≥ 3`) bolder. Labels via
`fmtUsdCompact`, `≥` when capped.

## Task 3: Wire into the page + styles

- `page.tsx`: mount after the `hero-row` (before `TitleLens`); `onSelect={cbsa => update({ metro: cbsa })}`,
  passing `state.role` and `state.metric`.
- `globals.css`: two-column slope layout, rise/fall/flat color tokens (theme-aware, colorblind-safe,
  not color-only), focus ring, `.slope-scroll { overflow-x: auto }`, `.sr-only` utility.

## Task 4: Full check + e2e

- `npx tsc --noEmit` + `npx vitest run` (site) green.
- e2e (`slopegraph.spec.ts`): section renders, clicking a metro opens the panel. Run the FULL e2e
  suite (not just the new spec — last time a new section broke an existing selector).
- `NEXT_PUBLIC_BASE_PATH=/techpay-atlas npm run build` green.

## Done criteria

- All site tests + typecheck + build green; CI green on the PR.
- Renders from the shipped `salaries.json`, no `site/public/data` diff.
- Manual: pick a role, expensive hubs fall and cheaper metros rise, lines cross; metric≠Pay shows
  the inert note; clicking a metro opens the panel.
