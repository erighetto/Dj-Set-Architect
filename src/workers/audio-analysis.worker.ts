import { parentPort, workerData } from "node:worker_threads";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import type { Track, FeatureSource } from "../shared/types/domain.js";
import type { AudioFeatureResult } from "../shared/types/domain.js";
import { FEATURE_VERSION } from "../shared/constants/features.js";
import { mapMusiCNNToStyleTags, extractStyleEmbedding } from "../domain/scoring/essentiaStyles.js";

const esPkg = require("essentia.js") as {
  Essentia: new (wasm: unknown) => EssentiaRuntime;
  EssentiaWASM: unknown;
  EssentiaModel: EssentiaModelModule;
};

/** Resolve deps from app root (Electron worker threads do not always resolve hoisted `node_modules` the same way). */
const requireFromAppRoot = createRequire(join(__dirname, "../../../package.json"));

const track = workerData as Track;

const SAMPLE_RATE = 44100;
const ML_SAMPLE_RATE = 16000;
const MUSICNN_PATCH_FRAMES = 187;
const MUSICNN_MEL_BANDS = 96;
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

    // Try MusiCNN inference first for more reliable style classification
    let styleTags: string[];
    let styleEmbedding: number[];
    let styleSource: FeatureSource = "essentiajs";

    try {
      const musinnResult = await analyzeMusiCNN(input);
      styleTags = musinnResult.styleTags;
      styleEmbedding = musinnResult.styleEmbedding;
      styleSource = "musicnn";
    } catch (error) {
      // Fallback to heuristic-based classification
      console.warn(`MusiCNN analysis failed for track ${input.id}, using fallback:`, error);
      styleEmbedding = computeStyleEmbedding([
        energyScore,
        clamp01(Number(danceability?.danceability ?? 0) / 10),
        loudnessPrimitive,
        spectralFlux,
        onsetDensity,
        lowFrequencyEnergy,
        dynamicComplexity,
        bpm != null ? normalizeBpm(bpm) ?? 0 : 0
      ]);
      styleTags = computeAudioStyleTags({
        energyScore,
        danceabilityScore: clamp01(Number(danceability?.danceability ?? 0) / 10),
        lowFrequencyEnergy,
        dynamicComplexity,
        spectralFlux,
        bpm: bpm ?? 0
      }, input);
    }

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
      styleSource,
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

type OrtLike = typeof import("onnxruntime-node");

function loadOrtRuntime(): {
  ort: OrtLike;
  inferenceSessionOptions?: import("onnxruntime-node").InferenceSession.SessionOptions;
} {
  try {
    const ort = requireFromAppRoot("onnxruntime-node") as OrtLike;
    return { ort };
  } catch (nativeError) {
    try {
      const ortWeb = requireFromAppRoot("onnxruntime-web") as typeof import("onnxruntime-web");
      ortWeb.env.wasm.numThreads = 1;
      ortWeb.env.wasm.simd = true;
      return {
        ort: ortWeb as unknown as OrtLike,
        inferenceSessionOptions: { executionProviders: ["wasm"] } as import("onnxruntime-node").InferenceSession.SessionOptions
      };
    } catch (webError) {
      const nativeMessage = nativeError instanceof Error ? nativeError.message : String(nativeError);
      const webMessage = webError instanceof Error ? webError.message : String(webError);
      throw new Error(
        `ONNX Runtime unavailable (native: ${nativeMessage}; wasm fallback: ${webMessage}). ` +
          "Try: npm rebuild onnxruntime-node, or reinstall node_modules."
      );
    }
  }
}

function buildMusiCNNMelTensor(rows: number[][]): Float32Array {
  const tensor = new Float32Array(MUSICNN_PATCH_FRAMES * MUSICNN_MEL_BANDS);
  const rowCount = rows.length;
  if (rowCount === 0) {
    return tensor;
  }
  const writeRow = (dstRow: number, src: number[]) => {
    const offset = dstRow * MUSICNN_MEL_BANDS;
    for (let band = 0; band < MUSICNN_MEL_BANDS; band += 1) {
      tensor[offset + band] = Number(src[band] ?? 0);
    }
  };
  if (rowCount >= MUSICNN_PATCH_FRAMES) {
    const start = Math.floor((rowCount - MUSICNN_PATCH_FRAMES) / 2);
    for (let index = 0; index < MUSICNN_PATCH_FRAMES; index += 1) {
      writeRow(index, rows[start + index] ?? []);
    }
  } else {
    const padBefore = Math.floor((MUSICNN_PATCH_FRAMES - rowCount) / 2);
    for (let index = 0; index < rowCount; index += 1) {
      writeRow(padBefore + index, rows[index] ?? []);
    }
  }
  return tensor;
}

async function analyzeMusiCNN(track: Track): Promise<{ styleTags: string[]; styleEmbedding: number[] }> {
  if (!track.location) {
    throw new Error("Track has no local file path for MusiCNN analysis");
  }

  const { ort, inferenceSessionOptions } = loadOrtRuntime();

  const modelPath = join(__dirname, "..", "models", "msd-musicnn-1.onnx");
  if (!existsSync(modelPath)) {
    throw new Error(`MusiCNN ONNX model missing at ${modelPath} (run npm install to download it)`);
  }

  const signal = await decodeAudioToMonoFloat32(track.location, ML_SAMPLE_RATE);
  if (signal.length < ML_SAMPLE_RATE) {
    throw new Error("Decoded audio is too short for MusiCNN analysis");
  }

  const inputExtractor = new esPkg.EssentiaModel.EssentiaTFInputExtractor(esPkg.EssentiaWASM, "musicnn");
  let session: import("onnxruntime-node").InferenceSession | null = null;

  try {
    const melFeature = inputExtractor.computeFrameWise(signal) as InputMusiCNNFeature;
    const melInput = buildMusiCNNMelTensor(melFeature.melSpectrum as number[][]);

    session = await ort.InferenceSession.create(modelPath, inferenceSessionOptions);
    const inputTensor = new ort.Tensor("float32", melInput, [1, MUSICNN_PATCH_FRAMES, MUSICNN_MEL_BANDS]);
    const { activations } = await session.run({ melspectrogram: inputTensor });
    const activationArray = Array.from(activations.data as Float32Array);

    const styleTags = mapMusiCNNToStyleTags(activationArray);
    const styleEmbedding = extractStyleEmbedding(activationArray);
    return { styleTags, styleEmbedding };
  } finally {
    inputExtractor.delete();
    if (session) {
      await session.release();
    }
  }
}

interface EssentiaVector {
  delete(): void;
}

interface InputMusiCNNFeature {
  melSpectrum: number[][];
  frameSize: number;
  patchSize: number;
  melBandsSize: number;
}

interface EssentiaModelModule {
  EssentiaTFInputExtractor: new (wasm: unknown, extractorType?: string, isDebug?: boolean) => {
    computeFrameWise(audioSignal: Float32Array, hopSize?: number): InputMusiCNNFeature;
    delete(): void;
    shutdown(): void;
  };
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
