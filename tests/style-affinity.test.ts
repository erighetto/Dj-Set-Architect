import { describe, it, expect } from "vitest";
import {
  extractStyleTags,
  normalizeStyleTags,
  deriveStyleProfile,
  computeStyleAffinityScore,
  isStyleOutlier,
  getStyleRationale
} from "../src/domain/scoring/styleAffinity";
import type { TrackWithFeatures } from "../src/shared/types/domain";

const createTrack = (overrides: Partial<TrackWithFeatures> = {}): TrackWithFeatures => ({
  id: `track-${Math.random()}`,
  title: "Test Track",
  artist: "Test Artist",
  album: "Test Album",
  genre: "Electronic",
  durationSeconds: 300,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides
});

describe("Style Affinity", () => {
  describe("extractStyleTags", () => {
    it("extracts tags from genre field", () => {
      const track = createTrack({ genre: "Deep House" });
      const tags = extractStyleTags(track);
      expect(tags).toContain("deep_house");
    });

    it("handles multiple genres separated by slashes", () => {
      const track = createTrack({ genre: "Deep House / Minimal House" });
      const tags = extractStyleTags(track);
      expect(tags.some((t) => t.includes("deep"))).toBe(true);
      expect(tags.some((t) => t.includes("minimal"))).toBe(true);
    });

    it("returns electronic fallback when no genre", () => {
      const track = createTrack({ genre: null });
      const tags = extractStyleTags(track);
      expect(tags).toContain("electronic");
    });
  });

  describe("normalizeStyleTags", () => {
    it("normalizes common aliases", () => {
      const tags = ["deep-house", "tech house", "acid house"];
      const normalized = normalizeStyleTags(tags);
      expect(normalized).toContain("deep_house");
      expect(normalized).toContain("tech_house");
      expect(normalized).toContain("acid_house");
    });

    it("removes duplicates after normalization", () => {
      const tags = ["deep_house", "deep-house", "deep house"];
      const normalized = normalizeStyleTags(tags);
      const deepHouseCount = normalized.filter((t) => t === "deep_house").length;
      expect(deepHouseCount).toBe(1);
    });
  });

  describe("deriveStyleProfile", () => {
    it("derives profile from seed tracks", () => {
      const seeds = [
        createTrack({ genre: "Deep House" }),
        createTrack({ genre: "Deep House" }),
        createTrack({ genre: "Minimal Techno" })
      ];

      const profile = deriveStyleProfile(seeds);

      expect(profile.mainStyles.length).toBeGreaterThan(0);
      expect(profile.tags.size).toBeGreaterThan(0);
    });

    it("weights frequent tags higher", () => {
      const seeds = [
        createTrack({ genre: "Deep House" }),
        createTrack({ genre: "Deep House" }),
        createTrack({ genre: "Tech House" })
      ];

      const profile = deriveStyleProfile(seeds);
      const deepHouseFreq = profile.tags.get("deep_house") ?? 0;
      const techHouseFreq = profile.tags.get("tech_house") ?? 0;

      expect(deepHouseFreq).toBeGreaterThan(techHouseFreq);
    });

    it("selects top 3-5 main styles", () => {
      const seeds = Array.from({ length: 10 }, (_, i) =>
        createTrack({ genre: ["Deep House", "Minimal", "Ambient", "Tech House", "Ambient"][i % 5] })
      );

      const profile = deriveStyleProfile(seeds);

      expect(profile.mainStyles.length).toBeGreaterThanOrEqual(3);
      expect(profile.mainStyles.length).toBeLessThanOrEqual(5);
    });
  });

  describe("computeStyleAffinityScore", () => {
    it("returns high score for exact style match", () => {
      const profile = deriveStyleProfile([createTrack({ genre: "Deep House" })]);
      const candidate = createTrack({
        genre: "Deep House",
        features: { trackId: "test", styleTags: ["deep_house"], featureVersion: "1", updatedAt: new Date().toISOString() }
      });

      const score = computeStyleAffinityScore(candidate, profile);

      expect(score).toBeGreaterThan(0.8);
    });

    it("returns low score for unrelated style", () => {
      const profile = deriveStyleProfile([createTrack({ genre: "Deep House" })]);
      const candidate = createTrack({
        genre: "Country",
        features: { trackId: "test", styleTags: ["country", "folk"], featureVersion: "1", updatedAt: new Date().toISOString() }
      });

      const score = computeStyleAffinityScore(candidate, profile);

      expect(score).toBeLessThan(0.3);
    });

    it("returns neutral score for empty tags", () => {
      const profile = deriveStyleProfile([createTrack({ genre: "Deep House" })]);
      const candidate = createTrack({
        genre: null,
        features: { trackId: "test", styleTags: [], featureVersion: "1", updatedAt: new Date().toISOString() }
      });

      const score = computeStyleAffinityScore(candidate, profile);

      expect(score).toBeCloseTo(0.5, 0.2);
    });
  });

  describe("isStyleOutlier", () => {
    it("marks low-affinity track as outlier in safe profile", () => {
      const isOutlier = isStyleOutlier(0.3, "safe");
      expect(isOutlier).toBe(true);
    });

    it("does not mark medium-affinity track as outlier in safe profile", () => {
      const isOutlier = isStyleOutlier(0.7, "safe");
      expect(isOutlier).toBe(false);
    });

    it("uses higher threshold for balanced profile", () => {
      expect(isStyleOutlier(0.35, "safe")).toBe(true);
      expect(isStyleOutlier(0.35, "balanced")).toBe(false);
    });

    it("uses lower threshold for exploratory profile", () => {
      expect(isStyleOutlier(0.15, "balanced")).toBe(true);
      expect(isStyleOutlier(0.15, "exploratory")).toBe(false);
    });
  });

  describe("getStyleRationale", () => {
    it("generates rationale for strong coherence", () => {
      const rationale = getStyleRationale(0.9, ["deep_house"], ["deep_house", "minimal"]);
      expect(rationale).toContain("Strong style coherence");
    });

    it("generates rationale for moderate compatibility", () => {
      const rationale = getStyleRationale(0.7, ["deep_house"], ["deep_house", "minimal"]);
      expect(rationale).toContain("coherence");
    });

    it("generates rationale for weak compatibility", () => {
      const rationale = getStyleRationale(0.3, ["country"], ["deep_house"]);
      expect(rationale).toContain("diverges");
    });

    it("includes shared tags in rationale", () => {
      const rationale = getStyleRationale(0.6, ["deep_house", "minimal"], ["deep_house", "techno"]);
      expect(rationale).toContain("deep_house");
    });
  });
});
