import type { TrackWithFeatures } from "../../shared/types/domain.js";

export interface StyleProfile {
  tags: Map<string, number>;
  mainStyles: string[];
  embeddings: number[][];
}

/**
 * Extract style tags from track metadata (genre, album, artist, etc.)
 * Uses existing metadata first as per requirements
 */
export function extractStyleTags(track: TrackWithFeatures): string[] {
  const tags = new Set<string>();

  // Primary source: genre field
  if (track.genre) {
    const genreParts = track.genre
      .split(/[,;\/|]/)
      .map((g) => g.trim().toLowerCase())
      .filter((g) => g.length > 0);
    genreParts.forEach((g) => tags.add(g));
  }

  // Secondary source: album name patterns
  if (track.album) {
    const subgenrePatterns = extractSubgenreFromAlbum(track.album);
    subgenrePatterns.forEach((s) => tags.add(s));
  }

  // Tertiary source: artist name patterns
  if (track.artist) {
    const artistGenres = inferGenreFromArtist(track.artist);
    artistGenres.forEach((a) => tags.add(a));
  }

  // Normalize known subgenres
  const normalized = normalizeStyleTags(Array.from(tags));
  return normalized.length > 0 ? normalized : ["electronic"];
}

/**
 * Extract potential subgenres from album name
 */
function extractSubgenreFromAlbum(album: string): string[] {
  const patterns = [
    "deep house",
    "tech house",
    "house",
    "techno",
    "minimal",
    "progressive",
    "ambient",
    "downtempo",
    "lo-fi",
    "breakbeat",
    "drum and bass",
    "jungle",
    "trance",
    "psytrance",
    "goa",
    "industrial",
    "eurodance",
    "synthwave",
    "darkwave",
    "synthpop",
    "electro",
    "disco",
    "funk",
    "soul",
    "jazz",
    "reggae",
    "dub",
    "latin",
    "salsa",
    "bachata",
    "merengue",
    "cumbia",
    "reggaeton"
  ];

  const lower = album.toLowerCase();
  return patterns.filter((p) => lower.includes(p));
}

/**
 * Infer genre from artist name patterns
 * This is a basic heuristic - in production, you'd use metadata
 */
function inferGenreFromArtist(artist: string): string[] {
  // This is a minimal implementation; in production,
  // you'd query a music database or use the track's existing metadata
  const lower = artist.toLowerCase();

  // Very basic artist-to-genre mappings (just examples)
  if (lower.includes("lazerdisk") || lower.includes("berghain")) return ["techno"];
  if (lower.includes("hotline")) return ["synthwave"];
  if (lower.includes("chromatic")) return ["progressive"];

  return [];
}

/**
 * Normalize and deduplicate style tags
 */
export function normalizeStyleTags(tags: string[]): string[] {
  const normalized = new Set<string>();
  const aliases: Record<string, string> = {
    "deep-house": "deep_house",
    "deep house": "deep_house",
    "tech-house": "tech_house",
    "tech house": "tech_house",
    "drum&bass": "drum_and_bass",
    "dnb": "drum_and_bass",
    "hardstyle": "hard_dance",
    "psy-trance": "psytrance",
    "drum n bass": "drum_and_bass",
    "electro-house": "electro_house",
    "electro house": "electro_house",
    "progressive-house": "progressive_house",
    "progressive house": "progressive_house",
    "minimal-techno": "minimal_techno",
    "minimal techno": "minimal_techno",
    "acid-house": "acid_house",
    "acid house": "acid_house",
    "future-bass": "future_bass",
    "future bass": "future_bass",
    edm: "electronic_dance_music",
    "future garage": "future_garage",
    "tropical house": "tropical_house",
    "bass music": "bass_music",
    "dubstep": "dubstep",
    "brostep": "dubstep",
    "vaporwave": "vaporwave",
    "lo fi": "lo_fi"
  };

  for (const tag of tags) {
    const trimmed = tag.trim().toLowerCase();
    const normalized_tag = aliases[trimmed] || trimmed.replace(/\s+/g, "_");
    if (normalized_tag && normalized_tag.length > 1) {
      normalized.add(normalized_tag);
    }
  }

  return Array.from(normalized);
}

/**
 * Derive initial style profile from seed tracks
 */
export function deriveStyleProfile(seedTracks: TrackWithFeatures[]): StyleProfile {
  const tagFrequency = new Map<string, number>();
  const embeddings: number[][] = [];

  for (const track of seedTracks) {
    // Accumulate tags with frequency weighting
    const tags = track.features?.styleTags || extractStyleTags(track);
    for (const tag of tags) {
      tagFrequency.set(tag, (tagFrequency.get(tag) ?? 0) + 1);
    }

    // Collect embeddings if available
    if (track.features?.styleEmbedding) {
      embeddings.push(track.features.styleEmbedding);
    }
  }

  // Determine main styles (top 3-5 by frequency)
  const mainStyles = Array.from(tagFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);

  return {
    tags: tagFrequency,
    mainStyles,
    embeddings
  };
}

/**
 * Compute style affinity score between a candidate track and the seed profile
 */
export function computeStyleAffinityScore(
  candidateTrack: TrackWithFeatures,
  seedProfile: StyleProfile,
  options: { useEmbeddings?: boolean } = {}
): number {
  // If candidate has no style information, return neutral score
  const candidateTags = candidateTrack.features?.styleTags || extractStyleTags(candidateTrack);
  if (candidateTags.length === 0 || seedProfile.mainStyles.length === 0) {
    return 0.5;
  }

  let score = 0;

  // Tag-based similarity (60% weight)
  const tagOverlap = candidateTags.filter((tag) => seedProfile.mainStyles.includes(tag)).length;
  const tagSimilarity = tagOverlap / Math.max(candidateTags.length, seedProfile.mainStyles.length);

  // Handle exact matches with boost
  const exactMatches = candidateTags.filter((tag) => seedProfile.mainStyles.includes(tag)).length;
  const exactMatchBoost = exactMatches > 0 ? 0.1 : 0;

  score = tagSimilarity * 0.6 + exactMatchBoost * 0.1;

  // Embedding-based similarity (40% weight) if available
  if (options.useEmbeddings && seedProfile.embeddings.length > 0 && candidateTrack.features?.styleEmbedding) {
    const embeddingSimilarity = computeEmbeddingSimilarity(candidateTrack.features.styleEmbedding, seedProfile.embeddings);
    score = score * 0.6 + embeddingSimilarity * 0.4;
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Compute similarity between a candidate embedding and a collection of seed embeddings
 * Uses cosine similarity
 */
function computeEmbeddingSimilarity(candidateEmbedding: number[], seedEmbeddings: number[][]): number {
  if (seedEmbeddings.length === 0) {
    return 0.5;
  }

  const similarities = seedEmbeddings.map((seedEmbedding) => cosineSimilarity(candidateEmbedding, seedEmbedding));

  // Return average similarity (could also use max or weighted average)
  return similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length;
}

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0.5;
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0.5;
  }

  const similarity = dotProduct / (magnitudeA * magnitudeB);
  // Normalize from [-1, 1] to [0, 1]
  return (similarity + 1) / 2;
}

/**
 * Get style compatibility rationale message
 */
export function getStyleRationale(
  affinityScore: number,
  candidateTags: string[],
  seedMainStyles: string[]
): string {
  if (affinityScore >= 0.85) {
    return "Strong style coherence with seed profile";
  }
  if (affinityScore >= 0.65) {
    const overlap = candidateTags.filter((tag) => seedMainStyles.includes(tag));
    if (overlap.length > 0) {
      return `Style has some alignment (shared: ${overlap.join(", ")})`;
    }
    return "Style has moderate compatibility with seed profile";
  }
  if (affinityScore >= 0.45) {
    return "Style diverges somewhat from seed profile";
  }
  return "Style is a significant departure from seed profile";
}

/**
 * Determine if a track is a style outlier relative to seed profile
 */
export function isStyleOutlier(
  affinityScore: number,
  profileVariant: "safe" | "balanced" | "exploratory"
): boolean {
  const thresholds = {
    safe: 0.6,
    balanced: 0.4,
    exploratory: 0.2
  };

  return affinityScore < thresholds[profileVariant];
}
