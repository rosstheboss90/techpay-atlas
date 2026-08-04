import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const config: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  turbopack: { root: dirname },
}
export default config
