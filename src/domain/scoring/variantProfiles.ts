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
    bpm: 0.25,
    key: 0.25,
    energy: 0.18,
    danceability: 0.02,
    mood: 0.02,
    genre: 0.03,
    style: 0.25
  },
  balanced: {
    bpm: 0.22,
    key: 0.18,
    energy: 0.2,
    danceability: 0.03,
    mood: 0.04,
    genre: 0.08,
    style: 0.25
  },
  exploratory: {
    bpm: 0.18,
    key: 0.12,
    energy: 0.2,
    danceability: 0.05,
    mood: 0.1,
    genre: 0.1,
    style: 0.25
  }
};
