import type { Track } from "../../shared/types/domain.js";

/**
 * Essentia style embedding integration
 * Uses MusiCNN model outputs for style tagging and embeddings
 * Model reference: https://essentia.upf.edu/models/autotagging/msd/msd-musicnn-1.json
 */

export const MUSICNN_TAGS = [
  "rock",
  "pop",
  "alternative",
  "indie",
  "electronic",
  "female vocalists",
  "dance",
  "00s",
  "alternative rock",
  "jazz",
  "beautiful",
  "metal",
  "chillout",
  "male vocalists",
  "classic rock",
  "soul",
  "indie rock",
  "Mellow",
  "electronica",
  "80s",
  "folk",
  "90s",
  "chill",
  "instrumental",
  "punk",
  "oldies",
  "blues",
  "hard rock",
  "ambient",
  "acoustic",
  "experimental",
  "female vocalist",
  "guitar",
  "Hip-Hop",
  "70s",
  "party",
  "country",
  "easy listening",
  "sexy",
  "catchy",
  "funk",
  "electro",
  "heavy metal",
  "Progressive rock",
  "60s",
  "rnb",
  "indie pop",
  "sad",
  "House",
  "happy"
];

/**
 * Map high-activation tags from MusiCNN to genre categories
 * This bridges MusiCNN tags to more DJ-friendly genre labels
 */
export function mapMusiCNNToStyleTags(activations: number[], threshold = 0.3): string[] {
  const styles = new Set<string>();

  activations.forEach((activation, index) => {
    if (activation >= threshold && index < MUSICNN_TAGS.length) {
      const tag = MUSICNN_TAGS[index].toLowerCase();

      // Map tags to broader style categories
      if (tag.includes("house") || tag.includes("dance") || tag.includes("electronic")) {
        styles.add("house");
      }
      if (tag.includes("techno") || tag.includes("electro")) {
        styles.add("techno");
      }
      if (tag.includes("ambient") || tag.includes("chill") || tag.includes("mellow")) {
        styles.add("ambient");
      }
      if (tag.includes("rock") || tag.includes("punk")) {
        styles.add("rock");
      }
      if (tag.includes("metal") || tag.includes("hard")) {
        styles.add("metal");
      }
      if (tag.includes("jazz")) {
        styles.add("jazz");
      }
      if (tag.includes("blues")) {
        styles.add("blues");
      }
      if (tag.includes("soul") || tag.includes("rnb") || tag.includes("funk")) {
        styles.add("soul");
      }
      if (tag.includes("hip-hop")) {
        styles.add("hip_hop");
      }
      if (tag.includes("folk") || tag.includes("country")) {
        styles.add("folk");
      }
      if (tag.includes("pop")) {
        styles.add("pop");
      }
      if (tag.includes("indie")) {
        styles.add("indie");
      }
      // Keep original tag for specificity
      styles.add(tag);
    }
  });

  return Array.from(styles);
}

/**
 * Extract style embedding from MusiCNN model activations
 * The activations themselves serve as a 50-dimensional style embedding
 */
export function extractStyleEmbedding(activations: number[]): number[] {
  // Normalize activations to [0,1] range
  const max = Math.max(...activations, 0.5);
  const min = Math.min(...activations, 0);
  const range = max - min || 1;

  return activations.map((a) => (a - min) / range);
}

/**
 * Interface for calling Essentia ML models
 * This would be implemented in the audio worker
 */
export interface EssentiaMLProvider {
  analyzeMusiCNN(track: Track, audioBuffer: ArrayBuffer): Promise<EssentiaMLResult>;
}

export interface EssentiaMLResult {
  trackId: string;
  styleTags: string[];
  styleEmbedding: number[];
  activations: number[];
  confidence: number;
}

/**
 * Compute distance between two style embeddings computed from MusiCNN
 * Uses cosine similarity
 */
export function styleEmbeddingDistance(embedding1: number[], embedding2: number[]): number {
  if (embedding1.length === 0 || embedding2.length === 0) {
    return 0.5;
  }

  if (embedding1.length !== embedding2.length) {
    // Pad to same length if needed
    const maxLen = Math.max(embedding1.length, embedding2.length);
    const e1 = [...embedding1, ...Array(maxLen - embedding1.length).fill(0)];
    const e2 = [...embedding2, ...Array(maxLen - embedding2.length).fill(0)];
    return cosineSimilarity(e1, e2);
  }

  return cosineSimilarity(embedding1, embedding2);
}

function cosineSimilarity(a: number[], b: number[]): number {
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

  // Normalize from [-1, 1] to [0, 1]
  return (Math.acos(Math.min(1, Math.max(-1, dotProduct / (magnitudeA * magnitudeB)))) / Math.PI) * 0.5 + 0.5;
}
