# Role Similarity Implementation Plan

**Goal:** Ship the v2 role-similarity section per
`docs/superpowers/specs/2026-08-05-role-similarity-design.md` — for the selected role, rank the
other 20 by pay-overlap (equivalency) across metros. Pure site work on the shipped `salaries.json`.

## File Map

| File | Change |
|---|---|
| `site/lib/role-similarity.ts` | NEW — pure `similarByPay(meta, salaries, soc)` + `MIN_SHARED` |
| `site/tests/role-similarity.test.ts` | NEW — unit tests |
| `site/components/RoleSimilarity.tsx` | NEW — ranked equivalency list |
| `site/tests/role-similarity.test.tsx` | NEW — component tests |
| `site/app/page.tsx` | Mount `<RoleSimilarity>` below `<TitleLens>` |
| `site/app/globals.css` | `.rsim-*` styles, light/dark |
| `site/e2e/role-similarity.spec.ts` | NEW — renders, click a role changes the active role |

## Task 1: `role-similarity.ts` + tests (tests-first)

`role-similarity.test.ts`:
- `overlap === 1` for two roles with identical per-metro p50 vectors.
- known value: a role paying 10% more in every shared metro → overlap `0.909…` (min/max = 1/1.1).
- excludes the anchor role from its own result.
- `shared` metro count correct; `thin === true` below `MIN_SHARED`.
- ranking: highest overlap first; among ties, thin pairs sorted last.
- COL-invariance: dividing one role's vector by a per-metro factor (RPP) leaves the ranking
  unchanged (ratio cancels).

`similarByPay(meta, salaries, soc)` → `{ soc, label, overlap, ratio, shared, repMedian, thin }[]`
sorted desc. `repMedian` = median of the role's `p50` across its metros.

## Task 2: `RoleSimilarity.tsx` + component tests (tests-first)

`role-similarity.test.tsx` (fixture: 4 roles, one a near-twin of the anchor, one thin):
- renders ranked rows for the anchor role, closest-paid first.
- a role row is clickable → `onSelectRole(soc)`.
- thin pair shows the "thin overlap" chip.
- anchor with no comparable pairs → the empty-state note.

Component: props `{ meta, salaries, soc, onSelectRole }`. Reuse `fmtUsd`; overlap bar + "within X%"
+ direction from `ratio`.

## Task 3: Page wiring + styles

- `page.tsx`: mount `<RoleSimilarity meta salaries soc={state.role} onSelectRole={soc => update({ role: soc })} />`
  below `<TitleLens>`.
- `globals.css`: ranked rows, overlap bar, chips, theme-aware.

## Task 4: Full check + e2e

- `npx tsc --noEmit` + `npx vitest run` (site) green.
- e2e (`role-similarity.spec.ts`): section renders, clicking a listed role changes the role (URL/
  select). **Run the FULL e2e suite.**
- `NEXT_PUBLIC_BASE_PATH=/techpay-atlas npm run build` green.

## Done criteria

- All site tests + typecheck + build green; CI green on the PR; no `site/public/data` diff.
- Manual: pick a role → a plausible equivalency ranking (e.g. Programmer ↔ SWE high overlap),
  thin pairs labeled, clicking a role re-anchors the page.
