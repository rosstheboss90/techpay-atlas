# Mobile Poster Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the collapsed mobile question index with an uncollapsed, data-forward poster page whose map is a hero image plus a fullscreen explorer, leaving desktop untouched.

**Architecture:** `QuestionSection` stops collapsing and becomes a poster section (eyebrow → deck sentence → full-bleed chart). The map's projection/scaling logic is extracted to a pure `lib/map-bubbles.ts` shared by the inline hero (non-interactive) and a new `MapExplorer` overlay (filter + three zoom steps + native-scroll panning). The two honesty-critical pieces of logic — zoom scaling and hit-testing with ambiguity counting — live in pure functions in `lib/map-explore.ts` so they are unit-testable without layout.

**Tech Stack:** Next.js 16 static export (App Router), React, TypeScript, D3 (`d3-geo`, `d3-array`), Vitest + Testing Library + jsdom, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-23-mobile-poster-design.md`

## Global Constraints

- All commands run from `site/` unless stated. Node ≥ 22.
- Unit tests: `npm test`. E2E: `npm run e2e`. Both must pass before any commit that closes a task.
- `tsc` runs with `noUnusedLocals` / `noUnusedParameters`; `eslint` is CI-gated. A stray unused import fails the build.
- **Never push to `main`** — it auto-deploys with no gating tests. Work on a branch; open a PR; wait for all three checks.
- **Desktop (≥ 721px) rendering must not change.** Every change is inside `@media (max-width: 720px)` or behind the `narrow` prop.
- Narrow breakpoint is `720px` (`lib/use-narrow.ts` default query, `globals.css` media block).
- **No new colours.** Use `--accent`, `--ink`, `--ink-muted`, `--line`, `--land`, `--surface`, the `--soc-*` slots and `RAMP_LIGHT`/`RAMP_DARK` only. Adding a colour re-opens the palette validation pinned at `globals.css:15-18,43-48`.
- Style both themes via `prefers-color-scheme`; verify light and dark at 390px.
- Map constants are `W = 975`, `H = 610`, `geoAlbersUsa().scale(1300).translate([W/2, H/2])`. Do not change them — the emitted data and every existing bubble position depend on them.
- Copy is fixed by the spec. The seven section questions and their deck sentences come from `lib/teasers.ts` unchanged except where a task says otherwise.

---

### Task 1: Extract the map bubble builder

Pure refactor. `SalaryMap` and the new `MapExplorer` must project metros identically; today that logic is trapped in a `useMemo` inside the component.

**Files:**
- Create: `site/lib/map-bubbles.ts`
- Modify: `site/components/SalaryMap.tsx:1-16` (imports/constants), `:49-66` (the `useMemo`)
- Test: `site/tests/map-bubbles.test.ts`

**Interfaces:**
- Consumes: `metricValue` from `lib/derive`, `bubbleColor`/`bubbleRadius` from `lib/map-scales`.
- Produces:
  ```ts
  export const MAP_W = 975
  export const MAP_H = 610
  export interface Bubble { m: MetroMeta; x: number; y: number; v: number | null; emp: number | null; r: number; fill: string }
  export interface BubbleSet { bubbles: Bubble[]; domain: [number, number]; maxEmp: number }
  export function buildBubbles(meta: Meta, salaries: Salaries, soc: string, metric: Metric, adjusted: boolean, ramp: string[]): BubbleSet
  ```
  The `Bubble` shape deliberately keeps the whole `m: MetroMeta` rather than flattening to `cbsa`/`name`, so `SalaryMap`'s existing JSX (which reads `b.m.cbsa`, `b.m.name`) needs no edits beyond the `useMemo` body.

- [ ] **Step 1: Write the failing test**

```ts
// site/tests/map-bubbles.test.ts
import { describe, expect, it } from 'vitest'
import { buildBubbles, MAP_W, MAP_H } from '../lib/map-bubbles'
import { RAMP_LIGHT } from '../lib/map-scales'
import type { Meta, Salaries } from '../lib/types'

const metro = (cbsa: string, name: string, lat: number, lng: number, rpp: number | null = 100) =>
  ({ cbsa, name, state: 'CA', lat, lng, rpp, lcaFilings: 0 })

const meta = {
  year: 2025, generated: '', roles: [], topCodeValue: 239200, rppYear: 2024, lcaPeriod: '',
  sources: { oews: '', lca: [], hud: '', zipMatchRate: 1 },
  metros: [
    metro('41940', 'San Jose, CA', 37.33, -121.89),
    metro('42660', 'Seattle, WA', 47.6, -122.33),
    metro('99999', 'San Juan, PR', 18.46, -66.11),   // geoAlbersUsa cannot place PR
    metro('11111', 'Nodata, XX', 40, -100),
  ],
} as unknown as Meta

const salaries: Salaries = {
  '41940': { '15-1252': { emp: 100, lq: 1, p10: 1, p25: 2, p50: 213110, p75: 4, p90: 5 } },
  '42660': { '15-1252': { emp: 900, lq: 1, p10: 1, p25: 2, p50: 167000, p75: 4, p90: 5 } },
  '99999': { '15-1252': { emp: 10, lq: 1, p10: 1, p25: 2, p50: 90000, p75: 4, p90: 5 } },
  '11111': {},
}

describe('buildBubbles', () => {
  it('projects placeable metros inside the map box and omits unplaceable ones', () => {
    const { bubbles } = buildBubbles(meta, salaries, '15-1252', 'pay', false, RAMP_LIGHT)
    expect(bubbles.map(b => b.m.cbsa).sort()).toEqual(['11111', '41940', '42660'])
    for (const b of bubbles) {
      expect(b.x).toBeGreaterThanOrEqual(0)
      expect(b.x).toBeLessThanOrEqual(MAP_W)
      expect(b.y).toBeGreaterThanOrEqual(0)
      expect(b.y).toBeLessThanOrEqual(MAP_H)
    }
  })

  it('keeps a metro with no salary row, with a null value', () => {
    const { bubbles } = buildBubbles(meta, salaries, '15-1252', 'pay', false, RAMP_LIGHT)
    expect(bubbles.find(b => b.m.cbsa === '11111')!.v).toBeNull()
  })

  it('sorts large bubbles first so small metros stay hoverable on top', () => {
    const { bubbles } = buildBubbles(meta, salaries, '15-1252', 'pay', false, RAMP_LIGHT)
    const radii = bubbles.map(b => b.r)
    expect(radii).toEqual([...radii].sort((a, b) => b - a))
  })

  it('domain spans the metric extent of placed metros', () => {
    const { domain } = buildBubbles(meta, salaries, '15-1252', 'pay', false, RAMP_LIGHT)
    expect(domain).toEqual([167000, 213110])
  })

  it('adjusted mode divides by RPP', () => {
    const withRpp = { ...meta, metros: [metro('41940', 'San Jose, CA', 37.33, -121.89, 125)] } as Meta
    const { bubbles } = buildBubbles(withRpp, salaries, '15-1252', 'pay', true, RAMP_LIGHT)
    expect(bubbles[0].v).toBeCloseTo(213110 / 1.25, 0)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- map-bubbles`
Expected: FAIL — `Failed to resolve import "../lib/map-bubbles"`.

- [ ] **Step 3: Create the module**

```ts
// site/lib/map-bubbles.ts
import { geoAlbersUsa, geoPath } from 'd3-geo'
import { extent } from 'd3-array'
import { feature } from 'topojson-client'
import statesTopo from 'us-atlas/states-10m.json'
import type { Meta, Metric, MetroMeta, Salaries } from './types'
import { metricValue } from './derive'
import { bubbleColor, bubbleRadius } from './map-scales'

export const MAP_W = 975
export const MAP_H = 610

export const projection = geoAlbersUsa().scale(1300).translate([MAP_W / 2, MAP_H / 2])

// topojson-client's types are loose over raw JSON; the cast is confined to this line.
const states = feature(statesTopo as never, (statesTopo as unknown as { objects: { states: never } }).objects.states)

/** The US outline path, projected once at module load — identical for every consumer. */
export const statesPath = geoPath(projection)(states as never) ?? ''

export interface Bubble {
  m: MetroMeta
  x: number
  y: number
  v: number | null
  emp: number | null
  r: number
  fill: string
}

export interface BubbleSet {
  bubbles: Bubble[]
  domain: [number, number]
  maxEmp: number
}

/** Project every metro the Albers USA projection can place, size it by employment and colour it
 *  by the active metric. Pure: the same inputs always give the same bubble set, which is what
 *  lets the inline hero and the fullscreen explorer agree by construction. */
export function buildBubbles(
  meta: Meta, salaries: Salaries, soc: string, metric: Metric, adjusted: boolean, ramp: string[],
): BubbleSet {
  const placed = meta.metros
    .map(m => {
      const xy = projection([m.lng, m.lat])
      if (!xy) return null   // geoAlbersUsa cannot place PR — omitted by design
      const row = salaries[m.cbsa]?.[soc]
      return { m, x: xy[0], y: xy[1], v: metricValue(row, m, metric, adjusted), emp: row?.emp ?? null }
    })
    .filter((b): b is NonNullable<typeof b> => b !== null)

  const maxEmp = Math.max(1, ...placed.map(b => b.emp ?? 0))
  const [lo, hi] = extent(placed.map(b => b.v).filter((v): v is number => v != null))
  const domain: [number, number] = lo == null || hi == null ? [0, 1] : [lo, hi]

  // Large bubbles render first so small metros stay hoverable on top.
  const bubbles = placed
    .map(b => ({ ...b, r: bubbleRadius(b.emp, maxEmp), fill: bubbleColor(b.v, domain, ramp) }))
    .sort((a, b) => b.r - a.r)

  return { bubbles, domain, maxEmp }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test -- map-bubbles`
Expected: PASS, 5 tests.

- [ ] **Step 5: Point `SalaryMap` at the shared builder**

In `site/components/SalaryMap.tsx`, delete the local `W`/`H`/`projection`/`states`/`statesD` constants and the `geoAlbersUsa`/`geoPath`/`feature`/`statesTopo`/`extent`/`bubbleColor`/`bubbleRadius`/`metricValue` imports they used, then:

```tsx
import { buildBubbles, MAP_H, MAP_W, statesPath } from '../lib/map-bubbles'
import { RAMP_DARK, RAMP_LIGHT } from '../lib/map-scales'
```

Replace the `useMemo` at `:49-66` with:

```tsx
  const { bubbles, domain, maxEmp } = useMemo(
    () => buildBubbles(meta, salaries, soc, metric, adjusted, ramp),
    [meta, salaries, soc, metric, adjusted, ramp],
  )
```

Then update the two remaining references: `viewBox={\`0 0 ${MAP_W} ${MAP_H}\`}` and `<path d={statesPath} className="map-states" />`.

- [ ] **Step 6: Prove the refactor is output-neutral**

Run: `npm test && npx tsc --noEmit --incremental false && npm run e2e -- happy-path`
Expected: all PASS. The existing map e2e asserts real bubble behaviour; if it still passes, the projection is unchanged.

- [ ] **Step 7: Commit**

```bash
git add site/lib/map-bubbles.ts site/tests/map-bubbles.test.ts site/components/SalaryMap.tsx
git commit -m "refactor(site): extract buildBubbles + statesPath to lib/map-bubbles" -- site/lib/map-bubbles.ts site/tests/map-bubbles.test.ts site/components/SalaryMap.tsx
```

---

### Task 2: `payTeaser` honours the cost-of-living toggle

Open follow-up in `docs/BACKLOG.md`: with COL on, the teaser names a metro the recoloured map doesn't agree with. Today that's a 1.12rem sentence; in the poster it becomes the 44px hero number, so it must be fixed before the hero lands.

**Files:**
- Modify: `site/lib/teasers.ts:36-58`, `site/app/page.tsx:120`
- Test: `site/tests/teasers.test.ts`

**Interfaces:**
- Produces: `payTeaser(salaries: Salaries, metros: MetroMeta[], soc: string, adjusted: boolean): Teaser & { top3: { city: string; p50: number }[] }` — one new trailing parameter. `top3[].p50` carries the **displayed** (adjusted where applicable) value, matching the map.

- [ ] **Step 1: Write the failing test**

Append to `site/tests/teasers.test.ts`:

```ts
describe('payTeaser cost-of-living agreement', () => {
  const metros = [
    { cbsa: 'A', name: 'Expensive City, CA', state: 'CA', lat: 0, lng: 0, rpp: 130, lcaFilings: 0 },
    { cbsa: 'B', name: 'Cheap City, TX', state: 'TX', lat: 0, lng: 0, rpp: 90, lcaFilings: 0 },
  ]
  const salaries = {
    A: { S: { emp: 1, lq: 1, p10: 1, p25: 1, p50: 200000, p75: 1, p90: 1 } },
    B: { S: { emp: 1, lq: 1, p10: 1, p25: 1, p50: 160000, p75: 1, p90: 1 } },
  } as never

  it('nominal mode names the highest raw payer', () => {
    expect(payTeaser(salaries, metros as never, 'S', false).fact)
      .toBe('Expensive City tops the map at $200,000.')
  })

  it('adjusted mode names the highest COL-adjusted payer — the one the map recolours as top', () => {
    // A: 200000/1.30 = 153,846 · B: 160000/0.90 = 177,778 → B wins once RPP counts.
    const t = payTeaser(salaries, metros as never, 'S', true)
    expect(t.fact).toBe('Cheap City tops the map at $177,778.')
    expect(t.top3[0].city).toBe('Cheap City')
  })

  it('falls back when no metro has a median for the role', () => {
    expect(payTeaser({} as never, metros as never, 'S', true))
      .toMatchObject({ fact: 'Percentiles for every metro on the map.', top3: [] })
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- teasers`
Expected: FAIL — adjusted case still returns `Expensive City`, and TypeScript reports a 4th argument on a 3-parameter function.

- [ ] **Step 3: Implement**

Replace `payTeaser` in `site/lib/teasers.ts`:

```ts
export function payTeaser(
  salaries: Salaries, metros: MetroMeta[], soc: string, adjusted: boolean,
): Teaser & { top3: { city: string; p50: number }[] } {
  // The quoted number must be one the expanded section shows: the map/panel display each metro's
  // own p50, never a national median — so the teaser quotes the top metro's own median. It must
  // also agree with the MAP's current colouring, so in adjusted mode both the ranking and the
  // printed figure use the RPP-adjusted value (metricValue is the same helper the map uses).
  const withP50: { name: string; v: number }[] = []
  for (const m of metros) {
    const v = metricValue(salaries[m.cbsa]?.[soc], m, 'pay', adjusted)
    if (v != null) withP50.push({ name: m.name, v })
  }
  if (withP50.length === 0) {
    return { fact: 'Percentiles for every metro on the map.', context: '', top3: [] }
  }
  const sorted = [...withP50].sort((a, b) => b.v - a.v)
  const top = sorted[0]
  const top3 = sorted.slice(0, 3).map(m => ({ city: shortMetro(m.name), p50: Math.round(m.v) }))
  return {
    fact: `${shortMetro(top.name)} tops the map at ${fmtUsd(Math.round(top.v))}.`,
    context: '',
    top3,
  }
}
```

Add `import { metricValue } from './derive'` to the top of `lib/teasers.ts`.

Update the call site in `site/app/page.tsx:120`:

```tsx
    pay: payTeaser(salaries, meta.metros, state.role, state.adjusted),
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test -- teasers && npx tsc --noEmit --incremental false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add site/lib/teasers.ts site/tests/teasers.test.ts site/app/page.tsx
git commit -m "fix(site): payTeaser follows the cost-of-living toggle so the hero cannot contradict the map" -- site/lib/teasers.ts site/tests/teasers.test.ts site/app/page.tsx
```

---

### Task 3: `QuestionSection` becomes a poster section

The collapse is removed. This is the change every later task depends on.

**Files:**
- Modify: `site/components/QuestionSection.tsx` (whole file), `site/app/page.tsx:169-219` (drop `initialOpen`/`viz` props), `site/tests/page.test.tsx:114-135,176` (class rename)
- Test: `site/tests/question-section.test.tsx` (rewrite)

**Interfaces:**
- Produces:
  ```tsx
  export function QuestionSection(props: {
    anchorId: string; question: string; fact: string; narrow: boolean; children: ReactNode
  }): JSX.Element
  ```
  `context`, `viz` and `initialOpen` are **removed**. Narrow markup is `section.qsec#<anchorId>` → `h2.qsec-q` → `p.qsec-deck` → `div.qsec-body`. Desktop remains a bare `<>{children}</>`.

- [ ] **Step 1: Rewrite the test file**

```tsx
// site/tests/question-section.test.tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QuestionSection } from '../components/QuestionSection'

const child = <div data-testid="heavy">chart</div>

describe('QuestionSection', () => {
  it('desktop: renders children untouched, no section chrome', () => {
    const { container } = render(
      <QuestionSection anchorId="h2h-h" question="Are you underpaid?" fact="f" narrow={false}>{child}</QuestionSection>,
    )
    expect(screen.getByTestId('heavy')).toBeInTheDocument()
    expect(container.querySelector('.qsec')).toBeNull()
  })

  it('narrow: children are ALWAYS mounted — there is no collapse', () => {
    render(<QuestionSection anchorId="h2h-h" question="Are you underpaid?" fact="f" narrow>{child}</QuestionSection>)
    expect(screen.getByTestId('heavy')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('narrow: poster anatomy is eyebrow question then deck sentence', () => {
    const { container } = render(
      <QuestionSection anchorId="trend-h" question="Are wages beating inflation?"
                       fact="Software Developers are down 5.7% in real terms since 2021." narrow>
        {child}
      </QuestionSection>,
    )
    expect(container.querySelector('.qsec-q')!.textContent).toBe('Are wages beating inflation?')
    expect(container.querySelector('.qsec-deck')!.textContent)
      .toBe('Software Developers are down 5.7% in real terms since 2021.')
  })

  it('narrow: the section carries the anchor id exactly once, always', () => {
    const { container } = render(
      <QuestionSection anchorId="tl-h" question="q" fact="f" narrow>
        <h2 data-testid="heading">section</h2>
      </QuestionSection>,
    )
    expect(container.querySelectorAll('#tl-h')).toHaveLength(1)
    expect(container.querySelector('#tl-h')!.classList.contains('qsec')).toBe(true)
  })

  it('narrow: body wrapper carries qsec-body so wide charts can be scoped-scrolled', () => {
    const { container } = render(
      <QuestionSection anchorId="trend-h" question="q" fact="f" narrow>{child}</QuestionSection>,
    )
    expect(container.querySelector('.qsec-body')).not.toBeNull()
  })

  it('narrow: the eyebrow is a real heading so the section is navigable', () => {
    render(<QuestionSection anchorId="h2h-h" question="Are you underpaid?" fact="f" narrow>{child}</QuestionSection>)
    expect(screen.getByRole('heading', { name: 'Are you underpaid?' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npm test -- question-section`
Expected: FAIL — `.qsec` is null, and a button is still rendered.

- [ ] **Step 3: Rewrite the component**

```tsx
// site/components/QuestionSection.tsx
'use client'
import { type ReactNode } from 'react'

interface Props {
  /** DOM id for this section — nav anchors and hash links resolve to it. The section always
   *  owns it (there is no collapsed/expanded alternation any more). */
  anchorId: string
  /** Eyebrow text: the reader question this section answers. */
  question: string
  /** The computed answer sentence, shown as the section's deck. */
  fact: string
  narrow: boolean
  children: ReactNode
}

/** Narrow viewports render each section as a poster: eyebrow question, deck sentence, then the
 *  real chart full-bleed. Nothing collapses — the charts ARE the visual language of the page
 *  (2026-08-23 spec). Desktop renders children untouched. */
export function QuestionSection({ anchorId, question, fact, narrow, children }: Props) {
  if (!narrow) return <>{children}</>
  return (
    <section className="qsec" id={anchorId}>
      <h2 className="qsec-q">{question}</h2>
      <p className="qsec-deck">{fact}</p>
      <div className="qsec-body">{children}</div>
    </section>
  )
}
```

- [ ] **Step 4: Update every call site in `app/page.tsx`**

For all seven `<QuestionSection>` elements, remove the `context`, `viz` and `initialOpen` props. Also delete the now-unused pieces above the return: the `hash`/`cardIds`/`openId` block (`page.tsx:115-117`), the `payViz`/`bandViz`/`sparkViz`/`similarViz` consts (`:130-148`), and the `rowA`/`rppA` consts if nothing else uses them. Remove the corresponding `MiniSpark`, `PercentileBand`, `sharedBandDomain` and `fmtUsdCompact` imports **only if** they become unused — `tsc --noEmit` with `noUnusedLocals` will tell you exactly which.

Example of the resulting shape:

```tsx
      <QuestionSection anchorId="h2h-h" question="Are you underpaid?"
                       fact={`Type your offer to see where it lands, in any two of ${meta.metros.length} metros.`}
                       narrow={narrow}>
        <HeadToHead meta={meta} salaries={salaries} soc={state.role} adjusted={state.adjusted}
                    metroA={metroA} metroB={metroB} onSelect={p => update(p)} />
      </QuestionSection>
```

Also delete the narrow guard in the desktop hash-scroll effect at `page.tsx:82` — narrow and desktop now share one behaviour:

```tsx
    if (!hash) return
    document.getElementById(hash)?.scrollIntoView?.()
```

- [ ] **Step 5: Update the order pin in `tests/page.test.tsx`**

Change the two `.qcard-q` selectors (`:133-134` and `:176`) to `.qsec-q`. **Keep the assertion** — it exists because a prop-slot shift once silently dropped "Are you underpaid?" from its card and survived two reviews. The seven expected strings are unchanged.

- [ ] **Step 6: Run the full unit suite**

Run: `npm test && npx tsc --noEmit --incremental false`
Expected: unit tests PASS. `e2e/mobile-index.spec.ts` will now fail — that is expected and is fixed in Task 12.

- [ ] **Step 7: Commit**

```bash
git add site/components/QuestionSection.tsx site/tests/question-section.test.tsx site/app/page.tsx site/tests/page.test.tsx
git commit -m "feat(site): sections render uncollapsed on narrow — poster anatomy replaces the card" -- site/components/QuestionSection.tsx site/tests/question-section.test.tsx site/app/page.tsx site/tests/page.test.tsx
```

---

### Task 4: Compress the masthead, demote provenance to the footer

Recovers ~120px from the worst-performing pixels on the page. Narrow only.

**Files:**
- Modify: `site/app/page.tsx:152-165` (masthead), `:220-222` (footer)
- Test: `site/tests/page.test.tsx`

**Interfaces:**
- Consumes: `narrow` from `useNarrow()`, already in scope in `page.tsx`.
- Produces: no new exports. Narrow markup keeps `h1` + `.value` in `.masthead`; `.thesis`, `.tagline-small` and the three `.masthead-link`s move inside `<footer className="provenance">`.

- [ ] **Step 1: Write the failing test**

Append to `site/tests/page.test.tsx`, inside the existing narrow-mode describe block (it already sets up `matchMedia` for 720px — reuse that helper rather than writing a new one):

```tsx
    it('narrow: masthead keeps only the h1 and value line; thesis and links move to the footer', async () => {
      renderPage()
      await waitFor(() => expect(document.querySelectorAll('.qsec-q').length).toBe(7))
      const masthead = document.querySelector('.masthead')!
      expect(masthead.querySelector('h1')).not.toBeNull()
      expect(masthead.querySelector('.value')).not.toBeNull()
      expect(masthead.querySelector('.thesis')).toBeNull()
      expect(masthead.querySelector('.masthead-link')).toBeNull()

      const footer = document.querySelector('footer.provenance')!
      expect(footer.querySelector('.thesis')).not.toBeNull()
      expect(footer.querySelectorAll('.masthead-link')).toHaveLength(3)
    })
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npm test -- page`
Expected: FAIL — `.thesis` is still inside `.masthead`.

- [ ] **Step 3: Implement**

In `site/app/page.tsx`, replace the masthead and footer:

```tsx
      <header className="masthead">
        <div>
          <h1>TechPay Atlas</h1>
          <p className="value">Check what your job really pays — by city, by real job title, adjusted for what living there costs.</p>
          {!narrow && (
            <>
              <p className="thesis">Official data tells you the number. This tells you what the number leaves out.</p>
              <p className="tagline tagline-small">
                {role.label} · {meta.metros.length} metros · BLS OEWS {meta.year}
                {state.adjusted ? `, adjusted for cost of living (BEA RPP ${meta.rppYear})` : ''}
              </p>
            </>
          )}
        </div>
        {!narrow && (
          <>
            <Link href="/about" className="masthead-link">About the data →</Link>
            <Link href="/trends" className="masthead-link">Pay over time →</Link>
            <Link href="/employers" className="masthead-link">Employers →</Link>
          </>
        )}
      </header>
```

```tsx
      <footer className="provenance">
        {narrow && (
          <>
            <p className="thesis">Official data tells you the number. This tells you what the number leaves out.</p>
            <p className="tagline tagline-small">
              {role.label} · {meta.metros.length} metros · BLS OEWS {meta.year}
              {state.adjusted ? `, adjusted for cost of living (BEA RPP ${meta.rppYear})` : ''}
            </p>
            <nav className="prov-links">
              <Link href="/about" className="masthead-link">About the data →</Link>
              <Link href="/trends" className="masthead-link">Pay over time →</Link>
              <Link href="/employers" className="masthead-link">Employers →</Link>
            </nav>
          </>
        )}
        Sources: BLS OEWS {meta.year} · BEA RPP {meta.rppYear} · DOL H-1B LCA {meta.lcaPeriod} · generated {meta.generated.slice(0, 10)}
      </footer>
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npm test -- page && npx tsc --noEmit --incremental false`
Expected: PASS. The existing desktop page tests must still pass unchanged.

- [ ] **Step 5: Commit**

```bash
git add site/app/page.tsx site/tests/page.test.tsx
git commit -m "feat(site): narrow masthead keeps h1 + value line, provenance moves to the footer" -- site/app/page.tsx site/tests/page.test.tsx
```

---

### Task 5: Pure zoom + hit-test logic

The honesty-critical logic. Kept pure so it is unit-testable without layout — jsdom reports `clientHeight` as 0, so component tests can never verify this.

**Files:**
- Create: `site/lib/map-explore.ts`
- Test: `site/tests/map-explore.test.ts`

**Interfaces:**
- Consumes: `Bubble`, `MAP_W`, `MAP_H` from `lib/map-bubbles`.
- Produces:
  ```ts
  export type Zoom = 'poster' | 'fit' | '2x'
  export const PATCH_PX = 22            // half of the 44px platform tap-target guidance
  export function zoomScale(zoom: Zoom, wrapW: number, wrapH: number): number
  export interface Pick { hit: Bubble | null; rivals: number }
  export function pickAt(bubbles: Bubble[], vx: number, vy: number, scale: number): Pick
  ```
  `pickAt` takes **viewBox** coordinates and the current scale; it returns the nearest bubble only if it is within `PATCH_PX` rendered pixels, plus how many *other* bubbles share that patch.

- [ ] **Step 1: Write the failing test**

```ts
// site/tests/map-explore.test.ts
import { describe, expect, it } from 'vitest'
import { MAP_H, MAP_W, type Bubble } from '../lib/map-bubbles'
import { pickAt, zoomScale, PATCH_PX } from '../lib/map-explore'

const bub = (cbsa: string, x: number, y: number): Bubble => ({
  m: { cbsa, name: `${cbsa} City, CA`, state: 'CA', lat: 0, lng: 0, rpp: 100, lcaFilings: 0 },
  x, y, v: 1, emp: 1, r: 2.5, fill: '#000',
})

describe('zoomScale', () => {
  it('poster fits the map to the container width', () => {
    expect(zoomScale('poster', 390, 610)).toBeCloseTo(390 / MAP_W)
  })
  it('fit fits the map to the container height', () => {
    expect(zoomScale('fit', 390, 610)).toBeCloseTo(610 / MAP_H)
  })
  it('2x doubles the fit-height scale', () => {
    expect(zoomScale('2x', 390, 610)).toBeCloseTo((610 / MAP_H) * 2)
  })
  it('never returns a non-finite or negative scale when the container is unmeasured', () => {
    for (const z of ['poster', 'fit', '2x'] as const) {
      const s = zoomScale(z, 0, 0)
      expect(Number.isFinite(s)).toBe(true)
      expect(s).toBeGreaterThan(0)
    }
  })
})

describe('pickAt', () => {
  const scale = 1   // 1 rendered px per viewBox unit keeps the arithmetic readable

  it('selects the metro under the tap', () => {
    const { hit, rivals } = pickAt([bub('A', 100, 100)], 102, 100, scale)
    expect(hit!.m.cbsa).toBe('A')
    expect(rivals).toBe(0)
  })

  it('selects NOTHING beyond the patch rather than guessing the nearest', () => {
    const { hit } = pickAt([bub('A', 100, 100)], 100 + PATCH_PX + 1, 100, scale)
    expect(hit).toBeNull()
  })

  it('reports rivals sharing the thumb patch — ambiguity is never hidden', () => {
    const bubbles = [bub('A', 100, 100), bub('B', 105, 100), bub('C', 110, 100), bub('D', 400, 400)]
    const { hit, rivals } = pickAt(bubbles, 100, 100, scale)
    expect(hit!.m.cbsa).toBe('A')
    expect(rivals).toBe(2)
  })

  it('zooming in separates rivals that shared a patch when zoomed out', () => {
    const bubbles = [bub('A', 100, 100), bub('B', 115, 100)]
    expect(pickAt(bubbles, 100, 100, 1).rivals).toBe(1)
    expect(pickAt(bubbles, 100, 100, 4).rivals).toBe(0)
  })

  it('picks the closest when several are in range', () => {
    const bubbles = [bub('A', 100, 100), bub('B', 108, 100)]
    expect(pickAt(bubbles, 107, 100, scale).hit!.m.cbsa).toBe('B')
  })

  it('returns no hit for an empty bubble set', () => {
    expect(pickAt([], 10, 10, scale)).toEqual({ hit: null, rivals: 0 })
  })
})
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npm test -- map-explore`
Expected: FAIL — `Failed to resolve import "../lib/map-explore"`.

- [ ] **Step 3: Implement**

```ts
// site/lib/map-explore.ts
import { MAP_H, MAP_W, type Bubble } from './map-bubbles'

export type Zoom = 'poster' | 'fit' | '2x'

/** Half of the 44px platform tap-target guidance — the radius of one thumb contact patch. */
export const PATCH_PX = 22

/** Rendered pixels per viewBox unit for each zoom step.
 *  `poster` fits the width (the inline hero framing, whole country visible); `fit` fits the
 *  height, which is where the accuracy comes from — the map is 1.6:1 and a phone is ~1:2.2, so
 *  a width-fitted map wastes most of the screen. Measured: fit-height alone moves aimed-tap
 *  accuracy from 26% to 66%, and 2x reaches 90%. A 4x step was measured as adding nothing.
 *  Falls back to a positive scale when the container has not been measured yet (jsdom, first
 *  paint) so callers never divide by zero. */
export function zoomScale(zoom: Zoom, wrapW: number, wrapH: number): number {
  if (zoom === 'poster') return wrapW > 0 ? wrapW / MAP_W : 1
  const fit = wrapH > 0 ? wrapH / MAP_H : 1
  return zoom === '2x' ? fit * 2 : fit
}

export interface Pick {
  hit: Bubble | null
  /** Other metros inside the same thumb patch. Non-zero means the selection was ambiguous. */
  rivals: number
}

/** Nearest metro to a tap, in viewBox coordinates, but ONLY within one thumb patch.
 *
 *  Deliberately returns `null` rather than the nearest bubble when nothing is in range: measured
 *  against all 387 real metros with a realistic 8px touch error, a nearest-bubble rule selects
 *  the intended city just 26% of the time, so "always pick something" means confidently showing
 *  the wrong city three times in four. A miss the user can see is better than a wrong answer they
 *  cannot. `rivals` exists for the same reason — the caller must SAY when a pick was ambiguous. */
export function pickAt(bubbles: Bubble[], vx: number, vy: number, scale: number): Pick {
  let hit: Bubble | null = null
  let best = Infinity
  let rivals = 0
  for (const b of bubbles) {
    const d = Math.hypot(b.x - vx, b.y - vy) * scale
    if (d <= PATCH_PX) rivals++
    if (d < best) { best = d; hit = b }
  }
  if (best > PATCH_PX) return { hit: null, rivals: 0 }
  return { hit, rivals: Math.max(0, rivals - 1) }
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npm test -- map-explore`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add site/lib/map-explore.ts site/tests/map-explore.test.ts
git commit -m "feat(site): pure zoom-scale and patch-limited hit-test with ambiguity counting" -- site/lib/map-explore.ts site/tests/map-explore.test.ts
```

---

### Task 6: `MetroFilter` — selecting a city by name

The 100%-accurate selection path, shared by the hero and the explorer.

**Files:**
- Create: `site/components/MetroFilter.tsx`
- Test: `site/tests/metro-filter.test.tsx`

**Interfaces:**
- Produces:
  ```tsx
  export function MetroFilter(props: {
    metros: MetroMeta[]
    onSelect: (cbsa: string) => void
    label?: string        // default 'Find a city'
    limit?: number        // default 8
  }): JSX.Element
  ```
  Renders `input.mf-input[type=search]` plus `ul.mf-results` of `button.mf-result`. Empty query renders no list. No matches renders `p.mf-empty`.

- [ ] **Step 1: Write the failing test**

```tsx
// site/tests/metro-filter.test.tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MetroFilter } from '../components/MetroFilter'

const metros = [
  { cbsa: '41940', name: 'San Jose-Sunnyvale-Santa Clara, CA', state: 'CA', lat: 0, lng: 0, rpp: 130, lcaFilings: 0 },
  { cbsa: '41860', name: 'San Francisco-Oakland-Berkeley, CA', state: 'CA', lat: 0, lng: 0, rpp: 128, lcaFilings: 0 },
  { cbsa: '12420', name: 'Austin-Round Rock-Georgetown, TX', state: 'TX', lat: 0, lng: 0, rpp: 99, lcaFilings: 0 },
]

describe('MetroFilter', () => {
  it('shows no results before anything is typed', () => {
    render(<MetroFilter metros={metros} onSelect={() => {}} />)
    expect(document.querySelector('.mf-results')).toBeNull()
  })

  it('matches on any part of the metro name, case-insensitively', async () => {
    render(<MetroFilter metros={metros} onSelect={() => {}} />)
    await userEvent.type(screen.getByRole('searchbox'), 'oakland')
    const results = document.querySelectorAll('.mf-result')
    expect(results).toHaveLength(1)
    expect(results[0].textContent).toContain('San Francisco')
  })

  it('reports no matches rather than rendering an empty list', async () => {
    render(<MetroFilter metros={metros} onSelect={() => {}} />)
    await userEvent.type(screen.getByRole('searchbox'), 'zzzz')
    expect(document.querySelector('.mf-empty')!.textContent).toContain('zzzz')
    expect(document.querySelector('.mf-result')).toBeNull()
  })

  it('selecting a result reports its cbsa', async () => {
    const onSelect = vi.fn()
    render(<MetroFilter metros={metros} onSelect={onSelect} />)
    await userEvent.type(screen.getByRole('searchbox'), 'austin')
    await userEvent.click(screen.getByRole('button', { name: /Austin/ }))
    expect(onSelect).toHaveBeenCalledWith('12420')
  })

  it('caps the list at `limit`', async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      cbsa: String(i), name: `San Test ${i}, CA`, state: 'CA', lat: 0, lng: 0, rpp: 100, lcaFilings: 0,
    }))
    render(<MetroFilter metros={many} onSelect={() => {}} limit={3} />)
    await userEvent.type(screen.getByRole('searchbox'), 'san test')
    expect(document.querySelectorAll('.mf-result')).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npm test -- metro-filter`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// site/components/MetroFilter.tsx
'use client'
import { useMemo, useState } from 'react'
import type { MetroMeta } from '../lib/types'

interface Props {
  metros: MetroMeta[]
  onSelect: (cbsa: string) => void
  label?: string
  limit?: number
}

/** Pick a metro by name. This is the reliable selection path on a phone: the map cannot be one
 *  (measured — 387 metros at 390px put 0 bubbles above a 22px tap target, and 99% of them share
 *  a thumb patch with a neighbour), so precision-free selection lives here. */
export function MetroFilter({ metros, onSelect, label = 'Find a city', limit = 8 }: Props) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  const matches = useMemo(
    () => (q ? metros.filter(m => m.name.toLowerCase().includes(q)).slice(0, limit) : []),
    [metros, q, limit],
  )

  return (
    <div className="mf">
      <input type="search" className="mf-input" value={query} aria-label={label} placeholder={label}
             onChange={e => setQuery(e.target.value)} />
      {q !== '' && matches.length === 0 && (
        <p className="mf-empty">No metros match “{query.trim()}”.</p>
      )}
      {matches.length > 0 && (
        <ul className="mf-results">
          {matches.map(m => (
            <li key={m.cbsa}>
              <button type="button" className="mf-result" onClick={() => onSelect(m.cbsa)}>
                {m.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npm test -- metro-filter && npx tsc --noEmit --incremental false`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add site/components/MetroFilter.tsx site/tests/metro-filter.test.tsx
git commit -m "feat(site): MetroFilter — select a metro by name" -- site/components/MetroFilter.tsx site/tests/metro-filter.test.tsx
```

---

### Task 7: `MapExplorer` — the fullscreen map

**Files:**
- Create: `site/components/MapExplorer.tsx`
- Test: `site/tests/map-explorer.test.tsx`

**Interfaces:**
- Consumes: `buildBubbles`, `statesPath`, `MAP_W`, `MAP_H` (Task 1); `zoomScale`, `pickAt`, `PATCH_PX`, `Zoom` (Task 5); `MetroFilter` (Task 6).
- Produces:
  ```tsx
  export function MapExplorer(props: {
    meta: Meta; salaries: Salaries; soc: string; metric: Metric
    adjusted: boolean; dark: boolean
    onSelect: (cbsa: string) => void
    onClose: () => void
  }): JSX.Element
  ```
  Root is `div.mx[role=dialog][aria-modal=true]` carrying `data-zoom`. Zoom buttons are `button.mx-zoom[data-z]`. The readout is `p.mx-read`; when a pick is ambiguous it also renders `span.mx-ambig`.

- [ ] **Step 1: Write the failing test**

```tsx
// site/tests/map-explorer.test.tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MapExplorer } from '../components/MapExplorer'
import type { Meta, Salaries } from '../lib/types'

const meta = {
  year: 2025, generated: '', roles: [], topCodeValue: 0, rppYear: 2024, lcaPeriod: '',
  sources: { oews: '', lca: [], hud: '', zipMatchRate: 1 },
  metros: [
    { cbsa: '41940', name: 'San Jose-Sunnyvale-Santa Clara, CA', state: 'CA', lat: 37.33, lng: -121.89, rpp: 130, lcaFilings: 0 },
    { cbsa: '12420', name: 'Austin-Round Rock-Georgetown, TX', state: 'TX', lat: 30.27, lng: -97.74, rpp: 99, lcaFilings: 0 },
  ],
} as unknown as Meta

const salaries: Salaries = {
  '41940': { S: { emp: 100, lq: 1, p10: 1, p25: 1, p50: 213110, p75: 1, p90: 1 } },
  '12420': { S: { emp: 50, lq: 1, p10: 1, p25: 1, p50: 128000, p75: 1, p90: 1 } },
}

const setup = (over: Partial<Parameters<typeof MapExplorer>[0]> = {}) =>
  render(<MapExplorer meta={meta} salaries={salaries} soc="S" metric="pay" adjusted={false}
                      dark={false} onSelect={vi.fn()} onClose={vi.fn()} {...over} />)

describe('MapExplorer', () => {
  it('is a modal dialog that opens on the fit-height zoom step', () => {
    setup()
    const dlg = screen.getByRole('dialog')
    expect(dlg).toHaveAttribute('aria-modal', 'true')
    expect(dlg).toHaveAttribute('data-zoom', 'fit')
  })

  it('zoom buttons change the active step', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /2×/ }))
    expect(screen.getByRole('dialog')).toHaveAttribute('data-zoom', '2x')
    await userEvent.click(screen.getByRole('button', { name: /Poster/ }))
    expect(screen.getByRole('dialog')).toHaveAttribute('data-zoom', 'poster')
  })

  it('renders one circle per placeable metro', () => {
    const { container } = setup()
    expect(container.querySelectorAll('.mx-bubble')).toHaveLength(2)
  })

  it('filtering by name selects that metro and closes', async () => {
    const onSelect = vi.fn(); const onClose = vi.fn()
    setup({ onSelect, onClose })
    await userEvent.type(screen.getByRole('searchbox'), 'austin')
    await userEvent.click(screen.getByRole('button', { name: /Austin/ }))
    expect(onSelect).toHaveBeenCalledWith('12420')
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on the close button and on Escape', async () => {
    const onClose = vi.fn()
    setup({ onClose })
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('starts with an instruction, not a fabricated selection', () => {
    setup()
    expect(document.querySelector('.mx-read')!.textContent).toMatch(/tap a metro/i)
    expect(document.querySelector('.mx-ambig')).toBeNull()
  })
})
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npm test -- map-explorer`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// site/components/MapExplorer.tsx
'use client'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Meta, Metric, Salaries } from '../lib/types'
import { buildBubbles, MAP_H, MAP_W, statesPath } from '../lib/map-bubbles'
import { RAMP_DARK, RAMP_LIGHT } from '../lib/map-scales'
import { pickAt, zoomScale, type Zoom } from '../lib/map-explore'
import { fmtUsdCompact } from '../lib/format'
import { MetroFilter } from './MetroFilter'

interface Props {
  meta: Meta
  salaries: Salaries
  soc: string
  metric: Metric
  adjusted: boolean
  dark: boolean
  onSelect: (cbsa: string) => void
  onClose: () => void
}

const ZOOMS: { z: Zoom; label: string }[] = [
  { z: 'poster', label: 'Poster' },
  { z: 'fit', label: 'Fit height' },
  { z: '2x', label: '2×' },
]

/** Fullscreen map. The inline hero is a poster and deliberately not tappable; this is where
 *  selecting a city on the map actually works, because zooming is the only transformation that
 *  improves accuracy — touch error is a property of the finger and does not shrink, so growing
 *  a hit target only grows it into the neighbour. Panning is native scrolling. */
export function MapExplorer({ meta, salaries, soc, metric, adjusted, dark, onSelect, onClose }: Props) {
  const [zoom, setZoom] = useState<Zoom>('fit')
  const [picked, setPicked] = useState<{ name: string; value: string; rivals: number } | null>(null)
  const [missed, setMissed] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })

  const ramp = dark ? RAMP_DARK : RAMP_LIGHT
  const { bubbles } = useMemo(
    () => buildBubbles(meta, salaries, soc, metric, adjusted, ramp),
    [meta, salaries, soc, metric, adjusted, ramp],
  )

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const scale = zoomScale(zoom, box.w, box.h)

  const choose = useCallback((cbsa: string) => { onSelect(cbsa); onClose() }, [onSelect, onClose])

  const onMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const s = rect.width / MAP_W
    const { hit, rivals } = pickAt(bubbles, (e.clientX - rect.left) / s, (e.clientY - rect.top) / s, s)
    if (!hit) { setPicked(null); setMissed(true); return }
    setMissed(false)
    setPicked({
      name: hit.m.name,
      value: hit.v == null ? 'no data' : metric === 'pay' ? fmtUsdCompact(hit.v) : String(Math.round(hit.v)),
      rivals,
    })
  }

  return (
    <div className="mx" role="dialog" aria-modal="true" aria-label="Explore the map" data-zoom={zoom}>
      <div className="mx-bar">
        <MetroFilter metros={meta.metros} onSelect={choose} label="Find a city" />
        <div className="mx-zooms">
          {ZOOMS.map(({ z, label }) => (
            <button key={z} type="button" className="mx-zoom" data-z={z} aria-pressed={zoom === z}
                    onClick={() => setZoom(z)}>{label}</button>
          ))}
          <button type="button" className="mx-close" onClick={onClose}>Close</button>
        </div>
      </div>

      <div className="mx-mapwrap" ref={wrapRef}>
        <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} width={MAP_W * scale} height={MAP_H * scale}
             className="mx-map" onClick={onMapClick} aria-label="US metro map — tap a metro to select it">
          <path d={statesPath} className="map-states" />
          {bubbles.map(b => (
            <circle key={b.m.cbsa} className="mx-bubble" cx={b.x} cy={b.y} r={Math.max(b.r, 2.2)}
                    fill={b.fill} opacity={0.92} />
          ))}
        </svg>
      </div>

      <p className="mx-read" aria-live="polite">
        {picked == null
          ? (missed ? 'Nothing there — tap a metro, or find it by name above.' : 'Tap a metro, or find it by name above.')
          : (
            <>
              <b>{picked.name}</b> · {picked.value}
              {picked.rivals > 0 && (
                <span className="mx-ambig">
                  {' '}⚠ {picked.rivals} other metro{picked.rivals > 1 ? 's' : ''} under your thumb — zoom in or use the filter to be sure.
                </span>
              )}
            </>
          )}
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npm test -- map-explorer && npx tsc --noEmit --incremental false`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add site/components/MapExplorer.tsx site/tests/map-explorer.test.tsx
git commit -m "feat(site): MapExplorer — fullscreen map with zoom steps, filter and labelled ambiguity" -- site/components/MapExplorer.tsx site/tests/map-explorer.test.tsx
```

---

### Task 8: The hero — poster map, big number, filter, explore

**Files:**
- Modify: `site/app/page.tsx` (the `sec-map` section), `site/components/SalaryMap.tsx` (add `interactive`)
- Test: `site/tests/page.test.tsx`

**Interfaces:**
- Consumes: `payTeaser(...).top3` (Task 2), `MetroFilter` (Task 6), `MapExplorer` (Task 7).
- Produces: `SalaryMap` gains `interactive?: boolean` (default `true`). When `false`, bubbles render with no `onClick`, no `tabIndex`, no hover handlers, and the `<svg>` is `aria-hidden="true"`.

- [ ] **Step 1: Write the failing test**

Add `import userEvent from '@testing-library/user-event'` to `site/tests/page.test.tsx` — the file currently imports only `render`, `screen` and `waitFor`. Then append to the narrow describe block:

```tsx
    it('narrow: hero shows the top metro as a big number and the map is not interactive', async () => {
      renderPage()
      await waitFor(() => expect(document.querySelectorAll('.qsec-q').length).toBe(7))
      expect(document.querySelector('.hero-num')!.textContent).toMatch(/^\$[\d,]+$/)
      expect(document.querySelector('.hero-place')).not.toBeNull()
      const map = document.querySelector('.salary-map')!
      expect(map).toHaveAttribute('aria-hidden', 'true')
      expect(map.querySelector('circle[tabindex]')).toBeNull()
    })

    it('narrow: the explorer opens from the hero and is not mounted before that', async () => {
      renderPage()
      await waitFor(() => expect(document.querySelectorAll('.qsec-q').length).toBe(7))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: /explore the map/i }))
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('narrow: hero omits the number entirely when no metro has a median for the role', async () => {
      // Spec error-handling row: never a blank or NaN slot — the map and the fallback
      // sentence stand alone.
      renderPage({ salaries: {} })          // see note below
      await waitFor(() => expect(document.querySelectorAll('.qsec-q').length).toBe(7))
      expect(document.querySelector('.hero-num')).toBeNull()
      expect(document.querySelector('.qsec-deck')!.textContent)
        .toBe('Percentiles for every metro on the map.')
    })
```

`renderPage` in this file currently takes no arguments and mocks `lib/data` with module-level fixtures. Give it an optional `{ salaries }` override that is merged into the mocked `loadSalaries` response, so this case can be exercised without a second mock setup. Keep the default behaviour identical for every existing caller.

- [ ] **Step 2: Run and confirm it fails**

Run: `npm test -- page`
Expected: FAIL — `.hero-num` is null.

- [ ] **Step 3: Add `interactive` to `SalaryMap`**

Add `interactive?: boolean` to its `Props`, default it in the signature (`interactive = true`), then gate the interaction attributes on each bubble and mark the svg:

```tsx
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="salary-map"
           {...(interactive
             ? { role: 'group' as const, 'aria-label': 'US metro map of tech pay' }
             : { 'aria-hidden': true as const })}>
```

```tsx
          <circle
            key={b.m.cbsa} cx={b.x} cy={b.y} r={b.r} fill={b.fill}
            className={`map-bubble${b.m.cbsa === selected ? ' is-selected' : ''}`}
            {...(interactive ? {
              tabIndex: 0,
              role: 'button',
              'aria-label': `${b.m.name}: ${formatMetricValue(b.v, metric, b.m.rpp == null, adjusted)}`,
              onClick: () => select(b.m.cbsa),
              onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(b.m.cbsa) } },
              onMouseEnter: (e: React.MouseEvent) => setHover({ cbsa: b.m.cbsa, x: e.clientX, y: e.clientY }),
              onMouseLeave: () => setHover(null),
            } : {})}
          />
```

Keep the existing attribute names and handler bodies exactly as they are today — only the gating is new. Preserve the legend and tooltip markup unchanged; the tooltip can never appear when `interactive` is false because nothing sets `hover`.

- [ ] **Step 4: Compose the hero in `app/page.tsx`**

Add state and imports:

```tsx
import { MapExplorer } from '../components/MapExplorer'
import { MetroFilter } from '../components/MetroFilter'
import { fmtUsd } from '../lib/format'
```

```tsx
  const [explorerOpen, setExplorerOpen] = useState(false)
```

Replace the `sec-map` `QuestionSection` body with:

```tsx
      <QuestionSection anchorId="sec-map" question="Where does it pay the most?"
                       fact={teasers.pay.fact} narrow={narrow}>
        {narrow && teasers.pay.top3.length > 0 && (
          <div className="hero-readout">
            <div className="hero-num">{fmtUsd(teasers.pay.top3[0].p50)}</div>
            <div className="hero-place">{teasers.pay.top3[0].city}</div>
            <div className="hero-sub">
              highest median of {meta.metros.length} metros · {role.label}
              {state.adjusted ? ', cost-of-living adjusted' : ''}
            </div>
          </div>
        )}
        <div id="sec-map" className={state.metro ? 'hero-row has-panel' : 'hero-row'}>
          <SalaryMap meta={meta} salaries={salaries} soc={state.role} metric={state.metric}
                     adjusted={state.adjusted} selected={state.metro} dark={dark}
                     interactive={!narrow}
                     onSelect={cbsa => update({ metro: cbsa })} />
          {state.metro && (
            <MetroPanel meta={meta} salaries={salaries} cbsa={state.metro} soc={state.role}
                        adjusted={state.adjusted} national={trends} onClose={() => update({ metro: null })} />
          )}
        </div>
        {narrow && (
          <div className="hero-actions">
            <MetroFilter metros={meta.metros} onSelect={cbsa => update({ metro: cbsa })} />
            <button type="button" className="hero-explore" onClick={() => setExplorerOpen(true)}>
              Explore the map →
            </button>
          </div>
        )}
      </QuestionSection>
```

Mount the explorer just before the footer:

```tsx
      {narrow && explorerOpen && (
        <MapExplorer meta={meta} salaries={salaries} soc={state.role} metric={state.metric}
                     adjusted={state.adjusted} dark={dark}
                     onSelect={cbsa => update({ metro: cbsa })}
                     onClose={() => setExplorerOpen(false)} />
      )}
```

Note the `id="sec-map"` stays on the inner `.hero-row` while `QuestionSection` puts the same id on the section — **remove it from the inner div**; the section owns the anchor now (Task 3 established this). Change it to `className={state.metro ? 'hero-row has-panel' : 'hero-row'}` with no `id`.

- [ ] **Step 5: Run and confirm it passes**

Run: `npm test && npx tsc --noEmit --incremental false`
Expected: PASS. If `page.test.tsx` complains about duplicate `sec-map` ids, the inner `id` was not removed.

- [ ] **Step 6: Commit**

```bash
git add site/app/page.tsx site/components/SalaryMap.tsx site/tests/page.test.tsx
git commit -m "feat(site): mobile hero — poster map, hero number, name filter, explore entry" -- site/app/page.tsx site/components/SalaryMap.tsx site/tests/page.test.tsx
```

---

### Task 9: `TrendsTeaser` gains its sparkline

Today this section renders a heading, a sentence and a link — **no chart at all**. In a data-forward page it would be the only section with zero ink.

**Files:**
- Modify: `site/components/TrendsTeaser.tsx`, `site/app/page.tsx` (the `trend-h` section passes no new props — `TrendsTeaser` already receives `trends`)
- Test: `site/tests/trends-teaser.test.tsx`

**Interfaces:**
- Consumes: `MiniSpark` from `components/MiniSpark` — unchanged component, `{ series: (number | null)[] }`, returns `null` when fewer than 2 non-null points.
- Produces: no signature change to `TrendsTeaser`.

- [ ] **Step 1: Write the failing test**

Append to `site/tests/trends-teaser.test.tsx`:

```tsx
  it('renders the real-terms sparkline above the sentence', () => {
    const trends = {
      years: [2019, 2020, 2021, 2022, 2023, 2024, 2025], headlineFrom: 2021,
      roles: { S: { changeReal: -0.057, real: [100, 102, 101, 99, 97, 96, 94], nominal: [] } },
    } as never
    const { container } = render(<TrendsTeaser trends={trends} soc="S" roleLabel="Software Developers" />)
    expect(container.querySelector('.mini-spark')).not.toBeNull()
  })

  it('omits the sparkline when the series has fewer than two real points', () => {
    const trends = {
      years: [2019, 2020], headlineFrom: 2019,
      roles: { S: { changeReal: 0, real: [null, 100], nominal: [] } },
    } as never
    const { container } = render(<TrendsTeaser trends={trends} soc="S" roleLabel="Software Developers" />)
    expect(container.querySelector('.mini-spark')).toBeNull()
    expect(container.textContent).toContain('Software Developers')
  })

  it('omits the sparkline entirely when trends failed to load', () => {
    const { container } = render(<TrendsTeaser trends={null} soc="S" roleLabel="Software Developers" />)
    expect(container.querySelector('.mini-spark')).toBeNull()
    expect(container.textContent).toContain('Trend data unavailable.')
  })
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npm test -- trends-teaser`
Expected: FAIL — no `.mini-spark` in the tree.

- [ ] **Step 3: Implement**

```tsx
// site/components/TrendsTeaser.tsx
'use client'
import Link from 'next/link'
import type { TrendsJson } from '../lib/trends-types'
import { trendTeaser } from '../lib/teasers'
import { MiniSpark } from './MiniSpark'

/** §6 of the question spine: the shape of the real-terms series, one computed line, and the
 *  on-ramp to /trends with the role carried across. The sparkline is decorative and aria-hidden
 *  (MiniSpark sets that itself) — the sentence carries the claim, as everywhere else. */
export function TrendsTeaser({ trends, soc, roleLabel }: {
  trends: TrendsJson | null; soc: string; roleLabel: string
}) {
  const teaser = trendTeaser(trends, soc, roleLabel)
  const series = trends?.roles[soc]?.real
  return (
    <section className="trend-teaser" aria-labelledby="trend-h">
      <h2 id="trend-h">Are wages beating inflation?</h2>
      {series != null && <div className="tt-spark"><MiniSpark series={series} /></div>}
      <p>
        {teaser.fact}{' '}
        {trends != null && <Link href={`/trends?role=${soc}`}>Every role, {trends.years[0]}–{trends.years[trends.years.length - 1]} →</Link>}
      </p>
    </section>
  )
}
```

`MiniSpark` already returns `null` when the series has fewer than two real points, so the sparse case needs no extra guard here.

- [ ] **Step 4: Run and confirm it passes**

Run: `npm test -- trends-teaser mini-spark && npx tsc --noEmit --incremental false`
Expected: PASS. `mini-spark.test.tsx` must still pass unchanged — the component is reused, not modified.

- [ ] **Step 5: Commit**

```bash
git add site/components/TrendsTeaser.tsx site/tests/trends-teaser.test.tsx
git commit -m "feat(site): trends section carries a real sparkline, not just a sentence" -- site/components/TrendsTeaser.tsx site/tests/trends-teaser.test.tsx
```

---

### Task 10: Cap `RoleSimilarity` on narrow

The 2,063px section — a third of the naive uncollapsed page, answering the least important of the seven questions.

**Files:**
- Modify: `site/components/RoleSimilarity.tsx`, `site/app/page.tsx` (pass `narrow`)
- Test: `site/tests/role-similarity.test.tsx`

**Interfaces:**
- Produces: `RoleSimilarity` gains `narrow?: boolean` (default `false`). Exports `export const NARROW_CAP = 5`.

- [ ] **Step 1: Write the failing test**

Append to `site/tests/role-similarity.test.tsx`. This file already imports `render`, `screen`, `fireEvent`, `MIN_SHARED`, the `Meta`/`Salaries` types and the local `p(p50)` row helper — reuse them; add `NARROW_CAP` to the `RoleSimilarity` import.

```tsx
// One anchor ('A') plus seven comparison roles, each present in every metro so all seven
// clear MIN_SHARED and the list is long enough for the cap to bite.
const MANY_SOCS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const manyCbsas = Array.from({ length: MIN_SHARED + 3 }, (_, i) => String(30000 + i))

const manyMeta = {
  year: 2025, generated: '', topCodeValue: 239200, rppYear: 2024, lcaPeriod: '',
  sources: { oews: '', lca: [], hud: '', zipMatchRate: 0.99 },
  roles: MANY_SOCS.map(soc => ({ soc, label: `Role ${soc}`, short: soc })),
  metros: manyCbsas.map(cbsa => ({ cbsa, name: `Metro ${cbsa}`, state: 'XX', lat: 0, lng: 0, rpp: 100, lcaFilings: 0 })),
} as unknown as Meta

const manySalaries: Salaries = {}
manyCbsas.forEach((cbsa, i) => {
  manySalaries[cbsa] = {}
  MANY_SOCS.forEach((soc, j) => { manySalaries[cbsa][soc] = p(100000 + j * 5000 + i * 100) })
})

const renderWithManyRoles = ({ narrow }: { narrow: boolean }) =>
  render(<RoleSimilarity meta={manyMeta} salaries={manySalaries} soc="A"
                         onSelectRole={() => {}} narrow={narrow} />)

describe('RoleSimilarity narrow cap', () => {
  it('desktop shows every similar role and offers no expander', () => {
    const { container } = renderWithManyRoles({ narrow: false })
    expect(container.querySelectorAll('.rsim-row').length).toBe(MANY_SOCS.length - 1)
    expect(screen.queryByRole('button', { name: /see all/i })).not.toBeInTheDocument()
  })

  it('narrow shows five, states the TRUE total, and expands in place', () => {
    const { container } = renderWithManyRoles({ narrow: true })
    const total = MANY_SOCS.length - 1                       // 7 comparison roles
    expect(container.querySelectorAll('.rsim-row')).toHaveLength(NARROW_CAP)

    // "Capped, never hidden": the control states the full count, not the shown count.
    const more = screen.getByRole('button', { name: /see all \d+ roles/i })
    expect(more.textContent).toContain(String(total))
    expect(more.textContent).not.toContain(String(NARROW_CAP))

    fireEvent.click(more)
    expect(container.querySelectorAll('.rsim-row')).toHaveLength(total)
    expect(screen.queryByRole('button', { name: /see all/i })).not.toBeInTheDocument()
  })

  it('narrow does not cap a list that is already short', () => {
    const { container } = render(
      <RoleSimilarity meta={meta} salaries={salaries} soc="A" onSelectRole={() => {}} narrow />,
    )
    expect(container.querySelectorAll('.rsim-row').length).toBeLessThanOrEqual(NARROW_CAP)
    expect(screen.queryByRole('button', { name: /see all/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npm test -- role-similarity`
Expected: FAIL — narrow renders all rows; no "See all" button exists.

- [ ] **Step 3: Implement**

In `site/components/RoleSimilarity.tsx`, add the import `useState` alongside `useMemo`, add `narrow = false` to `Props` and the signature, then:

```tsx
export const NARROW_CAP = 5
```

```tsx
  const [expanded, setExpanded] = useState(false)
  const capped = narrow && !expanded && sims.length > NARROW_CAP
  const shown = capped ? sims.slice(0, NARROW_CAP) : sims
```

Map over `shown` instead of `sims`, and after the `</ol>`:

```tsx
      {capped && (
        <button type="button" className="rsim-more" onClick={() => setExpanded(true)}>
          See all {sims.length} roles →
        </button>
      )}
```

The full count comes from `sims.length`, never from `shown.length` — the site's rule is that a truncation states its true total (`docs/superpowers/specs/2026-08-23-mobile-poster-design.md`, Invariant 1).

Pass `narrow` from `app/page.tsx`:

```tsx
        <RoleSimilarity meta={meta} salaries={salaries} soc={state.role}
                        onSelectRole={soc => update({ role: soc })} narrow={narrow} />
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npm test -- role-similarity && npx tsc --noEmit --incremental false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add site/components/RoleSimilarity.tsx site/tests/role-similarity.test.tsx site/app/page.tsx
git commit -m "feat(site): cap similar roles at 5 on narrow, expanding in place with the true count" -- site/components/RoleSimilarity.tsx site/tests/role-similarity.test.tsx site/app/page.tsx
```

---

### Task 11: Phone-scale default for `RoleHeatmap`

`RoleHeatmap` already implements "capped, never hidden" — it is the reference for the invariant. It only needs a phone-scale default and a toggle label that reads from the active cap.

**Files:**
- Modify: `site/components/RoleHeatmap.tsx:20,50,84-88`, `site/app/page.tsx` (pass `narrow`)
- Test: `site/tests/role-heatmap.test.tsx`

**Interfaces:**
- Produces: `RoleHeatmap` gains `narrow?: boolean` (default `false`). Exports `export const TOP_N_NARROW = 15` alongside the existing `TOP_N = 50` (which must also be exported for the test).

- [ ] **Step 1: Write the failing test**

Append to `site/tests/role-heatmap.test.tsx`. Ensure the file imports `render`, `screen` and `fireEvent` from `@testing-library/react`, and `Meta`/`Salaries` from `../lib/types`.

```tsx
// 60 metros with strictly descending employment, so topMetrosByEmployment is deterministic
// and metros outside both caps exist for the search test to reach.
const hmRoles = [
  { soc: 'S1', label: 'Role One', short: 'R1' },
  { soc: 'S2', label: 'Role Two', short: 'R2' },
]
const hmCbsas = Array.from({ length: 60 }, (_, i) => String(40000 + i))

const hmMeta = {
  year: 2025, generated: '', topCodeValue: 239200, rppYear: 2024, lcaPeriod: '',
  sources: { oews: '', lca: [], hud: '', zipMatchRate: 0.99 },
  roles: hmRoles,
  metros: hmCbsas.map((cbsa, i) => ({
    cbsa, name: `Metro ${i}, XX`, state: 'XX', lat: 0, lng: 0, rpp: 100, lcaFilings: 0,
  })),
} as unknown as Meta

const hmSalaries: Salaries = {}
hmCbsas.forEach((cbsa, i) => {
  hmSalaries[cbsa] = {}
  for (const r of hmRoles) {
    hmSalaries[cbsa][r.soc] = {
      emp: 10000 - i * 100, lq: 1, p10: null, p25: null, p50: 120000 + i * 500, p75: null, p90: null,
    }
  }
})

const renderHeatmap = ({ narrow }: { narrow: boolean }) =>
  render(<RoleHeatmap meta={hmMeta} salaries={hmSalaries} metric="pay" adjusted={false}
                      dark={false} selectedMetro={null} selectedRole="S1"
                      narrow={narrow} onSelect={() => {}} />)

describe('RoleHeatmap narrow cap', () => {
  it('narrow defaults to the phone cap and says so on the toggle', () => {
    renderHeatmap({ narrow: true })          // fixture must supply > 15 metros
    expect(screen.getByText(/^15 metros$/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show all/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /show top 50/i })).not.toBeInTheDocument()
  })

  it('desktop keeps the 50-metro cap', () => {
    renderHeatmap({ narrow: false })
    expect(screen.getByText(/^50 metros$/)).toBeInTheDocument()
  })

  it('narrow: expanding shows every metro, and the toggle offers the phone cap back', () => {
    renderHeatmap({ narrow: true })
    fireEvent.click(screen.getByRole('button', { name: /show all/i }))
    expect(screen.getByText(/^60 metros$/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show top 15/i })).toBeInTheDocument()
  })

  it('search still reaches metros outside the cap', () => {
    renderHeatmap({ narrow: true })
    // "Metro 40" is 41st by employment — well outside both the 15 and 50 caps.
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Metro 40' } })
    expect(screen.getByText(/^1 metros$/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npm test -- role-heatmap`
Expected: FAIL — narrow still shows 50 metros.

- [ ] **Step 3: Implement**

In `site/components/RoleHeatmap.tsx`:

```tsx
export const TOP_N = 50
export const TOP_N_NARROW = 15
```

Add `narrow?: boolean` to `Props`, take `narrow = false` in the signature, then:

```tsx
  const cap = narrow ? TOP_N_NARROW : TOP_N
```

Use `cap` in the row memo (replacing the literal `TOP_N` at `:50`) and add `cap` to its dependency array. Update the toggle label so it can never disagree with the active cap:

```tsx
          <button type="button" className="hm-toggle" aria-pressed={showAll} onClick={() => setShowAll(s => !s)}>
            {showAll ? `Show top ${cap}` : `Show all ${meta.metros.length}`}
          </button>
```

Pass `narrow` from `app/page.tsx`:

```tsx
        <RoleHeatmap meta={meta} salaries={salaries} metric={state.metric} adjusted={state.adjusted}
                     dark={dark} selectedMetro={state.metro} selectedRole={state.role}
                     narrow={narrow} onSelect={p => update(p)} />
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npm test -- role-heatmap && npx tsc --noEmit --incremental false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add site/components/RoleHeatmap.tsx site/tests/role-heatmap.test.tsx site/app/page.tsx
git commit -m "feat(site): heatmap defaults to a 15-metro cap on narrow, toggle reads the active cap" -- site/components/RoleHeatmap.tsx site/tests/role-heatmap.test.tsx site/app/page.tsx
```

---

### Task 12: The poster stylesheet

All visual work, narrow-only. No component logic changes.

**Files:**
- Modify: `site/app/globals.css` — the `@media (max-width: 720px)` block at `:505-561`
- Test: verified by Task 13's e2e plus a manual two-theme eyeball

**Interfaces:**
- Consumes the class names produced by Tasks 3–11: `.qsec`, `.qsec-q`, `.qsec-deck`, `.qsec-body`, `.hero-readout`, `.hero-num`, `.hero-place`, `.hero-sub`, `.hero-actions`, `.hero-explore`, `.mf`, `.mf-input`, `.mf-results`, `.mf-result`, `.mf-empty`, `.mx`, `.mx-bar`, `.mx-zooms`, `.mx-zoom`, `.mx-close`, `.mx-mapwrap`, `.mx-map`, `.mx-bubble`, `.mx-read`, `.mx-ambig`, `.rsim-more`, `.tt-spark`, `.prov-links`.
- Produces: no exports.

- [ ] **Step 1: Delete the card styles**

Remove the `.qcard*`, `.mini-spark` positioning and `.qcard-chev` rules (`globals.css:531-560`). Keep the `.mini-spark polyline` / `.mini-spark-dot` / `.mini-spark-pt` stroke rules — `MiniSpark` still ships, now as a section chart. Move them **out** of the narrow media block so the sparkline also strokes correctly if it is ever used at desktop width.

- [ ] **Step 2: Add the poster section and full-bleed rules**

```css
  /* ── Poster sections (2026-08-23) ─────────────────────────────────────
     Nothing collapses; the charts are the page's visual language. Wide
     content still scrolls in its own container at the source, never the
     whole section — same rule as .slope-scroll / .role-scroll. */
  .qsec { padding: var(--s6) 0 0; border-top: 1px solid var(--line-soft); margin-top: var(--s5); }
  .qsec:first-of-type { border-top: none; margin-top: var(--s4); padding-top: var(--s4); }
  .qsec-q {
    font-size: .78rem; letter-spacing: .09em; text-transform: uppercase;
    font-weight: 650; color: var(--accent); margin: 0;
  }
  .qsec-deck {
    font-size: 1.12rem; font-weight: 700; line-height: 1.35; letter-spacing: -.01em;
    text-wrap: balance; font-variant-numeric: tabular-nums; margin: var(--s2) 0 0;
  }
  .qsec-body { margin-top: var(--s4); max-width: 100%; overflow-x: auto; }

  /* Charts escape the page gutter. Same idiom as .secnav above. */
  .qsec-body > figure,
  .qsec-body .salary-map,
  .tt-spark { margin-inline: calc(var(--s4) * -1); width: auto; }
  .tt-spark .mini-spark { width: 100%; height: 44px; }
```

- [ ] **Step 3: Add the hero, sticky bar and footer rules**

```css
  /* Sticky control bar — the only persistent chrome (wayfinding option D). */
  .filter-bar {
    position: sticky; top: 0; z-index: 20;
    display: flex; flex-direction: row; align-items: center; gap: var(--s2);
    background: var(--bg); border-bottom: 1px solid var(--line);
    margin: 0 calc(var(--s4) * -1); padding: var(--s2) var(--s4);
  }
  .filter-bar .filter-label { display: none; }        /* the chip's value is self-describing */
  .filter-bar .filter-field, .filter-bar select { flex: 0 1 auto; width: auto; min-width: 0; }
  .filter-bar select, .col-toggle { font-size: var(--fs-meta); padding: 4px var(--s2); }
  .col-toggle { margin-left: auto; white-space: nowrap; }

  .hero-readout { margin-top: var(--s4); }
  .hero-num {
    font-size: 2.75rem; font-weight: 700; line-height: 1;
    letter-spacing: -.045em; font-variant-numeric: tabular-nums;
  }
  .hero-place {
    font-size: var(--fs-meta); letter-spacing: .11em; text-transform: uppercase;
    font-weight: 650; margin-top: var(--s1);
  }
  .hero-sub { font-size: var(--fs-meta); color: var(--ink-muted); margin-top: 2px; }
  .hero-actions { display: flex; flex-direction: column; gap: var(--s2); margin-top: var(--s3); }
  .hero-explore {
    align-self: flex-start; font: inherit; font-size: var(--fs-sm); font-weight: 650;
    color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent);
    border: 1px solid var(--line); border-radius: 999px; padding: var(--s2) var(--s4);
    cursor: pointer;
  }
  .prov-links { display: flex; flex-wrap: wrap; gap: var(--s3); margin: var(--s3) 0; }
```

- [ ] **Step 4: Add the filter and explorer rules**

```css
  .mf-input {
    width: 100%; font: inherit; font-size: var(--fs-body);
    padding: var(--s2) var(--s3); border-radius: 8px;
    border: var(--rule); background: var(--surface); color: var(--ink);
  }
  .mf-results { list-style: none; margin: var(--s2) 0 0; padding: 0; max-height: 40vh; overflow-y: auto; }
  .mf-results li { border-top: 1px solid var(--line-soft); }
  .mf-result {
    width: 100%; text-align: left; font: inherit; font-size: var(--fs-sm);
    /* 44px minimum row height — the one place on this page where a tap target is guaranteed. */
    min-height: 44px; padding: var(--s2) var(--s1);
    background: none; border: none; color: var(--ink); cursor: pointer;
  }
  .mf-empty { font-size: var(--fs-meta); color: var(--ink-muted); margin-top: var(--s2); }

  .mx {
    position: fixed; inset: 0; z-index: 50; background: var(--bg);
    display: flex; flex-direction: column;
  }
  .mx-bar { padding: var(--s3) var(--s4); border-bottom: 1px solid var(--line); background: var(--surface); }
  .mx-zooms { display: flex; gap: var(--s2); align-items: center; margin-top: var(--s2); flex-wrap: wrap; }
  .mx-zoom, .mx-close {
    font: inherit; font-size: var(--fs-meta); cursor: pointer;
    border: var(--rule); border-radius: 999px; padding: 5px var(--s3);
    background: var(--surface); color: var(--ink-muted);
  }
  .mx-zoom[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--surface); font-weight: 650; }
  .mx-close { margin-left: auto; }
  .mx-mapwrap { flex: 1; overflow: auto; overscroll-behavior: contain; background: var(--surface); }
  .mx-map { display: block; }
  .mx-read { padding: var(--s3) var(--s4); border-top: 1px solid var(--line); font-size: var(--fs-sm); }
  .mx-ambig { color: var(--ink-muted); }

  .rsim-more {
    font: inherit; font-size: var(--fs-sm); font-weight: 650; color: var(--accent);
    background: none; border: none; padding: var(--s3) 0 0; cursor: pointer;
  }
```

- [ ] **Step 5: Make the heatmap's row header stick while 21 columns scroll**

```css
  .hm-table .hm-rowh {
    position: sticky; left: 0; z-index: 1;
    background: var(--bg);       /* opaque — cells must not show through the metro name */
    max-width: 14ch;
  }
```

- [ ] **Step 6: Verify both themes at 390px**

Run: `npm run dev`, then open `http://localhost:3020` at 390×844 in light and dark. Confirm: the sticky bar stays opaque over scrolling charts; no element causes horizontal page scroll; the hero number does not wrap; the explorer covers the page and closes.

- [ ] **Step 7: Commit**

```bash
git add site/app/globals.css
git commit -m "style(site): poster stylesheet for narrow — sticky bar, full-bleed charts, hero, explorer" -- site/app/globals.css
```

---

### Task 13: Re-point the e2e suite and pin the new budget

**Files:**
- Modify: `site/e2e/mobile-index.spec.ts` (rewrite)
- Test: itself

**Interfaces:**
- Consumes every class produced above.

- [ ] **Step 1: Rewrite the spec**

```ts
// site/e2e/mobile-index.spec.ts
import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

test('mobile: every section renders its real chart, uncollapsed', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'TechPay Atlas' })).toBeVisible()

  // The whole point of the redesign: heavy sections are mounted without any interaction.
  await expect(page.locator('.h2h')).toHaveCount(1)
  await expect(page.locator('.salary-map')).toBeVisible()
  await expect(page.locator('.rsim')).toHaveCount(1)
  await expect(page.locator('.heatmap')).toHaveCount(1)
  await expect(page.locator('.qsec')).toHaveCount(7)
  await expect(page.getByRole('button', { name: /open|expand/i })).toHaveCount(0)
})

test('mobile: page height budget', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.qsec')).toHaveCount(7)

  // Shape B budgets 4,074px. Exceeding this is a signal to RE-WEIGHT sections,
  // not to raise the pin — the budget is the design decision.
  const height = await page.evaluate(() => document.querySelector('main.page')!.scrollHeight)
  expect(height).toBeLessThan(4400)
})

test('mobile: the similar-roles section stays capped', async ({ page }) => {
  await page.goto('/')
  const rsim = page.locator('.rsim')
  await expect(rsim).toBeVisible()

  // This section measured 2,063px uncapped — a third of the whole page. Pin it directly:
  // a regression here is invisible in the total until it is large.
  const h = await rsim.evaluate(el => (el as HTMLElement).getBoundingClientRect().height)
  expect(h).toBeLessThan(700)

  await page.getByRole('button', { name: /see all \d+ roles/i }).click()
  const expanded = await rsim.evaluate(el => (el as HTMLElement).getBoundingClientRect().height)
  expect(expanded).toBeGreaterThan(h)
})

test('mobile: explorer opens, filters, selects, and lands on the metro panel', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /explore the map/i }).click()

  const dlg = page.getByRole('dialog')
  await expect(dlg).toBeVisible()
  await expect(dlg).toHaveAttribute('data-zoom', 'fit')

  await dlg.getByRole('button', { name: '2×' }).click()
  await expect(dlg).toHaveAttribute('data-zoom', '2x')

  await dlg.getByRole('searchbox').fill('San Jose')
  await dlg.getByRole('button', { name: /San Jose/ }).click()

  await expect(dlg).toBeHidden()
  await expect(page.locator('.metro-panel')).toBeVisible()
})

test('mobile: hash deep-link scrolls to its section', async ({ page }) => {
  await page.goto('/#rsim-h')
  await expect(page.locator('.rsim')).toBeVisible()
  const top = await page.locator('#rsim-h').evaluate(el => el.getBoundingClientRect().top)
  expect(Math.abs(top)).toBeLessThan(200)
})
```

If `.metro-panel` is not the actual class on `MetroPanel`'s root, read `site/components/MetroPanel.tsx` and use the real one — do not invent it.

- [ ] **Step 2: Run the e2e suite**

Run: `npm run e2e -- mobile-index`
Expected: 5 PASS. A height-budget failure means the design over-ran — re-weight a section, do not raise the number.

- [ ] **Step 3: Run every gate**

Run: `npm test && npx tsc --noEmit --incremental false && npm run lint && npm run e2e`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add site/e2e/mobile-index.spec.ts
git commit -m "test(site): e2e pins the uncollapsed page, the 4400px budget and the explorer flow" -- site/e2e/mobile-index.spec.ts
```

- [ ] **Step 5: Open the PR**

```bash
git push -u origin <branch>
```

Open a PR against `main` via the GitHub MCP tools (`gh` is not installed on this machine). **Wait for all three checks**, then merge. Never push `main` directly — it deploys with no gating tests.

---

## Done criteria

- [ ] `npm test`, `npx tsc --noEmit --incremental false`, `npm run lint`, `npm run e2e` all pass.
- [ ] At 390px the page is under 4,400px, every section shows a chart, and nothing needs tapping to appear.
- [ ] Light and dark both eyeballed at 390px; no horizontal page scroll.
- [ ] Desktop at 1280px is visually identical to `main` — spot-check the map, title lens and heatmap.
- [ ] The explorer reports ambiguity when rivals share the thumb patch, and selects nothing when a tap is out of range.
- [ ] PR opened, three checks green, merged. Not pushed to `main` directly.
