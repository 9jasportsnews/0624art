import { resolveJitabetHomeUrl } from './jitabet-env';
import type { SiteConfig } from './types';

export const jitabet: SiteConfig = {
  id: 'jitabet',
  name: 'JitaBet',
  homeUrl: resolveJitabetHomeUrl(),
  homePopupContainer: '.el-dialog__wrapper',
  homePopupDismissSelector: '.dark-close',
  gtmReadyWaitMs: 5000,
  navigations: [
    {
      id: 'download',
      label: '下載',
      click: {
        kind: 'css',
        selector: '.friendlink-right .friendlink-menu-nav:has(img[src*="app-icon"])',
      },
      gtmClick: true,
      expect: {
        url: [
          { type: 'fullUrlStartsWith', value: 'https://www.jitabet.cloud/download' },
          { type: 'fullUrlStartsWith', value: 'https://w01.jitabet.cloud/?version=' },
          { type: 'hostname', value: 'w01.jitabet.cloud' },
        ],
      },
    },
  ],
};
