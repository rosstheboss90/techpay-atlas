// Executable entry point for `npm run archive:verify`. Reads every committed vintage and fails
// loudly on an implausible year-over-year move — the signature of a wrong top code or deflator.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { findImplausibleJumps, HISTORY_DIR, type NationalArchive } from './lib/history'

const THRESHOLD = 0.4

if (!existsSync(HISTORY_DIR)) {
  console.log('no data/history yet — nothing to verify')
  process.exit(0)
}
const files = readdirSync(HISTORY_DIR).filter(f => /^oews-nat-\d{4}\.json$/.test(f)).sort()
if (files.length < 2) {
  console.log(`only ${files.length} vintage(s) archived — nothing to compare`)
  process.exit(0)
}
const vintages: NationalArchive[] = files.map(f => JSON.parse(readFileSync(path.join(HISTORY_DIR, f), 'utf8')))
const jumps = findImplausibleJumps(vintages, THRESHOLD)
for (const j of jumps) {
  console.error(`DATA QUALITY: ${j.soc} median moved ${(j.change * 100).toFixed(1)}% ` +
    `${j.from}->${j.to} ($${j.fromValue.toLocaleString()} -> $${j.toValue.toLocaleString()})`)
}
console.log(`${files.length} vintages checked, ${jumps.length} implausible move(s) at threshold ${THRESHOLD * 100}%`)
process.exitCode = jumps.length > 0 ? 1 : 0
