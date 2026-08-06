// Executable entry point for `npm run download`. All logic lives in lib/download-lib.ts so that
// importing it from a test does NOT trigger real network downloads — this file is the only one
// with side effects, and nothing imports it.
//
// Every year-encoded value comes from vintages.ts. Bumping a refresh is an edit to THAT file.
import { RAW_DIR } from './config'
import { runDownloads, type Source } from './lib/download-lib'
import { OEWS_NAT_YEARS, VINTAGES } from './vintages'

const yy = (year: number) => String(year).slice(2)
const oewsMsaUrl = (year: number) => `https://www.bls.gov/oes/special-requests/oesm${yy(year)}ma.zip`
const oewsNatUrl = (year: number) => `https://www.bls.gov/oes/special-requests/oesm${yy(year)}nat.zip`
const gazetteerUrl = (year: number) =>
  // note capital "Gaz" -- census.gov's own URL casing, lowercase 404s
  `https://www2.census.gov/geo/docs/maps-data/data/gazetteer/${year}_Gazetteer/${year}_Gaz_cbsa_national.zip`
const hudUrl = (stamp: string) => `https://www.huduser.gov/portal/datasets/usps/ZIP_CBSA_${stamp}.xlsx`
const lcaUrl = (fy: number, q: number) =>
  `https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/LCA_Disclosure_Data_FY${fy}_Q${q}.xlsx`

const SOURCES: Source[] = [
  { name: 'oews', required: true, unzip: true, urls: [
    oewsMsaUrl(VINTAGES.oewsYear),
    oewsMsaUrl(VINTAGES.oewsFallbackYear),
  ]},
  { name: 'rpp', required: true, unzip: true, urls: ['https://apps.bea.gov/regional/zip/MARPP.zip'] },
  { name: 'gazetteer', required: true, unzip: true, urls: [
    gazetteerUrl(VINTAGES.gazetteerYear),
    gazetteerUrl(VINTAGES.gazetteerFallbackYear),
  ]},
  { name: 'hud', required: true, urls: [
    hudUrl(VINTAGES.hudStamp),
    hudUrl(VINTAGES.hudFallbackStamp),
  ]},
  // National OEWS vintages for the /trends archive. Small (one row per occupation), and
  // individually optional so a single missing year never blocks the main pipeline.
  ...OEWS_NAT_YEARS.map(year => ({
    name: `oews-nat-${year}`, required: false, unzip: true, urls: [oewsNatUrl(year)],
  })),
  // CPI-U all items, US city average — the /trends deflator — is NOT in SOURCES/runDownloads.
  // download.bls.gov is Akamai-blocked (403 to automated requests) on this machine, but
  // api.bls.gov is a separate host and is reachable, and is the better source anyway: structured
  // JSON rather than a ~20MB space-padded fixed-width text file. Run `npm run archive:cpi`
  // instead — it fetches from the API and writes data/history/cpi-u.json directly.
  // LCA quarters: individually optional; run.ts requires >= 2 files present overall.
  ...[1, 2, 3, 4].map(q => ({
    name: `lca-fy${VINTAGES.lcaFiscalYear}-q${q}`, required: false,
    urls: [lcaUrl(VINTAGES.lcaFiscalYear, q)],
  })),
]

process.exitCode = await runDownloads(SOURCES, RAW_DIR)
