import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import plist from "plist";
import type { Track } from "../../shared/types/domain.js";
import { normalizeImportedTrack } from "../../domain/features/normalization.js";

export interface ParsedAppleMusicLibrary {
  tracks: Track[];
}

interface AppleMusicTrackObject {
  Name?: unknown;
  Artist?: unknown;
  Album?: unknown;
  Genre?: unknown;
  "Total Time"?: unknown;
  Location?: unknown;
  BPM?: unknown;
  Rating?: unknown;
  "Play Count"?: unknown;
}

export async function parseAppleMusicXmlFile(filePath: string): Promise<ParsedAppleMusicLibrary> {
  const xml = await readFile(filePath, "utf8");
  return parseAppleMusicXml(xml);
}

export function parseAppleMusicXml(xml: string): ParsedAppleMusicLibrary {
  const parsed = plist.parse(xml) as { Tracks?: Record<string, AppleMusicTrackObject> };
  const tracksObject = parsed.Tracks ?? {};
  const now = new Date().toISOString();
  const tracks = Object.values(tracksObject)
    .map((raw) =>
      normalizeImportedTrack({
        title: raw.Name,
        artist: raw.Artist,
        album: raw.Album,
        genre: raw.Genre,
        durationMs: raw["Total Time"],
        location: raw.Location,
        bpm: raw.BPM,
        rating: raw.Rating,
        playCount: raw["Play Count"]
      })
    )
    .filter((track) => track.durationSeconds > 0)
    .map((track) => ({
      id: randomUUID(),
      ...track,
      createdAt: now,
      updatedAt: now
    }));

  return { tracks };
}
