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

export async function onRequestGet({ request, env }) {
  if (!env.GITHUB_CLIENT_ID) {
    return new Response('Missing GITHUB_CLIENT_ID environment variable.', { status: 500 });
  }

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
  response.headers.append('Set-Cookie', cookie('gbgh_state', state, { path: '/', httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 600 }));
  response.headers.append('Set-Cookie', cookie('gbgh_verifier', verifier, { path: '/', httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 600 }));
  return response;
}
