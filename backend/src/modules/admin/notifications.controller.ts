import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedRequest } from "../../common/middleware/auth";
import { sendSuccess } from "../../common/utils/api-response";
import { asyncHandler } from "../../common/utils/async-handler";
import {
  cancelAdminNotificationSchedule,
  getAdminNotificationCampaignRecipients as getAdminNotificationCampaignRecipientsService,
  checkAdminNotificationCampaignReceipts,
  listAdminNotifications,
  markAllAdminNotificationsRead,
  markAdminNotificationRead,
  retryAdminNotificationSchedule,
  refreshAdminNotificationCampaignConversions,
  sendAdminNotification,
} from "./notifications.service";

const listNotificationsQuerySchema = z.object({
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
  kind: z.enum(["all", "notifications", "push"]).optional(),
  source: z.enum(["all", "customer", "owner", "rider", "campaign", "scheduled", "ops"]).optional(),
  status: z.enum(["all", "read", "unread"]).optional(),
  deliveryStatus: z
    .enum(["all", "sent", "push_ready", "scheduled", "failed", "cancelled", "in_app", "in_app_only", "campaign", "warning", "critical"])
    .optional(),
  recipientType: z.enum(["all", "customers", "owners", "riders"]).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

const sendNotificationSchema = z.object({
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
  recipientType: z.enum(["customers", "owners", "riders"]),
  audience: z.enum(["all", "selected"]),
  recipientIds: z.array(z.string().trim()).optional(),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(500),
  path: z.string().trim().optional(),
  ctaLabel: z.string().trim().max(60).optional(),
  ctaPath: z.string().trim().optional(),
  type: z.string().trim().optional(),
  contentType: z.enum(["text", "image", "image_text"]).optional(),
  imageUrl: z.string().trim().optional(),
  imagePublicId: z.string().trim().optional(),
  voucherId: z.string().trim().optional(),
  voucherCode: z.string().trim().max(40).optional(),
  voucherLabel: z.string().trim().max(120).optional(),
  voucherExpiresAt: z.string().trim().optional(),
  voucherMinOrder: z.coerce.number().min(0).optional(),
  personalOffer: z.boolean().optional(),
  customerAudienceType: z.enum(["all_users", "new_users", "returning_users", "selected_users"]).optional(),
  customerGroupKey: z.string().trim().optional(),
  restaurantScope: z.enum(["all_restaurants", "selected_restaurants"]).optional(),
  selectedRestaurantIds: z.array(z.string().trim()).optional(),
  abTest: z
    .object({
      enabled: z.boolean().optional(),
      splitPercent: z.number().int().min(1).max(99).optional(),
      variantBTitle: z.string().trim().optional(),
      variantBBody: z.string().trim().optional(),
      variantBPath: z.string().trim().optional(),
    })
    .optional(),
  conversionWindowDays: z.number().int().min(1).max(30).optional(),
  testMode: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  scheduledAt: z.string().trim().optional(),
});

const readNotificationParamsSchema = z.object({
  source: z.literal("ops"),
  id: z.string().trim().min(1),
});

const scheduleParamsSchema = z.object({
  scheduleId: z.string().trim().min(1),
});

const campaignRecipientsParamsSchema = z.object({
  campaignId: z.string().trim().min(1),
});

const campaignRecipientsQuerySchema = z.object({
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
  status: z.enum(["all", "received", "opened", "not_reached"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

function getAreaScope(query: Record<string, unknown>) {
  return listNotificationsQuerySchema.pick({ zoneId: true, districtId: true }).parse({
    zoneId: typeof query.zoneId === "string" ? query.zoneId : undefined,
    districtId: typeof query.districtId === "string" ? query.districtId : undefined,
  });
}

export const getAdminNotifications = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = listNotificationsQuerySchema.parse(req.query);
    const data = await listAdminNotifications(query);

    return sendSuccess(res, { data });
  },
);

export const postAdminNotificationSend = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = sendNotificationSchema.parse(req.body);
    const data = await sendAdminNotification({
      ...payload,
      adminId: req.user?.id ?? "",
    });

    return sendSuccess(res, {
      message: "Notification processed successfully",
      data,
    });
  },
);

export const getAdminNotificationCampaignRecipients = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const params = campaignRecipientsParamsSchema.parse(req.params);
    const query = campaignRecipientsQuerySchema.parse(req.query);
    const data = await getAdminNotificationCampaignRecipientsService({
      campaignId: params.campaignId,
      ...query,
    });

    return sendSuccess(res, { data });
  },
);

export const postAdminNotificationCampaignConversions = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const params = campaignRecipientsParamsSchema.parse(req.params);
    const data = await refreshAdminNotificationCampaignConversions(
      params.campaignId,
      getAreaScope(req.query),
    );

    return sendSuccess(res, {
      message: data.refreshed ? "Campaign conversions refreshed" : "Campaign conversions unavailable",
      data,
    });
  },
);

export const postAdminNotificationCampaignReceipts = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const params = campaignRecipientsParamsSchema.parse(req.params);
    const data = await checkAdminNotificationCampaignReceipts(
      params.campaignId,
      getAreaScope(req.query),
    );

    return sendSuccess(res, {
      message: data.unavailableReason ? data.unavailableReason : "Campaign receipts checked",
      data,
    });
  },
);

export const patchAdminNotificationRead = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const params = readNotificationParamsSchema.parse(req.params);
    const data = await markAdminNotificationRead({
      ...params,
      ...getAreaScope(req.query),
    });

    return sendSuccess(res, {
      message: data.updated ? "Notification marked as read" : "Notification not found",
      data,
    });
  },
);

export const patchAdminNotificationsReadAll = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = listNotificationsQuerySchema
      .pick({ zoneId: true, districtId: true })
      .parse(req.query);
    const data = await markAllAdminNotificationsRead(query);

    return sendSuccess(res, {
      message: "All notifications marked as read",
      data,
    });
  },
);

export const postAdminNotificationScheduleCancel = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { scheduleId } = scheduleParamsSchema.parse(req.params);
    const data = await cancelAdminNotificationSchedule(scheduleId, getAreaScope(req.query));

    return sendSuccess(res, {
      message: data.updated ? "Scheduled notification cancelled" : "Scheduled notification not changed",
      data,
    });
  },
);

export const postAdminNotificationScheduleRetry = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { scheduleId } = scheduleParamsSchema.parse(req.params);
    const data = await retryAdminNotificationSchedule(scheduleId, getAreaScope(req.query));

    return sendSuccess(res, {
      message: data.updated ? "Scheduled notification retried" : "Scheduled notification not retried",
      data,
    });
  },
);
