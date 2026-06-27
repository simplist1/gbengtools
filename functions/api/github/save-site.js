function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => {
    const index = part.indexOf('=');
    if (index < 0) return null;
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(Boolean));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach(byte => binary += String.fromCharCode(byte));
  return btoa(binary);
}

async function githubJson(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'gbengtools-site-editor',
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || `GitHub request failed: ${response.status}`);
  return body;
}

async function getUser(token) {
  return githubJson('https://api.github.com/user', token);
}

async function triggerDeployHook(env) {
  const hookUrl = env.CLOUDFLARE_DEPLOY_HOOK_URL || env.DEPLOY_HOOK_URL || '';
  if (!hookUrl) {
    return { triggered: false, reason: 'missing_deploy_hook' };
  }

  const response = await fetch(hookUrl, { method: 'POST' });
  const text = await response.text().catch(() => '');
  return {
    triggered: response.ok,
    status: response.status,
    body: text.slice(0, 500)
  };
}

export async function onRequestPost({ request, env }) {
  const cookies = parseCookies(request.headers.get('Cookie') || '');
  const token = cookies.gbgh_token;
  if (!token) return json({ ok: false, error: 'Not logged in with GitHub.' }, 401);

  const repository = env.GITHUB_REPOSITORY || 'simplist1/gbengtools';
  const branch = env.GITHUB_BRANCH || 'main';
  const allowedLogin = env.GITHUB_ALLOWED_LOGIN || 'simplist1';
  const filePath = env.GITHUB_SITE_DATA_PATH || 'docs/data/site.js';

  const body = await request.json().catch(() => null);
  const content = body && typeof body.content === 'string' ? body.content : '';
  const message = body && typeof body.message === 'string' && body.message.trim()
    ? body.message.trim()
    : 'Update site data from live editor';

  if (!content.startsWith('window.GB_SITE_DATA = ')) {
    return json({ ok: false, error: 'Expected content to start with window.GB_SITE_DATA = .' }, 400);
  }
  if (content.length > 250000) {
    return json({ ok: false, error: 'site.js content is too large.' }, 400);
  }

  try {
    const user = await getUser(token);
    if (allowedLogin && user.login !== allowedLogin) {
      return json({ ok: false, error: `Wrong GitHub user. Expected ${allowedLogin}, got ${user.login}.` }, 403);
    }

    const current = await githubJson(`https://api.github.com/repos/${repository}/contents/${filePath}?ref=${encodeURIComponent(branch)}`, token);
    const update = await githubJson(`https://api.github.com/repos/${repository}/contents/${filePath}`, token, {
      method: 'PUT',
      body: JSON.stringify({
        message,
        content: toBase64(content),
        sha: current.sha,
        branch
      })
    });

    let deploy = { triggered: false, reason: 'not_attempted' };
    try {
      deploy = await triggerDeployHook(env);
    } catch (deployError) {
      deploy = { triggered: false, error: deployError.message };
    }

    return json({
      ok: true,
      login: user.login,
      repository,
      branch,
      path: filePath,
      commit: update.commit && update.commit.sha,
      html_url: update.commit && update.commit.html_url,
      deploy
    });
  } catch (error) {
    return json({ ok: false, error: error.message }, 500);
  }
}
