# Lib-layer hardening wave (post-review, pre-IO)

Fixes from the Opus code review of b388c85..35b4e40, to land BEFORE Tasks 9–11 because
they change exported types and the emitted JSON contract. TDD where behavior changes:
update/add the test first, watch it fail, fix, watch it pass. One commit per section.

## 1. C1 — LCA field-value drift must not silently empty the employer layer

`pipeline/lib/parse-lca.ts`:
- Normalize comparisons: `const norm = (v: unknown) => String(v ?? '').trim().toUpperCase()`.
- `CASE_STATUS`: accept exactly `norm(...) === 'CERTIFIED'` (still excludes `CERTIFIED - WITHDRAWN`).
- `FULL_TIME_POSITION`: accept `/^Y/.test(norm(...))` (Y | YES).
- `WAGE_UNIT_OF_PAY`: key lookup on `norm(...).replace(/[^A-Z]/g, '')` against
  `{ YEAR: 1, HOUR: 2080, WEEK: 52, BIWEEKLY: 26, MONTH: 12 }`.

`pipeline/lib/aggregate.ts` `attachCbsa`: empty input is a FAILED join, not a perfect one —
`matchRate: records.length ? matched.length / records.length : 0`.

`pipeline/config.ts` THRESHOLDS: add `minLcaRecords: 50_000` (asserted by run.ts in Task 11).

Tests: parameterized drift table (`'Certified'|'CERTIFIED'|'certified'`, `'Year'|'year'|'YEAR'`,
`'Bi-Weekly'|'Bi-weekly'|'BI-WEEKLY'`, `'Y'|'Yes'` all accepted); `attachCbsa([], map)` reports
matchRate 0.

## 2. C2 — OEWS `#` is a top-code (≥ $239,200), not suppression

`pipeline/lib/num.ts`: keep `num()` as-is for `*`/`**`/blank; add
`export const TOP_CODE = 239_200` and
`export function cell(v: unknown): { value: number | null; capped: boolean }` where `'#'`
(after $/comma strip+trim) → `{ value: TOP_CODE, capped: true }`, else `{ value: num(v), capped: false }`.

`pipeline/lib/parse-oews.ts`: percentile fields use `cell()`. `SalaryRecord` gains
`capped: Pct[]` where `type Pct = 'p10'|'p25'|'p50'|'p75'|'p90'` — the list of top-coded
percentiles (empty array when none). `emp`/`lq` still use `num()`.

`pipeline/lib/emit.ts`: `SalariesJson` rows carry the percentile values plus `capped` ONLY
when non-empty (omit the key when `[]` to keep JSON compact). `Meta` gains
`capValue: number` (the TOP_CODE constant) so the site can render "≥ $239,200".

Tests: REPLACE the assertion pinning `A_MEDIAN:'#' → p50 null` with `p50 === 239200` and
`capped` containing `'p50'`; emit test asserts `capped` omitted when empty and present when set.

## 3. C3 — crosswalk must reject junk CBSA cells

`pipeline/lib/crosswalk.ts`: `const cbsa = String(r.CBSA ?? '').trim()` then
`if (!/^\d{5}$/.test(cbsa) || cbsa === '99999') continue` (drop the CBSA padStart — real codes
are always 5 digits). Tie-break on equal score: keep lexicographically smaller cbsa.
Tests: `{CBSA: null}`, `{CBSA: ''}`, `{CBSA: 'Total'}` all excluded; tie-break deterministic.

## 4. C4 — retain CASE_NUMBER for cross-file dedupe

`pipeline/lib/parse-lca.ts`: `LcaRecord` gains `caseNumber: string`
(`String(r.CASE_NUMBER ?? '').trim()`; empty string allowed — dedupe treats empties as unique,
see Task 11 note below). Update existing tests' expected objects.

## 5. I3 — drop accounting

`lcaRowsToRecords` returns `{ records: LcaRecord[]; drops: Record<'status'|'partTime'|'soc'|'unit'|'wage'|'range'|'zip'|'employer', number> }`.
Every `continue` increments its bucket. Update tests to the new shape and assert bucket counts.

## 6. I9 — ZIP handling for unhyphenated ZIP+4 and numeric cells

`const d = String(r.WORKSITE_POSTAL_CODE ?? '').replace(/\D/g, '')` ;
`const zip = d.length > 5 ? d.padStart(9, '0').slice(0, 5) : d.padStart(5, '0')` ; keep the
`/^\d{5}$/` guard. Tests: `'02139-4307'`, `'021394307'`, numeric `21394307` all → `'02139'`.

## 7. I2 — wage band midpoint

If `WAGE_RATE_OF_PAY_TO` parses (via `num`) and is > FROM, `annualWage` uses the midpoint
`(from + to) / 2` before unit annualization + rounding; else FROM. Test: FROM 100000 /
TO 150000 Year → 125000; TO absent → FROM; TO < FROM (junk) → FROM.

## 8. I1 + I10 + I4 + I5 + I8 — aggregation fixes

`pipeline/lib/aggregate.ts`:
- Replace the O(n²) `[...(bySoc.get(...) ?? []), r]` grouping with mutating `push` loops.
- Employer merge KEY: `r.employer.toUpperCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim()`
  (display casing logic unchanged; do NOT strip INC/LLC/CORP suffixes).
- Most-common-casing tie-break: `|| a[0].localeCompare(b[0])` so output is input-order independent.
- `EmployerStat`: rename `count` → `filings` (it counts filings, not jobs).
- Beeswarm: after every-kth sampling, append the true max if missing
  (`if (sorted.length && sample.at(-1) !== sorted.at(-1)) sample.push(sorted.at(-1)!)`);
  `EmployerBundle` gains `n: number` (bucket population).
- `opts` becomes `Partial<{topN: number; sampleMax: number}> = {}` with destructured defaults.
- `median([])` throws.

Tests: update shapes; add shuffled-input determinism test (same output for reversed input);
median-empty throws; sample includes true max; punctuation variants of one employer merge.

## 9. I6 + I7 — emit filtering and RPP vintage

`pipeline/lib/parse-rpp.ts`: return `{ year: number; values: Map<string, number> }` — pick ONE
global year: the latest year column whose non-null count is ≥ 90% of the best year's non-null
count; all values come from that year only (no per-row fallback). Update test (the Dallas
2023-(NA) fixture row now yields Dallas ABSENT for year 2023 — adjust fixture/expectations to
cover the global-year rule instead).

`pipeline/lib/emit.ts`: `buildMeta` unchanged signature but `Meta` gains `rppYear: number`
(pass through) and `capValue`. `buildSalaries(salaries, keep: Set<string>)` and
`buildEmployerFiles(agg, keep: Set<string>)` filter to the accepted CBSA set and ALSO return
an `excluded: number` count. run.ts (Task 11) will pass `new Set(meta.metros.map(m => m.cbsa))`.
Update emit tests.

## 10. Minor sweep (single commit)

- `num()`: validate with `/^\$?-?[\d,]+(\.\d+)?$/` before comma-stripping (test: `'1,2,3'` → null).
- `parse-oews.ts`: single-pass `parseOews(rows)` returning `{ records, areas }`; keep the two
  existing exports as thin wrappers so callers/tests keep working.
- `emit.ts`: split `dropped` into `droppedNoArea` / `droppedNoCoords`.
- Remove stray `// pipeline/...` path comments in parse-lca files.
- BEA footnote-tail pin test (`{GeoFIPS: 'Legend / Footnotes:'}` row is ignored).
- `buildMeta` test for CBSA present in salaries but absent from areas.

## 11. Plan updates for Tasks 10–11 (docs/superpowers/plans/2026-08-03-pipeline.md)

Edit the plan in place:
- Task 10 Step 3: also print value inventories —
  `[...new Set(rows.map(r => r.CASE_STATUS))]`, same for `WAGE_UNIT_OF_PAY`,
  `FULL_TIME_POSITION`, plus per-quarter row counts and CASE_NUMBER overlap between two
  quarters (detects cumulative files — C4).
- Task 11 run.ts snippet: `for (const r of recs) lcaRecords.push(r)` instead of spread (C5);
  dedupe by non-empty caseNumber before attachCbsa, logging duplicate count; assert
  `lcaRecords.length >= THRESHOLDS.minLcaRecords`; adapt to new return shapes
  (`lcaRowsToRecords().records/.drops`, `rppRowsToMap().year/.values`, `buildSalaries`/
  `buildEmployerFiles` keep-set + excluded counts, EmployerStat.filings); merge drops and
  excluded counts into the run report; meta.rppYear/capValue stamped via builders.

## Acceptance

`npx tsc --noEmit` silent; `npx vitest run` green (expect ~40 tests after additions);
working tree clean; one commit per numbered section (sections 1–10), pathspec on add+commit.
