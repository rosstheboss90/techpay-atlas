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

const PCTS: readonly Pct[] = ['p10', 'p25', 'p50', 'p75', 'p90']

export interface ImplausibleJump {
  soc: string; pct: Pct; from: number; to: number; fromValue: number; toValue: number; change: number
}

/** Nominal year-over-year moves, on any percentile, larger than `threshold` (fraction, e.g.
 *  0.4 = 40%).
 *
 *  Checks all five percentiles, not just the median: a national median never approaches the
 *  top-coding ceiling, so p50 alone is blind to exactly the failure this exists to catch (a wrong
 *  vintage top code shows up in the upper percentiles, if anywhere). Roles absent from either
 *  vintage are skipped — a young SOC code appearing for the first time is not a jump.
 *
 *  KNOWN BLIND SPOTS — do not read a clean run here as "the archive is fine":
 *   - Gradual drift: a systematic error applied consistently across vintages (e.g. a stale
 *     deflator, or a top code that is wrong the SAME way in consecutive years — see
 *     findTopCodeAnomaly's doc comment) never produces a single-year jump and is invisible here.
 *   - A role silently disappearing from the archive between vintages produces no jump record,
 *     because a jump requires the role to be present in BOTH years being compared.
 *   - The threshold is a caller-supplied constant, not adaptive — a genuinely volatile
 *     small-population SOC that legitimately swings past it needs a code change to silence. */
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
      for (const pct of PCTS) {
        const a = prevRole[pct], b = curRole[pct]
        if (a === null || b === null || a === 0) continue
        const change = (b - a) / a
        if (Math.abs(change) > threshold) {
          out.push({ soc, pct, from: prev.year, to: cur.year, fromValue: a, toValue: b, change })
        }
      }
    }
  }
  return out
}

export interface TopCodeAnomaly {
  year: number; topCode: number; maxUncapped: number; cappedCells: number; gap: number
}

/** A vintage whose recorded top code sits far above every UNCAPPED percentile in the same file.
 *
 *  This is the real detector for a wrong per-year top code. A year-over-year check cannot find
 *  that bug: if the wrong ceiling is applied to several vintages consistently, every censored
 *  cell moves together and no jump appears. But within one file the error is visible as a gap —
 *  censored cells pinned at `topCode` with nothing uncapped anywhere near it.
 *
 *  Returns null when the vintage has no censored cells at all (nothing to check). */
export function findTopCodeAnomaly(
  archive: NationalArchive,
  maxGapFraction: number,
): TopCodeAnomaly | null {
  let maxUncapped = -Infinity
  let cappedCells = 0
  for (const role of Object.values(archive.roles)) {
    for (const pct of PCTS) {
      if (role.capped.includes(pct)) {
        cappedCells++
        continue
      }
      const value = role[pct]
      if (value !== null && value > maxUncapped) maxUncapped = value
    }
  }
  if (cappedCells === 0) return null
  // No uncapped value anywhere in the archive: treat the missing signal as the worst case (0)
  // rather than propagating -Infinity/NaN through the gap calculation below.
  const safeMaxUncapped = Number.isFinite(maxUncapped) ? maxUncapped : 0
  const gap = (archive.topCode - safeMaxUncapped) / archive.topCode
  if (gap > maxGapFraction) {
    return { year: archive.year, topCode: archive.topCode, maxUncapped: safeMaxUncapped, cappedCells, gap }
  }
  return null
}
