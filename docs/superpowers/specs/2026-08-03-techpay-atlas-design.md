# TechPay Atlas — Design Spec

**Date:** 2026-08-03
**Status:** Approved (brainstorming session, visual companion used for centerpiece + structure choices)

## Purpose

A data-analytics portfolio piece that is also personally useful: analyze the US tech job
market — salaries, employment, and role equivalency — across metros, with cost-of-living
adjustment. Portfolio-first: publicly hosted, shareable link, public source code. Personal
payoff: answers "where do my skills pay best in real terms?" during an active job search.

## Decisions made

| Question | Decision |
|---|---|
| Purpose | Both portfolio and personal tool, **portfolio-first** |
| Data sources | **BLS OEWS** (backbone) + **DOL H-1B LCA disclosures** (employer layer) + **BEA RPP** (cost-of-living) |
| Deliverable | **Static site + offline pipeline** (no runtime server, free public hosting) |
| Role scope | **Core tech + adjacent**, 21 occupations: all SOC 15-12xx (Computer Occupations) + 15-2031 (Operations Research Analysts), 15-2041 (Statisticians), 15-2051 (Data Scientists), plus 11-3021 (Computer & IS Managers) and 41-9031 (Sales Engineers). Excluded as not IT-adjacent: the rest of the 15-2000 Mathematical Science group — 15-2011 (Actuaries), 15-2021 (Mathematicians), 15-2099 (Mathematical Science Occupations, All Other). 13-1082 (Project Management Specialists) added at user request — NOTE it is all-industry (OEWS metro data cannot isolate tech-sector PMs; a construction PM counts too); the H-1B employer layer is implicitly tech-weighted. |
| COL adjustment | **Yes** — nominal ↔ RPP-adjusted toggle on every salary view |
| Centerpiece | **Metro Salary Map** (bubble map; size = employment, color = pay) |
| Site structure | **One-page dashboard**: map hero + drill-down panel + sections below, shared filters |

## Architecture

Two independent halves in one repo (`C:\projects\techpay-atlas`, public GitHub recommended —
all data is public government data; nothing sensitive can enter the repo):

```
techpay-atlas/
├── pipeline/          # TypeScript (tsx) offline ETL scripts
├── data/
│   ├── raw/           # downloaded source files — GITIGNORED (large)
│   └── reports/       # pipeline run reports (match rates, dropped rows)
├── site/              # Next.js static export (output: 'export'), React + D3
│   └── public/data/   # derived JSON emitted by pipeline — COMMITTED
└── docs/
```

- **Pipeline:** download (scripted, pinned URLs) → streaming parse → filter to target SOC
  codes → join on CBSA + SOC → aggregate → emit JSON. One command reruns everything;
  annual refresh = rerun + commit.
- **Site:** Next.js static export, React owns the DOM, D3 for projection/scales. Deploys
  to Vercel or GitHub Pages. Zero runtime server; nothing runs on the home box.

## Data sources & joins

| Source | Gives | Notes |
|---|---|---|
| BLS OEWS, latest metro file (May 2025 expected available; verify at implementation) | wage percentiles (10/25/50/75/90), employment, location quotient per metro × occupation | one XLSX, ~530 metros, keyed by CBSA + SOC |
| DOL H-1B LCA disclosures, FY24–25 | employer, job title, SOC, worksite city/state, actual wage | quarterly XLSX, large; filter to certified + full-time + target SOCs |
| BEA Regional Price Parities | COL index per metro | one small table, keyed by CBSA |

**Joins.** OEWS ⋈ RPP on CBSA is clean. H-1B has worksite city/state, not CBSA → use a
city→CBSA crosswalk (HUD's, with a fallback of matching principal cities of target metros).
Unmatched worksites are logged, and the run fails if the match rate drops below a threshold.

**Derived JSON (what the site loads):**
- `meta.json` — metros (name, CBSA, lat/lng, RPP) + roles (SOC, label); loaded once
- `salaries.json` — metro × role × {percentiles, employment, LQ}; ~a few hundred KB gzipped
- `employers/{cbsa}.json` — top H-1B employers + salary distributions; lazy-loaded on metro click

Adjusted pay = nominal / (RPP / 100), computed client-side so the toggle is instant.

**Data-contract notes (site-consuming code should assume these):**
- Each `MetroMeta` carries `lcaFilings: number` (count of matched H-1B filings for that metro
  across all roles). A metro with `lcaFilings: 0` has no employer JSON file — the site can
  render "no H-1B filings for this metro" directly from `meta.json` without attempting the
  `employers/{cbsa}.json` fetch.
- Each `EmployerBundle`'s beeswarm `sample` deliberately includes the bucket's true max wage,
  which can be a multi-million-dollar data-entry artifact. The beeswarm axis should clamp at
  the bundle's `p99` (exact nearest-rank 99th percentile of the full wage list, not the sample)
  instead of the sample max.
- Bundles with `n ≤ 2` filings are statistically thin; the site should present them with a
  small-sample caveat. This is a site-side rendering decision (not enforced by the pipeline) —
  left for site design.
- A known DOL source-data quirk: roughly 16 employer names per quarterly LCA file carry
  mojibake from DOL double-encoding UTF-8 as Latin-1 (or similar) at export time. This is not
  repaired by the pipeline — the raw (garbled) name is passed through as-is.

## UI

One page, top to bottom:

1. **Filter bar** (one row): role dropdown · metric (median pay / employment / concentration)
   · **nominal ↔ COL-adjusted toggle**. Filters drive every section.
2. **Hero map**: D3 `albersUsa`, muted state outlines, one bubble per metro (size =
   employment, color = single-hue sequential of selected metric). Hover tooltip; click
   slides in the **drill-down panel**: headline stats (median, adjusted, rank, job count),
   per-role table with percentile mini-bars, top H-1B employers with median filed salaries.
   The COL toggle animates the map recolor.
3. **Rank-flip slopegraph**: pick a role, cities animate between nominal and adjusted rank.
4. **City × role heatmap**: sortable matrix, cell color = selected metric.
5. **Head-to-head compare**: two metro pickers + role; side-by-side percentile bands, a
   "your target salary" input overlaid, and an employer beeswarm from H-1B data.

**URL state:** role/metric/metro/compare pair in query params — deep-linkable on a static host.

**Charts follow the dataviz skill method:** palette run through its validator (light and
dark modes), sequential = single hue, legends + table-view fallback, tooltips on all marks,
text in ink tokens not series colors.

## Error handling

- zod schema validation at parse time; fail loudly on shape drift.
- OEWS suppressed values: `*`/`**` → explicit null (UI renders "insufficient data", never 0).
  `#` is different — it is a **top-code**, not a suppression: OEWS substitutes the percentile
  wage with a fixed ceiling (`Meta.topCodeValue`, currently $239,200) rather than withholding it.
  Those cells emit the substituted `topCodeValue` plus a `capped` marker (the percentile's key,
  e.g. `'p90'`, listed in the row's `capped` array) — never null. The site should render a "≥"
  prefix on any percentile whose key appears in `capped`.
- Row-count and join-match-rate assertions; failures write a report to `data/reports/`.
- Site: missing metro × role combos render as em-dash; failed lazy chunk fetch shows an
  inline error in the panel, page stays usable.

## Testing

- **Pipeline (vitest):** unit tests for parsers/joins/aggregators against small checked-in
  fixture slices of each raw format; one end-to-end golden test (fixture in → JSON out).
  Golden tests are paired with a line-by-line review pass (they only pin what fixtures cover).
- **Site:** component smoke tests; one Playwright happy path (load → click metro → toggle COL).
- **Visual:** real screenshot check of the map before calling any visual work done.
- **Palette:** `validate_palette.js` from the dataviz skill, light + dark, before shipping.

## Out of scope (v1)

- Live job-postings layer (Adzuna) — data model shouldn't preclude it, but not built.
- Time-series / year-over-year trends (single-year snapshot first; schema keeps a `year` field).
- Non-US markets; non-tech occupations beyond the ~20 selected.
- Any server-side features (accounts, saved comparisons).
