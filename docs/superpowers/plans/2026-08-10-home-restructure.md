# Home Restructure (Question Spine + Mobile Question Index) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-order the home page around reader questions, add a collapsible title strip and trends teaser, and collapse sections into a tappable question index on narrow viewports.

**Architecture:** New pure `lib/teasers.ts` computes each card's one-line answer from already-loaded JSON; a `QuestionSection` wrapper renders children untouched on desktop and a collapsed card (children unmounted) on narrow viewports; `page.tsx` re-orders sections and stops treating a missing `trends.json` as fatal. Spec: `docs/superpowers/specs/2026-08-10-home-restructure-design.md`.

**Tech Stack:** Next.js static export (App Router), React 19, vitest + @testing-library/react, Playwright.

**Working rules for every task:** work on branch `feat/home-restructure` (worktree recommended — see repo CLAUDE.md "Worktrees need real setup": real `npm ci` in `site/`). All commands run from `site/` unless noted. Never push `main` — push the branch, PR, wait for all three checks. Purely additive where possible; chart internals unchanged.

**Heading map (used by Tasks 6 and 8 — ids never change):**

| id | Old heading | New heading |
|---|---|---|
| (new h2, nav keeps `sec-map`) | — | What does it pay — and where? |
| `h2h-h` | Head to head | Are you underpaid? |
| `slope-h` | Cost of living flips the ranking | Is it real money there? |
| `trend-h` (new) | — | Is it holding up? |
| `tl-h` | Job titles, not just SOC codes | What do these jobs actually get called? |
| `rsim-h` | Which roles pay like this one? | What else could you be? |
| `hm-heading` | City × role | Every metro × every role |

---

### Task 1: `useNarrow` hook

**Files:**
- Create: `site/lib/use-narrow.ts`
- Test: `site/tests/use-narrow.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNarrow } from '../lib/use-narrow'

function mockMatchMedia(initial: boolean) {
  let listener: ((e: { matches: boolean }) => void) | null = null
  const mql = {
    matches: initial,
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => { listener = fn },
    removeEventListener: () => { listener = null },
  }
  vi.stubGlobal('matchMedia', () => mql)
  return { fire: (matches: boolean) => act(() => listener?.({ matches })) }
}

describe('useNarrow', () => {
  it('reflects the initial match and tracks changes', () => {
    const mm = mockMatchMedia(true)
    const { result } = renderHook(() => useNarrow())
    expect(result.current).toBe(true)
    mm.fire(false)
    expect(result.current).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/use-narrow.test.tsx`
Expected: FAIL — `Cannot find module '../lib/use-narrow'`

- [ ] **Step 3: Write the implementation**

```ts
'use client'
import { useEffect, useState } from 'react'

/** True below the site's narrow breakpoint (globals.css uses 720px). Starts false —
 *  the page tree only renders client-side after data load, so one narrow-detection
 *  render after mount is invisible in practice. */
export function useNarrow(query = '(max-width: 720px)'): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(query)
    setNarrow(mq.matches)
    const fn = (e: MediaQueryListEvent) => setNarrow(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [query])
  return narrow
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/use-narrow.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add site/lib/use-narrow.ts site/tests/use-narrow.test.tsx
git commit -m "feat(site): useNarrow viewport hook" -- site/lib/use-narrow.ts site/tests/use-narrow.test.tsx
```

---

### Task 2: Teaser derivations (`lib/teasers.ts`)

**Files:**
- Create: `site/lib/teasers.ts`
- Test: `site/tests/teasers.test.ts`

Facts these lean on (verified against the committed data): `TrendsRole.changeReal` is a **fraction** (−0.0568 for Software Developers), `TrendsRole.nominal` is the national median series index-aligned to `TrendsJson.years`, `TitleBucket.socMix[0]` is the dominant SOC, and `slopeRows` (lib/slopegraph.ts) returns `delta = nominalRank − adjustedRank` (< 0 = fell under adjustment).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import type { Meta, MetroMeta, Salaries } from '../lib/types'
import type { TitlesJson } from '../lib/title-types'
import type { TrendsJson } from '../lib/trends-types'
import { colTeaser, payTeaser, shortMetro, similarTeaser, titleTeaser, trendTeaser } from '../lib/teasers'

const metro = (cbsa: string, name: string, rpp: number | null): MetroMeta =>
  ({ cbsa, name, state: 'XX', lat: 0, lng: 0, rpp, lcaFilings: 0 })

const row = (p50: number) => ({ emp: 100, lq: 1, p10: p50 * 0.6, p25: p50 * 0.8, p50, p75: p50 * 1.2, p90: p50 * 1.5 })

const trends: TrendsJson = {
  years: [2021, 2025], headlineFrom: 2021, headlineTo: 2025,
  deflator: { series: 'CUUR0000SA0', period: 'May', base: 2025 },
  roles: { '15-1252': { label: 'Software Developers', short: 'SWE', firstYear: 2021,
    nominal: [120730, 135980], real: [144100, 135980], emp: [null, null],
    cappedP90: [false, false], changeReal: -0.056823 } },
  skippedRoles: [], breaks: [],
}

const titles: TitlesJson = {
  lcaPeriod: 'FY2025',
  families: [{ key: 'swe', label: 'Software Engineering', buckets: [
    { key: 'swe', label: 'Software Engineer', national: { filings: 90000, p25: 1, median: 2, p75: 3 },
      metros: {}, tiers: {}, socMix: [{ soc: '15-1252', share: 0.9 }], topEmployers: [] },
    { key: 'fullstack', label: 'Full-Stack Developer', national: { filings: 5000, p25: 1, median: 2, p75: 3 },
      metros: {}, tiers: {}, socMix: [{ soc: '15-1252', share: 0.8 }], topEmployers: [] },
  ] }],
}

describe('shortMetro', () => {
  it('takes the first city of a CBSA title', () => {
    expect(shortMetro('San Jose-Sunnyvale-Santa Clara, CA')).toBe('San Jose')
    expect(shortMetro('Elmira, NY')).toBe('Elmira')
  })
})

describe('titleTeaser', () => {
  it('names the highest-filing bucket whose dominant SOC is the role', () => {
    expect(titleTeaser(titles, '15-1252', 'Software Developers'))
      .toBe('Called “Software Engineer”? BLS counts you as Software Developers')
  })
  it('falls back generically when titles are missing or the role has no bucket', () => {
    expect(titleTeaser(null, '15-1252', 'Software Developers')).toBe('See what these jobs are really called')
    expect(titleTeaser(titles, '11-3021', 'IT Managers')).toBe('See what these jobs are really called')
  })
})

describe('payTeaser', () => {
  const metros = [metro('1', 'Cheapville, TX', 90), metro('2', 'San Jose-Sunnyvale-Santa Clara, CA', 113)]
  const salaries: Salaries = { '1': { '15-1252': row(100_000) }, '2': { '15-1252': row(210_000) } }
  it('states the latest national median and the top metro', () => {
    expect(payTeaser(trends, salaries, metros, '15-1252'))
      .toBe('$135,980 national median · San Jose tops the map')
  })
  it('degrades to top metro only, then to a generic line', () => {
    expect(payTeaser(null, salaries, metros, '15-1252')).toBe('San Jose tops the map')
    expect(payTeaser(null, {}, metros, '15-1252')).toBe('Percentiles for every metro on the map')
  })
})

describe('colTeaser', () => {
  const metros = [metro('1', 'Cheapville, TX', 90), metro('2', 'San Jose-Sunnyvale-Santa Clara, CA', 150)]
  const salaries: Salaries = { '1': { '15-1252': row(150_000) }, '2': { '15-1252': row(160_000) } }
  it('names the metro that falls furthest once adjusted', () => {
    // San Jose: nominal rank 1, adjusted 160k/1.5 ≈ 106.7k < Cheapville 150k/0.9 ≈ 166.7k → rank 2
    expect(colTeaser(metros, salaries, '15-1252'))
      .toBe('San Jose falls 1 place once cost of living counts')
  })
  it('falls back when nothing falls', () => {
    expect(colTeaser([metro('1', 'Cheapville, TX', 100)], { '1': { '15-1252': row(100_000) } }, '15-1252'))
      .toBe('See who leapfrogs whom once cost of living counts')
  })
})

describe('trendTeaser', () => {
  it('formats the fractional changeReal as signed percent since headlineFrom', () => {
    expect(trendTeaser(trends, '15-1252')).toBe('−5.7% in real terms since 2021')
  })
  it('is honest about a missing series', () => {
    expect(trendTeaser(null, '15-1252')).toBe('Trend data unavailable')
    expect(trendTeaser(trends, '11-3021')).toBe('Trend data unavailable')
  })
})

describe('similarTeaser', () => {
  it('falls back below the overlap floor', () => {
    // Two metros shared is far below MIN_SHARED (40) — similarByPay returns []
    const meta = { year: 2025, generated: '', metros: [metro('1', 'A, TX', 100)], roles: [
      { soc: '15-1252', label: 'Software Developers' }, { soc: '15-1253', label: 'QA' },
    ], topCodeValue: 0, rppYear: 2024, lcaPeriod: '' } as unknown as Meta
    expect(similarTeaser(meta, { '1': { '15-1252': row(100_000), '15-1253': row(95_000) } }, '15-1252'))
      .toBe('Not enough overlap to compare this role')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/teasers.test.ts`
Expected: FAIL — `Cannot find module '../lib/teasers'`

- [ ] **Step 3: Write the implementation**

```ts
import type { Meta, MetroMeta, Salaries } from './types'
import type { TitlesJson } from './title-types'
import type { TrendsJson } from './trends-types'
import { fmtUsd } from './format'
import { similarByPay } from './role-similarity'
import { slopeRows, type SlopeRow } from './slopegraph'

/** First city of a CBSA title: "San Jose-Sunnyvale-Santa Clara, CA" → "San Jose". */
export function shortMetro(name: string): string {
  return name.split(/[-,]/)[0].trim()
}

/** One-line answers for the mobile question index. Each is pure, tolerates missing data,
 *  and never states a number the expanded section doesn't show with its caveats
 *  (honesty rule — see the 2026-08-10 restructure spec). */

export function titleTeaser(titles: TitlesJson | null, soc: string, roleLabel: string): string {
  const top = titles?.families
    .flatMap(f => f.buckets)
    .filter(b => b.socMix[0]?.soc === soc)
    .sort((a, b) => b.national.filings - a.national.filings)[0]
  return top
    ? `Called “${top.label}”? BLS counts you as ${roleLabel}`
    : 'See what these jobs are really called'
}

export function payTeaser(trends: TrendsJson | null, salaries: Salaries, metros: MetroMeta[], soc: string): string {
  const series = trends?.roles[soc]?.nominal
  const latest = series ? [...series].reverse().find((v): v is number => v != null) ?? null : null
  let top: { name: string; v: number } | null = null
  for (const m of metros) {
    const v = salaries[m.cbsa]?.[soc]?.p50
    if (v != null && (top == null || v > top.v)) top = { name: m.name, v }
  }
  if (latest != null && top) return `${fmtUsd(latest)} national median · ${shortMetro(top.name)} tops the map`
  if (top) return `${shortMetro(top.name)} tops the map`
  return 'Percentiles for every metro on the map'
}

export function colTeaser(metros: MetroMeta[], salaries: Salaries, soc: string): string {
  const worst = slopeRows(metros, salaries, soc, 18)
    .reduce<SlopeRow | null>((acc, r) => (r.delta < (acc?.delta ?? 0) ? r : acc), null)
  if (worst == null) return 'See who leapfrogs whom once cost of living counts'
  const n = -worst.delta
  return `${shortMetro(worst.name)} falls ${n} place${n === 1 ? '' : 's'} once cost of living counts`
}

export function trendTeaser(trends: TrendsJson | null, soc: string): string {
  const role = trends?.roles[soc]
  if (!role) return 'Trend data unavailable'
  const pct = role.changeReal * 100
  const sign = pct >= 0 ? '+' : '−'
  return `${sign}${Math.abs(pct).toFixed(1)}% in real terms since ${trends!.headlineFrom}`
}

export function similarTeaser(meta: Meta, salaries: Salaries, soc: string): string {
  const n = similarByPay(meta, salaries, soc).length
  return n === 0
    ? 'Not enough overlap to compare this role'
    : `${n} role${n === 1 ? '' : 's'} pay like this one`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/teasers.test.ts`
Expected: PASS (if `similarTeaser`'s meta cast trips tsc, keep the `as unknown as Meta` — Meta has no extra required fields today)

- [ ] **Step 5: Commit**

```bash
git add site/lib/teasers.ts site/tests/teasers.test.ts
git commit -m "feat(site): pure teaser derivations for the question index" -- site/lib/teasers.ts site/tests/teasers.test.ts
```

---

### Task 3: `QuestionSection`

**Files:**
- Create: `site/components/QuestionSection.tsx`
- Test: `site/tests/question-section.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuestionSection } from '../components/QuestionSection'

const child = <div data-testid="heavy">chart</div>

describe('QuestionSection', () => {
  it('desktop: renders children untouched, no card chrome', () => {
    render(<QuestionSection anchorId="h2h-h" question="Are you underpaid?" teaser="t" narrow={false}>{child}</QuestionSection>)
    expect(screen.getByTestId('heavy')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('narrow: collapsed card, children NOT mounted, aria wired', async () => {
    render(<QuestionSection anchorId="h2h-h" question="Are you underpaid?" teaser="Type your offer" narrow>{child}</QuestionSection>)
    expect(screen.queryByTestId('heavy')).not.toBeInTheDocument()
    const btn = screen.getByRole('button', { name: /Are you underpaid\?/ })
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    expect(btn).toHaveAttribute('aria-controls', 'h2h-h-body')
    await userEvent.click(btn)
    expect(screen.getByTestId('heavy')).toBeInTheDocument()
    expect(btn).toHaveAttribute('aria-expanded', 'true')
  })

  it('narrow: initialOpen mounts children from the start (hash deep-link)', () => {
    render(<QuestionSection anchorId="rsim-h" question="What else?" teaser="t" narrow initialOpen>{child}</QuestionSection>)
    expect(screen.getByTestId('heavy')).toBeInTheDocument()
  })

  it('collapsed card carries the anchor id so nav/hash targets resolve', () => {
    const { container } = render(<QuestionSection anchorId="rsim-h" question="q" teaser="t" narrow>{child}</QuestionSection>)
    expect(container.querySelector('#rsim-h')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/question-section.test.tsx`
Expected: FAIL — `Cannot find module '../components/QuestionSection'`

- [ ] **Step 3: Write the implementation**

```tsx
'use client'
import { type ReactNode, useEffect, useRef, useState } from 'react'

interface Props {
  /** DOM id of the wrapped section's own heading (e.g. 'h2h-h'). While collapsed the card
   *  carries it (the heading isn't mounted), so nav anchors and hash links keep resolving;
   *  while open the child's own heading has it — never both at once. */
  anchorId: string
  question: string
  teaser: string
  narrow: boolean
  /** Expand on first render (hash deep-link) and scroll to the card. */
  initialOpen?: boolean
  children: ReactNode
}

/** Narrow viewports collapse a section to its question + one-line answer; desktop renders
 *  children untouched. Children mount only while expanded — the heavy D3 sections never
 *  render offscreen. `open` survives viewport crossings (component stays mounted). */
export function QuestionSection({ anchorId, question, teaser, narrow, initialOpen = false, children }: Props) {
  const [open, setOpen] = useState(initialOpen)
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    if (initialOpen) ref.current?.scrollIntoView()
  }, [initialOpen])
  if (!narrow) return <>{children}</>
  return (
    <section ref={ref} className="qcard" id={open ? undefined : anchorId}>
      <button type="button" className="qcard-btn" aria-expanded={open}
              aria-controls={`${anchorId}-body`} onClick={() => setOpen(o => !o)}>
        <span className="qcard-q">{question}</span>
        <span className="qcard-a">{teaser}</span>
        <span className="qcard-tap" aria-hidden="true">{open ? 'close ▴' : 'open ▾'}</span>
      </button>
      <div id={`${anchorId}-body`} hidden={!open}>{open && children}</div>
    </section>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/question-section.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add site/components/QuestionSection.tsx site/tests/question-section.test.tsx
git commit -m "feat(site): QuestionSection — mobile question card wrapper" -- site/components/QuestionSection.tsx site/tests/question-section.test.tsx
```

---

### Task 4: `TitleStrip`

**Files:**
- Create: `site/components/TitleStrip.tsx`
- Test: `site/tests/title-strip.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const loadTitles = vi.fn()
vi.mock('../lib/data', () => ({ loadTitles: () => loadTitles() }))
import { TitleStrip } from '../components/TitleStrip'

const titles = {
  lcaPeriod: 'FY2025',
  families: [{ key: 'swe', label: 'SWE', buckets: [
    { key: 'swe', label: 'Software Engineer', national: { filings: 90000, p25: 1, median: 2, p75: 3 },
      metros: {}, tiers: {}, socMix: [{ soc: '15-1252', share: 0.9 }], topEmployers: [] },
  ] }],
}

afterEach(() => loadTitles.mockReset())

describe('TitleStrip', () => {
  it('renders the real-alias line once titles load, and expands to the lens link', async () => {
    loadTitles.mockResolvedValue(titles)
    render(<TitleStrip soc="15-1252" roleLabel="Software Developers" />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Called “Software Engineer”\?/ })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('link', { name: /full ladder/i })).toHaveAttribute('href', '#tl-h')
  })

  it('failed titles fetch leaves the generic line, no crash', async () => {
    loadTitles.mockRejectedValue(new Error('404'))
    render(<TitleStrip soc="15-1252" roleLabel="Software Developers" />)
    expect(await screen.findByRole('button', { name: /really called/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/title-strip.test.tsx`
Expected: FAIL — `Cannot find module '../components/TitleStrip'`

- [ ] **Step 3: Write the implementation**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { loadTitles } from '../lib/data'
import type { TitlesJson } from '../lib/title-types'
import { titleTeaser } from '../lib/teasers'

/** §2 of the question spine: "What's your job actually called?" as one line above the map,
 *  collapsible on every viewport (deliberately NOT a QuestionSection — desktop collapses it
 *  too, see the D1 decision in the spec). Loads titles.json itself; TitleLens keeps its own
 *  load (HTTP cache dedupes) so its internals stay untouched. */
export function TitleStrip({ soc, roleLabel }: { soc: string; roleLabel: string }) {
  const [titles, setTitles] = useState<TitlesJson | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let on = true
    loadTitles().then(t => { if (on) setTitles(t) }).catch(() => { /* generic line stands */ })
    return () => { on = false }
  }, [])
  return (
    <div className="title-strip">
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {titleTeaser(titles, soc, roleLabel)} <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <p className="ts-more">
          Job ads and official statistics use different names. The title lens maps real filed
          titles — and their seniority ladders — onto the codes the numbers are published under.{' '}
          <a href="#tl-h">See the full ladder ↓</a>
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/title-strip.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add site/components/TitleStrip.tsx site/tests/title-strip.test.tsx
git commit -m "feat(site): TitleStrip — collapsible title-finder above the map" -- site/components/TitleStrip.tsx site/tests/title-strip.test.tsx
```

---

### Task 5: `TrendsTeaser`

**Files:**
- Create: `site/components/TrendsTeaser.tsx`
- Test: `site/tests/trends-teaser.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TrendsTeaser } from '../components/TrendsTeaser'
import type { TrendsJson } from '../lib/trends-types'

const trends: TrendsJson = {
  years: [2021, 2025], headlineFrom: 2021, headlineTo: 2025,
  deflator: { series: 'CUUR0000SA0', period: 'May', base: 2025 },
  roles: { '15-1252': { label: 'Software Developers', short: 'SWE', firstYear: 2021,
    nominal: [120730, 135980], real: [144100, 135980], emp: [null, null],
    cappedP90: [false, false], changeReal: -0.056823 } },
  skippedRoles: [], breaks: [],
}

describe('TrendsTeaser', () => {
  it('states the real change and links to /trends carrying the role', () => {
    render(<TrendsTeaser trends={trends} soc="15-1252" roleLabel="Software Developers" />)
    expect(screen.getByRole('heading', { name: 'Is it holding up?' })).toHaveAttribute('id', 'trend-h')
    expect(screen.getByText(/−5\.7% in real terms since 2021/)).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/trends?role=15-1252')
  })

  it('renders the section with a fallback line (and no link) when trends failed to load', () => {
    render(<TrendsTeaser trends={null} soc="15-1252" roleLabel="Software Developers" />)
    expect(screen.getByText(/Trend data unavailable/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/trends-teaser.test.tsx`
Expected: FAIL — `Cannot find module '../components/TrendsTeaser'`

- [ ] **Step 3: Write the implementation**

```tsx
'use client'
import Link from 'next/link'
import type { TrendsJson } from '../lib/trends-types'
import { trendTeaser } from '../lib/teasers'

/** §6 of the question spine: one computed line + the on-ramp to /trends, role carried
 *  across (same param shape MetroTrend already links with). */
export function TrendsTeaser({ trends, soc, roleLabel }: {
  trends: TrendsJson | null; soc: string; roleLabel: string
}) {
  return (
    <section className="trend-teaser" aria-labelledby="trend-h">
      <h2 id="trend-h">Is it holding up?</h2>
      <p>
        {roleLabel}: {trendTeaser(trends, soc)}.{' '}
        {trends != null && <Link href={`/trends?role=${soc}`}>Every role, {trends.years[0]}–{trends.years[trends.years.length - 1]} →</Link>}
      </p>
    </section>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/trends-teaser.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add site/components/TrendsTeaser.tsx site/tests/trends-teaser.test.tsx
git commit -m "feat(site): TrendsTeaser — 'Is it holding up?' home section" -- site/components/TrendsTeaser.tsx site/tests/trends-teaser.test.tsx
```

---

### Task 6: Question headings + nav labels

**Files:**
- Modify: `site/components/RankSlopegraph.tsx:50`, `site/components/HeadToHead.tsx:103`, `site/components/TitleLens.tsx:75`, `site/components/RoleSimilarity.tsx:29`, `site/components/RoleHeatmap.tsx:74`
- Modify: `site/components/SectionNav.tsx:7-14`
- Modify: `site/e2e/head-to-head.spec.ts:9`, `site/e2e/heatmap.spec.ts:9`, `site/e2e/role-similarity.spec.ts:9`, `site/e2e/slopegraph.spec.ts:9`

- [ ] **Step 1: Change the five `<h2>` texts per the heading map** (ids stay exactly as they are):

```tsx
<h2 id="slope-h">Is it real money there?</h2>
<h2 id="h2h-h">Are you underpaid?</h2>
<h2 id="tl-h">What do these jobs actually get called?</h2>
<h2 id="rsim-h">What else could you be?</h2>
<h2 id="hm-heading">Every metro × every role</h2>
```

- [ ] **Step 2: Replace `LINKS` in SectionNav.tsx** — new order matches the new page order (Task 8), `trend-h` added:

```ts
const LINKS = [
  { id: 'sec-map', label: 'Pay, where?' },
  { id: 'h2h-h', label: 'Underpaid?' },
  { id: 'slope-h', label: 'Real money?' },
  { id: 'trend-h', label: 'Holding up?' },
  { id: 'tl-h', label: 'Called what?' },
  { id: 'rsim-h', label: 'What else?' },
  { id: 'hm-heading', label: 'The grid' },
]
```

- [ ] **Step 3: Update the four e2e heading assertions** to the new texts:

```ts
// head-to-head.spec.ts:9
await expect(page.getByRole('heading', { name: 'Are you underpaid?' })).toBeVisible()
// heatmap.spec.ts:9
await expect(page.getByRole('heading', { name: 'Every metro × every role' })).toBeVisible()
// role-similarity.spec.ts:9
await expect(page.getByRole('heading', { name: /What else could you be/i })).toBeVisible()
// slopegraph.spec.ts:9
await expect(page.getByRole('heading', { name: /Is it real money there/i })).toBeVisible()
```

Then sweep for stragglers: `grep -rn "Head to head\|flips the ranking\|not just SOC codes\|roles pay like\|City × role" tests/ e2e/ app/ components/` — update any remaining *assertion or nav* match to the heading map (leave `title-lens.spec.ts:37`'s comment if it no longer applies, or fix the comment).

- [ ] **Step 4: Run unit tests + tsc**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS (component tests don't assert these headings today; the sweep in Step 3 catches any that do)

- [ ] **Step 5: Commit**

```bash
git add site/components/RankSlopegraph.tsx site/components/HeadToHead.tsx site/components/TitleLens.tsx site/components/RoleSimilarity.tsx site/components/RoleHeatmap.tsx site/components/SectionNav.tsx site/e2e
git commit -m "feat(site): question headings + question nav labels" -- site/components site/e2e
```

---

### Task 7: `trends.json` failure stops being fatal

**Files:**
- Modify: `site/app/page.tsx:29-42,80` (load + gate)
- Modify: `site/components/MetroPanel.tsx:14` (prop type)
- Modify: `site/components/MetroTrend.tsx:30-35,70,83,126-128` (null tolerance)
- Test: extend `site/tests/metro-trend-component.test.tsx`

- [ ] **Step 1: Write the failing test** (append to `metro-trend-component.test.tsx`):

```tsx
it('renders the metro series without a national ghost when trends.json failed to load', () => {
  const { container } = render(<MetroTrend metro={metro} national={null} soc="15-1252" roleLabel="Software Developers" />)
  expect(container.querySelector('[data-metro-series]')).not.toBeNull()
  expect(container.querySelector('[data-national-series]')).toBeNull()
  expect(screen.queryByText(/vs/)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/metro-trend-component.test.tsx`
Expected: FAIL — tsc/type error (`national` not nullable) or render crash on `national.years`

- [ ] **Step 3: Make `MetroTrend` null-tolerant**

```tsx
// signature:
national: TrendsJson | null
// line ~70:
const nationalPoints = national ? pathPoints(national, soc) : []
// line ~83:
const allYears = [...metro.years, ...(national?.years ?? [])]
// legend (~126): render "vs National" only when the ghost line exists:
{nationalPoints.length > 0 && (
  <p className="mt-legend">
    <span className="mt-legend-metro">{metro.name}</span> vs <span className="mt-legend-national">National</span>
  </p>
)}
```

And in `MetroPanel.tsx:14`: `national: TrendsJson | null`.

- [ ] **Step 4: Make the page render without trends** (`page.tsx`):

```ts
// load (line ~30): trends is best-effort
Promise.all([loadMeta(), loadSalaries(), loadTrends().catch(() => null)])
// gate (line ~80): drop trends from the loading condition
if (!meta || !salaries || !role) return <main className="page"><p className="loading">Loading…</p></main>
```

(`useState<TrendsJson | null>` is already the state type; `setTrends(t)` now receives null on failure — remove any non-null assumption tsc flags.)

- [ ] **Step 5: Run tests + tsc**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add site/app/page.tsx site/components/MetroPanel.tsx site/components/MetroTrend.tsx site/tests/metro-trend-component.test.tsx
git commit -m "fix(site): missing trends.json degrades the trend surfaces, not the page" -- site/app/page.tsx site/components/MetroPanel.tsx site/components/MetroTrend.tsx site/tests/metro-trend-component.test.tsx
```

---

### Task 8: Restructure `page.tsx` + CSS

**Files:**
- Modify: `site/app/page.tsx:85-125` (render tree)
- Modify: `site/app/globals.css` (thesis line, title strip, map heading, question cards in the existing `@media (max-width: 720px)` block at line ~478)

- [ ] **Step 1: Rebuild the render tree in the new order.** Imports to add: `QuestionSection`, `TitleStrip`, `TrendsTeaser`, `useNarrow`, teaser fns. Inside `Page()` after the loading gate:

```tsx
const narrow = useNarrow()
// Hash deep-link: which card starts open. Read once per full render; safe here because this
// code only runs client-side (the loading gate returns before data exists at export time).
const hash = window.location.hash.slice(1)
const cardIds = ['sec-map', 'h2h-h', 'slope-h', 'trend-h', 'tl-h', 'rsim-h', 'hm-heading']
const openId = cardIds.includes(hash) ? hash : null

const teasers = {
  pay: payTeaser(trends, salaries, meta.metros, state.role),
  col: colTeaser(meta.metros, salaries, state.role),
  trend: trendTeaser(trends, state.role),
  similar: similarTeaser(meta, salaries, state.role),
}
```

Then the tree (unchanged pieces elided here with `…` **only because they move verbatim** — same props as today):

```tsx
<main className="page">
  <header className="masthead">
    <div>
      <h1>TechPay Atlas</h1>
      <p className="tagline">…unchanged…</p>
      <p className="thesis">Official data tells you the number. This tells you what the number leaves out.</p>
    </div>
    …the three masthead links, unchanged…
  </header>
  {!narrow && <SectionNav />}
  <FilterBar roles={meta.roles} state={state} onChange={update} />
  <TitleStrip soc={state.role} roleLabel={role.label} />

  <QuestionSection anchorId="sec-map" question="What does it pay — and where?" teaser={teasers.pay}
                   narrow={narrow} initialOpen={openId === 'sec-map'}>
    <h2 className="sec-q" id={narrow ? undefined : 'sec-map-q'}>What does it pay — and where?</h2>
    <div id="sec-map" className={state.metro ? 'hero-row has-panel' : 'hero-row'}>…SalaryMap + MetroPanel, unchanged…</div>
  </QuestionSection>

  <QuestionSection anchorId="h2h-h" question="Are you underpaid?"
                   teaser="Type your offer, see where it lands in any two metros"
                   narrow={narrow} initialOpen={openId === 'h2h-h'}>
    <HeadToHead …unchanged props… />
  </QuestionSection>

  <QuestionSection anchorId="slope-h" question="Is it real money there?" teaser={teasers.col}
                   narrow={narrow} initialOpen={openId === 'slope-h'}>
    <RankSlopegraph …unchanged props… />
  </QuestionSection>

  <QuestionSection anchorId="trend-h" question="Is it holding up?" teaser={teasers.trend}
                   narrow={narrow} initialOpen={openId === 'trend-h'}>
    <TrendsTeaser trends={trends} soc={state.role} roleLabel={role.label} />
  </QuestionSection>

  <QuestionSection anchorId="tl-h" question="What do these jobs actually get called?"
                   teaser="Real filed titles, seniority ladders, and who counts as what"
                   narrow={narrow} initialOpen={openId === 'tl-h'}>
    <TitleLens …unchanged props… />
  </QuestionSection>

  <QuestionSection anchorId="rsim-h" question="What else could you be?" teaser={teasers.similar}
                   narrow={narrow} initialOpen={openId === 'rsim-h'}>
    <RoleSimilarity …unchanged props… />
  </QuestionSection>

  <QuestionSection anchorId="hm-heading" question="Every metro × every role"
                   teaser="The whole grid, one screen"
                   narrow={narrow} initialOpen={openId === 'hm-heading'}>
    <RoleHeatmap …unchanged props… />
  </QuestionSection>

  <footer className="provenance">…unchanged…</footer>
</main>
```

Two invariants while moving code: **every existing component keeps exactly the props it has today** (this task moves JSX, it does not edit children), and the map block keeps `id="sec-map"` on the hero div (nav + card share that anchor; the new desktop `<h2 class="sec-q">` above it is presentational, `sec-map-q` id kept distinct so ids stay unique).

- [ ] **Step 2: CSS.** Base block (near the masthead styles):

```css
.thesis { margin: 2px 0 0; font-style: italic; color: var(--ink-2, #667); font-size: .92rem; }
.sec-q { font-size: 1.15rem; margin: 28px 0 10px; }
.title-strip { margin: 10px 0 0; }
.title-strip > button { font: inherit; background: none; border: 1px solid var(--line, #ccc); border-radius: 8px; padding: 8px 12px; cursor: pointer; width: 100%; text-align: left; }
.title-strip .ts-more { margin: 6px 0 0; padding: 0 12px; }
```

In the existing `@media (max-width: 720px)` block (globals.css:478):

```css
.secnav { display: none; }
.qcard { border: 1px solid var(--line, #ccc); border-radius: 10px; margin: 10px 0; }
.qcard-btn { display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left; font: inherit; background: none; border: 0; padding: 12px 14px; cursor: pointer; }
.qcard-q { font-weight: 650; }
.qcard-a { color: var(--ink-2, #667); font-size: .9rem; }
.qcard-tap { color: var(--accent, #1a6b5a); font-size: .85rem; }
```

⚠️ Use the file's **actual token names** — open `globals.css:1-60` first and swap the `var()` fallbacks above for the real custom properties (the site has its own token set; these names are illustrative, the values must come from the existing theme so both schemes work without new colors).

- [ ] **Step 3: Run everything**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: PASS

- [ ] **Step 4: Eyeball both viewports** (repo rule: verify CSS visually, both themes)

Run: `npm run dev` then check `http://localhost:3020` at desktop width and 390px (DevTools), light + dark. Confirm: new order, thesis line, title strip expands, nav labels scroll-track, cards collapse/expand, map unchanged when expanded.

- [ ] **Step 5: Commit**

```bash
git add site/app/page.tsx site/app/globals.css
git commit -m "feat(site): question-spine order, thesis line, mobile question index" -- site/app/page.tsx site/app/globals.css
```

---

### Task 9: Mobile e2e spec

**Files:**
- Create: `site/e2e/mobile-index.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

test('mobile: collapsed index, tap-to-expand, height budget', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'TechPay Atlas' })).toBeVisible()

  // Heavy sections are not mounted while collapsed.
  await expect(page.locator('.h2h')).toHaveCount(0)

  // The "fits ~2 screens" promise, pinned (spec: < 1800px collapsed at 390px).
  const height = await page.evaluate(() => document.querySelector('main.page')!.scrollHeight)
  expect(height).toBeLessThan(1800)

  // Tap expands the card and the real chart renders inside it.
  await page.getByRole('button', { name: /Are you underpaid\?/ }).click()
  await expect(page.locator('.h2h .pct-band').first()).toBeVisible()
})

test('mobile: hash deep-link auto-expands its section', async ({ page }) => {
  await page.goto('/#rsim-h')
  await expect(page.locator('.rsim')).toBeVisible()
})
```

- [ ] **Step 2: Run the full e2e suite** (new spec + the Task 6 heading updates together)

Run: `npm run e2e`
Expected: all specs PASS. If the height assertion fails, fix the CSS (tighten card padding), not the number — 1800 is the spec's promise.

- [ ] **Step 3: Commit**

```bash
git add site/e2e/mobile-index.spec.ts
git commit -m "test(site): mobile question-index e2e (collapse, expand, deep-link, height budget)" -- site/e2e/mobile-index.spec.ts
```

---

### Task 10: Gates, ledger, PR

- [ ] **Step 1: Full local gates**

Run (from `site/`): `npx vitest run && npx tsc --noEmit && npx eslint . && npm run e2e`
Run (repo root): `npm test` (pipeline suite — must be untouched/green)
Expected: all PASS

- [ ] **Step 2: Update `docs/BACKLOG.md`** — new entry at the top recording the restructure shipped (link spec + plan), and strike the two "Deferred, wanted" bullets under "Narrative reconciliation" (2026-08-07) with a pointer to the new entry. Also strike the ⚪ "missing `trends.json` fails the whole home page" clause in the 2026-08-09 review entry (fixed by Task 7).

- [ ] **Step 3: Push branch + PR** (never push main — merging deploys)

```bash
git push -u origin feat/home-restructure
```

Open a PR against `main` (GitHub MCP tools — `gh` is not on this box), wait for **all three** checks, then merge. After merge: verify the live site shows the new order and the mobile index (phone or 390px DevTools against the deployed URL).

---

## Self-review notes (already applied)

- Spec coverage: §2 TitleStrip (T4), §3–§9 order + headings (T6, T8), mobile index (T1, T3, T8, T9), teasers + data joins (T2), thesis line (T8), trends degrade (T7), nav labels + hidden on narrow (T6, T8), hash deep-link (T3, T8, T9), honesty constraints (teaser text states only what sections show — T2 strings), both themes (T8 step 4).
- The `sec-map` anchor stays on the hero div in both viewports; `QuestionSection` only carries an anchor id while collapsed, so ids never duplicate.
- Type consistency: `national: TrendsJson | null` flows page → MetroPanel → MetroTrend (T7); `teasers.ts` signatures match their call sites in T8.
