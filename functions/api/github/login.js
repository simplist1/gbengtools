function cookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join('; ');
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
  try {
    if (!env.GITHUB_CLIENT_ID) {
      return text('Missing GITHUB_CLIENT_ID environment variable.', 500);
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

    return redirect(url.toString(), [
      cookie('gbgh_state', state, { path: '/', httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 600 }),
      cookie('gbgh_verifier', verifier, { path: '/', httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 600 })
    ]);
  } catch (error) {
    return text(error && error.stack ? error.stack : String(error), 500);
  }
}
