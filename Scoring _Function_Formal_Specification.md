Perfetto, qui entriamo nel cuore del sistema: **la funzione che trasforma feature musicali in decisioni strutturate**.

Ti preparo una **Scoring Function Formal Specification — v0.1**, coerente con:

* pipeline locale (OpenKeyScan + Essentia)
* approccio graph-based
* possibilità futura di integrare modelli ML di Essentia

---

# 📀 DJ Set Architect

### Scoring Function Formal Specification — v0.1

---

## 1. Overview

The scoring function defines how **track-to-track transitions** and **full set sequences** are evaluated.

The system models:

* Tracks as **feature vectors**
* Transitions as **weighted edges**
* Sets as **paths in a graph**

Goal:

> Maximize global coherence while respecting constraints (duration, seeds, energy curve)

---

## 2. Track Representation

Each track is represented as a normalized feature vector:

```text
T = [
  bpm,
  key_position,
  energy,
  danceability,
  mood_vector,
  genre_vector
]
```

### 2.1 Feature Definitions

* **bpm** → normalized tempo
* **key_position** → integer representation of Camelot wheel (1–24)
* **energy** → normalized [0,1]
* **danceability** → normalized [0,1]
* **mood_vector** → optional multi-dimensional vector
* **genre_vector** → optional multi-dimensional vector

---

## 3. Transition Scoring Function

Each transition between tracks A → B is evaluated as:

```text
Score(A → B) = w_bpm * S_bpm
             + w_key * S_key
             + w_energy * S_energy
             + w_dance * S_dance
             + w_mood * S_mood
             + w_genre * S_genre
```

Where each component is normalized in [0,1].

---

## 4. Component Functions

---

### 4.1 BPM Compatibility

```text
Δbpm = |bpm_A - bpm_B|

S_bpm = exp(-α * Δbpm)
```

* α controls tolerance
* small Δ → score ≈ 1

---

### 4.2 Harmonic Compatibility (Camelot)

Define:

* same key → 1.0
* ±1 step → 0.9
* relative major/minor → 0.85
* others → decaying score

```text
S_key = f_camelot_distance(A, B)
```

---

### 4.3 Energy Progression

```text
Δenergy = energy_B - energy_A
```

Then:

* aligned with curve → high score
* abrupt drop/peak → penalized

```text
S_energy = exp(-β * |Δenergy - target_curve_delta|)
```

---

### 4.4 Danceability Compatibility

```text
S_dance = 1 - |dance_A - dance_B|
```

---

### 4.5 Mood Similarity (Optional)

If mood vectors available:

```text
S_mood = cosine_similarity(mood_A, mood_B)
```

---

### 4.6 Genre Similarity (Optional)

```text
S_genre = cosine_similarity(genre_A, genre_B)
```

---

## 5. Global Set Scoring

A full set is evaluated as:

```text
Score(set) = Σ Score(T_i → T_{i+1})
             + λ_curve * S_curve
             + λ_seed * S_seed_distribution
             - λ_penalty * violations
```

---

## 6. Energy Curve Constraint

Given a target function:

```text
E_target(t)
```

We evaluate deviation:

```text
S_curve = exp(-γ * Σ |E_actual(t) - E_target(t)|)
```

---

## 7. Seed Constraints

* Seeds must appear
* Distribution matters (avoid clustering)

```text
S_seed_distribution = spacing_score(seeds_positions)
```

---

## 8. Duration Constraint

```text
Penalty_duration = |actual_duration - target_duration|
```

---

## 9. Multi-Variant Strategy

Different profiles = different weights:

| Profile     | Description             |
| ----------- | ----------------------- |
| Safe        | high harmonic weight    |
| Balanced    | mixed weights           |
| Exploratory | higher variance allowed |

---

## 10. Graph Interpretation

* Nodes → tracks
* Edges → transitions with score
* Goal → find path maximizing:

```text
argmax Σ Score(A → B)
```

Subject to:

* duration constraint
* seed inclusion
* curve adherence

---

## 11. Algorithm Candidates

* Beam Search (recommended MVP)
* A* with heuristics
* Genetic algorithms (future)

---

## 12. Integration with Essentia ML Models (Future-Ready)

Essentia provides pre-trained models for:

* mood classification
* genre classification
* embeddings

### 12.1 Embedding-Based Similarity

Future extension:

```text
embedding_A = model(track_A)
embedding_B = model(track_B)

S_embedding = cosine_similarity(embedding_A, embedding_B)
```

Then:

```text
Score += w_embedding * S_embedding
```

---

## 13. Normalization Strategy

All features must be normalized:

* BPM → scaled or relative
* Energy → [0,1]
* Danceability → [0,1]

---

## 14. Explainability Layer

Each transition stores:

```json
{
  "bpm_score": 0.92,
  "key_score": 0.88,
  "energy_score": 0.75,
  "reason": "smooth harmonic transition with slight energy increase"
}
```

---

## 15. MVP Simplification

For MVP:

Use only:

* BPM
* Key
* Energy

Ignore:

* mood vectors
* embeddings
* genre similarity

---

## 16. Design Philosophy

The scoring function is:

* deterministic (MVP)
* interpretable
* tunable via weights

Future versions may:

* learn weights automatically
* incorporate ML similarity
* adapt to user preferences


