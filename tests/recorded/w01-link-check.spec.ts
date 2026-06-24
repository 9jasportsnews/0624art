//下載頁面連結檢查
import { test } from '@playwright/test';
import { W01_PAGE_URL, w01JitabetLinks } from '../../sites/w01-jitabet';
import { clickAndAssertW01Link, dismissNativeDialogOnce } from '../helpers/w01-link';

const titleById: Record<string, string> = {
  'download-1': '下載頁面-下載按鈕',
  'return-home': '下載頁面-回首頁',
};

for (const linkCase of w01JitabetLinks) {
  const title = titleById[linkCase.id] ?? linkCase.label;

  test(title, async ({ page, context }) => {
    await test.step('開啟 w01 下載頁', async () => {
      dismissNativeDialogOnce(page);
      await page.goto(W01_PAGE_URL, { waitUntil: 'domcontentloaded' });
    });

    await test.step(`點擊並驗證「${linkCase.label}」`, async () => {
      await clickAndAssertW01Link(page, context, linkCase);
    });
  });
}
