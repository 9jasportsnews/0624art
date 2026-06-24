import { chromium } from '@playwright/test';
import { createWorker, PSM } from 'tesseract.js';

async function ocr(src, page) {
  const base64 = await page.evaluate(async (imageSrc) => {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = imageSrc;
    });
    const scale = 4;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(img.width * scale, 160);
    canvas.height = Math.max(img.height * scale, 48);
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
      const isRed = r > 120 && r - g > 35 && r - b > 35;
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const v = isRed || gray < 170 ? 0 : 255;
      imageData.data[i] = imageData.data[i + 1] = imageData.data[i + 2] = v;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  }, src);
  const worker = await createWorker('eng');
  await worker.setParameters({ tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: PSM.SINGLE_WORD });
  const { data: { text } } = await worker.recognize(Buffer.from(base64, 'base64'));
  await worker.terminate();
  return text.replace(/\D/g, '').slice(0, 4);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('https://www.jitabet.cloud/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.waitForTimeout(5000);
await page.getByLabel('dialog').getByRole('button').filter({ hasText: /^$/ }).first().click().catch(() => {});

let ok = 0;
for (let i = 1; i <= 20; i += 1) {
  await page.locator('input[name=username]').first().fill('Testing04');
  await page.locator('input[name=pwd]').first().fill('jt44444');
  const img = page.locator('.checknum_img img').first();
  const src = await img.getAttribute('src');
  const code = await ocr(src, page);
  const c = page.locator('input[name=captcha]').first();
  await c.fill(code);
  await c.evaluate((el, v) => {
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, code);
  const resP = page.waitForResponse((r) => r.url().includes('/service/auth/login') && r.request().method() === 'POST');
  await page.locator('.web_login ul li').first().click();
  const res = await resP;
  const body = await res.json();
  if (body.code === 'common.success') {
    ok += 1;
    console.log('attempt', i, 'SUCCESS', code);
    break;
  }
  console.log('attempt', i, 'fail', code, body.code);
  await img.click().catch(() => {});
  await page.waitForTimeout(800);
}
console.log('success within 20:', ok);
await browser.close();
