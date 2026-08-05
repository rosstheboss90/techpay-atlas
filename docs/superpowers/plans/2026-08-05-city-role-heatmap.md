# City × Role Heatmap Implementation Plan

**Goal:** Ship the v2 heatmap per `docs/superpowers/specs/2026-08-05-city-role-heatmap-design.md`
— a metros × roles `<table>`, per-column color, reusing the metric/adjust controls and the shipped
`salaries.json`. No pipeline change.

## File Map

| File | Change |
|---|---|
| `site/lib/heatmap.ts` | NEW — pure helpers: `heatmapColumns` (per-role domains), `topMetrosByEmployment`, `sortMetros`, cell-value/format glue over `derive.ts` |
| `site/tests/heatmap.test.ts` | NEW — unit tests for the pure helpers |
| `site/components/RoleHeatmap.tsx` | NEW — the `<table>` section component |
| `site/tests/role-heatmap.test.tsx` | NEW — component tests |
| `site/app/page.tsx` | Mount `<RoleHeatmap>` below `<TitleLens>`, pass `meta`/`salaries`/`state`/`update` |
| `site/app/globals.css` | Heatmap styles (`.hm-*`), light/dark via `prefers-color-scheme` |
| `site/e2e/*.spec.ts` | Extend happy-path: heatmap renders, sort reorders, cell click opens panel |

## Task 1: Pure helpers + tests (`site/lib/heatmap.ts`)

Tests-first. `site/tests/heatmap.test.ts`:
- `topMetrosByEmployment(metros, salaries, n)` returns the n metros with the largest summed `emp`
  across roles, descending; metros with no rows sort last; deterministic tie-break by cbsa.
- `columnDomain(metros, salaries, soc, metric, adjusted)` → `[min,max]` over non-null cell values
  for that role; ignores suppressed and (in adjusted pay) `rpp==null` cells; returns `null` when the
  column is empty.
- `sortMetros(metros, salaries, sortSoc, metric, adjusted, dir)` orders rows by that role's metric
  (nulls always last, both dirs); stable tie-break by name.

Implement the helpers as thin compositions over `derive.ts`' `metricValue`. Run `npx vitest run
tests/heatmap.test.ts`.

## Task 2: `RoleHeatmap.tsx` + component tests

Tests-first. `site/tests/role-heatmap.test.tsx` (fixture: ~3 metros × 3 roles, one suppressed cell,
one `rpp==null` metro, one `capped` pay cell):
- renders a `<table>` with a `<caption>`, `<th scope="col">` per role, `<th scope="row">` per metro.
- suppressed / missing cell → `—`, and its color class is the muted token, and it's excluded from
  the column domain (a sibling max still gets the strong ramp step).
- per-column color: the column-max cell gets the strong ramp end even when another column holds a
  larger absolute value.
- clicking a data cell calls `onSelect({ metro, role })`; Enter/Space on a focused cell do too.
- header click re-sorts rows (assert new row order); dir toggles on second click.
- adjusted pay: `rpp==null` metro's pay cell is muted `—`; `emp`/`lq` cells are unchanged by adjust.
- `capped` pay cell shows a `≥` prefix.

Component: props `{ meta, salaries, metric, adjusted, selectedMetro, selectedRole, onSelect }`.
Local state: `sortSoc` (default = selectedRole), `sortDir`, `limit` (50 | all), `query`. Reuse
`bubbleColor`/`RAMP_*` (pick ramp by a `dark` prop, same as the map), `displayPct`/`fmtNum`. Selected
row/column get a highlight class. Run `npx vitest run tests/role-heatmap.test.tsx`.

## Task 3: Wire into the page + styles

- `page.tsx`: mount below `<TitleLens>`; pass `dark`, `state.metric`, `state.adjusted`,
  `state.metro`, `state.role`, and `onSelect={p => update(p)}`.
- `globals.css`: sticky header row + sticky first column, colored cells with readable text in both
  themes, muted suppressed cells, focus ring on cells, section-level `overflow-x:auto`.

## Task 4: Full check + e2e

- `npx tsc --noEmit` (site) and `npx vitest run` (site) green.
- Extend an e2e spec: assert the heatmap section is present, a header-click reorders the first row,
  a cell click opens the metro panel.
- `npm run build` (with `NEXT_PUBLIC_BASE_PATH=/techpay-atlas`) green.

## Done criteria

- All site tests + typecheck + build green locally; CI green on the PR.
- Heatmap renders from the shipped `salaries.json` with no pipeline run and no `site/public/data`
  diff (`git status` clean under it).
- Manual check: top-50 default, "show all" expands, sort by a column works, a suppressed cell shows
  `—`, a cell click opens the panel and switches the active role.
