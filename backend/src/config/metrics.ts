import type { NextFunction, Request, Response } from "express";
import client from "prom-client";

import { checkDatabaseHealth } from "./db";
import { env } from "./env";

const METRIC_PREFIX = "foodbela_";

export const metricsRegistry = new client.Registry();

client.collectDefaultMetrics({
  prefix: METRIC_PREFIX,
  register: metricsRegistry,
});

const httpRequestsTotal = new client.Counter({
  name: `${METRIC_PREFIX}http_requests_total`,
  help: "Total number of HTTP requests handled by the backend.",
  labelNames: ["method", "route", "status_code", "app"] as const,
  registers: [metricsRegistry],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: `${METRIC_PREFIX}http_request_duration_seconds`,
  help: "HTTP request duration in seconds.",
  labelNames: ["method", "route", "status_code", "app"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

const httpRequestsInFlight = new client.Gauge({
  name: `${METRIC_PREFIX}http_requests_in_flight`,
  help: "Current number of in-flight HTTP requests.",
  labelNames: ["method", "app"] as const,
  registers: [metricsRegistry],
});

new client.Gauge({
  name: `${METRIC_PREFIX}mongodb_connected`,
  help: "MongoDB connection state. 1 means connected, 0 means not connected.",
  registers: [metricsRegistry],
  async collect() {
    const health = await checkDatabaseHealth();
    this.set(health.ok ? 1 : 0);
  },
});

function normalizePath(path: string) {
  return (
    path
      .replace(/^\/api\/v\d+/i, "")
      .replace(/\/[a-f\d]{24}(?=\/|$)/gi, "/:id")
      .replace(/\/\d{6,}(?=\/|$)/g, "/:number")
      .replace(/\/FB-[A-Za-z0-9-]+(?=\/|$)/g, "/:orderNumber")
      .replace(/\/[^/]+\.(jpg|jpeg|png|webp|gif|pdf)(?=\/|$)/gi, "/:file")
      .replace(/\/+/g, "/")
      .replace(/\/$/, "") || "/"
  );
}

function getRoutePattern(req: Request) {
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
  return "/unmatched";
}

function inferAppFromRoute(route: string) {
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
  if (route === env.METRICS_PATH) return "system";
  return "unknown";
}

function isMetricsRequest(req: Request) {
  return req.path === env.METRICS_PATH;
}

function isMetricsAuthorized(req: Request) {
  if (!env.METRICS_AUTH_TOKEN) return true;

  const authorization = req.header("authorization") ?? "";
  const metricsToken = req.header("x-metrics-token") ?? "";

  return (
    authorization === `Bearer ${env.METRICS_AUTH_TOKEN}` ||
    metricsToken === env.METRICS_AUTH_TOKEN
  );
}

export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (isMetricsRequest(req)) {
    next();
    return;
  }

  const startedAt = process.hrtime.bigint();
  const originalPath = req.originalUrl.split("?")[0] || req.path;
  const earlyRoute = normalizePath(originalPath);
  const earlyApp = inferAppFromRoute(earlyRoute);

  httpRequestsInFlight.inc({ method: req.method, app: earlyApp });

  res.on("finish", () => {
    const finishedAt = process.hrtime.bigint();
    const durationSeconds = Number(finishedAt - startedAt) / 1_000_000_000;
    const route = getRoutePattern(req);
    const app = inferAppFromRoute(route);
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
      app,
    };

    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationSeconds);
    httpRequestsInFlight.dec({ method: req.method, app: earlyApp });
  });

  next();
}

export async function getMetrics(req: Request, res: Response) {
  if (!env.METRICS_ENABLED) {
    res.status(404).send("Metrics are disabled");
    return;
  }

  if (!isMetricsAuthorized(req)) {
    res.status(401).send("Unauthorized");
    return;
  }

  res.setHeader("Content-Type", metricsRegistry.contentType);
  res.end(await metricsRegistry.metrics());
}
