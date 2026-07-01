const esc = (value = "") => String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
const SITE_DATA_URL = "data/site.js";
let activeSiteDataKey = "";
let updateNoticeShown = false;

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value || "";
}

function setHref(id, value) {
  const node = document.getElementById(id);
  if (node) node.href = value || "#";
}

function normalizeAnnouncements(config = {}) {
  const items = Array.isArray(config.items)
    ? config.items
        .map(item => ({
          text: String(item && item.text ? item.text : "").trim(),
          url: String(item && item.url ? item.url : "").trim(),
          linkText: String(item && item.linkText ? item.linkText : "").trim()
        }))
        .filter(item => item.text)
    : [];

  return {
    enabled: config.enabled === true,
    label: String(config.label || "Announcement").trim() || "Announcement",
    marquee: config.marquee !== false,
    speedSeconds: Math.max(10, Math.min(90, Number(config.speedSeconds) || 28)),
    items
  };
}

function cleanData(data = {}) {
  return {
    site: data.site || {},
    nav: data.nav || {},
    announcements: normalizeAnnouncements(data.announcements || {}),
    hero: data.hero || {},
    suitesSection: data.suitesSection || {},
    suites: Array.isArray(data.suites) ? data.suites : [],
    toolsSection: data.toolsSection || {},
    standalonePanel: data.standalonePanel || {},
    toolCatalog: data.toolCatalog || {},
    adminSection: data.adminSection || {}
  };
}

function looksUsable(data) {
  return !!(data && data.site && data.site.title && data.hero && data.hero.title && Array.isArray(data.suites) && data.suites.length);
}

function parseSiteJs(text) {
  const match = String(text || "").match(/window\.GB_SITE_DATA\s*=\s*([\s\S]*?);\s*$/);
  if (!match) throw new Error("Could not read site.js data.");
  return JSON.parse(match[1]);
}

async function fetchFreshSiteData() {
  const response = await fetch(`${SITE_DATA_URL}?sync=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load latest site.js: ${response.status}`);
  return parseSiteJs(await response.text());
}

function dataKey(data) {
  return JSON.stringify(cleanData(data || {}));
}

function clearUpdateNoticeOffset(bar, resizeHandler) {
  if (resizeHandler) window.removeEventListener("resize", resizeHandler);
  document.body.classList.remove("has-update-notice");
  document.documentElement.style.removeProperty("--update-notice-height");
  if (bar && bar.parentNode) bar.remove();
}

function showUpdateNotice() {
  if (updateNoticeShown) return;
  updateNoticeShown = true;

  const bar = document.createElement("div");
  bar.id = "updateNotice";
  bar.className = "update-notice";
  bar.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:20000;display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;padding:10px 14px;background:#e69b22;color:#171207;font-weight:800;font-family:Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.28)";
  bar.innerHTML = '<span>Update is live. Please refresh.</span><button type="button" id="refreshUpdateBtn" style="border:1px solid rgba(0,0,0,.35);background:#171207;color:#fff;padding:6px 10px;font-weight:800;cursor:pointer">Refresh</button><button type="button" id="dismissUpdateBtn" style="border:1px solid rgba(0,0,0,.35);background:transparent;color:#171207;padding:6px 10px;font-weight:800;cursor:pointer">Dismiss</button>';

  const syncOffset = () => document.documentElement.style.setProperty("--update-notice-height", `${bar.offsetHeight}px`);
  document.body.appendChild(bar);
  document.body.classList.add("has-update-notice");
  requestAnimationFrame(syncOffset);
  window.addEventListener("resize", syncOffset);

  bar.querySelector("#refreshUpdateBtn").onclick = () => location.reload();
  bar.querySelector("#dismissUpdateBtn").onclick = () => clearUpdateNoticeOffset(bar, syncOffset);
}

async function checkForUpdates() {
  try {
    const latest = await fetchFreshSiteData();
    if (looksUsable(latest) && activeSiteDataKey && dataKey(latest) !== activeSiteDataKey) showUpdateNotice();
  } catch (error) {
    console.warn("Update check failed.", error);
  }
}

function renderAnnouncements(rawConfig) {
  const host = document.getElementById("announcementHost");
  if (!host) return;

  const config = normalizeAnnouncements(rawConfig || {});
  if (!config.enabled || !config.items.length) {
    host.hidden = true;
    host.innerHTML = "";
    return;
  }

  const itemHtml = config.items.map(item => {
    const link = item.url ? ` <a class="announcement-link" href="${esc(item.url)}">${esc(item.linkText || "View")}</a>` : "";
    return `<span class="announcement-item">${esc(item.text)}${link}</span>`;
  }).join('<span class="announcement-sep" aria-hidden="true">•</span>');

  host.hidden = false;
  host.innerHTML = `
    <div class="announcement-bar" role="region" aria-label="${esc(config.label)}">
      <div class="announcement-inner">
        <span class="announcement-label">${esc(config.label)}</span>
        <div class="announcement-messages ${config.marquee ? "announcement-marquee" : ""}" style="--announcement-speed:${config.speedSeconds}s">
          <div class="announcement-track">${itemHtml}</div>
        </div>
      </div>
    </div>
  `;
}

function render(rawData) {
  const data = cleanData(rawData);
  document.title = data.site.title || document.title || "GB Engineering Tools";

  renderAnnouncements(data.announcements);

  setText("brandTitle", data.site.title);
  setText("brandSubtitle", data.site.subtitle);
  setHref("navGithub", data.site.githubUrl);
  setText("footerLeft", data.site.footerLeft);
  setText("footerRight", data.site.footerRight);

  setText("navSuites", data.nav.suites);
  setText("navTools", data.nav.tools);
  setText("navStandalone", data.nav.standalone);
  setText("navAdmin", data.nav.admin);
  setText("navGithub", data.nav.github);

  setText("heroKicker", data.hero.kicker);
  setText("heroTitle", data.hero.title);
  setText("heroBody", data.hero.body);
  setText("heroPrimary", data.hero.primaryButton);
  setText("heroSecondary", data.hero.secondaryButton);
  setText("heroThird", data.hero.thirdButton);
  setHref("heroPrimary", data.site.suitesUrl || "#suites");
  setHref("heroSecondary", data.site.standaloneUrl || data.standalonePanel.buttonUrl || "#standalone");
  setHref("heroThird", data.site.toolsUrl || "#tools");

  setText("suitesTitle", data.suitesSection.title);
  setText("suitesCaption", data.suitesSection.caption);
  setText("toolsTitle", data.toolsSection.title);
  setText("toolsCaption", data.toolsSection.caption);

  const suiteGrid = document.getElementById("suiteGrid");
  if (suiteGrid && data.suites.length) {
    suiteGrid.innerHTML = data.suites.map(suite => `
      <article class="card">
        <h3>${esc(suite.name)}</h3>
        <div class="sub">${esc(suite.subtitle)}</div>
        <p>${esc(suite.description)}</p>
        <div class="details">${(suite.tags || []).map(tag => `<span class="tag">${esc(tag)}</span>`).join("")}</div>
        <div class="actions">
          <a class="btn primary" href="${esc(suite.downloadUrl || "#")}">${esc(suite.downloadText || "Download")}</a>
          <a class="btn" href="${esc(suite.notesUrl || "#")}">${esc(suite.notesText || "Release Notes")}</a>
        </div>
      </article>
    `).join("");
  }

  setText("standaloneTitle", data.standalonePanel.title);
  setText("standaloneDescription", data.standalonePanel.description);
  setText("standaloneButton", data.standalonePanel.buttonText);
  setHref("standaloneButton", data.standalonePanel.buttonUrl || data.site.standaloneUrl);

  setText("toolCatalogTitle", data.toolCatalog.title);
  const toolList = document.getElementById("toolList");
  const rows = Array.isArray(data.toolCatalog.rows) ? data.toolCatalog.rows : [];
  if (toolList && rows.length) {
    toolList.innerHTML = rows.map(row => `
      <div class="tool-row">
        <strong>${esc(row.name)}</strong>
        <span>${esc(row.description)}</span>
      </div>
    `).join("");
  }

  setText("adminTitle", data.adminSection.title);
  setText("adminCaption", data.adminSection.caption);
  setText("adminNote", data.adminSection.note);
}

async function boot() {
  const fallback = window.GB_SITE_DATA;
  if (looksUsable(fallback)) {
    render(fallback);
    activeSiteDataKey = dataKey(fallback);
  }

  try {
    const latest = await fetchFreshSiteData();
    if (looksUsable(latest)) {
      window.GB_SITE_DATA = latest;
      render(latest);
      activeSiteDataKey = dataKey(latest);
    } else if (!looksUsable(fallback)) {
      console.warn("No usable data found. Leaving static fallback HTML visible.");
    }
  } catch (error) {
    if (!looksUsable(fallback)) console.warn("No usable data found. Leaving static fallback HTML visible.");
    console.warn("Fresh site.js load failed.", error);
  }

  setInterval(checkForUpdates, 60000);
}

boot();
