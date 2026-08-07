import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const RAW_DIR = path.join(here, '..', 'data', 'raw')
export const REPORT_DIR = path.join(here, '..', 'data', 'reports')
export const OUT_DIR = path.join(here, '..', 'site', 'public', 'data')
/** Curated employer alias overlay — committed data, not a raw input. */
export const EMPLOYER_ALIASES = path.join(here, '..', 'data', 'employer-aliases.json')

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
  minConflationTitles: 20,      // normalized titles clearing minFilings for the title↔SOC matrix
  employerPrerenderCount: 500,  // static /employers/<slug> pages; a COUNT not a floor, so page
                                // count stays fixed across vintages. The equivalent filings floor
                                // is reported by the run, not configured.
  minEmployerProfiles: 500,     // canonical filers that must exist at all — a top-500 cut is
                                // meaningless if normalization collapsed everything
  maxAliasCollapse: 0.25,       // alias merging absorbing >25% of filings means an over-broad rule
  minAliasCoverage: 0.20,       // ...and covering <20% of the top-500's filings means a rotted or
                                // half-applied alias file. Both bounds are stated because a
                                // one-directional check is what let the /trends top-code error
                                // through: it tested only for a value too high.
}
