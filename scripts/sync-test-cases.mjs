/**
 * 檢查 test-cases.json 與 tests/recorded/*.spec.ts 的 test 標題是否一致。
 * 執行：npm run sync:cases
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CASES_PATH = path.join(ROOT, 'dashboard/public/data/test-cases.json');
const RECORDED_DIR = path.join(ROOT, 'tests/recorded');

function extractTitleById(src) {
  const titles = [];
  const block = src.match(/titleById\s*:\s*Record[^=]*=\s*\{([\s\S]*?)\n\}/);
  if (!block) return titles;
  const re = /['"][\w-]+['"]\s*:\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(block[1])) !== null) {
    titles.push(m[1]);
  }
  return titles;
}

function extractTestTitles(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const fromMap = extractTitleById(src);
  if (fromMap.length) return fromMap;

  const titles = [];
  const re = /test\s*\(\s*[`'"]([^`'"]+)[`'"]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    titles.push(m[1]);
  }
  return titles;
}

function titlesForCase(caseDef, specTitles) {
  const base = (caseDef.file || '').replace(/^tests\//, '');
  const filePath = path.join(ROOT, 'tests', base.replace(/^tests\//, ''));
  if (!fs.existsSync(filePath)) return [];

  const all = extractTestTitles(filePath);
  if (caseDef.grep) {
    return all.filter((t) => t.includes(caseDef.grep) || caseDef.label === t);
  }
  // 一個檔案一個選項時，不要求 label 必須與單一 test 標題完全一致。
  return all;
}

const cases = JSON.parse(fs.readFileSync(CASES_PATH, 'utf8')).cases || [];
let ok = true;

console.log('檢查 test-cases.json ↔ Playwright spec 標題\n');

for (const c of cases) {
  const expected = titlesForCase(c, []);
  const filePath = path.join(ROOT, c.file);
  if (!fs.existsSync(filePath)) {
    console.error(`✗ ${c.id}：找不到 ${c.file}`);
    ok = false;
    continue;
  }

  if (!expected.length) {
    console.error(`✗ ${c.id}：在 ${path.basename(c.file)} 找不到對應測試「${c.label}」`);
    ok = false;
    continue;
  }

  console.log(`✓ ${c.label} ← ${path.basename(c.file)}`);
}

const specFiles = fs.readdirSync(RECORDED_DIR).filter((f) => f.endsWith('.spec.ts'));
const coveredFiles = new Set(cases.map((c) => path.basename(c.file)));

for (const f of specFiles) {
  if (![...coveredFiles].some((base) => base === f)) {
    console.warn(`⚠ ${f} 未列入 test-cases.json`);
  }
}

if (!ok) {
  console.error('\n請更新 dashboard/public/data/test-cases.json 後再執行檢測。');
  process.exit(1);
}

console.log('\n兩邊項目已對齊。');
