#!/usr/bin/env node
/**
 * 移除本機 launchd 定時任務
 *
 *   npm run schedule:uninstall
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LABEL = 'com.check-web-playwright.scheduled-e2e';
const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);

if (fs.existsSync(plistPath)) {
  spawnSync('launchctl', ['bootout', `gui/${process.getuid()}`, plistPath]);
  spawnSync('launchctl', ['unload', plistPath]);
  fs.unlinkSync(plistPath);
  console.log('已移除本機定時檢測');
} else {
  console.log('找不到已安裝的定時任務');
}
