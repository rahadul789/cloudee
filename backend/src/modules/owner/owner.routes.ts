import { Router } from "express"

import { requireAuth, requireRole } from "../../common/middleware/auth"
import {
  getOwnerOpeningHours,
  getOwnerReviews,
  patchOwnerRestaurantStatus,
  getOwnerStoreSettings,
  getOwnerSupportCases,
  patchOwnerStoreSettings,
  postOwnerReviewHideRequest,
  postOwnerReviewReply,
  postOwnerSupportCase,
  putOwnerOpeningHours
} from "./business.controller"
import {
  getOwnerAnalyticsOverview,
  getOwnerDashboardSummary,
  getOwnerPayoutHistory,
  getOwnerPayoutSummary,
  getOwnerPayoutTransactions,
  postOwnerPayoutRequest,
  putOwnerPayoutMethod
} from "./finance.controller"
import {
  deleteOwnerPushToken,
  getOwnerMe,
  patchOwnerMe,
  patchOwnerPassword,
  postOwnerImpersonationEnd,
  postOwnerPushToken
} from "./owner.controller"
import {
  deleteOwnerCategory,
  deleteOwnerMenuItem,
  getOwnerDeletedMenu,
  restoreOwnerCategory,
  restoreOwnerMenuItem,
  getOwnerCategories,
  getOwnerMenuApprovalRequests,
  getOwnerMenuItems,
  getOwnerNotifications,
  getOwnerOrderById,
  getOwnerOrders,
  getOwnerRiderAssignmentOptions,
  getOwnerSidebarSummaryController,
  patchOwnerCategory,
  patchOwnerMenuItem,
  patchOwnerNotificationRead,
  patchOwnerNotificationsReadAll,
  postOwnerCategory,
  postOwnerMenuItem,
  postOwnerOrderAssignRider,
  postOwnerOrderPreparationExtension,
  postOwnerOrderTransition
} from "./operational.controller"
import {
  getOnboardingDraft,
  getReviewStatus,
  submitOnboardingDraft,
  updateOnboardingDraft
} from "./onboarding.controller"
import {
  getOwnerExternalDeliveries,
  getOwnerExternalDeliveryById,
  getOwnerExternalDeliveryConfigController,
  getOwnerExternalDeliveryStats,
  postOwnerExternalDelivery,
  postOwnerExternalDeliveryCancel
} from "./external-delivery.controller"

export const ownerRouter = Router()

ownerRouter.use(requireAuth, requireRole("owner"))

ownerRouter.get("/me", getOwnerMe)
ownerRouter.patch("/me", patchOwnerMe)
ownerRouter.patch("/me/password", patchOwnerPassword)
ownerRouter.post("/impersonation/end", postOwnerImpersonationEnd)
ownerRouter.post("/push-tokens", postOwnerPushToken)
ownerRouter.delete("/push-tokens", deleteOwnerPushToken)
ownerRouter.get("/onboarding/draft", getOnboardingDraft)
ownerRouter.put("/onboarding/draft", updateOnboardingDraft)
ownerRouter.post("/onboarding/submit", submitOnboardingDraft)
ownerRouter.get("/review-status", getReviewStatus)
ownerRouter.get("/sidebar-summary", getOwnerSidebarSummaryController)
ownerRouter.get("/categories", getOwnerCategories)
ownerRouter.post("/categories", postOwnerCategory)
ownerRouter.patch("/categories/:categoryId", patchOwnerCategory)
ownerRouter.delete("/categories/:categoryId", deleteOwnerCategory)
ownerRouter.get("/menu-items", getOwnerMenuItems)
ownerRouter.get("/menu-approval-requests", getOwnerMenuApprovalRequests)
ownerRouter.post("/menu-items", postOwnerMenuItem)
ownerRouter.patch("/menu-items/:itemId", patchOwnerMenuItem)
ownerRouter.delete("/menu-items/:itemId", deleteOwnerMenuItem)
ownerRouter.get("/menu/trash", getOwnerDeletedMenu)
ownerRouter.post("/categories/:categoryId/restore", restoreOwnerCategory)
ownerRouter.post("/menu-items/:itemId/restore", restoreOwnerMenuItem)
ownerRouter.get("/orders", getOwnerOrders)
ownerRouter.get("/orders/:orderId", getOwnerOrderById)
ownerRouter.get("/riders/assignment-options", getOwnerRiderAssignmentOptions)
ownerRouter.post("/orders/:orderId/assign-rider", postOwnerOrderAssignRider)
ownerRouter.post("/orders/:orderId/preparation/extend", postOwnerOrderPreparationExtension)
ownerRouter.post("/orders/:orderId/transition", postOwnerOrderTransition)
ownerRouter.get("/external-deliveries/config", getOwnerExternalDeliveryConfigController)
ownerRouter.get("/external-deliveries/stats", getOwnerExternalDeliveryStats)
ownerRouter.post("/external-deliveries", postOwnerExternalDelivery)
ownerRouter.get("/external-deliveries", getOwnerExternalDeliveries)
ownerRouter.get("/external-deliveries/:orderId", getOwnerExternalDeliveryById)
ownerRouter.post("/external-deliveries/:orderId/cancel", postOwnerExternalDeliveryCancel)
ownerRouter.get("/notifications", getOwnerNotifications)
ownerRouter.patch("/notifications/:notificationId/read", patchOwnerNotificationRead)
ownerRouter.patch("/notifications/read-all", patchOwnerNotificationsReadAll)
ownerRouter.get("/payouts/summary", getOwnerPayoutSummary)
ownerRouter.get("/payouts/history", getOwnerPayoutHistory)
ownerRouter.post("/payouts/request", postOwnerPayoutRequest)
ownerRouter.get("/payout-transactions", getOwnerPayoutTransactions)
ownerRouter.put("/payout-method", putOwnerPayoutMethod)
ownerRouter.get("/dashboard/summary", getOwnerDashboardSummary)
ownerRouter.get("/analytics/overview", getOwnerAnalyticsOverview)
ownerRouter.get("/store-settings", getOwnerStoreSettings)
ownerRouter.patch("/store-settings", patchOwnerStoreSettings)
ownerRouter.patch("/restaurant-status", patchOwnerRestaurantStatus)
ownerRouter.get("/opening-hours", getOwnerOpeningHours)
ownerRouter.put("/opening-hours", putOwnerOpeningHours)
ownerRouter.get("/reviews", getOwnerReviews)
ownerRouter.post("/reviews/:reviewId/hide-request", postOwnerReviewHideRequest)
ownerRouter.post("/reviews/:reviewId/reply", postOwnerReviewReply)
ownerRouter.get("/support-cases", getOwnerSupportCases)
ownerRouter.post("/support-cases", postOwnerSupportCase)
