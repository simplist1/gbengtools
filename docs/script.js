const LOCAL_KEY = "sadecki_autocad_tools_datajs_v1";

let data = null;
let activeCategory = "apps";
let adminMode = false;

const el = (id) => document.getElementById(id);
const content = el("content");

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function field(form, name) {
  return form.querySelector(`[name="${name}"]`);
}

function uid() {
  return "item_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

function isValidData(obj) {
  return !!(
    obj &&
    typeof obj === "object" &&
    obj.site &&
    obj.categories &&
    obj.categories.apps &&
    obj.categories.scripts &&
    Array.isArray(obj.categories.apps.subcategories) &&
    Array.isArray(obj.categories.scripts.subcategories) &&
    Array.isArray(obj.items)
  );
}

function makeDataJs(obj) {
  return "window.SADECKI_TOOLS_DATA = " + JSON.stringify(obj, null, 2) + ";\n";
}

function loadData() {
  try {
    const saved = localStorage.getItem(LOCAL_KEY);

    if (saved && saved !== "null") {
      const parsed = JSON.parse(saved);
      if (isValidData(parsed)) data = parsed;
    }

    if (!isValidData(data) && isValidData(window.SADECKI_TOOLS_DATA)) {
      data = clone(window.SADECKI_TOOLS_DATA);
    }

    if (!isValidData(data)) {
      throw new Error("data.js is missing or invalid.");
    }

    saveLocal();
    applySiteSettings();
    populateForms();
    render();
  } catch (err) {
    console.error(err);
    content.innerHTML = `
      <div class="empty">
        Website data could not load. Make sure <b>data.js</b> is in the same folder as index.html.
      </div>
    `;
  }
}

function saveLocal() {
  if (!isValidData(data)) return;
  localStorage.setItem(LOCAL_KEY, JSON.stringify(data, null, 2));
}

function applySiteSettings() {
  document.title = data.site.title || "Sadecki AutoCAD Tools & Scripts";
  document.querySelector("h1").textContent = data.site.title || "Sadecki AutoCAD Tools & Scripts";
  el("subtitle").textContent = data.site.subtitle || "";
  el("githubLink").href = data.site.githubUrl || "#";

  const form = el("siteSettingsForm");
  field(form, "siteTitle").value = data.site.title || "";
  field(form, "subtitle").value = data.site.subtitle || "";
  field(form, "githubUrl").value = data.site.githubUrl || "";
}

function getCategoryData(category) {
  return data.categories[category];
}

function populateForms() {
  const form = el("itemForm");
  const categorySelect = field(form, "itemCategory");
  const subcategorySelect = field(form, "itemSubcategory");

  categorySelect.innerHTML = `
    <option value="apps">Apps</option>
    <option value="scripts">Scripts</option>
  `;

  categorySelect.value = activeCategory;
  refreshSubcategoryOptions();
  categorySelect.onchange = refreshSubcategoryOptions;

  function refreshSubcategoryOptions() {
    const selectedCategory = categorySelect.value;
    const subs = getCategoryData(selectedCategory).subcategories || [];

    subcategorySelect.innerHTML = subs
      .map((sub) => `<option value="${escapeHtml(sub.name)}">${escapeHtml(sub.name)}</option>`)
      .join("");
  }
}

function render() {
  const search = el("searchInput").value.trim().toLowerCase();
  const categoryData = getCategoryData(activeCategory);

  const html = (categoryData.subcategories || []).map((sub) => {
    const items = data.items
      .filter((item) => item.category === activeCategory && item.subcategory === sub.name)
      .filter((item) => {
        if (!search) return true;
        return [
          item.name,
          item.version,
          item.description,
          item.fileType,
          item.tags,
          item.releaseUrl,
          item.downloadUrl
        ].join(" ").toLowerCase().includes(search);
      });

    return `
      <section class="subcategory">
        <div class="subcategory-header">
          <div>
            <h2 class="subcategory-title">${escapeHtml(sub.name)}</h2>
            <div class="subcategory-count">${items.length} item${items.length === 1 ? "" : "s"}</div>
          </div>
          ${adminMode ? `<button type="button" onclick="deleteSubcategory('${activeCategory}', '${escapeAttr(sub.name)}')">Remove Subcategory</button>` : ""}
        </div>

        ${items.length ? renderTable(items) : `<div class="empty">No downloads in this subcategory yet.</div>`}
      </section>
    `;
  }).join("");

  content.innerHTML = html || `<div class="empty">No subcategories yet.</div>`;
}

function renderTable(items) {
  return `
    <table class="download-table">
      <thead>
        <tr>
          <th style="width: 28%;">Name</th>
          <th>Description</th>
          <th style="width: 190px;">Download</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(renderRow).join("")}
      </tbody>
    </table>
  `;
}

function renderRow(item) {
  const downloadUrl = item.downloadUrl || item.releaseUrl || "#";
  const releaseUrl = item.releaseUrl || item.downloadUrl || "#";

  return `
    <tr>
      <td>
        <div class="tool-name">${escapeHtml(item.name)}</div>
        <div class="meta">
          ${item.version ? escapeHtml(item.version) : ""}
          ${item.version && item.fileType ? " | " : ""}
          ${item.fileType ? escapeHtml(item.fileType) : ""}
          ${item.tags ? `<br>${escapeHtml(item.tags)}` : ""}
        </div>
      </td>
      <td>
        <div class="desc">${escapeHtml(item.description || "")}</div>
      </td>
      <td class="actions">
        <a class="button-link" href="${escapeAttr(downloadUrl)}" target="_blank" rel="noopener">Download</a>
        <a class="button-link" href="${escapeAttr(releaseUrl)}" target="_blank" rel="noopener">Release</a>
        <div class="edit-actions">
          <button type="button" onclick="editItem('${item.id}')">Edit</button>
          <button type="button" onclick="deleteItem('${item.id}')">Remove</button>
        </div>
      </td>
    </tr>
  `;
}

function openEditor() {
  adminMode = !adminMode;
  document.body.classList.toggle("admin-mode", adminMode);
  el("adminPanel").classList.toggle("hidden", !adminMode);
  el("adminToggle").textContent = adminMode ? "Close Editor" : "Editor";
  render();
}

function editItem(id) {
  const item = data.items.find((x) => x.id === id);
  if (!item) return;

  const form = el("itemForm");
  el("itemFormTitle").textContent = "Edit Download Row";

  field(form, "editingId").value = item.id;
  field(form, "itemCategory").value = item.category;
  field(form, "itemCategory").dispatchEvent(new Event("change"));
  field(form, "itemSubcategory").value = item.subcategory;
  field(form, "itemName").value = item.name || "";
  field(form, "itemVersion").value = item.version || "";
  field(form, "itemDescription").value = item.description || "";
  field(form, "itemReleaseUrl").value = item.releaseUrl || "";
  field(form, "itemDownloadUrl").value = item.downloadUrl || "";
  field(form, "itemFileType").value = item.fileType || "";
  field(form, "itemTags").value = item.tags || "";

  window.scrollTo({ top: el("adminPanel").offsetTop - 10, behavior: "smooth" });
}

function deleteItem(id) {
  if (!confirm("Remove this row?")) return;
  data.items = data.items.filter((item) => item.id !== id);
  saveLocal();
  render();
}

function deleteSubcategory(category, subcategory) {
  const hasItems = data.items.some((item) => item.category === category && item.subcategory === subcategory);

  if (hasItems) {
    alert("Remove or move all rows in this subcategory first.");
    return;
  }

  if (!confirm(`Remove "${subcategory}"?`)) return;

  data.categories[category].subcategories = data.categories[category].subcategories
    .filter((sub) => sub.name !== subcategory);

  saveLocal();
  populateForms();
  render();
}

function resetItemForm() {
  const form = el("itemForm");
  form.reset();
  field(form, "editingId").value = "";
  field(form, "itemCategory").value = activeCategory;
  field(form, "itemCategory").dispatchEvent(new Event("change"));
  el("itemFormTitle").textContent = "Add Download Row";
}

function downloadFile(filename, content, type = "text/javascript") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function escapeAttr(value = "") {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    tab.classList.add("active");
    activeCategory = tab.dataset.category;
    populateForms();
    render();
  });
});

el("searchInput").addEventListener("input", render);
el("adminToggle").addEventListener("click", openEditor);

el("siteSettingsForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.currentTarget;

  data.site.title = field(form, "siteTitle").value.trim();
  data.site.subtitle = field(form, "subtitle").value.trim();
  data.site.githubUrl = field(form, "githubUrl").value.trim();

  saveLocal();
  applySiteSettings();
  render();
  alert("Settings saved locally. Export data.js to make it permanent.");
});

el("subcategoryForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.currentTarget;

  const category = field(form, "mainCategory").value;
  const name = field(form, "subcategoryName").value.trim();

  if (!name) return;

  const exists = data.categories[category].subcategories.some(
    (sub) => sub.name.toLowerCase() === name.toLowerCase()
  );

  if (exists) {
    alert("That subcategory already exists.");
    return;
  }

  data.categories[category].subcategories.push({ name });
  form.reset();
  saveLocal();
  populateForms();
  render();
});

el("itemForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.currentTarget;

  const editingId = field(form, "editingId").value;

  const item = {
    id: editingId || uid(),
    category: field(form, "itemCategory").value,
    subcategory: field(form, "itemSubcategory").value,
    name: field(form, "itemName").value.trim(),
    version: field(form, "itemVersion").value.trim(),
    description: field(form, "itemDescription").value.trim(),
    releaseUrl: field(form, "itemReleaseUrl").value.trim(),
    downloadUrl: field(form, "itemDownloadUrl").value.trim(),
    fileType: field(form, "itemFileType").value.trim(),
    tags: field(form, "itemTags").value.trim()
  };

  if (!item.subcategory) {
    alert("Add or select a subcategory first.");
    return;
  }

  if (editingId) {
    data.items = data.items.map((x) => x.id === editingId ? item : x);
  } else {
    data.items.push(item);
  }

  saveLocal();
  activeCategory = item.category;

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.category === activeCategory);
  });

  resetItemForm();
  render();
});

el("cancelEdit").addEventListener("click", resetItemForm);

el("exportDataJs").addEventListener("click", () => {
  if (!isValidData(data)) {
    alert("Cannot export because website data is invalid.");
    return;
  }

  downloadFile("data.js", makeDataJs(data));
});

el("copyDataJs").addEventListener("click", async () => {
  if (!isValidData(data)) {
    alert("Cannot copy because website data is invalid.");
    return;
  }

  try {
    await navigator.clipboard.writeText(makeDataJs(data));
    alert("Copied data.js content.");
  } catch {
    alert("Clipboard copy failed. Use Export data.js instead.");
  }
});

el("resetLocal").addEventListener("click", () => {
  if (!confirm("Clear edits saved in this browser and reload from data.js?")) return;
  localStorage.removeItem(LOCAL_KEY);
  location.reload();
});

loadData();
