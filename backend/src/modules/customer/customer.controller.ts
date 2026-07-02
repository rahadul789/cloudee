import type { Request, Response } from "express"
import { StatusCodes } from "http-status-codes"
import { z } from "zod"

import { asyncHandler } from "../../common/utils/async-handler"
import { sendSuccess } from "../../common/utils/api-response"
import {
  appendCustomerSupportCaseMessage,
  cancelCustomerOrder,
  handleBkashCallback,
  createCustomerSupportCase,
  createCustomerReview,
  createCustomerSavedLocation,
  getCustomerSupportCase,
  getCustomerDiscoveryHome,
  getLatestCustomerSupportCase,
  getCustomerProfile,
  getCustomerSavedLocations,
  getCustomerOrderDetails,
  getCustomerRestaurantDetails,
  startCustomerPhoneChange,
  listCustomerFavoriteRestaurantIds,
  listCustomerFavoriteRestaurants,
  listCustomerOrders,
  listDiscoverableRestaurants,
  listDiscoverableRestaurantsPage,
  logoutCustomerSession,
  initiateBkashPayment,
  removeCustomerSavedLocation,
  registerCustomerPushToken,
  placeCustomerOrder,
  refreshCustomerSession,
  requestCustomerPasswordReset,
  resetCustomerPassword,
  signinCustomerWithGoogle,
  startCustomerPhoneSignin,
  signinCustomerWithPassword,
  setDefaultCustomerSavedLocation,
  touchCustomerSavedLocation,
  toggleCustomerFavoriteRestaurant,
  verifyCustomerPhoneOtp,
  updateCustomerProfile,
  updateCustomerPassword,
  updateCustomerSavedLocation,
  unregisterCustomerPushToken,
  verifyCustomerPhoneChange,
  verifyCustomerPhoneSignin,
  verifyCustomerPasswordResetOtp
} from "./customer.service"
import {
  getCustomerCustomOfferSummary,
  requestCustomerCustomOffer,
} from "./custom-offer.service"
import { quoteCustomerCart } from "./customer-cart.service"
import { recordVoucherDisplayEvent, recordVoucherPushOpenEvent } from "../promotions/promotions.service"
import { recordCustomerHomePushOpen } from "../public/content.service"
import { invalidateAdminNotificationsCache } from "../admin/notifications.service"
import {
  getCustomerNotificationByCampaignId,
  getCustomerNotificationById,
  listCustomerNotifications,
  markAllCustomerNotificationsAsRead,
  markCustomerNotificationAsRead,
  markCustomerNotificationOpened
} from "./push.service"
import {
  applyReferralCodeToCustomer,
  getCustomerReferralSummary,
} from "./referral.service"

const CUSTOMER_AUTH_OTP_CODE_LENGTH = 4
const CUSTOMER_PASSWORD_MIN_LENGTH = 6

const customerPhoneStartSchema = z.object({
  phone: z.string().regex(/^01\d{9}$/),
  useOtp: z.boolean().optional()
})

const customerCurrentLocationSchema = z.object({
  label: z.string().trim().max(80).optional(),
  address: z.string().trim().max(240).optional(),
  addressDetails: z.string().trim().max(240).optional(),
  latitude: z.number().finite().optional(),
  longitude: z.number().finite().optional(),
  source: z.enum(["gps", "manual", "saved"]).optional(),
  serviceArea: z
    .object({
      districtId: z.string().trim().optional(),
      districtName: z.string().trim().optional(),
      zoneId: z.string().trim().optional(),
      zoneSlug: z.string().trim().optional(),
      zoneName: z.string().trim().optional(),
      radiusKm: z.number().finite().nullable().optional()
    })
    .nullable()
    .optional()
}).optional()

const customerPhoneVerifySchema = z.object({
  verificationSessionId: z.string().min(1),
  fullName: z.string().optional(),
  email: z.string().email().or(z.literal("")).optional(),
  password: z.string().optional(),
  referralCode: z.string().optional(),
  installId: z.string().trim().max(160).optional(),
  currentLocation: customerCurrentLocationSchema
})

const customerPhoneOtpVerifySchema = z.object({
  verificationSessionId: z.string().min(1),
  otpCode: z.string().length(CUSTOMER_AUTH_OTP_CODE_LENGTH)
})

const customerPasswordSigninSchema = z.object({
  phone: z.string().regex(/^01\d{9}$/),
  password: z.string().min(1),
  installId: z.string().trim().max(160).optional(),
  currentLocation: customerCurrentLocationSchema
})

const customerPasswordResetStartSchema = z.object({
  phone: z.string().regex(/^01\d{9}$/)
})

const customerPasswordResetOtpVerifySchema = z.object({
  verificationSessionId: z.string().min(1),
  otpCode: z.string().length(CUSTOMER_AUTH_OTP_CODE_LENGTH)
})

const customerPasswordResetSchema = z.object({
  verificationSessionId: z.string().min(1),
  newPassword: z.string().min(CUSTOMER_PASSWORD_MIN_LENGTH)
})

const customerPasswordUpdateSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(CUSTOMER_PASSWORD_MIN_LENGTH)
})

const customerOrdersQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  statusGroup: z.enum(["live", "history"]).optional(),
  status: z
    .enum([
      "New",
      "Accepted",
      "Preparing",
      "ReadyForPickup",
      "PickedUp",
      "Delivered",
      "Rejected",
      "Cancelled"
    ])
    .optional()
})

const customerGoogleSigninSchema = z.object({
  googleSub: z.string().min(1),
  email: z.string().email(),
  fullName: z.string().min(1),
  profileImage: z
    .object({
      url: z.string().optional(),
      publicId: z.string().optional()
    })
    .optional(),
  currentLocation: customerCurrentLocationSchema
})

const refreshSchema = z.object({
  refreshToken: z.string().min(1)
})

const pushOpenEventSchema = z.object({
  source: z.enum(["customer_home_cms", "customer_home_cms_test", "voucher", "admin_notification"]).optional(),
  notificationId: z.string().optional(),
  campaignId: z.string().optional(),
  voucherId: z.string().optional(),
  path: z.string().optional(),
  variant: z.enum(["A", "B"]).optional(),
})

const logoutSchema = z.object({
  refreshToken: z.string().min(1),
  expoPushToken: z.string().min(1).optional()
})

const discoveryListQuerySchema = z.object({
  search: z.string().optional(),
  collectionKey: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  radiusKm: z.coerce.number().positive().max(30).optional()
})

const discoverySearchQuerySchema = discoveryListQuerySchema.extend({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(30).optional(),
  filter: z.enum(["all", "open", "offers", "featured"]).optional(),
  sortBy: z.enum(["nearest", "fastest", "topRated"]).optional(),
  minimumRating: z.coerce.number().min(0).max(5).optional(),
  maximumLowestPrice: z.coerce.number().min(0).optional()
})

const restaurantDetailsQuerySchema = z.object({
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional()
})

const cartItemSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().int().positive().max(50),
  selectedVariantOptions: z
    .array(
      z.object({
        groupName: z.string(),
        optionLabel: z.string()
      })
    )
    .optional(),
  selectedAddOnOptions: z
    .array(
      z.object({
        groupName: z.string(),
        optionLabel: z.string()
      })
    )
    .optional()
})

const cartQuoteSchema = z.object({
  restaurantId: z.string().min(1),
  items: z.array(cartItemSchema).min(1).max(50),
  voucherCode: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
})

const placeOrderSchema = z.object({
  restaurantId: z.string().min(1),
  clientOrderId: z.string().trim().min(8).max(120).optional(),
  items: z.array(cartItemSchema).min(1).max(50),
  voucherCode: z.string().optional(),
  paymentMethod: z.enum(["Cash", "Bkash"]),
  paymentReference: z
    .object({
      provider: z.enum(["Bkash"]).optional(),
      bkashSessionId: z.string().optional(),
      walletNumber: z.string().optional()
    })
    .optional(),
  note: z.string().trim().max(240).optional(),
  deliveryAddress: z.object({
    label: z.string().min(1),
    addressLine: z.string().min(1),
    addressDetails: z.string().trim().max(240).optional(),
    latitude: z.number(),
    longitude: z.number()
  })
})

const bkashInitiateSchema = z.object({
  restaurantId: z.string().min(1),
  clientOrderId: z.string().trim().min(8).max(120).optional(),
  items: z.array(cartItemSchema).min(1).max(50),
  voucherCode: z.string().optional(),
  note: z.string().trim().max(240).optional(),
  walletNumber: z.string().regex(/^01\d{9}$/),
  deliveryAddress: z.object({
    label: z.string().min(1),
    addressLine: z.string().min(1),
    addressDetails: z.string().trim().max(240).optional(),
    latitude: z.number(),
    longitude: z.number()
  }),
})

const cancelOrderSchema = z.object({
  reason: z.string().optional()
})

const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
  riderRating: z.number().int().min(1).max(5).optional(),
  riderComment: z.string().optional()
})

const savedLocationSchema = z.object({
  label: z.string().min(1),
  address: z.string().min(1),
  addressDetails: z.string().trim().max(240).optional(),
  latitude: z.number(),
  longitude: z.number(),
  source: z.enum(["gps", "manual", "saved"]).optional(),
  isDefault: z.boolean().optional()
})

const savedLocationTouchSchema = z.object({
  lastUsed: z.boolean().optional()
})

const customerPushTokenSchema = z.object({
  expoPushToken: z.string().min(1),
  platform: z.enum(["android", "ios"]),
  deviceId: z.string().optional(),
  appVersion: z.string().optional()
})

const customerPushTokenDeleteSchema = z.object({
  expoPushToken: z.string().min(1)
})

const customerPhoneChangeStartSchema = z.object({
  phone: z.string().regex(/^01\d{9}$/)
})

const customerPhoneChangeVerifySchema = z.object({
  verificationSessionId: z.string().min(1),
  otpCode: z.string().length(6)
})

const customerProfileUpdateSchema = z.object({
  fullName: z.string().trim().min(1).optional(),
  email: z.union([z.string().trim().email(), z.literal("")]).optional(),
  profileImage: z
    .object({
      url: z.string().optional(),
      publicId: z.string().optional()
    })
    .optional(),
  notificationSettings: z
    .object({
      orderUpdates: z.boolean().optional(),
      restaurantStatus: z.boolean().optional(),
      reviewReplies: z.boolean().optional()
    })
    .optional()
})

const customerSupportAttachmentSchema = z.object({
  url: z.string().min(1),
  publicId: z.string().optional(),
  fileName: z.string().optional(),
  fileType: z.string().optional()
})

const customerSupportCaseCreateSchema = z.object({
  message: z.string().trim().min(1),
  attachments: z.array(customerSupportAttachmentSchema).max(4).optional()
})

const customerSupportCaseMessageSchema = z.object({
  message: z.string().trim().min(1),
  attachments: z.array(customerSupportAttachmentSchema).max(4).optional()
})

const voucherDisplayEventSchema = z.object({
  voucherId: z.string().min(1),
  eventType: z.enum(["impression", "click", "modal_open", "strip_click"])
})

const referralApplySchema = z.object({
  referralCode: z.string().trim().min(1).max(16),
  installId: z.string().trim().max(160).optional()
})

const customOfferRequestSchema = z.object({
  requestedCode: z.string().trim().max(24).optional()
})

function getStringValue(value: unknown) {
  if (typeof value === "string") return value
  if (Array.isArray(value)) {
    const firstValue = value[0]
    return typeof firstValue === "string" ? firstValue : ""
  }
  return ""
}

function getOptionalNumberValue(value: unknown) {
  const raw = getStringValue(value)
  if (!raw) {
    return undefined
  }

  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

export const startCustomerPhoneAuth = asyncHandler(async (req: Request, res: Response) => {
  const payload = customerPhoneStartSchema.parse(req.body)
  const data = await startCustomerPhoneSignin(payload.phone, {
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip,
    useOtp: payload.useOtp
  })

  return sendSuccess(res, {
    statusCode: StatusCodes.ACCEPTED,
    message: "Customer OTP sent successfully",
    data
  })
})

export const verifyCustomerPhoneAuth = asyncHandler(async (req: Request, res: Response) => {
  const payload = customerPhoneVerifySchema.parse(req.body)
  const data = await verifyCustomerPhoneSignin({
    ...payload,
    email: payload.email,
    password: payload.password,
    referralCode: payload.referralCode,
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip
  })

  return sendSuccess(res, {
    message: "Customer account created successfully",
    data
  })
})

export const getCustomerReferralSummaryController = asyncHandler(async (req: Request, res: Response) => {
  const data = await getCustomerReferralSummary(req.user?.id ?? "")

  return sendSuccess(res, {
    message: "Customer referral summary loaded successfully",
    data
  })
})

export const postCustomerReferralApplyController = asyncHandler(async (req: Request, res: Response) => {
  const payload = referralApplySchema.parse(req.body)
  const data = await applyReferralCodeToCustomer({
    customerId: req.user?.id ?? "",
    referralCode: payload.referralCode,
    installId: payload.installId,
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip
  })

  return sendSuccess(res, {
    message: "Referral code applied successfully",
    data
  })
})

export const getCustomerCustomOfferSummaryController = asyncHandler(async (req: Request, res: Response) => {
  const data = await getCustomerCustomOfferSummary(req.user?.id ?? "")

  return sendSuccess(res, {
    message: "My offer summary loaded successfully",
    data
  })
})

export const postCustomerCustomOfferRequestController = asyncHandler(async (req: Request, res: Response) => {
  const payload = customOfferRequestSchema.parse(req.body ?? {})
  const data = await requestCustomerCustomOffer({
    customerId: req.user?.id ?? "",
    requestedCode: payload.requestedCode
  })

  return sendSuccess(res, {
    statusCode: StatusCodes.ACCEPTED,
    message: "My offer request submitted successfully",
    data
  })
})

export const verifyCustomerPhoneOtpCode = asyncHandler(async (req: Request, res: Response) => {
  const payload = customerPhoneOtpVerifySchema.parse(req.body)
  const data = await verifyCustomerPhoneOtp({
    ...payload,
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip
  })

  return sendSuccess(res, {
    message: "OTP verified successfully",
    data
  })
})

export const signinCustomerWithPasswordController = asyncHandler(async (req: Request, res: Response) => {
  const payload = customerPasswordSigninSchema.parse(req.body)
  const data = await signinCustomerWithPassword({
    ...payload,
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip
  })

  return sendSuccess(res, {
    message: "Customer signed in successfully",
    data
  })
})

export const startCustomerPasswordReset = asyncHandler(async (req: Request, res: Response) => {
  const payload = customerPasswordResetStartSchema.parse(req.body)
  const data = await requestCustomerPasswordReset({
    phone: payload.phone,
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip
  })

  return sendSuccess(res, {
    statusCode: StatusCodes.ACCEPTED,
    message: "Password reset OTP sent successfully",
    data
  })
})

export const verifyCustomerPasswordResetOtpCode = asyncHandler(async (req: Request, res: Response) => {
  const payload = customerPasswordResetOtpVerifySchema.parse(req.body)
  const data = await verifyCustomerPasswordResetOtp({
    ...payload,
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip
  })

  return sendSuccess(res, {
    message: "Password reset OTP verified successfully",
    data
  })
})

export const resetCustomerPasswordController = asyncHandler(async (req: Request, res: Response) => {
  const payload = customerPasswordResetSchema.parse(req.body)
  const data = await resetCustomerPassword(payload)

  return sendSuccess(res, {
    message: "Password reset successfully",
    data
  })
})

export const startCustomerPhoneChangeOtp = asyncHandler(async (req: Request, res: Response) => {
  const payload = customerPhoneChangeStartSchema.parse(req.body)
  const data = await startCustomerPhoneChange({
    customerId: req.user?.id ?? "",
    phone: payload.phone,
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip
  })

  return sendSuccess(res, {
    statusCode: StatusCodes.ACCEPTED,
    message: "Phone change OTP sent successfully",
    data
  })
})

export const verifyCustomerPhoneChangeOtp = asyncHandler(async (req: Request, res: Response) => {
  const payload = customerPhoneChangeVerifySchema.parse(req.body)
  const data = await verifyCustomerPhoneChange({
    customerId: req.user?.id ?? "",
    verificationSessionId: payload.verificationSessionId,
    otpCode: payload.otpCode,
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip
  })

  return sendSuccess(res, {
    message: "Phone number updated successfully",
    data
  })
})

export const patchCustomerProfile = asyncHandler(async (req: Request, res: Response) => {
  const payload = customerProfileUpdateSchema.parse(req.body)
  const data = await updateCustomerProfile({
    customerId: req.user?.id ?? "",
    fullName: payload.fullName,
    email: payload.email,
    profileImage: payload.profileImage,
    notificationSettings: payload.notificationSettings
  })

  return sendSuccess(res, {
    message: "Profile updated successfully",
    data
  })
})

export const patchCustomerPassword = asyncHandler(async (req: Request, res: Response) => {
  const payload = customerPasswordUpdateSchema.parse(req.body)
  const data = await updateCustomerPassword({
    customerId: req.user?.id ?? "",
    currentPassword: payload.currentPassword,
    newPassword: payload.newPassword
  })

  return sendSuccess(res, {
    message: "Password updated successfully",
    data
  })
})

export const getCustomerProfileSummary = asyncHandler(async (req: Request, res: Response) => {
  const data = await getCustomerProfile(req.user?.id ?? "")

  return sendSuccess(res, {
    data
  })
})

export const getCustomerLatestSupportCaseController = asyncHandler(
  async (req: Request, res: Response) => {
    const data = await getLatestCustomerSupportCase(req.user?.id ?? "")

    return sendSuccess(res, { data })
  }
)

export const getCustomerSupportCaseController = asyncHandler(
  async (req: Request, res: Response) => {
    const data = await getCustomerSupportCase({
      customerId: req.user?.id ?? "",
      supportCaseId: getStringValue(req.params.supportCaseId)
    })

    return sendSuccess(res, { data })
  }
)

export const postCustomerSupportCaseController = asyncHandler(
  async (req: Request, res: Response) => {
    const payload = customerSupportCaseCreateSchema.parse(req.body)
    const data = await createCustomerSupportCase({
      customerId: req.user?.id ?? "",
      message: payload.message,
      attachments: payload.attachments
    })

    return sendSuccess(res, {
      statusCode: StatusCodes.CREATED,
      message: "Support chat started successfully",
      data
    })
  }
)

export const postCustomerSupportCaseMessageController = asyncHandler(
  async (req: Request, res: Response) => {
    const payload = customerSupportCaseMessageSchema.parse(req.body)
    const data = await appendCustomerSupportCaseMessage({
      customerId: req.user?.id ?? "",
      supportCaseId: getStringValue(req.params.supportCaseId),
      message: payload.message,
      attachments: payload.attachments
    })

    return sendSuccess(res, {
      message: "Support message sent successfully",
      data
    })
  }
)

export const signinCustomerGoogle = asyncHandler(async (req: Request, res: Response) => {
  const payload = customerGoogleSigninSchema.parse(req.body)
  const data = await signinCustomerWithGoogle({
    ...payload,
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip
  })

  return sendSuccess(res, {
    message: "Customer signed in with Google successfully",
    data
  })
})

export const refreshCustomerAuth = asyncHandler(async (req: Request, res: Response) => {
  const payload = refreshSchema.parse(req.body)
  const data = await refreshCustomerSession({
    refreshToken: payload.refreshToken,
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip
  })

  return sendSuccess(res, {
    message: "Customer session refreshed successfully",
    data
  })
})

export const logoutCustomerAuth = asyncHandler(async (req: Request, res: Response) => {
  const payload = logoutSchema.parse(req.body)
  const data = await logoutCustomerSession(payload.refreshToken, {
    expoPushToken: payload.expoPushToken
  })

  return sendSuccess(res, {
    message: "Customer signed out successfully",
    data
  })
})

export const getCustomerDiscovery = asyncHandler(async (req: Request, res: Response) => {
  const query = discoveryListQuerySchema.parse({
    search: getStringValue(req.query.search) || undefined,
    collectionKey: getStringValue(req.query.collectionKey) || undefined,
    latitude: req.query.latitude,
    longitude: req.query.longitude,
    radiusKm: req.query.radiusKm
  })
  const data = await listDiscoverableRestaurants(query)

  return sendSuccess(res, { data })
})

export const getCustomerDiscoverySearch = asyncHandler(async (req: Request, res: Response) => {
  const query = discoverySearchQuerySchema.parse({
    search: getStringValue(req.query.search) || undefined,
    collectionKey: getStringValue(req.query.collectionKey) || undefined,
    latitude: req.query.latitude,
    longitude: req.query.longitude,
    radiusKm: req.query.radiusKm,
    page: req.query.page,
    pageSize: req.query.pageSize,
    filter: getStringValue(req.query.filter) || undefined,
    sortBy: getStringValue(req.query.sortBy) || undefined,
    minimumRating: req.query.minimumRating,
    maximumLowestPrice: req.query.maximumLowestPrice,
  })
  const data = await listDiscoverableRestaurantsPage(query)

  return sendSuccess(res, { data })
})

export const getCustomerDiscoveryHomePage = asyncHandler(
  async (req: Request, res: Response) => {
    const query = discoveryListQuerySchema.parse({
      latitude: req.query.latitude,
      longitude: req.query.longitude,
      radiusKm: req.query.radiusKm
    })
    const data = await getCustomerDiscoveryHome({
      latitude: query.latitude,
      longitude: query.longitude,
      radiusKm: query.radiusKm,
      customerId: req.user?.role === "customer" ? req.user.id : undefined
    })
    return sendSuccess(res, { data })
  }
)

export const postCustomerPushOpenEvent = asyncHandler(
  async (req: Request, res: Response) => {
    const payload = pushOpenEventSchema.parse(req.body)
    const customerId = req.user?.id ?? ""
    if (payload.source === "customer_home_cms_test" || payload.campaignId === "customer_home_cms_test") {
      return sendSuccess(res, { data: { recorded: true, test: true } })
    }
    if (
      payload.notificationId ||
      (payload.source !== "voucher" && payload.campaignId && payload.campaignId !== "customer_home_cms")
    ) {
      const data = await markCustomerNotificationOpened({
        customerId,
        notificationId: payload.notificationId,
        campaignId: payload.campaignId,
      })
      invalidateAdminNotificationsCache()
      return sendSuccess(res, { data })
    }
    const data =
      payload.source === "customer_home_cms" || payload.campaignId === "customer_home_cms"
        ? await recordCustomerHomePushOpen({ customerId, path: payload.path, campaignId: payload.campaignId, variant: payload.variant })
        : await recordVoucherPushOpenEvent({
            voucherId: payload.voucherId ?? payload.campaignId ?? "",
            customerId,
            path: payload.path,
          })
    return sendSuccess(res, { data })
  }
)

export const postCustomerVoucherDisplayEvent = asyncHandler(
  async (req: Request, res: Response) => {
    const payload = voucherDisplayEventSchema.parse(req.body)
    const data = await recordVoucherDisplayEvent(payload)
    return sendSuccess(res, { data })
  }
)

export const getCustomerRestaurant = asyncHandler(async (req: Request, res: Response) => {
  const query = restaurantDetailsQuerySchema.parse({
    latitude: req.query.latitude,
    longitude: req.query.longitude
  })
  const data = await getCustomerRestaurantDetails(getStringValue(req.params.restaurantId), query)
  return sendSuccess(res, { data })
})

export const postCustomerCartQuote = asyncHandler(async (req: Request, res: Response) => {
  const payload = cartQuoteSchema.parse(req.body)
  const data = await quoteCustomerCart({
    ...payload,
    customerId: req.user?.role === "customer" ? req.user.id : undefined
  })

  return sendSuccess(res, {
    message: "Cart quote calculated successfully",
    data
  })
})

export const postCustomerOrder = asyncHandler(async (req: Request, res: Response) => {
  const payload = placeOrderSchema.parse(req.body)
  const data = await placeCustomerOrder({
    customerId: req.user?.id ?? "",
    ...payload
  })

  return sendSuccess(res, {
    statusCode: StatusCodes.CREATED,
    message: "Order placed successfully",
    data
  })
})

export const postBkashInitiate = asyncHandler(async (req: Request, res: Response) => {
  const payload = bkashInitiateSchema.parse(req.body)
  const data = await initiateBkashPayment({
    customerId: req.user?.id ?? "",
    ...payload
  })

  return sendSuccess(res, {
    statusCode: StatusCodes.CREATED,
    message: "bKash payment initiated successfully",
    data
  })
})

export const getBkashCallback = asyncHandler(async (req: Request, res: Response) => {
  const redirectTarget = await handleBkashCallback({
    sessionId: getStringValue(req.query.sessionId),
    status: getStringValue(req.query.status) || undefined,
    paymentID: getStringValue(req.query.paymentID) || undefined
  })

  return res.redirect(redirectTarget)
})

export const getBkashReturnPage = asyncHandler(async (_req: Request, res: Response) => {
  res
    .status(StatusCodes.OK)
    .setHeader("Content-Type", "text/html; charset=utf-8")
    .send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Returning to app</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: Arial, sans-serif;
        background: #f8fafc;
        color: #111827;
      }
      .card {
        width: min(92vw, 420px);
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 20px;
        padding: 24px;
        text-align: center;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
      }
      h1 {
        margin: 0 0 8px;
        font-size: 20px;
      }
      p {
        margin: 0;
        line-height: 1.6;
        color: #6b7280;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Payment completed</h1>
      <p>You can return to the app now.</p>
    </div>
  </body>
</html>`)
})

export const getCustomerOrders = asyncHandler(async (req: Request, res: Response) => {
  const query = customerOrdersQuerySchema.parse(req.query)
  const data = await listCustomerOrders(req.user?.id ?? "", query)
  return sendSuccess(res, { data })
})

export const getCustomerLocations = asyncHandler(async (req: Request, res: Response) => {
  const data = await getCustomerSavedLocations(req.user?.id ?? "")
  return sendSuccess(res, { data })
})

export const getCustomerFavoriteRestaurants = asyncHandler(
  async (req: Request, res: Response) => {
    const data = await listCustomerFavoriteRestaurantIds(req.user?.id ?? "")
    return sendSuccess(res, { data })
  }
)

export const getCustomerFavoriteRestaurantCards = asyncHandler(
  async (req: Request, res: Response) => {
    const data = await listCustomerFavoriteRestaurants({
      customerId: req.user?.id ?? "",
      latitude: getOptionalNumberValue(req.query.latitude),
      longitude: getOptionalNumberValue(req.query.longitude),
      radiusKm: getOptionalNumberValue(req.query.radiusKm)
    })
    return sendSuccess(res, { data })
  }
)

export const postCustomerFavoriteToggle = asyncHandler(
  async (req: Request, res: Response) => {
    const data = await toggleCustomerFavoriteRestaurant({
      customerId: req.user?.id ?? "",
      restaurantId: getStringValue(req.params.restaurantId)
    })

    return sendSuccess(res, {
      message: data.isFavorite
        ? "Restaurant added to favorites"
        : "Restaurant removed from favorites",
      data
    })
  }
)

export const postCustomerLocation = asyncHandler(async (req: Request, res: Response) => {
  const payload = savedLocationSchema.parse(req.body)
  const data = await createCustomerSavedLocation({
    customerId: req.user?.id ?? "",
    ...payload
  })

  return sendSuccess(res, {
    statusCode: StatusCodes.CREATED,
    message: "Saved location added successfully",
    data
  })
})

export const patchCustomerLocation = asyncHandler(async (req: Request, res: Response) => {
  const payload = savedLocationSchema.partial().parse(req.body)
  const data = await updateCustomerSavedLocation({
    customerId: req.user?.id ?? "",
    locationId: getStringValue(req.params.locationId),
    ...payload
  })

  return sendSuccess(res, {
    message: "Saved location updated successfully",
    data
  })
})

export const patchCustomerLocationDefault = asyncHandler(async (req: Request, res: Response) => {
  const data = await setDefaultCustomerSavedLocation({
    customerId: req.user?.id ?? "",
    locationId: getStringValue(req.params.locationId)
  })

  return sendSuccess(res, {
    message: "Default location updated successfully",
    data
  })
})

export const patchCustomerLocationTouch = asyncHandler(async (req: Request, res: Response) => {
  savedLocationTouchSchema.parse(req.body ?? {})
  const data = await touchCustomerSavedLocation({
    customerId: req.user?.id ?? "",
    locationId: getStringValue(req.params.locationId)
  })

  return sendSuccess(res, {
    message: "Location updated successfully",
    data
  })
})

export const deleteCustomerLocation = asyncHandler(async (req: Request, res: Response) => {
  const data = await removeCustomerSavedLocation({
    customerId: req.user?.id ?? "",
    locationId: getStringValue(req.params.locationId)
  })

  return sendSuccess(res, {
    message: "Saved location removed successfully",
    data
  })
})

export const postCustomerPushToken = asyncHandler(async (req: Request, res: Response) => {
  const payload = customerPushTokenSchema.parse(req.body)
  const data = await registerCustomerPushToken({
    customerId: req.user?.id ?? "",
    ...payload
  })

  return sendSuccess(res, {
    statusCode: StatusCodes.CREATED,
    message: "Push token registered successfully",
    data
  })
})

export const deleteCustomerPushToken = asyncHandler(async (req: Request, res: Response) => {
  const payload = customerPushTokenDeleteSchema.parse({
    expoPushToken: getStringValue(req.query.expoPushToken) || req.body?.expoPushToken
  })
  const data = await unregisterCustomerPushToken({
    customerId: req.user?.id ?? "",
    expoPushToken: payload.expoPushToken
  })

  return sendSuccess(res, {
    message: "Push token removed successfully",
    data
  })
})

export const getCustomerNotifications = asyncHandler(async (req: Request, res: Response) => {
  const page = Number.parseInt(getStringValue(req.query.page), 10)
  const limit = Number.parseInt(getStringValue(req.query.limit), 10)
  const rawCategory = getStringValue(req.query.category)
  const category = ["orders", "offers", "personal_offers"].includes(rawCategory)
    ? (rawCategory as "orders" | "offers" | "personal_offers")
    : "all"
  const data = await listCustomerNotifications(req.user?.id ?? "", {
    page: Number.isFinite(page) ? page : 1,
    limit: Number.isFinite(limit) ? limit : 20,
    category
  })

  return sendSuccess(res, { data })
})

export const getCustomerNotificationCampaign = asyncHandler(async (req: Request, res: Response) => {
  const data = await getCustomerNotificationByCampaignId({
    customerId: req.user?.id ?? "",
    campaignId: getStringValue(req.params.campaignId)
  })

  return sendSuccess(res, { data })
})

export const getCustomerNotification = asyncHandler(async (req: Request, res: Response) => {
  const data = await getCustomerNotificationById({
    customerId: req.user?.id ?? "",
    notificationId: getStringValue(req.params.notificationId)
  })

  return sendSuccess(res, { data })
})

export const patchCustomerNotificationRead = asyncHandler(async (req: Request, res: Response) => {
  const data = await markCustomerNotificationAsRead({
    customerId: req.user?.id ?? "",
    notificationId: getStringValue(req.params.notificationId)
  })

  return sendSuccess(res, {
    message: "Notification marked as read",
    data
  })
})

export const patchCustomerNotificationsReadAll = asyncHandler(
  async (req: Request, res: Response) => {
    const data = await markAllCustomerNotificationsAsRead(req.user?.id ?? "")

    return sendSuccess(res, {
      message: "All notifications marked as read",
      data
    })
  }
)

export const getCustomerOrder = asyncHandler(async (req: Request, res: Response) => {
  const data = await getCustomerOrderDetails({
    customerId: req.user?.id ?? "",
    orderId: getStringValue(req.params.orderId)
  })
  return sendSuccess(res, { data })
})

export const postCustomerOrderCancel = asyncHandler(async (req: Request, res: Response) => {
  const payload = cancelOrderSchema.parse(req.body)
  const data = await cancelCustomerOrder({
    customerId: req.user?.id ?? "",
    orderId: getStringValue(req.params.orderId),
    reason: payload.reason
  })

  return sendSuccess(res, {
    message: "Order cancelled successfully",
    data
  })
})

export const postCustomerReview = asyncHandler(async (req: Request, res: Response) => {
  const payload = createReviewSchema.parse(req.body)
  const data = await createCustomerReview({
    customerId: req.user?.id ?? "",
    orderId: getStringValue(req.params.orderId),
    rating: payload.rating,
    comment: payload.comment,
    riderRating: payload.riderRating,
    riderComment: payload.riderComment
  })

  return sendSuccess(res, {
    statusCode: StatusCodes.CREATED,
    message: "Review submitted successfully",
    data
  })
})
