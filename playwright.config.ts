import { config as loadEnv } from 'dotenv';
import { defineConfig, devices } from '@playwright/test';
import { getSite } from './sites/index';

loadEnv();

const siteId = process.env.SITE_ID ?? 'jitabet';
const site = getSite(siteId);
const homeUrl = process.env.HOME_URL ?? site.homeUrl;

const isCi = Boolean(process.env.CI || process.env.GITHUB_ACTIONS);

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/global-setup.ts',
  // 本機 video.html / helper 單元測試，不屬正式機範圍；需跑時見 npm run test:fixture
  testIgnore: ['**/video-html/**', '**/youtube-embed.visual.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: isCi ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['./scripts/playwright-telegram-reporter.mjs'],
  ],
  timeout: 90_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      animations: 'disabled',
      maxDiffPixels: 200,
      maxDiffPixelRatio: 0.03,
    },
  },
  snapshotPathTemplate: '{testDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-projectName}{-snapshotSuffix}{ext}',
  use: {
    baseURL: homeUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
});
