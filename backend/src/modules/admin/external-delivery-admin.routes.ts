import { Router } from "express"

import { requireAuth, requireRole } from "../../common/middleware/auth"
import {
  getAdminExternalDeliveries,
  getAdminExternalDeliveryConfig,
  getAdminExternalDeliveryReports,
  getAdminExternalDeliverySummary,
  patchAdminExternalDeliveryConfig,
  postAdminExternalDeliveryReconcile,
  postAdminExternalDeliverySettle,
} from "./external-delivery-admin.controller"

export const adminExternalDeliveryRouter = Router()

adminExternalDeliveryRouter.use(requireAuth, requireRole("admin"))

adminExternalDeliveryRouter.get("/external-deliveries", getAdminExternalDeliveries)
adminExternalDeliveryRouter.get(
  "/external-deliveries/summary",
  getAdminExternalDeliverySummary,
)
adminExternalDeliveryRouter.get(
  "/external-deliveries/reports",
  getAdminExternalDeliveryReports,
)
adminExternalDeliveryRouter.post(
  "/external-deliveries/settle",
  postAdminExternalDeliverySettle,
)
adminExternalDeliveryRouter.get(
  "/external-deliveries/restaurants/:restaurantId/config",
  getAdminExternalDeliveryConfig,
)
adminExternalDeliveryRouter.patch(
  "/external-deliveries/restaurants/:restaurantId/config",
  patchAdminExternalDeliveryConfig,
)
adminExternalDeliveryRouter.post(
  "/external-deliveries/:orderId/reconcile",
  postAdminExternalDeliveryReconcile,
)
