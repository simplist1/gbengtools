function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

export async function onRequestGet({ env }) {
  return json({
    ok: true,
    runtime: 'cloudflare-pages-functions',
    hasClientId: !!env.GITHUB_CLIENT_ID,
    hasClientSecret: !!env.GITHUB_CLIENT_SECRET,
    allowedLogin: env.GITHUB_ALLOWED_LOGIN || 'simplist1',
    repository: env.GITHUB_REPOSITORY || 'simplist1/gbengtools',
    branch: env.GITHUB_BRANCH || 'main',
    siteDataPath: env.GITHUB_SITE_DATA_PATH || 'docs/data/site.js'
  });
}
