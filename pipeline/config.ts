import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const RAW_DIR = path.join(here, '..', 'data', 'raw')
export const REPORT_DIR = path.join(here, '..', 'data', 'reports')
export const OUT_DIR = path.join(here, '..', 'site', 'public', 'data')

export const THRESHOLDS = {
  minMetros: 300,        // OEWS has ~390 MSAs; below 300 something broke
  minSalaryRows: 2000,   // metro x role combos with data
  minZipMatchRate: 0.85, // LCA worksite ZIP -> CBSA join, over the ALL-SOC deduped population
                         // (title lens widened it from target-SOC-only; measured ~0.99, so the
                         // 0.85 floor stays a tripwire, not a live constraint)
  minRppCoverage: 0.8,   // share of salary metros with an RPP value
  minLcaRecords: 50_000, // usable LCA filings across all quarters before ZIP join
  minTitleFilings: 10_000,      // total filings matched into a title bucket (scan found ~14k in PM alone)
  maxTitleFamilyOverlap: 0.01,  // share of title-matched filings whose title hits >=2 families (regex overlap tripwire)
}
