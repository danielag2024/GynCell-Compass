(function (root) {
  const unknown = "Not available",
    notApplicable = "Not applicable";
  const baseFields = [
    ["status", "Disease status", "Disease status"],
    ["hist", "Histotype", "Histotype"],
    ["hpv", "HPV status", "HPV status"],
    ["origin", "Origin/site", "Tissue of origin"],
    ["originType", "Disease stage/grade", "Disease stage"],
    ["treatment", "Treatment history", "Treatment history"],
    [
      "similarity",
      "Similarity to primary tumor",
      "Similarity to primary tumors",
    ],
    ["tumor", "In vivo tumor formation", "In vivo tumorigenicity (mice)"],
    [
      "auth",
      "Authentication/contamination status",
      "Authentication / contamination status",
    ],
  ];
  function fieldsFor(collection) {
    if (collection === "ovarian")
      return baseFields.filter((x) => x[0] !== "hpv").map((x) => [...x]);
    if (collection !== "endometrial") return baseFields.map((x) => [...x]);
    return [
      baseFields[0],
      ["category", "Disease category", "Disease category"],
      baseFields[1],
      ["molecular", "Molecular subtype", "Molecular subtype"],
      ...baseFields.slice(3),
    ].map((x) => [...x]);
  }
  const keys = Object.fromEntries(
    [
      ...baseFields,
      ["category", "Disease category"],
      ["molecular", "Molecular subtype"],
      ["reassessment", "Suggested histotype / characterization"],
    ].map(([id, key]) => [id, key]),
  );
  function isMissing(value) {
    return (
      value == null ||
      /^(?:na|n\/a|not available)?$/i.test(String(value).trim())
    );
  }
  function capital(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
  function values(r, id) {
    let v = String(
      r[id === "model" ? "In vivo tumor formation" : keys[id]] ?? "",
    )
      .trim()
      .replace(/\s+/g, " ");
    if (/^not applicable$/i.test(v)) return [notApplicable];
    if (isMissing(v))
      return [
        r["Disease status"] === "Healthy cells" && id !== "auth"
          ? notApplicable
          : unknown,
      ];
    if (
      id === "category" &&
      (/uterine carcinosarcoma/i.test(v) ||
        (r._collection === "endometrial" &&
          /carcinosarcoma|\bMMMT\b/i.test(r.Histotype ?? "")))
    )
      return ["Uterine carcinosarcoma"];
    if (id === "auth")
      return /^no pass\b/i.test(v)
        ? ["No pass"]
        : /^pass\b/i.test(v)
          ? ["Pass"]
          : [unknown];
    if (id === "hist" && r._collection === "ovarian") {
      if (r["Disease status"] === "Healthy cells") return [notApplicable];
      if (/\bdebated\b/i.test(v)) return ["Debated"];
      if (/^other\b/i.test(v)) return ["Other"];
      if (/^mixed\b/i.test(v)) return ["Mixed"];
      if (/high[ -]grade|HGSOC/i.test(v) && /serous|HGSOC/i.test(v))
        return ["HGSOC"];
      if (/low[ -]grade|LGSOC/i.test(v) && /serous|LGSOC/i.test(v))
        return ["LGSOC"];
      if (/clear cell/i.test(v)) return ["Clear cell"];
      if (/endometrioid|endometroid/i.test(v)) return ["Endometrioid"];
      if (/mucinous|nucinous/i.test(v)) return ["Mucinous"];
      return ["Other"];
    }
    if (id === "hist") {
      if (
        /^other\b/i.test(v) ||
        /^(undifferentiated|serous\/poorly differentiated|adenocanthoma|carcinoma,\s*poorly differentiated|dedifferentiated carcinoma)$/i.test(
          v,
        )
      )
        return ["Other"];
      if (/carcinosarcoma|\bMMMT\b/i.test(v)) return ["Carcinosarcoma"];
      if (/sarcoma/i.test(v)) return ["Sarcoma"];
      if (/^adenocarcinoma\b/i.test(v)) return ["Adenocarcinoma"];
      if (/^adenosquamous(?: carcinoma)?\b/i.test(v))
        return ["Adenosquamous carcinoma"];
      return [capital(v.replace(/\s*,\s*/g, ", "))];
    }
    if (id === "origin" && /^ascit(?:es|ic fluid)$/i.test(v))
      return ["Ascites"];
    if (id === "origin" && /^ovaryu?(?:\b|,)/i.test(v)) return ["Ovary"];
    if (id === "origin" && /^fallopian tube\b/i.test(v))
      return ["Fallopian tube"];
    if (id === "origin" && /^uterus\b/i.test(v)) return ["Uterus"];
    if (id === "hpv")
      return v
        .split(/,\s*/)
        .map((x) =>
          /^HPV[−-]$/i.test(x) ? "HPV−" : /^HPV\d+$/i.test(x) ? x + "+" : x,
        );
    if (id === "treatment") {
      if (/^untreated/i.test(v)) return ["Untreated"];
      return /^(treated|chemoradiotherapy)\b/i.test(v)
        ? ["Treated"]
        : [unknown];
    }
    if (id === "tumor") {
      if (/yes\s*&\s*no/i.test(v)) return ["Mixed"];
      return /^yes\b/i.test(v)
        ? ["Yes"]
        : /^no\b/i.test(v)
          ? ["No"]
          : ["Needs review"];
    }
    if (id === "similarity")
      return /^(very high|high|medium|low)$/i.test(v)
        ? [capital(v.toLowerCase())]
        : ["Needs review"];
    if (id === "model") {
      const sites = [];
      if (/subcutan/i.test(v)) sites.push("Subcutaneous");
      if (/orthotopic/i.test(v)) sites.push("Orthotopic");
      if (/intrauterine/i.test(v)) sites.push("Intrauterine");
      if (/intraperitoneal/i.test(v)) sites.push("Intraperitoneal");
      else if (/peritoneal/i.test(v)) sites.push("Peritoneal");
      return sites.length ? sites : ["Site not specified"];
    }
    if (id === "originType")
      return /metasta/i.test(v)
        ? ["Metastatic origin"]
        : /primary/i.test(v)
          ? ["Primary origin"]
          : [unknown];
    return [id === "molecular" ? v : capital(v)];
  }
  function options(records, id) {
    const input =
      id === "category"
        ? records.filter((r) => r["Disease status"] !== "Healthy cells")
        : records;
    const all = [...new Set(input.flatMap((r) => values(r, id)))];
    const extra = [
      ...(all.includes("Needs review") ? ["Needs review"] : []),
      unknown,
      ...(all.includes(notApplicable) ? [notApplicable] : []),
    ];
    if (id === "status") return ["Healthy cells", "Cancer cells"];
    if (id === "similarity")
      return ["Very high", "High", "Medium", "Low", ...extra];
    if (id === "originType")
      return ["Primary origin", "Metastatic origin", ...extra];
    if (id === "molecular")
      return ["POLEmut", "MMRd", "p53abn", "NSMP", ...extra];
    if (id === "tumor")
      return [
        "Yes",
        "No",
        ...(records.some((r) => r._collection === "ovarian") &&
        !all.includes("Mixed")
          ? []
          : ["Mixed"]),
        ...extra,
      ];
    if (id === "treatment")
      return ["Untreated", "Treated", unknown, notApplicable];
    if (id === "hist" && records.some((r) => r._collection === "ovarian"))
      return [
        "HGSOC",
        "LGSOC",
        "Mucinous",
        "Clear cell",
        "Endometrioid",
        "Mixed",
        "Debated",
        "Other",
        ...(all.includes(unknown) ? [unknown] : []),
        ...(all.includes(notApplicable) ? [notApplicable] : []),
      ];
    if (id === "auth") return ["Pass", "No pass", ...extra];
    return all.sort((a, b) => {
      const rank = (v) =>
        v === notApplicable
          ? 10
          : id === "hpv" && /E6\/E7.*immortalized/i.test(v)
            ? 9
            : v === unknown
              ? 8
              : id === "hist" && v === "Other"
                ? 2
                : 0;
      return rank(a) - rank(b) || a.localeCompare(b);
    });
  }
  function matches(r, c) {
    return (
      !c.selected.length || c.selected.some((v) => values(r, c.id).includes(v))
    );
  }
  function select(records, criteria, query = "") {
    const q = query.trim().toLowerCase();
    const preferences = criteria.filter(
      (c) => c.mode === "preferred" && c.selected.length,
    );
    return records
      .filter(
        (r) =>
          (!q ||
            Object.entries(r).some(
              ([k, v]) =>
                !k.startsWith("_") && String(v).toLowerCase().includes(q),
            )) &&
          criteria.every((c) => c.mode !== "required" || matches(r, c)),
      )
      .sort((a, b) => {
        for (const c of preferences) {
          const d = Number(matches(b, c)) - Number(matches(a, c));
          if (d) return d;
        }
        return a["Cell line"].localeCompare(b["Cell line"]);
      });
  }
  const api = {
    unknown,
    notApplicable,
    fields: baseFields,
    fieldsFor,
    values,
    options,
    matches,
    select,
    isMissing,
  };
  root.Compass = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
