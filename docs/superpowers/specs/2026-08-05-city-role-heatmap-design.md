# City × Role Heatmap — v2 Design Spec

**Date:** 2026-08-05 · **Status:** Draft for review

## Purpose

The v1 map answers "where does *one* role pay best." The heatmap answers the cross-cutting
question the map can't: **for a given metro, how does pay compare across all 21 roles — and for a
given role, across metros — in one glance.** It is v2 item #4 from the v1 design spec ("sortable
matrix, cell color = selected metric").

It also discharges a standing accessibility debt: the map encodes data purely visually (bubble
position + color). Rendered as a **semantic HTML `<table>`** with real row/column headers and the
value printed in every cell, the heatmap *is* the screen-reader-navigable tabular representation
of the salary dataset — the "table fallback" the project owes.

## Decisions

1. **Orientation: metros = rows, roles = columns.** Metros are the large, open-ended axis (393) —
   they get sortable, filterable rows with a bounded default set. Roles are the fixed 21 — columns,
   horizontally scrollable on narrow screens. The currently-selected role column and selected metro
   row are highlighted so the heatmap stays anchored to the rest of the page.
2. **Rendered as a real `<table>`**, not SVG: `<th scope="row">` per metro, `<th scope="col">` per
   role, `<caption>` naming the metric. Cell background is the color encoding; the **value is also
   printed in the cell** (or its `aria-label`), so nothing is color-only — this is both the a11y
   contract and the honesty rule.
3. **Reuse the existing metric + adjust controls.** No new state: the heatmap reads `state.metric`
   (`pay` / `emp` / `lq`) and `state.adjusted` from the FilterBar, and computes each cell with the
   existing `metricValue(row, metro, metric, adjusted)`. Pay cells honor COL-adjust; `emp`/`lq` are
   unaffected (same as the map).
4. **Color normalized per-column (per-role) by default**, with a "Normalize: per role / global"
   toggle. Pay ranges differ enormously between roles (a Data Analyst vs a Computer & IS Manager),
   so a single global pay ramp would wash out within-role variation — the common read is "which
   metros pay most for *this* role," which per-column normalization serves. A caption note states
   that under per-role normalization, **color is comparable down a column, not across columns**
   (the printed values remain the source of truth for cross-column comparison). Reuses
   `bubbleColor()` + the contrast-validated `RAMP_LIGHT` / `RAMP_DARK`.
5. **Bounded default row set: top 50 metros by total employment** (sum of `emp` across roles),
   with a metro search box and a "Show all 393" toggle. Default ≈ 50 × 21 ≈ 1,050 cells; full is
   ~8,200 — rendered but behind an explicit opt-in, with a note that expanding is heavier. No
   virtualization in v2 (a plain table scrolls; revisit only if the full grid drags).
6. **Suppressed / no-data cells render an em-dash in a muted cell**, never zero and never blank —
   the OEWS suppression stays visible. Top-coded pay cells show the `≥` prefix (reuse
   `displayPct`'s logic).
7. **Cells cross-link.** Clicking a cell selects that metro **and** role (`update({ metro, role })`)
   — opening the metro panel and re-centering the map/title-lens on that role, the same
   cross-linking idiom the conflation bar already uses. Keyboard-focusable, Enter/Space activate.

## Architecture

New component `site/components/RoleHeatmap.tsx`, mounted in `page.tsx` below `TitleLens`. No new
data fetch — it receives the already-loaded `meta` + `salaries`. No pipeline change, no new emit,
no data regeneration.

| Piece | Source |
|---|---|
| Cell value | existing `metricValue(row, metro, metric, adjusted)` (`derive.ts`) |
| Cell color | existing `bubbleColor(v, columnDomain, ramp)` + `RAMP_LIGHT/DARK` (`map-scales.ts`) |
| Column domain | `[min, max]` of that role's cell values across the visible metros (per-role); or global across all visible cells when the normalize toggle is "global" |
| Cell text | `displayPct`-style formatting for pay (`≥` when capped), `fmtNum` for emp, raw for lq |
| Row sort | reuse `rankMetros(...)` for the selected metric; header click sets the sort column |
| Controls | `state.metric` + `state.adjusted` from FilterBar (unchanged); heatmap-local: sort column/dir, normalize mode, row-limit, metro search |

`emp`/`lq` metrics never COL-adjust; a note in the caption reflects the active metric's meaning.

## UI

- **Section header**: "City × role" + a one-line caption naming the active metric and adjust state
  and the normalization note.
- **Controls row** (heatmap-local): metro search, "Show all / top 50" toggle, "Normalize: per role /
  global" toggle. Metric and COL-adjust stay in the global FilterBar.
- **Table**: sticky header row (roles) + sticky first column (metro names). Header cells are sort
  buttons (▲/▼ on the active column); default sort = selected role's value, desc. Selected role
  column and selected metro row highlighted. Horizontal scroll inside the section on narrow widths.
- **Cell**: colored background + printed value; hover/focus tooltip with metro, role, exact value,
  and "n employed" context. Muted em-dash for suppressed; muted + tooltip for pay cells in adjusted
  mode where `rpp == null` (the 6 Puerto Rico metros), reusing the map's behavior.
- **Legend**: the sequential ramp with min/max of the active column (or global), matching the map's
  legend idiom.

## Error handling

| Condition | Handling |
|---|---|
| Metro × role cell suppressed / missing | muted cell, em-dash, excluded from the column color domain |
| Entire column (role) empty for visible metros | column renders all em-dash; header still sortable (no-ops) |
| Adjusted pay, `rpp == null` (PR metros) | muted cell + tooltip "no cost-of-living index"; excluded from domain |
| Metro search matches nothing | "No metros match" row, controls still live |
| Top-coded pay (`capped`) | `≥` prefix on the printed value |

## Testing

- Component (`site/tests/role-heatmap.test.tsx`): renders a `<table>` with `scope`d headers from a
  fixture; per-column color domain (a value that's max in its column but mid-range globally gets the
  strong ramp end under per-role, a mid step under global); suppressed cell → em-dash and excluded
  from domain; header click re-sorts rows; cell click fires `update({ metro, role })`; adjusted mode
  nulls a `rpp == null` metro's pay cell; `emp`/`lq` cells ignore adjust.
- e2e (extend `site/e2e`): heatmap section renders, sorting by a column reorders rows, clicking a
  cell opens the metro panel.

## Out of scope (v2 of this section)

- The other v2 sections (rank-flip slopegraph, head-to-head compare, role-similarity matrix).
- Row virtualization / windowing beyond the top-N + show-all toggle.
- A transposed (roles-as-rows) mobile layout — narrow screens get horizontal scroll for now.
- Any pipeline/emit change — this section is pure site work on the shipped `salaries.json`.
