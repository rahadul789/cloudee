import { Router } from "express";

import { requireAuth, requireRole } from "../../common/middleware/auth";
import { getAdminReferral, getAdminReferrals } from "./referrals.controller";

export const adminReferralsRouter = Router();

adminReferralsRouter.use(requireAuth, requireRole("admin"));
adminReferralsRouter.get("/referrals", getAdminReferrals);
adminReferralsRouter.get("/referrals/:referralId", getAdminReferral);
