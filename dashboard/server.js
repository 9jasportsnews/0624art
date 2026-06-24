const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || 3789);
const API_KEY = process.env.DASHBOARD_API_KEY || '';

let running = false;

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  const urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath);
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
    };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

async function runPlaywright(suite) {
  const { spawnSync } = await import('node:child_process');
  const syncCheck = spawnSync('node', ['scripts/sync-test-cases.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (syncCheck.status !== 0) {
    throw new Error(syncCheck.stdout || syncCheck.stderr || 'test-cases 與 spec 未對齊');
  }

  const {
    loadTestCases,
    parsePlaywrightReport,
    suiteToPlaywrightArgs,
    copyHtmlReport,
    buildCaseResults,
  } = await import('../scripts/report-utils.mjs');

  const cases = loadTestCases(ROOT);
  const { args, grep } = suiteToPlaywrightArgs(suite, cases);
  const reportPath = path.join(__dirname, '.last-report.json');

  const playwrightArgs = ['playwright', 'test', '--reporter=json', '--reporter=html', ...args];
  if (grep) playwrightArgs.push('-g', grep);

  return new Promise((resolve) => {
    const child = spawn('npx', playwrightArgs, {
      cwd: ROOT,
      env: {
        ...process.env,
        PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath,
        NO_COLOR: '1',
      },
      shell: process.platform === 'win32',
    });

    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('close', (code) => {
      let report = null;
      let tests = [];

      if (fs.existsSync(reportPath)) {
        try {
          report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
          tests = parsePlaywrightReport(report, cases);
        } catch {
          /* ignore */
        }
      }

      const stats = report?.stats || {};
      const hasHtmlReport = copyHtmlReport(ROOT);

      const caseResults = buildCaseResults(cases, tests, suite);
      const casePassed = caseResults.filter((r) => r.status === 'passed').length;
      const caseFailed = caseResults.filter((r) => r.status === 'failed').length;
      const caseSkipped = caseResults.filter((r) => r.status === 'skipped').length;
      const casePending = caseResults.filter((r) => r.status === 'pending').length;
      const okByCases = caseFailed === 0 && (casePassed > 0 || casePending === 0);

      resolve({
        ok: code === 0 && okByCases,
        exitCode: code,
        suite,
        summary: {
          total: caseResults.length || (stats.expected ?? 0) + (stats.unexpected ?? 0) + (stats.skipped ?? 0),
          passed: casePending === 0 ? casePassed : (stats.expected ?? casePassed),
          failed: casePending === 0 ? caseFailed : (stats.unexpected ?? caseFailed),
          skipped: stats.skipped ?? caseSkipped,
          durationMs: stats.duration ?? tests.reduce((s, t) => s + t.durationMs, 0),
        },
        tests,
        cases,
        caseResults,
        playwrightReportUrl: hasHtmlReport ? '/playwright-report/index.html' : null,
        stderr: stderr.slice(-4000) || null,
      });
    });
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url && !req.url.startsWith('/api/')) {
    serveStatic(req, res);
    return;
  }

  if (req.method === 'GET' && req.url === '/api/status') {
    sendJson(res, 200, { mode: 'local', running });
    return;
  }

  if (req.method === 'GET' && req.url === '/api/test-cases') {
    try {
      const { loadTestCases } = await import('../scripts/report-utils.mjs');
      const cases = loadTestCases(ROOT);
      sendJson(res, 200, { cases });
    } catch (e) {
      sendJson(res, 500, { error: e instanceof Error ? e.message : '讀取測試清單失敗' });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/run') {
    if (API_KEY) {
      const key = req.headers['x-api-key'];
      if (key !== API_KEY) {
        sendJson(res, 401, { error: '未授權' });
        return;
      }
    }

    if (running) {
      sendJson(res, 409, { error: '檢測進行中，請稍候' });
      return;
    }

    let body = {};
    try {
      body = await readBody(req);
    } catch {
      sendJson(res, 400, { error: '請求格式錯誤' });
      return;
    }

    const suite = body.suite || 'all';
    running = true;
    const startedAt = new Date().toISOString();

    try {
      const result = await runPlaywright(suite);
      const payload = {
        ...result,
        startedAt,
        finishedAt: new Date().toISOString(),
        generatedAt: new Date().toISOString(),
      };
      const dataDir = path.join(PUBLIC_DIR, 'data');
      const outPath = path.join(dataDir, 'latest-report.json');
      const suiteOutPath = path.join(dataDir, 'reports', `${suite}.json`);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.mkdirSync(path.dirname(suiteOutPath), { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
      fs.writeFileSync(suiteOutPath, JSON.stringify(payload, null, 2), 'utf8');
      sendJson(res, 200, payload);
    } catch (e) {
      sendJson(res, 500, {
        error: e instanceof Error ? e.message : '執行失敗',
        startedAt,
        finishedAt: new Date().toISOString(),
      });
    } finally {
      running = false;
    }
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`檢測儀表板：http://localhost:${PORT}`);
  console.log(`專案根目錄：${ROOT}`);
  if (API_KEY) console.log('已啟用 API Key 保護');
});
