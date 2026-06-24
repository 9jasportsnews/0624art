import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import type { W01ClickTarget, W01LinkCase } from '../../sites/w01-jitabet';

function resolveClick(page: Page, target: W01ClickTarget): Locator {
  switch (target.kind) {
    case 'role':
      return page.getByRole(target.role, { name: target.name }).first();
    case 'text':
      return page.getByText(target.text).first();
    default:
      throw new Error('Unknown click target');
  }
}

function assertUrlPatterns(actual: string, patterns: RegExp | RegExp[]) {
  const list = Array.isArray(patterns) ? patterns : [patterns];
  const ok = list.some((p) => p.test(actual));
  expect(ok, `URL 不符合預期。\n實際: ${actual}\n規則: ${list.map((p) => p.toString()).join(' 或 ')}`).toBeTruthy();
}

/** 點擊後取得最終 URL（支援同分頁或新分頁） */
export async function clickAndAssertW01Link(
  page: Page,
  context: BrowserContext,
  linkCase: W01LinkCase,
) {
  const target = resolveClick(page, linkCase.click);
  await expect(target, `找不到：${linkCase.label}`).toBeVisible({ timeout: 15_000 });

  const beforeUrl = page.url();
  const popupPromise = context.waitForEvent('page', { timeout: 15_000 }).catch(() => null);
  await target.click({ timeout: 15_000 });
  const popup = await popupPromise;

  let finalUrl = '';
  if (popup) {
    await popup.waitForLoadState('domcontentloaded');
    finalUrl = popup.url();
    await popup.close().catch(() => {});
  } else {
    await page
      .waitForURL((url) => url.toString() !== beforeUrl, { timeout: 15_000 })
      .catch(() => {});
    await page.waitForLoadState('domcontentloaded');
    finalUrl = page.url();
  }

  assertUrlPatterns(finalUrl, linkCase.expectUrl);
}

export function dismissNativeDialogOnce(page: Page) {
  page.once('dialog', (dialog) => {
    dialog.dismiss().catch(() => {});
  });
}
