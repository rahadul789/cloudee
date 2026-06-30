import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedRequest } from "../../common/middleware/auth";
import {
  clearRequestMonitorEvents,
  getOrderRequestPressureSnapshot,
  getRequestTrafficSnapshot,
} from "../../common/middleware/request-monitor";
import {
  getRateLimitSnapshot,
  resetRateLimitBucket,
} from "../../common/middleware/rate-limit";
import { sendSuccess } from "../../common/utils/api-response";
import { asyncHandler } from "../../common/utils/async-handler";
import { logger } from "../../config/logger";
import {
  resolveAdminOperationalAlert,
  snoozeAdminOperationalAlert,
} from "./admin-alert.service";
import { getAdminOperationalHealthSnapshot } from "./business-event.service";

const alertParamsSchema = z.object({
  alertId: z.string().trim().min(1),
});

const rateLimitParamsSchema = z.object({
  limiterId: z.string().trim().min(1),
});

const rateLimitResetBodySchema = z.object({
  resetToken: z.string().trim().min(16),
  reason: z.string().trim().min(4).max(240),
});

const rateLimitSnapshotQuerySchema = z.object({
  app: z
    .enum(["all", "admin", "owner", "rider", "customer", "public", "system", "unknown"])
    .default("all"),
  range: z.enum(["60s", "5m", "15m", "1h", "6h", "24h"]).default("15m"),
});

const snoozeAlertBodySchema = z.object({
  minutes: z.coerce.number().int().positive().max(24 * 60).default(30),
});

export const getAdminOperationalHealth = asyncHandler(
  async (_req: AuthenticatedRequest, res: Response) => {
    const data = await getAdminOperationalHealthSnapshot();
    return sendSuccess(res, { data });
  },
);

export const getAdminRateLimitSnapshot = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = rateLimitSnapshotQuerySchema.parse(req.query);
    const data = {
      ...(await getRateLimitSnapshot()),
      orderRequests: getOrderRequestPressureSnapshot(),
      traffic: getRequestTrafficSnapshot(query),
    };
    return sendSuccess(res, { data });
  },
);

export const postAdminRateLimitBucketReset = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { limiterId } = rateLimitParamsSchema.parse(req.params);
    const body = rateLimitResetBodySchema.parse(req.body);
    const data = resetRateLimitBucket({
      limiterId,
      resetToken: body.resetToken,
    });

    logger.warn(
      {
        businessEvent: true,
        event: "rate_limit.bucket_reset",
        category: "security",
        severity: "warning",
        adminId: req.user?.id,
        limiterId,
        limiterLabel: "label" in data ? data.label : undefined,
        bucket: "key" in data ? data.key : undefined,
        reset: data.reset,
        reason: body.reason,
      },
      "Admin reset rate limit bucket",
    );

    return sendSuccess(res, {
      message: data.reset
        ? "Rate limit bucket reset"
        : "Rate limit bucket not found",
      data,
    });
  },
);

export const patchAdminOperationalAlertResolve = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { alertId } = alertParamsSchema.parse(req.params);
    const data = await resolveAdminOperationalAlert(alertId);

    return sendSuccess(res, {
      message: data.updated ? "Operational alert resolved" : "Operational alert not found",
      data,
    });
  },
);

export const patchAdminOperationalAlertSnooze = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { alertId } = alertParamsSchema.parse(req.params);
    const body = snoozeAlertBodySchema.parse(req.body);
    const data = await snoozeAdminOperationalAlert(alertId, body.minutes);

    return sendSuccess(res, {
      message: data.updated ? "Operational alert snoozed" : "Operational alert not found",
      data,
    });
  },
);

export const postAdminOperationsRequestMonitorClear = asyncHandler(
  async (_req: AuthenticatedRequest, res: Response) => {
    clearRequestMonitorEvents();

    return sendSuccess(res, {
      message: "Request monitor cleared",
      data: { cleared: true },
    });
  },
);
