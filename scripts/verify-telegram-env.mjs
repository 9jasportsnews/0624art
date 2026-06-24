#!/usr/bin/env node
/**
 * 驗證 .env / 環境變數中的 Telegram 憑證（GitHub Actions 用）
 *
 *   node scripts/verify-telegram-env.mjs
 *   node scripts/verify-telegram-env.mjs --send   # 另發一則 ping
 */
import { config as loadEnv } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { notifyTelegramFromTests } from './telegram-notify-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(ROOT, '.env');

loadEnv({ path: envPath, override: true });

const token = process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
const chatId = process.env.TELEGRAM_CHAT_ID?.trim() || '';

console.log(`[verify-tg] .env 存在: ${fs.existsSync(envPath)}`);
console.log(`[verify-tg] TELEGRAM_BOT_TOKEN 長度: ${token.length}，含冒號: ${token.includes(':')}`);
console.log(`[verify-tg] TELEGRAM_CHAT_ID: ${chatId ? '已設定' : '未設定'}`);

if (!token || !chatId) {
  console.error('::error::缺少 TELEGRAM_BOT_TOKEN 或 TELEGRAM_CHAT_ID（請檢查 GitHub Secret「ENV」）');
  process.exit(1);
}

if (!token.includes(':') || token.length < 25) {
  console.error('::error::TELEGRAM_BOT_TOKEN 格式異常（可能被 GITHUB_ENV 截斷，應含冒號且長度 > 25）');
  process.exit(1);
}

if (process.argv.includes('--send')) {
  const outcome = await notifyTelegramFromTests(
    [
      {
        title: 'GitHub Actions TG 驗證（verify-telegram-env）',
        status: 'passed',
        error: null,
        steps: [],
      },
    ],
    { always: true },
  );
  if (!outcome.sent) {
    console.error(`::error::TG 推送失敗：${outcome.reason || 'unknown'}`);
    process.exit(1);
  }
  console.log('✓ TG 驗證訊息已推送');
}
