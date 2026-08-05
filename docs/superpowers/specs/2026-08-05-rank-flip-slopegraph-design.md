# Rank-flip Slopegraph — v2 Design Spec

**Date:** 2026-08-05 · **Status:** Draft for review

## Purpose

Make the project's central claim *legible*: expressing pay in cost-of-living-adjusted dollars
reorders the metro ranking more than people expect. Pick a role; the slopegraph shows the
top-paying metros' **nominal** order on the left and their **COL-adjusted** order on the right,
connected by lines whose crossings *are* the rank flips. It's v2 item #3 from the v1 spec
("pick a role, cities move between nominal and adjusted rank").

## Decisions

1. **Pay-only; reads the selected role, ignores the global metric/adjust toggles.** The chart
   shows *both* the nominal and adjusted orderings at once, so "adjusted" is not a mode here.
   `emp`/`lq` have no cost-of-living duality, so the section is inert for them (renders a one-line
   "switch the metric to Pay" note rather than a meaningless chart).
2. **Top-N by nominal pay (default 18), re-ranked *within that subset* for both columns.** A
   caption states the order is "among the top N by pay for this role." This keeps the vertical
   scale clean — plotting absolute national ranks (1…393) on the adjusted side would be an
   unreadable scatter — while the endpoint labels still print each metro's pay, so nothing is
   hidden. (Absolute-national-rank axis considered and rejected: illegible scale, little added
   signal for the "who leapfrogs whom" question.)
3. **Static slopegraph** — both columns plus connecting lines, no animation. It conveys the same
   comparison, is screen-reader- and reduced-motion-friendly, and doesn't hinge on motion. (This
   deviates from the v1 brainstorm's "animate" wording, intentionally.)
4. **rpp-null metros are excluded** (the 6 Puerto Rico metros) — with no cost-of-living index they
   have no adjusted position. Consistent with the map, which already omits them.
5. **Movers are emphasized, direction encoded redundantly.** Lines are colored by direction —
   metros that *rise* under adjustment (cheaper cities) vs *fall* (expensive hubs) vs flat (muted)
   — but the message is carried by the crossing geometry and the labels too, never color alone.
   Colorblind-safe tints validated against the dataviz palette.
6. **Cross-links + accessible.** Clicking a metro's label/endpoint selects it (opens the drill-down
   panel), the same idiom as the map and heatmap. A visually-hidden ordered summary ("Austin: #6
   nominal → #1 adjusted, +5") backs the `aria-hidden` SVG for screen readers.

## Architecture

New pure lib `site/lib/slopegraph.ts` + component `site/components/RankSlopegraph.tsx`, mounted in
`page.tsx` right after the hero-row (map + panel) — it directly extends the map's COL-adjust story.
No new data fetch; no pipeline change; reads the already-loaded `meta` + `salaries`.

| Piece | Source |
|---|---|
| Nominal $ / adjusted $ per metro | `p50` and `adjust(p50, rpp, true)` (`derive.ts`) |
| Row set + ranks | new `slopeRows(metros, salaries, soc, n)`: filter to metros with `rpp != null` and a non-null `p50`, take top-N by nominal, compute each row's nominal & adjusted rank *within the subset* + `delta` |
| Labels | `fmtUsdCompact` (`format.ts`); `≥` prefix when `p50` is `capped` |
| Colors | theme accent (rise) + a validated counter-tint (fall); muted token for flat |

`slopeRows` is pure and unit-tested; the component is a thin SVG renderer over it.

## UI

- **Header**: "Cost-of-living flips the ranking" + a caption naming the role and "top N by pay;
  order shown is among these metros."
- **Chart**: two vertical axes (Nominal | Adjusted), one node per metro per side at its rank
  position, connecting lines. Left labels = metro + nominal $; right labels = metro + adjusted $.
  Biggest movers drawn boldest; flat metros muted. Legend: "rises / falls under adjustment."
- **Interaction**: hover/focus a line or label highlights the pair and shows the Δrank; click
  selects the metro. Keyboard-focusable endpoints.
- **Empty / inert states**: fewer than 2 rankable metros → "Not enough data for this role"; metric
  not Pay → "Switch the metric to Pay to see the cost-of-living rank flip."

## Error handling

| Condition | Handling |
|---|---|
| Role has < 2 metros with pay + rpp | "Not enough data for this role" |
| Metric is `emp`/`lq` | inert note pointing back to Pay (chart not drawn) |
| Tie in nominal or adjusted pay | stable tie-break by metro name |
| Top-coded `p50` (`capped`) | ranked by the filed floor; label shows `≥` |
| rpp-null metro | excluded from the row set |

## Testing

- Unit (`site/tests/slopegraph.test.ts`): top-N selection by nominal; within-subset adjusted
  re-rank (a cheaper city with lower nominal pay but higher adjusted rank leapfrogs a pricier one);
  excludes rpp-null and suppressed metros; tie-break by name; `delta` sign/magnitude.
- Component (`site/tests/rank-slopegraph.test.tsx`): N nodes per side; a known mover's endpoints
  are on crossing lines (adjusted y-order differs from nominal); click endpoint → `onSelect`;
  sr-only summary lists the moves; inert note when metric ≠ pay; empty state for a thin role.
- e2e (extend `site/e2e`): section renders, clicking a metro opens the panel.

## Out of scope (this section)

- Animation / transitions between the two orderings.
- Head-to-head compare and the role-similarity matrix (separate v2 sections).
- An absolute-national-rank axis, and showing more than the top-N (with a note that it's capped).
- Any pipeline/emit change — pure site work on the shipped `salaries.json`.
