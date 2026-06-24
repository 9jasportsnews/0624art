import path from 'node:path';
import { expect, test, type FrameLocator, type Locator, type Page } from '@playwright/test';
import { createWorker, PSM } from 'tesseract.js';

export const YOUTUBE_PLAYBACK_ERROR =
  /無法播放這部影片|無法觀看這部影片|此影片無法播放|Video unavailable|This video is unavailable|An error occurred|私人影片|Private video|錯誤\s*153|Error\s*153|সমস্যা\s*153|影片播放器設定錯誤|player configuration|configuration error/i;

/** 錯誤畫面 OCR 常見字樣（灰底感嘆號畫面） */
const YOUTUBE_ERROR_SCREEN_OCR =
  /無法播放|無法觀看|unavailable|Error\s*153|錯誤\s*153|播放器設定錯誤|configuration error|前往\s*YouTube\s*觀看|Watch on YouTube/i;

/** 連續截圖像素變化低於此值，視為靜態錯誤／未播放畫面 */
const MIN_SCREEN_MOTION_RATIO = 0.0015;

/** YouTube 灰底錯誤畫面：iframe 截圖中暗色像素占比 */
const MIN_DARK_RATIO_ERROR = 0.82;
const MAX_LIGHT_RATIO_ERROR = 0.18;

/** 2 秒內影片時間至少前進此秒數，才視為真的在播 */
const MIN_TIME_ADVANCE_SEC = 0.12;

/** 等待播放器進入可判定狀態的最長時間 */
const PLAYBACK_SETTLE_MS = 3_000;

/** 截圖比對間隔（用於畫面動態） */
const VISUAL_SAMPLE_GAP_MS = 2_000;

/** 輪詢播放進度最長時間 */
const PLAYBACK_PROGRESS_TIMEOUT_MS = 12_000;

/** 黑畫面／空白：暗色占比極高且無動態、時間未前進 */
const MIN_BLACK_RATIO = 0.9;

const CHI_TRA_LANG_PATH = path.resolve(process.cwd());

export type YoutubeEmbedSnapshot = {
  embedError: boolean;
  hasErrorDom: boolean;
  playingMode: boolean;
  errorReason: string;
  errorSubreason: string;
  bodyText: string;
  videoTime: number;
  videoSrc: string;
  videoReadyState: number;
};

export type YoutubeVisualCheck = {
  motionRatio: number;
  ocrText: string;
  darkRatio: number;
  lightRatio: number;
  before: YoutubeEmbedSnapshot;
  after: YoutubeEmbedSnapshot;
};

export type ScreenshotPixels = {
  darkRatio: number;
  lightRatio: number;
  width: number;
  height: number;
};

export async function readYoutubeEmbedSnapshot(frame: FrameLocator): Promise<YoutubeEmbedSnapshot> {
  return frame.locator('#movie_player').evaluate((player) => {
    const root = player as HTMLElement;
    const video = document.querySelector('video.html5-main-video') as HTMLVideoElement | null;
    return {
      embedError: root.classList.contains('ytp-embed-error'),
      hasErrorDom: Boolean(document.querySelector('.ytp-error')),
      playingMode: root.classList.contains('playing-mode'),
      errorReason:
        document.querySelector('.ytp-error-content-wrap-reason')?.textContent?.trim() ?? '',
      errorSubreason:
        document.querySelector('.ytp-error-content-wrap-subreason')?.textContent?.trim() ?? '',
      bodyText: document.body.innerText.trim(),
      videoTime: video?.currentTime ?? 0,
      videoSrc: video?.currentSrc || video?.src || '',
      videoReadyState: video?.readyState ?? 0,
    };
  });
}

/** 以 Playwright locator 讀取 iframe 內可見的錯誤訊息（比 evaluate 更貼近使用者所見） */
export async function readVisibleEmbedError(frame: FrameLocator): Promise<string | null> {
  const player = frame.locator('#movie_player.ytp-embed-error').first();
  if (await player.isVisible().catch(() => false)) {
    const reason = (
      await frame.locator('.ytp-error-content-wrap-reason').first().innerText().catch(() => '')
    ).trim();
    if (reason) return reason;
    return 'ytp-embed-error';
  }

  for (const selector of [
    '.ytp-error-content-wrap-reason',
    '.ytp-error-content-wrap-subreason',
    '.ytp-error',
  ]) {
    const loc = frame.locator(selector).first();
    if (!(await loc.isVisible().catch(() => false))) continue;
    const text = (await loc.innerText().catch(() => '')).trim();
    if (text) return text;
  }

  const byText = frame.getByText(YOUTUBE_PLAYBACK_ERROR).first();
  if (await byText.isVisible().catch(() => false)) {
    return (await byText.innerText().catch(() => '')).trim();
  }

  return null;
}

export function isYoutubeEmbedError(snapshot: YoutubeEmbedSnapshot): boolean {
  if (snapshot.embedError || snapshot.hasErrorDom) {
    return true;
  }
  if (snapshot.errorReason || snapshot.errorSubreason) {
    return true;
  }
  const combined = `${snapshot.bodyText}\n${snapshot.errorReason}\n${snapshot.errorSubreason}`;
  return YOUTUBE_PLAYBACK_ERROR.test(combined);
}

export function isYoutubeEmbedErrorText(text: string): boolean {
  return YOUTUBE_PLAYBACK_ERROR.test(text);
}

export function isYoutubeEmbedPlaying(snapshot: YoutubeEmbedSnapshot): boolean {
  if (isYoutubeEmbedError(snapshot)) {
    return false;
  }
  return (
    snapshot.playingMode &&
    snapshot.videoTime > 0.2 &&
    snapshot.videoSrc.startsWith('blob:') &&
    snapshot.videoReadyState >= 2
  );
}

function bufferDiffRatio(a: Buffer, b: Buffer): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) {
    return 0;
  }
  let diff = 0;
  for (let i = 0; i < len; i += 1) {
    if (a[i] !== b[i]) {
      diff += 1;
    }
  }
  return diff / len;
}

async function preprocessForOcr(page: Page, image: Buffer): Promise<Buffer> {
  const b64 = image.toString('base64');
  const processed = await page.evaluate(async (base64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${base64}`;
    await img.decode();
    const scale = 3;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(img.width * scale, 120);
    canvas.height = Math.max(img.height * scale, 80);
    const ctx = canvas.getContext('2d');
    if (!ctx) return base64;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < imageData.data.length; i += 4) {
      const lum =
        0.299 * imageData.data[i] +
        0.587 * imageData.data[i + 1] +
        0.114 * imageData.data[i + 2];
      const value = lum > 140 ? 255 : 0;
      imageData.data[i] = imageData.data[i + 1] = imageData.data[i + 2] = value;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1] ?? base64;
  }, b64);
  return Buffer.from(processed, 'base64');
}

async function ocrScreenshot(page: Page, image: Buffer): Promise<string> {
  const preprocessed = await preprocessForOcr(page, image);
  const worker = await createWorker('chi_tra', 1, {
    langPath: CHI_TRA_LANG_PATH,
    gzip: false,
  });
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    });
    const {
      data: { text },
    } = await worker.recognize(preprocessed);
    return text.replace(/\s+/g, ' ').trim();
  } finally {
    await worker.terminate();
  }
}

export async function analyzeScreenshotPixels(
  page: Page,
  screenshot: Buffer,
): Promise<ScreenshotPixels> {
  const b64 = screenshot.toString('base64');
  return page.evaluate(async (base64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${base64}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { darkRatio: 0, lightRatio: 0, width: img.width, height: img.height };
    }
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, img.width, img.height);
    let dark = 0;
    let light = 0;
    const total = img.width * img.height;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum < 50) dark += 1;
      if (lum > 180) light += 1;
    }
    return {
      darkRatio: dark / total,
      lightRatio: light / total,
      width: img.width,
      height: img.height,
    };
  }, b64);
}

function isErrorScreenOcr(ocrText: string): boolean {
  return YOUTUBE_ERROR_SCREEN_OCR.test(ocrText) || YOUTUBE_PLAYBACK_ERROR.test(ocrText);
}

/** 灰底感嘆號錯誤畫面：暗色占比高、幾乎無動態、時間未前進 */
export function isGrayStaticErrorScreen(
  pixels: ScreenshotPixels,
  motionRatio: number,
  timeAdvanced: boolean,
): boolean {
  if (timeAdvanced || motionRatio >= MIN_SCREEN_MOTION_RATIO) {
    return false;
  }
  return pixels.darkRatio >= MIN_DARK_RATIO_ERROR && pixels.lightRatio <= MAX_LIGHT_RATIO_ERROR;
}

/** 黑畫面或空白（無錯誤文字時）：暗色占比極高、無動態、時間未前進 */
export function isBlackOrBlankStaticScreen(
  pixels: ScreenshotPixels,
  motionRatio: number,
  timeAdvanced: boolean,
): boolean {
  if (timeAdvanced || motionRatio >= MIN_SCREEN_MOTION_RATIO) {
    return false;
  }
  return pixels.darkRatio >= MIN_BLACK_RATIO && pixels.lightRatio <= 0.05;
}

export type PlaybackProgress = {
  before: YoutubeEmbedSnapshot;
  after: YoutubeEmbedSnapshot;
  timeAdvanced: boolean;
  elapsedMs: number;
};

/** 等待 iframe 內影片時間實際前進，或中途偵測到錯誤狀態 */
export async function waitForYoutubePlaybackProgress(
  frame: FrameLocator,
  label: string,
  playlistId: string,
  timeoutMs = PLAYBACK_PROGRESS_TIMEOUT_MS,
): Promise<PlaybackProgress> {
  const started = Date.now();
  const before = await readYoutubeEmbedSnapshot(frame);

  let after = before;
  let timeAdvanced = false;

  await expect
    .poll(
      async () => {
        const visibleError = await readVisibleEmbedError(frame);
        if (visibleError) {
          throw new Error(formatYoutubeEmbedError(label, visibleError, playlistId));
        }

        after = await readYoutubeEmbedSnapshot(frame);
        if (isYoutubeEmbedError(after)) {
          throw new Error(
            formatYoutubeEmbedError(
              label,
              after.errorReason || after.bodyText || 'DOM 錯誤狀態',
              playlistId,
            ),
          );
        }

        timeAdvanced = after.videoTime > before.videoTime + MIN_TIME_ADVANCE_SEC;
        if (timeAdvanced) {
          return 'playing';
        }

        return 'waiting';
      },
      {
        timeout: timeoutMs,
        intervals: [500, 1000, 1500],
        message: `${label} 影片時間未在 ${timeoutMs}ms 內前進`,
      },
    )
    .toBe('playing');

  return {
    before,
    after,
    timeAdvanced,
    elapsedMs: Date.now() - started,
  };
}

/** 必須有明確播放訊號；灰底靜態、錯誤 DOM／OCR 一律視為失敗 */
export function isNormalPlaybackVisual(check: YoutubeVisualCheck): boolean {
  const { motionRatio, ocrText, darkRatio, lightRatio, before, after } = check;
  const timeAdvanced = after.videoTime > before.videoTime + MIN_TIME_ADVANCE_SEC;

  if (isYoutubeEmbedError(before) || isYoutubeEmbedError(after)) {
    return false;
  }
  if (isErrorScreenOcr(ocrText)) {
    return false;
  }
  if (
    isGrayStaticErrorScreen(
      { darkRatio, lightRatio, width: 0, height: 0 },
      motionRatio,
      timeAdvanced,
    )
  ) {
    return false;
  }
  if (
    isBlackOrBlankStaticScreen(
      { darkRatio, lightRatio, width: 0, height: 0 },
      motionRatio,
      timeAdvanced,
    )
  ) {
    return false;
  }

  const hasMotion = motionRatio >= MIN_SCREEN_MOTION_RATIO;
  const hasActiveVideo =
    after.videoSrc.startsWith('blob:') && after.videoReadyState >= 2 && after.videoTime > 0.2;

  return timeAdvanced && hasMotion && (hasActiveVideo || after.playingMode);
}

export function formatYoutubeEmbedError(
  label: string,
  reason: string,
  playlistId = 'unknown',
  check?: YoutubeVisualCheck,
): string {
  const visual = check
    ? ` motion=${(check.motionRatio * 100).toFixed(2)}% dark=${(check.darkRatio * 100).toFixed(1)}% light=${(check.lightRatio * 100).toFixed(1)}% ocr="${check.ocrText.slice(0, 80)}" videoTime=${check.before.videoTime}->${check.after.videoTime}`
    : '';
  return `${label} YouTube 非正常播放畫面（playlist=${playlistId}）：${reason}${visual}`;
}

async function captureVisualCheck(
  page: Page,
  iframe: Locator,
  frame: FrameLocator,
): Promise<{ check: YoutubeVisualCheck; screenshot: Buffer }> {
  const before = await readYoutubeEmbedSnapshot(frame);
  const shot1 = await iframe.screenshot({ timeout: 15_000 });
  await iframe.page().waitForTimeout(VISUAL_SAMPLE_GAP_MS);
  const shot2 = await iframe.screenshot({ timeout: 15_000 });
  const after = await readYoutubeEmbedSnapshot(frame);
  const motionRatio = bufferDiffRatio(shot1, shot2);
  const pixels = await analyzeScreenshotPixels(page, shot2);
  const ocrText = await ocrScreenshot(page, shot2);

  return {
    check: {
      motionRatio,
      ocrText,
      darkRatio: pixels.darkRatio,
      lightRatio: pixels.lightRatio,
      before,
      after,
    },
    screenshot: shot2,
  };
}

async function attachFailureScreenshot(page: Page, screenshot: Buffer, name: string) {
  await test.info().attach(name, { body: screenshot, contentType: 'image/png' });
}

/**
 * 以「實際畫面」為準：iframe 可見錯誤文字 + 截圖像素 + OCR + 影片時間前進。
 * 只要不是正常播放（含灰底感嘆號、無法播放文字、畫面靜止）一律 fail。
 */
export async function assertYoutubeEmbedPlayback(
  page: Page,
  iframeOrSelector: string | Locator,
  label: string,
) {
  const iframe =
    typeof iframeOrSelector === 'string'
      ? page.locator(iframeOrSelector).first()
      : iframeOrSelector.first();

  const embedTestId = `yt-embed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await iframe.evaluate((el, id) => {
    el.setAttribute('data-yt-embed-test', id);
  }, embedTestId);
  const iframeSelector = `iframe[data-yt-embed-test="${embedTestId}"]`;

  const src = (await iframe.getAttribute('src')) ?? '';
  const playlistId = src.match(/[?&]list=([^&]+)/)?.[1] ?? 'unknown';

  await test.step(`${label}：確認 YouTube iframe 可見且來源正確`, async () => {
    await expect(iframe, `${label} YouTube iframe 不可見`).toBeVisible({ timeout: 20_000 });
    expect(src, `${label} 缺少 YouTube embed 來源`).toMatch(/youtube\.com\/embed|youtube-nocookie\.com\/embed/i);
  });

  const frame = page.frameLocator(iframeSelector).first();

  await test.step(`${label}：等待播放器載入並排除 DOM 錯誤狀態`, async () => {
    await expect(frame.locator('#movie_player'), `${label} YouTube 播放器未載入`).toBeVisible({
      timeout: 20_000,
    });

    await expect
      .poll(
        async () => {
          const visibleError = await readVisibleEmbedError(frame);
          if (visibleError) {
            throw new Error(formatYoutubeEmbedError(label, visibleError, playlistId));
          }

          const snapshot = await readYoutubeEmbedSnapshot(frame);
          if (isYoutubeEmbedError(snapshot)) {
            throw new Error(
              formatYoutubeEmbedError(
                label,
                snapshot.errorReason || snapshot.bodyText || 'DOM 錯誤狀態',
                playlistId,
              ),
            );
          }

          const loaded =
            snapshot.videoReadyState >= 2 ||
            snapshot.playingMode ||
            snapshot.bodyText.length > 0;
          return loaded ? 'ready' : 'waiting';
        },
        {
          timeout: 25_000,
          intervals: [1000, 2000],
          message: `${label} YouTube 播放器載入逾時`,
        },
      )
      .toBe('ready');
  });

  await test.step(`${label}：等待影片時間實際前進（最長 ${PLAYBACK_PROGRESS_TIMEOUT_MS}ms）`, async () => {
    await iframe.page().waitForTimeout(PLAYBACK_SETTLE_MS);
    const progress = await waitForYoutubePlaybackProgress(frame, label, playlistId);
    test.info().annotations.push({
      type: 'youtube-playback',
      description: `videoTime ${progress.before.videoTime}->${progress.after.videoTime} (${progress.elapsedMs}ms)`,
    });
  });

  const { check, screenshot } = await test.step(`${label}：截圖比對畫面動態與 OCR`, async () =>
    captureVisualCheck(page, iframe, frame),
  );

  if (!isNormalPlaybackVisual(check)) {
    await attachFailureScreenshot(page, screenshot, `${label}-youtube-embed.png`);

    const visibleError = await readVisibleEmbedError(frame);
    if (visibleError) {
      throw new Error(formatYoutubeEmbedError(label, visibleError, playlistId, check));
    }

    if (isErrorScreenOcr(check.ocrText)) {
      throw new Error(
        formatYoutubeEmbedError(label, `截圖 OCR 偵測到錯誤：${check.ocrText}`, playlistId, check),
      );
    }

    const timeAdvanced = check.after.videoTime > check.before.videoTime + MIN_TIME_ADVANCE_SEC;

    if (
      isGrayStaticErrorScreen(
        { darkRatio: check.darkRatio, lightRatio: check.lightRatio, width: 0, height: 0 },
        check.motionRatio,
        timeAdvanced,
      )
    ) {
      throw new Error(
        formatYoutubeEmbedError(
          label,
          '截圖為灰底靜態錯誤畫面（疑似無法播放）',
          playlistId,
          check,
        ),
      );
    }

    if (
      isBlackOrBlankStaticScreen(
        { darkRatio: check.darkRatio, lightRatio: check.lightRatio, width: 0, height: 0 },
        check.motionRatio,
        timeAdvanced,
      )
    ) {
      throw new Error(
        formatYoutubeEmbedError(
          label,
          '截圖為黑畫面／空白靜態畫面（疑似未播放）',
          playlistId,
          check,
        ),
      );
    }

    if (isYoutubeEmbedError(check.after)) {
      throw new Error(
        formatYoutubeEmbedError(
          label,
          check.after.errorReason || check.after.bodyText || 'DOM 錯誤狀態',
          playlistId,
          check,
        ),
      );
    }

    throw new Error(
      formatYoutubeEmbedError(
        label,
        '畫面非正常播放（無足夠動態或影片時間未前進）',
        playlistId,
        check,
      ),
    );
  }
}

/** 失效／無法播放時 assertYoutubeEmbedPlayback 應丟出的錯誤特徵 */
export const YOUTUBE_PLAYBACK_FAIL_PATTERN =
  /非正常播放|無法播放|unavailable|Error\s*153|時間未|黑畫面|灰底|靜態|DOM 錯誤|Watch video on YouTube/i;

/**
 * 用於規則回歸：確認 embed **無法**正常播放。
 * - 若 assertYoutubeEmbedPlayback 丟錯 → 規則正確（此函式正常 return）
 * - 若 assertYoutubeEmbedPlayback 通過 → 規則有漏洞（此函式 throw，測試 Fail）
 *
 * 正式機對失效清單應直接呼叫 assertYoutubeEmbedPlayback（不包 try/catch），
 * 測試報告會顯示 Fail（紅）並附 Error 訊息。
 */
export async function assertYoutubeEmbedMustFail(
  page: Page,
  iframeSelector: string,
  label: string,
) {
  try {
    await assertYoutubeEmbedPlayback(page, iframeSelector, label);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!YOUTUBE_PLAYBACK_FAIL_PATTERN.test(message)) {
      throw new Error(
        `${label} 雖然驗證失敗，但錯誤訊息不符合預期格式：${message}`,
      );
    }
    test.info().annotations.push({
      type: 'youtube-playback-error',
      description: message.slice(0, 240),
    });
    return;
  }

  throw new Error(
    `${label} 為無法播放的 embed，但 assertYoutubeEmbedPlayback 回傳 Pass（規則錯誤）`,
  );
}

export const PLAYLIST_YOUTUBE_IFRAME =
  '.vid-yt-mini-box iframe[src*="youtube.com/embed"], .vid-yt-mini-box iframe#vid-player-target, #pr-main-wrapper .vid-yt-mini-box iframe, #pr-home-banner + .vid-yt-mini-box iframe';

async function closeVisiblePlaylistDialog(page: Page) {
  if (await page.getByText(/প্লেলিস্ট|playlist/i).first().isVisible().catch(() => false)) {
    const closeBtn = page.locator('.dark-close, .el-dialog__headerbtn, button').filter({ hasText: /^$/ }).last();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click({ timeout: 5_000, force: true }).catch(() => {});
    } else {
      await page.keyboard.press('Escape').catch(() => {});
    }
    await page.waitForTimeout(400);
  }
}

/** 播放清單區：.vid-yt-mini-box > .vid-yt-frame-wrap */
export function playlistPlayerFrameWrap(box: Locator): Locator {
  return box.locator('.vid-yt-frame-wrap').first();
}

/** 讀取 video 實際來源（含 src 屬性、&lt;source&gt; 子元素、currentSrc） */
export async function readHtml5VideoSource(video: Locator): Promise<string> {
  return video.evaluate((el) => {
    const v = el as HTMLVideoElement;
    const attrSrc = v.getAttribute('src') ?? '';
    const sourceChild =
      Array.from(v.querySelectorAll('source'))
        .map((node) => node.getAttribute('src') ?? '')
        .find(Boolean) ?? '';
    return v.currentSrc || attrSrc || sourceChild || '';
  });
}

export function playlistInlineYoutubeIframe(box: Locator): Locator {
  return playlistPlayerFrameWrap(box).locator(':scope > iframe').first();
}

export async function resolvePlaylistInlineVideo(box: Locator): Promise<Locator | null> {
  const video = playlistPlayerFrameWrap(box).locator(':scope > video').first();
  if (!(await video.isVisible().catch(() => false))) {
    return null;
  }
  const src = await readHtml5VideoSource(video);
  return src ? video : null;
}

type FrameWrapEmbedKind = 'youtube' | 'html5' | 'none';

type InlinePlaylistEmbed =
  | { kind: 'youtube'; iframe: Locator }
  | { kind: 'html5'; video: Locator };

/** 階段 A：.vid-yt-frame-wrap 直接子層是 iframe 還是 video（iframe 優先） */
async function readFrameWrapDirectEmbedKind(frameWrap: Locator): Promise<FrameWrapEmbedKind> {
  return frameWrap.evaluate((wrap) => {
    const isVisible = (child: HTMLElement) => {
      const style = window.getComputedStyle(child);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (Number(style.opacity) === 0) return false;
      const rect = child.getBoundingClientRect();
      return rect.width >= 2 && rect.height >= 2;
    };

    const direct = Array.from(wrap.children).filter(
      (node): node is HTMLElement => node instanceof HTMLElement,
    );

    for (const child of direct) {
      if (child.tagName === 'IFRAME' && isVisible(child)) return 'youtube';
    }
    for (const child of direct) {
      if (child.tagName === 'VIDEO' && isVisible(child)) return 'html5';
    }
    return 'none';
  });
}

async function readFrameWrapDirectChildDebug(frameWrap: Locator): Promise<string> {
  return frameWrap.evaluate((wrap) => {
    const isVisible = (child: HTMLElement) => {
      const style = window.getComputedStyle(child);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (Number(style.opacity) === 0) return false;
      const rect = child.getBoundingClientRect();
      return rect.width >= 2 && rect.height >= 2;
    };

    return Array.from(wrap.children)
      .map((child) => {
        if (!(child instanceof HTMLElement)) return child.nodeName;
        const visible = isVisible(child);
        const src =
          child instanceof HTMLIFrameElement
            ? child.src
            : child instanceof HTMLVideoElement
              ? child.currentSrc || child.src
              : '';
        return `${child.tagName.toLowerCase()}${visible ? '' : '(hidden)'}${src ? `:${src.slice(0, 80)}` : ''}`;
      })
      .join(' | ');
  });
}

/** 階段 A：等待 .vid-yt-frame-wrap 出現可見的 iframe 或 video */
async function resolveFrameWrapDirectEmbed(
  box: Locator,
  label: string,
): Promise<InlinePlaylistEmbed> {
  const frameWrap = playlistPlayerFrameWrap(box);
  await expect(frameWrap, `${label} 缺少 .vid-yt-frame-wrap`).toBeVisible({ timeout: 20_000 });
  await frameWrap.scrollIntoViewIfNeeded();

  const directIframe = frameWrap.locator(':scope > iframe').first();
  const directVideo = frameWrap.locator(':scope > video').first();

  let resolved: InlinePlaylistEmbed | null = null;

  await expect
    .poll(
      async () => {
        const kind = await readFrameWrapDirectEmbedKind(frameWrap);
        if (kind === 'youtube') {
          resolved = { kind: 'youtube', iframe: directIframe };
          return 'youtube';
        }
        if (kind === 'html5') {
          resolved = { kind: 'html5', video: directVideo };
          return 'html5';
        }
        return 'none';
      },
      {
        timeout: 25_000,
        intervals: [500, 1000, 1500],
        message: `${label} .vid-yt-frame-wrap 內尚無可見的 iframe 或 video`,
      },
    )
    .not.toBe('none');

  if (!resolved) {
    throw new Error(`${label} .vid-yt-frame-wrap 內找不到可驗證的內嵌播放器`);
  }

  const embed = resolved as InlinePlaylistEmbed;

  const childDebug = await readFrameWrapDirectChildDebug(frameWrap);
  test.info().annotations.push(
    { type: 'frame-wrap-direct-child', description: childDebug },
    { type: 'playlist-embed-type', description: embed.kind },
  );

  return embed;
}

/**
 * 驗證 HTML5 &lt;video&gt; 可載入且能播放（readyState、error、currentTime）。
 */
export async function assertHtml5VideoPlayback(video: Locator, label: string) {
  await test.step(`${label}：確認 HTML5 video 可見且有來源`, async () => {
    await expect(video, `${label} 影片元素不可見`).toBeVisible({ timeout: 15_000 });

    await expect
      .poll(async () => readHtml5VideoSource(video), {
        timeout: 20_000,
        message: `${label} 影片缺少來源`,
      })
      .not.toEqual('');
  });

  const videoSrc = await readHtml5VideoSource(video);

  await test.step(`${label}：等待影片載入完成（readyState ≥ 2、無 error）`, async () => {
    await expect
      .poll(
        async () =>
          video.evaluate((el) => {
            const v = el as HTMLVideoElement;
            return v.readyState >= 2 && (v.error?.code ?? 0) === 0;
          }),
        { timeout: 20_000, message: `${label} 影片未完成載入` },
      )
      .toBeTruthy();
  });

  const playback = await test.step(
    `${label}：等待影片時間實際前進（最長 ${PLAYBACK_PROGRESS_TIMEOUT_MS}ms）`,
    async () => {
      const before = await video.evaluate((el) => (el as HTMLVideoElement).currentTime);

      await expect
        .poll(
          async () => {
            const state = await video.evaluate(async (el) => {
              const v = el as HTMLVideoElement;
              v.muted = true;
              try {
                await v.play();
              } catch {
                // 有些站點會阻擋程式觸發播放，改用時間與狀態檢查補強
              }
              return {
                currentTime: v.currentTime,
                errorCode: v.error?.code ?? 0,
                paused: v.paused,
                readyState: v.readyState,
                src: v.currentSrc || v.src || '',
              };
            });

            if (state.errorCode !== 0) {
              throw new Error(`${label} 影片發生播放錯誤 (code=${state.errorCode})`);
            }
            if (state.currentTime > before + MIN_TIME_ADVANCE_SEC) {
              return 'playing';
            }
            if (!state.paused && state.readyState >= 2 && state.currentTime > 0.2) {
              return 'playing';
            }
            return 'waiting';
          },
          {
            timeout: PLAYBACK_PROGRESS_TIMEOUT_MS,
            intervals: [500, 1000, 1500],
            message: `${label} 影片時間未在時限內前進`,
          },
        )
        .toBe('playing');

      const after = await video.evaluate(
        (el, startTime) => {
          const v = el as HTMLVideoElement;
          return {
            before: startTime,
            after: v.currentTime,
            advanced: v.currentTime > startTime + 0.12,
            paused: v.paused,
            errorCode: v.error?.code ?? 0,
            readyState: v.readyState,
            src: v.currentSrc || v.src || '',
          };
        },
        before,
      );

      test.info().annotations.push({
        type: 'html5-playback',
        description: `videoTime ${after.before}->${after.after} src=${after.src || videoSrc}`,
      });

      return after;
    },
  );

  expect(playback.errorCode, `${label} 影片發生播放錯誤 (code=${playback.errorCode})`).toBe(0);
  expect(
    playback.advanced || (!playback.paused && playback.readyState >= 2),
    `${label} 影片無法正常播放（時間未前進且未處於播放狀態；src=${playback.src || videoSrc}）`,
  ).toBeTruthy();
}

/** 驗證「查看播放清單」彈窗可開啟且內容正常（附加檢查，不能取代內嵌播放器驗證） */
export async function assertPlaylistDialogPlayable(page: Page, label: string) {
  const viewPlaylistBtn = page
    .locator('#pr-main-wrapper')
    .getByRole('button', { name: /playlist|প্লেলিস্ট|view/i })
    .first();

  const hasPlaylistBtn = await viewPlaylistBtn.isVisible().catch(() => false);
  if (!hasPlaylistBtn) {
    return;
  }

  await viewPlaylistBtn.click({ timeout: 10_000, force: true });
  await page.waitForTimeout(1_500);

  const playlistHeading = page.getByText(/প্লেলিস্ট|playlist/i).first();
  await expect(playlistHeading, `${label} 播放清單庫彈窗應開啟`).toBeVisible({ timeout: 15_000 });

  const dialog = playlistHeading.locator(
    'xpath=ancestor::*[contains(@class,"el-dialog") or contains(@class,"dialog") or contains(@class,"wrapper")][1]',
  );
  const dialogScope = (await dialog.count()) > 0 ? dialog : page.locator('body');
  await expect(
    dialogScope.locator('img, video, a, canvas').first(),
    `${label} 播放清單庫應有影片項目`,
  ).toBeVisible({ timeout: 15_000 });

  const dialogText = ((await dialogScope.innerText().catch(() => '')) ?? '').trim();
  expect(dialogText, `${label} 播放清單庫不應顯示無法播放訊息`).not.toMatch(YOUTUBE_PLAYBACK_ERROR);

  await closeVisiblePlaylistDialog(page);
}

/**
 * 播放清單區內嵌一部影片（兩階段）：
 * A. 看 .vid-yt-frame-wrap 裡是直接嵌 iframe（YouTube）還是 video（MP4）
 * B. YouTube：等載入 → 抓錯誤畫面 → 等時間往前 → 截圖確認有在播
 *    HTML5：確認有來源、載入完成、時間有往前
 */
export async function assertPlaylistInlinePlayerPlayable(
  page: Page,
  label: string,
  region?: Locator,
) {
  const box = region ?? page.locator('#pr-home-banner + .vid-yt-mini-box').first();

  await test.step(`${label}：確認播放清單區可見`, async () => {
    await expect(box, `${label} 播放清單區不可見`).toBeVisible({ timeout: 20_000 });
    await box.scrollIntoViewIfNeeded();
  });

  const embed = await test.step(`${label}：[A] 判斷 frame-wrap 直接子層`, async () =>
    resolveFrameWrapDirectEmbed(box, label),
  );

  if (embed.kind === 'youtube') {
    await test.step(
      `${label}：[B] YouTube 播放驗證（確認 iframe 能正常播，不是只出現播放器外框）`,
      async () => {
        test.info().annotations.push({
          type: 'youtube-verify-checklist',
          description:
            '① iframe 可見且來源為 YouTube ② 等播放器載入 ③ 排除錯誤畫面（無法播放、灰底感嘆號等） ④ 等影片時間往前（非一直 0） ⑤ 截圖確認畫面有在動',
        });
        await assertYoutubeEmbedPlayback(page, embed.iframe, label);
      },
    );
    return;
  }

  await test.step(
    `${label}：[B] HTML5 播放驗證（確認 MP4 能載入且時間有往前）`,
    async () => {
      await assertHtml5VideoPlayback(embed.video, label);
    },
  );
}

/**
 * 播放清單區完整驗證：先驗證畫面上內嵌播放器可播，再驗證播放清單彈窗（若有按鈕）。
 * 目前無 spec 直接呼叫；正式測試用 assertPlaylistInlinePlayerPlayable / assertPromoPlaylistVideoPlayback。
 */
export async function assertYoutubePlaylistPlayable(
  page: Page,
  label: string,
  region?: Locator,
) {
  await assertPlaylistInlinePlayerPlayable(page, label, region);
  await test.step(`${label}：附加驗證播放清單彈窗`, async () => {
    await assertPlaylistDialogPlayable(page, label);
  });
}
