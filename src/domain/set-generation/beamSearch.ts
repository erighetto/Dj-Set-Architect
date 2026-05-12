import { randomUUID } from "node:crypto";
import type {
  EnergyCurve,
  GenerateSetRequest,
  SetDraft,
  SetDraftDiagnostics,
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
import { computeStyleAffinityScore, deriveStyleProfile, isStyleOutlier, extractStyleTags } from "../scoring/styleAffinity.js";
import type { StyleProfile } from "../scoring/styleAffinity.js";
import {
  artistCountInPath,
  artistSetsOverlap,
  closeArtistWindowPenalty,
  maxTracksPerPrimaryArtist,
  repeatedArtistCount
} from "../scoring/artistIdentity.js";

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
  const seedDuration = seedTracks.reduce((sum, track) => sum + track.durationSeconds, 0);
  if (seedDuration > request.targetDurationSeconds + request.durationToleranceSeconds) {
    throw new SetGenerationError(
      "Selected seed tracks exceed the target duration plus tolerance. Increase the target duration or remove seeds."
    );
  }

  const seedStyleProfile = deriveStyleProfile(seedTracks);
  const candidates = preselectCandidates(validTracks, seedTracks, seedStyleProfile);

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

function preselectCandidates(
  validTracks: TrackWithFeatures[],
  seedTracks: TrackWithFeatures[],
  styleProfile: StyleProfile
): TrackWithFeatures[] {
  const seedIds = new Set(seedTracks.map((track) => track.id));
  const seedBpms = seedTracks.map(getTrackBpm).filter((bpm): bpm is number => bpm != null);
  const seedEnergies = seedTracks
    .map((track) => track.features?.energyScore)
    .filter((energy): energy is number => energy != null);
  const medianSeedBpm = median(seedBpms);
  const minSeedBpm = seedBpms.length ? Math.min(...seedBpms) : null;
  const maxSeedBpm = seedBpms.length ? Math.max(...seedBpms) : null;
  const minSeedEnergy = seedEnergies.length ? Math.min(...seedEnergies) : null;
  const maxSeedEnergy = seedEnergies.length ? Math.max(...seedEnergies) : null;

  const selected = validTracks
    .filter((track) => !seedIds.has(track.id))
    .map((track) => {
      const seedStyleAffinity = computeStyleAffinityScore(track, styleProfile, { useEmbeddings: true });
      const bpmRangeAffinity = rangeAffinity(getTrackBpm(track), minSeedBpm, maxSeedBpm, medianSeedBpm, 18);
      const energyRangeAffinity = rangeAffinity(
        track.features?.energyScore ?? null,
        minSeedEnergy,
        maxSeedEnergy,
        seedEnergies.length ? median(seedEnergies) : 0.5,
        0.35
      );
      const featureCompleteness = getFeatureCompleteness(track);
      return {
        track,
        score: seedStyleAffinity * 0.55 + bpmRangeAffinity * 0.2 + energyRangeAffinity * 0.15 + featureCompleteness * 0.1
      };
    })
    .sort((a, b) => b.score - a.score || a.track.id.localeCompare(b.track.id))
    .slice(0, Math.max(0, MAX_GENERATION_TRACKS - seedTracks.length))
    .map((item) => item.track);

  return [...seedTracks, ...selected];
}

function getFeatureCompleteness(track: TrackWithFeatures): number {
  const checks = [
    getTrackBpm(track) != null,
    track.features?.camelotKey != null,
    track.features?.energyScore != null,
    track.features?.danceabilityScore != null,
    Boolean(track.features?.styleTags?.length || track.genre)
  ];
  return checks.filter(Boolean).length / checks.length;
}

function rangeAffinity(
  value: number | null,
  min: number | null,
  max: number | null,
  medianValue: number | null,
  tolerance: number
): number {
  if (value == null || medianValue == null || min == null || max == null) {
    return 0.5;
  }
  if (value >= min && value <= max) {
    return 1;
  }
  return Math.exp(-Math.abs(value - medianValue) / tolerance);
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
      const seedStyleAffinity = computeStyleAffinityScore(candidate, state.styleProfile, { useEmbeddings: true });
      const stylePolicy = getStylePolicy(request.variantProfile);
      if (seedStyleAffinity < stylePolicy.rejectBelow) {
        return null;
      }
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
      const artistPenalty = getArtistPenalty(state.tracks, candidate, request.targetDurationSeconds);
      const styleOutlierPenalty = seedStyleAffinity < stylePolicy.weakBelow ? stylePolicy.weakPenalty : 0;
      const durationRiskPenalty = projectedDuration > request.targetDurationSeconds + request.durationToleranceSeconds ? 0.35 : 0;

      return {
        candidate,
        score:
          transition.transitionScore +
          curveScore * 0.25 +
          seedStyleAffinity * 0.4 -
          styleOutlierPenalty -
          artistPenalty -
          durationRiskPenalty
      };
    })
    .filter((item): item is { candidate: TrackWithFeatures; score: number } => item != null)
    .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id))
    .slice(0, limit)
    .map((item) => item.candidate);
}

function getStylePolicy(profile: GenerateSetRequest["variantProfile"]): {
  rejectBelow: number;
  weakBelow: number;
  weakPenalty: number;
} {
  switch (profile) {
    case "safe":
      return { rejectBelow: 0.55, weakBelow: 0.7, weakPenalty: 0.6 };
    case "balanced":
      return { rejectBelow: 0.35, weakBelow: 0.5, weakPenalty: 0.25 };
    case "exploratory":
      return { rejectBelow: 0.2, weakBelow: 0.35, weakPenalty: 0.25 };
  }
}

function getArtistPenalty(path: TrackWithFeatures[], candidate: TrackWithFeatures, targetDurationSeconds: number): number {
  const current = path[path.length - 1];
  let penalty = artistSetsOverlap(current, candidate) ? 0.35 : 0;
  const maxPerArtist = maxTracksPerPrimaryArtist(targetDurationSeconds);
  if (artistCountInPath(candidate, path) >= maxPerArtist) {
    penalty += 0.45;
  }
  const recentWindow = path.slice(-4);
  if (recentWindow.some((track) => artistSetsOverlap(track, candidate))) {
    penalty += 0.25;
  }
  return penalty;
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
  const repetitionPenalty = repeatedArtistCount(tracks) * 0.12 + closeArtistWindowPenalty(tracks) * 0.08;
  const averageStyleAffinity =
    transitions.length === 0
      ? 0.7
      : transitions.reduce((sum, transition) => sum + (transition.styleScore ?? 0.5), 0) / transitions.length;
  return averageTransitionScore + averageStyleAffinity * 0.4 + curveScore * 0.25 + seedCoverage * 0.2 - durationPenalty - repetitionPenalty;
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
    diagnostics: computeSetDraftDiagnostics(tracks, transitions, request.variantProfile),
    createdAt: now
  };
}

export function computeSetDraftDiagnostics(
  tracks: TrackWithFeatures[] | SetTrack[],
  transitions: TransitionScore[],
  variantProfile: GenerateSetRequest["variantProfile"]
): SetDraftDiagnostics {
  return {
    averageStyleAffinity: average(transitions.map((transition) => transition.styleScore)),
    minStyleAffinity: min(transitions.map((transition) => transition.styleScore)),
    styleOutlierCount: transitions.filter((transition) => isStyleOutlier(transition.styleScore ?? 0.5, variantProfile)).length,
    repeatedArtistCount: repeatedArtistCount(
      tracks.map((track) => ({
        id: "trackId" in track ? track.trackId : track.id,
        title: track.title,
        artist: track.artist,
        durationSeconds: track.durationSeconds,
        createdAt: "",
        updatedAt: ""
      }))
    ),
    averageBpmScore: average(transitions.map((transition) => transition.bpmScore)),
    averageKeyScore: average(transitions.map((transition) => transition.keyScore)),
    averageEnergyScore: average(transitions.map((transition) => transition.energyScore)),
    averageDanceabilityScore: average(transitions.map((transition) => transition.danceabilityScore))
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

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[midpoint - 1] + sorted[midpoint]) / 2 : sorted[midpoint];
}

function average(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (valid.length === 0) {
    return null;
  }
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function min(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value));
  return valid.length === 0 ? null : Math.min(...valid);
}
