import { test as base, type BrowserContext } from '@playwright/test';
import { getSite } from '../../sites';
import { memberStorageFileExists, memberStorageFilePath } from '../helpers/login';
import { openIndexReadyAsMember, resetIndexMemberHome } from '../helpers/homepage-index';

const site = getSite(process.env.SITE_ID ?? 'jitabet');

/**
 * homepage-index.spec.ts 專用：
 * 優先還原 global-setup 登入狀態；同 worker 共用一個 context 接續測已登入右側選單。
 */
export const homepageMemberTest = base.extend<{}, { homepageMemberWorkerContext: BrowserContext }>({
  homepageMemberWorkerContext: [
    async ({ browser }, use) => {
      const context = await browser.newContext(
        memberStorageFileExists() ? { storageState: memberStorageFilePath() } : {},
      );
      const page = await context.newPage();
      await openIndexReadyAsMember(page, site);
      await use(context);
      await context.close();
    },
    { scope: 'worker', timeout: 240_000 },
  ],

  context: async ({ homepageMemberWorkerContext }, use) => {
    await use(homepageMemberWorkerContext);
  },

  page: [
    async ({ homepageMemberWorkerContext }, use) => {
      const page =
        homepageMemberWorkerContext.pages()[0] ?? (await homepageMemberWorkerContext.newPage());
      await resetIndexMemberHome(page, site);
      await use(page);
    },
    { scope: 'test', timeout: 180_000 },
  ],
});

export { expect } from '@playwright/test';
