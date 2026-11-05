const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  path = require("node:path");
const exp = require("../dist/tree-export.js");
const ctx = { window: {} };
for (const f of ["data.js", "model.js"])
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../dist", f), "utf8"),
    ctx,
  );
const data = ctx.window.COMPASS_DATA,
  m = ctx.window.Compass;
const records = data.collections.ovarian.records,
  criteria = [
    { id: "hist", selected: ["HGSOC"], mode: "required" },
    { id: "tumor", selected: ["Yes"], mode: "preferred" },
  ];
let pool = records;
const model = {
  collection: "Ovarian",
  version: "11/2026",
  date: "4 Nov 2026",
  root: { title: "Ovarian collection", count: records.length },
  steps: [],
  final: { title: "Selected cell lines", count: 0 },
};
for (const c of criteria) {
  const yes = pool.filter((r) => m.matches(r, c)),
    no = pool.filter((r) => !m.matches(r, c));
  model.steps.push({
    title: c.id,
    match: {
      title: c.mode + " · " + c.selected.join(" / "),
      count: yes.length,
      names: yes.map((r) => r["Cell line"]).join(" · "),
    },
    other: {
      title: "Other options",
      count: no.length,
      names: no.map((r) => r["Cell line"]).join(" · "),
    },
    preferred: c.mode === "preferred",
  });
  if (c.mode === "required") pool = yes;
}
const final = m.select(records, criteria);
model.final.count = final.length;
model.final.names = final.map((r) => r["Cell line"]).join(" · ");
const result = exp.makeSvg(model);
assert(result.height > 0);
for (const b of result.bounds) assert(b.bottom < result.height);
assert(result.svg.includes("Both groups retained"));
for (const r of records)
  assert(result.svg.includes(r["Cell line"].replace(/&/g, "&amp;")));
assert.equal(model.final.count, m.select(records, criteria).length);
const empty = exp.makeSvg({ ...model, steps: [] });
assert(empty.svg.includes("No selection criteria applied."));
const long = exp.makeSvg({
  ...model,
  steps: [
    {
      title: "All records",
      match: {
        title: "Required · all",
        count: records.length,
        names: records.map((r) => r["Cell line"]).join(" · "),
      },
      other: { title: "None", count: 0, names: "No cell lines" },
    },
  ],
});
assert(long.height > 300);
assert(long.bounds.every((b) => b.bottom < long.height));
const names = 'A & B <test> "quoted"';
assert(
  exp
    .makeSvg({ ...model, root: { title: names, count: 1 } })
    .svg.includes("A &amp; B &lt;test&gt; &quot;quoted&quot;"),
);
console.log(
  "PASS: complete tree layout, long names, escaped labels, branch counts, empty selections, preferred retention and full content bounds.",
);
