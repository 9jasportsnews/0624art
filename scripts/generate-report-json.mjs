import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCaseResults,
  copyHtmlReport,
  loadTestCases,
  parsePlaywrightReport,
  suiteToPlaywrightArgs,
} from './report-utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.join(ROOT, 'dashboard', '.build-report.json');
const outDir = path.join(ROOT, 'dashboard', 'public', 'data');
const outPath = path.join(outDir, 'latest-report.json');

const cases = loadTestCases(ROOT);

// 與 Playwright spec 標題對齊（不一致時 build 失敗）
const syncCheck = spawnSync('node', ['scripts/sync-test-cases.mjs'], { cwd: ROOT, stdio: 'inherit' });
if (syncCheck.status !== 0) {
  process.exit(syncCheck.status ?? 1);
}
const suite = process.env.NETLIFY_TEST_SUITE || 'all';
const { args, grep } = suiteToPlaywrightArgs(suite, cases);
const startedAt = new Date().toISOString();

if (process.env.NETLIFY_SKIP_PLAYWRIGHT === 'true') {
  console.warn('NETLIFY_SKIP_PLAYWRIGHT=true：跳過建置時執行 Playwright，沿用既有 latest-report.json（若存在）。');
  if (fs.existsSync(outPath)) {
    console.log(`沿用報告：${outPath}`);
    process.exit(0);
  }
  const placeholder = {
    ok: false,
    exitCode: 0,
    suite,
    generatedAt: new Date().toISOString(),
    startedAt,
    finishedAt: new Date().toISOString(),
    summary: { total: cases.length, passed: 0, failed: 0, skipped: 0, durationMs: 0 },
    tests: [],
    cases,
    caseResults: buildCaseResults(cases, [], suite),
    playwrightReportUrl: null,
    stderr: '建置時未執行 Playwright（NETLIFY_SKIP_PLAYWRIGHT=true）',
    message: '請在本機執行 npm run build:netlify 後 commit latest-report.json，或使用 Build Hook 觸發含測試的建置。',
  };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(placeholder, null, 2), 'utf8');
  console.log(`已寫入占位報告：${outPath}`);
  process.exit(0);
}

const playwrightArgs = [
  'playwright',
  'test',
  '--reporter=json',
  '--reporter=html',
  ...args,
];
if (grep) {
  playwrightArgs.push('-g', grep);
}

const result = spawnSync('npx', playwrightArgs, {
  cwd: ROOT,
  env: {
    ...process.env,
    PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath,
    FORCE_COLOR: '0',
  },
  encoding: 'utf8',
  shell: process.platform === 'win32',
});

let report = null;
let tests = [];

if (fs.existsSync(reportPath)) {
  try {
    report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    tests = parsePlaywrightReport(report, cases);
  } catch {
    /* ignore */
  }
}

const stats = report?.stats || {};
const hasHtmlReport = copyHtmlReport(ROOT);

const caseResults = buildCaseResults(cases, tests, suite);
const casePassed = caseResults.filter((r) => r.status === 'passed').length;
const caseFailed = caseResults.filter((r) => r.status === 'failed').length;
const caseSkipped = caseResults.filter((r) => r.status === 'skipped').length;
const casePending = caseResults.filter((r) => r.status === 'pending').length;

const payload = {
  ok: result.status === 0,
  exitCode: result.status ?? 1,
  suite,
  generatedAt: new Date().toISOString(),
  startedAt,
  finishedAt: new Date().toISOString(),
  summary: {
    total: caseResults.length || (stats.expected ?? 0) + (stats.unexpected ?? 0) + (stats.skipped ?? 0),
    passed: casePending === 0 ? casePassed : (stats.expected ?? casePassed),
    failed: casePending === 0 ? caseFailed : (stats.unexpected ?? caseFailed),
    skipped: stats.skipped ?? caseSkipped,
    durationMs: stats.duration ?? tests.reduce((s, t) => s + t.durationMs, 0),
  },
  tests,
  cases,
  caseResults,
  playwrightReportUrl: hasHtmlReport ? '/playwright-report/index.html' : null,
  stderr: (result.stderr || '').slice(-4000) || null,
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
const suiteOutPath = path.join(outDir, 'reports', `${suite}.json`);
fs.mkdirSync(path.dirname(suiteOutPath), { recursive: true });
fs.writeFileSync(suiteOutPath, JSON.stringify(payload, null, 2), 'utf8');

console.log(`報告已寫入：${outPath}`);
console.log(`結果：${payload.ok ? '通過' : '有失敗'}（${payload.summary.passed}/${payload.summary.total}）`);

if (!fs.existsSync(reportPath)) {
  console.warn(`警告：找不到 Playwright JSON 報告（${reportPath}），可能未成功啟動瀏覽器。`);
}
if (!tests.length) {
  console.warn('警告：未解析到任何測試結果。請確認已執行 npx playwright install chromium。');
}
if (result.status !== 0) {
  if (result.stdout) console.warn(result.stdout.slice(-3000));
  if (result.stderr) console.warn(result.stderr.slice(-3000));
}

// 預設仍部署儀表板（失敗結果也會寫入 latest-report.json）
const failBuild = process.env.NETLIFY_FAIL_BUILD_ON_TEST_FAILURE === 'true';
if (!payload.ok && failBuild) {
  console.error('NETLIFY_FAIL_BUILD_ON_TEST_FAILURE=true，檢測未通過，中止建置。');
  process.exit(1);
}
if (!payload.ok) {
  console.warn(
    '檢測未全部通過，仍會完成 Netlify 建置並發布儀表板。若要在失敗時中止建置，請設 NETLIFY_FAIL_BUILD_ON_TEST_FAILURE=true',
  );
}
process.exit(0);
