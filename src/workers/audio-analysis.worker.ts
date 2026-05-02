import { parentPort, workerData } from "node:worker_threads";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import type { Track } from "../shared/types/domain.js";
import type { AudioFeatureResult } from "../shared/types/domain.js";
import { FEATURE_VERSION } from "../shared/constants/features.js";

const track = workerData as Track;

const SAMPLE_RATE = 44100;
const FRAME_SIZE = 2048;
const HOP_SIZE = 1024;

analyze(track)
  .then((result) => parentPort?.postMessage(result))
  .catch((error) => {
    throw error;
  });

async function analyze(input: Track): Promise<AudioFeatureResult> {
  if (!input.location) {
    throw new Error("Track has no local file path for Essentia.js analysis");
  }

  const signal = await decodeAudioToMonoFloat32(input.location, SAMPLE_RATE);
  if (signal.length < SAMPLE_RATE) {
    throw new Error("Decoded audio is too short for reliable Essentia.js analysis");
  }

  const esPkg = require("essentia.js") as {
    Essentia: new (wasm: unknown) => EssentiaRuntime;
    EssentiaWASM: unknown;
  };
  const essentia = new esPkg.Essentia(esPkg.EssentiaWASM);
  const signalVector = essentia.arrayToVector(signal);

  try {
    const rhythm = safeCall(() => essentia.RhythmDescriptors(signalVector));
    const danceability = safeCall(() => essentia.Danceability(signalVector, SAMPLE_RATE));
    const dynamic = safeCall(() => essentia.DynamicComplexity(signalVector, 0.2, SAMPLE_RATE));
    const replayGain = safeCall(() => essentia.ReplayGain(signalVector, SAMPLE_RATE));
    const loudness = safeCall(() => essentia.Loudness(signalVector));
    const onsetRate = safeCall(() => essentia.OnsetRate(signalVector, SAMPLE_RATE));
    const spectral = extractSpectralPrimitives(essentia, signal);

    const bpm = normalizeBpm(Number(rhythm?.bpm));
    const loudnessPrimitive = normalizeDb(Number(dynamic?.loudness ?? replayGain?.replayGain ?? loudness?.loudness), -60, 0);
    const spectralFlux = normalizePositive(spectral.averageFlux, 0.2);
    const onsetDensity = normalizePositive(Number(onsetRate?.onsetRate), 5);
    const lowFrequencyEnergy = clamp01(spectral.lowFrequencyRatio);
    const dynamicComplexity = normalizePositive(Number(dynamic?.dynamicComplexity), 8);
    const energyScore = clamp01(
      loudnessPrimitive * 0.26 +
        spectralFlux * 0.22 +
        onsetDensity * 0.22 +
        lowFrequencyEnergy * 0.18 +
        dynamicComplexity * 0.12
    );

    const styleEmbedding = computeStyleEmbedding([
      energyScore,
      clamp01(Number(danceability?.danceability ?? 0) / 10),
      loudnessPrimitive,
      spectralFlux,
      onsetDensity,
      lowFrequencyEnergy,
      dynamicComplexity,
      bpm != null ? normalizeBpm(bpm) ?? 0 : 0
    ]);
    const styleTags = computeAudioStyleTags({
      energyScore,
      danceabilityScore: clamp01(Number(danceability?.danceability ?? 0) / 10),
      lowFrequencyEnergy,
      dynamicComplexity,
      spectralFlux,
      bpm: bpm ?? 0
    }, input);

    return {
      trackId: input.id,
      bpm,
      bpmSource: "essentiajs",
      danceabilityScore: clamp01(Number(danceability?.danceability ?? 0) / 10),
      energyScore,
      loudness: loudnessPrimitive,
      spectralFlux,
      onsetDensity,
      lowFrequencyEnergy,
      dynamicComplexity,
      styleTags,
      styleSource: "essentiajs",
      styleEmbedding,
      featureVersion: FEATURE_VERSION
    };
  } finally {
    signalVector.delete();
    safeCall(() => essentia.shutdown());
    safeCall(() => essentia.delete());
  }
}

function decodeAudioToMonoFloat32(filePath: string, sampleRate: number): Promise<Float32Array> {
  if (!ffmpegPath) {
    return Promise.reject(new Error("ffmpeg-static did not provide an executable path"));
  }
  const executablePath: string = ffmpegPath;

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    const child = spawn(executablePath, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      filePath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      String(sampleRate),
      "-f",
      "f32le",
      "pipe:1"
    ]);

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    child.on("error", reject);
    child.on("close", (code: number | null) => {
      if (code !== 0) {
        reject(new Error(Buffer.concat(errors).toString("utf8").trim() || `ffmpeg exited with code ${code}`));
        return;
      }
      const buffer = Buffer.concat(chunks);
      const length = Math.floor(buffer.byteLength / Float32Array.BYTES_PER_ELEMENT);
      const view = new Float32Array(buffer.buffer, buffer.byteOffset, length);
      resolve(new Float32Array(view));
    });
  });
}

function extractSpectralPrimitives(essentia: EssentiaRuntime, signal: Float32Array): { averageFlux: number; lowFrequencyRatio: number } {
  const frameCount = Math.max(0, Math.floor((signal.length - FRAME_SIZE) / HOP_SIZE));
  const stride = Math.max(1, Math.floor(frameCount / 900));
  let previousSpectrum: Float32Array | null = null;
  let fluxSum = 0;
  let fluxCount = 0;
  let lowFrequencySum = 0;
  let lowFrequencyCount = 0;

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += stride) {
    const start = frameIndex * HOP_SIZE;
    const frame = signal.slice(start, start + FRAME_SIZE);
    const frameVector = essentia.arrayToVector(frame);
    const windowed = essentia.Windowing(frameVector).frame;
    const spectrum = essentia.Spectrum(windowed).spectrum;
    const spectrumArray = essentia.vectorToArray(spectrum);

    if (previousSpectrum) {
      fluxSum += spectralFlux(previousSpectrum, spectrumArray);
      fluxCount += 1;
    }
    previousSpectrum = spectrumArray;

    const lowRatio = safeCall(() => essentia.EnergyBandRatio(spectrum, SAMPLE_RATE, 20, 250));
    const energyBandRatio = lowRatio?.energyBandRatio;
    if (Number.isFinite(energyBandRatio)) {
      lowFrequencySum += energyBandRatio as number;
      lowFrequencyCount += 1;
    }

    frameVector.delete();
    windowed.delete();
    spectrum.delete();
  }

  return {
    averageFlux: fluxCount === 0 ? 0 : fluxSum / fluxCount,
    lowFrequencyRatio: lowFrequencyCount === 0 ? 0 : lowFrequencySum / lowFrequencyCount
  };
}

function spectralFlux(previous: Float32Array, current: Float32Array): number {
  const length = Math.min(previous.length, current.length);
  if (length === 0) {
    return 0;
  }
  let sum = 0;
  for (let index = 0; index < length; index += 1) {
    const delta = current[index] - previous[index];
    sum += delta * delta;
  }
  return Math.sqrt(sum / length);
}

function normalizeBpm(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  let bpm = value;
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  return Math.round(bpm * 10) / 10;
}

function normalizeDb(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return clamp01((value - min) / (max - min));
}

function normalizePositive(value: number, expectedMax: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return clamp01(value / expectedMax);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000));
}

function computeStyleEmbedding(values: number[]): number[] {
  const normalized = values.map((value) => clamp01(value));
  return normalized.flatMap((value, index) => [value, clamp01((value + normalized[(index + 1) % normalized.length]) / 2)]).slice(0, 32);
}

function computeAudioStyleTags(
  features: {
    energyScore: number;
    danceabilityScore: number;
    lowFrequencyEnergy: number;
    dynamicComplexity: number;
    spectralFlux: number;
    bpm: number;
  },
  track: Track
): string[] {
  const tags = new Set<string>();

  if (track.genre) {
    track.genre
      .split(/[,;\/|]/)
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean)
      .forEach((tag) => tags.add(tag.replace(/\s+/g, "_")));
  }

  if (features.energyScore >= 0.7 && features.danceabilityScore >= 0.55) {
    tags.add("dance");
  }
  if (features.lowFrequencyEnergy >= 0.5 && features.bpm >= 110) {
    tags.add("house");
  }
  if (features.energyScore < 0.35 && features.danceabilityScore < 0.45) {
    tags.add("ambient");
  }
  if (features.dynamicComplexity >= 0.7) {
    tags.add("experimental");
  }
  if (features.spectralFlux >= 0.5) {
    tags.add("electronic");
  }
  if (features.bpm > 140) {
    tags.add("drum_and_bass");
  }

  if (tags.size === 0) {
    tags.add("electronic");
  }

  return Array.from(tags);
}

function safeCall<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

interface EssentiaVector {
  delete(): void;
}

interface EssentiaRuntime {
  arrayToVector(input: Float32Array): EssentiaVector;
  vectorToArray(input: EssentiaVector): Float32Array;
  RhythmDescriptors(signal: EssentiaVector): { bpm?: number };
  Danceability(signal: EssentiaVector, sampleRate?: number): { danceability?: number; dfa?: EssentiaVector };
  DynamicComplexity(signal: EssentiaVector, frameSize?: number, sampleRate?: number): { dynamicComplexity?: number; loudness?: number };
  ReplayGain(signal: EssentiaVector, sampleRate?: number): { replayGain?: number };
  Loudness(signal: EssentiaVector): { loudness?: number };
  OnsetRate(signal: EssentiaVector, sampleRate?: number): { onsets?: EssentiaVector; onsetRate?: number };
  Windowing(frame: EssentiaVector): { frame: EssentiaVector };
  Spectrum(frame: EssentiaVector): { spectrum: EssentiaVector };
  EnergyBandRatio(spectrum: EssentiaVector, sampleRate?: number, startFrequency?: number, stopFrequency?: number): { energyBandRatio?: number };
  shutdown(): void;
  delete(): void;
}
