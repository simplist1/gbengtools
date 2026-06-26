function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => {
    const index = part.indexOf('=');
    if (index < 0) return null;
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(Boolean));
}

function encodeCookie(value) {
  return encodeURIComponent(value).replace(/%(2[346B]|5E|60|7C)/g, decodeURIComponent);
}

function cookie(name, value, options = {}) {
  const parts = [`${name}=${encodeCookie(value)}`];
  if (options.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join('; ');
}

function clearCookie(name) {
  return cookie(name, '', { path: '/', httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 0 });
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
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return new Response('Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET environment variable.', { status: 500 });
  }

  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const state = requestUrl.searchParams.get('state');
  const cookies = parseCookies(request.headers.get('Cookie') || '');
  const expectedState = cookies.gbgh_state;
  const verifier = cookies.gbgh_verifier;
  const origin = requestUrl.origin;
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
    return response;
  }

  const response = Response.redirect(`${origin}/editor.html?code=gbadmin&github=connected`, 302);
  response.headers.append('Set-Cookie', clearCookie('gbgh_state'));
  response.headers.append('Set-Cookie', clearCookie('gbgh_verifier'));
  response.headers.append('Set-Cookie', cookie('gbgh_token', tokenBody.access_token, { path: '/', httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 60 * 60 * 8 }));
  response.headers.append('Set-Cookie', cookie('gbgh_user', user.login, { path: '/', secure: true, sameSite: 'Lax', maxAge: 60 * 60 * 8 }));
  return response;
}
