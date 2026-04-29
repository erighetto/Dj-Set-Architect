import { randomUUID } from "node:crypto";
import type {
  EnergyCurve,
  GenerateSetRequest,
  SetDraft,
  SetTrack,
  TrackWithFeatures,
  TransitionScore
} from "../../shared/types/domain.js";
import {
  DEFAULT_BEAM_WIDTH,
  DEFAULT_MAX_CANDIDATES_PER_STEP,
  MAX_GENERATION_TRACKS
} from "../../shared/constants/features.js";
import { energyCurveValue } from "../scoring/energyCurves.js";
import { getTrackBpm, scoreTransition } from "../scoring/transitionScoring.js";
import { deriveStyleProfile, isStyleOutlier, extractStyleTags } from "../scoring/styleAffinity.js";
import type { StyleProfile } from "../scoring/styleAffinity.js";

interface PathState {
  tracks: TrackWithFeatures[];
  nextSeedIndex: number;
  score: number;
  styleProfile: StyleProfile;
}

export class SetGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SetGenerationError";
  }
}

export function generateSetDraft(
  library: TrackWithFeatures[],
  request: GenerateSetRequest,
  options: { beamWidth?: number; maxCandidatesPerStep?: number } = {}
): SetDraft {
  const validTracks = library
    .filter((track) => track.durationSeconds > 0)
    .slice()
    .sort(sortTracks);

  if (validTracks.length === 0) {
    throw new SetGenerationError("No valid tracks are available. Import a library before generating a set draft.");
  }

  const allTracksById = new Map(library.map((track) => [track.id, track]));
  const validTracksById = new Map(validTracks.map((track) => [track.id, track]));
  const seeds = request.seedTrackIds.map((id) => validTracksById.get(id));
  if (seeds.some((track) => !track)) {
    const invalidSeed = request.seedTrackIds.find((id) => {
      const track = allTracksById.get(id);
      return !track || track.durationSeconds <= 0;
    });
    throw new SetGenerationError(
      invalidSeed && allTracksById.has(invalidSeed)
        ? "One or more selected seed tracks have no valid duration and cannot be used for set generation."
        : "One or more selected seed tracks are missing from the library."
    );
  }

  const seedTracks = seeds as TrackWithFeatures[];
  const seedIds = new Set(seedTracks.map((track) => track.id));
  const candidates = [
    ...seedTracks,
    ...validTracks.filter((track) => !seedIds.has(track.id)).slice(0, Math.max(0, MAX_GENERATION_TRACKS - seedTracks.length))
  ].sort(sortTracks);

  const seedDuration = seedTracks.reduce((sum, track) => sum + track.durationSeconds, 0);
  if (seedDuration > request.targetDurationSeconds + request.durationToleranceSeconds) {
    throw new SetGenerationError(
      "Selected seed tracks exceed the target duration plus tolerance. Increase the target duration or remove seeds."
    );
  }

  const featureReadyCount = candidates.filter(
    (track) => getTrackBpm(track) != null && track.features?.energyScore != null
  ).length;
  if (featureReadyCount < Math.min(3, candidates.length)) {
    throw new SetGenerationError(
      "Feature coverage is too low to generate reliable recommendations. Run library analysis first."
    );
  }

  const beamWidth = options.beamWidth ?? DEFAULT_BEAM_WIDTH;
  const maxCandidatesPerStep = options.maxCandidatesPerStep ?? DEFAULT_MAX_CANDIDATES_PER_STEP;
  const averageDuration = median(candidates.map((track) => track.durationSeconds)) || 300;
  const maxSteps = Math.max(seedTracks.length, Math.ceil((request.targetDurationSeconds + request.durationToleranceSeconds) / averageDuration) + 2);

  // Derive style profile from seed tracks
  const seedStyleProfile = deriveStyleProfile(seedTracks);

  let beam: PathState[] = [{ tracks: [seedTracks[0]], nextSeedIndex: 1, score: 0, styleProfile: seedStyleProfile }];
  const completed: PathState[] = [];

  for (let step = 0; step < maxSteps && beam.length > 0; step += 1) {
    const expanded: PathState[] = [];

    for (const state of beam) {
      const duration = totalDuration(state.tracks);
      if (state.nextSeedIndex >= seedTracks.length && isWithinTolerance(duration, request)) {
        completed.push(state);
        continue;
      }
      if (duration >= request.targetDurationSeconds + request.durationToleranceSeconds) {
        if (state.nextSeedIndex >= seedTracks.length) {
          completed.push(state);
        }
        continue;
      }

      const nextSeed = seedTracks[state.nextSeedIndex];
      const dueSeed = nextSeed && shouldInsertNextSeed(duration, state.nextSeedIndex, seedTracks.length, request.targetDurationSeconds);
      const nextCandidates = dueSeed
        ? [nextSeed]
        : rankCandidates(state, candidates, request, maxCandidatesPerStep, seedTracks);

      for (const candidate of nextCandidates) {
        if (state.tracks.some((track) => track.id === candidate.id)) {
          continue;
        }
        if (seedTracks.some((seed) => seed.id === candidate.id) && candidate.id !== nextSeed?.id) {
          continue;
        }

        const newTracks = [...state.tracks, candidate];
        const newDuration = totalDuration(newTracks);
        if (newDuration > request.targetDurationSeconds + request.durationToleranceSeconds && state.nextSeedIndex < seedTracks.length) {
          continue;
        }

        const newNextSeedIndex = candidate.id === nextSeed?.id ? state.nextSeedIndex + 1 : state.nextSeedIndex;
        expanded.push({
          tracks: newTracks,
          nextSeedIndex: newNextSeedIndex,
          score: scorePath(newTracks, request, newNextSeedIndex, seedTracks.length, state.styleProfile),
          styleProfile: state.styleProfile
        });
      }
    }

    beam = expanded
      .sort((a, b) => b.score - a.score)
      .slice(0, beamWidth);
  }

  const allViable = [...completed, ...beam].filter((state) => state.nextSeedIndex >= seedTracks.length);
  if (allViable.length === 0) {
    throw new SetGenerationError(
      "No valid set draft found with current constraints. Try increasing duration tolerance, reducing seed count, or relaxing compatibility settings."
    );
  }

  const best = allViable.sort((a, b) => rankCompletedPath(b, request) - rankCompletedPath(a, request))[0];
  return buildSetDraft(best.tracks, request, best.styleProfile);
}

function sortTracks(a: TrackWithFeatures, b: TrackWithFeatures): number {
  return a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}

function rankCandidates(
  state: PathState,
  candidates: TrackWithFeatures[],
  request: GenerateSetRequest,
  limit: number,
  seedTracks: TrackWithFeatures[]
): TrackWithFeatures[] {
  const used = new Set(state.tracks.map((track) => track.id));
  const current = state.tracks[state.tracks.length - 1];
  const duration = totalDuration(state.tracks);

  return candidates
    .filter((candidate) => !used.has(candidate.id))
    .filter((candidate) => !seedTracks.some((seed) => seed.id === candidate.id))
    .map((candidate) => {
      const projectedDuration = duration + candidate.durationSeconds;
      const fromPosition = duration / request.targetDurationSeconds;
      const toPosition = projectedDuration / request.targetDurationSeconds;
      const transition = scoreTransition(current, candidate, {
        variantProfile: request.variantProfile,
        energyCurve: request.energyCurve,
        fromPositionRatio: fromPosition,
        toPositionRatio: toPosition,
        seedStyleProfile: state.styleProfile
      });
      const curveScore = curveAlignment(candidate, request.energyCurve, toPosition);
      const artistPenalty = current.artist.toLowerCase() === candidate.artist.toLowerCase() ? 0.12 : 0;
      
      // Apply style outlier penalty
      const isOutlier = isStyleOutlier(transition.styleScore ?? 0.5, request.variantProfile);
      const styleOutlierPenalty = isOutlier ? 0.15 : 0;
      
      return {
        candidate,
        score: transition.transitionScore + curveScore * 0.3 - artistPenalty - styleOutlierPenalty
      };
    })
    .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id))
    .slice(0, limit)
    .map((item) => item.candidate);
}

function scorePath(
  tracks: TrackWithFeatures[],
  request: GenerateSetRequest,
  nextSeedIndex: number,
  seedCount: number,
  styleProfile: StyleProfile
): number {
  const duration = totalDuration(tracks);
  const transitions = scoreTransitions(tracks, request, styleProfile);
  const averageTransitionScore =
    transitions.length === 0
      ? 0.7
      : transitions.reduce((sum, transition) => sum + transition.transitionScore, 0) / transitions.length;
  const curveScore =
    tracks.reduce((sum, track, index) => sum + curveAlignment(track, request.energyCurve, positionForIndex(index, tracks)), 0) /
    tracks.length;
  const seedCoverage = seedCount === 0 ? 1 : nextSeedIndex / seedCount;
  const durationPenalty = Math.abs(duration - request.targetDurationSeconds) / request.targetDurationSeconds;
  const repetitionPenalty = repeatedArtistCount(tracks) * 0.03;
  return averageTransitionScore + curveScore * 0.35 + seedCoverage * 0.2 - durationPenalty - repetitionPenalty;
}

function rankCompletedPath(state: PathState, request: GenerateSetRequest): number {
  const duration = totalDuration(state.tracks);
  const toleranceBonus = isWithinTolerance(duration, request) ? 0.5 : 0;
  return state.score + toleranceBonus - Math.abs(duration - request.targetDurationSeconds) / request.targetDurationSeconds;
}

function buildSetDraft(tracks: TrackWithFeatures[], request: GenerateSetRequest, styleProfile?: StyleProfile): SetDraft {
  const total = totalDuration(tracks);
  const transitions = scoreTransitions(tracks, request, styleProfile);
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    name: `Draft ${new Date().toLocaleString()}`,
    variantProfile: request.variantProfile,
    energyCurve: request.energyCurve,
    targetDurationSeconds: request.targetDurationSeconds,
    durationToleranceSeconds: request.durationToleranceSeconds,
    totalDurationSeconds: total,
    durationDeviationSeconds: total - request.targetDurationSeconds,
    globalScore:
      transitions.length === 0
        ? 0
        : transitions.reduce((sum, transition) => sum + transition.transitionScore, 0) / transitions.length,
    tracks: tracks.map(toSetTrack),
    transitions,
    createdAt: now
  };
}

function scoreTransitions(tracks: TrackWithFeatures[], request: GenerateSetRequest, styleProfile?: StyleProfile): TransitionScore[] {
  const total = totalDuration(tracks);
  let elapsed = 0;
  const transitions: TransitionScore[] = [];
  for (let index = 0; index < tracks.length - 1; index += 1) {
    const from = tracks[index];
    const to = tracks[index + 1];
    const fromPosition = total === 0 ? 0 : elapsed / total;
    elapsed += from.durationSeconds;
    const toPosition = total === 0 ? 0 : elapsed / total;
    transitions.push(
      scoreTransition(from, to, {
        variantProfile: request.variantProfile,
        energyCurve: request.energyCurve,
        fromPositionRatio: fromPosition,
        toPositionRatio: toPosition,
        seedStyleProfile: styleProfile
      })
    );
  }
  return transitions;
}

function toSetTrack(track: TrackWithFeatures, index: number): SetTrack {
  return {
    position: index + 1,
    trackId: track.id,
    title: track.title,
    artist: track.artist,
    durationSeconds: track.durationSeconds,
    bpm: getTrackBpm(track),
    camelotKey: track.features?.camelotKey ?? null,
    energyScore: track.features?.energyScore ?? null,
    danceabilityScore: track.features?.danceabilityScore ?? null,
    styleTags: track.features?.styleTags ?? extractStyleTags(track) ?? null
  };
}

function totalDuration(tracks: TrackWithFeatures[]): number {
  return tracks.reduce((sum, track) => sum + track.durationSeconds, 0);
}

function isWithinTolerance(duration: number, request: GenerateSetRequest): boolean {
  return Math.abs(duration - request.targetDurationSeconds) <= request.durationToleranceSeconds;
}

function shouldInsertNextSeed(duration: number, nextSeedIndex: number, seedCount: number, targetDuration: number): boolean {
  if (seedCount <= 1) {
    return false;
  }
  const targetAnchorPosition = (targetDuration * nextSeedIndex) / seedCount;
  return duration >= targetAnchorPosition;
}

function curveAlignment(track: TrackWithFeatures, curve: EnergyCurve, position: number): number {
  const energy = track.features?.energyScore;
  if (energy == null) {
    return 0.5;
  }
  return Math.max(0, 1 - Math.abs(energy - energyCurveValue(curve, position)));
}

function positionForIndex(index: number, tracks: TrackWithFeatures[]): number {
  if (tracks.length <= 1) {
    return 0;
  }
  return index / (tracks.length - 1);
}

function repeatedArtistCount(tracks: TrackWithFeatures[]): number {
  const counts = new Map<string, number>();
  for (const track of tracks) {
    const key = track.artist.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[midpoint - 1] + sorted[midpoint]) / 2 : sorted[midpoint];
}
