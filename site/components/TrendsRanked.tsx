'use client'
import { rankByChange } from '../lib/trends'
import type { TrendsJson } from '../lib/trends-types'

// U+2212 minus, not a hyphen: it aligns with digits in tabular figures.
const pct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}%`

/** Real % change over the headline window, one bar per role, diverging from a zero line that
 *  means "exactly kept pace with inflation".
 *
 *  Every bar spans the same window, so no role is excluded and no footnote is needed about
 *  missing ones — that is the whole reason the headline is windowed rather than starting at the
 *  earliest archived year.
 *
 *  Bar widths are percentages of the container, never fixed px (repo sizing rule). */
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
        Real change in median pay, {trends.headlineFrom}–{trends.headlineTo}, measured in{' '}
        {trends.deflator.base} dollars using CPI-U. Bars right of the line beat inflation.
      </figcaption>
      <ul className="tr-rows">
        {ranked.map(r => {
          const w = (Math.abs(r.changeReal) / max) * 50 // half-width each side of centre
          const activate = () => onSelect(r.soc)
          return (
            <li
              key={r.soc}
              className="tr-row"
              data-role-row
              data-selected={r.soc === selected}
              role="button"
              tabIndex={0}
              aria-pressed={r.soc === selected}
              onClick={activate}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate() }
              }}
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
