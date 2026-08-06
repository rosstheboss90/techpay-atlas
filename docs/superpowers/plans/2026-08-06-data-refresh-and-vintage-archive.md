# Data Refresh & Vintage Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the data pipeline non-destructive and refreshable from one config file, and build the committed longitudinal archive that `/trends` will consume.

**Architecture:** A new `pipeline/vintages.ts` becomes the single source of truth for which vintage of each upstream source is current. `download.ts` splits into a thin executable plus a side-effect-free library so the test suite stops executing the downloader. Three latent defects (T1/T2/T3 from the spec) are fixed. A new lightweight entry point `archive-nat.ts` writes append-only per-vintage files to `data/history/`, independent of the heavy MSA/LCA pipeline.

**Tech Stack:** TypeScript (ESM, `"type": "module"`), tsx, vitest 4, SheetJS (`xlsx`), csv-parse. Node 22.

**Spec:** `docs/superpowers/specs/2026-08-06-trends-and-data-refresh-design.md`

**Scope:** This plan is the spec's §1 data layer only. `/trends` Phase A is a separate plan, written after this one lands — its test values depend on boundary years this plan discovers (Task 9).

---

## Conventions

- **Commit trailers.** Every commit in this repo ends with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  ```
  Shown once here; append it to every commit message below.
- **Do not push.** Pushing `main` auto-deploys without tests (`deploy.yml` is ungated). Commit locally; the user decides when to push. Local `main` is already 2 commits ahead of `origin`.
- **Never touch `.env` or secrets.** Not applicable here — this repo has none — but do not add any.
- **Run tests from the repo root:** `npm test` (vitest, `pipeline/tests/**/*.test.ts` only).

## File Structure

| File | Responsibility |
|---|---|
| `pipeline/vintages.ts` | **New.** Which vintage is current, per source. National year list. Per-year top-code table. No I/O. |
| `pipeline/lib/download-lib.ts` | **New.** Pure helpers + `runDownloads()`. No top-level side effects. |
| `pipeline/download.ts` | **Rewritten thin.** Builds `SOURCES` from `vintages.ts`, calls `runDownloads()`. The only file with download side effects. |
| `pipeline/lib/num.ts` | `makeCell(topCode)` factory (T2). `TOP_CODE`/`cell` retained as current-vintage defaults. |
| `pipeline/lib/parse-oews.ts` | Accepts an injected cell function. Otherwise unchanged. |
| `pipeline/lib/parse-oews-nat.ts` | **New.** National-file parse path (T3). |
| `pipeline/lib/parse-cpi.ts` | **New.** BLS CU flat file → May index by year. |
| `pipeline/lib/history.ts` | **New.** Archive paths, append-only guard, cross-vintage plausibility check. |
| `pipeline/archive-nat.ts` | **New entry point.** `npm run archive:nat`. Writes `data/history/`. |
| `pipeline/archive-verify.ts` | **New entry point.** `npm run archive:verify`. Cross-vintage tripwire. |
| `.github/workflows/watch-sources.yml` | **New.** Monthly HEAD probe → issue. |
| `docs/REFRESH.md` | **New.** Runbook. |

`archive-nat.ts` is separate from `run.ts` because `run.ts` executes its entire body on import, needs `--max-old-space-size=6144`, and walks the LCA path. Backfilling national vintages must not require the MSA or LCA files to be present.

---

### Task 1: Stop the test suite from executing the downloader

`pipeline/tests/download.test.ts` imports `../download`, whose top-level `for` loop runs on import. On a fresh CI checkout `data/raw/` is empty, so `npm test` attempts every real download. Vitest v4 swallows module-level `console.log`, which is why this has been invisible.

**Files:**
- Create: `pipeline/lib/download-lib.ts`
- Modify: `pipeline/download.ts` (full rewrite, 12 lines)
- Modify: `pipeline/tests/download.test.ts:2` (import path only)

- [ ] **Step 1: Create the side-effect-free library**

Create `pipeline/lib/download-lib.ts`. This is a move of `download.ts`'s logic with **no behaviour change** — the marker semantics change in Task 3, not here.

```ts
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline as streamPipeline } from 'node:stream/promises'
import path from 'node:path'
import AdmZip from 'adm-zip'

const UA = 'techpay-atlas research pipeline (personal project)' // BLS 403s default fetch agents

export interface Source { name: string; urls: string[]; unzip?: boolean; required: boolean }

/** True when a buffer starts with the zip local-file-header signature `PK\x03\x04`. Some sites
 *  (e.g. a WAF challenge or an error page) answer a 2xx with HTML/JSON instead of the real file
 *  -- this catches that before it's treated as a valid archive. */
export function looksLikeZip(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04
}

/** A `.done` marker holds the basename of the file it downloaded. If that file has since been
 *  deleted from data/raw (manual cleanup, disk pressure), the marker is stale -- self-heal by
 *  treating the source as not-yet-downloaded rather than skipping it forever. */
export function markerTargetExists(markerContent: string, rawFiles: ReadonlySet<string>): boolean {
  const basename = markerContent.trim()
  return basename.length > 0 && rawFiles.has(basename)
}

const isZipOrXlsx = (file: string) => /\.(zip|xlsx)$/i.test(file)

export async function fetchTo(url: string, dest: string): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    // Some sites (e.g. huduser.gov's WAF) answer non-browser requests with a 2xx
    // "challenge" response and Content-Length: 0 instead of a normal 4xx/redirect —
    // res.ok alone would treat that as a successful download of an empty file.
    if (!res.ok || !res.body || res.headers.get('content-length') === '0') {
      console.warn(`  ${res.status} ${url}`)
      return false
    }
    await streamPipeline(Readable.fromWeb(res.body as never), createWriteStream(dest))
    if (isZipOrXlsx(dest)) {
      const buf = Buffer.alloc(4)
      const fh = await open(dest, 'r')
      try { await fh.read(buf, 0, 4, 0) } finally { await fh.close() }
      if (!looksLikeZip(buf)) {
        unlinkSync(dest)
        console.warn(`  WAF challenge or error page returned: ${url}`)
        return false
      }
    }
    return true
  } catch (e) { console.warn(`  ${(e as Error).message} ${url}`); return false }
}

/** Downloads every source that is not already satisfied by a marker. Returns the count of
 *  missing REQUIRED sources (0 = success), for the caller to use as an exit code. */
export async function runDownloads(sources: readonly Source[], rawDir: string): Promise<number> {
  mkdirSync(rawDir, { recursive: true })
  let missingRequired = 0
  for (const src of sources) {
    const marker = path.join(rawDir, `${src.name}.done`)
    if (existsSync(marker) && markerTargetExists(readFileSync(marker, 'utf8'), new Set(readdirSync(rawDir)))) {
      console.log(`skip ${src.name} (already downloaded)`)
      continue
    }
    let got: string | null = null
    for (const url of src.urls) {
      const dest = path.join(rawDir, path.basename(url))
      console.log(`fetch ${url}`)
      if (await fetchTo(url, dest)) { got = dest; break }
    }
    if (!got) {
      console.warn(`FAILED: ${src.name}${src.required ? ' (required — download manually into data/raw/)' : ''}`)
      if (src.required) missingRequired++
      continue
    }
    if (src.unzip) new AdmZip(got).extractAllTo(rawDir, true)
    writeFileSync(marker, path.basename(got))
  }
  console.log(missingRequired ? `${missingRequired} required source(s) missing` : 'all required sources present')
  return missingRequired
}
```

- [ ] **Step 2: Rewrite `pipeline/download.ts` as a thin executable**

Replace the **entire** contents of `pipeline/download.ts` with:

```ts
// Executable entry point for `npm run download`. All logic lives in lib/download-lib.ts so that
// importing it from a test does NOT trigger real network downloads — this file is the only one
// with side effects, and nothing imports it.
import { RAW_DIR } from './config'
import { runDownloads, type Source } from './lib/download-lib'

const SOURCES: Source[] = [
  { name: 'oews', required: true, unzip: true, urls: [
    'https://www.bls.gov/oes/special-requests/oesm25ma.zip',   // May 2025 (preferred)
    'https://www.bls.gov/oes/special-requests/oesm24ma.zip',   // May 2024 fallback
  ]},
  { name: 'rpp', required: true, unzip: true, urls: ['https://apps.bea.gov/regional/zip/MARPP.zip'] },
  { name: 'gazetteer', required: true, unzip: true, urls: [
    'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_cbsa_national.zip', // note capital "Gaz" -- census.gov's own URL casing, lowercase 404s
    'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_cbsa_national.zip',
  ]},
  { name: 'hud', required: true, urls: [
    'https://www.huduser.gov/portal/datasets/usps/ZIP_CBSA_032026.xlsx',
    'https://www.huduser.gov/portal/datasets/usps/ZIP_CBSA_122025.xlsx',
  ]},
  // LCA quarters: individually optional; Task 11 requires >= 2 files present overall.
  ...[1, 2, 3, 4].map(q => ({
    name: `lca-fy2025-q${q}`, required: false, urls: [
      `https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/LCA_Disclosure_Data_FY2025_Q${q}.xlsx`,
    ],
  })),
]

process.exitCode = await runDownloads(SOURCES, RAW_DIR)
```

(Task 8 replaces this hardcoded `SOURCES` array with one built from `vintages.ts`. Keeping it verbatim here means Task 1 is a pure refactor with zero behaviour change, so a test failure here can only mean the move broke something.)

- [ ] **Step 3: Repoint the existing test at the library**

In `pipeline/tests/download.test.ts`, change line 2 only:

```ts
import { looksLikeZip, markerTargetExists } from '../lib/download-lib'
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS, all existing tests green (8 in `download.test.ts`). No network access occurs.

- [ ] **Step 5: Verify no test imports the executable**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `grep -rn "from '\.\./download'" pipeline/tests/`
Expected: **no output.** If anything matches, that test still executes the downloader — repoint it.

- [ ] **Step 6: Commit**

```bash
git add pipeline/lib/download-lib.ts pipeline/download.ts pipeline/tests/download.test.ts
git commit -m "refactor(pipeline): split download.ts so tests stop running the downloader

download.ts executed its whole loop at module level, and download.test.ts
imported it — so on a fresh checkout (CI, where data/raw is empty) `npm test`
attempted every real download. Vitest v4 swallows module-level console output,
which is why this was invisible.

Logic moves to lib/download-lib.ts with no behaviour change; download.ts is now
a thin entry point that nothing imports." -- pipeline/lib/download-lib.ts pipeline/download.ts pipeline/tests/download.test.ts
```

---

### Task 2: `vintages.ts` — one place that knows which year

**Files:**
- Create: `pipeline/vintages.ts`
- Test: `pipeline/tests/vintages.test.ts`

- [ ] **Step 1: Write the failing test**

Create `pipeline/tests/vintages.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { OEWS_NAT_YEARS, topCodeForYear, VINTAGES } from '../vintages'

describe('VINTAGES', () => {
  it('names the current vintage of every source the pipeline downloads', () => {
    expect(VINTAGES.oewsYear).toBeGreaterThanOrEqual(2025)
    expect(VINTAGES.lcaFiscalYear).toBeGreaterThanOrEqual(2025)
    expect(VINTAGES.gazetteerYear).toBeGreaterThanOrEqual(2025)
    expect(VINTAGES.hudStamp).toMatch(/^\d{6}$/) // MMYYYY
  })
})

describe('OEWS_NAT_YEARS', () => {
  it('covers the spec window May 2019 -> the current OEWS vintage, with no gaps', () => {
    expect(OEWS_NAT_YEARS[0]).toBe(2019)
    expect(OEWS_NAT_YEARS[OEWS_NAT_YEARS.length - 1]).toBe(VINTAGES.oewsYear)
    for (let i = 1; i < OEWS_NAT_YEARS.length; i++) {
      expect(OEWS_NAT_YEARS[i] - OEWS_NAT_YEARS[i - 1]).toBe(1)
    }
  })
})

describe('topCodeForYear', () => {
  it('returns a top code for every archived vintage', () => {
    for (const y of OEWS_NAT_YEARS) expect(topCodeForYear(y)).toBeGreaterThan(0)
  })
  it('throws for a vintage with no recorded top code rather than guessing', () => {
    expect(() => topCodeForYear(1999)).toThrow(/no OEWS top code recorded for vintage 1999/)
  })
  it('never silently reuses the current top code for an older vintage', () => {
    // Regression guard for T2: parsing a 2019 file with 2025's $239,200 rewrites that year's
    // censored cells upward and manufactures a real-terms decline at the top end.
    expect(topCodeForYear(2019)).toBeLessThan(topCodeForYear(VINTAGES.oewsYear))
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run pipeline/tests/vintages.test.ts`
Expected: FAIL — `Failed to resolve import "../vintages"`.

- [ ] **Step 3: Create `pipeline/vintages.ts`**

```ts
/** Single source of truth for which vintage of each upstream source is current.
 *  Bumping a data refresh should be an edit to THIS FILE and nothing else.
 *  See docs/REFRESH.md for the runbook. */
export const VINTAGES = {
  /** OEWS reference year — the "May <year>" release. Drives both the MSA and national files. */
  oewsYear: 2025,
  /** Previous OEWS year, used as a download fallback when the current year has not published. */
  oewsFallbackYear: 2024,
  /** DOL LCA disclosure fiscal year (quarters Q1–Q4 of this FY). */
  lcaFiscalYear: 2025,
  /** Census Gazetteer vintage year. */
  gazetteerYear: 2025,
  /** Previous Gazetteer year, download fallback. */
  gazetteerFallbackYear: 2024,
  /** HUD ZIP–CBSA crosswalk stamp, MMYYYY as HUD's own filenames encode it. */
  hudStamp: '032026',
  /** Previous HUD stamp, download fallback. */
  hudFallbackStamp: '122025',
} as const

/** National OEWS vintages archived for the /trends time series.
 *  Spec Decision 1: the window is May 2019 -> current. */
export const OEWS_NAT_YEARS: readonly number[] =
  Array.from({ length: VINTAGES.oewsYear - 2019 + 1 }, (_, i) => 2019 + i)

/** BLS substitutes `#` for a percentile wage at or above its annual top code, and that
 *  threshold is VINTAGE-SPECIFIC. Reading an old file with the current constant silently
 *  rewrites that year's censored cells (spec trap T2).
 *
 *  ⚠️ VERIFY THESE AGAINST THE DOWNLOADED FILES — Task 9 of the implementation plan does this.
 *  The values below are the expected shape ($208,000 early, $239,200 later); the year at which
 *  the threshold changed has NOT been confirmed against BLS's technical notes. */
const OEWS_TOP_CODE_BY_YEAR: Readonly<Record<number, number>> = {
  2019: 208_000,
  2020: 208_000,
  2021: 208_000,
  2022: 208_000,
  2023: 239_200, // ⚠️ UNVERIFIED boundary — see Task 9
  2024: 239_200,
  2025: 239_200,
}

/** Throws rather than defaulting: an unrecorded vintage must fail loudly, never silently
 *  inherit another year's ceiling. */
export function topCodeForYear(year: number): number {
  const v = OEWS_TOP_CODE_BY_YEAR[year]
  if (v === undefined) throw new Error(`no OEWS top code recorded for vintage ${year} — add it to pipeline/vintages.ts`)
  return v
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run pipeline/tests/vintages.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add pipeline/vintages.ts pipeline/tests/vintages.test.ts
git commit -m "feat(pipeline): vintages.ts as the single source of truth for source vintages

Includes the per-year OEWS top-code table (spec trap T2). The boundary year is
marked UNVERIFIED and is confirmed against the real files in a later task." -- pipeline/vintages.ts pipeline/tests/vintages.test.ts
```

---

### Task 3: T1 — URL-keyed `.done` markers

Markers are keyed by basename, so bumping a vintage URL while the old file is still on disk makes the run print `skip` and change nothing.

**Files:**
- Modify: `pipeline/lib/download-lib.ts` (replace `markerTargetExists` with `markerIsCurrent`; update marker write)
- Modify: `pipeline/tests/download.test.ts` (replace the `markerTargetExists` describe block)

- [ ] **Step 1: Write the failing test**

In `pipeline/tests/download.test.ts`, **replace** the entire `describe('markerTargetExists', ...)` block with:

```ts
describe('markerIsCurrent', () => {
  const rawFiles = new Set(['oesm25ma.zip', 'ZIP_CBSA_032026.xlsx'])
  const urls25 = ['https://www.bls.gov/oes/special-requests/oesm25ma.zip']
  const urls26 = ['https://www.bls.gov/oes/special-requests/oesm26ma.zip']
  const marker25 = 'https://www.bls.gov/oes/special-requests/oesm25ma.zip\noesm25ma.zip'

  it('is true when the marker URL is still configured and its file is present', () => {
    expect(markerIsCurrent(marker25, urls25, rawFiles)).toBe(true)
  })

  it('is FALSE when the configured URL changed — a vintage bump must re-download (T1)', () => {
    // The old file is still on disk; a basename-only check would wrongly report "already downloaded".
    expect(markerIsCurrent(marker25, urls26, rawFiles)).toBe(false)
  })

  it('is true when the marker URL is a configured fallback rather than the preferred URL', () => {
    expect(markerIsCurrent(marker25, [...urls26, ...urls25], rawFiles)).toBe(true)
  })

  it('is false when the marker names a file that no longer exists (self-heal: re-download)', () => {
    expect(markerIsCurrent(marker25, urls25, new Set(['ZIP_CBSA_032026.xlsx']))).toBe(false)
  })

  it('migrates a legacy basename-only marker without forcing a re-download', () => {
    expect(markerIsCurrent('oesm25ma.zip', urls25, rawFiles)).toBe(true)
  })

  it('invalidates a legacy basename-only marker when the configured vintage moved on', () => {
    expect(markerIsCurrent('oesm25ma.zip', urls26, rawFiles)).toBe(false)
  })

  it('is false for empty/blank marker content', () => {
    expect(markerIsCurrent('', urls25, rawFiles)).toBe(false)
    expect(markerIsCurrent('   ', urls25, rawFiles)).toBe(false)
  })

  it('tolerates incidental whitespace around the recorded lines', () => {
    expect(markerIsCurrent(`  ${urls25[0]}  \n  oesm25ma.zip \n`, urls25, rawFiles)).toBe(true)
  })
})
```

Update the import on line 2 to:

```ts
import { looksLikeZip, markerIsCurrent } from '../lib/download-lib'
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run pipeline/tests/download.test.ts`
Expected: FAIL — `markerIsCurrent` is not exported.

- [ ] **Step 3: Implement in `pipeline/lib/download-lib.ts`**

Delete `markerTargetExists` entirely and add:

```ts
/** A `.done` marker records two lines: the URL it downloaded from, then that file's basename.
 *
 *  Keying on the URL rather than the basename is what makes a vintage bump invalidate the marker
 *  (spec trap T1). With basename-only markers, changing the configured URL to a new year while the
 *  previous year's file was still in data/raw produced `skip <source> (already downloaded)` — a
 *  "successful" refresh that downloaded nothing.
 *
 *  Current iff the recorded URL is still one of the configured URLs (membership, not position, so
 *  keeping last year's URL as a fallback doesn't force a re-download) AND the file it named is
 *  still present.
 *
 *  Legacy single-line markers are accepted when their basename matches what a configured URL would
 *  produce, so the first run after this change migrates in place instead of re-downloading ~478MB. */
export function markerIsCurrent(
  markerContent: string,
  configuredUrls: readonly string[],
  rawFiles: ReadonlySet<string>,
): boolean {
  const lines = markerContent.split('\n').map(s => s.trim()).filter(Boolean)
  if (lines.length === 0) return false
  if (lines.length === 1) {
    const basename = lines[0]
    return configuredUrls.some(u => path.basename(u) === basename) && rawFiles.has(basename)
  }
  const [url, basename] = lines
  return configuredUrls.includes(url) && rawFiles.has(basename)
}
```

In `runDownloads`, change the marker check and the marker write:

```ts
    if (existsSync(marker) && markerIsCurrent(readFileSync(marker, 'utf8'), src.urls, new Set(readdirSync(rawDir)))) {
```

and, tracking which URL actually succeeded:

```ts
    let got: string | null = null
    let gotUrl: string | null = null
    for (const url of src.urls) {
      const dest = path.join(rawDir, path.basename(url))
      console.log(`fetch ${url}`)
      if (await fetchTo(url, dest)) { got = dest; gotUrl = url; break }
    }
```

and:

```ts
    if (src.unzip) new AdmZip(got).extractAllTo(rawDir, true)
    writeFileSync(marker, `${gotUrl}\n${path.basename(got)}`)
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS. `download.test.ts` now has 12 tests (4 `looksLikeZip` + 8 `markerIsCurrent`).

- [ ] **Step 5: Commit**

```bash
git add pipeline/lib/download-lib.ts pipeline/tests/download.test.ts
git commit -m "fix(pipeline): key .done markers on URL, not basename (T1)

Bumping a vintage URL while the previous file was still in data/raw printed
'skip (already downloaded)' and refreshed nothing. Markers now record the URL
they fetched from; a configured-URL change invalidates. Legacy basename-only
markers migrate in place rather than forcing a full re-download." -- pipeline/lib/download-lib.ts pipeline/tests/download.test.ts
```

---

### Task 4: T2 — vintage-keyed top code

**Files:**
- Modify: `pipeline/lib/num.ts`
- Modify: `pipeline/lib/parse-oews.ts:30-32` (accept an injected cell function)
- Test: `pipeline/tests/num.test.ts` (create if absent; otherwise append)

- [ ] **Step 1: Write the failing test**

Create or append to `pipeline/tests/num.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { cell, makeCell, TOP_CODE } from '../lib/num'

describe('makeCell', () => {
  it('substitutes the vintage top code for a `#` cell, not the current constant (T2)', () => {
    const cell2019 = makeCell(208_000)
    expect(cell2019('#')).toEqual({ value: 208_000, capped: true })
  })

  it('does not leak the current top code into an older vintage', () => {
    const cell2019 = makeCell(208_000)
    expect(cell2019('#').value).not.toBe(TOP_CODE)
  })

  it('leaves non-top-coded cells to num() unchanged', () => {
    const cell2019 = makeCell(208_000)
    expect(cell2019('$133,080')).toEqual({ value: 133_080, capped: false })
    expect(cell2019('*')).toEqual({ value: null, capped: false })
  })

  it('the default `cell` export still uses the current vintage top code', () => {
    expect(cell('#')).toEqual({ value: TOP_CODE, capped: true })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run pipeline/tests/num.test.ts`
Expected: FAIL — `makeCell` is not exported.

- [ ] **Step 3: Implement in `pipeline/lib/num.ts`**

Replace the existing `TOP_CODE` + `cell` block (lines 16-27) with:

```ts
/** Substitution value OEWS writes into a `#` cell instead of the true percentile wage (its
 *  top-coding threshold) for the CURRENT vintage. This is NOT a ceiling on emitted data: only
 *  percentile cells that were literally `#` in the source get this value, so nothing downstream
 *  should assume no emitted number exceeds TOP_CODE.
 *
 *  For any vintage other than the current one, use makeCell(topCodeForYear(year)) — the threshold
 *  changes between releases, and reading an old file with this constant rewrites that year's
 *  censored cells upward (spec trap T2). */
export const TOP_CODE = 239_200

/** Builds a cell reader bound to one vintage's top code. Like num(), but recognizes '#' as a
 *  top-code (>= topCode) rather than suppression. */
export function makeCell(topCode: number) {
  return function cell(v: unknown): { value: number | null; capped: boolean } {
    const s = String(v ?? '').replace(/[$,]/g, '').trim()
    if (s === '#') return { value: topCode, capped: true }
    return { value: num(v), capped: false }
  }
}

/** Current-vintage cell reader. Retained so existing callers are unchanged. */
export const cell = makeCell(TOP_CODE)
```

`num.ts` must not import `vintages.ts` — keep it dependency-free; callers pass the number in.

- [ ] **Step 4: Let `parseOews` accept an injected cell function**

In `pipeline/lib/parse-oews.ts`, change the import on line 2 and the signature on line 30:

```ts
import { cell as currentCell, num } from './num'
```

```ts
export function parseOews(
  rows: Record<string, unknown>[],
  cell: (v: unknown) => { value: number | null; capped: boolean } = currentCell,
):
  { records: SalaryRecord[]; areas: Map<string, { name: string; state: string }> } {
```

The body is unchanged — it already calls `cell(...)`, which now resolves to the parameter.

- [ ] **Step 5: Run the full suite**

Run: `npm test && npx tsc --noEmit`
Expected: PASS. Existing `parse-oews` tests are unaffected (the default parameter preserves behaviour).

- [ ] **Step 6: Commit**

```bash
git add pipeline/lib/num.ts pipeline/lib/parse-oews.ts pipeline/tests/num.test.ts
git commit -m "fix(pipeline): vintage-keyed OEWS top code (T2)

TOP_CODE was a constant, but BLS's top-coding threshold is vintage-specific.
Parsing an older national file with the current value would rewrite that year's
censored cells upward and manufacture a real-terms decline at the top end.

makeCell(topCode) binds a reader to one vintage; TOP_CODE and cell stay as the
current-vintage defaults so existing callers are untouched." -- pipeline/lib/num.ts pipeline/lib/parse-oews.ts pipeline/tests/num.test.ts
```

---

### Task 5: T3 — the national OEWS parse path

The national file cannot pass `parseOews`: `rowSchema` requires `PRIM_STATE`, and `toCbsa` would pad its `AREA` into a bogus `00099` CBSA. The national file also carries multiple rows per occupation across industry groupings — picking the wrong one silently yields a cross-industry subset.

**This task begins with a discovery step because the file's exact columns and grouping values must be read, not assumed.**

**Files:**
- Create: `pipeline/lib/parse-oews-nat.ts`
- Test: `pipeline/tests/parse-oews-nat.test.ts`

- [ ] **Step 1: Download one national file and read its actual shape**

```bash
mkdir -p data/raw
curl -A 'techpay-atlas research pipeline (personal project)' \
  -o data/raw/oesm25nat.zip \
  https://www.bls.gov/oes/special-requests/oesm25nat.zip
unzip -o data/raw/oesm25nat.zip -d data/raw/
ls -la data/raw/ | grep -i nat
```

Expected: a `.zip` of a few MB extracting to something like `oesm25nat/national_M2025_dl.xlsx`.

If the URL 404s, list what BLS actually publishes and adjust — the naming pattern is the assumption under test here.

- [ ] **Step 2: Print the header and grouping columns**

```bash
npx tsx -e "
import { readSheetRows } from './pipeline/loaders.ts'
const rows = readSheetRows(process.argv[1])
console.log('COLUMNS:', Object.keys(rows[0]).join(', '))
const distinct = (k) => [...new Set(rows.map(r => String(r[k])))].slice(0, 10)
for (const k of ['AREA','AREA_TITLE','NAICS','I_GROUP','OWN_CODE','O_GROUP']) {
  if (k in rows[0]) console.log(k, '->', distinct(k))
}
const swe = rows.filter(r => String(r.OCC_CODE).trim() === '15-1252')
console.log('rows for 15-1252:', swe.length)
console.log(JSON.stringify(swe.slice(0, 3), null, 1))
" data/raw/oesm25nat/national_M2025_dl.xlsx
```

**Record the output in the commit message for Step 6.** Two things must be settled before writing the parser:
1. Which columns exist (specifically: is `PRIM_STATE` absent, and what is `AREA`?).
2. How many rows exist per `OCC_CODE`, and which grouping column identifies the cross-industry / all-ownership total. If `rows for 15-1252` is 1, there is no grouping problem; if it is more than 1, the filter in Step 4 must select the total row.

- [ ] **Step 3: Write the failing test**

Create `pipeline/tests/parse-oews-nat.test.ts`. **Build the fixture rows from the real column names printed in Step 2** — the shape below assumes a single cross-industry row per occupation; if Step 2 showed multiple, add the grouping column to every fixture row and a test asserting only the total row is kept.

```ts
import { describe, expect, it } from 'vitest'
import { parseOewsNational } from '../lib/parse-oews-nat'

const row = (over: Record<string, unknown> = {}) => ({
  AREA: 99, AREA_TITLE: 'U.S.', OCC_CODE: '15-1252', OCC_TITLE: 'Software Developers',
  TOT_EMP: 1656880, A_PCT10: 81440, A_PCT25: 102010, A_MEDIAN: 133080, A_PCT75: 168570, A_PCT90: 208620,
  ...over,
})

describe('parseOewsNational', () => {
  it('keeps only target-registry SOC codes', () => {
    const out = parseOewsNational([row(), row({ OCC_CODE: '29-1141' })], 239_200)
    expect(Object.keys(out)).toEqual(['15-1252'])
  })

  it('reads the percentile band and employment', () => {
    const out = parseOewsNational([row()], 239_200)
    expect(out['15-1252']).toEqual({
      emp: 1656880, p10: 81440, p25: 102010, p50: 133080, p75: 168570, p90: 208620, capped: [],
    })
  })

  it('applies the VINTAGE top code to `#` cells, not the current constant (T2)', () => {
    const out = parseOewsNational([row({ A_PCT90: '#' })], 208_000)
    expect(out['15-1252'].p90).toBe(208_000)
    expect(out['15-1252'].capped).toEqual(['p90'])
  })

  it('never produces a CBSA-shaped key — the national file has no metro geography (T3)', () => {
    const out = parseOewsNational([row()], 239_200)
    expect(Object.keys(out)).not.toContain('00099')
    for (const k of Object.keys(out)) expect(k).toMatch(/^\d{2}-\d{4}$/)
  })

  it('maps suppressed cells to null rather than 0', () => {
    const out = parseOewsNational([row({ A_PCT10: '*', TOT_EMP: '**' })], 239_200)
    expect(out['15-1252'].p10).toBeNull()
    expect(out['15-1252'].emp).toBeNull()
  })

  it('throws when the file contains none of the registry roles (wrong file or schema drift)', () => {
    expect(() => parseOewsNational([row({ OCC_CODE: '29-1141' })], 239_200))
      .toThrow(/no registry SOC codes found/)
  })
})
```

- [ ] **Step 4: Run to verify it fails**

Run: `npx vitest run pipeline/tests/parse-oews-nat.test.ts`
Expected: FAIL — `Failed to resolve import "../lib/parse-oews-nat"`.

- [ ] **Step 5: Implement `pipeline/lib/parse-oews-nat.ts`**

```ts
import { makeCell, num } from './num'
import { SOC_SET } from './soc'
import type { Pct } from './parse-oews'

export interface NationalRoleRecord {
  emp: number | null
  p10: number | null; p25: number | null; p50: number | null; p75: number | null; p90: number | null
  capped: Pct[]
}

/** SOC -> national percentile band for one OEWS vintage.
 *
 *  Deliberately NOT sharing parse-oews.ts's path (spec trap T3): that schema requires PRIM_STATE,
 *  which the national file does not carry, and its toCbsa() would pad the national AREA value into
 *  a bogus "00099" CBSA. Widening the shared schema to admit this file would weaken the MSA path's
 *  guarantees for a file it never sees, so this is a separate reader.
 *
 *  `topCode` is passed per vintage — see makeCell / vintages.topCodeForYear (T2). */
export function parseOewsNational(
  rows: Record<string, unknown>[],
  topCode: number,
): Record<string, NationalRoleRecord> {
  const cell = makeCell(topCode)
  const out: Record<string, NationalRoleRecord> = {}
  for (const raw of rows) {
    const soc = String(raw.OCC_CODE ?? '').trim()
    if (!SOC_SET.has(soc)) continue
    const p10 = cell(raw.A_PCT10), p25 = cell(raw.A_PCT25), p50 = cell(raw.A_MEDIAN)
    const p75 = cell(raw.A_PCT75), p90 = cell(raw.A_PCT90)
    const capped: Pct[] = []
    if (p10.capped) capped.push('p10')
    if (p25.capped) capped.push('p25')
    if (p50.capped) capped.push('p50')
    if (p75.capped) capped.push('p75')
    if (p90.capped) capped.push('p90')
    out[soc] = {
      emp: num(raw.TOT_EMP),
      p10: p10.value, p25: p25.value, p50: p50.value, p75: p75.value, p90: p90.value,
      capped,
    }
  }
  if (Object.keys(out).length === 0) {
    throw new Error('no registry SOC codes found in the national OEWS rows — wrong file, or schema drift in OCC_CODE')
  }
  return out
}
```

If Step 2 showed multiple rows per `OCC_CODE`, add the total-row filter before the `SOC_SET` check, using the exact column and value observed — e.g. `if (String(raw.I_GROUP ?? '').trim() !== 'cross-industry') continue` — and a test asserting a non-total row is excluded.

- [ ] **Step 6: Run to verify it passes, then commit**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

```bash
git add pipeline/lib/parse-oews-nat.ts pipeline/tests/parse-oews-nat.test.ts
git commit -m "feat(pipeline): national OEWS parse path (T3)

The national file has no PRIM_STATE and its AREA would pad into a bogus 00099
CBSA under parse-oews.ts, so this is a separate reader rather than a widened
shared schema. Takes the vintage top code as a parameter (T2).

Observed shape of national_M2025_dl.xlsx:
<paste the COLUMNS / grouping / row-count output from Step 2 here>" -- pipeline/lib/parse-oews-nat.ts pipeline/tests/parse-oews-nat.test.ts
```

---

### Task 6: CPI-U parser

**Files:**
- Create: `pipeline/lib/parse-cpi.ts`
- Test: `pipeline/tests/parse-cpi.test.ts`

- [ ] **Step 1: Confirm the BLS flat file and its shape**

```bash
curl -A 'techpay-atlas research pipeline (personal project)' -s \
  https://download.bls.gov/pub/time.series/cu/cu.data.1.AllItems | head -5
```

Expected: a tab-delimited header `series_id	year	period	value	footnote_codes` followed by data rows. BLS pads `series_id` with trailing spaces — the parser must trim.

If that path 404s, list the directory and pick the all-items file:

```bash
curl -A 'techpay-atlas research pipeline (personal project)' -s \
  https://download.bls.gov/pub/time.series/cu/ | grep -o 'cu\.data\.[0-9A-Za-z.]*'
```

Record the confirmed URL — it goes into `vintages.ts` usage in Task 8.

- [ ] **Step 2: Write the failing test**

Create `pipeline/tests/parse-cpi.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseCpiMayByYear } from '../lib/parse-cpi'

// Shape mirrors BLS's flat file: trailing-space-padded series_id, M01..M12 + M13 (annual avg).
const rows = [
  { series_id: 'CUUR0000SA0  ', year: '2019', period: 'M05', value: '256.092' },
  { series_id: 'CUUR0000SA0  ', year: '2019', period: 'M06', value: '256.143' },
  { series_id: 'CUUR0000SA0  ', year: '2019', period: 'M13', value: '255.657' },
  { series_id: 'CUUR0000SA0  ', year: '2025', period: 'M05', value: '999.999' },
  { series_id: 'CUUS0000SA0  ', year: '2019', period: 'M05', value: '111.111' },
]

describe('parseCpiMayByYear', () => {
  it('keeps only May (M05) observations of the requested series', () => {
    expect(parseCpiMayByYear(rows, 'CUUR0000SA0')).toEqual({ 2019: 256.092, 2025: 999.999 })
  })

  it('ignores the M13 annual-average pseudo-period', () => {
    const out = parseCpiMayByYear(rows, 'CUUR0000SA0')
    expect(Object.values(out)).not.toContain(255.657)
  })

  it('ignores other series (semiannual/unadjusted variants share the file)', () => {
    const out = parseCpiMayByYear(rows, 'CUUR0000SA0')
    expect(Object.values(out)).not.toContain(111.111)
  })

  it('throws when the requested series has no May observations at all', () => {
    expect(() => parseCpiMayByYear(rows, 'CUUR0000XXX'))
      .toThrow(/no May observations for series CUUR0000XXX/)
  })

  it('throws on an unparseable value rather than emitting NaN', () => {
    const bad = [{ series_id: 'CUUR0000SA0', year: '2019', period: 'M05', value: '-' }]
    expect(() => parseCpiMayByYear(bad, 'CUUR0000SA0')).toThrow(/unparseable CPI value/)
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run pipeline/tests/parse-cpi.test.ts`
Expected: FAIL — `Failed to resolve import "../lib/parse-cpi"`.

- [ ] **Step 4: Implement `pipeline/lib/parse-cpi.ts`**

```ts
/** BLS CU flat-file rows -> { year: May index value }.
 *
 *  The site deflates OEWS wages with CPI-U all items, US city average, May-to-May — OEWS's
 *  reference period is May, so this aligns with no interpolation (spec Decision 3).
 *
 *  BLS pads series_id with trailing spaces and mixes many series into one file, so both the
 *  series filter and the period filter must be exact after trimming. Period M13 is the annual
 *  average, not a month, and must never be treated as one. */
export function parseCpiMayByYear(
  rows: Record<string, unknown>[],
  seriesId: string,
): Record<number, number> {
  const out: Record<number, number> = {}
  for (const r of rows) {
    if (String(r.series_id ?? '').trim() !== seriesId) continue
    if (String(r.period ?? '').trim() !== 'M05') continue
    const year = Number(String(r.year ?? '').trim())
    const value = Number(String(r.value ?? '').trim())
    if (!Number.isFinite(year) || !Number.isFinite(value)) {
      throw new Error(`unparseable CPI value for ${seriesId} ${String(r.year)} ${String(r.period)}: ${String(r.value)}`)
    }
    out[year] = value
  }
  if (Object.keys(out).length === 0) throw new Error(`no May observations for series ${seriesId} in the CPI flat file`)
  return out
}
```

- [ ] **Step 5: Create the CPI archive writer `pipeline/archive-cpi.ts`**

The spec lists `data/history/cpi-u.json` as a committed artifact — the deflator must be archived
alongside the wage vintages, not re-fetched at build time.

```ts
// Executable entry point for `npm run archive:cpi`. Reads the downloaded BLS CU flat file and
// writes the committed deflator, data/history/cpi-u.json.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { RAW_DIR } from './config'
import { readDelimitedRows } from './loaders'
import { HISTORY_DIR } from './lib/history'
import { parseCpiMayByYear } from './lib/parse-cpi'

const SERIES = 'CUUR0000SA0' // CPI-U, all items, US city average, not seasonally adjusted
const src = path.join(RAW_DIR, 'cu.data.1.AllItems')
if (!existsSync(src)) {
  console.error(`missing ${src} — run 'npm run download'`)
  process.exit(1)
}

// BLS flat files are tab-delimited with space-padded fields; parse-cpi trims.
const values = parseCpiMayByYear(readDelimitedRows(src, '\t'), SERIES)
mkdirSync(HISTORY_DIR, { recursive: true })
const out = { series: SERIES, period: 'May', values }
writeFileSync(path.join(HISTORY_DIR, 'cpi-u.json'), JSON.stringify(out, null, 1))
const years = Object.keys(values).map(Number).sort((a, b) => a - b)
console.log(`wrote cpi-u.json — ${years.length} May observations, ${years[0]}–${years[years.length - 1]}`)
```

Adjust the filename if Task 6 Step 1 confirmed a different CU file.

In `package.json` scripts, add:

```json
    "archive:cpi": "tsx pipeline/archive-cpi.ts",
```

- [ ] **Step 6: Run to verify it passes, then commit**

Run: `npm test && npx tsc --noEmit`
Expected: PASS. (`archive-cpi.ts` is not run yet — the flat file arrives in Task 8.)

```bash
git add pipeline/lib/parse-cpi.ts pipeline/archive-cpi.ts pipeline/tests/parse-cpi.test.ts package.json
git commit -m "feat(pipeline): CPI-U May-by-year parser and archive writer

CPI-U all items, US city average (CUUR0000SA0), May observations only — OEWS's
reference period is May, so May-to-May deflation needs no interpolation.
Filters out the M13 annual-average pseudo-period and the other series BLS packs
into the same flat file." -- pipeline/lib/parse-cpi.ts pipeline/tests/parse-cpi.test.ts
```

---

### Task 7: The append-only archive

**Files:**
- Create: `pipeline/lib/history.ts`
- Create: `pipeline/archive-nat.ts`
- Modify: `package.json` (add `archive:nat` script)
- Modify: `.gitignore` (ensure `data/history/` is NOT ignored)
- Test: `pipeline/tests/history.test.ts`

- [ ] **Step 1: Write the failing test**

Create `pipeline/tests/history.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { assertWritable, buildNationalArchive } from '../lib/history'

describe('assertWritable', () => {
  it('allows writing a vintage that has not been archived yet', () => {
    expect(() => assertWritable(2019, { exists: false, force: false })).not.toThrow()
  })

  it('REFUSES to overwrite an existing vintage — history is append-only', () => {
    expect(() => assertWritable(2019, { exists: true, force: false }))
      .toThrow(/oews-nat-2019\.json already exists/)
  })

  it('allows an explicit forced overwrite', () => {
    expect(() => assertWritable(2019, { exists: true, force: true })).not.toThrow()
  })
})

describe('buildNationalArchive', () => {
  const roles = {
    '15-1252': { emp: 1656880, p10: 81440, p25: 102010, p50: 133080, p75: 168570, p90: 208620, capped: [] },
  }

  it('stamps the vintage year, its top code, and the source filename', () => {
    const out = buildNationalArchive(2019, 208_000, 'national_M2019_dl.xlsx', roles)
    expect(out.year).toBe(2019)
    expect(out.topCode).toBe(208_000)
    expect(out.source).toBe('national_M2019_dl.xlsx')
  })

  it('stores the top code IN the file so a future reader never infers it from current code', () => {
    // A reader that used today's constant to interpret a 2019 file would misread its censored
    // cells — the archive must be self-describing.
    const out = buildNationalArchive(2019, 208_000, 'national_M2019_dl.xlsx', roles)
    expect(out.topCode).not.toBe(239_200)
  })

  it('passes the role band through unchanged', () => {
    expect(buildNationalArchive(2025, 239_200, 'f.xlsx', roles).roles).toEqual(roles)
  })

  it('throws when handed zero roles rather than archiving an empty vintage', () => {
    expect(() => buildNationalArchive(2025, 239_200, 'f.xlsx', {}))
      .toThrow(/refusing to archive vintage 2025 with 0 roles/)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run pipeline/tests/history.test.ts`
Expected: FAIL — `Failed to resolve import "../lib/history"`.

- [ ] **Step 3: Implement `pipeline/lib/history.ts`**

```ts
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NationalRoleRecord } from './parse-oews-nat'

const here = path.dirname(fileURLToPath(import.meta.url))
export const HISTORY_DIR = path.join(here, '..', '..', 'data', 'history')

export interface NationalArchive {
  year: number
  topCode: number
  source: string
  roles: Record<string, NationalRoleRecord>
}

export const archiveFilename = (year: number): string => `oews-nat-${year}.json`
export const archivePath = (year: number): string => path.join(HISTORY_DIR, archiveFilename(year))

/** History is append-only: a rerun must never silently rewrite a vintage that is already
 *  committed. Overwriting requires an explicit --force. */
export function assertWritable(year: number, opts: { exists: boolean; force: boolean }): void {
  if (opts.exists && !opts.force) {
    throw new Error(
      `data/history/${archiveFilename(year)} already exists — history is append-only. ` +
      `Pass --force to overwrite deliberately.`,
    )
  }
}

/** The archive is self-describing: it carries the vintage's own top code so a future reader
 *  never has to infer it from whatever the code's current constant happens to be (spec T2). */
export function buildNationalArchive(
  year: number,
  topCode: number,
  source: string,
  roles: Record<string, NationalRoleRecord>,
): NationalArchive {
  if (Object.keys(roles).length === 0) {
    throw new Error(`refusing to archive vintage ${year} with 0 roles — the parse produced nothing`)
  }
  return { year, topCode, source, roles }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run pipeline/tests/history.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Create the entry point `pipeline/archive-nat.ts`**

```ts
// Executable entry point for `npm run archive:nat [-- --year 2019] [--force]`.
//
// Deliberately separate from run.ts: run.ts executes its whole body on import, needs a 6GB heap,
// and walks the LCA path. Archiving a national vintage needs none of that, so backfilling
// 2019..N must not require the MSA or LCA files to be present.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { RAW_DIR } from './config'
import { readSheetRows } from './loaders'
import { parseOewsNational } from './lib/parse-oews-nat'
import { archiveFilename, archivePath, assertWritable, buildNationalArchive, HISTORY_DIR } from './lib/history'
import { OEWS_NAT_YEARS, topCodeForYear } from './vintages'

const args = process.argv.slice(2)
const force = args.includes('--force')
const yearArg = args.indexOf('--year')
const years = yearArg >= 0 ? [Number(args[yearArg + 1])] : [...OEWS_NAT_YEARS]

/** national_M<year>_dl.xlsx, flat in data/raw/ or one level deep (the zip extracts a folder). */
function findNationalFile(year: number): string | null {
  const re = new RegExp(`^national_M${year}_dl.*\\.xlsx$`, 'i')
  for (const entry of readdirSync(RAW_DIR, { withFileTypes: true })) {
    if (entry.isFile() && re.test(entry.name)) return path.join(RAW_DIR, entry.name)
    if (entry.isDirectory()) {
      for (const sub of readdirSync(path.join(RAW_DIR, entry.name), { withFileTypes: true })) {
        if (sub.isFile() && re.test(sub.name)) return path.join(RAW_DIR, entry.name, sub.name)
      }
    }
  }
  return null
}

mkdirSync(HISTORY_DIR, { recursive: true })
let written = 0, skipped = 0, missing = 0
for (const year of years) {
  const file = findNationalFile(year)
  if (!file) { console.warn(`MISSING: no national_M${year}_dl.xlsx in data/raw — run 'npm run download'`); missing++; continue }
  const exists = existsSync(archivePath(year))
  if (exists && !force) { console.log(`skip ${archiveFilename(year)} (already archived)`); skipped++; continue }
  assertWritable(year, { exists, force })
  const topCode = topCodeForYear(year)
  const roles = parseOewsNational(readSheetRows(file), topCode)
  const archive = buildNationalArchive(year, topCode, path.basename(file), roles)
  writeFileSync(archivePath(year), JSON.stringify(archive, null, 1))
  console.log(`wrote ${archiveFilename(year)} — ${Object.keys(roles).length} roles, topCode ${topCode}`)
  written++
}
console.log(`DONE: ${written} written, ${skipped} already present, ${missing} missing`)
process.exitCode = missing > 0 ? 1 : 0
```

- [ ] **Step 6: Add the npm script and confirm `data/history/` is committed**

In `package.json`, add to `scripts`:

```json
    "archive:nat": "tsx pipeline/archive-nat.ts",
```

Check `.gitignore` — it ignores `data/raw/*` and `data/reports/*` but must **not** ignore `data/history/`. Run:

```bash
grep -n "data/" .gitignore
```

Expected: only `data/raw/*`, `!data/raw/.gitkeep`, `data/reports/*`, `!data/reports/.gitkeep`. If `data/history` appears, remove that line — the archive is the deliverable and must be committed.

- [ ] **Step 7: Run tests and commit**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

```bash
git add pipeline/lib/history.ts pipeline/archive-nat.ts pipeline/tests/history.test.ts package.json
git commit -m "feat(pipeline): append-only national vintage archive

New lightweight entry point (npm run archive:nat) writing data/history/
oews-nat-<year>.json, committed to the repo. Separate from run.ts because
archiving a national vintage needs neither the 6GB heap nor the MSA/LCA files.

Append-only by design: rerunning refuses to overwrite an existing vintage
without --force. Each file carries its own top code so a future reader never
infers it from the code's current constant." -- pipeline/lib/history.ts pipeline/archive-nat.ts pipeline/tests/history.test.ts package.json
```

---

### Task 8: Build `SOURCES` from `vintages.ts` and add the new downloads

**Files:**
- Modify: `pipeline/download.ts` (replace the hardcoded `SOURCES`)

- [ ] **Step 1: Rewrite `pipeline/download.ts`**

```ts
// Executable entry point for `npm run download`. All logic lives in lib/download-lib.ts so that
// importing it from a test does NOT trigger real network downloads — this file is the only one
// with side effects, and nothing imports it.
//
// Every year-encoded value comes from vintages.ts. Bumping a refresh is an edit to THAT file.
import { RAW_DIR } from './config'
import { runDownloads, type Source } from './lib/download-lib'
import { OEWS_NAT_YEARS, VINTAGES } from './vintages'

const yy = (year: number) => String(year).slice(2)
const oewsMsaUrl = (year: number) => `https://www.bls.gov/oes/special-requests/oesm${yy(year)}ma.zip`
const oewsNatUrl = (year: number) => `https://www.bls.gov/oes/special-requests/oesm${yy(year)}nat.zip`
const gazetteerUrl = (year: number) =>
  // note capital "Gaz" -- census.gov's own URL casing, lowercase 404s
  `https://www2.census.gov/geo/docs/maps-data/data/gazetteer/${year}_Gazetteer/${year}_Gaz_cbsa_national.zip`
const hudUrl = (stamp: string) => `https://www.huduser.gov/portal/datasets/usps/ZIP_CBSA_${stamp}.xlsx`
const lcaUrl = (fy: number, q: number) =>
  `https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/LCA_Disclosure_Data_FY${fy}_Q${q}.xlsx`

const SOURCES: Source[] = [
  { name: 'oews', required: true, unzip: true, urls: [
    oewsMsaUrl(VINTAGES.oewsYear),
    oewsMsaUrl(VINTAGES.oewsFallbackYear),
  ]},
  { name: 'rpp', required: true, unzip: true, urls: ['https://apps.bea.gov/regional/zip/MARPP.zip'] },
  { name: 'gazetteer', required: true, unzip: true, urls: [
    gazetteerUrl(VINTAGES.gazetteerYear),
    gazetteerUrl(VINTAGES.gazetteerFallbackYear),
  ]},
  { name: 'hud', required: true, urls: [
    hudUrl(VINTAGES.hudStamp),
    hudUrl(VINTAGES.hudFallbackStamp),
  ]},
  // National OEWS vintages for the /trends archive. Small (one row per occupation), and
  // individually optional so a single missing year never blocks the main pipeline.
  ...OEWS_NAT_YEARS.map(year => ({
    name: `oews-nat-${year}`, required: false, unzip: true, urls: [oewsNatUrl(year)],
  })),
  // CPI-U all items, US city average — the /trends deflator. Plain text, no unzip.
  { name: 'cpi', required: false, urls: ['https://download.bls.gov/pub/time.series/cu/cu.data.1.AllItems'] },
  // LCA quarters: individually optional; run.ts requires >= 2 files present overall.
  ...[1, 2, 3, 4].map(q => ({
    name: `lca-fy${VINTAGES.lcaFiscalYear}-q${q}`, required: false,
    urls: [lcaUrl(VINTAGES.lcaFiscalYear, q)],
  })),
]

process.exitCode = await runDownloads(SOURCES, RAW_DIR)
```

Use the CPI URL confirmed in Task 6 Step 1 if it differed.

- [ ] **Step 2: Verify the generated URLs match the files already on disk**

```bash
npx tsc --noEmit
npx tsx -e "
const yy = (y) => String(y).slice(2)
console.log('oews msa  ->', \`https://www.bls.gov/oes/special-requests/oesm\${yy(2025)}ma.zip\`)
console.log('oews nat  ->', \`https://www.bls.gov/oes/special-requests/oesm\${yy(2019)}nat.zip\`)
"
```

Expected: `oesm25ma.zip` and `oesm19nat.zip` — matching the file already in `data/raw/` and the URL pattern confirmed in Task 5 Step 1.

- [ ] **Step 3: Commit**

```bash
git add pipeline/download.ts
git commit -m "feat(pipeline): build SOURCES from vintages.ts; add national OEWS + CPI

Every year-encoded URL is now derived from vintages.ts, so a refresh is a
one-file edit. Adds the national OEWS vintages for the /trends archive (small,
one row per occupation) and the CPI-U flat file used as the deflator." -- pipeline/download.ts
```

---

### Task 9: Backfill the archive and VERIFY the top-code boundary

This is the operational task the spec's "verify against the files" notes point at. **Do not skip the verification** — `vintages.ts` currently carries an unverified guess for the year BLS raised its top code, and a wrong value silently distorts the trend page.

**Files:**
- Modify: `pipeline/vintages.ts` (correct the top-code table if the evidence disagrees)
- Create: `data/history/oews-nat-2019.json` … `oews-nat-2025.json` (generated, committed)

- [ ] **Step 1: Download the national vintages and the CPI file**

```bash
npm run download
```

Expected: `fetch` lines for each `oews-nat-<year>` and `cpi`; `skip` for the sources already present. Any year BLS does not publish under that name logs `FAILED` and is non-required — note which, and adjust the URL pattern if a whole run of years fails.

- [ ] **Step 2: Measure the top code per vintage**

```bash
npx tsx -e "
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { readSheetRows } from './pipeline/loaders.ts'
const RAW = 'data/raw'
const files = []
for (const e of readdirSync(RAW, { withFileTypes: true })) {
  if (e.isDirectory()) for (const s of readdirSync(path.join(RAW, e.name))) {
    if (/^national_M\d{4}_dl.*\.xlsx$/i.test(s)) files.push(path.join(RAW, e.name, s))
  }
  if (e.isFile() && /^national_M\d{4}_dl.*\.xlsx$/i.test(e.name)) files.push(path.join(RAW, e.name))
}
for (const f of files.sort()) {
  const year = /M(\d{4})/.exec(f)[1]
  const rows = readSheetRows(f)
  const vals = rows.map(r => r.A_PCT90).filter(v => typeof v === 'number' || /^[\d,\$.]+\$?/.test(String(v)))
    .map(v => Number(String(v).replace(/[\$,]/g, ''))).filter(Number.isFinite)
  const hashes = rows.filter(r => String(r.A_PCT90).trim() === '#').length
  console.log(year, 'maxNumericA_PCT90=', Math.max(...vals), ' #-cells=', hashes)
}
"
```

**Interpretation:** BLS substitutes `#` at or above the top code, so the largest *numeric* `A_PCT90` in a vintage sits just below that year's threshold. A vintage whose max numeric value is ~$208,000 has a $208,000 top code; one reaching ~$239,200 has the higher one. The year the maximum jumps is the boundary.

- [ ] **Step 3: Cross-check against BLS's own documentation**

Open the OEWS technical notes / FAQ for two vintages either side of the jump observed in Step 2 and confirm the stated top-code value. Do not rely on the numeric maximum alone — it is strong evidence, not a citation.

- [ ] **Step 4: Correct `pipeline/vintages.ts`**

Update `OEWS_TOP_CODE_BY_YEAR` to the verified values and **replace the ⚠️ UNVERIFIED comment** with a citation, e.g.:

```ts
/** Verified 2026-08-XX against BLS OEWS technical notes and the max numeric A_PCT90 per vintage:
 *  $208,000 through May <year>, $239,200 from May <year+1>. */
```

- [ ] **Step 5: Run the backfill**

```bash
npm run archive:nat
npm run archive:cpi
```

Expected: `wrote oews-nat-2019.json — N roles, topCode 208000` … through the current vintage. Expect **19 roles** for 2019/2020 and **21** once the two young SOC codes appear.

Then `wrote cpi-u.json — N May observations, YYYY–YYYY`. **Confirm the range covers every year in `OEWS_NAT_YEARS`** — if the CU file you downloaded starts later than 2019, switch to the fuller CU data file and re-run.

- [ ] **Step 6: Record the observed first-appearance years**

```bash
npx tsx -e "
import { readFileSync, readdirSync } from 'node:fs'
for (const f of readdirSync('data/history').filter(f => f.startsWith('oews-nat-')).sort()) {
  const a = JSON.parse(readFileSync('data/history/' + f, 'utf8'))
  console.log(a.year, 'roles=', Object.keys(a.roles).length,
    '15-2051?', '15-2051' in a.roles, '13-1082?', '13-1082' in a.roles)
}
"
```

**Write the output into `docs/REFRESH.md` (Task 11).** These are the first-appearance years the `/trends` plan needs, and they replace the spec's "roughly May 2021" estimate with a measured fact.

- [ ] **Step 7: Commit the archive**

```bash
git add data/history pipeline/vintages.ts
git commit -m "feat(data): backfill national OEWS archive 2019-2025

Verified top-code boundary against BLS technical notes and the max numeric
A_PCT90 per vintage; vintages.ts updated with the confirmed values.

Observed role coverage per vintage (first-appearance years for 15-2051 and
13-1082):
<paste the Step 6 output here>" -- data/history pipeline/vintages.ts
```

---

### Task 10: Cross-vintage plausibility tripwire

The spec assigns this to `archive-nat.ts`. It is implemented as a **separate verifier** instead, because the check is inherently cross-vintage and a single-vintage writer has nothing to compare against. Same guarantee, correct home.

**Files:**
- Modify: `pipeline/lib/history.ts` (add `findImplausibleJumps`)
- Create: `pipeline/archive-verify.ts`
- Modify: `package.json` (add `archive:verify`)
- Modify: `pipeline/tests/history.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `pipeline/tests/history.test.ts`:

```ts
import { findImplausibleJumps } from '../lib/history'

describe('findImplausibleJumps', () => {
  const band = (p50: number) => ({ emp: 1, p10: null, p25: null, p50, p75: null, p90: null, capped: [] })
  const vintage = (year: number, p50: number) => ({
    year, topCode: 239_200, source: `national_M${year}_dl.xlsx`, roles: { '15-1252': band(p50) },
  })

  it('passes a series with ordinary year-over-year movement', () => {
    expect(findImplausibleJumps([vintage(2023, 130_000), vintage(2024, 138_000)], 0.4)).toEqual([])
  })

  it('flags a jump beyond the threshold — the signature of a wrong top code or deflator', () => {
    const jumps = findImplausibleJumps([vintage(2023, 130_000), vintage(2024, 260_000)], 0.4)
    expect(jumps).toHaveLength(1)
    expect(jumps[0]).toMatchObject({ soc: '15-1252', from: 2023, to: 2024 })
  })

  it('flags large drops as well as rises', () => {
    expect(findImplausibleJumps([vintage(2023, 200_000), vintage(2024, 100_000)], 0.4)).toHaveLength(1)
  })

  it('ignores a role that is absent in the earlier vintage (young SOC code)', () => {
    const a = { year: 2020, topCode: 208_000, source: 'a', roles: {} }
    const b = vintage(2021, 130_000)
    expect(findImplausibleJumps([a, b], 0.4)).toEqual([])
  })

  it('ignores a null median rather than treating it as zero', () => {
    // Must exercise the null branch specifically — a fixture using 0 would be skipped by the
    // divide-by-zero guard instead, and the test would pass for the wrong reason.
    const prev = vintage(2023, 130_000)
    const cur = { year: 2024, topCode: 239_200, source: 'b', roles: { '15-1252': band(0) } }
    cur.roles['15-1252'].p50 = null as unknown as number
    expect(findImplausibleJumps([prev, cur], 0.4)).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run pipeline/tests/history.test.ts`
Expected: FAIL — `findImplausibleJumps` is not exported.

- [ ] **Step 3: Implement in `pipeline/lib/history.ts`**

```ts
export interface ImplausibleJump {
  soc: string; from: number; to: number; fromValue: number; toValue: number; change: number
}

/** Nominal year-over-year median moves larger than `threshold` (fraction, e.g. 0.4 = 40%).
 *
 *  This is a tripwire, not a statistic: a wrong vintage top code (T2) or a misaligned deflator
 *  produces exactly this signature, and without it the result is a plausible-looking wrong chart
 *  rather than an error. Roles absent from either vintage are skipped — a young SOC code appearing
 *  for the first time is not a jump. */
export function findImplausibleJumps(
  vintages: readonly NationalArchive[],
  threshold: number,
): ImplausibleJump[] {
  const sorted = [...vintages].sort((a, b) => a.year - b.year)
  const out: ImplausibleJump[] = []
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1], cur = sorted[i]
    for (const [soc, curRole] of Object.entries(cur.roles)) {
      const prevRole = prev.roles[soc]
      if (!prevRole) continue
      const a = prevRole.p50, b = curRole.p50
      if (a === null || b === null || a === 0) continue
      const change = (b - a) / a
      if (Math.abs(change) > threshold) {
        out.push({ soc, from: prev.year, to: cur.year, fromValue: a, toValue: b, change })
      }
    }
  }
  return out
}
```

- [ ] **Step 4: Create `pipeline/archive-verify.ts`**

```ts
// Executable entry point for `npm run archive:verify`. Reads every committed vintage and fails
// loudly on an implausible year-over-year move — the signature of a wrong top code or deflator.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { findImplausibleJumps, HISTORY_DIR, type NationalArchive } from './lib/history'

const THRESHOLD = 0.4

const files = readdirSync(HISTORY_DIR).filter(f => /^oews-nat-\d{4}\.json$/.test(f)).sort()
if (files.length < 2) {
  console.log(`only ${files.length} vintage(s) archived — nothing to compare`)
  process.exit(0)
}
const vintages: NationalArchive[] = files.map(f => JSON.parse(readFileSync(path.join(HISTORY_DIR, f), 'utf8')))
const jumps = findImplausibleJumps(vintages, THRESHOLD)
for (const j of jumps) {
  console.error(`DATA QUALITY: ${j.soc} median moved ${(j.change * 100).toFixed(1)}% ` +
    `${j.from}->${j.to} ($${j.fromValue.toLocaleString()} -> $${j.toValue.toLocaleString()})`)
}
console.log(`${files.length} vintages checked, ${jumps.length} implausible move(s) at threshold ${THRESHOLD * 100}%`)
process.exitCode = jumps.length > 0 ? 1 : 0
```

- [ ] **Step 5: Add the script, run it against the real archive**

In `package.json` scripts, add:

```json
    "archive:verify": "tsx pipeline/archive-verify.ts",
```

Run: `npm test && npm run archive:verify`
Expected: tests PASS; the verifier prints `7 vintages checked, 0 implausible move(s)`.

**If it reports jumps, stop and diagnose before continuing** — the most likely cause is a wrong top-code boundary from Task 9. Do not raise the threshold to make it pass.

- [ ] **Step 6: Commit**

```bash
git add pipeline/lib/history.ts pipeline/archive-verify.ts pipeline/tests/history.test.ts package.json
git commit -m "feat(pipeline): cross-vintage plausibility tripwire

A wrong vintage top code or a misaligned deflator produces a plausible-looking
wrong chart rather than an error; this fails loudly on any year-over-year
median move beyond 40%.

Spec deviation: assigned to archive-nat.ts in the spec, implemented as a
separate verifier because the check is inherently cross-vintage and a
single-vintage writer has nothing to compare against." -- pipeline/lib/history.ts pipeline/archive-verify.ts pipeline/tests/history.test.ts package.json
```

---

### Task 11: The source watcher

**Files:**
- Create: `.github/workflows/watch-sources.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: Watch upstream sources

# Monthly probe for newly published vintages. Deliberately does NOT download anything or run the
# pipeline: the full refresh needs ~478MB of raw input and a 6GB heap, and landing its output means
# pushing main — which auto-deploys without tests (deploy.yml is ungated; ci.yml only gates PRs).
# This opens an issue; the human refreshes locally and lands a PR.

on:
  schedule:
    - cron: '0 13 1 * *'   # 13:00 UTC on the 1st of each month
  workflow_dispatch:

permissions:
  contents: read
  issues: write

jobs:
  probe:
    name: Probe for new vintages
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Probe next vintages
        id: probe
        run: |
          set -uo pipefail
          UA='techpay-atlas research pipeline (personal project)'
          FOUND=""
          probe() {
            code=$(curl -A "$UA" -s -o /dev/null -w '%{http_code}' -I --max-time 30 "$2" || echo 000)
            echo "  $code  $1  $2"
            if [ "$code" = "200" ]; then FOUND="${FOUND}- **$1** — $2"$'\n'; fi
          }
          # Next OEWS (MSA + national), next Gazetteer, next LCA fiscal year, next HUD quarters.
          NEXT_OEWS=$(( $(date +%Y) ))
          probe "OEWS MSA May ${NEXT_OEWS}"      "https://www.bls.gov/oes/special-requests/oesm${NEXT_OEWS: -2}ma.zip"
          probe "OEWS national May ${NEXT_OEWS}" "https://www.bls.gov/oes/special-requests/oesm${NEXT_OEWS: -2}nat.zip"
          probe "Gazetteer ${NEXT_OEWS}"         "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/${NEXT_OEWS}_Gazetteer/${NEXT_OEWS}_Gaz_cbsa_national.zip"
          for q in 1 2 3 4; do
            probe "LCA FY${NEXT_OEWS} Q${q}" "https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/LCA_Disclosure_Data_FY${NEXT_OEWS}_Q${q}.xlsx"
          done
          for mm in 03 06 09 12; do
            probe "HUD ZIP-CBSA ${mm}${NEXT_OEWS}" "https://www.huduser.gov/portal/datasets/usps/ZIP_CBSA_${mm}${NEXT_OEWS}.xlsx"
          done
          {
            echo "found<<EOF"
            echo "$FOUND"
            echo "EOF"
          } >> "$GITHUB_OUTPUT"

      - name: Open or update the issue
        if: steps.probe.outputs.found != ''
        uses: actions/github-script@v7
        env:
          FOUND: ${{ steps.probe.outputs.found }}
        with:
          script: |
            const title = 'Upstream data: new vintage(s) available'
            const body = [
              'The monthly source watcher found newly published upstream files:',
              '',
              process.env.FOUND,
              '',
              'These are **not** downloaded automatically. To refresh, follow `docs/REFRESH.md`:',
              'bump `pipeline/vintages.ts`, run the pipeline locally, and land a PR.',
              '',
              `_Run: ${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}_`,
            ].join('\n')
            const existing = await github.rest.issues.listForRepo({
              owner: context.repo.owner, repo: context.repo.repo,
              state: 'open', labels: 'data-refresh',
            })
            if (existing.data.length > 0) {
              await github.rest.issues.createComment({
                owner: context.repo.owner, repo: context.repo.repo,
                issue_number: existing.data[0].number, body,
              })
            } else {
              await github.rest.issues.create({
                owner: context.repo.owner, repo: context.repo.repo,
                title, body, labels: ['data-refresh'],
              })
            }
```

- [ ] **Step 2: Validate the workflow syntax**

```bash
npx --yes @action-validator/cli --verbose .github/workflows/watch-sources.yml
```

Expected: no errors. If the validator is unavailable offline, confirm the YAML parses:

```bash
npx --yes js-yaml .github/workflows/watch-sources.yml > /dev/null && echo "YAML OK"
```

- [ ] **Step 3: Note the manual step**

The workflow filters existing issues by the `data-refresh` label. That label must exist in the repo, or `listForRepo` returns nothing and a duplicate issue is opened each month. Create it manually (repo → Issues → Labels → New label → `data-refresh`), and record this in `docs/REFRESH.md`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/watch-sources.yml
git commit -m "ci: monthly upstream source watcher

HEAD-probes the next vintage of each source and opens (or comments on) a
data-refresh issue. Deliberately does not download or run the pipeline: that
needs 478MB and a 6GB heap, and landing its output means pushing main, which
auto-deploys without tests." -- .github/workflows/watch-sources.yml
```

---

### Task 12: The runbook and backlog updates

**Files:**
- Create: `docs/REFRESH.md`
- Modify: `docs/BACKLOG.md`

- [ ] **Step 1: Write `docs/REFRESH.md`**

```markdown
# Data Refresh Runbook

Every year-encoded value lives in `pipeline/vintages.ts`. A refresh is an edit to that file
followed by the steps below. Nothing here runs in CI — see "Why not CI" at the bottom.

## When to refresh

The monthly `watch-sources` workflow opens (or comments on) an issue labelled `data-refresh`
when an upstream file publishes. Release cadences:

| Source | Cadence | Typical availability |
|---|---|---|
| BLS OEWS (MSA + national) | Annual, May reference period | published the following spring |
| DOL LCA disclosures | Quarterly, by federal fiscal year | ~2 months after quarter end |
| BEA RPP (`MARPP.zip`) | Annual | December |
| HUD ZIP–CBSA crosswalk | Quarterly | ~1 month after quarter end |
| Census Gazetteer | Annual | early in the year |

## Steps

1. **Bump `pipeline/vintages.ts`.** Move `oewsYear` up (and `oewsFallbackYear` behind it), the LCA
   fiscal year, the gazetteer year, the HUD stamp. `OEWS_NAT_YEARS` extends automatically.
2. **Add the new year's top code to `OEWS_TOP_CODE_BY_YEAR`.** `topCodeForYear` throws for an
   unrecorded vintage rather than guessing — that is deliberate. Verify the value against BLS's
   technical notes; do not copy the previous year's.
3. `npm run download` — markers are keyed on URL, so a bumped vintage re-downloads and an unchanged
   one is skipped. No need to delete `.done` files by hand.
4. `npm run archive:nat` — archives the new national vintage. Append-only: existing vintages are
   skipped, never rewritten.
5. `npm run archive:verify` — cross-vintage tripwire. **If it reports an implausible move, stop and
   diagnose.** The usual cause is a wrong top code in step 2. Never raise the threshold to pass.
6. `npm run pipeline` — the main MSA/LCA build. Needs ~6GB heap (the npm script sets it).
7. `npm test && npx tsc --noEmit`
8. Commit and open a **PR**. Do not push straight to `main` — `deploy.yml` fires on push to main and
   runs no tests; `ci.yml` only gates PRs.

## Manual setup (once)

- The `data-refresh` label must exist in the repo for the watcher to avoid opening a duplicate issue
  each month. Repo → Issues → Labels → New label → `data-refresh`.

## Observed vintage coverage

<paste the Task 9 Step 6 output here — role counts per vintage and the first year each of
15-2051 (Data Scientists) and 13-1082 (Project Management Specialists) appears>

## Why not CI

Running the pipeline on a schedule in Actions would need ~478MB of raw downloads and a 6GB heap, and
landing its output means pushing `main` — which auto-deploys without tests. The watcher detects; a
human refreshes locally and lands a PR through the gate that actually exists.
```

- [ ] **Step 2: Update `docs/BACKLOG.md`**

Add a section at the top (newest first, per the file's convention):

```markdown
## Data refresh + vintage archive — SHIPPED 2026-08-XX

`pipeline/vintages.ts` is now the single source of truth for every year-encoded URL; see
`docs/REFRESH.md` for the runbook. The pipeline is no longer destructive — `data/history/`
holds the committed per-vintage national OEWS archive that `/trends` consumes.

Three latent defects fixed on the way:
- `.done` markers were keyed on **basename**, so bumping a vintage URL while the old file was still
  in `data/raw` printed `skip (already downloaded)` and refreshed nothing.
- `TOP_CODE` was a constant while BLS's threshold is **vintage-specific** — reading an older file
  with the current value would have manufactured a real-terms decline at the top end.
- `download.test.ts` imported `download.ts`, whose loop runs at module level, so `npm test` on a
  fresh checkout (i.e. CI) attempted every real download. Vitest v4 swallows module-level console
  output, which is why it was invisible. Logic now lives in `lib/download-lib.ts`.

Also noted: `hud.done` was absent from `data/raw` although the HUD file was present — that marker
never got written under the old scheme.

Still open:
- **`/trends` Phase A** — spec at `docs/superpowers/specs/2026-08-06-trends-and-data-refresh-design.md`;
  plan to be written now that the archive exists and the boundary years are measured.
```

Then, in the `🆕 2026-08-06 intake — public-data project slate` section, rename the row so the
backlog stops carrying one name for two projects:

- Change **"Multi-year time series"** to **"H-1B multi-year ingest (LCA FY2020–FY2024)"**, and add a
  parenthetical: `(distinct from OEWS real-wage trends — see /trends spec)`.

Finally, in the `/about/` trailing slash section, append:

```markdown
`/trends` (when it lands) inherits the same defect — `/trends/` will 404 for the same reason. Does
not change the "do it with the custom-domain move" call, but it is now two URLs, not one.
```

- [ ] **Step 3: Final full verification**

```bash
npm test && npx tsc --noEmit && npm run archive:verify
```

Expected: all PASS; verifier reports 0 implausible moves.

- [ ] **Step 4: Commit**

```bash
git add docs/REFRESH.md docs/BACKLOG.md
git commit -m "docs: refresh runbook; close out the data-layer work in BACKLOG

Also disambiguates the intake's 'Multi-year time series' row (H-1B/LCA) from
the OEWS real-wage trends work, which are different sources and different
pages." -- docs/REFRESH.md docs/BACKLOG.md
```

---

## Done criteria

- [ ] `npm test` passes and performs **no network access** on a fresh checkout.
- [ ] `npx tsc --noEmit` clean.
- [ ] `data/history/oews-nat-2019.json` … `oews-nat-2025.json` committed.
- [ ] `data/history/cpi-u.json` committed, covering every year in `OEWS_NAT_YEARS`.
- [ ] `npm run archive:verify` reports 0 implausible moves.
- [ ] `OEWS_TOP_CODE_BY_YEAR` carries **verified** values with a citation, no ⚠️ UNVERIFIED marker.
- [ ] `docs/REFRESH.md` records the measured first-appearance years for `15-2051` and `13-1082`.
- [ ] Nothing pushed to `origin`.

## Handoff to the `/trends` plan

Two measured facts this plan produces are inputs the `/trends` Phase A plan needs, and neither can be
assumed in advance:

1. **First-appearance years** for `15-2051` and `13-1082` (Task 9 Step 6) — the spec estimates
   "roughly May 2021". Whatever the archive shows is the truth, and it determines which roles the
   headline figure excludes.
2. **The verified top-code boundary** (Task 9 Steps 2–4) — needed for the `/trends` fixtures to use
   real censoring values rather than invented ones.
