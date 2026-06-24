/**
 * 從 playwright-report/index.html（show-report 同源）解析測試結果
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flattenResultSteps } from './telegram-notify-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HTML_REPORT_INDEX = path.join(ROOT, 'playwright-report', 'index.html');

function extractZipBuffer(html) {
  const m = html.match(/id="playwrightReportBase64">(data:application\/zip;base64,[^<]+)</);
  if (!m) throw new Error('HTML 報告內找不到 embedded zip（請確認是 Playwright 產生的報告）');
  return Buffer.from(m[1].replace('data:application/zip;base64,', ''), 'base64');
}

function unzipToDir(zipBuffer) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-html-report-'));
  const zipPath = path.join(tmp, 'report.zip');
  fs.writeFileSync(zipPath, zipBuffer);
  const result = spawnSync('unzip', ['-o', '-q', zipPath, '-d', tmp], { encoding: 'utf8' });
  if (result.status !== 0) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw new Error(result.stderr || '解壓 HTML 報告失敗');
  }
  return tmp;
}

function flattenHtmlSteps(steps) {
  const out = [];
  for (const step of steps || []) {
    const err = step.errors?.[0]?.message || step.error?.message || null;
    const failed = Boolean(err) || step.status === 'failed';
    if (step.title) {
      out.push({ title: step.title, status: failed ? 'failed' : 'passed', error: err });
    }
    out.push(...flattenHtmlSteps(step.steps));
  }
  return out.filter((s) => s.title);
}

function mapTestStatus(test, result) {
  if (result?.status === 'failed' || result?.status === 'timedOut') return result.status;
  if (test.ok === false || test.outcome === 'unexpected') return 'failed';
  if (test.outcome === 'skipped') return 'skipped';
  return 'passed';
}

function parseFileDetail(detail) {
  const tests = [];
  for (const test of detail.tests || []) {
    const result = test.results?.[test.results.length - 1];
    const error = result?.errors?.[0]?.message || result?.error?.message || null;
    const steps = flattenHtmlSteps(result?.steps);
    tests.push({
      testId: test.testId,
      title: test.title,
      status: mapTestStatus(test, result),
      error,
      steps: steps.length ? steps : flattenResultSteps(result?.steps),
    });
  }
  return tests;
}

/** @returns {{ generatedAt: string | null, tests: Array }} */
export function loadTestsFromHtmlReport(reportPath = HTML_REPORT_INDEX) {
  const indexPath = fs.statSync(reportPath).isDirectory()
    ? path.join(reportPath, 'index.html')
    : reportPath;

  if (!fs.existsSync(indexPath)) {
    throw new Error(`找不到 HTML 報告：${indexPath}`);
  }

  const html = fs.readFileSync(indexPath, 'utf8');
  const tmp = unzipToDir(extractZipBuffer(html));

  try {
    const summary = JSON.parse(fs.readFileSync(path.join(tmp, 'report.json'), 'utf8'));
    const fileDetails = new Map();
    for (const name of fs.readdirSync(tmp)) {
      if (!name.endsWith('.json') || name === 'report.json') continue;
      const detail = JSON.parse(fs.readFileSync(path.join(tmp, name), 'utf8'));
      fileDetails.set(detail.fileId || name.replace(/\.json$/, ''), detail);
    }

    const tests = [];
    for (const file of summary.files || []) {
      const detail = fileDetails.get(file.fileId);
      if (detail) {
        tests.push(...parseFileDetail(detail));
        continue;
      }
      for (const test of file.tests || []) {
        tests.push({
          title: test.title,
          status: test.ok === false || test.outcome === 'unexpected' ? 'failed' : 'passed',
          error: null,
          steps: [],
        });
      }
    }

    const generatedAt = summary.startTime
      ? new Date(summary.startTime).toISOString()
      : null;

    return { generatedAt, tests };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
