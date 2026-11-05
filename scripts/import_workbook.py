"""Import the integrated master workbook using only the Python standard library.

Only the explicitly named cell-line and source sheets feed the application.
The complete, unchanged workbook is distributed as the release download.
"""

import argparse
from datetime import date
import hashlib
import json
from pathlib import Path
import re
import shutil
import unicodedata
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
COLLECTIONS = {
    "cervical": ("Cervical", "Cervical Cancer_cell lines", "Cervical Cancer_sources"),
    "ovarian": ("Ovarian", "Ovarian Cancer_cell lines", "Ovarian Cancer_sources"),
    "endometrial": ("Uterine", "Uterine Cancer_cell lines", "Uterine Cancer_sources"),
}
FIELD_NAMES = {
    "cell line": "Cell line", "disease category": "Disease category",
    "histotype": "Histotype", "disease stage": "Disease stage/grade",
    "hpv status": "HPV status", "origin/site": "Origin/site",
    "molecular subtype": "Molecular subtype", "treatment history": "Treatment history",
    "authentication": "Authentication/contamination status",
    "in vivo tumor": "In vivo tumor formation", "similarity": "Similarity to primary tumor",
    "suggested": "Suggested histotype / characterization",
    "other": "Other specifications", "references": "References",
}
AUTHOR_ALIASES = {
    "bergbakkker": "bergbakker", "vandenbergbakker": "bergbakker",
    "delrusso": "dellorusso", "quellet": "ouellet", "clyde": "dawe",
    "zunigamartinez": "martinez",
}


def normalized(text):
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", plain.lower())


def author_key(text):
    value = normalized(text)
    return AUTHOR_ALIASES.get(value, value)


def first_author(text):
    for prefix, name in {
        "Zuñiga Martinez": "Martinez", "David Gal": "Gal",
        "Gottfried E. Konecny": "Konecny", "Clyde J. Dawe": "Dawe",
        "Fritz Hölzel": "Hölzel", "van den Berg-Bakker": "Berg-Bakker",
        "da Silva": "da Silva",
    }.items():
        if text.startswith(prefix):
            return name
    return text.split()[0].rstrip(",;")


def read_workbook(path):
    sheets = {}
    with zipfile.ZipFile(path) as archive:
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            strings = ["".join(t.text or "" for t in item.findall(".//s:t", NS))
                       for item in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("s:si", NS)]
        relationships = {item.attrib["Id"]: item.attrib["Target"]
                         for item in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))}
        for sheet in ET.fromstring(archive.read("xl/workbook.xml")).findall("s:sheets/s:sheet", NS):
            name = sheet.attrib["name"]
            target = relationships[sheet.attrib[f"{{{REL}}}id"]]
            target = target.lstrip("/") if target.startswith("/") else "xl/" + target
            rows, numbers = [], []
            if name not in {title for _, cells, sources in COLLECTIONS.values() for title in (cells, sources)}:
                continue
            for row in ET.fromstring(archive.read(target)).findall("s:sheetData/s:row", NS):
                values = {}
                for cell in row.findall("s:c", NS):
                    value = cell.find("s:v", NS)
                    text = value.text or "" if value is not None else "".join(t.text or "" for t in cell.findall(".//s:t", NS))
                    if cell.attrib.get("t") == "s":
                        text = strings[int(text)]
                    if text:
                        values[re.sub(r"\d", "", cell.attrib["r"])] = text
                if values:
                    rows.append(values)
                    numbers.append(int(row.attrib["r"]))
            sheets[name] = {"name": name, "rows": rows, "rowNumbers": numbers}
    return sheets


def field_name(header):
    for prefix, name in FIELD_NAMES.items():
        if header.lower().startswith(prefix):
            return name
    raise ValueError(f"Unrecognized column header: {header}")


def import_data(path, version, label, updated):
    sheets = read_workbook(path)
    sources, by_identity, issues = [], {}, []
    for _, _, source_sheet in COLLECTIONS.values():
        for row in sheets[source_sheet]["rows"][1:]:
            text = row.get("A", "").strip()
            if not text:
                continue
            pmid = re.search(r"PMID:\s*(\d+)", text)
            doi = re.search(r"https?://doi.org/([^\s]+)", text) or re.search(r"\bdoi:\s*([^\s]+)", text, re.I)
            url = f"https://pubmed.ncbi.nlm.nih.gov/{pmid[1]}/" if pmid else "https://doi.org/" + doi[1].rstrip(".,") if doi else ""
            identity = url or normalized(text)
            if identity in by_identity:
                existing = by_identity[identity]
                if source_sheet not in existing["documents"]:
                    existing["documents"].append(source_sheet)
                continue
            year = re.search(r"\(((?:19|20)\d{2})\)", text) or re.search(r"\b((?:19|20)\d{2})\b", text)
            source = {"id": "source-" + hashlib.sha256(identity.encode()).hexdigest()[:12],
                      "author": first_author(text), "year": year[1] if year else "",
                      "text": text, "url": url, "documents": [source_sheet]}
            sources.append(source)
            by_identity[identity] = source
    resource = {"id": "source-cellosaurus", "author": "Cellosaurus", "year": "",
                "text": "Cellosaurus. Cell-line knowledge resource.", "url": "https://www.cellosaurus.org/",
                "documents": ["Cell-line sheet references"]}
    sources.append(resource)

    def resolve(lead, year, cell_name, source_sheet):
        if lead == "Cellosaurus":
            return [resource["id"]], ""
        candidates = [s for s in sources if author_key(s["author"]) == author_key(lead)]
        local = [s for s in candidates if source_sheet in s["documents"]]
        candidates = local or candidates
        exact = [s for s in candidates if year and s["year"] == year]
        choices = exact or candidates
        if len(choices) > 1:
            specific = [s for s in choices if re.search(r"\b" + re.escape(cell_name) + r"\b", s["text"], re.I)]
            if len(specific) == 1:
                choices = specific
        if len(choices) != 1:
            return [], "No unique matching full citation"
        chosen = choices[0]
        epub = re.findall(r"Epub\s+((?:19|20)\d{2})", chosen["text"])
        note = f"Reference year {year}; full citation year {chosen['year']}" if year and chosen["year"] != year and year not in epub else ""
        return [chosen["id"]], note

    collections, maps, fixture = {}, {}, {}
    ref_pattern = re.compile(
        r"(?:[\wÀ-\u024f'-]+\s+){0,2}[\wÀ-\u024f'-]+,?\s+et\s+al\s*\.?\s*(?:\(?\s*(?:19|20)\d{2,3}\s*\)?)?"
        r"|[\wÀ-\u024f'-]+(?:\s+and\s+[\wÀ-\u024f'-]+)?\s*\(\s*(?:19|20)\d{2}\s*\)|Cellosaurus"
    )
    for key, (collection_label, cell_sheet, source_sheet) in COLLECTIONS.items():
        sheet = sheets[cell_sheet]
        headers = sheet["rows"][0]
        columns = {column: field_name(header) for column, header in headers.items()}
        maps[key] = {}
        for column, header in headers.items():
            for letter in re.findall(r"[\[(]\s*([A-Z])\s*[\])}]", header):
                maps[key][letter] = columns[column]
        records = []
        for index, row in enumerate(sheet["rows"][1:], 1):
            if not row.get("A"):
                continue
            record = {name: row.get(column, "") for column, name in columns.items()}
            name = re.sub(r"\.0$", "", record["Cell line"].strip())
            record.update({"Cell line": name, "Disease status": "Healthy cells" if re.search("healthy", record["Disease category"], re.I) else "Cancer cells",
                           "_collection": key, "_raw": {title: row.get(column, "") for column, title in headers.items()},
                           "_source": {"workbook": path.name, "sheet": cell_sheet, "row": sheet["rowNumbers"][index]},
                           "_corrections": []})
            if key == "endometrial" and name == "OMC-2" and re.fullmatch(r"yes,\s*subcutaneous", record["Similarity to primary tumor"].strip(), re.I):
                for field, corrected in [("In vivo tumor formation", "yes & no, subcutaneous"), ("Similarity to primary tumor", "NA")]:
                    record["_corrections"].append({"field": field, "original": record[field], "corrected": corrected,
                                                   "reason": "Previously established mixed tumor-formation outcomes; misplaced tumor text excluded from similarity."})
                    record[field] = corrected
            text = record["References"]
            starts = list(ref_pattern.finditer(text))
            parts = [text[match.start():starts[i + 1].start() if i + 1 < len(starts) else len(text)] for i, match in enumerate(starts)] if starts else [text]
            references = []
            for part in parts:
                part = part.strip(" ,;\n")
                if not part or part.lower() == "na":
                    continue
                tags = re.findall(r"[\[{]([A-Ka-k,\s]+)[\]}]", part)
                fields = list(dict.fromkeys(maps[key][letter] for letter in re.findall("[A-K]", " ".join(tags).upper()) if letter in maps[key]))
                short = re.sub(r"[\[{][A-Ka-k,\s]+[\]}]", "", part).strip(" ,;")
                lead = re.split(r",?\s+et\s+al|\s+and\s+|\s*\(", short)[0].strip()
                year_match = re.search(r"\b(?:19|20)\d{2}\b", short)
                if not year_match:
                    year_match = re.search(r"(?:19|20)\d{2}", short)
                ids, note = resolve(lead, year_match[0] if year_match else "", name, source_sheet)
                if note:
                    issues.append({"collection": key, "line": name, "reference": part, "issue": note})
                references.append({"label": short, "annotation": part, "fields": fields, "sourceIds": ids})
            reassessment = record.get("Suggested histotype / characterization", "")
            for group in re.findall(r"\(([^)]+)\)", reassessment):
                lead = re.split(r"\s+et\s+al", group)[0].strip()
                ids, _ = resolve(lead, "", name, source_sheet)
                if not ids:
                    continue
                existing = next((ref for ref in references if ref["sourceIds"] == ids), None)
                if existing:
                    if "Suggested histotype / characterization" not in existing["fields"]:
                        existing["fields"].append("Suggested histotype / characterization")
                else:
                    source = next(s for s in sources if s["id"] == ids[0])
                    references.append({"label": f"{source['author']} et al. ({source['year']})",
                                       "annotation": group, "fields": ["Suggested histotype / characterization"], "sourceIds": ids})
            record["_references"] = references
            records.append(record)
        collections[key] = {"label": collection_label, "records": records, "sourceFile": path.name,
                            "sourceSheet": cell_sheet, "sourceDocument": source_sheet}
        fixture[cell_sheet] = sheet
    data = {"version": version, "versionLabel": label, "updated": updated,
            "masterFile": "downloads/" + path.name,
            "masterSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "collections": collections, "sources": sources, "fieldMaps": maps}
    return data, fixture, issues


def archive_release(dist, previous, registry):
    destination = dist / "releases" / previous["version"]
    if destination.exists():
        raise ValueError("Archived release already exists; refusing to overwrite it")
    destination.mkdir(parents=True)
    for item in dist.iterdir():
        if item.name in {"releases", "releases.js", "release-manifest.json"}:
            continue
        if item.is_dir():
            shutil.copytree(item, destination / item.name)
        else:
            shutil.copy2(item, destination / item.name)
    page = destination / "index.html"
    page.write_text(page.read_text(encoding="utf-8").replace('src="releases.js"', 'src="../../releases.js"'), encoding="utf-8")
    for release in registry:
        if release["id"] == previous["version"]:
            release["url"] = f"releases/{previous['version']}/index.html"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--version", required=True, help="Release ID, e.g. 2026-11")
    parser.add_argument("--label", required=True, help="Visible label, e.g. 11/2026")
    parser.add_argument("--updated", default=date.today().isoformat())
    parser.add_argument("--report", type=Path, help="Optional maintainer-only citation report outside the website")
    args = parser.parse_args()
    if not re.fullmatch(r"\d{4}-\d{2}", args.version):
        parser.error("Release IDs must use YYYY-MM")
    date.fromisoformat(args.updated)
    dist = ROOT / "dist"
    data, fixture, issues = import_data(args.workbook, args.version, args.label, args.updated)
    manifest_path = dist / "release-manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"releases": []}
    registry = manifest["releases"]
    previous_path = dist / "data.js"
    previous = {"version": re.search(r'(?:"version"|version):\s*"([^" ]+)"', previous_path.read_text(encoding="utf-8"))[1]}
    old_master = re.search(r'(?:"masterFile"|masterFile):\s*"([^"]+)"', previous_path.read_text(encoding="utf-8"))
    if previous["version"] != args.version:
        if any(release["id"] == args.version for release in registry):
            raise ValueError("Use a new release ID; an existing archived release cannot become a new release")
        archive_release(dist, previous, registry)
    registry = [release for release in registry if release["id"] != args.version]
    registry.insert(0, {"id": args.version, "label": args.label, "url": "index.html"})
    manifest = {"current": args.version, "releases": registry}
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (dist / "releases.js").write_text(
        "window.COMPASS_RELEASES = " + json.dumps(registry, indent=2) + ";\n"
        'window.COMPASS_RELEASE_BASE = new URL(".", document.currentScript.src).href;\n', encoding="utf-8")
    previous_path.write_text("window.COMPASS_DATA = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")
    (ROOT / "tests" / "source-records.json").write_text(json.dumps(fixture, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    download = dist / data["masterFile"]
    download.parent.mkdir(exist_ok=True)
    if args.workbook.resolve() != download.resolve():
        shutil.copyfile(args.workbook, download)
    if old_master and old_master[1] != data["masterFile"]:
        old_download = dist / old_master[1]
        if old_download.parent.resolve() == download.parent.resolve() and old_download.exists():
            old_download.unlink()
    if args.report:
        args.report.write_text(json.dumps(issues, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"version": args.label, "cellLines": {key: len(cfg['records']) for key, cfg in data['collections'].items()},
                      "sources": len(data['sources']), "citationQuestions": len(issues), "masterSha256": data['masterSha256']}, indent=2))


if __name__ == "__main__":
    main()
