// 首頁 index 檢查：進入彈窗、區塊健康檢查、連結導向（未登入）；已登入僅驗證右側選單
//
// 【與其他 spec 重疊說明】（刻意保留，不影響執行；日後若要合併可參考）
// - 播放清單內嵌影片 ↔ homepage-video-playback.spec.ts（電腦版 assertPlaylistInlinePlayerPlayable）
// - 宣傳橫幅連結（未登入） ↔ homepage-promo.spec.ts（已登入：影片可見 + 點擊導向）
// - 右側選單 ↔ desktop-right-menu.spec.ts（後者含 Tawk、截圖比對、彈窗關閉等細項）
// - APP Download ↔ homepage-navigation.spec.ts、desktop-download.spec.ts
import { test, expect, type Page } from '@playwright/test';
import { homepageMemberTest } from '../fixtures/homepage-index-member-test';
import { getSite } from '../../sites';
import {
  indexPromoBannerSlots,
  indexRightMenuLinks,
  indexSocialQrExpectUrls,
} from '../../sites/jitabet-index';
import {
  BONUS_MAILBOX_BTN,
  BONUS_MAILBOX_LINK,
  PROMOTION_APPLY_LINK,
} from '../helpers/jitabet-selectors';
import { clickAndAssertIndexLink } from '../helpers/index-link';
import {
  assertFirstVisibleGameOpensSameUrl,
  assertBonusUnreadDotIfPresent,
  assertMemberLatestNewsNavigation,
  assertMemberMenuLinkNavigation,
  assertPromoTopRowLayoutVisible,
  assertPromoPlaylistLayoutVisible,
  assertVisibleExclusiveGamesMatchHref,
  clickAndAssertHrefNavigation,
  clickExclusiveCarousel,
  dismissIndexEntryPopup,
  getPromoBannerLinks,
  getViewportExclusiveGameHrefs,
  gotoHomepageOnly,
  homeEntryPopup,
  openIndexReady,
  prepareIndexVisualComparisons,
  promoLeftBannersRegion,
  promoPlaylistVideoRegion,
  promoTopRowRegion,
  rightMenuRegion,
  scrollExclusiveGamesIntoView,
  assertPromoPlaylistVideoPlayback,
} from '../helpers/homepage-index';
import { clickAndAssertNavigation, dismissAllBlockingDialogs, openHome } from '../helpers/navigation';

const siteId = process.env.SITE_ID ?? 'jitabet';
const site = getSite(siteId);
const downloadNav = site.navigations.find((n) => n.id === 'download');

const VISIBLE_DIALOG = '.el-dialog__wrapper:visible .el-dialog';

async function assertSocialQrExternal(page: Page, socialId: string, label: string) {
  const urlPattern = indexSocialQrExpectUrls[socialId];
  expect(urlPattern, `${label} 缺少 QR 目標網址規則`).toBeTruthy();

  const panel = page.locator(VISIBLE_DIALOG).last().locator('.popup-qrcode');
  const canvas = panel.locator('canvas#canvas');
  await expect(canvas, 'QR Code 應已渲染').toBeVisible({ timeout: 15_000 });

  const targetUrl = await canvas.getAttribute('url');
  expect(targetUrl, 'QR Code 目標網址缺失').toMatch(urlPattern);

  const popupPromise = page.context().waitForEvent('page', { timeout: 20_000 });
  await canvas.click({ timeout: 15_000 });
  const externalPage = await popupPromise;
  await externalPage.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => {});

  const hostname = new URL(externalPage.url()).hostname;
  const expectedHost = new URL(targetUrl!).hostname;
  expect(hostname, `${label} 應開啟對應外部網站`).toMatch(
    new RegExp(expectedHost.replace(/\./g, '\\.'), 'i'),
  );

  await externalPage.close().catch(() => {});
  expect(page.url(), '首頁分頁應仍在 jitabet').toMatch(/jitabet\.(cloud|club)/i);
}

async function assertRegionNoBrokenMedia(region: ReturnType<Page['locator']>, label: string) {
  const brokenMediaCount = await region.evaluate((root) => {
    const media = Array.from(root.querySelectorAll('img, video')) as Array<HTMLImageElement | HTMLVideoElement>;
    return media.filter((node) => {
      if (node instanceof HTMLImageElement) {
        return !!node.currentSrc && !node.complete;
      }
      if (node instanceof HTMLVideoElement) {
        return node.readyState === 0 && !!node.currentSrc;
      }
      return false;
    }).length;
  });
  expect(brokenMediaCount, `${label} 內不應有破圖或未載入完成媒體`).toBe(0);
}

async function runIndexVisualComparisons(page: Page) {
  await prepareIndexVisualComparisons(page, { site, member: false });

  const promoRow = promoTopRowRegion(page);
  await promoRow.scrollIntoViewIfNeeded();
  await assertPromoTopRowLayoutVisible(page);
  await assertRegionNoBrokenMedia(promoRow, '頂部宣傳區');

  const leftBanners = promoLeftBannersRegion(page);
  await expect(leftBanners, '左側宣傳橫幅不可見').toBeVisible({ timeout: 15_000 });
  await assertRegionNoBrokenMedia(leftBanners, '左側宣傳橫幅');

  const playlistRegion = promoPlaylistVideoRegion(page);
  await playlistRegion.scrollIntoViewIfNeeded();
  await expect(playlistRegion, '播放清單影片區不可見').toBeVisible({ timeout: 15_000 });
  await assertPromoPlaylistLayoutVisible(page);

  const menuRegion = rightMenuRegion(page);
  await expect(menuRegion, '右側選單不可見').toBeVisible({ timeout: 15_000 });
  await assertRegionNoBrokenMedia(menuRegion, '右側選單');

  const gamesRegion = await scrollExclusiveGamesIntoView(page);
  await page.waitForTimeout(500);
  await assertRegionNoBrokenMedia(gamesRegion, '專屬遊戲區');
}

test.describe('首頁-index-進入彈窗', () => {
  test('進入首頁應顯示彈窗', async ({ page }) => {
    await gotoHomepageOnly(page, site);
    await expect(homeEntryPopup(page), '進入首頁應出現彈窗').toBeVisible({ timeout: 15_000 });
  });

  test('點擊關閉後彈窗應消失', async ({ page }) => {
    await gotoHomepageOnly(page, site);
    await expect(homeEntryPopup(page), '應先看到進入彈窗').toBeVisible({ timeout: 15_000 });
    await dismissIndexEntryPopup(page, site);
    await expect(homeEntryPopup(page), '關閉後彈窗應消失').toBeHidden({ timeout: 10_000 });
  });
});

test.describe('首頁-index-未登入-視覺比對', () => {
  test.beforeEach(async ({ page }) => {
    await openIndexReady(page, site);
  });

  test('各區塊視覺比對', async ({ page }) => {
    await runIndexVisualComparisons(page);
  });
});

test.describe('首頁-index-宣傳橫幅連結', () => {
  // 重疊：homepage-promo.spec.ts 同測第 1、2 橫幅（該檔需登入，且多驗影片 src 含 .mp4）
  for (const slot of indexPromoBannerSlots) {
    test(`${slot.label}可點擊導向`, async ({ page }) => {
      await openIndexReady(page, site);

      const banners = getPromoBannerLinks(page);
      await expect(banners.nth(slot.index), `${slot.label} 不可見`).toBeVisible({ timeout: 15_000 });
      await clickAndAssertHrefNavigation(page, banners.nth(slot.index), slot.label);
    });
  }
});

test.describe('首頁-index-宣傳區播放清單影片', () => {
  // 與 homepage-video-playback「電腦版」同測 assertPlaylistInlinePlayerPlayable；用 openHome 進首頁（不依賴未登入）
  test('播放清單區內嵌影片應可正常播放', async ({ page }) => {
    test.setTimeout(180_000);

    await test.step('開啟首頁並關閉進入彈窗', async () => {
      await openHome(page, site);
    });

    await assertPromoPlaylistVideoPlayback(page);
  });
});

async function runExclusiveGamesCarouselCheck(page: Page, memberSite?: typeof site) {
  await scrollExclusiveGamesIntoView(page, memberSite);

  const checkedHrefs = new Set<string>();
  const initialHrefs = await getViewportExclusiveGameHrefs(page);
  expect(initialHrefs.length, '初始畫面應有可見遊戲').toBeGreaterThan(0);

  await assertVisibleExclusiveGamesMatchHref(page, '初始畫面', checkedHrefs, memberSite);

  await clickExclusiveCarousel(page, 'next');
  const nextHrefs = await getViewportExclusiveGameHrefs(page);
  expect(nextHrefs, '向右切換後應顯示不同遊戲組合').not.toEqual(initialHrefs);
  await assertVisibleExclusiveGamesMatchHref(page, '向右切換後', checkedHrefs, memberSite);

  await clickExclusiveCarousel(page, 'prev');
  const prevHrefs = await getViewportExclusiveGameHrefs(page);
  expect(prevHrefs, '向左切換後應與向右切換後不同').not.toEqual(nextHrefs);
  const backOverlap = prevHrefs.filter((href) => initialHrefs.includes(href));
  expect(backOverlap.length, '向左切換後應回到初始畫面可見的遊戲').toBeGreaterThan(0);
  await assertFirstVisibleGameOpensSameUrl(page, '向左切換後', memberSite);

  expect(checkedHrefs.size, '應至少驗證一款不重複遊戲連結').toBeGreaterThan(0);
}

test.describe('首頁-index-專屬遊戲連結', () => {
  test('輪播左右切換後點擊網址應與首頁連結一致', async ({ page }) => {
    await openIndexReady(page, site);
    await runExclusiveGamesCarouselCheck(page);
  });
});

homepageMemberTest.describe('首頁-index-已登入-右側選單', () => {
  // 重疊：desktop-right-menu.spec.ts「電腦版已登入-右側選單」（fixture 不同：本檔 worker 共用登入一次）
  homepageMemberTest.describe.configure({ timeout: 180_000 });

  homepageMemberTest.beforeEach(async ({ page }) => {
    await dismissAllBlockingDialogs(page, site, { maxMs: 20_000 });
  });

  homepageMemberTest('應為已登入狀態且右側選單含會員按鈕', async ({ page }) => {
    const region = rightMenuRegion(page);
    await expect(region, '右側選單應可見').toBeVisible({ timeout: 15_000 });
    await expect(page.locator(PROMOTION_APPLY_LINK).first()).toHaveAttribute(
      'href',
      /\/member\/promotion\/apply/i,
    );

    const bonusBtn = page.locator(BONUS_MAILBOX_BTN).first();
    await expect(bonusBtn, 'Bonus 按鈕應可見').toBeVisible();
    await expect(page.locator(BONUS_MAILBOX_LINK).first()).toHaveAttribute(
      'href',
      /\/member\/mailbox\/bonus/i,
    );
    await assertBonusUnreadDotIfPresent(bonusBtn);
  });

  homepageMemberTest('Promotion Apply可點擊導向', async ({ page }) => {
    await assertMemberMenuLinkNavigation(
      page,
      page.locator(PROMOTION_APPLY_LINK).first(),
      /\/member\/promotion\/apply/i,
      'Promotion Apply',
      site,
    );
  });

  homepageMemberTest('Bonus可點擊導向', async ({ page }) => {
    await assertMemberMenuLinkNavigation(
      page,
      page.locator(BONUS_MAILBOX_LINK).first(),
      /\/member\/mailbox\/bonus/i,
      'Bonus ',
      site,
    );
  });

  homepageMemberTest('右側選單-最新消息可點擊導向會員新聞頁', async ({ page }) => {
    await assertMemberLatestNewsNavigation(page, site);
  });

  for (const linkCase of indexRightMenuLinks.filter((c) => c.id !== 'latest-news')) {
    homepageMemberTest(`右側選單-${linkCase.label}可點擊`, async ({ page, context }) => {
      await clickAndAssertIndexLink(page, context, linkCase);
    });
  }

  homepageMemberTest('右側選單-APP Download可點擊導向', async ({ page }) => {
    homepageMemberTest.skip(!downloadNav, '站點設定缺少 download 導向規則');
    await clickAndAssertNavigation(page, downloadNav!, site);
  });

  for (const linkCase of indexRightMenuLinks.filter((c) => c.id.startsWith('social-'))) {
    homepageMemberTest(`右側選單-${linkCase.label}-QR可開啟外部網站`, async ({ page, context }) => {
      await clickAndAssertIndexLink(page, context, linkCase);
      await assertSocialQrExternal(page, linkCase.id, linkCase.label);
    });
  }
});

test.describe('首頁-index-未登入-右側選單連結', () => {
  // 重疊：desktop-right-menu.spec.ts「電腦版未登入-右側選單」（後者多 QR 截圖比對、Tawk 腳本檢查）
  for (const linkCase of indexRightMenuLinks) {
    test(`${linkCase.label}可點擊`, async ({ page, context }) => {
      await openIndexReady(page, site);
      await clickAndAssertIndexLink(page, context, linkCase);
    });
  }

  test('APP Download可點擊導向', async ({ page }) => {
    test.skip(!downloadNav, '站點設定缺少 download 導向規則');
    await openIndexReady(page, site);
    await clickAndAssertNavigation(page, downloadNav!, site);
  });

  for (const linkCase of indexRightMenuLinks.filter((c) => c.id.startsWith('social-'))) {
    test(`${linkCase.label}-QR可開啟外部網站`, async ({ page, context }) => {
      await openIndexReady(page, site);
      await clickAndAssertIndexLink(page, context, linkCase);
      await assertSocialQrExternal(page, linkCase.id, linkCase.label);
    });
  }
});
