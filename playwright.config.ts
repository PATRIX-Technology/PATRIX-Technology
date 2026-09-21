import { defineConfig, devices } from '@playwright/test';

/**
 * E2E smoke tests for pages that render without needing a live Supabase
 * project (marketing, auth forms, RTL/LTR + accessibility basics) — see
 * docs/DECISIONS.md "E2E test scope". A full auth/data-flow E2E suite
 * needs a real (or `supabase start`) Supabase project and is tracked as
 * follow-up work in docs/HANDOFF.md.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'dot' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Some sandboxed environments pre-install a Chromium binary at a
        // fixed path and disable Playwright's own browser download; set
        // PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to use it instead of
        // whatever `npx playwright install` would otherwise fetch. Unset
        // (the normal case) uses Playwright's own managed browser.
        ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } }
          : {}),
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/en',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
