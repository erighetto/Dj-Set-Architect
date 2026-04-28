import { describe, expect, it } from "vitest";
import { bpmScore, scoreTransition } from "../src/domain/scoring/transitionScoring.js";
import { camelotCompatibilityScore } from "../src/domain/scoring/camelot.js";
import { energyCurveValue } from "../src/domain/scoring/energyCurves.js";
import type { TrackWithFeatures } from "../src/shared/types/domain.js";

describe("scoring", () => {
  it("scores close BPM transitions higher than distant transitions", () => {
    expect(bpmScore(124, 125)).toBeGreaterThan(bpmScore(124, 136));
  });

  it("recognizes Camelot compatible transitions", () => {
    expect(camelotCompatibilityScore("9A", "10A")).toBeGreaterThanOrEqual(0.9);
    expect(camelotCompatibilityScore("9A", "9B")).toBeGreaterThanOrEqual(0.85);
    expect(camelotCompatibilityScore("9A", "4B")).toBeLessThan(0.5);
  });

  it("maps energy curves to normalized values", () => {
    expect(energyCurveValue("flat_groove", 0.1)).toBeGreaterThanOrEqual(0);
    expect(energyCurveValue("flat_groove", 0.1)).toBeLessThanOrEqual(1);
    expect(energyCurveValue("warmup_build_peak_cooldown", 0.75)).toBeGreaterThan(
      energyCurveValue("warmup_build_peak_cooldown", 0.05)
    );
  });

  it("returns explainable component scores", () => {
    const from = makeTrack("a", "First", "DJ A", 124, "9A", 0.5, 0.7);
    const to = makeTrack("b", "Second", "DJ B", 126, "10A", 0.58, 0.72);
    const score = scoreTransition(from, to, {
      variantProfile: "balanced",
      energyCurve: "warmup_build_peak_cooldown",
      fromPositionRatio: 0.2,
      toPositionRatio: 0.25
    });
    expect(score.transitionScore).toBeGreaterThan(0.7);
    expect(score.rationale.length).toBeGreaterThan(0);
  });
});

function makeTrack(
  id: string,
  title: string,
  artist: string,
  bpm: number,
  camelotKey: string,
  energyScore: number,
  danceabilityScore: number
): TrackWithFeatures {
  const now = new Date().toISOString();
  return {
    id,
    title,
    artist,
    durationSeconds: 300,
    createdAt: now,
    updatedAt: now,
    features: {
      trackId: id,
      bpm,
      bpmSource: "essentiajs",
      camelotKey,
      keySource: "openkeyscan",
      energyScore,
      danceabilityScore,
      featureVersion: "test",
      updatedAt: now
    }
  };
}
