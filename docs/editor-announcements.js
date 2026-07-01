(() => {
  const esc = (value = "") => String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
  const SITE_DATA_URL = "data/site.js";
  const DEFAULT_ANNOUNCEMENTS = { enabled:false, label:"Update", marquee:true, speedSeconds:28, items:[{ text:"New update is live.", url:"#", linkText:"View details" }] };
  let siteData = clone(window.GB_SITE_DATA || {});
  let state = normalize(siteData.announcements);
  let authed = false;

  function clone(value) { return JSON.parse(JSON.stringify(value || {})); }
  function normalize(config = {}) {
    return {
      enabled: config.enabled === true,
      label: String(config.label || DEFAULT_ANNOUNCEMENTS.label),
      marquee: config.marquee !== false,
      speedSeconds: Math.max(10, Math.min(90, Number(config.speedSeconds) || DEFAULT_ANNOUNCEMENTS.speedSeconds)),
      items: Array.isArray(config.items) && config.items.length
        ? config.items.map(item => ({ text:String(item.text || ""), url:String(item.url || ""), linkText:String(item.linkText || "") }))
        : clone(DEFAULT_ANNOUNCEMENTS.items)
    };
  }
  function parseSiteJs(text) {
    const match = String(text || "").match(/window\.GB_SITE_DATA\s*=\s*([\s\S]*?);\s*$/);
    if (!match) throw new Error("Could not read site.js data.");
    return JSON.parse(match[1]);
  }
  function toSiteJs(data) { return "window.GB_SITE_DATA = " + JSON.stringify(data, null, 2) + ";\n" + loaderSnippet(); }
  function loaderSnippet() {
    return "if (location.pathname.endsWith('/editor.html') || location.pathname.endsWith('/editor')) {\n" +
      "  if (!document.querySelector('link[data-announcement-css]')) { const l=document.createElement('link'); l.rel='stylesheet'; l.href='announcements.css?v=20260701announcements'; l.dataset.announcementCss='true'; document.head.appendChild(l); }\n" +
      "  if (!document.querySelector('script[data-announcement-editor]')) { const s=document.createElement('script'); s.src='editor-announcements.js?v=20260701announcements'; s.dataset.announcementEditor='true'; document.body.appendChild(s); }\n" +
      "}\n";
  }
  async function fetchLatest() {
    const response = await fetch(`${SITE_DATA_URL}?sync=${Date.now()}`, { cache:"no-store" });
    if (!response.ok) throw new Error(`Could not load latest site.js: ${response.status}`);
    return parseSiteJs(await response.text());
  }
  function setStatus(message) {
    const node = document.getElementById("announcementEditorStatus");
    if (node) node.textContent = message || "";
  }
  function setDisabled(disabled) {
    document.querySelectorAll("#announcementEditor input,#announcementEditor button").forEach(el => {
      if (el.id === "announcementReloadBtn") return;
      el.disabled = disabled;
    });
  }
  function ensureStylesheet() {
    if (document.querySelector("link[data-announcement-css]")) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "announcements.css?v=20260701announcements";
    link.dataset.announcementCss = "true";
    document.head.appendChild(link);
  }
  function previewHtml() {
    const items = state.items.filter(item => item.text.trim());
    if (!state.enabled || !items.length) return '<div class="announcement-help">Preview hidden because the bar is disabled or empty.</div>';
    const itemHtml = items.map(item => {
      const link = item.url ? ` <a class="announcement-link" href="#" onclick="return false">${esc(item.linkText || "View")}</a>` : "";
      return `<span class="announcement-item">${esc(item.text)}${link}</span>`;
    }).join('<span class="announcement-sep" aria-hidden="true">•</span>');
    return `<div id="announcementHost"><div class="announcement-bar"><div class="announcement-inner"><span class="announcement-label">${esc(state.label || "Update")}</span><div class="announcement-messages ${state.marquee ? "announcement-marquee" : ""}" style="--announcement-speed:${state.speedSeconds}s"><div class="announcement-track">${itemHtml}</div></div></div></div></div>`;
  }
  function render() {
    const root = document.getElementById("announcementEditor");
    if (!root) return;
    root.innerHTML = `
      <div class="card">
        <div class="section-head" style="margin-bottom:12px">
          <h2>Top announcements</h2>
          <p>below update-live notice</p>
        </div>
        <p class="announcement-help">Use this for the public top bar/marquee. The automatic “Update is live” refresh banner has priority and renders above this.</p>
        <div class="announcement-form-grid">
          <label>Label <input data-ann-field="label" value="${esc(state.label)}"></label>
          <label>Speed <input data-ann-field="speedSeconds" type="number" min="10" max="90" value="${esc(state.speedSeconds)}"></label>
          <label class="check"><input data-ann-field="enabled" type="checkbox" ${state.enabled ? "checked" : ""}> Show bar</label>
          <label class="check"><input data-ann-field="marquee" type="checkbox" ${state.marquee ? "checked" : ""}> Marquee scroll</label>
        </div>
        <div class="announcement-rows">
          ${state.items.map((item, index) => rowHtml(item, index)).join("")}
        </div>
        <div class="actions" style="margin-top:12px">
          <button class="edit-btn" id="announcementAddBtn" type="button">+ Add announcement</button>
          <button class="edit-btn" id="announcementReloadBtn" type="button">Reload latest</button>
          <button class="edit-btn primary" id="announcementSaveBtn" type="button">Save announcements</button>
        </div>
        <div class="preview-label">Preview</div>
        <div class="announcement-preview">${previewHtml()}</div>
        <div class="editor-status" id="announcementEditorStatus"></div>
      </div>
    `;
    wire();
    setDisabled(!authed);
    const reload = document.getElementById("announcementReloadBtn");
    if (reload) reload.disabled = false;
  }
  function rowHtml(item, index) {
    return `
      <div class="announcement-admin-row" data-ann-row="${index}">
        <div class="row-title">Announcement ${index + 1}</div>
        <label>Text <input data-ann-item="text" data-index="${index}" value="${esc(item.text)}"></label>
        <label>URL <input data-ann-item="url" data-index="${index}" value="${esc(item.url)}"></label>
        <label>Link text <input data-ann-item="linkText" data-index="${index}" value="${esc(item.linkText)}"></label>
        <button class="mini-btn bad" data-ann-remove="${index}" type="button">Remove</button>
      </div>
    `;
  }
  function wire() {
    document.querySelectorAll("[data-ann-field]").forEach(input => {
      input.oninput = () => {
        const key = input.dataset.annField;
        state[key] = input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) || 28 : input.value;
        render();
        setStatus("Unsaved announcement changes.");
      };
    });
    document.querySelectorAll("[data-ann-item]").forEach(input => {
      input.oninput = () => {
        const index = Number(input.dataset.index);
        state.items[index][input.dataset.annItem] = input.value;
        setStatus("Unsaved announcement changes.");
      };
    });
    document.querySelectorAll("[data-ann-remove]").forEach(button => {
      button.onclick = () => {
        state.items.splice(Number(button.dataset.annRemove), 1);
        if (!state.items.length) state.items.push({ text:"", url:"", linkText:"" });
        render();
        setStatus("Unsaved announcement changes.");
      };
    });
    document.getElementById("announcementAddBtn").onclick = () => {
      state.items.push({ text:"New update announcement", url:"#", linkText:"View details" });
      render();
      setStatus("Unsaved announcement changes.");
    };
    document.getElementById("announcementReloadBtn").onclick = loadLatest;
    document.getElementById("announcementSaveBtn").onclick = save;
  }
  async function loadLatest() {
    setStatus("Loading latest site.js...");
    try {
      siteData = await fetchLatest();
      state = normalize(siteData.announcements);
      render();
      setStatus("Loaded latest announcement settings.");
    } catch (error) {
      setStatus(error.message);
    }
  }
  async function save() {
    if (!authed) {
      setStatus("Sign in with GitHub first.");
      return;
    }
    setStatus("Saving announcements...");
    try {
      const latest = await fetchLatest();
      latest.announcements = normalize(state);
      const response = await fetch("/api/github/save-site", {
        method:"POST",
        credentials:"include",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ content:toSiteJs(latest), message:"Update site announcements from editor" })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "GitHub save failed");
      siteData = latest;
      window.GB_SITE_DATA = latest;
      setStatus("Announcements saved: " + String(result.commit || "").slice(0, 7) + ".");
      if (typeof window.loadLatestSiteData === "function") window.loadLatestSiteData();
    } catch (error) {
      setStatus(error.message);
    }
  }
  async function checkAuth() {
    try {
      const response = await fetch("/api/github/me", { credentials:"include" });
      const result = await response.json();
      authed = !!(result.authenticated && result.allowed);
      render();
      setStatus(authed ? "Announcement editor unlocked." : "Sign in with GitHub to edit announcements.");
    } catch (error) {
      authed = false;
      render();
      setStatus("OAuth backend not available yet.");
    }
  }
  function inject() {
    if (document.getElementById("announcementEditor")) return;
    ensureStylesheet();
    const style = document.createElement("style");
    style.textContent = `
      #announcementEditor{position:relative;z-index:3;width:min(1100px,calc(100% - 32px));margin:18px auto 0}
      #announcementEditor .card{padding:18px}
      .announcement-form-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:12px 0}
      .announcement-form-grid label,.announcement-admin-row label{display:grid;gap:5px;color:var(--muted);font-family:var(--mono);font-size:11px}
      .announcement-form-grid input,.announcement-admin-row input{width:100%;border:1px solid var(--line);background:#0e100f;color:var(--text);padding:8px;font-size:12px}
      .announcement-form-grid .check{display:flex;align-items:center;gap:8px;border:1px solid var(--line);background:#101210;padding:8px}
      .announcement-admin-row{border:1px solid var(--line);background:rgba(255,255,255,.02);padding:12px;margin-top:8px;display:grid;grid-template-columns:1.2fr 1fr 140px auto;gap:8px;align-items:end}
      .announcement-admin-row .row-title{grid-column:1/-1;color:var(--accent);font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:.08em}
      .announcement-preview{margin-top:8px;border:1px solid var(--line);background:#0e100f;overflow:hidden}
      @media(max-width:820px){.announcement-form-grid,.announcement-admin-row{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
    const root = document.createElement("section");
    root.id = "announcementEditor";
    const editorTop = document.querySelector(".editor-top");
    if (editorTop) editorTop.insertAdjacentElement("afterend", root);
    else document.body.prepend(root);
    render();
    checkAuth();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inject);
  else inject();
})();
