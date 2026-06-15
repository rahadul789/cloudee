import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedRequest } from "../../common/middleware/auth";
import { clearRequestMonitorEvents } from "../../common/middleware/request-monitor";
import { sendSuccess } from "../../common/utils/api-response";
import { asyncHandler } from "../../common/utils/async-handler";
import {
  resolveAdminOperationalAlert,
  snoozeAdminOperationalAlert,
} from "./admin-alert.service";
import { getAdminOperationalHealthSnapshot } from "./business-event.service";

const alertParamsSchema = z.object({
  alertId: z.string().trim().min(1),
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
