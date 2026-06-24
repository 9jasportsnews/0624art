#!/usr/bin/env node
/**
 * 播放清單區內嵌影片檢測（結束後自動推 TG，並產生 show-report 用的 HTML 報告）
 *
 *   npm run notify:playlist
 *   npm run notify:playlist:only   # 沿用 reports/last-run.json 只推 TG
 */
import { config as loadEnv } from 'dotenv';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAST_RUN_JSON, notifyTelegramFromTests } from './telegram-notify-core.mjs';

loadEnv();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = 'tests/recorded/homepage-index.spec.ts';
const GREP = '播放清單區內嵌影片';
const skipRun = process.argv.includes('--skip-run');

if (!skipRun) {
  console.log('正在執行：播放清單區內嵌影片應可正常播放…');
  const result = spawnSync(
    'npx',
    ['playwright', 'test', SPEC, '--grep', GREP],
    { cwd: ROOT, stdio: 'inherit', env: process.env },
  );
  process.exit(result.status ?? 1);
}

if (!fs.existsSync(LAST_RUN_JSON)) {
  console.error(`找不到 ${LAST_RUN_JSON}，請先執行：npm run notify:playlist`);
  process.exit(1);
}

const { tests, generatedAt } = JSON.parse(fs.readFileSync(LAST_RUN_JSON, 'utf8'));
notifyTelegramFromTests(tests, { always: true, generatedAt })
  .then((outcome) => {
    if (outcome.sent) console.log(`已推送 Telegram（${outcome.failed ? `${outcome.failed} 項失敗` : '全部通過'}）`);
    else console.log('未推送');
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
