import { config as loadEnv } from 'dotenv';
import { chromium } from '@playwright/test';
import { getSite } from '../sites';
import { openHomeAndLogin, saveMemberStorage } from './helpers/login';

loadEnv();

/**
 * 整次測試開始前先 OCR 登入一次，寫入 .auth/member-storage.json。
 * 後續 fixture 還原 cookie，避免每個測試／重登都再跑驗證碼。
 */
export default async function globalSetup() {
  if (process.env.SKIP_GLOBAL_MEMBER_LOGIN === '1') {
    return;
  }

  const site = getSite(process.env.SITE_ID ?? 'jitabet');
  const maxAttempts = process.env.GITHUB_ACTIONS ? 3 : 2;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await openHomeAndLogin(page, site);
      await saveMemberStorage(page);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await page.waitForTimeout(2_000);
      }
    } finally {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  }

  console.warn(
    `[global-setup] 全域登入失敗（已重試 ${maxAttempts} 次），已登入測項將改為各自 OCR 登入。${String(lastError)}`,
  );
}
