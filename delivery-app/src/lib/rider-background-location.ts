import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { AppState, Platform } from "react-native";

import { API_BASE_URL } from "@/src/config/api";
import { secureStateStorage } from "@/src/lib/secure-storage";
import { shouldAcceptFix, type AcceptedFix } from "@/src/lib/location-quality";
import { getRiderLocationPayload } from "@/src/lib/rider-location-payload";

// Last GPS fix we trusted + how many we've rejected since, so the quality gate can
// detect teleports and re-baseline after a bad reference. Module-level: persists for
// the life of the foreground-service task, resets to a clean slate if it restarts.
let lastAcceptedFix: AcceptedFix | null = null;
let consecutiveRejects = 0;
// Signature of the currently-running stream (accuracy/interval/etc). Lets repeated
// start calls be idempotent: if the config is unchanged we DON'T stop+restart, so
// the foreground service survives order-to-order handoffs (a restart in the
// background would fail and drop tracking).
let activeStreamSignature = "";
let backgroundAuthPrepared = false;
let nativeStreamStartedAtMs = 0;
let lastNativeFixAtMs = 0;

export function isRiderNativeLocationStalled(nowMs = Date.now()) {
  return nativeStreamStartedAtMs > 0 &&
    nowMs - Math.max(nativeStreamStartedAtMs, lastNativeFixAtMs) >= 60_000;
}

// Suspend only the GPS stream when falling back; retain the active delivery and
// upload cadence. Full delivery completion uses stopRiderBackgroundLocationAsync.
export async function suspendRiderNativeLocationAsync() {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(RIDER_BACKGROUND_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(RIDER_BACKGROUND_LOCATION_TASK);
    }
    activeStreamSignature = "";
    nativeStreamStartedAtMs = 0;
    lastNativeFixAtMs = 0;
    return true;
  } catch {
    warnTrackingFailure("Native location service could not stop for recovery");
    return false;
  }
}

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

const DEFAULT_MOVE_THRESHOLD_METERS = 30;
// Even when the rider is stationary (traffic, waiting at a gate), send at least this
// often so the customer's marker and ETA never freeze. Kept in sync with the admin
// policy's passiveHeartbeat default (25s) so a slow last-mile still refreshes the
// customer roughly every ~25s instead of once a minute.
const DEFAULT_HEARTBEAT_MS = 25_000;
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

// The OS can stream fixes faster than we need (distanceInterval:0 keeps the stationary
// heartbeat alive). Process a fix at most this often so a burst never piles up work.
const MIN_TASK_PROCESS_INTERVAL_MS = 3000;
let lastTaskProcessedAtMs = 0;
let locationProcessing = false;
let lastWarningAtMs = 0;

function warnTrackingFailure(reason: string, status?: number) {
  // Never log coordinates or credentials. Limit noise on slow/offline networks.
  if (Date.now() - lastWarningAtMs < 30_000) return;
  lastWarningAtMs = Date.now();
  console.warn("[rider-tracking]", reason, status ?? "");
}

// In-memory caches so the hot path (every processed fix) does NO SecureStore I/O — that
// per-fix crypto storage cost, once fixes streamed in, is what froze the app while
// sharing location. Written once on start / updated in memory on send.
let cachedSendPolicy: SendPolicy | null = null;
let cachedLastSent: LastSentLocation | null = null;
// Clear a queue left by a previous process once, then avoid storage on each send.
let pendingNeedsClear = true;

type SendPolicy = {
  moveThresholdMeters: number;
  heartbeatMs: number;
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

type BackgroundLocationPayload = ReturnType<typeof getRiderLocationPayload>;

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
    warnTrackingFailure("Token refresh rejected", response.status);
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
  pendingNeedsClear = true;
  await secureStateStorage.setItem(
    BACKGROUND_PENDING_LOCATION_KEY,
    JSON.stringify({
      ...payload,
      queuedAt: new Date().toISOString(),
    }),
  );
}

async function clearPendingBackgroundLocation() {
  if (!pendingNeedsClear) return;
  await secureStateStorage.removeItem(BACKGROUND_PENDING_LOCATION_KEY);
  pendingNeedsClear = false;
}

async function writeSendPolicy(policy: SendPolicy) {
  cachedSendPolicy = policy;
  await secureStateStorage.setItem(
    BACKGROUND_SEND_POLICY_KEY,
    JSON.stringify(policy),
  );
}

async function readSendPolicy(): Promise<SendPolicy> {
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
      };
      return cachedSendPolicy;
    } catch {
      // fall through to defaults
    }
  }
  return {
    moveThresholdMeters: DEFAULT_MOVE_THRESHOLD_METERS,
    heartbeatMs: DEFAULT_HEARTBEAT_MS,
  };
}

// Last-sent lives in memory only — it exists purely to throttle sends within a tracking
// session. Persisting it every fix was pure overhead; a headless cold start just sends
// the first fix immediately.
async function writeLastSentLocation(location: LastSentLocation) {
  cachedLastSent = location;
}

async function readLastSentLocation(): Promise<LastSentLocation | null> {
  return cachedLastSent;
}

async function clearLastSentLocation() {
  cachedLastSent = null;
  await secureStateStorage.removeItem(BACKGROUND_LAST_SENT_KEY);
}

async function sendBackgroundLocationPayload(
  payload: BackgroundLocationPayload,
  allowRefresh = true,
) {
  // Proactively resolve a fresh token (single-flight + backoff). Returns null while a
  // refresh backoff window is open (e.g. after a 429), so we skip the send instead of
  // hammering the refresh endpoint — the caller queues it as pending.
  const accessToken = await getBackgroundAccessToken();

  if (!accessToken) {
    warnTrackingFailure("No usable token for location upload");
    return false;
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
    return false;
  }

  if (!response?.ok) {
    warnTrackingFailure("Location upload failed", response?.status);
    return false;
  }

  // Lifecycle is owned solely by RiderLocationBridge (it starts/stops based on
  // whether the rider has any active delivery). The task no longer self-stops on a
  // single "no active order" response — that used to kill tracking during the brief
  // window between one order being delivered and the next being promoted, so the
  // next order's customer got no updates until the rider reopened the app.
  return true;
}

async function sendBackgroundLocation(location: Location.LocationObject) {
  const latestPayload = getRiderLocationPayload(location);
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
    return;
  }
  consecutiveRejects = 0;
  lastAcceptedFix = {
    latitude: latestPayload.latitude,
    longitude: latestPayload.longitude,
    atMs: now,
  };

  // Recover with the newest accepted fix, never replay an old queued coordinate
  // as a fresh position after reconnecting.

  // Throttle by movement OR heartbeat: send when the rider has moved past the move
  // threshold, OR when enough time has passed since the last send. The heartbeat is
  // what keeps the customer's marker/ETA alive while the rider is stuck in traffic.
  const policy = await readSendPolicy();
  const lastSent = await readLastSentLocation();
  const movedMeters = lastSent ? distanceMeters(lastSent, latestPayload) : Infinity;
  const elapsedMs = lastSent ? now - lastSent.sentAtMs : Infinity;
  const shouldSend =
    !lastSent ||
    movedMeters >= policy.moveThresholdMeters ||
    elapsedMs >= policy.heartbeatMs;

  if (!shouldSend) {
    return;
  }

  const latestSent = await sendBackgroundLocationPayload(latestPayload);
  if (latestSent) {
    await clearPendingBackgroundLocation();
    await writeLastSentLocation({
      latitude: latestPayload.latitude,
      longitude: latestPayload.longitude,
      sentAtMs: now,
    });
  } else {
    await persistPendingBackgroundLocation(latestPayload);
  }
}

// Both native tasks and the foreground fallback use the same quality gate,
// cadence and single-flight upload path. Slow PATCHes cannot pile up callbacks.
export async function publishRiderLocationAsync(location: Location.LocationObject) {
  const nowMs = Date.now();
  if (locationProcessing || nowMs - lastTaskProcessedAtMs < MIN_TASK_PROCESS_INTERVAL_MS) return;
  lastTaskProcessedAtMs = nowMs;
  locationProcessing = true;
  try {
    await sendBackgroundLocation(location);
  } finally {
    locationProcessing = false;
  }
}

TaskManager.defineTask(
  RIDER_BACKGROUND_LOCATION_TASK,
  async ({ data, error }: TaskManager.TaskManagerTaskBody<LocationTaskData>) => {
    if (error) {
      warnTrackingFailure("Native location task failed");
      return;
    }

    const locations = data?.locations ?? [];
    const latestLocation = locations[locations.length - 1];
    if (!latestLocation) {
      return;
    }
    lastNativeFixAtMs = Date.now();

    await publishRiderLocationAsync(latestLocation).catch(() => {
      warnTrackingFailure("Native location processing failed");
    });
  },
);

export async function setRiderBackgroundTrackingOrderId(orderId: string | null) {
  if (orderId) {
    await secureStateStorage.setItem(BACKGROUND_TRACKING_ORDER_KEY, orderId);
    return;
  }

  await secureStateStorage.removeItem(BACKGROUND_TRACKING_ORDER_KEY);
}

// The order we were actively tracking when the app was last alive. Present ⇒ a delivery
// was in progress and we did not cleanly stop, so on reopen we can keep the foreground
// service alive immediately instead of dropping it while the orders query reloads.
export async function getRiderBackgroundTrackingOrderId(): Promise<string | null> {
  try {
    const stored = await secureStateStorage.getItem(BACKGROUND_TRACKING_ORDER_KEY);
    return stored && stored.trim() ? stored : null;
  } catch {
    return null;
  }
}

async function hasBackgroundPermission() {
  if (Platform.OS === "web") {
    return false;
  }

  // CHECK the current grant, never REQUEST here. startRiderBackgroundLocationAsync runs
  // on every app-resume (AppState "active"), and requesting permission pops the system
  // GrantPermissionsActivity dialog — which itself backgrounds our activity, then resuming
  // fires "active" again, which starts again, which requests again… a pause↔resume storm
  // (~15×/sec) that pinned the CPU and got the app killed after pickup. The one-time
  // Permission requests belong to the location access/health cards; here we only read.
  const foreground = await Location.getForegroundPermissionsAsync();
  if (foreground.status !== "granted") {
    return false;
  }

  const background = await Location.getBackgroundPermissionsAsync();
  return background.status === "granted";
}

export async function startRiderBackgroundLocationAsync({
  timeIntervalMs = 30000,
  distanceIntervalMeters = DEFAULT_MOVE_THRESHOLD_METERS,
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
    // The foreground fallback must obey the same admin cadence even when
    // background permission/native startup is unavailable.
    await writeSendPolicy({ moveThresholdMeters: distanceIntervalMeters, heartbeatMs });
    if (!(await hasBackgroundPermission())) {
      warnTrackingFailure("Background tracking permission unavailable");
      return false;
    }
    // Re-save old iOS auth once while unlocked to migrate its original
    // WHEN_UNLOCKED keychain accessibility to AFTER_FIRST_UNLOCK.
    if (Platform.OS === "ios" && AppState.currentState === "active" && !backgroundAuthPrepared) {
      const auth = await getPersistedAuth();
      if (auth) {
        await writePersistedAuth(auth);
        backgroundAuthPrepared = true;
      }
    }

    // The move threshold is applied as a *send* filter inside the task (see
    // sendBackgroundLocation), not as the OS displacement filter — otherwise a
    // stationary rider would get no OS samples at all and the heartbeat could
    // never fire. So the OS streams samples on the time interval, and the task
    // decides whether each one is worth sending.
    const signature = `${accuracy}:${timeIntervalMs}:${distanceIntervalMeters}:${heartbeatMs}`;
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
      // Sample while stationary too; movement and heartbeat throttle uploads in
      // JS, with a single-flight/3s guard before any expensive processing.
      distanceInterval: 0,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "Foodbela Rider live tracking",
        notificationBody,
        notificationColor: "#0f766e",
      },
    });
    activeStreamSignature = signature;
    nativeStreamStartedAtMs = Date.now();
    lastNativeFixAtMs = 0;

    return true;
  } catch {
    warnTrackingFailure("Native location service could not start");
    // A rejected start (background race, OEM restriction) must never bubble up as
    // an uncaught promise rejection. The screen re-arms tracking on app resume.
    return false;
  }
}

export async function stopRiderBackgroundLocationAsync() {
  activeStreamSignature = "";
  nativeStreamStartedAtMs = 0;
  lastNativeFixAtMs = 0;
  try {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(
      RIDER_BACKGROUND_LOCATION_TASK,
    );
    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(RIDER_BACKGROUND_LOCATION_TASK);
    }
  } catch {
    // The task may not be registered/running at this moment (app start with no active
    // delivery, a hot reload, or a stale native service left by a previous launch).
    // expo throws TaskNotFoundException here — it's harmless (there's nothing to stop),
    // so we swallow it instead of letting it surface as an uncaught promise rejection
    // (which showed up as those red "stopLocationUpdatesAsync rejected" crashes).
  }

  await setRiderBackgroundTrackingOrderId(null);
  await clearPendingBackgroundLocation();
  await clearLastSentLocation();
}
