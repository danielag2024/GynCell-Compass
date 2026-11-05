"""Check source fidelity and release archiving using a disposable repository."""

import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("import_workbook", ROOT / "scripts/import_workbook.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
current = json.loads((ROOT / "dist/release-manifest.json").read_text())["current"]
workbooks = list((ROOT / "dist/downloads").glob("*.xlsx"))
assert len(workbooks) == 1, "The current release should distribute its one original workbook"
workbook = workbooks[0]
data, fixture, issues = module.import_data(workbook, current, "11/2026", "2026-11-05")
assert hashlib.sha256(workbook.read_bytes()).hexdigest() == data["masterSha256"]
assert len(fixture) == 3
assert all("primary" not in name.lower() for name in fixture)
for collection, config in data["collections"].items():
    source = fixture[config["sourceSheet"]]
    assert len(config["records"]) == len(source["rows"]) - 1
    headers = source["rows"][0]
    for record, row in zip(config["records"], source["rows"][1:]):
        assert record["_raw"] == {title: row.get(column, "") for column, title in headers.items()}
        assert all(ref["sourceIds"] for ref in record["_references"])
assert data["fieldMaps"]["cervical"]["G"] == "Similarity to primary tumor"
assert data["fieldMaps"]["ovarian"]["G"] == "Authentication/contamination status"
assert data["fieldMaps"]["endometrial"]["G"] == "Histotype"
with tempfile.TemporaryDirectory(prefix="gyncell-release-") as temporary:
    target = Path(temporary) / "repository"
    shutil.copytree(ROOT, target, ignore=shutil.ignore_patterns(".git", ".openai", "__pycache__"))
    old_data = (target / "dist/data.js").read_bytes()
    old_book = (target / "dist" / data["masterFile"]).read_bytes()
    next_workbook = Path(temporary) / "Master_209901.xlsx"
    shutil.copyfile(workbook, next_workbook)
    command = [sys.executable, str(target / "scripts/import_workbook.py"), str(next_workbook),
               "--version", "2099-01", "--label", "01/2099", "--updated", "2099-01-01"]
    subprocess.run(command, check=True, capture_output=True)
    archived = target / "dist/releases" / current
    assert (archived / "data.js").read_bytes() == old_data
    assert (archived / data["masterFile"]).read_bytes() == old_book
    assert 'src="../../releases.js"' in (archived / "index.html").read_text(encoding="utf-8")
    manifest = json.loads((target / "dist/release-manifest.json").read_text())
    assert manifest["current"] == "2099-01"
    assert [p.name for p in (target / "dist/downloads").glob("*.xlsx")] == [next_workbook.name]
    assert next(item for item in manifest["releases"] if item["id"] == current)["url"] == f"releases/{current}/index.html"
    subprocess.run(command, check=True, capture_output=True)
    assert (archived / "data.js").read_bytes() == old_data
    assert not (target / "dist/releases/2099-01").exists()
print("PASS: original records, complete workbook hash, collection-specific references, and archive-preserving future releases.")
