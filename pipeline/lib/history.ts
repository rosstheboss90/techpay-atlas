import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Pct } from './parse-oews'

const here = path.dirname(fileURLToPath(import.meta.url))
export const HISTORY_DIR = path.join(here, '..', '..', 'data', 'history')

/** One role's national percentile band for a single OEWS vintage.
 *
 *  Defined here rather than in the parser because this module owns the archive FORMAT — the
 *  parser is one producer of it, and inverting that would make the on-disk contract depend on
 *  a parsing detail. */
export interface NationalRoleRecord {
  emp: number | null
  p10: number | null; p25: number | null; p50: number | null; p75: number | null; p90: number | null
  capped: Pct[]
}

export interface NationalArchive {
  year: number
  topCode: number
  source: string
  roles: Record<string, NationalRoleRecord>
}

export const archiveFilename = (year: number): string => `oews-nat-${year}.json`
export const archivePath = (year: number): string => path.join(HISTORY_DIR, archiveFilename(year))

/** History is append-only: a rerun must never silently rewrite a vintage that is already
 *  committed. Overwriting requires an explicit --force. */
export function assertWritable(year: number, opts: { exists: boolean; force: boolean }): void {
  if (opts.exists && !opts.force) {
    throw new Error(
      `data/history/${archiveFilename(year)} already exists — history is append-only. ` +
      `Pass --force to overwrite deliberately.`,
    )
  }
}

/** The archive is self-describing: it carries the vintage's own top code so a future reader
 *  never has to infer it from whatever the code's current constant happens to be. */
export function buildNationalArchive(
  year: number,
  topCode: number,
  source: string,
  roles: Record<string, NationalRoleRecord>,
): NationalArchive {
  if (Object.keys(roles).length === 0) {
    throw new Error(`refusing to archive vintage ${year} with 0 roles — the parse produced nothing`)
  }
  return { year, topCode, source, roles }
}
