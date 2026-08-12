import type { Response } from "express"
import { z } from "zod"

import type { AuthenticatedRequest } from "../../common/middleware/auth"
import { asyncHandler } from "../../common/utils/async-handler"
import { sendSuccess } from "../../common/utils/api-response"
import {
  getExternalDeliveryAdminSummary,
  getExternalDeliveryConfig,
  getExternalDeliveryReports,
  listExternalDeliveriesForAdmin,
  reconcileExternalDelivery,
  setExternalDeliveryConfig,
  settleExternalDeliveries,
} from "../owner/external-delivery.service"

function getAdminId(req: AuthenticatedRequest) {
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

const listQuerySchema = z.object({
  restaurantId: z.string().optional(),
  status: z.string().optional(),
  settlementStatus: z
    .enum(["pending", "collected", "reconciled", "settled", "held", "cancelled"])
    .optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
})

const configSchema = z.object({
  enabled: z.boolean().optional(),
  deliveryFeeTaka: z.number().min(0).max(100000).optional(),
  settlementPolicy: z
    .enum(["same_day", "t_plus_1", "t_plus_n", "platform_default"])
    .optional(),
  settlementDays: z.number().int().min(1).max(30).nullable().optional(),
  exposureCapTaka: z.number().min(0).nullable().optional(),
})

const settleSchema = z.object({
  orderIds: z.array(z.string().min(1)).min(1),
})

// GET /admin/external-deliveries — oversight list across all restaurants.
export const getAdminExternalDeliveries = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = listQuerySchema.parse({
      restaurantId: getStringParam(req.query.restaurantId) || undefined,
      status: getStringParam(req.query.status) || undefined,
      settlementStatus: getStringParam(req.query.settlementStatus) || undefined,
      page: getStringParam(req.query.page) || undefined,
      pageSize: getStringParam(req.query.pageSize) || undefined,
    })
    const data = await listExternalDeliveriesForAdmin(query)
    return sendSuccess(res, { data })
  },
)

// GET /admin/external-deliveries/summary — settlement money totals.
export const getAdminExternalDeliverySummary = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const restaurantId = getStringParam(req.query.restaurantId) || undefined
    const data = await getExternalDeliveryAdminSummary({ restaurantId })
    return sendSuccess(res, { data })
  },
)

// GET /admin/external-deliveries/reports — per-restaurant revenue/fee/settlement report.
export const getAdminExternalDeliveryReports = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const data = await getExternalDeliveryReports({
      from: getStringParam(req.query.from) || undefined,
      to: getStringParam(req.query.to) || undefined,
    })
    return sendSuccess(res, { data })
  },
)

// GET /admin/external-deliveries/restaurants/:restaurantId/config
export const getAdminExternalDeliveryConfig = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const data = await getExternalDeliveryConfig(
      getStringParam(req.params.restaurantId),
    )
    return sendSuccess(res, { data })
  },
)

// PATCH /admin/external-deliveries/restaurants/:restaurantId/config
export const patchAdminExternalDeliveryConfig = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = configSchema.parse(req.body ?? {})
    const data = await setExternalDeliveryConfig({
      restaurantId: getStringParam(req.params.restaurantId),
      adminId: getAdminId(req),
      ...payload,
    })
    return sendSuccess(res, { data })
  },
)

// POST /admin/external-deliveries/settle — settle a batch of reconciled orders.
export const postAdminExternalDeliverySettle = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = settleSchema.parse(req.body ?? {})
    const data = await settleExternalDeliveries({
      orderIds: payload.orderIds,
      adminId: getAdminId(req),
    })
    return sendSuccess(res, { data })
  },
)

// POST /admin/external-deliveries/:orderId/reconcile — confirm COD cash deposited.
export const postAdminExternalDeliveryReconcile = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const data = await reconcileExternalDelivery({
      orderId: getStringParam(req.params.orderId),
      adminId: getAdminId(req),
    })
    return sendSuccess(res, { data })
  },
)
