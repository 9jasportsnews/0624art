/** w01 下載頁固定入口（version 參數可依環境調整） */
export const W01_PAGE_URL = 'https://w01.jitabet.cloud/?version=6.45.1-fc';

export type W01ClickTarget =
  | { kind: 'role'; role: 'link' | 'button'; name: string | RegExp }
  | { kind: 'text'; text: string | RegExp };

export type W01LinkCase = {
  id: string;
  label: string;
  click: W01ClickTarget;
  /** 點擊後最終 URL 需符合的規則（任一條通過即可） */
  expectUrl: RegExp | RegExp[];
};

/**
 * w01 頁面按鈕／連結檢查清單
 * 新增按鈕：在此加一筆，再跑 npx playwright test -g "w01"
 */
export const w01JitabetLinks: W01LinkCase[] = [
  {
    id: 'return-home',
    label: '回首頁 Return to JitaBet',
    click: { kind: 'role', role: 'link', name: /Return to JitaBet/i },
    expectUrl: /jitabet\.(app|live|cloud)/i,
  },
  {
    id: 'download-1',
    label: 'ডাইনলোড ১（下載 1）',
    click: { kind: 'text', text: 'ডাইনলোড ১' },
    // 若已知固定導向，請改成更精準的 regex，例如 /^https:\/\/play\.google\.com/
    expectUrl: /^https?:\/\//i,
  },
];
