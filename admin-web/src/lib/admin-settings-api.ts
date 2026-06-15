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
