import type { Response } from "express"
import { StatusCodes } from "http-status-codes"
import { z } from "zod"

import type { AuthenticatedRequest } from "../../common/middleware/auth"
import { sendSuccess } from "../../common/utils/api-response"
import { asyncHandler } from "../../common/utils/async-handler"
import { customerAnalyticsEventTypes } from "./customer-analytics.model"
import { fireCustomerAnalyticsEvent } from "./customer-analytics.service"

const analyticsEventSchema = z.object({
  eventType: z.enum(customerAnalyticsEventTypes),
  anonymousId: z.string().trim().min(6).max(128).optional(),
  sessionId: z.string().trim().min(6).max(128).optional(),
  sourceApp: z.string().trim().max(80).optional(),
  path: z.string().trim().min(1).max(300),
  screenName: z.string().trim().max(120).optional(),
  entityType: z.string().trim().max(80).optional(),
  entityId: z.string().trim().max(120).optional(),
  occurredAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const postCustomerAnalyticsEvent = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const input = analyticsEventSchema.parse(req.body)

    fireCustomerAnalyticsEvent({ input, req })

    return sendSuccess(res, {
      statusCode: StatusCodes.ACCEPTED,
      message: "Analytics event accepted",
      data: { accepted: true },
    })
  }
)
