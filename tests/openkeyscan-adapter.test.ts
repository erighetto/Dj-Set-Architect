import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenKeyScanAdapter } from "../src/main/adapters/openkeyscan/OpenKeyScanAdapter.js";
import type { Track } from "../src/shared/types/domain.js";

describe("OpenKeyScanAdapter", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fetchMock.mockReset();
  });

  it("uses the /analyze/single endpoint and maps OpenKeyScan response keys", async () => {
    const adapter = new OpenKeyScanAdapter("http://127.0.0.1:58721");
    const track: Track = {
      id: "track-1",
      title: "Test Track",
      artist: "Test Artist",
      album: null,
      genre: null,
      durationSeconds: 180,
      location: "/tmp/track.mp3",
      importedBpm: null,
      rating: null,
      playCount: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.endsWith("/health")) {
        return {
          ok: true,
          json: async () => ({ success: true, status: "ok", timestamp: 12345 })
        };
      }

      if (url.endsWith("/analyze/single")) {
        expect(init?.method).toBe("POST");
        expect(init?.headers).toEqual({ "content-type": "application/json" });
        expect(init?.body).toBe(JSON.stringify({ file: track.location }));

        return {
          ok: true,
          json: async () => ({ success: true, file: track.location, key: "11m" })
        };
      }

      throw new Error(`Unexpected fetch call to ${url}`);
    });

    const result = await adapter.analyze(track);

    expect(result).toEqual({
      trackId: "track-1",
      musicalKey: "11m",
      camelotKey: "11A",
      keySource: "openkeyscan",
      confidence: null
    });
  });
});
