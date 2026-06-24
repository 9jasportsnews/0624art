import { chromium } from '@playwright/test';
import { createWorker, PSM } from 'tesseract.js';
import { readFileSync } from 'node:fs';

const siteUrl = process.env.HOME_URL ?? 'https://www.jitabet.cloud/';

function normalizeOcrText(raw) {
  return raw
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/Z/g, '2')
    .replace(/S/g, '5')
    .replace(/B/g, '8');
}

async function preprocess(page, src) {
  const base64 = await page.evaluate(async (imageSrc) => {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = imageSrc;
    });
    const scale = 4;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(img.width * scale, 120);
    canvas.height = Math.max(img.height * scale, 40);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < imageData.data.length; i += 4) {
      const r = imageData.data[i];
      const g = imageData.data[i + 1];
      const b = imageData.data[i + 2];
      const isRedDigit = r > 120 && r - g > 35 && r - b > 35;
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const value = isRedDigit || gray < 170 ? 0 : 255;
      imageData.data[i] = imageData.data[i + 1] = imageData.data[i + 2] = value;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  }, src);
  return Buffer.from(base64, 'base64');
}

async function ocr(buffer) {
  const worker = await createWorker('eng');
  await worker.setParameters({ tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: PSM.SINGLE_WORD });
  const { data: { text } } = await worker.recognize(buffer);
  await worker.terminate();
  return normalizeOcrText(text).replace(/\D/g, '').slice(0, 4);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(siteUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.waitForTimeout(5000);
await page.getByLabel('dialog').getByRole('button').filter({ hasText: /^$/ }).first().click().catch(() => {});

const img = page.locator('.checknum_img img').first();
const src = await img.getAttribute('src');
const raw = Buffer.from(src.split(',')[1], 'base64');
const pre = await preprocess(page, src);
const shot = await img.screenshot();

const rawCode = await ocr(raw);
const preCode = await ocr(pre);
const shotCode = await ocr(shot);

console.log({ rawCode, preCode, shotCode });
await browser.close();
