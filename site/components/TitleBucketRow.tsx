import { useState } from 'react'
import type { Role } from '../lib/types'
import type { TitleBucket, TitleStats } from '../lib/title-types'
import { TIER_ORDER, THIN_SAMPLE_FILINGS } from '../lib/title-types'
import { adjust } from '../lib/derive'
import { fmtNum, fmtUsd } from '../lib/format'

interface Props {
  bucket: TitleBucket
  domain: [number, number]
  cbsa: string | null
  metroShort: string | null
  rpp: number | null
  adjusted: boolean
  roles: Role[]
  onSelectRole: (soc: string) => void
}

/** Fixed categorical slot -> CSS token (light/dark values declared in globals.css). */
const SOC_COLORS = ['var(--soc-1)', 'var(--soc-2)', 'var(--soc-3)', 'var(--soc-4)']

/** Metro stats if this bucket has that metro (>= 8 filings, per pipeline gate), else national. */
export function selectStats(bucket: TitleBucket, cbsa: string | null): { stats: TitleStats; isMetro: boolean } {
  if (cbsa && bucket.metros[cbsa]) return { stats: bucket.metros[cbsa], isMetro: true }
  return { stats: bucket.national, isMetro: false }
}

function roleLabel(soc: string, roles: Role[]): string {
  if (soc === 'other') return 'Other'
  return roles.find(r => r.soc === soc)?.short ?? soc
}

function roleFullLabel(soc: string, roles: Role[]): string {
  if (soc === 'other') return 'Other'
  return roles.find(r => r.soc === soc)?.label ?? soc
}

/** Thin p25-median-p75 band, same domain-mapping approach as PercentileBand.
 *  The viewBox lets CSS size the band to the row (it is the headline mark, not a
 *  sparkline); `width` is the coordinate space, not a hard render width. */
function Band({ stats, rpp, adjusted, domain, width = 560 }: { stats: TitleStats; rpp: number | null; adjusted: boolean; domain: [number, number]; width?: number }) {
  const h = 10
  const x = (v: number) => Math.max(0, Math.min(width, ((v - domain[0]) / (domain[1] - domain[0] || 1)) * width))
  const p25 = adjust(stats.p25, rpp, adjusted)
  const p75 = adjust(stats.p75, rpp, adjusted)
  const median = adjust(stats.median, rpp, adjusted)
  const label = p25 != null && p75 != null ? `25th to 75th percentile: ${fmtUsd(p25)} to ${fmtUsd(p75)}` : 'pay range not available'
  return (
    <svg viewBox={`0 0 ${width} ${h}`} width={width} height={h} preserveAspectRatio="none"
         className="tl-band" role="img" aria-label={label}>
      {p25 != null && p75 != null && <rect x={x(p25)} y={2} width={x(p75) - x(p25)} height={6} rx={2} className="tl-band-inner" />}
      {median != null && <line x1={x(median)} x2={x(median)} y1={0} y2={h} className="tl-band-median" />}
    </svg>
  )
}

export function TitleBucketRow({ bucket, domain, cbsa, metroShort, rpp, adjusted, roles, onSelectRole }: Props) {
  const [tiersOpen, setTiersOpen] = useState(false)
  const [empOpen, setEmpOpen] = useState(false)
  const { stats, isMetro } = selectStats(bucket, cbsa)
  const canAdjust = isMetro && rpp != null
  const adj = adjusted && canAdjust
  const chip = isMetro ? `in ${metroShort}` : 'national'
  const tierEntries = TIER_ORDER.filter(t => bucket.tiers[t.key])
  // Flag on the national count regardless of which metro is selected — a thin national bucket is
  // thin everywhere, and metro rows only exist above the 8-filing gate anyway.
  const thin = bucket.national.filings < THIN_SAMPLE_FILINGS

  return (
    <div className="tl-row">
      <div className="tl-row-head">
        <span className="tl-title">{bucket.label}</span>
        <span className="tl-chip">{chip}</span>
        {thin && (
          <span className="tl-chip tl-chip-thin"
                title={`Only ${fmtNum(bucket.national.filings)} filings nationwide — percentiles are rough.`}>
            thin sample
          </span>
        )}
        <span className="tl-filings">{fmtNum(stats.filings)} filings</span>
      </div>
      <div className="tl-row-body">
        <Band stats={stats} rpp={isMetro ? rpp : null} adjusted={adj} domain={domain} />
        <span className="tl-median">{fmtUsd(adjust(stats.median, isMetro ? rpp : null, adj))}{adj ? ' (adj.)' : ''}</span>
      </div>

      <div className="tl-mix" role="group" aria-label={`${bucket.label} SOC conflation`}>
        {bucket.socMix.map((seg, i) => {
          const inRegistry = seg.soc !== 'other' && roles.some(r => r.soc === seg.soc)
          const pct = `${Math.round(seg.share * 100)}%`
          const text = `filed under ${roleFullLabel(seg.soc, roles)} ${pct}`
          const color = seg.soc === 'other' ? 'var(--line)' : SOC_COLORS[i] ?? 'var(--line)'
          const style = { width: `${seg.share * 100}%`, background: color }
          const className = inRegistry ? 'is-clickable' : undefined
          return inRegistry ? (
            <i key={seg.soc + i} style={style} title={text} aria-label={text} className={className}
               tabIndex={0} role="button"
               onClick={() => onSelectRole(seg.soc)}
               onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectRole(seg.soc) } }} />
          ) : (
            <i key={seg.soc + i} style={style} title={text} aria-label={text} className={className} role="img" />
          )
        })}
      </div>
      <div className="tl-legend">
        {bucket.socMix.map((seg, i) => (
          <span key={seg.soc + i} className="tl-chip-legend">
            <i style={{ background: seg.soc === 'other' ? 'var(--line)' : SOC_COLORS[i] ?? 'var(--line)' }} />
            {roleLabel(seg.soc, roles)}
          </span>
        ))}
      </div>

      <div className="tl-disclosures">
      {tierEntries.length > 0 && (
        <div className="tl-tiers">
          <button type="button" className="tl-tiers-toggle" aria-expanded={tiersOpen}
                  onClick={() => setTiersOpen(o => !o)}>
            Seniority
          </button>
          {tiersOpen && tierEntries.map(t => {
            const ts = bucket.tiers[t.key]!
            return (
              <div key={t.key} className="tl-tier-row">
                <span className="tl-tier-label">{t.label}</span>
                <span className="tl-chip tl-chip-muted">national</span>
                <Band stats={ts} rpp={null} adjusted={false} domain={domain} />
                <span className="tl-median">{fmtUsd(ts.median)}</span>
                <span className="tl-filings">{fmtNum(ts.filings)} filings</span>
              </div>
            )
          })}
        </div>
      )}

      {bucket.topEmployers.length > 0 && (
        <div className="tl-emp">
          <button type="button" className="tl-tiers-toggle" aria-expanded={empOpen}
                  onClick={() => setEmpOpen(o => !o)}>
            Top employers
          </button>
          {empOpen && (
            <>
              <ol className="tl-emp-list">
                {bucket.topEmployers.map((e, i) => (
                  <li key={e.name + i}>
                    <span className="tl-emp-name">{e.name}</span>
                    <span className="tl-emp-facts">{fmtUsd(e.median)} · {fmtNum(e.filings)} filings</span>
                  </li>
                ))}
              </ol>
              <p className="tl-emp-note">National medians of filed wages — never cost-of-living adjusted.</p>
            </>
          )}
        </div>
      )}
      </div>
    </div>
  )
}
