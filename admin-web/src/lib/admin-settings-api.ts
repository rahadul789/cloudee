import { adminRequest } from "./api"
import type { PlatformContent } from "./admin-api"
import { getAdminZoneScopeQueryParams } from "./admin-zone-scope"

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
    updatedAt: string
    updatedByAdminId: string | null
    updatedByAdminName: string
    changedSections: string[]
  }>
}

type RoutingUsageBucket = {
  totalEvents: number
  used: number
  success: number
  failed: number
  nonOk: number
  blocked: number
}

export type AdminRoutingUsageAnalytics = {
  settings: {
    provider: "google" | "haversine"
    costMode: "economy" | "balanced" | "precision"
    googleMonthlyLimit: number
    maxGoogleCallsPerOrder: number
    routeSessionTtlMinutes: number
    rerouteCooldownSeconds: number
    offRouteThresholdMeters: number
    offRouteConsecutiveUpdates: number
    periodicRefreshMinutes: number
    nearDestinationMeters: number
  }
  month: {
    key: string
    limit: number
    used: number
    remaining: number
    resetAt: string
  }
  range: RoutingUsageBucket & {
    from: string
    to: string
  }
  byDate: Array<RoutingUsageBucket & { date: string }>
  bySource: Array<RoutingUsageBucket & { source: string }>
  recent: Array<{
    id: string
    source: string
    status: string
    billable: boolean
    orderId: string
    sessionKey: string
    dateKey: string
    reason: string
    occurredAt: string | null
  }>
}

function scopeQuery() {
  const scope = getAdminZoneScopeQueryParams()
  const searchParams = new URLSearchParams()
  if ("zoneId" in scope && scope.zoneId) searchParams.set("zoneId", scope.zoneId)
  if ("districtId" in scope && scope.districtId) searchParams.set("districtId", scope.districtId)
  const query = searchParams.toString()
  return query ? `?${query}` : ""
}

export async function getAdminPlatformSettings() {
  const response = await adminRequest<AdminPlatformSettingsResponse>(
    `/admin/settings${scopeQuery()}`
  )
  return response.data
}

export async function updateAdminPlatformSettings(settings: AdminPlatformSettings) {
  const response = await adminRequest<AdminPlatformSettingsResponse>(
    `/admin/settings${scopeQuery()}`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ settings }),
    }
  )
  return response.data
}

export async function getAdminRoutingUsageAnalytics(params: {
  from?: string
  to?: string
} = {}) {
  const searchParams = new URLSearchParams()
  if (params.from) searchParams.set("from", params.from)
  if (params.to) searchParams.set("to", params.to)
  const query = searchParams.toString()
  const response = await adminRequest<AdminRoutingUsageAnalytics>(
    `/admin/settings/routing-usage${query ? `?${query}` : ""}`
  )
  return response.data
}
