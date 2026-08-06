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
5. ⏳ `npm run archive:cpi` — **NOT YET IMPLEMENTED.** Will refresh the committed CPI-U deflator.
   Blocked on confirming the BLS flat-file name — see "Status".
6. `npm run archive:verify` — **if it reports anything, stop and diagnose.** See "Reading the
   tripwire" below. Never raise a threshold to make it pass. (Exits 0 with "nothing to verify"
   until `data/history/` has content, which requires step 4.)
7. `npm run pipeline` — the main MSA/LCA build. Needs ~6GB heap (the npm script sets it).
8. `npm test && npx tsc --noEmit`
9. Commit and open a **PR**. Do not push straight to `main` — `deploy.yml` fires on push to main
   and runs no tests; `ci.yml` only gates PRs.

**Scripts that exist today:** `download`, `pipeline`, `archive:verify`, `test`. Steps 4 and 5 are
written down now because they are the intended shape and the surrounding machinery already assumes
them — but they will fail with "missing script" until the work under "Status" is finished.

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

_Not yet recorded — the 2019–2025 national backfill has not been run (see "Status" below). Once
`npm run archive:nat` completes, record here the role count per vintage and the first year each of
`15-2051` (Data Scientists) and `13-1082` (Project Management Specialists) appears. Those two are
2018-SOC carve-outs from combined codes and do not exist in the earliest vintages; the `/trends`
page depends on the measured years, not on an estimate._

## Status

The refresh machinery is complete and tested. **The backfill itself has not run**: the national
OEWS vintages and the CPI-U file could not be downloaded because of the Akamai block described
above. Outstanding, in order:

1. `npm run download` — fetch the national OEWS vintages + CPI (small files; the MSA and LCA data
   is already present).
2. Confirm the CPI flat-file name. `pipeline/download.ts` uses
   `cu.data.1.AllItems`, marked in-code as **unverified** — it could not be checked against the
   live directory listing.
3. Build `pipeline/lib/parse-oews-nat.ts`. Deliberately deferred: the national file's real column
   set and its industry/ownership grouping must be *read*, not assumed, or the parser may silently
   select a cross-industry subset instead of the total row.
4. Verify the top-code boundary year in `OEWS_TOP_CODE_BY_YEAR` — currently marked `⚠️ UNVERIFIED`.
5. Run the backfill and fill in "Observed vintage coverage" above.

## Why not CI

Running the pipeline on a schedule in Actions would need ~478MB of raw downloads and a 6GB heap, and
landing its output means pushing `main` — which auto-deploys without tests. The watcher detects; a
human refreshes locally and lands a PR through the gate that actually exists.
