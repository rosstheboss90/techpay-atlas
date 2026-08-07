# TechPay Atlas — Backlog

Newest decisions first. v1 (map + panel) shipped 2026-08-03.

## `/trends` Phase B (metro-level) — LANDED on `main` 2026-08-07

"How has pay in my metro changed?" — a new "Pay over time" section inside the existing metro
panel (`site/components/MetroTrend.tsx`, rendered from `MetroPanel.tsx` below "Pay by role"),
built from a new append-only per-vintage MSA archive (`data/history/oews-msa-<year>.json`,
`pipeline/archive-msa.ts`) run through a pure delineation detector (`pipeline/lib/delineation.ts`)
and a pure trend builder (`pipeline/lib/build-metro-trends.ts`) that emit one small JSON per metro
under `site/public/data/trends/<cbsa>.json`. Plan:
`docs/superpowers/plans/2026-08-07-trends-phase-b-metro.md`. Spec:
`docs/superpowers/specs/2026-08-07-trends-phase-b-metro-design.md`.

**The spec's deferred open question is answered: 66 of 429 metros (15.4%) have a delineation
break, and every single one falls in 2024** (the OMB 2023-delineation adoption, e.g. Austin
`12420`: "Austin-Round Rock, TX" → "Austin-Round Rock-San Marcos, TX"). That is the measurement
that justified keeping the "break the line" design as specced rather than narrowing to
stable-definition metros only — 15.4% is a labelled exception, not most of the page.

**Payload:** the MSA archive is 1.7MB across seven vintages in `data/history/`; the emitted
per-metro trend files are 2.6MB total in `site/public/data/trends/` (429 files). Both are
committed.

**Schema drift, same shape as before:** 2019's MSA file (`MSA_M2019_dl.xlsx`) has lowercase column
headers and no `PRIM_STATE`, exactly the drift already documented for the national OEWS file and
for HUD in `crosswalk.ts`. `parse-oews.ts` resolves columns case-insensitively for this reason —
verified against the real 2019 vintage, not assumed.

**Known limits, deliberate:**
- **Metro-level p90 is out of scope.** National p90 is already censored for some SOCs
  (`11-3021` 2019–2024); metro-level censoring is worse, so the trend plots medians only, same
  as Phase A.
- **The delineation detector is a name-change heuristic, not a county-composition diff.** It
  flags a break when a CBSA's published `AREA_TITLE` changes between vintages. OMB can move a
  boundary without a rename, or rename cosmetically without moving one; the alternative — ingesting
  OMB's delineation files and diffing county membership — is an entire additional dataset for a
  marginal gain over a signal that already catches the large, real redefinitions. The panel's
  boundary note says the break is name-detected, not a boundary read.
- **The RPP guard holds at both levels**, structural (no `adjusted` prop on `MetroTrend`, a source
  scan test) and behavioral (`site/e2e/metro-trend.spec.ts` toggles cost-of-living in a real
  browser and asserts the plotted `points` are byte-identical).

## `/trends` Phase A — LANDED on `feat/data-refresh-and-archive` 2026-08-06

Real-wage trends for the 21 registry roles, built from the committed OEWS national archive
deflated by CPI-U. Headline ranked bars over **2021–2025** — the earliest window in which every
role exists as its own BLS code, so every bar is comparable and none is excluded — then a path
chart showing each role's full real history on a shared 2019–2025 axis with a ragged left edge.

Design decisions and the measurements behind them:
`docs/superpowers/specs/2026-08-06-trends-and-data-refresh-design.md` (see the ⚠️ CORRECTION
block, which supersedes the original window choice). Plan:
`docs/superpowers/plans/2026-08-06-trends-phase-a.md`.

**What the data actually says:** Software Developers' median went $120,730 → $135,980 nominal
2021→2025, which is **−5.7% in real terms**. Range across the 21 roles is +9.0%
(Web & Digital Interface Designers) to −11.1% (Software QA Analysts & Testers).

Three things found by building it, each recorded because they will recur:

- **The window premise was wrong and had to be re-decided mid-build.** The spec assumed two roles
  were too young for a 2019 start. Measuring the archive showed **eight**, including Software
  Developers — a headline chart missing the flagship role. Hence the 2021 headline window.
- **`22ch` for the label column truncated 8 of 21 role names**, leaving "Computer & Information
  Res…" indistinguishable from "…Sys…". Measured in the browser: the longest name needs 261px at
  13px, but 22ch resolved to 178px while the track held 869px it did not need. A `ch` value chosen
  without measuring is a fixed cap in disguise — the exact failure the sizing rule exists to stop.
- **`NEXT_PUBLIC_BASE_PATH=/techpay-atlas npm run build` fails from git-bash**, because MSYS
  rewrites the leading `/` into a Windows path. Run that build from PowerShell. CI is unaffected —
  it sets the variable through the workflow `env:` block.

Known limits, deliberate:
- **2021 is a hot baseline.** It is the earliest comparable year but also an unusually strong one
  for pay, so the headline measures change from a high start. Stated on the page, not footnoted.
- ~~**`/trends/` with a trailing slash 404s**, same as `/about/`.~~ FIXED 2026-08-07 —
  `trailingSlash: true` in `site/next.config.ts`, landed on its own rather than waiting for the
  custom-domain move. The deferral was right at two routes; the employer lens adds ~500 URLs
  whose entire purpose is being linkable and indexable, which made the dead trailing-slash form
  the dominant cost. The export now emits `about/index.html` instead of `about.html`, so both
  forms resolve. The custom-domain entry below still owns dropping the base path.
- **`11-3021`'s p90 is censored 2019–2024**, so any future p90 view must read `cappedP90`. Phase A
  plots medians only, which are uncensored for every role in every vintage.
- ~~**Phase B (metro-level) not started.**~~ LANDED 2026-08-07 — see the entry above.

## Data refresh + vintage archive — LANDED on `feat/data-refresh-and-archive` 2026-08-06

`pipeline/vintages.ts` is now the single source of truth for every year-encoded URL; the runbook is
`docs/REFRESH.md`. The pipeline is no longer destructive — `data/history/` will hold the committed
per-vintage national OEWS archive that `/trends` consumes. Spec:
`docs/superpowers/specs/2026-08-06-trends-and-data-refresh-design.md`.

**Four latent defects found and fixed on the way** (each would have produced a plausible-looking
wrong result rather than an error):

- **`npm test` downloaded ~500MB on every CI run.** `download.test.ts` imported `download.ts`, whose
  loop executes at module level, so on a fresh checkout the suite attempted every real download.
  Invisible because vitest 4 swallows module-level console output. Logic now lives in
  `lib/download-lib.ts`; `download.ts` is a thin entry point nothing imports.
- **`.done` markers keyed on basename.** Bumping a vintage URL while the old file was still in
  `data/raw` printed `skip (already downloaded)` and refreshed nothing. Markers now record the
  *preferred* URL; membership-only checking was tried first and still failed, because the runbook
  demotes the superseded URL to fallback rather than removing it.
- **`TOP_CODE` was a constant** while BLS's threshold is vintage-specific — reading an older file
  with the current value would have manufactured a real-terms decline at the top end.
- **The plausibility tripwire was blind to the bug it targeted.** It compared medians only, but a
  wrong top code distorts the censored upper percentiles, and a *consistently* wrong ceiling
  produces no year-over-year jump at all. Now also checks every percentile plus an intra-vintage
  top-code gap.

**Operational gotchas now documented in `docs/REFRESH.md`:** `rpp` downloads from a stable
`MARPP.zip` with no year in it, so its marker can never invalidate — delete `data/raw/rpp.done`
every December or the pipeline silently reuses last year's price parities. A source that fell back
to an older vintage will not auto-retry the preferred one. And the `data-refresh` label must be
created manually or the watcher opens a duplicate issue monthly.

**Blocked, not done:** the 2019–2025 backfill has not run. bls.gov and dol.gov sit behind Akamai,
which 403s automated requests after a modest rate — tripped during this work and still active
hours later. Outstanding: the national parser (its real column shape must be read, not assumed),
the unverified CPI filename, the unverified top-code boundary year, and the backfill itself. Full
list under "Status" in `docs/REFRESH.md`.

**Still open:** `/trends` Phase A — spec written, plan to follow once the archive exists and the
boundary years are measured.

## 🆕 2026-08-06 intake — public-data project slate

Five "what else could we build from public data" ideas, generated 2026-08-06 and then checked
against this repo. **Two were already partly or wholly built** — recorded here so the mistake
isn't repeated:

| # | Idea | Status after checking the repo |
|---|---|---|
| 1 | H-1B / PERM wage disclosure atlas | **~60% already here.** See below. |
| 2 | WARN-notice layoff tracker | Genuinely new; standalone sibling site |
| 3 | Austin commute-shed × rent map | Genuinely new; belongs to home-dashboard |
| 4 | SEC Form 4 insider tracker | Genuinely new; belongs to home-dashboard |
| 5 | BEA RPP cost-of-living overlay | ❌ **ALREADY SHIPPED** — `parse-rpp.ts`, `MARPP_MSA_2008_2024.csv` |

### 1. H-1B / PERM deepening — what's actually left

Already built: LCA ingest for all four FY2025 quarters (`data/raw/LCA_Disclosure_Data_FY2025_Q*.xlsx`,
~417 MB), normalized by `pipeline/lib/parse-lca.ts` (SOC · title · employer · worksite ZIP ·
annualized wage w/ unit conversion + `_FROM`/`_TO` midpointing · per-reason drop counts), and
371 per-CBSA files in `site/public/data/employers/`.

Not built, in rough order of distinctness:

- **PERM ingest.** Only LCA is loaded today. PERM (permanent labor certification) is a separate
  DOL file with a different population — skews more senior, different wage semantics. The single
  biggest genuinely-new data addition available.
- **H-1B multi-year ingest (LCA FY2020–FY2024).** FY2025 only today. "How has employer X's filed
  wage moved YoY" needs FY2020–FY2024 ingest, and a decision on SOC/schema drift across vintages
  (the 2018 SOC revision lands inside that window). *Renamed from "Multi-year time series"
  2026-08-06: that name also described the **OEWS** real-wage trends work, which is a different
  source, a different page, and different failure modes. See the `/trends` spec.*
- **Employer-centric lens.** Employer data exists but surfaces only as a "Top employers"
  disclosure inside a role bucket. A first-class "what does Employer X file, by role, by city"
  view does not exist.

**Honesty constraints** (this site is public; these belong on the page, not in a footnote): H-1B
covers only sponsoring employers — skewed toward large-cap and toward certain roles — and the
filed wage is a **base-pay floor**, with no equity and no bonus. Consistent with the existing
"label uncertainty, don't hide it" rule in `PROJECT-STANDARDS.md`.

**Stale blocker cleared:** the title↔SOC conflation item under "v2 candidates" is marked blocked
on "a local `npm run pipeline` with the raw H-1B files (the sandbox has no raw inputs)". The
development box **does** have those inputs in `data/raw/`. That item is runnable as-is.

## Visual polish pass — SHIPPED + DEPLOYED 2026-08-06 (`8995349`, PR #10)

Editorial / data-journalism direction across the six main-page sections. Root cause of most
of it: **fixed pixel widths for label columns and chart canvases**, sized for a narrower
layout than the 1180px container — each truncated its labels *and* left the right half empty.
Slopegraph (`LEFT_X=210` in a `W=560` viewBox clipped both label columns), role similarity
(`width:160px` + `max-width:240px` ended the row at ~660px), head-to-head (`120px`), heatmap
(`160px`), and the map (`.hero-row` stretched the figure to the taller panel).

**House rule going forward:** no fixed px for label columns or chart canvases — size labels to
content (`ch`) and let charts claim the container. See the header comment in `globals.css`.

Two latent bugs found while reviewing: the map size legend drew a `r=26` circle
(`bubbleRadius`'s max) inside a `60x28` box, clipped on all four sides; and a first cut of the
similarity grid used `max-content`, which resolves *per row* because each `<li>` is its own
grid — every bar started at a different x, making the lengths non-comparable.

Constraints worth remembering:
- `--surface` must stay byte-identical in both schemes — the `--soc-*` categorical palette was
  validated against it. Changing it means re-running the dataviz validator.
- Base type / heading rules are scoped to `.page`, **not** global: `/about` is deliberately
  isolated under `.ab-root` with its own serif scale, and a global rule leaks into it.

Still open from this pass:
- **Page got longer, not shorter**: 5,389 → 5,860px desktop, 5,791 → 6,598px mobile. Mobile is
  mostly the slopegraph, which now renders at natural size and scrolls instead of being scaled
  down to ~4px text. Deliberate trade; revisit if the scroll length becomes the bigger problem.
- **`/about` still on its own visual system** — untouched by this pass by design. Decide whether
  it should adopt the new tokens/scales or stay a distinct "field guide".
- **Raw SOC codes leak into some conflation legends** (`11-9021`, `17-2051`) where others show
  friendly labels — a gap in the role registry, not styling.
- **Heatmap per-column color scaling** still invites cross-column comparison that isn't valid.
  The caption warns about it; a real fix is a design decision (shared scale? per-column legend?).

## `/about/` trailing slash 404s (pre-existing, found 2026-08-06)

`trailingSlash` is unset in `site/next.config.ts`, so the export emits `about.html`, not
`about/index.html`. `/about` → 200, `/about/` → 404. The masthead link uses the working form so
nothing is broken in-app, but a shared or hand-typed URL with a trailing slash dead-ends.
One-line fix (`trailingSlash: true`) but it changes **every** URL on the site — do it together
with the custom-domain move below, not on its own.

`/trends`, when it lands, inherits the identical defect — `/trends/` will 404 for the same reason.
That does not change the "do it with the custom-domain move" call, but it is now two URLs, not one.

## Site polish — description + custom domain (2026-08-05)

- ~~**Plain-language description.**~~ DONE (on the heatmap PR): site meta `description` in
  `site/app/layout.tsx` rewritten to _"See what tech jobs actually pay across US cities — real
  salary ranges by role and location, adjusted for cost of living, built from public government
  data."_ The GitHub repo About one-liner isn't editable via the automation tools — paste
  manually: _"See what tech jobs really pay across US cities — salary ranges by role and location,
  cost-of-living adjusted, from public government data."_
- **Custom domain (URL).** Point the site at a custom domain (value TBD from user). Work:
  - add a `CNAME` — put it in `site/public/CNAME` so the static export carries it into `out/`;
  - **drop the base path** — a custom apex/subdomain serves at the root, so `NEXT_PUBLIC_BASE_PATH`
    must go from `/techpay-atlas` to empty in `.github/workflows/deploy.yml` **and** the CI build
    env in `ci.yml`; then re-verify `site/lib/data.ts`'s absolute-path prefixing under an empty
    base;
  - update the in-repo URL references (README "Live site", `CLAUDE.md` "Live:", and the
    deploy-target note below) to the new domain;
  - set the custom domain in the repo's Pages settings + DNS (manual).
- ~~**Open Graph / social metadata.**~~ DONE (2026-08-05): `openGraph` + `twitter` tags in
  `site/app/layout.tsx` (base-path-aware image `site/public/og.png`, from the map screenshot).
  When the custom domain lands, update `metadataBase` + the `basePath` image/URL prefixes here too.
- ~~**CI lint step — BLOCKED for now.**~~ DONE: added to `site/` only (root pipeline is plain TS,
  no JSX/hooks, already fully covered by `tsc --noEmit`). Confirmed `typescript-eslint` cannot run
  against TS 7 at all — not just an unmet peer range, `@typescript-eslint/parser` throws
  `"typescript-eslint does not support TS 7.0"` at parse time (tracking:
  typescript-eslint/typescript-eslint#10940) — and two TypeScript majors can't cleanly coexist in one
  npm tree when the root project directly depends on `typescript` itself (tested `overrides` incl.
  the `$name` peer-reference trick: npm either hard ERESOLVEs, or silently reuses the root's TS 7 for
  the peer instead of nesting a compatible copy — worse than no linting). Went with the
  `@babel/eslint-parser` + `@babel/preset-typescript` option instead: strips TS syntax to an ESTree
  AST without ever importing `typescript`, so no version conflict and no type-aware linting (`tsc
  --noEmit` stays the type-correctness gate). Config: `site/eslint.config.mjs`
  (`eslint-plugin-react-hooks` + `@next/eslint-plugin-next`); CI step in `.github/workflows/ci.yml`
  `site` job.

## Title lens follow-ups (from final-review, 2026-08-04)

Closed 2026-08-05:
- ~~pmo bucket too thin (61 filings)~~ — labeled, not hidden (honesty rule): rows under
  `THIN_SAMPLE_FILINGS` (100, isolates pmo; next-thinnest is 307) carry a "thin sample" chip.
- ~~unused topEmployers payload~~ — wired into the site as a per-bucket "Top employers"
  disclosure (national medians of filed wages, never COL-adjusted).
- ~~tier `'V'` suffix in the IC-marker regex~~ — dropped; only I/II/III/IV are real suffixes
  in the scan, matching the senior-tier regex.
- ~~zipMatchRate population-change note~~ — the join now spans the ALL-SOC deduped population
  (title lens widened it from target-SOC-only). Measured ~0.99 vs the 0.85 floor, so the
  threshold stays a tripwire, not a live constraint; documented in `pipeline/config.ts`.

Still open:
- tiny-segment conflation-bar click targets (small SOC shares are hard to click/tab-to).

## v2 candidates (unordered, unscoped)

- **Spec-owed sections**: rank-flip slopegraph · city × role heatmap (doubles as the
  accessibility table-fallback the spec owes) · head-to-head compare (must clamp beeswarm
  axis at bundle `p99`, decide thin-bundle policy — 39% of bundles have n ≤ 2)
- **Role similarity / equivalency** (user-requested 2026-08-03):
  1. ~~wage-profile clustering across metros from shipped salaries.json~~ — SHIPPED 2026-08-05
     (`RoleSimilarity`, pay-overlap equivalency).
  2. H-1B `JOB_TITLE` ↔ SOC conflation matrix — **pipeline DRAFTED 2026-08-05** (`normalize-title.ts`,
     `aggregate-conflation.ts`, emits `conflation.json`; unit-tested, gated by
     `minConflationTitles`). **Blocked on:** a local `npm run pipeline` with the raw H-1B files to
     produce + commit `conflation.json` (the sandbox has no raw inputs), then the **site UI**
     (a title×SOC matrix) — contract in `docs/superpowers/specs/2026-08-05-title-soc-conflation-design.md`.
  3. O*NET skill-vector similarity per SOC (new small data source)
- **Map zoom/pan to select areas** (user-requested 2026-08-03; browser zoom is the
  accepted workaround for now)
- ~~Deploy target decision~~ — DONE 2026-08-04: GitHub Pages via Actions
  (https://rosstheboss90.github.io/techpay-atlas/). New absolute paths must use the
  `NEXT_PUBLIC_BASE_PATH` prefix pattern in `site/lib/data.ts`.
- Playwright run against the static export (config currently tests `next dev` only)
- Employer-name mojibake repair (DOL double-encoding, ~16 names/quarter, cosmetic)

## Standing notes

- `capped`/`topCodeValue` machinery is live but the May-2025 OEWS vintage emits zero
  top-coded cells for our SOCs (183 cells legitimately exceed $239,200). Site handles
  both; re-check on next annual refresh.
- Annual data refresh: `npm run download` + manual HUD file + `npm run pipeline`.
