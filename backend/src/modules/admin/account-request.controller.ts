import type { Response } from "express"
import { z } from "zod"

import type { AuthenticatedRequest } from "../../common/middleware/auth"
import { asyncHandler } from "../../common/utils/async-handler"
import { sendSuccess } from "../../common/utils/api-response"
import {
  listCustomerAccountRequests,
  reviewCustomerAccountRequest
} from "./account-request.service"

const listCustomerAccountRequestsQuerySchema = z.object({
  status: z.enum(["pending", "cancelled", "reviewed", "completed"]).optional(),
  type: z.enum(["deactivate", "delete"]).optional(),
  zoneId: z.string().optional(),
  districtId: z.string().optional()
})

const reviewCustomerAccountRequestSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  reviewNote: z.string().trim().optional()
})

function getAdminId(req: AuthenticatedRequest) {
  return req.user?.id ?? "system-admin"
}

function getStringParam(value: unknown) {
  if (typeof value === "string") {
    return value
  }

  if (Array.isArray(value)) {
    const firstValue = value[0]
    return typeof firstValue === "string" ? firstValue : ""
  }

  return ""
}

function getOptionalStringParam(value: unknown) {
  const normalized = getStringParam(value).trim()
  return normalized.length > 0 ? normalized : undefined
}

export const getAdminCustomerAccountRequests = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = listCustomerAccountRequestsQuerySchema.parse({
      status: getOptionalStringParam(req.query.status),
      type: getOptionalStringParam(req.query.type),
      zoneId: getOptionalStringParam(req.query.zoneId),
      districtId: getOptionalStringParam(req.query.districtId)
    })

    const data = await listCustomerAccountRequests({
      status: query.status,
      type: query.type,
      zoneId: query.zoneId,
      districtId: query.districtId
    })

    return sendSuccess(res, { data })
  }
)

export const postAdminCustomerAccountRequestReview = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = reviewCustomerAccountRequestSchema.parse(req.body)
    const data = await reviewCustomerAccountRequest({
      customerId: getStringParam(req.params.customerId),
      adminId: getAdminId(req),
      decision: payload.decision,
      reviewNote: payload.reviewNote,
      zoneId: getOptionalStringParam(req.query.zoneId),
      districtId: getOptionalStringParam(req.query.districtId)
    })

    return sendSuccess(res, {
      message: "Account request reviewed successfully",
      data
    })
  }
)
