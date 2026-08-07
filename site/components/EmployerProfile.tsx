'use client'
import Link from 'next/link'
import { EmployerRoleTable } from './EmployerRoleTable'
import type { EmployerProfileJson } from '../lib/employer-types'
import { employerRoleLabel, rankRoles } from '../lib/employer'

interface Props {
  profile: EmployerProfileJson
  metroNames: Record<string, string>
}

/** A staffing chip is a reviewed claim, not a default: it renders only when the alias file both
 *  matched this filer AND tagged it staffing. An unaliased row defaults to `direct` regardless of
 *  what its (unreviewed) category happens to say, so that combination must never earn a badge. */
export function EmployerProfile({ profile, metroNames }: Props) {
  const showStaffingChip = profile.aliased && profile.category === 'staffing'
  const roleOrder = rankRoles(profile)

  return (
    <>
      <header className="masthead">
        <div>
          <h1 className="t-h1 emp-name">
            {profile.display}
            {showStaffingChip && <span className="es-chip emp-chip">staffing</span>}
          </h1>
          <p className="t-lede">
            {profile.totalFilings.toLocaleString()} H-1B filings · {profile.lcaPeriod}
          </p>
        </div>
        <Link href="/employers" className="masthead-link">← All employers</Link>
      </header>

      {profile.entities.length > 1 && (
        <details className="emp-entities">
          <summary>Includes {profile.entities.length} filing entities</summary>
          <ul className="emp-entity-list">
            {profile.entities.map(e => (
              <li key={e.name}>
                <span className="emp-entity-name">{e.name}</span>
                <span className="emp-entity-filings">{e.filings.toLocaleString()} filings</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="t-note">
        These are filed base-pay <strong>floors</strong> — no equity, no bonus, no signing
        bonus — and they cover H-1B <strong>sponsors only</strong>, not a market-wide sample.
      </p>

      <div className="emp-roles">
        {roleOrder.map(soc => (
          <EmployerRoleTable key={soc} label={employerRoleLabel(soc)} stat={profile.roles[soc]!} metroNames={metroNames} />
        ))}
      </div>
    </>
  )
}
