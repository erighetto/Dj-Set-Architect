import type { EnergyCurve, TrackWithFeatures, TransitionScore, VariantProfile } from "../../shared/types/domain.js";
import { camelotCompatibilityScore, camelotRationale } from "./camelot.js";
import { targetEnergyDelta } from "./energyCurves.js";
import { VARIANT_PROFILE_WEIGHTS } from "./variantProfiles.js";
import type { ScoringWeights } from "./variantProfiles.js";
import { computeStyleAffinityScore, deriveStyleProfile, extractStyleTags, getStyleRationale } from "./styleAffinity.js";
import type { StyleProfile } from "./styleAffinity.js";

export function bpmScore(from?: number | null, to?: number | null, alpha = 0.08): number {
  if (!from || !to) {
    return 0.5;
  }
  return Math.exp(-alpha * Math.abs(from - to));
}

export function energyProgressionScore(
  fromEnergy: number | null | undefined,
  toEnergy: number | null | undefined,
  expectedDelta: number,
  beta = 4
): number {
  if (fromEnergy == null || toEnergy == null) {
    return 0.5;
  }
  return Math.exp(-beta * Math.abs(toEnergy - fromEnergy - expectedDelta));
}

export function danceabilityScore(from?: number | null, to?: number | null): number {
  if (from == null || to == null) {
    return 0.5;
  }
  return Math.max(0, 1 - Math.abs(from - to));
}

export function getTrackBpm(track: TrackWithFeatures): number | null {
  return track.features?.bpm ?? track.importedBpm ?? null;
}

function weightedAverage(components: Record<keyof ScoringWeights, number>, weights: ScoringWeights): number {
  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  const raw = (Object.entries(weights) as Array<[keyof ScoringWeights, number]>).reduce(
    (sum, [key, weight]) => sum + (components[key] ?? 0.5) * weight,
    0
  );
  return raw / totalWeight;
}

export function scoreTransition(
  from: TrackWithFeatures,
  to: TrackWithFeatures,
  options: {
    variantProfile: VariantProfile;
    energyCurve: EnergyCurve;
    fromPositionRatio: number;
    toPositionRatio: number;
    seedStyleProfile?: StyleProfile;
  }
): TransitionScore {
  const weights = VARIANT_PROFILE_WEIGHTS[options.variantProfile];
  const expectedDelta = targetEnergyDelta(options.energyCurve, options.fromPositionRatio, options.toPositionRatio);
  const bpm = bpmScore(getTrackBpm(from), getTrackBpm(to));
  const key = camelotCompatibilityScore(from.features?.camelotKey, to.features?.camelotKey);
  const energy = energyProgressionScore(from.features?.energyScore, to.features?.energyScore, expectedDelta);
  const dance = danceabilityScore(from.features?.danceabilityScore, to.features?.danceabilityScore);

  // Compute style affinity if profile is provided
  let style = 0.5;
  let styleRationale = "";
  if (options.seedStyleProfile) {
    style = computeStyleAffinityScore(to, options.seedStyleProfile, { useEmbeddings: false });
    const candidateTags = to.features?.styleTags || extractStyleTags(to);
    styleRationale = getStyleRationale(style, candidateTags, options.seedStyleProfile.mainStyles);
  }

  const transitionScore = weightedAverage(
    { bpm, key, energy, danceability: dance, mood: 0.5, genre: 0.5, style },
    weights
  );

  const rationale = [
    Math.abs((getTrackBpm(from) ?? 0) - (getTrackBpm(to) ?? 0)) <= 4
      ? "BPM difference is within preferred tolerance"
      : "BPM difference introduces noticeable tempo movement",
    camelotRationale(from.features?.camelotKey, to.features?.camelotKey),
    energy >= 0.75
      ? "Energy movement matches the selected curve"
      : "Energy movement diverges from the selected curve",
    dance >= 0.8
      ? "Danceability remains consistent"
      : "Danceability changes noticeably",
    styleRationale ? styleRationale : undefined
  ].filter((msg) => msg !== undefined) as string[];

  return {
    fromTrackId: from.id,
    toTrackId: to.id,
    transitionScore,
    bpmScore: bpm,
    keyScore: key,
    energyScore: energy,
    danceabilityScore: dance,
    moodScore: null,
    genreScore: null,
    styleScore: style,
    rationale
  };
}
