# Title Lens — v2 Design Spec

**Date:** 2026-08-03 · **Status:** Draft for user review
**Parent:** `2026-08-03-techpay-atlas-design.md` (v1, shipped). v2 = Title lens ONLY;
slopegraph/heatmap/head-to-head move to v3 (see `docs/BACKLOG.md`).

## Purpose

Official occupation codes flatten real job titles: a national scan of all 541,947 certified
FY2025 H-1B filings showed "Technical Program Manager" ($172k median) and "Technical Project
Manager" ($115k) both dumped mostly into SOC 15-1299 "Computer Occupations, All Other."
The Title lens surfaces what employers actually call jobs — pay by real title, and which
official buckets each title gets filed under (the conflation story). Uniquely possible
because we hold the raw filings; directly useful to the user's own search.

## Scope decisions (user-approved 2026-08-03)

- v2 ships the Title lens alone (fast, focused).
- All four title families: **PM/Product** (TPM, Technical Project/Product Manager, Product
  Owner, Product Manager, Program Manager, Project Manager, PMO), **Platform/Ops** (DevOps,
  SRE, Platform Engineer, Cloud Engineer, Infrastructure Engineer), **Data** (Data Engineer,
  ML Engineer, Analytics Engineer, Data Analyst), **Dev specialization** (Frontend, Backend,
  Full-stack, Mobile).

## Pipeline extension

- `readLcaRows` gains `JOB_TITLE` in `LCA_COLUMNS` (header assertion updates with it);
  `LcaRecord` gains `title: string` (normalized: uppercased, whitespace-collapsed).
- New pure module `pipeline/lib/titles.ts`: `TITLE_FAMILIES` registry — family → ordered
  bucket list of `{ key, label, re }`. First-match-wins within a family; specific-before-
  generic ordering (e.g. TECHNICAL PROGRAM MANAGER before PROGRAM MANAGER). A filing can
  match at most one bucket per family but may be counted by multiple families only if
  regexes genuinely overlap across families (expected: none; assert overlap < 1% in tests).
- New aggregation `aggregateTitles(records: LocatedLca[])` over the SAME deduped, certified,
  full-time record stream the employer layer uses — but WITHOUT the target-SOC filter
  (titles must see filings whose SOC falls outside our 21 roles; e.g. construction-coded
  Project Managers are part of the honest story). This requires `lcaRowsToRecords` to stop
  pre-filtering SOC for the title path: parse retains ALL certified full-time rows with a
  parallel `targetSoc: string | null` field; the employer layer keeps filtering on it,
  the title layer does not. Drop accounting gains no new buckets (soc-drop stays, applied
  downstream).
- Emitted `site/public/data/titles.json` (single file, est. < 80 KB):
  ```ts
  interface TitlesJson {
    lcaPeriod: string
    families: { key: string; label: string; buckets: TitleBucket[] }[]
  }
  interface TitleBucket {
    key: string; label: string
    national: TitleStats
    metros: Record<string, TitleStats>   // only metros with filings >= 8
    socMix: { soc: string; share: number }[]  // top 4 + { soc: 'other' }, shares sum to 1
    topEmployers: { name: string; filings: number; median: number }[]  // top 5
  }
  interface TitleStats { filings: number; p25: number; median: number; p75: number }
  ```
- Data-quality: assert total title-bucket filings ≥ 10,000 (scan found ~14k in the PM
  family alone); report per-bucket counts in the run report.

## Site section

New section below the hero (same page, shared metro selection):

1. **Family tabs** (4). Within a family, one row per bucket: label · filings · p25–p75 band
   with median tick (reuses `PercentileBand` domain logic, new thin variant) · median.
2. **Conflation bar** per bucket: horizontal 100%-stacked bar of `socMix` — each segment a
   categorical color (≤ 4 SOCs + gray "other"; dataviz rules: fixed assignment, 2px gaps,
   legend + segment tooltips, texture fallback). Clicking a segment sets the main role
   dropdown to that SOC (cross-link into the map).
3. **Metro awareness**: when a metro is selected in the map AND the bucket has that metro
   (filings ≥ 8), rows show the metro's stats with a "in {metro short name}" chip; otherwise
   national stats with a muted "national" chip. COL-adjust applies ONLY to metro-level
   stats (national numbers cannot be adjusted — render nominal with the existing note
   pattern; reuse `canAdjust`).
4. **Honesty rails**: filings count always visible; buckets with metro filings < 8 never
   show metro numbers; "wage floors midpointed" note reused; `lcaPeriod` cited in the
   section header.
5. `titles.json` fetched lazily when the section first scrolls into view (IntersectionObserver),
   with the standard inline-error fallback.

## Error handling

- Pipeline: a bucket with 0 national filings fails the run (regex typo tripwire).
  Cross-family overlap ≥ 1% of matched filings fails with the offending pair.
- Site: missing `titles.json` → section renders a single inline error card; page unaffected.

## Testing

- `titles.ts` bucket regexes: fixture list of ~40 real titles from the scan (e.g.
  "SENIOR TECHNICAL PROGRAM MANAGER II", "PMO LEAD", "SR. SDET", "FULL STACK DEVELOPER")
  asserting exact bucket (or no match); overlap assertion.
- `aggregateTitles`: grouping, metro threshold, socMix top-4+other shares sum to 1,
  deterministic ordering.
- Emit golden test extension for `titles.json` shape.
- Site: component tests for family tabs + metro-chip fallback + adjust gating; Playwright
  extension: scroll to section, click a conflation segment, assert role dropdown changed.
- Visual pass: screenshots of the section (both themes) before done.

## Out of scope (v2)

- Title search box (arbitrary regex over raw titles) — needs raw-title emission, too big.
- Per-employer title drill-down; time series; the v3 chart sections.
