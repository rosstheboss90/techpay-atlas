import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// Set by the GitHub Pages workflow (/techpay-atlas); empty everywhere else.
// NEXT_PUBLIC_ so lib/data.ts can prefix its fetch paths with the same value.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

const config: NextConfig = {
  output: 'export',
  ...(basePath ? { basePath } : {}),
  images: { unoptimized: true },
  turbopack: { root: dirname },
}
export default config
