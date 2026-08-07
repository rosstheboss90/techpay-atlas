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

/** SOC -> display label, mirrored from pipeline/lib/soc.ts's registry (the site never imports
 *  from pipeline/, same rule as employer-types.ts). meta.json also carries these as data
 *  (`Role[]`, fetched at runtime via loadMeta()), but that requires a page-level fetch; this
 *  profile route needs the label synchronously inside a presentational component, so it gets its
 *  own copy rather than threading a `roles` prop through just for this. Keep in sync by hand. */
export const EMPLOYER_ROLE_LABELS: Record<string, string> = {
  '11-3021': 'Computer & Information Systems Managers',
  '13-1082': 'Project Management Specialists',
  '15-1211': 'Computer Systems Analysts',
  '15-1212': 'Information Security Analysts',
  '15-1221': 'Computer & Information Research Scientists',
  '15-1231': 'Computer Network Support Specialists',
  '15-1232': 'Computer User Support Specialists',
  '15-1241': 'Computer Network Architects',
  '15-1242': 'Database Administrators',
  '15-1243': 'Database Architects',
  '15-1244': 'Network & Computer Systems Administrators',
  '15-1251': 'Computer Programmers',
  '15-1252': 'Software Developers',
  '15-1253': 'Software QA Analysts & Testers',
  '15-1254': 'Web Developers',
  '15-1255': 'Web & Digital Interface Designers',
  '15-1299': 'Computer Occupations, All Other',
  '15-2031': 'Operations Research Analysts',
  '15-2041': 'Statisticians',
  '15-2051': 'Data Scientists',
  '41-9031': 'Sales Engineers',
}

export const employerRoleLabel = (soc: string): string => EMPLOYER_ROLE_LABELS[soc] ?? soc

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
