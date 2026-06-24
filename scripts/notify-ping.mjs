#!/usr/bin/env node
/**
 * 不跑瀏覽器，只驗證 Telegram 憑證與推送是否正常。
 *
 *   npm run notify:ping
 */
import { notifyTelegramFromTests } from './telegram-notify-core.mjs';

const outcome = await notifyTelegramFromTests(
  [
    {
      title: 'TG 連線測試（notify:ping）',
      status: 'passed',
      error: null,
      steps: [{ title: '推送測試訊息', status: 'passed', error: null }],
    },
  ],
  { always: true },
);

if (outcome.sent) {
  console.log('✓ Telegram 已推送（notify:ping）');
  process.exit(0);
}

console.error(`✗ 未推送：${outcome.reason || 'unknown'}`);
process.exit(1);
