#!/usr/bin/env node
/**
 * 將本次 blob-report 備份到 blob-runs/<名稱>，供之後合併匯出。
 *
 * 用法：
 *   npx playwright test tests/recorded/homepage-index.spec.ts --reporter=blob
 *   npm run report:save -- homepage-index
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(ROOT, 'blob-report');
const label = process.argv[2] || new Date().toISOString().replace(/[:.]/g, '-');
const dest = path.join(ROOT, 'blob-runs', label);

if (!fs.existsSync(src)) {
  console.error('找不到 blob-report/，請先用 --reporter=blob 執行測試。');
  process.exit(1);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log(`已備份本次測試結果 → blob-runs/${label}`);
