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
      'User-Agent': 'gbengtools-manifest-editor',
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || `GitHub request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function triggerDeployHook(env) {
  const hookUrl = env.CLOUDFLARE_DEPLOY_HOOK_URL || env.DEPLOY_HOOK_URL || '';
  if (!hookUrl) return { triggered: false, reason: 'missing_deploy_hook' };
  const response = await fetch(hookUrl, { method: 'POST' });
  const text = await response.text().catch(() => '');
  return { triggered: response.ok, status: response.status, body: text.slice(0, 500) };
}

function validateManifest(content) {
  if (!content || content.length > 500000) throw new Error('manifest.json content is missing or too large.');
  const parsed = JSON.parse(content);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.categories)) {
    throw new Error('Manifest must contain a categories array.');
  }
  return parsed;
}

export async function onRequestPost({ request, env }) {
  const cookies = parseCookies(request.headers.get('Cookie') || '');
  const token = cookies.gbgh_token;
  if (!token) return json({ ok: false, error: 'Not logged in with GitHub.' }, 401);

  const repository = env.GITHUB_REPOSITORY || 'simplist1/gbengtools';
  const branch = env.GITHUB_BRANCH || 'main';
  const allowedLogin = env.GITHUB_ALLOWED_LOGIN || 'simplist1';
  const filePath = env.GITHUB_MANIFEST_PATH || 'docs/data/manifest.json';

  const body = await request.json().catch(() => null);
  const content = body && typeof body.content === 'string' ? body.content : '';
  const message = body && typeof body.message === 'string' && body.message.trim()
    ? body.message.trim()
    : 'Update suite manifest from visual editor';

  try {
    validateManifest(content);
    const user = await githubJson('https://api.github.com/user', token);
    if (allowedLogin && user.login !== allowedLogin) {
      return json({ ok: false, error: `Wrong GitHub user. Expected ${allowedLogin}, got ${user.login}.` }, 403);
    }

    let update;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const current = await githubJson(
          `https://api.github.com/repos/${repository}/contents/${filePath}?ref=${encodeURIComponent(branch)}`,
          token
        );
        update = await githubJson(`https://api.github.com/repos/${repository}/contents/${filePath}`, token, {
          method: 'PUT',
          body: JSON.stringify({ message, content: toBase64(content), sha: current.sha, branch })
        });
        break;
      } catch (error) {
        if (attempt === 2 || ![409, 422].includes(error.status)) throw error;
        await new Promise(resolve => setTimeout(resolve, 180 * (2 ** attempt) + Math.random() * 120));
      }
    }

    let deploy = { triggered: false, reason: 'not_attempted' };
    try { deploy = await triggerDeployHook(env); }
    catch (error) { deploy = { triggered: false, error: error.message }; }

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
    const status = error instanceof SyntaxError ? 400 : 500;
    return json({ ok: false, error: error.message }, status);
  }
}
