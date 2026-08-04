import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:3020' },
  webServer: { command: 'npx next dev -p 3020', url: 'http://localhost:3020', reuseExistingServer: true, timeout: 120_000 },
})
