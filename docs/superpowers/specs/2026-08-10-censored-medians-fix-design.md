# Censored metro medians — flag, never plot the floor

**Status:** Approved design 2026-08-10 — not started
**Fixes:** the 🔴 ledger entry filed 2026-08-09 (`e4bffd6`): "Censored metro medians are plotted as real medians — a live artifact on the public site."
**Blocks:** the next push to `main` (auto-deploys), and the home-dashboard comp-intelligence loop (`C:\projects\home-dashboard\docs\superpowers\specs\2026-08-10-atlas-comp-loop-design.md`), which consumes these medians.

## Problem

BLS top-codes wage cells at a per-vintage ceiling. The MSA archives carry
top-code-censored p50 values **in real cells** (San Jose 41940 / 11-3021 IT
Managers is p50-censored in 2020), and the pipeline emits the floor value as if
it were a measured median. On the public site the inflation-adjusted trend line
*declines* 2020→2021 and *jumps 22%* in 2025 purely as a censoring artifact.
The "medians are uncensored for every role in every vintage" assumption is true
nationally only; nobody re-checked metros.

## Design

1. **Detection (pipeline).** A cell's p-value is censored when the source marks
   it top-coded OR when it equals/exceeds that vintage's top-code ceiling. The
   exact mechanism is pinned at plan time by reading `lib/parse-oews.ts` and one
   raw vintage — the raw files may carry an explicit marker (`#`) that the
   parser currently coerces or drops; prefer the source marker, fall back to
   the ceiling comparison. Applies to ALL percentile fields, not just p50 —
   p75/p90 are censored far more often and any consumer treating them as
   measured inherits the same artifact class.
2. **Emission.** A censored cell emits `null` for the value plus a per-cell
   censor flag (exact JSON shape chosen at plan time to match the existing
   compact emit style — candidate: sibling `"c"` arrays naming censored
   fields). The floor value is NEVER emitted as data. `meta.topCodeValue`
   stays, per vintage where ceilings differ.
3. **Site rendering.** Trend lines gap over censored vintages with a marker and
   a tooltip: "median censored above $X — BLS top-code". Current-year band
   displays treat a censored percentile as absent ("p90: above $239,200"
   phrasing where the ceiling is known), never as the ceiling number.
4. **Regression lock.** A pipeline test pins the San Jose 41940 / 11-3021 /
   2020 cell as flagged-censored, and a site test pins the gap rendering.
   Acceptance: the named 2020→2021 decline and 2025 jump disappear from the
   rendered trend; both packages' suites green.
5. **Ledger close-out.** Strike the BACKLOG entry per its own rules (ledger
   first, `Seen by:` copies after), CHANGELOG-equivalent note in the repo's
   convention, then the owed push can proceed.

## Non-goals

Imputing censored values, changing national aggregates, any other ledger item.

## Data risks

None new — public data in, public site out; the change makes published numbers
more honest. No egress, no personal data, no new dependencies.
