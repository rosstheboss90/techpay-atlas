// Executable entry point for `npm run emit:metro-trends`. Reads the committed MSA archive and
// writes one file per metro into site/public/data/trends/.
//
// Separate from run.ts on purpose: run.ts executes its whole body on import, needs a 6GB heap and
// the LCA workbooks. This needs the committed archive and the CPI deflator, nothing else.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { OUT_DIR } from './config'
import { buildMetroTrend } from './lib/build-metro-trends'
import { detectDelineation } from './lib/delineation'
import { HISTORY_DIR, type MsaArchive } from './lib/history'

const cpiFile = path.join(HISTORY_DIR, 'cpi-u.json')
if (!existsSync(cpiFile)) {
  console.error(`missing ${cpiFile} — run 'npm run archive:cpi'`)
  process.exit(1)
}
const cpi = JSON.parse(readFileSync(cpiFile, 'utf8')) as { values: Record<string, number> }
const cpiByYear: Record<number, number> = {}
for (const [y, v] of Object.entries(cpi.values)) cpiByYear[Number(y)] = v

const files = readdirSync(HISTORY_DIR).filter(f => /^oews-msa-\d{4}\.json$/.test(f)).sort()
if (files.length === 0) {
  console.error(`no oews-msa-*.json in ${HISTORY_DIR} — run 'npm run archive:msa'`)
  process.exit(1)
}
const archives: MsaArchive[] = files.map(f => JSON.parse(readFileSync(path.join(HISTORY_DIR, f), 'utf8')))
const base = Math.max(...archives.map(a => a.year))

const delineation = detectDelineation(archives)
const outDir = path.join(OUT_DIR, 'trends')
// Stale output is removed only now, after every read above succeeded — a failed run must never
// destroy the previously-committed good output.
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const cbsas = [...new Set(archives.flatMap(a => Object.keys(a.metros)))].sort()
let written = 0
let broken = 0
for (const cbsa of cbsas) {
  const trend = buildMetroTrend(cbsa, archives, cpiByYear, base, delineation)
  if (!trend) continue
  writeFileSync(path.join(outDir, `${cbsa}.json`), JSON.stringify(trend))
  if (trend.breaks.length) broken++
  written++
}

console.log(`wrote ${written} metro trend files — ${archives[0].year}–${base}, base ${base} dollars`)
console.log(`${broken} of ${written} metros (${(broken / written * 100).toFixed(1)}%) have at least one delineation break`)
