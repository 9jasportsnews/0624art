#!/usr/bin/env node
/**
 * 一次跑完 tests/recorded，結束後留存報告並自動推 TG（playwright.config reporter）
 *
 *   npm run test:recorded
 */
import { config as loadEnv } from 'dotenv';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { archivePlaywrightRun } from './archive-playwright-run.mjs';

loadEnv();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

console.log('開始執行：tests/recorded（一次跑完）…');
console.log(`HOME_URL=${process.env.HOME_URL || '(未設定)'}`);

const result = spawnSync('npx', ['playwright', 'test', 'tests/recorded'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: process.env,
});

const archiveDir = archivePlaywrightRun();
console.log(`\n報告已留存：${archiveDir}`);
console.log(`本機查看：npx playwright show-report ${path.join(archiveDir, 'playwright-report')}`);

process.exit(result.status ?? 1);
