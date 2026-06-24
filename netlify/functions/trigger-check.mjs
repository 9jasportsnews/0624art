const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  const hook = process.env.NETLIFY_BUILD_HOOK_URL;
  if (!hook) {
    return new Response(
      JSON.stringify({
        ok: false,
        needsManualDeploy: true,
        message:
          '你不需要自己的 API。請到 Netlify 後台 → Deploys → Trigger deploy（或 push 程式碼），建置完成後重新整理此頁即可看到結果。',
      }),
      { status: 200, headers },
    );
  }

  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const suite = body.suite || 'w01';
  const hookUrl = new URL(hook);
  hookUrl.searchParams.set('trigger_title', `playwright-check-${suite}`);
  hookUrl.searchParams.set('NETLIFY_TEST_SUITE', suite);

  const res = await fetch(hookUrl.toString(), { method: 'POST' });

  if (!res.ok) {
    return new Response(JSON.stringify({ error: `Build Hook 失敗：${res.status}` }), {
      status: 502,
      headers,
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      message: '已觸發 Netlify 建置檢測。完成後請重新整理此頁面查看結果（通常 3–8 分鐘）。',
      suite,
    }),
    { status: 200, headers },
  );
};
