#!/usr/bin/env node
/**
 * 從 JSON 報告推送 Telegram。
 *
 *   npm run notify:telegram
 *   npm run notify:telegram -- reports/last-run.json
 */
import { config as loadEnv } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePlaywrightReport } from './report-utils.mjs';
import { HTML_REPORT_INDEX, loadTestsFromHtmlReport } from './read-html-report.mjs';
import {
  LAST_RUN_JSON,
  notifyTelegramFromTests,
  shortTitle,
} from './telegram-notify-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({
  path: path.join(ROOT, '.env'),
  override: process.env.GITHUB_ACTIONS === 'true',
});

const argv = process.argv.slice(2);
const notifyAlways = argv.includes('--always');
const inputArg = argv.find((a) => !a.startsWith('--'));

function defaultReportPath() {
  const candidates = [
    LAST_RUN_JSON,
    HTML_REPORT_INDEX,
    path.join(ROOT, 'reports', 'playlist-run.json'),
    path.join(ROOT, 'reports', 'video-playback-run.json'),
    path.join(ROOT, 'dashboard', 'public', 'data', 'latest-report.json'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || LAST_RUN_JSON;
}

const reportPath = path.resolve(ROOT, inputArg || defaultReportPath());

function isHtmlReportPath(p) {
  if (!fs.existsSync(p)) return false;
  const stat = fs.statSync(p);
  if (stat.isDirectory()) return fs.existsSync(path.join(p, 'index.html'));
  return p.endsWith(`${path.sep}playwright-report${path.sep}index.html`) || p.includes('playwright-report');
}

const fromHtmlReport = isHtmlReportPath(reportPath);

function loadTests(report) {
  if (Array.isArray(report.tests) && report.tests.length) {
    return report.tests.map((t) => ({
      title: t.title || shortTitle(t.label || t.title),
      status: t.status,
      error: t.error,
      steps: t.steps || [],
    }));
  }
  return parsePlaywrightReport(report).map((t) => ({
    title: t.label || shortTitle(t.title),
    status: t.status,
    error: t.error,
    steps: t.steps || [],
  }));
}

async function main() {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.error('請在 .env 設定 TELEGRAM_BOT_TOKEN 與 TELEGRAM_CHAT_ID');
    process.exit(1);
  }

  let tests;
  let generatedAt;
  let runEnvironment;

  if (fromHtmlReport) {
    ({ tests, generatedAt } = loadTestsFromHtmlReport(reportPath));
  } else {
    if (!fs.existsSync(reportPath)) {
      console.error(`找不到報告：${reportPath}`);
      console.error('請先跑測試：npx playwright test …');
      process.exit(1);
    }
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    tests = loadTests(report);
    generatedAt = report.generatedAt || report.finishedAt;
    runEnvironment = report.runEnvironment;
  }

  const outcome = await notifyTelegramFromTests(tests, {
    always: notifyAlways,
    generatedAt,
    runEnvironment,
  });

  if (!outcome.sent) {
    console.log(outcome.reason === 'all-passed' ? '全部通過，略過 Telegram 推送' : '未推送');
    return;
  }
  console.log(`已推送 Telegram（${outcome.failed ? `${outcome.failed} 項失敗` : '全部通過'}）`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
