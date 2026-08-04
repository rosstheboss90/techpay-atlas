# Title Lens Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Title lens per `docs/superpowers/specs/2026-08-03-title-lens-design.md` — pipeline keeps H-1B `JOB_TITLE`, buckets titles into 4 families × ~21 canonical titles × 5 seniority tiers, emits `titles.json`; the site gets a lazy-loaded section with family tabs, pay bands, seniority ladders, and SOC-conflation bars that cross-link into the map.

**Architecture:** Same split as v1 — pure functions in `pipeline/lib/` (new `titles.ts`, extended `parse-lca.ts`/`emit.ts`), orchestrated by `run.ts`; site consumes the emitted contract. The employer layer's SOC filter moves from parse-time to run-time so the title layer sees ALL certified full-time filings.

**Conventions:** identical to v1 plans — TDD, one commit per task, pathspec on both `git add` and `git commit --`, commit trailer:
```
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0159vq33fwAWormwDu21Xj2j
```
Pipeline commands run from `C:\projects\techpay-atlas`; site commands from `C:\projects\techpay-atlas\site`.
⚠️ A Next dev server may be running on :3020 — never `npm run build` in `site/` while it runs (Turbopack holds `.next`); ask the controller to stop it first, or verify the port is free. Hot-reload dev checks are fine.

---

### Task 1: Widen the LCA parse — titles + all SOCs

**Files:**
- Modify: `pipeline/loaders.ts` (LCA_COLUMNS + JOB_TITLE), `pipeline/lib/parse-lca.ts`, `pipeline/run.ts`
- Test: `pipeline/tests/parse-lca.test.ts` (update), `pipeline/tests/loaders.test.ts` (update if it pins LCA_COLUMNS)

Contract change: `LcaRecord` becomes
```ts
export interface LcaRecord {
  caseNumber: string; soc: string;              // RAW normalized SOC (\d{2}-\d{4}) — any occupation
  targetSoc: string | null                       // in-registry SOC or null (employer layer filters on this)
  title: string                                  // uppercased, whitespace-collapsed JOB_TITLE
  employer: string; zip: string; annualWage: number
}
```
Drop-accounting change: the `soc` bucket now means MALFORMED soc (no `\d{2}-\d{4}` extractable) — valid-but-non-target SOCs are no longer dropped at parse time.

- [ ] **Step 1: Update tests first.** In `parse-lca.test.ts`: extend the `row()` factory with `JOB_TITLE: ' Senior  Software Engineer II '`; expected records gain `soc`, `targetSoc`, `title: 'SENIOR SOFTWARE ENGINEER II'`. Add cases: (a) `SOC_CODE: '11-9021'` (valid, non-target) → record RETAINED with `targetSoc: null`, drops.soc unchanged; (b) `SOC_CODE: 'garbage'` → dropped, `drops.soc: 1`; (c) empty `JOB_TITLE` → retained with `title: ''`. Run → FAIL.
- [ ] **Step 2: Implement.** `parse-lca.ts`: extract raw soc via `/(\d{2}-\d{4})/` (drop to `soc` bucket if no match); `targetSoc = targetSoc(rawSoc)` (existing helper — note the name collision: import as `toTargetSoc` or call `SOC_SET.has`); `title = String(r.JOB_TITLE ?? '').replace(/\s+/g, ' ').trim().toUpperCase()`. `loaders.ts`: add `'JOB_TITLE'` to `LCA_COLUMNS` (header assertion covers it automatically).
- [ ] **Step 3: Adapt `run.ts`** so it compiles and behaves identically for the employer layer: after dedupe + `attachCbsa`, `const employerRecords = matched.filter(r => r.targetSoc)`; feed `aggregateEmployers(employerRecords)`; report gains `lcaNonTargetSoc: matched.length - employerRecords.length`. (`aggregateEmployers` groups by `r.soc` — pass records whose `soc` field is the target one: map `employerRecords` through `{ ...r, soc: r.targetSoc! }` OR change the grouping to use targetSoc — pick the mapping approach, zero churn in aggregate.ts.)
- [ ] **Step 4:** `npx tsc --noEmit` silent; `npx vitest run` green (fix any other test pinning the old LcaRecord shape — report which). Commit `feat: retain job titles and non-target SOCs through the LCA parse`.

---

### Task 2: Title registry + seniority parser (`titles.ts`)

**Files:**
- Create: `pipeline/lib/titles.ts`
- Test: `pipeline/tests/titles.test.ts`

- [ ] **Step 1: Write the failing test** — fixtures drawn from real scanned titles:

```ts
// pipeline/tests/titles.test.ts
import { describe, expect, it } from 'vitest'
import { FAMILIES, bucketFor, parseSeniority } from '../lib/titles'

const cases: [string, string | null][] = [
  ['SENIOR TECHNICAL PROGRAM MANAGER II', 'tpm'],
  ['TECHNICAL PROJECT MANAGER', 'techProjectMgr'],
  ['TECHNICAL PRODUCT MANAGER - PAYMENTS', 'techProductMgr'],
  ['PRODUCT OWNER', 'productOwner'],
  ['SENIOR PRODUCT MANAGER', 'productMgr'],
  ['PROGRAM MANAGER III', 'programMgr'],
  ['PROJECT MANAGER', 'projectMgr'],
  ['PMO LEAD', 'pmo'],
  ['DEVOPS ENGINEER', 'devops'],
  ['DEV OPS ENGINEER', 'devops'],
  ['SITE RELIABILITY ENGINEER', 'sre'],
  ['SR SRE', 'sre'],
  ['PLATFORM ENGINEER', 'platformEng'],
  ['CLOUD ENGINEER', 'cloudEng'],
  ['INFRASTRUCTURE ENGINEER', 'infraEng'],
  ['DATA ENGINEER', 'dataEng'],
  ['SENIOR MACHINE LEARNING ENGINEER', 'mlEng'],
  ['ML ENGINEER', 'mlEng'],
  ['ANALYTICS ENGINEER', 'analyticsEng'],
  ['DATA ANALYST', 'dataAnalyst'],
  ['FRONT END DEVELOPER', 'frontend'],
  ['FRONT-END ENGINEER', 'frontend'],
  ['BACKEND DEVELOPER', 'backend'],
  ['FULL STACK DEVELOPER', 'fullstack'],
  ['FULLSTACK ENGINEER', 'fullstack'],
  ['IOS DEVELOPER', 'mobile'],
  ['ANDROID ENGINEER', 'mobile'],
  ['MOBILE SOFTWARE ENGINEER', 'mobile'],
  ['SOFTWARE ENGINEER', null],          // no bucket — plain SWE is not a lens title
  ['SR. SDET', null],
  ['MARKETING MANAGER', null],
]

describe('bucketFor', () => {
  it.each(cases)('%s -> %s', (title, key) => {
    expect(bucketFor(title)?.key ?? null).toBe(key)
  })
  it('technical variants win over generic (ordering)', () => {
    expect(bucketFor('TECHNICAL PROGRAM MANAGER')!.key).toBe('tpm')
    expect(bucketFor('PROGRAM MANAGER, TECHNICAL PROGRAMS')!.key).toBe('tpm')
  })
  it('no title matches buckets in two different families', () => {
    for (const [title] of cases) {
      const hits = FAMILIES.filter(f => f.buckets.some(b => b.re.test(title)))
      expect(hits.length, title).toBeLessThanOrEqual(1)
    }
  })
})

describe('parseSeniority', () => {
  it.each([
    ['SENIOR TECHNICAL PROGRAM MANAGER II', 'senior'],
    ['SR. DATA ENGINEER', 'senior'],
    ['SOFTWARE ENGINEER III', 'senior'],
    ['PRINCIPAL SOFTWARE ENGINEER', 'staffPlus'],
    ['STAFF PLATFORM ENGINEER', 'staffPlus'],
    ['LEAD DATA ENGINEER', 'lead'],
    ['HEAD OF PRODUCT', 'lead'],
    ['DIRECTOR, PMO', 'directorPlus'],
    ['VP OF ENGINEERING', 'directorPlus'],
    ['SENIOR DIRECTOR OF PRODUCT', 'directorPlus'],  // precedence over senior
    ['PRODUCT MANAGER', 'base'],
  ] as const)('%s -> %s', (title, tier) => {
    expect(parseSeniority(title)).toBe(tier)
  })
})
```

- [ ] **Step 2: Run → FAIL, then implement:**

```ts
// pipeline/lib/titles.ts
export interface TitleBucketDef { key: string; label: string; re: RegExp }
export interface TitleFamily { key: string; label: string; buckets: TitleBucketDef[] }
export type Tier = 'base' | 'senior' | 'staffPlus' | 'lead' | 'directorPlus'

// Ordering matters: specific (technical) before generic; first match within a family wins.
export const FAMILIES: TitleFamily[] = [
  { key: 'pm', label: 'PM & Product', buckets: [
    { key: 'tpm', label: 'Technical Program Manager', re: /\bTECHNICAL\s+PROGRAM\s+MANAGER\b|\bTECHNICAL\s+PROGRAMS?\b.*\bMANAGER\b|\bMANAGER\b.*\bTECHNICAL\s+PROGRAMS?\b/ },
    { key: 'techProjectMgr', label: 'Technical Project Manager', re: /\bTECHNICAL\s+PROJECT\s+MANAGER\b/ },
    { key: 'techProductMgr', label: 'Technical Product Manager', re: /\bTECHNICAL\s+PRODUCT\s+MANAGER\b/ },
    { key: 'productOwner', label: 'Product Owner', re: /\bPRODUCT\s+OWNER\b/ },
    { key: 'productMgr', label: 'Product Manager', re: /\bPRODUCT\s+MANAGER\b/ },
    { key: 'programMgr', label: 'Program Manager', re: /\bPROGRAM\s+MANAGER\b/ },
    { key: 'projectMgr', label: 'Project Manager', re: /\bPROJECT\s+MANAGER\b/ },
    { key: 'pmo', label: 'PMO', re: /\bPMO\b/ },
  ]},
  { key: 'platform', label: 'Platform & Ops', buckets: [
    { key: 'devops', label: 'DevOps Engineer', re: /\bDEV\s?OPS\b/ },
    { key: 'sre', label: 'Site Reliability Engineer', re: /\bSITE\s+RELIABILITY\b|\bSRE\b/ },
    { key: 'platformEng', label: 'Platform Engineer', re: /\bPLATFORM\s+ENGINEER\b/ },
    { key: 'cloudEng', label: 'Cloud Engineer', re: /\bCLOUD\s+ENGINEER\b/ },
    { key: 'infraEng', label: 'Infrastructure Engineer', re: /\bINFRASTRUCTURE\s+ENGINEER\b/ },
  ]},
  { key: 'data', label: 'Data', buckets: [
    { key: 'dataEng', label: 'Data Engineer', re: /\bDATA\s+ENGINEER\b/ },
    { key: 'mlEng', label: 'ML Engineer', re: /\b(MACHINE\s+LEARNING|ML)\s+ENGINEER\b/ },
    { key: 'analyticsEng', label: 'Analytics Engineer', re: /\bANALYTICS\s+ENGINEER\b/ },
    { key: 'dataAnalyst', label: 'Data Analyst', re: /\bDATA\s+ANALYST\b/ },
  ]},
  { key: 'dev', label: 'Dev Specialization', buckets: [
    { key: 'frontend', label: 'Frontend Engineer', re: /\bFRONT[\s-]?END\b/ },
    { key: 'backend', label: 'Backend Engineer', re: /\bBACK[\s-]?END\b/ },
    { key: 'fullstack', label: 'Full-stack Engineer', re: /\bFULL[\s-]?STACK\b/ },
    { key: 'mobile', label: 'Mobile Engineer', re: /\b(IOS|ANDROID)\b.*\b(ENGINEER|DEVELOPER)\b|\bMOBILE\s+(SOFTWARE\s+)?(ENGINEER|DEVELOPER)\b/ },
  ]},
]

/** First matching bucket across families (families are disjoint by test). Null = not a lens title. */
export function bucketFor(title: string): TitleBucketDef | null {
  for (const f of FAMILIES) for (const b of f.buckets) if (b.re.test(title)) return b
  return null
}

const TIER_RES: [Tier, RegExp][] = [
  ['directorPlus', /\b(DIRECTOR|VP|VICE\s+PRESIDENT)\b/],
  ['lead', /\b(LEAD|HEAD\s+OF)\b/],
  ['staffPlus', /\b(STAFF|PRINCIPAL|DISTINGUISHED)\b/],
  ['senior', /\b(SENIOR|SR\.?)\b|\bI{3}\b|\bIV\b/],
]

export function parseSeniority(title: string): Tier {
  for (const [tier, re] of TIER_RES) if (re.test(title)) return tier
  return 'base'
}
```
Note: `'PMO LEAD'` must bucket as `pmo` (bucket regexes run before tier logic and are independent); its TIER is `lead` — the two axes are orthogonal by design.

- [ ] **Step 3:** PASS; tsc silent; commit `feat: title-bucket registry and seniority parser`.

---

### Task 3: Title aggregation (`aggregate-titles.ts`)

**Files:**
- Create: `pipeline/lib/aggregate-titles.ts`
- Test: `pipeline/tests/aggregate-titles.test.ts`

- [ ] **Step 1: Failing test.** Feed ~30 synthetic `LocatedLca` records (post-Task-1 shape, with titles) across 2 buckets, 2 metros, 3 tiers and assert:
  - national stats (filings, p25/median/p75 nearest-rank),
  - metro stats present only where filings ≥ the threshold param (test with `metroMin: 2`),
  - tier stats present only where ≥ `tierMin` (test with 2), tier `base` vs `senior` split correct,
  - `socMix`: top-4 SOCs by share + `'other'` remainder, shares sum to 1 (±1e-9), sorted desc,
  - `topEmployers`: top 5 by filings with medians, case-insensitive merge reused from `aggregate.ts` (extract the existing employer-merge into a shared helper if cleanest, or re-implement the small merge locally — implementer's choice, but no behavior drift in the v1 path),
  - a record whose title matches no bucket contributes nothing,
  - deterministic under input reversal.

- [ ] **Step 2: Implement**

```ts
// pipeline/lib/aggregate-titles.ts
import type { LocatedLca } from './aggregate'
import { median } from './aggregate'
import { FAMILIES, bucketFor, parseSeniority, type Tier, type TitleBucketDef } from './titles'

export interface TitleStats { filings: number; p25: number; median: number; p75: number }
export interface TitleBucketAgg {
  key: string; label: string
  national: TitleStats
  metros: Record<string, TitleStats>
  tiers: Partial<Record<Tier, TitleStats>>
  socMix: { soc: string; share: number }[]
  topEmployers: { name: string; filings: number; median: number }[]
}

const q = (sorted: number[], p: number): number =>
  sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))]

const stats = (wages: number[]): TitleStats => {
  const s = [...wages].sort((a, b) => a - b)
  return { filings: s.length, p25: q(s, 0.25), median: median(s), p75: q(s, 0.75) }
}

export function aggregateTitles(
  records: LocatedLca[],
  opts: Partial<{ metroMin: number; tierMin: number }> = {},
): { families: { key: string; label: string; buckets: TitleBucketAgg[] }[]; matchedTotal: number } {
  const { metroMin = 8, tierMin = 25 } = opts
  const byBucket = new Map<string, LocatedLca[]>()
  let matchedTotal = 0
  for (const r of records) {
    const b = bucketFor(r.title)
    if (!b) continue
    matchedTotal++
    const arr = byBucket.get(b.key)
    if (arr) arr.push(r); else byBucket.set(b.key, [r])
  }
  const build = (def: TitleBucketDef): TitleBucketAgg => {
    const recs = byBucket.get(def.key) ?? []
    const wages = recs.map(r => r.annualWage)
    const metros: Record<string, TitleStats> = {}
    const byMetro = new Map<string, number[]>()
    const byTier = new Map<Tier, number[]>()
    const bySoc = new Map<string, number>()
    const byEmp = new Map<string, { casings: Map<string, number>; wages: number[] }>()
    for (const r of recs) {
      ;(byMetro.get(r.cbsa) ?? byMetro.set(r.cbsa, []).get(r.cbsa)!).push(r.annualWage)
      const tier = parseSeniority(r.title)
      ;(byTier.get(tier) ?? byTier.set(tier, []).get(tier)!).push(r.annualWage)
      bySoc.set(r.soc, (bySoc.get(r.soc) ?? 0) + 1)
      const key = r.employer.toUpperCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim()
      const e = byEmp.get(key) ?? { casings: new Map(), wages: [] }
      byEmp.set(key, e)
      e.casings.set(r.employer, (e.casings.get(r.employer) ?? 0) + 1)
      e.wages.push(r.annualWage)
    }
    for (const [cbsa, ws] of [...byMetro].sort(([a], [b]) => a.localeCompare(b)))
      if (ws.length >= metroMin) metros[cbsa] = stats(ws)
    const tiers: TitleBucketAgg['tiers'] = {}
    for (const [tier, ws] of byTier) if (ws.length >= tierMin) tiers[tier] = stats(ws)
    const socSorted = [...bySoc.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    const top4 = socSorted.slice(0, 4)
    const rest = socSorted.slice(4).reduce((a, [, n]) => a + n, 0)
    const total = recs.length || 1
    const socMix = [
      ...top4.map(([soc, n]) => ({ soc, share: n / total })),
      ...(rest ? [{ soc: 'other', share: rest / total }] : []),
    ]
    const topEmployers = [...byEmp.values()]
      .map(e => ({
        name: [...e.casings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
        filings: e.wages.length,
        median: median(e.wages),
      }))
      .sort((a, b) => b.filings - a.filings || a.name.localeCompare(b.name))
      .slice(0, 5)
    return { key: def.key, label: def.label, national: stats(wages), metros, tiers, socMix, topEmployers }
  }
  return {
    families: FAMILIES.map(f => ({ key: f.key, label: f.label, buckets: f.buckets.map(build) })),
    matchedTotal,
  }
}
```
(⚠️ the `?? set().get()!` push idiom above is illustrative — if it reads poorly under strict TS, use the explicit three-line get-or-create; behavior only.)
Note `stats([])` would index `undefined` — buckets can be empty until the run-level assertion fires; guard: `national: recs.length ? stats(wages) : { filings: 0, p25: 0, median: 0, p75: 0 }` and TEST it.

- [ ] **Step 3:** PASS; tsc; commit `feat: title aggregation with seniority tiers and SOC mix`.

---

### Task 4: Emit + orchestrator wiring + LIVE RUN

**Files:**
- Modify: `pipeline/lib/emit.ts` (add `buildTitles`), `pipeline/config.ts` (thresholds), `pipeline/run.ts`
- Test: `pipeline/tests/emit.test.ts` (extend)
- Emit (committed): `site/public/data/titles.json` (+ any employer/salary diffs, expected NONE)

- [ ] **Step 1: TDD `buildTitles`** — takes `aggregateTitles` output + `lcaPeriod`, returns the spec's `TitlesJson` shape verbatim (families → buckets, drop nothing). Trivial mapping; test shape + that an empty-tier bucket omits the tier key.
- [ ] **Step 2: config thresholds:** add `minTitleFilings: 10_000, maxTitleFamilyOverlap: 0.01`.
- [ ] **Step 3: run.ts:** after `attachCbsa`+dedupe: `const titleAgg = aggregateTitles(matched)`; assertions — every bucket `national.filings > 0` (name the empty bucket in the error), `titleAgg.matchedTotal >= THRESHOLDS.minTitleFilings`, cross-family overlap: count records where ≥2 families match (`FAMILIES.filter(f => f.buckets.some(b => b.re.test(r.title)))`) ÷ matchedTotal ≤ `maxTitleFamilyOverlap` — compute on a 20k-record sample for speed; write `titles.json`; report gains per-bucket national filings + matchedTotal + overlap rate.
- [ ] **Step 4: LIVE RUN** `npm run pipeline`. Expect: all v1 thresholds + new title assertions pass; `git diff --stat site/public/data` shows ONLY `titles.json` added and `meta.json` (generated timestamp) — if salaries/employer files changed, STOP and diagnose (the Task-1 refactor must be output-neutral; only `generated` may differ). Spot-check `titles.json`: tpm national median ≈ $172k (matches the scan), tpm tiers include senior; Austin (12420) present under tpm metros or absent with < 8 filings (report which).
- [ ] **Step 5:** Full suite green; commit code + `site/public/data` together: `feat: emit title-lens dataset`.

---

### Task 5: Site — TitleLens section

**Files:**
- Create: `site/components/TitleLens.tsx`, `site/components/TitleBucketRow.tsx`, `site/lib/title-types.ts`
- Modify: `site/lib/data.ts` (loadTitles), `site/app/page.tsx` (mount + onSelectRole), `site/app/globals.css`
- Test: `site/tests/title-lens.test.tsx`

**Palette (validate FIRST, dataviz validator, both modes, categorical rules):** SOC-mix segment colors — light `['#356fae', '#c46a1f', '#3f8f5f', '#8a5fa8']`, dark `['#7fb0e0', '#e0975c', '#7fbf9a', '#b79ad0']`, "other" = `var(--line)`. Fixed assignment by socMix rank within a bucket; legend chips under each bar; snap to validator suggestions on FAIL and record output.

- [ ] **Step 1: Failing component test** (`title-lens.test.tsx`): fixture `TitlesJson` with 1 family / 2 buckets (one with tiers + metro 12420, one national-only). Stub fetch. Assert: family tab renders; bucket rows show label + filings + national median; selecting metro prop `cbsa="12420"` switches the first bucket's stats to metro values with an "in Austin" chip while the second keeps a "national" chip; expanding the disclosure shows tier rows; conflation segments render with `aria-label` shares; clicking a segment whose soc is in `roles` calls `onSelectRole` (and a segment with soc `'other'` or out-of-registry does nothing).
- [ ] **Step 2: Implement.** Key structure (full code authored at implementation following v1 component idioms — this task intentionally specifies BEHAVIOR + skeleton because it composes existing patterns; the reviewer checks against this list):
  - `title-types.ts` mirrors the spec contract verbatim.
  - `loadTitles = () => get<TitlesJson>('/data/titles.json')` in `data.ts`.
  - `TitleLens` props: `{ meta, cbsa: string | null, adjusted: boolean, onSelectRole: (soc: string) => void }`. Lazy: `IntersectionObserver` on the section root, fetch once on first intersect; loading/error/loaded states (inline error card, page unaffected).
  - Family tabs = radio-style buttons (`aria-pressed`), state local to TitleLens.
  - `TitleBucketRow`: national vs metro stat selection (`metro stats exist && cbsa` → metro + chip, else national + chip); COL adjustment ONLY on metro stats via `adjust`/`canAdjust` pattern (national always nominal); p25–p75 band SVG with median tick (shared domain per family from visible stats, same approach as MetroPanel's table domain); disclosure (`<details>`/`<summary>` or button+state) for tier ladder (national-only note chip); conflation bar: 100%-stacked div segments with 2px gaps, `title`+`aria-label` per segment ("filed under Software Developers 16%"), click → `onSelectRole(soc)` when `meta.roles.some(r => r.soc === soc)`, cursor/affordance only on clickable segments; SOC legend chips below (registry short names via meta.roles, raw code otherwise).
  - Section header cites `titles.lcaPeriod` + the standing "wage floors midpointed" note.
  - Page: `<TitleLens meta={meta} cbsa={state.metro} adjusted={state.adjusted} onSelectRole={soc => update({ role: soc })} />` below the hero row.
  - CSS: follow existing token/classname conventions (`.title-lens`, `.tl-tabs`, `.tl-row`, `.tl-band`, `.tl-mix`, `.tl-mix i`, `.tl-chip`, `.tl-tiers`), dark-safe via tokens.
- [ ] **Step 3:** vitest green (22 + new); tsc silent. Dev-server visual check (hot reload against running :3020, or start one and kill it): section renders, tabs switch, disclosure opens, segment click flips the map dropdown. Screenshot both themes to `e2e-scratch/title-lens-{light,dark}.png` — controller sends to user.
- [ ] **Step 4:** Commit `feat(site): Title lens section`.

---

### Task 6: e2e + close-out

**Files:**
- Modify: `site/e2e/happy-path.spec.ts` (extend or add spec file)

- [ ] **Step 1:** Extend Playwright: scroll to the Title lens, wait for load, expand the TPM row, assert a tier row and a conflation segment exist; click a registry-SOC segment → assert the role dropdown value changed and the map recolored (bubble count unchanged, URL contains the role param).
- [ ] **Step 2:** ⚠️ Ensure no dev server holds `.next` (coordinate via controller), then `npm run build` green; `npm run e2e` green (config boots its own server); screenshot to `e2e/screenshots/`.
- [ ] **Step 3:** Commit `test(site): Title lens e2e coverage`. Final review dispatch (controller): Opus over the full v2 range.

---

## Done criteria

- Pipeline: all tests green; live run passes v1 + title thresholds; `titles.json` committed; salaries/employer outputs byte-identical except `generated`.
- Site: Title lens live with tabs/ladders/conflation cross-links; both-theme screenshots user-approved; vitest + Playwright + static build green.
- Spec's honesty rails all observable in the UI (filings counts, ≥8 metro gate, ≥25 tier gate, national-only tier chips, lcaPeriod citation).
