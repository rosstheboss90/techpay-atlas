import { describe, expect, it } from 'vitest'
import { looksLikeZip, markerTargetExists } from '../lib/download-lib'

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

describe('markerTargetExists', () => {
  const rawFiles = new Set(['oesm25ma.zip', 'ZIP_CBSA_032026.xlsx'])
  it('is true when the marker names a file that is still present in data/raw', () => {
    expect(markerTargetExists('oesm25ma.zip', rawFiles)).toBe(true)
  })
  it('is true after trimming incidental whitespace from the marker content', () => {
    expect(markerTargetExists('  oesm25ma.zip\n', rawFiles)).toBe(true)
  })
  it('is false when the marker names a file that no longer exists (self-heal: re-download)', () => {
    expect(markerTargetExists('oesm24ma.zip', rawFiles)).toBe(false)
  })
  it('is false for empty/blank marker content', () => {
    expect(markerTargetExists('', rawFiles)).toBe(false)
    expect(markerTargetExists('   ', rawFiles)).toBe(false)
  })
})
