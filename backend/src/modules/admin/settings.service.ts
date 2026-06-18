import { createInMemoryAsyncCache } from "../../common/utils/in-memory-cache"
import {
  getAdminEditablePlatformContent,
  getPlatformContent,
  updatePlatformContent,
} from "../public/content.service"
import { platformContent } from "../public/content"
import {
  ServiceDistrictModel,
  ServiceZoneModel,
} from "../service-area/service-area.model"
import { invalidateServiceAreaCache } from "../service-area/service-area.service"
import {
  invalidateAdminDispatchSettingsCache,
  invalidateAdminMonitoringCaches,
} from "./orders-monitor.service"

type PlatformContent = Awaited<ReturnType<typeof getPlatformContent>>
type AdminEditablePlatformContent = Awaited<ReturnType<typeof getAdminEditablePlatformContent>>

export type AdminPlatformSettings = Pick<
  PlatformContent,
  "branding" | "operations" | "auth" | "supportContact" | "helpCenter" | "legal"
>

export type AdminPlatformSettingsResponse = {
  settings: AdminPlatformSettings
  scope: {
    type: "all" | "district" | "zone"
    id: string
    label: string
    zoneCount: number
    zoneIds: string[]
    districtId: string
    districtName: string
    settingsMode: "global" | "district_zones" | "single_zone"
  }
  meta: {
    updatedAt: string | null
    updatedByAdminId: string | null
    updatedByAdminName: string
  }
  history: Array<{
    updatedAt: string | null
    updatedByAdminId: string | null
    updatedByAdminName: string
    changedSections: string[]
  }>
}

const SETTINGS_CACHE_KEY = "admin-platform-settings"
const adminPlatformSettingsCache = createInMemoryAsyncCache<AdminPlatformSettingsResponse>({
  ttlMs: 15_000,
  staleWhileRevalidateMs: 45_000,
  maxEntries: 32,
})

export function invalidateAdminPlatformSettingsCache() {
  adminPlatformSettingsCache.clear()
}

type AdminSettingsScopeParams = {
  zoneId?: string | null
  districtId?: string | null
}

type ResolvedSettingsScope = AdminPlatformSettingsResponse["scope"] & {
  templateZone: Record<string, any> | null
  zones: Record<string, any>[]
}

function normalizeScopeId(value?: string | null) {
  const normalized = typeof value === "string" ? value.trim() : ""
  return normalized && normalized !== "all" ? normalized : ""
}

function cloneSettings<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function boolValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback
}

function average(values: number[]) {
  if (!values.length) return null
  return values.reduce((total, value) => total + value, 0) / values.length
}

async function resolveSettingsScope(
  params: AdminSettingsScopeParams = {},
): Promise<ResolvedSettingsScope> {
  const zoneId = normalizeScopeId(params.zoneId)
  const districtId = normalizeScopeId(params.districtId)

  if (zoneId) {
    const zone = await ServiceZoneModel.findById(zoneId).lean()
    if (!zone || zone.status === "archived") {
      return {
        type: "all",
        id: "",
        label: "All areas",
        zoneCount: 0,
        zoneIds: [],
        districtId: "",
        districtName: "",
        settingsMode: "global",
        templateZone: null,
        zones: [],
      }
    }
    return {
      type: "zone",
      id: String(zone._id ?? ""),
      label: `${zone.districtName ?? "Area"} / ${zone.name ?? "Zone"}`,
      zoneCount: 1,
      zoneIds: [String(zone._id ?? "")],
      districtId: String(zone.districtId ?? ""),
      districtName: String(zone.districtName ?? ""),
      settingsMode: "single_zone",
      templateZone: zone,
      zones: [zone],
    }
  }

  if (districtId) {
    const [district, zones] = await Promise.all([
      ServiceDistrictModel.findById(districtId).lean(),
      ServiceZoneModel.find({
        districtId,
        status: { $ne: "archived" },
      })
        .sort({ priority: -1, displayOrder: 1, name: 1 })
        .lean(),
    ])
    if (!district || district.status === "archived") {
      return {
        type: "all",
        id: "",
        label: "All areas",
        zoneCount: 0,
        zoneIds: [],
        districtId: "",
        districtName: "",
        settingsMode: "global",
        templateZone: null,
        zones: [],
      }
    }
    return {
      type: "district",
      id: String(district._id ?? ""),
      label: `${district.name ?? "District"} (${zones.length} zones)`,
      zoneCount: zones.length,
      zoneIds: zones.map((zone) => String(zone._id ?? "")),
      districtId: String(district._id ?? ""),
      districtName: String(district.name ?? ""),
      settingsMode: "district_zones",
      templateZone: zones[0] ?? null,
      zones,
    }
  }

  const zones = await ServiceZoneModel.find({ status: { $ne: "archived" } })
    .sort({ priority: -1, displayOrder: 1, name: 1 })
    .lean()

  return {
    type: "all",
    id: "",
    label: zones.length ? `All service areas (${zones.length} zones)` : "All service areas",
    zoneCount: zones.length,
    zoneIds: zones.map((zone) => String(zone._id ?? "")),
    districtId: "",
    districtName: "",
    settingsMode: "global",
    templateZone: null,
    zones,
  }
}

function pickAdminPlatformSettings(content: AdminPlatformSettings): AdminPlatformSettings {
  return {
    branding: content.branding,
    operations: content.operations,
    auth: content.auth,
    supportContact: content.supportContact,
    helpCenter: content.helpCenter,
    legal: content.legal,
  }
}

function applyZoneDeliveryPricing(
  settings: AdminPlatformSettings,
  zone: Record<string, any>,
) {
  const delivery = zone.delivery ?? {}
  settings.operations.deliveryPricing = {
    ...settings.operations.deliveryPricing,
    baseFeeTaka: numberValue(
      delivery.baseFeeTaka,
      settings.operations.deliveryPricing.baseFeeTaka,
    ),
    distanceSurchargeEnabled: boolValue(
      delivery.distanceSurchargeEnabled,
      settings.operations.deliveryPricing.distanceSurchargeEnabled,
    ),
    surchargeStartsAfterKm: numberValue(
      delivery.surchargeStartsAfterKm,
      settings.operations.deliveryPricing.surchargeStartsAfterKm,
    ),
    surchargeStepMeters: numberValue(
      delivery.surchargeStepMeters,
      settings.operations.deliveryPricing.surchargeStepMeters,
    ),
    surchargeAmountTaka: numberValue(
      delivery.surchargeAmountTaka,
      settings.operations.deliveryPricing.surchargeAmountTaka,
    ),
  }
}

function applyZoneDispatchSettings(
  settings: AdminPlatformSettings,
  zone: Record<string, any>,
) {
  const dispatch = zone.dispatch ?? {}
  const current = settings.operations.dispatch
  settings.operations.dispatch = {
    ...current,
    autoAssignmentEnabled: boolValue(
      dispatch.autoAssignEnabled,
      current.autoAssignmentEnabled,
    ),
    autoReassignTimedOutOrders: boolValue(
      dispatch.autoReassignTimedOutOrders,
      current.autoReassignTimedOutOrders,
    ),
    dispatchMode:
      dispatch.dispatchMode === "primary_rider" || dispatch.dispatchMode === "fleet"
        ? dispatch.dispatchMode
        : current.dispatchMode,
    primaryRiderId:
      typeof dispatch.primaryRiderId === "string"
        ? dispatch.primaryRiderId
        : current.primaryRiderId,
    primaryRiderFallbackEnabled: boolValue(
      dispatch.primaryRiderFallbackEnabled,
      current.primaryRiderFallbackEnabled,
    ),
    algorithm:
      dispatch.algorithm === "least_loaded_first" ||
      dispatch.algorithm === "nearest_eligible_balanced"
        ? dispatch.algorithm
        : current.algorithm,
    ownerAcceptanceTimeoutMinutes: numberValue(
      dispatch.ownerAcceptanceTimeoutMinutes,
      current.ownerAcceptanceTimeoutMinutes,
    ),
    maxActiveOrdersPerRider: numberValue(
      dispatch.maxActiveOrdersPerRiderOverride,
      current.maxActiveOrdersPerRider,
    ),
    staleLocationCutoffMinutes: numberValue(
      dispatch.staleLocationCutoffMinutes,
      current.staleLocationCutoffMinutes,
    ),
    assignmentTimeoutMinutes: numberValue(
      dispatch.assignmentTimeoutMinutes,
      current.assignmentTimeoutMinutes,
    ),
    prepStartGraceMinutes: numberValue(
      dispatch.prepStartGraceMinutes,
      current.prepStartGraceMinutes,
    ),
    preparationMaxExtraMinutes: numberValue(
      dispatch.preparationMaxExtraMinutes,
      current.preparationMaxExtraMinutes,
    ),
    prepLateGraceMinutes: numberValue(
      dispatch.prepLateGraceMinutes,
      current.prepLateGraceMinutes,
    ),
    pickupLateGraceMinutes: numberValue(
      dispatch.pickupLateGraceMinutes,
      current.pickupLateGraceMinutes,
    ),
    deliveryLateGraceMinutes: numberValue(
      dispatch.deliveryLateGraceMinutes,
      current.deliveryLateGraceMinutes,
    ),
    deliveryWatchAfterPickupMinutes: numberValue(
      dispatch.deliveryWatchAfterPickupMinutes,
      current.deliveryWatchAfterPickupMinutes,
    ),
    deliveryLateAfterPickupMinutes: numberValue(
      dispatch.deliveryLateAfterPickupMinutes,
      current.deliveryLateAfterPickupMinutes,
    ),
    deliveryCriticalAfterPickupMinutes: numberValue(
      dispatch.deliveryCriticalAfterPickupMinutes,
      current.deliveryCriticalAfterPickupMinutes,
    ),
    retryCooldownMinutes: numberValue(
      dispatch.retryCooldownMinutes,
      current.retryCooldownMinutes,
    ),
    surgeReadyOrderThreshold: numberValue(
      dispatch.surgeReadyOrderThreshold,
      current.surgeReadyOrderThreshold,
    ),
    surgeUnassignedOrderThreshold: numberValue(
      dispatch.surgeUnassignedOrderThreshold,
      current.surgeUnassignedOrderThreshold,
    ),
    autoCancelUnacceptedOrdersEnabled: boolValue(
      dispatch.autoCancelUnacceptedOrdersEnabled,
      current.autoCancelUnacceptedOrdersEnabled,
    ),
    autoCancelAfterMinutes: numberValue(
      dispatch.autoCancelAfterMinutes,
      current.autoCancelAfterMinutes,
    ),
    autoCancelNotifyBeforeMinutes: numberValue(
      dispatch.autoCancelNotifyBeforeMinutes,
      current.autoCancelNotifyBeforeMinutes,
    ),
  }
}

function applySettingsScope(
  baseSettings: AdminPlatformSettings,
  scope: ResolvedSettingsScope,
) {
  const settings = cloneSettings(baseSettings)
  if (scope.type === "all") {
    const latitudes = scope.zones
      .map((zone) => numberValue(zone.center?.latitude, Number.NaN))
      .filter((value) => Number.isFinite(value))
    const longitudes = scope.zones
      .map((zone) => numberValue(zone.center?.longitude, Number.NaN))
      .filter((value) => Number.isFinite(value))
    const radii = scope.zones
      .map((zone) => numberValue(zone.radiusKm, Number.NaN))
      .filter((value) => Number.isFinite(value))
    settings.operations.serviceArea = {
      ...settings.operations.serviceArea,
      name: scope.label,
      centerLatitude:
        average(latitudes) ?? settings.operations.serviceArea.centerLatitude,
      centerLongitude:
        average(longitudes) ?? settings.operations.serviceArea.centerLongitude,
      radiusKm:
        radii.length > 0
          ? Math.max(...radii)
          : settings.operations.serviceArea.radiusKm,
    }
    return settings
  }

  const zone = scope.templateZone
  if (!zone) return settings

  settings.operations.serviceArea = {
    ...settings.operations.serviceArea,
    name:
      scope.type === "district"
        ? scope.label
        : `${zone.districtName ?? "Area"} / ${zone.name ?? "Zone"}`,
    centerLatitude: numberValue(
      zone.center?.latitude,
      settings.operations.serviceArea.centerLatitude,
    ),
    centerLongitude: numberValue(
      zone.center?.longitude,
      settings.operations.serviceArea.centerLongitude,
    ),
    radiusKm: numberValue(zone.radiusKm, settings.operations.serviceArea.radiusKm),
  }
  applyZoneDeliveryPricing(settings, zone)
  applyZoneDispatchSettings(settings, zone)
  return settings
}

function buildServiceZoneUpdateFromSettings(settings: AdminPlatformSettings) {
  const dispatch = settings.operations.dispatch
  const deliveryPricing = settings.operations.deliveryPricing
  return {
    delivery: {
      baseFeeTaka: deliveryPricing.baseFeeTaka,
      distanceSurchargeEnabled: deliveryPricing.distanceSurchargeEnabled,
      surchargeStartsAfterKm: deliveryPricing.surchargeStartsAfterKm,
      surchargeStepMeters: deliveryPricing.surchargeStepMeters,
      surchargeAmountTaka: deliveryPricing.surchargeAmountTaka,
    },
    dispatch: {
      autoAssignEnabled: dispatch.autoAssignmentEnabled,
      autoReassignTimedOutOrders: dispatch.autoReassignTimedOutOrders,
      dispatchMode: dispatch.dispatchMode,
      primaryRiderId: dispatch.primaryRiderId,
      primaryRiderFallbackEnabled: dispatch.primaryRiderFallbackEnabled,
      algorithm: dispatch.algorithm,
      maxActiveOrdersPerRiderOverride: dispatch.maxActiveOrdersPerRider,
      staleLocationCutoffMinutes: dispatch.staleLocationCutoffMinutes,
      assignmentTimeoutMinutes: dispatch.assignmentTimeoutMinutes,
      ownerAcceptanceTimeoutMinutes: dispatch.ownerAcceptanceTimeoutMinutes,
      prepStartGraceMinutes: dispatch.prepStartGraceMinutes,
      preparationMaxExtraMinutes: dispatch.preparationMaxExtraMinutes,
      prepLateGraceMinutes: dispatch.prepLateGraceMinutes,
      pickupLateGraceMinutes: dispatch.pickupLateGraceMinutes,
      deliveryLateGraceMinutes: dispatch.deliveryLateGraceMinutes,
      deliveryWatchAfterPickupMinutes: dispatch.deliveryWatchAfterPickupMinutes,
      deliveryLateAfterPickupMinutes: dispatch.deliveryLateAfterPickupMinutes,
      deliveryCriticalAfterPickupMinutes: dispatch.deliveryCriticalAfterPickupMinutes,
      retryCooldownMinutes: dispatch.retryCooldownMinutes,
      surgeReadyOrderThreshold: dispatch.surgeReadyOrderThreshold,
      surgeUnassignedOrderThreshold: dispatch.surgeUnassignedOrderThreshold,
      autoCancelUnacceptedOrdersEnabled: dispatch.autoCancelUnacceptedOrdersEnabled,
      autoCancelAfterMinutes: dispatch.autoCancelAfterMinutes,
      autoCancelNotifyBeforeMinutes: dispatch.autoCancelNotifyBeforeMinutes,
    },
  }
}

function mapSettingsResponse(
  editor: AdminEditablePlatformContent,
  settings: AdminPlatformSettings,
  scope: ResolvedSettingsScope,
): AdminPlatformSettingsResponse {
  return {
    settings,
    scope: {
      type: scope.type,
      id: scope.id,
      label: scope.label,
      zoneCount: scope.zoneCount,
      zoneIds: scope.zoneIds,
      districtId: scope.districtId,
      districtName: scope.districtName,
      settingsMode: scope.settingsMode,
    },
    meta: editor.meta,
    history: editor.history,
  }
}

export async function getAdminPlatformSettings(
  params: AdminSettingsScopeParams = {},
) {
  const scope = await resolveSettingsScope(params)
  const cacheKey = `${SETTINGS_CACHE_KEY}:${scope.type}:${scope.id || "all"}`
  return adminPlatformSettingsCache.getOrSet(cacheKey, async () => {
    const editor = await getAdminEditablePlatformContent()
    const content = editor.content ?? platformContent
    const settings = applySettingsScope(pickAdminPlatformSettings({
      branding: content.branding ?? platformContent.branding,
      operations: content.operations ?? platformContent.operations,
      auth: content.auth ?? platformContent.auth,
      supportContact: content.supportContact ?? platformContent.supportContact,
      helpCenter: content.helpCenter ?? platformContent.helpCenter,
      legal: content.legal ?? platformContent.legal,
    }), scope)

    return mapSettingsResponse(editor, settings, scope)
  })
}

export async function updateAdminPlatformSettings(params: {
  adminId: string
  settings: AdminPlatformSettings
  zoneId?: string | null
  districtId?: string | null
}) {
  adminPlatformSettingsCache.clear()
  const scope = await resolveSettingsScope(params)

  const currentContent = await getPlatformContent()
  const nextOperations =
    scope.settingsMode === "global"
      ? params.settings.operations
      : {
          ...currentContent.operations,
          ownerApp: params.settings.operations.ownerApp,
          routing: params.settings.operations.routing,
          mapStyles: params.settings.operations.mapStyles,
          liveTracking: params.settings.operations.liveTracking,
          payments: params.settings.operations.payments,
          finance: params.settings.operations.finance,
          adminNotifications: params.settings.operations.adminNotifications,
          referrals: params.settings.operations.referrals,
        }
  const nextContent: PlatformContent = {
    ...currentContent,
    branding: params.settings.branding,
    operations: nextOperations,
    auth: params.settings.auth,
    supportContact: params.settings.supportContact,
    helpCenter: params.settings.helpCenter,
    legal: params.settings.legal,
  }

  if (scope.zoneIds.length) {
    const zoneUpdate = buildServiceZoneUpdateFromSettings(params.settings)
    await ServiceZoneModel.updateMany(
      { _id: { $in: scope.zoneIds }, status: { $ne: "archived" } },
      {
        $set: {
          "delivery.baseFeeTaka": zoneUpdate.delivery.baseFeeTaka,
          "delivery.distanceSurchargeEnabled":
            zoneUpdate.delivery.distanceSurchargeEnabled,
          "delivery.surchargeStartsAfterKm":
            zoneUpdate.delivery.surchargeStartsAfterKm,
          "delivery.surchargeStepMeters": zoneUpdate.delivery.surchargeStepMeters,
          "delivery.surchargeAmountTaka": zoneUpdate.delivery.surchargeAmountTaka,
          dispatch: zoneUpdate.dispatch,
        },
      },
    )
    invalidateServiceAreaCache()
    invalidateAdminDispatchSettingsCache()
    invalidateAdminMonitoringCaches()
  }

  await updatePlatformContent({
    content: nextContent,
    adminId: params.adminId,
  })

  adminPlatformSettingsCache.clear()
  return getAdminPlatformSettings(params)
}
