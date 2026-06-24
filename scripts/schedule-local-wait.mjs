#!/usr/bin/env node
/**
 * 等到指定時間後執行 test:recorded（背景常駐）
 *
 *   node scripts/schedule-local-wait.mjs 10:30
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv[2];
const LOG = '/tmp/playwright-scheduled.log';

function parseTarget(input) {
  const now = new Date();
  if (/^\d{1,2}:\d{2}$/.test(input)) {
    const [h, m] = input.split(':').map(Number);
    const target = new Date(now);
    target.setHours(h, m, 0, 0);
    if (target <= now) throw new Error(`時間 ${input} 已過`);
    return target;
  }
  const target = new Date(input);
  if (Number.isNaN(target.getTime()) || target <= now) {
    throw new Error('請提供有效的未來時間');
  }
  return target;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSuite() {
  const stamp = new Date().toISOString();
  const header = `\n===== ${stamp} 開始執行 test:recorded =====\n`;
  await fsAppend(LOG, header);

  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/run-recorded-suite.mjs'], {
      cwd: ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (c) => fsAppend(LOG, c));
    child.stderr.on('data', (c) => fsAppend(LOG, c));
    child.on('close', (code) => resolve(code ?? 1));
  });
}

function fsAppend(file, chunk) {
  return fs.promises.appendFile(file, chunk);
}

async function main() {
  if (!arg) {
    console.error('用法：node scripts/schedule-local-wait.mjs <HH:mm>');
    process.exit(1);
  }

  const target = parseTarget(arg);
  const waitMs = target.getTime() - Date.now();

  if (process.env.SCHEDULE_WAIT_FORK !== '1') {
    const child = spawn(process.execPath, [process.argv[1], arg], {
      cwd: ROOT,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, SCHEDULE_WAIT_FORK: '1' },
    });
    child.unref();
    console.log(
      `已背景排程：${target.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })} 執行 npm run test:recorded`,
    );
    console.log(`日誌：${LOG}`);
    return;
  }

  await sleep(waitMs);
  const code = await runSuite();
  await fsAppend(LOG, `\n===== 結束 exit=${code} =====\n`);
  process.exit(code);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
