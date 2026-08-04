'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Meta } from '../lib/types'
import type { TitlesJson } from '../lib/title-types'
import { loadTitles } from '../lib/data'
import { TitleBucketRow, selectStats } from './TitleBucketRow'

interface Props {
  meta: Meta
  cbsa: string | null
  adjusted: boolean
  onSelectRole: (soc: string) => void
}

export function TitleLens({ meta, cbsa, adjusted, onSelectRole }: Props) {
  const rootRef = useRef<HTMLElement>(null)
  const fetchedRef = useRef(false)
  const [titles, setTitles] = useState<TitlesJson | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [family, setFamily] = useState<string | null>(null)

  // Lazy: fetch titles.json only once the section is (about to be) on screen. jsdom has no
  // IntersectionObserver -> fall back to an eager fetch on mount (exercised by the tests).
  useEffect(() => {
    const fetchTitles = () => {
      if (fetchedRef.current) return
      fetchedRef.current = true
      loadTitles()
        .then(t => { setTitles(t); setFamily(t.families[0]?.key ?? null) })
        .catch(e => setError(String(e)))
    }
    if (typeof IntersectionObserver === 'undefined') { fetchTitles(); return }
    const el = rootRef.current
    if (!el) { fetchTitles(); return }
    const obs = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { fetchTitles(); obs.disconnect() }
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const metro = cbsa ? meta.metros.find(m => m.cbsa === cbsa) ?? null : null
  const metroShort = metro ? metro.name.split(',')[0] : null
  const activeFamily = titles?.families.find(f => f.key === family) ?? null

  // Shared band domain across the visible family: every row's currently-selected stat
  // (national or metro) plus every tier's stats, so bands stay comparable and the
  // seniority disclosure never draws outside the axis the collapsed row implied.
  const domain = useMemo<[number, number]>(() => {
    if (!activeFamily) return [0, 1]
    const vals: number[] = []
    for (const b of activeFamily.buckets) {
      const { stats } = selectStats(b, cbsa)
      vals.push(stats.p25, stats.p75)
      for (const t of Object.values(b.tiers)) if (t) vals.push(t.p25, t.p75)
    }
    return vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1]
  }, [activeFamily, cbsa])

  return (
    <section className="title-lens" ref={rootRef}>
      <header className="tl-head">
        <h2>Job titles, not just SOC codes</h2>
        {titles && (
          <p className="tl-note">
            H-1B filings, {titles.lcaPeriod} · wages are midpoints of filed ranges — treat as floors, not offers.
          </p>
        )}
      </header>

      {error ? (
        <p className="tl-error">Couldn't load title data — try reloading the page.</p>
      ) : !titles ? (
        <p className="tl-note">Loading title data…</p>
      ) : (
        <>
          <div className="tl-tabs">
            {titles.families.map(f => (
              <button key={f.key} type="button" className="tl-tab"
                      aria-pressed={family === f.key} onClick={() => setFamily(f.key)}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="tl-rows">
            {activeFamily?.buckets.map(b => (
              <TitleBucketRow key={b.key} bucket={b} domain={domain} cbsa={cbsa}
                              metroShort={metroShort} rpp={metro?.rpp ?? null} adjusted={adjusted}
                              roles={meta.roles} onSelectRole={onSelectRole} />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
