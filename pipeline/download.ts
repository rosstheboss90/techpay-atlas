// Executable entry point for `npm run download`. All logic lives in lib/download-lib.ts so that
// importing it from a test does NOT trigger real network downloads — this file is the only one
// with side effects, and nothing imports it.
import { RAW_DIR } from './config'
import { runDownloads, type Source } from './lib/download-lib'

const SOURCES: Source[] = [
  { name: 'oews', required: true, unzip: true, urls: [
    'https://www.bls.gov/oes/special-requests/oesm25ma.zip',   // May 2025 (preferred)
    'https://www.bls.gov/oes/special-requests/oesm24ma.zip',   // May 2024 fallback
  ]},
  { name: 'rpp', required: true, unzip: true, urls: ['https://apps.bea.gov/regional/zip/MARPP.zip'] },
  { name: 'gazetteer', required: true, unzip: true, urls: [
    'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_cbsa_national.zip', // note capital "Gaz" -- census.gov's own URL casing, lowercase 404s
    'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_cbsa_national.zip',
  ]},
  { name: 'hud', required: true, urls: [
    'https://www.huduser.gov/portal/datasets/usps/ZIP_CBSA_032026.xlsx',
    'https://www.huduser.gov/portal/datasets/usps/ZIP_CBSA_122025.xlsx',
  ]},
  // LCA quarters: individually optional; run.ts requires >= 2 files present overall.
  ...[1, 2, 3, 4].map(q => ({
    name: `lca-fy2025-q${q}`, required: false, urls: [
      `https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/LCA_Disclosure_Data_FY2025_Q${q}.xlsx`,
    ],
  })),
]

process.exitCode = await runDownloads(SOURCES, RAW_DIR)
