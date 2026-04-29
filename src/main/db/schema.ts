export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  genre TEXT,
  duration_seconds INTEGER NOT NULL,
  location TEXT,
  imported_bpm REAL,
  rating INTEGER,
  play_count INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tracks_location_unique
  ON tracks(location)
  WHERE location IS NOT NULL AND location != '';

CREATE INDEX IF NOT EXISTS idx_tracks_title_artist_duration
  ON tracks(title, artist, duration_seconds);

CREATE TABLE IF NOT EXISTS track_features (
  track_id TEXT PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
  bpm REAL,
  bpm_source TEXT,
  musical_key TEXT,
  camelot_key TEXT,
  key_source TEXT,
  energy_score REAL,
  danceability_score REAL,
  loudness REAL,
  spectral_flux REAL,
  onset_density REAL,
  low_frequency_energy REAL,
  dynamic_complexity REAL,
  style_tags TEXT,
  style_source TEXT,
  style_embedding TEXT,
  feature_version TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analysis_jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  progress REAL NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  variant_profile TEXT NOT NULL,
  energy_curve TEXT NOT NULL,
  target_duration_seconds INTEGER NOT NULL,
  duration_tolerance_seconds INTEGER NOT NULL,
  total_duration_seconds INTEGER NOT NULL,
  duration_deviation_seconds INTEGER NOT NULL,
  global_score REAL NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS set_tracks (
  set_id TEXT NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (set_id, position)
);

CREATE TABLE IF NOT EXISTS transition_scores (
  id TEXT PRIMARY KEY,
  set_id TEXT NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
  from_track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  to_track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  transition_score REAL NOT NULL,
  bpm_score REAL NOT NULL,
  key_score REAL NOT NULL,
  energy_score REAL NOT NULL,
  danceability_score REAL,
  mood_score REAL,
  genre_score REAL,
  style_score REAL,
  rationale_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_overrides (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  value_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;
