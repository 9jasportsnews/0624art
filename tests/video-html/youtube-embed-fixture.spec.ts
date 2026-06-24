/**
 * video.html 專用 YouTube 播放測試（本機回歸，非正式機範圍；預設 npx playwright test 已排除）
 *
 * 頁面有兩組 iframe：
 *   - 上方（nth=0）失效 → assertYoutubeEmbedPlayback 丟 Error → 測試 Fail（紅）
 *   - 下方（nth=1）正常 → assertYoutubeEmbedPlayback 通過 → 測試 Pass（綠）
 *
 * 一次跑整包會得到 1 failed + 1 passed，這是正確結果（失效本來就要報錯）。
 *
 * 指令：
 *   npm run test:fixture
 *   npx playwright test tests/video-html/youtube-embed-fixture.spec.ts
 *   npx playwright test tests/video-html/youtube-embed-fixture.spec.ts --grep "上方失效"
 *   npx playwright test tests/video-html/youtube-embed-fixture.spec.ts --grep "下方正常"
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { assertYoutubeEmbedPlayback } from '../helpers/youtube-embed';

const VIDEO_HTML_PATH = path.resolve(process.cwd(), 'video.html');

/** 上方：無法播放（灰底 + 無法播放這部影片） */
const BROKEN = {
  label: '上方失效影片',
  selector: '.vid-yt-mini-box >> nth=0 >> iframe[src*="youtube.com/embed"]',
  playlistId: 'PLeJefHYPujM9rXj2c294gi6S5sHmiH-UG',
};

/** 下方：可正常播放 */
const WORKING = {
  label: '下方正常影片',
  selector: '.vid-yt-mini-box >> nth=1 >> iframe[src*="youtube.com/embed"]',
  playlistId: 'PLtVVVPPuXsw7ClE3nPTzeY4khsPCoGjXr',
};

let fixtureServer: http.Server;
let fixturePageUrl = '';

function startFixtureServer(): Promise<string> {
  return new Promise((resolve, reject) => {
    const html = fs.readFileSync(VIDEO_HTML_PATH, 'utf8');
    fixtureServer = http.createServer((req, res) => {
      if (!req.url || req.url === '/' || req.url.startsWith('/video.html')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }
      res.writeHead(404);
      res.end();
    });
    fixtureServer.once('error', reject);
    fixtureServer.listen(0, '127.0.0.1', () => {
      const addr = fixtureServer.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve(`http://127.0.0.1:${port}/video.html`);
    });
  });
}

async function alignEmbedOrigin(page: Page, iframeSelector: string) {
  await page.locator(iframeSelector).evaluate((el) => {
    const iframe = el as HTMLIFrameElement;
    const url = new URL(iframe.src);
    url.searchParams.set('origin', window.location.origin);
    iframe.src = url.toString();
  });
}

async function openVideoHtml(page: Page) {
  await page.goto(fixturePageUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await expect(page.locator('.vid-yt-mini-box')).toHaveCount(2);
  await alignEmbedOrigin(page, BROKEN.selector);
  await alignEmbedOrigin(page, WORKING.selector);
  await page.waitForTimeout(2_000);
}

test.describe('video.html YouTube 影片播放', () => {
  test.beforeAll(async () => {
    fixturePageUrl = await startFixtureServer();
  });

  test.afterAll(async () => {
    if (!fixtureServer) return;
    await new Promise<void>((resolve, reject) => {
      fixtureServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  test('上方失效影片：必須報錯（預期 Fail 紅）', async ({ page }) => {
    test.setTimeout(120_000);

    await openVideoHtml(page);

    // 不加 try/catch：畫面顯示「無法播放這部影片」→ throw Error → 此測試 Fail（紅）
    await assertYoutubeEmbedPlayback(page, BROKEN.selector, BROKEN.label);
  });

  test('下方正常影片：必須可播放（預期 Pass 綠）', async ({ page }) => {
    test.setTimeout(120_000);

    await openVideoHtml(page);

    await assertYoutubeEmbedPlayback(page, WORKING.selector, WORKING.label);
  });
});
