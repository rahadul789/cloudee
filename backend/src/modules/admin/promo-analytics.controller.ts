import type { Request, Response } from "express";
import { z } from "zod";

import { asyncHandler } from "../../common/utils/async-handler";
import { sendSuccess } from "../../common/utils/api-response";
import { getAdminPromoAnalytics } from "./promo-analytics.service";

const promoQuerySchema = z.object({
  preset: z
    .enum([
      "today",
      "yesterday",
      "last7Days",
      "last30Days",
      "last90Days",
      "thisMonth",
      "lastMonth",
      "lifetime",
      "custom",
    ])
    .optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
  limit: z.coerce.number().int().min(5).max(100).optional(),
});

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export const getAdminPromoAnalyticsController = asyncHandler(
  async (req: Request, res: Response) => {
    const query = promoQuerySchema.parse({
      preset: normalizeOptionalString(req.query.preset),
      from: normalizeOptionalString(req.query.from),
      to: normalizeOptionalString(req.query.to),
      zoneId: normalizeOptionalString(req.query.zoneId),
      districtId: normalizeOptionalString(req.query.districtId),
      limit: normalizeOptionalString(req.query.limit),
    });
    const data = await getAdminPromoAnalytics(query);
    return sendSuccess(res, { data });
  },
);
