/**
 * 輪詢 .vid-yt-frame-wrap 是否從 video 切換成 iframe
 */
import { config as loadEnv } from 'dotenv';
import { chromium } from 'playwright';

loadEnv();

const homeUrl = process.env.HOME_URL ?? 'https://www.jitabet.cloud/?version=6.46.6-fc';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
for (let i = 0; i < 10; i += 1) {
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(500);
}

console.log('URL:', page.url());
for (let t = 0; t <= 60; t += 5) {
  const snap = await page.evaluate(() => {
    const wrap = document.querySelector('#pr-home-banner + .vid-yt-mini-box .vid-yt-frame-wrap');
    if (!wrap) return { t: 0, children: [] };
    return {
      children: Array.from(wrap.children).map((c) => ({
        tag: c.tagName,
        src:
          c instanceof HTMLIFrameElement
            ? c.src.slice(0, 80)
            : c instanceof HTMLVideoElement
              ? (c.currentSrc || c.src || '').slice(0, 80)
              : '',
      })),
    };
  });
  console.log(`+${t}s`, JSON.stringify(snap.children));
  if (t < 60) await page.waitForTimeout(5_000);
}

await browser.close();
