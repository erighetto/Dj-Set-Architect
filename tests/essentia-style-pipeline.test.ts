import { describe, it, expect } from "vitest";
import { deterministicFeatureResult } from "../src/main/adapters/essentia/EssentiaAudioFeatureProvider.js";
import { mergeFeatureResults } from "../src/domain/features/normalization.js";
import type { Track } from "../src/shared/types/domain.js";

const createTrack = (overrides: Partial<Track> = {}): Track => ({
  id: `track-${Math.random()}`,
  title: "Test Track",
  artist: "Test Artist",
  durationSeconds: 180,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides
});

describe("Essentia style pipeline", () => {
  it("generates style tags, source, and embedding for deterministic results", () => {
    const track = createTrack({ genre: "Deep House", location: "/tmp/test.wav" });
    const result = deterministicFeatureResult(track);

    expect(result.styleTags).toBeDefined();
    expect(result.styleTags).toContain("deep_house");
    expect(result.styleSource).toBe("essentiajs");
    expect(Array.isArray(result.styleEmbedding)).toBe(true);
    expect(result.styleEmbedding?.length).toBeGreaterThan(0);
  });

  it("merges audio style metadata into track features", () => {
    const track = createTrack({ genre: "House", location: "/tmp/test.wav" });
    const audio = deterministicFeatureResult(track);
    const feature = mergeFeatureResults(track, null, audio, null);

    expect(feature.styleTags).toEqual(audio.styleTags);
    expect(feature.styleSource).toBe("essentiajs");
    expect(feature.styleEmbedding).toEqual(audio.styleEmbedding);
  });
});
