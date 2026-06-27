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

export async function onRequestGet({ request }) {
  const origin = new URL(request.url).origin;
  return redirect(`${origin}/editor.html?code=gbadmin&github=logged_out`, [
    clearCookie('gbgh_state'),
    clearCookie('gbgh_verifier'),
    clearCookie('gbgh_token'),
    clearCookie('gbgh_user', false)
  ]);
}
