import type { Request, Response } from "express"
import { z } from "zod"

import type { AuthenticatedRequest } from "../../common/middleware/auth"
import { sendSuccess } from "../../common/utils/api-response"
import { asyncHandler } from "../../common/utils/async-handler"
import { submitAccountDeletionRequest } from "../customer/account-deletion.service"
import { getPlatformContent, recordCustomerHomeCmsEvent } from "./content.service"

const homeCmsEventSchema = z.object({
  eventType: z.enum([
    "strip_impression",
    "strip_click",
    "block_impression",
    "block_click",
    "modal_impression",
    "modal_click",
    "guide_impression",
    "guide_video_click",
    "guide_image_click",
  ]),
})

function getAreaScope(req: Request) {
  return {
    zoneId: typeof req.query.zoneId === "string" ? req.query.zoneId : undefined,
    districtId: typeof req.query.districtId === "string" ? req.query.districtId : undefined,
  }
}

export async function getPlatformContentPayload(req: Request, res: Response) {
  const data = await getPlatformContent(getAreaScope(req))
  return sendSuccess(res, {
    data,
  })
}

export const postCustomerHomeCmsEvent = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const payload = homeCmsEventSchema.parse(req.body)
  const data = await recordCustomerHomeCmsEvent({
    ...payload,
    customerId: req.user?.role === "customer" ? req.user.id : undefined,
  })
  return sendSuccess(res, { data })
})

const accountDeletionRequestSchema = z.object({
  phone: z.string().trim().min(6).max(32),
  reason: z.string().trim().max(500).optional(),
})

export const postAccountDeletionRequest = asyncHandler(async (req: Request, res: Response) => {
  const payload = accountDeletionRequestSchema.parse(req.body)
  const data = await submitAccountDeletionRequest(payload)
  return sendSuccess(res, { data })
})
