/**
 * Telegram 通知共用邏輯（notify-telegram.mjs、Playwright reporter 共用）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import {
  describeTestContent,
  displayTestTitle,
  explainTestFailure,
  findFailedStepLabel,
} from './report-humanize.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LAST_RUN_JSON = path.join(ROOT, 'reports', 'last-run.json');
const TG_MAX = 4096;

export function formatTime(iso) {
  const d = iso ? new Date(iso) : new Date();
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
}

export function shortTitle(title) {
  const parts = String(title || '').split(' › ');
  return parts[parts.length - 1] || title || '未知項目';
}

function isTechnicalStep(title) {
  return /^(Before Hooks|After Hooks|Worker Cleanup|Evaluate locator)/i.test(title || '');
}

export function flattenResultSteps(steps, out = []) {
  for (const step of steps || []) {
    if (step.title && !isTechnicalStep(step.title)) {
      out.push({
        title: step.title,
        status: step.error ? 'failed' : 'passed',
        error: step.error?.message || step.error || null,
      });
    }
    flattenResultSteps(step.steps, out);
  }
  return out;
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function shortHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url || '—';
  }
}

function inferSuiteLabel(tests) {
  const titles = tests.map((t) => t.title).join(' ');
  if (/播放清單|YouTube|影片|MP4|video/i.test(titles)) return '首頁影片檢測';
  if (/download|下載/i.test(titles)) return '下載功能檢測';
  if (/選單|menu|右側/i.test(titles)) return '選單檢測';
  return '網站檢測';
}

/** 區分本機手動跑測 vs GitHub Actions 定時／手動觸發 */
export function resolveRunEnvironmentLabel() {
  if (process.env.GITHUB_ACTIONS === 'true') {
    const workflow = process.env.GITHUB_WORKFLOW?.trim();
    return workflow ? `GitHub Actions · ${workflow}` : 'GitHub Actions';
  }
  return '本機';
}

function formatFailedTestBlock(test) {
  const reason = explainTestFailure(test.error, test.steps);
  const failedStep = findFailedStepLabel(test.steps);
  const lines = [
    `✗ ${escapeHtml(displayTestTitle(test))}`,
    `  <b>原因</b> ${escapeHtml(reason)}`,
  ];
  if (failedStep) lines.push(`  <b>失敗於</b> ${escapeHtml(failedStep)}`);
  return lines.join('\n');
}

function formatPassedTestBlock(test) {
  const lines = [`✓ ${escapeHtml(displayTestTitle(test))}`];
  const details = describeTestContent(test.title, test.fullTitle);
  if (details?.length) {
    for (const item of details) {
      lines.push(`  · ${escapeHtml(item)}`);
    }
  }
  return lines.join('\n');
}

export function buildTelegramMessage({ tests, homeUrl, generatedAt, runEnvironment }) {
  const passedTests = tests.filter((t) => t.status === 'passed');
  const failed = tests.filter((t) => t.status === 'failed' || t.status === 'timedOut');
  const ok = failed.length === 0;
  const suite = inferSuiteLabel(tests);
  const host = shortHost(homeUrl);
  const envLabel = runEnvironment || resolveRunEnvironmentLabel();

  const lines = [
    `${ok ? '🟢' : '🔴'} ${suite} · ${ok ? '通過' : '失敗'} · ${escapeHtml(envLabel)}`,
    '',
    `<b>執行環境</b> ${escapeHtml(envLabel)}`,
    `<b>站點</b> ${escapeHtml(host)}`,
    `<b>時間</b> ${escapeHtml(formatTime(generatedAt))}`,
    `<b>網址</b> ${escapeHtml(homeUrl || '—')}`,
    '',
    `<b>摘要</b> 通過 ${passedTests.length} / 失敗 ${failed.length}（共 ${tests.length} 項）`,
  ];

  if (ok) {
    lines.push('', '<b>檢測內容</b>');
    for (const t of passedTests) {
      lines.push(formatPassedTestBlock(t), '');
    }
    lines.push('所有項目均已通過驗證。');
  } else {
    lines.push('', '<b>失敗項目</b>');
    for (const t of failed) {
      lines.push(formatFailedTestBlock(t), '');
    }
    if (passedTests.length) {
      lines.push(
        `<b>仍通過</b> ${passedTests.length} 項（完整清單見 HTML 報告／artifact）`,
      );
    }
  }

  return lines.join('\n').trim();
}

export async function sendTelegram(token, chatId, text) {
  const chunks = [];
  let rest = text;
  while (rest.length > TG_MAX) {
    let cut = rest.lastIndexOf('\n', TG_MAX);
    if (cut < TG_MAX * 0.5) cut = TG_MAX;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);

  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok === false) {
      throw new Error(body.description || `Telegram API ${res.status}`);
    }
  }
}

/** 依本次測試結果推送 Telegram（與 show-report 同源） */
export async function notifyTelegramFromTests(tests, options = {}) {
  loadEnv({
    path: path.join(ROOT, '.env'),
    // GITHUB_ENV 寫入含 : 的 token 可能被截斷；CI 以 workflow 產生的 .env 為準
    override: process.env.GITHUB_ACTIONS === 'true',
  });

  const generatedAt = options.generatedAt || new Date().toISOString();
  const runEnvironment = options.runEnvironment || resolveRunEnvironmentLabel();

  const writeLastRun = (extra = {}) => {
    const payload = { generatedAt, tests, runEnvironment, ...extra };
    fs.mkdirSync(path.dirname(LAST_RUN_JSON), { recursive: true });
    fs.writeFileSync(LAST_RUN_JSON, JSON.stringify(payload, null, 2), 'utf8');
  };

  writeLastRun({ notifyStatus: 'started' });

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  const notifyOn = (process.env.TELEGRAM_NOTIFY_ON || 'always').toLowerCase();
  const notifyAlways = options.always === true;

  if (!token || !chatId) {
    writeLastRun({ notifyStatus: 'no-credentials' });
    console.warn('[telegram] 未推送：缺少 TELEGRAM_BOT_TOKEN 或 TELEGRAM_CHAT_ID');
    return { sent: false, reason: 'no-credentials' };
  }

  const failed = tests.filter((t) => t.status === 'failed' || t.status === 'timedOut');
  if (!notifyAlways && notifyOn === 'fail' && failed.length === 0) {
    writeLastRun({ notifyStatus: 'skipped-all-passed' });
    return { sent: false, reason: 'all-passed' };
  }

  let message;
  try {
    message = buildTelegramMessage({
      tests,
      homeUrl: process.env.HOME_URL,
      generatedAt,
      runEnvironment,
    });
  } catch (error) {
    writeLastRun({ notifyStatus: 'build-failed', notifyError: String(error) });
    throw error;
  }

  writeLastRun({ notifyStatus: 'sending' });

  try {
    await sendTelegram(token, chatId, message);
  } catch (error) {
    writeLastRun({ notifyStatus: 'send-failed', notifyError: String(error) });
    throw error;
  }

  writeLastRun({ notifyStatus: 'sent', failed: failed.length });
  return { sent: true, failed: failed.length };
}
