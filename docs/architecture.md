# Architecture

DJ Set Architect follows the Electron architecture in the project specification.

## Process Boundaries

- Main process: app lifecycle, file selection, Apple Music XML parsing, SQLite persistence, background analysis jobs, OpenKeyScan calls, set generation, export formatting.
- Preload: exposes `window.djSetArchitect` as a narrow API over typed IPC channels.
- Renderer: React UI only. It has no Node.js access and does not read arbitrary files or execute SQL.
- Worker: audio feature analysis runs outside the renderer thread.

## IPC Channels

- `library:importAppleMusicXml`
- `tracks:search`
- `tracks:getById`
- `analysis:runBatch`
- `analysis:getStatus`
- `sets:generate`
- `sets:getDraft`
- `exports:json`
- `exports:csv`

Inputs are validated with Zod in the main process. There is no generic command, SQL, or file-read channel.

## Persistence

SQLite tables:

- `tracks`
- `track_features`
- `analysis_jobs`
- `sets`
- `set_tracks`
- `transition_scores`
- `user_overrides`

Feature provenance is stored on `track_features` with `bpm_source`, `key_source`, and `feature_version`.

## Pluggable Providers

The MVP defines provider interfaces for key detection and audio features:

- `KeyDetectionProvider`
- `AudioFeatureProvider`

OpenKeyScan and Essentia.js can be replaced or upgraded behind these interfaces without changing renderer code. The current Essentia provider runs in `src/workers/audio-analysis.worker.ts`, decodes audio through FFmpeg, then calls Essentia.js/WASM algorithms from the worker thread.
