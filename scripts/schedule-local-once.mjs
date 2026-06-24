#!/usr/bin/env node
/**
 * 本機一次性排程（macOS `at`）
 *
 *   node scripts/schedule-local-once.mjs 10:30
 *   node scripts/schedule-local-once.mjs 2026-06-23T10:30
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv[2];

if (!arg) {
  console.error('用法：node scripts/schedule-local-once.mjs <HH:mm> 或 <YYYY-MM-DDTHH:mm>');
  process.exit(1);
}

const now = new Date();
let target;

if (/^\d{1,2}:\d{2}$/.test(arg)) {
  const [h, m] = arg.split(':').map(Number);
  target = new Date(now);
  target.setHours(h, m, 0, 0);
  if (target <= now) {
    console.error(`時間 ${arg} 已過，請指定未來時間。`);
    process.exit(1);
  }
} else {
  target = new Date(arg);
  if (Number.isNaN(target.getTime()) || target <= now) {
    console.error('請提供有效的未來時間。');
    process.exit(1);
  }
}

const nodeBin = process.execPath;
const logFile = '/tmp/playwright-scheduled.log';
const job = `cd ${ROOT} && ${nodeBin} scripts/run-recorded-suite.mjs >> ${logFile} 2>&1`;

const atTime = target.toLocaleTimeString('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: false,
});
const atDate = target.toLocaleDateString('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const checkAt = spawnSync('which', ['at'], { encoding: 'utf8' });
if (checkAt.status !== 0) {
  console.error('找不到 `at` 指令。macOS 可至「系統設定 → 一般 → 登入項目與延伸功能」確認，或改用手動：');
  console.error(`  ${job}`);
  process.exit(1);
}

const result = spawnSync('at', [atTime, atDate], {
  input: job,
  encoding: 'utf8',
});

if (result.status !== 0) {
  console.error(result.stderr || result.stdout || '排程失敗');
  console.error('\n若 macOS 禁止 at，請手動在 10:30 執行：');
  console.error(`  npm run test:recorded`);
  process.exit(result.status ?? 1);
}

console.log(`已排程本機執行：${target.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`);
console.log(result.stdout.trim());
console.log(`日誌：${logFile}`);
console.log('查看排程：atq');
console.log('取消排程：atrm <job id>');
