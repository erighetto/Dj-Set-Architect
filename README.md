# DJ Set Architect

DJ Set Architect is a local-first Electron desktop app for planning complete DJ sets before a performance. It imports an Apple Music XML library, persists tracks in SQLite, enriches tracks with local feature analysis, generates deterministic set drafts with Beam Search, and exports drafts to JSON or CSV.

## MVP Stack

- Electron, React, TypeScript
- SQLite via `better-sqlite3`
- Local audio feature extraction with Essentia.js/WASM in a worker thread
- OpenKeyScan local API adapter with graceful deterministic fallback
- Typed IPC through a safe preload API

## Setup

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm run build
npm run typecheck
npm test
```

The app stores its SQLite database at Electron's `userData` path as `dj-set-architect.sqlite`.

## Current MVP Workflow

1. Import an Apple Music XML export from the Library Import screen.
2. Run batch feature analysis from the Analysis Status screen.
3. Select seed tracks in the Track Library or Set Configuration screen.
4. Configure target duration, tolerance, variant profile, and energy curve.
5. Generate one deterministic set draft.
6. Review transition scores and rationales.
7. Export the draft to JSON or CSV.

## Integration Notes

OpenKeyScan is queried at `http://127.0.0.1:8765` with `GET /health` and `POST /analyze`. If unavailable, the app uses a deterministic stub provider and marks `key_source = "stub"`.

The audio feature provider runs through a worker thread. It decodes local files with bundled FFmpeg to mono PCM, feeds the signal to Essentia.js/WASM, and extracts BPM, danceability, loudness, spectral flux, onset density, low-frequency energy, dynamic complexity, and normalized energy. If decoding or analysis fails for a file, the provider falls back to deterministic local estimates so batch analysis can continue.

Native SQLite must be rebuilt for Electron after dependency changes:

```bash
npm run rebuild:native
```
