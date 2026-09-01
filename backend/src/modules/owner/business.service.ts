import crypto from "node:crypto"

import { StatusCodes } from "http-status-codes"
import type { SortOrder } from "mongoose"

import { env } from "../../config/env"
import { emitSocketEvent } from "../../config/socket"
import { enqueueBackgroundTask } from "../../common/utils/background-task"
import {
  deleteCloudinaryAsset,
  replaceCloudinaryImage,
} from "../../common/utils/cloudinary"
import {
  createAdminOperationalAlert,
  resolveAdminOperationalAlertByDedupeKey
} from "../admin/admin-alert.service"
import { AdminAuditLogModel } from "../admin/admin.model"
import { AppError } from "../../common/utils/app-error"
import {
  OpeningHoursModel,
  OnboardingDraftModel,
  OwnerModel,
  RestaurantModel
} from "../auth/auth.model"
import { sendPushToCustomer } from "../customer/push.service"
import { invalidateCustomerRestaurantAvailabilityCaches } from "../customer/customer.service"
import {
  getOwnerRestaurantEnforcement,
  getRestaurantEnforcement,
  isRestaurantOrderingRestricted
} from "../restaurant-enforcement"
import {
  getServiceHoursOverrideForZone,
  resolveRestaurantServiceAreaSnapshot,
  resolveServiceZoneForCoordinates,
} from "../service-area/service-area.service"
import {
  evaluateServiceWindowForOverride,
  formatMinuteOfDayLabel,
} from "../service-area/service-hours"
import { getPlatformServiceHours } from "../public/content.service"
import { createOwnerNotification } from "./operational.service"
import { ReviewModel, SupportCaseModel } from "./experience.model"
import { OrderModel } from "./operational.model"
import {
  syncRestaurantAvailabilitySession,
  type RestaurantAvailabilitySessionSource
} from "./restaurant-availability-session.service"

function buildRestaurantLocationPoint(
  latitude?: number | null,
  longitude?: number | null
) {
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return null
  }

  return {
    type: "Point" as const,
    coordinates: [longitude, latitude]
  }
}

const restaurantDocumentTypes = new Set([
  "nid",
  "trade_license",
  "tin",
  "bin_vat",
])

function normalizeRestaurantDocuments(
  documents?: Array<{
    type?: string
    label?: string
    url?: string
    publicId?: string
    fileName?: string
    fileType?: string
    resourceType?: string
    uploadedAt?: string | Date | null
  }>
) {
  const byType = new Map<string, Record<string, unknown>>()

  for (const document of documents ?? []) {
    const type = String(document.type ?? "").trim()
    const url = String(document.url ?? "").trim()
    if (!restaurantDocumentTypes.has(type) || !url) continue

    const uploadedAt =
      document.uploadedAt instanceof Date
        ? document.uploadedAt
        : document.uploadedAt
          ? new Date(document.uploadedAt)
          : new Date()

    byType.set(type, {
      type,
      label: String(document.label ?? "").trim(),
      url,
      publicId: String(document.publicId ?? "").trim(),
      fileName: String(document.fileName ?? "").trim(),
      fileType: String(document.fileType ?? "").trim(),
      resourceType: String(document.resourceType ?? "auto").trim() || "auto",
      uploadedAt: Number.isNaN(uploadedAt.getTime()) ? new Date() : uploadedAt,
    })
  }

  return Array.from(byType.values())
}

function normalizeCustomerNoteSetting(note?: {
  enabled?: boolean
  label?: string
  placeholder?: string
}) {
  return {
    enabled: note?.enabled === true,
    label: note?.label?.trim() || "Order note",
    placeholder:
      note?.placeholder?.trim() ||
      "Cake name, message, or any restaurant instruction"
  }
}

function createDefaultWeeklySchedule() {
  return [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday"
  ].map((day) => ({
    day,
    isOpen: true,
    is24Hours: false,
    timeSlots: [{ startTime: "10:00", endTime: "23:00" }]
  }))
}

function getReviewDateRange(params?: {
  datePreset?: string
  from?: string
  to?: string
}) {
  const now = new Date()
  const startOfDay = (date: Date) => {
    const next = new Date(date)
    next.setHours(0, 0, 0, 0)
    return next
  }
  const endOfDay = (date: Date) => {
    const next = new Date(date)
    next.setHours(23, 59, 59, 999)
    return next
  }

  switch (params?.datePreset) {
    case "today":
      return { start: startOfDay(now), end: endOfDay(now) }
    case "yesterday": {
      const yesterday = new Date(now)
      yesterday.setDate(now.getDate() - 1)
      return { start: startOfDay(yesterday), end: endOfDay(yesterday) }
    }
    case "last7Days": {
      const start = new Date(now)
      start.setDate(now.getDate() - 6)
      return { start: startOfDay(start), end: endOfDay(now) }
    }
    case "last30Days": {
      const start = new Date(now)
      start.setDate(now.getDate() - 29)
      return { start: startOfDay(start), end: endOfDay(now) }
    }
    case "last90Days": {
      const start = new Date(now)
      start.setDate(now.getDate() - 89)
      return { start: startOfDay(start), end: endOfDay(now) }
    }
    case "lastMonth": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0)
      return { start: startOfDay(start), end: endOfDay(end) }
    }
    case "lifetime":
      return null
    case "thisWeek": {
      const start = new Date(now)
      const day = start.getDay()
      const diff = day === 0 ? 6 : day - 1
      start.setDate(start.getDate() - diff)
      return { start: startOfDay(start), end: endOfDay(now) }
    }
    case "thisMonth": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      return { start: startOfDay(start), end: endOfDay(now) }
    }
    case "custom":
      if (params?.from) {
        return {
          start: startOfDay(new Date(params.from)),
          end: endOfDay(new Date(params.to ?? params.from))
        }
      }
      return null
    default:
      return null
  }
}

async function createOwnerRestaurantAuditLog(params: {
  ownerId: string
  ownerName: string
  restaurantId: string
  action: string
  title: string
  description?: string
  metadata?: Record<string, unknown>
}) {
  await AdminAuditLogModel.create({
    actorAdminId: params.ownerId,
    actorName: params.ownerName || "Restaurant owner",
    actorRole: "owner",
    entityType: "restaurant",
    entityId: params.restaurantId,
    action: params.action,
    title: params.title,
    description: params.description ?? "",
    metadata: params.metadata ?? {}
  })
}

async function getOwnerBusinessContext(ownerId: string) {
  const owner = await OwnerModel.findById(ownerId)

  if (!owner) {
    throw new AppError(StatusCodes.NOT_FOUND, "OWNER_NOT_FOUND", "Owner not found")
  }

  if (!owner.activeRestaurantId || owner.restaurantLifecycleStatus !== "approved") {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "RESTAURANT_NOT_READY",
      "This business feature is only available after restaurant approval"
    )
  }

  const restaurant = await RestaurantModel.findById(owner.activeRestaurantId)

  if (!restaurant) {
    throw new AppError(StatusCodes.NOT_FOUND, "RESTAURANT_NOT_FOUND", "Restaurant not found")
  }

  return {
    owner,
    restaurant,
    restaurantId: restaurant.id
  }
}

export async function getStoreSettings(ownerId: string) {
  const { restaurant } = await getOwnerBusinessContext(ownerId)
  const onboardingDraft = await OnboardingDraftModel.findOne({ ownerId }).lean()
  const draftPreparationTime =
    typeof onboardingDraft?.basicInfo?.preparationTimeMinutes === "number"
      ? onboardingDraft.basicInfo.preparationTimeMinutes
      : null
  const resolvedPreparationTime = draftPreparationTime ?? 20

  if (
    (restaurant.preparationTimeMinutes === null ||
      restaurant.preparationTimeMinutes === undefined)
  ) {
    restaurant.preparationTimeMinutes = resolvedPreparationTime
    await restaurant.save()
  }

  const currentSettings =
    (restaurant.settings as {
      notifications?: Record<string, boolean>
      orderSettings?: {
        autoAcceptOrders?: boolean
        customerNote?: { enabled?: boolean; label?: string; placeholder?: string }
      }
    } | undefined) ?? {}
  if (currentSettings.orderSettings?.autoAcceptOrders === true) {
    restaurant.settings = {
      ...currentSettings,
      notifications: {
        newOrder: true,
        cancellation: true,
        payouts: true,
        support: true
      },
      orderSettings: {
        ...(currentSettings.orderSettings ?? {}),
        autoAcceptOrders: false,
        customerNote: normalizeCustomerNoteSetting(
          currentSettings.orderSettings?.customerNote
        )
      }
    }
    await restaurant.save()
  }

  const storeSettings = restaurant.toObject()
  storeSettings.enforcement = getOwnerRestaurantEnforcement(storeSettings)

  // Surface the platform/zone service window so the owner apps can explain why
  // customers may see the restaurant as closed even when it is toggled online.
  // Driven by the restaurant's own zone. Evaluated live (uncached endpoint).
  const restaurantServiceArea =
    (await resolveRestaurantServiceAreaSnapshot(restaurant)) ??
    (storeSettings.serviceArea as { zoneId?: string } | null | undefined) ??
    null
  const serviceWindow = evaluateServiceWindowForOverride(
    await getServiceHoursOverrideForZone(restaurantServiceArea?.zoneId),
    await getPlatformServiceHours(),
  )
  ;(storeSettings as Record<string, any>).serviceHours = {
    enabled: serviceWindow.enabled,
    isOpenNow: serviceWindow.isOpen,
    openMinute: serviceWindow.openMinute,
    closeMinute: serviceWindow.closeMinute,
    openLabel: formatMinuteOfDayLabel(serviceWindow.openMinute),
    closeLabel: formatMinuteOfDayLabel(serviceWindow.closeMinute),
    timezone: serviceWindow.timezone,
  }
  return storeSettings
}

export async function updateStoreSettings(params: {
  ownerId: string
  name?: string
  description?: string
  phone?: string
  preparationTimeMinutes?: number | null
  autoAcceptOrders?: boolean
  cuisineTypes?: string[]
  tags?: string[]
  logo?: { url?: string; publicId?: string }
  coverImage?: { url?: string; publicId?: string }
  documents?: Array<{
    type?: string
    label?: string
    url?: string
    publicId?: string
    fileName?: string
    fileType?: string
    resourceType?: string
    uploadedAt?: string | Date | null
  }>
  address?: string
  city?: string
  latitude?: number | null
  longitude?: number | null
  notifications?: {
    newOrder?: boolean
    cancellation?: boolean
    payouts?: boolean
    support?: boolean
  }
}) {
  const { owner, restaurant, restaurantId } = await getOwnerBusinessContext(params.ownerId)
  const previousContactPhone = restaurant.contact?.phone ?? ""
  // Capture the currently-stored image ids so a replaced cover/logo can be purged from Cloudinary
  // after the save (see replaceCloudinaryImage below).
  const previousLogoPublicId = restaurant.logo?.publicId ?? ""
  const previousCoverPublicId = restaurant.coverImage?.publicId ?? ""

  if (params.name !== undefined) restaurant.name = params.name
  if (params.description !== undefined) restaurant.description = params.description
  if (params.phone !== undefined) {
    restaurant.contact = {
      ...(restaurant.contact ?? { phone: "", email: "" }),
      phone: params.phone
    }
  }
  if (params.preparationTimeMinutes !== undefined) {
    restaurant.preparationTimeMinutes = params.preparationTimeMinutes
  }
  if (params.cuisineTypes !== undefined) restaurant.cuisineTypes = params.cuisineTypes
  if (params.tags !== undefined) restaurant.tags = params.tags

  if (params.logo !== undefined) {
    restaurant.logo = {
      ...(restaurant.logo ?? { url: "", publicId: "" }),
      ...params.logo
    }
  }

  if (params.coverImage !== undefined) {
    restaurant.coverImage = {
      ...(restaurant.coverImage ?? { url: "", publicId: "" }),
      ...params.coverImage
    }
  }

  if (params.documents !== undefined) {
    restaurant.documents = normalizeRestaurantDocuments(params.documents) as any
  }

  if (params.address !== undefined || params.city !== undefined) {
    restaurant.address = {
      ...(restaurant.address ?? { address: "", city: "Netrokona" }),
      ...(params.address !== undefined ? { address: params.address } : {}),
      ...(params.city !== undefined ? { city: params.city } : {})
    }
  }

  if (
    params.latitude !== undefined ||
    params.longitude !== undefined
  ) {
    const nextLocation = {
      ...(restaurant.location ?? { latitude: null, longitude: null }),
      ...(params.latitude !== undefined ? { latitude: params.latitude } : {}),
      ...(params.longitude !== undefined ? { longitude: params.longitude } : {})
    }

    restaurant.location = {
      ...nextLocation
    }
    restaurant.locationPoint = buildRestaurantLocationPoint(
      nextLocation.latitude,
      nextLocation.longitude
    )
    const serviceArea = await resolveServiceZoneForCoordinates({
      latitude: nextLocation.latitude,
      longitude: nextLocation.longitude
    })
    restaurant.serviceArea = (serviceArea?.snapshot ?? {}) as any
  }

  if (params.notifications !== undefined) {
    restaurant.settings = {
      ...(restaurant.settings ?? {}),
      notifications: {
        newOrder: true,
        cancellation: true,
        payouts: true,
        support: true
      }
    }
  }

  if (params.autoAcceptOrders !== undefined) {
    const currentSettings =
      (restaurant.settings as {
        notifications?: Record<string, boolean>
        orderSettings?: {
          autoAcceptOrders?: boolean
          customerNote?: { enabled?: boolean; label?: string; placeholder?: string }
        }
      } | undefined) ?? {}

    restaurant.settings = {
      notifications: {
        newOrder: true,
        cancellation: true,
        payouts: true,
        support: true
      },
      orderSettings: {
        ...(currentSettings.orderSettings ?? {}),
        autoAcceptOrders: false,
        customerNote: normalizeCustomerNoteSetting(
          currentSettings.orderSettings?.customerNote
        )
      }
    }
  }

  const nextSettings =
    (restaurant.settings as {
      notifications?: Record<string, boolean>
      orderSettings?: {
        autoAcceptOrders?: boolean
        customerNote?: { enabled?: boolean; label?: string; placeholder?: string }
      }
    } | undefined) ?? {}
  restaurant.settings = {
    ...nextSettings,
    notifications: {
      newOrder: true,
      cancellation: true,
      payouts: true,
      support: true
    },
    orderSettings: {
      ...(nextSettings.orderSettings ?? {}),
      autoAcceptOrders: false,
      customerNote: normalizeCustomerNoteSetting(
        nextSettings.orderSettings?.customerNote
      )
    }
  }

  await restaurant.save()
  // Cover/logo have no history dependency — purge the replaced Cloudinary asset (post-save).
  if (params.logo !== undefined) {
    replaceCloudinaryImage(previousLogoPublicId, restaurant.logo?.publicId)
  }
  if (params.coverImage !== undefined) {
    replaceCloudinaryImage(previousCoverPublicId, restaurant.coverImage?.publicId)
  }
  emitSocketEvent(`owner:${params.ownerId}`, "store.updated", {
    restaurantId,
    type: "store_settings_updated"
  })
  emitSocketEvent(`restaurant:${restaurantId}`, "store.updated", {
    restaurantId,
    type: "store_settings_updated"
  })
  if (params.phone !== undefined) {
    if (params.phone !== previousContactPhone) {
      await createOwnerRestaurantAuditLog({
        ownerId: params.ownerId,
        ownerName: owner.fullName ?? "Restaurant owner",
        restaurantId,
        action: "restaurant_contact_updated",
        title: "Restaurant contact number updated",
        description: `Restaurant owner changed the pickup contact number from ${previousContactPhone || "not set"} to ${params.phone}.`,
        metadata: {
          previousPhone: previousContactPhone,
          nextPhone: params.phone,
          source: "owner_settings"
        }
      }).catch(() => undefined)
    }

    const activeRiderOrders = await OrderModel.find({
      restaurantId,
      riderId: { $nin: ["", null] },
      status: { $in: ["ReadyForPickup", "PickedUp"] }
    }).select("_id riderId")

    activeRiderOrders.forEach((order) => {
      emitSocketEvent(`rider:${String(order.riderId)}`, "rider.restaurant.updated", {
        restaurantId,
        orderId: order.id
      })
    })
  }
  return restaurant
}

export async function updateRestaurantStatus(params: {
  ownerId: string
  isOnline: boolean
  source?: RestaurantAvailabilitySessionSource
}) {
  const { restaurant, restaurantId } = await getOwnerBusinessContext(params.ownerId)
  const previousOnline = restaurant.runtime?.isOnline === true
  const previousUpdatedAt = restaurant.updatedAt ?? new Date()
  if (params.isOnline && isRestaurantOrderingRestricted(restaurant)) {
    const enforcement = getRestaurantEnforcement(restaurant)
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "RESTAURANT_RESTRICTED",
      enforcement.ownerNote ||
        "Your restaurant is temporarily unavailable while Foodbela reviews service quality."
    )
  }

  restaurant.runtime = {
    ...(restaurant.runtime ?? {}),
    isOnline: params.isOnline,
    currentOperationalStatus: params.isOnline ? "open" : "closed"
  }

  await restaurant.save()

  const activeOrders = await OrderModel.find({
    restaurantId,
    status: { $in: ["New", "Accepted", "Preparing", "ReadyForPickup", "PickedUp"] }
  }).select("customerId orderNumber status")

  await syncRestaurantAvailabilitySession({
    restaurantId,
    ownerId: params.ownerId,
    isOnline: params.isOnline,
    source: params.source ?? "unknown",
    endReason: params.isOnline ? undefined : "manual_offline",
    activeOrderCount: activeOrders.length,
    activeOrderNumbers: activeOrders.map((order) => order.orderNumber),
    fallbackStartedAt: !params.isOnline && previousOnline ? previousUpdatedAt : null
  })

  emitSocketEvent(`owner:${params.ownerId}`, "store.updated", {
    restaurantId,
    type: "status_updated",
    isOnline: params.isOnline
  })
  emitSocketEvent(`restaurant:${restaurantId}`, "store.updated", {
    restaurantId,
    type: "status_updated",
    isOnline: params.isOnline
  })

  // The online/offline toggle changes customer-visible availability, so the customer
  // discovery/detail/cart read caches MUST be flushed here — otherwise a warm cache
  // serves the old status for up to TTL+SWR (~75s), which is why the change reflected
  // instantly on a cold cache but lagged on a warm one. (Documented invariant; this
  // call had regressed out of the toggle path.)
  invalidateCustomerRestaurantAvailabilityCaches()

  const offlineActiveOrdersDedupeKey = `restaurant:${restaurantId}:offline_active_orders`
  if (!params.isOnline && activeOrders.length > 0) {
    enqueueBackgroundTask("admin.restaurant_offline_active_orders_alert", async () => {
      await createAdminOperationalAlert({
        alertType: "restaurant_offline_active_orders",
        severity: "critical",
        title: `${restaurant.name} went offline with active orders`,
        description: `${activeOrders.length} live order${activeOrders.length === 1 ? "" : "s"} may need admin follow-up.`,
        source: "Restaurants",
        entityType: "restaurant",
        entityId: restaurantId,
        path: `/restaurants?restaurantId=${restaurantId}`,
        iconKey: "store",
        dedupeKey: offlineActiveOrdersDedupeKey,
        metadata: {
          restaurantId,
          restaurantName: restaurant.name,
          activeOrderCount: activeOrders.length,
          orderNumbers: activeOrders.map((order) => order.orderNumber).slice(0, 20),
        },
      })
    })
  } else if (params.isOnline) {
    enqueueBackgroundTask("admin.restaurant_offline_active_orders_resolve", async () => {
      await resolveAdminOperationalAlertByDedupeKey(offlineActiveOrdersDedupeKey)
    })
  }

  return restaurant
}

export async function getOpeningHours(ownerId: string) {
  const { restaurantId } = await getOwnerBusinessContext(ownerId)
  const onboardingDraft = await OnboardingDraftModel.findOne({ ownerId }).lean()
  const draftOpeningHours =
    onboardingDraft?.openingHours &&
    typeof onboardingDraft.openingHours === "object"
      ? onboardingDraft.openingHours
      : null

  const draftWeeklySchedule = Array.isArray((draftOpeningHours as { weeklySchedule?: unknown[] } | null)?.weeklySchedule)
    ? ((draftOpeningHours as { weeklySchedule?: unknown[] }).weeklySchedule ?? [])
    : []
  const draftExceptions = Array.isArray((draftOpeningHours as { exceptions?: unknown[] } | null)?.exceptions)
    ? ((draftOpeningHours as { exceptions?: unknown[] }).exceptions ?? [])
    : []
  const draftTemporaryClosure =
    draftOpeningHours &&
    typeof draftOpeningHours === "object" &&
    "temporaryClosure" in draftOpeningHours &&
    typeof draftOpeningHours.temporaryClosure === "object"
      ? draftOpeningHours.temporaryClosure
      : {}

  let openingHours = await OpeningHoursModel.findOne({ restaurantId })

  if (!openingHours) {
    openingHours = await OpeningHoursModel.create({
      restaurantId,
      timezone:
        (draftOpeningHours as { timezone?: string } | null)?.timezone ?? "Asia/Dhaka",
      weeklySchedule:
        draftWeeklySchedule.length > 0 ? draftWeeklySchedule : createDefaultWeeklySchedule(),
      exceptions: draftExceptions,
      temporaryClosure: {
        isPaused:
          (draftTemporaryClosure as { isPaused?: boolean }).isPaused ?? false,
        mode:
          (draftTemporaryClosure as { mode?: string | null }).mode ?? null,
        resumeAt:
          (draftTemporaryClosure as { resumeAt?: string | null }).resumeAt
            ? new Date((draftTemporaryClosure as { resumeAt?: string }).resumeAt!)
            : null,
        reason:
          (draftTemporaryClosure as { reason?: string }).reason ?? ""
      }
    })
  } else if (!Array.isArray(openingHours.weeklySchedule) || openingHours.weeklySchedule.length === 0) {
    openingHours.timezone =
      (draftOpeningHours as { timezone?: string } | null)?.timezone ??
      openingHours.timezone ??
      "Asia/Dhaka"
    openingHours.weeklySchedule =
      draftWeeklySchedule.length > 0 ? (draftWeeklySchedule as never[]) : (createDefaultWeeklySchedule() as never[])
    openingHours.exceptions = draftExceptions as never[]
    openingHours.temporaryClosure = {
      ...(openingHours.temporaryClosure ?? {}),
      isPaused:
        (draftTemporaryClosure as { isPaused?: boolean }).isPaused ??
        (openingHours.temporaryClosure as { isPaused?: boolean } | undefined)?.isPaused ??
        false,
      mode:
        (draftTemporaryClosure as { mode?: string | null }).mode ??
        (openingHours.temporaryClosure as { mode?: string | null } | undefined)?.mode ??
        null,
      resumeAt:
        (draftTemporaryClosure as { resumeAt?: string | null }).resumeAt
          ? new Date((draftTemporaryClosure as { resumeAt?: string }).resumeAt!)
          : (openingHours.temporaryClosure as { resumeAt?: Date | null } | undefined)?.resumeAt ?? null,
      reason:
        (draftTemporaryClosure as { reason?: string }).reason ??
        (openingHours.temporaryClosure as { reason?: string } | undefined)?.reason ??
        ""
    }
    openingHours.markModified("weeklySchedule")
    openingHours.markModified("exceptions")
    openingHours.markModified("temporaryClosure")
    await openingHours.save()
  }

  return openingHours
}

export async function updateOpeningHours(params: {
  ownerId: string
  timezone?: string
  weeklySchedule?: unknown[]
  exceptions?: unknown[]
  temporaryClosure?: {
    isPaused?: boolean
    mode?: string | null
    resumeAt?: string | null
    reason?: string
  }
}) {
  const { restaurant, restaurantId } = await getOwnerBusinessContext(params.ownerId)
  const openingHours = await getOpeningHours(params.ownerId)
  let openingHoursChanged = false

  if (params.timezone !== undefined) {
    openingHours.timezone = params.timezone
    openingHoursChanged = true
  }
  if (params.weeklySchedule !== undefined) {
    openingHours.weeklySchedule = params.weeklySchedule as never[]
    openingHours.markModified("weeklySchedule")
    openingHoursChanged = true
  }
  if (params.exceptions !== undefined) {
    openingHours.exceptions = params.exceptions as never[]
    openingHours.markModified("exceptions")
    openingHoursChanged = true
  }
  if (params.temporaryClosure !== undefined) {
    openingHours.temporaryClosure = {
      ...(openingHours.temporaryClosure ?? {}),
      ...params.temporaryClosure,
      ...(params.temporaryClosure.resumeAt
        ? { resumeAt: new Date(params.temporaryClosure.resumeAt) }
        : {})
    }
    openingHours.markModified("temporaryClosure")
    openingHoursChanged = true
  }

  if (openingHoursChanged) {
    await openingHours.save()
  }

  restaurant.runtime = {
    ...(restaurant.runtime ?? {}),
    currentOperationalStatus:
      (openingHours.temporaryClosure as { isPaused?: boolean } | undefined)?.isPaused
        ? "temporarily_closed"
        : restaurant.runtime?.currentOperationalStatus ?? "closed"
  }
  await restaurant.save()

  emitSocketEvent(`restaurant:${restaurantId}`, "store.updated", {
    restaurantId,
    type: "opening_hours_updated"
  })

  return openingHours
}

export async function listReviews(ownerId: string) {
  return listReviewsWithFilters({ ownerId })
}

export async function listReviewsWithFilters(params: {
  ownerId: string
  search?: string
  rating?: string
  datePreset?: string
  from?: string
  to?: string
  commentFilter?: string
  replyFilter?: string
  sortBy?: string
  showNewOnly?: boolean
  page?: number
  pageSize?: number
}) {
  const { restaurantId } = await getOwnerBusinessContext(params.ownerId)
  const query: Record<string, unknown> = { restaurantId }
  const dateRange = getReviewDateRange(params)

  if (params.rating && params.rating !== "all") {
    query.rating = Number(params.rating)
  }

  if (dateRange) {
    query.createdAt = { $gte: dateRange.start, $lte: dateRange.end }
  }

  if (params.commentFilter === "with-comments") {
    query.comment = { $regex: "\\S", $options: "i" }
  }

  if (params.replyFilter === "replied") {
    query["ownerReply.message"] = { $regex: "\\S", $options: "i" }
  }

  if (params.showNewOnly) {
    query.status = "new"
  }

  const andFilters: Record<string, unknown>[] = []

  if (params.commentFilter === "without-comments") {
    andFilters.push({
      $or: [{ comment: { $exists: false } }, { comment: "" }]
    })
  }

  if (params.replyFilter === "not-replied") {
    andFilters.push({
      $or: [
        { "ownerReply.message": { $exists: false } },
        { "ownerReply.message": "" }
      ]
    })
  }

  if (params.search) {
    andFilters.push({
      $or: [
        { "customerSnapshot.fullName": { $regex: params.search, $options: "i" } },
        { comment: { $regex: params.search, $options: "i" } },
        { orderId: { $regex: params.search, $options: "i" } }
      ]
    })
  }

  if (andFilters.length > 0) {
    query.$and = andFilters
  }

  const sort: Record<string, SortOrder> =
    params.sortBy === "highest"
      ? { rating: -1, createdAt: -1 }
      : params.sortBy === "lowest"
        ? { rating: 1, createdAt: -1 }
        : { createdAt: -1 }
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20))
  const [items, total] = await Promise.all([
    ReviewModel.find(query).sort(sort).skip((page - 1) * pageSize).limit(pageSize),
    ReviewModel.countDocuments(query)
  ])

  return { items, total }
}

type ReviewHideReasonCategory =
  | "fake_spam"
  | "abusive_language"
  | "wrong_restaurant_or_order"
  | "unfair_misleading"
  | "other"

function reviewHideRequestDedupeKey(reviewId: string) {
  return `review:${reviewId}:owner_hide_request`
}

function labelReviewHideReason(reasonCategory: ReviewHideReasonCategory) {
  if (reasonCategory === "fake_spam") return "Fake or spam review"
  if (reasonCategory === "abusive_language") return "Abusive language"
  if (reasonCategory === "wrong_restaurant_or_order") return "Wrong restaurant or order"
  if (reasonCategory === "unfair_misleading") return "Unfair or misleading review"
  return "Other review concern"
}

export async function requestReviewHide(params: {
  ownerId: string
  reviewId: string
  reasonCategory: ReviewHideReasonCategory
  note?: string
}) {
  const { owner, restaurant, restaurantId } = await getOwnerBusinessContext(params.ownerId)
  const review = await ReviewModel.findOne({ _id: params.reviewId, restaurantId })

  if (!review) {
    throw new AppError(StatusCodes.NOT_FOUND, "REVIEW_NOT_FOUND", "Review not found")
  }

  if (review.isHidden || review.moderationStatus === "hidden") {
    throw new AppError(
      StatusCodes.CONFLICT,
      "REVIEW_ALREADY_HIDDEN",
      "This review is already hidden from customers"
    )
  }

  const now = new Date()
  const note = String(params.note ?? "").trim().slice(0, 500)
  const reason = labelReviewHideReason(params.reasonCategory)
  const historyReason = note ? `${reason}: ${note}` : reason

  review.ownerHideRequest = {
    status: "pending",
    reasonCategory: params.reasonCategory,
    note,
    requestedAt: now,
    reviewedAt: null,
    reviewedByAdminId: "",
    adminNote: ""
  }
  review.moderationHistory.push({
    action: "owner_hide_requested",
    reason: historyReason,
    adminId: "",
    createdAt: now
  })
  await review.save()

  await createAdminOperationalAlert({
    alertType: "review_hide_request",
    severity: "warning",
    title: "Owner requested review hide",
    description: `${restaurant.name || "A restaurant"} asked admin to review a ${review.rating}-star customer review.`,
    source: "owner",
    entityType: "review",
    entityId: review.id,
    path: `/reviews?hideRequest=pending&review=${review.id}`,
    iconKey: "star",
    dedupeKey: reviewHideRequestDedupeKey(review.id),
    metadata: {
      ownerId: owner.id,
      restaurantId,
      restaurantName: restaurant.name ?? "",
      rating: review.rating,
      reasonCategory: params.reasonCategory,
      note
    }
  })
  emitSocketEvent("admin:ops", "admin.review.updated", {
    reviewId: review.id,
    restaurantId,
    status: "hide_request_pending"
  })

  emitSocketEvent(`owner:${owner.id}`, "review.updated", {
    reviewId: review.id,
    restaurantId,
    status: "hide_request_pending"
  })

  return review
}

export async function replyToReview(params: {
  ownerId: string
  reviewId: string
  message: string
}) {
  const { owner, restaurantId } = await getOwnerBusinessContext(params.ownerId)
  const review = await ReviewModel.findOne({ _id: params.reviewId, restaurantId })

  if (!review) {
    throw new AppError(StatusCodes.NOT_FOUND, "REVIEW_NOT_FOUND", "Review not found")
  }

  const nextMessage = params.message.trim()

  if (!nextMessage) {
    review.ownerReply = {
      message: "",
      createdAt: null,
      updatedAt: null
    }
    await review.save()
    return review
  }

  review.ownerReply = {
    message: nextMessage,
    createdAt: review.ownerReply?.createdAt ?? new Date(),
    updatedAt: new Date()
  }

  await review.save()

  await createOwnerNotification({
    ownerId: owner.id,
    restaurantId,
    type: "review",
    eventType: "review.updated",
    entityType: "review",
    entityId: review.id,
    title: "Review reply updated",
    description: "Your reply to a customer review has been saved.",
    titleBn: "রিভিউ রিপ্লাই আপডেট হয়েছে",
    descriptionBn: "একটি কাস্টমার রিভিউতে আপনার রিপ্লাই সেভ হয়েছে।",
    actionPath: `/reviews?review=${review.id}`
  })

  if (review.customerId && review.orderId) {
    enqueueBackgroundTask("owner.review_reply.customer_push", async () => {
      await sendPushToCustomer({
        customerId: review.customerId,
        payload: {
          title: "💬 Restaurant replied",
          body: "A restaurant replied to your review.",
          data: {
            type: "review_reply",
            orderId: String(review.orderId),
            reviewId: review.id,
            path: `/orders/${String(review.orderId)}/tracking`
          }
        }
      })
    })
  }

  return review
}

export async function listSupportCases(ownerId: string) {
  return listSupportCasesWithFilters({ ownerId })
}

export async function listSupportCasesWithFilters(params: {
  ownerId: string
  search?: string
  categoryId?: string
  status?: string
  sortBy?: string
  page?: number
  pageSize?: number
}) {
  const owner = await OwnerModel.findById(params.ownerId)

  if (!owner) {
    throw new AppError(StatusCodes.NOT_FOUND, "OWNER_NOT_FOUND", "Owner not found")
  }

  const query: Record<string, unknown> = { ownerId: owner._id }

  if (params.categoryId && params.categoryId !== "all") {
    query.categoryId = params.categoryId
  }

  if (params.status && params.status !== "all") {
    query.status = params.status
  }

  if (params.search) {
    query.$or = [
      { subject: { $regex: params.search, $options: "i" } },
      { message: { $regex: params.search, $options: "i" } },
      { categoryId: { $regex: params.search, $options: "i" } }
    ]
  }

  const sort: Record<string, SortOrder> =
    params.sortBy === "oldest"
      ? { createdAt: 1 }
      : params.sortBy === "updated"
        ? { updatedAt: -1, createdAt: -1 }
        : { createdAt: -1 }
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20))
  const [items, total] = await Promise.all([
    SupportCaseModel.find(query).sort(sort).skip((page - 1) * pageSize).limit(pageSize),
    SupportCaseModel.countDocuments(query)
  ])

  return { items, total }
}

export async function createSupportCase(params: {
  ownerId: string
  kind: "report" | "question"
  subject: string
  categoryId: string
  message: string
  priority?: "low" | "medium" | "high"
  attachments?: Array<{
    url?: string
    publicId?: string
    fileName?: string
    fileType?: string
  }>
}) {
  const { owner, restaurantId } = await getOwnerBusinessContext(params.ownerId)

  const supportCase = await SupportCaseModel.create({
    source: "owner",
    ownerId: owner.id,
    restaurantId,
    requesterSnapshot: {
      fullName: owner.fullName ?? "",
      phone: owner.phone ?? "",
      email: owner.email ?? "",
      role: "owner"
    },
    kind: params.kind,
    subject: params.subject,
    categoryId: params.categoryId,
    message: params.message,
    priority: params.priority ?? "medium",
    slaDueAt: new Date(
      Date.now() +
        (params.priority === "high" ? 4 : params.priority === "low" ? 24 : 12) *
          60 *
          60 *
          1000
    ),
    history: [
      {
        action: "created",
        actorId: owner.id,
        actorName: owner.fullName ?? "Owner",
        note: params.subject,
        createdAt: new Date()
      }
    ],
    attachments:
      params.attachments?.map((attachment) => ({
        url: attachment.url ?? "",
        publicId: attachment.publicId ?? "",
        fileName: attachment.fileName ?? "",
        fileType: attachment.fileType ?? ""
      })) ?? []
  })

  await createAdminOperationalAlert({
    alertType: "support_case_created",
    severity: params.priority === "high" ? "critical" : "warning",
    title: `Owner support: ${params.subject}`,
    description: params.message.slice(0, 180),
    source: "Support",
    entityType: "support_case",
    entityId: supportCase.id,
    path: `/support?caseId=${supportCase.id}`,
    iconKey: "headphones",
    dedupeKey: `support:${supportCase.id}:created`,
    metadata: {
      supportCaseId: supportCase.id,
      source: "owner",
      priority: params.priority ?? "medium",
      restaurantId,
    },
  })

  return supportCase
}

export function createUploadSignature(params: {
  folder: string
  resourceType?: string
}) {
  const timestamp = Math.floor(Date.now() / 1000)
  const resourceType = params.resourceType ?? "image"
  // Cloudinary signs upload params like folder/timestamp. `resource_type` is part
  // of the endpoint path, so including it in the signature causes mismatches.
  const signatureBase = `folder=${params.folder}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`
  const signature = crypto.createHash("sha1").update(signatureBase).digest("hex")

  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    folder: params.folder,
    timestamp,
    signature,
    apiKey: env.CLOUDINARY_API_KEY,
    resourceType
  }
}

// Cloudinary asset helpers now live in a neutral util (avoids a business ↔ customer import cycle).
// Re-exported here so existing importers of this module keep working.
export { deleteCloudinaryAsset, replaceCloudinaryImage }
