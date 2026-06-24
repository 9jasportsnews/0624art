// 電腦版未登入：右側浮動選單顯示、彈窗內容與視覺比對
//
// 【與其他 spec 重疊說明】（刻意保留，不影響執行）
// - 未登入 / 已登入右側選單 ↔ homepage-index.spec.ts「未登入-右側選單」「已登入-右側選單」
//   （本檔獨有：社群 QR 截圖比對、Tawk 腳本、彈窗 .dark-close 關閉流程）
// - APP Download ↔ homepage-index、homepage-navigation.spec.ts、desktop-download.spec.ts
import { test, expect, type Locator, type Page } from '@playwright/test';
import { getSite } from '../../sites';
import {
  APP_DOWNLOAD_BTN,
  BONUS_MAILBOX_BTN,
  BONUS_MAILBOX_LINK,
  NEWS_BTN,
  PROMOTION_APPLY_BTN,
  PROMOTION_APPLY_LINK,
  RIGHT_MENU,
  SOCIAL_ITEM,
  SUPPORT_BTN,
} from '../helpers/jitabet-selectors';
import { assertMemberLatestNewsNavigation, assertBonusUnreadDotIfPresent } from '../helpers/homepage-index';
import { isCiEnvironment } from '../helpers/ci';
import { memberTest } from '../fixtures/member-test';
import { clickAndAssertNavigation, dismissAllBlockingDialogs, openHome } from '../helpers/navigation';

const siteId = process.env.SITE_ID ?? 'jitabet';
const site = getSite(siteId);
const downloadNav = site.navigations.find((n) => n.id === 'download');

const DOWNLOAD_BTN = APP_DOWNLOAD_BTN;

const VISIBLE_DIALOG = '.el-dialog__wrapper:visible .el-dialog';
const VISIBLE_DIALOG_WRAPPER = '.el-dialog__wrapper:visible';
const DARK_CLOSE = `${VISIBLE_DIALOG_WRAPPER} .dark-close`;

const SOCIAL_PLATFORMS = [
  {
    label: 'Facebook',
    titlePattern: /^Facebook$/i,
    urlPattern: /^https:\/\/www\.facebook\.com\/jitabet\/?$/,
    hostnamePattern: /(^|\.)facebook\.com$/i,
  },
  {
    label: 'Instagram',
    titlePattern: /^Instagram$/i,
    urlPattern: /^https:\/\/www\.instagram\.com\/jitabet_official\/?$/,
    hostnamePattern: /(^|\.)instagram\.com$/i,
  },
  {
    label: 'Youtube',
    titlePattern: /^Youtube$/i,
    urlPattern: /^https:\/\/www\.youtube\.com\/@JitabetPromotion\/?$/,
    hostnamePattern: /(^|\.)youtube\.com$/i,
  },
  {
    label: 'Twitter',
    titlePattern: /^Twitter$/i,
    urlPattern: /^https:\/\/x\.com\/jitabetcom\/?$/,
    hostnamePattern: /(^|\.)(x\.com|twitter\.com)$/i,
  },
  {
    label: 'Telegram',
    titlePattern: /^Telegram$/i,
    urlPattern: /^https:\/\/t\.me\/jitabetofficialchannel\/?$/,
    hostnamePattern: /(^|\.)t\.me$/i,
  },
] as const;

async function openHomeAsGuest(page: Page) {
  await openHome(page, site);
  await expect(
    page.locator('input[name="username"]').first(),
    '應為未登入狀態（需看得到登入欄位）',
  ).toBeVisible({ timeout: 15_000 });
}

function visibleDialog(page: Page): Locator {
  return page.locator(VISIBLE_DIALOG).last();
}

async function assertNewsPopup(page: Page) {
  const dialog = visibleDialog(page);
  await expect(dialog, '最新消息應開啟彈窗').toBeVisible({ timeout: 15_000 });

  const panel = dialog.locator('.popup-news');
  await expect(panel, '應為新聞彈窗版型').toBeVisible();
}

async function clickVisibleDarkClose(page: Page) {
  const closeBtn = page.locator(DARK_CLOSE).first();
  await expect(closeBtn, '關閉鈕 .dark-close 應可見').toBeVisible({ timeout: 10_000 });
  await closeBtn.click({ timeout: 10_000 });
  await expect(page.locator(VISIBLE_DIALOG_WRAPPER), '點擊關閉後彈窗應消失').toHaveCount(0, {
    timeout: 10_000,
  });
}

async function waitUntilPageUnblocked(page: Page) {
  await page
    .locator('#loadingBlock, .el-loading-mask')
    .first()
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => {});
  await dismissAllBlockingDialogs(page, site);
  await page
    .locator('#loadingBlock, .el-loading-mask')
    .first()
    .waitFor({ state: 'hidden', timeout: 10_000 })
    .catch(() => {});
}

async function clickWithOverlayRecovery(page: Page, target: Locator, label: string) {
  await expect(target, `${label} 按鈕不可見`).toBeVisible({ timeout: 15_000 });

  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await waitUntilPageUnblocked(page);
    try {
      await target.click({ timeout: 15_000 });
      return;
    } catch (error) {
      lastError = error;
      await dismissAllBlockingDialogs(page, site);
      await page.waitForTimeout(300);
    }
  }
  throw new Error(`${label} 點擊失敗（遮擋重試 3 次）: ${String(lastError)}`);
}

async function assertQrOpensExternalSite(page: Page, social: (typeof SOCIAL_PLATFORMS)[number]) {
  const panel = visibleDialog(page).locator('.popup-qrcode');
  const canvas = panel.locator('canvas#canvas');
  await expect(canvas, 'QR Code 應已渲染').toBeVisible({ timeout: 15_000 });

  const targetUrl = await canvas.getAttribute('url');
  expect(targetUrl, 'QR Code 目標網址缺失').toMatch(social.urlPattern);

  const popupPromise = page.context().waitForEvent('page', { timeout: 20_000 });
  await canvas.click({ timeout: 15_000 });
  const externalPage = await popupPromise;
  await externalPage.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => {});

  const hostname = new URL(externalPage.url()).hostname;
  expect(hostname, `${social.label} 應開啟對應外部網站`).toMatch(social.hostnamePattern);

  const expectedHost = new URL(targetUrl!).hostname;
  expect(hostname, '外部網站網域應與 QR 目標網址一致').toMatch(
    new RegExp(expectedHost.replace(/\./g, '\\.'), 'i'),
  );

  await externalPage.close().catch(() => {});
  expect(page.url(), '首頁分頁應仍在 jitabet').toMatch(/jitabet\.cloud/i);
}

async function assertSocialQrcodePopup(page: Page, social: (typeof SOCIAL_PLATFORMS)[number]) {
  const dialog = visibleDialog(page);
  await expect(dialog, '社群按鈕應開啟彈窗').toBeVisible({ timeout: 15_000 });

  const panel = dialog.locator('.popup-qrcode');
  await expect(panel, '應為 QR Code 彈窗版型').toBeVisible();
  await expect(panel.locator('.popup-title h1'), '彈窗標題應為平台名稱').toHaveText(
    social.titlePattern,
  );
  await expect(panel.locator('h4'), '應有掃碼提示文字').not.toBeEmpty();

  const canvas = panel.locator('canvas#canvas');
  await expect(canvas, 'QR Code 畫布應可見').toBeVisible();
  await expect(canvas, 'QR Code 畫布尺寸應已渲染').toHaveAttribute('width', /.+/);
  await expect(canvas, 'QR Code 連結網址應正確').toHaveAttribute('url', social.urlPattern);

  if (isCiEnvironment()) {
    console.log(`[ci] 略過社群 ${social.label} QR 截圖比對（僅本機執行視覺基準）`);
    return;
  }

  await expect(canvas).toHaveScreenshot(`social-${social.label.toLowerCase()}-qr.png`);
  await expect(panel.locator('.equal-qrcode-block')).toHaveScreenshot(
    `social-${social.label.toLowerCase()}-popup.png`,
    {
      mask: [panel.locator('h4'), canvas],
    },
  );
}

test.describe('電腦版未登入-右側選單', () => {
  test('顯示正常', async ({ page }) => {
    await openHomeAsGuest(page);

    const menu = page.locator(RIGHT_MENU);
    await expect(menu, '右側選單容器不可見').toBeVisible({ timeout: 15_000 });

    await expect(page.locator(SUPPORT_BTN).first(), '24 小時客服按鈕不可見').toBeVisible();
    await expect(page.locator(NEWS_BTN).first(), '最新消息按鈕不可見').toBeVisible();
    await expect(page.locator(DOWNLOAD_BTN).first(), 'APP Download 按鈕不可見').toBeVisible();

    const socialItems = page.locator(SOCIAL_ITEM);
    await expect(socialItems, '社群按鈕數量應為 5').toHaveCount(5);

    for (let i = 1; i <= 5; i += 1) {
      await expect(
        socialItems.nth(i - 1).locator(`img[src*="Community.${i}.webp"]`),
        `第 ${i} 個社群圖示不可見`,
      ).toBeVisible();
    }
  });

  test('點擊 24 小時客服', async ({ page }) => {
    await openHomeAsGuest(page);

    const supportBtn = page.locator(SUPPORT_BTN).first();
    await expect(supportBtn).toBeVisible({ timeout: 15_000 });

    const hasTawkEmbed = await page.evaluate(
      () =>
        document.documentElement.innerHTML.includes('embed.tawk.to') ||
        typeof (window as Window & { Tawk_API?: unknown }).Tawk_API === 'object',
    );
    expect(hasTawkEmbed, '頁面應已載入 Tawk 客服腳本').toBe(true);

    await supportBtn.click({ timeout: 15_000 });
    expect(page.url(), '點擊客服後不應離開首頁').toMatch(/jitabet\.cloud/i);
  });

  test('點擊最新消息', async ({ page }) => {
    await openHomeAsGuest(page);

    const newsBtn = page.locator(NEWS_BTN).first();
    await clickWithOverlayRecovery(page, newsBtn, '最新消息');

    await assertNewsPopup(page);
    expect(page.url(), '新聞彈窗應留在首頁').toMatch(/jitabet\.cloud/i);
  });

  test('點擊 APP Download', async ({ page }) => {
    test.skip(!downloadNav, '站點設定缺少 download 導向規則');

    await openHomeAsGuest(page);
    await clickAndAssertNavigation(page, downloadNav!, site);
  });

  test('彈窗點擊關閉鈕可關閉', async ({ page }) => {
    await openHomeAsGuest(page);

    await test.step('最新消息彈窗', async () => {
      await clickWithOverlayRecovery(page, page.locator(NEWS_BTN).first(), '最新消息');
      await expect(visibleDialog(page), '最新消息彈窗應開啟').toBeVisible({ timeout: 15_000 });
      await clickVisibleDarkClose(page);
    });

    await test.step('社群 QR 彈窗', async () => {
      await clickWithOverlayRecovery(page, page.locator(SOCIAL_ITEM).first(), '社群 Facebook');
      await expect(visibleDialog(page).locator('.popup-qrcode'), '社群彈窗應開啟').toBeVisible({
        timeout: 15_000,
      });
      await clickVisibleDarkClose(page);
    });
  });

  for (const [index, social] of SOCIAL_PLATFORMS.entries()) {
    test(`點擊社群-${social.label}`, async ({ page }) => {
      await openHomeAsGuest(page);

      const socialBtn = page.locator(SOCIAL_ITEM).nth(index);
      await clickWithOverlayRecovery(page, socialBtn, `社群 ${social.label}`);

      await assertSocialQrcodePopup(page, social);
      expect(page.url(), '社群彈窗應留在首頁').toMatch(/jitabet\.cloud/i);
    });

    test(`點擊社群-${social.label}-QR可開啟外部網站`, async ({ page }) => {
      await openHomeAsGuest(page);

      const socialBtn = page.locator(SOCIAL_ITEM).nth(index);
      await clickWithOverlayRecovery(page, socialBtn, `社群 ${social.label}`);
      await expect(visibleDialog(page).locator('.popup-qrcode'), 'QR 彈窗應開啟').toBeVisible({
        timeout: 15_000,
      });

      await assertQrOpensExternalSite(page, social);
    });
  }
});

// 電腦版已登入：右側選單（登入後多 Promotion Apply、Bonus 兩顆按鈕）
async function assertMemberLinkNavigation(page: Page, link: Locator, urlPattern: RegExp) {
  await dismissAllBlockingDialogs(page, site, { maxMs: 15_000 });
  const href = await link.getAttribute('href');
  expect(href, '會員按鈕連結缺失').toMatch(urlPattern);
  await link.scrollIntoViewIfNeeded().catch(() => {});
  await link.click({ timeout: 15_000, force: true });
  await expect(page, '點擊後應導向會員頁').toHaveURL(urlPattern, { timeout: 30_000 });
}

memberTest.describe('電腦版已登入-右側選單', () => {
  memberTest.describe.configure({ timeout: 180_000 });

  memberTest.beforeEach(async ({ page }) => {
    await dismissAllBlockingDialogs(page, site, { maxMs: 20_000 });
  });

  memberTest('顯示正常', async ({ page }) => {

    const menu = page.locator(RIGHT_MENU);
    await expect(menu, '右側選單容器不可見').toBeVisible({ timeout: 15_000 });

    const promotionBtn = page.locator(PROMOTION_APPLY_BTN).first();
    await expect(promotionBtn, 'Promotion Apply 按鈕不可見').toBeVisible();
    await expect(page.locator(PROMOTION_APPLY_LINK).first()).toHaveAttribute(
      'href',
      /\/member\/promotion\/apply/i,
    );

    const bonusBtn = page.locator(BONUS_MAILBOX_BTN).first();
    await expect(bonusBtn, 'Bonus 按鈕不可見').toBeVisible();
    await expect(page.locator(BONUS_MAILBOX_LINK).first()).toHaveAttribute(
      'href',
      /\/member\/mailbox\/bonus/i,
    );
    await assertBonusUnreadDotIfPresent(bonusBtn);

    await expect(page.locator(SUPPORT_BTN).first(), '24 小時客服仍應可見').toBeVisible();
    await expect(page.locator(NEWS_BTN).first(), '最新消息仍應可見').toBeVisible();
    await expect(page.locator(DOWNLOAD_BTN).first(), 'APP Download 仍應可見').toBeVisible();
    await expect(page.locator(SOCIAL_ITEM)).toHaveCount(5);
  });

  memberTest('點擊 Promotion Apply', async ({ page }) => {
    await assertMemberLinkNavigation(
      page,
      page.locator(PROMOTION_APPLY_LINK).first(),
      /\/member\/promotion\/apply/i,
    );
  });

  memberTest('點擊 Bonus ', async ({ page }) => {
    await assertMemberLinkNavigation(
      page,
      page.locator(BONUS_MAILBOX_LINK).first(),
      /\/member\/mailbox\/bonus/i,
    );
  });

  memberTest('點擊最新消息', async ({ page }) => {
    await assertMemberLatestNewsNavigation(page, site);
  });
});
