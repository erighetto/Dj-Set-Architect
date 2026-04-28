import { parentPort, workerData } from "node:worker_threads";
import type { Track } from "../shared/types/domain.js";
import { deterministicFeatureResult } from "../main/adapters/essentia/EssentiaAudioFeatureProvider.js";

const track = workerData as Track;
parentPort?.postMessage(deterministicFeatureResult(track));
