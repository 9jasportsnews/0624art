#!/usr/bin/env node
/**
 * 從 Playwright JSON 報告匯出簡要清單（項目 / 通過失敗 / 錯誤說明）
 *
 * 用法：
 *   node scripts/export-test-summary.mjs [json路徑] [輸出路徑]
 *
 * 預設讀取：reports/merged-report.json
 * 預設輸出：reports/test-summary.md、reports/test-summary.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePlaywrightReport } from './report-utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultInput = path.join(ROOT, 'reports', 'merged-report.json');
const inputPath = path.resolve(ROOT, process.argv[2] || defaultInput);
const outBase = process.argv[3]
  ? path.resolve(ROOT, process.argv[3])
  : path.join(ROOT, 'reports', 'test-summary');

function statusLabel(status) {
  if (status === 'passed') return '通過';
  if (status === 'failed') return '失敗';
  if (status === 'timedOut') return '逾時';
  if (status === 'skipped') return '略過';
  if (status === 'interrupted') return '中斷';
  return status || '未知';
}

function statusIcon(status) {
  if (status === 'passed') return '✓';
  if (status === 'skipped') return '−';
  return '✗';
}

function shortenError(message) {
  if (!message) return '';
  return String(message)
    .replace(/\u001b\[[0-9;]*m/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' ')
    .slice(0, 500);
}

function main() {
  if (!fs.existsSync(inputPath)) {
    console.error(`找不到報告：${inputPath}`);
    console.error('請先執行：npm run report:merge');
    process.exit(1);
  }

  const report = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const tests = parsePlaywrightReport(report).sort((a, b) =>
    (a.title || '').localeCompare(b.title || '', 'zh-Hant'),
  );

  const passed = tests.filter((t) => t.status === 'passed').length;
  const failed = tests.filter((t) => t.status === 'failed' || t.status === 'timedOut').length;
  const skipped = tests.filter((t) => t.status === 'skipped').length;
  const generatedAt = new Date().toISOString();

  const rows = tests.map((t) => ({
    title: t.title,
    status: t.status,
    statusLabel: statusLabel(t.status),
    error: shortenError(t.error),
  }));

  const mdLines = [
    '# 檢測結果匯出',
    '',
    `- 產生時間：${generatedAt}`,
    `- 總計：${tests.length} 項（通過 ${passed} / 失敗 ${failed} / 略過 ${skipped}）`,
    '',
    '| 檢測項目 | 結果 | 錯誤說明 |',
    '| --- | --- | --- |',
    ...rows.map((r) => {
      const err = (r.error || '').replace(/\|/g, '\\|');
      return `| ${r.title} | ${statusIcon(r.status)} ${r.statusLabel} | ${err} |`;
    }),
    '',
  ];

  const jsonPayload = {
    generatedAt,
    summary: { total: tests.length, passed, failed, skipped },
    tests: rows,
  };

  fs.mkdirSync(path.dirname(outBase), { recursive: true });
  const mdPath = outBase.endsWith('.md') ? outBase : `${outBase}.md`;
  const jsonPath = outBase.endsWith('.json') ? outBase : `${outBase}.json`;

  fs.writeFileSync(mdPath, mdLines.join('\n'), 'utf8');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonPayload, null, 2), 'utf8');

  console.log(`已匯出：${mdPath}`);
  console.log(`已匯出：${jsonPath}`);
  console.log(`摘要：通過 ${passed} / 失敗 ${failed} / 略過 ${skipped}（共 ${tests.length}）`);
}

main();
