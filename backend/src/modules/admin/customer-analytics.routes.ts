import { Router } from "express"

import { requireAuth, requireRole } from "../../common/middleware/auth"
import {
  getAdminCustomerAnalyticsActorDetailController,
  getAdminCustomerAnalyticsCustomersController,
  getAdminCustomerAnalyticsEventsController,
  getAdminCustomerAnalyticsFunnelsController,
  getAdminCustomerAnalyticsOverviewController,
  getAdminCustomerAnalyticsPaymentsController,
} from "./customer-analytics.controller"

export const adminCustomerAnalyticsRouter = Router()

adminCustomerAnalyticsRouter.use(requireAuth, requireRole("admin"))
adminCustomerAnalyticsRouter.get("/customer-analytics/overview", getAdminCustomerAnalyticsOverviewController)
adminCustomerAnalyticsRouter.get("/customer-analytics/funnels", getAdminCustomerAnalyticsFunnelsController)
adminCustomerAnalyticsRouter.get("/customer-analytics/customers", getAdminCustomerAnalyticsCustomersController)
adminCustomerAnalyticsRouter.get("/customer-analytics/payments", getAdminCustomerAnalyticsPaymentsController)
adminCustomerAnalyticsRouter.get("/customer-analytics/events", getAdminCustomerAnalyticsEventsController)
adminCustomerAnalyticsRouter.get("/customer-analytics/actor-detail", getAdminCustomerAnalyticsActorDetailController)
