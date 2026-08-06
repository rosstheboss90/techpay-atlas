import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline as streamPipeline } from 'node:stream/promises'
import path from 'node:path'
import AdmZip from 'adm-zip'

const UA = 'techpay-atlas research pipeline (personal project)' // BLS 403s default fetch agents

export interface Source { name: string; urls: string[]; unzip?: boolean; required: boolean }

/** True when a buffer starts with the zip local-file-header signature `PK\x03\x04`. Some sites
 *  (e.g. a WAF challenge or an error page) answer a 2xx with HTML/JSON instead of the real file
 *  -- this catches that before it's treated as a valid archive. */
export function looksLikeZip(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04
}

/** A `.done` marker records two lines: the URL it downloaded from, then that file's basename.
 *
 *  Keying on the URL rather than the basename is what makes a vintage bump invalidate the marker
 *  (spec trap T1). With basename-only markers, changing the configured URL to a new year while the
 *  previous year's file was still in data/raw produced `skip <source> (already downloaded)` — a
 *  "successful" refresh that downloaded nothing.
 *
 *  Current iff the recorded URL is still one of the configured URLs (membership, not position, so
 *  keeping last year's URL as a fallback doesn't force a re-download) AND the file it named is
 *  still present.
 *
 *  Legacy single-line markers are accepted when their basename matches what a configured URL would
 *  produce, so the first run after this change migrates in place instead of re-downloading ~478MB. */
export function markerIsCurrent(
  markerContent: string,
  configuredUrls: readonly string[],
  rawFiles: ReadonlySet<string>,
): boolean {
  const lines = markerContent.split('\n').map(s => s.trim()).filter(Boolean)
  if (lines.length === 0) return false
  if (lines.length === 1) {
    const basename = lines[0]
    return configuredUrls.some(u => path.basename(u) === basename) && rawFiles.has(basename)
  }
  const [url, basename] = lines
  return configuredUrls.includes(url) && rawFiles.has(basename)
}

const isZipOrXlsx = (file: string) => /\.(zip|xlsx)$/i.test(file)

export async function fetchTo(url: string, dest: string): Promise<boolean> {
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

/** Downloads every source that is not already satisfied by a marker. Returns the count of
 *  missing REQUIRED sources (0 = success), for the caller to use as an exit code. */
export async function runDownloads(sources: readonly Source[], rawDir: string): Promise<number> {
  mkdirSync(rawDir, { recursive: true })
  let missingRequired = 0
  for (const src of sources) {
    const marker = path.join(rawDir, `${src.name}.done`)
    if (existsSync(marker) && markerIsCurrent(readFileSync(marker, 'utf8'), src.urls, new Set(readdirSync(rawDir)))) {
      console.log(`skip ${src.name} (already downloaded)`)
      continue
    }
    let got: string | null = null
    let gotUrl: string | null = null
    for (const url of src.urls) {
      const dest = path.join(rawDir, path.basename(url))
      console.log(`fetch ${url}`)
      if (await fetchTo(url, dest)) { got = dest; gotUrl = url; break }
    }
    if (!got) {
      console.warn(`FAILED: ${src.name}${src.required ? ' (required — download manually into data/raw/)' : ''}`)
      if (src.required) missingRequired++
      continue
    }
    if (src.unzip) new AdmZip(got).extractAllTo(rawDir, true)
    writeFileSync(marker, `${gotUrl}\n${path.basename(got)}`)
  }
  console.log(missingRequired ? `${missingRequired} required source(s) missing` : 'all required sources present')
  return missingRequired
}
