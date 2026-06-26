const COOKIE_OPTIONS = 'Path=/; Secure; SameSite=Lax';

function encodeCookie(value) {
  return encodeURIComponent(value).replace(/%(2[346B]|5E|60|7C)/g, decodeURIComponent);
}

function setCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeCookie(value)}`, COOKIE_OPTIONS];
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
  return parts.join('; ');
}

function clearCookie(name, httpOnly = true) {
  return setCookie(name, '', { httpOnly, maxAge: 0 });
}

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

function randomBase64Url(bytes = 32) {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  let binary = '';
  array.forEach(byte => binary += String.fromCharCode(byte));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256Base64Url(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  let binary = '';
  new Uint8Array(hash).forEach(byte => binary += String.fromCharCode(byte));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
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

async function login(request, env) {
  if (!env.GITHUB_CLIENT_ID) return new Response('Missing GITHUB_CLIENT_ID.', { status: 500 });

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/github/callback`;
  const state = randomBase64Url(32);
  const verifier = randomBase64Url(64);
  const challenge = await sha256Base64Url(verifier);
  const scope = env.GITHUB_SCOPE || 'public_repo read:user';

  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scope);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('prompt', 'select_account');

  const response = Response.redirect(url.toString(), 302);
  response.headers.append('Set-Cookie', setCookie('gbgh_state', state, { httpOnly: true, maxAge: 600 }));
  response.headers.append('Set-Cookie', setCookie('gbgh_verifier', verifier, { httpOnly: true, maxAge: 600 }));
  return response;
}

async function callback(request, env) {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return new Response('Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET.', { status: 500 });
  }

  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const code = requestUrl.searchParams.get('code');
  const state = requestUrl.searchParams.get('state');
  const cookies = parseCookies(request.headers.get('Cookie') || '');
  const expectedState = cookies.gbgh_state;
  const verifier = cookies.gbgh_verifier;
  const redirectUri = `${origin}/api/github/callback`;

  if (!code || !state || !expectedState || state !== expectedState || !verifier) {
    return Response.redirect(`${origin}/editor.html?code=gbadmin&github=state_error`, 302);
  }

  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'gbengtools-site-editor'
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier
    })
  });

  const tokenBody = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || tokenBody.error || !tokenBody.access_token) {
    return Response.redirect(`${origin}/editor.html?code=gbadmin&github=token_error`, 302);
  }

  const user = await githubJson('https://api.github.com/user', tokenBody.access_token);
  const allowedLogin = env.GITHUB_ALLOWED_LOGIN || 'simplist1';
  if (allowedLogin && user.login !== allowedLogin) {
    const response = Response.redirect(`${origin}/editor.html?code=gbadmin&github=wrong_user`, 302);
    response.headers.append('Set-Cookie', clearCookie('gbgh_state'));
    response.headers.append('Set-Cookie', clearCookie('gbgh_verifier'));
    response.headers.append('Set-Cookie', clearCookie('gbgh_token'));
    response.headers.append('Set-Cookie', clearCookie('gbgh_user', false));
    return response;
  }

  const response = Response.redirect(`${origin}/editor.html?code=gbadmin&github=connected`, 302);
  response.headers.append('Set-Cookie', clearCookie('gbgh_state'));
  response.headers.append('Set-Cookie', clearCookie('gbgh_verifier'));
  response.headers.append('Set-Cookie', setCookie('gbgh_token', tokenBody.access_token, { httpOnly: true, maxAge: 60 * 60 * 8 }));
  response.headers.append('Set-Cookie', setCookie('gbgh_user', user.login, { httpOnly: false, maxAge: 60 * 60 * 8 }));
  return response;
}

async function me(request, env) {
  const cookies = parseCookies(request.headers.get('Cookie') || '');
  const token = cookies.gbgh_token;
  if (!token) return json({ authenticated: false });

  try {
    const user = await githubJson('https://api.github.com/user', token);
    const allowedLogin = env.GITHUB_ALLOWED_LOGIN || 'simplist1';
    return json({
      authenticated: true,
      login: user.login,
      allowed: !allowedLogin || user.login === allowedLogin,
      allowedLogin,
      repository: env.GITHUB_REPOSITORY || 'simplist1/gbengtools'
    });
  } catch (error) {
    return json({ authenticated: false, error: error.message }, 401);
  }
}

async function logout(request) {
  const origin = new URL(request.url).origin;
  const response = Response.redirect(`${origin}/editor.html?code=gbadmin&github=logged_out`, 302);
  response.headers.append('Set-Cookie', clearCookie('gbgh_state'));
  response.headers.append('Set-Cookie', clearCookie('gbgh_verifier'));
  response.headers.append('Set-Cookie', clearCookie('gbgh_token'));
  response.headers.append('Set-Cookie', clearCookie('gbgh_user', false));
  return response;
}

async function saveSite(request, env) {
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
    const user = await githubJson('https://api.github.com/user', token);
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

    return json({
      ok: true,
      login: user.login,
      repository,
      branch,
      path: filePath,
      commit: update.commit && update.commit.sha,
      html_url: update.commit && update.commit.html_url
    });
  } catch (error) {
    return json({ ok: false, error: error.message }, 500);
  }
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/api/github/login' && request.method === 'GET') return login(request, env);
  if (url.pathname === '/api/github/callback' && request.method === 'GET') return callback(request, env);
  if (url.pathname === '/api/github/me' && request.method === 'GET') return me(request, env);
  if (url.pathname === '/api/github/logout' && request.method === 'GET') return logout(request);
  if (url.pathname === '/api/github/save-site' && request.method === 'POST') return saveSite(request, env);
  return json({ ok: false, error: 'API route not found.' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  }
};
