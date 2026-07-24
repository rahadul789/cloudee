import type { Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import type { AuthenticatedRequest } from "../../common/middleware/auth";
import { sendSuccess } from "../../common/utils/api-response";
import { AppError } from "../../common/utils/app-error";
import { asyncHandler } from "../../common/utils/async-handler";
import {
  blockAdminFirstOrderOfferDevice,
  blockAdminWelcomeOfferDevice,
  getAdminFirstOrderOfferDeviceDetails,
  getAdminFirstOrderOfferDetails,
  getAdminReferralRiskDeviceDetails,
  getAdminReferralDetails,
  getAdminWelcomeOfferDeviceDetails,
  listAdminReferralRiskDevices,
  listAdminFirstOrderOfferDevices,
  listAdminFirstOrderOffers,
  listAdminReferrals,
  listAdminWelcomeOfferDevices,
} from "./referrals.service";

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

const referralRiskDeviceQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(["all", "clean", "warning", "danger"]).optional(),
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
  sortBy: z.enum(["risk", "accounts", "referrals", "lastSeen"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
});

const firstOrderOfferQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(["all", "reserved", "confirmed", "released"]).optional(),
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
  risk: z.enum(["all", "suspicious", "clean"]).optional(),
  paymentMethod: z.enum(["all", "Cash", "Bkash"]).optional(),
  sortBy: z.enum(["newest", "oldest", "amount", "risk"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
});

const firstOrderOfferDeviceQuerySchema = z.object({
  search: z.string().optional(),
  status: z
    .enum(["all", "clean", "multiple_accounts", "ffo_used", "danger", "admin_blocked"])
    .optional(),
  claim: z.enum(["all", "claimed", "not_claimed"]).optional(),
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
  sortBy: z.enum(["lastSeen", "claims", "accounts", "danger"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
});

const firstOrderOfferDeviceBlockSchema = z.object({
  reason: z.string().trim().max(160).optional(),
  note: z.string().trim().max(500).optional(),
});

const welcomeOfferDeviceQuerySchema = z.object({
  search: z.string().optional(),
  status: z
    .enum(["all", "available", "needs_review", "system_blocked", "admin_blocked"])
    .optional(),
  offer: z.enum(["all", "none", "ffo", "referral", "mixed"]).optional(),
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
  sortBy: z.enum(["lastSeen", "risk", "accounts", "ffoClaims", "referrals"]).optional(),
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

export const getAdminReferralRiskDevices = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = referralRiskDeviceQuerySchema.parse({
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
    const data = await listAdminReferralRiskDevices(query);

    return sendSuccess(res, { data });
  },
);

export const getAdminReferralRiskDevice = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const deviceId = getStringParam(req.params.deviceId);
    const data = await getAdminReferralRiskDeviceDetails(deviceId, {
      zoneId: getOptionalStringParam(req.query.zoneId),
      districtId: getOptionalStringParam(req.query.districtId),
    });

    if (!data) {
      throw new AppError(
        StatusCodes.NOT_FOUND,
        "REFERRAL_RISK_DEVICE_NOT_FOUND",
        "Referral risk device details not found",
      );
    }

    return sendSuccess(res, { data });
  },
);

export const getAdminWelcomeOfferDevices = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = welcomeOfferDeviceQuerySchema.parse({
      search: getOptionalStringParam(req.query.search),
      status: getOptionalStringParam(req.query.status),
      offer: getOptionalStringParam(req.query.offer),
      preset: getOptionalStringParam(req.query.preset),
      from: getOptionalStringParam(req.query.from),
      to: getOptionalStringParam(req.query.to),
      sortBy: getOptionalStringParam(req.query.sortBy),
      page: getOptionalStringParam(req.query.page),
      pageSize: getOptionalStringParam(req.query.pageSize),
      zoneId: getOptionalStringParam(req.query.zoneId),
      districtId: getOptionalStringParam(req.query.districtId),
    });
    const data = await listAdminWelcomeOfferDevices(query);

    return sendSuccess(res, { data });
  },
);

export const getAdminWelcomeOfferDevice = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const deviceId = getStringParam(req.params.deviceId);
    const data = await getAdminWelcomeOfferDeviceDetails(deviceId, {
      zoneId: getOptionalStringParam(req.query.zoneId),
      districtId: getOptionalStringParam(req.query.districtId),
    });

    if (!data) {
      throw new AppError(
        StatusCodes.NOT_FOUND,
        "WELCOME_OFFER_DEVICE_NOT_FOUND",
        "Welcome offer device details not found",
      );
    }

    return sendSuccess(res, { data });
  },
);

export const blockAdminWelcomeOfferDeviceController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const deviceId = getStringParam(req.params.deviceId);
    const payload = firstOrderOfferDeviceBlockSchema.parse(req.body ?? {});
    const data = await blockAdminWelcomeOfferDevice(deviceId, {
      adminId: req.user?.id,
      reason: payload.reason,
      note: payload.note,
      zoneId: getOptionalStringParam(req.query.zoneId),
      districtId: getOptionalStringParam(req.query.districtId),
    });

    if (!data) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "WELCOME_OFFER_DEVICE_BLOCK_FAILED",
        "Device could not be blocked",
      );
    }

    return sendSuccess(res, {
      message: "Welcome offer device blocked",
      data,
    });
  },
);

export const getAdminFirstOrderOffers = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = firstOrderOfferQuerySchema.parse({
      search: getOptionalStringParam(req.query.search),
      status: getOptionalStringParam(req.query.status),
      preset: getOptionalStringParam(req.query.preset),
      from: getOptionalStringParam(req.query.from),
      to: getOptionalStringParam(req.query.to),
      risk: getOptionalStringParam(req.query.risk),
      paymentMethod: getOptionalStringParam(req.query.paymentMethod),
      sortBy: getOptionalStringParam(req.query.sortBy),
      page: getOptionalStringParam(req.query.page),
      pageSize: getOptionalStringParam(req.query.pageSize),
      zoneId: getOptionalStringParam(req.query.zoneId),
      districtId: getOptionalStringParam(req.query.districtId),
    });
    const data = await listAdminFirstOrderOffers(query);

    return sendSuccess(res, { data });
  },
);

export const getAdminFirstOrderOfferDevices = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = firstOrderOfferDeviceQuerySchema.parse({
      search: getOptionalStringParam(req.query.search),
      status: getOptionalStringParam(req.query.status),
      claim: getOptionalStringParam(req.query.claim),
      preset: getOptionalStringParam(req.query.preset),
      from: getOptionalStringParam(req.query.from),
      to: getOptionalStringParam(req.query.to),
      sortBy: getOptionalStringParam(req.query.sortBy),
      page: getOptionalStringParam(req.query.page),
      pageSize: getOptionalStringParam(req.query.pageSize),
      zoneId: getOptionalStringParam(req.query.zoneId),
      districtId: getOptionalStringParam(req.query.districtId),
    });
    const data = await listAdminFirstOrderOfferDevices(query);

    return sendSuccess(res, { data });
  },
);

export const getAdminFirstOrderOfferDevice = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const deviceId = getStringParam(req.params.deviceId);
    const data = await getAdminFirstOrderOfferDeviceDetails(deviceId, {
      zoneId: getOptionalStringParam(req.query.zoneId),
      districtId: getOptionalStringParam(req.query.districtId),
    });

    if (!data) {
      throw new AppError(
        StatusCodes.NOT_FOUND,
        "FIRST_ORDER_OFFER_DEVICE_NOT_FOUND",
        "First-order offer device details not found",
      );
    }

    return sendSuccess(res, { data });
  },
);

export const blockAdminFirstOrderOfferDeviceController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const deviceId = getStringParam(req.params.deviceId);
    const payload = firstOrderOfferDeviceBlockSchema.parse(req.body ?? {});
    const data = await blockAdminFirstOrderOfferDevice(deviceId, {
      adminId: req.user?.id,
      reason: payload.reason,
      note: payload.note,
      zoneId: getOptionalStringParam(req.query.zoneId),
      districtId: getOptionalStringParam(req.query.districtId),
    });

    if (!data) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "FIRST_ORDER_OFFER_DEVICE_BLOCK_FAILED",
        "Device could not be blocked",
      );
    }

    return sendSuccess(res, {
      message: "First-order offer device blocked",
      data,
    });
  },
);

export const getAdminFirstOrderOffer = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const claimId = getStringParam(req.params.claimId);
    const data = await getAdminFirstOrderOfferDetails(claimId, {
      zoneId: getOptionalStringParam(req.query.zoneId),
      districtId: getOptionalStringParam(req.query.districtId),
    });

    if (!data) {
      throw new AppError(
        StatusCodes.NOT_FOUND,
        "FIRST_ORDER_OFFER_CLAIM_NOT_FOUND",
        "First-order offer claim details not found",
      );
    }

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
