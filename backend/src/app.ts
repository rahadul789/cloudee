import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";

import { apiRouter } from "./routes";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { getMetrics, metricsMiddleware } from "./config/metrics";
import { errorHandlerMiddleware } from "./common/middleware/error-handler";
import { notFoundMiddleware } from "./common/middleware/not-found";
import { requestIdMiddleware } from "./common/middleware/request-id";
import { attachAuthUser } from "./common/middleware/auth";
import { requestMonitorMiddleware } from "./common/middleware/request-monitor";
import { createGlobalLimiter } from "./common/middleware/rate-limit";

function isRoutineRequestLog(req: express.Request) {
  if (
    req.method === "POST" &&
    /^\/api\/v1\/rider\/orders\/[^/]+\/location$/.test(req.path)
  ) {
    return true;
  }
  if (req.method === "PATCH" && req.path === "/api/v1/rider/profile/location") {
    return true;
  }
  if (req.method !== "GET") return false;
  return (
    req.path === "/api/v1/health" ||
    req.path === "/api/v1/health/ready" ||
    req.path === "/api/v1/admin/operations/health" ||
    req.path === "/api/v1/admin/notifications" ||
    req.path === "/api/v1/owner/notifications"
  );
}

export function createApp() {
  const app = express();

  if (env.TRUST_PROXY_HOPS > 0) {
    app.set("trust proxy", env.TRUST_PROXY_HOPS);
  }

  app.use(
    cors({
      origin: [
        env.CLIENT_ORIGIN,
        env.ADMIN_PANEL_ORIGIN,
        env.CUSTOMER_APP,
        env.DELIVERY_APP,
        env.RESTAURANT_APP,
      ],
      credentials: true,
    }),
  );
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestIdMiddleware);
  app.get(env.METRICS_PATH, getMetrics);
  app.use(metricsMiddleware);
  app.use(requestMonitorMiddleware);
  app.use(
    pinoHttp({
      logger,
      autoLogging: {
        ignore: isRoutineRequestLog,
      },
    }),
  );
  app.use(attachAuthUser);
  if (env.RATE_LIMIT_ENABLED) {
    app.use(createGlobalLimiter());
  }

  app.use(env.API_PREFIX, apiRouter);

  app.use(notFoundMiddleware);
  app.use(errorHandlerMiddleware);

  return app;
}
