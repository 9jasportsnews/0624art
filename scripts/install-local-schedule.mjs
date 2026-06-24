#!/usr/bin/env node
/**
 * 安裝本機每日定時跑 test:recorded（macOS launchd）
 *
 *   npm run schedule:install
 *   npm run schedule:install -- 10 30    # 自訂時分（預設 10:30）
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LABEL = 'com.check-web-playwright.scheduled-e2e';
const LOG = path.join(os.tmpdir(), 'playwright-scheduled.log');

const hour = Number(process.argv[2] ?? 10);
const minute = Number(process.argv[3] ?? 30);

if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
  console.error('用法：npm run schedule:install -- <時> <分>   例：npm run schedule:install -- 10 30');
  process.exit(1);
}

const nodeBin = process.execPath;
const runScript = path.join(ROOT, 'scripts', 'run-recorded-suite.mjs');
const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodeBin}</string>
    <string>${runScript}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${ROOT}</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${hour}</integer>
    <key>Minute</key>
    <integer>${minute}</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${LOG}</string>
  <key>StandardErrorPath</key>
  <string>${LOG}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${process.env.PATH || '/usr/local/bin:/usr/bin:/bin'}</string>
  </dict>
</dict>
</plist>
`;

function run(cmd, args) {
  return spawnSync(cmd, args, { encoding: 'utf8' });
}

fs.mkdirSync(path.dirname(plistPath), { recursive: true });

// 先卸載舊的（若存在）
run('launchctl', ['bootout', `gui/${process.getuid()}`, plistPath]);
run('launchctl', ['unload', plistPath]);

fs.writeFileSync(plistPath, plist, 'utf8');

const load = run('launchctl', ['bootstrap', `gui/${process.getuid()}`, plistPath]);
if (load.status !== 0) {
  const fallback = run('launchctl', ['load', plistPath]);
  if (fallback.status !== 0) {
    console.error(load.stderr || fallback.stderr || 'launchctl 載入失敗');
    process.exit(1);
  }
}

console.log('本機定時檢測已安裝');
console.log(`  時間：每天 ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}（依 Mac 系統時區）`);
console.log(`  指令：test:recorded（一次跑完 + 留存報告 + TG）`);
console.log(`  專案：${ROOT}`);
console.log(`  日誌：${LOG}`);
console.log(`  plist：${plistPath}`);
console.log('\n注意：Mac 需開機且勿睡眠，否則不會執行。');
console.log('取消：npm run schedule:uninstall');
console.log('立即試跑：npm run test:recorded');
