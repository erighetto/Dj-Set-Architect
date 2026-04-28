import type { EnergyCurve } from "../../shared/types/domain.js";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function energyCurveValue(curve: EnergyCurve, position: number): number {
  const t = clamp01(position);
  switch (curve) {
    case "flat_groove":
      return 0.62;
    case "wave_pattern":
      return clamp01(0.58 + 0.22 * Math.sin(t * Math.PI * 4 - Math.PI / 2));
    case "warmup_build_peak_cooldown":
    default:
      if (t < 0.2) {
        return 0.35 + t * 1.25;
      }
      if (t < 0.7) {
        return 0.6 + ((t - 0.2) / 0.5) * 0.32;
      }
      return 0.92 - ((t - 0.7) / 0.3) * 0.34;
  }
}

export function targetEnergyDelta(curve: EnergyCurve, fromPosition: number, toPosition: number): number {
  return energyCurveValue(curve, toPosition) - energyCurveValue(curve, fromPosition);
}
