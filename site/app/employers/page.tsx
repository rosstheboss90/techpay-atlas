'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { EmployerSearch } from '../../components/EmployerSearch'
import { loadEmployerHead, loadEmployerIndex } from '../../lib/data'
import type { EmployerHeadJson } from '../../lib/employer-types'

export default function EmployersPage() {
  const [head, setHead] = useState<EmployerHeadJson | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadEmployerHead().then(setHead).catch(e => setError(String(e)))
  }, [])

  if (error) return <main className="page"><p className="load-error">Failed to load data: {error}</p></main>
  if (!head) return <main className="page"><p className="loading">Loading…</p></main>

  return (
    <main className="page">
      <header className="masthead">
        <div>
          <h1 className="t-h1">Employers</h1>
          <p className="t-lede">
            What each H-1B sponsor filed for its workers, {head.lcaPeriod}.
          </p>
        </div>
        <Link href="/" className="masthead-link">← TechPay Atlas</Link>
      </header>

      <p className="t-note">
        These are filed base-pay <strong>floors</strong> — no equity, no bonus, no signing bonus — and they
        cover H-1B sponsoring employers only, not a market-wide sample. Ranking by filing volume ranks
        sponsorship volume, not desirability: staffing and outsourcing firms dominate the top of this list,
        and are marked where known.
      </p>

      <EmployerSearch head={head.employers} loadShard={loadEmployerIndex} />
    </main>
  )
}
