import * as electron from "electron";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  AnalysisJob,
  FeatureCoverage,
  ImportResult,
  SetDraft,
  Track,
  TrackFeature,
  TrackWithFeatures
} from "../../shared/types/domain.js";
import { SCHEMA_SQL } from "./schema.js";

const { app } = electron;

type DbTrackRow = {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  genre: string | null;
  duration_seconds: number;
  location: string | null;
  imported_bpm: number | null;
  rating: number | null;
  play_count: number | null;
  created_at: string;
  updated_at: string;
  bpm: number | null;
  bpm_source: string | null;
  musical_key: string | null;
  camelot_key: string | null;
  key_source: string | null;
  energy_score: number | null;
  danceability_score: number | null;
  loudness: number | null;
  spectral_flux: number | null;
  onset_density: number | null;
  low_frequency_energy: number | null;
  dynamic_complexity: number | null;
  feature_version: string | null;
  style_tags: string | null;
  style_source: string | null;
  style_embedding: string | null;
  feature_updated_at: string | null;
};

export class AppDatabase {
  private db: Database.Database;

  constructor(dbPath = defaultDbPath()) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(SCHEMA_SQL);
    this.resetStuckJobs();
  }

  resetStuckJobs(): void {
    this.db
      .prepare(
        `UPDATE analysis_jobs
         SET status = 'failed',
             progress = 1,
             error = 'Interrupted job cleared after application restart'
         WHERE status = 'running'`
      )
      .run();
  }

  importTracks(tracks: Track[]): ImportResult {
    const findDuplicate = this.db.prepare(`
      SELECT id FROM tracks
      WHERE (location IS NOT NULL AND location = @location)
         OR (title = @title AND artist = @artist AND duration_seconds = @durationSeconds)
      LIMIT 1
    `);
    const insert = this.db.prepare(`
      INSERT INTO tracks (
        id, title, artist, album, genre, duration_seconds, location, imported_bpm,
        rating, play_count, created_at, updated_at
      ) VALUES (
        @id, @title, @artist, @album, @genre, @durationSeconds, @location, @importedBpm,
        @rating, @playCount, @createdAt, @updatedAt
      )
    `);

    let imported = 0;
    let skipped = 0;
    const transaction = this.db.transaction((items: Track[]) => {
      for (const track of items) {
        const duplicate = findDuplicate.get(track) as { id: string } | undefined;
        if (duplicate) {
          skipped += 1;
          continue;
        }
        insert.run(track);
        imported += 1;
      }
    });
    transaction(tracks);
    return { imported, skipped, total: tracks.length };
  }

  searchTracks(input: { query?: string; limit?: number } = {}): TrackWithFeatures[] {
    const limit = input.limit ?? 100;
    const query = input.query?.trim();
    const sql = `${TRACK_SELECT_SQL}
      ${query ? "WHERE tracks.title LIKE @like OR tracks.artist LIKE @like OR tracks.album LIKE @like OR tracks.genre LIKE @like" : ""}
      ORDER BY tracks.artist, tracks.title
      LIMIT @limit`;
    const rows = this.db.prepare(sql).all({ like: `%${query}%`, limit }) as DbTrackRow[];
    return rows.map(mapTrackWithFeatures);
  }

  getTrackById(id: string): TrackWithFeatures | null {
    const row = this.db.prepare(`${TRACK_SELECT_SQL} WHERE tracks.id = @id`).get({ id }) as DbTrackRow | undefined;
    return row ? mapTrackWithFeatures(row) : null;
  }

  getAllTracksForGeneration(): TrackWithFeatures[] {
    const rows = this.db.prepare(`${TRACK_SELECT_SQL} ORDER BY tracks.artist, tracks.title`).all() as DbTrackRow[];
    return rows.map(mapTrackWithFeatures);
  }

  getTracksNeedingAnalysis(): TrackWithFeatures[] {
    const rows = this.db
      .prepare(
        `${TRACK_SELECT_SQL}
         WHERE track_features.track_id IS NULL
            OR track_features.energy_score IS NULL
            OR track_features.danceability_score IS NULL
            OR track_features.camelot_key IS NULL
            OR track_features.key_source IS NULL
         ORDER BY tracks.artist, tracks.title`
      )
      .all() as DbTrackRow[];
    return rows.map(mapTrackWithFeatures);
  }

  upsertFeature(feature: TrackFeature): void {
    const payload = {
      ...feature,
      styleTags: feature.styleTags ? JSON.stringify(feature.styleTags) : null,
      styleEmbedding: feature.styleEmbedding ? JSON.stringify(feature.styleEmbedding) : null
    };

    this.db
      .prepare(
        `
        INSERT INTO track_features (
          track_id, bpm, bpm_source, musical_key, camelot_key, key_source,
          energy_score, danceability_score, loudness, spectral_flux, onset_density,
          low_frequency_energy, dynamic_complexity, style_tags, style_source,
          style_embedding, feature_version, updated_at
        ) VALUES (
          @trackId, @bpm, @bpmSource, @musicalKey, @camelotKey, @keySource,
          @energyScore, @danceabilityScore, @loudness, @spectralFlux, @onsetDensity,
          @lowFrequencyEnergy, @dynamicComplexity, @styleTags, @styleSource,
          @styleEmbedding, @featureVersion, @updatedAt
        )
        ON CONFLICT(track_id) DO UPDATE SET
          bpm = excluded.bpm,
          bpm_source = excluded.bpm_source,
          musical_key = excluded.musical_key,
          camelot_key = excluded.camelot_key,
          key_source = excluded.key_source,
          energy_score = excluded.energy_score,
          danceability_score = excluded.danceability_score,
          loudness = excluded.loudness,
          spectral_flux = excluded.spectral_flux,
          onset_density = excluded.onset_density,
          low_frequency_energy = excluded.low_frequency_energy,
          dynamic_complexity = excluded.dynamic_complexity,
          style_tags = excluded.style_tags,
          style_source = excluded.style_source,
          style_embedding = excluded.style_embedding,
          feature_version = excluded.feature_version,
          updated_at = excluded.updated_at
        `
      )
      .run(payload);
  }

  pruneAnalysisData(): void {
    const transaction = this.db.transaction(() => {
      this.db.prepare("DELETE FROM track_features").run();
      this.db.prepare("DELETE FROM analysis_jobs WHERE type IN ('feature_analysis', 'key_analysis')").run();
    });
    transaction();
  }

  createJob(type: AnalysisJob["type"]): AnalysisJob {
    const now = new Date().toISOString();
    const job: AnalysisJob = {
      id: randomUUID(),
      type,
      status: "queued",
      progress: 0,
      error: null,
      createdAt: now,
      updatedAt: now
    };
    this.db
      .prepare(
        `INSERT INTO analysis_jobs (id, type, status, progress, error, created_at, updated_at)
         VALUES (@id, @type, @status, @progress, @error, @createdAt, @updatedAt)`
      )
      .run(job);
    return job;
  }

  updateJob(id: string, patch: Partial<Pick<AnalysisJob, "status" | "progress" | "error">>): void {
    const current = this.db.prepare("SELECT * FROM analysis_jobs WHERE id = @id").get({ id }) as AnalysisJob | undefined;
    if (!current) {
      return;
    }
    this.db
      .prepare(
        `UPDATE analysis_jobs SET
          status = @status,
          progress = @progress,
          error = @error,
          updated_at = @updatedAt
         WHERE id = @id`
      )
      .run({
        id,
        status: patch.status ?? current.status,
        progress: patch.progress ?? current.progress,
        error: patch.error ?? current.error,
        updatedAt: new Date().toISOString()
      });
  }

  getLatestJob(type?: AnalysisJob["type"]): AnalysisJob | null {
    const row = this.db
      .prepare(
        `SELECT id, type, status, progress, error, created_at, updated_at
         FROM analysis_jobs
         ${type ? "WHERE type = @type" : ""}
         ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
         LIMIT 1`
      )
      .get(type ? { type } : {}) as
      | {
          id: string;
          type: AnalysisJob["type"];
          status: AnalysisJob["status"];
          progress: number;
          error: string | null;
          created_at: string;
          updated_at: string;
        }
      | undefined;
    return row ? mapAnalysisJob(row) : null;
  }

  getCoverage(): FeatureCoverage {
    const row = this.db
      .prepare(
        `
        SELECT
          COUNT(tracks.id) AS trackCount,
          SUM(CASE WHEN COALESCE(track_features.bpm, tracks.imported_bpm) IS NOT NULL THEN 1 ELSE 0 END) AS withBpm,
          SUM(CASE WHEN track_features.camelot_key IS NOT NULL THEN 1 ELSE 0 END) AS withKey,
          SUM(CASE WHEN track_features.energy_score IS NOT NULL THEN 1 ELSE 0 END) AS withEnergy,
          SUM(CASE WHEN track_features.danceability_score IS NOT NULL THEN 1 ELSE 0 END) AS withDanceability
        FROM tracks
        LEFT JOIN track_features ON track_features.track_id = tracks.id
        `
      )
      .get() as Record<string, number | null>;
    const jobs = this.db
      .prepare(
        `SELECT
          SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS pendingJobs,
          SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS runningJobs
        FROM analysis_jobs`
      )
      .get() as Record<string, number | null>;
    return {
      trackCount: row.trackCount ?? 0,
      withBpm: row.withBpm ?? 0,
      withKey: row.withKey ?? 0,
      withEnergy: row.withEnergy ?? 0,
      withDanceability: row.withDanceability ?? 0,
      pendingJobs: jobs.pendingJobs ?? 0,
      runningJobs: jobs.runningJobs ?? 0,
      latestFeatureAnalysisJob: this.getLatestJob("feature_analysis")
    };
  }

  saveSetDraft(setDraft: SetDraft): void {
    const transaction = this.db.transaction((draft: SetDraft) => {
      this.db
        .prepare(
          `INSERT INTO sets (
            id, name, variant_profile, energy_curve, target_duration_seconds,
            duration_tolerance_seconds, total_duration_seconds, duration_deviation_seconds,
            global_score, created_at
          ) VALUES (
            @id, @name, @variantProfile, @energyCurve, @targetDurationSeconds,
            @durationToleranceSeconds, @totalDurationSeconds, @durationDeviationSeconds,
            @globalScore, @createdAt
          )`
        )
        .run(draft);
      const insertTrack = this.db.prepare(
        `INSERT INTO set_tracks (set_id, track_id, position) VALUES (@setId, @trackId, @position)`
      );
      for (const track of draft.tracks) {
        insertTrack.run({ setId: draft.id, trackId: track.trackId, position: track.position });
      }
      const insertTransition = this.db.prepare(
        `INSERT INTO transition_scores (
          id, set_id, from_track_id, to_track_id, transition_score, bpm_score,
          key_score, energy_score, danceability_score, mood_score, genre_score, rationale_json
        ) VALUES (
          @id, @setId, @fromTrackId, @toTrackId, @transitionScore, @bpmScore,
          @keyScore, @energyScore, @danceabilityScore, @moodScore, @genreScore, @rationaleJson
        )`
      );
      for (const transition of draft.transitions) {
        insertTransition.run({
          id: randomUUID(),
          setId: draft.id,
          ...transition,
          rationaleJson: JSON.stringify(transition.rationale)
        });
      }
    });
    transaction(setDraft);
  }

  getSetDraft(id: string): SetDraft | null {
    const set = this.db.prepare("SELECT * FROM sets WHERE id = @id").get({ id }) as
      | {
          id: string;
          name: string;
          variant_profile: string;
          energy_curve: string;
          target_duration_seconds: number;
          duration_tolerance_seconds: number;
          total_duration_seconds: number;
          duration_deviation_seconds: number;
          global_score: number;
          created_at: string;
        }
      | undefined;
    if (!set) {
      return null;
    }
    const tracks = this.db
      .prepare(
        `
        SELECT set_tracks.position, tracks.*, track_features.*
        FROM set_tracks
        JOIN tracks ON tracks.id = set_tracks.track_id
        LEFT JOIN track_features ON track_features.track_id = tracks.id
        WHERE set_tracks.set_id = @id
        ORDER BY set_tracks.position
        `
      )
      .all({ id }) as (DbTrackRow & { position: number })[];
    const transitions = this.db
      .prepare("SELECT * FROM transition_scores WHERE set_id = @id")
      .all({ id }) as Array<Record<string, unknown>>;
    return {
      id: set.id,
      name: set.name,
      variantProfile: set.variant_profile as SetDraft["variantProfile"],
      energyCurve: set.energy_curve as SetDraft["energyCurve"],
      targetDurationSeconds: set.target_duration_seconds,
      durationToleranceSeconds: set.duration_tolerance_seconds,
      totalDurationSeconds: set.total_duration_seconds,
      durationDeviationSeconds: set.duration_deviation_seconds,
      globalScore: set.global_score,
      createdAt: set.created_at,
      tracks: tracks.map((row) => {
        const track = mapTrackWithFeatures(row);
        return {
          position: row.position,
          trackId: track.id,
          title: track.title,
          artist: track.artist,
          durationSeconds: track.durationSeconds,
          bpm: track.features?.bpm ?? track.importedBpm ?? null,
          camelotKey: track.features?.camelotKey ?? null,
          energyScore: track.features?.energyScore ?? null,
          danceabilityScore: track.features?.danceabilityScore ?? null
        };
      }),
      transitions: transitions.map((row) => ({
        fromTrackId: String(row.from_track_id),
        toTrackId: String(row.to_track_id),
        transitionScore: Number(row.transition_score),
        bpmScore: Number(row.bpm_score),
        keyScore: Number(row.key_score),
        energyScore: Number(row.energy_score),
        danceabilityScore: row.danceability_score == null ? null : Number(row.danceability_score),
        moodScore: row.mood_score == null ? null : Number(row.mood_score),
        genreScore: row.genre_score == null ? null : Number(row.genre_score),
        rationale: JSON.parse(String(row.rationale_json)) as string[]
      }))
    };
  }
}

const TRACK_SELECT_SQL = `
  SELECT
    tracks.id, tracks.title, tracks.artist, tracks.album, tracks.genre, tracks.duration_seconds,
    tracks.location, tracks.imported_bpm, tracks.rating, tracks.play_count,
    tracks.created_at, tracks.updated_at,
    track_features.bpm, track_features.bpm_source, track_features.musical_key,
    track_features.camelot_key, track_features.key_source, track_features.energy_score,
    track_features.danceability_score, track_features.loudness, track_features.spectral_flux,
    track_features.onset_density, track_features.low_frequency_energy,
    track_features.dynamic_complexity, track_features.style_tags, track_features.style_source,
    track_features.style_embedding, track_features.feature_version,
    track_features.updated_at AS feature_updated_at
  FROM tracks
  LEFT JOIN track_features ON track_features.track_id = tracks.id
`;

function parseOptionalJson<T>(value: string | null | undefined): T | null {
  if (value == null) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function mapTrackWithFeatures(row: DbTrackRow): TrackWithFeatures {
  const features: TrackFeature | null =
    row.feature_version == null
      ? null
      : {
          trackId: row.id,
          bpm: row.bpm,
          bpmSource: row.bpm_source as TrackFeature["bpmSource"],
          musicalKey: row.musical_key,
          camelotKey: row.camelot_key,
          keySource: row.key_source as TrackFeature["keySource"],
          energyScore: row.energy_score,
          danceabilityScore: row.danceability_score,
          loudness: row.loudness,
          spectralFlux: row.spectral_flux,
          onsetDensity: row.onset_density,
          lowFrequencyEnergy: row.low_frequency_energy,
          dynamicComplexity: row.dynamic_complexity,
          styleTags: parseOptionalJson<string[]>(row.style_tags),
          styleSource: row.style_source as TrackFeature["styleSource"],
          styleEmbedding: parseOptionalJson<number[]>(row.style_embedding),
          featureVersion: row.feature_version,
          updatedAt: row.feature_updated_at ?? row.updated_at
        };

  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    genre: row.genre,
    durationSeconds: row.duration_seconds,
    location: row.location,
    importedBpm: row.imported_bpm,
    rating: row.rating,
    playCount: row.play_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    features
  };
}

function mapAnalysisJob(row: {
  id: string;
  type: AnalysisJob["type"];
  status: AnalysisJob["status"];
  progress: number;
  error: string | null;
  created_at: string;
  updated_at: string;
}): AnalysisJob {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    progress: row.progress,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function defaultDbPath(): string {
  return join(app.getPath("userData"), "dj-set-architect.sqlite");
}
