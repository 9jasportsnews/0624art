export type IndexClickTarget =
  | { kind: 'role'; role: 'link' | 'button'; name: string | RegExp }
  | { kind: 'text'; text: string | RegExp }
  | { kind: 'css'; selector: string };

export type IndexLinkExpect =
  | { type: 'url'; pattern: RegExp | RegExp[] }
  | { type: 'stay-on-home' }
  | { type: 'dialog'; variant: 'news' | 'qrcode' }
  | { type: 'tawk-script' };

export type IndexLinkCase = {
  id: string;
  label: string;
  click: IndexClickTarget;
  expect: IndexLinkExpect;
};

/** 宣傳橫幅（紅框上）：依序第 1、2 個可點擊區塊 */
export const indexPromoBannerSlots = [
  { index: 0, label: '第 1 個宣傳橫幅' },
  { index: 1, label: '第 2 個宣傳橫幅' },
] as const;

const RIGHT_MENU = '.friendlink-right';

/**
 * 首頁右側浮動選單（紅框右）
 * 新增按鈕：在此加一筆，再跑 npx playwright test -g "首頁-index-右側選單"
 */
export const indexRightMenuLinks: IndexLinkCase[] = [
  {
    id: 'support-24h',
    label: '24 小時客服',
    click: {
      kind: 'css',
      selector: `${RIGHT_MENU} .friendlink-menu-nav:has(img[src*="24h-icon"])`,
    },
    expect: { type: 'tawk-script' },
  },
  {
    id: 'latest-news',
    label: '最新消息',
    click: {
      kind: 'css',
      selector: `${RIGHT_MENU} .friendlink-menu-nav:has(img[src*="note-icon"])`,
    },
    expect: { type: 'dialog', variant: 'news' },
  },
  {
    id: 'social-facebook',
    label: '社群-Facebook',
    click: {
      kind: 'css',
      selector: `${RIGHT_MENU} ul.custom-icon li .friendlink-menu-nav:has(img[src*="Community.1.webp"])`,
    },
    expect: { type: 'dialog', variant: 'qrcode' },
  },
  {
    id: 'social-instagram',
    label: '社群-Instagram',
    click: {
      kind: 'css',
      selector: `${RIGHT_MENU} ul.custom-icon li .friendlink-menu-nav:has(img[src*="Community.2.webp"])`,
    },
    expect: { type: 'dialog', variant: 'qrcode' },
  },
  {
    id: 'social-youtube',
    label: '社群-Youtube',
    click: {
      kind: 'css',
      selector: `${RIGHT_MENU} ul.custom-icon li .friendlink-menu-nav:has(img[src*="Community.3.webp"])`,
    },
    expect: { type: 'dialog', variant: 'qrcode' },
  },
  {
    id: 'social-twitter',
    label: '社群-Twitter',
    click: {
      kind: 'css',
      selector: `${RIGHT_MENU} ul.custom-icon li .friendlink-menu-nav:has(img[src*="Community.4.webp"])`,
    },
    expect: { type: 'dialog', variant: 'qrcode' },
  },
  {
    id: 'social-telegram',
    label: '社群-Telegram',
    click: {
      kind: 'css',
      selector: `${RIGHT_MENU} ul.custom-icon li .friendlink-menu-nav:has(img[src*="Community.5.webp"])`,
    },
    expect: { type: 'dialog', variant: 'qrcode' },
  },
];

export const indexSocialQrExpectUrls: Record<string, RegExp> = {
  'social-facebook': /^https:\/\/www\.facebook\.com\/jitabet\/?$/i,
  'social-instagram': /^https:\/\/www\.instagram\.com\/jitabet_official\/?$/i,
  'social-youtube': /^https:\/\/www\.youtube\.com\/@JitabetPromotion\/?$/i,
  'social-twitter': /^https:\/\/x\.com\/jitabetcom\/?$/i,
  'social-telegram': /^https:\/\/t\.me\/jitabetofficialchannel\/?$/i,
};
