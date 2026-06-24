/** 影片／播放檢測錯誤說明（Telegram 用）；只依實際失敗訊息轉換，不猜測 */

export function stripAnsi(text) {
  return String(text || '').replace(/\u001b\[[0-9;]*m/g, '');
}

export function humanizeVideoStepTitle(title) {
  return String(title || '')
    .replace(/開啟首頁並關閉進入彈窗|開啟首頁並關閉彈窗/i, '進入首頁並關掉擋路的彈窗')
    .replace(/確認播放清單區可見/i, '找到橫幅右側的播放清單影片區')
    .replace(/\[A\]\s*判斷 frame-wrap 直接子層/i, '看影片區嵌的是 YouTube（iframe）還是 MP4（video）')
    .replace(/\[B\]\s*YouTube 播放驗證.*/i, '驗證 YouTube 嵌入影片是否真的能播')
    .replace(/\[B\]\s*HTML5 播放驗證.*/i, '驗證 MP4 影片是否真的能播')
    .replace(/確認 YouTube iframe 可見且來源正確/i, 'YouTube 影片框可見')
    .replace(/等待播放器載入並排除 DOM 錯誤狀態/i, '等 YouTube 播放器載入')
    .replace(/等待影片時間實際前進.*/i, '等播放時間往前')
    .replace(/截圖比對畫面動態與 OCR/i, '截圖確認畫面有在動');
}

export function cleanVideoStepLabel(title) {
  return humanizeVideoStepTitle(
    String(title)
      .replace(/^首頁播放清單影片：/, '')
      .replace(/^電腦版首頁：/, '')
      .replace(/^手機版首頁：/, ''),
  );
}

function isYoutubeFailure(msg, displaySteps) {
  if (/非正常播放|This video is unavailable|ytp-embed|YouTube 播放器|YouTube iframe/i.test(msg)) {
    return true;
  }
  return (displaySteps || []).some(
    (s) =>
      s.status === 'failed' &&
      /\[B\]\s*YouTube|等待播放器載入|YouTube iframe|YouTube 播放驗證/i.test(
        `${s.rawTitle || ''} ${s.title}`,
      ),
  );
}

function isHtml5Failure(msg, displaySteps) {
  if (/HTML5|readyState|缺少來源|影片發生播放錯誤/i.test(msg)) return true;
  return (displaySteps || []).some(
    (s) =>
      s.status === 'failed' &&
      /\[B\]\s*HTML5|HTML5 video|MP4/i.test(`${s.rawTitle || ''} ${s.title}`),
  );
}

/** 一行錯誤說明（嚴格對應實際失敗，不亂套 YouTube） */
export function explainVideoPlaybackFailure(displaySteps, rawError) {
  const msg = stripAnsi(
    [rawError, ...(displaySteps || []).map((s) => s.error)].filter(Boolean).join('\n'),
  ).replace(/\s+/g, ' ');

  if (/首頁應為未登入|username/i.test(msg)) {
    return '頁面登入狀態與測試預期不符，尚未開始檢查影片。';
  }

  if (/播放清單區不可見|vid-yt-mini-box|缺少 \.vid-yt-frame-wrap/i.test(msg)) {
    return '首頁找不到播放清單影片區。';
  }

  if (isYoutubeFailure(msg, displaySteps)) {
    if (/This video is unavailable/i.test(msg)) {
      return '首頁播放清單嵌入的 YouTube 影片無法播放（This video is unavailable）。';
    }
    if (/無法觀看/i.test(msg)) {
      return '首頁播放清單嵌入的 YouTube 影片無法播放（無法觀看）。';
    }
    return '首頁播放清單嵌入的 YouTube 影片無法播放。';
  }

  if (isHtml5Failure(msg, displaySteps)) {
    if (/時間未|停在 0/i.test(msg)) {
      return '首頁播放清單嵌入的 MP4 影片無法播放（播放時間未往前）。';
    }
    return '首頁播放清單嵌入的 MP4 影片無法播放。';
  }

  const first = msg.replace(/^Error:\s*/, '').split('\n')[0] || '';
  return first.slice(0, 120) || '檢測未通過。';
}

export function explainTestFailure(error, steps = []) {
  const displaySteps = toDisplaySteps(steps);
  const msg = stripAnsi(error || '');
  if (/toHaveScreenshot|snapshot doesn't exist|writing actual/i.test(msg)) {
    return '雲端畫面與本機截圖基準不同（社群 QR 彈窗視覺比對）。';
  }
  return explainVideoPlaybackFailure(displaySteps, error);
}

export function toDisplaySteps(steps = []) {
  return steps.map((s) => ({
    title: cleanVideoStepLabel(s.title),
    rawTitle: s.title,
    status: s.error || s.status === 'failed' || s.status === 'timedOut' ? 'failed' : 'passed',
    error: s.error,
  }));
}

/** 最後一個失敗步驟（人話標題） */
export function findFailedStepLabel(steps = []) {
  const failed = toDisplaySteps(steps).filter((s) => s.status === 'failed' && s.title);
  return failed.length ? failed[failed.length - 1].title : null;
}

/** 從錯誤訊息擷取 YouTube playlist id */
export function extractPlaylistId(error) {
  const m = stripAnsi(error || '').match(/playlist=([A-Za-z0-9_-]+)/);
  return m?.[1] || null;
}

export function displayTestTitle(test) {
  const full = String(test?.fullTitle || test?.title || '');
  const parts = full
    .split(' › ')
    .map((p) => p.trim())
    .filter(
      (p) =>
        p &&
        p !== 'desktop-chrome' &&
        !/\.spec\.ts$/.test(p) &&
        !/^recorded\//.test(p) &&
        !/^tests\//.test(p),
    );
  if (parts.length >= 2) {
    return `${parts[parts.length - 2]} › ${parts[parts.length - 1]}`;
  }
  return parts[parts.length - 1] || test?.title || '未知項目';
}

/** 將 test.step 標題轉為通知用人話（略過 Playwright 內部步驟） */
export function humanizeStepTitle(title) {
  const raw = String(title || '').trim();
  if (!raw) return '';
  if (
    /^(Before Hooks|After Hooks|Worker Cleanup|Fixture|Launch browser|Create context|Create page|Attach|Evaluate locator)/i.test(
      raw,
    )
  ) {
    return '';
  }

  return humanizeVideoStepTitle(raw)
    .replace(/開啟首頁$/i, '進入首頁')
    .replace(/點擊 download 按鈕/i, '點擊 Download 按鈕')
    .replace(/以手機 User-Agent 開啟首頁/i, '以 iOS 手機模擬開啟首頁')
    .replace(/以安卓手機 User-Agent 開啟首頁/i, '以 Android 手機模擬開啟首頁')
    .replace(/關閉彈窗/i, '關閉擋路彈窗')
    .replace(/載入首頁並關閉彈窗/i, '進入首頁並關閉彈窗')
    .replace(/點擊並驗證「(.+)」/i, '點擊「$1」並驗證結果')
    .replace(/點擊「(.+)」並驗證導向/i, '點擊「$1」並確認導向正確')
    .replace(/最新消息彈窗/i, '驗證最新消息彈窗可開啟並關閉')
    .replace(/社群 QR 彈窗/i, '驗證社群 QR 彈窗可開啟並關閉')
    .replace(/若未登入則自動登入（含 OCR 驗證碼）/i, '必要時自動登入（含驗證碼）')
    .replace(/檢查宣傳橫幅第 (\d+) 個影片/i, '檢查左側宣傳橫幅第 $1 個 MP4 影片')
    .replace(/首頁影片請求不應有失敗/i, '確認影片相關網路請求無失敗');
}

export function pickHumanizedSteps(steps = []) {
  const out = [];
  for (const step of steps) {
    const label = humanizeStepTitle(step.title);
    if (label) out.push(label);
  }
  return out;
}

/** 通過通知用：說明各測項各階段實際檢查內容 */
const TEST_CONTENT_DESCRIPTIONS = {
  '電腦版-進入首頁點擊download按鈕': ['進入首頁', '點擊右側 Download 按鈕', '確認導向下載頁'],
  '手機版-iOS-進入首頁點擊download按鈕': [
    '以 iOS 手機模擬開啟首頁',
    '關閉擋路彈窗',
    '點擊 Download 並確認 iOS 跳轉網址',
  ],
  '手機版-安卓模擬-進入首頁點擊download按鈕': [
    '以 Android 手機模擬開啟首頁',
    '關閉擋路彈窗',
    '點擊 Download 並確認安卓跳轉網址',
  ],
  '點擊 APP Download': ['進入未登入首頁', '點擊右側 APP Download', '確認導向下載頁'],
  'APP Download可點擊導向': ['進入首頁並關閉彈窗', '點擊右側 APP Download', '確認導向下載頁'],
  開啟首頁進入下載頁面: ['載入首頁並關閉彈窗', '點擊下載導航連結', '確認導向目標頁面'],
  '右側選單-APP Download可點擊導向': ['已登入首頁', '點擊右側 APP Download', '確認導向下載頁'],
  顯示正常: ['確認右側選單容器可見', '確認客服、最新消息、Download、社群按鈕與圖示齊全'],
  顯示正常_已登入: [
    '確認右側選單容器可見',
    '確認 Promotion Apply、Bonus、客服、最新消息、Download 可見',
    '確認 5 個社群按鈕齊全',
  ],
  '點擊 24 小時客服': ['確認頁面已載入 Tawk 客服腳本', '點擊 24 小時客服', '確認仍留在首頁'],
  '24 小時客服可點擊': ['進入首頁', '點擊右側 24 小時客服', '確認客服功能正常'],
  點擊最新消息: ['點擊最新消息按鈕', '確認開啟新聞彈窗', '確認仍留在首頁'],
  最新消息可點擊: ['進入首頁', '點擊最新消息', '確認開啟新聞彈窗'],
  彈窗點擊關閉鈕可關閉: ['驗證最新消息彈窗可開啟並關閉', '驗證社群 QR 彈窗可開啟並關閉'],
  '點擊 Promotion Apply': ['點擊 Promotion Apply 按鈕', '確認導向會員 Promotion Apply 頁'],
  'Promotion Apply可點擊導向': ['已登入首頁', '點擊 Promotion Apply', '確認導向會員申請頁'],
  '點擊 Bonus': ['點擊 Bonus 按鈕', '確認導向會員 Bonus 信箱頁'],
  '點擊 Bonus ': ['點擊 Bonus 按鈕', '確認導向會員 Bonus 信箱頁'],
  'Bonus可點擊導向': ['已登入首頁', '點擊 Bonus', '確認導向會員 Bonus 信箱頁'],
  '右側選單-最新消息可點擊導向會員新聞頁': ['已登入首頁', '點擊最新消息', '確認導向會員新聞頁'],
  '右側選單-24 小時客服可點擊': ['已登入首頁', '點擊右側 24 小時客服', '確認客服行為正常'],
  進入首頁應顯示彈窗: ['進入首頁', '確認出現進入彈窗'],
  點擊關閉後彈窗應消失: ['確認進入彈窗可見', '點擊關閉', '確認彈窗消失'],
  各區塊視覺比對: [
    '檢查頂部宣傳區版面與媒體',
    '檢查左側宣傳橫幅',
    '檢查播放清單影片區',
    '檢查右側選單與專屬遊戲區無破圖',
  ],
  '第 1 個宣傳橫幅可點擊導向': ['點擊第 1 個宣傳橫幅', '確認連結導向正確'],
  '第 2 個宣傳橫幅可點擊導向': ['點擊第 2 個宣傳橫幅', '確認連結導向正確'],
  播放清單區內嵌影片應可正常播放: [
    '進入首頁並確認播放清單影片區可見',
    '判斷嵌入為 YouTube（iframe）或 MP4（video）',
    '驗證影片能正常播放（排除無法播放、灰底錯誤、時間未往前等）',
  ],
  輪播左右切換後點擊網址應與首頁連結一致: [
    '專屬遊戲區向右切換輪播',
    '專屬遊戲區向左切換輪播',
    '確認可見遊戲連結與點擊後導向一致',
  ],
  '第 1 個宣傳區塊：影片可見且有來源': ['確認第 1 個宣傳區塊可見', '確認影片可見且來源為 mp4'],
  '第 1 個宣傳區塊：點擊可導向': ['點擊第 1 個宣傳區塊', '確認點擊後導向正確頁面'],
  '第 2 個宣傳區塊：影片可見且有來源': ['確認第 2 個宣傳區塊可見', '確認影片可見且來源為 mp4'],
  '第 2 個宣傳區塊：點擊可導向': ['點擊第 2 個宣傳區塊', '確認點擊後導向正確頁面'],
  '電腦版-首頁影片播放檢測：可見且無播放錯誤': [
    '進入首頁並關閉彈窗',
    '驗證播放清單內嵌影片可正常播放',
    '檢查左側宣傳橫幅 MP4 影片',
    '確認影片相關網路請求無失敗',
  ],
  '手機版-首頁影片播放檢測：可見且無播放錯誤': [
    '以手機模擬開啟首頁',
    '驗證手機版播放清單內嵌影片可正常播放',
    '確認影片相關網路請求無失敗',
  ],
  應為已登入狀態且右側選單含會員按鈕: [
    '確認為已登入狀態',
    '確認右側選單含 Promotion Apply、Bonus 等會員按鈕',
  ],
  '下載頁面-回首頁': ['開啟 w01 下載頁', '點擊回首頁', '確認回到首頁'],
  '下載頁面-下載按鈕': ['開啟 w01 下載頁', '點擊下載按鈕', '確認下載行為或連結正確'],
};

function describeSocialClick(platform) {
  return [
    `點擊 ${platform} 社群按鈕`,
    '確認開啟 QR Code 彈窗',
    '驗證彈窗標題、提示文字與 QR 畫布',
  ];
}

function describeSocialQrClick(platform) {
  return [
    `點擊 ${platform} 社群按鈕開啟 QR 彈窗`,
    '確認 QR 目標網址正確',
    `點擊 QR 後應開啟 ${platform} 外部網站`,
  ];
}

function describeIndexSocialClick(platform) {
  return [`進入首頁`, `點擊右側社群 ${platform}`, '確認開啟 QR Code 彈窗'];
}

function describeIndexSocialQr(platform) {
  return [
    `進入首頁並點擊社群 ${platform}`,
    '確認 QR 目標網址正確',
    `點擊 QR 後應開啟 ${platform} 外部網站`,
  ];
}

function describeMemberSocialClick(platform) {
  return [`已登入首頁`, `點擊右側社群 ${platform}`, '確認開啟 QR Code 彈窗'];
}

function describeMemberSocialQr(platform) {
  return [
    `已登入首頁並點擊社群 ${platform}`,
    '確認 QR 目標網址正確',
    `點擊 QR 後應開啟 ${platform} 外部網站`,
  ];
}

export function describeTestContent(title, fullTitle) {
  const name = String(title || '').split(' › ').pop()?.trim() || String(title || '');
  const ctx = String(fullTitle || title || '');

  if (name === '顯示正常' && /已登入/.test(ctx)) {
    return TEST_CONTENT_DESCRIPTIONS['顯示正常_已登入'];
  }

  if (name === '點擊最新消息' && /已登入/.test(ctx)) {
    return ['已登入首頁', '點擊最新消息', '確認導向會員新聞頁'];
  }

  if (name.includes('宣傳區塊') && /手機版-首頁宣傳區/.test(ctx)) {
    const base = TEST_CONTENT_DESCRIPTIONS[name];
    if (base) return ['以手機模擬已登入首頁', ...base];
  }

  if (TEST_CONTENT_DESCRIPTIONS[name]) return TEST_CONTENT_DESCRIPTIONS[name];

  let m = name.match(/^點擊社群-(.+)-QR可開啟外部網站$/);
  if (m) return describeSocialQrClick(m[1]);

  m = name.match(/^點擊社群-(.+)$/);
  if (m) return describeSocialClick(m[1]);

  m = name.match(/^社群-(.+)可點擊$/);
  if (m) return describeIndexSocialClick(m[1]);

  m = name.match(/^社群-(.+)-QR可開啟外部網站$/);
  if (m) return describeIndexSocialQr(m[1]);

  m = name.match(/^右側選單-社群-(.+)可點擊$/);
  if (m) return describeMemberSocialClick(m[1]);

  m = name.match(/^右側選單-社群-(.+)-QR可開啟外部網站$/);
  if (m) return describeMemberSocialQr(m[1]);

  return null;
}
