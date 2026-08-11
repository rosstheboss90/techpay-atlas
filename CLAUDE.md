# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

TechPay Atlas — what US tech jobs actually pay across 393 metros, 21 roles, and the real job
titles the official statistics erase. An offline TypeScript **pipeline** parses raw public
government files and emits compact JSON; a Next.js **static-export site** renders it with D3.
No backend, no tracking, nothing to run in production — the site is plain files on GitHub Pages.

Live: https://rosstheboss90.github.io/techpay-atlas/

## Commands

Two npm packages: the pipeline at the repo root, the site under `site/`. Node ≥ 22 (the site's
jsdom/undici test stack needs it; CI pins 22).

```bash
# --- Pipeline (repo root) ---
npm run download        # fetch raw government files into data/raw/ (gitignored)
npm run pipeline        # parse + validate + emit JSON to site/public/data/ (needs data/raw/)
npm test                # vitest — pipeline unit tests

# --- Site (cd site) ---
npm ci                  # install (uses site/package-lock.json)
npm run dev             # next dev on http://localhost:3020
npm run build           # static export to site/out/ (set NEXT_PUBLIC_BASE_PATH for Pages)
npm test                # vitest — component + lib tests
npm run e2e             # Playwright end-to-end
```

The pipeline needs raw inputs that are **not** committed (see Data refresh). The site ships the
already-emitted JSON under `site/public/data/`, so the site builds and tests without ever
running the pipeline.

## Architecture

### Pipeline (`pipeline/`)

Pure functions in `lib/` (each independently unit-tested), orchestrated by `run.ts`. Streaming
readers — the LCA workbooks are large enough to break most xlsx libraries.

| File | Responsibility |
|---|---|
| `config.ts` | Paths (`RAW_DIR`, `OUT_DIR`, `REPORT_DIR`) and `THRESHOLDS` — the data-quality tripwires |
| `download.ts` | Fetch the public source files into `data/raw/` (`npm run download`) |
| `loaders.ts` | `readSheetRows` / `readLcaRows` / `readDelimitedRows` — streaming xlsx/csv readers |
| `lib/parse-oews.ts` | BLS OEWS wage percentiles by occupation × metro |
| `lib/parse-rpp.ts` | BEA Regional Price Parities (cost-of-living index) |
| `lib/parse-gazetteer.ts` | Census Gazetteer metro coordinates |
| `lib/crosswalk.ts` | HUD ZIP→CBSA crosswalk (assigns LCA worksites to metros) |
| `lib/parse-lca.ts` | DOL H-1B LCA disclosures → certified full-time records |
| `lib/aggregate.ts` | `attachCbsa` (ZIP join) + `aggregateEmployers` (per-metro employer bundles) |
| `lib/aggregate-titles.ts` | Title-lens aggregation: per-bucket national/metro/tier stats, SOC mix, top employers |
| `lib/titles.ts` | Title-bucket registry (`FAMILIES`, `bucketFor`) and the seniority parser (`parseSeniority`) |
| `lib/soc.ts` | Target SOC set — the 21 in-registry occupations |
| `lib/num.ts` | Cell/number coercion helpers |
| `lib/emit.ts` | Build the emitted JSON shapes (`buildMeta`/`buildSalaries`/`buildEmployerFiles`/`buildTitles`) |
| `run.ts` | Orchestrator: load → dedupe → join → aggregate → assert tripwires → emit → write run report |

### Site (`site/`)

Next.js static export (App Router) with D3. No framework state library; URL is the state.

| Path | Responsibility |
|---|---|
| `app/page.tsx` | Composition root — filter bar, map, panel, title lens; owns selected role/metro/adjust |
| `app/layout.tsx`, `app/globals.css` | Shell + theme tokens (light/dark via `prefers-color-scheme`) |
| `components/SalaryMap.tsx` | Metro bubble map (Albers USA), COL-adjust recolor, keyboard-accessible bubbles |
| `components/MetroPanel.tsx` | Metro drill-down — percentile bands + real H-1B employer bundles (lazy-fetched) |
| `components/TitleLens.tsx` / `TitleBucketRow.tsx` | Title lens: pay by real job title, seniority ladder, SOC conflation bar, top employers |
| `components/FilterBar.tsx`, `PercentileBand.tsx` | Role/adjust controls; shared band primitive |
| `lib/data.ts` | Fetch helpers for the emitted JSON (honors `NEXT_PUBLIC_BASE_PATH`) |
| `lib/derive.ts`, `map-scales.ts`, `format.ts` | COL adjustment, color/size scales, USD/number formatting |
| `lib/types.ts`, `title-types.ts` | The emitted-data contracts, mirrored from the pipeline |
| `lib/url-state.ts` | Serialize selection to/from query params (preserves unknown params) |

### Emitted data contract (`site/public/data/`, committed)

| File | Contents |
|---|---|
| `meta.json` | Metros (coords, RPP, `lcaFilings`), roles, vintages, `sources.zipMatchRate` |
| `salaries.json` | Wage percentiles per metro × role |
| `employers/{cbsa}.json` | Top H-1B employers + beeswarm sample; lazy-loaded on metro click (only when `lcaFilings > 0`) |
| `titles.json` | Title families → buckets (national/metro/tier stats, SOC mix, top employers) |

## Data

Sources (all public government data):

| Source | Provides | Vintage |
|---|---|---|
| BLS OEWS | Wage percentiles by occupation × metro | May 2025 |
| DOL H-1B LCA disclosures | Employer, title, wage, worksite | FY2025 Q1–Q4 |
| BEA Regional Price Parities | Metro cost-of-living index | 2024 |
| HUD ZIP–CBSA crosswalk | Worksite ZIP → metro | 2026 Q1 |
| Census Gazetteer | Metro coordinates | 2025 |

Flow: `data/raw/*` (gitignored) → `npm run pipeline` (parse → validate → emit) →
`site/public/data/*.json` (committed) → site fetches at runtime. No backend.

Annual refresh: `npm run download` + one manual HUD download, then `npm run pipeline`.
See `docs/BACKLOG.md` "Standing notes" for vintage-specific gotchas.

⚠️ **Read `docs/REFRESH.md` before touching `bls.gov` or `dol.gov` — including a single probe.**
Both sit behind Akamai, which 403s automated requests after a modest rate and stays blocked for
an hour-plus, taking `npm run download` down with it. Two traps that cost real time: `curl -I`
(HEAD) is refused outright (use a ranged GET), and **the 403 is returned for every URL — files
that exist and files that cannot possibly exist** — so an availability check that treats only
`200` as "published" reports "nothing new" while actually being blocked. Any such check needs
three outcomes: `200/206` published · `404` not yet · anything else **inconclusive, and
inconclusive must be surfaced**. `api.bls.gov` is a separate host and is not blocked, but it
serves only the current reference period, so it cannot replace the OEWS file downloads.

## Development practices

- **Tests live next to what they cover** and gate every change: `pipeline/tests/*.test.ts`
  and `site/tests/*`. Run the relevant `npm test` (and `npm run e2e` for site UI changes)
  before committing. Pure `lib/` functions are unit-tested in isolation; keep them pure.
- **The pipeline fails loudly, never silently.** `THRESHOLDS` in `pipeline/config.ts` are
  tripwires (metro count, ZIP-match rate, title-family overlap, RPP coverage, …). Stale output
  is deleted only **after** every assertion passes — a failed run never destroys the last good
  emit. When adding a data path, add or adjust the matching tripwire.
- **Refactors must be output-neutral unless the data logic changed.** After a pipeline change,
  regenerate and `git diff --stat site/public/data`: only `meta.json`'s `generated` timestamp
  should move. Any other diff means a behavior change — verify it's intended before committing.
- **Honesty rules are design invariants, not preferences.** Suppressed cells stay suppressed;
  small samples are *labeled* (e.g. the title lens "thin sample" chip), never hidden; H-1B wage
  floors given as ranges are midpointed and say so; every number cites its source vintage in the
  footer. Don't add a display that launders uncertainty away.
- **Raw inputs are gitignored; emitted JSON is committed.** Never commit `data/raw/`. The
  committed JSON under `site/public/data/` is the site's only data dependency.
- **Absolute site paths must honor the base path.** GitHub Pages serves under a subpath, so new
  absolute asset/data URLs go through the `NEXT_PUBLIC_BASE_PATH` prefix pattern in `lib/data.ts`.
- **Theme both modes.** Style light and dark via `prefers-color-scheme`; verify both.

## Workflow

- **Design before code for non-trivial features.** Specs and plans live under
  `docs/superpowers/specs/` and `docs/superpowers/plans/` (spec → plan → implement). Decisions
  and the running backlog are in `docs/BACKLOG.md`, newest first.
- **Branch → PR → merge.** Develop on a feature branch, open a PR against `main`. Merging to
  `main` triggers the Pages deploy (`.github/workflows/deploy.yml`, which runs `npm ci` +
  `npm run build` in `site/`). Keep commits scoped with conventional-commit prefixes
  (`feat`/`fix`/`data`/`docs`/`test`/`chore`), matching the existing history.
- ⚠️ **The deploy workflow runs NO tests, and nothing gates it.** `deploy.yml` and `ci.yml` both
  trigger on push to `main` and run **concurrently** — CI cannot block the deploy, it only tells
  you afterwards. So a direct push ships whatever it contains and *then* reports whether it was
  broken, and even a docs-only push triggers a Pages rebuild. The branch → PR shape above is a
  safety requirement, not a preference: push the branch (no deploy), open the PR, wait for **all
  three** checks, then merge. `ci.yml` gates eslint as well as tests, and tsc runs with
  `noUnusedLocals` / `noUnusedParameters`.
  - Verified 2026-08-07 against the workflow files and a live run. ⚠️ Do **not** restate this as
    *"`ci.yml` only gates PRs"* — that wording is wrong (it also runs on push, re-verifying main
    after merge) and it appears in `watch-sources.yml`'s header comment, which is where it keeps
    getting copied from. The correct distinction is **gating vs reporting**, not PR vs push.
- ⚠️ **Unpushed commits on `main` accumulate here on purpose.** Because pushing deploys, local
  work sits until it is deliberately shipped. Never push to "clean up" an ahead count, and
  never assume unpushed means forgotten.
- ⚠️ **The local clone drifts in BOTH directions — use `git status -sb`, never a behind-only
  count.** `git rev-list --count HEAD..origin/main` measures only *behind*: on 2026-08-06 local
  main was 0 behind and 1 ahead, which a behind-only check calls "up to date". Features also
  land from the Claude cloud environment, so the local tree can be far behind (37 commits on
  2026-08-05, four whole sections missing) — judging the site from the local tree, or from
  `site/e2e-scratch/*.png`, can mean judging a months-old app. That folder is gitignored
  scratch, not a record of current state.
- ⚠️ **Two sessions share this main checkout.** Run `git branch --show-current` before any
  `checkout`, `pull`, or `reset` — on 2026-08-07 a session moved the tree off another session's
  branch by assuming it was on `main`. Scope every commit with a pathspec on **both** `git add`
  and `git commit -- <paths>` so a parallel session's dirty files are never swept in. For
  anything beyond a read, prefer a worktree (`.worktrees/` is gitignored as of `f279f52`).
- **Worktrees need real setup.** `data/raw` is gitignored (~0.47 GB) — junction it to the main
  clone's copy rather than re-downloading (see the Akamai warning above). Run a real `npm ci`
  in both the root and `site/`: junctioned `node_modules` is the documented cause of Next build
  failures on this box. With real installs, `next build` works fine in a worktree.
  - **Worktree teardown order** (bit twice on 2026-08-11): kill any `next dev` running in the
    worktree AND `cd` every shell out of it BEFORE `git worktree remove`/`rm` — a live dev
    server or a shell's cwd pins the directory ("Device or resource busy"), and Windows can
    lag a few seconds releasing handles after the kill.

### Design-doc house style

Specs and plans follow a consistent template (shared across these projects — match it so new
docs read like the existing ones under `docs/superpowers/`):

- **Spec** (`specs/YYYY-MM-DD-<feature>-design.md`): a header line with **Date** and **Status**
  (`Draft for review` → `Approved`), then **Purpose** → **Decisions** (what was chosen, and
  why) → **Architecture** → **Data sources & joins** → **UI** → **Error handling** → **Testing**
  → **Out of scope**. Enumerate edge cases and error handling as tables. Always state what is
  explicitly *not* in scope.
- **Plan** (`plans/YYYY-MM-DD-<feature>.md`): a one-line **Goal**, a **File Map**, then numbered
  **Tasks** ordered *tests-first* (a test/fixture task precedes the implementation it covers),
  closing with a **Done criteria** / final test-run-and-push task. Prefer additive changes and
  say so ("purely additive — existing X unchanged").

These conventions are the project-agnostic ones shared across sibling projects; the portable
version (what transfers between projects, and what must be rewritten per project) lives in
`docs/PROJECT-STANDARDS.md`.
