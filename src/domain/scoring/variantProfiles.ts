import type { VariantProfile } from "../../shared/types/domain.js";

export interface ScoringWeights {
  bpm: number;
  key: number;
  energy: number;
  danceability: number;
  mood: number;
  genre: number;
}

export const VARIANT_PROFILE_WEIGHTS: Record<VariantProfile, ScoringWeights> = {
  safe: {
    bpm: 0.35,
    key: 0.35,
    energy: 0.2,
    danceability: 0.05,
    mood: 0.03,
    genre: 0.02
  },
  balanced: {
    bpm: 0.3,
    key: 0.25,
    energy: 0.25,
    danceability: 0.1,
    mood: 0.05,
    genre: 0.05
  },
  exploratory: {
    bpm: 0.2,
    key: 0.15,
    energy: 0.25,
    danceability: 0.15,
    mood: 0.15,
    genre: 0.1
  }
};
