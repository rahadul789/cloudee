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
  app: RequestMonitorApp;
  durationMs: number;
  errorCode?: string;
  errorMessage?: string;
  method: string;
  path: string;
  route: string;
  statusCode: number;
  timestamp: number;
};

function isAuthSessionStatus(statusCode: number) {
  return statusCode === 401 || statusCode === 403;
}

function isActionableError(event: RequestMonitorEvent) {
  return event.statusCode >= 400 && !isAuthSessionStatus(event.statusCode);
}

const WINDOW_MS = 10 * 60 * 1000;
const MAX_EVENTS = 5000;
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

function pruneOldEvents(now = Date.now()) {
  const cutoff = now - WINDOW_MS;
  while (requestEvents.length && requestEvents[0].timestamp < cutoff) {
    requestEvents.shift();
  }
  if (requestEvents.length > MAX_EVENTS) {
    requestEvents.splice(0, requestEvents.length - MAX_EVENTS);
  }
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
      app: inferAppFromPath(route),
      durationMs,
      errorCode: errorDetails?.code,
      errorMessage: errorDetails?.message,
      method: req.method,
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

export function getRequestMonitorSnapshot() {
  const now = Date.now();
  pruneOldEvents(now);

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

  requestEvents.forEach((event) => {
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

  const durations = requestEvents.map((event) => event.durationMs);
  const errors = requestEvents.filter((event) => event.statusCode >= 400).length;
  const actionableErrors = requestEvents.filter(isActionableError).length;
  const authSessionRequests = requestEvents.filter((event) =>
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
    windowMinutes: WINDOW_MS / 60_000,
    summary: {
      totalRequests: requestEvents.length,
      errorRequests: errors,
      actionableErrorRequests: actionableErrors,
      authSessionRequests,
      successRequests: requestEvents.length - errors,
      averageDurationMs: roundMs(average(durations)),
      p95DurationMs: roundMs(percentile(durations, 95)),
      maxDurationMs: roundMs(Math.max(0, ...durations)),
      requestsPerMinute: roundMs(requestEvents.length / (WINDOW_MS / 60_000)),
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
    recent: requestEvents
      .slice(-25)
      .reverse()
      .map(serializeEvent),
    recentErrors: requestEvents
      .filter((event) => event.statusCode >= 400)
      .slice(-25)
      .reverse()
      .map(serializeEvent),
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
