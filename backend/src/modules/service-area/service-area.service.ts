import { StatusCodes } from "http-status-codes"

import { AppError } from "../../common/utils/app-error"
import { env } from "../../config/env"
import { RestaurantModel, RiderModel } from "../auth/auth.model"
import { AdminNotificationScheduleModel } from "../admin/notification-schedule.model"
import { BkashPaymentAttemptModel, CustomerModel } from "../customer/customer.model"
import { LedgerEntryModel } from "../owner/finance.model"
import { OrderModel } from "../owner/operational.model"
import { ServiceZoneModel } from "./service-area.model"
import type { ServiceHoursOverride } from "./service-hours"

type ServiceZoneRecord = Record<string, any>

export type ServiceAreaSnapshot = {
  districtId: string
  districtName: string
  zoneId: string
  zoneSlug: string
  zoneName: string
  center: {
    latitude: number
    longitude: number
  }
  radiusKm: number
  distanceFromCenterKm?: number | null
  delivery: Record<string, unknown>
}

const SERVICE_ZONE_CACHE_TTL_MS = 30_000
const EARTH_RADIUS_KM = 6371
const EMPTY_SERVICE_AREA_SNAPSHOT: ServiceAreaSnapshot = {
  districtId: "",
  districtName: "",
  zoneId: "",
  zoneSlug: "",
  zoneName: "",
  center: {
    latitude: 0,
    longitude: 0
  },
  radiusKm: 0,
  distanceFromCenterKm: null,
  delivery: {}
}

let activeZonesCache:
  | {
      expiresAt: number
      value?: ServiceZoneRecord[]
      promise?: Promise<ServiceZoneRecord[]>
    }
  | null = null

export function isServiceAreaModeEnabled() {
  return env.SERVICE_AREAS_ENABLED === true
}

export function invalidateServiceAreaCache() {
  activeZonesCache = null
}

function toRadians(value: number) {
  return (value * Math.PI) / 180
}

export function calculateServiceDistanceKm(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number
) {
  const deltaLat = toRadians(latitudeB - latitudeA)
  const deltaLng = toRadians(longitudeB - longitudeA)
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRadians(latitudeA)) *
      Math.cos(toRadians(latitudeB)) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Number((EARTH_RADIUS_KM * c).toFixed(3))
}

function getCoordinate(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
}

async function fetchActiveServiceZones() {
  return ServiceZoneModel.find({ status: "active" })
    .sort({ priority: -1, displayOrder: 1, name: 1 })
    .lean<ServiceZoneRecord[]>()
}

export async function listActiveServiceZones() {
  if (!isServiceAreaModeEnabled()) return []

  const now = Date.now()
  if (activeZonesCache?.value && activeZonesCache.expiresAt > now) {
    return activeZonesCache.value
  }

  if (activeZonesCache?.promise) {
    return activeZonesCache.promise
  }

  const promise = fetchActiveServiceZones()
  activeZonesCache = {
    expiresAt: now + SERVICE_ZONE_CACHE_TTL_MS,
    promise
  }

  try {
    const value = await promise
    activeZonesCache = {
      expiresAt: Date.now() + SERVICE_ZONE_CACHE_TTL_MS,
      value
    }
    return value
  } catch (error) {
    activeZonesCache = null
    throw error
  }
}

export function buildServiceAreaSnapshot(
  zone: ServiceZoneRecord,
  distanceFromCenterKm?: number | null
): ServiceAreaSnapshot {
  return {
    districtId: String(zone.districtId ?? ""),
    districtName: String(zone.districtName ?? ""),
    zoneId: String(zone._id ?? zone.id ?? ""),
    zoneSlug: String(zone.slug ?? ""),
    zoneName: String(zone.name ?? ""),
    center: {
      latitude: Number(zone.center?.latitude ?? 0),
      longitude: Number(zone.center?.longitude ?? 0)
    },
    radiusKm: Number(zone.radiusKm ?? 0),
    distanceFromCenterKm: distanceFromCenterKm ?? null,
    delivery: zone.delivery ?? {}
  }
}

export async function resolveServiceZoneForCoordinates(params: {
  latitude?: number | null
  longitude?: number | null
}) {
  if (!isServiceAreaModeEnabled()) return null

  const latitude = getCoordinate(params.latitude)
  const longitude = getCoordinate(params.longitude)
  if (latitude === null || longitude === null) {
    return null
  }

  const zones = await listActiveServiceZones()
  const matches = zones
    .map((zone) => {
      const zoneLatitude = getCoordinate(zone.center?.latitude)
      const zoneLongitude = getCoordinate(zone.center?.longitude)
      const radiusKm = getCoordinate(zone.radiusKm) ?? 0
      if (zoneLatitude === null || zoneLongitude === null || radiusKm <= 0) {
        return null
      }
      const distanceFromCenterKm = calculateServiceDistanceKm(
        latitude,
        longitude,
        zoneLatitude,
        zoneLongitude
      )
      if (distanceFromCenterKm > radiusKm) return null
      return {
        zone,
        distanceFromCenterKm,
        remainingCoverageKm: radiusKm - distanceFromCenterKm
      }
    })
    .filter(Boolean) as Array<{
    zone: ServiceZoneRecord
    distanceFromCenterKm: number
    remainingCoverageKm: number
  }>

  matches.sort((left, right) => {
    const priorityDiff = Number(right.zone.priority ?? 0) - Number(left.zone.priority ?? 0)
    if (priorityDiff !== 0) return priorityDiff
    const radiusDiff = Number(left.zone.radiusKm ?? 0) - Number(right.zone.radiusKm ?? 0)
    if (radiusDiff !== 0) return radiusDiff
    return left.distanceFromCenterKm - right.distanceFromCenterKm
  })

  const match = matches[0]
  if (!match) return null

  return {
    zone: match.zone,
    snapshot: buildServiceAreaSnapshot(match.zone, match.distanceFromCenterKm),
    distanceFromCenterKm: match.distanceFromCenterKm
  }
}

export async function assertLocationInsideServiceArea(params: {
  latitude?: number | null
  longitude?: number | null
  required?: boolean
}) {
  if (!isServiceAreaModeEnabled()) return null

  const resolved = await resolveServiceZoneForCoordinates(params)
  if (resolved) return resolved

  if (params.required === false) return null

  throw new AppError(
    StatusCodes.BAD_REQUEST,
    "SERVICE_AREA_UNAVAILABLE",
    "Foodbela is not available at this location yet. Please choose an address inside an active service area."
  )
}

export function getRestaurantServiceAreaSnapshot(
  restaurant: Record<string, any> | null | undefined
): ServiceAreaSnapshot | null {
  const serviceArea = restaurant?.serviceArea
  const zoneId = typeof serviceArea?.zoneId === "string" ? serviceArea.zoneId.trim() : ""
  if (!zoneId) return null
  return {
    districtId: String(serviceArea.districtId ?? ""),
    districtName: String(serviceArea.districtName ?? ""),
    zoneId,
    zoneSlug: String(serviceArea.zoneSlug ?? ""),
    zoneName: String(serviceArea.zoneName ?? ""),
    center: {
      latitude: Number(serviceArea.center?.latitude ?? 0),
      longitude: Number(serviceArea.center?.longitude ?? 0)
    },
    radiusKm: Number(serviceArea.radiusKm ?? 0),
    delivery: serviceArea.delivery ?? {}
  }
}

export async function resolveRestaurantServiceAreaSnapshot(
  restaurant: Record<string, any> | null | undefined
) {
  if (!isServiceAreaModeEnabled()) return null

  const latitude = getCoordinate(restaurant?.location?.latitude)
  const longitude = getCoordinate(restaurant?.location?.longitude)
  if (latitude === null || longitude === null) {
    return getRestaurantServiceAreaSnapshot(restaurant)
  }

  const resolved = await resolveServiceZoneForCoordinates({ latitude, longitude })
  return resolved?.snapshot ?? getRestaurantServiceAreaSnapshot(restaurant)
}

export function isCoordinateInsideServiceArea(params: {
  latitude?: number | null
  longitude?: number | null
  serviceArea?: ServiceAreaSnapshot | Record<string, any> | null
  toleranceKm?: number
}) {
  const latitude = getCoordinate(params.latitude)
  const longitude = getCoordinate(params.longitude)
  const centerLatitude = getCoordinate(params.serviceArea?.center?.latitude)
  const centerLongitude = getCoordinate(params.serviceArea?.center?.longitude)
  const radiusKm = getCoordinate(params.serviceArea?.radiusKm) ?? 0
  if (
    latitude === null ||
    longitude === null ||
    centerLatitude === null ||
    centerLongitude === null ||
    radiusKm <= 0
  ) {
    return false
  }

  return (
    calculateServiceDistanceKm(latitude, longitude, centerLatitude, centerLongitude) <=
    radiusKm + Math.max(0, params.toleranceKm ?? 0.025)
  )
}

function serviceAreaSnapshotsMatch(
  left?: ServiceAreaSnapshot | null,
  right?: ServiceAreaSnapshot | null
) {
  if (!left || !right) return false
  if (left.zoneId && right.zoneId && left.zoneId === right.zoneId) return true
  if (
    left.zoneSlug &&
    right.zoneSlug &&
    left.zoneSlug === right.zoneSlug &&
    (!left.districtId || !right.districtId || left.districtId === right.districtId)
  ) {
    return true
  }
  return false
}

export function assertRestaurantMatchesDeliveryServiceArea(params: {
  restaurantServiceArea?: ServiceAreaSnapshot | null
  deliveryServiceArea?: ServiceAreaSnapshot | null
  restaurantLatitude?: number | null
  restaurantLongitude?: number | null
}) {
  if (!isServiceAreaModeEnabled()) return
  if (!params.deliveryServiceArea?.zoneId) return
  if (
    serviceAreaSnapshotsMatch(
      params.restaurantServiceArea ?? null,
      params.deliveryServiceArea ?? null
    )
  ) {
    return
  }
  if (
    isCoordinateInsideServiceArea({
      latitude: params.restaurantLatitude,
      longitude: params.restaurantLongitude,
      serviceArea: params.deliveryServiceArea
    })
  ) {
    return
  }

  throw new AppError(
    StatusCodes.BAD_REQUEST,
    "RESTAURANT_OUT_OF_SERVICE_AREA",
    "This restaurant is not available for the selected service area."
  )
}

function serviceAreaSnapshotKey(serviceArea?: Record<string, any> | null) {
  if (!serviceArea) return ""
  return JSON.stringify({
    districtId: String(serviceArea.districtId ?? ""),
    districtName: String(serviceArea.districtName ?? ""),
    zoneId: String(serviceArea.zoneId ?? ""),
    zoneSlug: String(serviceArea.zoneSlug ?? ""),
    zoneName: String(serviceArea.zoneName ?? ""),
    centerLatitude: getCoordinate(serviceArea.center?.latitude),
    centerLongitude: getCoordinate(serviceArea.center?.longitude),
    radiusKm: getCoordinate(serviceArea.radiusKm),
    delivery: serviceArea.delivery ?? {}
  })
}

function buildServiceAreaSnapshotFieldSet(prefix: string, serviceArea: ServiceAreaSnapshot) {
  const field = (name: string) => `${prefix}.${name}`
  return {
    [field("districtId")]: serviceArea.districtId,
    [field("districtName")]: serviceArea.districtName,
    [field("zoneId")]: serviceArea.zoneId,
    [field("zoneSlug")]: serviceArea.zoneSlug,
    [field("zoneName")]: serviceArea.zoneName,
    [field("center")]: serviceArea.center,
    [field("radiusKm")]: serviceArea.radiusKm,
    [field("delivery")]: serviceArea.delivery
  }
}

function serviceAreaSnapshotFromZoneRecord(zone: Record<string, any>) {
  return buildServiceAreaSnapshot(zone)
}

export async function reassignServiceZoneReferences(params: {
  fromZone: Record<string, any> | null | undefined
  toZone: Record<string, any> | ServiceAreaSnapshot | null | undefined
}) {
  if (!isServiceAreaModeEnabled()) {
    return {
      restaurants: 0,
      orders: 0,
      ledgerEntries: 0,
      customerServiceAreas: 0,
      savedLocations: 0,
      customerNotifications: 0,
      paymentAttempts: 0,
      riders: 0,
      schedules: 0
    }
  }

  const fromZoneId = String(params.fromZone?._id ?? params.fromZone?.id ?? params.fromZone?.zoneId ?? "").trim()
  if (!fromZoneId) {
    return {
      restaurants: 0,
      orders: 0,
      ledgerEntries: 0,
      savedLocations: 0,
      customerNotifications: 0,
      paymentAttempts: 0,
      riders: 0,
      schedules: 0
    }
  }

  const toServiceArea =
    params.toZone && "zoneId" in params.toZone
      ? (params.toZone as ServiceAreaSnapshot)
      : serviceAreaSnapshotFromZoneRecord(params.toZone as Record<string, any>)
  const fromZoneName = String(params.fromZone?.name ?? params.fromZone?.zoneName ?? "").trim()

  const [
    restaurants,
    orders,
    ledgerEntries,
    customerServiceAreas,
    savedLocations,
    customerNotifications,
    paymentAttempts,
    primaryRiders,
    assignedRiderPull,
    assignedRiderAdd,
    schedules
  ] = await Promise.all([
    RestaurantModel.updateMany(
      { "serviceArea.zoneId": fromZoneId },
      { $set: { serviceArea: toServiceArea } }
    ),
    OrderModel.updateMany(
      { "serviceAreaSnapshot.zoneId": fromZoneId },
      { $set: buildServiceAreaSnapshotFieldSet("serviceAreaSnapshot", toServiceArea) }
    ),
    LedgerEntryModel.updateMany(
      { "serviceAreaSnapshot.zoneId": fromZoneId },
      { $set: buildServiceAreaSnapshotFieldSet("serviceAreaSnapshot", toServiceArea) }
    ),
    CustomerModel.updateMany(
      { "serviceArea.zoneId": fromZoneId },
      { $set: buildServiceAreaSnapshotFieldSet("serviceArea", toServiceArea) }
    ),
    CustomerModel.updateMany(
      { "savedLocations.serviceArea.zoneId": fromZoneId },
      { $set: buildServiceAreaSnapshotFieldSet("savedLocations.$[location].serviceArea", toServiceArea) },
      { arrayFilters: [{ "location.serviceArea.zoneId": fromZoneId }] }
    ),
    CustomerModel.updateMany(
      { "notifications.zoneId": fromZoneId },
      {
        $set: {
          "notifications.$[notification].zoneId": toServiceArea.zoneId,
          "notifications.$[notification].districtId": toServiceArea.districtId
        }
      },
      { arrayFilters: [{ "notification.zoneId": fromZoneId }] }
    ),
    BkashPaymentAttemptModel.updateMany(
      { "checkoutSnapshot.serviceArea.zoneId": fromZoneId },
      { $set: buildServiceAreaSnapshotFieldSet("checkoutSnapshot.serviceArea", toServiceArea) }
    ),
    RiderModel.updateMany(
      { "serviceArea.primaryZoneId": fromZoneId },
      {
        $set: {
          "serviceArea.primaryZoneId": toServiceArea.zoneId,
          "serviceArea.primaryZoneName": toServiceArea.zoneName
        }
      }
    ),
    RiderModel.updateMany(
      { "serviceArea.assignedZoneIds": fromZoneId },
      {
        $pull: {
          "serviceArea.assignedZoneIds": fromZoneId,
          ...(fromZoneName ? { "serviceArea.assignedZoneNames": fromZoneName } : {})
        }
      }
    ),
    RiderModel.updateMany(
      { "serviceArea.primaryZoneId": toServiceArea.zoneId },
      {
        $addToSet: {
          "serviceArea.assignedZoneIds": toServiceArea.zoneId,
          "serviceArea.assignedZoneNames": toServiceArea.zoneName,
          "serviceArea.districtIds": toServiceArea.districtId,
          "serviceArea.districtNames": toServiceArea.districtName
        }
      }
    ),
    AdminNotificationScheduleModel.updateMany(
      { zoneId: fromZoneId },
      {
        $set: {
          zoneId: toServiceArea.zoneId,
          districtId: toServiceArea.districtId
        }
      }
    )
  ])

  return {
    restaurants: restaurants.modifiedCount ?? 0,
    orders: orders.modifiedCount ?? 0,
    ledgerEntries: ledgerEntries.modifiedCount ?? 0,
    customerServiceAreas: customerServiceAreas.modifiedCount ?? 0,
    savedLocations: savedLocations.modifiedCount ?? 0,
    customerNotifications: customerNotifications.modifiedCount ?? 0,
    paymentAttempts: paymentAttempts.modifiedCount ?? 0,
    riders:
      (primaryRiders.modifiedCount ?? 0) +
      (assignedRiderPull.modifiedCount ?? 0) +
      (assignedRiderAdd.modifiedCount ?? 0),
    schedules: schedules.modifiedCount ?? 0
  }
}

export async function refreshRestaurantServiceAreaSnapshots() {
  if (!isServiceAreaModeEnabled()) {
    return { scanned: 0, updated: 0 }
  }

  const restaurants = await RestaurantModel.find({
    "location.latitude": { $type: "number" },
    "location.longitude": { $type: "number" }
  })
    .select({ _id: 1, location: 1, serviceArea: 1 })
    .lean<ServiceZoneRecord[]>()

  const operations = []
  for (const restaurant of restaurants) {
    const latitude = getCoordinate(restaurant.location?.latitude)
    const longitude = getCoordinate(restaurant.location?.longitude)
    if (latitude === null || longitude === null) continue

    const resolved = await resolveServiceZoneForCoordinates({ latitude, longitude })
    const nextServiceArea = resolved?.snapshot ?? EMPTY_SERVICE_AREA_SNAPSHOT
    if (serviceAreaSnapshotKey(restaurant.serviceArea) === serviceAreaSnapshotKey(nextServiceArea)) {
      continue
    }

    operations.push({
      updateOne: {
        filter: { _id: restaurant._id },
        update: { $set: { serviceArea: nextServiceArea } }
      }
    })
  }

  if (operations.length) {
    await RestaurantModel.bulkWrite(operations, { ordered: false })
  }

  return { scanned: restaurants.length, updated: operations.length }
}

export function applyServiceAreaDeliveryPricing<
  T extends {
    baseFeeTaka: number
    distanceSurchargeEnabled: boolean
    surchargeStartsAfterKm: number
    surchargeStepMeters: number
    surchargeAmountTaka: number
  }
>(pricing: T, serviceArea?: ServiceAreaSnapshot | null): T {
  if (!isServiceAreaModeEnabled() || !serviceArea?.delivery) return pricing
  const delivery = serviceArea.delivery as Record<string, unknown>
  return {
    ...pricing,
    baseFeeTaka:
      typeof delivery.baseFeeTaka === "number" ? delivery.baseFeeTaka : pricing.baseFeeTaka,
    distanceSurchargeEnabled:
      typeof delivery.distanceSurchargeEnabled === "boolean"
        ? delivery.distanceSurchargeEnabled
        : pricing.distanceSurchargeEnabled,
    surchargeStartsAfterKm:
      typeof delivery.surchargeStartsAfterKm === "number"
        ? delivery.surchargeStartsAfterKm
        : pricing.surchargeStartsAfterKm,
    surchargeStepMeters:
      typeof delivery.surchargeStepMeters === "number"
        ? delivery.surchargeStepMeters
        : pricing.surchargeStepMeters,
    surchargeAmountTaka:
      typeof delivery.surchargeAmountTaka === "number"
        ? delivery.surchargeAmountTaka
        : pricing.surchargeAmountTaka
  }
}

export function getServiceAreaRestaurantDistanceKm(
  serviceArea?: ServiceAreaSnapshot | Record<string, any> | null,
  fallbackKm = 0
) {
  if (!isServiceAreaModeEnabled()) {
    return Math.max(0, fallbackKm)
  }

  const configuredDistanceKm = getCoordinate(
    serviceArea?.delivery?.maxRestaurantDistanceKm
  )
  if (configuredDistanceKm !== null && configuredDistanceKm > 0) {
    return configuredDistanceKm
  }

  const zoneRadiusKm = getCoordinate(serviceArea?.radiusKm)
  if (zoneRadiusKm !== null && zoneRadiusKm > 0) {
    return zoneRadiusKm
  }

  return Math.max(0, fallbackKm)
}

export function getRiderAssignedZoneIds(rider: Record<string, any> | null | undefined) {
  const assignedZoneIds = normalizeStringArray(rider?.serviceArea?.assignedZoneIds)
  const primaryZoneId =
    typeof rider?.serviceArea?.primaryZoneId === "string"
      ? rider.serviceArea.primaryZoneId.trim()
      : ""
  return [...new Set([primaryZoneId, ...assignedZoneIds].filter(Boolean))]
}

export function isRiderAllowedForServiceArea(params: {
  rider: Record<string, any> | null | undefined
  serviceAreaSnapshot?: Record<string, any> | null
}) {
  if (!isServiceAreaModeEnabled()) return true

  const orderZoneId =
    typeof params.serviceAreaSnapshot?.zoneId === "string"
      ? params.serviceAreaSnapshot.zoneId.trim()
      : ""
  if (!orderZoneId) return true

  const assignedZoneIds = getRiderAssignedZoneIds(params.rider)
  if (!assignedZoneIds.length) return false
  return assignedZoneIds.includes(orderZoneId)
}

export function assertRiderAllowedForServiceArea(params: {
  rider: Record<string, any> | null | undefined
  serviceAreaSnapshot?: Record<string, any> | null
}) {
  if (isRiderAllowedForServiceArea(params)) return

  throw new AppError(
    StatusCodes.BAD_REQUEST,
    "RIDER_OUTSIDE_SERVICE_AREA",
    "This rider is not assigned to the order service area."
  )
}

export function buildServiceAreaOrderFilterForRider(
  rider: Record<string, any> | null | undefined
) {
  if (!isServiceAreaModeEnabled()) return {}
  const assignedZoneIds = getRiderAssignedZoneIds(rider)
  if (!assignedZoneIds.length) {
    return { "serviceAreaSnapshot.zoneId": { $in: [] } }
  }
  return { "serviceAreaSnapshot.zoneId": { $in: assignedZoneIds } }
}

function normalizeScopeId(value?: string | null) {
  const normalized = typeof value === "string" ? value.trim() : ""
  return normalized && normalized !== "all" ? normalized : ""
}

export function buildOrderServiceAreaScopeFilter(params?: {
  zoneId?: string | null
  districtId?: string | null
}) {
  if (!isServiceAreaModeEnabled()) return {}
  const zoneId = normalizeScopeId(params?.zoneId)
  const districtId = normalizeScopeId(params?.districtId)
  const filters: Record<string, unknown>[] = []
  if (zoneId) filters.push({ "serviceAreaSnapshot.zoneId": zoneId })
  if (districtId) filters.push({ "serviceAreaSnapshot.districtId": districtId })
  if (filters.length > 1) return { $and: filters }
  if (filters.length === 1) return filters[0]
  return {}
}

export function buildRestaurantServiceAreaScopeFilter(params?: {
  zoneId?: string | null
  districtId?: string | null
}) {
  if (!isServiceAreaModeEnabled()) return {}
  const zoneId = normalizeScopeId(params?.zoneId)
  const districtId = normalizeScopeId(params?.districtId)
  const filters: Record<string, unknown>[] = []
  if (zoneId) filters.push({ "serviceArea.zoneId": zoneId })
  if (districtId) filters.push({ "serviceArea.districtId": districtId })
  if (filters.length > 1) return { $and: filters }
  if (filters.length === 1) return filters[0]
  return {}
}

export function buildCustomerServiceAreaScopeFilter(params?: {
  zoneId?: string | null
  districtId?: string | null
}) {
  if (!isServiceAreaModeEnabled()) return {}
  const zoneId = normalizeScopeId(params?.zoneId)
  const districtId = normalizeScopeId(params?.districtId)
  const filters: Record<string, unknown>[] = []
  if (zoneId) {
    filters.push({
      $or: [
        { "serviceArea.zoneId": zoneId },
        { "savedLocations.serviceArea.zoneId": zoneId },
      ],
    })
  }
  if (districtId) {
    filters.push({
      $or: [
        { "serviceArea.districtId": districtId },
        { "savedLocations.serviceArea.districtId": districtId },
      ],
    })
  }
  if (filters.length > 1) return { $and: filters }
  if (filters.length === 1) return filters[0]
  return {}
}

export function buildRiderServiceAreaScopeFilter(params?: {
  zoneId?: string | null
  districtId?: string | null
}) {
  if (!isServiceAreaModeEnabled()) return {}
  const zoneId = normalizeScopeId(params?.zoneId)
  const districtId = normalizeScopeId(params?.districtId)
  const filters: Record<string, unknown>[] = []
  if (zoneId) filters.push({ "serviceArea.assignedZoneIds": zoneId })
  if (districtId) filters.push({ "serviceArea.districtIds": districtId })
  if (filters.length > 1) return { $and: filters }
  if (filters.length === 1) return filters[0]
  return {}
}

export function serviceAreaSnapshotMatchesScope(
  serviceArea: Record<string, any> | null | undefined,
  params?: { zoneId?: string | null; districtId?: string | null },
) {
  if (!isServiceAreaModeEnabled()) return true
  const zoneId = normalizeScopeId(params?.zoneId)
  const districtId = normalizeScopeId(params?.districtId)
  if (!zoneId && !districtId) return true
  if (zoneId && String(serviceArea?.zoneId ?? "").trim() !== zoneId) return false
  if (districtId && String(serviceArea?.districtId ?? "").trim() !== districtId) return false
  return true
}

export function assertServiceAreaSnapshotMatchesScope(
  serviceArea: Record<string, any> | null | undefined,
  params?: {
    zoneId?: string | null
    districtId?: string | null
    code?: string
    message?: string
  },
) {
  if (serviceAreaSnapshotMatchesScope(serviceArea, params)) return
  throw new AppError(
    StatusCodes.NOT_FOUND,
    params?.code ?? "RESOURCE_NOT_FOUND",
    params?.message ?? "Resource not found"
  )
}

export async function getServiceAreaDispatchOverrides(
  serviceAreaSnapshot?: Record<string, any> | null
) {
  if (!isServiceAreaModeEnabled()) return null
  const zoneId = normalizeScopeId(serviceAreaSnapshot?.zoneId)
  if (!zoneId) return null
  const zone = await ServiceZoneModel.findById(zoneId)
    .select({ dispatch: 1 })
    .lean<ServiceZoneRecord | null>()
  return zone?.dispatch ?? null
}

/**
 * Per-zone service-hours override (null = inherit platform default). Read from the
 * cached active-zone list, so listing paths can resolve N restaurants without N
 * queries. Returns null when zone mode is off or the zone has no override.
 */
export async function getServiceHoursOverrideForZone(
  zoneId?: string | null
): Promise<ServiceHoursOverride | null> {
  if (!isServiceAreaModeEnabled()) return null
  const id = normalizeScopeId(zoneId)
  if (!id) return null
  const zones = await listActiveServiceZones()
  const zone = zones.find((candidate) => String(candidate._id ?? "") === id)
  return (zone?.serviceHours as ServiceHoursOverride | undefined) ?? null
}

/** zoneId → serviceHours override map (cached zones) for batch listing evaluation. */
export async function buildZoneServiceHoursMap(): Promise<
  Map<string, ServiceHoursOverride>
> {
  const map = new Map<string, ServiceHoursOverride>()
  if (!isServiceAreaModeEnabled()) return map
  const zones = await listActiveServiceZones()
  for (const zone of zones) {
    const id = String(zone._id ?? "")
    if (id && zone.serviceHours) {
      map.set(id, zone.serviceHours as ServiceHoursOverride)
    }
  }
  return map
}
