// 首頁左側宣傳區檢查：可見且有來源，點擊可導向
//
// 【與其他 spec 重疊說明】（刻意保留，不影響執行）
// - 第 1、2 橫幅點擊導向 ↔ homepage-index.spec.ts「宣傳橫幅連結」（該檔未登入、只驗 href）
// - 橫幅影片可見 ↔ homepage-video-playback.spec.ts（該檔用 assertHtml5VideoPlayback 較嚴：時間須前進）
// - 登入流程：本檔內嵌 OCR 登入，與 helpers/login.ts 邏輯類似但未共用
import { test, expect, devices, type BrowserContext, type Page } from '@playwright/test';
import { createWorker, PSM } from 'tesseract.js';
import { getSite } from '../../sites';
import { testAccount } from '../../sites/jitabet-env';
import { openHome } from '../helpers/navigation';

const siteId = process.env.SITE_ID ?? 'jitabet';
const site = getSite(siteId);
const testUsername = testAccount.username;
const testPassword = testAccount.password;

function decodeImageSourceToBuffer(src: string): Buffer {
  if (src.startsWith('data:image/')) {
    const base64 = src.split(',')[1] ?? '';
    if (!base64) {
      throw new Error('驗證碼圖片缺少 base64 內容');
    }
    return Buffer.from(base64, 'base64');
  }
  throw new Error(`驗證碼圖片格式不支援: ${src.slice(0, 80)}`);
}

function normalizeOcrText(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/Z/g, '2')
    .replace(/S/g, '5')
    .replace(/B/g, '8')
    .replace(/\$/g, '5');
}

async function recognizeCaptchaDigits(src: string): Promise<string> {
  const worker = await createWorker('eng');
  try {
    const imageBuffer = decodeImageSourceToBuffer(src);
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789',
      tessedit_pageseg_mode: PSM.SINGLE_WORD,
    });
    const {
      data: { text },
    } = await worker.recognize(imageBuffer);
    const normalized = normalizeOcrText(text);
    const digits = normalized.replace(/\D/g, '').slice(0, 4);
    if (digits.length !== 4) {
      throw new Error(`OCR 驗證碼解析失敗，原始結果: ${text}`);
    }
    return digits;
  } finally {
    await worker.terminate();
  }
}

async function ensureLoggedIn(page: Page) {
  const usernameInput = page.locator('input[name="username"]').first();
  const loginVisible = await usernameInput.isVisible().catch(() => false);

  if (!loginVisible) {
    return;
  }

  const passwordInput = page.locator('input[name="pwd"]').first();
  const captchaInput = page.locator('input[name="captcha"]').first();
  const captchaImage = page.locator('.checknum_img img').first();

  await expect(passwordInput, '找不到密碼輸入框').toBeVisible({ timeout: 15_000 });
  await expect(captchaInput, '找不到驗證碼輸入框').toBeVisible({ timeout: 15_000 });
  await expect(captchaImage, '找不到驗證碼圖片').toBeVisible({ timeout: 15_000 });

  const bannerAfterLogin = page
    .locator('#pr-home-banner a[data-member-href], .home_banner .home_banner-col a')
    .first();

  const getCaptchaCode = async () => {
    let captchaCode = '';
    let lastOcrError: unknown;
    let previousSrc = '';
    const maxOcrAttempts = 4;

    for (let attempt = 1; attempt <= maxOcrAttempts; attempt += 1) {
      const captchaSrc = (await captchaImage.getAttribute('src')) ?? '';
      expect(captchaSrc, '驗證碼圖片來源缺失').not.toEqual('');

      try {
        captchaCode = await recognizeCaptchaDigits(captchaSrc);
        break;
      } catch (error) {
        lastOcrError = error;
        if (attempt === maxOcrAttempts) {
          throw new Error(`OCR 驗證碼重試 ${maxOcrAttempts} 次仍失敗: ${String(lastOcrError)}`);
        }

        previousSrc = captchaSrc;
        await captchaImage.click({ timeout: 5_000 }).catch(() => {});
        await expect
          .poll(async () => (await captchaImage.getAttribute('src')) ?? '', {
            timeout: 6_000,
            message: '刷新驗證碼後圖片未更新',
          })
          .not.toBe(previousSrc);
      }
    }

    expect(captchaCode, '未取得可用的 4 碼驗證碼').toMatch(/^\d{4}$/);
    return captchaCode;
  };

  const maxLoginAttempts = 4;
  let lastLoginError = '';

  for (let loginAttempt = 1; loginAttempt <= maxLoginAttempts; loginAttempt += 1) {
    await usernameInput.fill(testUsername);
    await passwordInput.fill(testPassword);

    const captchaCode = await getCaptchaCode();
    await captchaInput.fill(captchaCode);

    const loginButton = page.getByRole('button', { name: /login|登入/i }).first();
    if (await loginButton.isVisible().catch(() => false)) {
      await loginButton.click({ timeout: 10_000 });
    } else {
      await captchaInput.press('Enter');
    }

    await page.waitForTimeout(2_000);

    const stillInLogin = await usernameInput.isVisible().catch(() => false);
    const bannerVisible = await bannerAfterLogin.isVisible().catch(() => false);
    if (!stillInLogin || bannerVisible) {
      return;
    }

    lastLoginError = `第 ${loginAttempt} 次登入後仍停留在登入畫面`;
    if (loginAttempt < maxLoginAttempts) {
      const before = (await captchaImage.getAttribute('src')) ?? '';
      await captchaImage.click({ timeout: 5_000 }).catch(() => {});
      await expect
        .poll(async () => (await captchaImage.getAttribute('src')) ?? '', {
          timeout: 6_000,
          message: '登入失敗後刷新驗證碼未更新',
        })
        .not.toBe(before);
    }
  }

  throw new Error(`登入失敗：已重試 ${maxLoginAttempts} 次。${lastLoginError}`);
}

async function openHomeAndLogin(page: Page) {
  await test.step('開啟首頁並關閉彈窗', async () => {
    await openHome(page, site);
  });
  await test.step('若未登入則自動登入（含 OCR 驗證碼）', async () => {
    await ensureLoggedIn(page);
  });
}

function getPromoBannerLocator(page: Page, mobile = false) {
  if (mobile) {
    return page.locator(
      '#pr-home-banner .home_banner-col.a a, #pr-home-banner .home_banner-col.b a',
    ).filter({
      has: page.locator('video'),
    });
  }

  return page
    .locator('#pr-home-banner a[data-member-href], .home_banner .home_banner-col a')
    .filter({ has: page.locator('video') });
}

async function getPromoBanners(page: Page, mobile = false) {
  if (mobile) {
    const bannerRoot = page.locator('#pr-home-banner').first();
    await bannerRoot.waitFor({ state: 'attached', timeout: 20_000 });
    await bannerRoot.scrollIntoViewIfNeeded();
  }

  const banners = getPromoBannerLocator(page, mobile);
  await expect(banners.first(), '首頁宣傳區未找到可點擊區塊').toBeVisible({ timeout: 20_000 });
  const bannerCount = await banners.count();
  expect(bannerCount, '首頁宣傳區至少應有 2 個可點擊區塊').toBeGreaterThanOrEqual(2);
  return banners;
}

async function getBannerLink(banner: import('@playwright/test').Locator) {
  const href = (await banner.getAttribute('href')) ?? '';
  if (href) return href;
  const owlHref = (await banner.getAttribute('data-owl-href')) ?? '';
  if (owlHref) return owlHref;
  return (await banner.getAttribute('data-member-href')) ?? '';
}

async function assertBannerVideo(page: Page, index: number, mobile = false) {
  const banners = await getPromoBanners(page, mobile);
  const banner = banners.nth(index);
  const video = banner.locator('video').first();
  await expect(banner, `第 ${index + 1} 個宣傳區塊不可見`).toBeVisible({ timeout: 15_000 });
  await expect(video, `第 ${index + 1} 個宣傳區塊影片不可見`).toBeVisible({ timeout: 15_000 });
  const src = (await video.getAttribute('src')) ?? '';
  expect(src, `第 ${index + 1} 個宣傳區塊影片來源缺失`).not.toEqual('');
  expect(src, `第 ${index + 1} 個宣傳區塊影片來源非 mp4`).toContain('.mp4');
}

async function assertBannerNavigation(page: Page, index: number, mobile = false) {
  const banners = await getPromoBanners(page, mobile);
  const banner = banners.nth(index);
  const href = await getBannerLink(banner);
  expect(href, `第 ${index + 1} 個宣傳區塊連結缺失`).not.toEqual('');

  await banner.click({ timeout: 15_000 });
  const currentBefore = site.homeUrl;
  const deadline = Date.now() + 30_000;
  let targetUrl = '';

  while (Date.now() < deadline) {
    const current = page.url();
    if (current && current !== currentBefore && current !== 'about:blank') {
      targetUrl = current;
      break;
    }

    for (const p of page.context().pages()) {
      const u = p.url();
      if (u && u !== currentBefore && u !== 'about:blank') {
        targetUrl = u;
        if (p !== page) {
          await p.close().catch(() => {});
        }
        break;
      }
    }

    if (targetUrl) break;
    await page.waitForTimeout(300);
  }

  expect(targetUrl, `第 ${index + 1} 個宣傳區塊點擊後未產生導向`).not.toEqual('');
  expect(targetUrl, `第 ${index + 1} 個宣傳區塊點擊後 URL 不合理`).toMatch(/^https?:\/\//);
}

test.describe('電腦版-首頁宣傳區檢查', () => {
  test.beforeEach(async ({ page }) => {
    await openHomeAndLogin(page);
  });

  test('第 1 個宣傳區塊：影片可見且有來源', async ({ page }) => {
    await assertBannerVideo(page, 0);
  });

  test('第 1 個宣傳區塊：點擊可導向', async ({ page }) => {
    await assertBannerNavigation(page, 0);
  });

  test('第 2 個宣傳區塊：影片可見且有來源', async ({ page }) => {
    await assertBannerVideo(page, 1);
  });

  test('第 2 個宣傳區塊：點擊可導向', async ({ page }) => {
    await assertBannerNavigation(page, 1);
  });
});

//手機版宣傳內容
test.describe('手機版-首頁宣傳區檢查', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    context = await browser.newContext({
      ...devices['iPhone 13'],
    });
    page = await context.newPage();
    await openHomeAndLogin(page);
  });

  test.afterEach(async () => {
    await context?.close();
  });

  test('第 1 個宣傳區塊：影片可見且有來源', async () => {
    await assertBannerVideo(page, 0, true);
  });

  test('第 1 個宣傳區塊：點擊可導向', async () => {
    await assertBannerNavigation(page, 0, true);
  });

  test('第 2 個宣傳區塊：影片可見且有來源', async () => {
    await assertBannerVideo(page, 1, true);
  });

  test('第 2 個宣傳區塊：點擊可導向', async () => {
    await assertBannerNavigation(page, 1, true);
  });
});
