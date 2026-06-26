import type { Request, Response } from "express"
import { StatusCodes } from "http-status-codes"
import { z } from "zod"

import { asyncHandler } from "../../common/utils/async-handler"
import { sendSuccess } from "../../common/utils/api-response"
import {
  acceptRiderOrder,
  activateRiderTrackingOrder,
  getRiderLiveMap,
  deliverRiderOrder,
  failRiderDelivery,
  getRiderOrderDetails,
  listRiderNotifications,
  markAllRiderNotificationsAsRead,
  markRiderNotificationAsRead,
  getRiderPerformanceSummary,
  getRiderPlatformContent,
  getRiderProfile,
  listRiderOrders,
  logoutRiderSession,
  pickupRiderOrder,
  postRiderLocation,
  refreshRiderSession,
  registerRiderPushToken,
  requestRiderPasswordReset,
  resetRiderPassword,
  signinRiderWithPassword,
  startRiderPhoneSignin,
  unregisterRiderPushToken,
  updateRiderLastKnownLocation,
  updateRiderAvailability,
  verifyRiderPasswordResetOtp,
  verifyRiderPhoneSignin
} from "./rider.service"

const riderPhoneStartSchema = z.object({
  phone: z.string().regex(/^01\d{9}$/)
})

const riderPhoneVerifySchema = z.object({
  verificationSessionId: z.string().min(1),
  otpCode: z.string().length(4),
  fullName: z.string().optional()
})

const riderPasswordSigninSchema = z.object({
  phone: z.string().regex(/^01\d{9}$/),
  password: z.string().min(6)
})

const riderPasswordResetStartSchema = z.object({
  phone: z.string().regex(/^01\d{9}$/)
})

const riderPasswordResetVerifySchema = z.object({
  verificationSessionId: z.string().min(1),
  otpCode: z.string().length(4)
})

const riderPasswordResetSchema = z.object({
  verificationSessionId: z.string().min(1),
  newPassword: z.string().min(6)
})

const refreshSchema = z.object({
  refreshToken: z.string().min(1)
})

const logoutSchema = z.object({
  refreshToken: z.string().min(1),
  expoPushToken: z.string().min(1).optional()
})

const riderOrdersQuerySchema = z.object({
  scope: z.enum(["available", "active", "history"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional()
})

const riderNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  filter: z.enum(["all", "unread"]).optional()
})

const riderLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).optional(),
  accuracyMeters: z.number().positive().optional(),
  speedKmph: z.number().nonnegative().optional()
})

const riderAvailabilitySchema = z.object({
  isAvailableForAssignments: z.boolean()
})

const riderPushTokenSchema = z.object({
  expoPushToken: z.string().min(1),
  platform: z.enum(["android", "ios"]),
  deviceId: z.string().optional(),
  appVersion: z.string().optional()
})

const riderPushTokenDeleteSchema = z.object({
  expoPushToken: z.string().min(1)
})

const riderNotificationParamsSchema = z.object({
  notificationId: z.string().min(1)
})

function getStringValue(value: unknown) {
  if (typeof value === "string") return value
  if (Array.isArray(value)) {
    const firstValue = value[0]
    return typeof firstValue === "string" ? firstValue : ""
  }
  return ""
}

export const startRiderPhoneAuth = asyncHandler(async (req: Request, res: Response) => {
  const payload = riderPhoneStartSchema.parse(req.body)
  const data = await startRiderPhoneSignin(payload.phone, {
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip
  })

  return sendSuccess(res, {
    statusCode: StatusCodes.ACCEPTED,
    message: "Rider OTP sent successfully",
    data
  })
})

export const verifyRiderPhoneAuth = asyncHandler(async (req: Request, res: Response) => {
  const payload = riderPhoneVerifySchema.parse(req.body)
  const data = await verifyRiderPhoneSignin({
    ...payload,
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip
  })

  return sendSuccess(res, {
    message: "Rider signed in successfully",
    data
  })
})

export const signinRiderPasswordAuth = asyncHandler(async (req: Request, res: Response) => {
  const payload = riderPasswordSigninSchema.parse(req.body)
  const data = await signinRiderWithPassword({
    ...payload,
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip
  })

  return sendSuccess(res, {
    message: "Rider signed in successfully",
    data
  })
})

export const startRiderPasswordResetAuth = asyncHandler(async (req: Request, res: Response) => {
  const payload = riderPasswordResetStartSchema.parse(req.body)
  const data = await requestRiderPasswordReset({
    phone: payload.phone,
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip
  })

  return sendSuccess(res, {
    statusCode: StatusCodes.ACCEPTED,
    message: "Password reset OTP sent",
    data
  })
})

export const verifyRiderPasswordResetAuth = asyncHandler(async (req: Request, res: Response) => {
  const payload = riderPasswordResetVerifySchema.parse(req.body)
  const data = await verifyRiderPasswordResetOtp({
    ...payload,
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip
  })

  return sendSuccess(res, {
    message: "Password reset OTP verified",
    data
  })
})

export const resetRiderPasswordAuth = asyncHandler(async (req: Request, res: Response) => {
  const payload = riderPasswordResetSchema.parse(req.body)
  const data = await resetRiderPassword(payload)

  return sendSuccess(res, {
    message: "Password reset successfully",
    data
  })
})

export const refreshRiderAuth = asyncHandler(async (req: Request, res: Response) => {
  const payload = refreshSchema.parse(req.body)
  const data = await refreshRiderSession({
    refreshToken: payload.refreshToken,
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip
  })

  return sendSuccess(res, {
    message: "Rider session refreshed successfully",
    data
  })
})

export const logoutRiderAuth = asyncHandler(async (req: Request, res: Response) => {
  const payload = logoutSchema.parse(req.body)
  const data = await logoutRiderSession({
    refreshToken: payload.refreshToken,
    expoPushToken: payload.expoPushToken
  })

  return sendSuccess(res, {
    message: "Rider signed out successfully",
    data
  })
})

export const getRiderProfileSummary = asyncHandler(async (req: Request, res: Response) => {
  const data = await getRiderProfile(req.user?.id ?? "")

  return sendSuccess(res, { data })
})

export const getRiderPlatformContentPayload = asyncHandler(
  async (req: Request, res: Response) => {
    const data = await getRiderPlatformContent(req.user?.id ?? "")

    return sendSuccess(res, { data })
  }
)

export const patchRiderProfileAvailability = asyncHandler(async (req: Request, res: Response) => {
  const payload = riderAvailabilitySchema.parse(req.body)
  const data = await updateRiderAvailability({
    riderId: req.user?.id ?? "",
    isAvailableForAssignments: payload.isAvailableForAssignments
  })

  return sendSuccess(res, {
    message: "Rider availability updated successfully",
    data
  })
})

export const patchRiderProfileLocation = asyncHandler(async (req: Request, res: Response) => {
  const payload = riderLocationSchema.parse(req.body)
  const data = await updateRiderLastKnownLocation({
    riderId: req.user?.id ?? "",
    ...payload
  })

  return sendSuccess(res, {
    message: "Rider location updated successfully",
    data
  })
})

export const postRiderPushToken = asyncHandler(async (req: Request, res: Response) => {
  const payload = riderPushTokenSchema.parse(req.body)
  const data = await registerRiderPushToken({
    riderId: req.user?.id ?? "",
    ...payload
  })

  return sendSuccess(res, {
    statusCode: StatusCodes.CREATED,
    message: "Push token registered successfully",
    data
  })
})

export const deleteRiderPushToken = asyncHandler(async (req: Request, res: Response) => {
  const payload = riderPushTokenDeleteSchema.parse({
    expoPushToken: getStringValue(req.query.expoPushToken) || req.body?.expoPushToken
  })
  const data = await unregisterRiderPushToken({
    riderId: req.user?.id ?? "",
    expoPushToken: payload.expoPushToken
  })

  return sendSuccess(res, {
    message: "Push token removed successfully",
    data
  })
})

export const getRiderNotifications = asyncHandler(async (req: Request, res: Response) => {
  const query = riderNotificationsQuerySchema.parse(req.query)
  const data = await listRiderNotifications({
    riderId: req.user?.id ?? "",
    page: query.page,
    limit: query.limit,
    filter: query.filter
  })

  return sendSuccess(res, { data })
})

export const patchRiderNotificationRead = asyncHandler(async (req: Request, res: Response) => {
  const params = riderNotificationParamsSchema.parse(req.params)
  const data = await markRiderNotificationAsRead({
    riderId: req.user?.id ?? "",
    notificationId: params.notificationId
  })

  return sendSuccess(res, {
    message: data.updated ? "Notification marked as read" : "Notification not found",
    data
  })
})

export const patchRiderNotificationsReadAll = asyncHandler(async (req: Request, res: Response) => {
  const data = await markAllRiderNotificationsAsRead(req.user?.id ?? "")

  return sendSuccess(res, {
    message: "All notifications marked as read",
    data
  })
})

export const getRiderOrdersSummary = asyncHandler(async (req: Request, res: Response) => {
  const data = await getRiderPerformanceSummary({
    riderId: req.user?.id ?? ""
  })

  return sendSuccess(res, { data })
})

export const getRiderOrders = asyncHandler(async (req: Request, res: Response) => {
  const query = riderOrdersQuerySchema.parse(req.query)
  const data = await listRiderOrders({
    riderId: req.user?.id ?? "",
    scope: query.scope,
    page: query.page,
    pageSize: query.pageSize
  })

  return sendSuccess(res, { data })
})

export const getRiderLiveMapView = asyncHandler(async (req: Request, res: Response) => {
  const data = await getRiderLiveMap({
    riderId: req.user?.id ?? ""
  })

  return sendSuccess(res, { data })
})

export const getRiderOrder = asyncHandler(async (req: Request, res: Response) => {
  const data = await getRiderOrderDetails({
    riderId: req.user?.id ?? "",
    orderId: String(req.params.orderId ?? "")
  })

  return sendSuccess(res, { data })
})

export const postRiderPickup = asyncHandler(async (req: Request, res: Response) => {
  const location =
    typeof req.body?.latitude === "number" && typeof req.body?.longitude === "number"
      ? riderLocationSchema.parse(req.body)
      : undefined
  const data = await pickupRiderOrder({
    riderId: req.user?.id ?? "",
    orderId: String(req.params.orderId ?? ""),
    location
  })

  return sendSuccess(res, {
    message: "Order picked up successfully",
    data
  })
})

export const postRiderAccept = asyncHandler(async (req: Request, res: Response) => {
  const data = await acceptRiderOrder({
    riderId: req.user?.id ?? "",
    orderId: String(req.params.orderId ?? "")
  })

  return sendSuccess(res, {
    message: "Order accepted successfully",
    data
  })
})

export const postRiderDelivered = asyncHandler(async (req: Request, res: Response) => {
  const data = await deliverRiderOrder({
    riderId: req.user?.id ?? "",
    orderId: String(req.params.orderId ?? "")
  })

  return sendSuccess(res, {
    message: "Order delivered successfully",
    data
  })
})

const riderFailedDeliverySchema = z.object({
  reason: z.enum(["customer_no_response", "wrong_item", "others"]),
  note: z.string().max(500).optional(),
})

export const postRiderFailedDelivery = asyncHandler(async (req: Request, res: Response) => {
  const payload = riderFailedDeliverySchema.parse(req.body)
  const data = await failRiderDelivery({
    riderId: req.user?.id ?? "",
    orderId: String(req.params.orderId ?? ""),
    reason: payload.reason,
    note: payload.note,
  })

  return sendSuccess(res, {
    message: "Delivery marked as failed",
    data,
  })
})

export const postRiderTrackingActivate = asyncHandler(async (req: Request, res: Response) => {
  const data = await activateRiderTrackingOrder({
    riderId: req.user?.id ?? "",
    orderId: String(req.params.orderId ?? "")
  })

  return sendSuccess(res, {
    message: "Live tracking switched successfully",
    data
  })
})

export const postRiderOrderLocation = asyncHandler(async (req: Request, res: Response) => {
  const payload = riderLocationSchema.parse(req.body)
  const data = await postRiderLocation({
    riderId: req.user?.id ?? "",
    orderId: String(req.params.orderId ?? ""),
    ...payload
  })

  return sendSuccess(res, {
    statusCode: StatusCodes.ACCEPTED,
    message: "Rider location updated successfully",
    data
  })
})
