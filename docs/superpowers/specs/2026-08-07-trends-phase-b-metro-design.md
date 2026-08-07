# `/trends` Phase B — Metro-Level Real Wage Trends — Design Spec

**Date:** 2026-08-07 · **Status:** Approved, blocked on data acquisition

## Purpose

Phase A answers "did tech pay keep up with inflation?" nationally. The question a reader actually
has is about their own city. Phase B answers **"how has pay in my metro changed?"** by extending the
existing metro panel rather than adding a new surface.

Phase A spec: `docs/superpowers/specs/2026-08-06-trends-and-data-refresh-design.md`.

## ⚠️ Prerequisite — this cannot be built or verified without it

Only `data/raw/oesm25ma/MSA_M2025_dl.xlsx` is on disk. Phase B needs the MSA file for **2019–2024**
as well: six downloads, ~39MB zipped each, ~234MB total, from `bls.gov/oes/special-requests/`.

```
https://www.bls.gov/oes/special-requests/oesm19ma.zip   → MSA_M2019_dl.xlsx
https://www.bls.gov/oes/special-requests/oesm20ma.zip   → MSA_M2020_dl.xlsx
https://www.bls.gov/oes/special-requests/oesm21ma.zip   → MSA_M2021_dl.xlsx
https://www.bls.gov/oes/special-requests/oesm22ma.zip   → MSA_M2022_dl.xlsx
https://www.bls.gov/oes/special-requests/oesm23ma.zip   → MSA_M2023_dl.xlsx
https://www.bls.gov/oes/special-requests/oesm24ma.zip   → MSA_M2024_dl.xlsx
```

⚠️ **Space these downloads out.** `bls.gov` sits behind Akamai, which 403s automated requests after
roughly fifteen in quick succession and stays blocked for over an hour — this happened on
2026-08-06 and blocked the Phase A backfill. Sleep ~5s between files. See `docs/REFRESH.md`.

⚠️ **Expect schema drift.** The national files taught us that May 2019 uses entirely lowercase
column headers and omits `PRIM_STATE`, 2020+ are uppercase, and 2021+ add `PCT_RPT`. Assume the MSA
files drift the same way; `parse-oews.ts` must be checked against each vintage rather than assumed
to work. This is why the parse path resolves columns case-insensitively.

## Decisions

1. **The question is "my metro", not "which metros ranked".** Chosen over a cross-metro ranking or a
   two-metro comparison. It is the personally relevant question, and it maps onto a payload that
   splits naturally per metro.

2. **It lives in the existing metro panel**, below "Pay by role" — not on `/trends`, not on a new
   `/trends/[metro]` route. The reader who clicked a metro on the map is already looking at that
   metro, so there is no second picker and no new navigation. 393 prerendered routes were rejected
   as fragmenting "over time" across two places for a shareability gain the map link already
   provides.

3. **A line breaks where the metro's definition changed.** Same treatment Phase A gave the May 2021
   SOC split: draw both segments, break between them, say why. A metro that gains or loses counties
   is a different geography, and a continuous line across that boundary compares two different
   things.

4. **A line breaks across a suppression gap too.** OEWS withholds many metro×role figures for small
   samples, which produces holes *mid-series*, not only at the start as in Phase A. A gap means "we
   do not know", so the line stops and resumes rather than interpolating a value that was never
   published.

5. **The national series is drawn ghosted behind the metro's.** "Is my city keeping up?" is the
   comparison that makes the metro number meaningful, and `trends.json` already holds the national
   figures — no extra payload.

6. **RPP must never touch the time series.** Inherited unchanged from Phase A Decision 4 and
   restated here because Phase B is where the two adjustments finally meet in one component. See
   "The trap" below.

## The trap this design exists to avoid

`MetroPanel` already takes an `adjusted` prop. It means **cost of living** — BEA Regional Price
Parities, a **spatial** index that answers "is a dollar worth less in San Jose?".

The trend needs **inflation** adjustment — CPI-U, a **temporal** index that answers "is a 2021
dollar worth less than a 2025 dollar?".

Two different things called "adjusted" in one panel is a live confusion risk for the reader *and*
for whoever edits this next. Worse, RPP is renormalized to US = 100 **every year**, so an
RPP-adjusted series over time measures nothing coherent — the index is reset annually and the
resulting line would be an artifact.

**Therefore:**

- The trend section reads CPI only and **ignores the `adjusted` prop entirely**.
- It carries a visible note stating that the figures are inflation-adjusted, not cost-of-living
  adjusted, and that toggling cost-of-living does not change them.
- The two never share a code path, a variable name, or a formatter.

A test asserts that toggling `adjusted` leaves every plotted trend value byte-identical. That test
is the guardrail; without it, a future refactor that "unifies the adjustment logic" would silently
produce a meaningless chart.

## Detecting a delineation change

The signal available in the data itself is **`AREA_TITLE` per CBSA across vintages**:
`"Austin-Round Rock"` → `"Austin-Round Rock-San Marcos"` means OMB moved the boundary.

**This is a heuristic and the spec says so rather than implying more rigour than it has.** A
boundary can change without a rename, and a rename can be cosmetic. The alternative — ingesting
OMB's delineation files and diffing county composition — is an entire additional dataset for a
marginal gain over a signal that catches the large, real redefinitions.

Two related cases the detector must handle:

- A CBSA code that **appears** mid-window (new metro, or split from another) — the series simply
  starts there, drawn like Phase A's young roles.
- A CBSA code that **disappears** mid-window (merged away) — the series ends there, and the panel
  says so rather than showing a truncated line with no explanation.

The emitted per-metro file records the break years so the component renders them without
re-deriving the rule.

## Architecture

| File | Change |
|---|---|
| `pipeline/archive-msa.ts` | **New entry point** (`npm run archive:msa`). Append-only, one file per vintage. |
| `pipeline/lib/history.ts` | Add `MsaArchive` type + `archiveMsaPath(year)`. Reuse `assertWritable`. |
| `pipeline/lib/delineation.ts` | **New.** Pure: archives → per-CBSA break years + appear/disappear. |
| `pipeline/lib/build-metro-trends.ts` | **New.** Pure: archives + CPI + breaks → per-metro payloads. |
| `pipeline/emit-metro-trends.ts` | **New entry point** (`npm run emit:metro-trends`). Writes `site/public/data/trends/<cbsa>.json`. |
| `pipeline/run.ts` | Stamp `trendYears` onto `meta.metros[]` so the panel can skip the fetch. |
| `site/lib/data.ts` | Add `loadMetroTrend(cbsa)`. |
| `site/lib/metro-trend.ts` | **New.** Pure: split a series into unbroken segments at breaks and gaps. |
| `site/components/MetroTrend.tsx` | **New.** The panel section. |
| `site/components/MetroPanel.tsx` | Render `<MetroTrend>` below "Pay by role". |

`archive-msa.ts` is separate from `archive-nat.ts` because the inputs differ by two orders of
magnitude — the national file is 290KB and one row per occupation; the MSA file is 39MB and 150,023
rows. Sharing an entry point would mean one of them carries the other's constraints.

**Payload.** `data/history/oews-msa-<year>.json` ≈ 370KB per vintage (393 metros × 21 roles, p50 +
emp + `capped`), ~2.6MB committed for seven. Per-metro emitted files ≈ 2–4KB, ~1.2MB total —
smaller than the 2.9MB `employers/` directory already shipping.

**Loading.** Mirrors the existing employers fetch exactly: `useEffect` keyed on `cbsa`, a `live`
flag to cancel in-flight requests on metro change, and a skip when `meta.metros[].trendYears === 0`.

## Honesty guardrails

Beyond the breaks themselves:

- **Suppression is stated, not implied.** A metro whose selected role has few published years says
  how many it has, rather than showing a two-point line as though it were a trend.
- **The national ghost is labelled**, so it cannot be mistaken for a second metro.
- **Small-sample language** follows the panel's existing convention (`"Small sample (N filings) —
  treat medians as anecdotes."`), which already exists for employer data.
- **Metros absent from a vintage** are distinguished from metros with a suppressed value. "Not
  published" and "did not exist" are different facts and the panel says which.

## Testing

**Pipeline:** delineation detection (rename → break; stable → none; appear/disappear); segment
splitting across both break types; append-only refusal; `trendYears` matches the archive.

**Site:** `metro-trend.ts` segment splitting; `MetroTrend` renders one polyline per segment, not one
spanning the gap; the national ghost is present and labelled; the skip-fetch path when
`trendYears === 0`; **and the RPP guard — toggling `adjusted` leaves plotted values identical.**

**E2E:** select a metro with a known break, assert multiple line segments; select a metro with no
trend data, assert no fetch is attempted.

## Out of scope

- Cross-metro ranking ("which metros gained most") — a different question and a different payload.
- Metro-level p90 trends. `11-3021`'s p90 is censored 2019–2024 nationally and metro-level censoring
  will be worse; medians only, as in Phase A.
- OMB delineation-file ingest. See the heuristic note above.
- Backfilling metros that changed CBSA code across a redefinition into a single continuous series.

## Open question, deliberately deferred

**How many metros actually changed definition 2019–2025 is unknown** until the vintages are on disk.
If it turns out to be most of them, the "break the line" decision produces a page of fragmented
charts, and the design may need revisiting — possibly narrowing to metros with a stable definition,
which was considered and rejected at design time on the grounds that "why isn't my city here?" is a
bad answer to give a reader. Measure it during implementation, and if it is severe, raise it rather
than shipping a chart that is technically honest and practically unreadable.
