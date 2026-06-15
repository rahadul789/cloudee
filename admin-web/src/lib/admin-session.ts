const ACCESS_TOKEN_KEY = "admin_access_token"
const REFRESH_TOKEN_KEY = "admin_refresh_token"
const ADMIN_PROFILE_KEY = "admin_profile"

export const ADMIN_ACCESS_TOKEN_UPDATED_EVENT = "admin-access-token-updated"
export const ADMIN_SESSION_EXPIRED_EVENT = "admin-session-expired"

let accessTokenCache: string | null = null

export type AdminProfile = {
  id: string
  fullName: string
  email: string
  role: "admin"
}

function isAdminProfile(value: unknown): value is AdminProfile {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === "string" &&
    candidate.id.trim().length > 0 &&
    typeof candidate.fullName === "string" &&
    candidate.fullName.trim().length > 0 &&
    typeof candidate.email === "string" &&
    typeof candidate.role === "string" &&
    candidate.role === "admin"
  )
}

export function getAdminAccessToken() {
  return accessTokenCache
}

export function getAdminRefreshToken() {
  return null
}

export function getAdminProfile(): AdminProfile | null {
  const raw = localStorage.getItem(ADMIN_PROFILE_KEY)
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!isAdminProfile(parsed)) {
      clearAdminSession()
      return null
    }
    return parsed
  } catch {
    clearAdminSession()
    return null
  }
}

export function setAdminSession(payload: {
  accessToken: string
  admin: AdminProfile
}) {
  accessTokenCache = payload.accessToken
  localStorage.setItem(ADMIN_PROFILE_KEY, JSON.stringify(payload.admin))
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  window.dispatchEvent(new Event(ADMIN_ACCESS_TOKEN_UPDATED_EVENT))
}

export function clearAdminSession() {
  accessTokenCache = null
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(ADMIN_PROFILE_KEY)
  window.dispatchEvent(new Event(ADMIN_ACCESS_TOKEN_UPDATED_EVENT))
}

export function notifyAdminSessionExpired() {
  window.dispatchEvent(new Event(ADMIN_SESSION_EXPIRED_EVENT))
}
