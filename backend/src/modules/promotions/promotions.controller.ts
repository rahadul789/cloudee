import type { Request, Response } from "express"
import { z } from "zod"

import type { AuthenticatedRequest } from "../../common/middleware/auth"
import { asyncHandler } from "../../common/utils/async-handler"
import { sendSuccess } from "../../common/utils/api-response"
import {
  archiveAdminVoucher,
  createAdminVoucher,
  createOwnerVoucher,
  deleteOwnerVoucher,
  listAdminVouchers,
  listOwnerVouchers,
  listOwnerVouchersWithFilters,
  restoreAdminVoucher,
  recordVoucherDisplayEvent,
  sendAdminVoucherPushCampaign,
  updateAdminVoucher,
  updateOwnerVoucher
} from "./promotions.service"

const voucherSchema = z.object({
  restaurantId: z.string().optional(),
  scopeType: z.enum(["restaurant", "selected_restaurants", "all_restaurants"]).optional(),
  selectedRestaurantIds: z.array(z.string()).optional(),
  audienceType: z.enum(["all_users", "new_users", "returning_users", "selected_users"]).optional(),
  selectedCustomerIds: z.array(z.string()).optional(),
  customerGroupKey: z.string().optional(),
  display: z
    .object({
      showOnHome: z.boolean().optional(),
      showInOfferStrip: z.boolean().optional(),
      placement: z.enum(["top", "after_banner", "offers_row"]).optional(),
      variant: z.enum(["chip", "block", "image", "carousel"]).optional(),
      position: z.number().int().min(0).optional(),
      title: z.string().optional(),
      subtitle: z.string().optional(),
      imageUrl: z.string().optional(),
      carouselImageUrls: z.array(z.string()).optional(),
      openInModal: z.boolean().optional(),
      ctaLabel: z.string().optional(),
      ctaPath: z.string().optional(),
      backgroundColor: z.string().optional(),
      textColor: z.string().optional(),
      accentColor: z.string().optional()
    })
    .optional(),
  pushCampaign: z
    .object({
      enabled: z.boolean().optional(),
      title: z.string().optional(),
      body: z.string().optional(),
      path: z.string().optional()
    })
    .optional(),
  fundedBy: z.enum(["owner", "platform", "shared"]),
  ownerSharePercent: z.number().min(0).max(100).optional(),
  platformSharePercent: z.number().min(0).max(100).optional(),
  stackingRule: z.enum(["exclusive", "stackable"]),
  priority: z.number().int().min(0).optional(),
  surface: z.enum(["checkout", "menu_markdown"]).optional(),
  mode: z.enum(["auto", "coupon"]),
  type: z.enum(["flat", "percentage", "free_delivery"]),
  name: z.string().min(1),
  code: z.string().optional(),
  discountValue: z.number().min(0).optional(),
  maxDiscountAmount: z.number().min(0).optional(),
  minimumOrderAmount: z.number().min(0).optional(),
  minItemPrice: z.number().min(0).optional(),
  maxTotalUses: z.number().int().min(0).optional(),
  maxUsesPerUser: z.number().int().min(0).optional(),
  allowRepeatUsage: z.boolean().optional(),
  maxTotalDiscountBudget: z.number().min(0).optional(),
  status: z.enum(["Draft", "Active"]).optional(),
  applicability: z.enum(["all", "categories", "items"]).optional(),
  categoryIds: z.array(z.string()).optional(),
  itemIds: z.array(z.string()).optional(),
  cuisineTypes: z.array(z.string()).optional(),
  zoneIds: z.array(z.string()).optional(),
  districtIds: z.array(z.string()).optional(),
  startsAt: z.string(),
  endsAt: z.string()
})

const ownerVoucherListQuerySchema = z.object({
  search: z.string().optional(),
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
  lifecycle: z.enum(["all", "Active", "Scheduled", "Expired", "Draft", "Archived"]).optional(),
  mode: z.enum(["all", "auto", "coupon"]).optional(),
  type: z.enum(["all", "flat", "percentage", "free-delivery"]).optional(),
  scopeType: z.enum(["all", "restaurant", "selected_restaurants", "all_restaurants"]).optional(),
  sortBy: z.enum(["newestUpdated", "highestUses", "highestDiscount", "endingSoon"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional()
})

const archiveVoucherSchema = z.object({
  reason: z.string().optional()
})

const voucherDisplayEventSchema = z.object({
  voucherId: z.string().min(1),
  eventType: z.enum(["impression", "click", "modal_open", "strip_click"])
})

const adminVoucherListQuerySchema = ownerVoucherListQuerySchema.extend({
  restaurantId: z.string().optional(),
  surface: z.enum(["all", "checkout", "menu_markdown"]).optional()
})

const adminVoucherCreateSchema = voucherSchema.extend({
  restaurantId: z.string().optional()
})

function getOwnerId(req: AuthenticatedRequest) {
  return req.user?.id ?? ""
}

function getStringParam(value: unknown) {
  if (typeof value === "string") return value
  if (Array.isArray(value)) {
    const firstValue = value[0]
    return typeof firstValue === "string" ? firstValue : ""
  }
  return ""
}

function getAdminAreaScope(req: Request) {
  return {
    zoneId: getStringParam(req.query.zoneId) || undefined,
    districtId: getStringParam(req.query.districtId) || undefined,
  }
}

export const getOwnerVouchers = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const query = ownerVoucherListQuerySchema.parse({
    search: getStringParam(req.query.search) || undefined,
    lifecycle: getStringParam(req.query.lifecycle) || undefined,
    mode: getStringParam(req.query.mode) || undefined,
    type: getStringParam(req.query.type) || undefined,
    sortBy: getStringParam(req.query.sortBy) || undefined,
    page: getStringParam(req.query.page) || undefined,
    pageSize: getStringParam(req.query.pageSize) || undefined
  })
  const data =
    query.search || query.lifecycle || query.mode || query.type || query.sortBy || query.page || query.pageSize
      ? await listOwnerVouchersWithFilters({
          ownerId: getOwnerId(req),
          ...query
        })
      : await listOwnerVouchers(getOwnerId(req))
  return sendSuccess(res, { data })
})

export const postOwnerVoucher = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const payload = voucherSchema.parse(req.body)
  const data = await createOwnerVoucher({
    ownerId: getOwnerId(req),
    ...payload
  })
  return sendSuccess(res, { message: "Voucher created successfully", data })
})

export const patchOwnerVoucher = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const payload = voucherSchema.partial().parse(req.body)
  const data = await updateOwnerVoucher({
    ownerId: getOwnerId(req),
    voucherId: getStringParam(req.params.voucherId),
    ...payload
  })
  return sendSuccess(res, { message: "Voucher updated successfully", data })
})

export const getAdminVouchers = asyncHandler(async (req: Request, res: Response) => {
  const query = adminVoucherListQuerySchema.parse({
    restaurantId: getStringParam(req.query.restaurantId) || undefined,
    zoneId: getStringParam(req.query.zoneId) || undefined,
    districtId: getStringParam(req.query.districtId) || undefined,
    scopeType: getStringParam(req.query.scopeType) || undefined,
    surface: getStringParam(req.query.surface) || undefined,
    search: getStringParam(req.query.search) || undefined,
    lifecycle: getStringParam(req.query.lifecycle) || undefined,
    mode: getStringParam(req.query.mode) || undefined,
    type: getStringParam(req.query.type) || undefined,
    sortBy: getStringParam(req.query.sortBy) || undefined,
    page: getStringParam(req.query.page) || undefined,
    pageSize: getStringParam(req.query.pageSize) || undefined
  })
  const data = await listAdminVouchers(query)
  return sendSuccess(res, { data })
})

export const postAdminVoucher = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const payload = adminVoucherCreateSchema.parse(req.body)
  const data = await createAdminVoucher({
    adminId: getOwnerId(req),
    adminScope: getAdminAreaScope(req),
    ...payload
  })
  return sendSuccess(res, { message: "Voucher created successfully", data })
})

export const patchAdminVoucher = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const payload = voucherSchema.partial().parse(req.body)
  const data = await updateAdminVoucher({
    adminId: getOwnerId(req),
    voucherId: getStringParam(req.params.voucherId),
    adminScope: getAdminAreaScope(req),
    ...payload
  })
  return sendSuccess(res, { message: "Voucher updated successfully", data })
})

export const archiveAdminVoucherById = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = archiveVoucherSchema.parse(req.body)
    const data = await archiveAdminVoucher({
      adminId: getOwnerId(req),
      voucherId: getStringParam(req.params.voucherId),
      adminScope: getAdminAreaScope(req),
      reason: payload.reason
    })
    return sendSuccess(res, { message: "Voucher archived successfully", data })
  }
)

export const restoreAdminVoucherById = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const data = await restoreAdminVoucher({
      adminId: getOwnerId(req),
      voucherId: getStringParam(req.params.voucherId),
      adminScope: getAdminAreaScope(req)
    })
    return sendSuccess(res, { message: "Voucher restored successfully", data })
  }
)

export const sendAdminVoucherPushCampaignById = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const data = await sendAdminVoucherPushCampaign({
      adminId: getOwnerId(req),
      voucherId: getStringParam(req.params.voucherId),
      adminScope: getAdminAreaScope(req)
    })
    return sendSuccess(res, { message: "Push campaign sent successfully", data })
  }
)

export const postVoucherDisplayEvent = asyncHandler(async (req: Request, res: Response) => {
  const payload = voucherDisplayEventSchema.parse(req.body)
  const data = await recordVoucherDisplayEvent(payload)
  return sendSuccess(res, { data })
})

export const deleteOwnerVoucherById = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const data = await deleteOwnerVoucher({
      ownerId: getOwnerId(req),
      voucherId: getStringParam(req.params.voucherId)
    })
    return sendSuccess(res, { message: "Voucher deleted successfully", data })
  }
)
