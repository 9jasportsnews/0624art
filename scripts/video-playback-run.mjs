/**
 * 執行影片播放檢測，結果寫入 reports/video-playback-run.json
 */
import { config as loadEnv } from 'dotenv';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

loadEnv();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const JSON_PATH = path.join(ROOT, 'reports', 'video-playback-run.json');
const TEMP_DIR = path.join(ROOT, 'reports', '.video-playback-runs');

export const VIDEO_CASES = [
  {
    id: 'homepage-index-playlist',
    specFile: 'tests/recorded/homepage-index.spec.ts',
    grep: '播放清單區內嵌影片',
    item: '播放清單區內嵌影片應可正常播放',
  },
  {
    id: 'homepage-video-desktop',
    specFile: 'tests/recorded/homepage-video-playback.spec.ts',
    grep: '電腦版',
    item: '電腦版-首頁影片播放檢測：可見且無播放錯誤',
  },
  {
    id: 'homepage-video-mobile',
    specFile: 'tests/recorded/homepage-video-playback.spec.ts',
    grep: '手機版',
    item: '手機版-首頁影片播放檢測：可見且無播放錯誤',
  },
];

export function runVideoPlaybackTests() {
  console.log('正在執行影片播放檢測…');
  fs.mkdirSync(path.dirname(JSON_PATH), { recursive: true });
  fs.mkdirSync(TEMP_DIR, { recursive: true });

  const reports = [];
  for (const c of VIDEO_CASES) {
    console.log(`- ${c.item}`);
    const tempJson = path.join(TEMP_DIR, `${c.id}.json`);
    fs.rmSync(tempJson, { force: true });

    spawnSync(
      'npx',
      ['playwright', 'test', c.specFile, '--grep', c.grep, '--reporter=json'],
      {
        cwd: ROOT,
        env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: tempJson, FORCE_COLOR: '0' },
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024,
      },
    );

    if (fs.existsSync(tempJson)) reports.push(JSON.parse(fs.readFileSync(tempJson, 'utf8')));
  }

  if (!reports.length) throw new Error('沒有任何影片播放檢測結果');

  const merged = { config: reports[0]?.config || {}, suites: reports.flatMap((r) => r.suites || []) };
  fs.writeFileSync(JSON_PATH, JSON.stringify(merged, null, 2), 'utf8');
  console.log(`測試 JSON：${JSON_PATH}`);
  return merged;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runVideoPlaybackTests();
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  }
}
