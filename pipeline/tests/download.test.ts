import { describe, expect, it } from 'vitest'
import { formatMarker, looksLikeZip, markerIsCurrent, urlBasename } from '../lib/download-lib'

describe('looksLikeZip', () => {
  it('accepts a buffer starting with the PK\\x03\\x04 local-file-header signature', () => {
    expect(looksLikeZip(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0xff]))).toBe(true)
  })
  it('rejects an HTML/WAF-challenge response (no zip signature)', () => {
    expect(looksLikeZip(Buffer.from('<!DOCTYPE html><html>', 'utf8'))).toBe(false)
  })
  it('rejects an empty or short buffer', () => {
    expect(looksLikeZip(Buffer.alloc(0))).toBe(false)
    expect(looksLikeZip(Buffer.from([0x50, 0x4b]))).toBe(false)
  })
  it('rejects a buffer with a near-miss signature', () => {
    expect(looksLikeZip(Buffer.from([0x50, 0x4b, 0x03, 0x05]))).toBe(false)
  })
})

describe('urlBasename', () => {
  it('extracts the basename from a plain URL path', () => {
    expect(urlBasename('https://www.bls.gov/oes/special-requests/oesm25ma.zip')).toBe('oesm25ma.zip')
  })
  it('extracts the basename from a URL with a query string', () => {
    expect(urlBasename('https://example.com/path/to/file.zip?token=abc&v=2')).toBe('file.zip')
  })
})

describe('markerIsCurrent', () => {
  const rawFiles = new Set(['oesm25ma.zip', 'ZIP_CBSA_032026.xlsx'])
  const urls25 = ['https://www.bls.gov/oes/special-requests/oesm25ma.zip']
  const urls26 = ['https://www.bls.gov/oes/special-requests/oesm26ma.zip']
  const url25 = urls25[0]
  const url26 = urls26[0]
  const marker25 = `${url25}\noesm25ma.zip`

  it('is true when the marker URL is still configured and its file is present', () => {
    expect(markerIsCurrent(marker25, urls25, rawFiles)).toBe(true)
  })

  it('is FALSE when the configured URL changed — a vintage bump must re-download (T1)', () => {
    // The old file is still on disk; a basename-only check would wrongly report "already downloaded".
    expect(markerIsCurrent(marker25, urls26, rawFiles)).toBe(false)
  })

  it('is true when the preferred URL 404d and we fell back at fetch time, and nothing has changed since', () => {
    // Recorded preferred (url26) still equals the CURRENT preferred (configuredUrls[0]) -- nothing
    // was bumped, so this must not force a needless re-download of a large file.
    const marker = formatMarker(url25, 'oesm25ma.zip', url26)
    expect(markerIsCurrent(marker, [url26, url25], rawFiles)).toBe(true)
  })

  it('is false when the vintage bumped after the marker was written, even though the fetched URL is still a configured fallback (T1, multi-URL sources)', () => {
    // Marker was written when url25 was preferred (recorded preferred == url25). The documented
    // refresh procedure DEMOTES the old URL to fallback rather than removing it -- configuredUrls
    // is now [url26, url25]. url25 is still technically "in" configuredUrls, which is exactly the
    // membership bug from f72f5db: it must not be enough to keep the marker current.
    const marker = formatMarker(url25, 'oesm25ma.zip', url25)
    expect(markerIsCurrent(marker, [url26, url25], rawFiles)).toBe(false)
  })

  it('is false when the URL moved but the basename did not', () => {
    expect(markerIsCurrent(
      'https://old.example/MARPP.zip\nMARPP.zip\nhttps://old.example/MARPP.zip',
      ['https://apps.bea.gov/regional/zip/MARPP.zip'],
      new Set(['MARPP.zip']),
    )).toBe(false)
  })

  it('is false when the marker names a file that no longer exists (self-heal: re-download)', () => {
    expect(markerIsCurrent(marker25, urls25, new Set(['ZIP_CBSA_032026.xlsx']))).toBe(false)
  })

  it('migrates a legacy basename-only marker without forcing a re-download', () => {
    expect(markerIsCurrent('oesm25ma.zip', urls25, rawFiles)).toBe(true)
  })

  it('invalidates a legacy basename-only marker when the configured vintage moved on', () => {
    expect(markerIsCurrent('oesm25ma.zip', urls26, rawFiles)).toBe(false)
  })

  it('is false for empty/blank marker content', () => {
    expect(markerIsCurrent('', urls25, rawFiles)).toBe(false)
    expect(markerIsCurrent('   ', urls25, rawFiles)).toBe(false)
  })

  it('tolerates incidental whitespace around the recorded lines', () => {
    expect(markerIsCurrent(`  ${url25}  \n  oesm25ma.zip \n`, urls25, rawFiles)).toBe(true)
  })

  it('a 2-line marker written by f72f5db reads as current when config is unchanged (back-compat)', () => {
    expect(markerIsCurrent(marker25, urls25, rawFiles)).toBe(true)
  })

  it('a marker written by formatMarker reads back as current', () => {
    const url = 'https://www.bls.gov/oes/special-requests/oesm25ma.zip'
    expect(markerIsCurrent(formatMarker(url, 'oesm25ma.zip', url), [url], new Set(['oesm25ma.zip']))).toBe(true)
  })
})
