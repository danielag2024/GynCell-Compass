# GynCell Compass

A browser-based selector for cervical, ovarian and uterine cell lines. The current release is **11/2026**, updated 5 November 2026, with 46 cervical, 154 ovarian and 136 uterine entries.

## Open the tool

Open `index.html` in a browser, or serve the repository with any static web server. No build step, account, database or runtime dependency is required for the website. The repository-root index opens `dist/index.html`.

For GitHub Pages, publish the repository root from the chosen branch. Extract the upload archive first and upload its contents, including the `dist` folder. Do not upload the ZIP as the website itself.

## Use

Choose a collection and mark characteristics as Required or Preferred. Required criteria filter candidates; Preferred criteria prioritize candidates in category order. Expand a card to inspect detailed annotations and numbered sources. The decision tree can be exported as PDF or JPEG, and the candidate list as CSV.

The small **Download master Excel** button is at the bottom right. It downloads the complete, unchanged source workbook, including all cell-line sheets, source sheets and primary-tumour similarity calculation sheets.

## Data provenance

Only these six sheets feed the application:

- `Cervical Cancer_cell lines` and `Cervical Cancer_sources`
- `Ovarian Cancer_cell lines` and `Ovarian Cancer_sources`
- `Uterine Cancer_cell lines` and `Uterine Cancer_sources`

Similarity labels are imported directly from the cell-line sheets. The separate similarity calculation sheets are not used to calculate or override them. Every original cell value and source row is retained in release data. A SHA-256 hash identifies the distributed workbook.

Reference letters are derived independently from each collection’s headers. G denotes similarity for cervical, authentication for ovarian, and histotype for uterine. Explicit author names in the ovarian reassessment field also identify sources for that field. Inline letter markers become numbered links where the assignment can be resolved; unassigned markers remain visible. Citation-year differences remain in the original reference labels. The source bibliography retains the full supplied citations.

Filter labels group related descriptions without replacing them. Debated ovarian histotypes have their own option. Not available and Not applicable remain distinct, and missing tumorigenicity data do not imply absence of tumor formation. The documented OMC-2 tumorigenicity correction is retained separately from its original cells.

## Update the existing release

Python 3.10 or later is needed only to import workbooks; the importer uses the standard library. Node.js is used only for automated checks.

To update the current release from a revised integrated workbook:

```sh
python scripts/import_workbook.py "Revised_Master.xlsx" --version 2026-11 --label 11/2026
node test.cjs
python tests/import_workbook.py
```

The importer updates the current data, source fixture, release registry and workbook download. It does not edit the original input workbook. Keep sheet names and meaningful column headers; reference-letter mappings are derived from those headers. An optional `--report` path writes citation questions for maintainers outside the website.

Upload or commit the changed files to the same repository. There is no need to delete the repository or replace its history. GitHub Desktop can show the changed files and publish them as a new commit. Routine code fixes can be committed directly without changing the release label.

## Publish a new release

For a new dated release, use a new ID and visible label, for example:

```sh
python scripts/import_workbook.py "Master_202701.xlsx" --version 2027-01 --label 01/2027
node test.cjs
python tests/import_workbook.py
```

Before replacing current data, the importer copies the existing website assets and original workbook to `dist/releases/2026-11/`. It then registers the new release as the default. The version selector uses the shared registry, so current and archived pages can switch between releases. Archived data and downloads remain available and are not overwritten by subsequent updates.

Commit the changed files and the new archive directory to the existing repository. The public website address stays the same; the default page opens the newest release. Older releases retain their own addresses under `dist/releases/`.

Release IDs use `YYYY-MM`. Do not reuse an archived ID for a new release. The import tests verify archiving and version switching in a disposable copy without modifying real releases.

## Validate and package

```sh
node test.cjs
python tests/import_workbook.py
python scripts/package.py GynCell-Compass-upload.zip
```

Checks cover source-cell fidelity, collection-specific field mappings, selection behavior, inline citations, release routing, decision-tree export layout, the original workbook hash and historical-release preservation. Packaging includes only application files, the workbook, tests, import/package utilities and this documentation. Git metadata, local hosting configuration, caches and diagnostic files are excluded.

## Project files

- `dist/index.html`, `app.js`, `model.js`: interface and selection logic.
- `dist/data.js`: generated data for the current release.
- `dist/style.css`, `theme.css`: layout and collection colors.
- `dist/tree-export.js`: PDF and JPEG decision-tree exports.
- `dist/version.js`, `releases.js`, `release-manifest.json`: release navigation and registry.
- `dist/downloads/`: unchanged original workbook for the current release.
- `dist/releases/`: self-contained historical releases, created when a new release is imported.
- `scripts/import_workbook.py`: reproducible import and release archiving.
- `scripts/package.py`: clean upload archive.
- `test.cjs`, `tests/`: application, source-integrity and release-workflow checks.
