import type { Request, Response } from "express"
import { z } from "zod"

import { sendSuccess } from "../../common/utils/api-response"
import { asyncHandler } from "../../common/utils/async-handler"
import {
  getWinBackSettings,
  getWinBackStats,
  listWinBackCandidates,
  sendWinBack,
  updateWinBackSettings,
} from "./win-back.service"

const amount = z.coerce.number().int().min(5).max(300)
const settingsSchema = z
  .object({
    enabled: z.boolean(),
    mode: z.enum(["approval", "auto"]),
    lapsedDays: z.coerce.number().int().min(14).max(180),
    amounts: z.object({ one_time: amount, regular: amount, loyal: amount }).partial(),
    minOrderAmount: z.coerce.number().int().min(0).max(2000),
    validityDays: z.coerce.number().int().min(1).max(30),
    monthlyBudget: z.coerce.number().int().min(0).max(500000),
    maxAttemptsPer90Days: z.coerce.number().int().min(1).max(4),
    controlPercent: z.coerce.number().int().min(0).max(50),
    sendMinuteOfDay: z.coerce.number().int().min(0).max(1439),
  })
  .partial()

const sendSchema = z.object({ customerIds: z.array(z.string().trim().min(1)).max(2000).optional() })

export const getAdminWinBackSettings = asyncHandler(async (_req: Request, res: Response) => {
  return sendSuccess(res, { message: "Win-back settings", data: await getWinBackSettings() })
})

export const putAdminWinBackSettings = asyncHandler(async (req: Request, res: Response) => {
  const patch = settingsSchema.parse(req.body)
  return sendSuccess(res, {
    message: "Win-back settings saved",
    data: await updateWinBackSettings(patch as Parameters<typeof updateWinBackSettings>[0]),
  })
})

export const getAdminWinBackCandidates = asyncHandler(async (_req: Request, res: Response) => {
  return sendSuccess(res, { message: "Win-back candidates", data: await listWinBackCandidates() })
})

export const postAdminWinBackSend = asyncHandler(async (req: Request, res: Response) => {
  const body = sendSchema.parse(req.body ?? {})
  const data = await sendWinBack({ trigger: "admin", triggeredBy: req.user?.id ?? "", customerIds: body.customerIds })
  return sendSuccess(res, { message: "Win-back sent", data })
})

export const getAdminWinBackStats = asyncHandler(async (req: Request, res: Response) => {
  const days = Math.min(365, Math.max(7, Number(req.query.days) || 90))
  return sendSuccess(res, { message: "Win-back results", data: await getWinBackStats(days) })
})
