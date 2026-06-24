// 首頁影片播放檢測：可見且無播放錯誤
//
// 【與其他 spec 重疊說明】（刻意保留，不影響執行）
// - 電腦版播放清單區 ↔ homepage-index.spec.ts「播放清單區內嵌影片」（本檔另多驗左橫幅 MP4 + 請求失敗）
// - 左橫幅 MP4 嚴格播放 ↔ homepage-promo.spec.ts（該檔只驗可見 + src 含 .mp4，且需登入）
import { test, expect, devices, type Page } from '@playwright/test';
import { getSite } from '../../sites';
import { openHome } from '../helpers/navigation';
import {
  assertHtml5VideoPlayback,
  assertPlaylistInlinePlayerPlayable,
  resolvePlaylistInlineVideo,
} from '../helpers/youtube-embed';

const siteId = process.env.SITE_ID ?? 'jitabet';
const site = getSite(siteId);

function trackFailedMediaRequests(page: Page) {
  const failedMediaRequests: string[] = [];

  page.on('requestfailed', (request) => {
    const url = request.url();
    const type = request.resourceType();
    const errorText = request.failure()?.errorText ?? 'unknown';
    const isYoutubeInfra = /youtube\.com|ytimg\.com|googlevideo\.com/i.test(url);
    const isAbortLike = /ERR_ABORTED/i.test(errorText);
    const isVideoLike =
      type === 'media' ||
      /\.(mp4|m3u8|webm|mov)(\?|$)/i.test(url) ||
      /googlevideo\.com\/videoplayback/i.test(url);

    if (!isVideoLike) return;
    if (isYoutubeInfra && isAbortLike && type !== 'media') return;

    failedMediaRequests.push(`${type}: ${url} (${errorText})`);
  });

  return failedMediaRequests;
}

test('電腦版-首頁影片播放檢測：可見且無播放錯誤', async ({ page }) => {
  // 重疊：homepage-index「播放清單區內嵌影片」；本測試額外涵蓋 #pr-home-banner 橫幅 video 與 network 失敗監聽
  const failedMediaRequests = trackFailedMediaRequests(page);

  await test.step('開啟首頁並關閉彈窗', async () => {
    await openHome(page, site);
  });

  await assertPlaylistInlinePlayerPlayable(page, '電腦版首頁');

  const bannerVideos = page
    .locator('#pr-home-banner video, .home_banner video')
    .filter({ hasNot: page.locator('[style*="display: none"]') });

  const bannerCount = await bannerVideos.count();
  for (let i = 0; i < bannerCount; i += 1) {
    await test.step(`檢查宣傳橫幅第 ${i + 1} 個影片`, async () => {
      await assertHtml5VideoPlayback(bannerVideos.nth(i), `宣傳橫幅第 ${i + 1} 個影片`);
    });
  }

  await test.step('首頁影片請求不應有失敗', async () => {
    expect(
      failedMediaRequests,
      `偵測到影片/串流資源請求失敗:\n${failedMediaRequests.join('\n')}`,
    ).toHaveLength(0);
  });
});

test('手機版-首頁影片播放檢測：可見且無播放錯誤', async ({ browser }) => {
  const context = await browser.newContext({
    ...devices['iPhone 13'],
  });
  const page = await context.newPage();
  const failedMediaRequests = trackFailedMediaRequests(page);

  await test.step('開啟首頁並關閉彈窗', async () => {
    await openHome(page, site);
  });

  const mobileRegion = page.locator('.vid-yt-mini-box').first();
  try {
    await assertPlaylistInlinePlayerPlayable(page, '手機版首頁', mobileRegion);
  } catch {
    const inlineVideo = await resolvePlaylistInlineVideo(mobileRegion);
    if (inlineVideo) {
      await assertHtml5VideoPlayback(inlineVideo, '手機版首頁內嵌影片');
    } else {
      throw new Error('手機版首頁播放清單區找不到可驗證的內嵌影片或 YouTube iframe');
    }
  }

  await test.step('首頁影片請求不應有失敗', async () => {
    expect(
      failedMediaRequests,
      `偵測到影片/串流資源請求失敗:\n${failedMediaRequests.join('\n')}`,
    ).toHaveLength(0);
  });

  await context.close();
});
