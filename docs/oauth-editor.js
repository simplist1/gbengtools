(() => {
  const API = '/api/github';

  function makeButton(text, className = 'edit-btn') {
    const button = document.createElement('button');
    button.className = className;
    button.type = 'button';
    button.textContent = text;
    return button;
  }

  function setStatus(text) {
    const node = document.getElementById('status');
    if (node) node.textContent = text;
  }

  async function getAuth() {
    const response = await fetch(`${API}/me`, { credentials: 'include' });
    return response.json();
  }

  async function saveToGitHub() {
    if (typeof window.toSiteJs !== 'function') {
      setStatus('Could not find site.js exporter on this page.');
      return;
    }

    const content = window.toSiteJs();
    setStatus('Committing site.js to GitHub...');

    const response = await fetch(`${API}/save-site`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        message: 'Update site data from live editor'
      })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      setStatus(result.error || 'GitHub save failed.');
      return;
    }

    localStorage.removeItem('gbengtools.siteData');
    setStatus(`Committed to GitHub: ${String(result.commit || '').slice(0, 7)}`);
  }

  async function initGitHubOAuthControls() {
    const actions = document.querySelector('.editor-actions');
    if (!actions || document.getElementById('githubLoginBtn')) return;

    const login = makeButton('GitHub Login');
    login.id = 'githubLoginBtn';
    login.onclick = () => { location.href = `${API}/login`; };

    const commit = makeButton('Commit site.js', 'edit-btn primary');
    commit.id = 'githubCommitBtn';
    commit.disabled = true;
    commit.onclick = saveToGitHub;

    const logout = makeButton('GitHub Logout', 'edit-btn bad');
    logout.id = 'githubLogoutBtn';
    logout.style.display = 'none';
    logout.onclick = () => { location.href = `${API}/logout`; };

    actions.appendChild(login);
    actions.appendChild(commit);
    actions.appendChild(logout);

    try {
      const auth = await getAuth();
      if (auth.authenticated && auth.allowed) {
        login.style.display = 'none';
        logout.style.display = '';
        commit.disabled = false;
        setStatus(`GitHub connected as ${auth.login}.`);
      } else if (auth.authenticated && !auth.allowed) {
        setStatus(`GitHub connected as ${auth.login}, but expected ${auth.allowedLogin}.`);
      } else {
        setStatus('GitHub not connected. Use GitHub Login to enable committing.');
      }
    } catch (error) {
      setStatus('GitHub OAuth backend not available yet. Deploy through Cloudflare Pages Functions.');
    }
  }

  document.addEventListener('DOMContentLoaded', initGitHubOAuthControls);
  setTimeout(initGitHubOAuthControls, 250);
})();
