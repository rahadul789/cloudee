import type { Response } from "express"
import { z } from "zod"

import type { AuthenticatedRequest } from "../../common/middleware/auth"
import { asyncHandler } from "../../common/utils/async-handler"
import { sendSuccess } from "../../common/utils/api-response"
import {
  getAccountDeletionConfig,
  listAccountDeletionRequests,
  updateAccountDeletionRequest,
} from "../customer/account-deletion.service"

const listQuerySchema = z.object({
  status: z
    .enum(["all", "pending", "reviewing", "completed", "rejected"])
    .optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
})

const updateSchema = z.object({
  status: z.enum(["pending", "reviewing", "completed", "rejected"]),
  adminNote: z.string().trim().max(1000).optional(),
})

function toNumberOrUndefined(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export const getAdminAccountDeletionRequests = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = listQuerySchema.parse({
      status:
        typeof req.query.status === "string" ? req.query.status : undefined,
      page: toNumberOrUndefined(req.query.page),
      pageSize: toNumberOrUndefined(req.query.pageSize),
    })

    const [data, config] = await Promise.all([
      listAccountDeletionRequests(query),
      getAccountDeletionConfig(),
    ])

    return sendSuccess(res, { data: { ...data, config } })
  },
)

export const patchAdminAccountDeletionRequest = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = updateSchema.parse(req.body)
    const data = await updateAccountDeletionRequest({
      id: typeof req.params.id === "string" ? req.params.id : "",
      status: payload.status,
      adminNote: payload.adminNote,
      adminId: req.user?.id ?? "system-admin",
    })

    return sendSuccess(res, {
      message: "Deletion request updated",
      data,
    })
  },
)
