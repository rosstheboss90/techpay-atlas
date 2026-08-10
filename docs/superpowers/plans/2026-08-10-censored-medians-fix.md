# Censored Medians Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Censored (top-coded) metro medians stop rendering as real data — trend points gap with an explanatory note, band edges declare "above $X", and the San Jose 2020 artifact disappears from the public site.

**Architecture:** The parse layer is already correct (`#` → per-vintage top-code value + `capped: Pct[]`, `num.ts:24-37`, `vintages.ts:57-65`). The fix is three downstream consumers: `build-metro-trends.ts` derives its flag from the WRONG percentile (`includes('p90')` on a p50 chart) and never nulls censored medians; `MetroTrend.tsx` never reads the flag; `PercentileBand.tsx` draws capped ceilings as real band edges. Emitted `salaries.json` keeps its existing info-complete `{value, capped}` shape (spec deviation 1, below); the TREND series nulls censored medians (the existing `segments()` gap machinery then just works).

**Tech Stack:** TypeScript pipeline (vitest, `pipeline/tests/*.test.ts`), Next.js static site (vitest + testing-library, `site/tests/*.test.tsx`). Conventional commits. **Ship flow is branch → PR → all three checks → merge (merge auto-deploys GH Pages). NEVER push `main` directly.**

---

## Spec deviations (approved rationale, record in the spec header at close-out)

1. **`salaries.json` keeps `{value, capped}`** rather than the spec's "emit null". The repo's emit (`emit.ts:55-68`) already ships the ceiling value WITH the per-field `capped` array — info-complete and needed for honest "above $X" phrasing. Nulling would delete the bound. The spec's real requirement — "the floor value is NEVER *presented* as data" — is enforced at the consumers (Tasks 3–4) and in the trend series (Task 2), plus the archive regression lock (Task 1).
2. **Ledger close-out** uses the repo's actual idiom — `~~struck~~` + `FIXED <date> — <note>` inline — not the home-dashboard `Seen by:` convention the spec referenced (it does not exist here).
3. **Trend note phrasing**: the trend JSON gains a per-year `topCodes: number[]` at the trend level (from each archive's own `topCode`), so the note can say "median censored above $208,000 (2020–2021 top-code); points omitted" with real per-vintage numbers.

## Preconditions

- Work from a branch: `git -C C:/projects/techpay-atlas switch -c fix/censored-medians main` (local main carries 2 unpushed docs commits — the PR will carry them up legitimately).
- `data/raw/` and `data/history/` are populated on this box (2020 MSA vintage present: `data/raw/oesm20ma/MSA_M2020_dl.xlsx`; archives committed under `data/history/`).
- **Output-neutrality rule flips for this change**: after Task 5's re-emit, `git diff site/public/data` must show ONLY `meta.json`'s `generated` stamp, the `trends/*.json` files whose series contain censored medians (nulled points + `topCodes` + corrected `capped`), and nothing else. Any other diff is a defect in the fix.

---

### Task 1: Archive regression lock (real-data, read-only)

**Files:**
- Test: `pipeline/tests/censored-medians-lock.test.ts` (create)

- [ ] **Step 1: Write the test** (locks the REAL committed archives — the named cells from the ledger):

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// Regression lock for docs/BACKLOG.md 2026-08-09 🔴: these archive cells ARE
// p50-censored in the committed history. If a re-archive ever loses the flag,
// the metro-trend fix (build-metro-trends) silently regresses to plotting floors.
const arch = (year: number) =>
  JSON.parse(readFileSync(path.join('data', 'history', `oews-msa-${year}.json`), 'utf8'))

describe('censored-medians archive lock', () => {
  it('San Jose (41940) 11-3021 is p50-capped in 2020, 2021, 2023, 2024', () => {
    for (const year of [2020, 2021, 2023, 2024]) {
      expect(arch(year).metros['41940']['11-3021'].capped, `year ${year}`).toContain('p50')
    }
  })
  it('the capped value equals that vintage top-code, i.e. it is a floor, not a measurement', () => {
    const a = arch(2020)
    expect(a.topCode).toBe(208000)
    expect(a.metros['41940']['11-3021'].p50).toBe(208000)
  })
  it('Phoenix (38060) 15-1221 in 2021 and Santa Maria (42200) 15-1221 in 2022 are p50-capped', () => {
    expect(arch(2021).metros['38060']['15-1221'].capped).toContain('p50')
    expect(arch(2022).metros['42200']['15-1221'].capped).toContain('p50')
  })
})
```

- [ ] **Step 2: Run it** — `npx vitest run pipeline/tests/censored-medians-lock.test.ts` (repo root). Expected: **PASS immediately** (the data layer is already correct — this pins it). If any assertion FAILS, STOP: the archives differ from the ledger's claims and the ledger analysis must be re-verified before proceeding — report BLOCKED with the actual values.
- [ ] **Step 3: Commit** — `git add pipeline/tests/censored-medians-lock.test.ts && git commit -m "test: lock p50-censored archive cells (San Jose/Phoenix/Santa Maria)"`

### Task 2: `build-metro-trends.ts` — right flag, null the floors, emit topCodes

**Files:**
- Modify: `pipeline/lib/build-metro-trends.ts` (~lines 59-66 + the trend-object construction + its output type)
- Test: `pipeline/tests/build-metro-trends.test.ts` (extend if it exists, else create — check first)

- [ ] **Step 1: Read the file fully.** Identify the exported builder (ledger calls it `buildMetroTrend`), its input (sorted `MsaArchive[]`, cpi table) and the trend-object type it emits (also mirrored in `site/lib/metro-trend-types.ts` — both sides change together).
- [ ] **Step 2: Write the failing tests.** Build a minimal fixture of 3 archives (years 2020, 2021, 2022; topCodes 208000, 208000, 239200) for one cbsa/soc where 2020 is `{ p50: 208000, emp: 100, capped: ['p50'] }` and 2021-22 are real values with `capped: []` (plus a second soc where ONLY p90 is capped — must NOT null). Assert, adjusting only call-shape to the real signature (assertions are the contract):

```ts
// 1. p50-capped vintage → nominal[i] === null AND real[i] === null (gap, not floor)
// 2. capped[i] === true derived from p50 ('p50'), and the p90-only-capped soc has capped[i] === false AND unmutilated values (kills the old .includes('p90') bug in BOTH directions)
// 3. trend.topCodes deep-equals [208000, 208000, 239200]
// 4. a fully-censored series (every vintage p50-capped) is still emitted when other rules would keep it — nulls + capped flags, not dropped silently
```

- [ ] **Step 3: Run to verify the new assertions fail** against current code (`capped` currently from p90; values currently floors).
- [ ] **Step 4: Implement.** In the role loop (current `:59-66`): derive `const cappedP50 = sorted.map(a => (a.metros[cbsa]?.[role.soc]?.capped ?? []).includes('p50'))`; null the point where capped: `const nominal = sorted.map((a, i) => { const v = a.metros[cbsa]?.[role.soc]?.p50 ?? null; return cappedP50[i] ? null : v })`; `real` derives from the nulled nominal as today; role object emits `capped: cappedP50`. At trend level add `topCodes: sorted.map(a => a.topCode)`. Update the emitted type AND `site/lib/metro-trend-types.ts` (`MetroTrendData` gains `topCodes: number[]`; `roles[].capped` semantics comment: "true = median censored that vintage; the point is null").
- [ ] **Step 5: Run** the new tests + the whole pipeline suite: `npm test` (repo root) → all green.
- [ ] **Step 6: Commit** — `git add pipeline/lib/build-metro-trends.ts pipeline/tests/build-metro-trends.test.ts site/lib/metro-trend-types.ts && git commit -m "fix(pipeline): metro trend nulls censored medians and flags from p50, not p90"`

### Task 3: `MetroTrend.tsx` — render the censor note

**Files:**
- Modify: `site/components/MetroTrend.tsx` (note block alongside the existing break/ends-early notes at ~:111-123)
- Test: `site/tests/metro-trend-component.test.tsx` (extend)

- [ ] **Step 1: Write the failing tests** (extend the existing fixture — add `topCodes: [208000, 208000, 239200, 239200, 239200]` to `metro` and a role with `capped: [true, true, false, false, false]`, `nominal/real` null at those indices):

```ts
it('censored vintages render a note naming the ceiling and years, and the line gaps', () => {
  const { container, getByText } = render(<MetroTrend metro={censoredMetro} national={national} soc="11-3021" roleLabel="IT Managers" />)
  expect(getByText(/censored above \$208,000/i)).toBeTruthy()
  expect(getByText(/2020.*2021/)).toBeTruthy()
  // the nulled points split the polyline — reuse the existing segment-count assertion idiom
  expect(container.querySelectorAll('[data-metro-series]').length).toBeGreaterThan(1)
})
it('no censored vintages → no censor note', () => {
  const { queryByText } = render(<MetroTrend metro={metro} national={national} soc="15-1252" roleLabel="Software Developers" />)
  expect(queryByText(/censored/i)).toBeNull()
})
```

- [ ] **Step 2: Run → FAIL** (no note exists).
- [ ] **Step 3: Implement** in the notes area, following the `panel-note` idiom exactly (see the delineation-break note at `:111-117`):

```tsx
{(() => {
  const role = metro.roles[soc]
  const years = role ? metro.years.filter((_, i) => role.capped[i]) : []
  if (!years.length) return null
  const ceilings = [...new Set(years.map(y => metro.topCodes[metro.years.indexOf(y)]))]
  return (
    <p className="panel-note">
      Median censored above {ceilings.map(c => fmtUsd(c)).join(' / ')} in {years.join(', ')} — BLS
      top-codes the highest wages, so those points are omitted rather than plotted as real medians.
    </p>
  )
})()}
```
(Adjust `fmtUsd` import to the site's existing formatter; keep the copy — it is the honesty-rule wording.)
- [ ] **Step 4: Run** `cd site && npm test` → green.
- [ ] **Step 5: Commit** — `git add site/components/MetroTrend.tsx site/tests/metro-trend-component.test.tsx && git commit -m "fix(site): metro trend names censored vintages instead of plotting floors"`

### Task 4: `PercentileBand.tsx` — capped edges declare themselves

**Files:**
- Modify: `site/components/PercentileBand.tsx` (whole component is 18 lines, quoted in the scout report)
- Test: `site/tests/` — find the band's existing test file (`grep -rl PercentileBand site/tests`), extend; create `percentile-band.test.tsx` if none.

- [ ] **Step 1: Write the failing tests:**

```ts
it('a capped p90 renders a dashed edge and an "above" aria-label, not a normal edge', () => {
  const row = { p10: 81660, p25: 100940, p50: 135670, p75: 166070, p90: 239200, capped: ['p90'] }
  const { container } = render(<PercentileBand row={row} rpp={null} adjusted={false} domain={[50000, 250000]} />)
  expect(container.querySelector('svg')!.getAttribute('aria-label')).toMatch(/top earners above \$239,200/i)
  expect(container.querySelector('.band-outer')!.classList.contains('band-capped')).toBe(true)
})
it('a capped p50 drops the median tick and says so', () => {
  const row = { p10: 81660, p25: 100940, p50: 208000, p75: null, p90: null, capped: ['p50'] }
  const { container } = render(<PercentileBand row={row} rpp={null} adjusted={false} domain={[50000, 250000]} />)
  expect(container.querySelector('.band-median')).toBeNull()
  expect(container.querySelector('svg')!.getAttribute('aria-label')).toMatch(/median censored above \$208,000/i)
})
it('uncapped rows render exactly as before', () => {
  const row = { p10: 81660, p25: 100940, p50: 135670, p75: 166070, p90: 200200 }
  const { container } = render(<PercentileBand row={row} rpp={null} adjusted={false} domain={[50000, 250000]} />)
  expect(container.querySelector('.band-median')).toBeTruthy()
  expect(container.querySelector('.band-capped')).toBeNull()
})
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.** In the component: `const isCapped = (p: Pct) => row.capped?.includes(p) ?? false`. Rules: a capped p50 → do NOT draw `band-median` (a floor is not a median position) and append `median censored above ${fmtUsd(val('p50'))}` to the aria-label; a capped p90 → keep the outer rect (the bound is real information) but add class `band-capped` and aria text `top earners above ${fmtUsd(val('p90'))}`; capped p10/p25/p75 → same class treatment on their rect. Add `.band-capped { stroke-dasharray: 3 2; opacity: .7 }`-style rule wherever `.band-outer` is styled (find it: `grep -rn "band-outer" site/`). Note: `adjust()` scales a capped value by RPP — the "above $X" figure must use the SAME adjusted value it renders, which it does by using `val(p)`.
- [ ] **Step 4: Run** site suite → green, incl. the untouched-behavior test.
- [ ] **Step 5: Commit** — `git add site/components/PercentileBand.tsx site/tests/<band test file> <css file> && git commit -m "fix(site): percentile band declares top-coded bounds instead of drawing them as data"`

### Task 5: Re-emit, output-diff audit, ledger close-out

**Files:**
- Regenerate: `site/public/data/trends/*.json`, `site/public/data/meta.json`
- Modify: `docs/BACKLOG.md`, `docs/superpowers/specs/2026-08-10-censored-medians-fix-design.md`

- [ ] **Step 1: Re-run the pipeline** — `npm run pipeline` (repo root; raw data present). Expected: completes with all `DATA QUALITY` gates green.
- [ ] **Step 2: Output-diff audit** — `git diff --stat site/public/data` must show ONLY `meta.json` + `trends/*.json`. Spot-check San Jose: `node -e "const t=require('./site/public/data/trends/41940.json'); console.log(t.roles['11-3021'])"` → 2020/2021/2023/2024 positions null with `capped` true, `topCodes` present. Any diff outside trends/meta → STOP, diagnose (something else changed — the output-neutrality rule applies to everything the fix didn't target).
- [ ] **Step 3: The named artifact is gone**: the San Jose 11-3021 real series no longer contains the 2020→2021 decline (both plotted points gone) nor a 2025 jump off a floor.
- [ ] **Step 4: Ledger strike** — in `docs/BACKLOG.md`, wrap the 🔴 entry heading line in `~~ ~~` and append: `FIXED 2026-08-10 — build-metro-trends flags from p50 and nulls censored medians (gap + note); PercentileBand declares "above $X" bounds; archive lock test pins the San Jose/Phoenix/Santa Maria cells. Spec docs/superpowers/specs/2026-08-10-censored-medians-fix-design.md.` Flip the spec's `**Status:**` to `SHIPPED 2026-08-10 (this plan; deviations 1-3 recorded in the plan header)`.
- [ ] **Step 5: Commit** — `git add site/public/data docs/BACKLOG.md docs/superpowers/specs/2026-08-10-censored-medians-fix-design.md && git commit -m "data: re-emit trends with censored medians nulled; strike the ledger entry"`

### Task 6: PR, checks, merge, live verification

- [ ] **Step 1:** `git push -u origin fix/censored-medians` (branch push does NOT deploy).
- [ ] **Step 2:** `gh pr create --title "Censored metro medians: flag, gap, and declare — never plot the floor" --body "..."` — body summarizes the fix + deviations, links the spec, ends with the standard generated-with footer.
- [ ] **Step 3:** Wait for **all three** checks green (`gh pr checks --watch`). A red check → fix on the branch, never merge red.
- [ ] **Step 4:** Merge via `gh pr merge --merge` (repo convention `Merge PR #N: <summary>`). Merge auto-deploys Pages.
- [ ] **Step 5: Live verification** (green gates ≠ correct): after the Pages deploy completes, fetch `https://rosstheboss90.github.io/techpay-atlas/data/trends/41940.json` and confirm the 11-3021 nulls/`topCodes` are live; load the San Jose IT Managers trend page and confirm the gap + note render. Report what the live page actually shows.

---

## Self-review notes

- Spec coverage: detection (already existed — locked by Task 1), emission (Task 2 + deviation 1), site rendering (Tasks 3-4), regression lock (Tasks 1-2 tests), ledger close-out (Task 5), push unblocked (Task 6). National path untouched (correct per scout — p90 flag is right there).
- The dashboard comp-loop importer (cycle 2) consumes `salaries.json`'s `{value, capped}` shape — deviation 1 keeps that contract stable; the loop's spec already says it nulls capped fields at import.
- Tasks 2-4 test code adjusts only call-shape/imports to observed reality; every assertion is the contract. Any assertion-vs-output disagreement is BLOCKED-and-report, never adjust-to-green.
