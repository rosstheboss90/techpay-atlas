import type { EmployerIndexShard, EmployerProfileJson, EmployerSearchRow } from './employer-types'

/** Below this many filings a cell rests on a thin sample and is labelled, never hidden.
 *
 *  Deliberately NOT the same as title-types.ts's THIN_SAMPLE_FILINGS (100): a title bucket is a
 *  national aggregate over thousands of filings, whereas an employer x role x metro cell
 *  routinely has one or two. Same idea, different populations, so they must not share a value
 *  or a name. */
export const THIN_EMPLOYER_FILINGS = 5

export function decodeShard(shard: EmployerIndexShard): EmployerSearchRow[] {
  return shard.v.map(row => {
    const out: Record<string, unknown> = {}
    shard.k.forEach((col, i) => { out[col] = row[i] })
    return out as unknown as EmployerSearchRow
  })
}

export function rankRoles(profile: EmployerProfileJson): string[] {
  return Object.entries(profile.roles)
    .sort((a, b) => b[1].national.filings - a[1].national.filings || a[0].localeCompare(b[0]))
    .map(([soc]) => soc)
}

export const isThinSample = (filings: number): boolean => filings < THIN_EMPLOYER_FILINGS

/** Removes only entities the alias file explicitly marks `staffing`. An unaliased filer defaults
 *  to `direct`, which is a default and not a reviewed claim — it is never filtered on that basis,
 *  and neither is an unaliased row that somehow carries a staffing category. */
export function filterStaffing(rows: EmployerSearchRow[], exclude: boolean): EmployerSearchRow[] {
  return exclude ? rows.filter(r => !(r.aliased && r.category === 'staffing')) : rows
}
