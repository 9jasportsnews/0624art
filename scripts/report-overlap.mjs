/**
 * 測項重疊對照（多個 spec 刻意保留相同流程時，Telegram 通知加註）
 * primary = 通知中代表該功能的主項；其餘同組顯示「重複驗證」
 */

/** @type {Array<{ id: string, label: string, primary: string, titles: string[], note?: string }>} */
export const OVERLAP_GROUPS = [
  {
    id: 'download-desktop',
    label: '電腦版 APP Download',
    primary: '電腦版-進入首頁點擊download按鈕',
    titles: [
      '電腦版-進入首頁點擊download按鈕',
      '點擊 APP Download',
      'APP Download可點擊導向',
      '開啟首頁進入下載頁面',
      '右側選單-APP Download可點擊導向',
    ],
    note: '皆測右側下載鈕導向（檔案不同：desktop-download / navigation / 右側選單）',
  },
  {
    id: 'download-mobile-ios',
    label: '手機版 iOS Download',
    primary: '手機版-iOS-進入首頁點擊download按鈕',
    titles: ['手機版-iOS-進入首頁點擊download按鈕'],
  },
  {
    id: 'download-mobile-android',
    label: '手機版 Android Download',
    primary: '手機版-安卓模擬-進入首頁點擊download按鈕',
    titles: ['手機版-安卓模擬-進入首頁點擊download按鈕'],
  },
  {
    id: 'menu-guest-visible',
    label: '未登入右側選單顯示',
    primary: '顯示正常',
    titles: [],
  },
  {
    id: 'menu-guest-support',
    label: '未登入－24 小時客服',
    primary: '點擊 24 小時客服',
    titles: ['點擊 24 小時客服', '24 小時客服可點擊'],
    note: 'desktop-right-menu（含 Tawk）↔ homepage-index',
  },
  {
    id: 'menu-guest-news',
    label: '未登入－最新消息',
    primary: '點擊最新消息',
    titles: ['點擊最新消息', '最新消息可點擊'],
  },
  {
    id: 'menu-guest-social-popup',
    label: '未登入－社群彈窗',
    primary: '點擊社群-Facebook',
    titles: [
      '點擊社群-Facebook',
      '點擊社群-Instagram',
      '點擊社群-Youtube',
      '點擊社群-Twitter',
      '點擊社群-Telegram',
      '社群-Facebook可點擊',
      '社群-Instagram可點擊',
      '社群-Youtube可點擊',
      '社群-Twitter可點擊',
      '社群-Telegram可點擊',
    ],
    note: '點擊社群＝開 QR 彈窗；homepage-index 同名不含截圖比對',
  },
  {
    id: 'menu-guest-social-qr',
    label: '未登入－社群 QR 外連',
    primary: '點擊社群-Facebook-QR可開啟外部網站',
    titles: [
      '點擊社群-Facebook-QR可開啟外部網站',
      '點擊社群-Instagram-QR可開啟外部網站',
      '點擊社群-Youtube-QR可開啟外部網站',
      '點擊社群-Twitter-QR可開啟外部網站',
      '點擊社群-Telegram-QR可開啟外部網站',
      '社群-Facebook-QR可開啟外部網站',
      '社群-Instagram-QR可開啟外部網站',
      '社群-Youtube-QR可開啟外部網站',
      '社群-Twitter-QR可開啟外部網站',
      '社群-Telegram-QR可開啟外部網站',
    ],
  },
  {
    id: 'menu-member-visible',
    label: '已登入右側選單顯示',
    primary: '應為已登入狀態且右側選單含會員按鈕',
    titles: ['應為已登入狀態且右側選單含會員按鈕'],
    note: 'homepage-index 已登入；desktop-right-menu 另有一項「顯示正常」',
  },
  {
    id: 'menu-member-promo',
    label: '已登入－Promotion Apply',
    primary: '點擊 Promotion Apply',
    titles: ['點擊 Promotion Apply', 'Promotion Apply可點擊導向'],
  },
  {
    id: 'menu-member-bonus',
    label: '已登入－Bonus',
    primary: '點擊 Bonus ',
    titles: ['點擊 Bonus ', 'Bonus可點擊導向'],
  },
  {
    id: 'menu-member-news',
    label: '已登入－最新消息',
    primary: '點擊最新消息',
    titles: ['右側選單-最新消息可點擊導向會員新聞頁'],
    note: '已登入導向會員新聞頁；未登入為首頁彈窗',
  },
  {
    id: 'menu-member-support',
    label: '已登入－24 小時客服',
    primary: '右側選單-24 小時客服可點擊',
    titles: ['右側選單-24 小時客服可點擊'],
  },
  {
    id: 'menu-member-social',
    label: '已登入－社群',
    primary: '右側選單-社群-Facebook可點擊',
    titles: [
      '右側選單-社群-Facebook可點擊',
      '右側選單-社群-Instagram可點擊',
      '右側選單-社群-Youtube可點擊',
      '右側選單-社群-Twitter可點擊',
      '右側選單-社群-Telegram可點擊',
      '右側選單-社群-Facebook-QR可開啟外部網站',
      '右側選單-社群-Instagram-QR可開啟外部網站',
      '右側選單-社群-Youtube-QR可開啟外部網站',
      '右側選單-社群-Twitter-QR可開啟外部網站',
      '右側選單-社群-Telegram-QR可開啟外部網站',
    ],
    note: '與未登入右側社群流程相同，fixture 為已登入',
  },
  {
    id: 'playlist-video',
    label: '播放清單內嵌影片',
    primary: '播放清單區內嵌影片應可正常播放',
    titles: [
      '播放清單區內嵌影片應可正常播放',
      '電腦版-首頁影片播放檢測：可見且無播放錯誤',
      '手機版-首頁影片播放檢測：可見且無播放錯誤',
    ],
    note: 'index 測播放清單；video-playback 另含左橫幅 MP4 與手機版',
  },
  {
    id: 'promo-banner-link',
    label: '宣傳橫幅點擊導向',
    primary: '第 1 個宣傳橫幅可點擊導向',
    titles: ['第 1 個宣傳橫幅可點擊導向', '第 2 個宣傳橫幅可點擊導向'],
    note: 'homepage-index 未登入驗 href',
  },
  {
    id: 'promo-banner-video',
    label: '宣傳區塊影片（已登入）',
    primary: '第 1 個宣傳區塊：影片可見且有來源',
    titles: [
      '第 1 個宣傳區塊：影片可見且有來源',
      '第 1 個宣傳區塊：點擊可導向',
      '第 2 個宣傳區塊：影片可見且有來源',
      '第 2 個宣傳區塊：點擊可導向',
    ],
    note: 'homepage-promo 已登入；電腦＋手機各跑一輪故看似重複 4 次',
  },
];

const titleToGroup = new Map();
for (const group of OVERLAP_GROUPS) {
  for (const title of group.titles) {
    titleToGroup.set(title.trim(), group);
  }
}

/** 取測試標題（最後一段 › 後） */
export function testLeafTitle(title) {
  return String(title || '').split(' › ').pop()?.trim() || String(title || '');
}

/**
 * @returns {{ groupId: string, label: string, isPrimary: boolean, overlapNote: string | null }}
 */
export function getOverlapInfo(title, fullTitle) {
  const leaf = testLeafTitle(title);
  const ctx = String(fullTitle || title);

  if (leaf === '顯示正常') {
    if (/已登入/.test(ctx)) {
      return {
        groupId: 'menu-member-visible-drm',
        label: '已登入右側選單顯示',
        isPrimary: true,
        overlapNote: 'desktop-right-menu 已登入；homepage-index 用「應為已登入狀態…」同類',
      };
    }
    return {
      groupId: 'menu-guest-visible',
      label: '未登入右側選單顯示',
      isPrimary: true,
      overlapNote: null,
    };
  }

  if (leaf === '點擊最新消息') {
    if (/已登入/.test(ctx)) {
      return {
        groupId: 'menu-member-news',
        label: '已登入－最新消息',
        isPrimary: true,
        overlapNote: '已登入導向會員新聞頁',
      };
    }
    return {
      groupId: 'menu-guest-news',
      label: '未登入－最新消息',
      isPrimary: true,
      overlapNote: null,
    };
  }

  const group = titleToGroup.get(leaf);
  if (!group) {
    return { groupId: leaf, label: leaf, isPrimary: true, overlapNote: null };
  }
  const isPrimary = group.primary === leaf;
  if (isPrimary) {
    return {
      groupId: group.id,
      label: group.label,
      isPrimary: true,
      overlapNote: group.note || null,
    };
  }
  return {
    groupId: group.id,
    label: group.label,
    isPrimary: false,
    // overlapNote: `重複驗證（同「${group.primary}」／${group.label}）`,
  };
}

export function summarizeOverlap(tests) {
  const passed = tests.filter((t) => t.status === 'passed');
  let duplicateCount = 0;
  const seenPrimary = new Set();
  let uniqueCount = 0;

  for (const t of passed) {
    const info = getOverlapInfo(t.title, t.fullTitle);
    if (info.isPrimary) {
      if (!seenPrimary.has(info.groupId)) {
        seenPrimary.add(info.groupId);
        uniqueCount += 1;
      }
    } else if (info.overlapNote) {
      duplicateCount += 1;
    } else {
      uniqueCount += 1;
    }
  }

  return {
    total: tests.length,
    passed: passed.length,
    duplicatePassed: duplicateCount,
    uniquePassed: uniqueCount,
  };
}
