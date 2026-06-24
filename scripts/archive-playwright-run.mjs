/**
 * 將本輪 playwright-report / test-results / last-run.json 複製到 reports/runs/<時間戳>/
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAST_RUN_JSON } from './telegram-notify-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNS_DIR = path.join(ROOT, 'reports', 'runs');

function formatRunStamp(date = new Date()) {
  const p = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type) => p.find((x) => x.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}_${get('hour')}-${get('minute')}-${get('second')}`;
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.cpSync(src, dest, { recursive: true });
  return true;
}

/** @returns {string} 留存目錄路徑 */
export function archivePlaywrightRun(date = new Date()) {
  const stamp = formatRunStamp(date);
  const dest = path.join(RUNS_DIR, stamp);
  fs.mkdirSync(dest, { recursive: true });

  const copied = [];
  if (copyDir(path.join(ROOT, 'playwright-report'), path.join(dest, 'playwright-report'))) {
    copied.push('playwright-report');
  }
  if (copyDir(path.join(ROOT, 'test-results'), path.join(dest, 'test-results'))) {
    copied.push('test-results');
  }
  if (fs.existsSync(LAST_RUN_JSON)) {
    fs.copyFileSync(LAST_RUN_JSON, path.join(dest, 'last-run.json'));
    copied.push('last-run.json');
  }

  fs.writeFileSync(
    path.join(dest, 'meta.json'),
    JSON.stringify(
      {
        archivedAt: new Date().toISOString(),
        archivedAtTaipei: stamp.replace('_', ' ').replace(/-/g, (m, i) => (i > 9 ? ':' : m)),
        homeUrl: process.env.HOME_URL || null,
        copied,
      },
      null,
      2,
    ),
    'utf8',
  );

  return dest;
}
