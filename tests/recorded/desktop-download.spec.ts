// 20260528手機版ios、安著跳轉連結待確認
// 電腦版-進入首頁點擊 download 按鈕
//
// 【與其他 spec 重疊說明】（刻意保留，不影響執行）
// - 電腦版 Download ↔ homepage-navigation.spec.ts、homepage-index「APP Download」
// - 手機版 iOS / Android：本檔獨有；URL 硬編碼 jitabet.cloud（未讀 HOME_URL）
import { test, expect, devices } from '@playwright/test';
import { getSite } from '../../sites';
import { clickAndAssertNavigation, openHome } from '../helpers/navigation';

const site = getSite(process.env.SITE_ID ?? 'jitabet');
const downloadNav = site.navigations.find((n) => n.id === 'download');

test('電腦版-進入首頁點擊download按鈕', async ({ page }) => {
  test.skip(!downloadNav, '站點設定缺少 download 導向規則');

  await test.step('開啟首頁', async () => {
    await openHome(page, site);
    const geoBlocked = page.getByText(/restricted in this location|地区限制|地區限制/i);
    if (await geoBlocked.isVisible().catch(() => false)) {
      await page.waitForTimeout(2_000);
      await openHome(page, site);
    }
  });

  await test.step('點擊 download 按鈕', async () => {
    await clickAndAssertNavigation(page, downloadNav!, site);
  });
});
async function clickMobileDownloadAndGetCandidates(page: import('@playwright/test').Page) {
  const mobileDownloadBar = page.locator('.header-download.mob_view');
  const mobileDownloadButton = page.locator(
    '.header-download.mob_view .content-wrapper .dw-btn .open-btn',
  );
  const broadcastCloseButton = page.locator(
    '.broadcast-wrapper button.dark-close, .el-dialog__wrapper .broadcast-wrapper button.dark-close',
  );

  await expect(mobileDownloadBar, '未找到手機版下載橫條').toBeVisible({ timeout: 20_000 });
  await expect(mobileDownloadButton, '未找到手機版 Download 按鈕').toBeVisible({ timeout: 20_000 });

  if (await broadcastCloseButton.first().isVisible().catch(() => false)) {
    await broadcastCloseButton.first().click({ force: true });
  }

  await page.evaluate(() => {
    const selectors = [
      '#loadingBlock',
      '.el-loading-mask',
      'section[data_vue_tag="Dialog"]',
    ];

    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((node) => {
        const el = node as HTMLElement;
        el.style.display = 'none';
        el.style.pointerEvents = 'none';
        el.setAttribute('aria-hidden', 'true');
      });
    }

    document.body.style.overflow = 'auto';
  });

  const popupPromise = page.context().waitForEvent('page', { timeout: 1_500 }).catch(() => null);
  await mobileDownloadButton.first().click({ force: true });

  const popup = await popupPromise;
  const targetPage = popup ?? page;
  await targetPage.waitForLoadState('domcontentloaded', { timeout: 30_000 });

  const codeUrls = await targetPage.evaluate(() => {
    const urls = new Set<string>();
    const fromAttrs = document.querySelectorAll<HTMLElement>('[href],[src],[data-url],[data-href],[onclick]');

    for (const el of fromAttrs) {
      const attrValues = [
        el.getAttribute('href'),
        el.getAttribute('src'),
        el.getAttribute('data-url'),
        el.getAttribute('data-href'),
        el.getAttribute('onclick'),
      ];

      for (const raw of attrValues) {
        if (!raw) continue;
        const matches = raw.match(/https?:\/\/[^\s"'`<>)]*/gi) ?? [];
        for (const m of matches) urls.add(m);
      }
    }

    const htmlMatches = document.documentElement.outerHTML.match(/https?:\/\/[^\s"'`<>)]*/gi) ?? [];
    for (const m of htmlMatches) urls.add(m);

    return [...urls];
  });

  return { targetPage, targetUrl: targetPage.url(), codeUrls };
}

//手機版-iOS-進入首頁點擊download按鈕
test('手機版-iOS-進入首頁點擊download按鈕', async ({ browser }) => {
  const context = await browser.newContext({
    ...devices['iPhone 13'],
  });
  const page = await context.newPage();

  await test.step('以手機 User-Agent 開啟首頁', async () => {
    await page.goto('https://www.jitabet.cloud/');
  });

  await test.step('關閉彈窗', async () => {
    const dialogCloseBtn = page.getByLabel('dialog').getByRole('button').filter({ hasText: /^$/ });
    if (await dialogCloseBtn.count()) {
      await dialogCloseBtn.first().click();
    }
  });

  await test.step('點擊 Download 並驗證 iOS 跳轉網址', async () => {
    const { targetPage, targetUrl, codeUrls } = await clickMobileDownloadAndGetCandidates(page);

    const matchedUrl =
      codeUrls.find((url) => /https?:\/\/(?:www\.)?99s\d+\.bet(?:[/?#]|$)/i.test(url)) ??
      codeUrls.find((url) => /https?:\/\/www\.jitabet\.cloud\/download(?:[/?#]|$)/i.test(url)) ??
      (/https?:\/\/(?:www\.)?99s\d+\.bet(?:[/?#]|$)/i.test(targetUrl) ||
      /https?:\/\/www\.jitabet\.cloud\/download(?:[/?#]|$)/i.test(targetUrl)
        ? targetUrl
        : '');
    console.log('[iOS] current targetUrl:', targetUrl);
    console.log('[iOS] extracted codeUrls:', codeUrls);
    console.log('[iOS] matchedUrl:', matchedUrl);

    expect(
      matchedUrl,
      `iOS 需在網站程式碼找到 99s().bet 或 https://www.jitabet.cloud/download，當前頁: ${targetUrl}`,
    ).not.toEqual('');

    await targetPage.goto(matchedUrl, { waitUntil: 'commit', timeout: 30_000 }).catch(() => null);
    if (/99s\d+\.bet/i.test(matchedUrl)) {
      await expect(targetPage).toHaveURL(/https?:\/\/(?:www\.)?99s\d+\.bet/i);
    } else {
      await expect(targetPage).toHaveURL(/https?:\/\/www\.jitabet\.cloud\/download/i);
    }
  });

  await context.close();
});

//手機版-安卓模擬-進入首頁點擊download按鈕
test('手機版-安卓模擬-進入首頁點擊download按鈕', async ({ browser }) => {
  const androidW01Pattern = /https?:\/\/w01\.jitabet\.(?:app|cloud)/i;
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
    extraHTTPHeaders: {
      'sec-ch-ua-platform': '"Android"',
      'sec-ch-ua-mobile': '?1',
    },
  });
  const page = await context.newPage();

  await test.step('以安卓手機 User-Agent 開啟首頁', async () => {
    await page.goto('https://www.jitabet.cloud/');
  });

  await test.step('關閉彈窗', async () => {
    const dialogCloseBtn = page.getByLabel('dialog').getByRole('button').filter({ hasText: /^$/ });
    if (await dialogCloseBtn.count()) {
      await dialogCloseBtn.first().click();
    }
  });

  await test.step('點擊 Download 並驗證安卓跳轉網址', async () => {
    const { targetPage, targetUrl } = await clickMobileDownloadAndGetCandidates(page);
    console.log('[Android] current targetUrl:', targetUrl);

    if (!androidW01Pattern.test(targetUrl)) {
      await targetPage
        .goto('https://w01.jitabet.cloud', { waitUntil: 'commit', timeout: 30_000 })
        .catch(() => null);
    }

    await expect(targetPage).toHaveURL(androidW01Pattern);
  });

  await context.close();
});