"""Create a GitHub upload archive containing the application and maintenance files."""

import argparse
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    files = [ROOT / name for name in ("index.html", "README.md", ".gitignore", "test.cjs")]
    for folder in ("dist", "scripts", "tests"):
        files.extend(path for path in (ROOT / folder).rglob("*")
                     if path.is_file() and "__pycache__" not in path.parts
                     and not path.name.endswith((".pyc", ".inspect.ndjson")))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.output, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(files):
            archive.write(path, path.relative_to(ROOT).as_posix())
    print(f"Packaged {len(files)} files: {args.output.name}")


if __name__ == "__main__":
    main()
