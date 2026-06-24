import fs from 'node:fs';
import path from 'node:path';

function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractTestTitles(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const titles = [];
  const re = /test\s*\(\s*[`'"]([^`'"]+)[`'"]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    titles.push(m[1]);
  }
  return titles;
}

function discoverRecordedCases(rootDir) {
  const recordedDir = path.join(rootDir, 'tests/recorded');
  if (!fs.existsSync(recordedDir)) return [];

  const files = fs
    .readdirSync(recordedDir)
    .filter((f) => f.endsWith('.spec.ts'))
    .sort((a, b) => a.localeCompare(b, 'en'));

  const discovered = [];
  for (const file of files) {
    const filePath = path.join(recordedDir, file);
    const relFile = `tests/recorded/${file}`;
    const titles = extractTestTitles(filePath);
    const firstTitle = titles[0] || path.basename(file, '.spec.ts');
    discovered.push({
      id: slugify(path.basename(file, '.spec.ts')),
      label: firstTitle,
      file: relFile,
    });
  }

  return discovered;
}

export function loadTestCases(rootDir) {
  const filePath = path.join(rootDir, 'dashboard/public/data/test-cases.json');
  const raw = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : { cases: [] };
  const manual = raw.cases || [];
  const discovered = discoverRecordedCases(rootDir);
  const merged = [...manual];
  // 一個 spec 檔只保留一個 case。手動設定優先，動態掃描只補缺少的檔案。
  const seenFiles = new Set(manual.map((c) => (c.file || '').replace(/\\/g, '/')));
  const seenIds = new Set(manual.map((c) => c.id));

  for (const c of discovered) {
    const normalizedFile = (c.file || '').replace(/\\/g, '/');
    if (seenFiles.has(normalizedFile) || seenIds.has(c.id)) continue;
    merged.push(c);
    seenFiles.add(normalizedFile);
    seenIds.add(c.id);
  }

  return merged;
}

function flattenSteps(steps, out = []) {
  for (const step of steps || []) {
    if (step.title) {
      const status =
        step.error ? 'failed' : step.status && step.status !== 'passed' ? step.status : 'passed';
      out.push({
        title: step.title,
        status,
        durationMs: step.duration ?? 0,
        error: step.error?.message || null,
      });
    }
    flattenSteps(step.steps, out);
  }
  return out;
}

function caseFileBasename(caseFile) {
  return (caseFile || '').replace(/^tests\//, '').replace(/\\/g, '/');
}

export function testMatchesCase(test, caseDef) {
  if (!test || !caseDef) return false;
  if (test.id === caseDef.id) return true;

  const caseFile = caseFileBasename(caseDef.file);
  const testFile = (test.file || '').replace(/\\/g, '/');
  if (caseFile && testFile && !testFile.includes(caseFile)) return false;

  const shortTitle = (test.title || test.label || test.id || '')
    .split(' › ')
    .pop()
    .trim();
  const fullTitle = (test.title || test.label || test.id || '').trim();

  if (caseDef.grep && shortTitle.includes(caseDef.grep)) return true;
  if (caseDef.label && shortTitle === caseDef.label) return true;
  if (caseDef.label && fullTitle.includes(caseDef.label)) return true;
  if (caseDef.label && caseDef.label.includes(shortTitle) && shortTitle.length >= 2) return true;
  for (const token of caseDef.matchInTitle || []) {
    if (token && shortTitle.includes(token)) return true;
  }

  if (caseFile && testFile.includes(caseFile) && !caseDef.grep && !(caseDef.matchInTitle || []).length) {
    return true;
  }

  return false;
}

function casesForSuiteId(cases, suiteId) {
  if (suiteId === 'all') return cases;
  const found = cases.find((c) => c.id === suiteId);
  return found ? [found] : [];
}

export function resolveCaseStatus(caseDef, tests, suiteId) {
  const matched = tests.filter((t) => testMatchesCase(t, caseDef));

  if (!matched.length && suiteId === caseDef.id && tests.length === 1) {
    const t = tests[0];
    if (t.status === 'passed') return 'passed';
    if (t.status === 'failed' || t.status === 'timedOut') return 'failed';
    if (t.status === 'skipped') return 'skipped';
  }

  if (!matched.length) return 'pending';
  if (matched.some((t) => t.status === 'failed' || t.status === 'timedOut')) return 'failed';
  if (matched.every((t) => t.status === 'skipped')) return 'skipped';
  return 'passed';
}

/** 後端預先算好每個檢測項目的狀態，避免前端對映失敗全變「未執行」 */
export function buildCaseResults(cases, tests, suiteId = 'all') {
  return casesForSuiteId(cases, suiteId).map((caseDef) => {
    const matched = tests.filter((t) => testMatchesCase(t, caseDef));
    return {
      id: caseDef.id,
      label: caseDef.label,
      status: resolveCaseStatus(caseDef, tests, suiteId),
      tests: matched,
    };
  });
}

function matchCase(testTitle, specFile, cases) {
  const shortTitle = testTitle.includes(' › ') ? testTitle.split(' › ').pop().trim() : testTitle.trim();
  const normFile = (specFile || '').replace(/\\/g, '/');
  const stub = { title: testTitle, label: shortTitle, file: normFile };

  for (const c of cases) {
    if (testMatchesCase(stub, c)) return c;
  }

  return null;
}

export function parsePlaywrightReport(report, cases = []) {
  const tests = [];

  function walkSuites(suites, prefix = '') {
    for (const suite of suites || []) {
      const title = prefix ? `${prefix} › ${suite.title}` : suite.title || '';
      for (const spec of suite.specs || []) {
        const specTitle = title ? `${title} › ${spec.title}` : spec.title;
        for (const test of spec.tests || []) {
          const last = test.results?.[test.results.length - 1];
          if (!last) continue;

          const matched = matchCase(specTitle, spec.file, cases);
          const steps = flattenSteps(last.steps).filter(
            (s) => !/^Before Hooks$|^After Hooks$|^Worker Cleanup$/i.test(s.title),
          );

          tests.push({
            id: matched?.id || specTitle,
            label: matched?.label || spec.title,
            title: specTitle,
            file: spec.file || null,
            status: last.status,
            durationMs: last.duration ?? 0,
            error: last.error?.message || null,
            steps,
            attachments: (last.attachments || []).map((a) => ({
              name: a.name,
              contentType: a.contentType,
              path: a.path || null,
            })),
          });
        }
      }
      walkSuites(suite.suites, title);
    }
  }

  walkSuites(report.suites);
  return tests;
}

export function suiteToPlaywrightArgs(suite, cases) {
  if (suite === 'all') {
    const files = [...new Set(cases.map((c) => c.file).filter(Boolean))];
    return { args: files.length ? files : ['tests/recorded'], grep: null };
  }

  if (suite === 'recorded') {
    return { args: ['tests/recorded'], grep: null };
  }

  const found = cases.find((c) => c.id === suite);
  if (!found) {
    return { args: ['tests/recorded'], grep: null };
  }

  const args = [found.file];
  return { args, grep: found.grep || null };
}

export function copyHtmlReport(rootDir) {
  const src = path.join(rootDir, 'playwright-report');
  const dest = path.join(rootDir, 'dashboard/public/playwright-report');
  if (!fs.existsSync(src)) return false;
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  return true;
}
