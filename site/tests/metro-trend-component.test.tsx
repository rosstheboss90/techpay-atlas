import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MetroTrend } from '../components/MetroTrend'
import type { MetroTrendData } from '../lib/metro-trend-types'
import type { TrendsJson } from '../lib/trends-types'

const metro: MetroTrendData = {
  cbsa: '12420', name: 'Austin-Round Rock-San Marcos, TX',
  years: [2021, 2022, 2023, 2024, 2025],
  breaks: [{ year: 2024, from: 'Austin-Round Rock, TX', to: 'Austin-Round Rock-San Marcos, TX' }],
  deflator: { series: 'CUUR0000SA0', period: 'May', base: 2025 },
  // Real per-vintage OEWS top code (pipeline/vintages.ts): $208,000 through 2021, $239,200 from
  // the May 2022 boundary onward.
  topCodes: [208000, 239200, 239200, 239200, 239200],
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
    // 2023 is suppressed, which alone splits [2021,2022] from what follows. The 2024 delineation
    // break is REDUNDANT with that gap here — segments() (Task 4, already shipped and tested)
    // only inserts an extra split when a break lands inside an already-nonempty run; since the run
    // was just emptied by the 2023 null, there is nothing to sever, so 2024 simply starts the next
    // run and connects forward to 2025. Two segments total, not three: [2021,2022] and [2024,2025].
    // (The plan's draft comment claimed 3 for this fixture; verified against the actual segments()
    // behavior — see site/lib/metro-trend.ts — and corrected here rather than bending the component
    // to manufacture a spurious extra split.)
    const { container } = render(<MetroTrend metro={metro} national={national} soc="15-1252" roleLabel="Software Developers" />)
    expect(container.querySelectorAll('[data-metro-series]')).toHaveLength(2)
  })

  it('draws the national series, labelled so it is not mistaken for a second metro', () => {
    const { container } = render(<MetroTrend metro={metro} national={national} soc="15-1252" roleLabel="Software Developers" />)
    expect(container.querySelector('[data-national-series]')).toBeInTheDocument()
    // Scoped to the legend. An unscoped /national/i also matches the "see every role nationally"
    // link below the chart — the ambiguity is the point of the assertion, so pin the element that
    // actually identifies the ghosted series rather than any text containing the word.
    expect(container.querySelector('.mt-legend-national')?.textContent).toMatch(/national/i)
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

  it('never references cost-of-living in code — the RPP guard is structural', () => {
    // RPP is renormalised to US=100 annually, so it must never touch a time series.
    //
    // Three guards, weakest last:
    //  1. the props type has no `adjusted` — tsc rejects passing it at every call site;
    //  2. the integration test in metro-panel.test.tsx asserts toggling cost-of-living leaves
    //     plotted points byte-identical;
    //  3. this scan, which additionally catches the component reaching for RPP from somewhere
    //     other than a prop.
    //
    // Comments and string/template literals are stripped first so the visible copy — and the
    // JSDoc above the component — can say "cost-of-living" plainly.
    //
    // Comments are stripped as a whole unit, ahead of string literals, deliberately: after
    // Vite/Babel's JSX transform, JSX text is already ordinary double-quoted string content by
    // the time `.toString()` sees it, so a naive quote-only strip is enough for that — but this
    // file's comments are full of contractions ("component's", "doesn't", "it's"). A quote
    // stripper with no notion of comments treats those apostrophes as string delimiters and
    // swallows everything between one contraction and the next, real code included — proven by
    // hand: stripping only quotes ate 249 and 1027-character stretches of live code such as
    // `role.real[i] !== null` here. Stripping full comments first sidesteps that rather than
    // trying to make quote-matching escape-aware around prose it was never meant to parse.
    const code = MetroTrend.toString()
      .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
      .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, '')
    expect(code).not.toMatch(/\badjusted\b/)
    expect(code).not.toMatch(/\brpp\b/i)
  })
})
