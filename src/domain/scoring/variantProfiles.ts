import type { VariantProfile } from "../../shared/types/domain.js";

export interface ScoringWeights {
  bpm: number;
  key: number;
  energy: number;
  danceability: number;
  mood: number;
  genre: number;
  style: number;
}

export const VARIANT_PROFILE_WEIGHTS: Record<VariantProfile, ScoringWeights> = {
  safe: {
    bpm: 0.3,
    key: 0.3,
    energy: 0.18,
    danceability: 0.04,
    mood: 0.02,
    genre: 0.01,
    style: 0.15
  },
  balanced: {
    bpm: 0.25,
    key: 0.2,
    energy: 0.2,
    danceability: 0.08,
    mood: 0.04,
    genre: 0.03,
    style: 0.2
  },
  exploratory: {
    bpm: 0.15,
    key: 0.12,
    energy: 0.2,
    danceability: 0.12,
    mood: 0.12,
    genre: 0.08,
    style: 0.21
  }
};
