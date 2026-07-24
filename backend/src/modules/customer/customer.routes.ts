import { Router } from "express"
import {
  createOrderActionLimiter,
  createOrderPlaceLimiter,
  createOtpSendIpLimiter,
  createOtpSendLimiter,
  createOtpVerifyLimiter,
  createPaymentLimiter,
  createPasswordRecoveryLimiter,
  createRefreshLimiter,
  createSigninLimiter,
  createSupportWriteLimiter,
  createAnalyticsEventLimiter,
  createCartQuoteLimiter,
  createFavoriteToggleLimiter,
  createCouponAttemptLimiter,
  createCustomerOrderReadLimiter
} from "../../common/middleware/rate-limit"

import { requireAuth, requireRole } from "../../common/middleware/auth"
import { postCustomerAnalyticsEvent } from "./customer-analytics.controller"
import {
  getCustomerOrder,
  getCustomerOrders,
  getCustomerCustomOfferSummaryController,
  getCustomerProfileSummary,
  getCustomerReferralSummaryController,
  postCustomerReferralApplyController,
  getCustomerLocations,
  getCustomerNotifications,
  getCustomerNotification,
  getCustomerNotificationCampaign,
  deleteCustomerPushToken,
  getCustomerDiscovery,
  getCustomerDiscoverySearch,
  getCustomerDiscoveryHomePage,
  getCustomerFavoriteRestaurants,
  postCustomerVoucherDisplayEvent,
  postCustomerPollVote,
  postCustomerPushOpenEvent,
  getCustomerFavoriteRestaurantCards,
  getCustomerRestaurant,
  getCustomerSupportCaseController,
  getCustomerLatestSupportCaseController,
  getBkashReturnPage,
  getBkashCallback,
  logoutCustomerAuth,
  startCustomerPhoneChangeOtp,
  postBkashInitiate,
  deleteCustomerLocation,
  patchCustomerLocation,
  patchCustomerLocationDefault,
  patchCustomerLocationTouch,
  postCustomerFavoriteToggle,
  patchCustomerPassword,
  patchCustomerProfile,
  patchCustomerNotificationRead,
  patchCustomerNotificationsReadAll,
  postCustomerLocation,
  postCustomerPushToken,
  postCustomerCartQuote,
  postCustomerOrder,
  postCustomerOrderCancel,
  postCustomerCustomOfferRequestController,
  postCustomerReview,
  postCustomerSupportCaseController,
  postCustomerSupportCaseMessageController,
  refreshCustomerAuth,
  resetCustomerPasswordController,
  signinCustomerGoogle,
  signinCustomerWithPasswordController,
  startCustomerPasswordReset,
  startCustomerPhoneAuth,
  requestCustomerOtpCall,
  requestCustomerOtpWhatsApp,
  verifyCustomerPhoneOtpCode,
  verifyCustomerPhoneChangeOtp,
  verifyCustomerPhoneAuth,
  verifyCustomerPasswordResetOtpCode
} from "./customer.controller"

export const customerRouter = Router()
const customerAuthStartLimiter = createOtpSendLimiter("customer")
const customerAuthStartIpLimiter = createOtpSendIpLimiter("customer")
const customerPasswordSigninLimiter = createSigninLimiter("customer")
const customerOtpVerifyLimiter = createOtpVerifyLimiter("customer")
const customerPasswordRecoveryLimiter = createPasswordRecoveryLimiter("customer")
const customerRefreshLimiter = createRefreshLimiter("customer")
const customerSupportWriteLimiter = createSupportWriteLimiter()
const customerPaymentLimiter = createPaymentLimiter()
const customerOrderActionLimiter = createOrderActionLimiter()
const customerAnalyticsEventLimiter = createAnalyticsEventLimiter()
const customerCartQuoteLimiter = createCartQuoteLimiter()
const customerFavoriteToggleLimiter = createFavoriteToggleLimiter()
const customerCouponAttemptLimiter = createCouponAttemptLimiter()
const customerOrderPlaceLimiter = createOrderPlaceLimiter()
const customerOrderReadLimiter = createCustomerOrderReadLimiter()

customerRouter.post("/analytics/events", customerAnalyticsEventLimiter, postCustomerAnalyticsEvent)
customerRouter.post("/auth/phone/start", customerAuthStartIpLimiter, customerAuthStartLimiter, startCustomerPhoneAuth)
customerRouter.post("/auth/phone/password", customerPasswordSigninLimiter, signinCustomerWithPasswordController)
customerRouter.post(
  "/auth/password/forgot",
  customerAuthStartIpLimiter,
  customerPasswordRecoveryLimiter,
  startCustomerPasswordReset
)
customerRouter.post("/auth/password/otp/verify", customerOtpVerifyLimiter, verifyCustomerPasswordResetOtpCode)
customerRouter.post("/auth/password/reset", customerPasswordRecoveryLimiter, resetCustomerPasswordController)
customerRouter.post("/auth/phone/otp/call-request", customerAuthStartLimiter, requestCustomerOtpCall)
customerRouter.post("/auth/phone/otp/whatsapp", customerAuthStartLimiter, requestCustomerOtpWhatsApp)
customerRouter.post("/auth/phone/otp/verify", customerOtpVerifyLimiter, verifyCustomerPhoneOtpCode)
customerRouter.post("/auth/phone/verify", customerOtpVerifyLimiter, verifyCustomerPhoneAuth)
customerRouter.post(
  "/auth/phone-change/start",
  customerAuthStartIpLimiter,
  customerAuthStartLimiter,
  requireAuth,
  requireRole("customer"),
  startCustomerPhoneChangeOtp
)
customerRouter.post(
  "/auth/phone-change/verify",
  customerOtpVerifyLimiter,
  requireAuth,
  requireRole("customer"),
  verifyCustomerPhoneChangeOtp
)
customerRouter.post("/auth/google", signinCustomerGoogle)
customerRouter.get("/profile", requireAuth, requireRole("customer"), getCustomerProfileSummary)
customerRouter.get("/referrals/summary", requireAuth, requireRole("customer"), getCustomerReferralSummaryController)
customerRouter.post("/referrals/apply", requireAuth, requireRole("customer"), postCustomerReferralApplyController)
customerRouter.get(
  "/offers/custom-summary",
  requireAuth,
  requireRole("customer"),
  getCustomerCustomOfferSummaryController
)
customerRouter.post(
  "/offers/custom-request",
  requireAuth,
  requireRole("customer"),
  customerSupportWriteLimiter,
  postCustomerCustomOfferRequestController
)
customerRouter.patch("/profile", requireAuth, requireRole("customer"), patchCustomerProfile)
customerRouter.patch("/profile/password", requireAuth, requireRole("customer"), patchCustomerPassword)
customerRouter.get(
  "/support-cases/latest",
  requireAuth,
  requireRole("customer"),
  getCustomerLatestSupportCaseController
)
customerRouter.get(
  "/support-cases/:supportCaseId",
  requireAuth,
  requireRole("customer"),
  getCustomerSupportCaseController
)
customerRouter.post(
  "/support-cases",
  requireAuth,
  requireRole("customer"),
  customerSupportWriteLimiter,
  postCustomerSupportCaseController
)
customerRouter.post(
  "/support-cases/:supportCaseId/messages",
  requireAuth,
  requireRole("customer"),
  customerSupportWriteLimiter,
  postCustomerSupportCaseMessageController
)
customerRouter.post("/auth/refresh", customerRefreshLimiter, refreshCustomerAuth)
customerRouter.post("/auth/logout", logoutCustomerAuth)
customerRouter.get("/discovery/home", getCustomerDiscoveryHomePage)
customerRouter.post("/vouchers/display-event", customerAnalyticsEventLimiter, postCustomerVoucherDisplayEvent)
customerRouter.post("/home/poll/vote", customerAnalyticsEventLimiter, postCustomerPollVote)
customerRouter.post("/push-events/open", requireAuth, requireRole("customer"), postCustomerPushOpenEvent)
customerRouter.get("/restaurants", getCustomerDiscovery)
customerRouter.get("/restaurants/search", getCustomerDiscoverySearch)
customerRouter.get("/restaurants/:restaurantId", getCustomerRestaurant)
customerRouter.post(
  "/cart/quote",
  customerCouponAttemptLimiter,
  customerCartQuoteLimiter,
  postCustomerCartQuote
)
customerRouter.get("/payments/bkash/callback", getBkashCallback)
customerRouter.get("/payments/bkash/return", getBkashReturnPage)
customerRouter.post(
  "/payments/bkash/initiate",
  requireAuth,
  requireRole("customer"),
  customerPaymentLimiter,
  postBkashInitiate
)
customerRouter.get(
  "/favorites/restaurants",
  requireAuth,
  requireRole("customer"),
  getCustomerFavoriteRestaurants
)
customerRouter.get(
  "/favorites/restaurants/cards",
  requireAuth,
  requireRole("customer"),
  getCustomerFavoriteRestaurantCards
)
customerRouter.post(
  "/favorites/restaurants/:restaurantId/toggle",
  requireAuth,
  requireRole("customer"),
  customerFavoriteToggleLimiter,
  postCustomerFavoriteToggle
)
customerRouter.get("/locations", requireAuth, requireRole("customer"), getCustomerLocations)
customerRouter.post("/locations", requireAuth, requireRole("customer"), postCustomerLocation)
customerRouter.patch("/locations/:locationId", requireAuth, requireRole("customer"), patchCustomerLocation)
customerRouter.patch(
  "/locations/:locationId/default",
  requireAuth,
  requireRole("customer"),
  patchCustomerLocationDefault
)
customerRouter.patch(
  "/locations/:locationId/touch",
  requireAuth,
  requireRole("customer"),
  patchCustomerLocationTouch
)
customerRouter.post(
  "/push-tokens",
  requireAuth,
  requireRole("customer"),
  postCustomerPushToken
)
customerRouter.get("/notifications", requireAuth, requireRole("customer"), getCustomerNotifications)
customerRouter.get(
  "/notifications/campaigns/:campaignId",
  requireAuth,
  requireRole("customer"),
  getCustomerNotificationCampaign
)
customerRouter.get(
  "/notifications/:notificationId",
  requireAuth,
  requireRole("customer"),
  getCustomerNotification
)
customerRouter.patch(
  "/notifications/:notificationId/read",
  requireAuth,
  requireRole("customer"),
  patchCustomerNotificationRead
)
customerRouter.patch(
  "/notifications/read-all",
  requireAuth,
  requireRole("customer"),
  patchCustomerNotificationsReadAll
)
customerRouter.delete(
  "/push-tokens",
  requireAuth,
  requireRole("customer"),
  deleteCustomerPushToken
)
customerRouter.delete(
  "/locations/:locationId",
  requireAuth,
  requireRole("customer"),
  deleteCustomerLocation
)
customerRouter.get("/orders", requireAuth, requireRole("customer"), getCustomerOrders)
customerRouter.get(
  "/orders/:orderId",
  requireAuth,
  requireRole("customer"),
  customerOrderReadLimiter,
  getCustomerOrder
)
customerRouter.post(
  "/orders",
  requireAuth,
  requireRole("customer"),
  customerOrderPlaceLimiter,
  postCustomerOrder
)
customerRouter.post(
  "/orders/:orderId/cancel",
  requireAuth,
  requireRole("customer"),
  customerOrderActionLimiter,
  postCustomerOrderCancel
)
customerRouter.post(
  "/orders/:orderId/review",
  requireAuth,
  requireRole("customer"),
  customerOrderActionLimiter,
  postCustomerReview
)
