# NCS Local Form Auto-Filler

This repository contains a fully local browser app for preparing accountability and return/sanitation forms from saved CSV sources. It now also includes the Codex MCP protocol scaffold at the repository root so startup inspection, bounded test execution, screenshots, and workspace tooling are available before feature work starts.

## App Runtime

- No backend, API, auth, telemetry, cloud sync, or external server is required for the app itself.
- Open [index.html](/C:/NCS/index.html) directly in a browser to use the form tool.
- Saved CSV sources stay in the browser through IndexedDB with localStorage fallback.
- Third-party browser assets are vendored under [assets/vendor](/C:/NCS/assets/vendor).

## Codex Protocols

- Root protocol files live in [package.json](/C:/NCS/package.json), [mcp-schema.json](/C:/NCS/mcp-schema.json), [bootstrap.ps1](/C:/NCS/bootstrap.ps1), and [.mcp](/C:/NCS/.mcp).
- Run `powershell -ExecutionPolicy Bypass -File .\bootstrap.ps1` to install Node.js if needed, install dependencies, and run the protocol syntax checks.
- Run `npm run doctor` before deeper work.
- Run `npm run bridge` to start the local streamable HTTP MCP endpoint at `http://127.0.0.1:7331/mcp`.
- Run `npm run probe` to confirm the exposed MCP tools.
- Run `npm test` for the existing Node-based regression suite.

## CSV Sources

The app keeps the existing four-source lookup behavior:

- `ITSM Asset Master Tracker`
- `ITSM Task Assignment`
- `New Hire Attendance`
- `Test Device`

Recommended filenames should still clearly identify the source type so automatic source detection stays predictable.

## Supported Search Keys

- Employee ID
- Full employee name
- Asset tag
- Serial number
- IMEI for test-device flows

Return mode still supports multiple asset identifiers in one search.

## Constraints Preserved

- Print layouts, print markup contract, and print rendering behavior are unchanged.
- The 4-source auto-vlookup behavior, matching precedence, and resulting field population are unchanged for the same CSV inputs and user actions.
- Positions and titles remain hardcoded in behavior; editable person-name defaults remain prefilled.

## Known Limits

- Source data is stored in the browser, so very large CSV files may exceed browser storage limits.
- Source-role mismatches now warn clearly, but the lookup workflow still uses the existing operational parser and source precedence rules.
