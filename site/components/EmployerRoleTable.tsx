import type { EmployerRoleStat } from '../lib/employer-types'
import { isThinSample } from '../lib/employer'
import { fmtUsd } from '../lib/format'

interface Props {
  label: string
  stat: EmployerRoleStat
  metroNames: Record<string, string>
}

/** One role's national summary plus its metro breakdown. Thin cells (below
 *  THIN_EMPLOYER_FILINGS) are always labelled, never dropped — a metro row with two filings is
 *  still real data, just noisy, and hiding it would misrepresent the sample as cleaner than it is. */
export function EmployerRoleTable({ label, stat, metroNames }: Props) {
  const thinNational = isThinSample(stat.national.filings)

  return (
    <section className="emp-role">
      <h3 className="emp-role-title">
        {label}
        {thinNational && (
          <span className="tl-chip tl-chip-thin"
                title={`Only ${stat.national.filings.toLocaleString()} filings nationwide — figures are rough.`}>
            thin sample
          </span>
        )}
      </h3>
      <p className="emp-role-summary">
        {stat.national.filings.toLocaleString()} filings nationally · {fmtUsd(stat.national.p25)}–{fmtUsd(stat.national.p75)} (25th–75th) ·{' '}
        {fmtUsd(stat.national.median)} median
      </p>

      <table className="role-table emp-metro-table">
        <thead>
          <tr>
            <th scope="col">Metro</th>
            <th scope="col">Filings</th>
            <th scope="col">Median filed wage</th>
          </tr>
        </thead>
        <tbody>
          {stat.metros.map(m => {
            const thin = isThinSample(m.filings)
            return (
              <tr key={m.cbsa}>
                <th scope="row">{metroNames[m.cbsa] ?? m.cbsa}</th>
                <td className="cell-num">
                  {m.filings.toLocaleString()}
                  {thin && (
                    <span className="tl-chip tl-chip-thin"
                          title={`Only ${m.filings.toLocaleString()} filings in this metro — figures are rough.`}>
                      thin sample
                    </span>
                  )}
                </td>
                <td className="cell-num">{fmtUsd(m.median)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
