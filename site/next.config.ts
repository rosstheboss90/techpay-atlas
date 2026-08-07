import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// Set by the GitHub Pages workflow (/techpay-atlas); empty everywhere else.
// NEXT_PUBLIC_ so lib/data.ts can prefix its fetch paths with the same value.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

const config: NextConfig = {
  output: 'export',
  // Emit `about/index.html` rather than `about.html`, so BOTH `/about` and `/about/` resolve.
  // Without it the export produces only the bare `.html` and the trailing-slash form 404s on
  // GitHub Pages — a shared or hand-typed URL dead-ends. Tolerable at two routes; not once
  // /employers/<slug> adds ~500 URLs whose entire purpose is being linkable and indexable.
  trailingSlash: true,
  ...(basePath ? { basePath } : {}),
  images: { unoptimized: true },
  turbopack: { root: dirname },
}
export default config
