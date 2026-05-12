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

  it("preselects stylistically relevant candidates beyond the first capped records", () => {
    const seed = makeTrack(0, { id: "seed", genre: "Deep House", artist: "Seed Artist", styleTags: ["deep_house"] });
    const bad = Array.from({ length: 505 }, (_, index) =>
      makeTrack(index + 1, {
        id: `bad-${index}`,
        artist: `A Bad ${index}`,
        genre: "Son Cubano",
        styleTags: ["son_cubano"],
        bpm: 121,
        energyScore: 0.52
      })
    );
    const lateGood = makeTrack(900, {
      id: "zz-late-good",
      artist: "Z Late",
      genre: "Disco House",
      styleTags: ["disco_house"],
      bpm: 122,
      energyScore: 0.54
    });
    const draft = generateSetDraft([seed, ...bad, lateGood], {
      targetDurationSeconds: 600,
      durationToleranceSeconds: 0,
      seedTrackIds: [seed.id],
      variantProfile: "balanced",
      energyCurve: "flat_groove"
    });

    expect(draft.tracks.map((track) => track.trackId)).toContain(lateGood.id);
  });

  it("balanced profile rejects severe style outliers", () => {
    const seed = makeTrack(0, { id: "seed", genre: "Deep House", styleTags: ["deep_house"] });
    const outlier = makeTrack(1, { id: "outlier", genre: "Son Cubano", styleTags: ["son_cubano"], bpm: 121, energyScore: 0.5 });
    const related = makeTrack(2, { id: "related", genre: "Tech House", styleTags: ["tech_house"], bpm: 121, energyScore: 0.5 });
    const draft = generateSetDraft([seed, outlier, related], {
      targetDurationSeconds: 600,
      durationToleranceSeconds: 0,
      seedTrackIds: [seed.id],
      variantProfile: "balanced",
      energyCurve: "flat_groove"
    });

    expect(draft.tracks.map((track) => track.trackId)).toContain(related.id);
    expect(draft.tracks.map((track) => track.trackId)).not.toContain(outlier.id);
  });

  it("exploratory profile can accept weak but related electronic candidates", () => {
    const seed = makeTrack(0, { id: "seed", genre: "Deep House", styleTags: ["deep_house"] });
    const related = makeTrack(1, { id: "techno", genre: "Techno", styleTags: ["techno"], bpm: 121, energyScore: 0.5 });
    const draft = generateSetDraft([seed, related], {
      targetDurationSeconds: 600,
      durationToleranceSeconds: 0,
      seedTrackIds: [seed.id],
      variantProfile: "exploratory",
      energyCurve: "flat_groove"
    });

    expect(draft.tracks.map((track) => track.trackId)).toContain(related.id);
  });

  it("does not over-cluster one primary artist when alternatives exist", () => {
    const seed = makeTrack(0, { id: "seed", artist: "Resident DJ", genre: "Deep House", styleTags: ["deep_house"] });
    const sameArtist = [1, 2, 3].map((index) =>
      makeTrack(index, { id: `same-${index}`, artist: "Resident DJ ft. Guest", genre: "Deep House", styleTags: ["deep_house"] })
    );
    const alternatives = [4, 5, 6].map((index) =>
      makeTrack(index, { id: `alt-${index}`, artist: `Different ${index}`, genre: "Deep House", styleTags: ["deep_house"] })
    );
    const draft = generateSetDraft([seed, ...sameArtist, ...alternatives], {
      targetDurationSeconds: 1200,
      durationToleranceSeconds: 0,
      seedTrackIds: [seed.id],
      variantProfile: "balanced",
      energyCurve: "flat_groove"
    });
    const residentCount = draft.tracks.filter((track) => track.artist.toLowerCase().includes("resident dj")).length;

    expect(residentCount).toBeLessThanOrEqual(2);
  });
});

function makeTrack(index: number, overrides: Partial<TrackWithFeatures> & { bpm?: number; energyScore?: number; styleTags?: string[] } = {}): TrackWithFeatures {
  const now = new Date().toISOString();
  const bpm = overrides.bpm ?? 122 + (index % 10);
  const energyScore = overrides.energyScore ?? 0.45 + (index % 5) * 0.04;
  const styleTags = overrides.styleTags ?? ["electronic"];
  return {
    id: `track-${index}`,
    title: `Track ${index}`,
    artist: `Artist ${index % 5}`,
    genre: "Electronic",
    durationSeconds: 300,
    importedBpm: bpm,
    createdAt: now,
    updatedAt: now,
    ...overrides,
    features: {
      trackId: `track-${index}`,
      bpm,
      bpmSource: "essentiajs",
      camelotKey: `${(index % 12) + 1}A`,
      keySource: "openkeyscan",
      energyScore,
      danceabilityScore: 0.7,
      styleTags,
      featureVersion: "test",
      updatedAt: now,
      ...overrides.features
    }
  };
}
