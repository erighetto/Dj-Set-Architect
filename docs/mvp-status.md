# MVP Status

## Implemented

- Electron + React + TypeScript scaffold.
- Hardened renderer configuration with `contextIsolation: true` and `nodeIntegration: false`.
- Safe preload API over explicit IPC channels.
- SQLite schema and persistence layer.
- Apple Music XML importer with duplicate avoidance.
- Domain types for tracks, features, set drafts, transitions, jobs, providers, profiles, and energy curves.
- Feature normalization with provenance.
- OpenKeyScan adapter plus graceful deterministic fallback.
- Worker-thread audio feature provider stub ready for Essentia.js/WASM.
- Scoring engine with explainable component scores.
- Safe, Balanced, and Exploratory profiles.
- Three energy curves.
- Beam Search set generation.
- React screens for import, library, analysis status, set configuration, seed selection, generated draft, and export.
- JSON and CSV export.
- Basic unit tests for scoring, curves, generation, and Apple Music XML parsing.

## Still Stubbed

- Real Essentia.js/WASM feature extraction.
- Confirmed OpenKeyScan endpoint details beyond the adapter contract.

These are intentionally behind provider interfaces so the MVP structure remains runnable and local-first while integration details are finalized.
