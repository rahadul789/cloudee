import type { Request, Response } from "express"
import { z } from "zod"

import { asyncHandler } from "../../common/utils/async-handler"
import { sendSuccess } from "../../common/utils/api-response"
import {
  cancelCustomerHomeCmsPushSchedule,
  checkCustomerHomeCmsPushReceipts,
  getAdminEditablePlatformContent,
  refreshCustomerHomeCmsPushConversions,
  rollbackPlatformContent,
  scheduleCustomerHomeCmsPushCampaign,
  sendCustomerHomeCmsPushCampaign,
  sendCustomerHomeCmsTestPush,
  updatePlatformContent,
} from "../public/content.service"
import {
  invalidateCustomerRestaurantAvailabilityCaches,
  listRestaurantsWithActiveOffers,
} from "../customer/customer.service"

const rollbackSchema = z.object({
  updatedAt: z.string().trim().min(1),
})

const schedulePushSchema = z.object({
  scheduledAt: z.string().trim().min(1),
})

const testPushSchema = z.object({
  customerId: z.string().trim().min(1),
})

function getAreaScope(req: Request) {
  return {
    zoneId: typeof req.query.zoneId === "string" ? req.query.zoneId : undefined,
    districtId: typeof req.query.districtId === "string" ? req.query.districtId : undefined,
  }
}

export const getAdminPlatformContent = asyncHandler(async (req: Request, res: Response) => {
  const data = await getAdminEditablePlatformContent(getAreaScope(req))
  return sendSuccess(res, { data })
})

export const getAdminRestaurantsWithOffers = asyncHandler(
  async (_req: Request, res: Response) => {
    const restaurants = await listRestaurantsWithActiveOffers()
    return sendSuccess(res, { data: { restaurants } })
  },
)

export const putAdminPlatformContent = asyncHandler(async (req: Request, res: Response) => {
  const data = await updatePlatformContent({
    adminId: req.user?.id ?? "",
    content: req.body,
    scope: getAreaScope(req),
  })

  // Home-section config (featured, offers, allow-repeat, etc.) feeds the customer home
  // feed, which is cached per customer/location — flush it so CMS edits show right away.
  invalidateCustomerRestaurantAvailabilityCaches()

  return sendSuccess(res, {
    message: "Platform content updated successfully",
    data,
  })
})

export const postAdminPlatformContentRollback = asyncHandler(
  async (req: Request, res: Response) => {
    const payload = rollbackSchema.parse(req.body)
    const data = await rollbackPlatformContent({
      adminId: req.user?.id ?? "",
      updatedAt: payload.updatedAt,
    })

    invalidateCustomerRestaurantAvailabilityCaches()

    return sendSuccess(res, {
      message: "Platform content rolled back successfully",
      data,
    })
  }
)

export const postAdminCustomerHomePush = asyncHandler(async (req: Request, res: Response) => {
  const data = await sendCustomerHomeCmsPushCampaign({
    adminId: req.user?.id ?? "",
    scope: getAreaScope(req),
  })

  return sendSuccess(res, {
    message: "Customer home push campaign sent successfully",
    data,
  })
})

export const postAdminCustomerHomeTestPush = asyncHandler(async (req: Request, res: Response) => {
  const payload = testPushSchema.parse(req.body)
  const data = await sendCustomerHomeCmsTestPush({
    adminId: req.user?.id ?? "",
    customerId: payload.customerId,
    scope: getAreaScope(req),
  })

  return sendSuccess(res, {
    message: "Customer home test push sent successfully",
    data,
  })
})

export const postAdminCustomerHomePushReceipts = asyncHandler(async (req: Request, res: Response) => {
  const data = await checkCustomerHomeCmsPushReceipts({
    adminId: req.user?.id ?? "",
    scope: getAreaScope(req),
  })

  return sendSuccess(res, {
    message: "Customer home push receipts checked successfully",
    data,
  })
})

export const postAdminCustomerHomePushConversions = asyncHandler(async (req: Request, res: Response) => {
  const data = await refreshCustomerHomeCmsPushConversions({
    adminId: req.user?.id ?? "",
    scope: getAreaScope(req),
  })

  return sendSuccess(res, {
    message: "Customer home push conversions refreshed successfully",
    data,
  })
})

export const postAdminCustomerHomePushSchedule = asyncHandler(async (req: Request, res: Response) => {
  const payload = schedulePushSchema.parse(req.body)
  const data = await scheduleCustomerHomeCmsPushCampaign({
    adminId: req.user?.id ?? "",
    scheduledAt: payload.scheduledAt,
    scope: getAreaScope(req),
  })

  return sendSuccess(res, {
    message: "Customer home push scheduled successfully",
    data,
  })
})

export const postAdminCustomerHomePushScheduleCancel = asyncHandler(async (req: Request, res: Response) => {
  const data = await cancelCustomerHomeCmsPushSchedule({
    adminId: req.user?.id ?? "",
    scope: getAreaScope(req),
  })

  return sendSuccess(res, {
    message: "Customer home push schedule cancelled successfully",
    data,
  })
})
