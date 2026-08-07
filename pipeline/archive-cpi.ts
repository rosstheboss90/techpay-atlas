// Executable entry point for `npm run archive:cpi`. Fetches CPI-U all items (series
// CUUR0000SA0, May observations only) from the BLS public API and archives it as
// data/history/cpi-u.json, so the /trends real-wage deflator is committed rather than
// re-fetched at build time.
//
// api.bls.gov, NOT download.bls.gov/www.bls.gov: those are Akamai-blocked (403 to automated
// requests) on this machine. api.bls.gov is a separate host and is reachable, and is also the
// better source — structured JSON instead of a ~20MB space-padded fixed-width text file.
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseCpiMayByYear } from './lib/parse-cpi'
import { HISTORY_DIR } from './lib/history'
import { OEWS_NAT_YEARS } from './vintages'

const SERIES_ID = 'CUUR0000SA0'
const API_URL = 'https://api.bls.gov/publicAPI/v1/timeseries/data/'

// The unauthenticated v1 API allows at most 10 years per request. Truncating silently would
// produce a deflator with a gap nobody asked for, so this fails loudly instead and points at the
// fix: a free v2 key (data.bls.gov/registrationEngine/) raises the span to 20 years, 50 series,
// 500 queries/day.
const V1_MAX_YEARS = 10

const startYear = OEWS_NAT_YEARS[0]
const endYear = OEWS_NAT_YEARS[OEWS_NAT_YEARS.length - 1]
const span = endYear - startYear + 1
if (span > V1_MAX_YEARS) {
  throw new Error(
    `OEWS_NAT_YEARS spans ${span} years (${startYear}-${endYear}), which exceeds the BLS v1 ` +
    `public API's unauthenticated limit of ${V1_MAX_YEARS} years per request. Register a free ` +
    `v2 key at https://data.bls.gov/registrationEngine/ (20 years, 50 series, 500 queries/day) ` +
    `and switch this script to the v2 endpoint rather than silently truncating the span.`,
  )
}

const res = await fetch(API_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ seriesid: [SERIES_ID], startyear: String(startYear), endyear: String(endYear) }),
})
if (!res.ok) {
  throw new Error(`BLS API request failed: ${res.status} ${res.statusText}`)
}
const json = await res.json()

const values = parseCpiMayByYear(json, SERIES_ID)

// A silently short deflator (a missing year) would leave a gap in the /trends real-wage series
// with no signal at build time — check every requested year landed before writing anything.
const missing = OEWS_NAT_YEARS.filter(y => !(y in values))
if (missing.length > 0) {
  throw new Error(`CPI archive is missing year(s) ${missing.join(', ')} — refusing to write a short deflator`)
}

const out = { series: SERIES_ID, period: 'May', values }
mkdirSync(HISTORY_DIR, { recursive: true })
const dest = path.join(HISTORY_DIR, 'cpi-u.json')
writeFileSync(dest, JSON.stringify(out, null, 1))

const years = Object.keys(values).map(Number).sort((a, b) => a - b)
console.log(`wrote ${years.length} May value(s), ${years[0]}-${years[years.length - 1]} -> ${dest}`)
