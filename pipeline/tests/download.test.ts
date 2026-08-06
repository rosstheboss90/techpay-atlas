import { describe, expect, it } from 'vitest'
import { looksLikeZip, markerIsCurrent } from '../lib/download-lib'

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

describe('markerIsCurrent', () => {
  const rawFiles = new Set(['oesm25ma.zip', 'ZIP_CBSA_032026.xlsx'])
  const urls25 = ['https://www.bls.gov/oes/special-requests/oesm25ma.zip']
  const urls26 = ['https://www.bls.gov/oes/special-requests/oesm26ma.zip']
  const marker25 = 'https://www.bls.gov/oes/special-requests/oesm25ma.zip\noesm25ma.zip'

  it('is true when the marker URL is still configured and its file is present', () => {
    expect(markerIsCurrent(marker25, urls25, rawFiles)).toBe(true)
  })

  it('is FALSE when the configured URL changed — a vintage bump must re-download (T1)', () => {
    // The old file is still on disk; a basename-only check would wrongly report "already downloaded".
    expect(markerIsCurrent(marker25, urls26, rawFiles)).toBe(false)
  })

  it('is true when the marker URL is a configured fallback rather than the preferred URL', () => {
    expect(markerIsCurrent(marker25, [...urls26, ...urls25], rawFiles)).toBe(true)
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
    expect(markerIsCurrent(`  ${urls25[0]}  \n  oesm25ma.zip \n`, urls25, rawFiles)).toBe(true)
  })
})
