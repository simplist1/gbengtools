const COOKIE_BASE = 'Path=/; Secure; SameSite=Lax';
const LOADER_START = '// GB_ANNOUNCEMENT_EDITOR_LOADER_START';
const LOADER_END = '// GB_ANNOUNCEMENT_EDITOR_LOADER_END';

function encodeCookie(value) { return encodeURIComponent(value); }
function makeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeCookie(value)}`, COOKIE_BASE];
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
  return parts.join('; ');
}
function clearCookie(name, httpOnly = true) { return makeCookie(name, '', { httpOnly, maxAge: 0 }); }
function redirect(location, cookies = []) {
  const headers = new Headers({ Location: location });
  cookies.forEach(value => headers.append('Set-Cookie', value));
  return new Response(null, { status: 302, headers });
}
function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => {
    const index = part.indexOf('=');
    if (index < 0) return null;
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(Boolean));
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
function text(message, status = 200) {
  return new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
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
function toBase64(textValue) {
  const bytes = new TextEncoder().encode(textValue);
  let binary = '';
  bytes.forEach(byte => binary += String.fromCharCode(byte));
  return btoa(binary);
}
function announcementEditorLoader() {
  return `${LOADER_START}\nif (location.pathname.endsWith('/editor.html') || location.pathname.endsWith('/editor')) {\n  if (!document.querySelector('link[data-announcement-css]')) { const l=document.createElement('link'); l.rel='stylesheet'; l.href='announcements.css?v=20260701announcements'; l.dataset.announcementCss='true'; document.head.appendChild(l); }\n  if (!document.querySelector('script[data-announcement-editor]')) { const s=document.createElement('script'); s.src='editor-announcements.js?v=20260701announcements'; s.dataset.announcementEditor='true'; document.body.appendChild(s); }\n}\n${LOADER_END}\n`;
}
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function normalizeSiteContent(content) {
  const markerBlock = new RegExp(`${escapeRegExp(LOADER_START)}[\\s\\S]*?${escapeRegExp(LOADER_END)}\\n?`, 'g');
  const legacyLoader = /if \(location\.pathname\.endsWith\('\/editor\.html'\)[\s\S]*?\n}\n?/g;
  return announcementEditorLoader() + String(content || '').replace(markerBlock, '').replace(legacyLoader, '').trimStart();
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
function getOrigin(request) { return new URL(request.url).origin; }
function health(env) {
  return json({
    ok: true,
    worker: 'gbengtools',
    hasAssets: !!env.ASSETS,
    hasClientId: !!env.GITHUB_CLIENT_ID,
    hasClientSecret: !!env.GITHUB_CLIENT_SECRET,
    allowedLogin: env.GITHUB_ALLOWED_LOGIN || 'simplist1',
    repository: env.GITHUB_REPOSITORY || 'simplist1/gbengtools',
    branch: env.GITHUB_BRANCH || 'main',
    siteDataPath: env.GITHUB_SITE_DATA_PATH || 'docs/data/site.js'
  });
}
async function login(request, env) {
  if (!env.GITHUB_CLIENT_ID) return text('Missing GITHUB_CLIENT_ID environment variable.', 500);
  const origin = getOrigin(request);
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
  return redirect(url.toString(), [makeCookie('gbgh_state', state, { httpOnly: true, maxAge: 600 }), makeCookie('gbgh_verifier', verifier, { httpOnly: true, maxAge: 600 })]);
}
async function callback(request, env) {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return text('Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET environment variable.', 500);
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const code = requestUrl.searchParams.get('code');
  const state = requestUrl.searchParams.get('state');
  const cookies = parseCookies(request.headers.get('Cookie') || '');
  const expectedState = cookies.gbgh_state;
  const verifier = cookies.gbgh_verifier;
  const redirectUri = `${origin}/api/github/callback`;
  if (!code || !state || !expectedState || state !== expectedState || !verifier) return redirect(`${origin}/editor.html?code=gbadmin&github=state_error`);
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'gbengtools-site-editor' },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: redirectUri, code_verifier: verifier })
  });
  const tokenBody = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || tokenBody.error || !tokenBody.access_token) return redirect(`${origin}/editor.html?code=gbadmin&github=token_error`);
  const user = await githubJson('https://api.github.com/user', tokenBody.access_token);
  const allowedLogin = env.GITHUB_ALLOWED_LOGIN || 'simplist1';
  if (allowedLogin && user.login !== allowedLogin) {
    return redirect(`${origin}/editor.html?code=gbadmin&github=wrong_user`, [clearCookie('gbgh_state'), clearCookie('gbgh_verifier'), clearCookie('gbgh_token'), clearCookie('gbgh_user', false)]);
  }
  return redirect(`${origin}/editor.html?code=gbadmin&github=connected`, [clearCookie('gbgh_state'), clearCookie('gbgh_verifier'), makeCookie('gbgh_token', tokenBody.access_token, { httpOnly: true, maxAge: 60 * 60 * 8 }), makeCookie('gbgh_user', user.login, { httpOnly: false, maxAge: 60 * 60 * 8 })]);
}
async function me(request, env) {
  const cookies = parseCookies(request.headers.get('Cookie') || '');
  const token = cookies.gbgh_token;
  if (!token) return json({ authenticated: false });
  try {
    const user = await githubJson('https://api.github.com/user', token);
    const allowedLogin = env.GITHUB_ALLOWED_LOGIN || 'simplist1';
    return json({ authenticated: true, login: user.login, allowed: !allowedLogin || user.login === allowedLogin, allowedLogin, repository: env.GITHUB_REPOSITORY || 'simplist1/gbengtools' });
  } catch (error) {
    return json({ authenticated: false, error: error.message }, 401);
  }
}
function logout(request) {
  const origin = getOrigin(request);
  return redirect(`${origin}/editor.html?code=gbadmin&github=logged_out`, [clearCookie('gbgh_state'), clearCookie('gbgh_verifier'), clearCookie('gbgh_token'), clearCookie('gbgh_user', false)]);
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
  let content = body && typeof body.content === 'string' ? body.content : '';
  const message = body && typeof body.message === 'string' && body.message.trim() ? body.message.trim() : 'Update site data from live editor';
  if (!content.startsWith('window.GB_SITE_DATA = ')) return json({ ok: false, error: 'Expected content to start with window.GB_SITE_DATA = .' }, 400);
  content = normalizeSiteContent(content);
  if (content.length > 250000) return json({ ok: false, error: 'site.js content is too large.' }, 400);
  try {
    const user = await githubJson('https://api.github.com/user', token);
    if (allowedLogin && user.login !== allowedLogin) return json({ ok: false, error: `Wrong GitHub user. Expected ${allowedLogin}, got ${user.login}.` }, 403);
    const current = await githubJson(`https://api.github.com/repos/${repository}/contents/${filePath}?ref=${encodeURIComponent(branch)}`, token);
    const update = await githubJson(`https://api.github.com/repos/${repository}/contents/${filePath}`, token, {
      method: 'PUT',
      body: JSON.stringify({ message, content: toBase64(content), sha: current.sha, branch })
    });
    return json({ ok: true, login: user.login, repository, branch, path: filePath, commit: update.commit && update.commit.sha, html_url: update.commit && update.commit.html_url });
  } catch (error) {
    return json({ ok: false, error: error.message }, 500);
  }
}
async function handleApi(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/api/health') return health(env);
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
    try {
      if (url.pathname.startsWith('/api/')) return await handleApi(request, env);
      if (!env.ASSETS) return text('Static asset binding ASSETS is missing.', 500);
      return env.ASSETS.fetch(request);
    } catch (error) {
      return json({ ok: false, error: error && error.message ? error.message : String(error), stack: error && error.stack ? error.stack : null }, 500);
    }
  }
};
