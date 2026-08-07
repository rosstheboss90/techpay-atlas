/** The emitted employer-lens data contract, mirrored from pipeline/lib/emit-employers.ts.
 *  The site never imports from pipeline/ — these are kept in sync by hand, as with types.ts. */

export interface EmployerRoleMetro { cbsa: string; filings: number; median: number }

export interface EmployerRoleStat {
  national: { filings: number; p25: number; median: number; p75: number }
  metros: EmployerRoleMetro[]
}

export interface EmployerProfileJson {
  slug: string
  display: string
  category: 'staffing' | 'direct'
  /** False when the deterministic fallback produced this identity. An unaliased `direct` is a
   *  default, not a reviewed claim, so the UI must not render it as a badge. */
  aliased: boolean
  lcaPeriod: string
  totalFilings: number
  entities: { name: string; filings: number }[]
  roles: Record<string, EmployerRoleStat>
}

export interface EmployerHeadRow {
  slug: string
  display: string
  filings: number
  category: 'staffing' | 'direct'
  aliased: boolean
  topRole: string
}

export interface EmployerHeadJson { lcaPeriod: string; employers: EmployerHeadRow[] }

/** Positional-array encoding: `k` names the columns, `v` holds one array per filer. Keeps the
 *  full-tail index small enough to fetch on a keystroke. */
export interface EmployerIndexShard { k: string[]; v: (string | number | boolean)[][] }

/** One decoded search row — the shape components consume, head and tail alike. */
export interface EmployerSearchRow {
  slug: string
  display: string
  filings: number
  category: 'staffing' | 'direct'
  aliased: boolean
  topRole: string
  topCbsa: string
  median: number
}
