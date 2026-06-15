import {
  clearOwnerAuthSession,
  getOwnerAuthSession,
  setOwnerAuthSession,
  takeLegacyOwnerRefreshToken,
} from "@/lib/auth-session"
import type { OwnerAuthSession } from "@/lib/auth-session"

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ||
  "http://localhost:5000/api/v1"

type ApiEnvelope<T> = {
  success: boolean
  message?: string
  data: T
  meta?: Record<string, unknown>
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: unknown
  auth?: boolean
  signal?: AbortSignal
}

let refreshPromise: Promise<OwnerAuthSession | null> | null = null

export class ApiError extends Error {
  status: number
  code?: string
  details?: unknown

  constructor(params: {
    message: string
    status: number
    code?: string
    details?: unknown
  }) {
    super(params.message)
    this.name = "ApiError"
    this.status = params.status
    this.code = params.code
    this.details = params.details
  }
}

async function refreshOwnerSessionRequest() {
  const legacyRefreshToken = takeLegacyOwnerRefreshToken()
  const response = await fetch(`${API_BASE_URL}/auth/owner/refresh`, {
    method: "POST",
    headers: legacyRefreshToken
      ? {
          "Content-Type": "application/json",
        }
      : undefined,
    body: legacyRefreshToken
      ? JSON.stringify({
          refreshToken: legacyRefreshToken,
        })
      : undefined,
    credentials: "include",
  })

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      clearOwnerAuthSession()
    }
    return null
  }

  const payload = (await response.json()) as ApiEnvelope<{
    accessToken: string
  }>

  if (!payload.data?.accessToken) {
    clearOwnerAuthSession()
    return null
  }

  const nextSession = {
    accessToken: payload.data.accessToken,
  }

  setOwnerAuthSession(nextSession)
  return nextSession
}

export function refreshOwnerSession() {
  refreshPromise ??= refreshOwnerSessionRequest().finally(() => {
    refreshPromise = null
  })

  return refreshPromise
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
  allowRefresh = true
): Promise<T> {
  let session = getOwnerAuthSession()
  let attemptedRefreshBeforeRequest = false
  const headers = new Headers()
  const isJsonBody = options.body !== undefined

  if (isJsonBody) {
    headers.set("Content-Type", "application/json")
  }

  if (options.auth !== false && !session?.accessToken && allowRefresh) {
    attemptedRefreshBeforeRequest = true
    session = await refreshOwnerSession()
  }

  if (options.auth !== false && session?.accessToken) {
    headers.set("Authorization", `Bearer ${session.accessToken}`)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: isJsonBody ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
    credentials: "include",
  })

  if (
    response.status === 401 &&
    options.auth !== false &&
    allowRefresh &&
    !attemptedRefreshBeforeRequest
  ) {
    const refreshedSession = await refreshOwnerSession()
    if (refreshedSession) {
      return request<T>(path, options, false)
    }
  }

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<T>
    | {
        success?: false
        message?: string
        errorCode?: string
        code?: string
        details?: unknown
      }
    | null

  if (!response.ok) {
    const rateLimitMessage =
      response.status === 429
        ? "Too many attempts for now. Please wait a bit and try again."
        : undefined

    throw new ApiError({
      message: payload?.message || rateLimitMessage || "Request failed",
      status: response.status,
      code:
        payload && "code" in payload
          ? payload.code
          : payload && "errorCode" in payload
            ? payload.errorCode
            : undefined,
      details: payload && "details" in payload ? payload.details : undefined,
    })
  }

  return (payload as ApiEnvelope<T>).data
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal, auth = true) =>
    request<T>(path, { method: "GET", signal, auth }),
  post: <T>(path: string, body?: unknown, auth = true) =>
    request<T>(path, { method: "POST", body, auth }),
  put: <T>(path: string, body?: unknown, auth = true) =>
    request<T>(path, { method: "PUT", body, auth }),
  patch: <T>(path: string, body?: unknown, auth = true) =>
    request<T>(path, { method: "PATCH", body, auth }),
  delete: <T>(path: string, auth = true) =>
    request<T>(path, { method: "DELETE", auth }),
}
