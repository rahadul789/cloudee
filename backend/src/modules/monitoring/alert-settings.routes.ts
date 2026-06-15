import { Router } from "express";

import { requireAuth, requireRole } from "../../common/middleware/auth";
import {
  getAdminAlertSettingsController,
  postAdminAlertTestController,
  postAdminTelegramTestController,
  putAdminAlertSettingsController,
} from "./alert-settings.controller";

export const adminAlertSettingsRouter = Router();

adminAlertSettingsRouter.use(requireAuth, requireRole("admin"));
adminAlertSettingsRouter.get("/alert-settings", getAdminAlertSettingsController);
adminAlertSettingsRouter.put("/alert-settings", putAdminAlertSettingsController);
adminAlertSettingsRouter.post("/alert-settings/test", postAdminAlertTestController);
adminAlertSettingsRouter.post(
  "/alert-settings/test/telegram",
  postAdminTelegramTestController,
);
