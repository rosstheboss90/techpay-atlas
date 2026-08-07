# `/trends` Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/trends` page answering "did tech pay keep up with inflation?" from the committed OEWS national archive, deflated by CPI-U.

**Architecture:** A pure pipeline builder turns `data/history/oews-nat-*.json` + `data/history/cpi-u.json` into a single small `site/public/data/trends.json`. The page renders two figures from it: a ranked bar chart of real % change 2021→2025 across all 21 roles, and a real-dollar path chart over each role's full available history on a shared 2019–2025 axis. All derivation is in pure `site/lib/trends.ts`; components render, they do not compute.

**Tech Stack:** TypeScript (ESM), tsx, vitest 4 (pipeline: node; site: jsdom + @testing-library/react), Next.js static export, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-06-trends-and-data-refresh-design.md` — read its **⚠️ CORRECTION** block first; it supersedes Decisions 1, 2 and 6.

---

## Conventions

- **Commit trailer** on every commit:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  ```
- **Conventional commits** (`feat(site):`, `fix(pipeline):`, `test(site):`, `docs:`) — the repo is consistent.
- **Do NOT push.** `deploy.yml` fires on push to `main` and runs no tests.
- **Pathspec on BOTH `git add` and `git commit`** — `site/next-env.d.ts` is modified and must never be committed.
- Pipeline tests: `npm test` from repo root. Site tests: `npm test` from `site/`. Both must be green.
- House style: no semicolons, 2-space indent, explanatory block comments.
- **`npx tsx -e` must be a single physical line using `require()`** — multi-line or `import` forms silently produce zero output and exit 0 on this box.

## Ground truth (measured, do not re-derive)

`data/history/` holds `cpi-u.json` and `oews-nat-2019.json` … `oews-nat-2025.json`.

- Registry-role coverage: **13/21 in 2019 and 2020**, 21/21 from 2021.
- The eight absent before 2021: `13-1082`, `15-1242`, `15-1243`, `15-1252`, `15-1253`, `15-1254`, `15-1255`, `15-2051`. All first appear in **2021**.
- CPI-U May values: 2019 `256.092`, 2020 `256.394`, 2021 `269.195`, 2022 `292.296`, 2023 `304.127`, 2024 `314.069`, 2025 `321.465`.
- **No registry role has a censored `p50` in any vintage.** Only `11-3021`'s p90 (2019–2024) and `15-1221`'s p90 (2021) are censored. Both figures plot p50, so neither touches a censored value.
- Worked example to test against: `15-1252` p50 is `120730` (2021) and `135980` (2025). In 2025 dollars, 2021 becomes `120730 × 321.465 / 269.195 = 144172.33…`, so `changeReal ≈ -0.0568`.

## File Structure

| File | Responsibility |
|---|---|
| `pipeline/lib/build-trends.ts` | **New.** Pure: archives + CPI → `TrendsJson`. No I/O. |
| `pipeline/emit-trends.ts` | **New.** Entry point `npm run emit:trends`. Reads `data/history`, writes `site/public/data/trends.json`. |
| `site/lib/trends-types.ts` | **New.** The `TrendsJson` shape as the site sees it. |
| `site/lib/trends.ts` | **New.** Pure derivations: ranking, series extraction, axis domain, formatting. |
| `site/lib/data.ts` | Add `loadTrends()`. |
| `site/components/TrendsRanked.tsx` | **New.** Figure 1 — ranked diverging bars. |
| `site/components/TrendsPath.tsx` | **New.** Figure 2 — ragged real-dollar path. |
| `site/app/trends/page.tsx` | **New.** The page: load, state, copy, both figures. |

`emit-trends.ts` is a separate entry point, not part of `run.ts`, for the same reason `archive-nat.ts` is: `run.ts` executes its whole body on import, needs a 6GB heap and the LCA files. Building `trends.json` needs only two small committed JSON inputs.

---

### Task 1: `build-trends.ts` — the pure builder

**Files:**
- Create: `pipeline/lib/build-trends.ts`
- Test: `pipeline/tests/build-trends.test.ts`

- [ ] **Step 1: Write the failing test**

Create `pipeline/tests/build-trends.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildTrends } from '../lib/build-trends'
import type { NationalArchive } from '../lib/history'

const band = (p50: number) => ({ emp: 100, p10: null, p25: null, p50, p75: null, p90: null, capped: [] })

const archive = (year: number, roles: Record<string, number>): NationalArchive => ({
  year, topCode: 239_200, source: `national_M${year}_dl.xlsx`,
  roles: Object.fromEntries(Object.entries(roles).map(([soc, p50]) => [soc, band(p50)])),
})

// Real CPI-U May values, so the arithmetic in these tests is the arithmetic that ships.
const cpi = { 2019: 256.092, 2020: 256.394, 2021: 269.195, 2022: 292.296, 2023: 304.127, 2024: 314.069, 2025: 321.465 }

describe('buildTrends', () => {
  it('lists years ascending across the archives given', () => {
    const out = buildTrends([archive(2021, { '15-1252': 1 }), archive(2019, { '11-3021': 1 })], cpi, 2025, 2021)
    expect(out.years).toEqual([2019, 2021])
  })

  it('deflates to the base year, leaving the base year nominal', () => {
    const out = buildTrends([archive(2025, { '15-1252': 135980 })], cpi, 2025, 2021)
    const r = out.roles['15-1252']
    expect(r.nominal).toEqual([135980])
    expect(r.real).toEqual([135980])
  })

  it('converts an earlier year into base-year dollars', () => {
    const out = buildTrends([archive(2021, { '15-1252': 120730 }), archive(2025, { '15-1252': 135980 })], cpi, 2025, 2021)
    const r = out.roles['15-1252']
    // 120730 * 321.465 / 269.195
    expect(r.real[0]).toBeCloseTo(144172.3, 0)
    expect(r.real[1]).toBe(135980)
  })

  it('computes changeReal over the headline window', () => {
    const out = buildTrends([archive(2021, { '15-1252': 120730 }), archive(2025, { '15-1252': 135980 })], cpi, 2025, 2021)
    expect(out.roles['15-1252'].changeReal).toBeCloseTo(-0.0569, 3)
  })

  it('pads a role absent from an early vintage with nulls and records firstYear', () => {
    const out = buildTrends(
      [archive(2019, { '11-3021': 100000 }), archive(2021, { '11-3021': 110000, '15-1252': 120730 })],
      cpi, 2025, 2021)
    const swe = out.roles['15-1252']
    expect(swe.firstYear).toBe(2021)
    expect(swe.nominal).toEqual([null, 120730])
    expect(swe.real[0]).toBeNull()
  })

  it('marks a censored p90 per year without affecting the plotted p50', () => {
    const a = archive(2021, { '11-3021': 150000 })
    a.roles['11-3021'].p90 = 208_000
    a.roles['11-3021'].capped = ['p90']
    const out = buildTrends([a, archive(2025, { '11-3021': 180000 })], cpi, 2025, 2021)
    expect(out.roles['11-3021'].cappedP90).toEqual([true, false])
    expect(out.roles['11-3021'].nominal).toEqual([150000, 180000])
  })

  it('throws when the headline start year is missing from the archives', () => {
    expect(() => buildTrends([archive(2019, { '11-3021': 1 })], cpi, 2025, 2021))
      .toThrow(/headline start year 2021 is not among the archived vintages/)
  })

  it('throws when a year has no CPI value rather than silently dropping it', () => {
    expect(() => buildTrends([archive(2021, { '15-1252': 1 })], { 2025: 321.465 }, 2025, 2021))
      .toThrow(/no CPI value for 2021/)
  })

  it('throws when a role is missing from the headline start year', () => {
    // Every role must exist at the headline start, or its bar would be uncomparable.
    const out = () => buildTrends(
      [archive(2021, { '11-3021': 1 }), archive(2025, { '11-3021': 2, '15-1252': 3 })], cpi, 2025, 2021)
    expect(out).toThrow(/15-1252 is absent from the headline start year 2021/)
  })
})
```

- [ ] **Step 2: Run it and confirm it FAILS**

Run: `npx vitest run pipeline/tests/build-trends.test.ts`
Expected: FAIL — `Failed to resolve import "../lib/build-trends"`.

- [ ] **Step 3: Implement `pipeline/lib/build-trends.ts`**

```ts
import { ROLES } from './soc'
import type { NationalArchive } from './history'

export interface TrendsRole {
  label: string
  short: string
  firstYear: number
  nominal: (number | null)[]
  real: (number | null)[]
  emp: (number | null)[]
  cappedP90: boolean[]
  changeReal: number
}

export interface TrendsJson {
  years: number[]
  headlineFrom: number
  headlineTo: number
  deflator: { series: string; period: string; base: number }
  roles: Record<string, TrendsRole>
  skippedRoles: string[]
  breaks: { year: number; note: string }[]
}

/** Archives + CPI -> the site's trends contract, in `base`-year dollars.
 *
 *  Deflation is CPI-U May-to-May: OEWS's reference period is May, so no interpolation is needed.
 *  BEA RPP is deliberately NOT used here — it is a SPATIAL index renormalised to US=100 every
 *  year, so an RPP-adjusted series over time measures nothing coherent.
 *
 *  `headlineFrom` is the earliest year every role exists as its own SOC code. Roles that predate
 *  it keep their longer history in `nominal`/`real`; only the headline number is windowed, so the
 *  ranked figure compares like with like while the path figure stays honest about what it has. */
export function buildTrends(
  archives: readonly NationalArchive[],
  cpiMayByYear: Readonly<Record<number, number>>,
  base: number,
  headlineFrom: number,
): TrendsJson {
  const sorted = [...archives].sort((a, b) => a.year - b.year)
  const years = sorted.map(a => a.year)
  if (!years.includes(headlineFrom)) {
    throw new Error(`headline start year ${headlineFrom} is not among the archived vintages (${years.join(', ')})`)
  }
  const baseCpi = cpiMayByYear[base]
  if (baseCpi === undefined) throw new Error(`no CPI value for base year ${base}`)
  for (const y of years) {
    if (cpiMayByYear[y] === undefined) throw new Error(`no CPI value for ${y} — the deflator is short`)
  }

  const headlineTo = years[years.length - 1]
  const iFrom = years.indexOf(headlineFrom)
  const iTo = years.indexOf(headlineTo)

  const roles: Record<string, TrendsRole> = {}
  for (const role of ROLES) {
    const nominal = sorted.map(a => a.roles[role.soc]?.p50 ?? null)
    const emp = sorted.map(a => a.roles[role.soc]?.emp ?? null)
    const cappedP90 = sorted.map(a => (a.roles[role.soc]?.capped ?? []).includes('p90'))
    const real = nominal.map((v, i) => (v === null ? null : v * (baseCpi / cpiMayByYear[years[i]])))

    const first = years.find((_, i) => nominal[i] !== null)
    if (first === undefined) continue // role in the registry but in no archived vintage at all

    const a = real[iFrom], b = real[iTo]
    if (a === null || a === 0 || b === null) {
      throw new Error(`${role.soc} is absent from the headline start year ${headlineFrom} — it cannot be ranked`)
    }
    roles[role.soc] = {
      label: role.label, short: role.short, firstYear: first,
      nominal, real, emp, cappedP90, changeReal: b / a - 1,
    }
  }

  return {
    years,
    headlineFrom,
    headlineTo,
    deflator: { series: 'CUUR0000SA0', period: 'May', base },
    roles,
    breaks: [{
      year: headlineFrom,
      note: 'BLS split several combined occupation codes into detailed ones in May 2021. Eight of these roles have no separate data before then.',
    }],
  }
}
```

- [ ] **Step 4: Run it and confirm it PASSES**

Run: `npx vitest run pipeline/tests/build-trends.test.ts` — expected PASS (9 tests).
Run: `npm test` — expected all green.
Run: `npx tsc --noEmit` — expected clean.

- [ ] **Step 5: Commit**

```bash
git add pipeline/lib/build-trends.ts pipeline/tests/build-trends.test.ts
git commit -m "feat(pipeline): pure trends builder — archives + CPI to base-year dollars

CPI-U May-to-May, so no interpolation against OEWS's May reference period.
BEA RPP is deliberately unused: it is a spatial index renormalised to US=100
every year, so deflating over time with it measures nothing.

Only the headline number is windowed to the year every role exists as its own
SOC code; nominal/real keep each role's full history so the path figure stays
honest about what it actually has." -- pipeline/lib/build-trends.ts pipeline/tests/build-trends.test.ts
```

---

### Task 2: `emit-trends.ts` and the generated `trends.json`

**Files:**
- Create: `pipeline/emit-trends.ts`
- Modify: `package.json` (root)
- Generated: `site/public/data/trends.json`

- [ ] **Step 1: Create the entry point**

```ts
// Executable entry point for `npm run emit:trends`. Reads the committed archive in data/history
// and writes site/public/data/trends.json.
//
// Separate from run.ts on purpose: run.ts executes its whole body on import, needs a 6GB heap and
// the LCA workbooks. This needs two small committed JSON files and nothing else.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { OUT_DIR } from './config'
import { buildTrends } from './lib/build-trends'
import { HISTORY_DIR, type NationalArchive } from './lib/history'

const HEADLINE_FROM = 2021 // earliest year all 21 registry roles exist as their own SOC code

const cpiFile = path.join(HISTORY_DIR, 'cpi-u.json')
if (!existsSync(cpiFile)) {
  console.error(`missing ${cpiFile} — run 'npm run archive:cpi'`)
  process.exit(1)
}
const cpi = JSON.parse(readFileSync(cpiFile, 'utf8')) as { values: Record<string, number> }
const cpiByYear: Record<number, number> = {}
for (const [y, v] of Object.entries(cpi.values)) cpiByYear[Number(y)] = v

const files = readdirSync(HISTORY_DIR).filter(f => /^oews-nat-\d{4}\.json$/.test(f)).sort()
if (files.length === 0) {
  console.error(`no oews-nat-*.json in ${HISTORY_DIR} — run 'npm run archive:nat'`)
  process.exit(1)
}
const archives: NationalArchive[] = files.map(f => JSON.parse(readFileSync(path.join(HISTORY_DIR, f), 'utf8')))
const base = Math.max(...archives.map(a => a.year))

const trends = buildTrends(archives, cpiByYear, base, HEADLINE_FROM)
writeFileSync(path.join(OUT_DIR, 'trends.json'), JSON.stringify(trends))
const n = Object.keys(trends.roles).length
console.log(`wrote trends.json — ${n} roles, ${trends.years[0]}–${base}, headline ${HEADLINE_FROM}→${trends.headlineTo}, base ${base} dollars`)
```

Add to root `package.json` scripts:

```json
    "emit:trends": "tsx pipeline/emit-trends.ts",
```

- [ ] **Step 2: Generate and sanity-check the real file**

Run: `npm run emit:trends`
Expected: `wrote trends.json — 21 roles, 2019–2025, headline 2021→2025, base 2025 dollars`

Verify the worked example against measured ground truth:

```bash
npx tsx -e "const t=require('./site/public/data/trends.json');const r=t.roles['15-1252'];console.log('years',t.years.join(','));console.log('SWE firstYear',r.firstYear,'changeReal',r.changeReal.toFixed(4));console.log('SWE real',r.real.map(v=>v==null?'null':Math.round(v)).join(','));console.log('roles',Object.keys(t.roles).length)"
```

Required: `firstYear 2021`, `changeReal` ≈ `-0.0569`, `roles 21`, and `real` beginning `null,null,`.
**If `changeReal` is not close to −0.0569, STOP** — the deflation is wrong; do not commit the file.

Check the file size is sane:

```bash
ls -la site/public/data/trends.json
```
Expected: well under 100KB.

- [ ] **Step 3: Confirm nothing else regressed**

Run: `npm test && npx tsc --noEmit` — both green/clean.

- [ ] **Step 4: Commit**

```bash
git add pipeline/emit-trends.ts package.json site/public/data/trends.json
git commit -m "feat(pipeline): emit:trends entry point and generated trends.json

Reads the committed data/history archive; needs neither the 6GB heap nor the
LCA workbooks, so it is its own entry point rather than part of run.ts." -- pipeline/emit-trends.ts package.json site/public/data/trends.json
```

---

### Task 3: Site types, loader, and pure derivations

**Files:**
- Create: `site/lib/trends-types.ts`
- Create: `site/lib/trends.ts`
- Modify: `site/lib/data.ts`
- Test: `site/tests/trends.test.ts`

- [ ] **Step 1: Create the shared type**

`site/lib/trends-types.ts` — mirrors the pipeline contract. The site cannot import from `pipeline/`, so this is the deliberate duplicate, same as `site/lib/title-types.ts` already does for `titles.json`.

```ts
export interface TrendsRole {
  label: string
  short: string
  firstYear: number
  nominal: (number | null)[]
  real: (number | null)[]
  emp: (number | null)[]
  cappedP90: boolean[]
  changeReal: number
}

export interface TrendsJson {
  years: number[]
  headlineFrom: number
  headlineTo: number
  deflator: { series: string; period: string; base: number }
  roles: Record<string, TrendsRole>
  skippedRoles: string[]
  breaks: { year: number; note: string }[]
}
```

- [ ] **Step 2: Add the loader**

In `site/lib/data.ts`, add the import and the export (matching the existing one-line style):

```ts
import type { TrendsJson } from './trends-types'
```
```ts
export const loadTrends = () => get<TrendsJson>(`${BASE}/data/trends.json`)
```

- [ ] **Step 3: Write the failing test**

Create `site/tests/trends.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { pathPoints, rankByChange, realDomain } from '../lib/trends'
import type { TrendsJson } from '../lib/trends-types'

const fixture: TrendsJson = {
  years: [2019, 2020, 2021, 2022],
  headlineFrom: 2021,
  headlineTo: 2022,
  deflator: { series: 'CUUR0000SA0', period: 'May', base: 2022 },
  roles: {
    '15-1252': { label: 'Software Developers', short: 'SWE', firstYear: 2021,
      nominal: [null, null, 100, 110], real: [null, null, 120, 110], emp: [null, null, 5, 6],
      cappedP90: [false, false, false, false], changeReal: -0.0833 },
    '11-3021': { label: 'IT Managers', short: 'IT Mgr', firstYear: 2019,
      nominal: [80, 85, 90, 100], real: [95, 98, 105, 100], emp: [1, 2, 3, 4],
      cappedP90: [true, true, false, false], changeReal: 0.25 },
  },
  breaks: [{ year: 2021, note: 'split' }],
}

describe('rankByChange', () => {
  it('orders roles by real change, largest gain first', () => {
    expect(rankByChange(fixture).map(r => r.soc)).toEqual(['11-3021', '15-1252'])
  })
  it('carries the label and change through for rendering', () => {
    const top = rankByChange(fixture)[0]
    expect(top.short).toBe('IT Mgr')
    expect(top.changeReal).toBeCloseTo(0.25, 4)
  })
  it('includes every role — the headline window makes them all comparable', () => {
    expect(rankByChange(fixture)).toHaveLength(2)
  })
})

describe('pathPoints', () => {
  it('drops leading nulls so a ragged series starts where its data does', () => {
    expect(pathPoints(fixture, '15-1252')).toEqual([
      { year: 2021, value: 120 }, { year: 2022, value: 110 },
    ])
  })
  it('returns the full series for a role present throughout', () => {
    expect(pathPoints(fixture, '11-3021')).toHaveLength(4)
  })
  it('returns an empty array for an unknown role rather than throwing', () => {
    expect(pathPoints(fixture, '99-9999')).toEqual([])
  })
})

describe('realDomain', () => {
  it('spans the min and max real value across every role', () => {
    expect(realDomain(fixture)).toEqual([95, 120])
  })
  it('ignores nulls', () => {
    const only = { ...fixture, roles: { '15-1252': fixture.roles['15-1252'] } }
    expect(realDomain(only)).toEqual([110, 120])
  })
})
```

- [ ] **Step 4: Run it and confirm it FAILS**

Run (from `site/`): `npx vitest run tests/trends.test.ts`
Expected: FAIL — `Failed to resolve import "../lib/trends"`.

- [ ] **Step 5: Implement `site/lib/trends.ts`**

```ts
import type { TrendsJson } from './trends-types'

export interface RankedRole { soc: string; label: string; short: string; changeReal: number }
export interface PathPoint { year: number; value: number }

/** Roles ordered by real change over the headline window, largest gain first.
 *
 *  No role is excluded: the headline window starts at the first year every role exists as its own
 *  SOC code, so every bar spans an identical period and the ranking is comparable throughout. */
export function rankByChange(t: TrendsJson): RankedRole[] {
  return Object.entries(t.roles)
    .map(([soc, r]) => ({ soc, label: r.label, short: r.short, changeReal: r.changeReal }))
    .sort((a, b) => b.changeReal - a.changeReal)
}

/** Real-dollar points for one role, leading nulls dropped so the line begins where its data does.
 *
 *  Eight roles start in 2021 because BLS did not publish them as separate codes before then —
 *  a classification fact, not a pay fact. `TrendsRole.firstYear` carries that per role if a view
 *  ever needs to annotate it; nothing does today, so there is no accessor for it. */
export function pathPoints(t: TrendsJson, soc: string): PathPoint[] {
  const role = t.roles[soc]
  if (!role) return []
  const out: PathPoint[] = []
  role.real.forEach((v, i) => { if (v !== null) out.push({ year: t.years[i], value: v }) })
  return out
}

/** [min, max] real value across all roles, so every path shares one y-axis and the ghosted
 *  lines stay comparable to the highlighted one. */
export function realDomain(t: TrendsJson): [number, number] {
  const vals = Object.values(t.roles).flatMap(r => r.real).filter((v): v is number => v !== null)
  return [Math.min(...vals), Math.max(...vals)]
}
```

- [ ] **Step 6: Run it and confirm it PASSES**

Run (from `site/`): `npx vitest run tests/trends.test.ts` — expected PASS (8 tests).
Run (from `site/`): `npm test && npx tsc --noEmit` — green/clean.

- [ ] **Step 7: Commit**

```bash
git add site/lib/trends-types.ts site/lib/trends.ts site/lib/data.ts site/tests/trends.test.ts
git commit -m "feat(site): trends types, loader, and pure derivations" -- site/lib/trends-types.ts site/lib/trends.ts site/lib/data.ts site/tests/trends.test.ts
```

---

### Task 4: `TrendsRanked` — the headline figure

**Files:**
- Create: `site/components/TrendsRanked.tsx`
- Test: `site/tests/trends-ranked.test.tsx`

**Sizing rule this repo enforces:** no fixed pixel widths for label columns or chart canvases. Size labels to content with `ch` units and let the chart claim its container. See the header comment in `site/app/globals.css`; a previous pass had to undo exactly this mistake across six sections.

- [ ] **Step 1: Write the failing test**

Create `site/tests/trends-ranked.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TrendsRanked } from '../components/TrendsRanked'
import type { TrendsJson } from '../lib/trends-types'

const fixture: TrendsJson = {
  years: [2021, 2022],
  headlineFrom: 2021,
  headlineTo: 2022,
  deflator: { series: 'CUUR0000SA0', period: 'May', base: 2022 },
  roles: {
    '15-1252': { label: 'Software Developers', short: 'SWE', firstYear: 2021,
      nominal: [100, 110], real: [120, 110], emp: [5, 6], cappedP90: [false, false], changeReal: -0.0833 },
    '11-3021': { label: 'IT Managers', short: 'IT Mgr', firstYear: 2021,
      nominal: [90, 100], real: [80, 100], emp: [3, 4], cappedP90: [false, false], changeReal: 0.25 },
  },
  breaks: [],
}

describe('TrendsRanked', () => {
  it('renders one bar row per role', () => {
    render(<TrendsRanked trends={fixture} selected="15-1252" onSelect={() => {}} />)
    expect(screen.getByText('Software Developers')).toBeInTheDocument()
    expect(screen.getByText('IT Managers')).toBeInTheDocument()
  })

  it('orders gains above losses', () => {
    const { container } = render(<TrendsRanked trends={fixture} selected="15-1252" onSelect={() => {}} />)
    const labels = [...container.querySelectorAll('[data-role-label]')].map(n => n.textContent)
    expect(labels).toEqual(['IT Managers', 'Software Developers'])
  })

  it('shows the change as a signed percentage', () => {
    render(<TrendsRanked trends={fixture} selected="15-1252" onSelect={() => {}} />)
    expect(screen.getByText('+25.0%')).toBeInTheDocument()
    expect(screen.getByText('−8.3%')).toBeInTheDocument()
  })

  it('marks the selected role', () => {
    const { container } = render(<TrendsRanked trends={fixture} selected="11-3021" onSelect={() => {}} />)
    expect(container.querySelector('[data-selected="true"]')?.textContent).toContain('IT Managers')
  })

  it('calls onSelect with the SOC when a row is clicked', async () => {
    const onSelect = vi.fn()
    render(<TrendsRanked trends={fixture} selected="15-1252" onSelect={onSelect} />)
    screen.getByText('IT Managers').click()
    expect(onSelect).toHaveBeenCalledWith('11-3021')
  })

  it('states the window and the deflator so the number is not free-floating', () => {
    render(<TrendsRanked trends={fixture} selected="15-1252" onSelect={() => {}} />)
    expect(screen.getByText(/2021.*2022/)).toBeInTheDocument()
    expect(screen.getByText(/CPI-U/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it and confirm it FAILS**

Run (from `site/`): `npx vitest run tests/trends-ranked.test.tsx`
Expected: FAIL — cannot resolve `../components/TrendsRanked`.

- [ ] **Step 3: Implement `site/components/TrendsRanked.tsx`**

```tsx
'use client'
import { rankByChange } from '../lib/trends'
import type { TrendsJson } from '../lib/trends-types'

const pct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}%`

/** Real % change over the headline window, one bar per role, diverging from a zero line that
 *  means "exactly kept pace with inflation".
 *
 *  Every bar spans the same window, so no role is excluded and no footnote is needed about
 *  missing ones — that is the whole reason the headline is windowed rather than starting at the
 *  earliest archived year. Widths are percentages of the container; no fixed px (repo rule). */
export function TrendsRanked({ trends, selected, onSelect }: {
  trends: TrendsJson
  selected: string
  onSelect: (soc: string) => void
}) {
  const ranked = rankByChange(trends)
  const max = Math.max(...ranked.map(r => Math.abs(r.changeReal)), 0.0001)

  return (
    <figure className="tr-ranked">
      <figcaption className="t-caption">
        Real change in median pay, {trends.headlineFrom}–{trends.headlineTo}, adjusted for
        inflation (CPI-U, {trends.deflator.base} dollars). Bars right of the line beat inflation.
      </figcaption>
      <ul className="tr-rows">
        {ranked.map(r => {
          const w = (Math.abs(r.changeReal) / max) * 50 // half-width each side of centre
          return (
            <li
              key={r.soc}
              className="tr-row"
              data-selected={r.soc === selected}
              onClick={() => onSelect(r.soc)}
            >
              <span className="tr-label" data-role-label>{r.label}</span>
              <span className="tr-track">
                <span
                  className={r.changeReal >= 0 ? 'tr-bar tr-pos' : 'tr-bar tr-neg'}
                  style={r.changeReal >= 0
                    ? { left: '50%', width: `${w}%` }
                    : { right: '50%', width: `${w}%` }}
                />
              </span>
              <span className="tr-value">{pct(r.changeReal)}</span>
            </li>
          )
        })}
      </ul>
    </figure>
  )
}
```

- [ ] **Step 4: Run it and confirm it PASSES**

Run (from `site/`): `npx vitest run tests/trends-ranked.test.tsx` — expected PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add site/components/TrendsRanked.tsx site/tests/trends-ranked.test.tsx
git commit -m "feat(site): TrendsRanked headline figure

Every bar spans the same window, so no role is excluded and the ranking needs
no caveat about missing ones. Percentage widths, no fixed px, per the sizing
rule in globals.css." -- site/components/TrendsRanked.tsx site/tests/trends-ranked.test.tsx
```

---

### Task 5: `TrendsPath` — the ragged path figure

**Files:**
- Create: `site/components/TrendsPath.tsx`
- Test: `site/tests/trends-path.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `site/tests/trends-path.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TrendsPath } from '../components/TrendsPath'
import type { TrendsJson } from '../lib/trends-types'

const fixture: TrendsJson = {
  years: [2019, 2020, 2021, 2022],
  headlineFrom: 2021,
  headlineTo: 2022,
  deflator: { series: 'CUUR0000SA0', period: 'May', base: 2022 },
  roles: {
    '15-1252': { label: 'Software Developers', short: 'SWE', firstYear: 2021,
      nominal: [null, null, 100, 110], real: [null, null, 120, 110], emp: [null, null, 5, 6],
      cappedP90: [false, false, false, false], changeReal: -0.0833 },
    '11-3021': { label: 'IT Managers', short: 'IT Mgr', firstYear: 2019,
      nominal: [80, 85, 90, 100], real: [95, 98, 105, 100], emp: [1, 2, 3, 4],
      cappedP90: [true, true, false, false], changeReal: 0.25 },
  },
  breaks: [{ year: 2021, note: 'BLS split combined codes in May 2021.' }],
}

describe('TrendsPath', () => {
  it('draws a line per role', () => {
    const { container } = render(<TrendsPath trends={fixture} selected="15-1252" />)
    expect(container.querySelectorAll('[data-series]')).toHaveLength(2)
  })

  it('marks the selected series so the others can be ghosted', () => {
    const { container } = render(<TrendsPath trends={fixture} selected="15-1252" />)
    const sel = container.querySelector('[data-series="15-1252"]')
    expect(sel?.getAttribute('data-highlighted')).toBe('true')
    expect(container.querySelector('[data-series="11-3021"]')?.getAttribute('data-highlighted')).toBe('false')
  })

  it('starts a ragged series at its own first year, not at the axis origin', () => {
    const { container } = render(<TrendsPath trends={fixture} selected="15-1252" />)
    // 2021 is index 2 of 4 -> the polyline must not contain a point at the leftmost x (0)
    const pts = container.querySelector('[data-series="15-1252"]')?.getAttribute('points') ?? ''
    const firstX = Number(pts.trim().split(/[\s,]+/)[0])
    expect(firstX).toBeGreaterThan(0)
  })

  it('renders a break marker for each recorded break', () => {
    const { container } = render(<TrendsPath trends={fixture} selected="15-1252" />)
    expect(container.querySelectorAll('[data-break]')).toHaveLength(1)
  })

  it('explains the ragged start rather than leaving it unexplained', () => {
    render(<TrendsPath trends={fixture} selected="15-1252" />)
    expect(screen.getByText(/split combined codes/i)).toBeInTheDocument()
  })

  it('names the selected role in the caption', () => {
    render(<TrendsPath trends={fixture} selected="15-1252" />)
    expect(screen.getByText(/Software Developers/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it and confirm it FAILS**

Run (from `site/`): `npx vitest run tests/trends-path.test.tsx`
Expected: FAIL — cannot resolve `../components/TrendsPath`.

- [ ] **Step 3: Implement `site/components/TrendsPath.tsx`**

```tsx
'use client'
import { pathPoints, realDomain } from '../lib/trends'
import type { TrendsJson } from '../lib/trends-types'

const W = 1000, H = 420, PAD_L = 64, PAD_R = 16, PAD_T = 16, PAD_B = 36

/** Real median pay over each role's full available history, on a shared axis.
 *
 *  The left edge is deliberately ragged: eight roles have no separate BLS code before 2021, so
 *  their lines start there. That is a classification fact, not a pay fact, and the break marker
 *  says so. Drawing them from the axis origin would invent data.
 *
 *  viewBox scales to the container — no fixed pixel canvas (repo rule). */
export function TrendsPath({ trends, selected }: { trends: TrendsJson; selected: string }) {
  const years = trends.years
  const [lo, hi] = realDomain(trends)
  const x = (year: number) => PAD_L + ((year - years[0]) / Math.max(1, years[years.length - 1] - years[0])) * (W - PAD_L - PAD_R)
  const y = (v: number) => PAD_T + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - PAD_T - PAD_B)

  const socs = Object.keys(trends.roles)
  const sel = trends.roles[selected]

  return (
    <figure className="tr-path">
      <figcaption className="t-caption">
        Median pay in {trends.deflator.base} dollars{sel ? <> — <b>{sel.label}</b> highlighted</> : null}.
        Adjusted for inflation with CPI-U ({trends.deflator.period}-to-{trends.deflator.period}).
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Real median pay over time by role" className="tr-svg">
        {trends.breaks.map(b => (
          <line key={b.year} data-break x1={x(b.year)} x2={x(b.year)} y1={PAD_T} y2={H - PAD_B} className="tr-break" />
        ))}
        {socs.map(soc => {
          const pts = pathPoints(trends, soc)
          if (pts.length === 0) return null
          return (
            <polyline
              key={soc}
              data-series={soc}
              data-highlighted={soc === selected}
              className={soc === selected ? 'tr-line tr-line-sel' : 'tr-line tr-line-ghost'}
              points={pts.map(p => `${x(p.year)},${y(p.value)}`).join(' ')}
              fill="none"
            />
          )
        })}
        {years.map(yr => (
          <text key={yr} x={x(yr)} y={H - 10} textAnchor="middle" className="tr-tick">{yr}</text>
        ))}
      </svg>
      {trends.breaks.map(b => (
        <p key={b.year} className="t-note">{b.note}</p>
      ))}
    </figure>
  )
}
```

- [ ] **Step 4: Run it and confirm it PASSES**

Run (from `site/`): `npx vitest run tests/trends-path.test.tsx` — expected PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add site/components/TrendsPath.tsx site/tests/trends-path.test.tsx
git commit -m "feat(site): TrendsPath ragged real-dollar path figure

Each line starts at the role's own first year. Eight roles have no separate BLS
code before 2021; drawing them from the axis origin would invent data, so the
left edge is ragged and a break marker explains why." -- site/components/TrendsPath.tsx site/tests/trends-path.test.tsx
```

---

### Task 6: The `/trends` page

**Files:**
- Create: `site/app/trends/page.tsx`
- Test: `site/tests/trends-page.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `site/tests/trends-page.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrendsJson } from '../lib/trends-types'

const fixture: TrendsJson = {
  years: [2021, 2022],
  headlineFrom: 2021,
  headlineTo: 2022,
  deflator: { series: 'CUUR0000SA0', period: 'May', base: 2022 },
  roles: {
    '15-1252': { label: 'Software Developers', short: 'SWE', firstYear: 2021,
      nominal: [100, 110], real: [120, 110], emp: [5, 6], cappedP90: [false, false], changeReal: -0.0833 },
  },
  breaks: [{ year: 2021, note: 'BLS split combined codes in May 2021.' }],
}

vi.mock('../lib/data', () => ({ loadTrends: vi.fn(async () => fixture) }))

// NOTE: a concise-arrow beforeEach would return the mock and vitest would run it as cleanup.
// Keep the braces.
beforeEach(() => {
  window.history.replaceState(null, '', '/trends')
})

describe('/trends page', () => {
  it('renders both figures once data loads', async () => {
    const Page = (await import('../app/trends/page')).default
    render(<Page />)
    await waitFor(() => expect(screen.getByText(/Software Developers/)).toBeInTheDocument())
    expect(screen.getByRole('img', { name: /real median pay over time/i })).toBeInTheDocument()
  })

  it('states the hot-baseline caveat rather than burying it', async () => {
    const Page = (await import('../app/trends/page')).default
    render(<Page />)
    await waitFor(() => expect(screen.getByText(/unusually hot year/i)).toBeInTheDocument())
  })

  it('warns that occupation mix can move a median without anyone getting a raise', async () => {
    const Page = (await import('../app/trends/page')).default
    render(<Page />)
    await waitFor(() => expect(screen.getByText(/mix/i)).toBeInTheDocument())
  })

  it('shows an error message when the data fails to load', async () => {
    const { loadTrends } = await import('../lib/data')
    vi.mocked(loadTrends).mockRejectedValueOnce(new Error('boom'))
    const Page = (await import('../app/trends/page')).default
    render(<Page />)
    await waitFor(() => expect(screen.getByText(/boom/)).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run it and confirm it FAILS**

Run (from `site/`): `npx vitest run tests/trends-page.test.tsx`
Expected: FAIL — cannot resolve `../app/trends/page`.

- [ ] **Step 3: Implement `site/app/trends/page.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { TrendsPath } from '../../components/TrendsPath'
import { TrendsRanked } from '../../components/TrendsRanked'
import { loadTrends } from '../../lib/data'
import type { TrendsJson } from '../../lib/trends-types'
import { DEFAULT_STATE, parseState } from '../../lib/url-state'

export default function TrendsPage() {
  const [trends, setTrends] = useState<TrendsJson | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string>(DEFAULT_STATE.role)

  useEffect(() => {
    loadTrends()
      .then(t => {
        setTrends(t)
        const parsed = parseState(new URLSearchParams(window.location.search))
        setSelected(t.roles[parsed.role] ? parsed.role : Object.keys(t.roles)[0])
      })
      .catch(e => setError(String(e)))
  }, [])

  useEffect(() => {
    if (!trends) return
    const params = new URLSearchParams(window.location.search)
    params.delete('role')
    if (selected !== DEFAULT_STATE.role) params.set('role', selected)
    const q = params.toString()
    window.history.replaceState(null, '', q ? `?${q}` : window.location.pathname)
  }, [selected, trends])

  if (error) return <main className="page"><p className="t-note">{error}</p></main>
  if (!trends) return <main className="page"><p className="t-note">Loading…</p></main>

  return (
    <main className="page">
      <h1 className="t-h1">Did tech pay keep up with inflation?</h1>
      <p className="t-lede">
        Median pay for {Object.keys(trends.roles).length} tech occupations, adjusted for inflation
        and expressed in {trends.deflator.base} dollars. Built from BLS national wage estimates and
        CPI-U.
      </p>

      <TrendsRanked trends={trends} selected={selected} onSelect={setSelected} />

      <p className="t-note">
        <b>Why this starts in {trends.headlineFrom}.</b> {trends.headlineFrom} is the earliest year
        all these occupations exist as separate BLS codes. It was also an unusually hot year for
        pay, so these figures measure change from a high starting point.
      </p>

      <TrendsPath trends={trends} selected={selected} />

      <section className="t-method">
        <h2 className="t-h2">How to read this</h2>
        <ul>
          <li>
            <b>Occupation mix moves medians.</b> A median can rise because the seniority or industry
            mix inside an occupation shifted, not because anyone got a raise.
          </li>
          <li>
            <b>New codes are not new jobs.</b> A role appearing in {trends.headlineFrom} means BLS
            started counting it separately, not that the work began then.
          </li>
          <li>
            <b>BLS cautions against comparing these estimates across years.</b> Occupation and
            geography definitions change. We use national figures and mark the one classification
            break in this window.
          </li>
          <li>
            <b>Inflation adjustment</b> uses CPI-U, all items, US city average, May to May — the
            same reference month as the wage data, so no interpolation is involved.
          </li>
        </ul>
        <p><Link href="/">← Back to the map</Link></p>
      </section>
    </main>
  )
}
```

- [ ] **Step 4: Run it and confirm it PASSES**

Run (from `site/`): `npx vitest run tests/trends-page.test.tsx` — expected PASS (4 tests).
Run (from `site/`): `npm test && npx tsc --noEmit` — green/clean.

- [ ] **Step 5: Commit**

```bash
git add site/app/trends/page.tsx site/tests/trends-page.test.tsx
git commit -m "feat(site): /trends page

Headline ranked bars over a window where every role is comparable, then the
ragged path chart. The hot-2021-baseline caveat and the occupation-mix warning
are on the page, not in a footnote - they are the two ways this chart is most
often misread." -- site/app/trends/page.tsx site/tests/trends-page.test.tsx
```

---

### Task 7: Styles and navigation

**Files:**
- Modify: `site/app/globals.css`
- Modify: `site/app/page.tsx:90`

- [ ] **Step 1: Add the link**

There is no shared masthead component — `/about` is linked from the home page only, at
`site/app/page.tsx:90`:

```tsx
        <Link href="/about" className="masthead-link">About the data →</Link>
```

Add a sibling link immediately after it, same class, same style:

```tsx
        <Link href="/trends" className="masthead-link">Pay over time →</Link>
```

Do not restructure the nav or introduce a shared header component — that is a larger change than
this feature justifies.

- [ ] **Step 2: Add the styles**

Append to `site/app/globals.css`, scoped under `.page` per the existing convention (`/about` lives under `.ab-root` with its own system and must not be affected):

```css
/* /trends — ranked bars + path chart.
   No fixed px on label columns or canvases: labels size to content in ch, the chart
   claims its container. See the sizing rule at the top of this file. */
.page .tr-rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.page .tr-row {
  display: grid; grid-template-columns: minmax(0, 22ch) 1fr 7ch;
  align-items: center; gap: 12px; cursor: pointer; padding: 2px 0;
}
.page .tr-row[data-selected='true'] { font-weight: 600; }
.page .tr-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.page .tr-track { position: relative; height: 14px; background: var(--surface); }
.page .tr-track::before {
  content: ''; position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: currentColor; opacity: .35;
}
.page .tr-bar { position: absolute; top: 2px; bottom: 2px; }
.page .tr-value { text-align: right; font-variant-numeric: tabular-nums; }
.page .tr-svg { width: 100%; height: auto; }
.page .tr-line { stroke-width: 2; }
.page .tr-line-ghost { opacity: .18; }
.page .tr-line-sel { stroke-width: 3; opacity: 1; }
.page .tr-break { stroke-dasharray: 3 3; opacity: .4; }
.page .tr-tick { font-size: 12px; fill: currentColor; opacity: .7; }
```

Pick the `tr-pos` / `tr-neg` bar colours from the existing token set in `globals.css` rather than inventing hex values — read the file and reuse what the other charts use. **`--surface` must stay byte-identical**; the `--soc-*` categorical palette was validated against it.

- [ ] **Step 3: Verify visually — do not trust the CSS landing**

```bash
cd site && npm run dev
```

Open `http://localhost:3020/trends`. Confirm: bars diverge from a centre line, the longest bar does not overflow, labels are not clipped, the path chart fills its width, and ghosted lines are visibly lighter than the selected one. Then confirm the **served** stylesheet actually contains your rules — Next dev on Windows can miss `globals.css` hot-reloads:

```bash
curl -s http://localhost:3020/_next/static/css/app/layout.css | grep -c 'tr-track'
```
Expected: at least `1`. If `0`, restart the dev server before judging the visuals.

- [ ] **Step 4: Commit**

```bash
git add site/app/globals.css site/app/page.tsx
git commit -m "feat(site): /trends styles and home-page link" -- site/app/globals.css site/app/page.tsx
```

---

### Task 8: End-to-end test

**Files:**
- Create: `site/e2e/trends.spec.ts`

- [ ] **Step 1: Write the test**

Playwright's `webServer` config already starts `next dev` on :3020.

```ts
import { expect, test } from '@playwright/test'

test.describe('/trends', () => {
  test('renders both figures with real data', async ({ page }) => {
    await page.goto('/trends')
    await expect(page.getByRole('heading', { name: /keep up with inflation/i })).toBeVisible()
    // 21 registry roles -> 21 bar rows and 21 path lines
    await expect(page.locator('[data-role-label]')).toHaveCount(21)
    await expect(page.locator('[data-series]')).toHaveCount(21)
  })

  test('selecting a role re-anchors both figures and survives reload', async ({ page }) => {
    await page.goto('/trends')
    await page.getByText('Information Security Analysts').click()
    await expect(page.locator('[data-series="15-1212"]')).toHaveAttribute('data-highlighted', 'true')
    await expect(page).toHaveURL(/role=15-1212/)
    await page.reload()
    await expect(page.locator('[data-series="15-1212"]')).toHaveAttribute('data-highlighted', 'true')
  })

  test('states the caveats on the page', async ({ page }) => {
    await page.goto('/trends')
    await expect(page.getByText(/unusually hot year/i)).toBeVisible()
    await expect(page.getByText(/mix inside an occupation/i)).toBeVisible()
  })
})
```

- [ ] **Step 2: Run it**

Run (from `site/`): `npx playwright test e2e/trends.spec.ts`
Expected: 3 passed.

If the role-count assertions fail, print what the page actually rendered before changing the test — a wrong count means `trends.json` is wrong, not the test.

- [ ] **Step 3: Commit**

```bash
git add site/e2e/trends.spec.ts
git commit -m "test(site): /trends e2e — figures, selection, caveats" -- site/e2e/trends.spec.ts
```

---

### Task 9: Full-stack verification and close-out

**Files:**
- Modify: `docs/BACKLOG.md`

- [ ] **Step 1: Run every gate**

From the repo root:
```bash
npm test && npx tsc --noEmit
```
From `site/`:
```bash
npm test && npx tsc --noEmit && npm run e2e
```

- [ ] **Step 2: Run the production build**

`tsc` and every test can pass while `next build` fails — a `'use client'` value-import can pull server-only code into the browser bundle, and only the real build catches it.

```bash
cd site && NEXT_PUBLIC_BASE_PATH=/techpay-atlas npm run build
```
Expected: build succeeds, and `/trends` appears in the route list as a static route.

Then confirm the data file actually made it into the export:
```bash
ls -la site/out/data/trends.json && ls site/out | grep -i trends
```

- [ ] **Step 3: Update `docs/BACKLOG.md`**

Add at the top, under the existing heading line:

```markdown
## `/trends` Phase A — SHIPPED <DATE>

Real-wage trends for the 21 registry roles, from the committed OEWS national archive deflated by
CPI-U. Headline ranked bars over 2021–2025 (the earliest window in which every role exists as its
own BLS code, so every bar is comparable); ragged path chart showing each role's full real history
on a shared 2019–2025 axis.

Design decisions and the measurements behind them are in
`docs/superpowers/specs/2026-08-06-trends-and-data-refresh-design.md` — see the ⚠️ CORRECTION block,
which supersedes the original window choice.

Known limits, deliberate:
- **2021 is a hot baseline.** It is the earliest comparable year, but also an unusually strong one
  for pay, so the headline measures change from a high start. Stated on the page.
- **`/trends/` with a trailing slash 404s**, same as `/about/`. Fix with the custom-domain move.
- **Phase B (metro-level) not started.** Needs a CBSA-delineation crosswalk over time and a
  suppression policy; `p90` also becomes load-bearing there, where top-coding actually distorts.
```

- [ ] **Step 4: Commit**

```bash
git add docs/BACKLOG.md
git commit -m "docs(backlog): close out /trends phase A" -- docs/BACKLOG.md
```

---

## Done criteria

- [ ] `npm test` green at repo root and in `site/`; `npx tsc --noEmit` clean in both.
- [ ] `npm run e2e` green.
- [ ] `NEXT_PUBLIC_BASE_PATH=/techpay-atlas npm run build` succeeds and `site/out/data/trends.json` exists.
- [ ] `site/public/data/trends.json` committed, 21 roles, `15-1252.changeReal ≈ -0.0569`.
- [ ] `/trends` reachable from the masthead; selecting a role updates both figures and the URL.
- [ ] The hot-baseline caveat and the occupation-mix warning are visible page text, not footnotes.
- [ ] Nothing pushed to `origin`.
