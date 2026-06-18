import { Router } from "express";

import {
  createAdminWriteLimiter,
  createOwnerWriteLimiter,
} from "../common/middleware/rate-limit";
import { adminAuthRouter } from "../modules/admin/admin.routes";
import { adminCategoriesRouter } from "../modules/admin/categories.routes";
import { adminCustomerAnalyticsRouter } from "../modules/admin/customer-analytics.routes";
import { adminCustomersRouter } from "../modules/admin/customers.routes";
import { adminFinanceRouter } from "../modules/admin/finance.routes";
import { adminOrdersMonitorRouter } from "../modules/admin/orders-monitor.routes";
import { adminNotificationsRouter } from "../modules/admin/notifications.routes";
import { adminOtpSecurityRouter } from "../modules/admin/otp-security.routes";
import { adminOperationsHealthRouter } from "../modules/admin/operations-health.routes";
import { adminPlatformContentRouter } from "../modules/admin/platform-content.routes";
import { adminPromoAnalyticsRouter } from "../modules/admin/promo-analytics.routes";
import { adminSettingsRouter } from "../modules/admin/settings.routes";
import { adminServiceAreasRouter } from "../modules/admin/service-areas.routes";
import { adminAlertSettingsRouter } from "../modules/monitoring/alert-settings.routes";
import { adminReviewRouter } from "../modules/admin/review.routes";
import { adminReferralsRouter } from "../modules/admin/referrals.routes";
import { adminReportsRouter } from "../modules/admin/reports.routes";
import { adminRestaurantsRouter } from "../modules/admin/restaurants.routes";
import { adminSessionsRouter } from "../modules/admin/sessions.routes";
import { adminSupportRouter } from "../modules/admin/support.routes";
import { authRouter } from "../modules/auth/auth.routes";
import { customerRouter } from "../modules/customer/customer.routes";
import { healthRouter } from "../modules/health/health.routes";
import { mediaRouter } from "../modules/media/media.routes";
import { ownerRouter } from "../modules/owner/owner.routes";
import { publicRouter } from "../modules/public/public.routes";
import {
  adminPromotionsRouter,
  ownerPromotionsRouter,
} from "../modules/promotions/promotions.routes";
import { riderRouter } from "../modules/rider/rider.routes";
import {
  adminWebsiteRouter,
  websitePublicRouter,
} from "../modules/website/website.routes";

export const apiRouter = Router();
const adminWriteLimiter = createAdminWriteLimiter();
const ownerWriteLimiter = createOwnerWriteLimiter();

apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/customer", customerRouter);
apiRouter.use("/rider", riderRouter);
apiRouter.use("/public", publicRouter);
apiRouter.use("/website", websitePublicRouter);
apiRouter.use("/owner", ownerWriteLimiter);
apiRouter.use("/owner", ownerRouter);
apiRouter.use("/owner", ownerPromotionsRouter);
apiRouter.use("/admin/auth", adminAuthRouter);
apiRouter.use("/admin", adminWriteLimiter);
apiRouter.use("/admin", adminCategoriesRouter);
apiRouter.use("/admin", adminCustomerAnalyticsRouter);
apiRouter.use("/admin", adminCustomersRouter);
apiRouter.use("/admin", adminFinanceRouter);
apiRouter.use("/admin", adminOrdersMonitorRouter);
apiRouter.use("/admin", adminNotificationsRouter);
apiRouter.use("/admin", adminOtpSecurityRouter);
apiRouter.use("/admin", adminOperationsHealthRouter);
apiRouter.use("/admin", adminPlatformContentRouter);
apiRouter.use("/admin", adminPromoAnalyticsRouter);
apiRouter.use("/admin", adminSettingsRouter);
apiRouter.use("/admin", adminAlertSettingsRouter);
apiRouter.use("/admin", adminServiceAreasRouter);
apiRouter.use("/admin", adminReviewRouter);
apiRouter.use("/admin", adminReferralsRouter);
apiRouter.use("/admin", adminReportsRouter);
apiRouter.use("/admin", adminRestaurantsRouter);
apiRouter.use("/admin", adminSessionsRouter);
apiRouter.use("/admin", adminSupportRouter);
apiRouter.use("/admin", adminPromotionsRouter);
apiRouter.use("/admin", adminWebsiteRouter);
apiRouter.use("/media", mediaRouter);
