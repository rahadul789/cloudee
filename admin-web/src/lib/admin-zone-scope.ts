export type AdminZoneScope =
  | {
      type: "all"
      id: ""
      label: "All areas"
    }
  | {
      type: "district" | "zone"
      id: string
      label: string
    }

export const ADMIN_ZONE_SCOPE_STORAGE_KEY = "foodbela.admin.zoneScope"
export const ADMIN_ZONE_SCOPE_CHANGED_EVENT = "foodbela:admin-zone-scope-changed"

const allScope: AdminZoneScope = {
  type: "all",
  id: "",
  label: "All areas",
}

function normalizeScope(value: unknown): AdminZoneScope {
  if (!value || typeof value !== "object") return allScope
  const candidate = value as Partial<AdminZoneScope>
  if (candidate.type === "district" || candidate.type === "zone") {
    const id = typeof candidate.id === "string" ? candidate.id.trim() : ""
    const label = typeof candidate.label === "string" ? candidate.label.trim() : ""
    if (id) {
      return {
        type: candidate.type,
        id,
        label: label || (candidate.type === "district" ? "Selected district" : "Selected zone"),
      }
    }
  }
  return allScope
}

export function getAdminZoneScope(): AdminZoneScope {
  if (typeof window === "undefined") return allScope
  try {
    const raw = window.localStorage.getItem(ADMIN_ZONE_SCOPE_STORAGE_KEY)
    if (!raw) return allScope
    return normalizeScope(JSON.parse(raw))
  } catch {
    return allScope
  }
}

export function setAdminZoneScope(scope: AdminZoneScope) {
  if (typeof window === "undefined") return
  const normalized = normalizeScope(scope)
  window.localStorage.setItem(ADMIN_ZONE_SCOPE_STORAGE_KEY, JSON.stringify(normalized))
  window.dispatchEvent(new CustomEvent(ADMIN_ZONE_SCOPE_CHANGED_EVENT, { detail: normalized }))
}

export function subscribeAdminZoneScope(listener: () => void) {
  if (typeof window === "undefined") return () => undefined
  const handleStorage = (event: StorageEvent) => {
    if (event.key === ADMIN_ZONE_SCOPE_STORAGE_KEY) listener()
  }
  window.addEventListener("storage", handleStorage)
  window.addEventListener(ADMIN_ZONE_SCOPE_CHANGED_EVENT, listener)
  return () => {
    window.removeEventListener("storage", handleStorage)
    window.removeEventListener(ADMIN_ZONE_SCOPE_CHANGED_EVENT, listener)
  }
}

export function getAdminZoneScopeQueryParams() {
  const scope = getAdminZoneScope()
  if (scope.type === "zone" && scope.id) return { zoneId: scope.id }
  if (scope.type === "district" && scope.id) return { districtId: scope.id }
  return {}
}
