/**
 * 逐步 dump 首頁播放清單區 DOM，確認 frame-wrap 內是 iframe 還是 video
 * 用法: node scripts/debug-promo-video-dom.mjs
 */
import { config as loadEnv } from 'dotenv';
import { chromium } from 'playwright';

loadEnv();

const homeUrl = process.env.HOME_URL ?? 'https://www.jitabet.cloud/?version=6.46.6-fc';

function log(title, data) {
  console.log(`\n=== ${title} ===`);
  console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  log('1. 開啟首頁', homeUrl);
  await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(8_000);

  // 關彈窗
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(400);
    const visible = await page.locator('.el-dialog__wrapper:visible').count();
    if (visible === 0) break;
  }
  await page.waitForTimeout(2_000);

  log('2. 當前 URL', page.url());

  const snapshot = await page.evaluate(() => {
    const boxes = Array.from(document.querySelectorAll('.vid-yt-mini-box')).map((box, index) => {
      const wrap = box.querySelector('.vid-yt-frame-wrap');
      const children = wrap
        ? Array.from(wrap.children).map((child) => {
            if (!(child instanceof HTMLElement)) return { tag: child.nodeName };
            const rect = child.getBoundingClientRect();
            const style = window.getComputedStyle(child);
            const visible =
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              Number(style.opacity) > 0 &&
              rect.width >= 2 &&
              rect.height >= 2;
            const base = {
              tag: child.tagName,
              id: child.id,
              visible,
              w: Math.round(rect.width),
              h: Math.round(rect.height),
            };
            if (child instanceof HTMLIFrameElement) {
              return { ...base, src: child.src.slice(0, 120) };
            }
            if (child instanceof HTMLVideoElement) {
              return {
                ...base,
                src: (child.currentSrc || child.src || '').slice(0, 120),
              };
            }
            return base;
          })
        : [];
      return {
        index,
        inMainWrapper: Boolean(box.closest('#pr-main-wrapper')),
        afterHomeBanner: Boolean(
          box.previousElementSibling?.id === 'pr-home-banner' ||
            box.parentElement?.querySelector('#pr-home-banner + .vid-yt-mini-box') === box,
        ),
        selectorHint:
          box.matches('#pr-home-banner + .vid-yt-mini-box')
            ? '#pr-home-banner + .vid-yt-mini-box'
            : '#pr-main-wrapper .vid-yt-mini-box',
        frameWrapChildren: children,
      };
    });

    const regionSelectors = {
      promoPlaylistVideoRegion_first: (() => {
        const el = document.querySelector(
          '#pr-home-banner + .vid-yt-mini-box, #pr-main-wrapper .vid-yt-mini-box',
        );
        if (!el) return null;
        const wrap = el.querySelector('.vid-yt-frame-wrap');
        return {
          matched: el.matches('#pr-home-banner + .vid-yt-mini-box')
            ? '#pr-home-banner + .vid-yt-mini-box'
            : '#pr-main-wrapper .vid-yt-mini-box',
          children: wrap
            ? Array.from(wrap.children).map((c) => ({
                tag: c.tagName,
                id: c.id,
                src:
                  c instanceof HTMLIFrameElement
                    ? c.src.slice(0, 120)
                    : c instanceof HTMLVideoElement
                      ? (c.currentSrc || c.src || '').slice(0, 120)
                      : '',
              }))
            : [],
        };
      })(),
    };

    return { boxCount: boxes.length, boxes, regionSelectors };
  });

  log('3. 頁面上所有 .vid-yt-mini-box', snapshot);

  const screenshotPath = 'test-results/debug-promo-video-dom.png';
  await page.screenshot({ path: screenshotPath, fullPage: false });
  log('4. 截圖', screenshotPath);
} finally {
  await browser.close();
}
