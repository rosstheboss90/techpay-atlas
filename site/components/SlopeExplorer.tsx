'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Meta, Salaries } from '../lib/types'
import { slopeRows } from '../lib/slopegraph'
import { fmtUsdCompact } from '../lib/format'
import { shortMetro } from '../lib/teasers'
import { MetroFilter } from './MetroFilter'

interface Props {
  meta: Meta
  salaries: Salaries
  soc: string
  roleLabel: string
  onClose: () => void
}

/** Row-count steps offered above the table. "All N" is appended from the data — N is not a
 *  constant, it is however many metros have BOTH a median for this role and a cost-of-living
 *  index, which differs per role. */
const STEPS = [25, 50, 100] as const

/** The full cost-of-living ranking, as a table.
 *
 *  The inline section keeps its 18-metro slopegraph: the crossing lines are the story. A
 *  slopegraph stops being readable somewhere past ~25 rows and is meaningless at 100+, so the
 *  large view is a table instead — it stays legible at any row count.
 *
 *  The important semantic: `slopeRows` ranks **within the subset it returns**, so the ranking is
 *  recomputed for each row count rather than sliced from a cached full list. A metro's "rise" or
 *  "fall" therefore means something different at Top 25 than at All N, and the caption says so on
 *  screen. Slicing a pre-ranked list would silently show ranks from a set the user isn't looking
 *  at. */
export function SlopeExplorer({ meta, salaries, soc, roleLabel, onClose }: Props) {
  const [count, setCount] = useState<number>(STEPS[0])
  const [highlight, setHighlight] = useState<string | null>(null)
  const [notRanked, setNotRanked] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>())

  // Every rankable metro, used only for the "All N" label and the not-ranked check.
  const all = useMemo(
    () => slopeRows(meta.metros, salaries, soc, Number.MAX_SAFE_INTEGER),
    [meta.metros, salaries, soc],
  )
  // Recomputed per count — see the note above; this is not `all.slice(0, count)`.
  const rows = useMemo(
    () => slopeRows(meta.metros, salaries, soc, count),
    [meta.metros, salaries, soc, count],
  )

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    rootRef.current?.focus()
    return () => prev?.focus?.()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Scroll the highlighted row into view once it exists — which may be after a count change.
  useEffect(() => {
    if (!highlight) return
    // Optional call, matching page.tsx's hash-scroll idiom: scrollIntoView is absent in jsdom
    // and in older engines, and an effect that throws would take the whole overlay down.
    rowRefs.current.get(highlight)?.scrollIntoView?.({ block: 'center' })
  }, [highlight, count])

  const choose = useCallback((cbsa: string) => {
    const rankable = all.find(r => r.cbsa === cbsa)
    if (!rankable) {
      // Metros without a cost-of-living index (or without a median for this role) have no
      // adjusted position at all. Say which and why rather than silently doing nothing.
      const metro = meta.metros.find(m => m.cbsa === cbsa)
      setHighlight(null)
      setNotRanked(metro?.name ?? cbsa)
      return
    }
    setNotRanked(null)
    setHighlight(cbsa)
    // Widen the set if the chosen metro sits outside the current count, so its row exists.
    if (!rows.some(r => r.cbsa === cbsa)) setCount(all.length)
  }, [all, rows, meta.metros])

  const steps: { n: number; label: string }[] = [
    ...STEPS.filter(n => n < all.length).map(n => ({ n, label: `Top ${n}` })),
    { n: all.length, label: `All ${all.length}` },
  ]

  return (
    <div className="sx" role="dialog" aria-modal="true" aria-label={`Full cost-of-living ranking for ${roleLabel}`}
         tabIndex={-1} ref={rootRef}>
      <div className="sx-bar">
        <div className="sx-head">
          <h2 className="sx-title">Full ranking · {roleLabel}</h2>
          <button type="button" className="sx-close" onClick={onClose}>Close</button>
        </div>
        <MetroFilter metros={meta.metros} onSelect={choose} label="Find a city" />
        <div className="sx-counts">
          {steps.map(s => (
            <button key={s.n} type="button" className="sx-count" aria-pressed={count === s.n}
                    onClick={() => { setCount(s.n); setNotRanked(null) }}>{s.label}</button>
          ))}
        </div>
      </div>

      <p className="sx-basis">
        Ranks are among the {rows.length} metros shown, not nationally — a metro rises or falls
        relative to this set.
      </p>
      {notRanked && (
        <p className="sx-note">
          {shortMetro(notRanked)} has no cost-of-living index for this role, so it has no adjusted
          position and is not in the ranking.
        </p>
      )}

      <div className="sx-scroll">
        <table className="sx-table">
          <thead>
            <tr>
              <th scope="col">Metro</th>
              <th scope="col">Nominal</th>
              <th scope="col">Adjusted</th>
              <th scope="col">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.cbsa} className={r.cbsa === highlight ? 'is-hit' : undefined}
                  ref={el => { if (el) rowRefs.current.set(r.cbsa, el); else rowRefs.current.delete(r.cbsa) }}>
                <th scope="row" className="sx-metro" title={r.name}>{shortMetro(r.name)}</th>
                <td className="sx-num">
                  {r.capped && <span className="sx-cap" title="Top-coded by BLS — the true median is at least this">≥ </span>}
                  {fmtUsdCompact(r.nominal)}
                </td>
                <td className="sx-num">{fmtUsdCompact(r.adjusted)}</td>
                <td className={`sx-delta${r.delta > 0 ? ' up' : r.delta < 0 ? ' down' : ''}`}>
                  {r.delta === 0
                    ? <span aria-label="no change">—</span>
                    : <span aria-label={`${r.delta > 0 ? 'rises' : 'falls'} ${Math.abs(r.delta)} places`}>
                        {r.delta > 0 ? '▲' : '▼'}{Math.abs(r.delta)}
                      </span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
