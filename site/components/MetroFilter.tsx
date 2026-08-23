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
        <p className="mf-empty">No metros match "{query.trim()}".</p>
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
