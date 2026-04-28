import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAppleMusicXml } from "../src/main/importers/appleMusicXmlImporter.js";

describe("Apple Music XML importer", () => {
  it("parses Apple Music plist tracks into normalized tracks", () => {
    const xml = readFileSync(join(process.cwd(), "tests/fixtures/apple-music-sample.xml"), "utf8");
    const parsed = parseAppleMusicXml(xml);
    expect(parsed.tracks).toHaveLength(2);
    expect(parsed.tracks[0].title).toBe("First Groove");
    expect(parsed.tracks[0].durationSeconds).toBe(360);
    expect(parsed.tracks[0].importedBpm).toBe(124);
    expect(parsed.tracks[0].location).toBe("/Users/dj/Music/First Groove.mp3");
  });
});
