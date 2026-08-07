'use client'
import { fmtUsd } from '../lib/format'
import type { TrendsJson } from '../lib/trends-types'

/** Year-by-year figures for the selected role — nominal (as paid that year) and real (translated
 *  into base-year dollars) side by side. Both columns are always shown, never one hidden behind
 *  the page's toggle: that side-by-side view is what makes the toggle unambiguous, and hiding
 *  half the table would defeat the point of having both figures at all.
 *
 *  Years where a role has no separate BLS code (pre-2021, for the eight roles split out that
 *  year) render an explicit reason rather than a blank or a dash — a blank cell in a data table
 *  reads as "zero" or "missing due to error", not "not counted separately yet". */
export function TrendsTable({ trends, selected }: { trends: TrendsJson; selected: string }) {
  const role = trends.roles[selected]
  if (!role) return null

  return (
    <figure className="tr-table-wrap">
      <figcaption className="t-caption">
        {role.label}, year by year — as reported that year, and translated into {trends.deflator.base} dollars.
      </figcaption>
      <table className="role-table tr-table">
        <thead>
          <tr>
            <th scope="col">Year</th>
            <th scope="col">Nominal median</th>
            <th scope="col">{trends.deflator.base} dollars</th>
          </tr>
        </thead>
        <tbody>
          {trends.years.map((year, i) => {
            const nominal = role.nominal[i]
            const real = role.real[i]
            const isBase = year === trends.deflator.base
            return (
              <tr key={year} className={isBase ? 'is-base' : undefined}>
                <th scope="row">
                  {year}
                  {isBase && <span className="tr-table-base-tag"> (base year)</span>}
                </th>
                {nominal === null ? (
                  <td colSpan={2} className="tr-table-nodata">no separate BLS code</td>
                ) : (
                  <>
                    <td className="cell-num">{fmtUsd(nominal)}</td>
                    <td className="cell-num">{fmtUsd(real)}</td>
                  </>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </figure>
  )
}
