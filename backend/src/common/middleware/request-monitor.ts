import type { NextFunction, Request, Response } from "express";

type RequestMonitorApp =
  | "admin"
  | "owner"
  | "rider"
  | "customer"
  | "public"
  | "system"
  | "unknown";

type RequestMonitorEvent = {
  actor?: {
    id: string;
    key: string;
    role: string;
  };
  app: RequestMonitorApp;
  durationMs: number;
  errorCode?: string;
  errorMessage?: string;
  method: string;
  orderId?: string;
  path: string;
  route: string;
  statusCode: number;
  timestamp: number;
};

export const requestTrafficRanges = ["60s", "5m", "15m", "1h", "6h", "24h"] as const;
export type RequestTrafficRange = (typeof requestTrafficRanges)[number];
export type RequestMonitorAppFilter = RequestMonitorApp | "all";

const trafficRangeConfig: Record<
  RequestTrafficRange,
  { bucketMs: number; windowMs: number }
> = {
  "60s": { bucketMs: 5 * 1000, windowMs: 60 * 1000 },
  "5m": { bucketMs: 15 * 1000, windowMs: 5 * 60 * 1000 },
  "15m": { bucketMs: 60 * 1000, windowMs: 15 * 60 * 1000 },
  "1h": { bucketMs: 5 * 60 * 1000, windowMs: 60 * 60 * 1000 },
  "6h": { bucketMs: 30 * 60 * 1000, windowMs: 6 * 60 * 60 * 1000 },
  "24h": { bucketMs: 60 * 60 * 1000, windowMs: 24 * 60 * 60 * 1000 },
};

function isAuthSessionStatus(statusCode: number) {
  return statusCode === 401 || statusCode === 403;
}

function isActionableError(event: RequestMonitorEvent) {
  return event.statusCode >= 400 && !isAuthSessionStatus(event.statusCode);
}

const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_EVENTS = 100_000;
const monitorStartedAt = new Date();
const requestEvents: RequestMonitorEvent[] = [];

export type RequestMonitorErrorDetails = {
  code?: string;
  message?: string;
};

function normalizePath(path: string) {
  return path
    .replace(/^\/api\/v\d+/i, "")
    .replace(/\/[a-f\d]{24}(?=\/|$)/gi, "/:id")
    .replace(/\/\d{6,}(?=\/|$)/g, "/:number")
    .replace(/\/FB-[A-Za-z0-9-]+(?=\/|$)/g, "/:orderNumber")
    .replace(/\/[^/]+\.(jpg|jpeg|png|webp|gif|pdf)(?=\/|$)/gi, "/:file")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "") || "/";
}

function getRoutePattern(req: Request, originalPath: string) {
  const routePath = req.route?.path;
  if (typeof routePath === "string") {
    const routePattern = `${req.baseUrl}${routePath}`;
    if (routePattern.startsWith("/api/")) return normalizePath(routePattern);
    if (
      /^\/(admin|owner|rider|customer|public|media|health)(\/|$)/.test(
        routePattern,
      )
    ) {
      return normalizePath(routePattern);
    }
  }
  return normalizePath(originalPath);
}

function inferAppFromPath(route: string): RequestMonitorApp {
  if (route.startsWith("/admin")) return "admin";
  if (route.startsWith("/owner")) return "owner";
  if (route.startsWith("/rider")) return "rider";
  if (route.startsWith("/customer")) return "customer";
  if (
    route.startsWith("/public") ||
    route.startsWith("/restaurants") ||
    route.startsWith("/categories") ||
    route.startsWith("/promotions")
  ) {
    return "public";
  }
  if (route === "/health" || route.startsWith("/media")) return "system";
  return "unknown";
}

function compactId(value: string) {
  if (value.length <= 12) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function getRequestActor(req: Request) {
  const user = (req as Request & { user?: { id?: string; role?: string } }).user;
  if (!user?.id || !user.role) return undefined;
  return {
    id: user.id,
    role: user.role,
    key: `${user.role}:${compactId(user.id)}`,
  };
}

function extractOrderIdFromPath(path: string) {
  const match = path.match(/\/(?:customer|rider|owner|admin)\/orders\/([^/?]+)/i);
  const orderId = decodeURIComponent(match?.[1] ?? "").trim();
  if (!orderId || ["summary", "monitor", "active", "history"].includes(orderId)) {
    return undefined;
  }
  return orderId;
}

function pruneOldEvents(now = Date.now()) {
  const cutoff = now - RETENTION_MS;
  while (requestEvents.length && requestEvents[0].timestamp < cutoff) {
    requestEvents.shift();
  }
  if (requestEvents.length > MAX_EVENTS) {
    requestEvents.splice(0, requestEvents.length - MAX_EVENTS);
  }
}

function getEventsInWindow(
  windowMs = DEFAULT_WINDOW_MS,
  app: RequestMonitorAppFilter = "all",
) {
  const now = Date.now();
  pruneOldEvents(now);
  const cutoff = now - windowMs;
  return requestEvents.filter(
    (event) => event.timestamp >= cutoff && (app === "all" || event.app === app),
  );
}

function percentile(values: number[], percentage: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil((percentage / 100) * sorted.length) - 1,
  );
  return sorted[index] ?? 0;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundMs(value: number) {
  return Math.round(value * 10) / 10;
}

export function requestMonitorMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const startedAt = process.hrtime.bigint();
  const originalPath = req.originalUrl.split("?")[0] || req.path;

  res.on("finish", () => {
    if (!originalPath.startsWith("/api/")) return;

    const finishedAt = process.hrtime.bigint();
    const durationMs = Number(finishedAt - startedAt) / 1_000_000;
    const route = getRoutePattern(req, originalPath);
    const errorDetails =
      res.locals.requestMonitorError &&
      typeof res.locals.requestMonitorError === "object"
        ? (res.locals.requestMonitorError as RequestMonitorErrorDetails)
        : undefined;
    const event: RequestMonitorEvent = {
      actor: getRequestActor(req),
      app: inferAppFromPath(route),
      durationMs,
      errorCode: errorDetails?.code,
      errorMessage: errorDetails?.message,
      method: req.method,
      orderId: extractOrderIdFromPath(originalPath),
      path: originalPath,
      route,
      statusCode: res.statusCode,
      timestamp: Date.now(),
    };

    requestEvents.push(event);
    pruneOldEvents(event.timestamp);
  });

  next();
}

export function getOrderRequestPressureSnapshot(
  limit = 12,
  windowMs = DEFAULT_WINDOW_MS,
) {
  const events = getEventsInWindow(windowMs);

  const byOrder = new Map<
    string,
    {
      apps: Record<string, number>;
      actors: Map<
        string,
        {
          key: string;
          lastSeenAt: number;
          role: string;
          totalRequests: number;
        }
      >;
      endpoints: Map<
        string,
        {
          key: string;
          method: string;
          route: string;
          totalRequests: number;
        }
      >;
      errorRequests: number;
      lastSeenAt: number;
      orderId: string;
      totalRequests: number;
    }
  >();

  events.forEach((event) => {
    if (!event.orderId) return;
    const row =
      byOrder.get(event.orderId) ??
      {
        apps: {} as Record<string, number>,
        actors: new Map(),
        endpoints: new Map(),
        errorRequests: 0,
        lastSeenAt: 0,
        orderId: event.orderId,
        totalRequests: 0,
      };

    row.totalRequests += 1;
    row.errorRequests += event.statusCode >= 400 ? 1 : 0;
    row.lastSeenAt = Math.max(row.lastSeenAt, event.timestamp);
    row.apps[event.app] = (row.apps[event.app] ?? 0) + 1;

    if (event.actor) {
      const actorRow =
        row.actors.get(event.actor.key) ??
        {
          key: event.actor.key,
          lastSeenAt: 0,
          role: event.actor.role,
          totalRequests: 0,
        };
      actorRow.totalRequests += 1;
      actorRow.lastSeenAt = Math.max(actorRow.lastSeenAt, event.timestamp);
      row.actors.set(event.actor.key, actorRow);
    }

    const endpointKey = `${event.method}:${event.route}`;
    const endpointRow =
      row.endpoints.get(endpointKey) ??
      {
        key: endpointKey,
        method: event.method,
        route: event.route,
        totalRequests: 0,
      };
    endpointRow.totalRequests += 1;
    row.endpoints.set(endpointKey, endpointRow);
    byOrder.set(event.orderId, row);
  });

  return {
    windowMinutes: windowMs / 60_000,
    orders: Array.from(byOrder.values())
      .sort((left, right) => right.totalRequests - left.totalRequests)
      .slice(0, limit)
      .map((row) => ({
        orderId: row.orderId,
        totalRequests: row.totalRequests,
        errorRequests: row.errorRequests,
        lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt).toISOString() : null,
        apps: row.apps,
        actors: Array.from(row.actors.values())
          .sort((left, right) => right.totalRequests - left.totalRequests)
          .slice(0, 5)
          .map((actor) => ({
            ...actor,
            lastSeenAt: actor.lastSeenAt
              ? new Date(actor.lastSeenAt).toISOString()
              : null,
          })),
        endpoints: Array.from(row.endpoints.values())
          .sort((left, right) => right.totalRequests - left.totalRequests)
          .slice(0, 5),
      })),
  };
}

export function getRequestMonitorSnapshot(windowMs = DEFAULT_WINDOW_MS) {
  const events = getEventsInWindow(windowMs);

  const byApp = new Map<
    RequestMonitorApp,
    {
      actionableErrors: number;
      app: RequestMonitorApp;
      authSessionRequests: number;
      durations: number[];
      errors: number;
      lastSeenAt: number;
      total: number;
    }
  >();
  const byEndpoint = new Map<
    string,
    {
      app: RequestMonitorApp;
      actionableErrors: number;
      authSessionRequests: number;
      durations: number[];
      errors: number;
      key: string;
      lastPath: string;
      lastSeenAt: number;
      lastStatusCode: number;
      method: string;
      route: string;
      statusCounts: Record<string, number>;
      errorSamples: Array<{
        code: string;
        message: string;
        statusCode: number;
        lastSeenAt: number;
        count: number;
      }>;
      total: number;
    }
  >();

  events.forEach((event) => {
    const appRow =
      byApp.get(event.app) ??
      {
        app: event.app,
        actionableErrors: 0,
        authSessionRequests: 0,
        durations: [],
        errors: 0,
        lastSeenAt: 0,
        total: 0,
      };
    appRow.total += 1;
    appRow.durations.push(event.durationMs);
    appRow.errors += event.statusCode >= 400 ? 1 : 0;
    appRow.actionableErrors += isActionableError(event) ? 1 : 0;
    appRow.authSessionRequests += isAuthSessionStatus(event.statusCode) ? 1 : 0;
    appRow.lastSeenAt = Math.max(appRow.lastSeenAt, event.timestamp);
    byApp.set(event.app, appRow);

    const key = `${event.app}:${event.method}:${event.route}`;
    const endpointRow =
      byEndpoint.get(key) ??
      {
        app: event.app,
        actionableErrors: 0,
        authSessionRequests: 0,
        durations: [],
        errors: 0,
        key,
        lastPath: event.path,
        lastSeenAt: 0,
        lastStatusCode: event.statusCode,
        method: event.method,
        route: event.route,
        statusCounts: {},
        errorSamples: [],
        total: 0,
      };
    endpointRow.total += 1;
    endpointRow.durations.push(event.durationMs);
    endpointRow.errors += event.statusCode >= 400 ? 1 : 0;
    endpointRow.actionableErrors += isActionableError(event) ? 1 : 0;
    endpointRow.authSessionRequests += isAuthSessionStatus(event.statusCode) ? 1 : 0;
    const statusKey = String(event.statusCode);
    endpointRow.statusCounts[statusKey] =
      (endpointRow.statusCounts[statusKey] ?? 0) + 1;
    if (event.timestamp >= endpointRow.lastSeenAt) {
      endpointRow.lastPath = event.path;
      endpointRow.lastStatusCode = event.statusCode;
      endpointRow.lastSeenAt = event.timestamp;
    }
    if (event.statusCode >= 400) {
      const code = event.errorCode || defaultErrorCode(event.statusCode);
      const message = event.errorMessage || defaultErrorMessage(event.statusCode);
      const sample = endpointRow.errorSamples.find(
        (item) => item.code === code && item.message === message,
      );
      if (sample) {
        sample.count += 1;
        sample.lastSeenAt = Math.max(sample.lastSeenAt, event.timestamp);
      } else {
        endpointRow.errorSamples.push({
          code,
          message,
          statusCode: event.statusCode,
          lastSeenAt: event.timestamp,
          count: 1,
        });
      }
    }
    byEndpoint.set(key, endpointRow);
  });

  const durations = events.map((event) => event.durationMs);
  const errors = events.filter((event) => event.statusCode >= 400).length;
  const actionableErrors = events.filter(isActionableError).length;
  const authSessionRequests = events.filter((event) =>
    isAuthSessionStatus(event.statusCode),
  ).length;
  const serializeEvent = (event: RequestMonitorEvent) => ({
    app: event.app,
    durationMs: roundMs(event.durationMs),
    method: event.method,
    path: event.path,
    route: event.route,
    statusCode: event.statusCode,
    errorCode:
      event.errorCode ||
      (event.statusCode >= 400 ? defaultErrorCode(event.statusCode) : ""),
    errorMessage:
      event.errorMessage ||
      (event.statusCode >= 400 ? defaultErrorMessage(event.statusCode) : ""),
    timestamp: new Date(event.timestamp).toISOString(),
  });

  return {
    startedAt: monitorStartedAt.toISOString(),
    lastCapturedAt: requestEvents.length
      ? new Date(requestEvents[requestEvents.length - 1].timestamp).toISOString()
      : null,
    windowMinutes: windowMs / 60_000,
    summary: {
      totalRequests: events.length,
      errorRequests: errors,
      actionableErrorRequests: actionableErrors,
      authSessionRequests,
      successRequests: events.length - errors,
      averageDurationMs: roundMs(average(durations)),
      p95DurationMs: roundMs(percentile(durations, 95)),
      maxDurationMs: roundMs(Math.max(0, ...durations)),
      requestsPerMinute: roundMs(events.length / (windowMs / 60_000)),
    },
    byApp: Array.from(byApp.values())
      .map((row) => ({
        app: row.app,
        totalRequests: row.total,
        errorRequests: row.errors,
        actionableErrorRequests: row.actionableErrors,
        authSessionRequests: row.authSessionRequests,
        averageDurationMs: roundMs(average(row.durations)),
        p95DurationMs: roundMs(percentile(row.durations, 95)),
        lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt).toISOString() : null,
      }))
      .sort((left, right) => right.totalRequests - left.totalRequests),
    endpoints: Array.from(byEndpoint.values())
      .map((row) => ({
        app: row.app,
        key: row.key,
        method: row.method,
        route: row.route,
        lastPath: row.lastPath,
        totalRequests: row.total,
        errorRequests: row.errors,
        actionableErrorRequests: row.actionableErrors,
        authSessionRequests: row.authSessionRequests,
        successRequests: row.total - row.errors,
        averageDurationMs: roundMs(average(row.durations)),
        p95DurationMs: roundMs(percentile(row.durations, 95)),
        statusCounts: row.statusCounts,
        errorSamples: row.errorSamples
          .sort((left, right) => right.lastSeenAt - left.lastSeenAt)
          .slice(0, 5)
          .map((sample) => ({
            ...sample,
            lastSeenAt: new Date(sample.lastSeenAt).toISOString(),
          })),
        lastStatusCode: row.lastStatusCode,
        lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt).toISOString() : null,
      }))
      .sort((left, right) => right.totalRequests - left.totalRequests)
      .slice(0, 30),
    recent: events
      .slice(-25)
      .reverse()
      .map(serializeEvent),
    recentErrors: events
      .filter((event) => event.statusCode >= 400)
      .slice(-25)
      .reverse()
      .map(serializeEvent),
  };
}

export function getRequestTrafficSnapshot(options: {
  app?: RequestMonitorAppFilter;
  range?: RequestTrafficRange;
} = {}) {
  const range = options.range ?? "15m";
  const app = options.app ?? "all";
  const config = trafficRangeConfig[range];
  const now = Date.now();
  const from = now - config.windowMs;
  const events = getEventsInWindow(config.windowMs, app);

  const timeline = new Map<
    number,
    {
      errorRequests: number;
      rateLimitedRequests: number;
      successRequests: number;
      totalRequests: number;
    }
  >();
  for (let bucketStart = from; bucketStart <= now; bucketStart += config.bucketMs) {
    timeline.set(bucketStart, {
      errorRequests: 0,
      rateLimitedRequests: 0,
      successRequests: 0,
      totalRequests: 0,
    });
  }

  const byApp = new Map<
    RequestMonitorApp,
    {
      app: RequestMonitorApp;
      errorRequests: number;
      lastSeenAt: number;
      rateLimitedRequests: number;
      totalRequests: number;
    }
  >();
  const byEndpoint = new Map<
    string,
    {
      app: RequestMonitorApp;
      durations: number[];
      errorRequests: number;
      key: string;
      lastSeenAt: number;
      method: string;
      rateLimitedRequests: number;
      route: string;
      statusCounts: Record<string, number>;
      totalRequests: number;
    }
  >();
  const byActor = new Map<
    string,
    {
      apps: Record<string, number>;
      errorRequests: number;
      key: string;
      lastSeenAt: number;
      rateLimitedRequests: number;
      role: string;
      totalRequests: number;
    }
  >();

  events.forEach((event) => {
    const bucketStart =
      from + Math.floor((event.timestamp - from) / config.bucketMs) * config.bucketMs;
    const timelineRow =
      timeline.get(bucketStart) ??
      {
        errorRequests: 0,
        rateLimitedRequests: 0,
        successRequests: 0,
        totalRequests: 0,
      };
    timelineRow.totalRequests += 1;
    timelineRow.successRequests += event.statusCode < 400 ? 1 : 0;
    timelineRow.errorRequests += event.statusCode >= 400 ? 1 : 0;
    timelineRow.rateLimitedRequests += event.statusCode === 429 ? 1 : 0;
    timeline.set(bucketStart, timelineRow);

    const appRow =
      byApp.get(event.app) ??
      {
        app: event.app,
        errorRequests: 0,
        lastSeenAt: 0,
        rateLimitedRequests: 0,
        totalRequests: 0,
      };
    appRow.totalRequests += 1;
    appRow.errorRequests += event.statusCode >= 400 ? 1 : 0;
    appRow.rateLimitedRequests += event.statusCode === 429 ? 1 : 0;
    appRow.lastSeenAt = Math.max(appRow.lastSeenAt, event.timestamp);
    byApp.set(event.app, appRow);

    const endpointKey = `${event.app}:${event.method}:${event.route}`;
    const endpointRow =
      byEndpoint.get(endpointKey) ??
      {
        app: event.app,
        durations: [],
        errorRequests: 0,
        key: endpointKey,
        lastSeenAt: 0,
        method: event.method,
        rateLimitedRequests: 0,
        route: event.route,
        statusCounts: {},
        totalRequests: 0,
      };
    endpointRow.totalRequests += 1;
    endpointRow.durations.push(event.durationMs);
    endpointRow.errorRequests += event.statusCode >= 400 ? 1 : 0;
    endpointRow.rateLimitedRequests += event.statusCode === 429 ? 1 : 0;
    endpointRow.lastSeenAt = Math.max(endpointRow.lastSeenAt, event.timestamp);
    endpointRow.statusCounts[String(event.statusCode)] =
      (endpointRow.statusCounts[String(event.statusCode)] ?? 0) + 1;
    byEndpoint.set(endpointKey, endpointRow);

    const actorKey = event.actor?.key ?? `${event.app}:unauthenticated`;
    const actorRole = event.actor?.role ?? "anonymous";
    const actorRow =
      byActor.get(actorKey) ??
      {
        apps: {},
        errorRequests: 0,
        key: actorKey,
        lastSeenAt: 0,
        rateLimitedRequests: 0,
        role: actorRole,
        totalRequests: 0,
      };
    actorRow.totalRequests += 1;
    actorRow.errorRequests += event.statusCode >= 400 ? 1 : 0;
    actorRow.rateLimitedRequests += event.statusCode === 429 ? 1 : 0;
    actorRow.lastSeenAt = Math.max(actorRow.lastSeenAt, event.timestamp);
    actorRow.apps[event.app] = (actorRow.apps[event.app] ?? 0) + 1;
    byActor.set(actorKey, actorRow);
  });

  const durations = events.map((event) => event.durationMs);
  const errorRequests = events.filter((event) => event.statusCode >= 400).length;
  const rateLimitedRequests = events.filter((event) => event.statusCode === 429).length;
  const maxBucketTotal = Math.max(
    0,
    ...Array.from(timeline.values()).map((row) => row.totalRequests),
  );

  return {
    app,
    bucketSeconds: config.bucketMs / 1000,
    generatedAt: new Date(now).toISOString(),
    range,
    rangeSeconds: config.windowMs / 1000,
    retentionHours: RETENTION_MS / 60 / 60 / 1000,
    summary: {
      totalRequests: events.length,
      successRequests: events.length - errorRequests,
      errorRequests,
      rateLimitedRequests,
      requestsPerMinute: roundMs(events.length / (config.windowMs / 60_000)),
      requestsPerSecond: roundMs(events.length / (config.windowMs / 1000)),
      averageDurationMs: roundMs(average(durations)),
      p95DurationMs: roundMs(percentile(durations, 95)),
    },
    timeline: Array.from(timeline.entries()).map(([timestamp, row]) => ({
      timestamp: new Date(timestamp).toISOString(),
      ...row,
      intensityPercent: maxBucketTotal
        ? Math.round((row.totalRequests / maxBucketTotal) * 100)
        : 0,
    })),
    byApp: Array.from(byApp.values())
      .map((row) => ({
        ...row,
        lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt).toISOString() : null,
      }))
      .sort((left, right) => right.totalRequests - left.totalRequests),
    endpoints: Array.from(byEndpoint.values())
      .map((row) => ({
        app: row.app,
        key: row.key,
        method: row.method,
        route: row.route,
        totalRequests: row.totalRequests,
        errorRequests: row.errorRequests,
        rateLimitedRequests: row.rateLimitedRequests,
        averageDurationMs: roundMs(average(row.durations)),
        p95DurationMs: roundMs(percentile(row.durations, 95)),
        statusCounts: row.statusCounts,
        lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt).toISOString() : null,
      }))
      .sort((left, right) => right.totalRequests - left.totalRequests)
      .slice(0, 30),
    actors: Array.from(byActor.values())
      .map((row) => ({
        ...row,
        lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt).toISOString() : null,
      }))
      .sort((left, right) => right.totalRequests - left.totalRequests)
      .slice(0, 20),
  };
}

function defaultErrorCode(statusCode: number) {
  if (statusCode === 401) return "UNAUTHORIZED";
  if (statusCode === 403) return "FORBIDDEN";
  if (statusCode === 404) return "NOT_FOUND";
  if (statusCode === 429) return "RATE_LIMITED";
  if (statusCode >= 500) return "SERVER_ERROR";
  return "REQUEST_ERROR";
}

function defaultErrorMessage(statusCode: number) {
  if (statusCode === 401) return "Authentication required or session expired.";
  if (statusCode === 403) return "Authenticated user does not have access.";
  if (statusCode === 404) return "No API route matched this request.";
  if (statusCode === 429) return "Rate limit exceeded.";
  if (statusCode >= 500) return "Server returned an internal error.";
  return "Request failed.";
}

export function clearRequestMonitorEvents() {
  requestEvents.splice(0, requestEvents.length);
}
