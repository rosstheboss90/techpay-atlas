# Contract-fix wave (final review, pre-site)

Findings from the final Opus review to land BEFORE the site plan consumes the JSON contract.
TDD where lib behavior changes. Small commits (group related items), pathspec on add+commit.
Ends with a full pipeline re-run and re-committed dataset.

## 1. Role registry → 20 roles

`pipeline/lib/soc.ts`: add
- `{ soc: '15-2031', label: 'Operations Research Analysts', short: 'Ops Research' }`
- `{ soc: '15-2041', label: 'Statisticians', short: 'Statistician' }`
(keep list sorted by soc). Update `soc.test.ts` expectations 18 → 20.

## 2. capValue rename + meta provenance

- `pipeline/lib/num.ts`: no logic change; doc comment on `TOP_CODE` clarifying it is the
  substitution value for a `#` cell, NOT a dataset ceiling (emitted values may exceed it).
- `pipeline/lib/emit.ts`: `Meta.capValue` → `Meta.topCodeValue`. `Meta` also gains:
  - `lcaPeriod: string` (run.ts passes e.g. `'FY2025 Q1–Q4'` derived from the LCA filenames)
  - `sources: { oews: string; lca: string[]; hud: string; zipMatchRate: number }`
    (basenames + final match rate — provenance for the committed dataset)
  - per-metro `lcaFilings: number` on each `MetroMeta` (0 when the metro has no employer
    file) — `buildMeta` gains a `filingsByCbsa: Map<string, number>` parameter.
- Update emit tests accordingly.

## 3. Employer bundle p99

`pipeline/lib/aggregate.ts`: `EmployerBundle` gains `p99: number` — exact 99th percentile of
the bucket's full wage list (nearest-rank on the sorted array: `sorted[Math.min(n-1, Math.ceil(0.99*n)-1)]`).
Purpose: the beeswarm sample deliberately includes the true max (which can be a $2M
data-entry artifact); the site clamps its axis at p99 instead of max. Test it.

## 4. Loader hygiene

`pipeline/loaders.ts`:
- `readLcaRows`: skip rows where ALL `LCA_COLUMNS` values are null (DOL pads sheets with
  ~445k trailing blank rows; they currently swamp memory and drop accounting). Fix the
  "peak memory stays bounded" comment to describe reality (O(real rows)).
- `readLcaRows`: after reading the header row, throw with the filename + missing column
  names if any `LCA_COLUMNS` entry is absent from the header (silent-null drift guard).

## 5. Drop-accounting clarity

`pipeline/lib/parse-lca.ts`: give `'Certified - Withdrawn'` its own drop bucket
`certifiedWithdrawn` (checked before the generic status drop). Update the drops Record type
+ tests. (Blank rows no longer reach here after §4.)

## 6. run.ts robustness

- Delete stale output: `rmSync(OUT_DIR/employers, {recursive, force})` right before the
  `mkdirSync` (i.e. after ALL assertions — a failed run must not destroy good output).
- `find`: sort matches by `path.basename`. For the HUD file specifically, select the newest
  by parsing `MMYYYY` from `ZIP_CBSA_(\d{2})(\d{4})` into `YYYYMM` order (lexicographic
  name sort picks Dec-2025 over Mar-2026).
- Wrap the OEWS phase in a function scope so its 150k raw rows are collectible before the
  LCA phase runs.
- Report additions: post-filter matched count (`lcaMatched` minus records excluded by the
  keep-set) alongside the existing figures; pass filings-per-cbsa into `buildMeta`;
  stamp `lcaPeriod` + `sources`.

## 7. download.ts robustness

- Magic-bytes check after download for `.zip`/`.xlsx`: first 4 bytes must be `PK\x03\x04`;
  otherwise delete the file, warn "WAF challenge or error page returned", treat as failed.
- Marker self-heal: `.done` contains the downloaded basename; if that file no longer exists
  in `data/raw/`, ignore the marker and re-download instead of skipping.

## 8. Docs truth-up (spec + plan)

`docs/superpowers/specs/2026-08-03-techpay-atlas-design.md`:
- Error-handling: `#` is a top-code → substituted `topCodeValue` + `capped` marker (not null).
- Role scope: 20 roles — all 15-12xx, 15-2031, 15-2041, 15-2051, 11-3021, 41-9031; record
  that 15-2011/15-2021/15-2099 are excluded as not IT-adjacent.
- Data-contract notes: `lcaFilings: 0` metros render "no H-1B filings" without fetching;
  beeswarm axis clamps at bundle `p99`; bundles with `n ≤ 2` should be presented with a
  small-sample caveat (site-side gate, decided during site design); known source-data
  mojibake in ~16 employer names/quarter (DOL double-encoding, not repaired).

## 9. Re-run + recommit

- `npx tsc --noEmit` silent; `npx vitest run` green (update counts as needed).
- `npm run pipeline` — expect ~20-role dataset, all thresholds pass; spot-check Austin
  15-2031 exists with plausible numbers; meta has topCodeValue/lcaPeriod/sources/lcaFilings;
  an employer bundle shows p99 ≤ sample max.
- Commit regenerated `site/public/data` together with the run.ts/report changes that
  produced it.

## Acceptance

All of the above landed; tree clean; report includes: final test count, pipeline console
summary, spot-check values, commit SHAs.
