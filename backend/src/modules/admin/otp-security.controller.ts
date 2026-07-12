import type { Response } from "express"
import { z } from "zod"

import type { AuthenticatedRequest } from "../../common/middleware/auth"
import { sendSuccess } from "../../common/utils/api-response"
import { asyncHandler } from "../../common/utils/async-handler"
import {
  listOtpSecurityEvents,
  unblockOtpAbuseBlock,
  upsertOtpAbuseBlock,
} from "./otp-security.service"
import { getAdminOtpMonitor, markOtpAttemptHandled } from "./otp-monitor.service"

const otpMonitorQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  phone: z.string().optional(),
  status: z.enum(["all", "stuck", "verified", "call_requested"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(10).max(100).optional(),
})

export const getAdminOtpMonitorController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = otpMonitorQuerySchema.parse(req.query)
    const data = await getAdminOtpMonitor(query)
    return sendSuccess(res, { message: "OTP monitor loaded", data })
  },
)

const otpHandledSchema = z.object({ id: z.string().trim().min(1).max(64) })

export const postAdminOtpHandledController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = otpHandledSchema.parse(req.body)
    const data = await markOtpAttemptHandled({
      id: payload.id,
      adminId: req.user?.id,
    })
    return sendSuccess(res, { message: "OTP attempt marked handled", data })
  },
)

const otpSecurityQuerySchema = z.object({
  phone: z.string().regex(/^01\d{9}$/).optional(),
  hours: z.coerce.number().int().min(1).max(168).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(10).max(100).optional(),
})

const otpBlockSchema = z.object({
  targetType: z.enum(["phone", "ip", "device"]),
  targetValue: z.string().min(1).max(400),
  durationMinutes: z.coerce.number().int().min(5).max(60 * 24 * 30).optional(),
  permanent: z.boolean().optional(),
  reason: z.string().max(300).optional(),
})

const otpUnblockSchema = z.object({
  reason: z.string().max(300).optional(),
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

export const getAdminOtpSecurityController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = otpSecurityQuerySchema.parse({
      phone: getOptionalStringParam(req.query.phone),
      hours: getOptionalStringParam(req.query.hours),
      page: getOptionalStringParam(req.query.page),
      pageSize: getOptionalStringParam(req.query.pageSize),
    })
    const data = await listOtpSecurityEvents(query)

    return sendSuccess(res, { data })
  }
)

export const postAdminOtpBlockController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = otpBlockSchema.parse(req.body)
    const data = await upsertOtpAbuseBlock({
      ...payload,
      adminId: req.user?.id ?? "",
    })

    return sendSuccess(res, {
      message: "OTP block updated",
      data,
    })
  }
)

export const deleteAdminOtpBlockController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = otpUnblockSchema.parse(req.body ?? {})
    const data = await unblockOtpAbuseBlock({
      blockId: getStringParam(req.params.blockId),
      reason: payload.reason,
      adminId: req.user?.id ?? "",
    })

    return sendSuccess(res, {
      message: "OTP block removed",
      data,
    })
  }
)
