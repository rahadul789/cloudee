import { forRider } from "../../common/utils/delivery-code"
import { Router } from "express"
import { getPlatformContent } from "../public/content.service"
import {
  createOtpSendIpLimiter,
  createOtpSendLimiter,
  createOtpVerifyLimiter,
  createPasswordRecoveryLimiter,
  createRefreshLimiter,
  createRiderLocationLimiter,
  createSigninLimiter
} from "../../common/middleware/rate-limit"

import { requireAuth, requireRole } from "../../common/middleware/auth"
import { riderOrderChat } from "../order-chat/order-chat.controller"
import {
  getRiderLiveMapView,
  getRiderNotifications,
  getRiderOrder,
  getRiderOrders,
  getRiderOrdersSummary,
  getRiderReassignCandidates,
  postRiderReassign,
  getRiderPlatformContentPayload,
  getRiderProfileSummary,
  getRiderReviews,
  logoutRiderAuth,
  deleteRiderPushToken,
  patchRiderNotificationRead,
  patchRiderNotificationsReadAll,
  patchRiderProfileAvailability,
  patchRiderProfileLocation,
  postRiderAccept,
  postRiderDelivered,
  postRiderFailedDelivery,
  postRiderOrderLocation,
  postRiderReady,
  postRiderPickup,
  postRiderPushToken,
  postRiderTrackingActivate,
  refreshRiderAuth,
  resetRiderPasswordAuth,
  signinRiderPasswordAuth,
  startRiderPhoneAuth,
  startRiderPasswordResetAuth,
  verifyRiderPasswordResetAuth,
  verifyRiderPhoneAuth
} from "./rider.controller"

export const riderRouter = Router()

// While the delivery code is ON, every rider HTTP response shows order numbers as
// "FB-…-••••" (the last 4 digits ARE the code). Never blocks a request (the location
// upload is a hot path): uses the cached switch and refreshes it in the background at
// most once a minute (any platform-content read also updates it).
let deliveryCodeSwitchRefreshedAt = 0
riderRouter.use((req, res, next) => {
  if (Date.now() - deliveryCodeSwitchRefreshedAt > 60_000) {
    deliveryCodeSwitchRefreshedAt = Date.now()
    void getPlatformContent().catch(() => undefined)
  }
  const json = res.json.bind(res)
  res.json = ((body: unknown) => json(forRider(body))) as typeof res.json
  next()
})
const riderAuthStartLimiter = createOtpSendLimiter("rider")
const riderAuthStartIpLimiter = createOtpSendIpLimiter("rider")
const riderAuthVerifyLimiter = createOtpVerifyLimiter("rider")
const riderSigninLimiter = createSigninLimiter("rider")
const riderPasswordRecoveryLimiter = createPasswordRecoveryLimiter("rider")
const riderRefreshLimiter = createRefreshLimiter("rider")
const riderLocationLimiter = createRiderLocationLimiter()

riderRouter.post("/auth/phone/start", riderAuthStartIpLimiter, riderAuthStartLimiter, startRiderPhoneAuth)
riderRouter.post("/auth/phone/verify", riderAuthVerifyLimiter, verifyRiderPhoneAuth)
riderRouter.post("/auth/password/signin", riderSigninLimiter, signinRiderPasswordAuth)
riderRouter.post("/auth/password/forgot", riderAuthStartIpLimiter, riderPasswordRecoveryLimiter, startRiderPasswordResetAuth)
riderRouter.post("/auth/password/verify", riderAuthVerifyLimiter, verifyRiderPasswordResetAuth)
riderRouter.post("/auth/password/reset", riderPasswordRecoveryLimiter, resetRiderPasswordAuth)
riderRouter.post("/auth/refresh", riderRefreshLimiter, refreshRiderAuth)
riderRouter.post("/auth/logout", logoutRiderAuth)

riderRouter.get("/profile", requireAuth, requireRole("rider"), getRiderProfileSummary)
riderRouter.get("/reviews", requireAuth, requireRole("rider"), getRiderReviews)
riderRouter.get(
  "/platform-content",
  requireAuth,
  requireRole("rider"),
  getRiderPlatformContentPayload
)
riderRouter.patch(
  "/profile/availability",
  requireAuth,
  requireRole("rider"),
  patchRiderProfileAvailability
)
riderRouter.patch(
  "/profile/location",
  requireAuth,
  requireRole("rider"),
  riderLocationLimiter,
  patchRiderProfileLocation
)
riderRouter.post("/push-tokens", requireAuth, requireRole("rider"), postRiderPushToken)
riderRouter.delete("/push-tokens", requireAuth, requireRole("rider"), deleteRiderPushToken)
riderRouter.get("/notifications", requireAuth, requireRole("rider"), getRiderNotifications)
riderRouter.patch(
  "/notifications/read-all",
  requireAuth,
  requireRole("rider"),
  patchRiderNotificationsReadAll
)
riderRouter.patch(
  "/notifications/:notificationId/read",
  requireAuth,
  requireRole("rider"),
  patchRiderNotificationRead
)
riderRouter.get("/live-map", requireAuth, requireRole("rider"), getRiderLiveMapView)
riderRouter.get("/orders", requireAuth, requireRole("rider"), getRiderOrders)
riderRouter.get("/orders/summary", requireAuth, requireRole("rider"), getRiderOrdersSummary)
riderRouter.get("/orders/:orderId", requireAuth, requireRole("rider"), getRiderOrder)
riderRouter.get("/orders/:orderId/chat", requireAuth, requireRole("rider"), riderOrderChat.getThread)
riderRouter.post("/orders/:orderId/chat", requireAuth, requireRole("rider"), riderOrderChat.send)
riderRouter.post("/orders/:orderId/chat/read", requireAuth, requireRole("rider"), riderOrderChat.markRead)
riderRouter.get(
  "/orders/:orderId/reassign-candidates",
  requireAuth,
  requireRole("rider"),
  getRiderReassignCandidates,
)
riderRouter.post(
  "/orders/:orderId/reassign",
  requireAuth,
  requireRole("rider"),
  postRiderReassign,
)
riderRouter.post("/orders/:orderId/accept", requireAuth, requireRole("rider"), postRiderAccept)
riderRouter.post("/orders/:orderId/ready", requireAuth, requireRole("rider"), postRiderReady)
riderRouter.post("/orders/:orderId/pickup", requireAuth, requireRole("rider"), postRiderPickup)
riderRouter.post("/orders/:orderId/deliver", requireAuth, requireRole("rider"), postRiderDelivered)
riderRouter.post("/orders/:orderId/fail", requireAuth, requireRole("rider"), postRiderFailedDelivery)
riderRouter.post(
  "/orders/:orderId/tracking/activate",
  requireAuth,
  requireRole("rider"),
  postRiderTrackingActivate
)
riderRouter.post(
  "/orders/:orderId/location",
  requireAuth,
  requireRole("rider"),
  riderLocationLimiter,
  postRiderOrderLocation
)
