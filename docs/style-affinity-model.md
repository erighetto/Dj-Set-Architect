# Style Affinity Model

## Overview

The Style Affinity model adds style coherence as a first-class scoring dimension to DJ Set Architect's recommendation engine. This prevents stylistically incoherent suggestions (e.g., Son Cubano appearing in a Deep House set) by penalizing or excluding style outliers based on the seed tracks' style profile.

## Problem Statement

The MVP's transition scoring system optimizes for:
- BPM compatibility
- Camelot key harmonic compatibility
- Energy curve alignment
- Danceability consistency

However, this can produce technically compatible but **stylistically incoherent** track suggestions. For example:
- A Deep House set seeded with "Innervisions" by Mark Knight could inappropriately include Cuban music or unrelated electronic subgenres
- Genre mixing happens without user intent

## Solution Architecture

### 1. Style Tag Extraction

**Source Priority** (following user requirements):
1. Genre field (primary)
2. Album name patterns (secondary)
3. Artist patterns (tertiary, minimal)
4. Fallback: "electronic"

**Normalization:**
- Standardize common aliases (e.g., "deep-house" → "deep_house")
- Deduplicate overlapping tags
- Map raw tags to DJ-friendly categories

Example extraction:
```
Track: "Bells of Revolution" by Chris Liebing, album="CLR Recordings"
→ styleTags: ["techno", "minimal_techno", "industrial"]
```

### 2. Style Profile Derivation

For each set generation request:

1. **Input:** Seed track IDs provided by user
2. **Extract:** Style tags from all seed tracks
3. **Aggregate:** Tag frequency map across seeds
4. **Select:** Top 3–5 tags as `mainStyles`
5. **Collect:** Style embeddings (if ML models are used)

**Output:** StyleProfile
```typescript
{
  tags: Map<string, number>,      // frequencies
  mainStyles: string[],            // top tags
  embeddings: number[][]          // ML embeddings if available
}
```

Example:
- Seeds: [DeepHouse1, DeepHouse2, Techno1]
- Derived styles: ["deep_house", "techno", "ambient"]
- Main styles: ["deep_house", "techno"]

### 3. Style Affinity Scoring

For each candidate track, compute affinity relative to the seed profile:

$$S_{affinity} = w_{tag} \cdot S_{tag} + w_{emb} \cdot S_{emb}$$

**Tag-based similarity (60% weight):**
$$S_{tag} = \frac{\text{overlap\_count}}{\max(\text{candidate\_tags}, \text{main\_styles})}$$
- Exact match boost: +0.1
- Tag overlap determines compatibility

**Embedding-based similarity (40% weight, optional):**
$$S_{emb} = \text{avg cosine similarity between embeddings}$$
- Uses MusiCNN ML model outputs
- Captures nuanced style relationships
- Falls back to tag-only if embeddings unavailable

**Final score:** [0, 1] range
- 1.0: strong coherence
- 0.5: neutral
- 0.0: strong divergence

### 4. Outlier Detection & Penalties

For each variant profile, define a style coherence threshold:

| Profile | Threshold |
|---------|-----------|
| Safe | 0.6 (strict) |
| Balanced | 0.4 (moderate) |
| Exploratory | 0.2 (permissive) |

Tracks with affinity below threshold are flagged as style outliers.

**Penalties Applied During Beam Search:**
- Safe: -0.15 penalty for outliers (likely excluded)
- Balanced: -0.15 penalty (considered but deprioritized)
- Exploratory: -0.15 penalty (tolerated but not preferred)

### 5. Transition Scoring Integration

Updated `scoreTransition()` function:

```typescript
export function scoreTransition(
  from: TrackWithFeatures,
  to: TrackWithFeatures,
  options: {
    variantProfile: VariantProfile;
    energyCurve: EnergyCurve;
    fromPositionRatio: number;
    toPositionRatio: number;
    seedStyleProfile?: StyleProfile;  // NEW
  }
): TransitionScore
```

**Changes:**
1. Compute `styleScore` if `seedStyleProfile` is provided
2. Include `styleScore` in weighted average
3. Add style rationale message
4. Return `styleScore` in TransitionScore output

**Rationale Messages:**
- "Strong style coherence with seed profile"
- "Style has some alignment (shared: house, techno)"
- "Style diverges somewhat from seed profile"
- "Style is a significant departure from seed profile"

### 6. Variant Profiles Updated

**ScoringWeights now includes `style` dimension:**

| Dimension | Safe | Balanced | Exploratory |
|-----------|------|----------|-------------|
| BPM | 0.30 | 0.25 | 0.15 |
| Key | 0.30 | 0.20 | 0.12 |
| Energy | 0.18 | 0.20 | 0.20 |
| Danceability | 0.04 | 0.08 | 0.12 |
| Mood | 0.02 | 0.04 | 0.12 |
| Genre | 0.01 | 0.03 | 0.08 |
| **Style** | **0.15** | **0.20** | **0.21** |

- **Safe:** Strong style emphasis (0.15) → coherent sets
- **Balanced:** Moderate style emphasis (0.20) → allows controlled exploring
- **Exploratory:** High style weight (0.21) + low threshold (0.20) → permits mixing

### 7. Database Schema Updates

**New columns in `track_features`:**
```sql
style_tags TEXT              -- JSON array of normalized tags
style_source TEXT            -- "imported" | "essentiajs" | "manual"
style_embedding TEXT         -- JSON array of floats (MusiCNN activations)
```

**New column in `transition_scores`:**
```sql
style_score REAL             -- [0, 1] style affinity score
```

**New fields in domain types:**
```typescript
// TrackFeature
styleTags?: string[] | null;
styleSource?: FeatureSource | null;
styleEmbedding?: number[] | null;

// SetTrack
styleTags?: string[] | null;

// TransitionScore
styleScore?: number | null;
```

## Essentia.js Integration

### MusiCNN Model

DJ Set Architect can optionally integrate Essentia's **MusiCNN** autotagging model:

**Model Details:**
- **Location:** https://essentia.upf.edu/models/autotagging/msd/msd-musicnn-1
- **Input:** Audio features (mel-scale spectrogram)
- **Output:** 50-dimensional activation vector
- **Tags:** Rock, Pop, Electronic, Dance, House, Techno, Ambient, Jazz, Hip-Hop, etc.

**Integration Points:**
1. Audio analysis worker (`src/workers/audio-analysis.worker.ts`)
   - Load MusiCNN model via Essentia.js
   - Extract features from decoded audio
   - Run inference to get activations

2. Style tag mapping (`essentiaStyles.ts`)
   - Map MusiCNN activations to DJ-friendly genres
   - Extract normalized style tags
   - Generate 50-dimensional embedding

3. Fallback strategy:
   - If ML inference fails, use metadata-based tags
   - If no Essentia model available, use genre field + album name
   - Graceful degradation (style scoring still works with metadata)

**Usage in Set Generation:**
- During library analysis, run MusiCNN on all tracks
- Store both metadata-derived and ML-derived style tags
- Use ML embeddings as fallback if metadata is sparse
- Include MusiCNN confidence scores for weighting

### No Cloud Dependencies

MusiCNN inference runs entirely locally:
- WASM-based Essentia.js
- TensorFlow.js (browser/Node.js compatible)
- Models served locally or from CDN (no real-time queries)

## Implementation Files

| File | Purpose |
|------|---------|
| `src/domain/scoring/styleAffinity.ts` | Core style profile & affinity logic |
| `src/domain/scoring/essentiaStyles.ts` | MusiCNN integration & tag mapping |
| `src/domain/scoring/transitionScoring.ts` | Updated with style scoring |
| `src/domain/scoring/variantProfiles.ts` | Updated weights with style dimension |
| `src/domain/set-generation/beamSearch.ts` | Pass style profile to ranking |
| `src/domain/features/normalization.ts` | Extract style tags from metadata |
| `src/main/db/schema.ts` | New schema columns |
| `src/shared/types/domain.ts` | Updated interfaces |

## Example Workflow

### Scenario: Generate Deep House Set

1. **User selects seeds:**
   - "Innervisions" – Mark Knight (Genre: Deep House)
   - "Watercolour" – Snare (Genre: Deep House)
   - "The Bells" – CRISTOPH (Genre: Techno)

2. **Style profile derived:**
   - All seeds processed for genre/album tags
   - `styleTags`: ["deep_house", "techno", "ambient", "minimal"]
   - `mainStyles`: ["deep_house", "techno"]

3. **Candidate ranking (Safe profile, threshold=0.6):**
   - "Never Gonna Give You Up" by Rick Astley
     - `styleTags`: ["pop", "80s", "synthpop"]
     - Affinity score: 0.2 (no overlap)
     - **Penalty: -0.15 → Excluded**
   
   - "Space Date" by A.R.D.I.
     - `styleTags`: ["techno", "minimal_techno", "hard_techno"]
     - Affinity score: 0.95 (strong overlap)
     - **No penalty → Ranked high**
   
   - "Entre Dois Mundos" by DVS1
     - `styleTags`: ["deep_house", "minimal", "soulful_house"]
     - Affinity score: 0.85 (main style match)
     - **No penalty → Ranked high**

4. **Result:** Coherent Deep House set with occasional Techno elements, NO pop/'80s tracks.

### Scenario: Generate Exploratory Set

Same seeds, but **Exploratory profile** (threshold=0.2):
- Rick Astley track: Affinity 0.2 → Exactly at threshold → May be included (1–2 tracks)
- Brazilian/Latin tracks: Affinity 0.15 → Below threshold but low penalty → Rarely included
- Set permits stylistic mixing while still preferring coherence

## Testing & Validation

### Unit Tests

- `extractStyleTags()`: Verify metadata parsing
- `deriveStyleProfile()`: Check seed aggregation
- `computeStyleAffinityScore()`: Validate scoring logic
- `isStyleOutlier()`: Confirm outlier thresholds per profile
- `getStyleRationale()`: Verify message generation

### Integration Tests

- End-to-end set generation with style constraints
- Verify outlier penalties apply correctly
- Compare output with/without Essentia embeddings
- Ensure Safe/Balanced/Exploratory profiles differ appropriately

### Expected Outcomes

✅ Deep House seeds → Deep House-biased recommendations  
✅ Tech House seeds → Tech House-biased recommendations  
✅ Multi-genre seeds → Diverse but coherent recommendations  
✅ Exploratory profile allows safe exceptions  
✅ Rationale messages explain style choices  

## Future Enhancements

1. **User-defined style weights:** Allow DJs to customize min/max style diversity
2. **Dynamic style categories:** Learn subgenre relationships from seed selections
3. **Real-time MusiCNN:** Integrate live MusiCNN with AudioWorklet
4. **Mood + Style:** Combine style affinity with mood/energy tracking
5. **A/B Testing:** Track user satisfaction by profile + style coherence
6. **Style transition metrics:** Measure smooth vs. abrupt style shifts within sets

## References

- Essentia ML Models: https://essentia.upf.edu/models/
- MusiCNN Paper: https://arxiv.org/abs/1711.02520
- Essentia.js Tutorial: https://mtg.github.io/essentia.js/docs/api/tutorial-3.%20Machine%20learning%20inference%20with%20Essentia.js.html
