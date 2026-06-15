import { Router } from "express";

import { requireAuth, requireRole } from "../../common/middleware/auth";
import {
  getAdminWebsiteAnalytics,
  getAdminWebsiteLead,
  getAdminWebsiteLeads,
  getAdminWebsiteOverview,
  getAdminWebsiteSettings,
  getPublicWebsiteAreaRestaurants,
  getPublicWebsiteSettings,
  patchAdminWebsiteLead,
  patchAdminWebsiteSettings,
  postPublicWebsiteAnalyticsEvent,
  postPublicWebsiteLead,
} from "./website.controller";

export const websitePublicRouter = Router();
export const adminWebsiteRouter = Router();

websitePublicRouter.get("/settings", getPublicWebsiteSettings);
websitePublicRouter.get("/area-restaurants", getPublicWebsiteAreaRestaurants);
websitePublicRouter.post("/leads", postPublicWebsiteLead);
websitePublicRouter.post("/analytics/events", postPublicWebsiteAnalyticsEvent);

adminWebsiteRouter.use(requireAuth, requireRole("admin"));
adminWebsiteRouter.get("/website/overview", getAdminWebsiteOverview);
adminWebsiteRouter.get("/website/leads", getAdminWebsiteLeads);
adminWebsiteRouter.get("/website/leads/:leadId", getAdminWebsiteLead);
adminWebsiteRouter.patch("/website/leads/:leadId", patchAdminWebsiteLead);
adminWebsiteRouter.get("/website/analytics", getAdminWebsiteAnalytics);
adminWebsiteRouter.get("/website/settings", getAdminWebsiteSettings);
adminWebsiteRouter.patch("/website/settings", patchAdminWebsiteSettings);
