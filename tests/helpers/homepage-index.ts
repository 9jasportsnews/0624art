import { expect, type Locator, type Page } from '@playwright/test';
import type { SiteConfig } from '../../sites/types';
import {
  dismissAllBlockingDialogs,
  dismissHomePopup,
  ensureDialogClosed,
  gotoHomepage,
} from './navigation';
import { ensureLoggedIn, openHomeAndLoginOnce, tryRestoreMemberSession, waitForMemberUiReady } from './login';
import { assertPlaylistInlinePlayerPlayable } from './youtube-embed';
import {
  BONUS_MAILBOX_BTN,
  BONUS_MAILBOX_LINK,
  NEWS_BTN,
  PROMOTION_APPLY_BTN,
  PROMOTION_APPLY_LINK,
} from './jitabet-selectors';

const HOME_POPUP = '.el-dialog__wrapper';

export function homeEntryPopup(page: Page): Locator {
  return page.locator(HOME_POPUP).first();
}

export async function dismissIndexEntryPopup(page: Page, site: SiteConfig) {
  await dismissHomePopup(page, site);
  await ensureDialogClosed(page, site);
}

/** 進入首頁但不關彈窗 */
export async function gotoHomepageOnly(page: Page, site: SiteConfig) {
  await gotoHomepage(page, site);
}

/** 進入首頁並關閉進入彈窗，供後續區塊檢查使用 */
export async function openIndexReady(page: Page, site: SiteConfig) {
  await gotoHomepage(page, site);
  await dismissIndexEntryPopup(page, site);
  await dismissAllBlockingDialogs(page, site);

  if (site.gtmReadyWaitMs && site.gtmReadyWaitMs > 0) {
    await page.waitForTimeout(site.gtmReadyWaitMs);
  }

  await expect(
    page.locator('input[name="username"]').first(),
    '首頁應為未登入狀態',
  ).toBeVisible({ timeout: 15_000 });
}

/** 進入首頁、OCR 登入（帳密＋驗證碼）並關閉活動彈窗，供已登入 index 檢查使用 */
export async function openIndexReadyAsMember(page: Page, site: SiteConfig) {
  await openHomeAndLoginOnce(page, site);
  await dismissAllBlockingDialogs(page, site, { maxMs: 20_000 });

  if (site.gtmReadyWaitMs && site.gtmReadyWaitMs > 0) {
    await page.waitForTimeout(site.gtmReadyWaitMs);
  }

  await expect(
    page.locator('input[name="username"]').first(),
    '登入後不應再看得到登入欄位',
  ).toBeHidden({ timeout: 15_000 });
  await expect(
    page.locator(PROMOTION_APPLY_LINK).first(),
    '登入後應出現 Promotion Apply 連結',
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.locator(BONUS_MAILBOX_LINK).first(),
    '登入後應出現 Bonus 連結',
  ).toBeVisible({ timeout: 20_000 });
}

function resolveHomeHostname(site: SiteConfig): string {
  try {
    return new URL(process.env.HOME_URL ?? site.homeUrl).hostname;
  } catch {
    return 'www.jitabet.cloud';
  }
}

function isOnSiteHomepage(page: Page, site: SiteConfig): boolean {
  try {
    const homeHost = resolveHomeHostname(site);
    const { hostname, pathname } = new URL(page.url());
    const bare = homeHost.replace(/^www\./, '');
    const hostOk =
      hostname === homeHost || hostname === bare || hostname.endsWith(`.${bare}`);
    return hostOk && !/\/member\//i.test(pathname);
  } catch {
    return !/\/member\//i.test(page.url());
  }
}

async function isMemberMenuVisible(page: Page): Promise<boolean> {
  return page.locator(PROMOTION_APPLY_LINK).first().isVisible().catch(() => false);
}

/** session 過期或離開首頁時：先還原 storage，不行再 OCR 重登 */
async function ensureMemberLoggedInOnHome(page: Page, site: SiteConfig) {
  if (await tryRestoreMemberSession(page, site)) {
    return;
  }

  await gotoHomepage(page, site);
  await dismissHomePopup(page, site);
  await dismissAllBlockingDialogs(page, site, { maxMs: 20_000 });

  const loginForm = page.locator('input[name="username"]').first();
  const needsLogin =
    (await loginForm.isVisible().catch(() => false)) || !(await isMemberMenuVisible(page));

  if (needsLogin) {
    await ensureLoggedIn(page);
  }

  await waitForMemberUiReady(page, site);

  if (!(await isMemberMenuVisible(page))) {
    await tryRestoreMemberSession(page, site);
    if (!(await isMemberMenuVisible(page))) {
      await openHomeAndLoginOnce(page, site);
    }
  }

  await dismissAllBlockingDialogs(page, site, { maxMs: 20_000 });
}

/** 已登入接續測試：若離開首頁或登入過期則導回並重登入 */
export async function resetIndexMemberHome(page: Page, site: SiteConfig) {
  await page
    .locator('#loadingBlock, .el-loading-mask')
    .first()
    .waitFor({ state: 'hidden', timeout: 20_000 })
    .catch(() => {});

  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await dismissAllBlockingDialogs(page, site, { maxMs: 20_000 });

  const promoLink = page.locator(PROMOTION_APPLY_LINK).first();
  let onReadyHome = (await isOnSiteHomepage(page, site)) && (await isMemberMenuVisible(page));

  // 簽到／活動彈窗可能擋住會員按鈕：先關彈窗並等 UI，避免誤觸整輪 OCR 重登
  if (!onReadyHome && (await isOnSiteHomepage(page, site))) {
    await waitForMemberUiReady(page, site).catch(() => {});
    onReadyHome = await isMemberMenuVisible(page);
  }

  if (!onReadyHome) {
    await ensureMemberLoggedInOnHome(page, site);
  }

  await dismissAllBlockingDialogs(page, site, { maxMs: 20_000 });

  if (!(await isMemberMenuVisible(page))) {
    await ensureMemberLoggedInOnHome(page, site);
  }

  if (site.gtmReadyWaitMs && site.gtmReadyWaitMs > 0) {
    await page.waitForTimeout(site.gtmReadyWaitMs);
  }

  await expect(promoLink, '應維持已登入狀態').toBeVisible({ timeout: 20_000 });
}

/** 已登入：最新消息應導向會員信箱新聞頁（非首頁 popup） */
export async function assertMemberLatestNewsNavigation(page: Page, site?: SiteConfig) {
  await dismissAllBlockingDialogs(page, site);
  const newsBtn = page.locator(NEWS_BTN).first();
  await expect(newsBtn, '最新消息按鈕應可見').toBeVisible({ timeout: 15_000 });
  await newsBtn.scrollIntoViewIfNeeded();
  await newsBtn.click({ timeout: 15_000, force: true });

  await expect(page, '已登入應導向會員新聞頁').toHaveURL(/\/member\/mailbox\/news/i, {
    timeout: 30_000,
  });
  await expect(
    page.locator('a[href*="/member/mailbox/news"]').first(),
    '會員新聞頁版型應可見',
  ).toBeVisible({ timeout: 15_000 });
}

export async function assertMemberMenuLinkNavigation(
  page: Page,
  link: Locator,
  urlPattern: RegExp,
  label: string,
  site?: SiteConfig,
) {
  await dismissAllBlockingDialogs(page, site);
  await expect(link, `找不到：${label}`).toBeVisible({ timeout: 15_000 });
  const href = await link.getAttribute('href');
  expect(href, `${label} 連結缺失`).toMatch(urlPattern);
  await link.click({ timeout: 15_000 });
  await expect(page, `${label} 點擊後應導向會員頁`).toHaveURL(urlPattern, { timeout: 30_000 });
}

/** Bonus 未讀角標：有未讀信才會出現，無未讀時不應 Fail */
export async function assertBonusUnreadDotIfPresent(bonusBtn: Locator) {
  const dot = bonusBtn.locator('.news-dot');
  if ((await dot.count()) === 0) {
    return;
  }
  await expect(dot, 'Bonus 未讀角標').toBeVisible();
  await expect(dot).toHaveText(/\d+/);
}

export { PROMOTION_APPLY_LINK, BONUS_MAILBOX_LINK };

/** 宣傳橫幅區整體容器（左側 mp4 橫幅 + 右側播放清單影片 + 專屬遊戲） */
export function promoBannerRegion(page: Page): Locator {
  return page.locator('#pr-main-wrapper').first();
}

/** 宣傳區上方橫幅列（左 mp4 + 右播放清單外框，不含專屬遊戲輪播） */
export function promoTopRowRegion(page: Page): Locator {
  return page.locator('#pr-home-banner').locator('xpath=..');
}

/** 宣傳區左側：#pr-home-banner 內兩個 mp4 橫幅欄位 */
export function promoLeftBannersRegion(page: Page): Locator {
  return page.locator('#pr-home-banner.home_banner, #pr-home-banner').first();
}

/** 宣傳區右側：#pr-home-banner 同層相鄰的播放清單區（僅一部內嵌影片） */
export function promoPlaylistVideoRegion(page: Page): Locator {
  return page.locator('#pr-home-banner + .vid-yt-mini-box').first();
}

/**
 * 首頁宣傳區單一內嵌影片驗證。
 * YouTube → assertYoutubeEmbedPlayback；HTML5 video → assertHtml5VideoPlayback。
 */
export async function assertPromoPlaylistVideoPlayback(
  page: Page,
  label = '首頁播放清單影片',
) {
  const region = promoPlaylistVideoRegion(page);
  await assertPlaylistInlinePlayerPlayable(page, label, region);
}

export function getPromoBannerLinks(page: Page): Locator {
  return promoLeftBannersRegion(page).locator('a').filter({ has: page.locator('video') });
}

/** 專屬遊戲區（宣傳區下方、標題 এক্সক্লুসিভ গেমস / Exclusive Games） */
export function exclusiveGamesRegion(page: Page): Locator {
  return page.locator('section#exg-owl-home.exg-owl-box').first();
}

/** 視覺比對前：關浮層、等 loading 穩定（已登入時額外等會員 UI） */
export async function prepareIndexVisualComparisons(
  page: Page,
  options?: { site?: SiteConfig; member?: boolean },
) {
  const { site, member = false } = options ?? {};

  await dismissAllBlockingDialogs(page, site);
  if (member) {
    await waitForMemberUiReady(page, site);
    await dismissAllBlockingDialogs(page, site);
  }

  await page
    .locator('#loadingBlock, .el-loading-mask')
    .first()
    .waitFor({ state: 'hidden', timeout: 20_000 })
    .catch(() => {});

  try {
    await ensureDialogClosed(page, site);
  } catch {
    await dismissAllBlockingDialogs(page, site);
  }

  await page.waitForTimeout(member ? 1_500 : 800);
  await waitForPromoMediaReady(page);
}

/** 左側橫幅輪播／影片載入完成後再截圖 */
export async function waitForPromoMediaReady(page: Page) {
  const leftBanners = promoLeftBannersRegion(page);
  await expect(leftBanners, '左側宣傳橫幅不可見').toBeVisible({ timeout: 15_000 });

  const bannerLinks = getPromoBannerLinks(page);
  await expect
    .poll(async () => bannerLinks.count(), {
      timeout: 15_000,
      message: '左側宣傳橫幅應載入完成',
    })
    .toBeGreaterThanOrEqual(2);

  const videos = leftBanners.locator('video');
  const videoCount = await videos.count();
  for (let i = 0; i < videoCount; i += 1) {
    await videos.nth(i).evaluate((node) => {
      const video = node as HTMLVideoElement;
      return new Promise<void>((resolve) => {
        if (video.readyState >= 2) {
          resolve();
          return;
        }
        const done = () => resolve();
        video.addEventListener('loadeddata', done, { once: true });
        video.addEventListener('error', done, { once: true });
        window.setTimeout(done, 4_000);
      });
    });
  }

  await page.waitForTimeout(600);
}

export function promoLeftBannersVisualMasks(leftBanners: Locator): Locator[] {
  return [
    leftBanners.locator('video'),
    leftBanners.locator('img'),
    leftBanners.locator('a'),
    leftBanners.locator('.owl-stage-outer'),
  ];
}

/** 宣傳橫列視覺比對 mask（影片／播放清單另有獨立截圖） */
export function promoTopRowVisualMasks(promoRow: Locator): Locator[] {
  return [
    promoRow.locator('video'),
    promoRow.locator('iframe'),
    promoRow.locator('.ytp-chrome-bottom'),
    promoRow.locator('.vid-yt-mini-box'),
  ];
}

export function exclusiveGamesVisualMasks(gamesRegion: Locator): Locator[] {
  return [
    gamesRegion.locator('a[href*="opengame"] img'),
    gamesRegion.locator('.owl-stage-outer'),
    gamesRegion.locator('.owl-nav'),
  ];
}

/** 播放清單區版型：不比對 YouTube 像素（另有功能測試） */
export async function assertPromoPlaylistLayoutVisible(page: Page) {
  const playlistRegion = promoPlaylistVideoRegion(page);
  await expect(playlistRegion, '播放清單影片區不可見').toBeVisible({ timeout: 15_000 });
  await expect(
    playlistRegion.locator('iframe, video, img, button, a').first(),
    '播放清單區應有播放器或操作元素',
  ).toBeVisible({ timeout: 15_000 });
}

/** 宣傳橫列版型：左側橫幅與右側播放清單區塊應有正常媒體元素（不比對影片像素） */
export async function assertPromoTopRowLayoutVisible(page: Page) {
  const leftBanners = promoLeftBannersRegion(page);
  const playlistRegion = promoPlaylistVideoRegion(page);

  await expect(leftBanners, '左側宣傳橫幅不可見').toBeVisible({ timeout: 15_000 });
  await expect(playlistRegion, '播放清單影片區不可見').toBeVisible({ timeout: 15_000 });

  const bannerLinks = getPromoBannerLinks(page);
  expect(await bannerLinks.count(), '左側應至少有兩個宣傳橫幅').toBeGreaterThanOrEqual(2);
  await expect(
    bannerLinks.first().locator('video, img'),
    '宣傳橫幅應有影片或圖示',
  ).toBeVisible({ timeout: 15_000 });

  await expect(
    playlistRegion.locator('iframe, video, img, button, a').first(),
    '播放清單區應有播放器或操作元素',
  ).toBeVisible({ timeout: 15_000 });
}

/** 關閉會擋住專屬遊戲區點擊的浮層（FIFA 底欄、活動彈窗） */
export async function dismissIndexBlockingOverlays(page: Page, site?: SiteConfig) {
  await dismissAllBlockingDialogs(page, site);
}

export async function scrollExclusiveGamesIntoView(page: Page, site?: SiteConfig) {
  await dismissIndexBlockingOverlays(page, site);
  const region = exclusiveGamesRegion(page);
  await expect(region, '專屬遊戲區不可見').toBeVisible({ timeout: 15_000 });
  await region.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await page.waitForTimeout(500);
  await dismissIndexBlockingOverlays(page, site);
  return region;
}

/** Owl 輪播目前可見、非 clone 的遊戲連結 */
export function getVisibleExclusiveGameLinks(page: Page): Locator {
  return exclusiveGamesRegion(page).locator('.owl-item.active:not(.cloned) a[href*="opengame"]');
}

export async function clickExclusiveCarousel(page: Page, direction: 'next' | 'prev') {
  const region = exclusiveGamesRegion(page);
  const btn = region.locator(direction === 'next' ? '.owl-next' : '.owl-prev').first();
  await dismissIndexBlockingOverlays(page);
  await expect(btn, `輪播${direction === 'next' ? '右' : '左'}箭頭應可見`).toBeVisible({ timeout: 10_000 });
  await btn.click({ timeout: 10_000, force: true });
  await page.waitForTimeout(700);
}

function normalizeOpengameUrl(raw: string, base: string): string {
  return new URL(raw, base).href.replace(/\/$/, '');
}

/** 點擊遊戲後，新分頁／導向網址應與首頁 href 一致 */
export async function clickAndAssertGameOpensSameUrl(
  page: Page,
  target: Locator,
  label: string,
  site?: SiteConfig,
) {
  await dismissAllBlockingDialogs(page, site);
  await expect(target, `找不到：${label}`).toBeVisible({ timeout: 15_000 });
  const href = (await target.getAttribute('href')) ?? '';
  expect(href, `${label} 缺少 opengame 連結`).toMatch(/opengame/i);
  const expectedUrl = normalizeOpengameUrl(href, page.url());
  const homeUrl = page.url();

  const popupPromise = page.context().waitForEvent('page', { timeout: 20_000 }).catch(() => null);
  await target.click({ timeout: 15_000, force: true });
  const popup = await popupPromise;

  let actualUrl = '';
  if (popup) {
    await popup.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => {});
    actualUrl = normalizeOpengameUrl(popup.url(), homeUrl);
    await popup.close().catch(() => {});
  }

  if (!actualUrl) {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      for (const p of page.context().pages()) {
        const url = p.url();
        if (!url || url === homeUrl || url === 'about:blank') continue;
        if (!/opengame/i.test(url)) continue;
        actualUrl = normalizeOpengameUrl(url, homeUrl);
        if (p !== page) {
          await p.close().catch(() => {});
        }
        break;
      }
      if (actualUrl) break;
      if (page.url() !== homeUrl && /opengame/i.test(page.url())) {
        actualUrl = normalizeOpengameUrl(page.url(), homeUrl);
        break;
      }
      await page.waitForTimeout(300);
    }
  }

  if (actualUrl && page.url() !== homeUrl) {
    await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
    await dismissAllBlockingDialogs(page, site);
  }

  expect(actualUrl, `${label} 開啟網址應與首頁連結一致`).toBe(expectedUrl);
}

export async function getViewportExclusiveGameHrefs(page: Page): Promise<string[]> {
  const games = getVisibleExclusiveGameLinks(page);
  const count = await games.count();
  const hrefs: string[] = [];

  for (let i = 0; i < count; i += 1) {
    const game = games.nth(i);
    if (!(await isExclusiveGameInViewport(game))) continue;
    const href = (await game.getAttribute('href')) ?? '';
    if (href) hrefs.push(href);
  }

  return [...new Set(hrefs)].sort();
}

/** 點擊目前可視範圍內第一個遊戲，驗證開啟網址與 href 一致 */
export async function assertFirstVisibleGameOpensSameUrl(
  page: Page,
  phase: string,
  site?: SiteConfig,
) {
  const games = getVisibleExclusiveGameLinks(page);
  const count = await games.count();

  for (let i = 0; i < count; i += 1) {
    const game = games.nth(i);
    if (!(await isExclusiveGameInViewport(game))) continue;
    await clickAndAssertGameOpensSameUrl(page, game, `${phase} 可點擊遊戲`, site);
    return;
  }

  throw new Error(`${phase} 找不到可視範圍內的遊戲卡片`);
}

async function isExclusiveGameInViewport(game: Locator): Promise<boolean> {
  return game.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const xOverlap = Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
    const yOverlap = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
    return xOverlap > rect.width * 0.5 && yOverlap > rect.height * 0.5;
  });
}

/** 檢查目前輪播畫面上可視範圍內的遊戲，點擊後比對網址 */
export async function assertVisibleExclusiveGamesMatchHref(
  page: Page,
  phase: string,
  checkedHrefs: Set<string>,
  site?: SiteConfig,
) {
  const games = getVisibleExclusiveGameLinks(page);
  const count = await games.count();
  let checkedInPhase = 0;

  for (let i = 0; i < count; i += 1) {
    const game = games.nth(i);
    if (!(await isExclusiveGameInViewport(game))) continue;

    const href = (await game.getAttribute('href')) ?? '';
    if (!href || checkedHrefs.has(href)) continue;

    checkedHrefs.add(href);
    checkedInPhase += 1;
    await clickAndAssertGameOpensSameUrl(
      page,
      game,
      `${phase} 第 ${checkedInPhase} 個專屬遊戲`,
      site,
    );
    await scrollExclusiveGamesIntoView(page, site);
  }

  expect(checkedInPhase, `${phase}應至少有一款可點擊遊戲`).toBeGreaterThan(0);
}

/** 右側浮動選單（紅框右） */
export function rightMenuRegion(page: Page): Locator {
  return page.locator('.friendlink-right').first();
}

export async function getBannerHref(banner: Locator): Promise<string> {
  const href = (await banner.getAttribute('href')) ?? '';
  if (href) return href;
  const owlHref = (await banner.getAttribute('data-owl-href')) ?? '';
  if (owlHref) return owlHref;
  return (await banner.getAttribute('data-member-href')) ?? '';
}

export async function clickAndAssertHrefNavigation(
  page: Page,
  target: Locator,
  label: string,
  site?: SiteConfig,
) {
  await dismissAllBlockingDialogs(page, site);
  await expect(target, `找不到：${label}`).toBeVisible({ timeout: 15_000 });
  const href = await getBannerHref(target);
  expect(href, `${label} 缺少連結`).toMatch(/^https?:\/\/|^\//);

  const homeUrl = page.url();
  await target.click({ timeout: 15_000 });

  const deadline = Date.now() + 30_000;
  let finalUrl = '';

  while (Date.now() < deadline) {
    for (const p of page.context().pages()) {
      const url = p.url();
      if (url && url !== homeUrl && url !== 'about:blank') {
        finalUrl = url;
        if (p !== page) {
          await p.close().catch(() => {});
        }
        break;
      }
    }
    if (finalUrl) break;
    if (page.url() !== homeUrl) {
      finalUrl = page.url();
      break;
    }
    await page.waitForTimeout(300);
  }

  expect(finalUrl, `${label} 點擊後未產生導向`).toMatch(/^https?:\/\//);
}

