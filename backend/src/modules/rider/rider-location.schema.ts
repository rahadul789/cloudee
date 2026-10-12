import { z } from "zod";

// Older rider builds send native unavailable values (-1). Accept the coordinate
// without that metadata so existing installed clients can keep tracking too.
export const riderLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  heading: z.preprocess(
    (value) => value === -1 || value === null ? undefined : value,
    z.number().min(0).max(360).optional(),
  ),
  accuracyMeters: z.preprocess(
    (value) => value === -1 || value === 0 || value === null ? undefined : value,
    z.number().positive().optional(),
  ),
  speedKmph: z.preprocess(
    (value) => value === -1 || value === null ? undefined : value,
    z.number().nonnegative().optional(),
  ),
});
