# `/trends` Phase B — Metro Trends Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Answer "how has pay in my metro changed?" inside the existing metro panel, with lines that break where the data genuinely discontinues.

**Architecture:** An append-only per-vintage MSA archive feeds a pure delineation detector and a pure trend builder, which emit one small JSON per metro. The panel lazy-loads that file exactly as it already lazy-loads employers, and renders one polyline per unbroken segment with the national series ghosted behind.

**Tech Stack:** TypeScript (ESM), tsx, vitest 4 (pipeline: node; site: jsdom + @testing-library/react), Next.js static export, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-07-trends-phase-b-metro-design.md` — read it first, especially "The trap this design exists to avoid".

---

## ⚠️ Data prerequisite — and what it does NOT block

Tasks 1, 5, and 10 need the MSA vintages on disk. **Tasks 2, 3, 4, 6, 7, 8, 9 are pure logic or UI and can be built and tested against fixtures without them.** Build in the order below; the plan is arranged so the blocked work is isolated.

Required in `data/raw/` (see the spec for URLs — **space downloads ~5s apart**, `bls.gov` 403s bursts and stays blocked over an hour):

```
oesm19ma.zip … oesm24ma.zip  →  MSA_M<year>_dl.xlsx   (2025 is already present)
```

## Conventions

- **Commit trailer** on every commit:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  ```
- Conventional commits (`feat(pipeline):`, `feat(site):`, `fix(...)`, `test(...)`).
- **Do NOT push.** Pathspec on BOTH `git add` and `git commit`.
- **Never commit `site/next-env.d.ts`** — it is perpetually dirty Next typegen churn.
- ⚠️ **A concurrent session commits to this repo.** Before each commit, `git status --porcelain` and stage only your own files by explicit pathspec. Never `git add -A`.
- Pipeline tests: `npm test` from root. Site tests: `npm test` from `site/`.
- House style: no semicolons, 2-space indent, explanatory block comments.
- ⚠️ Never write a concise-arrow `beforeEach` — a returned value is treated as a cleanup function and crashes.
- ⚠️ `npx tsx -e` must be a **single physical line using `require()`** — multi-line or `import` forms silently print nothing and exit 0 on this machine.

## Existing shapes you must bind to (verified, do not re-derive)

```ts
// pipeline/lib/history.ts
export const HISTORY_DIR: string
export function assertWritable(year: number, opts: { exists: boolean; force: boolean }): void

// pipeline/lib/parse-oews.ts — the MSA parser. `areas` is the delineation signal.
export function parseOews(rows, cell?): {
  records: SalaryRecord[]                                  // { cbsa, soc, emp, p10..p90, capped }
  areas: Map<string, { name: string; state: string }>      // cbsa -> AREA_TITLE
}

// site/lib/types.ts
export interface MetroMeta { cbsa: string; name: string; state: string; lat: number; lng: number; rpp: number | null; lcaFilings: number }

// site/components/MetroPanel.tsx
MetroPanel({ meta, salaries, cbsa, soc, adjusted, onClose })   // `adjusted` means COST OF LIVING
```

Existing npm scripts: `download`, `pipeline`, `archive:verify`, `archive:cpi`, `archive:nat`, `emit:trends`, `test`.

## File Structure

| File | Responsibility |
|---|---|
| `pipeline/lib/history.ts` | Add `MsaArchive`, `MsaMetroRecord`, `msaArchiveFilename/Path`. Reuse `assertWritable`. |
| `pipeline/archive-msa.ts` | **New entry point** `npm run archive:msa`. Append-only per vintage. |
| `pipeline/lib/delineation.ts` | **New. Pure.** Archives → per-CBSA break years, first/last year. |
| `pipeline/lib/build-metro-trends.ts` | **New. Pure.** Archives + CPI + breaks → per-metro payloads. |
| `pipeline/emit-metro-trends.ts` | **New entry point** `npm run emit:metro-trends`. |
| `pipeline/run.ts` | Stamp `trendYears` onto `meta.metros[]`. |
| `site/lib/metro-trend-types.ts` | **New.** The emitted contract, site-side mirror. |
| `site/lib/metro-trend.ts` | **New. Pure.** Split a series into unbroken segments. |
| `site/lib/data.ts` | Add `loadMetroTrend(cbsa)`. |
| `site/components/MetroTrend.tsx` | **New.** The panel section. |
| `site/components/MetroPanel.tsx` | Render `<MetroTrend>`; pass `soc`, not `adjusted`. |
| `site/app/globals.css` | Styles, scoped under `.page`. |

---

### Task 1: MSA archive types and writer

**Files:** modify `pipeline/lib/history.ts`; create `pipeline/archive-msa.ts`; modify `package.json`; test `pipeline/tests/history-msa.test.ts`

- [ ] **Step 1: Write the failing test** — create `pipeline/tests/history-msa.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildMsaArchive, msaArchiveFilename } from '../lib/history'

const rec = (p50: number) => ({ p50, emp: 100, capped: [] })

describe('msaArchiveFilename', () => {
  it('sits beside the national archive under a distinct name', () => {
    expect(msaArchiveFilename(2019)).toBe('oews-msa-2019.json')
  })
})

describe('buildMsaArchive', () => {
  const areas = new Map([['12420', { name: 'Austin-Round Rock, TX', state: 'TX' }]])
  const metros = { '12420': { '15-1252': rec(120000) } }

  it('stamps year, top code and source', () => {
    const a = buildMsaArchive(2019, 208_000, 'MSA_M2019_dl.xlsx', areas, metros)
    expect(a.year).toBe(2019)
    expect(a.topCode).toBe(208_000)
    expect(a.source).toBe('MSA_M2019_dl.xlsx')
  })

  it('records each metro title — this is the delineation signal', () => {
    const a = buildMsaArchive(2019, 208_000, 'f.xlsx', areas, metros)
    expect(a.areas['12420']).toBe('Austin-Round Rock, TX')
  })

  it('passes metro role records through unchanged', () => {
    const a = buildMsaArchive(2019, 208_000, 'f.xlsx', areas, metros)
    expect(a.metros['12420']['15-1252'].p50).toBe(120000)
  })

  it('throws rather than archiving a vintage with no metros', () => {
    expect(() => buildMsaArchive(2019, 208_000, 'f.xlsx', new Map(), {}))
      .toThrow(/refusing to archive MSA vintage 2019 with 0 metros/)
  })

  it('throws when a metro has records but no title', () => {
    // A metro with wage rows but no AREA_TITLE would silently lose its delineation
    // signal and never register a break.
    expect(() => buildMsaArchive(2019, 208_000, 'f.xlsx', new Map(), metros))
      .toThrow(/12420 has records but no area title/)
  })
})
```

- [ ] **Step 2: Run it, confirm FAIL.** `npx vitest run pipeline/tests/history-msa.test.ts` — expect no such export. Quote the error.

- [ ] **Step 3: Add to `pipeline/lib/history.ts`:**

```ts
/** One metro+role cell for a single MSA vintage. Medians only — Phase B plots p50, and
 *  metro-level censoring of upper percentiles is worse than national (spec: out of scope). */
export interface MsaMetroRecord {
  p50: number | null
  emp: number | null
  capped: Pct[]
}

export interface MsaArchive {
  year: number
  topCode: number
  source: string
  /** cbsa -> AREA_TITLE for this vintage. Comparing this map across vintages is how a metro
   *  redefinition is detected (spec: "Detecting a delineation change"). Without it the archive
   *  cannot answer whether a series is continuous. */
  areas: Record<string, string>
  metros: Record<string, Record<string, MsaMetroRecord>>
}

export const msaArchiveFilename = (year: number): string => `oews-msa-${year}.json`
export const msaArchivePath = (year: number): string => path.join(HISTORY_DIR, msaArchiveFilename(year))

export function buildMsaArchive(
  year: number,
  topCode: number,
  source: string,
  areas: Map<string, { name: string; state: string }>,
  metros: Record<string, Record<string, MsaMetroRecord>>,
): MsaArchive {
  const cbsas = Object.keys(metros)
  if (cbsas.length === 0) {
    throw new Error(`refusing to archive MSA vintage ${year} with 0 metros — the parse produced nothing`)
  }
  const areaRecord: Record<string, string> = {}
  for (const cbsa of cbsas) {
    const a = areas.get(cbsa)
    if (!a) throw new Error(`${cbsa} has records but no area title in vintage ${year} — delineation signal would be lost`)
    areaRecord[cbsa] = a.name
  }
  return { year, topCode, source, areas: areaRecord, metros }
}
```

`Pct` is already imported in `history.ts` for `NationalRoleRecord`; reuse it.

- [ ] **Step 4: Create `pipeline/archive-msa.ts`:**

```ts
// Executable entry point for `npm run archive:msa [-- --year YYYY] [--force]`.
//
// Separate from archive-nat.ts because the inputs differ by two orders of magnitude: the national
// file is 290KB and one row per occupation, the MSA file is 39MB and ~150k rows. Sharing an entry
// point would make one carry the other's constraints.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { RAW_DIR } from './config'
import { readSheetRows } from './loaders'
import { parseOews } from './lib/parse-oews'
import { makeCell } from './lib/num'
import { assertWritable, buildMsaArchive, HISTORY_DIR, msaArchiveFilename, msaArchivePath, type MsaMetroRecord } from './lib/history'
import { OEWS_NAT_YEARS, topCodeForYear } from './vintages'

const args = process.argv.slice(2)
const force = args.includes('--force')
const yearArg = args.indexOf('--year')
const years = yearArg >= 0 ? [Number(args[yearArg + 1])] : [...OEWS_NAT_YEARS]

/** MSA_M<year>_dl.xlsx, flat in data/raw or one level deep (the zip extracts a folder). */
function findMsaFile(year: number): string | null {
  const re = new RegExp(`^MSA_M${year}_dl.*\\.xlsx$`, 'i')
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
let written = 0, skipped = 0, missing = 0, errored = 0
for (const year of years) {
  const file = findMsaFile(year)
  if (!file) { console.warn(`MISSING: no MSA_M${year}_dl.xlsx in ${RAW_DIR} — see the spec for download URLs`); missing++; continue }
  const exists = existsSync(msaArchivePath(year))
  if (exists && !force) { console.log(`SKIP: ${msaArchiveFilename(year)} already archived (pass --force to overwrite)`); skipped++; continue }
  try {
    assertWritable(year, { exists, force })
    const topCode = topCodeForYear(year)
    const { records, areas } = parseOews(readSheetRows(file), makeCell(topCode))
    const metros: Record<string, Record<string, MsaMetroRecord>> = {}
    for (const r of records) {
      ;(metros[r.cbsa] ??= {})[r.soc] = { p50: r.p50, emp: r.emp, capped: r.capped }
    }
    const archive = buildMsaArchive(year, topCode, path.basename(file), areas, metros)
    writeFileSync(msaArchivePath(year), JSON.stringify(archive))
    console.log(`WROTE: ${year} — ${Object.keys(metros).length} metros, top code $${topCode.toLocaleString()}`)
    written++
  } catch (e) {
    console.error(`ERROR: ${year} — ${(e as Error).message}`)
    errored++
  }
}
console.log(`${written} written, ${skipped} skipped, ${missing} missing, ${errored} errored (of ${years.length} vintage(s))`)
process.exitCode = missing > 0 || errored > 0 ? 1 : 0
```

Add to root `package.json` scripts: `"archive:msa": "tsx --max-old-space-size=6144 pipeline/archive-msa.ts",`

The heap flag matters — the MSA sheet is ~150k rows and `readSheetRows` materialises all of them.

- [ ] **Step 5: Verify.** `npx vitest run pipeline/tests/history-msa.test.ts` (5 pass), `npm test` (all green), `npx tsc --noEmit` (clean).

Then confirm the entry point runs against the one vintage that IS on disk:
```bash
npm run archive:msa -- --year 2025
```
Expected: `WROTE: 2025 — 393 metros, top code $239,200`, then `1 written, 0 skipped, 0 missing, 0 errored`.

Check the size — if it is wildly off 370KB, report rather than proceeding:
```bash
ls -la data/history/oews-msa-2025.json
```

- [ ] **Step 6: Commit** (do NOT commit the generated archive yet — Task 5 commits the full set):

```bash
git add pipeline/lib/history.ts pipeline/archive-msa.ts pipeline/tests/history-msa.test.ts package.json
git commit -m "feat(pipeline): append-only MSA vintage archive

Records AREA_TITLE per CBSA alongside the wage records — comparing that map
across vintages is how a metro redefinition is detected, and an archive without
it cannot answer whether a series is continuous.

Separate entry point from archive-nat.ts: the MSA file is 39MB and ~150k rows
against the national file's 290KB, so it needs the larger heap." -- pipeline/lib/history.ts pipeline/archive-msa.ts pipeline/tests/history-msa.test.ts package.json
```

---

### Task 2: Delineation detection (pure, unblocked)

**Files:** create `pipeline/lib/delineation.ts`; test `pipeline/tests/delineation.test.ts`

- [ ] **Step 1: Write the failing test:**

```ts
import { describe, expect, it } from 'vitest'
import { detectDelineation } from '../lib/delineation'
import type { MsaArchive } from '../lib/history'

const v = (year: number, areas: Record<string, string>): MsaArchive => ({
  year, topCode: 239_200, source: `MSA_M${year}_dl.xlsx`, areas,
  metros: Object.fromEntries(Object.keys(areas).map(c => [c, { '15-1252': { p50: 1, emp: 1, capped: [] } }])),
})

describe('detectDelineation', () => {
  it('reports no break when the title is stable', () => {
    const d = detectDelineation([v(2019, { '12420': 'Austin-Round Rock, TX' }), v(2020, { '12420': 'Austin-Round Rock, TX' })])
    expect(d['12420'].breaks).toEqual([])
  })

  it('reports a break in the year the title changed', () => {
    const d = detectDelineation([
      v(2019, { '12420': 'Austin-Round Rock, TX' }),
      v(2020, { '12420': 'Austin-Round Rock-Georgetown, TX' }),
    ])
    expect(d['12420'].breaks).toEqual([2020])
  })

  it('reports every break when the title changed more than once', () => {
    const d = detectDelineation([
      v(2019, { '12420': 'Austin-Round Rock, TX' }),
      v(2020, { '12420': 'Austin-Round Rock-Georgetown, TX' }),
      v(2021, { '12420': 'Austin-Round Rock-Georgetown, TX' }),
      v(2022, { '12420': 'Austin-Round Rock-San Marcos, TX' }),
    ])
    expect(d['12420'].breaks).toEqual([2020, 2022])
  })

  it('records first and last year a metro appears', () => {
    const d = detectDelineation([
      v(2019, { '10180': 'Abilene, TX' }),
      v(2020, { '10180': 'Abilene, TX', '99999': 'New Metro, XX' }),
      v(2021, { '99999': 'New Metro, XX' }),
    ])
    expect(d['10180'].firstYear).toBe(2019)
    expect(d['10180'].lastYear).toBe(2020)
    expect(d['99999'].firstYear).toBe(2020)
    expect(d['99999'].lastYear).toBe(2021)
  })

  it('a metro appearing mid-window is not a break — it is simply a later start', () => {
    const d = detectDelineation([v(2019, { '10180': 'Abilene, TX' }), v(2020, { '10180': 'Abilene, TX', '99999': 'New, XX' })])
    expect(d['99999'].breaks).toEqual([])
  })

  it('a gap in appearance is recorded so the series can break there', () => {
    const d = detectDelineation([
      v(2019, { '10180': 'Abilene, TX' }),
      v(2020, {}),
      v(2021, { '10180': 'Abilene, TX' }),
    ])
    expect(d['10180'].absentYears).toEqual([2020])
  })

  it('sorts vintages by year regardless of input order', () => {
    const d = detectDelineation([
      v(2021, { '12420': 'Austin-Round Rock-San Marcos, TX' }),
      v(2019, { '12420': 'Austin-Round Rock, TX' }),
    ])
    expect(d['12420'].breaks).toEqual([2021])
    expect(d['12420'].firstYear).toBe(2019)
  })
})
```

- [ ] **Step 2: Run it, confirm FAIL.** `npx vitest run pipeline/tests/delineation.test.ts`. Quote the error.

- [ ] **Step 3: Implement `pipeline/lib/delineation.ts`:**

```ts
import type { MsaArchive } from './history'

export interface MetroDelineation {
  /** Years in which this metro's AREA_TITLE differs from the previous year it appeared.
   *  A break means the series must not be drawn across this year. */
  breaks: number[]
  firstYear: number
  lastYear: number
  /** Years inside [firstYear, lastYear] where the metro is absent from the vintage entirely.
   *
   *  DIAGNOSTIC ONLY — the splitter does not read this. An absent metro already yields a null in
   *  buildMetroTrend (`a.metros[cbsa]?.` misses), and `segments()` splits on nulls, so absence is
   *  handled without a second mechanism. This field exists so the emit step can report coverage
   *  holes; do not add a code path that splits on it as well, or gaps get counted twice. */
  absentYears: number[]
}

/** Per-CBSA continuity facts, derived from AREA_TITLE changes across vintages.
 *
 *  ⚠️ This is a HEURISTIC, deliberately. OMB can move a county boundary without renaming the
 *  metro, and can rename cosmetically without moving one. The honest alternative — ingesting OMB's
 *  delineation files and diffing county composition — is an entire additional dataset for a
 *  marginal gain over a signal that catches the large, real redefinitions. The page says the
 *  detection is title-based rather than implying more rigour than it has. */
export function detectDelineation(archives: readonly MsaArchive[]): Record<string, MetroDelineation> {
  const sorted = [...archives].sort((a, b) => a.year - b.year)
  const seen: Record<string, { title: string; years: number[]; breaks: number[] }> = {}

  for (const v of sorted) {
    for (const [cbsa, title] of Object.entries(v.areas)) {
      const prev = seen[cbsa]
      if (!prev) { seen[cbsa] = { title, years: [v.year], breaks: [] }; continue }
      if (prev.title !== title) prev.breaks.push(v.year)
      prev.title = title
      prev.years.push(v.year)
    }
  }

  const out: Record<string, MetroDelineation> = {}
  for (const [cbsa, s] of Object.entries(seen)) {
    const firstYear = s.years[0]
    const lastYear = s.years[s.years.length - 1]
    const present = new Set(s.years)
    const absentYears = sorted
      .map(v => v.year)
      .filter(y => y > firstYear && y < lastYear && !present.has(y))
    out[cbsa] = { breaks: s.breaks, firstYear, lastYear, absentYears }
  }
  return out
}
```

- [ ] **Step 4: Verify.** `npx vitest run pipeline/tests/delineation.test.ts` (7 pass), `npm test`, `npx tsc --noEmit`.

- [ ] **Step 5: Commit:**

```bash
git add pipeline/lib/delineation.ts pipeline/tests/delineation.test.ts
git commit -m "feat(pipeline): detect metro redelineation from AREA_TITLE drift

A title change between vintages means OMB moved the boundary, so the series
must not be drawn across that year. Deliberately a heuristic — the alternative
is ingesting OMB delineation files to diff county composition, an entire
dataset for marginal gain — and the page says so rather than implying more
rigour than it has." -- pipeline/lib/delineation.ts pipeline/tests/delineation.test.ts
```

---

### Task 3: Per-metro trend builder (pure, unblocked)

**Files:** create `pipeline/lib/build-metro-trends.ts`; test `pipeline/tests/build-metro-trends.test.ts`

The emitted per-metro contract:

```ts
{
  cbsa: '12420',
  name: 'Austin-Round Rock-San Marcos, TX',
  years: [2019, 2020, 2021, 2022, 2023, 2024, 2025],
  breaks: [2022],
  deflator: { series: 'CUUR0000SA0', period: 'May', base: 2025 },
  roles: {
    '15-1252': { nominal: [...], real: [...], capped: [...] }   // null where absent/suppressed
  }
}
```

- [ ] **Step 1: Write the failing test:**

```ts
import { describe, expect, it } from 'vitest'
import { buildMetroTrend } from '../lib/build-metro-trends'
import type { MsaArchive } from '../lib/history'

const cpi = { 2019: 256.092, 2020: 256.394, 2021: 269.195, 2022: 292.296, 2023: 304.127, 2024: 314.069, 2025: 321.465 }

const v = (year: number, p50: number | null, title = 'Austin-Round Rock, TX'): MsaArchive => ({
  year, topCode: 239_200, source: `MSA_M${year}_dl.xlsx`,
  areas: { '12420': title },
  metros: { '12420': { '15-1252': { p50, emp: 100, capped: [] } } },
})

const del = { '12420': { breaks: [], firstYear: 2021, lastYear: 2025, absentYears: [] } }

describe('buildMetroTrend', () => {
  it('deflates to the base year, leaving the base year nominal', () => {
    const t = buildMetroTrend('12420', [v(2021, 120730), v(2025, 135980)], cpi, 2025, del)
    expect(t.roles['15-1252'].nominal).toEqual([120730, 135980])
    expect(t.roles['15-1252'].real[1]).toBe(135980)
    expect(t.roles['15-1252'].real[0]).toBeCloseTo(144172.3, 0)
  })

  it('uses the newest vintage title as the metro name', () => {
    const t = buildMetroTrend('12420',
      [v(2021, 1, 'Austin-Round Rock, TX'), v(2025, 2, 'Austin-Round Rock-San Marcos, TX')], cpi, 2025, del)
    expect(t.name).toBe('Austin-Round Rock-San Marcos, TX')
  })

  it('emits null for a suppressed cell rather than dropping the year', () => {
    const t = buildMetroTrend('12420', [v(2021, null), v(2025, 135980)], cpi, 2025, del)
    expect(t.years).toEqual([2021, 2025])
    expect(t.roles['15-1252'].nominal).toEqual([null, 135980])
    expect(t.roles['15-1252'].real[0]).toBeNull()
  })

  it('emits null for a year the metro is absent from entirely', () => {
    const a = v(2021, 120730)
    const b: MsaArchive = { ...v(2025, 0), areas: {}, metros: {} }
    const t = buildMetroTrend('12420', [a, b], cpi, 2025, del)
    expect(t.roles['15-1252'].nominal).toEqual([120730, null])
  })

  it('carries the delineation breaks through', () => {
    const t = buildMetroTrend('12420', [v(2021, 1), v(2025, 2)], cpi, 2025,
      { '12420': { breaks: [2025], firstYear: 2021, lastYear: 2025, absentYears: [] } })
    expect(t.breaks).toEqual([2025])
  })

  it('marks a censored cell without altering the plotted median', () => {
    const a = v(2021, 120730)
    a.metros['12420']['15-1252'].capped = ['p90']
    const t = buildMetroTrend('12420', [a, v(2025, 135980)], cpi, 2025, del)
    expect(t.roles['15-1252'].capped).toEqual([true, false])
    expect(t.roles['15-1252'].nominal[0]).toBe(120730)
  })

  it('throws when a year has no CPI value rather than silently dropping it', () => {
    expect(() => buildMetroTrend('12420', [v(2021, 1)], { 2025: 321.465 }, 2025, del))
      .toThrow(/no CPI value for 2021/)
  })

  it('returns null for a metro absent from every vintage', () => {
    expect(buildMetroTrend('99999', [v(2021, 1)], cpi, 2025, del)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it, confirm FAIL.** Quote the error.

- [ ] **Step 3: Implement `pipeline/lib/build-metro-trends.ts`:**

```ts
import { ROLES } from './soc'
import type { MsaArchive } from './history'
import type { MetroDelineation } from './delineation'

export interface MetroTrendRole {
  nominal: (number | null)[]
  real: (number | null)[]
  capped: boolean[]
}

export interface MetroTrend {
  cbsa: string
  name: string
  years: number[]
  breaks: number[]
  deflator: { series: string; period: string; base: number }
  roles: Record<string, MetroTrendRole>
}

/** One metro's real-wage history, in `base`-year dollars.
 *
 *  Deflation is CPI-U May-to-May, matching OEWS's May reference period.
 *
 *  ⚠️ BEA RPP is NOT used here and must never be. RPP is a SPATIAL index renormalised to US = 100
 *  every year, so an RPP-adjusted series over time measures nothing coherent — the index resets
 *  annually and the line would be an artifact. The panel's `adjusted` prop means RPP; this data is
 *  deliberately independent of it. */
export function buildMetroTrend(
  cbsa: string,
  archives: readonly MsaArchive[],
  cpiMayByYear: Readonly<Record<number, number>>,
  base: number,
  delineation: Readonly<Record<string, MetroDelineation>>,
): MetroTrend | null {
  const sorted = [...archives].sort((a, b) => a.year - b.year)
  const years = sorted.map(a => a.year)

  const baseCpi = cpiMayByYear[base]
  if (!Number.isFinite(baseCpi) || baseCpi <= 0) throw new Error(`no CPI value for base year ${base}`)
  for (const y of years) {
    const c = cpiMayByYear[y]
    if (!Number.isFinite(c) || c <= 0) throw new Error(`no CPI value for ${y} — the deflator is short`)
  }

  if (!sorted.some(a => a.metros[cbsa])) return null

  // Newest vintage that carries a title wins: the current name is what a reader recognises.
  let name = cbsa
  for (const a of sorted) if (a.areas[cbsa]) name = a.areas[cbsa]

  const roles: Record<string, MetroTrendRole> = {}
  for (const role of ROLES) {
    const nominal = sorted.map(a => a.metros[cbsa]?.[role.soc]?.p50 ?? null)
    if (nominal.every(v => v === null)) continue // role never published here — omit rather than emit an empty line
    const capped = sorted.map(a => (a.metros[cbsa]?.[role.soc]?.capped ?? []).includes('p90'))
    const real = nominal.map((v, i) => (v === null ? null : v * (baseCpi / cpiMayByYear[years[i]])))
    roles[role.soc] = { nominal, real, capped }
  }

  return {
    cbsa, name, years,
    breaks: delineation[cbsa]?.breaks ?? [],
    deflator: { series: 'CUUR0000SA0', period: 'May', base },
    roles,
  }
}
```

- [ ] **Step 4: Verify.** `npx vitest run pipeline/tests/build-metro-trends.test.ts` (8 pass), `npm test`, `npx tsc --noEmit`.

- [ ] **Step 5: Commit:**

```bash
git add pipeline/lib/build-metro-trends.ts pipeline/tests/build-metro-trends.test.ts
git commit -m "feat(pipeline): pure per-metro trend builder

CPI-U May-to-May only. BEA RPP is deliberately absent: it is a spatial index
renormalised to US=100 annually, so deflating over time with it produces an
artifact, and the panel prop named 'adjusted' means RPP." -- pipeline/lib/build-metro-trends.ts pipeline/tests/build-metro-trends.test.ts
```

---

### Task 4: Site-side segment splitting (pure, unblocked)

**Files:** create `site/lib/metro-trend-types.ts`, `site/lib/metro-trend.ts`; test `site/tests/metro-trend.test.ts`

- [ ] **Step 1: Create `site/lib/metro-trend-types.ts`** — mirrors the pipeline contract (the site cannot import from `pipeline/`; same reason `title-types.ts` exists):

```ts
export interface MetroTrendRole {
  nominal: (number | null)[]
  real: (number | null)[]
  capped: boolean[]
}

/** Named MetroTrendData, not MetroTrend, because `MetroTrend` is the COMPONENT in
 *  components/MetroTrend.tsx. A type and a component sharing a name forces an import alias at
 *  every call site and reads as a mistake. */
export interface MetroTrendData {
  cbsa: string
  name: string
  years: number[]
  breaks: number[]
  deflator: { series: string; period: string; base: number }
  roles: Record<string, MetroTrendRole>
}
```

- [ ] **Step 2: Write the failing test** — create `site/tests/metro-trend.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { segments } from '../lib/metro-trend'
import type { MetroTrendData } from '../lib/metro-trend-types'

const t = (nominal: (number | null)[], breaks: number[] = []): MetroTrendData => ({
  cbsa: '12420', name: 'Austin, TX',
  years: [2019, 2020, 2021, 2022, 2023],
  breaks,
  deflator: { series: 'CUUR0000SA0', period: 'May', base: 2023 },
  roles: { '15-1252': { nominal, real: nominal, capped: nominal.map(() => false) } },
})

describe('segments', () => {
  it('returns one segment for an unbroken series', () => {
    const s = segments(t([1, 2, 3, 4, 5]), '15-1252')
    expect(s).toHaveLength(1)
    expect(s[0].map(p => p.year)).toEqual([2019, 2020, 2021, 2022, 2023])
  })

  it('splits at a suppression gap rather than drawing across it', () => {
    const s = segments(t([1, 2, null, 4, 5]), '15-1252')
    expect(s).toHaveLength(2)
    expect(s[0].map(p => p.year)).toEqual([2019, 2020])
    expect(s[1].map(p => p.year)).toEqual([2022, 2023])
  })

  it('splits at a delineation break even when values are continuous', () => {
    // The data is present on both sides; the geography changed, so the line must not connect.
    const s = segments(t([1, 2, 3, 4, 5], [2022]), '15-1252')
    expect(s).toHaveLength(2)
    expect(s[0].map(p => p.year)).toEqual([2019, 2020, 2021])
    expect(s[1].map(p => p.year)).toEqual([2022, 2023])
  })

  it('drops leading nulls so a late-starting series begins where its data does', () => {
    const s = segments(t([null, null, 3, 4, 5]), '15-1252')
    expect(s).toHaveLength(1)
    expect(s[0][0].year).toBe(2021)
  })

  it('keeps a lone point as its own segment so it can be drawn as a dot', () => {
    const s = segments(t([1, null, 3, null, 5]), '15-1252')
    expect(s).toHaveLength(3)
    expect(s.every(seg => seg.length === 1)).toBe(true)
  })

  it('returns nothing for a role this metro never published', () => {
    expect(segments(t([1, 2, 3]), '99-9999')).toEqual([])
  })

  it('reads real values, not nominal, by default', () => {
    const trend = t([100, 200, 300, 400, 500])
    trend.roles['15-1252'].real = [1, 2, 3, 4, 5]
    expect(segments(trend, '15-1252')[0][0].value).toBe(1)
  })
})
```

- [ ] **Step 3: Run it, confirm FAIL.** From `site/`: `npx vitest run tests/metro-trend.test.ts`. Quote the error.

- [ ] **Step 4: Implement `site/lib/metro-trend.ts`:**

```ts
import type { MetroTrendData } from './metro-trend-types'

export interface TrendPoint { year: number; value: number }

/** One role's series split into runs that may legitimately be connected by a line.
 *
 *  Two things break a run, and both mean "do not draw across this":
 *   - a null value — OEWS suppressed the figure for a small sample, so we do not know it;
 *   - a delineation break — OMB moved the metro's boundary, so the two sides are different places.
 *
 *  A single-point run is preserved rather than dropped, so the caller can render it as a dot; a
 *  year of real data should not vanish because its neighbours are missing. */
export function segments(trend: MetroTrendData, soc: string, mode: 'real' | 'nominal' = 'real'): TrendPoint[][] {
  const role = trend.roles[soc]
  if (!role) return []
  const values = mode === 'nominal' ? role.nominal : role.real
  const breaks = new Set(trend.breaks)

  const out: TrendPoint[][] = []
  let run: TrendPoint[] = []
  trend.years.forEach((year, i) => {
    const v = values[i]
    if (v === null) { if (run.length) out.push(run); run = []; return }
    if (breaks.has(year) && run.length) { out.push(run); run = [] }
    run.push({ year, value: v })
  })
  if (run.length) out.push(run)
  return out
}
```

- [ ] **Step 5: Verify.** From `site/`: `npx vitest run tests/metro-trend.test.ts` (7 pass), `npm test`, `npx tsc --noEmit`, `npm run lint`.

- [ ] **Step 6: Commit:**

```bash
git add site/lib/metro-trend-types.ts site/lib/metro-trend.ts site/tests/metro-trend.test.ts
git commit -m "feat(site): split a metro series into connectable segments

A null (OEWS suppressed the figure) and a delineation break (OMB moved the
boundary) both mean the line must not be drawn across. Single-point runs are
kept so a lone year renders as a dot rather than vanishing." -- site/lib/metro-trend-types.ts site/lib/metro-trend.ts site/tests/metro-trend.test.ts
```

---

### Task 5: Emit entry point and the archive backfill (BLOCKED on data)

**Files:** create `pipeline/emit-metro-trends.ts`; modify `pipeline/run.ts`, `package.json`; generated `site/public/data/trends/*.json`, `data/history/oews-msa-*.json`

- [ ] **Step 1: Create `pipeline/emit-metro-trends.ts`:**

```ts
// Executable entry point for `npm run emit:metro-trends`. Reads the committed MSA archive and
// writes one file per metro into site/public/data/trends/.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { OUT_DIR } from './config'
import { buildMetroTrend } from './lib/build-metro-trends'
import { detectDelineation } from './lib/delineation'
import { HISTORY_DIR, type MsaArchive } from './lib/history'

const cpiFile = path.join(HISTORY_DIR, 'cpi-u.json')
if (!existsSync(cpiFile)) { console.error(`missing ${cpiFile} — run 'npm run archive:cpi'`); process.exit(1) }
const cpi = JSON.parse(readFileSync(cpiFile, 'utf8')) as { values: Record<string, number> }
const cpiByYear: Record<number, number> = {}
for (const [y, v] of Object.entries(cpi.values)) cpiByYear[Number(y)] = v

const files = readdirSync(HISTORY_DIR).filter(f => /^oews-msa-\d{4}\.json$/.test(f)).sort()
if (files.length === 0) { console.error(`no oews-msa-*.json in ${HISTORY_DIR} — run 'npm run archive:msa'`); process.exit(1) }
const archives: MsaArchive[] = files.map(f => JSON.parse(readFileSync(path.join(HISTORY_DIR, f), 'utf8')))
const base = Math.max(...archives.map(a => a.year))

const delineation = detectDelineation(archives)
const outDir = path.join(OUT_DIR, 'trends')
// Stale output is removed only now, after every read above succeeded — a failed run must never
// destroy the previously-committed good output.
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const cbsas = [...new Set(archives.flatMap(a => Object.keys(a.metros)))].sort()
let written = 0
const brokenMetros: string[] = []
for (const cbsa of cbsas) {
  const trend = buildMetroTrend(cbsa, archives, cpiByYear, base, delineation)
  if (!trend) continue
  writeFileSync(path.join(outDir, `${cbsa}.json`), JSON.stringify(trend))
  if (trend.breaks.length) brokenMetros.push(cbsa)
  written++
}
console.log(`wrote ${written} metro trend files — ${archives[0].year}–${base}, base ${base} dollars`)
console.log(`${brokenMetros.length} of ${written} metros have at least one delineation break`)
```

Add to root `package.json` scripts: `"emit:metro-trends": "tsx pipeline/emit-metro-trends.ts",`

- [ ] **Step 2: Stamp `trendYears` onto meta.** In `pipeline/run.ts`, after `meta` is built and before it is written, add:

```ts
// trendYears lets the panel skip the metro-trend fetch entirely for metros with no history,
// exactly as lcaFilings === 0 already gates the employers fetch.
const msaFiles = readdirSync(HISTORY_DIR).filter(f => /^oews-msa-\d{4}\.json$/.test(f))
const trendYearsByCbsa = new Map<string, number>()
for (const f of msaFiles) {
  const a = JSON.parse(readFileSync(path.join(HISTORY_DIR, f), 'utf8')) as { metros: Record<string, unknown> }
  for (const cbsa of Object.keys(a.metros)) trendYearsByCbsa.set(cbsa, (trendYearsByCbsa.get(cbsa) ?? 0) + 1)
}
for (const m of meta.metros) (m as MetroMeta & { trendYears: number }).trendYears = trendYearsByCbsa.get(m.cbsa) ?? 0
```

Import `HISTORY_DIR` from `./lib/history` and `readFileSync`/`readdirSync` from `node:fs` if not already imported. Add `trendYears: number` to `MetroMeta` in `pipeline/lib/emit.ts` **and** `site/lib/types.ts`.

- [ ] **Step 3: Acquire the data.** Download the six MSA vintages per the spec, ~5s apart. Then:

```bash
npm run archive:msa
```
Expected: seven `WROTE:` lines, `7 written, 0 skipped, 0 missing, 0 errored`.

⚠️ **If a vintage errors on schema drift, that is expected and informative** — the national files showed lowercase headers in 2019. Report the exact error rather than working around it; `parse-oews.ts` may need the same case-insensitive treatment `parse-oews-nat.ts` has.

- [ ] **Step 4: Emit and measure.**

```bash
npm run emit:metro-trends
du -sh site/public/data/trends
ls site/public/data/trends | wc -l
```

**Report the delineation-break count.** The spec flags this as the deferred open question: if most metros have a break, "break the line" produces fragmented charts and the design may need revisiting. Do not proceed silently past a bad number — raise it.

Sanity-check one metro (single physical line, `require()`):
```bash
npx tsx -e "const t=require('./site/public/data/trends/12420.json');console.log(t.name,'years',t.years.join(','),'breaks',JSON.stringify(t.breaks),'roles',Object.keys(t.roles).length);const r=t.roles['15-1252'];console.log('SWE nominal',r.nominal.join(','));console.log('SWE real',r.real.map(v=>v==null?'null':Math.round(v)).join(','))"
```

- [ ] **Step 5: Verify and commit.** `npm test`, `npx tsc --noEmit`, `npm run archive:verify`.

```bash
git add pipeline/emit-metro-trends.ts pipeline/run.ts pipeline/lib/emit.ts site/lib/types.ts package.json data/history site/public/data/trends
git commit -m "feat(pipeline): emit per-metro trend files; backfill the MSA archive

One file per metro, lazy-loaded by the panel. trendYears on meta.metros lets
the panel skip the fetch for metros with no history, mirroring lcaFilings." -- pipeline/emit-metro-trends.ts pipeline/run.ts pipeline/lib/emit.ts site/lib/types.ts package.json data/history site/public/data/trends
```

---

### Task 6: The loader

**Files:** modify `site/lib/data.ts`

- [ ] **Step 1: Add the loader**, matching the existing terse one-line style:

```ts
import type { MetroTrendData } from './metro-trend-types'
```
```ts
export const loadMetroTrend = (cbsa: string) => get<MetroTrendData>(`${BASE}/data/trends/${cbsa}.json`)
```

- [ ] **Step 2: Verify.** From `site/`: `npx tsc --noEmit`, `npm test`.

- [ ] **Step 3: Commit:**

```bash
git add site/lib/data.ts
git commit -m "feat(site): loadMetroTrend" -- site/lib/data.ts
```

---

### Task 7: `MetroTrend` component — including the RPP guard

**Files:** create `site/components/MetroTrend.tsx`; test `site/tests/metro-trend-component.test.tsx`

**Read the spec's "The trap this design exists to avoid" before writing this.** The component must NOT accept an `adjusted` prop. That is the guard, enforced structurally: if the prop does not exist, no future edit can accidentally deflate a time series with a spatial index.

- [ ] **Step 1: Write the failing test:**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MetroTrend } from '../components/MetroTrend'
import type { MetroTrendData } from '../lib/metro-trend-types'
import type { TrendsJson } from '../lib/trends-types'

const metro: MetroTrendData = {
  cbsa: '12420', name: 'Austin-Round Rock-San Marcos, TX',
  years: [2021, 2022, 2023, 2024, 2025],
  breaks: [2024],
  deflator: { series: 'CUUR0000SA0', period: 'May', base: 2025 },
  roles: { '15-1252': { nominal: [100, 110, null, 130, 140], real: [120, 118, null, 132, 140], capped: [false, false, false, false, false] } },
}

const national: TrendsJson = {
  years: [2021, 2022, 2023, 2024, 2025],
  headlineFrom: 2021, headlineTo: 2025,
  deflator: { series: 'CUUR0000SA0', period: 'May', base: 2025 },
  roles: { '15-1252': { label: 'Software Developers', short: 'SWE', firstYear: 2021,
    nominal: [1, 2, 3, 4, 5], real: [10, 11, 12, 13, 14], emp: [1, 1, 1, 1, 1],
    cappedP90: [false, false, false, false, false], changeReal: 0.4 } },
  skippedRoles: [], breaks: [],
}

describe('MetroTrend', () => {
  it('draws one polyline per connectable segment, not one across the gaps', () => {
    // 2023 is suppressed AND 2024 is a delineation break -> 3 segments
    const { container } = render(<MetroTrend metro={metro} national={national} soc="15-1252" roleLabel="Software Developers" />)
    expect(container.querySelectorAll('[data-metro-series]')).toHaveLength(3)
  })

  it('draws the national series, labelled so it is not mistaken for a second metro', () => {
    const { container } = render(<MetroTrend metro={metro} national={national} soc="15-1252" roleLabel="Software Developers" />)
    expect(container.querySelector('[data-national-series]')).toBeInTheDocument()
    expect(screen.getByText(/national/i)).toBeInTheDocument()
  })

  it('says the figures are inflation-adjusted, not cost-of-living adjusted', () => {
    render(<MetroTrend metro={metro} national={national} soc="15-1252" roleLabel="Software Developers" />)
    expect(screen.getByText(/not cost.of.living/i)).toBeInTheDocument()
  })

  it('explains a delineation break rather than leaving an unexplained gap', () => {
    render(<MetroTrend metro={metro} national={national} soc="15-1252" roleLabel="Software Developers" />)
    expect(screen.getByText(/boundary changed|redefined/i)).toBeInTheDocument()
  })

  it('says how many years it has when the series is thin', () => {
    const thin: MetroTrendData = { ...metro, roles: { '15-1252': { nominal: [100, null, null, null, null], real: [120, null, null, null, null], capped: [false, false, false, false, false] } } }
    render(<MetroTrend metro={thin} national={national} soc="15-1252" roleLabel="Software Developers" />)
    expect(screen.getByText(/1 year/i)).toBeInTheDocument()
  })

  it('says so plainly when the role was never published in this metro', () => {
    render(<MetroTrend metro={metro} national={national} soc="99-9999" roleLabel="Nonexistent" />)
    expect(screen.getByText(/not published/i)).toBeInTheDocument()
  })

  it('takes no cost-of-living prop — the RPP guard is structural', () => {
    // RPP is renormalised to US=100 annually, so it must never touch a time series. The component
    // cannot receive it, so no future edit can wire it in by accident.
    expect(Object.keys(MetroTrend.length ? {} : {})).not.toContain('adjusted')
    const src = MetroTrend.toString()
    expect(src).not.toMatch(/\badjusted\b/)
    expect(src).not.toMatch(/\brpp\b/i)
  })
})
```

- [ ] **Step 2: Run it, confirm FAIL.** From `site/`: `npx vitest run tests/metro-trend-component.test.tsx`. Quote the error.

- [ ] **Step 3: Implement `site/components/MetroTrend.tsx`.** Requirements, in your own layout following `TrendsPath.tsx`'s idiom:

- Props: `{ metro: MetroTrendData; national: TrendsJson; soc: string; roleLabel: string }`. **No `adjusted`.**
- `viewBox` scaled to container, no fixed pixel canvas (house rule in `globals.css`).
- One `<polyline data-metro-series>` per segment from `segments(metro, soc)`. A 1-point segment renders as a `<circle>` but must still carry `data-metro-series` so the count assertion holds.
- One `<polyline data-national-series>` from the national `real` array, visually subordinate, with a visible legend naming it "National".
- Shared y-domain across both series so they are comparable.
- A note stating: inflation-adjusted with CPI-U in `{metro.deflator.base}` dollars, **not** cost-of-living adjusted, and that the cost-of-living toggle does not affect it.
- If `metro.breaks.length`, a note naming the year(s) and saying the metro's boundary changed, so the gap is explained. Say the detection is based on the metro's published name changing.
- If the role has fewer than 3 non-null years, a note stating how many years of data exist ("Only 1 year of published data — not a trend").
- If `metro.roles[soc]` is absent, render only a note that the role was never published for this metro. Do not render an empty chart.
- **If the metro's series ends before the newest year** — i.e. its last non-null year is earlier than `metro.years[metro.years.length - 1]` — say so ("No data published for this metro after 2023"). The spec requires that a metro which disappeared mid-window is explained rather than shown as a line that silently stops. "Not published since" and "suppressed this year" are different facts; do not merge them into one message.

- [ ] **Step 4: Verify.** From `site/`: `npx vitest run tests/metro-trend-component.test.tsx` (7 pass), `npm test`, `npx tsc --noEmit`, `npm run lint`.

- [ ] **Step 5: Commit:**

```bash
git add site/components/MetroTrend.tsx site/tests/metro-trend-component.test.tsx
git commit -m "feat(site): MetroTrend panel section

One polyline per connectable segment; national ghosted behind and labelled.
Takes no cost-of-living prop by design — RPP is renormalised to US=100
annually, so it must never touch a time series, and a prop that does not exist
cannot be wired in by accident. A test asserts the component source mentions
neither." -- site/components/MetroTrend.tsx site/tests/metro-trend-component.test.tsx
```

---

### Task 8: Wire into `MetroPanel`

**Files:** modify `site/components/MetroPanel.tsx`; test `site/tests/metro-panel.test.tsx` (append)

- [ ] **Step 1: Write the failing test.** The file already exists with two metros in its `meta` fixture — `12420` (Austin, `lcaFilings: 13136`) and `99991` (Nowhere, `lcaFilings: 0`) — and an existing "lcaFilings 0 → never fetches" test that is the exact precedent for the skip case. Read it, then:

**(a)** Add `trendYears` to both fixture metros: `12420` gets `trendYears: 7`, `99991` gets `trendYears: 0`.

**(b)** Add `loadMetroTrend` to the existing `../lib/data` mock alongside `loadEmployers`, returning a fixture with a suppression gap and a break so the segment count is non-trivial.

**(c)** Append these tests, matching the file's existing render style:

```tsx
it('trendYears 0 -> renders no-history note and never fetches the trend', async () => {
  const { loadMetroTrend } = await import('../lib/data')
  vi.mocked(loadMetroTrend).mockClear()
  render(<MetroPanel meta={meta} salaries={salaries} cbsa="99991" soc="15-1252" adjusted={false} onClose={() => {}} />)
  expect(screen.getByText(/no published history/i)).toBeInTheDocument()
  expect(loadMetroTrend).not.toHaveBeenCalled()
})

it('toggling cost-of-living leaves the trend values untouched', async () => {
  // The RPP guard at the integration level: `adjusted` must not reach the trend. RPP is
  // renormalised to US=100 every year, so letting it deflate a time series would produce an
  // artifact that still looks like a chart.
  const { container, rerender } = render(
    <MetroPanel meta={meta} salaries={salaries} cbsa="12420" soc="15-1252" adjusted={false} onClose={() => {}} />)
  await waitFor(() => expect(container.querySelector('[data-metro-series]')).toBeInTheDocument())
  const before = [...container.querySelectorAll('[data-metro-series]')].map(n => n.getAttribute('points'))
  expect(before.length).toBeGreaterThan(0)

  rerender(<MetroPanel meta={meta} salaries={salaries} cbsa="12420" soc="15-1252" adjusted={true} onClose={() => {}} />)
  const after = [...container.querySelectorAll('[data-metro-series]')].map(n => n.getAttribute('points'))
  expect(after).toEqual(before)
})
```

The `expect(before.length).toBeGreaterThan(0)` line matters: without it, a component that rendered no series at all would make the equality assertion trivially true and the guard would pass while testing nothing.

- [ ] **Step 2: Run it, confirm FAIL.** Quote the error.

- [ ] **Step 3: Wire it up.** In `MetroPanel.tsx`:

```tsx
const [trend, setTrend] = useState<MetroTrendData | null>(null)
const [trendError, setTrendError] = useState(false)

useEffect(() => {
  setTrend(null); setTrendError(false)
  // Mirrors the employers guard: skip the fetch entirely when meta says there is nothing there.
  if (!metro || (metro.trendYears ?? 0) === 0) return
  let live = true
  loadMetroTrend(cbsa).then(t => { if (live) setTrend(t) }).catch(() => { if (live) setTrendError(true) })
  return () => { live = false }
}, [cbsa, metro])
```

Render below the "Pay by role" section:

```tsx
<h3 className="panel-sub">Pay over time — {role?.label}</h3>
{trendError
  ? <p className="panel-note">Couldn't load trend data — try re-selecting the metro.</p>
  : trend
    ? <MetroTrend metro={trend} national={national} soc={soc} roleLabel={role?.label ?? soc} />
    : (metro?.trendYears ?? 0) === 0
      ? <p className="panel-note">No published history for this metro.</p>
      : <p className="panel-note">Loading trend…</p>}
```

⚠️ **`adjusted` must not be passed to `<MetroTrend>`.** The component does not accept it; that is deliberate.

`national` (the Phase A `TrendsJson`) must reach the panel. Load it once in `site/app/page.tsx` alongside `meta`/`salaries` and pass it down — do not fetch it per metro selection.

- [ ] **Step 4: Verify.** From `site/`: `npm test`, `npx tsc --noEmit`, `npm run lint`.

- [ ] **Step 5: Commit:**

```bash
git add site/components/MetroPanel.tsx site/app/page.tsx site/tests/metro-panel.test.tsx
git commit -m "feat(site): render the metro trend in the panel

Skips the fetch when trendYears is 0, mirroring the employers guard. `adjusted`
is deliberately not passed through — see MetroTrend." -- site/components/MetroPanel.tsx site/app/page.tsx site/tests/metro-panel.test.tsx
```

---

### Task 9: Styles

**Files:** modify `site/app/globals.css`

- [ ] **Step 1: Add styles**, every selector scoped under `.page`. Before writing, `grep -n 'panel-sub\|panel-note' site/app/globals.css` and reuse what exists rather than duplicating.

Cover: `.mt-svg { width: 100%; height: auto }`; `.mt-line` base stroke; `.mt-national` strongly subordinate (low opacity, thin); `.mt-point` for single-year dots; `.mt-legend` small and muted; `.mt-break` dashed marker.

Constraints, all non-negotiable:
- **No fixed pixel widths** for label columns or chart canvases.
- **Do not modify `--surface`** — the `--soc-*` palette was validated against it.
- Reuse existing custom properties; invent no hex values. `--accent` is the established "selected/highlighted" token; `--ink-muted` and `--line` are the established subordinate-chrome tokens.

- [ ] **Step 2: Verify the served stylesheet actually updated.** Windows Next dev can miss `globals.css` hot-reloads, so a visual check alone can be judging stale CSS:

```bash
cd site && npm run dev   # then, in another shell:
CSS=$(curl -s http://localhost:3020/ | grep -oE '/_next/static/chunks/[^"]+\.css' | head -1)
curl -s "http://localhost:3020$CSS" | grep -c 'mt-national'
```
Expected: at least `1`. If `0`, restart the dev server before judging anything visually.

- [ ] **Step 3: Look at it.** Open a metro panel with a known break and confirm: segments are visibly separate, the national line is clearly subordinate but visible, and the panel is not now absurdly tall. **If the chart makes the panel unusable, say so** — a smaller sparkline treatment is a legitimate alternative and preferable to shipping a cramped panel.

- [ ] **Step 4: Commit:**

```bash
git add site/app/globals.css
git commit -m "feat(site): metro trend styles" -- site/app/globals.css
```

---

### Task 10: E2E and full verification (BLOCKED on data)

**Files:** create `site/e2e/metro-trend.spec.ts`

- [ ] **Step 1: Write the test.** Use a metro identified in Task 5 as having a real delineation break; do not invent a CBSA.

```ts
import { expect, test } from '@playwright/test'

test.describe('metro trend', () => {
  test('a metro with a delineation break renders separate segments', async ({ page }) => {
    await page.goto('/')
    // Open the metro panel via the map or the existing selection path used by happy-path.spec.ts —
    // read that spec and reuse its interaction rather than inventing a new one.
    // Then:
    await expect(page.locator('[data-metro-series]').first()).toBeVisible()
    expect(await page.locator('[data-metro-series]').count()).toBeGreaterThan(1)
  })

  test('the national comparison line is present and labelled', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-national-series]')).toBeVisible()
    await expect(page.getByText(/national/i).first()).toBeVisible()
  })

  test('toggling cost of living does not change the trend', async ({ page }) => {
    await page.goto('/')
    const before = await page.locator('[data-metro-series]').first().getAttribute('points')
    await page.getByRole('button', { name: /cost of living/i }).click()
    const after = await page.locator('[data-metro-series]').first().getAttribute('points')
    expect(after).toBe(before)
  })
})
```

- [ ] **Step 2: Run it.** From `site/`: `npx playwright test e2e/metro-trend.spec.ts`. If an assertion fails, print what actually rendered before changing the test — a wrong segment count means the data or the splitter is wrong, not the test.

- [ ] **Step 3: Full-stack verification.**

From root: `npm test && npx tsc --noEmit && npm run archive:verify`
From `site/`: `npm test && npx tsc --noEmit && npm run lint && npm run e2e`

Then the production build — `tsc` and every test can pass while `next build` fails:

```powershell
# PowerShell, NOT git-bash: MSYS rewrites the leading slash into a Windows path
Set-Location C:\projects\techpay-atlas\site; $env:NEXT_PUBLIC_BASE_PATH = '/techpay-atlas'; npm run build
```
Expected: build succeeds. Then confirm the data reached the export:
```bash
ls site/out/data/trends | wc -l
```

- [ ] **Step 4: Update `docs/BACKLOG.md`** with a Phase B close-out: what shipped, the measured delineation-break count, and the payload size. Follow the existing entry format.

- [ ] **Step 5: Commit:**

```bash
git add site/e2e/metro-trend.spec.ts docs/BACKLOG.md
git commit -m "test(site): metro trend e2e; close out phase B" -- site/e2e/metro-trend.spec.ts docs/BACKLOG.md
```

---

## Done criteria

- [ ] `npm test` green at root and in `site/`; `tsc --noEmit` clean in both; `npm run lint` clean.
- [ ] `npm run e2e` green.
- [ ] `NEXT_PUBLIC_BASE_PATH=/techpay-atlas npm run build` succeeds (from PowerShell) and `site/out/data/trends/` is populated.
- [ ] `data/history/oews-msa-2019.json` … `2025` committed.
- [ ] The RPP guard holds at both levels: `MetroTrend` source mentions neither `adjusted` nor `rpp`, and toggling cost-of-living leaves plotted points byte-identical.
- [ ] The delineation-break count is reported, and if most metros are affected, raised rather than shipped silently.
- [ ] Nothing pushed to `origin`.
