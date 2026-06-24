import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect, chromium } from '@playwright/test';
import {
  analyzeScreenshotPixels,
  isGrayStaticErrorScreen,
  isNormalPlaybackVisual,
} from './youtube-embed';

const ERROR_SCREENSHOT =
  process.env.YOUTUBE_ERROR_SCREENSHOT ??
  '/Users/doraemon/.cursor/projects/Users-doraemon-Documents-sunny-web-check-web-playwright/assets/189212a3-aa24-4e90-b3f7-853307937bf1-0705dbca-9ffa-4b01-9cae-7ee3c5de1385.png';

test('灰底無法播放截圖應被判為非正常播放', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const full = readFileSync(ERROR_SCREENSHOT);

  const crop = await page.evaluate(async ({ b64, crop }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = crop.w;
    canvas.height = crop.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return b64;
    ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
    return canvas.toDataURL('image/png').split(',')[1] ?? b64;
  }, {
    b64: full.toString('base64'),
    crop: { x: 680, y: 430, w: 420, h: 240 },
  });

  const iframeShot = Buffer.from(crop, 'base64');
  const pixels = await analyzeScreenshotPixels(page, iframeShot);

  expect(isGrayStaticErrorScreen(pixels, 0, false)).toBe(true);
  expect(
    isNormalPlaybackVisual({
      motionRatio: 0,
      ocrText: '',
      darkRatio: pixels.darkRatio,
      lightRatio: pixels.lightRatio,
      before: {
        embedError: false,
        hasErrorDom: false,
        playingMode: false,
        errorReason: '',
        errorSubreason: '',
        bodyText: '',
        videoTime: 0,
        videoSrc: '',
        videoReadyState: 0,
      },
      after: {
        embedError: false,
        hasErrorDom: false,
        playingMode: false,
        errorReason: '',
        errorSubreason: '',
        bodyText: '',
        videoTime: 0,
        videoSrc: '',
        videoReadyState: 0,
      },
    }),
  ).toBe(false);

  await browser.close();
});
