import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import type { IndexClickTarget, IndexLinkCase } from '../../sites/jitabet-index';
import { dismissAllBlockingDialogs, dismissTawkWidget } from './navigation';

function resolveClick(page: Page, target: IndexClickTarget): Locator {
  switch (target.kind) {
    case 'role':
      return page.getByRole(target.role, { name: target.name }).first();
    case 'text':
      return page.getByText(target.text).first();
    case 'css':
      return page.locator(target.selector).first();
    default:
      throw new Error('Unknown click target');
  }
}

function assertUrlPatterns(actual: string, patterns: RegExp | RegExp[]) {
  const list = Array.isArray(patterns) ? patterns : [patterns];
  const ok = list.some((p) => p.test(actual));
  expect(ok, `URL 不符合預期。\n實際: ${actual}\n規則: ${list.map((p) => p.toString()).join(' 或 ')}`).toBeTruthy();
}

export async function assertIndexDialog(page: Page, variant: 'news' | 'qrcode') {
  const dialog = page.locator('.el-dialog__wrapper:visible .el-dialog').last();
  await expect(dialog, '應開啟彈窗').toBeVisible({ timeout: 15_000 });

  if (variant === 'news') {
    await expect(dialog.locator('.popup-news'), '應為新聞彈窗').toBeVisible();
    return;
  }

  await expect(dialog.locator('.popup-qrcode'), '應為 QR Code 彈窗').toBeVisible();
  await expect(dialog.locator('canvas#canvas'), 'QR Code 應已渲染').toBeVisible({ timeout: 15_000 });
}

async function resolveFinalUrlAfterClick(
  page: Page,
  context: BrowserContext,
  beforeUrl: string,
  popup: import('@playwright/test').Page | null,
) {
  let finalUrl = '';

  if (popup) {
    await popup.waitForLoadState('domcontentloaded').catch(() => {});
    finalUrl = popup.url();
    await popup.close().catch(() => {});
  } else {
    await page
      .waitForURL((url) => url.toString() !== beforeUrl, { timeout: 30_000 })
      .catch(() => {});
    finalUrl = page.url();
  }

  if (!finalUrl || finalUrl === beforeUrl) {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      for (const p of context.pages()) {
        const url = p.url();
        if (url && url !== beforeUrl && url !== 'about:blank') {
          finalUrl = url;
          if (p !== page) {
            await p.close().catch(() => {});
          }
          break;
        }
      }
      if (finalUrl && finalUrl !== beforeUrl) break;
      await page.waitForTimeout(400);
    }
  }

  return finalUrl;
}

export async function clickAndAssertIndexLink(
  page: Page,
  context: BrowserContext,
  linkCase: IndexLinkCase,
) {
  await dismissAllBlockingDialogs(page);
  const target = resolveClick(page, linkCase.click);
  await expect(target, `找不到：${linkCase.label}`).toBeVisible({ timeout: 15_000 });
  await target.scrollIntoViewIfNeeded();

  const beforeUrl = page.url();

  if (linkCase.expect.type === 'url') {
    const popupPromise = context.waitForEvent('page', { timeout: 20_000 }).catch(() => null);
    await target.click({ timeout: 15_000, force: true });
    const popup = await popupPromise;
    const finalUrl = await resolveFinalUrlAfterClick(page, context, beforeUrl, popup);
    assertUrlPatterns(finalUrl, linkCase.expect.pattern);
    return;
  }

  const clickTarget = async () => {
    await dismissAllBlockingDialogs(page);
    await target.scrollIntoViewIfNeeded();
    await target.click({ timeout: 15_000, force: true });
  };

  await clickTarget();

  if (linkCase.expect.type === 'dialog') {
    const dialog = page.locator('.el-dialog__wrapper:visible .el-dialog').last();
    if (!(await dialog.isVisible().catch(() => false))) {
      await page.waitForTimeout(800);
      await clickTarget();
    }
  } else if (linkCase.expect.type === 'tawk-script') {
    await page.waitForTimeout(600);
  }

  switch (linkCase.expect.type) {
    case 'stay-on-home':
      expect(page.url(), `${linkCase.label} 不應離開首頁`).toMatch(/jitabet\.cloud/i);
      return;

    case 'tawk-script': {
      const hasTawkEmbed = await page.evaluate(
        () =>
          document.documentElement.innerHTML.includes('embed.tawk.to') ||
          typeof (window as Window & { Tawk_API?: unknown }).Tawk_API === 'object',
      );
      expect(hasTawkEmbed, `${linkCase.label}：頁面應已載入 Tawk 客服腳本`).toBe(true);
      expect(page.url(), `${linkCase.label} 不應離開首頁`).toMatch(/jitabet\.cloud/i);
      await dismissTawkWidget(page);
      return;
    }

    case 'dialog':
      await assertIndexDialog(page, linkCase.expect.variant);
      expect(page.url(), `${linkCase.label} 彈窗應留在首頁`).toMatch(/jitabet\.cloud/i);
      return;

    default:
      throw new Error(`未支援的 expect 類型：${linkCase.label}`);
  }
}
