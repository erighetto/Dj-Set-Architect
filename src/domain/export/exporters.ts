import type { SetDraft } from "../../shared/types/domain.js";

export function exportSetDraftToJson(setDraft: SetDraft): string {
  return JSON.stringify(setDraft, null, 2);
}

export function exportSetDraftToCsv(setDraft: SetDraft): string {
  const rows = [
    [
      "position",
      "title",
      "artist",
      "duration_seconds",
      "bpm",
      "camelot_key",
      "energy_score",
      "danceability_score",
      "transition_score",
      "rationale"
    ]
  ];

  for (const track of setDraft.tracks) {
    const transition = setDraft.transitions.find((item) => item.toTrackId === track.trackId);
    rows.push([
      String(track.position),
      track.title,
      track.artist,
      String(track.durationSeconds),
      track.bpm == null ? "" : String(track.bpm),
      track.camelotKey ?? "",
      track.energyScore == null ? "" : String(track.energyScore),
      track.danceabilityScore == null ? "" : String(track.danceabilityScore),
      transition ? transition.transitionScore.toFixed(4) : "",
      transition ? transition.rationale.join(" | ") : ""
    ]);
  }

  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function escapeCsvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
