function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => {
    const index = part.indexOf('=');
    if (index < 0) return null;
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(Boolean));
}

function cookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join('; ');
}

function clearCookie(name, httpOnly = true) {
  return cookie(name, '', { path: '/', httpOnly, secure: true, sameSite: 'Lax', maxAge: 0 });
}

function redirect(location, cookies = []) {
  const headers = new Headers({ Location: location });
  cookies.forEach(value => headers.append('Set-Cookie', value));
  return new Response(null, { status: 302, headers });
}

function text(message, status = 200) {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
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
  try {
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
      return text('Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET environment variable.', 500);
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
      return redirect(`${origin}/editor.html?code=gbadmin&github=state_error`);
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
      return redirect(`${origin}/editor.html?code=gbadmin&github=token_error`);
    }

    const user = await githubJson('https://api.github.com/user', tokenBody.access_token);
    const allowedLogin = env.GITHUB_ALLOWED_LOGIN || 'simplist1';
    if (allowedLogin && user.login !== allowedLogin) {
      return redirect(`${origin}/editor.html?code=gbadmin&github=wrong_user`, [
        clearCookie('gbgh_state'),
        clearCookie('gbgh_verifier'),
        clearCookie('gbgh_token'),
        clearCookie('gbgh_user', false)
      ]);
    }

    return redirect(`${origin}/editor.html?code=gbadmin&github=connected`, [
      clearCookie('gbgh_state'),
      clearCookie('gbgh_verifier'),
      cookie('gbgh_token', tokenBody.access_token, { path: '/', httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 60 * 60 * 8 }),
      cookie('gbgh_user', user.login, { path: '/', secure: true, sameSite: 'Lax', maxAge: 60 * 60 * 8 })
    ]);
  } catch (error) {
    return text(error && error.stack ? error.stack : String(error), 500);
  }
}
