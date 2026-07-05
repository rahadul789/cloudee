import { useCustomerAuthStore } from "@/src/store/auth-store";
import { API_BASE_URL } from "@/src/config/runtime";

let refreshPromise: Promise<boolean> | null = null;
let lastRefreshFailureAtMs = 0;
// On a 429 (rate-limited) refresh, back off until this timestamp rather than retrying
// every REFRESH_RETRY_COOLDOWN_MS — retrying while rate-limited only sustains the lock.
let refreshBackoffUntilMs = 0;

const API_REQUEST_TIMEOUT_MS = 18_000;
const API_REFRESH_TIMEOUT_MS = 12_000;
const TOKEN_REFRESH_BUFFER_MS = 90_000;
const REFRESH_RETRY_COOLDOWN_MS = 10_000;
const RATE_LIMIT_BACKOFF_FALLBACK_MS = 5 * 60_000;
const MAX_REFRESH_BACKOFF_MS = 15 * 60_000;

function resolveRefreshBackoffMs(response: Response) {
  const retryAfter = Number(response.headers.get("retry-after"));
  const reset = Number(response.headers.get("ratelimit-reset"));
  const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : reset;
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1000 + 1000, MAX_REFRESH_BACKOFF_MS);
  }
  return RATE_LIMIT_BACKOFF_FALLBACK_MS;
}

type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data: T;
};

export class ApiRequestError extends Error {
  status?: number;
  isTimeout?: boolean;

  constructor(message: string, options?: { status?: number; isTimeout?: boolean }) {
    super(message);
    this.name = "ApiRequestError";
    this.status = options?.status;
    this.isTimeout = options?.isTimeout;
  }
}

function isAbortError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || /aborted/i.test(error.message))
  );
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number,
  timeoutMessage = "Request timed out. Please check your connection and try again.",
) {
  const controller = new AbortController();
  const externalSignal = init?.signal;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let didTimeout = false;

  const abortFromExternalSignal = () => {
    controller.abort();
  };

  if (externalSignal?.aborted) {
    controller.abort();
  } else {
    externalSignal?.addEventListener("abort", abortFromExternalSignal);
  }

  timeout = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (didTimeout || isAbortError(error)) {
      throw new ApiRequestError(timeoutMessage, { isTimeout: didTimeout });
    }
    throw error;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
    externalSignal?.removeEventListener("abort", abortFromExternalSignal);
  }
}

async function parseResponse<T>(response: Response) {
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok) {
    const defaultRateLimitMessage =
      "Too many attempts for now. Please wait a bit and try again.";

    if (contentType.includes("application/json") && text) {
      const payload = JSON.parse(text) as { message?: string };
      throw new ApiRequestError(
        payload.message ??
          (response.status === 429
            ? defaultRateLimitMessage
            : `Request failed with status ${response.status}`),
        { status: response.status }
      );
    }

    throw new ApiRequestError(
      response.status === 429
        ? defaultRateLimitMessage
        : `Request failed with status ${response.status}`,
      { status: response.status }
    );
  }

  if (!contentType.includes("application/json") || !text) {
    throw new Error("Server returned a non-JSON response.");
  }

  return JSON.parse(text) as ApiResponse<T>;
}

function getNetworkAwareErrorMessage(error: unknown) {
  if (isAbortError(error)) {
    return "Request timed out. Please check your connection and try again.";
  }

  if (error instanceof TypeError) {
    return "You appear to be offline. Reconnect and try again.";
  }

  if (error instanceof Error && /network request failed/i.test(error.message)) {
    return "You appear to be offline. Reconnect and try again.";
  }

  return error instanceof Error ? error.message : "Request failed. Please try again.";
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "="
  );

  if (typeof globalThis.atob === "function") {
    return globalThis.atob(padded);
  }

  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let buffer = 0;
  let bits = 0;
  let output = "";

  for (const char of padded) {
    if (char === "=") break;
    const valueIndex = chars.indexOf(char);
    if (valueIndex < 0) continue;
    buffer = (buffer << 6) | valueIndex;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }

  return output;
}

export function getAccessTokenExpiresAtMs(accessToken: string) {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return null;
    const parsed = JSON.parse(decodeBase64Url(payload)) as { exp?: unknown };
    return typeof parsed.exp === "number" ? parsed.exp * 1000 : null;
  } catch {
    return null;
  }
}

function shouldRefreshAccessToken(accessToken: string, bufferMs: number) {
  const expiresAtMs = getAccessTokenExpiresAtMs(accessToken);
  return typeof expiresAtMs === "number" && expiresAtMs - Date.now() <= bufferMs;
}

async function refreshCustomerSession() {
  const { refreshToken } = useCustomerAuthStore.getState();
  if (!refreshToken) return false;

  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${API_BASE_URL}/customer/auth/refresh`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refreshToken }),
      },
      API_REFRESH_TIMEOUT_MS
    );
  } catch {
    lastRefreshFailureAtMs = Date.now();
    return false;
  }

  if (!response.ok) {
    lastRefreshFailureAtMs = Date.now();
    if (response.status === 429) {
      refreshBackoffUntilMs = Date.now() + resolveRefreshBackoffMs(response);
    }
    if (response.status === 401 || response.status === 403) {
      useCustomerAuthStore.getState().clearSession();
    }
    return false;
  }

  const payload = await parseResponse<{
    accessToken: string;
    refreshToken: string;
      customer: {
        id: string;
        fullName: string;
        phone: string;
        email: string;
        referralCode?: string;
        notificationSettings?: {
          orderUpdates?: boolean;
          restaurantStatus?: boolean;
          reviewReplies?: boolean;
          promotions?: boolean;
        };
        previousPhones?: {
          phone: string;
          changedAt?: string | null;
        }[];
        profileImage?: {
          url?: string;
          publicId?: string;
        };
      };
  }>(response);

  useCustomerAuthStore.getState().setSession({
    accessToken: payload.data.accessToken,
    refreshToken: payload.data.refreshToken,
    customer: payload.data.customer,
  });
  lastRefreshFailureAtMs = 0;
  refreshBackoffUntilMs = 0;

  return true;
}

function refreshCustomerSessionOnce() {
  if (!refreshPromise) {
    refreshPromise = refreshCustomerSession().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

export async function ensureFreshCustomerSession(options?: {
  force?: boolean;
  bufferMs?: number;
}) {
  const { accessToken, refreshToken } = useCustomerAuthStore.getState();
  if (!refreshToken) return false;

  // Honour a 429 backoff even for forced refreshes — the server asked us to stop.
  if (Date.now() < refreshBackoffUntilMs) {
    return false;
  }

  if (!options?.force && accessToken) {
    const bufferMs = options?.bufferMs ?? TOKEN_REFRESH_BUFFER_MS;
    if (!shouldRefreshAccessToken(accessToken, bufferMs)) {
      return true;
    }

    if (
      lastRefreshFailureAtMs > 0 &&
      Date.now() - lastRefreshFailureAtMs < REFRESH_RETRY_COOLDOWN_MS
    ) {
      return false;
    }
  }

  return refreshCustomerSessionOnce();
}

export async function getFreshCustomerAccessToken() {
  await ensureFreshCustomerSession();
  return useCustomerAuthStore.getState().accessToken;
}

type ApiRequestOptions = {
  auth?: "none" | "required";
  allowRetry?: boolean;
};

async function apiRequest<T>(
  path: string,
  init?: RequestInit,
  options: ApiRequestOptions = {}
) {
  const requiresAuth = options.auth === "required";
  const allowRetry = options.allowRetry !== false;
  if (requiresAuth) {
    await ensureFreshCustomerSession();
  }

  const { accessToken } = useCustomerAuthStore.getState();
  const headers = new Headers(init?.headers ?? {});
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  if (requiresAuth && accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${API_BASE_URL}${path}`,
      {
        ...init,
        headers,
      },
      API_REQUEST_TIMEOUT_MS
    );
  } catch (error) {
    if (error instanceof ApiRequestError) {
      throw error;
    }
    throw new ApiRequestError(getNetworkAwareErrorMessage(error), {
      isTimeout: isAbortError(error),
    });
  }

  if (
    requiresAuth &&
    response.status === 401 &&
    allowRetry &&
    !path.includes("/customer/auth/refresh")
  ) {
    const refreshed = await ensureFreshCustomerSession({ force: true });
    if (refreshed) {
      return apiRequest<T>(path, init, { auth: "required", allowRetry: false });
    }
  }

  return parseResponse<T>(response);
}

export async function apiGet<T>(path: string) {
  return apiRequest<T>(path, { method: "GET" }, { auth: "none" });
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  init?: RequestInit,
) {
  return apiRequest<T>(path, {
    ...init,
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  }, { auth: "none" });
}

export async function apiProtectedGet<T>(path: string) {
  return apiRequest<T>(path, { method: "GET" }, { auth: "required" });
}

export async function apiProtectedPost<T>(path: string, body?: unknown) {
  return apiRequest<T>(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  }, { auth: "required" });
}

export async function apiPatch<T>(path: string, body?: unknown) {
  return apiRequest<T>(path, {
    method: "PATCH",
    body: body === undefined ? undefined : JSON.stringify(body),
  }, { auth: "required" });
}

export async function apiDelete<T>(path: string) {
  return apiRequest<T>(path, {
    method: "DELETE",
  }, { auth: "required" });
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}
