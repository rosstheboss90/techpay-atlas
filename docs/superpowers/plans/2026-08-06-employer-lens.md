# Employer Lens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class "what does Employer X file, by role, by city" surface to TechPay Atlas, built from the LCA data already ingested.

**Architecture:** A new pure aggregator transposes the existing metro-major LCA records (`cbsa → soc → employers`) into employer-major profiles (`employer → soc → cbsa`), built from `run.ts`'s in-memory `employerRecords` so the `topN = 15` per-bundle truncation never enters national totals. Employer identity is a deterministic suffix-stripping rule plus a committed alias file for the head. The pipeline emits three artifacts: an eagerly-loaded head file of the top 500 filers, first-character index shards covering every filer, and one profile file per prerendered filer. The site adds `/employers` (index + client-side search) and `/employers/[slug]` (500 static pages via `generateStaticParams`).

**Tech Stack:** TypeScript, tsx, vitest (pipeline + site unit), Next.js 15 App Router static export, Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-08-06-employer-lens-design.md`

---

## Prerequisite — NOT part of this plan

`trailingSlash` is unset in `site/next.config.ts`. Confirmed live: `/trends/` and `/about/` both return **HTTP 404**. This plan adds 501 URLs whose purpose is being linkable and indexable, so `trailingSlash: true` **must land before this feature deploys**. It changes every URL on the site, so it is its own change (see `docs/BACKLOG.md`, custom-domain entry) and is explicitly out of scope here. Do not bundle it into these commits.

---

## File Structure

| File | Responsibility |
|---|---|
| `pipeline/lib/employer-identity.ts` | **New.** One job: turn a filed employer string into a canonical `{ key, display, slug, category }`. No I/O, no aggregation. |
| `data/employer-aliases.json` | **New, committed.** The curated head. Data, not code — reviewable in a diff. |
| `pipeline/lib/aggregate-employer-profiles.ts` | **New.** One job: records → employer-major profiles. Pure; no I/O; no file layout knowledge. |
| `pipeline/lib/emit-employers.ts` | **New.** One job: profiles → the three emitted JSON shapes. Kept out of `emit.ts`, which is already the biggest lib file. |
| `pipeline/config.ts` | Modify. Add four `THRESHOLDS` keys. |
| `pipeline/run.ts` | Modify. Wire aggregation into the existing employer phase, assert, emit, report. |
| `site/lib/employer-types.ts` | **New.** The emitted-data contract, mirrored from the pipeline. |
| `site/lib/employer.ts` | **New.** Pure derivations (role ordering, thin-sample marking, staffing filter). Components render; they do not compute. |
| `site/lib/data.ts` | Modify. Three loaders, following the existing `BASE`-prefixed pattern. |
| `site/app/employers/page.tsx` | **New.** Index route: head list + search. |
| `site/app/employers/[slug]/page.tsx` | **New.** Profile route + `generateStaticParams`. |
| `site/components/EmployerSearch.tsx` | **New.** Search box, shard fetching, inline tail results. |
| `site/components/EmployerProfile.tsx` | **New.** Header, entity disclosure, disclaimers. |
| `site/components/EmployerRoleTable.tsx` | **New.** Role × metro table. |
| `site/app/page.tsx` | Modify. Masthead link, matching the `/trends` link at line 91. |

---

### Task 1: Employer identity — the deterministic base rule

**Files:**
- Create: `pipeline/lib/employer-identity.ts`
- Test: `pipeline/tests/employer-identity.test.ts`

- [ ] **Step 1: Write the failing test**

Create `pipeline/tests/employer-identity.test.ts`. The Amazon and Google strings are real values measured from `site/public/data/employers/`.

```ts
import { describe, expect, it } from 'vitest'
import { baseKey, slugify } from '../lib/employer-identity'

describe('baseKey', () => {
  it('uppercases, strips punctuation, collapses whitespace', () => {
    expect(baseKey('Amazon.com Services LLC')).toBe('AMAZONCOM SERVICES')
    expect(baseKey('  Acme   Corp  ')).toBe('ACME')
  })

  it('merges the two casings of one entity that differ only by case and a period', () => {
    expect(baseKey('Amazon Data Services, Inc')).toBe(baseKey('AMAZON DATA SERVICES, INC.'))
  })

  it('strips legal suffixes, including stacked ones', () => {
    expect(baseKey('Google LLC')).toBe('GOOGLE')
    expect(baseKey('Google Inc')).toBe('GOOGLE')
    expect(baseKey('Ernst & Young US LLP')).toBe('ERNST & YOUNG')
    expect(baseKey('Tata Consultancy Services Limited')).toBe('TATA CONSULTANCY SERVICES')
  })

  it('never strips a suffix that is the entire name', () => {
    expect(baseKey('LLC')).toBe('LLC')
  })

  it('leaves distinct second words distinct — suffix stripping alone does not merge Amazon', () => {
    expect(baseKey('Amazon Web Services, Inc.')).not.toBe(baseKey('Amazon.com Services LLC'))
  })
})

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('ERNST & YOUNG')).toBe('ernst-young')
    expect(slugify('AMAZONCOM SERVICES')).toBe('amazoncom-services')
  })
  it('collapses and trims separators', () => {
    expect(slugify('  A -- B  ')).toBe('a-b')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- employer-identity`
Expected: FAIL — `Failed to resolve import "../lib/employer-identity"`.

- [ ] **Step 3: Write minimal implementation**

Create `pipeline/lib/employer-identity.ts`:

```ts
/** Legal-entity suffixes stripped from the tail of a filed employer name. Deliberately excludes
 *  words like GROUP or HOLDINGS: those distinguish real entities, while these do not. */
const LEGAL_SUFFIXES = new Set([
  'INC', 'INCORPORATED', 'LLC', 'PLLC', 'LLP', 'LP', 'CORP', 'CORPORATION',
  'LTD', 'LIMITED', 'PC', 'CO', 'USA', 'US',
])

/** Filed name -> comparison key: uppercase, punctuation removed, whitespace collapsed, trailing
 *  legal suffixes stripped. Stacked suffixes ("US LLP") strip in one pass, tail-first. */
export function baseKey(name: string): string {
  const cleaned = String(name ?? '')
    .toUpperCase()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const tokens = cleaned.split(' ').filter(Boolean)
  // Never strip down to nothing: a name that IS a suffix keeps it.
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop()
  return tokens.join(' ')
}

/** Canonical key -> URL slug. Non-alphanumerics become single hyphens. */
export function slugify(key: string): string {
  return key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- employer-identity`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add pipeline/lib/employer-identity.ts pipeline/tests/employer-identity.test.ts
git commit -m "feat(pipeline): deterministic employer name normalization

Uppercase, strip punctuation, collapse whitespace, strip trailing legal
suffixes. Merges Google LLC with Google Inc and the two casings of Amazon
Data Services that today surface as separate strings because the existing
employerKey merge runs per (cbsa, soc) bundle." -- pipeline/lib/employer-identity.ts pipeline/tests/employer-identity.test.ts
```

---

### Task 2: The curated alias overlay

**Files:**
- Create: `data/employer-aliases.json`
- Modify: `pipeline/lib/employer-identity.ts`
- Test: `pipeline/tests/employer-identity.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `pipeline/tests/employer-identity.test.ts`:

```ts
import { canonicalEmployer, type AliasFile } from '../lib/employer-identity'

const aliases: AliasFile = {
  version: 1,
  entities: [
    {
      canonical: 'amazon', display: 'Amazon', category: 'direct',
      match: ['AMAZONCOM SERVICES', 'AMAZON WEB SERVICES', 'AMAZON DATA SERVICES'],
    },
    {
      canonical: 'cognizant', display: 'Cognizant', category: 'staffing',
      match: ['COGNIZANT TECHNOLOGY SOLUTIONS'],
    },
  ],
}

describe('canonicalEmployer', () => {
  it('merges aliased variants into one canonical entity', () => {
    const a = canonicalEmployer('Amazon.com Services LLC', aliases)
    const b = canonicalEmployer('Amazon Web Services, Inc.', aliases)
    expect(a.key).toBe('amazon')
    expect(b.key).toBe('amazon')
    expect(a.display).toBe('Amazon')
    expect(a.slug).toBe('amazon')
  })

  it('carries the curated category', () => {
    expect(canonicalEmployer('Cognizant Technology Solutions US Corp', aliases).category)
      .toBe('staffing')
  })

  it('falls back to the deterministic rule for unaliased filers', () => {
    const r = canonicalEmployer('Sheetz, Inc.', aliases)
    expect(r.key).toBe('SHEETZ')
    expect(r.slug).toBe('sheetz')
    expect(r.display).toBe('Sheetz, Inc.')
  })

  it('defaults unaliased filers to direct, which the site must not render as a claim', () => {
    expect(canonicalEmployer('Sheetz, Inc.', aliases).category).toBe('direct')
    expect(canonicalEmployer('Sheetz, Inc.', aliases).aliased).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- employer-identity`
Expected: FAIL — `canonicalEmployer is not exported`.

- [ ] **Step 3: Create the alias file**

Create `data/employer-aliases.json`. `match` values are **post-suffix-strip base keys** — run `baseKey()` on a filed name to derive one. Seeded from the measured top filers; extend as the head is reviewed.

```json
{
  "version": 1,
  "entities": [
    { "canonical": "amazon", "display": "Amazon", "category": "direct",
      "match": ["AMAZONCOM SERVICES", "AMAZON WEB SERVICES", "AMAZON DATA SERVICES",
                "AMAZON DEVELOPMENT CENTER U S", "AMAZON ADVERTISING"] },
    { "canonical": "google", "display": "Google", "category": "direct",
      "match": ["GOOGLE", "GOOGLE PUBLIC SECTOR"] },
    { "canonical": "microsoft", "display": "Microsoft", "category": "direct",
      "match": ["MICROSOFT"] },
    { "canonical": "meta", "display": "Meta", "category": "direct",
      "match": ["META PLATFORMS"] },
    { "canonical": "apple", "display": "Apple", "category": "direct",
      "match": ["APPLE"] },
    { "canonical": "walmart", "display": "Walmart", "category": "direct",
      "match": ["WAL-MART ASSOCIATES"] },
    { "canonical": "cognizant", "display": "Cognizant", "category": "staffing",
      "match": ["COGNIZANT TECHNOLOGY SOLUTIONS"] },
    { "canonical": "tcs", "display": "Tata Consultancy Services", "category": "staffing",
      "match": ["TATA CONSULTANCY SERVICES"] },
    { "canonical": "infosys", "display": "Infosys", "category": "staffing",
      "match": ["INFOSYS"] },
    { "canonical": "ey", "display": "Ernst & Young", "category": "staffing",
      "match": ["ERNST & YOUNG"] },
    { "canonical": "deloitte", "display": "Deloitte", "category": "staffing",
      "match": ["DELOITTE CONSULTING"] }
  ]
}
```

- [ ] **Step 4: Write minimal implementation**

Append to `pipeline/lib/employer-identity.ts`:

```ts
export interface AliasEntity {
  canonical: string
  display: string
  category: 'staffing' | 'direct'
  match: string[]
}
export interface AliasFile { version: number; entities: AliasEntity[] }

export interface CanonicalEmployer {
  /** Grouping key: the alias canonical id when aliased, else the deterministic base key. */
  key: string
  display: string
  slug: string
  category: 'staffing' | 'direct'
  /** False when the deterministic fallback produced this. The site must not render an
   *  unaliased `direct` as a badge — it is a default, not a reviewed claim. */
  aliased: boolean
}

/** Build a base-key -> entity lookup once, rather than scanning `entities` per record. */
export function indexAliases(file: AliasFile): Map<string, AliasEntity> {
  const out = new Map<string, AliasEntity>()
  for (const e of file.entities) for (const m of e.match) out.set(m, e)
  return out
}

export function canonicalEmployer(
  name: string,
  aliases: AliasFile | Map<string, AliasEntity>,
): CanonicalEmployer {
  const index = aliases instanceof Map ? aliases : indexAliases(aliases)
  const base = baseKey(name)
  const hit = index.get(base)
  if (hit) {
    return {
      key: hit.canonical, display: hit.display, slug: slugify(hit.canonical),
      category: hit.category, aliased: true,
    }
  }
  return { key: base, display: name.trim(), slug: slugify(base), category: 'direct', aliased: false }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- employer-identity`
Expected: PASS, 11 tests.

- [ ] **Step 6: Commit**

```bash
git add pipeline/lib/employer-identity.ts pipeline/tests/employer-identity.test.ts data/employer-aliases.json
git commit -m "feat(pipeline): curated employer alias overlay

Deterministic suffix-stripping handles the tail; a committed alias file
merges the head, where fragmentation actually distorts the number (Amazon
files under six distinct names). Unaliased filers default to direct and
carry aliased:false so the site can decline to render an unreviewed claim." -- pipeline/lib/employer-identity.ts pipeline/tests/employer-identity.test.ts data/employer-aliases.json
```

---

### Task 3: Employer-major aggregation — the transpose

**Files:**
- Create: `pipeline/lib/aggregate-employer-profiles.ts`
- Test: `pipeline/tests/aggregate-employer-profiles.test.ts`

- [ ] **Step 1: Write the failing test**

Create `pipeline/tests/aggregate-employer-profiles.test.ts`. The 16th-rank test is the regression guard for Decision 3 — the failure it pins is silent without it.

```ts
import { describe, expect, it } from 'vitest'
import { aggregateEmployerProfiles } from '../lib/aggregate-employer-profiles'
import { indexAliases, type AliasFile } from '../lib/employer-identity'
import type { LocatedLca } from '../lib/aggregate'

const aliases: AliasFile = {
  version: 1,
  entities: [{ canonical: 'amazon', display: 'Amazon', category: 'direct',
               match: ['AMAZONCOM SERVICES', 'AMAZON WEB SERVICES'] }],
}
const idx = indexAliases(aliases)

const rec = (employer: string, annualWage: number, cbsa = '12420', soc = '15-1252'): LocatedLca =>
  ({ soc, targetSoc: soc, title: '', employer, zip: '78701', annualWage, caseNumber: '', cbsa })

describe('aggregateEmployerProfiles', () => {
  it('merges aliased entities and lists each filing entity separately', () => {
    const profiles = aggregateEmployerProfiles([
      rec('Amazon.com Services LLC', 100000),
      rec('Amazon.com Services LLC', 200000),
      rec('Amazon Web Services, Inc.', 300000),
    ], idx)
    const p = profiles.get('amazon')!
    expect(p.display).toBe('Amazon')
    expect(p.totalFilings).toBe(3)
    expect(p.entities).toEqual([
      { name: 'Amazon.com Services LLC', filings: 2 },
      { name: 'Amazon Web Services, Inc.', filings: 1 },
    ])
  })

  it('national filings equal the sum of per-metro filings', () => {
    const profiles = aggregateEmployerProfiles([
      rec('Beta LLC', 100000, '12420'),
      rec('Beta LLC', 120000, '42660'),
      rec('Beta LLC', 140000, '42660'),
    ], idx)
    const role = profiles.get('BETA')!.roles['15-1252']
    expect(role.national.filings).toBe(3)
    expect(role.metros.reduce((n, m) => n + m.filings, 0)).toBe(3)
  })

  it('counts filings that would rank outside a per-metro top-15 cut', () => {
    // 15 employers with 5 filings each in one metro, plus a 16th with 1 filing there
    // and 40 more spread across another metro. Building from emitted files would drop
    // the 16th from metro A entirely and undercount its national total.
    const rows: LocatedLca[] = []
    for (let i = 0; i < 15; i++) {
      for (let n = 0; n < 5; n++) rows.push(rec(`Big${i} LLC`, 100000, '12420'))
    }
    rows.push(rec('Small LLC', 90000, '12420'))
    for (let n = 0; n < 40; n++) rows.push(rec('Small LLC', 90000, '42660'))

    const p = aggregateEmployerProfiles(rows, idx).get('SMALL')!
    expect(p.totalFilings).toBe(41)
    expect(p.roles['15-1252'].metros.find(m => m.cbsa === '12420')!.filings).toBe(1)
  })

  it('resolves one display name globally, not per metro', () => {
    const profiles = aggregateEmployerProfiles([
      rec('Acme Corp', 100000, '12420'),
      rec('ACME CORP', 110000, '42660'),
      rec('ACME CORP', 120000, '42660'),
    ], idx)
    expect([...profiles.keys()]).toEqual(['ACME'])
    expect(profiles.get('ACME')!.display).toBe('ACME CORP')
  })

  it('computes national quartiles across all metros', () => {
    const rows = [10, 20, 30, 40].map(w => rec('Beta LLC', w * 1000))
    const role = aggregateEmployerProfiles(rows, idx).get('BETA')!.roles['15-1252']
    expect(role.national.median).toBe(25000)
    expect(role.national.p25).toBe(20000)
    expect(role.national.p75).toBe(30000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- aggregate-employer-profiles`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `pipeline/lib/aggregate-employer-profiles.ts`:

```ts
import type { LocatedLca } from './aggregate'
import { median } from './aggregate'
import { canonicalEmployer, type AliasEntity } from './employer-identity'

export interface EmployerRoleMetro { cbsa: string; filings: number; median: number }
export interface EmployerRoleStat {
  national: { filings: number; p25: number; median: number; p75: number }
  metros: EmployerRoleMetro[]
}
export interface EmployerProfile {
  key: string
  slug: string
  display: string
  category: 'staffing' | 'direct'
  aliased: boolean
  totalFilings: number
  entities: { name: string; filings: number }[]
  roles: Record<string, EmployerRoleStat>
}

/** Nearest-rank quantile on an ascending-sorted array, via the continuous 1-indexed rank
 *  h = q*(n-1)+1 rounded to the closest integer rank (ties round up). Plain ceil(q*n) (as used
 *  by p99Of in aggregate.ts for a p99 clamp) skews low at small n / low q — e.g. n=4, q=0.25
 *  gives rank 1 (the minimum) instead of the 2nd of 4 values — which is wrong for a quartile
 *  meant to sit strictly inside the distribution. */
function quantile(sortedAsc: number[], q: number): number {
  const n = sortedAsc.length
  if (n === 0) throw new Error('quantile of empty input')
  const rank = Math.min(n, Math.max(1, Math.round(q * (n - 1) + 1)))
  return sortedAsc[rank - 1]
}

interface Acc {
  key: string; slug: string; category: 'staffing' | 'direct'; aliased: boolean
  aliasDisplay: string | null
  casings: Map<string, number>
  byRole: Map<string, { wages: number[]; byCbsa: Map<string, number[]> }>
}

/** Transpose LCA records into employer-major profiles.
 *
 *  MUST be fed `run.ts`'s `employerRecords`, never the emitted employers/{cbsa}.json files:
 *  those are truncated at topN=15 per (cbsa, soc), so an employer ranked 16th in a metro is
 *  absent there and its national total would silently undercount. */
export function aggregateEmployerProfiles(
  records: readonly LocatedLca[],
  aliasIndex: Map<string, AliasEntity>,
): Map<string, EmployerProfile> {
  const accs = new Map<string, Acc>()
  for (const r of records) {
    const c = canonicalEmployer(r.employer, aliasIndex)
    let a = accs.get(c.key)
    if (!a) {
      a = {
        key: c.key, slug: c.slug, category: c.category, aliased: c.aliased,
        aliasDisplay: c.aliased ? c.display : null,
        casings: new Map(), byRole: new Map(),
      }
      accs.set(c.key, a)
    }
    a.casings.set(r.employer, (a.casings.get(r.employer) ?? 0) + 1)
    let role = a.byRole.get(r.soc)
    if (!role) { role = { wages: [], byCbsa: new Map() }; a.byRole.set(r.soc, role) }
    role.wages.push(r.annualWage)
    let metroWages = role.byCbsa.get(r.cbsa)
    if (!metroWages) { metroWages = []; role.byCbsa.set(r.cbsa, metroWages) }
    metroWages.push(r.annualWage)
  }

  const out = new Map<string, EmployerProfile>()
  for (const [key, a] of accs) {
    const entities = [...a.casings.entries()]
      .map(([name, filings]) => ({ name, filings }))
      .sort((x, y) => y.filings - x.filings || x.name.localeCompare(y.name))
    const roles: Record<string, EmployerRoleStat> = {}
    let totalFilings = 0
    for (const [soc, role] of a.byRole) {
      const sorted = [...role.wages].sort((x, y) => x - y)
      totalFilings += sorted.length
      roles[soc] = {
        national: {
          filings: sorted.length,
          p25: quantile(sorted, 0.25),
          median: median(sorted),
          p75: quantile(sorted, 0.75),
        },
        metros: [...role.byCbsa.entries()]
          .map(([cbsa, wages]) => ({ cbsa, filings: wages.length, median: median(wages) }))
          .sort((x, y) => y.filings - x.filings || x.cbsa.localeCompare(y.cbsa)),
      }
    }
    out.set(key, {
      key, slug: a.slug, display: a.aliasDisplay ?? entities[0].name,
      category: a.category, aliased: a.aliased, totalFilings, entities, roles,
    })
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- aggregate-employer-profiles`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add pipeline/lib/aggregate-employer-profiles.ts pipeline/tests/aggregate-employer-profiles.test.ts
git commit -m "feat(pipeline): employer-major profile aggregation

Transposes cbsa->soc->employers into employer->soc->cbsa, built from the
in-memory record stream rather than the emitted per-CBSA files. Those are
truncated at topN=15, so a rollup over them undercounts any employer ranked
16th in a metro — pinned by a regression test." -- pipeline/lib/aggregate-employer-profiles.ts pipeline/tests/aggregate-employer-profiles.test.ts
```

---

### Task 4: Emitted shapes

**Files:**
- Create: `pipeline/lib/emit-employers.ts`
- Test: `pipeline/tests/emit-employers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `pipeline/tests/emit-employers.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildEmployerArtifacts } from '../lib/emit-employers'
import type { EmployerProfile } from '../lib/aggregate-employer-profiles'

const profile = (key: string, slug: string, totalFilings: number): EmployerProfile => ({
  key, slug, display: key, category: 'direct', aliased: false, totalFilings,
  entities: [{ name: key, filings: totalFilings }],
  roles: {
    '15-1252': {
      national: { filings: totalFilings, p25: 100000, median: 120000, p75: 140000 },
      metros: [{ cbsa: '12420', filings: totalFilings, median: 120000 }],
    },
  },
})

describe('buildEmployerArtifacts', () => {
  it('prerenders exactly the top N by filings and reports the equivalent floor', () => {
    const profiles = new Map([
      ['A', profile('A', 'a', 100)],
      ['B', profile('B', 'b', 50)],
      ['C', profile('C', 'c', 10)],
    ])
    const out = buildEmployerArtifacts(profiles, 'FY2025 Q1–Q4', 2)
    expect(out.profiles.map(p => p.slug)).toEqual(['a', 'b'])
    expect(out.head.employers.map(e => e.slug)).toEqual(['a', 'b'])
    expect(out.stats).toEqual({ prerendered: 2, tail: 1, equivalentFloor: 50 })
  })

  it('indexes every filer, head and tail alike, sharded by first slug character', () => {
    const profiles = new Map([
      ['A', profile('A', 'apple', 100)],
      ['B', profile('B', 'beta', 5)],
      ['C', profile('C', 'avocado', 1)],
    ])
    const out = buildEmployerArtifacts(profiles, 'FY2025 Q1–Q4', 1)
    expect(Object.keys(out.index).sort()).toEqual(['a', 'b'])
    expect(out.index['a'].v.map(row => row[0])).toEqual(['apple', 'avocado'])
  })

  it('shards digits under their own character', () => {
    const profiles = new Map([['X', profile('X', '3m', 5)]])
    const out = buildEmployerArtifacts(profiles, 'FY2025 Q1–Q4', 1)
    expect(Object.keys(out.index)).toEqual(['3'])
  })

  it('routes an empty slug to the _ shard rather than crashing', () => {
    // slugify() strips non-alphanumerics and trims separators, so a slug can only fail the
    // [a-z0-9] test by being empty — e.g. an employer filed as "...". Task 6 asserts these
    // never reach emit, but the shard router must not depend on that.
    const profiles = new Map([['X', profile('X', '', 5)]])
    const out = buildEmployerArtifacts(profiles, 'FY2025 Q1–Q4', 1)
    expect(Object.keys(out.index)).toEqual(['_'])
  })

  it('stamps lcaPeriod provenance on every artifact', () => {
    const out = buildEmployerArtifacts(new Map([['A', profile('A', 'a', 5)]]), 'FY2025 Q1–Q4', 1)
    expect(out.head.lcaPeriod).toBe('FY2025 Q1–Q4')
    expect(out.profiles[0].lcaPeriod).toBe('FY2025 Q1–Q4')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- emit-employers`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `pipeline/lib/emit-employers.ts`:

```ts
import type { EmployerProfile } from './aggregate-employer-profiles'

export interface EmployerHeadRow {
  slug: string; display: string; filings: number
  category: 'staffing' | 'direct'; aliased: boolean; topRole: string
}
export interface EmployerHeadJson { lcaPeriod: string; employers: EmployerHeadRow[] }

/** Positional-array encoding: `k` names the columns, `v` holds one array per filer. Keeps the
 *  full-tail index small enough to fetch on a keystroke. */
export interface EmployerIndexShard { k: string[]; v: (string | number | boolean)[][] }

export interface EmployerProfileJson extends EmployerProfile { lcaPeriod: string }

export interface EmployerArtifacts {
  head: EmployerHeadJson
  index: Record<string, EmployerIndexShard>
  profiles: EmployerProfileJson[]
  stats: { prerendered: number; tail: number; equivalentFloor: number }
}

const INDEX_COLUMNS = ['slug', 'display', 'filings', 'category', 'aliased', 'topRole', 'topCbsa', 'median']

/** The SOC this employer files most under — the one-line summary a search hit shows. */
function topRoleOf(p: EmployerProfile): string {
  return Object.entries(p.roles)
    .sort((a, b) => b[1].national.filings - a[1].national.filings || a[0].localeCompare(b[0]))[0][0]
}

export function buildEmployerArtifacts(
  profiles: Map<string, EmployerProfile>,
  lcaPeriod: string,
  prerenderCount: number,
): EmployerArtifacts {
  const ranked = [...profiles.values()]
    .sort((a, b) => b.totalFilings - a.totalFilings || a.slug.localeCompare(b.slug))
  const head = ranked.slice(0, prerenderCount)

  const index: Record<string, EmployerIndexShard> = {}
  for (const p of ranked) {
    const first = p.slug.charAt(0)
    const shardKey = /[a-z0-9]/.test(first) ? first : '_'
    let shard = index[shardKey]
    if (!shard) { shard = { k: INDEX_COLUMNS, v: [] }; index[shardKey] = shard }
    const role = topRoleOf(p)
    const stat = p.roles[role]
    shard.v.push([
      p.slug, p.display, p.totalFilings, p.category, p.aliased,
      role, stat.metros[0].cbsa, stat.national.median,
    ])
  }
  for (const shard of Object.values(index)) {
    shard.v.sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  }

  return {
    head: {
      lcaPeriod,
      employers: head.map(p => ({
        slug: p.slug, display: p.display, filings: p.totalFilings,
        category: p.category, aliased: p.aliased, topRole: topRoleOf(p),
      })),
    },
    index,
    profiles: head.map(p => ({ ...p, lcaPeriod })),
    stats: {
      prerendered: head.length,
      tail: ranked.length - head.length,
      equivalentFloor: head.length ? head[head.length - 1].totalFilings : 0,
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- emit-employers`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add pipeline/lib/emit-employers.ts pipeline/tests/emit-employers.test.ts
git commit -m "feat(pipeline): employer head, index shards, and profile shapes

Cuts the prerendered set by count rather than by a filings threshold, so
page count is deterministic across vintages; the equivalent filings floor
becomes a reported output. Tail filers appear in the index shards with
enough columns to render inline, so they need no profile file." -- pipeline/lib/emit-employers.ts pipeline/tests/emit-employers.test.ts
```

---

### Task 5: Thresholds

**Files:**
- Modify: `pipeline/config.ts:9-20`

- [ ] **Step 1: Add the four keys**

In `pipeline/config.ts`, inside the `THRESHOLDS` object, after `minConflationTitles`:

```ts
  employerPrerenderCount: 500,  // static /employers/<slug> pages; a COUNT not a floor, so page
                                // count stays fixed across vintages. Equivalent filings floor is
                                // reported by the run, not configured.
  minEmployerProfiles: 500,     // canonical filers that must exist at all — a top-500 cut is
                                // meaningless if normalization collapsed everything
  maxAliasCollapse: 0.25,       // alias merging absorbing >25% of filings means an over-broad rule
  minAliasCoverage: 0.20,       // ...and covering <20% of the top-500's filings means a rotted or
                                // half-applied alias file. Both bounds are stated because a
                                // one-directional check is what let the /trends top-code error
                                // through: it tested only for a value too high.
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add pipeline/config.ts
git commit -m "feat(pipeline): employer-lens thresholds

Both alias bounds are present deliberately: maxAliasCollapse catches
over-merging, minAliasCoverage catches under-merging. A one-directional
tripwire is what let the /trends top-code error ship." -- pipeline/config.ts
```

---

### Task 6: Wire into `run.ts`

**Files:**
- Modify: `pipeline/run.ts`
- Test: `pipeline/tests/emit-employers.test.ts` (append tripwire tests)

- [ ] **Step 1: Write the failing tripwire test**

Append to `pipeline/tests/emit-employers.test.ts`:

```ts
import { aliasCoverage, aliasCollapse } from '../lib/emit-employers'

describe('alias bounds', () => {
  const mixed = new Map([
    ['amazon', { ...profile('amazon', 'amazon', 90), aliased: true }],
    ['SHEETZ', profile('SHEETZ', 'sheetz', 10)],
  ])

  it('aliasCollapse is the aliased share of all filings', () => {
    expect(aliasCollapse(mixed)).toBeCloseTo(0.9)
  })

  it('aliasCoverage is the aliased share of the top-N filings', () => {
    expect(aliasCoverage(mixed, 1)).toBeCloseTo(1.0)
    expect(aliasCoverage(mixed, 2)).toBeCloseTo(0.9)
  })

  it('returns 0 for an empty profile set rather than NaN', () => {
    expect(aliasCollapse(new Map())).toBe(0)
    expect(aliasCoverage(new Map(), 5)).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- emit-employers`
Expected: FAIL — `aliasCoverage is not exported`.

- [ ] **Step 3: Add the two helpers**

Append to `pipeline/lib/emit-employers.ts`:

```ts
/** Share of ALL filings absorbed by aliased entities. High means an over-broad alias rule. */
export function aliasCollapse(profiles: Map<string, EmployerProfile>): number {
  let total = 0, aliased = 0
  for (const p of profiles.values()) {
    total += p.totalFilings
    if (p.aliased) aliased += p.totalFilings
  }
  return total === 0 ? 0 : aliased / total
}

/** Share of the top-N filers' filings that resolved through the alias file. Low means the file
 *  has rotted or was half-applied — the head fragments back into variants, silently. */
export function aliasCoverage(profiles: Map<string, EmployerProfile>, topN: number): number {
  const ranked = [...profiles.values()]
    .sort((a, b) => b.totalFilings - a.totalFilings || a.slug.localeCompare(b.slug))
    .slice(0, topN)
  let total = 0, aliased = 0
  for (const p of ranked) {
    total += p.totalFilings
    if (p.aliased) aliased += p.totalFilings
  }
  return total === 0 ? 0 : aliased / total
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- emit-employers`
Expected: PASS, 7 tests.

- [ ] **Step 5: Wire the pipeline**

In `pipeline/run.ts`, add to the imports at the top:

```ts
import { readFileSync } from 'node:fs'
import { aggregateEmployerProfiles } from './lib/aggregate-employer-profiles'
import { indexAliases, type AliasFile } from './lib/employer-identity'
import { aliasCollapse, aliasCoverage, buildEmployerArtifacts } from './lib/emit-employers'
```

Immediately after the `employerRecords` block (currently ending at the `if (employerRecords.length < THRESHOLDS.minLcaRecords) fail(...)` line, `run.ts:136`), insert:

```ts
// 3d. Employer layer — same target-SOC stream, transposed to employer-major. Built here, in the
// existing employer phase, rather than from the emitted per-CBSA files: those are truncated at
// topN=15, so a rollup over them would undercount any employer ranked 16th in a metro.
const aliasFile: AliasFile = JSON.parse(
  readFileSync(path.join(here, '..', 'data', 'employer-aliases.json'), 'utf8'))
const aliasIndex = indexAliases(aliasFile)
const employerProfiles = aggregateEmployerProfiles(employerRecords, aliasIndex)
console.log(`  employers: ${employerProfiles.size} canonical filers`)

if (employerProfiles.size < THRESHOLDS.minEmployerProfiles)
  fail(`only ${employerProfiles.size} canonical employers (< ${THRESHOLDS.minEmployerProfiles}) — normalization likely broke`)

// Every alias entry must match a real filed name, or the file rots silently as vintages change.
const seenKeys = new Set([...employerProfiles.values()].filter(p => p.aliased).map(p => p.key))
const staleAliases = aliasFile.entities.filter(e => !seenKeys.has(e.canonical)).map(e => e.canonical)
if (staleAliases.length) fail(`alias entries match no filed employer: ${staleAliases.join(', ')}`)

const collapse = aliasCollapse(employerProfiles)
if (collapse > THRESHOLDS.maxAliasCollapse)
  fail(`alias merging absorbed ${(collapse * 100).toFixed(1)}% of filings (> ${THRESHOLDS.maxAliasCollapse * 100}%) — over-broad alias rule`)
const coverage = aliasCoverage(employerProfiles, THRESHOLDS.employerPrerenderCount)
if (coverage < THRESHOLDS.minAliasCoverage)
  fail(`alias file covers only ${(coverage * 100).toFixed(1)}% of top-${THRESHOLDS.employerPrerenderCount} filings (< ${THRESHOLDS.minAliasCoverage * 100}%) — rotted or half-applied`)
console.log(`  alias collapse ${(collapse * 100).toFixed(1)}%, head coverage ${(coverage * 100).toFixed(1)}%`)

// Slugs become filenames and route segments. A collision would silently overwrite a profile
// file; an empty slug would write ".json" and produce an unroutable page.
const slugOwners = new Map<string, string>()
for (const p of employerProfiles.values()) {
  if (!p.slug) fail(`employer "${p.display}" (key ${p.key}) produced an empty slug`)
  const owner = slugOwners.get(p.slug)
  if (owner) fail(`slug collision "${p.slug}": both ${owner} and ${p.key}`)
  slugOwners.set(p.slug, p.key)
}
```

`here` is not currently defined in `run.ts` — it is defined in `config.ts`. Add `EMPLOYER_ALIASES` to `pipeline/config.ts` instead and import it:

```ts
// in pipeline/config.ts, after REPORT_DIR
export const EMPLOYER_ALIASES = path.join(here, '..', 'data', 'employer-aliases.json')
```

and in `run.ts` use `readFileSync(EMPLOYER_ALIASES, 'utf8')`, importing `EMPLOYER_ALIASES` from `./config`.

- [ ] **Step 6: Emit the artifacts**

In `pipeline/run.ts` section 5, after the existing `employers/` write loop (`run.ts:203-205`), insert. Note the `rmSync`/`mkdirSync` pair sits with the existing ones **after** every assertion, per the standing rule that a failed run never destroys the last good emit:

```ts
const employerArtifacts = buildEmployerArtifacts(
  employerProfiles, lcaPeriod, THRESHOLDS.employerPrerenderCount)
rmSync(path.join(OUT_DIR, 'employers-by-name'), { recursive: true, force: true })
rmSync(path.join(OUT_DIR, 'employer-index'), { recursive: true, force: true })
mkdirSync(path.join(OUT_DIR, 'employers-by-name'), { recursive: true })
mkdirSync(path.join(OUT_DIR, 'employer-index'), { recursive: true })
writeFileSync(path.join(OUT_DIR, 'employer-head.json'), JSON.stringify(employerArtifacts.head))
for (const [shard, body] of Object.entries(employerArtifacts.index)) {
  writeFileSync(path.join(OUT_DIR, 'employer-index', `${shard}.json`), JSON.stringify(body))
}
for (const p of employerArtifacts.profiles) {
  writeFileSync(path.join(OUT_DIR, 'employers-by-name', `${p.slug}.json`), JSON.stringify(p))
}
console.log(`  prerendered ${employerArtifacts.stats.prerendered} employers ` +
  `(equivalent floor ${employerArtifacts.stats.equivalentFloor} filings), ` +
  `${employerArtifacts.stats.tail} searchable tail`)
```

Add to the run report object (`run.ts:213-229`), before the closing `}, null, 2))`:

```ts
  employerProfiles: employerProfiles.size,
  employerPrerendered: employerArtifacts.stats.prerendered,
  employerEquivalentFloor: employerArtifacts.stats.equivalentFloor,
  employerTail: employerArtifacts.stats.tail,
  employerAliasCollapse: collapse,
  employerAliasCoverage: coverage,
```

- [ ] **Step 7: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npm test`
Expected: PASS. The pipeline itself is not run here — it needs `data/raw/`.

- [ ] **Step 8: Commit**

```bash
git add pipeline/run.ts pipeline/config.ts
git commit -m "feat(pipeline): emit employer head, index shards, and profiles

Aggregation runs inside the existing employer phase, reusing the record
stream rather than adding a pass, because employer profiles need the
in-memory records — the emit-trends.ts precedent of a separate entry point
does not transfer. Stale output is removed only after every assertion, as
with employers/." -- pipeline/run.ts pipeline/config.ts
```

---

### Task 7: Run the pipeline and commit real data

**Files:**
- Generate: `site/public/data/employer-head.json`, `employer-index/*.json`, `employers-by-name/*.json`

- [ ] **Step 1: Run the pipeline**

Requires `data/raw/` populated — all four `LCA_Disclosure_Data_FY2025_Q*.xlsx` are already present.

Run: `npm run pipeline`
Expected: the new lines appear, e.g. `employers: 48213 canonical filers` and `prerendered 500 employers (equivalent floor NN filings), 47713 searchable tail`.

- [ ] **Step 2: Confirm output neutrality on the pre-existing artifacts**

Run: `git diff --stat site/public/data`
Expected: `meta.json` (its `generated` timestamp only), plus the new employer files. **If `salaries.json` or `titles.json` changed, stop** — this change is meant to be additive and a diff there means something else moved.

- [ ] **Step 3: Sanity-check a known employer**

Run: `node -e "const p=require('./site/public/data/employers-by-name/amazon.json');console.log(p.display,p.totalFilings,p.entities.length,Object.keys(p.roles).length)"`
Expected: `Amazon`, a filings count in the thousands, several entities, several roles.

- [ ] **Step 4: Commit**

```bash
git add site/public/data
git commit -m "data: emit employer profiles, head, and index shards" -- site/public/data
```

---

### Task 8: Site data contract and loaders

**Files:**
- Create: `site/lib/employer-types.ts`
- Modify: `site/lib/data.ts`

- [ ] **Step 1: Create the types**

Create `site/lib/employer-types.ts`. Mirrors the pipeline shapes; the site never imports from `pipeline/`.

```ts
export interface EmployerRoleMetro { cbsa: string; filings: number; median: number }
export interface EmployerRoleStat {
  national: { filings: number; p25: number; median: number; p75: number }
  metros: EmployerRoleMetro[]
}
export interface EmployerProfileJson {
  slug: string
  display: string
  category: 'staffing' | 'direct'
  aliased: boolean
  lcaPeriod: string
  totalFilings: number
  entities: { name: string; filings: number }[]
  roles: Record<string, EmployerRoleStat>
}
export interface EmployerHeadRow {
  slug: string; display: string; filings: number
  category: 'staffing' | 'direct'; aliased: boolean; topRole: string
}
export interface EmployerHeadJson { lcaPeriod: string; employers: EmployerHeadRow[] }
export interface EmployerIndexShard { k: string[]; v: (string | number | boolean)[][] }

/** One decoded search row — the shape components consume, head and tail alike. */
export interface EmployerSearchRow {
  slug: string; display: string; filings: number
  category: 'staffing' | 'direct'; aliased: boolean
  topRole: string; topCbsa: string; median: number
}
```

- [ ] **Step 2: Add the loaders**

Append to `site/lib/data.ts`:

```ts
export const loadEmployerHead = () => get<EmployerHeadJson>(`${BASE}/data/employer-head.json`)
export const loadEmployerIndex = (shard: string) =>
  get<EmployerIndexShard>(`${BASE}/data/employer-index/${shard}.json`)
export const loadEmployerProfile = (slug: string) =>
  get<EmployerProfileJson>(`${BASE}/data/employers-by-name/${slug}.json`)
```

and add to the import block at the top:

```ts
import type { EmployerHeadJson, EmployerIndexShard, EmployerProfileJson } from './employer-types'
```

- [ ] **Step 3: Typecheck**

Run: `cd site && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add site/lib/employer-types.ts site/lib/data.ts
git commit -m "feat(site): employer data contract and base-path-aware loaders" -- site/lib/employer-types.ts site/lib/data.ts
```

---

### Task 9: Pure site derivations

**Files:**
- Create: `site/lib/employer.ts`
- Test: `site/tests/employer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `site/tests/employer.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { decodeShard, rankRoles, isThinSample, filterStaffing, THIN_SAMPLE_FILINGS } from '../lib/employer'
import type { EmployerIndexShard, EmployerProfileJson } from '../lib/employer-types'

const shard: EmployerIndexShard = {
  k: ['slug', 'display', 'filings', 'category', 'aliased', 'topRole', 'topCbsa', 'median'],
  v: [['acme', 'Acme', 12, 'direct', false, '15-1252', '12420', 120000]],
}

describe('decodeShard', () => {
  it('maps positional arrays onto named rows using the k header', () => {
    expect(decodeShard(shard)).toEqual([{
      slug: 'acme', display: 'Acme', filings: 12, category: 'direct',
      aliased: false, topRole: '15-1252', topCbsa: '12420', median: 120000,
    }])
  })
})

const profile = (roles: EmployerProfileJson['roles']): EmployerProfileJson => ({
  slug: 'x', display: 'X', category: 'direct', aliased: false,
  lcaPeriod: 'FY2025 Q1–Q4', totalFilings: 0, entities: [], roles,
})

describe('rankRoles', () => {
  it('orders roles by national filings, descending', () => {
    const p = profile({
      '15-1211': { national: { filings: 5, p25: 1, median: 2, p75: 3 }, metros: [] },
      '15-1252': { national: { filings: 50, p25: 1, median: 2, p75: 3 }, metros: [] },
    })
    expect(rankRoles(p)).toEqual(['15-1252', '15-1211'])
  })
})

describe('isThinSample', () => {
  it('marks cells under the threshold', () => {
    expect(isThinSample(THIN_SAMPLE_FILINGS - 1)).toBe(true)
    expect(isThinSample(THIN_SAMPLE_FILINGS)).toBe(false)
  })
})

describe('filterStaffing', () => {
  const rows = [
    { slug: 'a', display: 'A', filings: 9, category: 'staffing' as const, aliased: true, topRole: '15-1252', topCbsa: '1', median: 1 },
    { slug: 'b', display: 'B', filings: 8, category: 'direct' as const, aliased: false, topRole: '15-1252', topCbsa: '1', median: 1 },
  ]
  it('keeps everything when the toggle is off', () => {
    expect(filterStaffing(rows, false).map(r => r.slug)).toEqual(['a', 'b'])
  })
  it('removes only KNOWN staffing firms when on — never unreviewed defaults', () => {
    expect(filterStaffing(rows, true).map(r => r.slug)).toEqual(['b'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd site && npm test -- employer`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `site/lib/employer.ts`:

```ts
import type { EmployerIndexShard, EmployerProfileJson, EmployerSearchRow } from './employer-types'

/** Matches the title lens's existing convention for labelling small samples. */
export const THIN_SAMPLE_FILINGS = 5

export function decodeShard(shard: EmployerIndexShard): EmployerSearchRow[] {
  return shard.v.map(row => {
    const out: Record<string, unknown> = {}
    shard.k.forEach((col, i) => { out[col] = row[i] })
    return out as unknown as EmployerSearchRow
  })
}

export function rankRoles(profile: EmployerProfileJson): string[] {
  return Object.entries(profile.roles)
    .sort((a, b) => b[1].national.filings - a[1].national.filings || a[0].localeCompare(b[0]))
    .map(([soc]) => soc)
}

export const isThinSample = (filings: number): boolean => filings < THIN_SAMPLE_FILINGS

/** Removes only entities the alias file explicitly marks `staffing`. An unaliased filer defaults
 *  to `direct`, which is a default and not a reviewed claim — it is never filtered on that basis. */
export function filterStaffing(rows: EmployerSearchRow[], exclude: boolean): EmployerSearchRow[] {
  return exclude ? rows.filter(r => !(r.aliased && r.category === 'staffing')) : rows
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd site && npm test -- employer`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add site/lib/employer.ts site/tests/employer.test.ts
git commit -m "feat(site): pure employer derivations

filterStaffing removes only entities the alias file explicitly marks; an
unaliased direct is a default, not a reviewed claim, so it is never
filtered on that basis." -- site/lib/employer.ts site/tests/employer.test.ts
```

---

### Task 10: The `/employers` index route

**Files:**
- Create: `site/app/employers/page.tsx`
- Create: `site/components/EmployerSearch.tsx`
- Test: `site/tests/employer-search.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `site/tests/employer-search.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmployerSearch } from '../components/EmployerSearch'
import type { EmployerHeadRow } from '../lib/employer-types'

const head: EmployerHeadRow[] = [
  { slug: 'amazon', display: 'Amazon', filings: 6312, category: 'direct', aliased: true, topRole: '15-1252' },
  { slug: 'cognizant', display: 'Cognizant', filings: 10381, category: 'staffing', aliased: true, topRole: '15-1252' },
]

describe('EmployerSearch', () => {
  it('renders the head list before any typing, without fetching a shard', async () => {
    const loadShard = vi.fn()
    render(<EmployerSearch head={head} loadShard={loadShard} />)
    expect(screen.getByText('Amazon')).toBeInTheDocument()
    expect(loadShard).not.toHaveBeenCalled()
  })

  it('fetches the shard for the typed first character and shows tail hits', async () => {
    const loadShard = vi.fn().mockResolvedValue({
      k: ['slug', 'display', 'filings', 'category', 'aliased', 'topRole', 'topCbsa', 'median'],
      v: [['sheetz', 'Sheetz, Inc.', 3, 'direct', false, '15-2051', '11020', 68201]],
    })
    render(<EmployerSearch head={head} loadShard={loadShard} />)
    await userEvent.type(screen.getByRole('searchbox'), 'sheetz')
    await waitFor(() => expect(loadShard).toHaveBeenCalledWith('s'))
    expect(await screen.findByText('Sheetz, Inc.')).toBeInTheDocument()
  })

  it('hides known staffing firms when the toggle is on', async () => {
    render(<EmployerSearch head={head} loadShard={vi.fn()} />)
    await userEvent.click(screen.getByRole('checkbox', { name: /staffing/i }))
    expect(screen.queryByText('Cognizant')).not.toBeInTheDocument()
    expect(screen.getByText('Amazon')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd site && npm test -- employer-search`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

Create `site/components/EmployerSearch.tsx`:

```tsx
'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { decodeShard, filterStaffing } from '../lib/employer'
import type { EmployerHeadRow, EmployerIndexShard, EmployerSearchRow } from '../lib/employer-types'

const headToRow = (h: EmployerHeadRow): EmployerSearchRow =>
  ({ ...h, topCbsa: '', median: 0 })

export function EmployerSearch({
  head, loadShard,
}: {
  head: EmployerHeadRow[]
  loadShard: (shard: string) => Promise<EmployerIndexShard>
}) {
  const [query, setQuery] = useState('')
  const [excludeStaffing, setExcludeStaffing] = useState(false)
  const [shardRows, setShardRows] = useState<EmployerSearchRow[]>([])

  const shardKey = query.trim().toLowerCase().charAt(0)
  useEffect(() => {
    if (!shardKey) { setShardRows([]); return }
    let cancelled = false
    loadShard(/[a-z0-9]/.test(shardKey) ? shardKey : '_')
      .then(s => { if (!cancelled) setShardRows(decodeShard(s)) })
      .catch(() => { if (!cancelled) setShardRows([]) })
    return () => { cancelled = true }
  }, [shardKey, loadShard])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const source = q ? shardRows : head.map(headToRow)
    const matched = q ? source.filter(r => r.display.toLowerCase().includes(q)) : source
    return filterStaffing(matched, excludeStaffing).slice(0, 100)
  }, [query, shardRows, head, excludeStaffing])

  return (
    <div className="emp-search">
      <input
        type="search" role="searchbox" placeholder="Search employers…"
        value={query} onChange={e => setQuery(e.target.value)}
      />
      <label>
        <input
          type="checkbox" checked={excludeStaffing}
          onChange={e => setExcludeStaffing(e.target.checked)}
        />
        Exclude known staffing &amp; outsourcing firms
      </label>
      <ul className="emp-list">
        {rows.map(r => (
          <li key={r.slug}>
            <Link href={`/employers/${r.slug}`}>{r.display}</Link>
            <span className="emp-filings">{r.filings.toLocaleString()} filings</span>
            {r.aliased && r.category === 'staffing' && <span className="emp-chip">staffing</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Write the page**

Create `site/app/employers/page.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { EmployerSearch } from '../../components/EmployerSearch'
import { loadEmployerHead, loadEmployerIndex } from '../../lib/data'
import type { EmployerHeadJson } from '../../lib/employer-types'

export default function EmployersPage() {
  const [head, setHead] = useState<EmployerHeadJson | null>(null)
  useEffect(() => { loadEmployerHead().then(setHead).catch(() => setHead(null)) }, [])
  if (!head) return <main className="page"><p>Loading…</p></main>

  return (
    <main className="page">
      <header className="masthead">
        <h1>Employers</h1>
        <p className="tagline">
          What each employer filed for H-1B workers, by role and by metro — {head.lcaPeriod}.
        </p>
        <Link href="/" className="masthead-link">← TechPay Atlas</Link>
      </header>
      <p className="emp-caveat">
        These are <b>filed base-pay floors</b> — no equity, no bonus. They cover
        <b> H-1B sponsoring employers only</b>, which is not a market-wide sample. Ranking by
        filing volume ranks sponsorship volume, not desirability: staffing and outsourcing firms
        dominate the top and are marked.
      </p>
      <EmployerSearch head={head.employers} loadShard={loadEmployerIndex} />
    </main>
  )
}
```

- [ ] **Step 5: Run tests**

Run: `cd site && npm test -- employer-search`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add site/app/employers/page.tsx site/components/EmployerSearch.tsx site/tests/employer-search.test.tsx
git commit -m "feat(site): /employers index with search over head and tail shards

Head list renders with no fetch; a shard loads on the first typed character
and covers every filer, so tail employers are reachable without a page." -- site/app/employers/page.tsx site/components/EmployerSearch.tsx site/tests/employer-search.test.tsx
```

---

### Task 11: The `/employers/[slug]` profile route

**Files:**
- Create: `site/app/employers/[slug]/page.tsx`
- Create: `site/components/EmployerProfile.tsx`
- Create: `site/components/EmployerRoleTable.tsx`
- Test: `site/tests/employer-profile.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `site/tests/employer-profile.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmployerProfile } from '../components/EmployerProfile'
import type { EmployerProfileJson } from '../lib/employer-types'

const profile: EmployerProfileJson = {
  slug: 'amazon', display: 'Amazon', category: 'direct', aliased: true,
  lcaPeriod: 'FY2025 Q1–Q4', totalFilings: 6312,
  entities: [
    { name: 'Amazon.com Services LLC', filings: 3108 },
    { name: 'Amazon Web Services, Inc.', filings: 1744 },
  ],
  roles: {
    '15-1252': {
      national: { filings: 6310, p25: 150000, median: 176000, p75: 200000 },
      metros: [{ cbsa: '42660', filings: 1204, median: 176000 }],
    },
    '15-2051': {
      national: { filings: 2, p25: 149000, median: 149000, p75: 149000 },
      metros: [{ cbsa: '12420', filings: 2, median: 149000 }],
    },
  },
}

describe('EmployerProfile', () => {
  it('shows the total and the base-pay-floor disclaimer', () => {
    render(<EmployerProfile profile={profile} metroNames={{ '42660': 'Seattle', '12420': 'Austin' }} />)
    expect(screen.getByText(/6,312/)).toBeInTheDocument()
    expect(screen.getByText(/base-pay floor/i)).toBeInTheDocument()
    expect(screen.getByText(/sponsors only/i)).toBeInTheDocument()
  })

  it('discloses the merged filing entities on demand', async () => {
    render(<EmployerProfile profile={profile} metroNames={{}} />)
    await userEvent.click(screen.getByText(/includes 2 filing entities/i))
    expect(screen.getByText('Amazon.com Services LLC')).toBeInTheDocument()
  })

  it('marks a thin cell rather than hiding it', () => {
    render(<EmployerProfile profile={profile} metroNames={{ '12420': 'Austin' }} />)
    expect(screen.getAllByText(/thin sample/i).length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd site && npm test -- employer-profile`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the role table**

Create `site/components/EmployerRoleTable.tsx`:

```tsx
import { isThinSample } from '../lib/employer'
import type { EmployerRoleStat } from '../lib/employer-types'

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`

export function EmployerRoleTable({
  label, stat, metroNames,
}: {
  label: string
  stat: EmployerRoleStat
  metroNames: Record<string, string>
}) {
  return (
    <section className="emp-role">
      <h3>
        {label}
        {isThinSample(stat.national.filings) && <span className="emp-chip">thin sample</span>}
      </h3>
      <p className="emp-national">
        {stat.national.filings.toLocaleString()} filings · {usd(stat.national.p25)}–
        {usd(stat.national.p75)} · median {usd(stat.national.median)}
      </p>
      <table>
        <thead><tr><th>Metro</th><th>Filings</th><th>Median filed</th></tr></thead>
        <tbody>
          {stat.metros.map(m => (
            <tr key={m.cbsa}>
              <td>{metroNames[m.cbsa] ?? m.cbsa}</td>
              <td>
                {m.filings.toLocaleString()}
                {isThinSample(m.filings) && <span className="emp-chip">thin sample</span>}
              </td>
              <td>{usd(m.median)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
```

- [ ] **Step 4: Write the profile component**

Create `site/components/EmployerProfile.tsx`:

```tsx
'use client'
import Link from 'next/link'
import { rankRoles } from '../lib/employer'
import { EmployerRoleTable } from './EmployerRoleTable'
import type { EmployerProfileJson } from '../lib/employer-types'

const ROLE_LABELS: Record<string, string> = {
  '11-3021': 'Computer & Information Systems Managers',
  '13-1082': 'Project Management Specialists',
  '15-1211': 'Computer Systems Analysts',
  '15-1212': 'Information Security Analysts',
  '15-1221': 'Computer & Information Research Scientists',
  '15-1231': 'Computer Network Support Specialists',
  '15-1232': 'Computer User Support Specialists',
  '15-1241': 'Computer Network Architects',
  '15-1242': 'Database Administrators',
  '15-1243': 'Database Architects',
  '15-1244': 'Network & Computer Systems Administrators',
  '15-1251': 'Computer Programmers',
  '15-1252': 'Software Developers',
  '15-1253': 'Software QA Analysts & Testers',
  '15-1254': 'Web Developers',
  '15-1255': 'Web & Digital Interface Designers',
  '15-1299': 'Computer Occupations, All Other',
  '15-2031': 'Operations Research Analysts',
  '15-2041': 'Statisticians',
  '15-2051': 'Data Scientists',
  '41-9031': 'Sales Engineers',
}

export function EmployerProfile({
  profile, metroNames,
}: {
  profile: EmployerProfileJson
  metroNames: Record<string, string>
}) {
  return (
    <main className="page emp-profile">
      <header className="masthead">
        <h1>
          {profile.display}
          {profile.aliased && profile.category === 'staffing' && (
            <span className="emp-chip">staffing / outsourcing</span>
          )}
        </h1>
        <p className="tagline">
          {profile.totalFilings.toLocaleString()} certified filings · {profile.lcaPeriod}
        </p>
        <Link href="/employers" className="masthead-link">← All employers</Link>
      </header>

      {profile.entities.length > 1 && (
        <details className="emp-entities">
          <summary>Includes {profile.entities.length} filing entities</summary>
          <ul>
            {profile.entities.map(e => (
              <li key={e.name}>{e.name}<span>{e.filings.toLocaleString()}</span></li>
            ))}
          </ul>
        </details>
      )}

      <p className="emp-caveat">
        Filed <b>base-pay floor</b> — no equity, no bonus. H-1B <b>sponsors only</b>, not a
        market-wide sample.
      </p>

      {rankRoles(profile).map(soc => (
        <EmployerRoleTable
          key={soc}
          label={ROLE_LABELS[soc] ?? soc}
          stat={profile.roles[soc]}
          metroNames={metroNames}
        />
      ))}
    </main>
  )
}
```

- [ ] **Step 5: Write the route with `generateStaticParams`**

Create `site/app/employers/[slug]/page.tsx`. `generateStaticParams` runs at build time in Node, so it reads the emitted directory directly rather than fetching.

```tsx
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { EmployerProfile } from '../../../components/EmployerProfile'
import type { EmployerProfileJson } from '../../../lib/employer-types'
import type { Meta } from '../../../lib/types'

const DATA_DIR = path.join(process.cwd(), 'public', 'data')

export function generateStaticParams() {
  return readdirSync(path.join(DATA_DIR, 'employers-by-name'))
    .filter(f => f.endsWith('.json'))
    .map(f => ({ slug: f.replace(/\.json$/, '') }))
}

export default async function EmployerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const profile: EmployerProfileJson = JSON.parse(
    readFileSync(path.join(DATA_DIR, 'employers-by-name', `${slug}.json`), 'utf8'))
  const meta: Meta = JSON.parse(readFileSync(path.join(DATA_DIR, 'meta.json'), 'utf8'))
  const metroNames = Object.fromEntries(meta.metros.map(m => [m.cbsa, m.name]))
  return <EmployerProfile profile={profile} metroNames={metroNames} />
}
```

- [ ] **Step 6: Run tests and build**

Run: `cd site && npm test -- employer-profile && npm run build`
Expected: tests PASS (3); build emits `out/employers/<slug>.html` — confirm the count with
`ls out/employers/*.html | wc -l` → 500 plus `out/employers.html`.

- [ ] **Step 7: Commit**

```bash
git add site/app/employers site/components/EmployerProfile.tsx site/components/EmployerRoleTable.tsx site/tests/employer-profile.test.tsx
git commit -m "feat(site): /employers/[slug] profile pages

500 static pages via generateStaticParams over the emitted profile
directory. The entity disclosure makes every alias merge auditable rather
than asserted, and thin cells are labelled, never hidden." -- site/app/employers site/components/EmployerProfile.tsx site/components/EmployerRoleTable.tsx site/tests/employer-profile.test.tsx
```

---

### Task 12: Masthead link, styles, and e2e

**Files:**
- Modify: `site/app/page.tsx:91`
- Modify: `site/app/globals.css`
- Create: `site/e2e/employers.spec.ts`

- [ ] **Step 1: Add the masthead link**

In `site/app/page.tsx`, after the `/trends` link at line 91:

```tsx
        <Link href="/employers" className="masthead-link">Employers →</Link>
```

- [ ] **Step 2: Add styles**

Append to `site/app/globals.css`. Per the house rule from the polish pass: no fixed px for label columns or table canvases — size to content in `ch`, let the table claim the container. Theme both schemes.

```css
.emp-caveat { color: var(--ink-2); margin: 0 0 1.5rem; max-width: 68ch; }
.emp-chip {
  display: inline-block; margin-left: 0.5ch; padding: 0 0.6ch;
  font-size: 0.75em; border-radius: 3px;
  background: var(--surface-2); color: var(--ink-2);
}
.emp-list { list-style: none; padding: 0; }
.emp-list li { display: flex; gap: 1ch; align-items: baseline; padding: 0.3rem 0; }
.emp-filings { color: var(--ink-2); font-variant-numeric: tabular-nums; }
.emp-role { margin: 2rem 0; }
.emp-role table { width: 100%; border-collapse: collapse; }
.emp-role th { text-align: left; color: var(--ink-2); font-weight: 500; }
.emp-role td, .emp-role th { padding: 0.3rem 1ch 0.3rem 0; }
.emp-role td:nth-child(2), .emp-role td:nth-child(3) { font-variant-numeric: tabular-nums; }
.emp-entities summary { cursor: pointer; color: var(--ink-2); }
.emp-entities ul { list-style: none; padding: 0 0 0 2ch; }
.emp-entities li { display: flex; justify-content: space-between; max-width: 48ch; }
```

- [ ] **Step 3: Write the e2e spec**

Create `site/e2e/employers.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('index lists head employers and links to a profile', async ({ page }) => {
  await page.goto('/employers')
  await expect(page.getByRole('heading', { name: 'Employers' })).toBeVisible()
  await page.getByRole('link', { name: 'Amazon', exact: true }).click()
  await expect(page).toHaveURL(/\/employers\/amazon/)
  await expect(page.getByText(/certified filings/)).toBeVisible()
})

test('a tail employer is searchable without having its own page', async ({ page }) => {
  await page.goto('/employers')
  await page.getByRole('searchbox').fill('sheetz')
  await expect(page.getByText(/Sheetz/i).first()).toBeVisible()
})

test('the entity disclosure expands', async ({ page }) => {
  await page.goto('/employers/amazon')
  await page.getByText(/includes \d+ filing entities/i).click()
  await expect(page.getByText('Amazon.com Services LLC')).toBeVisible()
})

test('the staffing toggle hides known staffing firms', async ({ page }) => {
  await page.goto('/employers')
  await expect(page.getByRole('link', { name: 'Cognizant', exact: true })).toBeVisible()
  await page.getByRole('checkbox', { name: /staffing/i }).check()
  await expect(page.getByRole('link', { name: 'Cognizant', exact: true })).toHaveCount(0)
})
```

- [ ] **Step 4: Run the full site gate**

Run: `cd site && npx tsc --noEmit && npm test && npm run build && npm run e2e`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add site/app/page.tsx site/app/globals.css site/e2e/employers.spec.ts
git commit -m "feat(site): employer lens masthead link, styles, and e2e

Masthead link follows the /trends pattern in page.tsx rather than
SectionNav.tsx, which is a within-page section nav." -- site/app/page.tsx site/app/globals.css site/e2e/employers.spec.ts
```

---

## Done criteria

- [ ] `npx tsc --noEmit` clean at the repo root and in `site/`
- [ ] `npm test` green at the repo root (pipeline) and in `site/`
- [ ] `cd site && npm run build` emits `out/employers.html` plus exactly 500 `out/employers/<slug>.html`
- [ ] `cd site && npm run e2e` green
- [ ] `git diff --stat site/public/data` shows **no change** to `salaries.json` or `titles.json` — this feature is additive
- [ ] The run report in `data/reports/run-<date>.json` records `employerPrerendered`, `employerEquivalentFloor`, `employerTail`, `employerAliasCollapse`, `employerAliasCoverage`
- [ ] **Gate before deploy:** `trailingSlash: true` has landed separately, and `/employers/` (with the slash) does not 404
- [ ] Open a PR — never push `main` directly, since `deploy.yml` runs no tests and auto-deploys
