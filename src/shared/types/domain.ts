export type FeatureSource = "imported" | "manual" | "essentiajs" | "openkeyscan" | "stub" | "unknown";

export type VariantProfile = "safe" | "balanced" | "exploratory";

export type EnergyCurve = "warmup_build_peak_cooldown" | "flat_groove" | "wave_pattern";

export type AnalysisJobStatus = "queued" | "running" | "completed" | "failed";

export type AnalysisJobType = "library_import" | "feature_analysis" | "key_analysis" | "set_generation" | "export";

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string | null;
  genre?: string | null;
  durationSeconds: number;
  location?: string | null;
  importedBpm?: number | null;
  rating?: number | null;
  playCount?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TrackFeature {
  trackId: string;
  bpm?: number | null;
  bpmSource?: FeatureSource | null;
  musicalKey?: string | null;
  camelotKey?: string | null;
  keySource?: FeatureSource | null;
  energyScore?: number | null;
  danceabilityScore?: number | null;
  loudness?: number | null;
  spectralFlux?: number | null;
  onsetDensity?: number | null;
  lowFrequencyEnergy?: number | null;
  dynamicComplexity?: number | null;
  styleTags?: string[] | null;
  styleSource?: FeatureSource | null;
  styleEmbedding?: number[] | null;
  featureVersion: string;
  updatedAt: string;
}

export interface TrackWithFeatures extends Track {
  features?: TrackFeature | null;
}

export interface SetTrack {
  position: number;
  trackId: string;
  title: string;
  artist: string;
  durationSeconds: number;
  bpm?: number | null;
  camelotKey?: string | null;
  energyScore?: number | null;
  danceabilityScore?: number | null;
  styleTags?: string[] | null;
}

export interface TransitionScore {
  fromTrackId: string;
  toTrackId: string;
  transitionScore: number;
  bpmScore: number;
  keyScore: number;
  energyScore: number;
  danceabilityScore?: number | null;
  moodScore?: number | null;
  genreScore?: number | null;
  styleScore?: number | null;
  rationale: string[];
}

export interface SetDraft {
  id: string;
  name: string;
  variantProfile: VariantProfile;
  energyCurve: EnergyCurve;
  targetDurationSeconds: number;
  durationToleranceSeconds: number;
  totalDurationSeconds: number;
  durationDeviationSeconds: number;
  globalScore: number;
  tracks: SetTrack[];
  transitions: TransitionScore[];
  createdAt: string;
}

export interface AnalysisJob {
  id: string;
  type: AnalysisJobType;
  status: AnalysisJobStatus;
  progress: number;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OpenKeyScanHealth {
  available: boolean;
  url: string;
  status?: string | null;
  success?: boolean | null;
  timestamp?: number | null;
  error?: string | null;
}

export interface KeyDetectionResult {
  trackId: string;
  musicalKey?: string | null;
  camelotKey?: string | null;
  keySource: FeatureSource;
  confidence?: number | null;
  error?: string | null;
}

export interface AudioFeatureResult {
  trackId: string;
  bpm?: number | null;
  bpmSource?: FeatureSource | null;
  energyScore: number;
  danceabilityScore: number;
  loudness?: number | null;
  spectralFlux?: number | null;
  onsetDensity?: number | null;
  lowFrequencyEnergy?: number | null;
  dynamicComplexity?: number | null;
  featureVersion: string;
}

export interface GenerateSetRequest {
  targetDurationSeconds: number;
  durationToleranceSeconds: number;
  seedTrackIds: string[];
  variantProfile: VariantProfile;
  energyCurve: EnergyCurve;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  total: number;
}

export interface FeatureCoverage {
  trackCount: number;
  withBpm: number;
  withKey: number;
  withEnergy: number;
  withDanceability: number;
  pendingJobs: number;
  runningJobs: number;
  latestFeatureAnalysisJob?: AnalysisJob | null;
  openKeyScan?: OpenKeyScanHealth;
}
