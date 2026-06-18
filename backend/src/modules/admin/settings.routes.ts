import { Router } from "express"

import { requireAuth, requireRole } from "../../common/middleware/auth"
import {
  getAdminRoutingUsageController,
  getAdminSettingsController,
  getAdminSmsBalanceController,
  putAdminSettingsController,
} from "./settings.controller"

export const adminSettingsRouter = Router()

adminSettingsRouter.use(requireAuth, requireRole("admin"))
adminSettingsRouter.get("/settings", getAdminSettingsController)
adminSettingsRouter.get("/settings/routing-usage", getAdminRoutingUsageController)
adminSettingsRouter.get("/settings/sms-balance", getAdminSmsBalanceController)
adminSettingsRouter.put("/settings", putAdminSettingsController)
