import crypto from "node:crypto"

import { StatusCodes } from "http-status-codes"

import { AppError } from "../../common/utils/app-error"
import { decorateTrackingSnapshot } from "../../common/utils/tracking-freshness"
import { logger } from "../../config/logger"
import { emitSocketEvent } from "../../config/socket"
import { applyFailedDeliveryFinance } from "../admin/failed-delivery-finance.service"
import { runAutoDispatchForReadyOrders } from "../admin/orders-monitor.service"
import { getOrderRouteMetrics, type LatLng } from "../routing/routing.service"
import {
  assertOtpVerificationAllowed,
  createOtpSession,
  getOtpSessionTiming,
  recordOtpVerificationSuccess,
  rejectInvalidOtpAttempt,
} from "../auth/auth.service"
import {
  OtpSessionModel,
  RestaurantModel,
  RiderModel,
  RiderRefreshTokenSessionModel
} from "../auth/auth.model"
import { ReviewModel } from "../owner/experience.model"
import {
  comparePassword,
  compareOtpCode,
  hashPassword,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken
} from "../auth/auth.utils"
import { OrderModel } from "../owner/operational.model"
import { buildOrderPreparationTiming } from "../owner/preparation-timing"
import {
  emitOrderRealtimeUpdate,
  transitionOrderBySystem,
  updateOrderRiderLocation
} from "../owner/operational.service"
import { getPlatformContent } from "../public/content.service"
import {
  assertRiderAllowedForServiceArea,
  buildServiceAreaOrderFilterForRider,
  getRiderAssignedZoneIds,
  getServiceAreaDispatchOverrides
} from "../service-area/service-area.service"
import { syncRiderAvailabilitySession } from "./availability-session.service"

const RIDER_REFRESH_EXPIRY_DAYS = 3650
const DEFAULT_MAX_ACTIVE_ORDERS_PER_RIDER = 3
const DEFAULT_RIDER_ORDER_PAGE_SIZE = 80
const MAX_RIDER_ORDER_PAGE_SIZE = 100
const MAX_RIDER_PUSH_TOKENS = 5
const DISABLED_RIDER_PUSH_TOKEN_RETENTION_MS = 90 * 24 * 60 * 60 * 1000
const RIDER_ORDER_LOCATION_WRITE_INTERVAL_MS = 10 * 1000
const RIDER_ORDER_LOCATION_QUEUE_IDLE_MS = 30 * 60 * 1000
const RIDER_ORDER_LOCATION_QUEUE_PRUNE_SIZE = 500
const RIDER_LIST_PROFILE_SELECT = "_id status verification isAvailableForAssignments activeTrackingOrderId serviceArea"
const RIDER_LIVE_MAP_PROFILE_SELECT = `${RIDER_LIST_PROFILE_SELECT} fullName phone vehicleType lastKnownLocation`
const RIDER_ORDER_LIST_SELECT = [
  "_id",
  "restaurantId",
  "customerId",
  "riderId",
  "orderNumber",
  "status",
  "paymentMethod",
  "paymentStatus",
  "pricing",
  "serviceAreaSnapshot",
  "customerSnapshot.name",
  "customerSnapshot.fullName",
  "customerSnapshot.phone",
  "customerSnapshot.deliveryAddress",
  "riderSnapshot",
  "riderTracking",
  "timestamps",
  "createdAt",
  "updatedAt"
].join(" ")
const RIDER_ORDER_RESTAURANT_SELECT =
  "_id name contact.phone address.address address.city location.latitude location.longitude preparationTimeMinutes"
const RIDER_LIVE_MAP_ORDER_SELECT = [
  "_id",
  "restaurantId",
  "customerId",
  "riderId",
  "orderNumber",
  "status",
  "pricing",
  "serviceAreaSnapshot",
  "customerSnapshot.name",
  "customerSnapshot.fullName",
  "customerSnapshot.deliveryAddress",
  "riderTracking",
  "preparationMeta",
  "timestamps",
  "createdAt",
  "updatedAt"
].join(" ")
const recentRiderOrderLocationUpdates = new Map<
  string,
  {
    savedAtMs: number
    order: Record<string, any>
  }
>()

type QueuedRiderOrderLocationUpdate = {
  orderId: string
  riderId: string
  riderName: string
  riderPhone: string
  latitude: number
  longitude: number
  heading?: number
  accuracyMeters?: number
  speedKmph?: number
}

type RiderOrderLocationQueueEntry = {
  latest: QueuedRiderOrderLocationUpdate | null
  timer: ReturnType<typeof setTimeout> | null
  inFlight: boolean
  lastSavedAtMs: number
}

const riderOrderLocationQueue = new Map<string, RiderOrderLocationQueueEntry>()

function normalizeRiderPageBounds(params?: { page?: number; pageSize?: number }) {
  const page = Math.max(1, Math.floor(Number(params?.page ?? 1)) || 1)
  const pageSize = Math.min(
    MAX_RIDER_ORDER_PAGE_SIZE,
    Math.max(1, Math.floor(Number(params?.pageSize ?? DEFAULT_RIDER_ORDER_PAGE_SIZE)) || DEFAULT_RIDER_ORDER_PAGE_SIZE)
  )
  return { page, pageSize }
}

function pruneRiderPushTokens(rider: { pushTokens: any[] }) {
  const disabledCutoff = Date.now() - DISABLED_RIDER_PUSH_TOKEN_RETENTION_MS
  rider.pushTokens = (rider.pushTokens ?? [])
    .filter((token) => {
      if (!token?.disabledAt) return true
      return new Date(token.disabledAt).getTime() >= disabledCutoff
    })
    .sort((left, right) => {
      const leftActive = left.disabledAt ? 0 : 1
      const rightActive = right.disabledAt ? 0 : 1
      if (leftActive !== rightActive) return rightActive - leftActive
      return new Date(right.lastSeenAt ?? 0).getTime() - new Date(left.lastSeenAt ?? 0).getTime()
    })
    .slice(0, MAX_RIDER_PUSH_TOKENS)
}

async function getMaxActiveOrdersPerRider() {
  const content = await getPlatformContent()
  const value = content.operations?.dispatch?.maxActiveOrdersPerRider

  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(50, Math.max(1, Math.floor(value)))
    : DEFAULT_MAX_ACTIVE_ORDERS_PER_RIDER
}

function assertRiderAccessible(rider: {
  status?: string | null
  verification?: { status?: string | null } | null
}) {
  if (rider.status !== "active") {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "RIDER_ACCOUNT_UNAVAILABLE",
      "This rider account is not available right now"
    )
  }

  if (rider.verification?.status !== "approved") {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "RIDER_KYC_NOT_APPROVED",
      "Your rider account is waiting for admin verification"
    )
  }
}

function buildRiderAuthPayload(params: {
  riderId: string
  fullName: string
  phone: string
  vehicleType?: string
  activeTrackingOrderId?: string
  isAvailableForAssignments?: boolean
  status?: string
  profileImage?: { url?: string; publicId?: string }
  refreshToken: string
  tokenId: string
}) {
  return {
    accessToken: signAccessToken({
      subject: params.riderId,
      role: "rider",
      tokenId: params.tokenId
    }),
    refreshToken: params.refreshToken,
    rider: {
      id: params.riderId,
      fullName: params.fullName,
      phone: params.phone,
      vehicleType: params.vehicleType ?? "cycle",
      activeTrackingOrderId: params.activeTrackingOrderId ?? "",
      isAvailableForAssignments: params.isAvailableForAssignments ?? true,
      status: params.status ?? "active",
      profileImage: params.profileImage ?? { url: "", publicId: "" }
    }
  }
}

async function createRiderRefreshSession(params: {
  riderId: string
  userAgent?: string
  ipAddress?: string
}) {
  const tokenId = crypto.randomUUID()
  const refreshToken = signRefreshToken({
    subject: params.riderId,
    role: "rider",
    tokenId
  })

  const tokenHash = await hashPassword(refreshToken)

  await RiderRefreshTokenSessionModel.create({
    riderId: params.riderId,
    tokenId,
    tokenHash,
    userAgent: params.userAgent ?? "",
    ipAddress: params.ipAddress ?? "",
    expiresAt: new Date(Date.now() + RIDER_REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
  })

  return { refreshToken, tokenId }
}

function mapRiderProfile(rider: {
  _id?: unknown
  id?: string
  fullName: string
  phone: string
  vehicleType?: string
  activeTrackingOrderId?: string
  profileImage?: { url?: string; publicId?: string }
  status?: string
  lastLoginAt?: Date | null
  isAvailableForAssignments?: boolean
  lastKnownLocation?: {
    latitude?: number | null
    longitude?: number | null
    heading?: number | null
    accuracyMeters?: number | null
    speedKmph?: number | null
    updatedAt?: Date | null
  }
}) {
  return {
    id: rider.id ?? String(rider._id ?? ""),
    fullName: rider.fullName,
    phone: rider.phone,
    vehicleType: rider.vehicleType ?? "cycle",
    activeTrackingOrderId: rider.activeTrackingOrderId ?? "",
    profileImage: rider.profileImage ?? { url: "", publicId: "" },
    status: rider.status ?? "active",
    isAvailableForAssignments: rider.isAvailableForAssignments ?? true,
    lastLoginAt: rider.lastLoginAt ? new Date(rider.lastLoginAt).toISOString() : null,
    lastKnownLocation: rider.lastKnownLocation
      ? {
          latitude: rider.lastKnownLocation.latitude ?? null,
          longitude: rider.lastKnownLocation.longitude ?? null,
          heading: rider.lastKnownLocation.heading ?? null,
          accuracyMeters: rider.lastKnownLocation.accuracyMeters ?? null,
          speedKmph: rider.lastKnownLocation.speedKmph ?? null,
          updatedAt: rider.lastKnownLocation.updatedAt
            ? new Date(rider.lastKnownLocation.updatedAt).toISOString()
            : null
        }
      : null
  }
}

function mapRiderOrder(
  order: Record<string, any>,
  restaurant?: Record<string, any> | null,
  riderId?: string,
  activeTrackingOrderId?: string
) {
  const assignedRiderId = typeof order.riderId === "string" ? order.riderId : ""
  const assignmentState =
    !assignedRiderId && order.status === "ReadyForPickup"
      ? "unassigned"
      : assignedRiderId === riderId
        ? "assigned_to_you"
        : "assigned_to_other"

  return {
    id: String(order._id ?? order.id ?? ""),
    orderNumber: order.orderNumber ?? "",
    status: order.status ?? "",
    paymentMethod: order.paymentMethod ?? "Cash",
    paymentStatus: order.paymentStatus ?? "pending",
    assignmentState,
    isFocusedLiveTrip:
      Boolean(activeTrackingOrderId) &&
      activeTrackingOrderId === String(order._id ?? order.id ?? "") &&
      order.status === "PickedUp",
    isTrackingActiveForRider: assignedRiderId === riderId && order.status === "PickedUp",
    createdAt: order.createdAt ? new Date(order.createdAt).toISOString() : null,
    updatedAt: order.updatedAt ? new Date(order.updatedAt).toISOString() : null,
    pricing: order.pricing ?? {},
    timestamps: order.timestamps ?? {},
    riderSnapshot: order.riderSnapshot ?? {},
    riderTracking: decorateTrackingSnapshot(order.riderTracking ?? {}, order.status ?? ""),
    customer: {
      name: order.customerSnapshot?.name ?? order.customerSnapshot?.fullName ?? "",
      phone: order.customerSnapshot?.phone ?? "",
      deliveryAddress: {
        label: order.customerSnapshot?.deliveryAddress?.label ?? "",
        addressLine: order.customerSnapshot?.deliveryAddress?.addressLine ?? "",
        addressDetails: order.customerSnapshot?.deliveryAddress?.addressDetails ?? "",
        latitude: order.customerSnapshot?.deliveryAddress?.latitude ?? null,
        longitude: order.customerSnapshot?.deliveryAddress?.longitude ?? null
      }
    },
    restaurant: restaurant
      ? {
          id: String(restaurant._id ?? restaurant.id ?? ""),
          name: restaurant.name ?? "",
          phone: restaurant.contact?.phone ?? "",
          address: restaurant.address?.address ?? "",
          city: restaurant.address?.city ?? "",
          latitude: restaurant.location?.latitude ?? null,
          longitude: restaurant.location?.longitude ?? null,
          preparationTimeMinutes: restaurant.preparationTimeMinutes ?? null
        }
      : null,
    items: Array.isArray(order.itemsSnapshot)
      ? order.itemsSnapshot.map((item: Record<string, any>) => ({
          name: item.name ?? "",
          quantity: item.quantity ?? 0,
          totalPrice: item.totalPrice ?? item.lineTotal ?? 0
        }))
      : [],
    history: Array.isArray(order.history)
      ? order.history.map((entry: Record<string, any>) => ({
          status: entry.status ?? "",
          actor: entry.actor ?? "",
          note: entry.note ?? "",
          createdAt: entry.createdAt ? new Date(entry.createdAt).toISOString() : null
        }))
      : []
  }
}

async function enrichRiderOrders(
  orders: Array<Record<string, any>>,
  riderId?: string,
  activeTrackingOrderId?: string
) {
  const restaurantIds = [...new Set(orders.map((order) => String(order.restaurantId ?? "")).filter(Boolean))]

  const restaurants = restaurantIds.length
    ? await RestaurantModel.find({ _id: { $in: restaurantIds } })
        .select(RIDER_ORDER_RESTAURANT_SELECT)
        .lean()
    : []

  const restaurantMap = new Map(
    restaurants.map((restaurant) => [String(restaurant._id ?? ""), restaurant])
  )

  return orders.map((order) =>
    mapRiderOrder(
      order,
      restaurantMap.get(String(order.restaurantId ?? "")) ?? null,
      riderId,
      activeTrackingOrderId
    )
  )
}

function numberOrNull(value: unknown) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function isoStringOrNull(value: unknown) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function coordinateOrNull(latitude: unknown, longitude: unknown) {
  const lat = numberOrNull(latitude)
  const lng = numberOrNull(longitude)

  if (lat === null || lng === null) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null

  return { latitude: lat, longitude: lng }
}

function getLiveMapAssignmentState(order: Record<string, any>, riderId: string) {
  const assignedRiderId = typeof order.riderId === "string" ? order.riderId : ""

  if (!assignedRiderId) return "unassigned"
  return assignedRiderId === riderId ? "assigned_to_you" : "assigned_to_other"
}

function getLiveMapOrderPriority(order: Record<string, any>, preparationTiming: Record<string, any>) {
  const status = String(order.status ?? "")
  const remainingSeconds =
    typeof preparationTiming.remainingSeconds === "number"
      ? preparationTiming.remainingSeconds
      : null
  const lateBySeconds =
    typeof preparationTiming.lateBySeconds === "number" ? preparationTiming.lateBySeconds : 0

  if (status === "ReadyForPickup") return 100 + Math.min(30, Math.floor(lateBySeconds / 60))
  if (status === "PickedUp") return 90
  if (status === "Preparing") {
    if (remainingSeconds === null) return 65
    if (remainingSeconds === 0) return 95 + Math.min(20, Math.floor(lateBySeconds / 60))
    if (remainingSeconds <= 5 * 60) return 85
    if (remainingSeconds <= 10 * 60) return 75
    return 60
  }
  if (status === "Accepted") return 45
  return 20
}

function mapLiveMapOrder(
  order: Record<string, any>,
  restaurant: Record<string, any> | null,
  riderId: string
) {
  const preparationTiming = buildOrderPreparationTiming({ order, restaurant })
  const customerAddress = order.customerSnapshot?.deliveryAddress ?? {}

  return {
    id: String(order._id ?? order.id ?? ""),
    orderNumber: order.orderNumber ?? "",
    status: order.status ?? "",
    assignmentState: getLiveMapAssignmentState(order, riderId),
    createdAt: isoStringOrNull(order.createdAt),
    updatedAt: isoStringOrNull(order.updatedAt),
    preparation: {
      phase: preparationTiming.phase,
      label: preparationTiming.label,
      baseMinutes: preparationTiming.baseMinutes,
      extraMinutes: preparationTiming.extraMinutes,
      totalMinutes: preparationTiming.totalMinutes,
      targetStartAt: preparationTiming.targetStartAt,
      targetReadyAt: preparationTiming.targetReadyAt,
      remainingSeconds: preparationTiming.remainingSeconds,
      lateBySeconds: preparationTiming.lateBySeconds
    },
    priority: getLiveMapOrderPriority(order, preparationTiming),
    pricing: {
      total: numberOrNull(order.pricing?.total) ?? 0,
      foodSubtotal: numberOrNull(order.pricing?.foodSubtotal) ?? 0
    },
    customer: {
      id: String(order.customerId ?? ""),
      name: order.customerSnapshot?.name ?? order.customerSnapshot?.fullName ?? "",
      addressLabel: customerAddress.label ?? "",
      addressLine: customerAddress.addressLine ?? "",
      addressDetails: customerAddress.addressDetails ?? "",
      location: coordinateOrNull(customerAddress.latitude, customerAddress.longitude)
    },
    tracking: decorateTrackingSnapshot(order.riderTracking ?? {}, order.status ?? "")
  }
}

function getLiveMapRestaurantPriority(orders: Array<Record<string, any>>) {
  return orders.reduce((highest, order) => Math.max(highest, Number(order.priority ?? 0)), 0)
}

function getNextReadyAt(orders: Array<Record<string, any>>) {
  const futureReadyDates = orders
    .map((order) => order.preparation?.targetReadyAt)
    .map((value) => (value ? new Date(String(value)) : null))
    .filter((date): date is Date => date instanceof Date && !Number.isNaN(date.getTime()))
    .sort((left, right) => left.getTime() - right.getTime())

  return futureReadyDates[0]?.toISOString() ?? null
}

async function setActiveTrackingOrder(params: { riderId: string; orderId: string }) {
  await OrderModel.updateMany(
    { riderId: params.riderId, status: "PickedUp" },
    {
      $set: {
        "riderTracking.isActive": true,
        "riderTracking.isFocused": false
      }
    }
  )

  await OrderModel.updateOne(
    { _id: params.orderId, riderId: params.riderId, status: "PickedUp" },
    {
      $set: {
        "riderTracking.isActive": true,
        "riderTracking.isFocused": true
      }
    }
  )

  const updatedRider = await RiderModel.findByIdAndUpdate(
    params.riderId,
    {
      $set: {
        activeTrackingOrderId: params.orderId
      }
    },
    { new: true }
  )

  if (updatedRider) {
    emitSocketEvent(`rider:${updatedRider.id}`, "rider.profile.updated", mapRiderProfile(updatedRider))
  }

  // Push the focus change to every affected customer so their app switches between the
  // live map and the "delivery in queue" screen immediately — no wait for a poll. This
  // covers all callers: pickup promotion, post-delivery promotion, and admin override.
  const affectedOrders = await OrderModel.find({
    riderId: params.riderId,
    status: "PickedUp"
  })
  for (const order of affectedOrders) {
    const customerId = String(order.customerId ?? "").trim()
    if (customerId) {
      emitSocketEvent(`customer:${customerId}`, "customer.order.updated", order.toObject())
    }
  }
}

async function clearActiveTrackingOrderIfMatches(params: { riderId: string; orderId: string }) {
  const nextPickedUpOrder = await OrderModel.findOne({
    riderId: params.riderId,
    status: "PickedUp",
    _id: { $ne: params.orderId }
  })
    .sort({ "timestamps.PickedUp": 1, createdAt: 1 })
    .select("_id")

  if (nextPickedUpOrder) {
    await setActiveTrackingOrder({
      riderId: params.riderId,
      orderId: nextPickedUpOrder.id
    })
    return
  }

  const updatedRider = await RiderModel.findOneAndUpdate(
    {
      _id: params.riderId,
      activeTrackingOrderId: params.orderId
    },
    {
      $set: {
        activeTrackingOrderId: ""
      }
    },
    { new: true }
  )

  if (updatedRider) {
    emitSocketEvent(`rider:${updatedRider.id}`, "rider.profile.updated", mapRiderProfile(updatedRider))
  }
}

export async function startRiderPhoneSignin(
  phone: string,
  context?: { userAgent?: string; ipAddress?: string }
) {
  const rider = await RiderModel.findOne({ phone })

  if (!rider) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "RIDER_NOT_FOUND",
      "No rider account was found for this phone number"
    )
  }

  assertRiderAccessible(rider)

  const otpSession = await createOtpSession({
    phone,
    purpose: "rider_phone_signin",
    referenceId: rider.id,
    userAgent: context?.userAgent,
    ipAddress: context?.ipAddress
  })

  return {
    verificationSessionId: otpSession.id,
    ...getOtpSessionTiming(otpSession)
  }
}

export async function signinRiderWithPassword(params: {
  phone: string
  password: string
  userAgent?: string
  ipAddress?: string
}) {
  const rider = await RiderModel.findOne({ phone: params.phone })

  if (!rider || !rider.passwordHash?.trim()) {
    throw new AppError(
      StatusCodes.UNAUTHORIZED,
      "INVALID_CREDENTIALS",
      "This phone number or password is incorrect"
    )
  }

  assertRiderAccessible(rider)

  const isPasswordValid = await comparePassword(params.password, rider.passwordHash)

  if (!isPasswordValid) {
    throw new AppError(
      StatusCodes.UNAUTHORIZED,
      "INVALID_CREDENTIALS",
      "This phone number or password is incorrect"
    )
  }

  rider.lastLoginAt = new Date()
  await rider.save()

  const refreshSession = await createRiderRefreshSession({
    riderId: rider.id,
    userAgent: params.userAgent,
    ipAddress: params.ipAddress
  })

  return buildRiderAuthPayload({
    riderId: rider.id,
    fullName: rider.fullName,
    phone: rider.phone,
    vehicleType: rider.vehicleType,
    activeTrackingOrderId: rider.activeTrackingOrderId ?? "",
    isAvailableForAssignments: rider.isAvailableForAssignments ?? true,
    status: rider.status,
    profileImage: rider.profileImage,
    refreshToken: refreshSession.refreshToken,
    tokenId: refreshSession.tokenId
  })
}

export async function requestRiderPasswordReset(params: {
  phone: string
  userAgent?: string
  ipAddress?: string
}) {
  const rider = await RiderModel.findOne({ phone: params.phone })

  if (!rider) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "RIDER_NOT_FOUND",
      "No rider account was found for this phone number"
    )
  }

  assertRiderAccessible(rider)

  const otpSession = await createOtpSession({
    phone: params.phone,
    purpose: "rider_password_reset",
    referenceId: rider.id,
    userAgent: params.userAgent,
    ipAddress: params.ipAddress
  })

  return {
    verificationSessionId: otpSession.id,
    phone: otpSession.phone,
    ...getOtpSessionTiming(otpSession)
  }
}

export async function verifyRiderPasswordResetOtp(params: {
  verificationSessionId: string
  otpCode: string
  userAgent?: string
  ipAddress?: string
}) {
  const otpSession = await OtpSessionModel.findById(params.verificationSessionId)

  if (!otpSession || otpSession.purpose !== "rider_password_reset") {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "RESET_SESSION_NOT_FOUND",
      "Password reset session not found"
    )
  }

  if (otpSession.status !== "pending") {
    throw new AppError(StatusCodes.BAD_REQUEST, "OTP_NOT_ACTIVE", "OTP session is not active")
  }

  if (otpSession.expiresAt.getTime() < Date.now()) {
    otpSession.status = "expired"
    await otpSession.save()
    throw new AppError(StatusCodes.BAD_REQUEST, "OTP_EXPIRED", "OTP has expired")
  }

  await assertOtpVerificationAllowed(otpSession, params)
  const isValidOtp = await compareOtpCode(params.otpCode, otpSession.otpCodeHash)

  if (!isValidOtp) {
    await rejectInvalidOtpAttempt(otpSession, params)
  }

  const rider = await RiderModel.findById(otpSession.referenceId)

  if (!rider || rider.phone !== otpSession.phone) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "RIDER_NOT_FOUND",
      "No rider account was found for this phone number"
    )
  }

  assertRiderAccessible(rider)

  otpSession.status = "verified"
  otpSession.verifiedAt = new Date()
  await recordOtpVerificationSuccess(otpSession, params)
  await otpSession.save()

  return {
    verificationSessionId: otpSession.id,
    phone: otpSession.phone,
    expiresInSeconds: Math.max(0, Math.floor((otpSession.expiresAt.getTime() - Date.now()) / 1000))
  }
}

export async function resetRiderPassword(params: {
  verificationSessionId: string
  newPassword: string
}) {
  const otpSession = await OtpSessionModel.findById(params.verificationSessionId)

  if (!otpSession || otpSession.purpose !== "rider_password_reset") {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "RESET_SESSION_NOT_FOUND",
      "Password reset session not found"
    )
  }

  if (otpSession.status !== "verified") {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "RESET_SESSION_NOT_VERIFIED",
      "Verify OTP before resetting the password"
    )
  }

  if (otpSession.expiresAt.getTime() < Date.now()) {
    otpSession.status = "expired"
    await otpSession.save()
    throw new AppError(StatusCodes.BAD_REQUEST, "OTP_EXPIRED", "OTP has expired")
  }

  const rider = await RiderModel.findById(otpSession.referenceId)

  if (!rider || rider.phone !== otpSession.phone) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "RIDER_NOT_FOUND",
      "No rider account was found for this phone number"
    )
  }

  assertRiderAccessible(rider)

  rider.passwordHash = await hashPassword(params.newPassword.trim())
  await rider.save()

  await RiderRefreshTokenSessionModel.updateMany(
    { riderId: rider._id, revokedAt: null },
    { revokedAt: new Date() }
  )

  otpSession.status = "consumed"
  await otpSession.save()

  return { reset: true, phone: rider.phone }
}

export async function verifyRiderPhoneSignin(params: {
  verificationSessionId: string
  otpCode: string
  fullName?: string
  userAgent?: string
  ipAddress?: string
}) {
  const otpSession = await OtpSessionModel.findById(params.verificationSessionId)

  if (!otpSession || otpSession.purpose !== "rider_phone_signin") {
    throw new AppError(StatusCodes.NOT_FOUND, "OTP_SESSION_NOT_FOUND", "Verification session not found")
  }

  if (otpSession.status !== "pending") {
    throw new AppError(StatusCodes.BAD_REQUEST, "OTP_NOT_ACTIVE", "OTP session is not active")
  }

  if (otpSession.expiresAt.getTime() < Date.now()) {
    otpSession.status = "expired"
    await otpSession.save()
    throw new AppError(StatusCodes.BAD_REQUEST, "OTP_EXPIRED", "OTP has expired")
  }

  await assertOtpVerificationAllowed(otpSession, params)
  const isValidOtp = await compareOtpCode(params.otpCode, otpSession.otpCodeHash)

  if (!isValidOtp) {
    await rejectInvalidOtpAttempt(otpSession, params)
  }

  const rider = await RiderModel.findOne({ phone: otpSession.phone })

  if (!rider) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "RIDER_NOT_FOUND",
      "No rider account was found for this phone number"
    )
  }

  assertRiderAccessible(rider)

  rider.lastLoginAt = new Date()
  await rider.save()

  otpSession.status = "consumed"
  otpSession.verifiedAt = new Date()
  await recordOtpVerificationSuccess(otpSession, params)
  await otpSession.save()

  const refreshSession = await createRiderRefreshSession({
    riderId: rider.id,
    userAgent: params.userAgent,
    ipAddress: params.ipAddress
  })

  return buildRiderAuthPayload({
    riderId: rider.id,
    fullName: rider.fullName,
    phone: rider.phone,
    vehicleType: rider.vehicleType,
    activeTrackingOrderId: rider.activeTrackingOrderId ?? "",
    isAvailableForAssignments: rider.isAvailableForAssignments ?? true,
    status: rider.status,
    profileImage: rider.profileImage,
    refreshToken: refreshSession.refreshToken,
    tokenId: refreshSession.tokenId
  })
}

export async function refreshRiderSession(params: {
  refreshToken: string
  userAgent?: string
  ipAddress?: string
}) {
  let payload: ReturnType<typeof verifyRefreshToken>

  try {
    payload = verifyRefreshToken(params.refreshToken)
  } catch {
    throw new AppError(StatusCodes.UNAUTHORIZED, "INVALID_REFRESH_TOKEN", "Refresh session is not active")
  }

  if (payload.role !== "rider" || !payload.tokenId) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "INVALID_REFRESH_TOKEN", "Refresh session is not active")
  }

  const session = await RiderRefreshTokenSessionModel.findOne({
    riderId: payload.sub,
    tokenId: payload.tokenId,
    revokedAt: null,
    expiresAt: { $gt: new Date() }
  })

  if (!session) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "INVALID_REFRESH_TOKEN", "Refresh session is not active")
  }

  const rider = await RiderModel.findById(payload.sub)

  if (!rider) {
    throw new AppError(StatusCodes.NOT_FOUND, "RIDER_NOT_FOUND", "Rider not found")
  }

  assertRiderAccessible(rider)

  rider.lastLoginAt = new Date()
  await rider.save()

  // Do NOT rotate the rider refresh token — reuse the same long-lived (10y) session
  // and hand back the same refresh token, only minting a fresh access token. A rider
  // runs two independent token contexts (the foreground app + the background location
  // TaskManager) that can't share in-memory state; rotating would instantly make the
  // other context's token stale, so its next refresh hit SESSION_REVOKED (401) → the
  // app logged the rider out, and the background task's per-send retries stormed the
  // refresh rate limit (the 35/30 seen in admin). Reusing keeps every context valid.
  // The session is still revocable on explicit logout via its tokenId.
  return buildRiderAuthPayload({
    riderId: rider.id,
    fullName: rider.fullName,
    phone: rider.phone,
    vehicleType: rider.vehicleType,
    activeTrackingOrderId: rider.activeTrackingOrderId ?? "",
    isAvailableForAssignments: rider.isAvailableForAssignments ?? true,
    status: rider.status,
    profileImage: rider.profileImage,
    refreshToken: params.refreshToken,
    tokenId: session.tokenId
  })
}

export async function logoutRiderSession(params: {
  refreshToken: string
  expoPushToken?: string
}) {
  let payload: ReturnType<typeof verifyRefreshToken>

  try {
    payload = verifyRefreshToken(params.refreshToken)
  } catch {
    return { revoked: true }
  }

  if (payload.role !== "rider" || !payload.tokenId) {
    return { revoked: true }
  }

  await RiderRefreshTokenSessionModel.updateOne(
    { riderId: payload.sub, tokenId: payload.tokenId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  )

  if (params.expoPushToken) {
    await RiderModel.updateOne(
      { _id: payload.sub, "pushTokens.expoPushToken": params.expoPushToken },
      {
        $set: {
          "pushTokens.$.disabledAt": new Date(),
          "pushTokens.$.lastSeenAt": new Date()
        }
      }
    )
  }

  return { revoked: true }
}

export async function getRiderProfile(riderId: string) {
  const rider = await RiderModel.findById(riderId)

  if (!rider) {
    throw new AppError(StatusCodes.NOT_FOUND, "RIDER_NOT_FOUND", "Rider not found")
  }

  assertRiderAccessible(rider)

  return mapRiderProfile(rider)
}

export async function getRiderPlatformContent(riderId: string) {
  const [rider, content] = await Promise.all([
    RiderModel.findById(riderId).select(RIDER_LIST_PROFILE_SELECT).lean(),
    getPlatformContent()
  ])

  if (!rider) {
    throw new AppError(StatusCodes.NOT_FOUND, "RIDER_NOT_FOUND", "Rider not found")
  }

  assertRiderAccessible(rider)

  const zoneId = getRiderAssignedZoneIds(rider)[0] ?? ""
  const dispatchOverrides = zoneId
    ? await getServiceAreaDispatchOverrides({ zoneId })
    : null

  if (!dispatchOverrides) return content

  return {
    ...content,
    operations: {
      ...content.operations,
      dispatch: {
        ...content.operations.dispatch,
        ...dispatchOverrides
      }
    }
  }
}

function getStartOfDhakaDay(daysAgo = 0) {
  const dhakaOffsetMs = 6 * 60 * 60 * 1000
  const dhakaDate = new Date(Date.now() + dhakaOffsetMs)
  dhakaDate.setUTCDate(dhakaDate.getUTCDate() - daysAgo)
  dhakaDate.setUTCHours(0, 0, 0, 0)
  return new Date(dhakaDate.getTime() - dhakaOffsetMs)
}

export async function getRiderPerformanceSummary(params: { riderId: string }) {
  const rider = await RiderModel.findById(params.riderId).select(RIDER_LIST_PROFILE_SELECT)

  if (!rider) {
    throw new AppError(StatusCodes.NOT_FOUND, "RIDER_NOT_FOUND", "Rider not found")
  }

  assertRiderAccessible(rider)

  const riderId = String(rider._id ?? params.riderId)
  const todayStart = getStartOfDhakaDay(0)
  const last7Start = getStartOfDhakaDay(6)
  const dhakaOffsetMs = 6 * 60 * 60 * 1000
  const monthStartInDhaka = new Date(Date.now() + dhakaOffsetMs)
  monthStartInDhaka.setUTCDate(1)
  monthStartInDhaka.setUTCHours(0, 0, 0, 0)
  const monthStart = new Date(monthStartInDhaka.getTime() - dhakaOffsetMs)

  const [summaryRow, activeAssignedOrders] = await Promise.all([
    OrderModel.aggregate<{
      deliveredToday: number
      deliveredLast7Days: number
      deliveredThisMonth: number
      deliveredTotal: number
      cancelledTotal: number
    }>([
      {
        $match: {
          riderId,
          status: { $in: ["Delivered", "Cancelled", "Rejected"] }
        }
      },
      {
        $group: {
          _id: null,
          deliveredToday: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$status", "Delivered"] },
                    { $gte: ["$updatedAt", todayStart] }
                  ]
                },
                1,
                0
              ]
            }
          },
          deliveredLast7Days: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$status", "Delivered"] },
                    { $gte: ["$updatedAt", last7Start] }
                  ]
                },
                1,
                0
              ]
            }
          },
          deliveredThisMonth: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$status", "Delivered"] },
                    { $gte: ["$updatedAt", monthStart] }
                  ]
                },
                1,
                0
              ]
            }
          },
          deliveredTotal: {
            $sum: { $cond: [{ $eq: ["$status", "Delivered"] }, 1, 0] }
          },
          cancelledTotal: {
            $sum: {
              $cond: [
                { $in: ["$status", ["Cancelled", "Rejected"]] },
                1,
                0
              ]
            }
          }
        }
      },
      { $project: { _id: 0 } }
    ]),
    OrderModel.countDocuments({
      riderId,
      status: { $in: ["ReadyForPickup", "PickedUp"] }
    })
  ])

  const summary = summaryRow[0]

  return {
    deliveredToday: summary?.deliveredToday ?? 0,
    deliveredLast7Days: summary?.deliveredLast7Days ?? 0,
    deliveredThisMonth: summary?.deliveredThisMonth ?? 0,
    deliveredTotal: summary?.deliveredTotal ?? 0,
    cancelledTotal: summary?.cancelledTotal ?? 0,
    activeAssignedOrders
  }
}

export async function updateRiderAvailability(params: {
  riderId: string
  isAvailableForAssignments: boolean
}) {
  const rider = await RiderModel.findById(params.riderId)

  if (!rider) {
    throw new AppError(StatusCodes.NOT_FOUND, "RIDER_NOT_FOUND", "Rider not found")
  }

  assertRiderAccessible(rider)

  if (!params.isAvailableForAssignments) {
    const activeAssignedOrdersCount = await OrderModel.countDocuments({
      riderId: rider.id,
      status: { $in: ["ReadyForPickup", "PickedUp"] }
    })

    if (activeAssignedOrdersCount > 0 || (rider.activeTrackingOrderId ?? "").trim().length > 0) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "RIDER_HAS_ACTIVE_ORDERS",
        "Complete your active assigned orders before going offline"
      )
    }
  }

  rider.isAvailableForAssignments = params.isAvailableForAssignments
  await rider.save()
  await syncRiderAvailabilitySession({
    riderId: rider.id,
    isAvailableForAssignments: params.isAvailableForAssignments,
    source: "rider_app",
    endReason: "manual_offline",
  })

  const profile = mapRiderProfile(rider)
  emitSocketEvent(`rider:${rider.id}`, "rider.profile.updated", profile)

  if (params.isAvailableForAssignments) {
    void runAutoDispatchForReadyOrders().catch(() => undefined)
  }

  return profile
}

export async function registerRiderPushToken(params: {
  riderId: string
  expoPushToken: string
  platform: "android" | "ios"
  deviceId?: string
  appVersion?: string
}) {
  const rider = await RiderModel.findById(params.riderId)

  if (!rider) {
    throw new AppError(StatusCodes.NOT_FOUND, "RIDER_NOT_FOUND", "Rider not found")
  }

  assertRiderAccessible(rider)

  const existingToken = rider.pushTokens.find(
    (token) => token.expoPushToken === params.expoPushToken
  )

  if (existingToken) {
    existingToken.platform = params.platform
    existingToken.deviceId = params.deviceId ?? existingToken.deviceId ?? ""
    existingToken.appVersion = params.appVersion ?? existingToken.appVersion ?? ""
    existingToken.lastSeenAt = new Date()
    existingToken.disabledAt = null
  } else {
    if (params.deviceId) {
      rider.pushTokens.forEach((token) => {
        if (token.deviceId === params.deviceId && token.expoPushToken !== params.expoPushToken) {
          token.disabledAt = new Date()
        }
      })
    }
    rider.pushTokens.push({
      expoPushToken: params.expoPushToken,
      platform: params.platform,
      deviceId: params.deviceId ?? "",
      appVersion: params.appVersion ?? "",
      lastSeenAt: new Date(),
      disabledAt: null
    } as any)
  }

  pruneRiderPushTokens(rider)
  await rider.save()

  return { registered: true }
}

export async function unregisterRiderPushToken(params: {
  riderId: string
  expoPushToken: string
}) {
  const rider = await RiderModel.findById(params.riderId)

  if (!rider) {
    throw new AppError(StatusCodes.NOT_FOUND, "RIDER_NOT_FOUND", "Rider not found")
  }

  assertRiderAccessible(rider)

  const pushToken = rider.pushTokens.find(
    (token) => token.expoPushToken === params.expoPushToken
  )

  if (pushToken) {
    pushToken.disabledAt = new Date()
    pushToken.lastSeenAt = new Date()
    pruneRiderPushTokens(rider)
    await rider.save()
  }

  return { removed: true }
}

function mapRiderNotification(notification: Record<string, any>) {
  return {
    id: String(notification._id ?? ""),
    type: String(notification.type ?? "system"),
    title: String(notification.title ?? ""),
    description: String(notification.description ?? ""),
    path: String(notification.path ?? ""),
    campaignId: String(notification.campaignId ?? ""),
    contentType: String(notification.contentType ?? "text"),
    imageUrl: String(notification.imageUrl ?? ""),
    zoneId: String(notification.zoneId ?? ""),
    districtId: String(notification.districtId ?? ""),
    isRead: notification.isRead === true,
    readAt: notification.readAt ? new Date(notification.readAt).toISOString() : null,
    createdAt: notification.createdAt
      ? new Date(notification.createdAt).toISOString()
      : new Date().toISOString(),
  }
}

export async function listRiderNotifications(params: {
  riderId: string
  page?: number
  limit?: number
  filter?: "all" | "unread"
}) {
  const rider = await RiderModel.findById(params.riderId).select(
    "notifications status verification.status",
  )

  if (!rider) {
    throw new AppError(StatusCodes.NOT_FOUND, "RIDER_NOT_FOUND", "Rider not found")
  }

  assertRiderAccessible(rider)

  const allItems = [...(rider.notifications ?? [])]
    .map((notification) => mapRiderNotification(notification.toObject()))
    .filter((notification) => (params.filter === "unread" ? !notification.isRead : true))
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    )
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 50)
  const page = Math.max(params.page ?? 1, 1)
  const start = (page - 1) * limit
  const items = allItems.slice(start, start + limit)

  return {
    items,
    total: allItems.length,
    unreadCount: allItems.filter((notification) => !notification.isRead).length,
    page,
    limit,
    hasMore: start + items.length < allItems.length,
    nextPage: start + items.length < allItems.length ? page + 1 : null,
  }
}

export async function markRiderNotificationAsRead(params: {
  riderId: string
  notificationId: string
}) {
  const result = await RiderModel.updateOne(
    {
      _id: params.riderId,
      "notifications._id": params.notificationId,
    },
    {
      $set: {
        "notifications.$.isRead": true,
        "notifications.$.readAt": new Date(),
      },
    },
  )

  return { updated: result.modifiedCount > 0 }
}

export async function markAllRiderNotificationsAsRead(riderId: string) {
  await RiderModel.updateOne(
    { _id: riderId },
    {
      $set: {
        "notifications.$[notification].isRead": true,
        "notifications.$[notification].readAt": new Date(),
      },
    },
    {
      arrayFilters: [{ "notification.isRead": false }],
    },
  )

  return { updated: true }
}

export async function updateRiderLastKnownLocation(params: {
  riderId: string
  latitude: number
  longitude: number
  heading?: number
  accuracyMeters?: number
  speedKmph?: number
}) {
  const rider = await RiderModel.findById(params.riderId)

  if (!rider) {
    throw new AppError(StatusCodes.NOT_FOUND, "RIDER_NOT_FOUND", "Rider not found")
  }

  assertRiderAccessible(rider)

  const pickedUpOrders = await OrderModel.find({
    riderId: rider.id,
    status: "PickedUp"
  })
    .sort({ "timestamps.PickedUp": 1, createdAt: 1 })
    .select("_id")

  rider.lastKnownLocation = {
    latitude: params.latitude,
    longitude: params.longitude,
    heading: params.heading ?? null,
    accuracyMeters: params.accuracyMeters ?? null,
    speedKmph: params.speedKmph ?? null,
    updatedAt: new Date()
  }

  const pickedUpOrderIds = pickedUpOrders.map((order) => order.id)
  const currentFocusedOrderId = rider.activeTrackingOrderId ?? ""
  let nextFocusedOrderId = currentFocusedOrderId
  if (pickedUpOrderIds.length === 0) {
    nextFocusedOrderId = ""
  } else if (!pickedUpOrderIds.includes(currentFocusedOrderId)) {
    nextFocusedOrderId = pickedUpOrderIds[0] ?? ""
  }
  const hasFocusChanged = nextFocusedOrderId !== currentFocusedOrderId
  rider.activeTrackingOrderId = nextFocusedOrderId

  await rider.save()

  const profile = mapRiderProfile(rider)
  emitSocketEvent(`rider:${rider.id}`, "rider.profile.updated", profile)

  if (pickedUpOrderIds.length > 0 && hasFocusChanged) {
    await OrderModel.updateMany(
      { riderId: rider.id, status: "PickedUp" },
      {
        $set: {
          "riderTracking.isActive": true,
          "riderTracking.isFocused": false
        }
      }
    )
    if (rider.activeTrackingOrderId) {
      await OrderModel.updateOne(
        { _id: rider.activeTrackingOrderId, riderId: rider.id, status: "PickedUp" },
        {
          $set: {
            "riderTracking.isFocused": true
          }
        }
      )
    }
  }

  const focusedOrderId = rider.activeTrackingOrderId ?? ""
  if (focusedOrderId) {
    enqueueRiderOrderLocationUpdate({
      orderId: focusedOrderId,
      riderId: rider.id,
      latitude: params.latitude,
      longitude: params.longitude,
      heading: params.heading,
      accuracyMeters: params.accuracyMeters,
      speedKmph: params.speedKmph,
      riderName: rider.fullName,
      riderPhone: rider.phone
    })
  }

  return profile
}

export async function listRiderOrders(params: {
  riderId: string
  scope?: "available" | "active" | "history"
  page?: number
  pageSize?: number
}) {
  const rider = await RiderModel.findById(params.riderId)
    .select(RIDER_LIST_PROFILE_SELECT)
    .lean()

  if (!rider) {
    throw new AppError(StatusCodes.NOT_FOUND, "RIDER_NOT_FOUND", "Rider not found")
  }

  assertRiderAccessible(rider)
  const riderId = String(rider._id ?? params.riderId)

  const scope = params.scope ?? "active"

  if (scope === "available" && rider.isAvailableForAssignments === false) {
    return []
  }

  const serviceAreaOrderFilter = buildServiceAreaOrderFilterForRider(rider)
  const query =
    scope === "available"
      ? {
          status: "ReadyForPickup",
          $or: [{ riderId: "" }, { riderId: { $exists: false } }],
          ...serviceAreaOrderFilter
        }
      : scope === "history"
        ? { riderId, status: { $in: ["Delivered", "Cancelled", "Rejected"] } }
        : { riderId, status: { $in: ["ReadyForPickup", "PickedUp"] } }
  const { page, pageSize } = normalizeRiderPageBounds(params)

  const orders = await OrderModel.find(query)
    .select(RIDER_ORDER_LIST_SELECT)
    .sort({ createdAt: scope === "history" ? -1 : 1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean()

  return enrichRiderOrders(orders, riderId, String(rider.activeTrackingOrderId ?? ""))
}

export async function getRiderLiveMap(params: { riderId: string }) {
  const rider = await RiderModel.findById(params.riderId)
    .select(RIDER_LIVE_MAP_PROFILE_SELECT)
    .lean()

  if (!rider) {
    throw new AppError(StatusCodes.NOT_FOUND, "RIDER_NOT_FOUND", "Rider not found")
  }

  assertRiderAccessible(rider)
  const riderId = String(rider._id ?? params.riderId)
  const serviceAreaOrderFilter = buildServiceAreaOrderFilterForRider(rider)

  const orders = await OrderModel.find({
    $or: [
      {
        status: { $in: ["Accepted", "Preparing"] },
        $or: [{ riderId: "" }, { riderId }, { riderId: { $exists: false } }],
        ...serviceAreaOrderFilter
      },
      {
        status: "ReadyForPickup",
        $or: [
          { riderId },
          {
            $and: [
              { $or: [{ riderId: "" }, { riderId: { $exists: false } }] },
              serviceAreaOrderFilter
            ]
          }
        ]
      },
      { status: "PickedUp", riderId }
    ]
  })
    .select(RIDER_LIVE_MAP_ORDER_SELECT)
    .sort({ updatedAt: 1, createdAt: 1 })
    .limit(150)
    .lean()

  const restaurantIds = [
    ...new Set(orders.map((order) => String(order.restaurantId ?? "")).filter(Boolean))
  ]
  const restaurants = restaurantIds.length
    ? await RestaurantModel.find({ _id: { $in: restaurantIds } })
        .select(RIDER_ORDER_RESTAURANT_SELECT)
        .lean()
    : []
  const restaurantMap = new Map(
    restaurants.map((restaurant) => [String(restaurant._id ?? ""), restaurant])
  )
  const restaurantGroups = new Map<string, Record<string, any>>()

  for (const order of orders) {
    const restaurantId = String(order.restaurantId ?? "")
    const restaurant = restaurantMap.get(restaurantId) ?? null
    const mappedOrder = mapLiveMapOrder(order, restaurant, riderId)
    const existingGroup = restaurantGroups.get(restaurantId)

    if (existingGroup) {
      existingGroup.orders.push(mappedOrder)
      continue
    }

    restaurantGroups.set(restaurantId, {
      id: restaurantId,
      name: restaurant?.name ?? "Restaurant",
      phone: restaurant?.contact?.phone ?? "",
      address: restaurant?.address?.address ?? "",
      city: restaurant?.address?.city ?? "",
      preparationTimeMinutes: restaurant?.preparationTimeMinutes ?? null,
      location: coordinateOrNull(
        restaurant?.location?.latitude,
        restaurant?.location?.longitude
      ),
      orders: [mappedOrder]
    })
  }

  const riderLocation = coordinateOrNull(
    rider.lastKnownLocation?.latitude,
    rider.lastKnownLocation?.longitude
  )

  const liveRestaurants = Array.from(restaurantGroups.values())
    .map((restaurant) => {
      const ordersForRestaurant = [...restaurant.orders].sort(
        (left, right) =>
          Number(right.priority ?? 0) - Number(left.priority ?? 0) ||
          new Date(String(left.updatedAt ?? left.createdAt ?? 0)).getTime() -
            new Date(String(right.updatedAt ?? right.createdAt ?? 0)).getTime()
      )
      const remainingValues = ordersForRestaurant
        .map((order) => order.preparation?.remainingSeconds)
        .filter((value): value is number => typeof value === "number")
        .sort((left, right) => left - right)

      return {
        ...restaurant,
        orderCount: ordersForRestaurant.length,
        readyCount: ordersForRestaurant.filter((order) => order.status === "ReadyForPickup").length,
        preparingCount: ordersForRestaurant.filter((order) => order.status === "Preparing").length,
        acceptedCount: ordersForRestaurant.filter((order) => order.status === "Accepted").length,
        pickedUpCount: ordersForRestaurant.filter((order) => order.status === "PickedUp").length,
        lateCount: ordersForRestaurant.filter(
          (order) => Number(order.preparation?.lateBySeconds ?? 0) > 0
        ).length,
        earliestRemainingSeconds: remainingValues[0] ?? null,
        nextReadyAt: getNextReadyAt(ordersForRestaurant),
        priority: getLiveMapRestaurantPriority(ordersForRestaurant),
        orders: ordersForRestaurant
      }
    })
    .sort(
      (left, right) =>
        Number(right.priority ?? 0) - Number(left.priority ?? 0) ||
        Number(left.earliestRemainingSeconds ?? Number.MAX_SAFE_INTEGER) -
          Number(right.earliestRemainingSeconds ?? Number.MAX_SAFE_INTEGER)
    )

  return {
    generatedAt: new Date().toISOString(),
    rider: {
      id: riderId,
      fullName: rider.fullName ?? "",
      phone: rider.phone ?? "",
      vehicleType: rider.vehicleType ?? "cycle",
      activeTrackingOrderId: rider.activeTrackingOrderId ?? "",
      location: riderLocation
        ? {
            ...riderLocation,
            heading: rider.lastKnownLocation?.heading ?? null,
            accuracyMeters: rider.lastKnownLocation?.accuracyMeters ?? null,
            speedKmph: rider.lastKnownLocation?.speedKmph ?? null,
            updatedAt: isoStringOrNull(rider.lastKnownLocation?.updatedAt)
          }
        : null
    },
    restaurants: liveRestaurants
  }
}

export async function getRiderOrderDetails(params: { riderId: string; orderId: string }) {
  const rider = await RiderModel.findById(params.riderId)

  if (!rider) {
    throw new AppError(StatusCodes.NOT_FOUND, "RIDER_NOT_FOUND", "Rider not found")
  }

  assertRiderAccessible(rider)

  const order = await OrderModel.findById(params.orderId).lean()

  if (!order) {
    throw new AppError(StatusCodes.NOT_FOUND, "ORDER_NOT_FOUND", "Order not found")
  }

  const orderRiderId = typeof order.riderId === "string" ? order.riderId : ""
  const isAvailableOrder = order.status === "ReadyForPickup" && !orderRiderId
  if (isAvailableOrder) {
    assertRiderAllowedForServiceArea({
      rider,
      serviceAreaSnapshot: order.serviceAreaSnapshot
    })
  }

  if (!isAvailableOrder && orderRiderId !== rider.id) {
    throw new AppError(StatusCodes.FORBIDDEN, "FORBIDDEN", "You do not have access to this order")
  }

  const restaurant = await RestaurantModel.findById(order.restaurantId).lean()

  const mapped = mapRiderOrder(order, restaurant, rider.id, rider.activeTrackingOrderId ?? "")

  // Real road route for the rider's next leg: to the restaurant before pickup,
  // to the customer once picked up. Cached + Haversine-backed (cost-efficient).
  const riderCoord =
    toRiderLatLng((order as Record<string, any>).riderTracking?.currentLocation) ??
    toRiderLatLng(rider.lastKnownLocation)
  const destination =
    order.status === "PickedUp"
      ? toRiderLatLng(order.customerSnapshot?.deliveryAddress)
      : toRiderLatLng(restaurant?.location)
  const isDeliveryLeg = order.status === "PickedUp"
  const routeToNext = riderCoord
    ? await getOrderRouteMetrics({
        orderId: String(order._id),
        origin: riderCoord,
        destination,
        source: "rider_details",
        sessionKey: isDeliveryLeg ? "delivery_leg" : "pickup_leg",
        // Pre-pickup (rider→restaurant) uses a free straight-line estimate; paid Google
        // routing is reserved for the customer-facing delivery leg after pickup.
        allowGoogle: isDeliveryLeg,
      })
    : null

  return { ...mapped, routeToNext }
}

function toRiderLatLng(value: unknown): LatLng | null {
  const point = value as { latitude?: unknown; longitude?: unknown } | null
  if (
    point &&
    typeof point.latitude === "number" &&
    Number.isFinite(point.latitude) &&
    typeof point.longitude === "number" &&
    Number.isFinite(point.longitude)
  ) {
    return { latitude: point.latitude, longitude: point.longitude }
  }
  return null
}

export async function acceptRiderOrder(params: { riderId: string; orderId: string }) {
  const rider = await RiderModel.findById(params.riderId)

  if (!rider) {
    throw new AppError(StatusCodes.NOT_FOUND, "RIDER_NOT_FOUND", "Rider not found")
  }

  assertRiderAccessible(rider)

  if (rider.isAvailableForAssignments === false) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "RIDER_OFFLINE",
      "Go online before accepting a new order"
    )
  }

  const order = await OrderModel.findById(params.orderId)

  if (!order) {
    throw new AppError(StatusCodes.NOT_FOUND, "ORDER_NOT_FOUND", "Order not found")
  }

  if (order.status !== "ReadyForPickup") {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "ORDER_NOT_ACCEPTABLE",
      "This order is not available for rider assignment"
    )
  }

  if (order.riderId && order.riderId !== rider.id) {
    throw new AppError(
      StatusCodes.CONFLICT,
      "ORDER_ALREADY_ASSIGNED",
      "This order is already assigned to another rider"
    )
  }

  assertRiderAllowedForServiceArea({
    rider,
    serviceAreaSnapshot: order.serviceAreaSnapshot
  })

  const [activeAssignedOrdersCount, maxActiveOrdersPerRider] = await Promise.all([
    OrderModel.countDocuments({
      riderId: rider.id,
      status: { $in: ["ReadyForPickup", "PickedUp"] }
    }),
    getMaxActiveOrdersPerRider()
  ])

  if (!order.riderId && activeAssignedOrdersCount >= maxActiveOrdersPerRider) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "RIDER_CAPACITY_REACHED",
      `You already have ${activeAssignedOrdersCount} active orders. Complete one before accepting more.`
    )
  }

  order.riderId = rider.id
  order.riderSnapshot = {
    ...(order.riderSnapshot ?? {}),
    name: rider.fullName,
    phone: rider.phone,
    vehicleType: rider.vehicleType
  }
  order.set("dispatchMeta", {
    ...(order.get("dispatchMeta") ?? {}),
    acknowledgedAt: new Date()
  })
  await order.save()

  const orderObject = order.toObject()
  await emitOrderRealtimeUpdate(orderObject, {
    type: "rider.assignment",
    riderId: rider.id,
    assignmentAction: "self_accepted"
  })

  return getRiderOrderDetails({
    riderId: rider.id,
    orderId: order.id
  })
}

export async function pickupRiderOrder(params: {
  riderId: string
  orderId: string
  location?: {
    latitude: number
    longitude: number
    heading?: number
    accuracyMeters?: number
    speedKmph?: number
  }
}) {
  const rider = await RiderModel.findById(params.riderId)

  if (!rider) {
    throw new AppError(StatusCodes.NOT_FOUND, "RIDER_NOT_FOUND", "Rider not found")
  }

  assertRiderAccessible(rider)

  const order = await OrderModel.findById(params.orderId)

  if (!order) {
    throw new AppError(StatusCodes.NOT_FOUND, "ORDER_NOT_FOUND", "Order not found")
  }

  if (order.status !== "ReadyForPickup") {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "ORDER_NOT_READY",
      "This order is not ready for pickup yet"
    )
  }

  if (order.riderId && order.riderId !== rider.id) {
    throw new AppError(
      StatusCodes.CONFLICT,
      "ORDER_ALREADY_ASSIGNED",
      "This order is already assigned to another rider"
    )
  }

  assertRiderAllowedForServiceArea({
    rider,
    serviceAreaSnapshot: order.serviceAreaSnapshot
  })

  if (!order.riderId) {
    order.riderId = rider.id
    order.riderSnapshot = {
      ...(order.riderSnapshot ?? {}),
      name: rider.fullName,
      phone: rider.phone,
      vehicleType: rider.vehicleType
    }
  }
  order.set("dispatchMeta", {
    ...(order.get("dispatchMeta") ?? {}),
    acknowledgedAt: new Date()
  })
  await order.save()

  const updatedOrder = await transitionOrderBySystem({
    orderId: order.id,
    nextStatus: "PickedUp",
    actor: "rider",
    note: "Picked up by rider"
  })

  // Whether the rider was already running an active trip before this pickup. If so,
  // this newly picked-up order joins the queue rather than becoming the live trip.
  const hadActiveTrip = Boolean(rider.activeTrackingOrderId)
  if (!hadActiveTrip) {
    await setActiveTrackingOrder({
      riderId: rider.id,
      orderId: order.id
    })
  }

  if (params.location) {
    const updatedAt = new Date()
    const locationSnapshot = {
      latitude: params.location.latitude,
      longitude: params.location.longitude,
      heading: params.location.heading ?? null,
      accuracyMeters: params.location.accuracyMeters ?? null,
      speedKmph: params.location.speedKmph ?? null,
      updatedAt
    }

    rider.lastKnownLocation = locationSnapshot
    await rider.save()

    updatedOrder.set("riderTracking", {
      ...(updatedOrder.get("riderTracking") ?? {}),
      isActive: true,
      // Only the rider's active trip is "focused" and shows the live map to its
      // customer. A pickup made while another delivery is active stays queued
      // (isFocused: false) until that delivery finishes and promotes this one.
      isFocused: !hadActiveTrip,
      currentLocation: locationSnapshot,
      lastSeenAt: updatedAt,
      disconnectedAt: null
    })
    await updatedOrder.save()
  }

  emitSocketEvent(`rider:${rider.id}`, "rider.order.updated", updatedOrder.toObject())

  return getRiderOrderDetails({
    riderId: rider.id,
    orderId: order.id
  })
}

export async function deliverRiderOrder(params: { riderId: string; orderId: string }) {
  const rider = await RiderModel.findById(params.riderId)

  if (!rider) {
    throw new AppError(StatusCodes.NOT_FOUND, "RIDER_NOT_FOUND", "Rider not found")
  }

  assertRiderAccessible(rider)

  const order = await OrderModel.findById(params.orderId)

  if (!order || order.riderId !== rider.id) {
    throw new AppError(StatusCodes.NOT_FOUND, "ORDER_NOT_FOUND", "Order not found")
  }

  if (order.status !== "PickedUp") {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "ORDER_NOT_IN_TRANSIT",
      "This order is not currently in transit"
    )
  }

  const updatedOrder = await transitionOrderBySystem({
    orderId: order.id,
    nextStatus: "Delivered",
    actor: "rider",
    note: "Delivered by rider"
  })

  updatedOrder.set("riderTracking", {
    ...(updatedOrder.get("riderTracking") ?? {}),
    isActive: false,
    endedAt: new Date(),
    disconnectedAt: new Date()
  })
  await updatedOrder.save()

  await clearActiveTrackingOrderIfMatches({
    riderId: rider.id,
    orderId: order.id
  })

  emitSocketEvent(`rider:${rider.id}`, "rider.order.updated", updatedOrder.toObject())

  return getRiderOrderDetails({
    riderId: rider.id,
    orderId: order.id
  })
}

export type RiderDeliveryFailureReason =
  | "customer_no_response"
  | "wrong_item"
  | "others"

/**
 * Rider-reported failed delivery (order already PickedUp but undeliverable). Routes
 * through the same terminal pipeline as any other cancel, so the customer refund,
 * restaurant ledger removal, voucher release, rider-tracking teardown, and all socket
 * sync (customer/owner/admin/rider) stay 100% consistent. The reason is stored on the
 * order (cancelledBy=rider + terminalReason) so admin sees exactly why it failed.
 */
export async function failRiderDelivery(params: {
  riderId: string
  orderId: string
  reason: RiderDeliveryFailureReason
  note?: string
}) {
  const rider = await RiderModel.findById(params.riderId)

  if (!rider) {
    throw new AppError(StatusCodes.NOT_FOUND, "RIDER_NOT_FOUND", "Rider not found")
  }

  assertRiderAccessible(rider)

  const order = await OrderModel.findById(params.orderId)

  if (!order || order.riderId !== rider.id) {
    throw new AppError(StatusCodes.NOT_FOUND, "ORDER_NOT_FOUND", "Order not found")
  }

  if (order.status !== "PickedUp") {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "ORDER_NOT_IN_TRANSIT",
      "This order is not currently in transit"
    )
  }

  const trimmedNote = (params.note ?? "").trim()
  const terminalReason = trimmedNote
    ? `${params.reason} - ${trimmedNote}`
    : params.reason

  const updatedOrder = await transitionOrderBySystem({
    orderId: order.id,
    nextStatus: "Cancelled",
    actor: "rider",
    note: terminalReason
  })

  await clearActiveTrackingOrderIfMatches({
    riderId: rider.id,
    orderId: order.id
  })

  // Apply the failed-delivery compensation policy (rider trip pay + restaurant
  // compensation by fault). Best-effort and additive — the cancel + refund above are
  // already committed and stay consistent regardless.
  await applyFailedDeliveryFinance({
    order: updatedOrder.toObject(),
    reason: params.reason
  })

  emitSocketEvent(`rider:${rider.id}`, "rider.order.updated", updatedOrder.toObject())

  return getRiderOrderDetails({
    riderId: rider.id,
    orderId: order.id
  })
}

export async function activateRiderTrackingOrder(params: { riderId: string; orderId: string }) {
  const rider = await RiderModel.findById(params.riderId)

  if (!rider) {
    throw new AppError(StatusCodes.NOT_FOUND, "RIDER_NOT_FOUND", "Rider not found")
  }

  assertRiderAccessible(rider)

  const order = await OrderModel.findById(params.orderId)

  if (!order || order.riderId !== rider.id) {
    throw new AppError(StatusCodes.NOT_FOUND, "ORDER_NOT_FOUND", "Order not found")
  }

  if (order.status !== "PickedUp") {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "ORDER_NOT_IN_TRANSIT",
      "Only picked up orders can start live tracking"
    )
  }

  await setActiveTrackingOrder({
    riderId: rider.id,
    orderId: order.id
  })

  return getRiderOrderDetails({
    riderId: rider.id,
    orderId: order.id
  })
}

function scheduleRiderOrderLocationFlush(orderId: string, delayMs = 0) {
  const entry = riderOrderLocationQueue.get(orderId)
  if (!entry || entry.timer) return

  entry.timer = setTimeout(() => {
    entry.timer = null
    void flushRiderOrderLocation(orderId)
  }, Math.max(0, delayMs))
}

async function flushRiderOrderLocation(orderId: string) {
  const entry = riderOrderLocationQueue.get(orderId)
  if (!entry || entry.inFlight || !entry.latest) return

  const elapsedMs = entry.lastSavedAtMs ? Date.now() - entry.lastSavedAtMs : Number.POSITIVE_INFINITY
  if (elapsedMs < RIDER_ORDER_LOCATION_WRITE_INTERVAL_MS) {
    scheduleRiderOrderLocationFlush(orderId, RIDER_ORDER_LOCATION_WRITE_INTERVAL_MS - elapsedMs)
    return
  }

  const update = entry.latest
  entry.latest = null
  entry.inFlight = true

  try {
    const [updatedOrder] = await Promise.all([
      updateOrderRiderLocation({
        orderId: update.orderId,
        actor: "rider",
        latitude: update.latitude,
        longitude: update.longitude,
        heading: update.heading,
        accuracyMeters: update.accuracyMeters,
        speedKmph: update.speedKmph,
        riderName: update.riderName,
        riderPhone: update.riderPhone
      }),
      RiderModel.updateOne(
        { _id: update.riderId },
        {
          $set: {
            lastKnownLocation: {
              latitude: update.latitude,
              longitude: update.longitude,
              heading: update.heading ?? null,
              accuracyMeters: update.accuracyMeters ?? null,
              speedKmph: update.speedKmph ?? null,
              updatedAt: new Date()
            }
          }
        }
      )
    ])
    const updatedOrderObject =
      typeof updatedOrder.toObject === "function" ? updatedOrder.toObject() : updatedOrder
    entry.lastSavedAtMs = Date.now()
    recentRiderOrderLocationUpdates.set(orderId, {
      savedAtMs: entry.lastSavedAtMs,
      order: updatedOrderObject
    })
  } catch (error) {
    logger.warn(
      {
        error,
        orderId,
        riderId: update.riderId
      },
      "Queued rider order location update failed"
    )
  } finally {
    entry.inFlight = false
    if (entry.latest) {
      scheduleRiderOrderLocationFlush(orderId, RIDER_ORDER_LOCATION_WRITE_INTERVAL_MS)
    }
  }
}

function enqueueRiderOrderLocationUpdate(update: QueuedRiderOrderLocationUpdate) {
  if (riderOrderLocationQueue.size > RIDER_ORDER_LOCATION_QUEUE_PRUNE_SIZE) {
    pruneIdleRiderOrderLocationQueue()
  }

  const existing = riderOrderLocationQueue.get(update.orderId)
  const entry =
    existing ??
    {
      latest: null,
      timer: null,
      inFlight: false,
      lastSavedAtMs: recentRiderOrderLocationUpdates.get(update.orderId)?.savedAtMs ?? 0
    }

  entry.latest = update
  riderOrderLocationQueue.set(update.orderId, entry)

  if (!entry.inFlight && !entry.timer) {
    const elapsedMs = entry.lastSavedAtMs ? Date.now() - entry.lastSavedAtMs : Number.POSITIVE_INFINITY
    scheduleRiderOrderLocationFlush(
      update.orderId,
      elapsedMs < RIDER_ORDER_LOCATION_WRITE_INTERVAL_MS
        ? RIDER_ORDER_LOCATION_WRITE_INTERVAL_MS - elapsedMs
        : 0
    )
  }
}

function pruneIdleRiderOrderLocationQueue(now = Date.now()) {
  for (const [orderId, entry] of riderOrderLocationQueue) {
    if (
      !entry.latest &&
      !entry.timer &&
      !entry.inFlight &&
      entry.lastSavedAtMs &&
      now - entry.lastSavedAtMs > RIDER_ORDER_LOCATION_QUEUE_IDLE_MS
    ) {
      riderOrderLocationQueue.delete(orderId)
      recentRiderOrderLocationUpdates.delete(orderId)
    }
  }
}

function buildAcceptedRiderLocationOrder(params: {
  orderId: string
  activeTrackingOrderId?: string
  latitude: number
  longitude: number
  heading?: number
  accuracyMeters?: number
  speedKmph?: number
}) {
  const now = new Date()
  const isFocusedLiveTrip =
    Boolean(params.activeTrackingOrderId) && params.activeTrackingOrderId === params.orderId

  return {
    id: params.orderId,
    _id: params.orderId,
    status: "PickedUp",
    assignmentState: "assigned_to_you",
    isTrackingActiveForRider: true,
    isFocusedLiveTrip,
    updatedAt: now.toISOString(),
    riderTracking: decorateTrackingSnapshot(
      {
        isActive: true,
        isFocused: isFocusedLiveTrip,
        lastUpdatedAt: now,
        currentLocation: {
          latitude: params.latitude,
          longitude: params.longitude,
          heading: params.heading ?? null,
          accuracyMeters: params.accuracyMeters ?? null
        },
        speedKmph: params.speedKmph ?? null
      },
      "PickedUp"
    )
  }
}

export async function postRiderLocation(params: {
  riderId: string
  orderId: string
  latitude: number
  longitude: number
  heading?: number
  accuracyMeters?: number
  speedKmph?: number
}) {
  const [rider, order] = (await Promise.all([
    RiderModel.findById(params.riderId)
      .select("_id fullName phone status verification activeTrackingOrderId")
      .lean(),
    OrderModel.findOne({ _id: params.orderId, riderId: params.riderId })
      .select("_id riderId status")
      .lean()
  ])) as [Record<string, any> | null, Record<string, any> | null]

  if (!rider) {
    throw new AppError(StatusCodes.NOT_FOUND, "RIDER_NOT_FOUND", "Rider not found")
  }

  assertRiderAccessible(rider)

  if (!order) {
    throw new AppError(StatusCodes.NOT_FOUND, "ORDER_NOT_FOUND", "Order not found")
  }

  if (order.status !== "PickedUp") {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "ORDER_NOT_IN_TRANSIT",
      "Rider location can only be shared after pickup"
    )
  }

  const orderId = String(order._id ?? params.orderId)
  const riderId = String(rider._id ?? params.riderId)
  const activeTrackingOrderId = String(rider.activeTrackingOrderId ?? "")

  if (activeTrackingOrderId === orderId) {
    enqueueRiderOrderLocationUpdate({
      orderId,
      riderId,
      riderName: rider.fullName ?? "",
      riderPhone: rider.phone ?? "",
      latitude: params.latitude,
      longitude: params.longitude,
      heading: params.heading,
      accuracyMeters: params.accuracyMeters,
      speedKmph: params.speedKmph
    })
  }

  return buildAcceptedRiderLocationOrder({
    orderId,
    activeTrackingOrderId,
    latitude: params.latitude,
    longitude: params.longitude,
    heading: params.heading,
    accuracyMeters: params.accuracyMeters,
    speedKmph: params.speedKmph
  })
}

// Reviews a customer left for THIS rider (only entries where the customer actually
// rated the rider). Read-only — riders can see their ratings, not reply to them.
export async function listRiderReviews(params: {
  riderId: string
  page?: number
  pageSize?: number
}) {
  const riderId = String(params.riderId ?? "").trim()
  if (!riderId) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "RIDER_NOT_FOUND", "Rider not found")
  }

  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20))
  const query = { riderId, riderRating: { $ne: null } }

  const [items, total, ratingAgg] = await Promise.all([
    ReviewModel.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .select("_id riderRating riderComment orderId createdAt")
      .lean<Record<string, any>[]>(),
    ReviewModel.countDocuments(query),
    ReviewModel.aggregate<{ _id: null; average: number }>([
      { $match: query },
      { $group: { _id: null, average: { $avg: "$riderRating" } } }
    ])
  ])

  return {
    items: items.map((review) => ({
      _id: String(review._id ?? ""),
      riderRating:
        typeof review.riderRating === "number" ? review.riderRating : null,
      riderComment: review.riderComment ?? "",
      orderId: review.orderId ? String(review.orderId) : "",
      createdAt:
        review.createdAt instanceof Date
          ? review.createdAt.toISOString()
          : (review.createdAt ?? null)
    })),
    total,
    averageRating: ratingAgg[0]?.average
      ? Math.round(ratingAgg[0].average * 10) / 10
      : 0
  }
}
