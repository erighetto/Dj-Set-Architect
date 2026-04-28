# Dj-Set-Architect

### Functional Specification — v0.2

---

## 1. Overview

**DJ Set Architect** is a decision-support tool designed to assist DJs in **planning and structuring complete DJ sets** based on their personal music library.

Unlike live mixing assistants or library management tools, DJ Set Architect focuses on:

* Pre-set design
* Narrative flow construction
* Intelligent track sequencing
* Context-aware recommendations

The system helps DJs transform a collection of tracks into a **coherent, time-constrained musical journey**.

---

## 2. Problem Statement

Existing DJ software solutions (e.g. Lexicon DJ, djay) primarily address:

* Library organization
* Live performance support
* Basic harmonic/BPM sorting

They do **not** effectively support:

* Designing a full set in advance
* Maintaining energy and mood progression
* Leveraging personal track history as a compositional asset

---

## 3. Goals

### Primary Goals

* Enable DJs to generate **structured set drafts**
* Respect **duration constraints**
* Ensure **harmonic and rhythmic compatibility**
* Model **energy/mood progression**

### Secondary Goals

* Provide explainable recommendations
* Offer multiple alternative set drafts
* Learn from user behavior over time

---

## 4. Non-Goals

* Real-time track recommendation during live mixing
* DJ controller integration
* Audio playback or mixing
* Library cleaning or tagging automation

---

## 5. Core Concepts

### 5.1 Track

A track is defined by:

* Title
* Artist
* Duration
* BPM
* Musical Key (Camelot/Open Key)
* Energy (normalized 0–1)
* Danceability (normalized 0–1)
* Mood tags (optional)

---

### 5.2 Set Draft

A **Set Draft** is an ordered sequence of tracks that:

* Fits within a target duration
* Includes user-defined seed tracks
* Maximizes flow coherence

---

### 5.3 Seed Tracks

User-selected tracks that:

* Must be included in the set
* Act as anchors in the sequence

---

### 5.4 Energy Curve

A function describing how energy evolves over time:

Examples:

* Warm-up → Build → Peak → Cooldown
* Flat groove
* Wave pattern

---

## 6. Functional Requirements

---

### 6.1 Library Import

**FR-001**

The system shall import a music library from:

* Apple Music (XML export)

**FR-002**

The system shall normalize track metadata:

* BPM consistency
* Key format (Camelot/Open Key)

---

### 6.2 Track Enrichment (UPDATED)

**FR-010**

The system shall perform **local audio analysis** as the primary method for feature extraction.

**FR-011**

The system shall use OpenKeyScan for:

* Musical key detection
* Conversion to Camelot/Open Key notation

**FR-012**

The system shall use Essentia for:

* BPM detection (if missing or unreliable)
* Danceability estimation
* Low-level audio feature extraction

**FR-013**

The system shall compute an internal **energy score (0–1)** derived from:

* Loudness
* Spectral flux
* Onset density
* Low-frequency energy
* Dynamic complexity

**FR-014**

The system shall assign metadata provenance:

* `bpm_source`
* `key_source`
* `feature_version`

---

### 6.3 Set Definition

**FR-020**

The user shall define:

* Target duration (e.g. 90 minutes)
* Context (free text or tags)
* Mood profile
* Energy curve type

---

### 6.4 Seed Selection

**FR-030**

The user shall select one or more seed tracks.

**FR-031**

The system shall guarantee inclusion of seed tracks in generated drafts.

---

### 6.5 Set Generation Engine

**FR-040**

The system shall generate one or more **Set Drafts** based on:

* Track compatibility:

  * BPM proximity
  * Harmonic compatibility
  * Energy progression

**FR-041**

The system shall respect:

* Target duration (± tolerance)
* Inclusion of seed tracks

**FR-042**

The system shall generate multiple variants:

* Safe (low risk transitions)
* Balanced
* Exploratory (higher variance)

---

### 6.6 Compatibility Model

**FR-050**

The system shall evaluate transitions based on:

* Δ BPM
* Key compatibility (Camelot wheel)
* Energy delta
* Danceability compatibility
* Mood similarity

---

### 6.7 Explainability

**FR-060**

Each transition shall include a rationale:

Example:

* Harmonic compatibility: 9A → 10A
* BPM delta within tolerance
* Energy progression aligned with curve

---

### 6.8 Output

**FR-070**

The system shall output:

* Ordered track list
* Total duration
* Energy visualization (optional)

**FR-071**

The system shall support export formats:

* Playlist (CSV/JSON)
* DJ software compatible formats (future)

---

## 7. Non-Functional Requirements

---

### Performance

* Set generation should complete within a few seconds

### Usability

* Minimal friction input
* Visual representation of the set timeline

### Extensibility

* Modular scoring system
* Pluggable enrichment sources

---

## 8. Future Enhancements (Out of MVP)

* Learning from past sets (feedback loop)
* Optional integration with external APIs (e.g. Spotify)
* Crowd reaction modeling
* Transition difficulty scoring
* Genre-aware sequencing

---

## 9. MVP Scope (UPDATED)

The MVP will include:

* Library import (Apple Music XML)
* Feature extraction via OpenKeyScan + Essentia
* Seed selection
* Single set draft generation
* Basic compatibility scoring
* Playlist export

---

## 10. High-Level Architecture

```text
[Library Import]
        ↓
[Local Audio Analysis]
(OpenKeyScan + Essentia)
        ↓
[Feature Normalization Layer]
        ↓
[Track Graph Builder]
        ↓
[Set Generation Engine]
        ↓
[Set Draft Output]
```

---

## 11. Success Criteria

* DJ can generate a usable set draft in < 2 minutes
* Output requires minimal manual adjustment
* Suggestions are perceived as “musically coherent”

---

## 12. Positioning

DJ Set Architect is:

* NOT a DJ software
* NOT a music library manager

It is:

> A **set design engine** for DJs who think in terms of flow, narrative, and musical architecture.

---

# Modules suite
Take a look to the other modules related to djcoso.
