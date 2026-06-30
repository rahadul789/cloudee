import { Router } from "express";

import { requireAuth, requireRole } from "../../common/middleware/auth";
import {
  getAdminOperationalHealth,
  getAdminRateLimitSnapshot,
  patchAdminOperationalAlertResolve,
  patchAdminOperationalAlertSnooze,
  postAdminRateLimitBucketReset,
  postAdminOperationsRequestMonitorClear,
} from "./operations-health.controller";

export const adminOperationsHealthRouter = Router();

adminOperationsHealthRouter.use(requireAuth, requireRole("admin"));
adminOperationsHealthRouter.get("/operations/health", getAdminOperationalHealth);
adminOperationsHealthRouter.get("/operations/rate-limits", getAdminRateLimitSnapshot);
adminOperationsHealthRouter.post(
  "/operations/rate-limits/:limiterId/reset",
  postAdminRateLimitBucketReset,
);
adminOperationsHealthRouter.post(
  "/operations/requests/clear",
  postAdminOperationsRequestMonitorClear,
);
adminOperationsHealthRouter.patch(
  "/operations/alerts/:alertId/resolve",
  patchAdminOperationalAlertResolve,
);
adminOperationsHealthRouter.patch(
  "/operations/alerts/:alertId/snooze",
  patchAdminOperationalAlertSnooze,
);
