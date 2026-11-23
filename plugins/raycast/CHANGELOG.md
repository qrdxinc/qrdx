# QRdx Changelog

## [Raycast Store Release] - {PR_MERGE_DATE}

### Changed

- First release in the Raycast Store.
- Uses Raycast API 2.13 and Raycast's standard keyboard shortcuts for copy, save, open and edit. The keys are the same as before.
- US English spelling in descriptions and hints.

### Fixed

- Pattern and template previews in the pickers are sharp. They were drawn at 64 px and stretched to fill the tiles.

## [1.2.0] - 2026-11-22

### Added

- **The newer shapes from `qrdx` 0.0.60:** 14 more body patterns (horizontal lines, liquid, classy, leaf, plus, hexagon, star, heart, random dots, mosaic, octagon and others), 14 more eye frames (including porthole, notch, plus, bud and bowl), 14 more eye centers (including leaf, drop, heart, flower and cushion) and the Dot Ring template. The pattern pickers, Generate QR with AI and the AI tool all offer them.

### Changed

- Uses `qrdx` 0.0.60 (was 0.0.47). The pattern and template lists now come from `qrdx`, so they follow its updates and leave out the shapes it has retired.
- Pattern previews are redrawn after a `qrdx` update. An eye frame's preview shows it with the center of the same name where `qrdx` has one, and with a round center otherwise.

## [1.1.0] - 2026-11-04

### Added

- **Open in QRdx Playground** action (⌘O) on a code's preview and on each saved code. It opens the full editor at qrdx.dev with the code's web address; other content, colors and patterns stay in Raycast.

## [1.0.0] - 2026-03-25

### Added

- **Generate QR** command — create customized QR codes with body patterns, corner styles, colors, decorative templates, and logo overlay
- **Saved QR Codes** command — browse, preview, edit, and export previously saved QR configurations
- **Generate QR with AI** command — describe the QR code you want in plain English and let AI configure it for you
- AI tools (`generate-qr`, `list-saved`) for Raycast AI integration via `ai.yaml`
- Export as PNG or SVG to Downloads, and copy to clipboard
- Save/load QR configurations with thumbnail previews using Local Storage
