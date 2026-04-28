import type { AudioFeatureResult, FeatureSource, KeyDetectionResult, Track, TrackFeature } from "../../shared/types/domain.js";
import { FEATURE_VERSION } from "../../shared/constants/features.js";
import { normalizeToCamelotKey } from "../scoring/camelot.js";

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

export function normalizeBpm(value?: number | null): number | null {
  if (!value || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  let bpm = value;
  while (bpm < 70) {
    bpm *= 2;
  }
  while (bpm > 180) {
    bpm /= 2;
  }
  return Math.round(bpm * 10) / 10;
}

export function normalizeImportedTrack(input: {
  title?: unknown;
  artist?: unknown;
  album?: unknown;
  genre?: unknown;
  durationMs?: unknown;
  location?: unknown;
  bpm?: unknown;
  rating?: unknown;
  playCount?: unknown;
}): Omit<Track, "id" | "createdAt" | "updatedAt"> {
  const durationMs = Number(input.durationMs);
  const bpm = normalizeBpm(Number(input.bpm));
  return {
    title: String(input.title || "Untitled Track").trim(),
    artist: String(input.artist || "Unknown Artist").trim(),
    album: input.album ? String(input.album).trim() : null,
    genre: input.genre ? String(input.genre).trim() : null,
    durationSeconds: Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs / 1000) : 0,
    location: input.location ? decodeAppleMusicLocation(String(input.location)) : null,
    importedBpm: bpm,
    rating: input.rating == null ? null : Number(input.rating),
    playCount: input.playCount == null ? null : Number(input.playCount)
  };
}

export function decodeAppleMusicLocation(location: string): string {
  try {
    const url = new URL(location);
    if (url.protocol === "file:") {
      return decodeURIComponent(url.pathname);
    }
  } catch {
    return location;
  }
  return location;
}

export function mergeFeatureResults(
  track: Track,
  existing: TrackFeature | null | undefined,
  audio: AudioFeatureResult | null,
  key: KeyDetectionResult | null,
  options: { overwriteImportedBpm?: boolean } = {}
): TrackFeature {
  const now = new Date().toISOString();
  const importedBpm = normalizeBpm(track.importedBpm);
  const audioBpm = normalizeBpm(audio?.bpm);
  const bpm = options.overwriteImportedBpm ? audioBpm ?? importedBpm : importedBpm ?? audioBpm ?? existing?.bpm ?? null;
  const bpmSource: FeatureSource | null =
    bpm == null ? null : bpm === importedBpm && !options.overwriteImportedBpm ? "imported" : audio?.bpmSource ?? "essentiajs";

  const camelot = normalizeToCamelotKey(key?.camelotKey ?? key?.musicalKey ?? existing?.camelotKey);

  return {
    trackId: track.id,
    bpm,
    bpmSource,
    musicalKey: key?.musicalKey ?? existing?.musicalKey ?? null,
    camelotKey: camelot,
    keySource: camelot ? key?.keySource ?? existing?.keySource ?? "openkeyscan" : null,
    energyScore: audio ? clamp01(audio.energyScore) : existing?.energyScore ?? null,
    danceabilityScore: audio ? clamp01(audio.danceabilityScore) : existing?.danceabilityScore ?? null,
    loudness: audio?.loudness ?? existing?.loudness ?? null,
    spectralFlux: audio?.spectralFlux ?? existing?.spectralFlux ?? null,
    onsetDensity: audio?.onsetDensity ?? existing?.onsetDensity ?? null,
    lowFrequencyEnergy: audio?.lowFrequencyEnergy ?? existing?.lowFrequencyEnergy ?? null,
    dynamicComplexity: audio?.dynamicComplexity ?? existing?.dynamicComplexity ?? null,
    featureVersion: FEATURE_VERSION,
    updatedAt: now
  };
}
