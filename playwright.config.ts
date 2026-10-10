import { defineConfig, devices } from '@playwright/test';

// PW_CHROMIUM lets sandboxes with a preinstalled Chromium skip `playwright install`.
const executablePath = process.env.PW_CHROMIUM || undefined;

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4173/clear-speech-enhancement-web/', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions: { executablePath } } },
  ],
  webServer: { command: 'npm run preview -- --port 4173 --strictPort', port: 4173, reuseExistingServer: !process.env.CI },
});
