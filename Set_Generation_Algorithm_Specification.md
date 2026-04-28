# DJ Set Architect

## Set Generation Algorithm Specification — v0.1

---

## 1. Overview

The Set Generation Algorithm is responsible for transforming:

* a personal music library
* a set duration target
* a group of seed tracks
* an energy curve
* track compatibility scores

into one or more ordered **Set Drafts**.

The algorithm treats the music library as a **weighted directed graph**:

```text
Track = Node
Transition = Directed Edge
Transition Score = Edge Weight
Set Draft = Path through the graph
```

The objective is to find a high-quality path that:

* includes all required seed tracks
* stays close to the target duration
* follows the selected energy curve
* maximizes transition coherence
* avoids excessive repetition or monotony

---

## 2. Inputs

### 2.1 Track Catalog

Each track must expose normalized features:

```json
{
  "track_id": "string",
  "title": "string",
  "artist": "string",
  "duration_seconds": 312,
  "bpm": 118.4,
  "camelot_key": "9A",
  "energy_score": 0.68,
  "danceability_score": 0.74,
  "mood_vector": [],
  "genre_vector": []
}
```

### 2.2 User Set Definition

```json
{
  "target_duration_seconds": 5400,
  "duration_tolerance_seconds": 300,
  "seed_track_ids": ["track_001", "track_042"],
  "energy_curve": "warmup_build_peak_cooldown",
  "variant_profile": "balanced"
}
```

### 2.3 Scoring Configuration

```json
{
  "weights": {
    "bpm": 0.30,
    "key": 0.25,
    "energy": 0.25,
    "danceability": 0.10,
    "mood": 0.05,
    "genre": 0.05
  },
  "beam_width": 25,
  "max_candidates_per_step": 100
}
```

---

## 3. Outputs

The algorithm returns one or more **Set Drafts**.

```json
{
  "set_id": "draft_001",
  "variant_profile": "balanced",
  "total_duration_seconds": 5480,
  "duration_deviation_seconds": 80,
  "tracks": [
    {
      "position": 1,
      "track_id": "track_001",
      "title": "Track A",
      "artist": "Artist A"
    }
  ],
  "global_score": 0.87,
  "transition_rationales": []
}
```

---

## 4. Algorithm Choice

For v0.1, the recommended algorithm is:

> **Beam Search with constraint-aware pruning**

Beam Search is preferred for the MVP because it is:

* easier to implement than genetic algorithms
* more predictable than purely random search
* tunable through `beam_width`
* suitable for explainable scoring
* good enough for medium-sized DJ libraries

---

## 5. High-Level Process

```text
1. Load candidate tracks
2. Normalize features
3. Pre-filter library
4. Build candidate transition graph
5. Initialize paths from seed or suitable opener
6. Expand paths iteratively
7. Score each partial path
8. Prune low-quality paths
9. Stop when duration target is reached
10. Rank completed Set Drafts
11. Return best variants
```

---

## 6. Candidate Pre-Filtering

Before graph expansion, the system should reduce the searchable track space.

### 6.1 Hard Filters

Optional filters:

* genre
* BPM range
* minimum audio quality
* availability of file path
* valid duration
* user-excluded tracks

### 6.2 Soft Filters

Soft filters may influence ranking but should not exclude tracks immediately:

* mood similarity
* artist familiarity
* previous user preference
* play count
* rating

---

## 7. Seed Handling Strategy

Seed tracks are not merely included; they act as **anchors**.

### 7.1 Required Inclusion

All seed tracks must appear in the final Set Draft.

### 7.2 Seed Ordering

For v0.1, two strategies are supported:

#### Strategy A — User-defined order

The seed tracks appear in the order selected by the user.

#### Strategy B — Algorithmic order

The system may reorder seed tracks to maximize compatibility and energy curve alignment.

Default for MVP:

```text
Strategy A: User-defined order
```

---

## 8. Anchor-Based Path Construction

The set is divided into segments between anchors.

Example:

```text
[Opener] → Seed 1 → Seed 2 → Seed 3 → [Closer]
```

Each segment is generated independently and then merged.

This reduces complexity and gives the user better control over the set narrative.

---

## 9. Segment Budget Allocation

Given:

```text
target_duration = 90 minutes
seed_count = 3
```

The algorithm creates segment budgets:

```text
Opening segment
Seed 1 → Seed 2
Seed 2 → Seed 3
Closing segment
```

Budget allocation may be:

* equal distribution
* energy-curve-aware distribution
* user-defined

Default MVP strategy:

```text
Energy-curve-aware distribution
```

---

## 10. Path Expansion

At each expansion step, the algorithm selects candidate next tracks.

### 10.1 Candidate Selection

For current track `A`, candidate track `B` must:

* not already be in the current path
* have a valid transition score
* not violate hard constraints
* keep projected duration within acceptable bounds

### 10.2 Candidate Ranking

Each candidate is ranked by:

```text
candidate_score =
  transition_score(A → B)
  + curve_alignment_score(B, projected_position)
  + seed_progress_score
  - penalty_terms
```

---

## 11. Partial Path Scoring

A partial path is scored as:

```text
partial_path_score =
  average_transition_score
  + curve_alignment_score
  + seed_coverage_score
  - duration_deviation_penalty
  - repetition_penalty
```

This avoids choosing paths that are locally smooth but globally poor.

---

## 12. Beam Search Procedure

```pseudo
function generate_set(library, user_config, scoring_config):

    candidates = prefilter_tracks(library, user_config)

    anchors = resolve_seed_tracks(user_config.seed_track_ids)

    segments = build_segments(anchors, user_config)

    final_set = []

    for segment in segments:
        segment_path = generate_segment(
            start_track = segment.start,
            end_track = segment.end,
            duration_budget = segment.duration_budget,
            candidates = candidates,
            scoring_config = scoring_config
        )

        final_set.append(segment_path)

    final_set = merge_segments(final_set)

    final_score = score_full_set(final_set)

    return final_set
```

---

## 13. Segment Generation Procedure

```pseudo
function generate_segment(start_track, end_track, duration_budget, candidates, scoring_config):

    beam = initialize_beam(start_track)

    completed_paths = []

    while beam is not empty:

        expanded_paths = []

        for path in beam:

            current_track = path.last_track

            next_candidates = get_top_candidates(
                current_track,
                candidates,
                scoring_config.max_candidates_per_step
            )

            for candidate in next_candidates:

                if candidate in path:
                    continue

                new_path = path + candidate

                if exceeds_duration_budget(new_path, duration_budget):
                    continue

                new_score = score_partial_path(new_path)

                expanded_paths.append(new_path, new_score)

                if can_close_to_end_track(new_path, end_track, duration_budget):
                    completed = new_path + end_track
                    completed_paths.append(score_path(completed))

        beam = top_k(expanded_paths, scoring_config.beam_width)

    return best(completed_paths)
```

---

## 14. Constraint Handling

### 14.1 Duration Constraint

The algorithm should target:

```text
target_duration ± tolerance
```

Penalty:

```text
duration_penalty = abs(actual_duration - target_duration) / target_duration
```

### 14.2 Seed Constraint

Missing seed tracks invalidate the draft.

```text
if missing_required_seed:
    reject draft
```

### 14.3 Duplicate Track Constraint

A track cannot appear more than once in the same Set Draft.

### 14.4 Artist Repetition Constraint

Optional penalty:

```text
artist_repetition_penalty = repeated_artist_count * weight
```

---

## 15. Energy Curve Alignment

The set timeline is normalized from `0.0` to `1.0`.

For each track:

```text
position_ratio = cumulative_duration / total_duration
target_energy = energy_curve(position_ratio)
actual_energy = track.energy_score
```

Penalty:

```text
curve_penalty = abs(actual_energy - target_energy)
```

Tracks closer to the expected energy level score higher.

---

## 16. Variant Profiles

The algorithm can generate multiple Set Draft variants by adjusting weights.

### 16.1 Safe

Prioritizes:

* BPM proximity
* harmonic compatibility
* smooth energy changes

```json
{
  "bpm": 0.35,
  "key": 0.35,
  "energy": 0.20,
  "danceability": 0.05,
  "mood": 0.03,
  "genre": 0.02
}
```

### 16.2 Balanced

Prioritizes:

* musical flow
* energy shape
* reasonable diversity

```json
{
  "bpm": 0.30,
  "key": 0.25,
  "energy": 0.25,
  "danceability": 0.10,
  "mood": 0.05,
  "genre": 0.05
}
```

### 16.3 Exploratory

Allows:

* larger BPM movement
* less obvious harmonic transitions
* more mood/genre variation

```json
{
  "bpm": 0.20,
  "key": 0.15,
  "energy": 0.25,
  "danceability": 0.15,
  "mood": 0.15,
  "genre": 0.10
}
```

---

## 17. Explainability Requirements

Each selected transition should expose:

```json
{
  "from_track_id": "track_001",
  "to_track_id": "track_002",
  "transition_score": 0.86,
  "components": {
    "bpm_score": 0.92,
    "key_score": 0.90,
    "energy_score": 0.78,
    "danceability_score": 0.81
  },
  "rationale": [
    "BPM difference is within preferred tolerance",
    "Camelot transition is harmonically compatible",
    "Energy increase matches the selected curve"
  ]
}
```

---

## 18. MVP Simplification

For v0.1, the implementation may use:

* Apple Music XML import
* OpenKeyScan key detection
* Essentia BPM / energy / danceability
* Beam Search
* user-defined seed order
* one generated draft
* three variant profiles as configuration presets

Out of MVP:

* automatic seed ordering
* genetic optimization
* learned user preferences
* embedding similarity
* automatic mood clustering

---

## 19. Failure Modes

### 19.1 No Valid Path Found

The system should report:

```text
No valid set draft found with current constraints.
Try increasing duration tolerance, reducing seed count, or relaxing compatibility settings.
```

### 19.2 Insufficient Feature Coverage

If too many tracks lack BPM/key/energy:

```text
Feature coverage is too low to generate reliable recommendations.
Run library analysis first.
```

### 19.3 Over-Constrained Seeds

If seeds are too far apart musically:

```text
Selected seed tracks are difficult to connect smoothly.
Consider allowing exploratory mode or inserting more bridge tracks.
```

---

## 20. Design Philosophy

The algorithm should behave like a **set planning assistant**, not an automatic DJ.

It should:

* propose coherent routes
* preserve human control
* explain its choices
* allow manual override
* support exploration without replacing taste

The DJ remains the architect. The software provides the structural analysis.
