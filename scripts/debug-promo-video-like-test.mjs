/**
 * 完全複製 homepage-index 測試進站流程後 dump DOM
 */
import { config as loadEnv } from 'dotenv';
import { chromium } from 'playwright';

loadEnv();

const homeUrl = process.env.HOME_URL ?? 'https://www.jitabet.cloud/?version=6.46.6-fc';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'en-US',
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});
const page = await context.newPage();

console.log('HOME_URL:', homeUrl);
await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

// 模擬 dismissAllBlockingDialogs
for (let i = 0; i < 12; i += 1) {
  const visible = await page.locator('.el-dialog__wrapper:visible').count();
  if (visible === 0) break;
  await page.keyboard.press('Escape').catch(() => {});
  await page.locator('#fifa2026-window [class*="close"], #fifa2026-window button').first().click({ timeout: 2000, force: true }).catch(() => {});
  await page.waitForTimeout(400);
}

// gtmReadyWaitMs = 5000
await page.waitForTimeout(5000);

const dump = async (label) => {
  const data = await page.evaluate(() => {
    const box = document.querySelector('#pr-home-banner + .vid-yt-mini-box, #pr-main-wrapper .vid-yt-mini-box');
    const wrap = box?.querySelector(':scope > .vid-yt-frame-wrap, .vid-yt-frame-wrap');
    if (!wrap) return { error: 'no frame-wrap' };
    const children = Array.from(wrap.children).map((c) => ({
      tag: c.tagName,
      id: c.id,
      src:
        c instanceof HTMLIFrameElement
          ? c.src
          : c instanceof HTMLVideoElement
            ? c.currentSrc || c.src
            : '',
      html: c.outerHTML.slice(0, 120),
    }));
    return { children, wrapHtml: wrap.innerHTML.slice(0, 300) };
  });
  console.log(`\n--- ${label} ---`, JSON.stringify(data, null, 2));
};

await dump('after gtm wait');
await page.waitForTimeout(10_000);
await dump('+10s');
await page.waitForTimeout(20_000);
await dump('+30s total');

await browser.close();
