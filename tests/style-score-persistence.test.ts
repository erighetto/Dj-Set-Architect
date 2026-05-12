import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { AppDatabase } from "../src/main/db/database.js";
import type { SetDraft, Track } from "../src/shared/types/domain.js";

describe("style score persistence", () => {
  it("saves and reloads transition styleScore and diagnostics", () => {
    const dir = mkdtempSync(join(tmpdir(), "djsa-db-"));
    let db: AppDatabase;
    try {
      db = new AppDatabase(join(dir, "test.sqlite"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("NODE_MODULE_VERSION")) {
        console.warn("Skipping better-sqlite3 persistence assertion because the native module is rebuilt for Electron ABI.");
        return;
      }
      throw error;
    }
    const now = new Date().toISOString();
    const tracks: Track[] = [
      makeTrack("a", "Seed", "Artist A", now),
      makeTrack("b", "Next", "Artist B", now)
    ];
    db.importTracks(tracks);

    const draft: SetDraft = {
      id: "draft-style",
      name: "Draft Style",
      variantProfile: "balanced",
      energyCurve: "flat_groove",
      targetDurationSeconds: 600,
      durationToleranceSeconds: 0,
      totalDurationSeconds: 600,
      durationDeviationSeconds: 0,
      globalScore: 0.8,
      createdAt: now,
      tracks: [
        { position: 1, trackId: "a", title: "Seed", artist: "Artist A", durationSeconds: 300 },
        { position: 2, trackId: "b", title: "Next", artist: "Artist B", durationSeconds: 300 }
      ],
      transitions: [
        {
          fromTrackId: "a",
          toTrackId: "b",
          transitionScore: 0.8,
          bpmScore: 0.9,
          keyScore: 0.8,
          energyScore: 0.7,
          danceabilityScore: 0.6,
          styleScore: 0.73,
          rationale: ["Strong style coherence with seed profile"]
        }
      ]
    };

    db.saveSetDraft(draft);
    const loaded = db.getSetDraft("draft-style");

    expect(loaded?.transitions[0].styleScore).toBeCloseTo(0.73);
    expect(loaded?.diagnostics?.averageStyleAffinity).toBeCloseTo(0.73);
  });
});

function makeTrack(id: string, title: string, artist: string, now: string): Track {
  return {
    id,
    title,
    artist,
    durationSeconds: 300,
    createdAt: now,
    updatedAt: now
  };
}
