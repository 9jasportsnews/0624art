import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { createWorker, PSM } from 'tesseract.js';
import fs from 'fs';
import path from 'path';
import type { SiteConfig } from '../../sites/types';
import { testAccount } from '../../sites/jitabet-env';
import { dismissAllBlockingDialogs, dismissHomePopup, gotoHomepage, openHome } from './navigation';

export const testUsername = testAccount.username;
export const testPassword = testAccount.password;

const MEMBER_STORAGE_PATH = path.join(process.cwd(), '.auth', 'member-storage.json');
const MEMBER_PROMO_LINK = '.friendlink-right a[href*="/member/promotion/apply"]';

export function memberStorageFilePath(): string {
  return MEMBER_STORAGE_PATH;
}

export function memberStorageFileExists(): boolean {
  return fs.existsSync(MEMBER_STORAGE_PATH);
}

function readMemberStorageFile(): Awaited<ReturnType<BrowserContext['storageState']>> | null {
  if (!memberStorageFileExists()) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(MEMBER_STORAGE_PATH, 'utf-8')) as Awaited<
      ReturnType<BrowserContext['storageState']>
    >;
  } catch {
    return null;
  }
}

export async function saveMemberStorage(page: Page) {
  fs.mkdirSync(path.dirname(MEMBER_STORAGE_PATH), { recursive: true });
  const state = await page.context().storageState();
  cachedMemberStorage = state;
  fs.writeFileSync(MEMBER_STORAGE_PATH, JSON.stringify(state));
  return state;
}

export async function tryRestoreMemberSession(page: Page, site: SiteConfig): Promise<boolean> {
  const memberPromoLink = page.locator(MEMBER_PROMO_LINK).first();

  let state = cachedMemberStorage ?? readMemberStorageFile();
  if (!state) {
    return false;
  }

  await applyStorageState(page, state);
  await gotoHomepage(page, site);
  await dismissHomePopup(page, site);
  await dismissAllBlockingDialogs(page, site, { maxMs: 15_000 });

  if (await memberPromoLink.isVisible().catch(() => false)) {
    cachedMemberStorage = state;
    await waitForMemberUiReady(page, site);
    return true;
  }

  cachedMemberStorage = null;
  return false;
}

function isManualCaptchaMode(): boolean {
  return process.env.MANUAL_CAPTCHA === '1' || process.env.TEST_MANUAL_CAPTCHA === '1';
}

let cachedMemberStorage: Awaited<ReturnType<BrowserContext['storageState']>> | null = null;

async function applyStorageState(
  page: Page,
  state: Awaited<ReturnType<BrowserContext['storageState']>>,
) {
  if (state.cookies.length > 0) {
    await page.context().addCookies(state.cookies);
  }

  for (const originState of state.origins ?? []) {
    const items = originState.localStorage ?? [];
    if (items.length === 0) continue;

    await page
      .goto(originState.origin, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      .catch(() => {});

    await page.evaluate((storageItems) => {
      for (const { name, value } of storageItems) {
        localStorage.setItem(name, value);
      }
    }, items);
  }
}

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

/** 在瀏覽器內前處理驗證碼，並切成 4 格各自 OCR */
async function recognizeCaptchaByDigits(page: Page, src: string): Promise<string> {
  const digitBase64List = await page.evaluate(async (imageSrc) => {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('驗證碼圖片載入失敗'));
      img.src = imageSrc;
    });

    const scale = 4;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(img.width * scale, 160);
    canvas.height = Math.max(img.height * scale, 48);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('無法建立 canvas');
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < imageData.data.length; i += 4) {
      const r = imageData.data[i];
      const g = imageData.data[i + 1];
      const b = imageData.data[i + 2];
      const isRedDigit = r > 120 && r - g > 35 && r - b > 35;
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const value = isRedDigit || gray < 170 ? 0 : 255;
      imageData.data[i] = value;
      imageData.data[i + 1] = value;
      imageData.data[i + 2] = value;
    }
    ctx.putImageData(imageData, 0, 0);

    const projection = new Array(canvas.width).fill(0);
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const idx = (y * canvas.width + x) * 4;
        if (imageData.data[idx] < 128) {
          projection[x] += 1;
        }
      }
    }

    const segments: Array<{ start: number; end: number }> = [];
    let inSegment = false;
    let start = 0;
    for (let x = 0; x < projection.length; x += 1) {
      const active = projection[x] > 2;
      if (active && !inSegment) {
        inSegment = true;
        start = x;
      } else if (!active && inSegment) {
        inSegment = false;
        segments.push({ start, end: x });
      }
    }
    if (inSegment) {
      segments.push({ start, end: projection.length });
    }

    const picked =
      segments.length >= 4
        ? segments.slice(0, 4)
        : Array.from({ length: 4 }, (_, i) => {
            const sliceWidth = Math.floor(canvas.width / 4);
            return { start: i * sliceWidth, end: (i + 1) * sliceWidth };
          });

    const slices: string[] = [];
    for (const { start: segStart, end: segEnd } of picked) {
      const pad = 2;
      const x = Math.max(0, segStart - pad);
      const w = Math.min(canvas.width - x, segEnd - segStart + pad * 2);
      const slice = document.createElement('canvas');
      slice.width = Math.max(w, 8);
      slice.height = canvas.height;
      const sliceCtx = slice.getContext('2d');
      if (!sliceCtx) {
        continue;
      }
      sliceCtx.fillStyle = '#ffffff';
      sliceCtx.fillRect(0, 0, slice.width, slice.height);
      sliceCtx.drawImage(canvas, x, 0, w, canvas.height, 0, 0, slice.width, slice.height);
      slices.push(slice.toDataURL('image/png').split(',')[1] ?? '');
    }
    return slices;
  }, src);

  if (digitBase64List.length !== 4) {
    throw new Error('驗證碼切分失敗');
  }

  const worker = await createWorker('eng');
  try {
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789',
      tessedit_pageseg_mode: PSM.SINGLE_CHAR,
    });

    let code = '';
    for (const base64 of digitBase64List) {
      if (!base64) {
        throw new Error('驗證碼切分圖片缺失');
      }
      const {
        data: { text },
      } = await worker.recognize(Buffer.from(base64, 'base64'));
      const digit = normalizeOcrText(text).replace(/\D/g, '').charAt(0);
      if (!digit) {
        throw new Error(`單字 OCR 失敗: ${text}`);
      }
      code += digit;
    }
    return code;
  } finally {
    await worker.terminate();
  }
}

async function ocrCaptchaBuffer(imageBuffer: Buffer): Promise<string> {
  const worker = await createWorker('eng');
  try {
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789',
    });

    const candidates: string[] = [];
    for (const psm of [PSM.SINGLE_WORD, PSM.SINGLE_LINE, PSM.SPARSE_TEXT]) {
      await worker.setParameters({ tessedit_pageseg_mode: psm });
      const {
        data: { text },
      } = await worker.recognize(imageBuffer);
      const digits = normalizeOcrText(text).replace(/\D/g, '').slice(0, 4);
      if (digits.length === 4) {
        candidates.push(digits);
      }
    }

    if (candidates.length === 0) {
      throw new Error('OCR 驗證碼解析失敗');
    }

    const counts = new Map<string, number>();
    for (const code of candidates) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  } finally {
    await worker.terminate();
  }
}

async function recognizeCaptchaDigits(page: Page, captchaImage: Locator, src: string): Promise<string> {
  if (src.startsWith('data:image/')) {
    try {
      const byDigits = await recognizeCaptchaByDigits(page, src);
      if (/^\d{4}$/.test(byDigits)) {
        return byDigits;
      }
    } catch {
      // fallback to whole-image OCR
    }
    return await ocrCaptchaBuffer(decodeImageSourceToBuffer(src));
  }

  return await ocrCaptchaBuffer(await captchaImage.screenshot());
}

async function refreshCaptcha(captchaImage: Locator) {
  await captchaImage.click({ timeout: 5_000 }).catch(() => {});
  await captchaImage.page().waitForTimeout(800);
}

/** Vue 表單需觸發 input 事件，否則送出時驗證碼欄位可能為空 */
async function fillCaptchaInput(captchaInput: Locator, captchaCode: string) {
  await captchaInput.click({ timeout: 5_000 });
  await captchaInput.fill('');
  await captchaInput.fill(captchaCode);
  await captchaInput.evaluate((el, value) => {
    const input = el as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, captchaCode);
  await expect(captchaInput, '驗證碼應已填入輸入框').toHaveValue(captchaCode, { timeout: 5_000 });
}

/** 登入後等 loading、toast、彈窗不再擋住右側選單點擊 */
export async function waitForMemberUiReady(page: Page, site?: SiteConfig) {
  await page.locator('#loadingBlock').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});

  await expect
    .poll(
      async () => {
        const blocking = await page
          .locator('#loadingBlock, .el-loading-mask')
          .evaluateAll((nodes) =>
            nodes.some((node) => {
              const el = node as HTMLElement;
              if (!el.isConnected) return false;
              const style = window.getComputedStyle(el);
              return style.display !== 'none' && style.visibility !== 'hidden' && style.pointerEvents !== 'none';
            }),
          );
        return !blocking;
      },
      { timeout: 30_000, message: '登入後 loading 遮罩應消失' },
    )
    .toBe(true);

  await expect
    .poll(
      async () => {
        const count = await page.locator('.el-notification').evaluateAll((nodes) =>
          nodes.filter((node) => {
            const el = node as HTMLElement;
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
          }).length,
        );
        return count;
      },
      { timeout: 15_000, message: '登入後通知 toast 應消失' },
    )
    .toBe(0)
    .catch(() => {});

  if (site) {
    await dismissAllBlockingDialogs(page, site, { maxMs: 20_000 });
    await expect(page.locator('.el-dialog__wrapper:visible'), '彈窗仍擋住頁面')
      .toHaveCount(0, { timeout: 10_000 })
      .catch(() => dismissAllBlockingDialogs(page, site, { maxMs: 10_000 }));
  }
}

/**
 * 開啟首頁 → .web_login 填帳密 → OCR 驗證碼 → 點「登入」送出。
 * 可設 TEST_CAPTCHA=1234 手動覆寫（畫面上驗證碼需一致）。
 */
export async function ensureLoggedIn(page: Page) {
  const usernameInput = page.locator('input[name="username"]').first();
  const loginVisible = await usernameInput.isVisible().catch(() => false);

  if (!loginVisible) {
    return;
  }

  const passwordInput = page.locator('input[name="pwd"]').first();
  const captchaInput = page.locator('input[name="captcha"]').first();
  const captchaImage = page.locator('.checknum_img img').first();
  const memberPromoLink = page.locator(MEMBER_PROMO_LINK).first();

  await expect(passwordInput, '找不到密碼輸入框').toBeVisible({ timeout: 15_000 });
  await expect(captchaInput, '找不到驗證碼輸入框').toBeVisible({ timeout: 15_000 });
  await expect(captchaImage, '找不到驗證碼圖片').toBeVisible({ timeout: 15_000 });

  const getCaptchaCode = async () => {
    if (process.env.TEST_CAPTCHA?.match(/^\d{4}$/)) {
      return process.env.TEST_CAPTCHA;
    }

    if (isManualCaptchaMode()) {
      if (process.env.PWDEBUG === '1' || process.env.PWDEBUG === 'console') {
        await page.pause();
      }
      await expect
        .poll(
          async () => {
            const value = await captchaInput.inputValue();
            return /^\d{4}$/.test(value) ? value : null;
          },
          {
            timeout: 120_000,
            message:
              '請在瀏覽器手動輸入 4 碼驗證碼（或於 .env 設定 TEST_CAPTCHA=1234）',
          },
        )
        .not.toBeNull();
      return await captchaInput.inputValue();
    }

    let captchaCode = '';
    let lastOcrError: unknown;
    const maxOcrAttempts = process.env.GITHUB_ACTIONS ? 6 : 4;

    for (let attempt = 1; attempt <= maxOcrAttempts; attempt += 1) {
      const captchaSrc = (await captchaImage.getAttribute('src')) ?? '';
      expect(captchaSrc, '驗證碼圖片來源缺失').not.toEqual('');

      try {
        captchaCode = await recognizeCaptchaDigits(page, captchaImage, captchaSrc);
        break;
      } catch (error) {
        lastOcrError = error;
        if (attempt === maxOcrAttempts) {
          throw new Error(`OCR 驗證碼重試 ${maxOcrAttempts} 次仍失敗: ${String(lastOcrError)}`);
        }
        await refreshCaptcha(captchaImage);
      }
    }

    expect(captchaCode, '未取得可用的 4 碼驗證碼').toMatch(/^\d{4}$/);
    return captchaCode;
  };

  const maxLoginAttempts = process.env.GITHUB_ACTIONS ? 8 : 5;
  let lastLoginError = '';

  for (let loginAttempt = 1; loginAttempt <= maxLoginAttempts; loginAttempt += 1) {
    await page.locator('#loadingBlock').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
    await usernameInput.fill(testUsername);
    await passwordInput.fill(testPassword);

    const captchaCode = await getCaptchaCode();
    await page.locator('#loadingBlock').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
    await fillCaptchaInput(captchaInput, captchaCode);

    const loginSubmit = page.locator('.web_login ul li').first();
    const loginResponse = page.waitForResponse(
      (res) => res.url().includes('/service/auth/login') && res.request().method() === 'POST',
      { timeout: 20_000 },
    );
    await loginSubmit.click({ timeout: 10_000 });

    let loginSucceeded = false;
    try {
      const response = await loginResponse;
      const payload = (await response.json()) as { code?: string };
      loginSucceeded = response.ok() && payload.code === 'common.success';
      if (!loginSucceeded) {
        lastLoginError = `第 ${loginAttempt} 次登入 API 失敗（驗證碼: ${captchaCode}，code: ${payload.code ?? response.status()}）`;
        if (payload.code === 'common.lockedAccount') {
          throw new Error(
            `測試帳號 ${testUsername} 已被鎖定（common.lockedAccount），請稍後再試或更換 TEST_USERNAME`,
          );
        }
      }
    } catch (error) {
      lastLoginError = `第 ${loginAttempt} 次未收到登入 API 回應（驗證碼: ${captchaCode}）: ${String(error)}`;
    }

    if (loginSucceeded) {
      await expect
        .poll(
          async () => {
            if (await memberPromoLink.isVisible().catch(() => false)) {
              return true;
            }
            return !(await usernameInput.isVisible().catch(() => false));
          },
          {
            timeout: 20_000,
            message: '登入 API 成功後應出現會員右側選單',
          },
        )
        .toBe(true);
      await saveMemberStorage(page).catch(() => {});
      return;
    }

    if (loginAttempt < maxLoginAttempts) {
      await refreshCaptcha(captchaImage);
    }
  }

  throw new Error(`登入失敗：已重試 ${maxLoginAttempts} 次。${lastLoginError}`);
}

export async function openHomeAndLogin(page: Page, site: SiteConfig) {
  if (await tryRestoreMemberSession(page, site)) {
    return;
  }

  await openHome(page, site);
  await ensureLoggedIn(page);
  await waitForMemberUiReady(page, site);
  await saveMemberStorage(page).catch(() => {});
}

/** 同 worker 內重用登入狀態，避免每個 test 都 OCR 登入 */
export async function openHomeAndLoginOnce(page: Page, site: SiteConfig) {
  await openHomeAndLogin(page, site);
}

export function resetCachedMemberLogin() {
  cachedMemberStorage = null;
  if (memberStorageFileExists()) {
    fs.unlinkSync(MEMBER_STORAGE_PATH);
  }
}
