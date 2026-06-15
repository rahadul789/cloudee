import { Router } from "express";

import { requireAuth, requireRole } from "../../common/middleware/auth";
import { getAdminReportsController } from "./reports.controller";

export const adminReportsRouter = Router();

adminReportsRouter.use(requireAuth, requireRole("admin"));
adminReportsRouter.get("/reports", getAdminReportsController);
