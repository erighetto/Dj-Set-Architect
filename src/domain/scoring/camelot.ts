const NOTE_TO_CAMELOT: Record<string, string> = {
  "A-FLAT MINOR": "1A",
  "G-SHARP MINOR": "1A",
  "B MAJOR": "1B",
  "E-FLAT MINOR": "2A",
  "D-SHARP MINOR": "2A",
  "F-SHARP MAJOR": "2B",
  "B-FLAT MINOR": "3A",
  "A-SHARP MINOR": "3A",
  "D-FLAT MAJOR": "3B",
  "C-SHARP MAJOR": "3B",
  "F MINOR": "4A",
  "A-FLAT MAJOR": "4B",
  "G-SHARP MAJOR": "4B",
  "C MINOR": "5A",
  "E-FLAT MAJOR": "5B",
  "D-SHARP MAJOR": "5B",
  "G MINOR": "6A",
  "B-FLAT MAJOR": "6B",
  "A MINOR": "8A",
  "C MAJOR": "8B",
  "D MINOR": "7A",
  "F MAJOR": "7B",
  "E MINOR": "9A",
  "G MAJOR": "9B",
  "B MINOR": "10A",
  "D MAJOR": "10B",
  "F-SHARP MINOR": "11A",
  "G-FLAT MINOR": "11A",
  "A MAJOR": "11B",
  "D-FLAT MINOR": "12A",
  "C-SHARP MINOR": "12A",
  "E MAJOR": "12B"
};

export interface CamelotKey {
  hour: number;
  mode: "A" | "B";
}

export function parseCamelotKey(value?: string | null): CamelotKey | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  const direct = normalized.match(/^([1-9]|1[0-2])([AB])$/);
  if (direct) {
    return { hour: Number(direct[1]), mode: direct[2] as "A" | "B" };
  }
  const openKey = normalized.match(/^([1-9]|1[0-2])([DM])$/);
  if (openKey) {
    return { hour: Number(openKey[1]), mode: openKey[2] === "D" ? "A" : "B" };
  }
  const mapped = NOTE_TO_CAMELOT[normalized.replace(/\s+/g, " ")];
  return mapped ? parseCamelotKey(mapped) : null;
}

export function normalizeToCamelotKey(value?: string | null): string | null {
  const parsed = parseCamelotKey(value);
  return parsed ? `${parsed.hour}${parsed.mode}` : null;
}

export function camelotCompatibilityScore(from?: string | null, to?: string | null): number {
  const a = parseCamelotKey(from);
  const b = parseCamelotKey(to);
  if (!a || !b) {
    return 0.5;
  }
  if (a.hour === b.hour && a.mode === b.mode) {
    return 1;
  }
  if (a.hour === b.hour && a.mode !== b.mode) {
    return 0.85;
  }
  const clockwise = Math.abs(a.hour - b.hour);
  const wheelDistance = Math.min(clockwise, 12 - clockwise);
  if (wheelDistance === 1 && a.mode === b.mode) {
    return 0.9;
  }
  if (wheelDistance === 1 && a.mode !== b.mode) {
    return 0.72;
  }
  return Math.max(0.15, 0.7 - wheelDistance * 0.1 - (a.mode === b.mode ? 0 : 0.1));
}

export function camelotRationale(from?: string | null, to?: string | null): string {
  const score = camelotCompatibilityScore(from, to);
  if (score >= 0.99) {
    return "Camelot keys match exactly";
  }
  if (score >= 0.85) {
    return "Camelot transition is harmonically compatible";
  }
  if (score >= 0.65) {
    return "Camelot transition is usable with moderate harmonic tension";
  }
  return "Camelot transition has weak harmonic compatibility";
}
