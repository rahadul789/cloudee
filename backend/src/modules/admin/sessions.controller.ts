import type { Response } from "express"
import { z } from "zod"

import type { AuthenticatedRequest } from "../../common/middleware/auth"
import { sendSuccess } from "../../common/utils/api-response"
import { asyncHandler } from "../../common/utils/async-handler"
import {
  listAdminSessions,
  revokeAdminActorSessions,
  revokeAdminSession,
} from "./sessions.service"

const roleSchema = z.enum(["admin", "owner", "customer", "rider"])

const sessionsQuerySchema = z.object({
  role: z.enum(["all", "admin", "owner", "customer", "rider"]).optional(),
  status: z
    .enum(["all", "active", "recent", "stale", "revoked", "expired"])
    .optional(),
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(10).max(100).optional(),
})

function getStringParam(value: unknown) {
  if (typeof value === "string") return value
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : ""
  return ""
}

function getOptionalStringParam(value: unknown) {
  const normalized = getStringParam(value).trim()
  return normalized.length > 0 ? normalized : undefined
}

export const getAdminSessionsController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = sessionsQuerySchema.parse({
      role: getOptionalStringParam(req.query.role),
      status: getOptionalStringParam(req.query.status),
      zoneId: getOptionalStringParam(req.query.zoneId),
      districtId: getOptionalStringParam(req.query.districtId),
      page: getOptionalStringParam(req.query.page),
      pageSize: getOptionalStringParam(req.query.pageSize),
    })
    const data = await listAdminSessions(query)

    return sendSuccess(res, { data })
  }
)

export const postAdminSessionRevokeController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const params = z
      .object({
        role: roleSchema,
        sessionId: z.string().min(1),
      })
      .parse(req.params)
    const data = await revokeAdminSession(params)

    return sendSuccess(res, {
      message: "Session revoked successfully",
      data,
    })
  }
)

export const postAdminActorSessionsRevokeController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const params = z
      .object({
        role: roleSchema,
        actorId: z.string().min(1),
      })
      .parse(req.params)
    const data = await revokeAdminActorSessions(params)

    return sendSuccess(res, {
      message: "Account sessions revoked successfully",
      data,
    })
  }
)
