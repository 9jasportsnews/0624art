/** 右側浮動選單：以圖示路徑定位，不依賴 alt 語系文字 */
export const RIGHT_MENU = '.friendlink-right';

export const SUPPORT_BTN = `${RIGHT_MENU} .friendlink-menu-nav:has(img[src*="24h-icon"])`;
export const NEWS_BTN = `${RIGHT_MENU} .friendlink-menu-nav:has(img[src*="note-icon"])`;
export const APP_DOWNLOAD_BTN = `${RIGHT_MENU} .friendlink-menu-nav:has(img[src*="app-icon"])`;
export const SOCIAL_ITEM = `${RIGHT_MENU} ul.custom-icon li .friendlink-menu-nav`;

export const PROMOTION_APPLY_LINK = `${RIGHT_MENU} a[href*="/member/promotion/apply"]`;
export const PROMOTION_APPLY_BTN = `${RIGHT_MENU} .friendlink-menu-nav[alt="promotion.apply"]`;
export const BONUS_MAILBOX_LINK = `${RIGHT_MENU} a[href*="/member/mailbox/bonus"]`;
export const BONUS_MAILBOX_BTN = `${RIGHT_MENU} .friendlink-menu-nav[alt="bonus"]`;
