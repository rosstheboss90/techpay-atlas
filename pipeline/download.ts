import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline as streamPipeline } from 'node:stream/promises'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { RAW_DIR } from './config'

const UA = 'techpay-atlas research pipeline (personal project)' // BLS 403s default fetch agents

interface Source { name: string; urls: string[]; unzip?: boolean; required: boolean }

/** True when a buffer starts with the zip local-file-header signature `PK\x03\x04`. Some sites
 *  (e.g. a WAF challenge or an error page) answer a 2xx with HTML/JSON instead of the real file
 *  -- this catches that before it's treated as a valid archive. */
export function looksLikeZip(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04
}

const isZipOrXlsx = (file: string) => /\.(zip|xlsx)$/i.test(file)

/** A `.done` marker holds the basename of the file it downloaded. If that file has since been
 *  deleted from data/raw (manual cleanup, disk pressure), the marker is stale -- self-heal by
 *  treating the source as not-yet-downloaded rather than skipping it forever. */
export function markerTargetExists(markerContent: string, rawFiles: ReadonlySet<string>): boolean {
  const basename = markerContent.trim()
  return basename.length > 0 && rawFiles.has(basename)
}

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
  // LCA quarters: individually optional; Task 11 requires >= 2 files present overall.
  ...[1, 2, 3, 4].map(q => ({
    name: `lca-fy2025-q${q}`, required: false, urls: [
      `https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/LCA_Disclosure_Data_FY2025_Q${q}.xlsx`,
    ],
  })),
]

async function fetchTo(url: string, dest: string): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    // Some sites (e.g. huduser.gov's WAF) answer non-browser requests with a 2xx
    // "challenge" response and Content-Length: 0 instead of a normal 4xx/redirect —
    // res.ok alone would treat that as a successful download of an empty file.
    if (!res.ok || !res.body || res.headers.get('content-length') === '0') {
      console.warn(`  ${res.status} ${url}`)
      return false
    }
    await streamPipeline(Readable.fromWeb(res.body as never), createWriteStream(dest))
    if (isZipOrXlsx(dest)) {
      const buf = Buffer.alloc(4)
      const fh = await open(dest, 'r')
      try { await fh.read(buf, 0, 4, 0) } finally { await fh.close() }
      if (!looksLikeZip(buf)) {
        unlinkSync(dest)
        console.warn(`  WAF challenge or error page returned: ${url}`)
        return false
      }
    }
    return true
  } catch (e) { console.warn(`  ${(e as Error).message} ${url}`); return false }
}

mkdirSync(RAW_DIR, { recursive: true })
let missingRequired = 0
for (const src of SOURCES) {
  const marker = path.join(RAW_DIR, `${src.name}.done`)
  if (existsSync(marker) && markerTargetExists(readFileSync(marker, 'utf8'), new Set(readdirSync(RAW_DIR)))) {
    console.log(`skip ${src.name} (already downloaded)`)
    continue
  }
  let got: string | null = null
  for (const url of src.urls) {
    const dest = path.join(RAW_DIR, path.basename(url))
    console.log(`fetch ${url}`)
    if (await fetchTo(url, dest)) { got = dest; break }
  }
  if (!got) {
    console.warn(`FAILED: ${src.name}${src.required ? ' (required — download manually into data/raw/)' : ''}`)
    if (src.required) missingRequired++
    continue
  }
  if (src.unzip) new AdmZip(got).extractAllTo(RAW_DIR, true)
  writeFileSync(marker, path.basename(got))
}
console.log(missingRequired ? `${missingRequired} required source(s) missing` : 'all required sources present')
process.exitCode = missingRequired > 0 ? 1 : 0
