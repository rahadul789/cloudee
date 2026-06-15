import type { Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import type { AuthenticatedRequest } from "../../common/middleware/auth";
import { AppError } from "../../common/utils/app-error";
import { sendSuccess } from "../../common/utils/api-response";
import { asyncHandler } from "../../common/utils/async-handler";
import {
  createWebsiteLead,
  getWebsiteAnalytics,
  getWebsiteLead,
  getWebsiteOverview,
  getWebsiteSettings,
  listWebsiteAreaRestaurants,
  listWebsiteLeads,
  recordWebsiteAnalyticsEvent,
  updateWebsiteLead,
  updateWebsiteSettings,
} from "./website.service";

const leadSchema = z.object({
  type: z.enum(["restaurant", "rider", "contact"]),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(/^(\+?88)?01[3-9]\d{8}$/),
  email: z.string().trim().email().optional().or(z.literal("")),
  area: z.string().trim().max(120).optional().or(z.literal("")),
  businessName: z.string().trim().max(160).optional(),
  cuisineType: z.string().trim().max(120).optional(),
  vehicleType: z.string().trim().max(80).optional(),
  message: z.string().trim().max(1000).optional(),
  source: z.string().trim().max(80).optional(),
  landingPage: z.string().trim().max(240).optional(),
  referrer: z.string().trim().max(500).optional(),
  language: z.string().trim().max(12).optional(),
  visitorId: z.string().trim().max(120).optional(),
  sessionId: z.string().trim().max(120).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const analyticsSchema = z.object({
  eventName: z.string().trim().min(1).max(80),
  pagePath: z.string().trim().max(240).optional(),
  visitorId: z.string().trim().min(1).max(120),
  sessionId: z.string().trim().min(1).max(120),
  language: z.string().trim().max(12).optional(),
  referrer: z.string().trim().max(500).optional(),
  source: z.string().trim().max(80).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const listLeadsQuerySchema = z.object({
  type: z.enum(["all", "restaurant", "rider", "contact"]).optional(),
  status: z.enum(["all", "new", "contacted", "qualified", "converted", "closed"]).optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

const analyticsQuerySchema = z.object({
  days: z.coerce.number().int().positive().optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
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
  eventName: z.string().trim().max(80).optional(),
  deviceType: z.enum(["all", "desktop", "mobile", "tablet", "bot", "unknown"]).optional(),
  pagePath: z.string().trim().max(240).optional(),
  language: z.string().trim().max(12).optional(),
  eventPage: z.coerce.number().int().positive().optional(),
  eventPageSize: z.coerce.number().int().positive().max(100).optional(),
});

const areaRestaurantsQuerySchema = z.object({
  area: z.string().trim().min(1).max(160),
  limit: z.coerce.number().int().positive().max(60).optional(),
});

const updateLeadSchema = z.object({
  status: z.enum(["new", "contacted", "qualified", "converted", "closed"]).optional(),
  notes: z.string().trim().max(2000).optional(),
  assignedAdminId: z.string().trim().max(80).optional(),
  markContacted: z.boolean().optional(),
});

const serviceAreaSchema = z.object({
  name: z.string().trim().min(1).max(120),
  status: z.enum(["active", "coming_soon", "paused"]),
  note: z.string().trim().max(240).optional(),
  noteBn: z.string().trim().max(260).optional(),
  noteEn: z.string().trim().max(260).optional(),
  seoTitle: z.string().trim().max(180).optional(),
  seoDescription: z.string().trim().max(320).optional(),
  popularSearches: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  cuisineKeywords: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  postalCodes: z.array(z.string().trim().min(1).max(20)).max(20).optional(),
});

const updateSettingsSchema = z.object({
  siteUrl: z.string().trim().max(500).optional(),
  seoDefaultTitle: z.string().trim().max(180).optional(),
  seoDefaultDescription: z.string().trim().max(500).optional(),
  seoOgImageUrl: z.string().trim().max(500).optional(),
  googleSiteVerification: z.string().trim().max(200).optional(),
  businessAddress: z.string().trim().max(500).optional(),
  businessCity: z.string().trim().max(120).optional(),
  businessRegion: z.string().trim().max(120).optional(),
  businessPostalCode: z.string().trim().max(120).optional(),
  businessCountry: z.string().trim().max(12).optional(),
  playStoreUrl: z.string().trim().max(500).optional(),
  appDownloadUrl: z.string().trim().max(500).optional(),
  restaurantApplyUrl: z.string().trim().max(240).optional(),
  riderApplyUrl: z.string().trim().max(240).optional(),
  supportPhone: z.string().trim().max(60).optional(),
  supportEmail: z.string().trim().email().optional().or(z.literal("")),
  facebookUrl: z.string().trim().max(500).optional(),
  instagramUrl: z.string().trim().max(500).optional(),
  linkedinUrl: z.string().trim().max(500).optional(),
  tiktokUrl: z.string().trim().max(500).optional(),
  youtubeUrl: z.string().trim().max(500).optional(),
  snapchatUrl: z.string().trim().max(500).optional(),
  socialLinksOrder: z
    .array(z.enum(["facebook", "instagram", "youtube", "linkedin", "tiktok", "snapchat"]))
    .max(6)
    .optional(),
  heroTitle: z.string().trim().min(1).max(180).optional(),
  heroSubtitle: z.string().trim().min(1).max(500).optional(),
  heroTitleEn: z.string().trim().min(1).max(180).optional(),
  heroSubtitleEn: z.string().trim().min(1).max(500).optional(),
  customerYoutubeUrl: z.string().trim().max(500).optional(),
  customerVideoOrientation: z.enum(["portrait", "landscape"]).optional(),
  customerOfferEnabled: z.boolean().optional(),
  customerOfferTitle: z.string().trim().max(160).optional(),
  customerOfferDescription: z.string().trim().max(500).optional(),
  customerOfferCtaLabel: z.string().trim().max(80).optional(),
  customerOfferCtaUrl: z.string().trim().max(500).optional(),
  websiteModalEnabled: z.boolean().optional(),
  websiteModalMode: z.enum(["image", "image_text", "image_text_button"]).optional(),
  websiteModalImageUrl: z.string().trim().max(500).optional(),
  websiteModalTitle: z.string().trim().max(160).optional(),
  websiteModalTitleEn: z.string().trim().max(160).optional(),
  websiteModalDescription: z.string().trim().max(500).optional(),
  websiteModalDescriptionEn: z.string().trim().max(500).optional(),
  websiteModalCtaLabel: z.string().trim().max(80).optional(),
  websiteModalCtaLabelEn: z.string().trim().max(80).optional(),
  websiteModalCtaUrl: z.string().trim().max(500).optional(),
  websiteModalDelaySeconds: z.coerce.number().min(0).max(120).optional(),
  websiteModalFrequency: z.enum(["always", "session", "daily"]).optional(),
  websiteBannerEnabled: z.boolean().optional(),
  websiteBannerText: z.string().trim().max(180).optional(),
  websiteBannerTextEn: z.string().trim().max(180).optional(),
  websiteBannerCtaLabel: z.string().trim().max(80).optional(),
  websiteBannerCtaLabelEn: z.string().trim().max(80).optional(),
  websiteBannerCtaUrl: z.string().trim().max(500).optional(),
  coverageRewardAmount: z.coerce.number().min(0).max(100000).optional(),
  serviceAreas: z.array(serviceAreaSchema).max(100).optional(),
});

function getHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}

function getRequestIp(req: AuthenticatedRequest) {
  const forwardedFor = getHeaderValue(req.headers["x-forwarded-for"]);
  return forwardedFor.split(",")[0]?.trim() || req.ip || "";
}

export const getPublicWebsiteSettings = asyncHandler(
  async (_req: AuthenticatedRequest, res: Response) => {
    const data = await getWebsiteSettings();
    return sendSuccess(res, { data });
  },
);

export const postPublicWebsiteLead = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = leadSchema.parse(req.body);

    if (payload.type === "restaurant" && !payload.businessName?.trim()) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "RESTAURANT_NAME_REQUIRED",
        "Restaurant name is required",
      );
    }
    if (payload.type === "rider" && !payload.vehicleType?.trim()) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "VEHICLE_TYPE_REQUIRED",
        "Vehicle type is required",
      );
    }
    if (payload.type !== "contact") {
      if (!payload.area?.trim()) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          "AREA_ZONE_REQUIRED",
          "অনুগ্রহ করে তালিকা থেকে একটি সার্ভিস এলাকা বেছে নিন।",
        );
      }
      const settings = await getWebsiteSettings();
      const validAreas = new Set(
        (settings.serviceAreas ?? [])
          .map((area: { name?: string }) => area.name?.trim().toLowerCase())
          .filter(Boolean),
      );
      if (!validAreas.has(payload.area.trim().toLowerCase())) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          "AREA_ZONE_REQUIRED",
          "অনুগ্রহ করে তালিকা থেকে একটি সার্ভিস এলাকা বেছে নিন।",
        );
      }
    }

    const data = await createWebsiteLead({
      ...payload,
      area: payload.area?.trim() || "General message",
      ipAddress: getRequestIp(req),
      userAgent: req.get("user-agent") || "",
    });

    return sendSuccess(res, {
      statusCode: StatusCodes.CREATED,
      message: "Website lead created",
      data,
    });
  },
);

export const getPublicWebsiteAreaRestaurants = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = areaRestaurantsQuerySchema.parse(req.query);
    const data = await listWebsiteAreaRestaurants(query);
    return sendSuccess(res, { data });
  },
);

export const postPublicWebsiteAnalyticsEvent = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = analyticsSchema.parse(req.body);
    const data = await recordWebsiteAnalyticsEvent({
      ...payload,
      ipAddress: getRequestIp(req),
      userAgent: req.get("user-agent") || "",
    });

    return sendSuccess(res, { statusCode: StatusCodes.CREATED, data });
  },
);

export const getAdminWebsiteOverview = asyncHandler(
  async (_req: AuthenticatedRequest, res: Response) => {
    const data = await getWebsiteOverview();
    return sendSuccess(res, { data });
  },
);

export const getAdminWebsiteLeads = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = listLeadsQuerySchema.parse(req.query);
    const data = await listWebsiteLeads(query);
    return sendSuccess(res, { data });
  },
);

export const getAdminWebsiteLead = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const data = await getWebsiteLead(String(req.params.leadId));
    if (!data) {
      throw new AppError(StatusCodes.NOT_FOUND, "WEBSITE_LEAD_NOT_FOUND", "Lead not found");
    }

    return sendSuccess(res, { data });
  },
);

export const patchAdminWebsiteLead = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = updateLeadSchema.parse(req.body);
    const data = await updateWebsiteLead(String(req.params.leadId), payload);
    if (!data) {
      throw new AppError(StatusCodes.NOT_FOUND, "WEBSITE_LEAD_NOT_FOUND", "Lead not found");
    }

    return sendSuccess(res, { message: "Website lead updated", data });
  },
);

export const getAdminWebsiteAnalytics = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = analyticsQuerySchema.parse(req.query);
    const data = await getWebsiteAnalytics(query);
    return sendSuccess(res, { data });
  },
);

export const getAdminWebsiteSettings = asyncHandler(
  async (_req: AuthenticatedRequest, res: Response) => {
    const data = await getWebsiteSettings();
    return sendSuccess(res, { data });
  },
);

export const patchAdminWebsiteSettings = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = updateSettingsSchema.parse(req.body);
    const data = await updateWebsiteSettings(payload, req.user?.id ?? "");

    return sendSuccess(res, { message: "Website settings updated", data });
  },
);
