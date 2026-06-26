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

export async function onRequestGet({ request }) {
  const origin = new URL(request.url).origin;
  const response = Response.redirect(`${origin}/editor.html?code=gbadmin&github=logged_out`, 302);
  response.headers.append('Set-Cookie', clearCookie('gbgh_state'));
  response.headers.append('Set-Cookie', clearCookie('gbgh_verifier'));
  response.headers.append('Set-Cookie', clearCookie('gbgh_token'));
  response.headers.append('Set-Cookie', clearCookie('gbgh_user', false));
  return response;
}
