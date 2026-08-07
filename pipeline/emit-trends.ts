// Executable entry point for `npm run emit:trends`. Reads the committed archive in data/history
// and writes site/public/data/trends.json.
//
// Separate from run.ts on purpose: run.ts executes its whole body on import, needs a 6GB heap and
// the LCA workbooks. This needs two small committed JSON files and nothing else.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { OUT_DIR } from './config'
import { buildTrends } from './lib/build-trends'
import { HISTORY_DIR, type NationalArchive } from './lib/history'

const HEADLINE_FROM = 2021 // earliest year all 21 registry roles exist as their own SOC code

const cpiFile = path.join(HISTORY_DIR, 'cpi-u.json')
if (!existsSync(cpiFile)) {
  console.error(`missing ${cpiFile} — run 'npm run archive:cpi'`)
  process.exit(1)
}
const cpi = JSON.parse(readFileSync(cpiFile, 'utf8')) as { values: Record<string, number> }
const cpiByYear: Record<number, number> = {}
for (const [y, v] of Object.entries(cpi.values)) cpiByYear[Number(y)] = v

const files = readdirSync(HISTORY_DIR).filter(f => /^oews-nat-\d{4}\.json$/.test(f)).sort()
if (files.length === 0) {
  console.error(`no oews-nat-*.json in ${HISTORY_DIR} — run 'npm run archive:nat'`)
  process.exit(1)
}
const archives: NationalArchive[] = files.map(f => JSON.parse(readFileSync(path.join(HISTORY_DIR, f), 'utf8')))
const base = Math.max(...archives.map(a => a.year))

const trends = buildTrends(archives, cpiByYear, base, HEADLINE_FROM)
writeFileSync(path.join(OUT_DIR, 'trends.json'), JSON.stringify(trends))
const n = Object.keys(trends.roles).length
console.log(`wrote trends.json — ${n} roles, ${trends.years[0]}–${base}, headline ${HEADLINE_FROM}→${trends.headlineTo}, base ${base} dollars`)
