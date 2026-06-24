#!/usr/bin/env node
/**
 * 合併 blob-runs/ 內多次分開測試的結果，並匯出簡要清單。
 *
 * Playwright merge-reports 只接受「單一目錄內多個 .zip」，
 * 因此會先把 blob-runs/<名稱>/report*.zip 複製到暫存目錄再合併。
 *
 * 用法：
 *   npm run report:merge
 *   npm run report:merge-export   # 合併 + 匯出 md/json
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePlaywrightReport } from './report-utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const blobRoot = path.join(ROOT, 'blob-runs');
const stagingDir = path.join(blobRoot, '.merge-staging');
const mergedJson = path.join(ROOT, 'reports', 'merged-report.json');
const mergedHtmlDir = path.join(ROOT, 'reports', 'merged-html');

function listBlobZips() {
  if (!fs.existsSync(blobRoot)) return [];

  const zips = [];
  for (const entry of fs.readdirSync(blobRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const dir = path.join(blobRoot, entry.name);
    for (const file of fs.readdirSync(dir)) {
      if (/^report.*\.zip$/i.test(file)) {
        zips.push({
          label: entry.name,
          src: path.join(dir, file),
          destName: `${entry.name}.zip`,
        });
      }
    }
  }

  return zips.sort((a, b) => a.label.localeCompare(b.label, 'en'));
}

function prepareStaging(zips) {
  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });

  for (const zip of zips) {
    fs.copyFileSync(zip.src, path.join(stagingDir, zip.destName));
  }
}

/** 同一測試若出現在多次 run，保留較佳結果（通過優先，其次較晚的 zip） */
function dedupeTests(tests) {
  const byTitle = new Map();

  for (const test of tests) {
    const prev = byTitle.get(test.title);
    if (!prev) {
      byTitle.set(test.title, test);
      continue;
    }

    const prevFailed = prev.status === 'failed' || prev.status === 'timedOut';
    const curFailed = test.status === 'failed' || test.status === 'timedOut';
    if (prevFailed && !curFailed) {
      byTitle.set(test.title, test);
    } else if (!prevFailed && curFailed) {
      continue;
    } else {
      byTitle.set(test.title, test);
    }
  }

  return [...byTitle.values()];
}

function applyDedupeToReport(report) {
  const tests = dedupeTests(parsePlaywrightReport(report));
  const passed = tests.filter((t) => t.status === 'passed').length;
  const failed = tests.filter((t) => t.status === 'failed' || t.status === 'timedOut').length;
  const skipped = tests.filter((t) => t.status === 'skipped').length;

  return {
    ...report,
    stats: {
      ...(report.stats || {}),
      expected: passed,
      unexpected: failed,
      skipped,
    },
    suites: [
      {
        title: '',
        specs: tests.map((t) => ({
          title: t.title,
          file: t.file,
          tests: [
            {
              results: [
                {
                  status: t.status,
                  duration: t.durationMs,
                  error: t.error ? { message: t.error } : undefined,
                  steps: [],
                  attachments: t.attachments || [],
                },
              ],
            },
          ],
        })),
      },
    ],
  };
}

function main() {
  const zips = listBlobZips();
  if (!zips.length) {
    console.error('blob-runs/ 內沒有可合併的測試結果。');
    console.error('');
    console.error('每次分開測完後請先備份：');
    console.error('  npx playwright test <檔案> --reporter=blob');
    console.error('  npm run report:save -- <備份名稱>');
    process.exit(1);
  }

  prepareStaging(zips);
  fs.mkdirSync(path.dirname(mergedJson), { recursive: true });
  fs.mkdirSync(mergedHtmlDir, { recursive: true });

  const result = spawnSync(
    'npx',
    ['playwright', 'merge-reports', stagingDir, '--reporter', 'json,html'],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        PLAYWRIGHT_JSON_OUTPUT_NAME: mergedJson,
        PLAYWRIGHT_HTML_OUTPUT_DIR: mergedHtmlDir,
        FORCE_COLOR: '0',
      },
      encoding: 'utf8',
      shell: process.platform === 'win32',
    },
  );

  if (!fs.existsSync(mergedJson)) {
    console.error('合併失敗：未產生 merged-report.json');
    if (result.stderr) console.error(result.stderr.slice(-2000));
    if (result.stdout) console.error(result.stdout.slice(-2000));
    process.exit(result.status ?? 1);
  }

  const raw = JSON.parse(fs.readFileSync(mergedJson, 'utf8'));
  const deduped = applyDedupeToReport(raw);
  fs.writeFileSync(mergedJson, JSON.stringify(deduped, null, 2), 'utf8');

  const tests = parsePlaywrightReport(deduped);
  const passed = tests.filter((t) => t.status === 'passed').length;
  const failed = tests.filter((t) => t.status === 'failed' || t.status === 'timedOut').length;

  console.log(`已合併 ${zips.length} 次測試備份（${tests.length} 項）→ ${mergedJson}`);
  console.log(`摘要：通過 ${passed} / 失敗 ${failed}`);
  if (fs.existsSync(path.join(mergedHtmlDir, 'index.html'))) {
    console.log(`HTML 報告：${path.join(mergedHtmlDir, 'index.html')}`);
  }

  if (process.argv.includes('--export') || process.env.REPORT_EXPORT === '1') {
    const exportResult = spawnSync('node', ['scripts/export-test-summary.mjs', mergedJson], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    if (exportResult.status !== 0) process.exit(exportResult.status ?? 1);

    const pdfResult = spawnSync('node', ['scripts/export-test-summary-pdf.mjs'], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    process.exit(pdfResult.status ?? 0);
  }
}

main();
