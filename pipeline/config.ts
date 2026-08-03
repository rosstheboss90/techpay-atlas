import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const RAW_DIR = path.join(here, '..', 'data', 'raw')
export const REPORT_DIR = path.join(here, '..', 'data', 'reports')
export const OUT_DIR = path.join(here, '..', 'site', 'public', 'data')

export const THRESHOLDS = {
  minMetros: 300,        // OEWS has ~390 MSAs; below 300 something broke
  minSalaryRows: 2000,   // metro x role combos with data
  minZipMatchRate: 0.85, // LCA worksite ZIP -> CBSA join
  minRppCoverage: 0.8,   // share of salary metros with an RPP value
}
