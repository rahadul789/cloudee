import NetInfo from "@react-native-community/netinfo";

import { secureStateStorage } from "@/src/lib/secure-storage";
import { useRiderAuthStore, type RiderProfile } from "@/src/store/auth-store";
import { setDeliveryNetworkOnline, useNetworkStore } from "@/src/store/network-store";
import { API_BASE_URL } from "@/src/config/api";

type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data: T;
};

let refreshSessionPromise: Promise<boolean> | null = null;
const AUTH_STORAGE_KEY = "delivery-rider-auth";
const API_REQUEST_TIMEOUT_MS = 18_000;
const API_REFRESH_TIMEOUT_MS = 12_000;

export class ApiRequestError extends Error {
  status?: number;

  constructor(message: string, options?: { status?: number }) {
    super(message);
    this.name = "ApiRequestError";
    this.status = options?.status;
  }
}

async function parseResponse<T>(response: Response) {
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok) {
    const defaultRateLimitMessage =
      "Too many attempts for now. Please wait a moment and try again.";

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

function isLikelyNetworkError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    error.name === "AbortError" ||
    error.name === "TypeError" ||
    message.includes("aborted") ||
    message.includes("network request failed") ||
    message.includes("failed to fetch") ||
    message.includes("networkerror")
  );
}

async function hasInternetConnection() {
  const state = await NetInfo.fetch();
  return Boolean(state.isConnected) && state.isInternetReachable !== false;
}

async function markConnectionFailure() {
  const hasInternet = await hasInternetConnection();

  if (hasInternet) {
    const message =
      "Unable to reach Foodbela server. Please check the backend URL or try again.";
    useNetworkStore.getState().markServerIssue(message);
    return message;
  }

  const message = "You appear to be offline. Reconnect and try again.";
  useNetworkStore.getState().markOffline(message);
  return message;
}

async function getPersistedRefreshToken() {
  const rawAuth = await secureStateStorage.getItem(AUTH_STORAGE_KEY);
  if (!rawAuth) return "";

  try {
    const parsed = JSON.parse(rawAuth) as {
      state?: {
        refreshToken?: string;
      };
    };
    return parsed.state?.refreshToken ?? "";
  } catch {
    return "";
  }
}

async function refreshRiderSession() {
  const storeRefreshToken = useRiderAuthStore.getState().refreshToken;
  const refreshToken = (await getPersistedRefreshToken()) || storeRefreshToken;
  if (!refreshToken) return false;

  let response: Response;
  const controller = new AbortController();
  const timeoutTimer = setTimeout(() => {
    controller.abort();
  }, API_REFRESH_TIMEOUT_MS);

  try {
    response = await fetch(`${API_BASE_URL}/rider/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken }),
      signal: controller.signal,
    });
    setDeliveryNetworkOnline(true);
  } catch (error) {
    if (isLikelyNetworkError(error)) {
      await markConnectionFailure();
    }
    throw error;
  } finally {
    clearTimeout(timeoutTimer);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      useRiderAuthStore.getState().clearSession();
    }
    return false;
  }

  const payload = await parseResponse<{
    accessToken: string;
    refreshToken: string;
    rider: RiderProfile;
  }>(response);

  useRiderAuthStore.getState().setSession({
    accessToken: payload.data.accessToken,
    refreshToken: payload.data.refreshToken,
    rider: payload.data.rider,
  });

  return true;
}

async function refreshRiderSessionOnce() {
  if (!refreshSessionPromise) {
    refreshSessionPromise = refreshRiderSession().finally(() => {
      refreshSessionPromise = null;
    });
  }

  return refreshSessionPromise;
}

async function apiRequest<T>(path: string, init?: RequestInit, allowRetry = true) {
  const { accessToken } = useRiderAuthStore.getState();
  const headers = new Headers(init?.headers ?? {});
  const controller = new AbortController();
  let slowTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    useNetworkStore
      .getState()
      .markSlow("Connection is taking longer than usual. We are still trying.");
  }, 6000);
  let timeoutTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    controller.abort();
  }, API_REQUEST_TIMEOUT_MS);

  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
    if (slowTimer) {
      clearTimeout(slowTimer);
      slowTimer = null;
    }
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
    setDeliveryNetworkOnline(true);
  } catch (error) {
    if (slowTimer) {
      clearTimeout(slowTimer);
      slowTimer = null;
    }
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
    if (isLikelyNetworkError(error)) {
      const message = await markConnectionFailure();
      throw new Error(message);
    }
    throw error;
  }

  if (response.status === 401 && allowRetry && !path.includes("/rider/auth/refresh")) {
    const refreshed = await refreshRiderSessionOnce();
    if (refreshed) {
      return apiRequest<T>(path, init, false);
    }
  }

  return parseResponse<T>(response);
}

export async function apiGet<T>(path: string) {
  return apiRequest<T>(path, { method: "GET" });
}

export async function apiPost<T>(path: string, body?: unknown, method: "POST" | "PATCH" = "POST") {
  return apiRequest<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function apiDelete<T>(path: string) {
  return apiRequest<T>(path, { method: "DELETE" });
}
