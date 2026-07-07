function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => {
    const index = part.indexOf('=');
    if (index < 0) return null;
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(Boolean));
}

const COOKIE_BASE = 'Path=/; Secure; SameSite=Lax';
function makeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, COOKIE_BASE];
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
  return parts.join('; ');
}
function clearCookie(name, httpOnly = true) {
  return makeCookie(name, '', { httpOnly, maxAge: 0 });
}

function json(data, status = 200, cookies = []) {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8' });
  cookies.forEach(value => headers.append('Set-Cookie', value));
  return new Response(JSON.stringify(data, null, 2), { status, headers });
}

async function githubJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'gbengtools-site-editor'
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || `GitHub request failed: ${response.status}`);
  return body;
}

export async function onRequestGet({ request, env }) {
  const cookies = parseCookies(request.headers.get('Cookie') || '');
  const token = cookies.gbgh_token;
  if (!token) return json({ authenticated: false });

  try {
    const user = await githubJson('https://api.github.com/user', token);
    const allowedLogin = env.GITHUB_ALLOWED_LOGIN || 'simplist1';
    const repository = env.GITHUB_REPOSITORY || 'simplist1/gbengtools';
    return json({
      authenticated: true,
      login: user.login,
      avatar_url: user.avatar_url,
      allowed: !allowedLogin || user.login === allowedLogin,
      allowedLogin,
      repository
    });
  } catch (error) {
    return json(
      { authenticated: false, error: `${error.message}. Please sign in with GitHub again.` },
      401,
      [clearCookie('gbgh_token'), clearCookie('gbgh_user', false)]
    );
  }
}
