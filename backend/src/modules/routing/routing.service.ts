import { fetchWithTimeout } from "../../common/utils/fetch-with-timeout";
import { createInMemoryAsyncCache } from "../../common/utils/in-memory-cache";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { getPlatformContent } from "../public/content.service";
import { createAdminOperationalAlert } from "../admin/admin-alert.service";
import { RoutingApiUsageModel } from "./routing-usage.model";

// Routing abstraction: real road distance/time/ETA + route polyline via Google
// Directions API, with a Haversine (straight-line) fallback. The active provider
// is admin-configurable (operations.routing.provider, default "google"). Google
// results are cached by rounded coordinates so live order tracking does not make
// a paid API call on every poll/location ping.

export type LatLng = { latitude: number; longitude: number };
export type RoutingProvider = "google" | "haversine";
export type RoutingCostMode = "economy" | "balanced" | "precision";
export type OrderRouteMetricsSource =
  | "customer_tracking"
  | "rider_details"
  | "live_location"
  | "order_action"
  | "generic";

export type RouteMetrics = {
  distanceKm: number;
  durationMinutes: number;
  /** Encoded Google polyline of the road route; "" when straight-line. */
  polyline: string;
  provider: RoutingProvider;
  /** True when the duration accounts for live traffic. */
  trafficAware: boolean;
};

const EARTH_RADIUS_KM = 6371;
// Live tracking polls frequently; cache road routes briefly so the rider's
// movement still refreshes the ETA without a Google call on every request.
const ROUTE_CACHE_TTL_MS = 90_000;
const ROUTE_CACHE_STALE_MS = 30_000;
const GOOGLE_TIMEOUT_MS = 4_000;
const DHAKA_TIME_ZONE = "Asia/Dhaka";

type RoutingSettings = {
  provider: RoutingProvider;
  fallbackSpeedKmph: number;
  pickupBufferMinutes: number;
  costMode: RoutingCostMode;
  googleMonthlyLimit: number;
  maxGoogleCallsPerOrder: number;
  routeSessionTtlMinutes: number;
  rerouteCooldownSeconds: number;
  offRouteThresholdMeters: number;
  offRouteConsecutiveUpdates: number;
  periodicRefreshMinutes: number;
  nearDestinationMeters: number;
};

type GoogleRouteContext = {
  source?: OrderRouteMetricsSource;
  orderId?: string;
  sessionKey?: string;
  routeKey?: string;
  settings: RoutingSettings;
};

type RoutePath = {
  points: LatLng[];
  segmentLengthsKm: number[];
  suffixFromPointKm: number[];
};

type OrderRouteSession = {
  route: RouteMetrics;
  origin: LatLng;
  destination: LatLng;
  sessionKey: string;
  routeKey: string;
  path: RoutePath | null;
  fetchedAtMs: number;
  lastRefreshAtMs: number;
  refreshCount: number;
  offRouteStrikes: number;
};

const DEFAULT_ROUTING_SETTINGS: RoutingSettings = {
  provider: "google",
  fallbackSpeedKmph: 22,
  pickupBufferMinutes: 5,
  costMode: "balanced",
  googleMonthlyLimit: 10_000,
  maxGoogleCallsPerOrder: 5,
  routeSessionTtlMinutes: 45,
  rerouteCooldownSeconds: 180,
  offRouteThresholdMeters: 90,
  offRouteConsecutiveUpdates: 3,
  periodicRefreshMinutes: 5,
  nearDestinationMeters: 220,
};

const COST_MODE_DEFAULTS: Record<
  RoutingCostMode,
  Pick<
    RoutingSettings,
    | "maxGoogleCallsPerOrder"
    | "routeSessionTtlMinutes"
    | "rerouteCooldownSeconds"
    | "offRouteThresholdMeters"
    | "offRouteConsecutiveUpdates"
    | "periodicRefreshMinutes"
    | "nearDestinationMeters"
  >
> = {
  economy: {
    maxGoogleCallsPerOrder: 3,
    routeSessionTtlMinutes: 60,
    rerouteCooldownSeconds: 300,
    offRouteThresholdMeters: 120,
    offRouteConsecutiveUpdates: 4,
    periodicRefreshMinutes: 0,
    nearDestinationMeters: 260,
  },
  balanced: {
    maxGoogleCallsPerOrder: 5,
    routeSessionTtlMinutes: 45,
    rerouteCooldownSeconds: 180,
    offRouteThresholdMeters: 90,
    offRouteConsecutiveUpdates: 3,
    periodicRefreshMinutes: 5,
    nearDestinationMeters: 220,
  },
  precision: {
    maxGoogleCallsPerOrder: 8,
    routeSessionTtlMinutes: 30,
    rerouteCooldownSeconds: 90,
    offRouteThresholdMeters: 60,
    offRouteConsecutiveUpdates: 2,
    periodicRefreshMinutes: 3,
    nearDestinationMeters: 180,
  },
};

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function haversineKm(origin: LatLng, destination: LatLng) {
  const deltaLat = toRadians(destination.latitude - origin.latitude);
  const deltaLng = toRadians(destination.longitude - origin.longitude);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRadians(origin.latitude)) *
      Math.cos(toRadians(destination.latitude)) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isValidCoord(point?: LatLng | null): point is LatLng {
  return (
    Boolean(point) &&
    typeof point!.latitude === "number" &&
    Number.isFinite(point!.latitude) &&
    typeof point!.longitude === "number" &&
    Number.isFinite(point!.longitude)
  );
}

function numberSetting(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function integerSetting(value: unknown, fallback: number, min: number, max: number) {
  return Math.round(numberSetting(value, fallback, min, max));
}

async function getRoutingSettings(): Promise<RoutingSettings> {
  const content = await getPlatformContent();
  const routing = ((content.operations as Record<string, any>)?.routing ?? {}) as Record<
    string,
    unknown
  >;
  const provider: RoutingProvider = routing.provider === "haversine" ? "haversine" : "google";
  const costMode: RoutingCostMode =
    routing.costMode === "economy" || routing.costMode === "precision"
      ? routing.costMode
      : "balanced";
  const modeDefaults = COST_MODE_DEFAULTS[costMode];
  return {
    provider,
    fallbackSpeedKmph: numberSetting(
      routing.fallbackSpeedKmph,
      DEFAULT_ROUTING_SETTINGS.fallbackSpeedKmph,
      5,
      120,
    ),
    pickupBufferMinutes: integerSetting(
      routing.pickupBufferMinutes,
      DEFAULT_ROUTING_SETTINGS.pickupBufferMinutes,
      0,
      60,
    ),
    costMode,
    googleMonthlyLimit: integerSetting(
      routing.googleMonthlyLimit,
      DEFAULT_ROUTING_SETTINGS.googleMonthlyLimit,
      0,
      1_000_000,
    ),
    maxGoogleCallsPerOrder: integerSetting(
      routing.maxGoogleCallsPerOrder,
      modeDefaults.maxGoogleCallsPerOrder,
      0,
      100,
    ),
    routeSessionTtlMinutes: integerSetting(
      routing.routeSessionTtlMinutes,
      modeDefaults.routeSessionTtlMinutes,
      5,
      240,
    ),
    rerouteCooldownSeconds: integerSetting(
      routing.rerouteCooldownSeconds,
      modeDefaults.rerouteCooldownSeconds,
      30,
      1800,
    ),
    offRouteThresholdMeters: integerSetting(
      routing.offRouteThresholdMeters,
      modeDefaults.offRouteThresholdMeters,
      20,
      500,
    ),
    offRouteConsecutiveUpdates: integerSetting(
      routing.offRouteConsecutiveUpdates,
      modeDefaults.offRouteConsecutiveUpdates,
      1,
      10,
    ),
    periodicRefreshMinutes: integerSetting(
      routing.periodicRefreshMinutes,
      modeDefaults.periodicRefreshMinutes,
      0,
      60,
    ),
    nearDestinationMeters: integerSetting(
      routing.nearDestinationMeters,
      modeDefaults.nearDestinationMeters,
      50,
      1000,
    ),
  };
}

function haversineMetrics(
  origin: LatLng,
  destination: LatLng,
  speedKmph: number,
  bufferMinutes: number,
): RouteMetrics {
  const distanceKm = Number(haversineKm(origin, destination).toFixed(3));
  const durationMinutes = Math.max(
    1,
    Math.round((distanceKm / Math.max(speedKmph, 1)) * 60 + bufferMinutes),
  );
  return {
    distanceKm,
    durationMinutes,
    polyline: "",
    provider: "haversine",
    trafficAware: false,
  };
}

// ~11m precision — small rider movements reuse the same cache bucket, keeping
// Google Directions usage (and cost) low during live tracking.
function roundCoord(value: number) {
  return Math.round(value * 1e4) / 1e4;
}

function buildCacheKey(origin: LatLng, destination: LatLng) {
  return `${roundCoord(origin.latitude)},${roundCoord(origin.longitude)}->${roundCoord(
    destination.latitude,
  )},${roundCoord(destination.longitude)}`;
}

const routeCache = createInMemoryAsyncCache<RouteMetrics>({
  ttlMs: ROUTE_CACHE_TTL_MS,
  maxEntries: 5000,
  staleWhileRevalidateMs: ROUTE_CACHE_STALE_MS,
});

let monthlyUsageMemo:
  | {
      monthKey: string;
      count: number;
      expiresAtMs: number;
    }
  | null = null;

// Fire the directions-quota admin alert at most once per (month, tier) per process,
// so a busy month does not write a DB alert on every single Google call past 80%.
const QUOTA_ALERT_TIERS = [
  { ratio: 1, key: "exhausted", severity: "critical" as const },
  { ratio: 0.8, key: "warning", severity: "warning" as const },
];
let lastQuotaAlert: { monthKey: string; key: string } | null = null;

async function maybeAlertDirectionsQuota(
  monthKey: string,
  used: number,
  limit: number,
) {
  if (limit <= 0) return;
  const ratio = used / limit;
  const tier = QUOTA_ALERT_TIERS.find((entry) => ratio >= entry.ratio);
  if (!tier) return;
  if (lastQuotaAlert?.monthKey === monthKey && lastQuotaAlert.key === tier.key) {
    return;
  }
  lastQuotaAlert = { monthKey, key: tier.key };

  const remaining = Math.max(0, limit - used);
  try {
    await createAdminOperationalAlert({
      alertType: "directions_quota_warning",
      severity: tier.severity,
      title:
        tier.key === "exhausted"
          ? "Google Directions quota exhausted"
          : "Google Directions quota almost used up",
      description:
        tier.key === "exhausted"
          ? `The monthly Google Directions limit (${limit}) has been reached. Live routes now fall back to straight-line estimates until the next reset. Raise the limit or switch to Economy cost mode in Settings.`
          : `${used} of ${limit} Google Directions calls used this month (${remaining} left). Consider raising the limit or switching to Economy cost mode.`,
      source: "Routing",
      path: "/settings",
      iconKey: "navigation",
      dedupeKey: `directions-quota:${monthKey}:${tier.key}`,
      metadata: { monthKey, used, limit, remaining },
    });
  } catch (error) {
    logger.warn({ error }, "Failed to raise directions quota alert");
  }
}

function getDhakaDateKeys(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DHAKA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((result, part) => {
      if (part.type !== "literal") result[part.type] = part.value;
      return result;
    }, {});

  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  return { dateKey, monthKey: `${parts.year}-${parts.month}` };
}

function normalizeDateKey(value?: string | null) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function startOfDhakaDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000+06:00`);
}

function endOfDhakaDate(dateKey: string) {
  return new Date(`${dateKey}T23:59:59.999+06:00`);
}

function firstDateOfMonth(monthKey: string) {
  return `${monthKey}-01`;
}

function nextMonthResetAt(monthKey: string) {
  const [yearRaw, monthRaw] = monthKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const nextYear = month >= 12 ? year + 1 : year;
  const nextMonth = month >= 12 ? 1 : month + 1;
  return new Date(
    `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00.000+06:00`,
  ).toISOString();
}

async function getMonthlyBillableDirectionsCount(monthKey: string) {
  const now = Date.now();
  if (
    monthlyUsageMemo &&
    monthlyUsageMemo.monthKey === monthKey &&
    monthlyUsageMemo.expiresAtMs > now
  ) {
    return monthlyUsageMemo.count;
  }

  const count = await RoutingApiUsageModel.countDocuments({
    provider: "google",
    api: "directions",
    monthKey,
    billable: true,
  });
  monthlyUsageMemo = { monthKey, count, expiresAtMs: now + 15_000 };
  return count;
}

function incrementMonthlyUsageMemo(monthKey: string) {
  if (monthlyUsageMemo?.monthKey === monthKey) {
    monthlyUsageMemo = {
      ...monthlyUsageMemo,
      count: monthlyUsageMemo.count + 1,
    };
  }
}

async function countOrderBillableDirections(monthKey: string, orderId?: string) {
  if (!orderId) return 0;
  return RoutingApiUsageModel.countDocuments({
    provider: "google",
    api: "directions",
    monthKey,
    billable: true,
    orderId,
  });
}

async function recordRoutingApiUsage(params: {
  context: GoogleRouteContext;
  status: "success" | "failed" | "non_ok" | "monthly_quota_blocked" | "order_cap_blocked";
  billable: boolean;
  startedAtMs?: number;
  distanceKm?: number | null;
  routeDurationMinutes?: number | null;
  reason?: string;
  metadata?: Record<string, unknown>;
}) {
  const occurredAt = new Date();
  const { dateKey, monthKey } = getDhakaDateKeys(occurredAt);
  if (params.billable) incrementMonthlyUsageMemo(monthKey);

  try {
    await RoutingApiUsageModel.create({
      provider: "google",
      api: "directions",
      source: params.context.source ?? "unknown",
      status: params.status,
      billable: params.billable,
      orderId: params.context.orderId ?? "",
      sessionKey: params.context.sessionKey ?? "",
      routeKey: params.context.routeKey ?? "",
      dateKey,
      monthKey,
      durationMs: params.startedAtMs ? Date.now() - params.startedAtMs : 0,
      distanceKm: params.distanceKm ?? null,
      routeDurationMinutes: params.routeDurationMinutes ?? null,
      reason: params.reason ?? "",
      metadata: params.metadata ?? {},
      occurredAt,
    });
  } catch (error) {
    logger.warn({ error }, "Failed to record routing API usage");
  }
}

async function fetchGoogleRoute(
  origin: LatLng,
  destination: LatLng,
  context: GoogleRouteContext,
): Promise<RouteMetrics | null> {
  const apiKey = env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  const { monthKey } = getDhakaDateKeys();
  if (context.settings.googleMonthlyLimit <= 0) {
    await recordRoutingApiUsage({
      context,
      status: "monthly_quota_blocked",
      billable: false,
      reason: "Google monthly limit is set to 0",
    });
    return null;
  }

  const monthUsage = await getMonthlyBillableDirectionsCount(monthKey);
  if (monthUsage >= context.settings.googleMonthlyLimit) {
    await recordRoutingApiUsage({
      context,
      status: "monthly_quota_blocked",
      billable: false,
      reason: "Monthly Google Directions quota reached",
      metadata: {
        monthUsage,
        monthlyLimit: context.settings.googleMonthlyLimit,
      },
    });
    return null;
  }

  if (context.orderId && context.settings.maxGoogleCallsPerOrder <= 0) {
    await recordRoutingApiUsage({
      context,
      status: "order_cap_blocked",
      billable: false,
      reason: "Google calls per order are disabled",
    });
    return null;
  }

  if (context.orderId) {
    const orderUsage = await countOrderBillableDirections(monthKey, context.orderId);
    if (orderUsage >= context.settings.maxGoogleCallsPerOrder) {
      await recordRoutingApiUsage({
        context,
        status: "order_cap_blocked",
        billable: false,
        reason: "Per-order Google Directions cap reached",
        metadata: {
          orderUsage,
          maxGoogleCallsPerOrder: context.settings.maxGoogleCallsPerOrder,
        },
      });
      return null;
    }
  }

  const params = new URLSearchParams({
    origin: `${origin.latitude},${origin.longitude}`,
    destination: `${destination.latitude},${destination.longitude}`,
    mode: "driving",
    departure_time: "now",
    key: apiKey,
  });
  const url = `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`;

  const startedAtMs = Date.now();
  const response = await fetchWithTimeout(url, { timeoutMs: GOOGLE_TIMEOUT_MS }).catch(
    (error) => {
      logger.warn({ error }, "Google Directions request failed");
      return null;
    },
  );
  if (!response || !response.ok) {
    await recordRoutingApiUsage({
      context,
      status: "failed",
      billable: true,
      startedAtMs,
      reason: response ? `HTTP ${response.status}` : "Request failed or timed out",
    });
    return null;
  }

  const data = (await response.json().catch(() => null)) as {
    status?: string;
    error_message?: string;
    routes?: Array<{
      overview_polyline?: { points?: string };
      legs?: Array<{
        distance?: { value?: number };
        duration?: { value?: number };
        duration_in_traffic?: { value?: number };
      }>;
    }>;
  } | null;

  const leg = data?.routes?.[0]?.legs?.[0];
  if (data?.status !== "OK" || !leg) {
    if (data?.status && data.status !== "OK") {
      // error_message tells you exactly why (e.g. "This API project is not
      // authorized to use this API" = Directions API not enabled, or
      // "API keys with referer restrictions cannot be used with this API" =
      // wrong key type — use an unrestricted/IP-restricted server key).
      logger.warn(
        { status: data.status, errorMessage: data.error_message },
        "Google Directions returned non-OK status — falling back to Haversine",
      );
    }
    await recordRoutingApiUsage({
      context,
      status: "non_ok",
      billable: true,
      startedAtMs,
      reason: data?.status ?? "Missing Google route",
      metadata: {
        errorMessage: data?.error_message ?? "",
      },
    });
    return null;
  }

  const distanceKm = Number(((leg.distance?.value ?? 0) / 1000).toFixed(3));
  const durationSeconds = leg.duration_in_traffic?.value ?? leg.duration?.value ?? 0;
  const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));

  const route: RouteMetrics = {
    distanceKm,
    durationMinutes,
    polyline: data.routes?.[0]?.overview_polyline?.points ?? "",
    provider: "google",
    trafficAware: Boolean(leg.duration_in_traffic?.value),
  };

  await recordRoutingApiUsage({
    context,
    status: "success",
    billable: true,
    startedAtMs,
    distanceKm: route.distanceKm,
    routeDurationMinutes: route.durationMinutes,
  });

  // This call just consumed one more billable unit; warn admins as the monthly
  // budget runs low so they can raise the limit before everything degrades to
  // straight-line routing. Fire-and-forget so it never delays the route.
  void maybeAlertDirectionsQuota(
    monthKey,
    monthUsage + 1,
    context.settings.googleMonthlyLimit,
  );

  return route;
}

/**
 * Resolve road distance, ETA and route polyline between two points using the
 * admin-selected provider. Always returns a usable result (falls back to
 * Haversine on any Google failure) or null if the inputs are invalid.
 */
export async function getRouteMetrics(
  origin?: LatLng | null,
  destination?: LatLng | null,
): Promise<RouteMetrics | null> {
  if (!isValidCoord(origin) || !isValidCoord(destination)) return null;

  const settings = await getRoutingSettings();
  const fallback = () =>
    haversineMetrics(
      origin,
      destination,
      settings.fallbackSpeedKmph,
      settings.pickupBufferMinutes,
    );

  if (settings.provider === "haversine") {
    return fallback();
  }

  try {
    return await routeCache.getOrSet(buildCacheKey(origin, destination), async () => {
      const routeKey = buildCacheKey(origin, destination);
      const googleRoute = await fetchGoogleRoute(origin, destination, {
        source: "generic",
        routeKey,
        settings,
      });
      return googleRoute ?? fallback();
    });
  } catch (error) {
    logger.warn({ error }, "Route metrics resolution failed; using Haversine fallback");
    return fallback();
  }
}

/** Straight-line distance helper (km) kept for callers that only need distance. */
export function getStraightLineDistanceKm(origin?: LatLng | null, destination?: LatLng | null) {
  if (!isValidCoord(origin) || !isValidCoord(destination)) return null;
  return Number(haversineKm(origin, destination).toFixed(3));
}

const orderRouteSessions = new Map<string, OrderRouteSession>();
let lastSessionPruneMs = 0;

function decodePolyline(polyline: string): LatLng[] {
  if (!polyline) return [];
  const points: LatLng[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < polyline.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = polyline.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < polyline.length);
    latitude += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = polyline.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < polyline.length);
    longitude += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ latitude: latitude / 1e5, longitude: longitude / 1e5 });
  }

  return points;
}

function buildRoutePath(route: RouteMetrics, destination: LatLng): RoutePath | null {
  const decoded = decodePolyline(route.polyline);
  const points = decoded.length >= 2 ? decoded : [];
  if (!points.length) return null;

  const last = points[points.length - 1];
  if (last && haversineKm(last, destination) > 0.05) {
    points.push(destination);
  }

  const segmentLengthsKm: number[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    segmentLengthsKm.push(haversineKm(points[index], points[index + 1]));
  }

  const suffixFromPointKm = new Array(points.length).fill(0);
  for (let index = points.length - 2; index >= 0; index -= 1) {
    suffixFromPointKm[index] = suffixFromPointKm[index + 1] + segmentLengthsKm[index];
  }

  return { points, segmentLengthsKm, suffixFromPointKm };
}

function toLocalMeters(point: LatLng, referenceLatitude: number) {
  const latMeters = 110_540;
  const lngMeters = 111_320 * Math.cos(toRadians(referenceLatitude));
  return {
    x: point.longitude * lngMeters,
    y: point.latitude * latMeters,
  };
}

function projectPointToRoute(path: RoutePath, origin: LatLng) {
  let best = {
    offRouteKm: Number.POSITIVE_INFINITY,
    remainingRouteKm: 0,
  };

  for (let index = 0; index < path.points.length - 1; index += 1) {
    const start = path.points[index];
    const end = path.points[index + 1];
    const referenceLatitude = (start.latitude + end.latitude + origin.latitude) / 3;
    const startMeters = toLocalMeters(start, referenceLatitude);
    const endMeters = toLocalMeters(end, referenceLatitude);
    const originMeters = toLocalMeters(origin, referenceLatitude);
    const dx = endMeters.x - startMeters.x;
    const dy = endMeters.y - startMeters.y;
    const lengthSquared = dx * dx + dy * dy;
    const t =
      lengthSquared > 0
        ? Math.min(
            1,
            Math.max(
              0,
              ((originMeters.x - startMeters.x) * dx + (originMeters.y - startMeters.y) * dy) /
                lengthSquared,
            ),
          )
        : 0;
    const projected = {
      x: startMeters.x + dx * t,
      y: startMeters.y + dy * t,
    };
    const offRouteKm =
      Math.hypot(originMeters.x - projected.x, originMeters.y - projected.y) / 1000;
    const remainingRouteKm =
      path.segmentLengthsKm[index] * (1 - t) + path.suffixFromPointKm[index + 1];

    if (offRouteKm < best.offRouteKm) {
      best = { offRouteKm, remainingRouteKm };
    }
  }

  return best.offRouteKm === Number.POSITIVE_INFINITY
    ? { offRouteKm: 0, remainingRouteKm: 0 }
    : best;
}

function routeWithRemainingDistance(
  route: RouteMetrics,
  distanceKm: number,
  settings: RoutingSettings,
  options: { keepTrafficAware?: boolean } = {},
): RouteMetrics {
  const roundedDistanceKm = Number(Math.max(0, distanceKm).toFixed(3));
  const minutesPerKm =
    route.distanceKm > 0 && route.durationMinutes > 0
      ? route.durationMinutes / route.distanceKm
      : 60 / Math.max(settings.fallbackSpeedKmph, 1);
  return {
    ...route,
    distanceKm: roundedDistanceKm,
    durationMinutes: Math.max(1, Math.round(roundedDistanceKm * minutesPerKm)),
    trafficAware: options.keepTrafficAware ?? route.trafficAware,
  };
}

function projectSessionRoute(
  session: OrderRouteSession,
  origin: LatLng,
  destination: LatLng,
  settings: RoutingSettings,
) {
  const directDistanceKm = haversineKm(origin, destination);
  if (directDistanceKm * 1000 <= settings.nearDestinationMeters) {
    return {
      route: routeWithRemainingDistance(session.route, directDistanceKm, settings),
      offRouteMeters: 0,
      nearDestination: true,
    };
  }

  if (!session.path) {
    return {
      route: routeWithRemainingDistance(session.route, directDistanceKm, settings, {
        keepTrafficAware: false,
      }),
      offRouteMeters: 0,
      nearDestination: false,
    };
  }

  const projection = projectPointToRoute(session.path, origin);
  const remainingDistanceKm = projection.offRouteKm + projection.remainingRouteKm;
  return {
    route: routeWithRemainingDistance(session.route, remainingDistanceKm, settings),
    offRouteMeters: projection.offRouteKm * 1000,
    nearDestination: false,
  };
}

function buildSessionKey(orderId: string, sessionKey: string) {
  return `order:${orderId}:${sessionKey}`;
}

function buildOrderRouteKey(sessionKey: string, destination: LatLng) {
  return `${sessionKey}:${roundCoord(destination.latitude)},${roundCoord(destination.longitude)}`;
}

function pruneOrderRouteSessions(settings: RoutingSettings) {
  const now = Date.now();
  if (now - lastSessionPruneMs < 60_000) return;
  lastSessionPruneMs = now;

  const maxAgeMs = Math.max(settings.routeSessionTtlMinutes * 2, 60) * 60_000;
  for (const [key, session] of orderRouteSessions.entries()) {
    if (now - session.fetchedAtMs > maxAgeMs) {
      orderRouteSessions.delete(key);
    }
  }

  if (orderRouteSessions.size <= 5000) return;
  const sorted = [...orderRouteSessions.entries()].sort(
    (a, b) => a[1].fetchedAtMs - b[1].fetchedAtMs,
  );
  for (const [key] of sorted.slice(0, orderRouteSessions.size - 5000)) {
    orderRouteSessions.delete(key);
  }
}

function createOrderRouteSession(params: {
  route: RouteMetrics;
  origin: LatLng;
  destination: LatLng;
  sessionKey: string;
  routeKey: string;
  previous?: OrderRouteSession | null;
}) {
  const now = Date.now();
  return {
    route: params.route,
    origin: params.origin,
    destination: params.destination,
    sessionKey: params.sessionKey,
    routeKey: params.routeKey,
    path: buildRoutePath(params.route, params.destination),
    fetchedAtMs: now,
    lastRefreshAtMs: now,
    refreshCount: (params.previous?.refreshCount ?? 0) + (params.previous ? 1 : 0),
    offRouteStrikes: 0,
  } satisfies OrderRouteSession;
}

function shouldRefreshOrderRoute(params: {
  session: OrderRouteSession;
  origin: LatLng;
  destination: LatLng;
  routeKey: string;
  projected: ReturnType<typeof projectSessionRoute>;
  settings: RoutingSettings;
  source: OrderRouteMetricsSource;
  forceRefresh?: boolean;
}) {
  const now = Date.now();
  const cooldownMs = params.settings.rerouteCooldownSeconds * 1000;
  const canRefresh = now - params.session.lastRefreshAtMs >= cooldownMs;
  const sessionAgeMs = now - params.session.fetchedAtMs;
  const ttlExpired = sessionAgeMs >= params.settings.routeSessionTtlMinutes * 60_000;
  const periodicRefreshDue =
    params.source === "live_location" &&
    params.settings.periodicRefreshMinutes > 0 &&
    sessionAgeMs >= params.settings.periodicRefreshMinutes * 60_000;
  const destinationChanged = params.routeKey !== params.session.routeKey;
  const offRoute = params.projected.offRouteMeters >= params.settings.offRouteThresholdMeters;

  params.session.offRouteStrikes = offRoute ? params.session.offRouteStrikes + 1 : 0;

  if (params.forceRefresh) return true;
  if (destinationChanged) return canRefresh;
  if (params.projected.nearDestination) return false;
  if (ttlExpired) return canRefresh;
  if (periodicRefreshDue) return canRefresh;
  return (
    params.source === "live_location" &&
    params.session.offRouteStrikes >= params.settings.offRouteConsecutiveUpdates &&
    canRefresh
  );
}

/**
 * Per-order route resolution for live tracking. The first request creates a
 * route session. Later rider pings project the live point on that cached route,
 * and Google is called only when admin rules say a refresh is worth the cost.
 */
export async function getOrderRouteMetrics(params: {
  orderId: string;
  origin?: LatLng | null;
  destination?: LatLng | null;
  source?: OrderRouteMetricsSource;
  sessionKey?: string;
  forceRefresh?: boolean;
  /**
   * When false, never spend a paid Google Directions call — return a straight-line
   * (Haversine) estimate instead. Used for the pre-pickup rider→restaurant leg, where
   * precise road routing is not worth the cost (the rider uses external turn-by-turn).
   * Paid routing is reserved for the customer-facing delivery leg after pickup.
   */
  allowGoogle?: boolean;
}): Promise<RouteMetrics | null> {
  if (!isValidCoord(params.origin) || !isValidCoord(params.destination)) return null;

  const origin = params.origin;
  const destination = params.destination;
  const settings = await getRoutingSettings();
  const source = params.source ?? "generic";
  const sessionKey = params.sessionKey ?? "delivery_leg";
  const fallback = () =>
    haversineMetrics(origin, destination, settings.fallbackSpeedKmph, settings.pickupBufferMinutes);

  if (params.allowGoogle === false) {
    return fallback();
  }

  if (settings.provider === "haversine" || !params.orderId) {
    return settings.provider === "haversine" ? fallback() : getRouteMetrics(origin, destination);
  }

  pruneOrderRouteSessions(settings);

  const mapKey = buildSessionKey(params.orderId, sessionKey);
  const routeKey = buildOrderRouteKey(sessionKey, destination);
  const currentSession = orderRouteSessions.get(mapKey) ?? null;
  const context: GoogleRouteContext = {
    source,
    orderId: params.orderId,
    sessionKey,
    routeKey,
    settings,
  };

  try {
    if (currentSession) {
      const projected = projectSessionRoute(currentSession, origin, destination, settings);
      const shouldRefresh = shouldRefreshOrderRoute({
        session: currentSession,
        origin,
        destination,
        routeKey,
        projected,
        settings,
        source,
        forceRefresh: params.forceRefresh,
      });

      if (!shouldRefresh) {
        return projected.route;
      }

      currentSession.lastRefreshAtMs = Date.now();
      const googleRoute = await fetchGoogleRoute(origin, destination, context);
      if (googleRoute) {
        const nextSession = createOrderRouteSession({
          route: googleRoute,
          origin,
          destination,
          sessionKey,
          routeKey,
          previous: currentSession,
        });
        orderRouteSessions.set(mapKey, nextSession);
        return nextSession.route;
      }

      return projected.route;
    }

    const googleRoute = await fetchGoogleRoute(origin, destination, context);
    const route = googleRoute ?? fallback();
    orderRouteSessions.set(
      mapKey,
      createOrderRouteSession({
        route,
        origin,
        destination,
        sessionKey,
        routeKey,
      }),
    );
    return route;
  } catch (error) {
    logger.warn({ error }, "Order route metrics failed; using Haversine fallback");
    return currentSession
      ? projectSessionRoute(currentSession, origin, destination, settings).route
      : fallback();
  }
}

export async function getRoutingApiUsageAnalytics(params: {
  from?: string | null;
  to?: string | null;
} = {}) {
  const settings = await getRoutingSettings();
  const currentKeys = getDhakaDateKeys();
  const defaultFrom = firstDateOfMonth(currentKeys.monthKey);
  const fromKey = normalizeDateKey(params.from) || defaultFrom;
  const toKey = normalizeDateKey(params.to) || currentKeys.dateKey;
  const fromDate = startOfDhakaDate(fromKey);
  const toDate = endOfDhakaDate(toKey);
  const rangeStart = fromDate <= toDate ? fromDate : startOfDhakaDate(toKey);
  const rangeEnd = fromDate <= toDate ? toDate : endOfDhakaDate(fromKey);
  const rangeFromKey = fromDate <= toDate ? fromKey : toKey;
  const rangeToKey = fromDate <= toDate ? toKey : fromKey;

  const baseQuery = {
    provider: "google",
    api: "directions",
    occurredAt: { $gte: rangeStart, $lte: rangeEnd },
  };
  const currentMonthUsed = await getMonthlyBillableDirectionsCount(currentKeys.monthKey);
  const [totals, byDate, bySource, recent] = await Promise.all([
    RoutingApiUsageModel.aggregate([
      { $match: baseQuery },
      {
        $group: {
          _id: null,
          totalEvents: { $sum: 1 },
          used: { $sum: { $cond: ["$billable", 1, 0] } },
          success: { $sum: { $cond: [{ $eq: ["$status", "success"] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
          nonOk: { $sum: { $cond: [{ $eq: ["$status", "non_ok"] }, 1, 0] } },
          blocked: {
            $sum: {
              $cond: [
                { $in: ["$status", ["monthly_quota_blocked", "order_cap_blocked"]] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
    RoutingApiUsageModel.aggregate([
      { $match: baseQuery },
      {
        $group: {
          _id: "$dateKey",
          totalEvents: { $sum: 1 },
          used: { $sum: { $cond: ["$billable", 1, 0] } },
          success: { $sum: { $cond: [{ $eq: ["$status", "success"] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
          nonOk: { $sum: { $cond: [{ $eq: ["$status", "non_ok"] }, 1, 0] } },
          blocked: {
            $sum: {
              $cond: [
                { $in: ["$status", ["monthly_quota_blocked", "order_cap_blocked"]] },
                1,
                0,
              ],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    RoutingApiUsageModel.aggregate([
      { $match: baseQuery },
      {
        $group: {
          _id: "$source",
          totalEvents: { $sum: 1 },
          used: { $sum: { $cond: ["$billable", 1, 0] } },
          success: { $sum: { $cond: [{ $eq: ["$status", "success"] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
          nonOk: { $sum: { $cond: [{ $eq: ["$status", "non_ok"] }, 1, 0] } },
          blocked: {
            $sum: {
              $cond: [
                { $in: ["$status", ["monthly_quota_blocked", "order_cap_blocked"]] },
                1,
                0,
              ],
            },
          },
        },
      },
      { $sort: { used: -1, totalEvents: -1 } },
    ]),
    RoutingApiUsageModel.find(baseQuery)
      .sort({ occurredAt: -1 })
      .limit(12)
      .lean(),
  ]);

  const total = totals[0] ?? {
    totalEvents: 0,
    used: 0,
    success: 0,
    failed: 0,
    nonOk: 0,
    blocked: 0,
  };
  const limit = settings.googleMonthlyLimit;

  return {
    settings: {
      provider: settings.provider,
      costMode: settings.costMode,
      googleMonthlyLimit: limit,
      maxGoogleCallsPerOrder: settings.maxGoogleCallsPerOrder,
      routeSessionTtlMinutes: settings.routeSessionTtlMinutes,
      rerouteCooldownSeconds: settings.rerouteCooldownSeconds,
      offRouteThresholdMeters: settings.offRouteThresholdMeters,
      offRouteConsecutiveUpdates: settings.offRouteConsecutiveUpdates,
      periodicRefreshMinutes: settings.periodicRefreshMinutes,
      nearDestinationMeters: settings.nearDestinationMeters,
    },
    month: {
      key: currentKeys.monthKey,
      limit,
      used: currentMonthUsed,
      remaining: Math.max(0, limit - currentMonthUsed),
      resetAt: nextMonthResetAt(currentKeys.monthKey),
    },
    range: {
      from: rangeFromKey,
      to: rangeToKey,
      totalEvents: total.totalEvents,
      used: total.used,
      success: total.success,
      failed: total.failed,
      nonOk: total.nonOk,
      blocked: total.blocked,
    },
    byDate: byDate.map((row) => ({
      date: row._id,
      totalEvents: row.totalEvents,
      used: row.used,
      success: row.success,
      failed: row.failed,
      nonOk: row.nonOk,
      blocked: row.blocked,
    })),
    bySource: bySource.map((row) => ({
      source: row._id || "unknown",
      totalEvents: row.totalEvents,
      used: row.used,
      success: row.success,
      failed: row.failed,
      nonOk: row.nonOk,
      blocked: row.blocked,
    })),
    recent: recent.map((entry) => ({
      id: String(entry._id ?? ""),
      source: entry.source ?? "unknown",
      status: entry.status ?? "unknown",
      billable: Boolean(entry.billable),
      orderId: entry.orderId ?? "",
      sessionKey: entry.sessionKey ?? "",
      dateKey: entry.dateKey ?? "",
      reason: entry.reason ?? "",
      occurredAt: entry.occurredAt ? new Date(entry.occurredAt).toISOString() : null,
    })),
  };
}
