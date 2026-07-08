import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { AppState, Platform } from "react-native";

import { API_BASE_URL } from "@/src/config/api";
import { secureStateStorage } from "@/src/lib/secure-storage";
import { shouldAcceptFix, type AcceptedFix } from "@/src/lib/location-quality";

// Last GPS fix we trusted + how many we've rejected since, so the quality gate can
// detect teleports and re-baseline after a bad reference. Module-level: persists for
// the life of the foreground-service task, resets to a clean slate if it restarts.
let lastAcceptedFix: AcceptedFix | null = null;
let consecutiveRejects = 0;
// Android's fused provider can deliver GPS fixes far faster than the requested
// timeInterval (High accuracy + distanceInterval:0 especially). Each fix used to run
// storage reads + a server send + a socket echo → refetch cascade; a burst of fixes
// compounded into JS-thread saturation right after pickup (heavy app, blinking status
// bar, eventual crash). This floor makes the task do real work at most this often no
// matter how fast the OS fires — the true admin cadence is still enforced by the
// move/heartbeat throttle inside sendBackgroundLocation.
const MIN_TASK_PROCESS_INTERVAL_MS = 3000;
let lastTaskProcessedAtMs = 0;

// In-memory caches so the hot path (every processed fix) does essentially NO SecureStore
// I/O. The original fast version stayed light; the rate-limit rewrite added several
// secure-store reads per fix, which — once the OS streamed fixes — saturated the JS
// thread and froze the app while sharing location. These live for the task's lifetime.
let cachedSendPolicy: SendPolicy | null = null;
let cachedLastSent: LastSentLocation | null = null;
let hasPendingBackgroundLocation = false;
let backgroundLocationSendPromise: Promise<void> | null = null;
let queuedBackgroundLocation: Location.LocationObject | null = null;
// Signature of the currently-running stream (accuracy/interval/etc). Lets repeated
// start calls be idempotent: if the config is unchanged we DON'T stop+restart, so
// the foreground service survives order-to-order handoffs (a restart in the
// background would fail and drop tracking).
let activeStreamSignature = "";

export const RIDER_BACKGROUND_LOCATION_TASK =
  "foodbela-rider-background-location";

const BACKGROUND_TRACKING_ORDER_KEY =
  "foodbela-rider-background-tracking-order-id";
const BACKGROUND_PENDING_LOCATION_KEY =
  "foodbela-rider-background-pending-location";
const BACKGROUND_SEND_POLICY_KEY =
  "foodbela-rider-background-send-policy";
const BACKGROUND_LAST_SENT_KEY = "foodbela-rider-background-last-sent";
const AUTH_STORAGE_KEY = "delivery-rider-auth";

const DEFAULT_MOVE_THRESHOLD_METERS = 60;
// Even when the rider is stationary (traffic, waiting at a gate), send at least this
// often so the customer's marker and ETA never freeze.
const DEFAULT_HEARTBEAT_MS = 35_000;
// Cap a single location PATCH so a slow/2G network can't leave the task hanging.
const LOCATION_SEND_TIMEOUT_MS = 9_000;
// Refresh the access token this long before it actually expires, so a valid token is
// almost always in hand and 401s (which trigger a reactive refresh) stay rare.
const ACCESS_TOKEN_REFRESH_BUFFER_MS = 90_000;
// After a refresh failure, don't retry for a while. This is THE guard against the
// refresh storm: OS location callbacks fire every 1-5s, so without a backoff an
// expired token would trigger a refresh on every single callback and blow the
// per-token rate limit (which is shared with the foreground app).
const BACKGROUND_REFRESH_FAILURE_BACKOFF_MS = 30_000;
// When the server rate-limits us (429) and sends no reset hint, back off this long.
const BACKGROUND_REFRESH_RATE_LIMIT_BACKOFF_MS = 5 * 60_000;
const MAX_BACKGROUND_REFRESH_BACKOFF_MS = 15 * 60_000;

// Single-flight + backoff for background refresh. Module-level so every location
// callback in this task shares one in-flight refresh and one backoff window.
let backgroundRefreshPromise: Promise<string | null> | null = null;
let backgroundRefreshBackoffUntilMs = 0;

type SendPolicy = {
  moveThresholdMeters: number;
  heartbeatMs: number;
  minIntervalMs: number;
};

type LastSentLocation = {
  latitude: number;
  longitude: number;
  sentAtMs: number;
};

function distanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const earthRadius = 6_371_000;
  const dLat = ((to.latitude - from.latitude) * Math.PI) / 180;
  const dLng = ((to.longitude - from.longitude) * Math.PI) / 180;
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs = LOCATION_SEND_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

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
type BackgroundLocationSendResult = {
  ok: boolean;
  shouldStopTracking: boolean;
};

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

function decodeJwtExpiryMs(token: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json =
      typeof globalThis.atob === "function"
        ? globalThis.atob(padded)
        : Buffer.from(padded, "base64").toString("binary");
    const parsed = JSON.parse(json) as { exp?: unknown };
    return typeof parsed.exp === "number" ? parsed.exp * 1000 : null;
  } catch {
    return null;
  }
}

function isAccessTokenFresh(token: string, bufferMs: number) {
  const expiresAtMs = decodeJwtExpiryMs(token);
  // If we can't read an expiry, treat it as usable — a real 401 will still force a
  // (backoff-guarded) refresh, so we never storm even for an opaque token.
  if (expiresAtMs === null) return true;
  return expiresAtMs - Date.now() > bufferMs;
}

function resolveRefreshBackoffMs(response: Response) {
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("retry-after"));
    const reset = Number(response.headers.get("ratelimit-reset"));
    const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : reset;
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(seconds * 1000 + 1000, MAX_BACKGROUND_REFRESH_BACKOFF_MS);
    }
    return BACKGROUND_REFRESH_RATE_LIMIT_BACKOFF_MS;
  }
  return BACKGROUND_REFRESH_FAILURE_BACKOFF_MS;
}

// The single low-level refresh call. Persists the new tokens on success and, on ANY
// failure, opens a backoff window so callers stop retrying — respecting the server's
// rate-limit reset hint when it's a 429.
async function performBackgroundRefresh(refreshToken: string): Promise<string | null> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/rider/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response) {
    backgroundRefreshBackoffUntilMs = Date.now() + BACKGROUND_REFRESH_FAILURE_BACKOFF_MS;
    return null;
  }

  if (!response.ok) {
    backgroundRefreshBackoffUntilMs = Date.now() + resolveRefreshBackoffMs(response);
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
    backgroundRefreshBackoffUntilMs = Date.now() + BACKGROUND_REFRESH_FAILURE_BACKOFF_MS;
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
  backgroundRefreshBackoffUntilMs = 0;
  return accessToken;
}

// Single-flight: many location callbacks can arrive while a refresh is in progress;
// they all await the same one instead of each firing their own.
function runBackgroundRefreshOnce(refreshToken: string): Promise<string | null> {
  if (!backgroundRefreshPromise) {
    backgroundRefreshPromise = performBackgroundRefresh(refreshToken).finally(() => {
      backgroundRefreshPromise = null;
    });
  }
  return backgroundRefreshPromise;
}

// Returns a usable access token, refreshing PROACTIVELY (before expiry) at most once
// per cycle. Returns null while inside a backoff window so the task simply skips the
// send instead of hammering refresh — this is what prevents the rate-limit storm.
async function getBackgroundAccessToken(): Promise<string | null> {
  const auth = await getPersistedAuth();
  const accessToken = auth?.state?.accessToken;
  const refreshToken = auth?.state?.refreshToken;
  if (!refreshToken) return null;

  if (accessToken && isAccessTokenFresh(accessToken, ACCESS_TOKEN_REFRESH_BUFFER_MS)) {
    return accessToken;
  }

  if (Date.now() < backgroundRefreshBackoffUntilMs) {
    return null;
  }

  return runBackgroundRefreshOnce(refreshToken);
}

async function persistPendingBackgroundLocation(payload: BackgroundLocationPayload) {
  hasPendingBackgroundLocation = true;
  await secureStateStorage.setItem(
    BACKGROUND_PENDING_LOCATION_KEY,
    JSON.stringify({
      ...payload,
      queuedAt: new Date().toISOString(),
    }),
  );
}

async function readPendingBackgroundLocation() {
  // Common case: nothing was ever queued in this session → skip the SecureStore read
  // entirely on every fix. (On a headless cold start the flag is false but any queued
  // item is stale anyway — live tracking only cares about the current position.)
  if (!hasPendingBackgroundLocation) return null;
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
  hasPendingBackgroundLocation = false;
  await secureStateStorage.removeItem(BACKGROUND_PENDING_LOCATION_KEY);
}

async function writeSendPolicy(policy: SendPolicy) {
  cachedSendPolicy = policy;
  await secureStateStorage.setItem(
    BACKGROUND_SEND_POLICY_KEY,
    JSON.stringify(policy),
  );
}

async function readSendPolicy(): Promise<SendPolicy> {
  // Hot path: served from memory once the stream has started (writeSendPolicy runs then).
  if (cachedSendPolicy) return cachedSendPolicy;
  const raw = await secureStateStorage.getItem(BACKGROUND_SEND_POLICY_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<SendPolicy>;
      cachedSendPolicy = {
        moveThresholdMeters:
          typeof parsed.moveThresholdMeters === "number"
            ? parsed.moveThresholdMeters
            : DEFAULT_MOVE_THRESHOLD_METERS,
        heartbeatMs:
          typeof parsed.heartbeatMs === "number"
            ? parsed.heartbeatMs
            : DEFAULT_HEARTBEAT_MS,
        minIntervalMs:
          typeof parsed.minIntervalMs === "number"
            ? parsed.minIntervalMs
            : 30_000,
      };
      return cachedSendPolicy;
    } catch {
      // fall through to defaults
    }
  }
  return {
    moveThresholdMeters: DEFAULT_MOVE_THRESHOLD_METERS,
    heartbeatMs: DEFAULT_HEARTBEAT_MS,
    minIntervalMs: 30_000,
  };
}

// Last-sent lives in memory only — it exists purely to throttle sends within a tracking
// session. Persisting it to SecureStore on every fix was pure overhead; if the app is
// cold-started headless, starting fresh just means the first fix sends immediately.
async function writeLastSentLocation(location: LastSentLocation) {
  cachedLastSent = location;
}

async function readLastSentLocation(): Promise<LastSentLocation | null> {
  if (cachedLastSent) return cachedLastSent;
  const raw = await secureStateStorage.getItem(BACKGROUND_LAST_SENT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LastSentLocation;
    if (
      typeof parsed.latitude !== "number" ||
      typeof parsed.longitude !== "number" ||
      typeof parsed.sentAtMs !== "number"
    ) {
      return null;
    }
    cachedLastSent = parsed;
    return parsed;
  } catch {
    return null;
  }
}

async function clearLastSentLocation() {
  cachedLastSent = null;
  await secureStateStorage.removeItem(BACKGROUND_LAST_SENT_KEY);
}

async function sendBackgroundLocationPayload(
  payload: BackgroundLocationPayload,
  allowRefresh = true,
): Promise<BackgroundLocationSendResult> {
  // Proactively resolve a fresh token (single-flight + backoff). Returns null while a
  // refresh backoff window is open (e.g. after a 429), so we skip the send instead of
  // hammering the refresh endpoint — the caller queues it as pending.
  const accessToken = await getBackgroundAccessToken();

  if (!accessToken) {
    return { ok: false, shouldStopTracking: false };
  }

  const response = await fetchWithTimeout(`${API_BASE_URL}/rider/profile/location`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (response?.status === 401 && allowRefresh) {
    // Token looked valid but was rejected (revoked / clock skew). Force ONE refresh —
    // still single-flight and still guarded by the shared backoff window.
    const auth = await getPersistedAuth();
    const refreshToken = auth?.state?.refreshToken;
    if (refreshToken && Date.now() >= backgroundRefreshBackoffUntilMs) {
      const refreshed = await runBackgroundRefreshOnce(refreshToken);
      if (refreshed) {
        return sendBackgroundLocationPayload(payload, false);
      }
    }
    return { ok: false, shouldStopTracking: false };
  }

  if (!response?.ok) {
    return { ok: false, shouldStopTracking: false };
  }

  // Empty activeTrackingOrderId means the final live delivery finished while this
  // background task was still running, so the task should stop its own service.
  const body = (await response.json().catch(() => null)) as {
    data?: {
      activeTrackingOrderId?: string | null;
    };
  } | null;

  return {
    ok: true,
    shouldStopTracking:
      body?.data?.activeTrackingOrderId === "" ||
      body?.data?.activeTrackingOrderId === null,
  };
}

async function sendBackgroundLocation(location: Location.LocationObject): Promise<boolean> {
  const latestPayload = getLocationPayload(location);
  const now = Date.now();

  // Drop implausible fixes (huge accuracy radius, or a teleport that a bike could
  // never do) before they reach the server — this is what stops the rider marker
  // from jumping to a wrong spot and snapping back while the rider is stationary.
  const accepted = shouldAcceptFix({
    latitude: latestPayload.latitude,
    longitude: latestPayload.longitude,
    accuracyMeters: latestPayload.accuracyMeters,
    nowMs: now,
    last: lastAcceptedFix,
    consecutiveRejects,
  });
  if (!accepted) {
    consecutiveRejects += 1;
    return false;
  }
  consecutiveRejects = 0;
  lastAcceptedFix = {
    latitude: latestPayload.latitude,
    longitude: latestPayload.longitude,
    atMs: now,
  };

  // Always try to flush a previously failed send first (offline recovery).
  const pendingPayload = await readPendingBackgroundLocation();
  if (pendingPayload) {
    const pendingSent = await sendBackgroundLocationPayload(pendingPayload);
    if (pendingSent.ok) {
      await clearPendingBackgroundLocation();
    }
    if (pendingSent.shouldStopTracking) {
      await stopRiderBackgroundLocationAsync();
      return true;
    }
  }

  // Throttle by movement OR heartbeat: send when the rider has moved past the move
  // threshold, OR when enough time has passed since the last send. The heartbeat is
  // what keeps the customer's marker/ETA alive while the rider is stuck in traffic.
  const policy = await readSendPolicy();
  const lastSent = await readLastSentLocation();
  const movedMeters = lastSent ? distanceMeters(lastSent, latestPayload) : Infinity;
  const elapsedMs = lastSent ? now - lastSent.sentAtMs : Infinity;
  const shouldSend =
    !lastSent ||
    (elapsedMs >= policy.minIntervalMs &&
      (movedMeters >= policy.moveThresholdMeters || elapsedMs >= policy.heartbeatMs));

  if (!shouldSend) {
    return false;
  }

  const latestSent = await sendBackgroundLocationPayload(latestPayload);
  if (latestSent.shouldStopTracking) {
    await stopRiderBackgroundLocationAsync();
    return true;
  }
  if (latestSent.ok) {
    await writeLastSentLocation({
      latitude: latestPayload.latitude,
      longitude: latestPayload.longitude,
      sentAtMs: now,
    });
  } else {
    await persistPendingBackgroundLocation(latestPayload);
  }
  return false;
}

function queueBackgroundLocationSend(location: Location.LocationObject) {
  if (backgroundLocationSendPromise) {
    queuedBackgroundLocation = location;
    return backgroundLocationSendPromise;
  }

  backgroundLocationSendPromise = (async () => {
    let nextLocation: Location.LocationObject | null = location;

    while (nextLocation) {
      const currentLocation = nextLocation;
      nextLocation = null;
      const stopped = await sendBackgroundLocation(currentLocation);
      if (stopped) {
        queuedBackgroundLocation = null;
        return;
      }

      if (queuedBackgroundLocation) {
        nextLocation = queuedBackgroundLocation;
        queuedBackgroundLocation = null;
      }
    }
  })().finally(() => {
    backgroundLocationSendPromise = null;
  });

  return backgroundLocationSendPromise;
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

    // Hard rate-cap: ignore fixes that arrive faster than the floor, before ANY work
    // (storage, network). Keeps a burst of OS fixes from piling up.
    const nowTaskMs = Date.now();
    if (nowTaskMs - lastTaskProcessedAtMs < MIN_TASK_PROCESS_INTERVAL_MS) {
      return;
    }
    lastTaskProcessedAtMs = nowTaskMs;

    // This task ONLY publishes to the server. It deliberately does NOT touch React
    // state; feeding maps from here re-rendered the UI on every background fix.
    await queueBackgroundLocationSend(latestLocation);
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
  heartbeatMs = DEFAULT_HEARTBEAT_MS,
  accuracy = Location.Accuracy.Balanced,
  notificationBody = "Foodbela is sharing rider location for live delivery tracking.",
}: {
  timeIntervalMs?: number;
  distanceIntervalMeters?: number;
  heartbeatMs?: number;
  accuracy?: Location.Accuracy;
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

    // IMPORTANT: apply the move threshold as the OS displacement filter too (not just as
    // a send filter in the task). With distanceInterval:0 the fused provider streams fixes
    // almost continuously — every one wakes the JS task, and that constant task traffic is
    // what froze the app whenever location was being shared. Letting the OS deliver only
    // after real movement means the task barely runs while the rider is stopped, and at a
    // sane cadence while moving.
    const osDistanceInterval = Math.max(20, distanceIntervalMeters);
    await writeSendPolicy({
      moveThresholdMeters: distanceIntervalMeters,
      heartbeatMs,
      minIntervalMs: timeIntervalMs,
    });

    const signature = `${accuracy}:${timeIntervalMs}:${osDistanceInterval}:${heartbeatMs}`;
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(
      RIDER_BACKGROUND_LOCATION_TASK,
    );

    // Already streaming with the same config → leave it running. This is what keeps
    // tracking alive when one delivery ends and the next is promoted (the bridge
    // calls start again with the same policy).
    if (hasStarted && signature === activeStreamSignature) {
      return true;
    }

    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(RIDER_BACKGROUND_LOCATION_TASK);
    }

    await Location.startLocationUpdatesAsync(RIDER_BACKGROUND_LOCATION_TASK, {
      accuracy,
      timeInterval: timeIntervalMs,
      distanceInterval: osDistanceInterval,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "Foodbela Rider live tracking",
        notificationBody,
        notificationColor: "#0f766e",
      },
    });
    activeStreamSignature = signature;

    return true;
  } catch {
    // A rejected start (background race, OEM restriction) must never bubble up as
    // an uncaught promise rejection. The screen re-arms tracking on app resume.
    return false;
  }
}

export async function stopRiderBackgroundLocationAsync() {
  activeStreamSignature = "";
  queuedBackgroundLocation = null;
  const hasStarted = await Location.hasStartedLocationUpdatesAsync(
    RIDER_BACKGROUND_LOCATION_TASK,
  );

  if (hasStarted) {
    await Location.stopLocationUpdatesAsync(RIDER_BACKGROUND_LOCATION_TASK);
  }

  await setRiderBackgroundTrackingOrderId(null);
  await clearPendingBackgroundLocation();
  await clearLastSentLocation();
}
