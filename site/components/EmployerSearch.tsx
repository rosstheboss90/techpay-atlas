'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { EmployerHeadRow, EmployerIndexShard, EmployerSearchRow } from '../lib/employer-types'
import { decodeShard, filterStaffing } from '../lib/employer'

interface Props {
  head: EmployerHeadRow[]
  loadShard: (shard: string) => Promise<EmployerIndexShard>
}

const MAX_ROWS = 100

/** Same normalisation the pipeline applies to build a slug: lowercase, collapse any run of
 *  non-alphanumerics to a single hyphen, trim leading/trailing hyphens. The tail match must use
 *  this exact rule — it's comparing against slugs built the same way — or a prefix match on raw
 *  query text would miss rows the shard actually has. */
const normalizeToSlug = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/** The shard a query would live in: the first character of the trimmed, lowercased query, or
 *  `_` when that character isn't [a-z0-9] — mirrors loadEmployerIndex's own shard-key contract. */
function shardKeyFor(trimmedLower: string): string {
  const c = trimmedLower[0]
  return c && /[a-z0-9]/.test(c) ? c : '_'
}

const toRow = (h: EmployerHeadRow, tail?: EmployerSearchRow): EmployerSearchRow => ({
  ...h,
  topCbsa: tail?.topCbsa ?? '',
  median: tail?.median ?? 0,
})

export function EmployerSearch({ head, loadShard }: Props) {
  const [query, setQuery] = useState('')
  const [excludeStaffing, setExcludeStaffing] = useState(false)
  const [shardRows, setShardRows] = useState<EmployerSearchRow[]>([])

  const trimmedLower = query.trim().toLowerCase()
  const normalized = useMemo(() => normalizeToSlug(trimmedLower), [trimmedLower])
  // Only the first character drives which shard to fetch, so this key — not the full query —
  // is the effect dependency below: typing further letters within the same first character
  // never triggers a second fetch of a shard already in hand.
  const shardKey = trimmedLower ? shardKeyFor(trimmedLower) : null

  useEffect(() => {
    if (!shardKey) { setShardRows([]); return }
    let cancelled = false
    loadShard(shardKey)
      .then(shard => { if (!cancelled) setShardRows(decodeShard(shard)) })
      .catch(() => { if (!cancelled) setShardRows([]) })
    return () => { cancelled = true }
  }, [shardKey, loadShard])

  const rows = useMemo<EmployerSearchRow[]>(() => {
    let merged: EmployerSearchRow[]
    if (!trimmedLower) {
      merged = head.map(h => toRow(h))
    } else {
      const byslug = new Map<string, EmployerSearchRow>()
      // Tail hits first (shard is keyed/matched by prefix on slug)...
      for (const r of shardRows) {
        if (r.slug.startsWith(normalized)) byslug.set(r.slug, r)
      }
      // ...then head hits (substring on display) OVERWRITE — head wins on shared fields, but
      // keeps whatever topCbsa/median the shard already supplied for that slug.
      for (const h of head) {
        if (h.display.toLowerCase().includes(trimmedLower)) byslug.set(h.slug, toRow(h, byslug.get(h.slug)))
      }
      merged = Array.from(byslug.values())
    }
    return filterStaffing(merged, excludeStaffing)
      .sort((a, b) => b.filings - a.filings)
      .slice(0, MAX_ROWS)
  }, [head, shardRows, trimmedLower, normalized, excludeStaffing])

  return (
    <div className="employer-search">
      <div className="es-controls">
        <input type="search" className="es-input" placeholder="Search employers…" value={query}
               aria-label="Search employers" onChange={e => setQuery(e.target.value)} />
        <label className="es-toggle">
          <input type="checkbox" checked={excludeStaffing}
                 onChange={e => setExcludeStaffing(e.target.checked)} />
          Hide known staffing firms
        </label>
      </div>
      <p className="es-note">
        The top 500 filers above search instantly. Beyond that, matches are from the{' '}
        <strong>start of</strong> the employer's name, not anywhere within it.
      </p>
      <ul className="es-rows">
        {rows.map(r => (
          <li key={r.slug} className="es-row">
            <Link href={`/employers/${r.slug}`} className="es-name">{r.display}</Link>
            <span className="es-filings">{r.filings.toLocaleString()} filings</span>
            {r.aliased && r.category === 'staffing' && <span className="es-chip">staffing</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
