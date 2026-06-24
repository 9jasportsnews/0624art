#!/usr/bin/env node
/**
 * 從 playwright-report（show-report 同源）推送 Telegram。
 * 失敗與通過都會推送（手動觸發）。
 *
 *   npm run notify:report
 */
import { config as loadEnv } from 'dotenv';
import { HTML_REPORT_INDEX, loadTestsFromHtmlReport } from './read-html-report.mjs';
import { notifyTelegramFromTests } from './telegram-notify-core.mjs';

loadEnv();

async function main() {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.error('請在 .env 設定 TELEGRAM_BOT_TOKEN 與 TELEGRAM_CHAT_ID');
    process.exit(1);
  }

  const { tests, generatedAt } = loadTestsFromHtmlReport(HTML_REPORT_INDEX);
  if (!tests.length) {
    console.error('HTML 報告內沒有測試項目');
    process.exit(1);
  }

  const outcome = await notifyTelegramFromTests(tests, { always: true, generatedAt });
  if (!outcome.sent) {
    console.log('未推送');
    process.exit(1);
  }
  console.log(
    outcome.failed
      ? `已推送 Telegram（${outcome.failed} 項失敗）`
      : '已推送 Telegram（本次檢測無誤）',
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
