const runBtn = document.getElementById('runBtn');
const suiteEl = document.getElementById('suite');
const suiteNoteEl = document.getElementById('suiteNote');
const statusText = document.getElementById('statusText');
const summaryPanel = document.getElementById('summaryPanel');
const summaryGrid = document.getElementById('summaryGrid');
const resultsPanel = document.getElementById('resultsPanel');
const resultsBody = document.getElementById('resultsBody');
const stderrBox = document.getElementById('stderrBox');
const netlifyNote = document.getElementById('netlifyNote');
const detailReportLink = document.getElementById('detailReportLink');
const lastUpdatedText = document.getElementById('lastUpdatedText');
const processPanel = document.getElementById('processPanel');
const processBody = document.getElementById('processBody');

let runtimeMode = 'unknown';
let testCases = [];
let lastReport = null;
const reportCache = new Map();

function setStatus(text, kind = '') {
  statusText.textContent = text;
  statusText.className = `status ${kind}`.trim();
}

function statusLabel(status) {
  const map = {
    passed: '通過',
    failed: '失敗',
    timedOut: '失敗',
    skipped: '略過',
    interrupted: '中斷',
    pending: '未執行',
  };
  return map[status] || status;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-TW', { hour12: false });
}

function renderLastUpdated(data) {
  if (!lastUpdatedText) return;
  const ts = data?.finishedAt || data?.generatedAt || null;
  lastUpdatedText.textContent = `上次更新：${formatDateTime(ts)}`;
}

async function loadTestCases() {
  let data = null;

  try {
    const apiRes = await fetch(`/api/test-cases?t=${Date.now()}`);
    if (apiRes.ok) {
      data = await apiRes.json();
    }
  } catch {
    /* fallback to static file */
  }

  if (!data) {
    const res = await fetch(`/data/test-cases.json?t=${Date.now()}`);
    if (!res.ok) return;
    data = await res.json();
  }

  testCases = data.cases || [];
  suiteEl.innerHTML = '';

  const allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = '全部檢測';
  allOpt.selected = true;
  suiteEl.appendChild(allOpt);

  for (const c of testCases) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.label;
    suiteEl.appendChild(opt);
  }
  renderSuiteNote(suiteEl.value);
}

function testMatchesCase(test, caseDef) {
  if (!test || !caseDef) return false;
  if (test.id === caseDef.id) return true;

  const caseFile = (caseDef.file || '').replace(/^tests\//, '').replace(/\\/g, '/');
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

function activeCases(data) {
  if (testCases.length) return testCases;
  return data?.cases || [];
}

function resolveCaseStatus(caseId, tests, viewingSuite, cases = testCases) {
  const caseDef = cases.find((c) => c.id === caseId);
  const matched = caseDef
    ? tests.filter((t) => testMatchesCase(t, caseDef))
    : tests.filter((t) => t.id === caseId);

  if (!matched.length && viewingSuite === caseId && tests.length === 1) {
    const t = tests[0];
    if (t.status === 'passed') return 'passed';
    if (t.status === 'failed' || t.status === 'timedOut') return 'failed';
    if (t.status === 'skipped') return 'skipped';
  }

  if (!matched.length) {
    return 'pending';
  }
  if (matched.some((t) => t.status === 'failed' || t.status === 'timedOut')) {
    return 'failed';
  }
  if (matched.every((t) => t.status === 'skipped')) {
    return 'skipped';
  }
  return 'passed';
}

function casesForSuite(suiteId, cases = testCases) {
  if (suiteId === 'all') return cases;
  const found = cases.find((c) => c.id === suiteId);
  return found ? [found] : [];
}

function buildCaseResultsFromTests(tests, suiteId, cases) {
  return casesForSuite(suiteId, cases).map((caseDef) => {
    const matched = tests.filter((t) => testMatchesCase(t, caseDef));
    return {
      id: caseDef.id,
      label: caseDef.label,
      status: resolveCaseStatus(caseDef.id, tests, suiteId, cases),
      tests: matched,
    };
  });
}

function getCaseResults(data, suiteId) {
  const cases = activeCases(data);
  if (data?.caseResults?.length) {
    const allowed = new Set(casesForSuite(suiteId, cases).map((c) => c.id));
    return data.caseResults.filter((r) => allowed.has(r.id));
  }
  return buildCaseResultsFromTests(data?.tests || [], suiteId, cases);
}

function caseResultsToRows(caseResults) {
  return caseResults.map((r) => ({ label: r.label, status: r.status }));
}

/** 從「全部檢測」報告切出單一項目的檢視資料 */
function sliceReportForSuite(allData, suiteId) {
  const caseResults = getCaseResults(allData, suiteId);
  if (!caseResults.length) return null;

  const row = caseResults[0];
  const tests = row.tests || [];
  if (row.status === 'pending' && !tests.length) return null;

  const durationMs = tests.reduce((s, t) => s + (t.durationMs || 0), 0);

  return {
    ...allData,
    suite: suiteId,
    sourceSuite: allData.suite || 'all',
    tests,
    caseResults,
    summary: {
      total: 1,
      passed: row.status === 'passed' ? 1 : 0,
      failed: row.status === 'failed' ? 1 : 0,
      skipped: row.status === 'skipped' ? 1 : 0,
      durationMs,
    },
    ok: row.status === 'passed',
  };
}

function cacheSuiteViewsFromAllReport(allData) {
  if (!allData) return;
  const key = allData.suite || 'all';
  reportCache.set(key, allData);
  if (key !== 'all' && !allData.caseResults?.length && !(allData.tests?.length)) return;

  for (const c of testCases) {
    const sliced = sliceReportForSuite(allData, c.id);
    if (sliced) reportCache.set(c.id, sliced);
  }
}

async function fetchLatestReportData() {
  const res = await fetch(`/data/latest-report.json?t=${Date.now()}`);
  if (!res.ok) return null;
  return res.json();
}

function renderSuiteNote(suiteId) {
  if (!suiteNoteEl) return;
  if (suiteId === 'all') {
    suiteNoteEl.classList.add('hidden');
    suiteNoteEl.textContent = '';
    return;
  }

  const selected = testCases.find((c) => c.id === suiteId);
  if (selected?.note) {
    suiteNoteEl.textContent = `註解：${selected.note}`;
    suiteNoteEl.classList.remove('hidden');
    return;
  }

  suiteNoteEl.classList.add('hidden');
  suiteNoteEl.textContent = '';
}

function buildResultRows(tests, suiteId, data = null) {
  return caseResultsToRows(getCaseResults(data || { tests }, suiteId));
}

function mapCaseStatusFromTests(caseDef, tests, suiteId) {
  return resolveCaseStatus(caseDef.id, tests, suiteId);
}

function renderProcess(data, suiteId) {
  if (!processPanel || !processBody) return;

  const caseResults = getCaseResults(data, suiteId);
  if (!caseResults.length) {
    processPanel.classList.add('hidden');
    processBody.innerHTML = '';
    return;
  }

  processPanel.classList.remove('hidden');
  processBody.innerHTML = caseResults
    .map((c) => {
      const matchedTests = c.tests || [];
      const caseStatus = c.status;
      const badgeClass = caseStatus === 'pending' ? 'pending' : caseStatus;

      if (!matchedTests.length) {
        return `<article class="process-item">
          <div class="process-title">
            <strong>${escapeHtml(c.label)}</strong>
            <span class="badge ${badgeClass}">${statusLabel(caseStatus)}</span>
          </div>
          <p class="muted">尚無此項目的檢測過程。</p>
        </article>`;
      }

      const testsHtml = matchedTests
        .map((t) => {
          const steps = t.steps || [];
          const stepsHtml = steps.length
            ? `<ol class="process-steps">${steps
                .map((s) => {
                  const sStatus = s.status === 'failed' ? '失敗' : '通過';
                  const suffix = s.error ? `（${escapeHtml(s.error)}）` : '';
                  return `<li>[${sStatus}] ${escapeHtml(s.title)}${suffix}</li>`;
                })
                .join('')}</ol>`
            : '<p class="muted">無可顯示步驟（可能是腳本快速完成）。</p>';

          return `<div>
            <p class="muted">測試：${escapeHtml(t.title || t.label || c.label)}</p>
            ${stepsHtml}
          </div>`;
        })
        .join('');

      return `<article class="process-item">
        <div class="process-title">
          <strong>${escapeHtml(c.label)}</strong>
          <span class="badge ${badgeClass}">${statusLabel(caseStatus)}</span>
        </div>
        ${testsHtml}
      </article>`;
    })
    .join('');
}

function resetSummaryForRun(suiteId) {
  const rows = casesForSuite(suiteId).map((c) => ({ label: c.label, status: 'pending' }));
  renderSummaryFromRows(rows, { summary: { durationMs: 0 } });
}

const DEFAULT_REPORT_URL = '/playwright-report/index.html';

function showDetailReportLink(url) {
  if (!detailReportLink) return;
  detailReportLink.href = url || DEFAULT_REPORT_URL;
  detailReportLink.classList.remove('hidden');
}

function renderResultsTable(data, suiteId) {
  resultsPanel.classList.remove('hidden');
  const caseResults = getCaseResults(data, suiteId);
  const rows = caseResultsToRows(caseResults);

  const hasReport = Boolean((data.tests || []).length || caseResults.some((r) => r.status !== 'pending'));
  if (!hasReport) {
    resultsBody.innerHTML =
      '<tr><td colspan="2" class="muted">尚無檢測結果，請先執行檢測。</td></tr>';
    return;
  }

  resultsBody.innerHTML = rows
    .map((r) => {
      const badgeClass = r.status === 'pending' ? 'pending' : r.status;
      return `<tr class="result-row ${r.status}">
        <td>${escapeHtml(r.label)}</td>
        <td><span class="badge ${badgeClass}">${statusLabel(r.status)}</span></td>
      </tr>`;
    })
    .join('');

  showDetailReportLink(lastReport?.playwrightReportUrl);
}

function renderSummaryFromRows(rows, data) {
  if (!summaryPanel || !summaryGrid) return;

  if (!rows.length) {
    summaryPanel.classList.add('hidden');
    summaryGrid.innerHTML = '';
    return;
  }

  summaryPanel.classList.remove('hidden');

  const total = rows.length;
  const passed = rows.filter((r) => r.status === 'passed').length;
  const failed = rows.filter((r) => r.status === 'failed').length;
  const skipped = rows.filter((r) => r.status === 'skipped').length;
  const pending = rows.filter((r) => r.status === 'pending').length;

  const durationMs = data?.summary?.durationMs ?? 0;
  const ok = failed === 0 && passed > 0 && pending === 0;

  const resultText = ok ? '成功' : failed > 0 ? '有失敗' : pending === total ? '未執行' : '—';

  summaryGrid.innerHTML = `
    <div class="summary-card"><div class="label">總數</div><div class="value">${total}</div></div>
    <div class="summary-card"><div class="label">通過</div><div class="value" style="color:var(--ok)">${passed}</div></div>
    <div class="summary-card"><div class="label">失敗</div><div class="value" style="color:var(--fail)">${failed}</div></div>
    <div class="summary-card"><div class="label">略過</div><div class="value">${skipped}</div></div>
    <div class="summary-card"><div class="label">總耗時</div><div class="value">${durationMs ? (durationMs / 1000).toFixed(1) + 's' : '—'}</div></div>
    <div class="summary-card"><div class="label">結果</div><div class="value" style="color:${ok ? 'var(--ok)' : 'var(--fail)'}">${resultText}</div></div>
  `;
}

function showReport(data, viewingSuite = suiteEl.value) {
  if (!data) return;
  lastReport = data;

  const tests = data.tests || [];
  const runSuite = data.suite;
  const displaySuite = viewingSuite;

  renderResultsTable(data, displaySuite);
  renderProcess(data, displaySuite);
  showDetailReportLink(data.playwrightReportUrl);
  renderLastUpdated(data);

  const rows = buildResultRows(tests, displaySuite, data);
  renderSummaryFromRows(rows, data);
  const failed = rows.filter((r) => r.status === 'failed').length;
  const passed = rows.filter((r) => r.status === 'passed').length;
  const pending = rows.filter((r) => r.status === 'pending').length;
  const time = data.finishedAt || data.generatedAt;
  const summary = data.summary;
  const label = suiteEl.selectedOptions[0]?.textContent || displaySuite;
  const justRanThisSuite = runSuite === displaySuite;

  if (time && rows.some((r) => r.status !== 'pending')) {
    let allPass;
    let message;

    if (justRanThisSuite && typeof data.ok === 'boolean' && summary && displaySuite === 'all') {
      allPass = data.ok;
      message = allPass
        ? `檢測完成：${summary.passed}/${summary.total} 項通過（${time}）`
        : `檢測完成：${summary.failed} 項失敗（${time}）`;
    } else if (justRanThisSuite && typeof data.ok === 'boolean' && displaySuite !== 'all') {
      allPass = data.ok && failed === 0;
      message = allPass
        ? `檢測完成：${label} 通過（${time}）`
        : `檢測完成：${label} 失敗（${time}）`;
    } else {
      allPass = failed === 0 && passed > 0;
      message = allPass
        ? `檢測完成：${passed} 項通過（${time}）`
        : `檢測完成：${failed} 項失敗（${time}）`;
    }

    setStatus(message, allPass ? 'ok' : 'fail');
  } else if (justRanThisSuite && !tests.length) {
    setStatus(data.error || '檢測未產生結果，請查看終端機錯誤', 'fail');
    if (data.stderr) {
      stderrBox.textContent = data.stderr;
      stderrBox.classList.remove('hidden');
    }
  } else if (pending === rows.length && rows.length > 0) {
    const fromAll =
      data.sourceSuite === 'all' || (runSuite === 'all' && displaySuite !== 'all');
    if (fromAll) {
      setStatus(`「${label}」在全部檢測中尚無結果`, '');
    } else if (runSuite && runSuite !== displaySuite) {
      setStatus(`目前報告為其他項目，請對「${label}」按開始檢測`, '');
    } else {
      setStatus(`請按「開始檢測」執行「${label}」`, '');
    }
  } else if (data.message) {
    setStatus(data.message, '');
  }

  if (data.stderr && (failed > 0 || !tests.length)) {
    stderrBox.textContent = data.stderr;
    stderrBox.classList.remove('hidden');
  }
}

async function loadLatestReport() {
  try {
    const data = await fetchLatestReportData();
    if (!data) return;
    cacheSuiteViewsFromAllReport(data);
    showReport(data, suiteEl.value);
  } catch {
    /* ignore */
  }
}

async function loadSuiteReport(suiteId) {
  if (suiteId === 'all') {
    await loadLatestReport();
    return;
  }

  if (reportCache.has(suiteId)) {
    showReport(reportCache.get(suiteId), suiteId);
    return;
  }

  try {
    const res = await fetch(`/data/reports/${encodeURIComponent(suiteId)}.json?t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      reportCache.set(suiteId, data);
      showReport(data, suiteId);
      return;
    }
  } catch {
    /* fall through */
  }

  const cachedAll = reportCache.get('all') || (lastReport?.suite === 'all' ? lastReport : null);
  if (cachedAll) {
    const sliced = sliceReportForSuite(cachedAll, suiteId);
    if (sliced) {
      reportCache.set(suiteId, sliced);
      showReport(sliced, suiteId);
      return;
    }
  }

  try {
    const data = await fetchLatestReportData();
    if (data) {
      cacheSuiteViewsFromAllReport(data);
      if (reportCache.has(suiteId)) {
        showReport(reportCache.get(suiteId), suiteId);
        return;
      }
    }
  } catch {
    /* ignore */
  }

  const label = suiteEl.selectedOptions[0]?.textContent || suiteId;
  setStatus(`「${label}」尚無報告，請按開始檢測`, '');
  resultsPanel.classList.add('hidden');
  summaryPanel?.classList.add('hidden');
  processPanel?.classList.add('hidden');
  renderLastUpdated(null);
}

async function detectRuntimeMode() {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) return 'static';
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return 'static';
    const data = await res.json();
    return data.mode === 'netlify' ? 'netlify' : 'local';
  } catch {
    return 'static';
  }
}

async function runLocalCheck() {
  const suite = suiteEl.value;
  const res = await fetch('/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ suite }),
  });

  const data = await res.json();
  if (!res.ok) {
    setStatus(data.error || '執行失敗', 'fail');
    if (data.stderr) {
      stderrBox.textContent = data.stderr;
      stderrBox.classList.remove('hidden');
    }
    return;
  }

  if (suite === 'all') {
    cacheSuiteViewsFromAllReport(data);
  } else {
    reportCache.set(suite, data);
  }
  showReport(data, suite);
}

function reportTimestamp(data) {
  return data?.finishedAt || data?.generatedAt || data?.startedAt || null;
}

async function pollLatestReportUntilChanged(prevTs, suite, { timeoutMs = 8 * 60 * 1000, intervalMs = 5000 } = {}) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`/data/latest-report.json?t=${Date.now()}`);
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, intervalMs));
        continue;
      }

      const data = await res.json();
      if (!data?.suite) {
        await new Promise((r) => setTimeout(r, intervalMs));
        continue;
      }

      const ts = reportTimestamp(data);
      const changed = prevTs ? (ts ? new Date(ts).getTime() > new Date(prevTs).getTime() : true) : Boolean(ts);
      const hasResults =
        (data.caseResults && data.caseResults.some((r) => r.status !== 'pending')) ||
        (data.tests && data.tests.length);
      if (!changed || !hasResults) {
        await new Promise((r) => setTimeout(r, intervalMs));
        continue;
      }

      cacheSuiteViewsFromAllReport(data);

      if (suite === 'all' || data.suite === suite) {
        showReport(suite === 'all' ? data : reportCache.get(suite) || data, suite);
        return true;
      }

      if (data.suite === 'all') {
        const sliced = sliceReportForSuite(data, suite);
        if (sliced) {
          reportCache.set(suite, sliced);
          showReport(sliced, suite);
          return true;
        }
      }

      await new Promise((r) => setTimeout(r, intervalMs));
      continue;
    } catch {
      // ignore and retry
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return false;
}

async function runNetlifyCheck() {
  const suite = suiteEl.value;
  const prevTs = reportTimestamp(lastReport);

  const res = await fetch('/api/trigger-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ suite: suiteEl.value }),
  });

  const data = await res.json();
  if (data.needsManualDeploy) {
    setStatus(data.message, 'running');
    return;
  }

  if (!res.ok || (data.ok === false && !data.needsManualDeploy)) {
    setStatus(data.error || '觸發失敗', 'fail');
    return;
  }

  setStatus(data.message || '已觸發建置，正在等待結果…', 'running');

  // Netlify 會需要時間完成 build，而且這段時間我們不能清掉上次結果，
  // 直到最新的 latest-report.json 真正更新後才把新結果帶入。
  const ok = await pollLatestReportUntilChanged(prevTs, suite, {
    timeoutMs: 10 * 60 * 1000,
    intervalMs: 5000,
  });

  if (!ok) {
    setStatus('等待超時：請稍後重新整理頁面查看結果', 'fail');
  }
}

runBtn.addEventListener('click', async () => {
  const selectedSuite = suiteEl.value;
  runBtn.disabled = true;
  suiteEl.disabled = true;
  stderrBox.classList.add('hidden');
  try {
    if (runtimeMode === 'local') {
      setStatus('檢測進行中', 'running');
      await runLocalCheck();
    } else if (runtimeMode === 'netlify') {
      setStatus('正在排程檢測…', 'running');
      await runNetlifyCheck();
    } else {
      setStatus('目前為靜態模式，請改用 npm run dashboard（http://localhost:3789）', 'fail');
    }
  } catch (e) {
    setStatus(`無法連線：${e.message}`, 'fail');
  } finally {
    runBtn.disabled = false;
    suiteEl.disabled = false;
  }
});

(async function init() {
  await loadTestCases();
  runtimeMode = await detectRuntimeMode();

  if (runtimeMode === 'netlify') {
    netlifyNote?.classList.remove('hidden');
    runBtn.textContent = '如何重新檢測？';
  } else if (runtimeMode === 'static') {
    netlifyNote?.classList.remove('hidden');
    netlifyNote.textContent = '目前為靜態頁面，無法直接執行檢測。請改用 npm run dashboard 後開啟 http://localhost:3789';
    runBtn.textContent = '請改用 dashboard 執行';
  }

  await loadLatestReport();

  suiteEl.addEventListener('change', () => {
    renderSuiteNote(suiteEl.value);
    loadSuiteReport(suiteEl.value);
  });
})();
