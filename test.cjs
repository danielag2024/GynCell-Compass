const assert = require("node:assert/strict"),
  vm = require("node:vm"),
  fs = require("node:fs"),
  path = require("node:path");
const root = __dirname,
  dist = path.join(root, "dist"),
  ctx = { window: {} };
for (const f of ["data.js", "model.js"])
  vm.runInNewContext(fs.readFileSync(path.join(dist, f), "utf8"), ctx);
const { collections, sources, fieldMaps } = ctx.window.COMPASS_DATA,
  m = ctx.window.Compass,
  c = (id, selected, mode = "required") => ({ id, selected, mode });
const release = ctx.window.COMPASS_DATA;
assert.match(release.version, /^\d{4}-\d{2}$/);
const input = JSON.parse(
  fs.readFileSync(path.join(root, "tests/source-records.json"), "utf8"),
);
for (const key of Object.keys(collections)) {
  const cfg = collections[key],
    sh = input[cfg.sourceSheet],
    headers = sh.rows[0];
  assert.equal(cfg.records.length, sh.rows.length - 1);
  assert.equal(
    m.select(cfg.records, [c("status", ["Healthy cells"])]).length,
    sh.rows.slice(1).filter((row) => /healthy/i.test(row.B)).length,
  );
  for (let i = 1; i < sh.rows.length; i++) {
    const expected = Object.fromEntries(
      Object.entries(headers).map(([col, title]) => [
        title,
        sh.rows[i][col] ?? "",
      ]),
    );
    assert.deepEqual(
      JSON.parse(JSON.stringify(cfg.records[i - 1]._raw)),
      expected,
    );
    assert.equal(cfg.records[i - 1]._source.row, sh.rowNumbers[i]);
  }
  for (const r of cfg.records)
    for (const ref of r._references) {
      for (const sid of ref.sourceIds)
        assert(sources.some((s) => s.id === sid));
      for (const field of ref.fields)
        assert(Object.values(fieldMaps[key]).includes(field));
    }
  for (const [id] of m.fieldsFor(key)) {
    const opts = m.options(cfg.records, id);
    if (opts.includes("Not applicable"))
      assert.equal(opts.at(-1), "Not applicable");
  }
}
assert.equal(
  m.fieldsFor("ovarian").some((f) => f[0] === "hpv"),
  false,
);
assert.equal(fieldMaps.ovarian.D, "Treatment history");
assert.equal(fieldMaps.endometrial.D, "In vivo tumor formation");
const ov = collections.ovarian.records,
  endo = collections.endometrial.records,
  cerv = collections.cervical.records;
assert(cerv.some((r) => r["Cell line"] === "SKOV6"));
for (const name of ["EN11", "EN1"])
  assert(endo.some((r) => r["Cell line"] === name));
assert.equal(
  m.values(
    endo.find((r) => r["Cell line"] === "OMC-2"),
    "tumor",
  )[0],
  "Mixed",
);
assert.equal(
  m.values(
    endo.find((r) => r["Cell line"] === "HTMMT"),
    "tumor",
  )[0],
  "No",
);
assert.equal(
  m.values(
    ov.find((r) => r["Cell line"] === "OVSAYO"),
    "hist",
  )[0],
  "Debated",
);
assert.equal(
  m.values(
    { _collection: "ovarian", Histotype: "Serous adenocarcinoma" },
    "hist",
  )[0],
  "Other",
);
assert.equal(
  m.values(
    cerv.find((r) => r["Cell line"] === "SKOV6"),
    "auth",
  )[0],
  "No pass",
);
const nodes = new Map();
function node(k) {
  if (!nodes.has(k))
    nodes.set(k, {
      innerHTML: "",
      value: "",
      textContent: "",
      dataset: {},
      events: {},
      addEventListener(e, fn) {
        this.events[e] = fn;
      },
      querySelector(s) {
        return node(k + s);
      },
      setAttribute(k, v) {
        this[k] = v;
      },
    });
  return nodes.get(k);
}
const tabs = Object.keys(collections).map((key) =>
  Object.assign(node("tab-" + key), { dataset: { collection: key } }),
);
ctx.Compass = m;
const bodySurface = Object.assign(node("body"), {
  dataset: { collection: "cervical" },
});
node("bodyspan").textContent = "Version";
ctx.document = {
  body: bodySurface,
  querySelector: node,
  querySelectorAll: (s) =>
    s === "button[data-collection]"
      ? tabs
      : s === "[data-collection]"
        ? [bodySurface, ...tabs]
        : [],
};
vm.runInNewContext(fs.readFileSync(path.join(dist, "app.js"), "utf8"), ctx);
assert.equal(node("#count").textContent, collections.cervical.records.length);
for (const key of ["ovarian", "endometrial", "cervical"]) {
  tabs.find((t) => t.dataset.collection === key).onclick();
  assert.equal(node("#count").textContent, collections[key].records.length);
  assert(node("#cards").innerHTML.includes("record-summary"));
  for (const article of node("#cards").innerHTML.matchAll(
    /<article[\s\S]*?<\/article>/g,
  )) {
    const html = article[0],
      ids = [...html.matchAll(/<li id="([^"]+)"/g)].map((x) => x[1]);
    for (const a of html.matchAll(/href="#([^"]+)"/g))
      assert(ids.includes(a[1]));
  }
}
tabs.find((t) => t.dataset.collection === "ovarian").onclick();
assert(
  node("#cards").innerHTML.includes("Suggested histotype / characterization"),
);
assert(!node("#criteria").innerHTML.includes("HPV status"));
vm.runInNewContext(
  "criteria.find(c=>c.id==='tumor').selected=['Yes'];render();",
  ctx,
);
assert.equal(
  node("#count").textContent,
  m.select(ov, [c("tumor", ["Yes"])]).length,
);
assert(node("#decision-tree").innerHTML.includes("flow-excluded"));
vm.runInNewContext(
  "criteria.find(c=>c.id==='tumor').mode='preferred';render();",
  ctx,
);
assert.equal(node("#count").textContent, ov.length);
assert(node("#decision-tree").innerHTML.includes("Both groups remain"));
assert(!node("#decision-tree").innerHTML.includes("current ranking"));
const picker = {
  innerHTML: "",
  value: "",
  addEventListener(type, fn) {
    this.change = fn;
  },
};
const routeContext = {
  window: {
    COMPASS_DATA: ctx.window.COMPASS_DATA,
    COMPASS_RELEASES: [
      { id: release.version, label: release.versionLabel, url: "index.html" },
    ],
    COMPASS_RELEASE_BASE: "https://example.org/GynCell-Compass/dist/",
  },
  URL,
  document: { querySelector: () => picker },
  location: { href: "" },
};
vm.runInNewContext(
  fs.readFileSync(path.join(dist, "version.js"), "utf8"),
  routeContext,
);
assert.equal(picker.value, release.version);
assert(picker.innerHTML.includes(release.versionLabel));
assert.equal((picker.innerHTML.match(/<option/g) || []).length, 1);
picker.change({ target: { value: release.version } });
assert.equal(routeContext.location.href, "");
vm.runInNewContext(
  "compassVersions.push({id:'future-test',label:'Future release',url:'versions/future/index.html'})",
  routeContext,
);
picker.change({ target: { value: "future-test" } });
assert.equal(
  routeContext.location.href,
  "https://example.org/GynCell-Compass/dist/versions/future/index.html",
);
assert(!fs.existsSync(path.join(dist, "versions")));
assert(fs.existsSync(path.join(dist, ctx.window.COMPASS_DATA.masterFile)));

console.log(
  `PASS: ${Object.values(collections).reduce((total, cfg) => total + cfg.records.length, 0)} source records and raw cells, ${sources.length} sources, field mappings, healthy controls, filters, citations, tree branches and release routing.`,
);

assert.equal(
  m.options(ov, "hist").join("|"),
  "HGSOC|LGSOC|Mucinous|Clear cell|Endometrioid|Mixed|Debated|Other|Not applicable",
);
assert(!m.options(ov, "tumor").includes("Mixed"));
assert(m.options(endo, "tumor").includes("Mixed"));
for (const cfg of Object.values(collections))
  assert.equal(
    m.options(cfg.records, "treatment").join("|"),
    "Untreated|Treated|Not available|Not applicable",
  );
assert.equal(
  m.values({ "Treatment history": "treated, carboplatin" }, "treatment")[0],
  "Treated",
);
assert.equal(
  m.values(
    { "Treatment history": "untreated, before chemoradiotherapy" },
    "treatment",
  )[0],
  "Untreated",
);
assert.equal(
  m.values({ "Treatment history": "multi-drug resistant" }, "treatment")[0],
  "Not available",
);
for (const site of ["Ascites", "ascitic fluid"])
  assert.equal(m.values({ "Origin/site": site }, "origin")[0], "Ascites");
for (const site of ["Ovary", "ovaryu", "Ovary, epithelium"])
  assert.equal(m.values({ "Origin/site": site }, "origin")[0], "Ovary");
assert(m.options(endo, "category").includes("Uterine carcinosarcoma"));
const cs = m.select(endo, [c("category", ["Uterine carcinosarcoma"])]);
assert.equal(cs.length, 13);
assert(cs.some((r) => r["Cell line"] === "HTMMT"));
assert(
  !m
    .select(endo, [c("category", ["Endometrial carcinoma"])])
    .some((r) => /carcinosarcoma|MMMT/i.test(r.Histotype)),
);
const treated = ov.find((r) => /^treated,/.test(r["Treatment history"]));
assert(treated);
vm.runInNewContext(
  "collection='ovarian';config=collections[collection];records=config.records;criteria=fresh();render();",
  ctx,
);
assert(node("#cards").innerHTML.includes(treated["Treatment history"]));
console.log(
  "PASS: separate uterine carcinosarcoma, ovarian histotype groups without grade inference, conditional Mixed option, four treatment filters with retained descriptions, harmonized ovarian/ascites origins.",
);

require("./tests/tree-export.cjs");

const debatedLines = ov.filter((r) => /\bdebated\b/i.test(r.Histotype));
assert(debatedLines.length > 0);
const debatedResults = m.select(ov, [c("hist", ["Debated"])]);
assert.deepEqual(
  debatedResults.map((r) => r["Cell line"]).sort(),
  debatedLines.map((r) => r["Cell line"]).sort(),
);
assert(
  m
    .select(ov, [c("hist", ["Other"])])
    .every((r) => !/\bdebated\b/i.test(r.Histotype)),
);
console.log(
  `PASS: ${debatedLines.length} debated ovarian histotypes filter separately from Other.`,
);

const inlineFixture = {
  "Cell line": "Citation test",
  _references: [
    { label: "Original source", fields: ["Histotype"], sourceIds: [] },
    {
      label: "Reassessment source",
      fields: ["Suggested histotype / characterization"],
      sourceIds: [],
    },
  ],
};
ctx.inlineFixture = inlineFixture;
const linkedNote = vm.runInNewContext(
  'inlineSources(inlineFixture, "Reassessment [I] // original [A] <script>")',
  ctx,
);
assert(linkedNote.includes("Reassessment <sup"));
assert(
  linkedNote.indexOf("Citation%20test-1") <
    linkedNote.indexOf("Citation%20test-0"),
);
assert(linkedNote.includes("&lt;script&gt;"));
ctx.cov413a = ov.find((r) => r["Cell line"] === "COV413A");
const originalNote = vm.runInNewContext(
  "inlineSources(cov413a, cov413a.Histotype)",
  ctx,
);
assert(!originalNote.includes("[I]"));
assert(!originalNote.includes("[A]"));
assert(originalNote.includes("cite-ovarian-COV413A-0"));
console.log(
  "PASS: inline letter markers resolve independently; unassigned markers remain visible and text stays escaped.",
);

const crypto = require("node:crypto");
assert.equal(
  crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(dist, release.masterFile)))
    .digest("hex"),
  release.masterSha256,
);
assert.equal(node("#master-download").href, release.masterFile);
const markup = fs.readFileSync(path.join(dist, "index.html"), "utf8");
assert(/<footer>[\s\S]*id="master-download"[\s\S]*<\/footer>/.test(markup));
assert.equal((markup.match(/id="master-download"/g) || []).length, 1);
assert(markup.includes('src="releases.js"'));
console.log("PASS: exact original workbook download and footer placement.");

tabs.find((tab) => tab.dataset.collection === "ovarian").onclick();
assert.equal(node(".presets").hidden, false);
for (const [id, selected] of [
  ["hgsoc-similarity", [c("hist", ["HGSOC"]), c("similarity", ["Very high"])]],
  ["clear-tumors", [c("hist", ["Clear cell"]), c("tumor", ["Yes"])]],
  ["hgsoc-tumors", [c("hist", ["HGSOC"]), c("tumor", ["Yes"])]],
]) {
  assert(node(".presets").innerHTML.includes(`data-preset="${id}"`));
  node(".presets").events.click({
    target: { closest: () => ({ dataset: { preset: id } }) },
  });
  assert.equal(node("#count").textContent, m.select(ov, selected).length);
  const actualCriteria = vm.runInNewContext(
    "criteria.filter(item => item.selected.length)",
    ctx,
  );
  assert.equal(actualCriteria.length, 2);
  for (const expected of selected) {
    const actual = actualCriteria.find((item) => item.id === expected.id);
    assert.equal(actual.mode, "required");
    assert.deepEqual(Array.from(actual.selected), expected.selected);
  }
}
console.log(
  "PASS: all three ovarian research-question presets apply the intended requirements and reset prior selections.",
);

assert.equal(node("bodyspan").textContent, "Version");
for (const tab of tabs) {
  assert.equal(
    tab.querySelector("span").textContent,
    `${collections[tab.dataset.collection].records.length} cell lines`,
  );
}
assert(/<span>Version<\/span\s*>/.test(markup));
console.log(
  "PASS: collection counts update only tab buttons; the header Version label remains unchanged.",
);
