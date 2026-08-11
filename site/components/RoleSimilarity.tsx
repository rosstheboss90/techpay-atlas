'use client'
import { useMemo } from 'react'
import type { Meta, Salaries } from '../lib/types'
import { fmtUsd } from '../lib/format'
import { similarByPay } from '../lib/role-similarity'

interface Props {
  meta: Meta
  salaries: Salaries
  soc: string
  onSelectRole: (soc: string) => void
}

/** Phrase the other role's pay relative to the anchor, from the median anchor/other ratio. */
function directionText(ratio: number): string {
  const rel = 1 / ratio - 1 // other relative to anchor
  const pct = Math.round(Math.abs(rel) * 100)
  if (pct < 2) return 'about the same pay'
  return rel > 0 ? `pays ~${pct}% more` : `pays ~${pct}% less`
}

export function RoleSimilarity({ meta, salaries, soc, onSelectRole }: Props) {
  const anchorLabel = meta.roles.find(r => r.soc === soc)?.label ?? soc
  const sims = useMemo(() => similarByPay(meta, salaries, soc), [meta, salaries, soc])

  return (
    <section className="rsim" aria-labelledby="rsim-h">
      <header className="rsim-head">
        <h2 id="rsim-h">What else could you be?</h2>
        <p className="rsim-note">
          Roles ranked by how interchangeably they’re paid with <strong>{anchorLabel}</strong> across
          metros — a within-metro pay ratio, so it’s the same with or without the cost-of-living toggle.
        </p>
      </header>

      {sims.length === 0 ? (
        <p className="rsim-empty">Not enough overlap to compare this role.</p>
      ) : (
        <ol className="rsim-list">
          {sims.map(s => {
            const within = Math.round((1 - s.overlap) * 100)
            return (
              <li key={s.soc} className="rsim-row">
                <button type="button" className="rsim-name" onClick={() => onSelectRole(s.soc)}>{s.label}</button>
                <span className="rsim-bar" aria-hidden="true"><i style={{ width: `${Math.round(s.overlap * 100)}%` }} /></span>
                <span className="rsim-fact">within {within}% · {directionText(s.ratio)}</span>
                <span className="rsim-med">{fmtUsd(Math.round(s.repMedian))}</span>
                {s.thin && <span className="rsim-chip" title={`Only ${s.shared} metros overlap`}>thin · {s.shared} metros</span>}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
