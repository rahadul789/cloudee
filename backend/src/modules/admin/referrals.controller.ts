import type { Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import type { AuthenticatedRequest } from "../../common/middleware/auth";
import { sendSuccess } from "../../common/utils/api-response";
import { AppError } from "../../common/utils/app-error";
import { asyncHandler } from "../../common/utils/async-handler";
import { getAdminReferralDetails, listAdminReferrals } from "./referrals.service";

const referralQuerySchema = z.object({
  search: z.string().optional(),
  status: z
    .enum(["all", "pending", "rewarded", "capped", "disabled", "under_review", "rejected"])
    .optional(),
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
  sortBy: z.enum(["newest", "oldest", "rewardedAt", "risk"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
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

export const getAdminReferrals = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = referralQuerySchema.parse({
      search: getOptionalStringParam(req.query.search),
      status: getOptionalStringParam(req.query.status),
      preset: getOptionalStringParam(req.query.preset),
      from: getOptionalStringParam(req.query.from),
      to: getOptionalStringParam(req.query.to),
      sortBy: getOptionalStringParam(req.query.sortBy),
      page: getOptionalStringParam(req.query.page),
      pageSize: getOptionalStringParam(req.query.pageSize),
      zoneId: getOptionalStringParam(req.query.zoneId),
      districtId: getOptionalStringParam(req.query.districtId),
    });
    const data = await listAdminReferrals(query);

    return sendSuccess(res, { data });
  },
);

export const getAdminReferral = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const referralId = getStringParam(req.params.referralId);
    const data = await getAdminReferralDetails(referralId, {
      zoneId: getOptionalStringParam(req.query.zoneId),
      districtId: getOptionalStringParam(req.query.districtId),
    });

    if (!data) {
      throw new AppError(
        StatusCodes.NOT_FOUND,
        "REFERRAL_NOT_FOUND",
        "Referral details not found",
      );
    }

    return sendSuccess(res, { data });
  },
);
