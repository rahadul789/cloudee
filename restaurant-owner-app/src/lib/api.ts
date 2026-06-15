import { API_BASE_URL } from "@/src/config/api";
import { useNetworkStore } from "@/src/store/network-store";
import { useOwnerAuthStore } from "@/src/store/auth-store";

type ApiEnvelope<T> = {
  success: boolean;
  message?: string;
  data: T;
};

let refreshPromise: Promise<boolean> | null = null;
const INTERNET_REACHABILITY_URL = "https://clients3.google.com/generate_204";

async function parseResponse<T>(response: Response) {
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok) {
    const fallback =
      response.status === 429
        ? "Too many attempts for now. Please wait a bit and try again."
        : `Request failed with status ${response.status}`;

    if (contentType.includes("application/json") && text) {
      const payload = JSON.parse(text) as {
        message?: string;
        code?: string;
        errorCode?: string;
      };
      throw new Error(payload.message ?? fallback);
    }

    throw new Error(fallback);
  }

  if (!contentType.includes("application/json") || !text) {
    throw new Error("Server returned a non-JSON response.");
  }

  return JSON.parse(text) as ApiEnvelope<T>;
}

function isNetworkFailure(error: unknown) {
  if (error instanceof TypeError) {
    return true;
  }

  if (error instanceof Error && /network request failed/i.test(error.message)) {
    return true;
  }

  return false;
}

async function hasInternetConnection() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  try {
    await fetch(`${INTERNET_REACHABILITY_URL}?t=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function getNetworkAwareMessage(error: unknown) {
  if (isNetworkFailure(error)) {
    return "No internet connection. Reconnect and try again.";
  }

  return error instanceof Error ? error.message : "Request failed. Please try again.";
}

async function refreshOwnerSession() {
  const { refreshToken } = useOwnerAuthStore.getState();
  if (!refreshToken) return false;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/owner/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    return false;
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      useOwnerAuthStore.getState().clearSession();
    }
    return false;
  }

  const payload = await parseResponse<OwnerAuthResponse>(response);
  useOwnerAuthStore.getState().setSession({
    owner: payload.data.owner,
    accessToken: payload.data.accessToken,
    refreshToken: payload.data.refreshToken,
    restaurantLifecycleStatus: payload.data.restaurantLifecycleStatus,
  });

  return true;
}

function refreshOwnerSessionOnce() {
  if (!refreshPromise) {
    refreshPromise = refreshOwnerSession().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

async function request<T>(path: string, init?: RequestInit, allowRetry = true) {
  const { accessToken } = useOwnerAuthStore.getState();
  const headers = new Headers(init?.headers ?? {});
  const networkStore = useNetworkStore.getState();
  let slowTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    useNetworkStore
      .getState()
      .markSlow("Connection is taking longer than usual. We are still trying.");
  }, 6000);

  if (init?.body && !headers.has("Content-Type")) {
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
    });
    if (slowTimer) {
      clearTimeout(slowTimer);
      slowTimer = null;
    }
    networkStore.markOnline();
  } catch (error) {
    if (slowTimer) {
      clearTimeout(slowTimer);
      slowTimer = null;
    }

    if (isNetworkFailure(error)) {
      const hasInternet = await hasInternetConnection();
      if (hasInternet) {
        const message =
          "Unable to reach Foodbela server. Please check the backend URL or try again.";
        networkStore.markServerIssue(message);
        throw new Error(message);
      }
    }

    const message = getNetworkAwareMessage(error);
    networkStore.markOffline(message);
    throw new Error(message);
  }

  if (response.status === 401 && allowRetry && !path.includes("/auth/owner/refresh")) {
    const refreshed = await refreshOwnerSessionOnce();
    if (refreshed) return request<T>(path, init, false);
  }

  return parseResponse<T>(response);
}

export async function apiGet<T>(path: string) {
  return request<T>(path, { method: "GET" });
}

export async function apiPost<T>(path: string, body?: unknown, allowRetry = true) {
  return request<T>(
    path,
    {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    allowRetry,
  );
}

export async function apiPatch<T>(path: string, body?: unknown) {
  return request<T>(path, {
    method: "PATCH",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function apiPut<T>(path: string, body?: unknown) {
  return request<T>(path, {
    method: "PUT",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function apiDelete<T>(path: string) {
  return request<T>(path, { method: "DELETE" });
}

export type OwnerAuthResponse = {
  accessToken: string;
  refreshToken: string;
  owner: {
    id: string;
    fullName: string;
    phone: string;
    isPhoneVerified: boolean;
  };
  restaurantLifecycleStatus: string;
};
