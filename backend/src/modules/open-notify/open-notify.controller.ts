import type { Request, Response } from "express"
import { z } from "zod"

import { sendSuccess } from "../../common/utils/api-response"
import { asyncHandler } from "../../common/utils/async-handler"
import {
  cancelOpenNotify,
  getOpenNotifyStats,
  getOpenNotifyStatus,
  subscribeOpenNotify,
} from "./open-notify.service"

const subscribeSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
})

export const getCustomerOpenNotify = asyncHandler(async (req: Request, res: Response) => {
  const data = await getOpenNotifyStatus(req.user?.id ?? "")
  return sendSuccess(res, { message: "Open notify status", data })
})

export const postCustomerOpenNotify = asyncHandler(async (req: Request, res: Response) => {
  const body = subscribeSchema.parse(req.body)
  const data = await subscribeOpenNotify({ customerId: req.user?.id ?? "", ...body })
  return sendSuccess(res, { message: "Open notify updated", data })
})

export const deleteCustomerOpenNotify = asyncHandler(async (req: Request, res: Response) => {
  const data = await cancelOpenNotify(req.user?.id ?? "")
  return sendSuccess(res, { message: "Open notify cancelled", data })
})

export const getAdminOpenNotifyStats = asyncHandler(async (req: Request, res: Response) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 14))
  const data = await getOpenNotifyStats(days)
  return sendSuccess(res, { message: "Open notify stats", data })
})
