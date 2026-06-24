#!/usr/bin/env node
/**
 * 從 test-summary.json 產生易讀的 PDF 表格報告。
 *
 * 用法：
 *   node scripts/export-test-summary-pdf.mjs [json路徑] [輸出pdf路徑]
 *
 * 預設讀取：reports/test-summary.json
 * 預設輸出：reports/test-summary.pdf
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultInput = path.join(ROOT, 'reports', 'test-summary.json');
const inputPath = path.resolve(ROOT, process.argv[2] || defaultInput);
const outputPath = process.argv[3]
  ? path.resolve(ROOT, process.argv[3])
  : path.join(ROOT, 'reports', 'test-summary.pdf');

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function splitTitle(title) {
  const parts = String(title || '').split(' › ').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return { file: '—', suite: '—', name: '—' };

  const file = parts[0].replace(/^recorded\//, '').replace(/\.spec\.ts$/, '');
  if (parts.length === 1) return { file, suite: '—', name: parts[0] };
  if (parts.length === 2) return { file, suite: '—', name: parts[1] };
  return {
    file,
    suite: parts.slice(1, -1).join(' › '),
    name: parts[parts.length - 1],
  };
}

function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function statusClass(status) {
  if (status === 'passed') return 'pass';
  if (status === 'skipped') return 'skip';
  return 'fail';
}

function buildHtml(payload) {
  const { generatedAt, summary, tests } = payload;
  const rows = (tests || []).map((test, index) => {
    const { file, suite, name } = splitTitle(test.title);
    return `
      <tr>
        <td class="num">${index + 1}</td>
        <td class="file">${escapeHtml(file)}</td>
        <td class="suite">${escapeHtml(suite)}</td>
        <td class="name">${escapeHtml(name)}</td>
        <td class="status ${statusClass(test.status)}">${escapeHtml(test.statusLabel || test.status)}</td>
        <td class="error">${escapeHtml(test.error || '')}</td>
      </tr>`;
  });

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8" />
  <title>檢測結果匯出</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 14mm 12mm 16mm;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      color: #1f2937;
      font-family: "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif;
      font-size: 11px;
      line-height: 1.45;
    }

    h1 {
      margin: 0 0 6px;
      font-size: 20px;
      font-weight: 700;
      color: #111827;
    }

    .meta {
      margin-bottom: 14px;
      color: #4b5563;
      font-size: 12px;
    }

    .summary {
      display: flex;
      gap: 10px;
      margin-bottom: 14px;
    }

    .chip {
      border: 1px solid #d1d5db;
      border-radius: 999px;
      padding: 4px 12px;
      background: #f9fafb;
      font-size: 12px;
    }

    .chip strong { color: #111827; }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    thead {
      display: table-header-group;
    }

    tr {
      page-break-inside: avoid;
    }

    th, td {
      border: 1px solid #d1d5db;
      padding: 7px 8px;
      vertical-align: top;
      word-break: break-word;
    }

    th {
      background: #111827;
      color: #fff;
      font-weight: 600;
      text-align: left;
    }

    tbody tr:nth-child(even) td {
      background: #f9fafb;
    }

    .num { width: 34px; text-align: center; }
    .file { width: 12%; }
    .suite { width: 18%; }
    .name { width: 24%; }
    .status { width: 8%; text-align: center; font-weight: 700; }
    .error { width: 28%; color: #6b7280; font-size: 10px; }

    .status.pass { color: #047857; }
    .status.fail { color: #b91c1c; }
    .status.skip { color: #92400e; }

    .footer {
      margin-top: 10px;
      color: #9ca3af;
      font-size: 10px;
      text-align: right;
    }
  </style>
</head>
<body>
  <h1>檢測結果匯出</h1>
  <div class="meta">產生時間：${escapeHtml(formatTime(generatedAt))}</div>
  <div class="summary">
    <div class="chip">總計 <strong>${summary?.total ?? 0}</strong> 項</div>
    <div class="chip">通過 <strong>${summary?.passed ?? 0}</strong></div>
    <div class="chip">失敗 <strong>${summary?.failed ?? 0}</strong></div>
    <div class="chip">略過 <strong>${summary?.skipped ?? 0}</strong></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>測試檔案</th>
        <th>區塊</th>
        <th>檢測項目</th>
        <th>結果</th>
        <th>錯誤說明</th>
      </tr>
    </thead>
    <tbody>
      ${rows.join('')}
    </tbody>
  </table>
  <div class="footer">check-web-playwright</div>
</body>
</html>`;
}

async function main() {
  if (!fs.existsSync(inputPath)) {
    console.error(`找不到摘要：${inputPath}`);
    console.error('請先執行：npm run report:export 或 npm run report:merge-export');
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const html = buildHtml(payload);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({
      path: outputPath,
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' },
    });
  } finally {
    await browser.close();
  }

  console.log(`已匯出：${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
