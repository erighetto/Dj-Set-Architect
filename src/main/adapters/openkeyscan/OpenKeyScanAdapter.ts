import type { KeyDetectionResult, OpenKeyScanHealth, Track } from "../../../shared/types/domain.js";
import { normalizeToCamelotKey } from "../../../domain/scoring/camelot.js";

export interface KeyDetectionProvider {
  isAvailable(): Promise<boolean>;
  analyze(track: Track): Promise<KeyDetectionResult>;
}

export class OpenKeyScanAdapter implements KeyDetectionProvider {
  constructor(private readonly baseUrl = "http://127.0.0.1:58721") {}

  async isAvailable(): Promise<boolean> {
    return (await this.getHealth()).available;
  }

  async getHealth(): Promise<OpenKeyScanHealth> {
    const url = `${this.baseUrl}/health`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(750) });
      if (!response.ok) {
        return { available: false, url, status: String(response.status), success: false, error: `HTTP ${response.status}` };
      }
      const payload = (await response.json()) as { success?: boolean; status?: string; timestamp?: number };
      const available = payload.success === true && payload.status === "ok";
      return {
        available,
        url,
        status: payload.status ?? null,
        success: payload.success ?? null,
        timestamp: payload.timestamp ?? null,
        error: available ? null : "Unexpected OpenKeyScan health response"
      };
    } catch (error) {
      return {
        available: false,
        url,
        status: null,
        success: false,
        timestamp: null,
        error: error instanceof Error ? error.message : "OpenKeyScan health check failed"
      };
    }
  }

  async analyze(track: Track): Promise<KeyDetectionResult> {
    if (!track.location) {
      return { trackId: track.id, keySource: "openkeyscan", error: "Track has no local file path" };
    }
    if (!(await this.isAvailable())) {
      return { trackId: track.id, keySource: "openkeyscan", error: "OpenKeyScan is not available" };
    }

    try {
      const response = await fetch(`${this.baseUrl}/analyze/single`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file: track.location }),
        signal: AbortSignal.timeout(30000)
      });
      if (!response.ok) {
        return { trackId: track.id, keySource: "openkeyscan", error: `OpenKeyScan returned ${response.status}` };
      }
      const payload = (await response.json()) as { success?: boolean; file?: string; key?: string; camelotKey?: string; confidence?: number };
      const camelotKey = normalizeToCamelotKey(payload.camelotKey ?? payload.key);
      return {
        trackId: track.id,
        musicalKey: payload.key ?? null,
        camelotKey,
        keySource: "openkeyscan",
        confidence: payload.confidence ?? null
      };
    } catch (error) {
      return {
        trackId: track.id,
        keySource: "openkeyscan",
        error: error instanceof Error ? error.message : "OpenKeyScan request failed"
      };
    }
  }
}

export class StubKeyDetectionProvider implements KeyDetectionProvider {
  async isAvailable(): Promise<boolean> {
    return true;
  }

  async analyze(track: Track): Promise<KeyDetectionResult> {
    const keys = ["8A", "9A", "10A", "8B", "9B", "7A", "11A", "6A", "5A", "12A"];
    const index = stableHash(`${track.artist}:${track.title}`) % keys.length;
    return {
      trackId: track.id,
      musicalKey: keys[index],
      camelotKey: keys[index],
      keySource: "stub",
      confidence: 0.5
    };
  }
}

function stableHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}
