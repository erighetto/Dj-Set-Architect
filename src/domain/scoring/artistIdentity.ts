import type { TrackWithFeatures } from "../../shared/types/domain.js";

const ARTIST_SPLIT_PATTERN = /\s+(?:feat\.?|ft\.?|featuring)\s+|\/|,|&|\s+x\s+/i;

export function normalizeArtistName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function getArtistTokens(artist: string): string[] {
  const normalized = normalizeArtistName(artist);
  return normalized
    .split(ARTIST_SPLIT_PATTERN)
    .map((part) => normalizeArtistName(part))
    .filter((part) => part.length > 0);
}

export function getPrimaryArtist(artist: string): string {
  return getArtistTokens(artist)[0] ?? normalizeArtistName(artist);
}

export function artistSetsOverlap(a: TrackWithFeatures, b: TrackWithFeatures): boolean {
  const aTokens = new Set(getArtistTokens(a.artist));
  return getArtistTokens(b.artist).some((artist) => aTokens.has(artist));
}

export function repeatedArtistCount(tracks: TrackWithFeatures[]): number {
  const counts = new Map<string, number>();
  for (const track of tracks) {
    const primary = getPrimaryArtist(track.artist);
    counts.set(primary, (counts.get(primary) ?? 0) + 1);
  }
  return [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
}

export function closeArtistWindowPenalty(tracks: TrackWithFeatures[], windowSize = 4): number {
  let penalty = 0;
  for (let index = 0; index < tracks.length; index += 1) {
    const windowStart = Math.max(0, index - windowSize);
    for (let previous = windowStart; previous < index; previous += 1) {
      if (artistSetsOverlap(tracks[previous], tracks[index])) {
        penalty += 1;
      }
    }
  }
  return penalty;
}

export function artistCountInPath(track: TrackWithFeatures, path: TrackWithFeatures[]): number {
  const primary = getPrimaryArtist(track.artist);
  return path.filter((item) => getPrimaryArtist(item.artist) === primary).length;
}

export function maxTracksPerPrimaryArtist(targetDurationSeconds: number): number {
  return Math.max(2, Math.ceil((targetDurationSeconds / 7200) * 2));
}
