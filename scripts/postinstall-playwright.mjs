/**
 * 本機 npm install 時安裝 Chromium。
 * Netlify 建置會在 build command 另行安裝，此處跳過以免重複。
 */
import { spawnSync } from 'node:child_process';

if (process.env.NETLIFY === 'true') {
  process.exit(0);
}

const r = spawnSync('npx', ['playwright', 'install', 'chromium'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(r.status ?? 1);
