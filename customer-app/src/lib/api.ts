import { useCustomerAuthStore } from "@/src/store/auth-store";
import { API_BASE_URL } from "@/src/config/runtime";

let refreshPromise: Promise<boolean> | null = null;

const API_REQUEST_TIMEOUT_MS = 18_000;
const API_REFRESH_TIMEOUT_MS = 12_000;

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
    return false;
  }

  if (!response.ok) {
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

async function apiRequest<T>(
  path: string,
  init?: RequestInit,
  allowRetry = true
) {
  const { accessToken } = useCustomerAuthStore.getState();
  const headers = new Headers(init?.headers ?? {});
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) {
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

  if (response.status === 401 && allowRetry && !path.includes("/customer/auth/refresh")) {
    const refreshed = await refreshCustomerSessionOnce();
    if (refreshed) {
      return apiRequest<T>(path, init, false);
    }
  }

  return parseResponse<T>(response);
}

export async function apiGet<T>(path: string) {
  return apiRequest<T>(path, { method: "GET" });
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
  });
}

export async function apiProtectedGet<T>(path: string) {
  return apiRequest<T>(path, { method: "GET" });
}

export async function apiProtectedPost<T>(path: string, body?: unknown) {
  return apiRequest<T>(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function apiPatch<T>(path: string, body?: unknown) {
  return apiRequest<T>(path, {
    method: "PATCH",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function apiDelete<T>(path: string) {
  return apiRequest<T>(path, {
    method: "DELETE",
  });
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}
