import { expect, type Locator, type Page } from '@playwright/test';
import type { NavigationCase, SiteConfig, UrlMatch } from '../../sites/types';

const DIALOG_WRAPPER = '.el-dialog__wrapper';
const VISIBLE_DIALOG_WRAPPER = '.el-dialog__wrapper:visible';
const DIALOG_CLOSE = '.dark-close';

const DIALOG_CLOSE_SELECTORS = [
  DIALOG_CLOSE,
  '.el-dialog__headerbtn',
  '.el-dialog__headerbtn .el-dialog__close',
  'button.el-dialog__headerbtn',
];

function resolveTarget(page: Page, selector: string) {
  return page.locator(selector).first();
}

function matchUrl(actual: string, rule: UrlMatch): boolean {
  if (rule.type === 'hostname') {
    const u = new URL(actual);
    return u.hostname === rule.value || u.hostname.endsWith(`.${rule.value}`);
  }

  return actual.startsWith(rule.value);
}

function assertUrl(actual: string, rules: UrlMatch | UrlMatch[]) {
  const list = Array.isArray(rules) ? rules : [rules];
  const ok = list.some((r) => matchUrl(actual, r));
  expect(ok, `URL 不符合預期。實際: ${actual}\n規則: ${JSON.stringify(list)}`).toBeTruthy();
}

async function clickVisibleDialogClose(page: Page, site?: SiteConfig): Promise<boolean> {
  const wrapper = page.locator(VISIBLE_DIALOG_WRAPPER).first();
  if (!(await wrapper.isVisible().catch(() => false))) {
    return false;
  }

  const preferred = site?.homePopupDismissSelector ?? DIALOG_CLOSE;
  const selectors = [preferred, ...DIALOG_CLOSE_SELECTORS.filter((s) => s !== preferred)];

  for (const selector of selectors) {
    const btn = wrapper.locator(selector).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout: 5_000, force: true }).catch(() => {});
      await page.waitForTimeout(300);
      return true;
    }
  }

  const emptyBtn = wrapper.getByRole('button').filter({ hasText: /^$/ }).first();
  if (await emptyBtn.isVisible().catch(() => false)) {
    await emptyBtn.click({ timeout: 5_000, force: true }).catch(() => {});
    await page.waitForTimeout(300);
    return true;
  }

  return false;
}

/** 登入後 7 日簽到彈窗（checkInDay）；僅處理彈窗內容，避免誤判右側浮動紅包等 .gift-block */
async function dismissCheckInDialog(page: Page): Promise<boolean> {
  const wrapper = page
    .locator(VISIBLE_DIALOG_WRAPPER)
    .filter({ has: page.locator('.content-block.checkInDay, .checkInDay, .gift-block') })
    .first();
  if (!(await wrapper.isVisible().catch(() => false))) {
    return false;
  }

  const scope = wrapper;

  const hideToday = scope.locator('input[type="checkbox"]').first();
  if (await hideToday.isVisible().catch(() => false)) {
    await hideToday.check({ force: true }).catch(() => hideToday.click({ force: true }).catch(() => {}));
    await page.waitForTimeout(200);
  }

  for (const selector of DIALOG_CLOSE_SELECTORS) {
    const btn = scope.locator(selector).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout: 5_000, force: true }).catch(() => {});
      await page.waitForTimeout(300);
      return true;
    }
  }

  const headerBtn = scope.locator('button').first();
  if (await headerBtn.isVisible().catch(() => false)) {
    await headerBtn.click({ timeout: 5_000, force: true }).catch(() => {});
    await page.waitForTimeout(300);
    return true;
  }

  return false;
}

/** 浮動活動元件（寶箱、幸運紅包等） */
async function dismissFloatingOverlays(page: Page) {
  const floatingCloseSelectors = [
    '.friendlink-left .dark-close',
    '.friendlink-right .dark-close',
    '.friendlink-gift .dark-close',
    '.lucky-red-envelope .close',
    '.lucky-envelope .close',
    '[class*="red-envelope"] .close',
    '[class*="red-envelope"] .dark-close',
    '.treasure-box .close',
    '.treasure-box .dark-close',
  ];

  for (const selector of floatingCloseSelectors) {
    const closeBtn = page.locator(selector).first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click({ timeout: 3_000, force: true }).catch(() => {});
      await page.waitForTimeout(200);
    }
  }
}

/** 關閉 Tawk 客服展開面板，避免擋住右側選單點擊 */
export async function dismissTawkWidget(page: Page) {
  await page
    .evaluate(() => {
      const api = (
        window as Window & {
          Tawk_API?: { minimize?: () => void; hideWidget?: () => void };
        }
      ).Tawk_API;
      api?.minimize?.();
      api?.hideWidget?.();
    })
    .catch(() => {});

  const tawkFrame = page.frameLocator('iframe[title*="chat" i], iframe[title*="Chat" i]').first();
  const frameClose = tawkFrame
    .locator('button[aria-label*="close" i], button[aria-label*="minimize" i], .tawk-button')
    .first();
  if (await frameClose.isVisible().catch(() => false)) {
    await frameClose.click({ timeout: 3_000, force: true }).catch(() => {});
  }

  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);
}

type DismissDialogsOptions = {
  /** 單次呼叫最長耗時，避免 beforeEach 等 hook 被無限重試拖滿測試逾時 */
  maxMs?: number;
};

/** 關閉底部 FIFA 橫幅、活動彈窗等所有可能擋住操作的浮層 */
export async function dismissAllBlockingDialogs(
  page: Page,
  site?: SiteConfig,
  options?: DismissDialogsOptions,
) {
  const deadline = Date.now() + (options?.maxMs ?? 25_000);
  const expired = () => Date.now() >= deadline;

  await dismissFloatingOverlays(page);
  await dismissTawkWidget(page);

  const fifaClose = page
    .locator('#fifa2026-window [class*="close"], #fifa2026-window button')
    .first();
  if (await fifaClose.isVisible().catch(() => false)) {
    await fifaClose.click({ timeout: 3_000, force: true }).catch(() => {});
    await page.waitForTimeout(200);
  }

  for (let attempt = 0; attempt < 8 && !expired(); attempt += 1) {
    await dismissFloatingOverlays(page);

    if (await dismissCheckInDialog(page)) {
      await page.waitForTimeout(300);
      continue;
    }

    const visibleCount = await page.locator(VISIBLE_DIALOG_WRAPPER).count();
    if (visibleCount === 0) {
      await dismissTawkWidget(page);
      return;
    }

    const closed = await clickVisibleDialogClose(page, site);
    if (!closed) {
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(300);
  }
}

/** 關閉 Element UI 首頁彈窗（與電腦版錄製流程一致） */
export async function dismissHomePopup(page: Page, site: SiteConfig) {
  const appeared = await page
    .locator(VISIBLE_DIALOG_WRAPPER)
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 })
    .then(() => true)
    .catch(() => false);

  if (!appeared) {
    return;
  }

  await dismissAllBlockingDialogs(page, site);
}

/** 確認沒有可見彈窗擋住頁面（登入後活動彈窗、進入彈窗等） */
export async function ensureDialogClosed(page: Page, site?: SiteConfig) {
  await dismissAllBlockingDialogs(page, site);
  await expect(page.locator(VISIBLE_DIALOG_WRAPPER), '彈窗仍擋住頁面').toHaveCount(0, {
    timeout: 15_000,
  });
}

export async function gotoHomepage(page: Page, site: SiteConfig) {
  const homeUrl = process.env.HOME_URL ?? site.homeUrl;
  await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
}

export async function openHome(page: Page, site: SiteConfig) {
  await gotoHomepage(page, site);
  await dismissHomePopup(page, site);
  await ensureDialogClosed(page, site);

  if (site.gtmReadyWaitMs && site.gtmReadyWaitMs > 0) {
    await page.waitForTimeout(site.gtmReadyWaitMs);
  }
}

async function clickGtmAndAssertUrl(
  page: Page,
  target: Locator,
  rules: UrlMatch | UrlMatch[],
) {
  const urlMatches = (url: string) => {
    const list = Array.isArray(rules) ? rules : [rules];
    return list.some((rule) => matchUrl(url, rule));
  };

  const urlBefore = page.url();
  await target.click({ timeout: 15_000 });

  const deadline = Date.now() + 45_000;
  let matchedUrl = '';

  while (Date.now() < deadline) {
    for (const p of page.context().pages()) {
      const current = p.url();
      if (current === urlBefore || current === 'about:blank') continue;
      if (urlMatches(current)) {
        matchedUrl = current;
        if (p !== page) {
          await p.close().catch(() => {});
        }
        break;
      }
    }
    if (matchedUrl) break;
    await page.waitForTimeout(400);
  }

  if (!matchedUrl) {
    const urls = page.context().pages().map((p) => p.url()).join(', ');
    throw new Error(`點擊下載後未在 45 秒內到達目標 URL。\n目前: ${urls}`);
  }

  assertUrl(matchedUrl, rules);
}

export async function clickAndAssertNavigation(
  page: Page,
  nav: NavigationCase,
  site: SiteConfig,
) {
  await ensureDialogClosed(page, site);

  const target = resolveTarget(page, nav.click.selector);
  await expect(target, '找不到下載按鈕').toBeVisible({ timeout: 15_000 });
  await target.scrollIntoViewIfNeeded().catch(() => {});

  if (nav.gtmClick) {
    await clickGtmAndAssertUrl(page, target, nav.expect.url);
    return;
  }

  const before = page.url();
  await target.click({ timeout: 15_000 });

  await page.waitForTimeout(1500);
  const allUrls = page.context().pages().map((p) => p.url()).filter((u) => u && u !== 'about:blank');
  const picked = allUrls.find((u) => u !== before) ?? page.url();
  assertUrl(picked, nav.expect.url);
}
