# Data Refresh Runbook

Every year-encoded value lives in `pipeline/vintages.ts`. A refresh is an edit to that file
followed by the steps below. Nothing here runs in CI — see "Why not CI" at the bottom.

## When to refresh

The monthly `watch-sources` workflow opens (or comments on) an issue labelled `data-refresh` when
an upstream file publishes. Release cadences:

| Source | Cadence | Typical availability |
|---|---|---|
| BLS OEWS (MSA + national) | Annual, May reference period | published the following spring |
| DOL LCA disclosures | Quarterly, bucketed by federal fiscal year | ~2 months after quarter end |
| BEA RPP (`MARPP.zip`) | Annual | December |
| HUD ZIP–CBSA crosswalk | Quarterly (`03`/`06`/`09`/`12`) | ~1 month after quarter end |
| Census Gazetteer | Annual | early in the year |

## Steps

1. **Bump `pipeline/vintages.ts`.** Move `oewsYear` up (and `oewsFallbackYear` behind it), the LCA
   fiscal year, the gazetteer year, the HUD stamp. `OEWS_NAT_YEARS` extends automatically.
2. **Add the new year's top code to `OEWS_TOP_CODE_BY_YEAR`.** `topCodeForYear` throws for an
   unrecorded vintage rather than guessing — that is deliberate. Verify the value against BLS's
   technical notes; do not copy the previous year's.
3. `npm run download`
4. ⏳ `npm run archive:nat` — **NOT YET IMPLEMENTED.** Will archive the new national vintage,
   append-only (existing vintages skipped, never rewritten; `--force` to overwrite, `--year <YYYY>`
   for one vintage). Blocked on the national parser — see "Status".
5. `npm run archive:cpi` — refreshes the committed CPI-U deflator (`data/history/cpi-u.json`) from
   the BLS **API**, not a file download. See "CPI comes from the API" below.
6. `npm run archive:verify` — **if it reports anything, stop and diagnose.** See "Reading the
   tripwire" below. Never raise a threshold to make it pass. (Exits 0 with "nothing to verify"
   until `data/history/` has content, which requires step 4.)
7. `npm run pipeline` — the main MSA/LCA build. Needs ~6GB heap (the npm script sets it).
8. `npm test && npx tsc --noEmit`
9. Commit and open a **PR**. Do not push straight to `main` — `deploy.yml` fires on push to main
   and runs no tests; `ci.yml` only gates PRs.

**Scripts that exist today:** `download`, `pipeline`, `archive:cpi`, `archive:verify`, `test`.
Step 4 (`archive:nat`) is written down now because it is the intended shape and the surrounding
machinery already assumes it — but it will fail with "missing script" until the work under
"Status" is finished.

## CPI comes from the API

`npm run archive:cpi` calls `https://api.bls.gov/publicAPI/v1/timeseries/data/` — **a different
host from the Akamai-blocked `download.bls.gov`, and reachable**. It is also the better source:
structured JSON instead of a ~20MB space-padded fixed-width flat file.

Limits: the unauthenticated v1 API allows 10 years and 25 series per request. `archive-cpi.ts`
throws if the span exceeds 10 years rather than truncating — register a free v2 key at
`data.bls.gov/registrationEngine/` (20 years, 50 series, 500 queries/day) when that day comes.

⚠️ A `value` can be the string `"-"` when an observation is unavailable — the 2025 lapse in
appropriations did exactly that to October 2025. The parser throws on it rather than coercing, and
`archive-cpi.ts` separately verifies every year in `OEWS_NAT_YEARS` is present before writing.

**The API cannot replace the OEWS file downloads.** OEWS series exist in the API but it serves only
the *current* reference period — requesting 2021–2024 returns `No Data Available` for each. The
historical vintages are only available as the archived zips on the blocked host.

## Marker semantics, and the two cases they do NOT cover

Each source writes a `data/raw/<name>.done` marker recording three lines: the URL fetched, the
file's basename, and the **preferred** URL (`urls[0]`) at fetch time. A source is skipped only when
the recorded preferred URL still equals the currently configured preferred URL, the fetched URL is
still configured, and the file is still present. So bumping step 1 invalidates the marker and the
new vintage downloads. **You do not need to delete `.done` files by hand for an ordinary bump.**

Two cases this cannot detect. Both need a manual `rm data/raw/<name>.done`:

- **A fallback was used.** If a preferred URL 404s (the agency has not published yet) the run falls
  back to the previous vintage and records it as current. It will **not** automatically pick up the
  preferred vintage once it publishes. When the watcher reports that vintage is live, delete that
  source's marker to force the retry.
- **`rpp` has no year in its URL.** BEA serves the regional price parities from a stable
  `MARPP.zip` that is updated in place each December. No URL-keyed scheme can notice that, so the
  RPP marker will never invalidate on its own. **Delete `data/raw/rpp.done` every December**, or
  the pipeline will keep reusing last year's price parities indefinitely while reporting success.

## Reading the tripwire

`npm run archive:verify` runs two independent checks over `data/history/`:

- **Cross-vintage jumps** — any percentile moving more than 40% year over year. Needs at least two
  archived vintages.
- **Intra-vintage top-code gap** — a vintage whose recorded `topCode` sits more than 10% above every
  *uncapped* percentile in the same file. This is the check that actually catches a wrong per-year
  top code, because a ceiling applied wrongly to several vintages *consistently* moves every
  censored cell together and produces no year-over-year jump at all. Runs on a single vintage.

What neither catches, by design: slow compounding bias (a systematic error under 40%/yr), a role
silently vanishing from the archive, and a top code wrong by only a small margin.

## Manual setup (once)

- The **`data-refresh` label must exist** in the repo. The watcher looks up open issues by that
  label to decide whether to comment or create; if the label does not exist the lookup returns
  nothing and it opens a fresh duplicate issue every month. Repo → Issues → Labels → New label →
  `data-refresh`.

## Upstream probing: read this before touching the watcher

Measured 2026-08-06 from a residential connection: **bls.gov and dol.gov sit behind AkamaiGHost**,
which returns `403 Access Denied` to automated requests once a modest request rate is exceeded —
for *every* URL, including ones that certainly exist and ones that certainly do not. `curl -I`
(HEAD) is refused outright. A sweep of ~15 probes was enough to trigger it, and it persisted for
well over an hour. census.gov, apps.bea.gov and huduser.gov were unaffected.

Consequences, all of which the watcher is built around:

- Probe with a **ranged GET** (`curl -r 0-1`), never HEAD.
- Classify **three** ways: `200`/`206` published · `404` not yet · **anything else INCONCLUSIVE**.
  A watcher that treats only `200` as published finds nothing under a block, opens no issue, and
  reports a clean run — it manufactures confidence, which is worse than no watcher.
- The watcher sleeps between probes, aborts after the first `403`, records every unprobed target as
  inconclusive, and **fails the job** if every target was inconclusive.
- If a monthly run comes back all-403 from GitHub's runners, that is a finding, not a bug to retry
  around — Akamai commonly treats cloud egress as automated traffic. The fallback is a calendar
  reminder keyed to the cadence table above.

**If you are refreshing by hand and get 403s: stop.** More attempts extend the block. Wait it out.

## Observed vintage coverage

Measured from the archive, 2026-08-06. All seven vintages present.

| Vintage | Registry roles | Top code | Censored p90 |
|---|---|---|---|
| May 2019 | **13** / 21 | $208,000 | `11-3021` |
| May 2020 | **13** / 21 | $208,000 | `11-3021` |
| May 2021 | 21 / 21 | $208,000 | `11-3021`, `15-1221` |
| May 2022 | 21 / 21 | $239,200 | `11-3021` |
| May 2023 | 21 / 21 | $239,200 | `11-3021` |
| May 2024 | 21 / 21 | $239,200 | `11-3021` |
| May 2025 | 21 / 21 | none applied | — |

⚠️ **Eight registry roles do not exist before May 2021**, not two as originally assumed:
`13-1082`, `15-1242`, `15-1243`, **`15-1252` (Software Developers)**, `15-1253`, `15-1254`,
`15-1255`, `15-2051`. OEWS published combined codes for these until the May 2021 detailed-code
split. All eight first appear in **2021**. Anything plotting a 2019-start series must account for
this — it includes the site's flagship role.

⚠️ **`11-3021` (IT Managers) has a censored p90 in every vintage 2019–2024.** Those values are
*floors*, not wages: $208,000 through 2021, $239,200 from 2022, then a genuine $297,510 in 2025.
A p90 chart for that role would show a step at 2022 and a jump in 2025 that are both artifacts of
censoring, not pay movement. The `capped` array marks exactly which cells; use it.

## Status

**Complete.** The refresh machinery is built and tested, CPI is archived (`data/history/cpi-u.json`,
2019–2025), and all seven OEWS national vintages are archived and verified.

Two things to carry forward, both discovered by running it rather than by planning it:

- **Column casing drifts between vintages.** May 2019 uses entirely lowercase headers and has no
  `PRIM_STATE`; 2020+ are uppercase; 2021+ add `PCT_RPT`. `parse-oews-nat.ts` resolves columns
  case-insensitively for this reason. The same drift is documented for the HUD crosswalk in
  `crosswalk.ts` — assume it for any new BLS source.
- **Verify the top code by measuring, never by guessing.** The method: the largest *uncensored*
  `H_PCT90` in a vintage lands just below that year's hourly ceiling, which BLS sets at a round
  figure. 98.90 / 99.92 / 99.72 → $100.00 for 2019–2021; 112.97 / 112.31 / 113.34 → $115.00 for
  2022–2024. A guessed boundary of 2023 was wrong by a year and archived `11-3021`'s 2022 p90 15%
  low, producing a fake step. Re-run this check after every refresh.

## Why not CI

Running the pipeline on a schedule in Actions would need ~478MB of raw downloads and a 6GB heap, and
landing its output means pushing `main` — which auto-deploys without tests. The watcher detects; a
human refreshes locally and lands a PR through the gate that actually exists.
