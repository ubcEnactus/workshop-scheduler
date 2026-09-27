import { defineConfig } from '@playwright/test'

const isCI = process.env.CI === 'true' || process.env.CI === '1'

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: process.env.E2E_PREVIEW_DEMO === 'true' ? undefined : '**/preview-demo-auth.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: isCI ? 120_000 : 90_000,
  expect: { timeout: isCI ? 45_000 : 15_000 },
  reporter: 'list',
  outputDir: 'work/test-results',
  use: {
    baseURL: process.env.AUTH_URL,
    browserName: 'chromium',
    ignoreHTTPSErrors: process.env.E2E_PREVIEW_DEMO === 'true',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node scripts/e2e-server.mjs',
    url: `${process.env.AUTH_URL}/login`,
    reuseExistingServer: false,
    ignoreHTTPSErrors: process.env.E2E_PREVIEW_DEMO === 'true',
    timeout: 120_000,
  },
})
