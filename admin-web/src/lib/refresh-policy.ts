import * as React from "react"

export type AdminRefreshPolicy = {
  notificationsMs: number
  dashboardMs: number
  operationsHealthMs: number
  liveMapMs: number
  sessionsMs: number
  riderDetailsMs: number
}

export const DEFAULT_ADMIN_REFRESH_POLICY: AdminRefreshPolicy = {
  notificationsMs: 60_000,
  dashboardMs: 30_000,
  operationsHealthMs: 30_000,
  liveMapMs: 15_000,
  sessionsMs: 30_000,
  riderDetailsMs: 30_000,
}

const STORAGE_KEY = "foodbela-admin-refresh-policy"
const CHANGE_EVENT = "foodbela-admin-refresh-policy-changed"

function normalizeInterval(value: unknown, fallback: number) {
  const next = Number(value)
  if (!Number.isFinite(next)) return fallback
  if (next === 0) return 0
  if (next < 10_000) return fallback
  if (next > 10 * 60_000) return fallback
  return Math.round(next)
}

export function getAdminRefreshPolicy(): AdminRefreshPolicy {
  if (typeof window === "undefined") return DEFAULT_ADMIN_REFRESH_POLICY

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_ADMIN_REFRESH_POLICY
    const parsed = JSON.parse(raw) as Partial<AdminRefreshPolicy>
    return {
      notificationsMs: normalizeInterval(
        parsed.notificationsMs,
        DEFAULT_ADMIN_REFRESH_POLICY.notificationsMs,
      ),
      dashboardMs: normalizeInterval(
        parsed.dashboardMs,
        DEFAULT_ADMIN_REFRESH_POLICY.dashboardMs,
      ),
      operationsHealthMs: normalizeInterval(
        parsed.operationsHealthMs,
        DEFAULT_ADMIN_REFRESH_POLICY.operationsHealthMs,
      ),
      liveMapMs: normalizeInterval(
        parsed.liveMapMs,
        DEFAULT_ADMIN_REFRESH_POLICY.liveMapMs,
      ),
      sessionsMs: normalizeInterval(
        parsed.sessionsMs,
        DEFAULT_ADMIN_REFRESH_POLICY.sessionsMs,
      ),
      riderDetailsMs: normalizeInterval(
        parsed.riderDetailsMs,
        DEFAULT_ADMIN_REFRESH_POLICY.riderDetailsMs,
      ),
    }
  } catch {
    return DEFAULT_ADMIN_REFRESH_POLICY
  }
}

export function setAdminRefreshPolicy(policy: AdminRefreshPolicy) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(policy))
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
}

export function resetAdminRefreshPolicy() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(STORAGE_KEY)
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
}

export function useAdminRefreshPolicy() {
  const [policy, setPolicyState] = React.useState<AdminRefreshPolicy>(() =>
    getAdminRefreshPolicy(),
  )

  React.useEffect(() => {
    const sync = () => setPolicyState(getAdminRefreshPolicy())
    window.addEventListener(CHANGE_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  const updatePolicy = React.useCallback(
    (patch: Partial<AdminRefreshPolicy>) => {
      const next = { ...getAdminRefreshPolicy(), ...patch }
      setAdminRefreshPolicy(next)
    },
    [],
  )

  const resetPolicy = React.useCallback(() => {
    resetAdminRefreshPolicy()
  }, [])

  return { policy, updatePolicy, resetPolicy }
}

export function formatRefreshInterval(ms: number) {
  if (ms === 0) return "Off"
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  return `${Math.round(ms / 60_000)}m`
}
