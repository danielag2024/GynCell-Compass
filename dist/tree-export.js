(function (root) {
  "use strict";
  const xml = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[c],
    );
  function wrap(text, width, measure) {
    const lines = [];
    let line = "";
    for (const word of String(text).split(/\s+/)) {
      if (!word) continue;
      const next = line ? line + " " + word : word;
      if (line && measure(next) > width) {
        lines.push(line);
        line = "";
      }
      if (measure(word) > width) {
        let part = "";
        for (const ch of word) {
          if (part && measure(part + ch) > width) {
            lines.push(part);
            part = "";
          }
          part += ch;
        }
        line = part;
      } else line = line ? line + " " + word : word;
    }
    if (line) lines.push(line);
    return lines;
  }
  function makeSvg(model, measure = (text) => String(text).length * 6.5) {
    const width = 1100,
      margin = 35,
      gap = 26,
      branchWidth = (width - 2 * margin - gap) / 2,
      center = width / 2;
    const palette = model.colors || {},
      accent = palette.accent || "#a44270",
      light = palette.light || "#f7e3ec",
      ink = palette.ink || "#492c40",
      line = palette.line || "#77586f";
    const parts = [],
      bounds = [];
    let y = 35;
    const text = (content, x, top, size = 13, color = ink, weight = 400) =>
      `<text x="${x}" y="${top}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${xml(color)}">${xml(content)}</text>`;
    const link = (d) =>
      parts.push(
        `<path d="${d}" fill="none" stroke="${xml(line)}" stroke-width="2"/>`,
      );
    function box(node, x, top, w, kind) {
      const title = wrap(node.title, w - 75, (t) => measure(t) * 1.05),
        names = wrap(node.names || "", w - 28, measure);
      const h =
        24 +
        Math.max(title.length, 1) * 18 +
        (names.length ? 12 + names.length * 17 : 0);
      const fill =
          kind === "question"
            ? accent
            : kind === "keep"
              ? light
              : kind === "excluded"
                ? "#eceaee"
                : "#ffffff",
        stroke = kind === "excluded" ? "#bcb6c1" : accent,
        color = kind === "question" ? "#ffffff" : ink;
      parts.push(
        `<rect x="${x}" y="${top}" width="${w}" height="${h}" rx="8" fill="${xml(fill)}" stroke="${xml(stroke)}" stroke-width="2"/>`,
      );
      title.forEach((t, i) =>
        parts.push(text(t, x + 14, top + 24 + i * 18, 13, color, 600)),
      );
      if (node.count !== undefined)
        parts.push(
          text(String(node.count), x + w - 43, top + 24, 13, color, 700),
        );
      if (names.length) {
        const base = top + 24 + Math.max(title.length, 1) * 18;
        parts.push(
          `<path d="M${x + 14} ${base - 3}H${x + w - 14}" stroke="${xml(stroke)}" stroke-opacity=".35"/>`,
        );
        names.forEach((t, i) =>
          parts.push(text(t, x + 14, base + 17 + i * 17, 12, color)),
        );
      }
      bounds.push({ top, bottom: top + h });
      return h;
    }
    parts.push(
      text("GynCell Compass · Decision tree", margin, y + 20, 24, ink, 700),
    );
    y += 49;
    parts.push(
      text(
        `${model.collection} · ${model.version} · ${model.date}`,
        margin,
        y,
        12,
      ),
    );
    y += 32;
    const rootWidth = 620;
    let h = box(model.root, center - rootWidth / 2, y, rootWidth, "root");
    y += h;
    if (!model.steps.length) {
      link(`M${center} ${y}v26`);
      y += 26;
      parts.push(text("No selection criteria applied.", margin, y + 15, 12));
      y += 35;
    }
    for (const step of model.steps) {
      link(`M${center} ${y}v24`);
      y += 24;
      h = box({ title: step.title }, center - 310, y, 620, "question");
      y += h;
      const fork = y + 18,
        top = y + 34,
        left = margin + branchWidth / 2,
        right = margin + branchWidth + gap + branchWidth / 2;
      link(`M${center} ${y}V${fork}M${left} ${top}V${fork}H${right}V${top}`);
      const lh = box(step.match, margin, top, branchWidth, "keep"),
        rh = box(
          step.other,
          margin + branchWidth + gap,
          top,
          branchWidth,
          "excluded",
        );
      const bottom = top + Math.max(lh, rh) + 16;
      link(`M${left} ${top + lh}V${bottom}H${center}V${bottom + 18}`);
      if (step.preferred) link(`M${right} ${top + rh}V${bottom}H${center}`);
      y = bottom + 18;
      if (step.preferred) {
        parts.push(
          `<rect x="${center - 155}" y="${y}" width="310" height="22" fill="#ffffff"/>`,
        );
        parts.push(
          text(
            "Both groups retained · preference affects order only",
            center - 148,
            y + 15,
            11,
          ),
        );
        y += 22;
      }
    }
    h = box(model.final, center - 310, y, 620, "final");
    y += h + 28;

    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${y}" viewBox="0 0 ${width} ${y}"><rect width="100%" height="100%" fill="white"/>${parts.join("")}</svg>`,
      width,
      height: y,
      bounds,
    };
  }
  function imagePdf(jpeg, width, height) {
    const enc = new TextEncoder(),
      chunks = [],
      offsets = [0];
    let length = 0;
    const add = (value) => {
      const data = typeof value === "string" ? enc.encode(value) : value;
      chunks.push(data);
      length += data.length;
    };
    const object = (id, body) => {
      offsets[id] = length;
      add(`${id} 0 obj\n`);
      add(body);
      add("\nendobj\n");
    };
    const pageWidth = Math.min(842, (14400 * width) / height),
      pageHeight = (pageWidth * height) / width;
    add("%PDF-1.4\n%GynCell\n");
    object(1, "<< /Type /Catalog /Pages 2 0 R >>");
    object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    object(
      3,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(3)} ${pageHeight.toFixed(3)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    );
    offsets[4] = length;
    add(
      `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    );
    add(jpeg);
    add("\nendstream\nendobj\n");
    const stream = `q\n${pageWidth.toFixed(3)} 0 0 ${pageHeight.toFixed(3)} 0 0 cm\n/Im0 Do\nQ\n`;
    object(
      5,
      `<< /Length ${enc.encode(stream).length} >>\nstream\n${stream}endstream`,
    );
    const start = length;
    add("xref\n0 6\n0000000000 65535 f \n");
    for (let i = 1; i <= 5; i++)
      add(String(offsets[i]).padStart(10, "0") + " 00000 n \n");
    add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);
    const result = new Uint8Array(length);
    let offset = 0;
    for (const c of chunks) {
      result.set(c, offset);
      offset += c.length;
    }
    return result;
  }
  function readTree() {
    const nodeInfo = (node) => {
      const label = node.querySelector(".flow-title"),
        count = label.querySelector("b").textContent.trim();
      let title = label.textContent.trim();
      if (title.endsWith(count)) title = title.slice(0, -count.length).trim();
      return {
        title,
        count,
        names: node.querySelector(".flow-names")?.textContent.trim() || "",
      };
    };
    const key = document.body.dataset.collection,
      data = root.COMPASS_DATA;
    const style = getComputedStyle(document.body);
    return {
      collection: data.collections[key].label,
      version: data.versionLabel || data.version,
      date: new Date().toLocaleDateString("en-GB", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
      colors: {
        accent: style.getPropertyValue("--green").trim(),
        light: style.getPropertyValue("--light").trim(),
        ink: style.getPropertyValue("--ink").trim(),
      },
      root: nodeInfo(document.querySelector("#decision-tree .flow-root")),
      steps: [...document.querySelectorAll("#decision-tree .flow-step")].map(
        (step) => ({
          title: step.querySelector(".flow-question").textContent.trim(),
          match: nodeInfo(
            step.querySelector(".flow-outcome:first-child .flow-node"),
          ),
          other: nodeInfo(
            step.querySelector(".flow-outcome:last-child .flow-node"),
          ),
          preferred: step.classList.contains("flow-preferred"),
        }),
      ),
      final: nodeInfo(document.querySelector("#decision-tree .flow-final")),
      key,
    };
  }
  async function exportTree(format) {
    const buttons = [
        document.querySelector("#tree-pdf"),
        document.querySelector("#tree-jpeg"),
      ],
      status = document.querySelector("#tree-export-status");
    buttons.forEach((b) => (b.disabled = true));
    status.textContent = "Preparing your decision tree…";
    let url;
    try {
      const model = readTree(),
        measureCanvas = document.createElement("canvas"),
        context = measureCanvas.getContext("2d");
      context.font = "12px Arial";
      const result = makeSvg(model, (t) => context.measureText(t).width);
      const scale = Math.min(
        2,
        16000 / result.height,
        Math.sqrt(48000000 / (result.width * result.height)),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(result.width * scale);
      canvas.height = Math.ceil(result.height * scale);
      url = URL.createObjectURL(
        new Blob([result.svg], { type: "image/svg+xml;charset=utf-8" }),
      );
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () =>
          reject(new Error("The tree image could not be created."));
        img.src = url;
      });
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const jpeg = await new Promise((resolve, reject) =>
        canvas.toBlob(
          (b) =>
            b
              ? resolve(b)
              : reject(
                  new Error(
                    "The tree is too large to export. Try fewer criteria.",
                  ),
                ),
          "image/jpeg",
          0.96,
        ),
      );
      const output =
        format === "pdf"
          ? new Blob(
              [
                imagePdf(
                  new Uint8Array(await jpeg.arrayBuffer()),
                  canvas.width,
                  canvas.height,
                ),
              ],
              { type: "application/pdf" },
            )
          : jpeg;
      const download = URL.createObjectURL(output),
        a = document.createElement("a");
      a.href = download;
      a.download = `gyncell-${model.key}-decision-tree-${new Date().toISOString().slice(0, 10)}.${format === "pdf" ? "pdf" : "jpg"}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(download), 10000);
      status.textContent = "Your decision tree has been exported.";
    } catch (error) {
      status.textContent = "Export failed. " + error.message;
    } finally {
      if (url) URL.revokeObjectURL(url);
      buttons.forEach((b) => (b.disabled = false));
    }
  }
  const api = { wrap, makeSvg, imagePdf };
  if (typeof module !== "undefined") module.exports = api;
  root.CompassTreeExport = api;
  if (typeof document !== "undefined") {
    document
      .querySelector("#tree-pdf")
      .addEventListener("click", () => exportTree("pdf"));
    document
      .querySelector("#tree-jpeg")
      .addEventListener("click", () => exportTree("jpeg"));
  }
})(typeof window !== "undefined" ? window : globalThis);
