'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { loadMeta, loadSalaries, loadTitles } from '../../lib/data'
import type { Meta, Salaries } from '../../lib/types'
import type { TitlesJson } from '../../lib/title-types'
import { slopeRows } from '../../lib/slopegraph'
import { similarByPay } from '../../lib/role-similarity'
import { fmtUsd, fmtUsdCompact } from '../../lib/format'
import './about.css'

const HERO_ROLE = '15-1252' // Software Developers — the emblematic role for the live figures
// Primary city only ("San Jose-Sunnyvale-Santa Clara, CA" -> "San Jose") so slopegraph labels fit.
const cityOf = (name: string) => name.split(',')[0].split(/[-–]/)[0].trim()

export default function About() {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [salaries, setSalaries] = useState<Salaries | null>(null)
  const [titles, setTitles] = useState<TitlesJson | null>(null)

  useEffect(() => {
    Promise.all([loadMeta(), loadSalaries(), loadTitles()])
      .then(([m, s, t]) => { setMeta(m); setSalaries(s); setTitles(t) })
      .catch(() => { /* figures fall back to their loading note; the prose still reads */ })
  }, [])

  const anchorLabel = meta?.roles.find(r => r.soc === HERO_ROLE)?.label ?? 'Software Developers'
  const shortOf = (soc: string) => meta?.roles.find(r => r.soc === soc)?.short ?? soc
  const slope = useMemo(() => (meta && salaries ? slopeRows(meta.metros, salaries, HERO_ROLE, 8) : null), [meta, salaries])
  const sims = useMemo(() => (meta && salaries ? similarByPay(meta, salaries, HERO_ROLE) : null), [meta, salaries])
  const conf = useMemo(() => {
    const pm = titles?.families.find(f => f.key === 'pm')
    const tpm = pm?.buckets.find(b => b.key === 'tpm')
    const tproj = pm?.buckets.find(b => b.key === 'techProjectMgr')
    return tpm && tproj ? { tpm, tproj } : null
  }, [titles])

  return (
    <article className="ab-root">
      <nav className="ab-top">
        <Link href="/" className="ab-back">← TechPay Atlas</Link>
        <span className="ab-wordmark">INTENT &amp; FINDINGS</span>
      </nav>

      <header className="ab-hero">
        <div className="ab-grid" aria-hidden="true" />
        <div className="ab-hero-inner">
          <p className="ab-eyebrow">A field guide to the data</p>
          <h1>The salary the statistics <span className="ab-flip">round away</span>.</h1>
          <p className="ab-lede">
            The government already publishes what US tech jobs pay. It’s authoritative, and free — and it quietly
            flattens three things that decide whether an offer is actually good: <em>where</em> you’d earn it,
            <em> what</em> the job is really called, and <em>who</em> paid it. This atlas rebuilds the picture from
            the same public files and keeps that texture instead of the summary.
          </p>
          <div className="ab-meta">
            <span><b>{meta ? meta.metros.length : '393'}</b> metros</span>
            <span><b>{meta ? meta.roles.length : '21'}</b> occupations</span>
            <span><b>~542k</b> H-1B filings</span>
            <span><b>5</b> public sources</span>
            <span><b>0</b> backends</span>
          </div>
        </div>
      </header>

      {/* ---- INTENT ---- */}
      <section className="ab-section">
        <div className="ab-measure">
          <p className="ab-eyebrow">The intent</p>
          <h2>Start from the public record — then refuse to round it off.</h2>
          <p>
            The Bureau of Labor Statistics reports wage percentiles for nearly every occupation in nearly every
            metro. It’s the backbone of any honest answer about pay. But a summary is lossy by construction, and this
            one loses in three specific places — so the atlas re-derives the same picture from the same raw inputs and
            turns those losses into things you can see.
          </p>
        </div>
        <div className="ab-losses">
          <div className="ab-loss">
            <div className="ab-k">LOSS 01 — WHERE</div>
            <h3>Nominal dollars</h3>
            <p>A $180,000 offer isn’t one number. In San Jose it buys a different life than in Columbus; the official tables report it the same either way.</p>
          </div>
          <div className="ab-loss">
            <div className="ab-k">LOSS 02 — WHAT</div>
            <h3>Shared codes</h3>
            <p>Hundreds of distinct jobs are filed under a handful of occupation codes. The title that describes your actual work is nowhere in the table.</p>
          </div>
          <div className="ab-loss">
            <div className="ab-k">LOSS 03 — WHO</div>
            <h3>No employers</h3>
            <p>The summary never names who paid what. The one public dataset that does — H-1B disclosures — is left on the floor.</p>
          </div>
        </div>
      </section>

      {/* ---- FINDINGS ---- */}
      <section className="ab-section">
        <div className="ab-measure">
          <p className="ab-eyebrow">What the reconstruction shows</p>
          <h2>Three things the summary hides — drawn live from the shipped data.</h2>
          <p className="ab-soft">
            Every figure below is computed in your browser from the same JSON the tool runs on, for{' '}
            <strong>{anchorLabel}</strong> where a role is needed. Nothing here is mocked.
          </p>
        </div>

        {/* FIG 1 — rank flip */}
        <div className="ab-fig">
          <div className="ab-fig-head"><span className="ab-fno">FIG. 1</span><h3>Cost of living flips the ranking.</h3></div>
          <div className="ab-fig-body ab-scroll">{slope ? <SlopeFig rows={slope} /> : <div className="ab-placeholder">computing from salaries.json…</div>}</div>
          <p className="ab-fig-note">
            The nominal leaderboard is really a map of expensive cities. Re-express the same {anchorLabel} medians in
            local dollars and the lines cross — pricey coastal metros slide down (rust) while lower-cost metros climb
            (blue). <span className="ab-tag">live data</span> the top {slope?.length ?? 8} metros by nominal pay.
          </p>
        </div>

        {/* FIG 2 — one code two jobs */}
        <div className="ab-fig">
          <div className="ab-fig-head"><span className="ab-fno">FIG. 2</span><h3>One occupation code, two different jobs.</h3></div>
          <div className="ab-fig-body ab-scroll">{conf ? <ConflationFig tpm={conf.tpm.national.median} tproj={conf.tproj.national.median} /> : <div className="ab-placeholder">computing from titles.json…</div>}</div>
          <p className="ab-fig-note">
            A Technical <em>Program</em> Manager and a Technical <em>Project</em> Manager are near-homophones filed
            under overlapping official codes — yet the raw H-1B filings put a{' '}
            {conf ? <strong className="ab-num">{fmtUsd(Math.round(conf.tpm.national.median - conf.tproj.national.median))}</strong> : '—'} gap
            between their medians. <span className="ab-tag">live data</span> from the title lens; a drafted title↔SOC
            matrix generalizes it across the registry.
          </p>
        </div>

        {/* FIG 3 — similarity ladder */}
        <div className="ab-fig">
          <div className="ab-fig-head"><span className="ab-fno">FIG. 3</span><h3>Which roles are paid interchangeably.</h3></div>
          <div className="ab-fig-body ab-scroll">{sims ? <SimilarityFig sims={sims} shortOf={shortOf} /> : <div className="ab-placeholder">computing from salaries.json…</div>}</div>
          <p className="ab-fig-note">
            How interchangeably each role is paid with {anchorLabel} across metros (1.00 = identical everywhere).
            Because it’s a <em>within-metro</em> ratio, cost of living cancels out entirely.
            <span className="ab-tag" style={{ marginLeft: 6 }}>live data</span> nearest four, and the far end.
          </p>
        </div>
      </section>

      {/* ---- METHOD ---- */}
      <section className="ab-section">
        <div className="ab-measure">
          <p className="ab-eyebrow">The method</p>
          <h2>The honesty is a design rule, not a footnote.</h2>
          <p>
            Most of the work isn’t drawing charts — it’s deciding what <em>not</em> to show, and refusing to let a
            clean-looking number launder away what the data doesn’t know. Four invariants are wired into the pipeline:
          </p>
          <ul className="ab-rules">
            <li><span className="ab-mk">01</span><span><b>Suppressed stays suppressed.</b> <span className="ab-soft">Where the source withholds a cell, the atlas leaves the gap — it never interpolates over it.</span></span></li>
            <li><span className="ab-mk">02</span><span><b>Small samples are labeled, never hidden.</b> <span className="ab-soft">A thin bucket carries a chip that says so, so “few data points” can’t masquerade as a trend.</span></span></li>
            <li><span className="ab-mk">03</span><span><b>Ranges are midpointed and marked.</b> <span className="ab-soft">H-1B wages filed as a band become a midpoint flagged as a floor, not quoted as a salary.</span></span></li>
            <li><span className="ab-mk">04</span><span><b>Every number cites its vintage.</b> <span className="ab-soft">BLS 2025, RPP 2024, H-1B FY2025 — the footer always says which year each figure came from.</span></span></li>
          </ul>
          <p className="ab-soft" style={{ marginTop: 22 }}>
            And the pipeline <em>fails loudly</em>: a dozen data-quality tripwires halt a run rather than emit a
            quietly-wrong file, and stale output is deleted only after every check passes — so a bad run can never
            overwrite the last good one.
          </p>
        </div>
      </section>

      {/* ---- BUILD ---- */}
      <section className="ab-section">
        <div className="ab-measure">
          <p className="ab-eyebrow">How it’s made</p>
          <h2>Raw public files in; a static, backend-free atlas out.</h2>
          <p>
            An offline TypeScript pipeline parses the raw government files, validates them against those tripwires,
            and emits compact JSON. A static site renders it with D3 — no server, no tracking, no database. Plain
            files that happen to answer questions the official tables can’t.
          </p>
          <div className="ab-flow">
            <span className="ab-node">5 public sources</span><span className="ab-arr">→</span>
            <span className="ab-node">parse · validate · emit</span><span className="ab-arr">→</span>
            <span className="ab-node">compact JSON</span><span className="ab-arr">→</span>
            <span className="ab-node">static D3 site</span>
          </div>
          <p className="ab-soft" style={{ marginTop: 24 }}>Half a dozen lenses on one dataset:</p>
          <div className="ab-lenses">
            <span className="ab-lens">Cost-of-living map</span>
            <span className="ab-lens">Metro drill-down</span>
            <span className="ab-lens">Title lens</span>
            <span className="ab-lens">Rank-flip slopegraph</span>
            <span className="ab-lens">Head-to-head compare</span>
            <span className="ab-lens">Role-similarity finder</span>
            <span className="ab-lens wip">Title↔SOC conflation matrix — in progress</span>
          </div>
        </div>
      </section>

      {/* ---- CODA ---- */}
      <section className="ab-section">
        <div className="ab-measure">
          <p className="ab-eyebrow">The through-line</p>
          <h2>Official data tells you the number. This tells you what the number leaves out.</h2>
          <p>
            Where you’d earn it, what the job is really called, and who actually paid — recovered from the same public
            record, with the uncertainty left in plain sight. That’s the whole intent; every finding above is just
            that intent, made visible.
          </p>
          <Link className="ab-cta" href="/">Open the live atlas →</Link>
        </div>
      </section>

      <footer className="ab-foot">
        <div className="ab-measure">
          <p>
            Sources — BLS OEWS (May 2025) · DOL H-1B LCA disclosures (FY2025) · BEA Regional Price Parities (2024) ·
            HUD ZIP–CBSA crosswalk (2026 Q1) · Census Gazetteer (2025). Built entirely on public government data.
          </p>
        </div>
      </footer>
    </article>
  )
}

/* ---------- live figures ---------- */

function SlopeFig({ rows }: { rows: ReturnType<typeof slopeRows> }) {
  const W = 560, LEFT = 190, RIGHT = 350, PAD = 30, GAP = 22, BOTTOM = 14
  const H = PAD + (rows.length - 1) * GAP + BOTTOM
  const y = (rank: number) => PAD + (rank - 1) * GAP
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Rank flip: ${rows.length} metros reorder when pay is adjusted for cost of living.`}>
      <text x={LEFT} y={16} textAnchor="end" className="ab-lab">NOMINAL $</text>
      <text x={RIGHT} y={16} textAnchor="start" className="ab-lab">ADJUSTED $</text>
      <line x1={LEFT} y1={PAD - 8} x2={LEFT} y2={H - 6} className="ab-ax" />
      <line x1={RIGHT} y1={PAD - 8} x2={RIGHT} y2={H - 6} className="ab-ax" />
      {rows.map(r => {
        const y1 = y(r.nominalRank), y2 = y(r.adjustedRank)
        const cls = r.delta > 0 ? 'ab-navy' : r.delta < 0 ? 'ab-rust' : 'ab-mut'
        const stroke = r.delta > 0 ? 'ab-navy-s' : r.delta < 0 ? 'ab-rust-s' : 'ab-mut-s'
        const fill = r.delta > 0 ? 'ab-navy-f' : r.delta < 0 ? 'ab-rust-f' : ''
        return (
          <g key={r.cbsa}>
            <line x1={LEFT} y1={y1} x2={RIGHT} y2={y2} className={stroke} strokeWidth={Math.abs(r.delta) >= 3 ? 2.2 : 1.4} opacity={cls === 'ab-mut' ? 0.7 : 1} />
            <circle cx={LEFT} cy={y1} r={3} className={fill || undefined} fill={fill ? undefined : 'var(--ink-muted)'} />
            <circle cx={RIGHT} cy={y2} r={3} className={fill || undefined} fill={fill ? undefined : 'var(--ink-muted)'} />
            <text x={LEFT - 10} y={y1} dy="0.32em" textAnchor="end" className="ab-val">{cityOf(r.name)} · {fmtUsdCompact(r.nominal)}</text>
            <text x={RIGHT + 10} y={y2} dy="0.32em" textAnchor="start" className="ab-val">{fmtUsdCompact(r.adjusted)} · {cityOf(r.name)}</text>
          </g>
        )
      })}
    </svg>
  )
}

function ConflationFig({ tpm, tproj }: { tpm: number; tproj: number }) {
  const W = 560, BARW = 560, max = Math.max(tpm, tproj) || 1
  const w = (v: number) => (v / max) * (BARW - 120)
  return (
    <svg viewBox={`0 0 ${W} 150`} role="img" aria-label={`Technical Program Manager median ${fmtUsd(tpm)} versus Technical Project Manager median ${fmtUsd(tproj)}.`}>
      <text x={0} y={16} className="ab-lab">MEDIAN FILED PAY, BY REAL TITLE →</text>
      <text x={0} y={50} className="ab-val">Technical Program Manager</text>
      <rect x={0} y={58} width={BARW - 120} height={14} rx={3} className="ab-track" />
      <rect x={0} y={58} width={w(tpm)} height={14} rx={3} className="ab-navy-f" />
      <text x={w(tpm) + 10} y={69} className="ab-val" fontWeight={600}>{fmtUsd(Math.round(tpm))}</text>
      <text x={0} y={104} className="ab-val">Technical Project Manager</text>
      <rect x={0} y={112} width={BARW - 120} height={14} rx={3} className="ab-track" />
      <rect x={0} y={112} width={w(tproj)} height={14} rx={3} className="ab-rust-f" />
      <text x={w(tproj) + 10} y={123} className="ab-val" fontWeight={600}>{fmtUsd(Math.round(tproj))}</text>
      <text x={BARW} y={146} textAnchor="end" className="ab-lab" fill="var(--rust)">a {fmtUsd(Math.round(tpm - tproj))} gap the shared code erases</text>
    </svg>
  )
}

function SimilarityFig({ sims, shortOf }: { sims: ReturnType<typeof similarByPay>; shortOf: (soc: string) => string }) {
  const split = sims.length > 6           // enough roles to show "nearest four … the far end"
  const rows = split ? [...sims.slice(0, 4), ...sims.slice(-2)] : sims
  const boundary = split ? 4 : rows.length
  const W = 560, X = 150, BARW = 350
  const rowY = (i: number) => 30 + i * 26 + (split && i >= boundary ? 16 : 0)
  const H = rowY(rows.length - 1) + 24
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Pay overlap of other roles with the anchor role.">
      <text x={0} y={16} className="ab-lab">PAY OVERLAP · 1.00 = PAID IDENTICALLY ACROSS METROS</text>
      {rows.map((s, i) => {
        const y = rowY(i)
        const near = i < boundary
        return (
          <g key={s.soc}>
            <text x={0} y={y + 10} className="ab-val">{shortOf(s.soc)}</text>
            <rect x={X} y={y} width={BARW} height={12} rx={3} className="ab-track" />
            <rect x={X} y={y} width={Math.max(2, s.overlap * BARW)} height={12} rx={3} className={near ? 'ab-navy-f' : 'ab-rust-f'} />
            <text x={X + BARW + 8} y={y + 10} className="ab-val" fontWeight={600}>{s.overlap.toFixed(2)}</text>
          </g>
        )
      })}
      {split && <>
        <line x1={X} y1={rowY(boundary) - 12} x2={X + BARW} y2={rowY(boundary) - 12} className="ab-ax" strokeDasharray="2 4" />
        <text x={X} y={rowY(boundary) - 16} className="ab-lab">…the far end…</text>
      </>}
    </svg>
  )
}
