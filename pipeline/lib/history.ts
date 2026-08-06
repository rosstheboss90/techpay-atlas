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

export interface ImplausibleJump {
  soc: string; from: number; to: number; fromValue: number; toValue: number; change: number
}

/** Nominal year-over-year median moves larger than `threshold` (fraction, e.g. 0.4 = 40%).
 *
 *  This is a tripwire, not a statistic: a wrong vintage top code or a misaligned deflator
 *  produces exactly this signature, and without it the result is a plausible-looking wrong chart
 *  rather than an error. Roles absent from either vintage are skipped — a young SOC code appearing
 *  for the first time is not a jump. */
export function findImplausibleJumps(
  vintages: readonly NationalArchive[],
  threshold: number,
): ImplausibleJump[] {
  const sorted = [...vintages].sort((a, b) => a.year - b.year)
  const out: ImplausibleJump[] = []
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1], cur = sorted[i]
    for (const [soc, curRole] of Object.entries(cur.roles)) {
      const prevRole = prev.roles[soc]
      if (!prevRole) continue
      const a = prevRole.p50, b = curRole.p50
      if (a === null || b === null || a === 0) continue
      const change = (b - a) / a
      if (Math.abs(change) > threshold) {
        out.push({ soc, from: prev.year, to: cur.year, fromValue: a, toValue: b, change })
      }
    }
  }
  return out
}
