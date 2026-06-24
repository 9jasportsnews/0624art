#!/usr/bin/env node
/**
 * 影片播放檢測 → 推送 Telegram（不產 PDF）
 *
 *   npm run notify:video-playback
 *   npm run notify:video-playback:only   # 沿用既有 JSON
 */
import { config as loadEnv } from 'dotenv';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSON_PATH, runVideoPlaybackTests } from './video-playback-run.mjs';

loadEnv();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skipRun = process.argv.includes('--skip-run');

if (!skipRun) {
  runVideoPlaybackTests();
} else if (!fs.existsSync(JSON_PATH)) {
  console.error(`找不到 ${JSON_PATH}，請先執行：npm run notify:video-playback`);
  process.exit(1);
}

const result = spawnSync('node', ['scripts/notify-telegram.mjs', JSON_PATH], {
  cwd: ROOT,
  stdio: 'inherit',
  env: process.env,
});
process.exit(result.status ?? 1);
