import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedRequest } from "../../common/middleware/auth";
import { asyncHandler } from "../../common/utils/async-handler";
import { sendSuccess } from "../../common/utils/api-response";
import { getAdminReports } from "./reports.service";

const reportsQuerySchema = z.object({
  preset: z
    .enum(["today", "yesterday", "last7Days", "last30Days", "last90Days", "thisMonth", "lastMonth", "lifetime", "custom"])
    .optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
});

function getStringParam(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return "";
}

function getOptionalStringParam(value: unknown) {
  const normalized = getStringParam(value).trim();
  return normalized.length > 0 ? normalized : undefined;
}

export const getAdminReportsController = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const query = reportsQuerySchema.parse({
    preset: getOptionalStringParam(req.query.preset),
    from: getOptionalStringParam(req.query.from),
    to: getOptionalStringParam(req.query.to),
    zoneId: getOptionalStringParam(req.query.zoneId),
    districtId: getOptionalStringParam(req.query.districtId),
  });
  const data = await getAdminReports(query);
  return sendSuccess(res, { data });
});
