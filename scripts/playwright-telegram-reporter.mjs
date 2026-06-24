/**
 * Playwright reporter：測試結束後自動推送 Telegram（與 show-report 同一輪結果）
 */
import { config as loadEnv } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  flattenResultSteps,
  notifyTelegramFromTests,
  shortTitle,
} from './telegram-notify-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({
  path: path.join(ROOT, '.env'),
  override: process.env.GITHUB_ACTIONS === 'true',
});

/** @implements {import('@playwright/test/reporter').Reporter} */
class PlaywrightTelegramReporter {
  constructor() {
    /** @type {Array<{ title: string, status: string, error: string | null, steps: unknown[] }>} */
    this.tests = [];
  }

  onTestEnd(test, result) {
    const fullTitle = test.titlePath().join(' › ');
    this.tests.push({
      title: shortTitle(fullTitle),
      fullTitle,
      status: result.status,
      error: result.error?.message || null,
      steps: flattenResultSteps(result.steps),
    });
  }

  async onEnd() {
    if (process.env.TELEGRAM_AUTO_NOTIFY === '0') return;

    if (this.tests.length === 0) {
      console.warn('\n[telegram] 未推送：本輪沒有執行任何測試（例如 --list 或篩選為 0 項）');
      return;
    }

    try {
      const outcome = await notifyTelegramFromTests(this.tests);
      if (outcome.sent) {
        console.log(`\n[telegram] 已推送（${outcome.failed ? `${outcome.failed} 項失敗` : '全部通過'}）`);
      } else {
        console.warn(`\n[telegram] 未推送：${outcome.reason || 'unknown'}`);
      }
    } catch (error) {
      console.warn(`[telegram] 推送失敗：${error.message || error}`);
    }
  }
}

export default PlaywrightTelegramReporter;
