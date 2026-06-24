import { test as base } from '@playwright/test';
import { getSite } from '../../sites';
import { memberStorageFileExists, memberStorageFilePath } from '../helpers/login';
import { openIndexReadyAsMember } from '../helpers/homepage-index';

const site = getSite(process.env.SITE_ID ?? 'jitabet');

/** 已登入測試專用：優先還原 global-setup 的 storage；必要時才 OCR */
export const memberTest = base.extend({
  context: async ({ browser }, use) => {
    const context = await browser.newContext(
      memberStorageFileExists() ? { storageState: memberStorageFilePath() } : {},
    );
    await use(context);
    await context.close();
  },

  page: async ({ context }, use) => {
    const page = await context.newPage();
    await openIndexReadyAsMember(page, site);
    await use(page);
  },
});

export { expect } from '@playwright/test';
