const esc = (value = "") => String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value || "";
}

function setHref(id, value) {
  const node = document.getElementById(id);
  if (node) node.href = value || "#";
}

function cleanData(data = {}) {
  return {
    site: data.site || {},
    nav: data.nav || {},
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

function render(rawData) {
  const data = cleanData(rawData);
  document.title = data.site.title || document.title || "GB Engineering Tools";

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

function boot() {
  if (looksUsable(window.GB_SITE_DATA)) {
    render(window.GB_SITE_DATA);
    return;
  }
  console.warn("No usable data found. Leaving static fallback HTML visible.");
}

boot();
