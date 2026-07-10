import { Router } from "express"

import { requireAuth, requireRole } from "../../common/middleware/auth"
import {
  getAdminPlatformContent,
  getAdminRestaurantsWithOffers,
  postAdminCustomerHomePush,
  postAdminCustomerHomeTestPush,
  postAdminCustomerHomePushConversions,
  postAdminCustomerHomePushReceipts,
  postAdminCustomerHomePushSchedule,
  postAdminCustomerHomePushScheduleCancel,
  postAdminPlatformContentRollback,
  putAdminPlatformContent,
} from "./platform-content.controller"

export const adminPlatformContentRouter = Router()

adminPlatformContentRouter.use(requireAuth, requireRole("admin"))
adminPlatformContentRouter.get("/platform-content", getAdminPlatformContent)
adminPlatformContentRouter.get(
  "/platform-content/restaurants-with-offers",
  getAdminRestaurantsWithOffers,
)
adminPlatformContentRouter.put("/platform-content", putAdminPlatformContent)
adminPlatformContentRouter.post("/platform-content/rollback", postAdminPlatformContentRollback)
adminPlatformContentRouter.post("/platform-content/customer-home-push/send", postAdminCustomerHomePush)
adminPlatformContentRouter.post("/platform-content/customer-home-push/test", postAdminCustomerHomeTestPush)
adminPlatformContentRouter.post("/platform-content/customer-home-push/check-receipts", postAdminCustomerHomePushReceipts)
adminPlatformContentRouter.post("/platform-content/customer-home-push/refresh-conversions", postAdminCustomerHomePushConversions)
adminPlatformContentRouter.post("/platform-content/customer-home-push/schedule", postAdminCustomerHomePushSchedule)
adminPlatformContentRouter.post("/platform-content/customer-home-push/cancel-schedule", postAdminCustomerHomePushScheduleCancel)
