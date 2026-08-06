# Data Refresh, Vintage Archive, and `/trends` (Phase A) — Design Spec

**Date:** 2026-08-06 · **Status:** Draft for review

## Purpose

Two coupled problems, one spec.

1. **Refreshing the data is a manual, error-prone edit** of year-encoded URLs, and the pipeline is
   **destructive** — a refresh to May 2026 overwrites `site/public/data/*.json` and leaves nothing
   usable behind. `data/raw/` is gitignored; the committed JSON holds exactly one vintage. There is
   no history in this repo today.
2. **No time dimension on the site.** Every figure is a single-vintage cross-section. The question a
   reader actually has — *did tech pay keep up with inflation?* — is unanswerable here.

These are coupled because the fix for (2) is a longitudinal archive, and the archive is a change to
(1). Specifying them separately guarantees drift at the seam.

## Scope

**In scope:**

- `pipeline/vintages.ts` — single source of truth for which vintage of each source is current.
- Vintage-keyed OEWS top code (replaces the `TOP_CODE` constant).
- `.done` marker invalidation on URL change.
- A committed longitudinal archive: `data/history/oews-nat-<year>.json`, `data/history/cpi-u.json`.
- A monthly source **watcher** GitHub Action that opens an issue when a new vintage publishes.
- `docs/REFRESH.md` runbook.
- `/trends` **Phase A**: national real-wage trends, 2019–2025, 21 roles, two figures.

**Out of scope (deliberate):**

- **Deliverable (1), the `<DataVintage>` chip** and de-hardcoding `/about`'s source list
  (`site/app/about/page.tsx:213-214`). Small, no dependencies, land it standalone without a spec.
  `/trends` consumes the chip if it exists and inlines the text if it doesn't.
- **Phase B, metro-level trends.** Forward-compatibility notes below; no implementation here.
- Running the pipeline in CI. See Decision 7.
- The `trailingSlash` fix. See "Inherited defects".

## ⚠️ CORRECTION — Decisions 1, 2 and 6 rest on a false premise (measured 2026-08-06)

The archive has since been built (`data/history/oews-nat-2019.json` … `2025`). Measuring it
contradicts the assumption those decisions were made on.

**Eight registry roles do not exist before May 2021, not two.** OEWS published combined codes until
the May 2021 detailed-code split. Absent from both 2019 and 2020:

`13-1082` (Project Mgmt) · `15-1242` (DBA) · `15-1243` (DB Architect) · **`15-1252` (Software
Developers)** · `15-1253` (QA) · `15-1254` (Web Dev) · `15-1255` (UX/UI) · `15-2051` (Data Sci)

All eight first appear in **2021**. Coverage is 13/21 for 2019 and 2020, 21/21 from 2021 on.

**Why this breaks the design as written.** Decision 6 says the headline figure covers "the 19 roles
with a full 2019 start." There are 13, and **Software Developers is not among them** — the site's
flagship role would be missing from its own headline chart. Decision 1 chose the 2019 window
specifically to avoid the hot 2021 baseline; that trade was priced against losing two minor roles,
not against losing SWE, Data Scientists, QA, Web Dev, UX/UI, and both database roles.

**RESOLVED 2026-08-06 — split the window, and let the path chart be ragged.** Replaces Decisions 1
and 6:

- **Figure 1, the headline: real % change 2021→2025, all 21 roles.** Every bar spans an identical
  window, so the ranking is valid with no exclusions and no footnote about missing roles — Software
  Developers included. The cost is a baseline inside the pandemic wage surge, which the page must
  state outright rather than bury: *"2021 is the earliest year all 21 occupations exist as separate
  BLS codes. It was also an unusually hot year for pay, so these figures measure change from a high
  starting point."*
- **Figure 2, the path: real dollars over the full history each role actually has** — 2019 for the
  13 that existed, 2021 for the 8 that didn't, on a shared 2019–2025 axis. The ragged left edge is
  the honest picture and is itself informative; a break marker at 2021 carries the explanation.

This keeps the long arc visible where it is real, without letting an artifact of BLS classification
masquerade as a pay trend. Rejected: excluding 8 roles from the headline (loses the flagship role),
and splicing the young codes onto their combined predecessors (was Decision 2's option A3, still
rejected — it merges two different populations).

**p50 is safe to plot; p90 is not.** Verified across all seven archived vintages: no registry role
has a censored *median* in any year. The only censored cells are `11-3021`'s p90 (2019–2024) and
`15-1221`'s p90 (2021). Figures 1 and 2 both use p50, so neither touches a censored value. Any
future band or p90 view must read `capped` and mark or omit those points.

**Also measured, and relevant to any p90 series:** `11-3021` (IT Managers) has a *censored* p90 in
every vintage 2019–2024 — $208,000 through 2021, $239,200 from 2022, then a genuine $297,510 in
2025. Those are floors, not wages. A p90 chart for that role shows a step at 2022 and a jump in
2025 that are artifacts of censoring. `capped` marks them; the page must respect it.

Everything below this block is the design as originally written. Decisions 3, 4, 5 and the §1 data
layer are unaffected and have shipped.

## Decisions

1. **Window: May 2019 → May 2025, seven points, ragged.** (Option A2 of three considered.)
   Starting at 2021 would give a complete rectangle across all 21 roles but anchors the baseline
   inside the pandemic wage surge, so "real pay fell since 2021" would describe 2021 more than it
   describes now. 2019 straddles pre-COVID, which is the more honest arc. The cost is that two roles
   start late — see Decision 2.

2. **Young roles are labeled, never spliced.** `15-2051` (Data Scientists) and `13-1082` (Project
   Management Specialists) are 2018-SOC carve-outs from combined OEWS codes (`15-2098`, `13-1198`)
   and only appear as standalone series from roughly May 2021. Backfilling them from their
   predecessors would silently splice two different populations. They get short lines and an
   explicit "enters the data in 2021" marker instead.
   **Verify the exact first-appearance year per role against the downloaded files** — the shape is
   certain, the boundary year is not.

3. **Deflator: CPI-U, all items, US city average (`CUUR0000SA0`), May-to-May, expressed in 2025
   dollars.** OEWS's reference period is May, so May-to-May aligns with no interpolation. PCE is the
   economists' preference; CPI-U is what a reader recognizes and keeps the site BLS-to-BLS. 2025
   dollars rather than 2019 dollars because readers anchor on money they recognize today.

4. **BEA RPP is NOT a deflator and must never be used as one.** RPP is a *spatial* index,
   renormalized to US = 100 every year; an RPP-adjusted series over time measures nothing coherent.
   Time deflation uses CPI-U; RPP stays confined to the existing place-to-place adjustment. This
   becomes load-bearing in Phase B, where both adjustments appear on the same page.

5. **Page spine: headline ranked bars, then the path.** (Option B1 of three considered.) Twenty-one
   lines on one chart is spaghetti, and every other section on the site follows headline-claim-then-
   detail after the editorial polish pass. Figure 1 answers the question; Figure 2 shows the shape.
   An index-only line chart (B2) was rejected for abandoning the dollar vocabulary every other
   section speaks.

6. **The headline figure covers the 19 roles with a full 2019 start.** A 4-year change and a 6-year
   change cannot be ranked on one axis. The two young roles are footnoted and appear in Figure 2
   only. Alternatives considered: annualize everything to CAGR (comparable, but a harder read that
   flattens the shape), or shorten everyone to 2021→2025 (comparable, but re-introduces the hot
   baseline Decision 1 exists to avoid).

7. **The watcher detects; the human refreshes.** A scheduled Action that runs the pipeline would
   need 478 MB of raw input and a 6 GB heap, and landing its output means pushing `main` — which
   **auto-deploys without tests** (`deploy.yml` is ungated; `ci.yml` only gates PRs). The watcher
   does HEAD probes only and opens an issue. Refresh runs locally and lands as a PR, the path CI
   actually guards.

8. **The archive is append-only.** `archive-nat.ts` refuses to overwrite an existing year's file
   without `--force`. History that can be silently rewritten by a rerun is not history.

## Traps this spec exists to avoid

Three defects found while reading the current pipeline. Each would produce a plausible-looking wrong
result rather than an error.

**T1 — `.done` markers silently skip a refresh.** Markers are keyed by source *name* (`oews.done`)
and `markerTargetExists` (`pipeline/download.ts:25`) only checks that the recorded **basename** still
exists on disk. Bump the config to `oesm26ma.zip` while `oesm25ma.zip` is still in `data/raw/` and
the run prints `skip oews (already downloaded)` — a "successful" refresh that changed nothing.
**Fix:** record the resolved **URL** in the marker; treat a config-URL change as invalidation.

**T2 — `TOP_CODE` is a constant but the real top code is vintage-specific.** `pipeline/lib/num.ts:20`
hardcodes `239_200`, and `cell()` stamps it into every `#` cell. BLS's annual top code was **$208,000**
for the earlier years of the A2 window and rose to $239,200 later. Parsing a 2019 file with today's
constant rewrites 2019's censored cells upward by ~15%, manufacturing a real-terms *decline* at the
top end that is purely a parser artifact.
**Fix:** `makeCell(topCode)` factory; per-year table in `vintages.ts`; keep `TOP_CODE` exported as the
current-vintage value so existing callers are untouched.
**Verify the switch year against the files.** The shape is certain; the boundary is not.

**T3 — the national OEWS file will not survive `parseOews`.** `rowSchema` (`parse-oews.ts:14`)
requires `PRIM_STATE`, and `toCbsa` would pad the national `AREA` into a bogus `00099` CBSA.
**Fix:** a separate national parse path, not a widened shared schema — widening it would weaken the
MSA path's guarantees to accommodate a file it never sees.

## Architecture

| File | Change |
|---|---|
| `pipeline/vintages.ts` | **New.** Current vintage per source; national-file year list; per-year top-code table. |
| `pipeline/download.ts` | Build `SOURCES` from `vintages.ts`; URL-keyed `.done` markers (T1); add national OEWS years + CPI. |
| `pipeline/lib/num.ts` | `makeCell(topCode)` factory (T2); `TOP_CODE` stays as the current value. |
| `pipeline/lib/parse-oews-nat.ts` | **New.** National-file parse path (T3). |
| `pipeline/lib/parse-cpi.ts` | **New.** BLS flat-file → May-by-year index values. |
| `pipeline/archive-nat.ts` | **New entry point** (`npm run archive:nat`). Append-only writer for `data/history/`. |
| `pipeline/lib/build-trends.ts` | **New.** Archive + CPI → `trends.json`. Pure; no I/O. |
| `pipeline/run.ts` | Emit `trends.json` from the committed archive. No other change. |
| `site/app/trends/page.tsx` | **New.** The page. |
| `site/components/TrendsRanked.tsx` | **New.** Figure 1. |
| `site/components/TrendsPath.tsx` | **New.** Figure 2. |
| `site/lib/trends.ts` | **New.** Derivations: sort, ghosting, break markers, nominal/real selection. |
| `site/components/SectionNav.tsx` | Masthead/nav link to `/trends`. |
| `.github/workflows/watch-sources.yml` | **New.** Monthly HEAD-probe → issue. |
| `docs/REFRESH.md` | **New.** Runbook. |

`archive-nat.ts` is a separate entry point rather than a branch inside `run.ts` because `run.ts` is a
single top-level script that executes its whole body on import, needs `--max-old-space-size=6144`,
and walks the LCA path. The national archive needs none of that — backfilling 2019–2024 must not
require the MSA or LCA files to be on disk at all.

## Data contracts

**`data/history/oews-nat-<year>.json`** — one per vintage, committed, a few KB:

```json
{
  "year": 2025,
  "topCode": 239200,
  "source": "national_M2025_dl.xlsx",
  "roles": {
    "15-1252": { "emp": 1656880, "p10": 81440, "p25": 102010, "p50": 133080, "p75": 168570, "p90": 208620, "capped": [] }
  }
}
```

`topCode` is stored per file, not inferred at read time — a future reader must not depend on the
code's current constant to interpret an old vintage.

**`data/history/cpi-u.json`** — committed. One entry per year, the May index value:

```json
{ "series": "CUUR0000SA0", "period": "May", "values": { "2019": 0.0, "2020": 0.0, "2025": 0.0 } }
```

*(Shape only — actual index values come from the BLS flat file at build time. No CPI values are
hardcoded anywhere in this spec or the implementation.)*

**`site/public/data/trends.json`** — generated, well under 50 KB, fetched only on `/trends`.
Values below are **illustrative shape, not real data**:

```json
{
  "years": [2019, 2020, 2021, 2022, 2023, 2024, 2025],
  "deflator": { "series": "CUUR0000SA0", "period": "May", "base": 2025 },
  "roles": {
    "15-2051": {
      "firstYear": 2021,
      "nominal": [null, null, 100910, 103500, 108020, 112590, 117420],
      "real":    [null, null, 121400, 116800, 116100, 116000, 117420],
      "capped":  [null, null, false, false, false, false, false],
      "emp":     [null, null, 145000, 168000, 192000, 202000, 212000],
      "changeReal": null
    }
  },
  "breaks": [{ "year": 2021, "note": "New standalone SOC codes: 15-2051, 13-1082" }]
}
```

Missing years are `null` entries in parallel arrays rather than a ragged start index — simpler to
consume, and `firstYear` drives the labeling. `changeReal` is `null` for roles excluded from the
headline figure (Decision 6), which is also what makes that exclusion mechanical rather than a
hardcoded role list in the component.

## Honesty guardrails

A real-wage chart on OEWS invites three specific misreadings. Each gets page text, not a footnote:

- **BLS cautions against OEWS time-series use.** State the breaks we know about and what was done
  about each.
- **Occupation mix.** A real median can rise because the seniority or industry mix inside an
  occupation shifted, not because anyone got a raise. This is the single most common misreading of
  this exact chart.
- **New codes, not new jobs.** A role appearing in 2021 means BLS started counting it separately,
  not that the work began then.

Plus: break markers at 2021 on Figure 2; CPI-U named with its base year; the vintage chip from
deliverable (1).

**On top-coding:** for a *national median* the ceiling is effectively unreachable, so censored-point
markers on this page are a safety net rather than a feature. T2 matters here for **archive
correctness** and as a hard prerequisite for Phase B, where a high-paying metro's median approaches
the ceiling and censoring becomes a live distortion.

## Testing

**Pipeline (vitest, alongside `pipeline/tests/`):**
- Deflation round-trip; base-year identity (`real[2025] === nominal[2025]`).
- Per-year top-code table applied correctly — explicitly assert a 2019 `#` cell yields 208000, not
  239200 (T2 regression).
- Archive append-only: writing an existing year without `--force` throws and leaves the file byte-
  identical.
- URL-change marker invalidation (T1 regression).
- Null handling: a role with `firstYear: 2021` produces leading nulls and `changeReal: null`.
- National parse path accepts a real national row and never emits a `00099` CBSA (T3).

**Site:** a `trends.json` fixture driving `site/lib/trends.ts` — sort order, headline exclusion,
ghosting selection, break-marker placement, `url-state` round-trip.

**E2E:** page renders both figures; nominal/real toggle changes values; selecting a role re-anchors
both figures; the two young roles are absent from Figure 1 and present in Figure 2.

**Data-quality tripwire**, in the existing `THRESHOLDS` idiom: `archive-nat.ts` calls `fail()` if any
role's real series moves more than 40% year-over-year. A deflator error or a wrong top-code year
would trip this loudly instead of shipping a plausible-looking wrong chart.

## Phase B forward-compatibility

Not built here; these keep the door open:

- The archive filename is `oews-**nat**-<year>.json` so `oews-msa-<year>.json` slots in beside it.
- `build-trends.ts` is pure and takes an archive collection, so a metro dimension is an added key,
  not a rewrite.
- Decision 4 (RPP is spatial) is stated now because Phase B is where both adjustments meet.
- T2 is fixed now because Phase B is where top-coding actually distorts.
- Phase B additionally needs a CBSA-delineation crosswalk over time (OMB re-delineations rename and
  recombine metros — Austin-Round Rock → Austin-Round Rock-San Marcos is in this window) and a
  suppression-handling policy. Both are Phase B spec work.

## Inherited defects (noted, not fixed here)

- **Trailing slash.** `trailingSlash` is unset in `site/next.config.ts`, so the export emits
  `trends.html` and `/trends/` 404s — the same defect `/about` has. `docs/BACKLOG.md` says to fix it
  alongside the custom-domain move because it changes every URL on the site; this spec adds a second
  affected URL but does not change that call. Add a line to the backlog entry.
- **`/about` hardcodes its source list** and may already be drifting: it claims HUD "2026 Q1" while
  `run.ts:42` documents that the lexicographic sort would pick Dec-2025 over Mar-2026. Confirm which
  file was actually used. Fixed by deliverable (1).

## Naming collision

`docs/BACKLOG.md` gained a row called **"Multi-year time series"** in `cfedc6d` (2026-08-06 intake).
That row means **LCA/H-1B** multi-year — FY2020–FY2024 disclosure ingest, employer wage trends. This
spec is **OEWS** multi-year: different source, different page, different failure modes. Both rows
should be renamed on landing ("H-1B multi-year ingest" vs "OEWS real-wage trends") so the backlog
stops carrying one name for two projects.

## Rollout order

1. Deliverable (1), the vintage chip — out of scope for this spec, but listed here because it
   sequences first: no dependencies, and `/trends` consumes it if present.
2. §1 data layer: `vintages.ts`, T1, T2, T3, archive writer, CPI, watcher, runbook.
3. Backfill 2019–2024 national files; commit the archive.
4. `/trends` Phase A.

Step 2 is worth landing **before the next data refresh regardless of whether `/trends` ships** —
once a vintage is overwritten without being archived, recovering it means re-downloading it later.
