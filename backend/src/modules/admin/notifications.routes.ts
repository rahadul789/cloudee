import { Router } from "express";

import { requireAuth, requireRole } from "../../common/middleware/auth";
import {
  getAdminNotifications,
  getAdminNotificationCampaignRecipients,
  patchAdminNotificationsReadAll,
  patchAdminNotificationRead,
  postAdminNotificationCampaignReceipts,
  postAdminNotificationCampaignConversions,
  postAdminNotificationScheduleCancel,
  postAdminNotificationScheduleRetry,
  postAdminNotificationSend,
} from "./notifications.controller";

export const adminNotificationsRouter = Router();

adminNotificationsRouter.use(requireAuth, requireRole("admin"));

adminNotificationsRouter.get("/notifications", getAdminNotifications);
adminNotificationsRouter.get(
  "/notifications/campaigns/:campaignId/recipients",
  getAdminNotificationCampaignRecipients,
);
adminNotificationsRouter.post(
  "/notifications/campaigns/:campaignId/conversions",
  postAdminNotificationCampaignConversions,
);
adminNotificationsRouter.post(
  "/notifications/campaigns/:campaignId/receipts",
  postAdminNotificationCampaignReceipts,
);
adminNotificationsRouter.post("/notifications/send", postAdminNotificationSend);
adminNotificationsRouter.patch(
  "/notifications/read-all",
  patchAdminNotificationsReadAll,
);
adminNotificationsRouter.patch(
  "/notifications/:source/:id/read",
  patchAdminNotificationRead,
);
adminNotificationsRouter.post(
  "/notifications/scheduled/:scheduleId/cancel",
  postAdminNotificationScheduleCancel,
);
adminNotificationsRouter.post(
  "/notifications/scheduled/:scheduleId/retry",
  postAdminNotificationScheduleRetry,
);
