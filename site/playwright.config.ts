import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  // The suite runs against `next dev`, which compiles routes on demand. Adding /employers and
  // its 500 generateStaticParams paths pushed first paint past the 5s default on a cold parallel
  // run, failing seven unrelated specs on timeouts rather than on anything real. Raised rather
  // than serialising the suite, because the cause is compile latency, not a race.
  // The durable fix is running against the static export — see docs/BACKLOG.md.
  expect: { timeout: 15_000 },
  use: { baseURL: 'http://localhost:3020' },
  webServer: { command: 'npx next dev -p 3020', url: 'http://localhost:3020', reuseExistingServer: true, timeout: 120_000 },
})
