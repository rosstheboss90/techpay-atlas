# Mobile Index Answer-First Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-render the mobile question-index cards as answer-first stat rows (eyebrow question → large fact → context → optional data-ink mini-viz), per `docs/superpowers/specs/2026-08-11-mobile-index-visual-design.md`.

**Architecture:** `lib/teasers.ts` moves from strings to structured `{ fact, context }` returns (+ per-card viz data); `QuestionSection` renders the new card anatomy with an optional `viz` node; a new ~20-line `MiniSpark` draws the trends sparkline; `page.tsx` assembles viz nodes from existing primitives (`PercentileBand`, chips). Desktop untouched; no new colors (sparkline uses `var(--accent)`, same token as `.mt-line`).

**Tech Stack:** React 19, vitest + RTL, existing chart tokens.

**Working rules:** branch `feat/mobile-index-cards` in a worktree with a real `npm ci` in `site/`; all npm from `site/`; pathspecs on add AND commit; never push main.

---

### Task 1: Structured teasers

**Files:**
- Modify: `site/lib/teasers.ts`
- Modify: `site/tests/teasers.test.ts`

The shared shape (export from `teasers.ts`):

```ts
export interface Teaser { fact: string; context: string }
```

New contracts (current string returns → structured; fallbacks per the spec's error table):

| Fn | Signature (unchanged args) | Happy return | Fallback return |
|---|---|---|---|
| `titleTeaser` | `(titles, soc, roleLabel)` | `{ fact: '“Software Engineer”', context: 'is what BLS counts as Software Developers' }` | `{ fact: 'See what these jobs are really called', context: '' }` |
| `payTeaser` | `(salaries, metros, soc)` → `Teaser & { top3: { city: string; p50: number }[] }` | `{ fact: '$210,000 · San Jose', context: 'tops 2 metros', top3: [{city:'San Jose',p50:210000},{city:'Cheapville',p50:100000}] }` (top3 = up to 3, p50 desc, `city` via `shortMetro`; context count = metros WITH a p50 for this soc) | `{ fact: 'Percentiles for every metro', context: 'on the map', top3: [] }` |
| `colTeaser` | `(metros, salaries, soc, metric)` | `{ fact: 'San Jose falls 1 place', context: 'once cost of living counts' }` | `{ fact: 'Rankings flip', context: 'see who leapfrogs whom once cost of living counts' }` (metric ≠ pay OR nothing falls) |
| `trendTeaser` | `(trends, soc)` | `{ fact: '−5.7% real', context: 'since 2021' }` | `{ fact: 'Trend data unavailable', context: '' }` |
| `similarTeaser` | `(meta, salaries, soc)` → `Teaser & { topLabel: string | null }` | `{ fact: '1 role', context: 'pays like this one', topLabel: 'QA' }` (topLabel = first row's label; verb agreement as today) | `{ fact: 'Not enough overlap', context: 'to compare this role', topLabel: null }` |

- [ ] **Step 1: Rewrite the five describe blocks in `teasers.test.ts`** to assert the structured shapes above (reuse the existing fixtures verbatim; every current fallback case keeps a test in the new shape; keep the U+2212/curly-quote characters; keep the honesty/label-never-hide comment intent). `shortMetro` tests unchanged.
- [ ] **Step 2:** `npx vitest run tests/teasers.test.ts` → FAILs on shape mismatches (report a sample).
- [ ] **Step 3: Rewrite the five functions** returning the shapes above. Preserve: the honesty doc comments (update wording to "fact/context"), `SLOPE_N` usage, the metric guard ordering (guard before compute), thin-pairs-count semantics, purity/null-tolerance.
- [ ] **Step 4:** `npx vitest run tests/teasers.test.ts` → PASS. Full `npx vitest run` will FAIL in `page.test.tsx`/e2e-adjacent component tests only if they assert teaser strings — they don't today; `page.tsx` still compiles because tsc runs per-file? NO — tsc is whole-project: `page.tsx` consumes the old strings and WILL fail tsc. That is expected mid-plan; do NOT run tsc as a gate for this task. Run only the teasers test file, then commit.
- [ ] **Step 5: Commit**

```bash
git add site/lib/teasers.ts site/tests/teasers.test.ts
git commit -m "feat(site): teasers return structured fact/context (+viz data)" -- site/lib/teasers.ts site/tests/teasers.test.ts
```

(The tree is red on tsc between Tasks 1 and 4 — Tasks 2–4 land in the same PR; Task 4 restores every gate.)

---

### Task 2: `MiniSpark`

**Files:**
- Create: `site/components/MiniSpark.tsx`
- Test: `site/tests/mini-spark.test.tsx`

- [ ] **Step 1: Failing tests**

```tsx
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { MiniSpark } from '../components/MiniSpark'

describe('MiniSpark', () => {
  it('draws segments split on nulls and an endpoint dot at the last real value', () => {
    const { container } = render(<MiniSpark series={[10, 12, null, 14, 16]} />)
    // null splits the line into two polylines; endpoint dot sits at the final point
    expect(container.querySelectorAll('polyline')).toHaveLength(2)
    expect(container.querySelector('circle')).not.toBeNull()
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
  it('renders nothing with fewer than two real points', () => {
    const { container } = render(<MiniSpark series={[null, 12, null]} />)
    expect(container.querySelector('svg')).toBeNull()
  })
})
```

- [ ] **Step 2:** `npx vitest run tests/mini-spark.test.tsx` → FAIL module-not-found.
- [ ] **Step 3: Implement**

```tsx
'use client'

const W = 120, H = 22, PAD = 2

/** Decorative sparkline for a question card: the shape of a series, nothing more. The card's
 *  TEXT carries the claim (honesty rule), so this is aria-hidden; nulls draw as gaps, matching
 *  the full trend charts. Stroke reuses the trends line token (--accent) — no new colors. */
export function MiniSpark({ series }: { series: (number | null)[] }) {
  const real = series.filter((v): v is number => v != null)
  if (real.length < 2) return null
  const lo = Math.min(...real), hi = Math.max(...real)
  const x = (i: number) => PAD + (i / (series.length - 1)) * (W - 2 * PAD)
  const y = (v: number) => hi === lo ? H / 2 : PAD + ((hi - v) / (hi - lo)) * (H - 2 * PAD)
  const runs: { i: number; v: number }[][] = []
  series.forEach((v, i) => {
    if (v == null) { if (runs[runs.length - 1]?.length) runs.push([]); return }
    if (!runs.length) runs.push([])
    runs[runs.length - 1].push({ i, v })
  })
  const lastIdx = series.length - 1 - [...series].reverse().findIndex(v => v != null)
  const last = series[lastIdx] as number
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="mini-spark">
      {runs.filter(r => r.length > 1).map(r => (
        <polyline key={r[0].i} points={r.map(p => `${x(p.i)},${y(p.v)}`).join(' ')} fill="none" />
      ))}
      <circle cx={x(lastIdx)} cy={y(last)} r={2.5} />
    </svg>
  )
}
```

- [ ] **Step 4:** tests PASS (a lone-point run renders no polyline — the filter handles it; if the two-polyline expectation trips on that, re-check the fixture, not the filter).
- [ ] **Step 5: Commit**

```bash
git add site/components/MiniSpark.tsx site/tests/mini-spark.test.tsx
git commit -m "feat(site): MiniSpark — decorative sparkline for question cards" -- site/components/MiniSpark.tsx site/tests/mini-spark.test.tsx
```

---

### Task 3: `QuestionSection` card anatomy

**Files:**
- Modify: `site/components/QuestionSection.tsx`
- Modify: `site/tests/question-section.test.tsx`

- [ ] **Step 1: Update tests first.** Props change: `teaser: string` → `fact: string; context: string; viz?: ReactNode`. Update every existing render call (`teaser="t"` → `fact="f" context="c"`); the collapse/anchor/scroll/aria tests otherwise unchanged. Add:

```tsx
it('card anatomy: eyebrow question, large fact, context, aria-hidden viz', () => {
  const { container } = render(
    <QuestionSection anchorId="trend-h" question="Is it holding up?" fact="−5.7% real"
                     context="since 2021" narrow viz={<svg data-testid="spark" />}>
      {child}
    </QuestionSection>,
  )
  const btn = container.querySelector('.qcard-btn')!
  expect(btn.querySelector('.qcard-q')!.textContent).toBe('Is it holding up?')
  expect(btn.querySelector('.qcard-fact')!.textContent).toBe('−5.7% real')
  expect(btn.querySelector('.qcard-ctx')!.textContent).toBe('since 2021')
  const viz = btn.querySelector('.qcard-viz')!
  expect(viz).toHaveAttribute('aria-hidden', 'true')
  expect(viz.querySelector('[data-testid="spark"]')).not.toBeNull()
})
it('empty context and absent viz render no empty containers', () => {
  const { container } = render(
    <QuestionSection anchorId="tl-h" question="q" fact="f" context="" narrow>{child}</QuestionSection>,
  )
  expect(container.querySelector('.qcard-ctx')).toBeNull()
  expect(container.querySelector('.qcard-viz')).toBeNull()
})
```

- [ ] **Step 2:** run the file → new tests fail (prop/type errors).
- [ ] **Step 3: Implement.** Button body becomes:

```tsx
<button type="button" className="qcard-btn" aria-expanded={open}
        aria-controls={`${anchorId}-body`} onClick={() => setOpen(o => !o)}>
  <span className="qcard-q">{question}</span>
  <span className="qcard-fact">{fact}</span>
  {context && <span className="qcard-ctx">{context}</span>}
  {viz != null && <span className="qcard-viz" aria-hidden="true">{viz}</span>}
  <span className="qcard-tap" aria-hidden="true">{open ? 'close ▴' : 'open ▾'}</span>
</button>
```

Everything else (id-swap, body div, scroll effect) untouched. Doc comment: the question is now the eyebrow; the fact is the visual lead; accessible name = question + fact + context (e2e relies on the question being in the name).

- [ ] **Step 4:** `npx vitest run tests/question-section.test.tsx` → PASS.
- [ ] **Step 5: Commit**

```bash
git add site/components/QuestionSection.tsx site/tests/question-section.test.tsx
git commit -m "feat(site): QuestionSection answer-first card anatomy (+viz slot)" -- site/components/QuestionSection.tsx site/tests/question-section.test.tsx
```

---

### Task 4: Wire `page.tsx` + CSS + gates

**Files:**
- Modify: `site/app/page.tsx`
- Modify: `site/app/globals.css`
- Modify: `site/tests/page.test.tsx` (only if structural assertions legitimately break)

- [ ] **Step 1: page.tsx.** Imports: `MiniSpark`, `PercentileBand`, `sharedBandDomain` (from '../lib/compare'), `fmtUsdCompact` (check its real export home in `lib/format.ts` first). The teasers block becomes:

```tsx
const teasers = {
  pay: payTeaser(salaries, meta.metros, state.role),
  col: colTeaser(meta.metros, salaries, state.role, state.metric),
  trend: trendTeaser(trends, state.role),
  similar: similarTeaser(meta, salaries, state.role),
}
// Mini-viz nodes for the cards that have real data-ink (spec: per-card mapping). Each is
// decorative — the card text carries the claim — and reuses an existing primitive/token.
const rowA = salaries[metroA]?.[state.role]
const rppA = meta.metros.find(m => m.cbsa === metroA)?.rpp ?? null
const payViz = teasers.pay.top3.length > 0 && (
  <span className="qcard-chips">
    {teasers.pay.top3.map(t => (
      <span key={t.city} className="qcard-chip"><b>{fmtUsdCompact(t.p50)}</b> {t.city}</span>
    ))}
  </span>
)
const bandViz = rowA != null && (
  <PercentileBand row={rowA} rpp={rppA} adjusted={state.adjusted}
                  domain={sharedBandDomain(rowA, undefined, rppA, null, state.adjusted)} width={220} />
)
const sparkSeries = trends?.roles[state.role]?.real
const sparkViz = sparkSeries != null && <MiniSpark series={sparkSeries} />
const similarViz = teasers.similar.topLabel != null && (
  <span className="qcard-chips"><span className="qcard-chip">{teasers.similar.topLabel}</span></span>
)
```

QuestionSection call sites (question props unchanged; `teaser=` → `fact=`/`context=`/`viz=`):

| Card | fact | context | viz |
|---|---|---|---|
| sec-map | `teasers.pay.fact` | `teasers.pay.context` | `{payViz \|\| undefined}` |
| h2h-h | `"Where does your offer land?"` | `"type it, compare any two metros"` | `{bandViz \|\| undefined}` |
| slope-h | `teasers.col.fact` | `teasers.col.context` | — |
| trend-h | `teasers.trend.fact` | `teasers.trend.context` | `{sparkViz \|\| undefined}` |
| tl-h | `"What do job ads call it?"` — NO: keep the static teaser semantics → fact `"Real filed titles"`, context `"seniority ladders, and who counts as what"` | | — |
| rsim-h | `teasers.similar.fact` | `teasers.similar.context` | `{similarViz \|\| undefined}` |
| hm-heading | `` `${meta.metros.length} × ${meta.roles.length}` `` | `"the whole grid, one screen"` | — |

(`false` is not a valid `viz` — coerce with `|| undefined` as shown.)

- [ ] **Step 2: CSS** (inside the existing 720px block, replacing `.qcard-q`/`.qcard-a` rules; read the token block first and reuse its names — these mirror Task 8's choices):

```css
.qcard-q { font-size: .68rem; letter-spacing: .09em; text-transform: uppercase; color: var(--ink-muted); }
.qcard-fact { font-size: 1.25rem; font-weight: 700; letter-spacing: -.01em; line-height: 1.25; font-variant-numeric: tabular-nums; }
.qcard-ctx { color: var(--ink-muted); font-size: .9rem; }
.qcard-viz { display: block; margin-top: 6px; }
.qcard-chips { display: flex; gap: 4px; flex-wrap: wrap; }
.qcard-chip { border: 1px solid var(--line); border-radius: 999px; padding: 1px 8px; font-size: .72rem; color: var(--ink-muted); }
.qcard-chip b { color: var(--ink); font-weight: 650; font-variant-numeric: tabular-nums; }
.mini-spark polyline { stroke: var(--accent); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.mini-spark circle { fill: var(--ink); }
```

(`--ink-muted`/`--line`/`--accent`/`--ink` were Task 8's real token names — verify against the file, don't trust this plan.) Delete the now-unused `.qcard-a` rule.

- [ ] **Step 3: Gates.** `npx vitest run` full (fix `page.test.tsx` fixtures only where structurally legitimate — e.g. if a test asserted old teaser text) · `npx tsc --noEmit --incremental false` · `npx eslint .` — all clean.
- [ ] **Step 4: Commit**

```bash
git add site/app/page.tsx site/app/globals.css site/tests/page.test.tsx
git commit -m "feat(site): answer-first mobile cards — facts large, chips/band/spark data-ink" -- site/app site/tests/page.test.tsx
```

---

### Task 5: e2e + visual + ship (controller-led)

- [ ] Run `npm run e2e` (ONE run, no dev server contention) — mobile-index height budget must still hold (< 1800px; the fact typography grows cards — if it busts, tighten `.qcard-btn` padding, not the budget).
- [ ] Controller screenshots: 390px collapsed + expanded, both themes; desktop unchanged spot-check.
- [ ] BACKLOG entry (visual iteration, links to spec/plan) — strike nothing (nothing closes).
- [ ] Final branch review → push branch → PR → 3 checks → merge → verify live bundle (`grep` a new string, e.g. `qcard-fact`) → ff main, remove worktree.

## Self-review notes (applied)

- Spec coverage: anatomy (T3), structured teasers incl. all fallbacks (T1), MiniSpark w/ null-gaps + endpoint dot (T2), per-card mapping + chips/band wiring (T4), aria-hidden minis (T2/T3), no new colors (T2/T4 CSS), tests per spec's testing table (T1–T4), e2e + visual (T5).
- Deliberate deviations from spec text: tl-h card keeps a static fact/context pair (the spec's `“{bucket label}”` fact needs titles.json at page level, which only TitleStrip loads — the strip directly above already states exactly that fact; duplicating the fetch wiring for a duplicate claim fails YAGNI). Flag to the user at review if contested.
- Type consistency: `Teaser` interface exported once (T1) and consumed by T3's props and T4's call sites; `top3`/`topLabel` names match across T1/T4.
