import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { AppState, Platform } from "react-native";

import { API_BASE_URL } from "@/src/config/api";
import { secureStateStorage } from "@/src/lib/secure-storage";

export const RIDER_BACKGROUND_LOCATION_TASK =
  "foodbela-rider-background-location";

const BACKGROUND_TRACKING_ORDER_KEY =
  "foodbela-rider-background-tracking-order-id";
const BACKGROUND_PENDING_LOCATION_KEY =
  "foodbela-rider-background-pending-location";
const AUTH_STORAGE_KEY = "delivery-rider-auth";

type PersistedRiderState = {
  accessToken?: string;
  refreshToken?: string;
  rider?: {
    activeTrackingOrderId?: string | null;
  } | null;
};

type PersistedAuthState = {
  state?: {
    accessToken?: string;
    refreshToken?: string;
    rider?: {
      activeTrackingOrderId?: string | null;
    } | null;
  };
  version?: number;
};

type LocationTaskData = {
  locations?: Location.LocationObject[];
};

function getLocationPayload(location: Location.LocationObject) {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    heading:
      typeof location.coords.heading === "number"
        ? location.coords.heading
        : undefined,
    accuracyMeters:
      typeof location.coords.accuracy === "number"
        ? location.coords.accuracy
        : undefined,
    speedKmph:
      typeof location.coords.speed === "number" && location.coords.speed > 0
        ? location.coords.speed * 3.6
        : undefined,
  };
}

type BackgroundLocationPayload = ReturnType<typeof getLocationPayload>;

async function getPersistedAuth() {
  const rawAuth = await secureStateStorage.getItem(AUTH_STORAGE_KEY);
  if (!rawAuth) {
    return null;
  }

  try {
    return JSON.parse(rawAuth) as PersistedAuthState;
  } catch {
    return null;
  }
}

async function writePersistedAuth(nextAuth: PersistedAuthState) {
  await secureStateStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextAuth));
}

async function refreshBackgroundSession(refreshToken: string) {
  const response = await fetch(`${API_BASE_URL}/rider/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refreshToken }),
  }).catch(() => null);

  if (!response?.ok) {
    return null;
  }

  const body = (await response.json().catch(() => null)) as {
    data?: {
      accessToken?: string;
      refreshToken?: string;
      rider?: PersistedRiderState["rider"];
    };
  } | null;

  const accessToken = body?.data?.accessToken;
  const nextRefreshToken = body?.data?.refreshToken;
  if (!accessToken || !nextRefreshToken) {
    return null;
  }

  const currentAuth = await getPersistedAuth();
  const nextAuth: PersistedAuthState = {
    ...currentAuth,
    state: {
      ...(currentAuth?.state ?? {}),
      accessToken,
      refreshToken: nextRefreshToken,
      rider: body.data?.rider ?? currentAuth?.state?.rider ?? null,
    },
  };

  await writePersistedAuth(nextAuth);

  return {
    accessToken,
    refreshToken: nextRefreshToken,
  };
}

async function persistPendingBackgroundLocation(payload: BackgroundLocationPayload) {
  await secureStateStorage.setItem(
    BACKGROUND_PENDING_LOCATION_KEY,
    JSON.stringify({
      ...payload,
      queuedAt: new Date().toISOString(),
    }),
  );
}

async function readPendingBackgroundLocation() {
  const raw = await secureStateStorage.getItem(BACKGROUND_PENDING_LOCATION_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as BackgroundLocationPayload;
    if (
      typeof parsed.latitude !== "number" ||
      typeof parsed.longitude !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function clearPendingBackgroundLocation() {
  await secureStateStorage.removeItem(BACKGROUND_PENDING_LOCATION_KEY);
}

async function sendBackgroundLocationPayload(
  payload: BackgroundLocationPayload,
  allowRefresh = true,
) {
  const auth = await getPersistedAuth();
  const accessToken = auth?.state?.accessToken;

  if (!accessToken) {
    return false;
  }

  const response = await fetch(`${API_BASE_URL}/rider/profile/location`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  }).catch(() => null);

  if (response?.status === 401 && allowRefresh && auth?.state?.refreshToken) {
    const refreshed = await refreshBackgroundSession(auth.state.refreshToken);
    if (refreshed?.accessToken) {
      return sendBackgroundLocationPayload(payload, false);
    }
  }

  if (!response?.ok) {
    return false;
  }

  const body = await response.json().catch(() => null) as {
    data?: { activeTrackingOrderId?: string | null };
  } | null;
  const activeTrackingOrderId =
    typeof body?.data?.activeTrackingOrderId === "string"
      ? body.data.activeTrackingOrderId.trim()
      : "";

  if (!activeTrackingOrderId) {
    await stopRiderBackgroundLocationAsync().catch(() => undefined);
  }

  return true;
}

async function sendBackgroundLocation(location: Location.LocationObject) {
  const latestPayload = getLocationPayload(location);
  const pendingPayload = await readPendingBackgroundLocation();

  if (pendingPayload) {
    const pendingSent = await sendBackgroundLocationPayload(pendingPayload);
    if (pendingSent) {
      await clearPendingBackgroundLocation();
    }
  }

  const latestSent = await sendBackgroundLocationPayload(latestPayload);
  if (!latestSent) {
    await persistPendingBackgroundLocation(latestPayload);
  }
}

TaskManager.defineTask(
  RIDER_BACKGROUND_LOCATION_TASK,
  async ({ data, error }: TaskManager.TaskManagerTaskBody<LocationTaskData>) => {
    if (error) {
      return;
    }

    const locations = data?.locations ?? [];
    const latestLocation = locations[locations.length - 1];
    if (!latestLocation) {
      return;
    }

    await sendBackgroundLocation(latestLocation);
  },
);

export async function setRiderBackgroundTrackingOrderId(orderId: string | null) {
  if (orderId) {
    await secureStateStorage.setItem(BACKGROUND_TRACKING_ORDER_KEY, orderId);
    return;
  }

  await secureStateStorage.removeItem(BACKGROUND_TRACKING_ORDER_KEY);
}

async function hasBackgroundPermission() {
  if (Platform.OS === "web") {
    return false;
  }

  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== "granted") {
    return false;
  }

  const background = await Location.requestBackgroundPermissionsAsync();
  return background.status === "granted";
}

export async function startRiderBackgroundLocationAsync({
  timeIntervalMs = 30000,
  distanceIntervalMeters = 60,
  notificationBody = "Foodbela is sharing rider location for live delivery tracking.",
}: {
  timeIntervalMs?: number;
  distanceIntervalMeters?: number;
  notificationBody?: string;
} = {}) {
  // Android only lets a foreground service start while the app itself is in the
  // foreground. Trying otherwise throws "Foreground service cannot be started
  // when the application is in the background". We skip here and let the screen
  // restart tracking when the app returns to the foreground.
  if (Platform.OS === "android" && AppState.currentState !== "active") {
    return false;
  }

  try {
    if (!(await hasBackgroundPermission())) {
      return false;
    }

    const hasStarted = await Location.hasStartedLocationUpdatesAsync(
      RIDER_BACKGROUND_LOCATION_TASK,
    );

    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(RIDER_BACKGROUND_LOCATION_TASK);
    }

    await Location.startLocationUpdatesAsync(RIDER_BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: timeIntervalMs,
      distanceInterval: distanceIntervalMeters,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "Foodbela Rider live tracking",
        notificationBody,
        notificationColor: "#0f766e",
      },
    });

    return true;
  } catch {
    // A rejected start (background race, OEM restriction) must never bubble up as
    // an uncaught promise rejection. The screen re-arms tracking on app resume.
    return false;
  }
}

export async function stopRiderBackgroundLocationAsync() {
  const hasStarted = await Location.hasStartedLocationUpdatesAsync(
    RIDER_BACKGROUND_LOCATION_TASK,
  );

  if (hasStarted) {
    await Location.stopLocationUpdatesAsync(RIDER_BACKGROUND_LOCATION_TASK);
  }

  await setRiderBackgroundTrackingOrderId(null);
  await clearPendingBackgroundLocation();
}
