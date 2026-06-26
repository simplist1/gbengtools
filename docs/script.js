const STORAGE_KEY = "gbengtools.siteData";

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

function render(rawData) {
  const data = cleanData(rawData);

  document.title = data.site.title || "GB Engineering Tools";

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

  setText("suitesTitle", data.suitesSection.title);
  setText("suitesCaption", data.suitesSection.caption);
  setText("toolsTitle", data.toolsSection.title);
  setText("toolsCaption", data.toolsSection.caption);

  const suiteGrid = document.getElementById("suiteGrid");
  if (suiteGrid) {
    suiteGrid.innerHTML = data.suites.map(suite => `
      <article class="card">
        <h3>${esc(suite.name)}</h3>
        <div class="sub">${esc(suite.subtitle)}</div>
        <p>${esc(suite.description)}</p>
        <div class="details">${(suite.tags || []).map(tag => `<span class="tag">${esc(tag)}</span>`).join("")}</div>
        <div class="actions">
          <a class="btn primary" href="${esc(suite.downloadUrl || "#")}" target="_blank" rel="noopener">${esc(suite.downloadText || "Download")}</a>
          <a class="btn" href="${esc(suite.notesUrl || "#")}" target="_blank" rel="noopener">${esc(suite.notesText || "Release Notes")}</a>
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
  if (toolList) {
    const rows = Array.isArray(data.toolCatalog.rows) ? data.toolCatalog.rows : [];
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

function getBrowserOverride() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    console.warn("Ignoring broken browser-saved site data", error);
    return null;
  }
}

fetch("data/site.json?cache=" + Date.now())
  .then(res => {
    if (!res.ok) throw new Error("Could not load data/site.json");
    return res.json();
  })
  .then(fileData => render(getBrowserOverride() || fileData))
  .catch(error => {
    console.error(error);
    document.body.insertAdjacentHTML("beforeend", '<div class="site"><section><div class="note">Could not load data/site.json.</div></section></div>');
  });
