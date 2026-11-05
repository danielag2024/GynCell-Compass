const data = window.COMPASS_DATA,
  collections = data.collections,
  sourceById = Object.fromEntries(data.sources.map((s) => [s.id, s]));
const { fieldsFor, values, options, matches, select, unknown, isMissing } =
  Compass;
let collection = "cervical",
  config = collections[collection],
  records = config.records,
  criteria = [],
  current = [];
const saved = {},
  $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
function fresh() {
  return fieldsFor(collection).map(([id, key, label]) => ({
    id,
    key,
    label,
    mode: "required",
    selected: [],
  }));
}
function renderCriteria() {
  $("#criteria").innerHTML = criteria
    .map(
      (c, i) =>
        `<details class="criterion" ${c.selected.length ? "open" : ""} data-id="${c.id}"><summary><span class="step">${String(i + 1).padStart(2, "0")}</span><span>${esc(c.label)} ${c.selected.length ? `<em>${c.selected.length}</em>` : ""}</span><span class="chevron">⌄</span></summary><div class="criterionbody"><div class="controls"><select aria-label="${esc(c.label)} matching mode" data-mode="${c.id}"><option value="required" ${c.mode === "required" ? "selected" : ""}>Required</option><option value="preferred" ${c.mode === "preferred" ? "selected" : ""}>Preferred</option></select><span>Priority</span><button data-move="${i},-1" aria-label="Move ${esc(c.label)} up" ${i === 0 ? "disabled" : ""}>↑</button><button data-move="${i},1" aria-label="Move ${esc(c.label)} down" ${i === criteria.length - 1 ? "disabled" : ""}>↓</button></div><div class="choices">${options(
          records,
          c.id,
        )
          .map(
            (v) =>
              `<label><input type="checkbox" data-choice="${c.id}" value="${esc(v)}" ${c.selected.includes(v) ? "checked" : ""}><span>${esc(v)}</span></label>`,
          )
          .join("")}</div></div></details>`,
    )
    .join("");
}
function citationId(r, index) {
  return `cite-${collection}-${encodeURIComponent(r["Cell line"])}-${index}`;
}
function inlineSources(r, text) {
  const marker = /\[([A-Z](?:[A-Z,;\s]*))\]/g;
  let html = "",
    offset = 0;
  for (const match of String(text).matchAll(marker)) {
    html += esc(String(text).slice(offset, match.index));
    const fields = [...match[1].replace(/[^A-Z]/g, "")]
      .map((letter) => data.fieldMaps[collection]?.[letter])
      .filter(Boolean);
    const references = r._references
      .map((ref, index) => ({ ref, index }))
      .filter(({ ref }) => ref.fields.some((field) => fields.includes(field)));
    const mapped =
      fields.length &&
      fields.every((field) =>
        references.some(({ ref }) => ref.fields.includes(field)),
      );
    html += mapped
      ? `<sup class="source-numbers">[${references.map(({ ref, index }) => `<a href="#${esc(citationId(r, index))}" title="${esc(ref.label)}" aria-label="Source ${index + 1}: ${esc(ref.label)}">${index + 1}</a>`).join(", ")}]</sup>`
      : esc(match[0]);
    offset = match.index + match[0].length;
  }
  return html + esc(String(text).slice(offset));
}
function citations(r) {
  return r._references
    .map(
      (ref, index) =>
        `<li id="${esc(citationId(r, index))}"><span class="reference-label">${esc(ref.label)}</span>${
          ref.sourceIds.length
            ? ref.sourceIds
                .map((id) => {
                  const s = sourceById[id];
                  return `<p>${esc(s.text)}</p>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">Open source ↗</a>` : ""}`;
                })
                .join("")
            : ""
        }${ref.fields.length ? `<small class="evidence-fields">Linked fields: ${ref.fields.map(esc).join(" · ")}</small>` : ""}</li>`,
    )
    .join("");
}
function rawNote(r, c) {
  const v = String(r[c.key] ?? "").trim();
  if (isMissing(v) || /^not applicable$/i.test(v)) return "";
  const normalized = values(r, c.id).join(" / ");
  if (c.id === "originType" && !/^(primary|metastatic|metastasis)$/i.test(v))
    return v;
  if (
    [
      "hist",
      "origin",
      "treatment",
      "tumor",
      "similarity",
      "auth",
      "category",
    ].includes(c.id) &&
    v !== normalized
  )
    return v;
  return "";
}
function card(r, i) {
  const active = criteria.filter((c) => c.selected.length);
  const fields = fieldsFor(collection)
    .map(([id, key, label]) => ({ id, key, label }))
    .filter(
      (c) => c.id !== "category" || r["Disease status"] !== "Healthy cells",
    );
  if (collection === "ovarian")
    fields.splice(2, 0, {
      id: "reassessment",
      key: "Suggested histotype / characterization",
      label: "Suggested histotype / characterization",
    });
  if (collection !== "endometrial" && r["Disease status"] !== "Healthy cells")
    fields.unshift({
      id: "category",
      key: "Disease category",
      label: "Disease category",
    });
  return `<article class="card recordcard"><details class="record-details"><summary class="record-summary" aria-label="${esc(r["Cell line"])}: expand or collapse full record"><h3>${esc(r["Cell line"])}</h3></summary><p class="histotype">${esc(values(r, "hist")[0])}</p>${active.length ? `<div class="prefmatches">${active.map((c) => `<span class="${matches(r, c) ? "matched" : "unmatched"}">${matches(r, c) ? "✓" : "—"} ${esc(c.label)} · ${c.mode}</span>`).join("")}</div>` : ""}<dl>${fields
    .map((c) => {
      const selected = active.find((x) => x.id === c.id),
        note = rawNote(r, c);
      const evidence = r._references
        .map((ref, index) => ({ ref, index }))
        .filter(({ ref }) => ref.fields.includes(c.key));
      return `<div class="${selected ? (matches(r, selected) ? "selected-match" : "selected-miss") : ""}"><dt>${esc(c.label)}${selected ? `<small>${selected.mode === "required" ? "Required" : "Preferred"} ${matches(r, selected) ? "✓" : "—"}</small>` : ""}</dt><dd>${esc(values(r, c.id).join(" / "))}${evidence.length ? `<sup class="source-numbers">[${evidence.map(({ ref, index }) => `<a href="#${esc(citationId(r, index))}" title="${esc(ref.label)}" aria-label="Source ${index + 1}: ${esc(ref.label)}">${index + 1}</a>`).join(", ")}]</sup>` : ""}${note ? `<span class="modelnote">${inlineSources(r, note)}</span>` : ""}${c.id === "tumor" ? `<span class="modelnote">Implantation site: ${esc(values(r, "model").join(" / "))}</span>` : ""}</dd></div>`;
    })
    .join(
      "",
    )}${r["Other specifications"] && !/^(none|na)$/i.test(r["Other specifications"].trim()) ? `<div><dt>Other specifications</dt><dd>${inlineSources(r, r["Other specifications"])}</dd></div>` : ""}</dl><div class="inline-sources"><h4>Sources</h4><ol class="bibliography">${citations(r)}</ol></div></details></article>`;
}
function treeList(title, list, kind = "", showNames = true) {
  return `<div class="flow-node ${kind}"><div class="flow-title">${title ? esc(title) : `<span class="visually-hidden">${kind === "flow-keep" ? "Matching cell lines" : "Nonmatching cell lines"}</span>`} <b>${list.length}</b></div>${showNames ? `<p class="flow-names">${list.length ? list.map((r) => esc(r["Cell line"])).join(" · ") : "No cell lines"}</p>` : ""}</div>`;
}
function renderTree() {
  const active = criteria.filter((c) => c.selected.length),
    query = $("#search").value.trim();
  let pool = [...records],
    html = `<div class="flow-start">${treeList(`${config.label} collection`, pool, "flow-root", false)}</div>`;
  const branch = (
    label,
    yes,
    no,
    preferred = false,
    chosen = "",
    others = "",
  ) =>
    `<div class="flow-step ${preferred ? "flow-preferred" : ""}"><div class="flow-question">${esc(label)}</div><div class="flow-fork"><div class="flow-outcome">${treeList(chosen, yes, "flow-keep")}</div><div class="flow-outcome">${treeList(others, no, preferred ? "flow-neutral" : "flow-excluded")}</div></div><div class="flow-return" aria-hidden="true"></div>${preferred ? '<p class="flow-merge">Both groups remain · ranking only</p>' : ""}</div>`;
  if (query) {
    const found = select(pool, [], query),
      set = new Set(found);
    html += branch(
      "Search",
      found,
      pool.filter((r) => !set.has(r)),
      false,
      `Search · ${query}`,
      "Other search results",
    );
    pool = found;
  }
  for (const c of active) {
    const yes = pool.filter((r) => matches(r, c)),
      no = pool.filter((r) => !matches(r, c));
    const otherOptions = options(records, c.id).filter(
      (value) => !c.selected.includes(value),
    );
    html += branch(
      c.label,
      yes,
      no,
      c.mode === "preferred",
      `${c.mode === "required" ? "Required" : "Preferred"} · ${c.selected.join(" / ")}`,
      otherOptions.join(" / ") || "No other options",
    );
    if (c.mode === "required") pool = yes;
  }
  if (!active.length && !query)
    html +=
      '<p class="hint flow-empty">Choose a characteristic above to grow your decision tree.</p>';
  html += `<div class="flow-finish">${treeList("Selected cell lines", current, "flow-final")}</div>`;
  $("#decision-tree").innerHTML = html;
}
function render() {
  current = select(records, criteria, $("#search").value);
  $("#count").textContent = current.length;
  $("#ranklabel").textContent = criteria.some(
    (c) => c.mode === "preferred" && c.selected.length,
  )
    ? "ranked by your priorities"
    : "to explore";
  const active = criteria.filter((c) => c.selected.length);
  $("#path").innerHTML = active.length
    ? `<div class="pathroot">${esc(config.label)} collection <span>${records.length}</span></div>` +
      active
        .map(
          (c) =>
            `<div class="pathnode"><small>${esc(c.label)} · ${c.mode}</small><strong>${c.selected.map(esc).join(" / ")}</strong></div>`,
        )
        .join("")
    : '<div class="pathintro">Your selection path will grow here. Open a category to begin.</div>';
  $("#summary").textContent =
    `${active.filter((c) => c.mode === "required").length} requirements · ${active.filter((c) => c.mode === "preferred").length} preferences`;
  $("#cards").innerHTML = current.length
    ? current.map(card).join("")
    : '<div class="empty"><h3>No cell lines meet these requirements.</h3><p>Change a requirement to a preference, or remove a choice. Missing and conflicting values do not satisfy a positive requirement.</p><button id="emptyreset">Clear all choices</button></div>';
  renderTree();
}
function reset() {
  criteria = fresh();
  $("#search").value = "";
  renderCriteria();
  render();
}
function presets() {
  const choices =
    collection === "cervical"
      ? [
          ["squamous", "Squamous cell carcinoma · HPV16+"],
          ["adeno", "Adenocarcinoma · HPV18+"],
          ["tumors", "In vivo tumorigenicity · squamous cell carcinoma"],
        ]
      : collection === "endometrial"
        ? [
            ["mmrd", "MMRd · adenocarcinoma"],
            ["serous", "p53abn · papillary serous"],
            ["tumors", "Reported in vivo tumorigenicity"],
          ]
        : [
            ["hgsoc-similarity", "HGSOC · Very high tumor similarity"],
            ["clear-tumors", "Clear cell · Tumor formation in mice"],
            ["hgsoc-tumors", "HGSOC · Tumor formation in mice"],
          ];
  $(".presets").hidden = !choices.length;
  $(".presets").innerHTML =
    "<span>Try a research question</span>" +
    choices
      .map(([id, text]) => `<button data-preset="${id}">${esc(text)}</button>`)
      .join("");
}
function changeCollection(key) {
  if (key === collection) return;
  saved[collection] = { criteria, query: $("#search").value };
  collection = key;
  config = collections[key];
  records = config.records;
  criteria = saved[key]?.criteria || fresh();
  $("#search").value = saved[key]?.query || "";
  document.body.dataset.collection = key;
  document
    .querySelectorAll("button[data-collection]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.collection === key)),
    );
  $("footer>span").textContent =
    `GynCell Compass · ${config.label} · ${data.versionLabel} · Updated ${new Date(data.updated + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}`;
  document.title = `GynCell Compass — ${config.label} cell line selector`;
  presets();
  renderCriteria();
  render();
}
$("#criteria").addEventListener("change", (e) => {
  if (e.target.dataset.choice) {
    const c = criteria.find((c) => c.id === e.target.dataset.choice);
    c.selected = [
      ...e.target.closest(".choices").querySelectorAll("input:checked"),
    ].map((x) => x.value);
  }
  if (e.target.dataset.mode)
    criteria.find((c) => c.id === e.target.dataset.mode).mode = e.target.value;
  render();
});
$("#criteria").addEventListener("click", (e) => {
  const b = e.target.closest("[data-move]");
  if (!b) return;
  const [i, d] = b.dataset.move.split(",").map(Number);
  if (i + d < 0 || i + d >= criteria.length) return;
  [criteria[i], criteria[i + d]] = [criteria[i + d], criteria[i]];
  renderCriteria();
  render();
});
$(".presets").addEventListener("click", (e) => {
  const id = e.target.closest("[data-preset]")?.dataset.preset;
  if (!id) return;
  reset();
  const set = (key, selection) => {
    criteria.find((c) => c.id === key).selected = selection;
  };
  if (id === "squamous") {
    set("hist", ["Squamous cell carcinoma"]);
    set("hpv", ["HPV16+"]);
  }
  if (id === "adeno") {
    set("hist", ["Adenocarcinoma"]);
    set("hpv", ["HPV18+"]);
  }
  if (id === "mmrd") {
    set("molecular", ["MMRd"]);
    set("hist", ["Adenocarcinoma"]);
  }
  if (id === "serous") {
    set("molecular", ["p53abn"]);
    set("hist", ["Papillary serous"]);
  }
  if (id === "hgsoc-similarity") {
    set("hist", ["HGSOC"]);
    set("similarity", ["Very high"]);
  }
  if (id === "clear-tumors") {
    set("hist", ["Clear cell"]);
    set("tumor", ["Yes"]);
  }
  if (id === "hgsoc-tumors") {
    set("hist", ["HGSOC"]);
    set("tumor", ["Yes"]);
  }
  if (id === "tumors") {
    set("tumor", ["Yes"]);
    if (collection === "cervical") set("hist", ["Squamous cell carcinoma"]);
  }
  renderCriteria();
  render();
});
$("#cards").addEventListener("click", (e) => {
  if (e.target.id === "emptyreset") reset();
});
$("#search").addEventListener("input", render);
$("#reset").onclick = reset;
document
  .querySelectorAll("button[data-collection]")
  .forEach((b) => (b.onclick = () => changeCollection(b.dataset.collection)));
$("#export").onclick = () => {
  const keys = [
    ...new Set(
      records.flatMap((r) => Object.keys(r).filter((k) => !k.startsWith("_"))),
    ),
  ];
  const cell = (v) => {
    let text = String(v ?? "");
    if (/^[=+@\t\r-]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  const csv =
    "\uFEFF" +
    [keys, ...current.map((r) => keys.map((k) => r[k] ?? ""))]
      .map((row) => row.map(cell).join(","))
      .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `gyncell-${data.version}-${collection}-selection.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("#master-download").href = data.masterFile;
$("#master-download").download = data.masterFile.split("/").at(-1);
document.querySelectorAll("button[data-collection]").forEach((button) => {
  button.querySelector("span").textContent =
    `${collections[button.dataset.collection].records.length} cell lines`;
});
criteria = fresh();
$("footer>span").textContent =
  `GynCell Compass · ${config.label} · ${data.versionLabel} · Updated ${new Date(data.updated + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}`;
presets();
renderCriteria();
render();
