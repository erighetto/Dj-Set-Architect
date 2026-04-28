import { z } from "zod";

export const trackSearchSchema = z.object({
  query: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(500).default(100)
});

export const trackIdSchema = z.object({
  id: z.string().min(1).max(128)
});

export const generateSetRequestSchema = z.object({
  targetDurationSeconds: z.number().int().min(300).max(12 * 60 * 60),
  durationToleranceSeconds: z.number().int().min(0).max(60 * 60),
  seedTrackIds: z.array(z.string().min(1).max(128)).min(1).max(50),
  variantProfile: z.enum(["safe", "balanced", "exploratory"]),
  energyCurve: z.enum(["warmup_build_peak_cooldown", "flat_groove", "wave_pattern"])
});

export const exportSetSchema = z.object({
  setId: z.string().min(1).max(128)
});
