# DJ Set Architect

## Desktop Application Architecture — v0.1

---

## 1. Architecture Decision

DJ Set Architect will be implemented as a **desktop-first Electron application**.

The MVP stack is:

```text
Electron
React
TypeScript
SQLite
Essentia.js
OpenKeyScan local API
```

The application is designed to run locally on the user’s machine and analyze the user’s personal music library without depending on cloud services.

---

## 2. Core Principles

* Local-first by design
* No mandatory cloud dependency
* User library remains on the local machine
* Feature extraction happens locally
* Recommendation logic is deterministic and explainable
* External integrations are pluggable adapters
* UI remains responsive during long-running analysis jobs

---

## 3. High-Level Architecture

```text
[React Renderer UI]
        ↓
[Application Domain Layer]
        ↓
[Set Generation Engine]
        ↓
[SQLite Persistence Layer]

[Audio Analysis Worker]
        ↓
[Essentia.js / WASM]

[OpenKeyScan Adapter]
        ↓
[OpenKeyScan Local API]
```

---

## 4. Runtime Components

### 4.1 Electron Main Process

Responsibilities:

* Application lifecycle
* Native file system access
* Apple Music XML import
* SQLite connection management
* IPC routing
* OpenKeyScan API communication
* Background job orchestration

The main process should not contain UI logic.

---

### 4.2 React Renderer Process

Responsibilities:

* User interface
* Library browsing
* Seed track selection
* Set configuration
* Timeline visualization
* Draft review
* Manual adjustments
* Export actions

The renderer communicates with the main process through a typed IPC layer.

---

### 4.3 Preload Layer

Responsibilities:

* Expose safe APIs to the renderer
* Hide direct Node.js access from the UI
* Enforce IPC boundaries

Example API surface:

```ts
window.djSetArchitect.library.importAppleMusicXml()
window.djSetArchitect.tracks.search()
window.djSetArchitect.analysis.run()
window.djSetArchitect.sets.generate()
window.djSetArchitect.exports.toJson()
```

---

### 4.4 Audio Analysis Worker

Responsibilities:

* Run Essentia.js / WASM outside the UI thread
* Extract BPM
* Extract danceability
* Extract low-level audio features
* Compute energy primitives
* Return normalized feature payloads

The worker must run asynchronously to avoid blocking the renderer.

---

### 4.5 OpenKeyScan Adapter

Responsibilities:

* Communicate with OpenKeyScan local API
* Submit files for key analysis
* Receive detected musical key
* Normalize result into Camelot/Open Key notation
* Store provenance information

OpenKeyScan is the primary key detection provider for MVP.

---

### 4.6 SQLite Persistence Layer

Responsibilities:

* Store imported library metadata
* Store extracted features
* Store analysis provenance
* Store set drafts
* Store transition scores
* Store user overrides

SQLite is sufficient for MVP because the application is local-first and single-user.

---

## 5. Suggested Module Structure

```text
src/
  main/
    app/
    ipc/
    db/
    importers/
    adapters/
      openkeyscan/
    jobs/

  preload/
    index.ts

  renderer/
    app/
    components/
    pages/
    hooks/
    state/

  domain/
    tracks/
    features/
    scoring/
    set-generation/
    export/

  workers/
    audio-analysis.worker.ts

  shared/
    types/
    constants/
    validation/
```

---

## 6. Data Flow: Library Import

```text
User selects Apple Music XML
        ↓
Main process reads XML
        ↓
Importer parses tracks
        ↓
Metadata normalized
        ↓
Tracks persisted in SQLite
        ↓
Renderer displays imported catalog
```

---

## 7. Data Flow: Feature Extraction

```text
Track file path
        ↓
Analysis job queued
        ↓
Essentia.js Worker extracts BPM, danceability, primitives
        ↓
OpenKeyScan Adapter extracts key
        ↓
Feature Normalization Layer
        ↓
SQLite stores track_features
        ↓
UI updates feature coverage status
```

---

## 8. Data Flow: Set Generation

```text
User selects seed tracks + duration + profile
        ↓
Renderer sends generation request
        ↓
Main process loads eligible tracks + features
        ↓
Set Generation Engine builds candidate path
        ↓
Scoring Engine ranks transitions
        ↓
Draft persisted in SQLite
        ↓
Renderer displays timeline + rationales
```

---

## 9. IPC Design

IPC should be explicit, typed and narrow.

Example channels:

```ts
library:importAppleMusicXml
tracks:search
tracks:getById
analysis:runForTrack
analysis:runBatch
analysis:getStatus
sets:generate
sets:getDraft
sets:updateDraft
exports:json
exports:csv
```

Avoid generic IPC channels such as:

```ts
executeCommand
runSql
readAnyFile
```

---

## 10. Database Scope

Minimum MVP tables:

```text
tracks
track_features
analysis_jobs
sets
set_tracks
transition_scores
user_overrides
```

---

## 11. Track Feature Provenance

Each extracted feature should store source and version.

Example:

```json
{
  "track_id": "track_001",
  "bpm": 118.4,
  "bpm_source": "essentiajs",
  "key": "A minor",
  "camelot_key": "8A",
  "key_source": "openkeyscan",
  "energy_score": 0.67,
  "danceability_score": 0.74,
  "feature_version": "djsa-features-v0.1"
}
```

---

## 12. Background Job Model

Long-running tasks should be modeled as jobs:

* Library import
* Batch feature extraction
* OpenKeyScan batch analysis
* Set generation
* Export

Each job should expose:

```json
{
  "job_id": "job_001",
  "type": "feature_analysis",
  "status": "queued|running|completed|failed",
  "progress": 0.42,
  "error": null
}
```

---

## 13. Security Model

Recommended Electron hardening:

* `contextIsolation: true`
* `nodeIntegration: false`
* explicit preload API
* no remote module
* validated IPC inputs
* no arbitrary file reads from renderer
* no arbitrary SQL execution from renderer

The app should only access files explicitly selected by the user or already imported from the Apple Music XML.

---

## 14. Performance Considerations

Feature extraction can be expensive.

Required measures:

* Run Essentia.js in worker threads
* Batch analysis jobs
* Cache extracted features
* Avoid re-analysis unless file hash or feature version changes
* Use indexed SQLite queries
* Precompute high-confidence transition candidates where useful

---

## 15. Offline Behavior

The application should remain usable offline.

Core offline features:

* Browse imported library
* Review existing features
* Generate set drafts
* Export drafts

Online access is not required for MVP.

---

## 16. Packaging Considerations

The MVP should target macOS first.

Packaging concerns:

* Electron app signing/notarization
* Bundling Essentia.js WASM assets
* Detecting OpenKeyScan availability
* Graceful error if OpenKeyScan is not running
* Future Windows/Linux support

---

## 17. OpenKeyScan Dependency Handling

At startup or before key analysis, the app should check whether OpenKeyScan API is reachable.

If unavailable:

```text
OpenKeyScan is not available.
Key detection cannot run until OpenKeyScan is started.
Existing analyzed keys remain usable.
```

Essentia.js KeyExtractor may be introduced as fallback in a later version.

---

## 18. Extensibility Points

The architecture should support pluggable providers:

```ts
interface KeyDetectionProvider {
  analyze(track: Track): Promise<KeyDetectionResult>
}

interface AudioFeatureProvider {
  analyze(track: Track): Promise<AudioFeatureResult>
}

interface ExportProvider {
  export(setDraft: SetDraft): Promise<ExportResult>
}
```

Initial providers:

```text
KeyDetectionProvider → OpenKeyScan
AudioFeatureProvider → Essentia.js
ExportProvider → JSON / CSV
```

---

## 19. MVP Technical Scope

Included:

* Electron desktop app
* React UI
* TypeScript domain layer
* SQLite database
* Apple Music XML importer
* Essentia.js audio analysis worker
* OpenKeyScan adapter
* Basic set generation engine
* JSON/CSV export

Excluded from MVP:

* Cloud sync
* User accounts
* Real-time deck integration
* Controller integration
* Audio playback engine
* Python sidecar
* Spotify dependency
* Full DJ software export compatibility

---

## 20. Architecture Summary

DJ Set Architect is a **local-first Electron desktop application** with a clear separation between:

* UI
* domain logic
* local persistence
* feature extraction
* external local adapters

The goal is to keep the MVP technically simple, distributable, explainable and extensible without introducing unnecessary cloud or runtime complexity.
