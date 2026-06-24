// 開啟首頁進入下載頁面
//
// 【與其他 spec 重疊說明】（刻意保留，不影響執行）
// - 電腦版 Download 導向 ↔ homepage-index「APP Download」、desktop-download.spec.ts（本檔走 site.navigations 設定）
import { test } from '@playwright/test';
import { getSite } from '../../sites';
import { clickAndAssertNavigation, openHome } from '../helpers/navigation';

const siteId = process.env.SITE_ID ?? 'jitabet';
const site = getSite(siteId);

for (const nav of site.navigations) {
  test(`開啟首頁進入下載頁面`, async ({ page }) => {
    await test.step('載入首頁並關閉彈窗', async () => {
      await openHome(page, site);
    });

    await test.step(`點擊「${nav.label}」並驗證導向`, async () => {
      await clickAndAssertNavigation(page, nav, site);
    });
  });
}
