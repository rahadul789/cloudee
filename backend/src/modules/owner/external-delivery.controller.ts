import type { Response } from "express"
import { z } from "zod"

import type { AuthenticatedRequest } from "../../common/middleware/auth"
import { asyncHandler } from "../../common/utils/async-handler"
import { sendSuccess } from "../../common/utils/api-response"
import {
  cancelExternalDelivery,
  createExternalDelivery,
  getExternalDeliveryById,
  getOwnerExternalDeliveryConfig,
  listExternalDeliveries,
} from "./external-delivery.service"
import { getOwnerRestaurantContext } from "./operational.service"

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

const createSchema = z.object({
  customerName: z.string().trim().min(1).max(120),
  customerPhone: z.string().trim().min(1).max(30),
  dropAddress: z.string().trim().min(1).max(500),
  orderValue: z.coerce.number().min(0),
  paymentMode: z.enum(["cod", "online"]),
})

const listQuerySchema = z.object({
  tab: z.enum(["live", "history"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
})

const cancelSchema = z.object({
  reason: z.string().trim().max(300).optional(),
})

// GET /owner/external-deliveries/config — is the feature on for this owner + the flat fee.
// Drives the owner-app/web nav visibility and the fee shown on the request form.
export const getOwnerExternalDeliveryConfigController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { restaurantId } = await getOwnerRestaurantContext(getOwnerId(req))
    const data = await getOwnerExternalDeliveryConfig(restaurantId)
    return sendSuccess(res, { data })
  },
)

// POST /owner/external-deliveries — create an off-platform delivery request.
export const postOwnerExternalDelivery = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = createSchema.parse(req.body)
    const ownerId = getOwnerId(req)
    const { restaurantId } = await getOwnerRestaurantContext(ownerId)
    const data = await createExternalDelivery({
      restaurantId,
      createdByOwnerId: ownerId,
      ...payload,
    })
    return sendSuccess(res, { data })
  },
)

// GET /owner/external-deliveries — list the owner's off-platform delivery orders.
export const getOwnerExternalDeliveries = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = listQuerySchema.parse({
      tab: getStringParam(req.query.tab) || undefined,
      page: getStringParam(req.query.page) || undefined,
      pageSize: getStringParam(req.query.pageSize) || undefined,
    })
    const { restaurantId } = await getOwnerRestaurantContext(getOwnerId(req))
    const data = await listExternalDeliveries({ restaurantId, ...query })
    return sendSuccess(res, { data })
  },
)

// GET /owner/external-deliveries/:orderId — one off-platform delivery order.
export const getOwnerExternalDeliveryById = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { restaurantId } = await getOwnerRestaurantContext(getOwnerId(req))
    const data = await getExternalDeliveryById({
      restaurantId,
      orderId: getStringParam(req.params.orderId),
    })
    return sendSuccess(res, { data })
  },
)

// POST /owner/external-deliveries/:orderId/cancel — cancel a still-unassigned delivery.
export const postOwnerExternalDeliveryCancel = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = cancelSchema.parse(req.body ?? {})
    const { restaurantId } = await getOwnerRestaurantContext(getOwnerId(req))
    const data = await cancelExternalDelivery({
      restaurantId,
      orderId: getStringParam(req.params.orderId),
      reason: payload.reason,
    })
    return sendSuccess(res, { data })
  },
)
