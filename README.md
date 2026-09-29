# NCS-Automation

In-browser IT asset reconciliation and handover form generator with client-side CSV parsing, IndexedDB caching, and printable A4 layouts.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-brightgreen.svg)](https://mishaeloliva.github.io/NCS-Automation/)
[![CI](https://github.com/MishaelOliva/NCS-Automation/actions/workflows/ci.yml/badge.svg)](https://github.com/MishaelOliva/NCS-Automation/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/Tests-76%20Passing-success.svg)](https://github.com/MishaelOliva/NCS-Automation/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## What it does

- **Multi-source CSV ingestion**: Loads four operational spreadsheets (Asset Master Tracker, ITSM Task Assignments, New Hire Attendance, and Test Device tracker) directly in the browser without network upload.
- **Relational cross-referencing**: Resolves records across employee IDs, names, asset tags, serial numbers, hostnames, and IMEIs using local indexing and alias normalization.
- **Handover form generation**: Populates A4-formatted accountability receipts, return documents, and sanitization destruction records from a single search query.
- **Clipboard bridge**: Formats returned hardware details into 9-column tab-separated rows for pasting directly into tracking spreadsheets.

## Architecture / How it works

The application is written in vanilla JavaScript (ES6+), HTML5, and CSS3. It runs entirely inside the client browser sandbox without an external backend, database server, or cloud dependency.

```
+-----------------------------------------------------------+
|               Input CSV Sources (Drag & Drop)             |
|   Master Tracker | Task Assignments | Attendance | Devices|
+-----------------------------+-----------------------------+
                              |
                              v
+-----------------------------------------------------------+
|                  In-Browser Client Engine                 |
|                                                           |
|   1. Papaparse Normalizer (Header & Alias Mapping)        |
|   2. Local IndexedDB Cache (with localStorage fallback)   |
|   3. Multi-Key Resolution Index (Serial, Tag, ID, Name)   |
|   4. Reactive Form State & Persistent Signer Roster       |
+-----------------------------+-----------------------------+
                              |
                              v
+-----------------------------------------------------------+
|                      Outputs & Export                     |
|                                                           |
|   - IT Asset Accountability Form (A4 Landscape Print)     |
|   - IT Asset Return Form (A4 Landscape Print)             |
|   - Device Sanitization Record (A4 Landscape Print)       |
|   - Formatted TSV Row for Master Google Sheets Trackers   |
+-----------------------------------------------------------+
```

Because asset serials and employee rosters contain sensitive internal data, all parsing and joins execute strictly in local memory and browser storage.

## Screenshots

| IT Asset Accountability Form | Asset Return & Sanitation Form |
| :---: | :---: |
| ![Accountability Form](docs/screenshots/current-accountability-print.png) | ![Return Form](docs/screenshots/current-return-print.png) |

## Quick start

No Node server, build pipeline, or database setup is required to run the web application.

```bash
git clone https://github.com/MishaelOliva/NCS-Automation.git
cd NCS-Automation
```

Open `index.html` directly in any modern browser:

- On Windows: `Start-Process index.html`
- On macOS: `open index.html`
- On Linux: `xdg-open index.html`

You can also use the hosted version on GitHub Pages: [https://mishaeloliva.github.io/NCS-Automation/](https://mishaeloliva.github.io/NCS-Automation/)

## Usage with Sample Data

Sanitized demonstration datasets are provided in the `tests/fixtures/` directory:

1. In the sidebar under **Data sources**, drag and drop or select:
   - `tests/fixtures/master-tracker.csv`
   - `tests/fixtures/itsm-task-assignment.csv`
   - `tests/fixtures/new-hire-attendance.csv`
   - `tests/fixtures/test-device.csv`
2. In the search box, enter an asset tag (such as `lap-001`) or employee ID (`1001`).
3. The employee details, specifications, serial numbers, and signers populate into the active form preview.
4. Press `Ctrl + P` to view the single-page A4 print layout.

## Testing

The test suite runs using Node.js built-in test runner (`node --test`) and validates parsing, schema normalization, IndexedDB caching, edge cases, and print page split calculations:

```bash
npm test
```

76 tests run in approximately 0.5s with zero external test framework dependencies.

## Known limitations

- **Local browser storage**: Data and configured signer rosters reside in IndexedDB and `localStorage`. Clearing site data in browser settings resets cached records.
- **Schema conventions**: The parser handles standard column header variations, but completely novel spreadsheet column names require manual entry or mapping.
- **Viewport optimization**: The user interface and print styles are tuned for desktop displays and print dialogs; small mobile screens are not actively supported.

## License

This project is licensed under the [MIT License](LICENSE).

---
*Built by [Mishael Oliva](https://github.com/MishaelOliva) • [LinkedIn](https://linkedin.com/in/mishael-oliva)*
