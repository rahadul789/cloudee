import type { Request, Response } from "express"
import { z } from "zod"

import type { AuthenticatedRequest } from "../../common/middleware/auth"
import { asyncHandler } from "../../common/utils/async-handler"
import { sendSuccess } from "../../common/utils/api-response"
import { getSmsProviderBalance } from "../auth/otp-sms.service"
import { getRoutingApiUsageAnalytics } from "../routing/routing.service"
import {
  type AdminPlatformSettings,
  getAdminPlatformSettings,
  updateAdminPlatformSettings,
} from "./settings.service"

const settingsSchema = z.object({
  settings: z.object({
    branding: z.unknown(),
    operations: z.unknown(),
    auth: z.unknown(),
    supportContact: z.unknown(),
    helpCenter: z.unknown(),
    legal: z.unknown(),
  }),
})

const settingsScopeQuerySchema = z.object({
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
})

const routingUsageQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export const getAdminSettingsController = asyncHandler(
  async (req: Request, res: Response) => {
    const query = settingsScopeQuerySchema.parse(req.query)
    const data = await getAdminPlatformSettings(query)
    return sendSuccess(res, { data })
  },
)

export const getAdminSmsBalanceController = asyncHandler(
  async (_req: Request, res: Response) => {
    const data = await getSmsProviderBalance()
    return sendSuccess(res, { data })
  },
)

export const getAdminRoutingUsageController = asyncHandler(
  async (req: Request, res: Response) => {
    const query = routingUsageQuerySchema.parse(req.query)
    const data = await getRoutingApiUsageAnalytics(query)
    return sendSuccess(res, { data })
  },
)

export const putAdminSettingsController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = settingsSchema.parse(req.body)
    const query = settingsScopeQuerySchema.parse(req.query)
    const data = await updateAdminPlatformSettings({
      adminId: req.user?.id ?? "",
      settings: payload.settings as AdminPlatformSettings,
      zoneId: query.zoneId,
      districtId: query.districtId,
    })

    return sendSuccess(res, {
      message: "Platform settings updated successfully",
      data,
    })
  },
)
