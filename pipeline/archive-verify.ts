// Executable entry point for `npm run archive:verify`. Reads every committed vintage and fails
// loudly on:
//  - a wrong per-vintage top code (findTopCodeAnomaly, intra-vintage — runs on every vintage)
//  - an implausible year-over-year move on any percentile (findImplausibleJumps — needs 2+
//    vintages to compare)
// These are deliberately separate checks: the top-code error can be consistent across several
// vintages, in which case nothing "jumps" between them and only the intra-vintage gap check
// catches it. See both functions' doc comments in lib/history.ts for the reasoning.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { findImplausibleJumps, findTopCodeAnomaly, HISTORY_DIR, type NationalArchive } from './lib/history'

const JUMP_THRESHOLD = 0.4
const TOP_CODE_GAP_THRESHOLD = 0.1

if (!existsSync(HISTORY_DIR)) {
  console.log('no data/history yet — nothing to verify')
  process.exit(0)
}
const files = readdirSync(HISTORY_DIR).filter(f => /^oews-nat-\d{4}\.json$/.test(f)).sort()
if (files.length === 0) {
  console.log('0 vintage(s) archived — nothing to verify')
  process.exit(0)
}
const vintages: NationalArchive[] = files.map(f => JSON.parse(readFileSync(path.join(HISTORY_DIR, f), 'utf8')))

let failures = 0

// Intra-vintage top-code check: runs whenever at least one vintage exists.
for (const archive of vintages) {
  const anomaly = findTopCodeAnomaly(archive, TOP_CODE_GAP_THRESHOLD)
  if (anomaly) {
    failures++
    console.error(
      `DATA QUALITY: vintage ${anomaly.year} top code $${anomaly.topCode.toLocaleString()} sits ` +
      `${(anomaly.gap * 100).toFixed(1)}% above its highest uncapped value ` +
      `($${anomaly.maxUncapped.toLocaleString()}) across ${anomaly.cappedCells} capped cell(s)`,
    )
  }
}
console.log(`${vintages.length} vintage(s) checked for top-code plausibility at gap threshold ${TOP_CODE_GAP_THRESHOLD * 100}%`)

// Cross-vintage jump check: inherently needs two vintages to compare.
if (vintages.length >= 2) {
  const jumps = findImplausibleJumps(vintages, JUMP_THRESHOLD)
  failures += jumps.length
  for (const j of jumps) {
    console.error(
      `DATA QUALITY: ${j.soc} ${j.pct} moved ${(j.change * 100).toFixed(1)}% ` +
      `${j.from}->${j.to} ($${j.fromValue.toLocaleString()} -> $${j.toValue.toLocaleString()})`,
    )
  }
  console.log(`${vintages.length} vintages checked, ${jumps.length} implausible move(s) at threshold ${JUMP_THRESHOLD * 100}%`)
} else {
  console.log(`only ${vintages.length} vintage(s) archived — jump check needs at least 2`)
}

process.exitCode = failures > 0 ? 1 : 0
