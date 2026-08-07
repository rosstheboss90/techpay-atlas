import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { EmployerProfile } from '../../../components/EmployerProfile'
import type { EmployerProfileJson } from '../../../lib/employer-types'
import type { Meta } from '../../../lib/types'

// public/ is served as-is by the static export, but generateStaticParams and this page body both
// run in Node at build time — so the emitted JSON is read straight off disk here rather than
// fetched, same reasoning as lib/data.ts's runtime loaders don't apply during the build itself.
const dataDir = () => path.join(process.cwd(), 'public', 'data')

export function generateStaticParams(): { slug: string }[] {
  const dir = path.join(dataDir(), 'employers-by-name')
  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => ({ slug: f.slice(0, -'.json'.length) }))
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const profile = JSON.parse(
    readFileSync(path.join(dataDir(), 'employers-by-name', `${slug}.json`), 'utf-8')
  ) as EmployerProfileJson
  const meta = JSON.parse(readFileSync(path.join(dataDir(), 'meta.json'), 'utf-8')) as Meta
  const metroNames = Object.fromEntries(meta.metros.map(m => [m.cbsa, m.name]))

  return (
    <main className="page">
      <EmployerProfile profile={profile} metroNames={metroNames} />
    </main>
  )
}
