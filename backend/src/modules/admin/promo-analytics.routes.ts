import { Router } from "express";

import { requireAuth, requireRole } from "../../common/middleware/auth";
import { getAdminPromoAnalyticsController } from "./promo-analytics.controller";

export const adminPromoAnalyticsRouter = Router();

adminPromoAnalyticsRouter.use(requireAuth, requireRole("admin"));
adminPromoAnalyticsRouter.get(
  "/promo-analytics",
  getAdminPromoAnalyticsController,
);
