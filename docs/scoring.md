# Scoring

Transition scoring implements the formal model:

```text
transition_score(A -> B) =
  w_bpm * S_bpm
+ w_key * S_key
+ w_energy * S_energy
+ w_dance * S_dance
+ w_mood * S_mood
+ w_genre * S_genre
```

The MVP actively computes BPM, Camelot key, energy, and danceability. Mood and genre receive neutral scores until future feature vectors are available.

## Component Scores

- BPM: `exp(-alpha * abs(bpmA - bpmB))`
- Key: Camelot-compatible scoring, including exact match, adjacent wheel moves, and relative major/minor.
- Energy: compares actual energy delta with the selected curve's expected delta.
- Danceability: `1 - abs(danceA - danceB)`.

## Variant Profiles

- Safe: BPM and harmonic compatibility are weighted highest.
- Balanced: even weighting across flow and energy shape.
- Exploratory: lower harmonic/BPM weight and more room for diversity.

Each generated transition stores component scores and rationale messages.
