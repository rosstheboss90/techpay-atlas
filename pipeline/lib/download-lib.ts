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

/** A `.done` marker records up to three lines: the URL actually fetched, that file's basename,
 *  and the PREFERRED url (configuredUrls[0]) at fetch time.
 *
 *  Why "preferred", not just "fetched, and is it still configured": every multi-URL source keeps
 *  last year's URL around as a fallback, and the documented refresh procedure DEMOTES the old URL
 *  to that fallback slot rather than deleting it. A plain `configuredUrls.includes(fetchedUrl)`
 *  check (f72f5db) therefore stays true across a vintage bump — the old URL is still "in" the
 *  list, just no longer first — which reopens spec trap T1 for every multi-URL source. Keying on
 *  whether the RECORDED preferred URL still equals the CURRENT preferred URL is what makes a
 *  vintage bump invalidate the marker, while still tolerating an ordinary preferred-URL 404 (the
 *  recorded preferred doesn't change just because we fell back to fetch it).
 *
 *  Current iff:
 *   - the recorded preferred URL still equals configuredUrls[0], AND
 *   - the recorded fetched URL is still one of configuredUrls, AND
 *   - the file it named is still present.
 *
 *  Legacy marker formats are accepted so the first run after this change migrates in place instead
 *  of re-downloading ~478MB:
 *   - 1 line (pre-f72f5db, basename only): accepted iff urlBasename(configuredUrls[0]) equals it
 *     -- compared against the PREFERRED url only, not `some()` over every configured URL, which is
 *     what closes the T1 hole for this format too -- AND the file is present.
 *   - 2 lines (f72f5db: fetched URL, basename): the recorded preferred is treated as equal to the
 *     recorded fetched URL, since that format never distinguished them. */
export function markerIsCurrent(
  markerContent: string,
  configuredUrls: readonly string[],
  rawFiles: ReadonlySet<string>,
): boolean {
  const lines = markerContent.split('\n').map(s => s.trim()).filter(Boolean)
  if (lines.length === 0) return false
  const preferred = configuredUrls[0]
  if (lines.length === 1) {
    const basename = lines[0]
    return urlBasename(preferred) === basename && rawFiles.has(basename)
  }
  const [fetchedUrl, basename, recordedPreferred = fetchedUrl] = lines
  return recordedPreferred === preferred && configuredUrls.includes(fetchedUrl) && rawFiles.has(basename)
}

/** Basename of a URL path. Not path.basename: that is path.win32.basename on Windows, which
 *  happens to work on URLs today only because win32 treats '/' as a separator, and would break
 *  on any URL carrying a query string. */
export function urlBasename(url: string): string {
  return new URL(url).pathname.split('/').filter(Boolean).pop() ?? ''
}

/** Canonical .done marker body: the URL actually fetched, that file's basename, and the preferred
 *  URL (configuredUrls[0]) at fetch time. Pins the write path (runDownloads) to the read path
 *  (markerIsCurrent) via a round-trip test, so they can never quietly disagree. */
export function formatMarker(fetchedUrl: string, basename: string, preferredUrl: string): string {
  return `${fetchedUrl}\n${basename}\n${preferredUrl}`
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
    if (existsSync(marker)) {
      const markerContent = readFileSync(marker, 'utf8')
      if (markerIsCurrent(markerContent, src.urls, new Set(readdirSync(rawDir)))) {
        console.log(`skip ${src.name} (already downloaded)`)
        // Migrate legacy 1- and 2-line markers to the canonical 3-line format in place, so this
        // is the LAST run that ever has to accept the weaker legacy comparison for this source.
        const lines = markerContent.split('\n').map(s => s.trim()).filter(Boolean)
        if (lines.length < 3) {
          const [fetchedUrl, basename] = lines.length === 1 ? [src.urls[0], lines[0]] : lines
          writeFileSync(marker, formatMarker(fetchedUrl, basename, fetchedUrl))
        }
        continue
      }
    }
    let got: string | null = null
    let gotUrl: string | null = null
    for (const url of src.urls) {
      const dest = path.join(rawDir, urlBasename(url))
      console.log(`fetch ${url}`)
      if (await fetchTo(url, dest)) { got = dest; gotUrl = url; break }
    }
    if (!got || !gotUrl) {
      console.warn(`FAILED: ${src.name}${src.required ? ' (required — download manually into data/raw/)' : ''}`)
      if (src.required) missingRequired++
      continue
    }
    if (src.unzip) new AdmZip(got).extractAllTo(rawDir, true)
    writeFileSync(marker, formatMarker(gotUrl, urlBasename(gotUrl), src.urls[0]))
  }
  console.log(missingRequired ? `${missingRequired} required source(s) missing` : 'all required sources present')
  return missingRequired
}
