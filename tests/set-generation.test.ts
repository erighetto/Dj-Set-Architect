import { describe, expect, it } from "vitest";
import { generateSetDraft } from "../src/domain/set-generation/beamSearch.js";
import type { TrackWithFeatures } from "../src/shared/types/domain.js";

describe("beam search set generation", () => {
  it("includes user-defined seeds and avoids duplicates", () => {
    const tracks = Array.from({ length: 8 }, (_, index) => makeTrack(index));
    const draft = generateSetDraft(tracks, {
      targetDurationSeconds: 1200,
      durationToleranceSeconds: 240,
      seedTrackIds: [tracks[0].id, tracks[4].id],
      variantProfile: "balanced",
      energyCurve: "warmup_build_peak_cooldown"
    });

    expect(draft.tracks.map((track) => track.trackId)).toContain(tracks[0].id);
    expect(draft.tracks.map((track) => track.trackId)).toContain(tracks[4].id);
    expect(new Set(draft.tracks.map((track) => track.trackId)).size).toBe(draft.tracks.length);
    expect(Math.abs(draft.totalDurationSeconds - 1200)).toBeLessThanOrEqual(240);
  });

  it("keeps selected seeds even when they are outside the capped candidate pool", () => {
    const tracks = Array.from({ length: 510 }, (_, index) => makeTrack(index));
    const lateSeed = tracks[509];
    const draft = generateSetDraft(tracks, {
      targetDurationSeconds: 1200,
      durationToleranceSeconds: 300,
      seedTrackIds: [tracks[0].id, lateSeed.id],
      variantProfile: "balanced",
      energyCurve: "flat_groove"
    });

    expect(draft.tracks.map((track) => track.trackId)).toContain(lateSeed.id);
  });
});

function makeTrack(index: number): TrackWithFeatures {
  const now = new Date().toISOString();
  return {
    id: `track-${index}`,
    title: `Track ${index}`,
    artist: `Artist ${index % 5}`,
    durationSeconds: 300,
    importedBpm: 122 + index,
    createdAt: now,
    updatedAt: now,
    features: {
      trackId: `track-${index}`,
      bpm: 122 + index,
      bpmSource: "essentiajs",
      camelotKey: `${(index % 12) + 1}A`,
      keySource: "openkeyscan",
      energyScore: 0.35 + index * 0.06,
      danceabilityScore: 0.7,
      featureVersion: "test",
      updatedAt: now
    }
  };
}
