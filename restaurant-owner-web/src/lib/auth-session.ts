const LEGACY_AUTH_SESSION_STORAGE_KEY = "restaurant-owner-auth-session"

export const OWNER_ACCESS_TOKEN_UPDATED_EVENT = "owner-access-token-updated"

export type OwnerImpersonation = {
  adminName: string
  ownerName: string
}

export type OwnerAuthSession = {
  accessToken: string
  // Present only when an admin is signed in as this owner. No refresh token exists
  // for such a session, so it is intentionally short-lived and ends on reload/expiry.
  impersonation?: OwnerImpersonation
}

export function getOwnerImpersonation(): OwnerImpersonation | null {
  return ownerAuthSession?.impersonation ?? null
}

let ownerAuthSession: OwnerAuthSession | null = null

function clearLegacyStoredSession() {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return
  }

  window.localStorage.removeItem(LEGACY_AUTH_SESSION_STORAGE_KEY)
}

function notifyOwnerAccessTokenUpdated() {
  if (typeof window === "undefined") {
    return
  }

  window.dispatchEvent(new Event(OWNER_ACCESS_TOKEN_UPDATED_EVENT))
}

export function takeLegacyOwnerRefreshToken() {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return null
  }

  const raw = window.localStorage.getItem(LEGACY_AUTH_SESSION_STORAGE_KEY)
  clearLegacyStoredSession()

  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as { refreshToken?: unknown }
    return typeof parsed.refreshToken === "string" && parsed.refreshToken.trim()
      ? parsed.refreshToken
      : null
  } catch {
    return null
  }
}

export function getOwnerAuthSession(): OwnerAuthSession | null {
  return ownerAuthSession
}

export function setOwnerAuthSession(session: OwnerAuthSession) {
  ownerAuthSession = session
  clearLegacyStoredSession()
  notifyOwnerAccessTokenUpdated()
}

export function clearOwnerAuthSession() {
  ownerAuthSession = null
  clearLegacyStoredSession()
  notifyOwnerAccessTokenUpdated()
}
