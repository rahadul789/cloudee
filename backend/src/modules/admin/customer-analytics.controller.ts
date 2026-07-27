import type { Request, Response } from "express"
import { z } from "zod"

import type { AuthenticatedRequest } from "../../common/middleware/auth"
import { asyncHandler } from "../../common/utils/async-handler"
import { sendSuccess } from "../../common/utils/api-response"
import {
  getAdminCustomerAnalyticsActorDetail,
  getAdminCustomerAnalyticsCustomers,
  getAdminCustomerAnalyticsEvents,
  getAdminCustomerAnalyticsFunnels,
  getAdminCustomerAnalyticsOverview,
  getAdminCustomerAnalyticsPayments,
  getAdminRestaurantViewStats,
} from "./customer-analytics.service"

const analyticsPresetSchema = z.enum([
  "today",
  "yesterday",
  "last7Days",
  "last30Days",
  "last90Days",
  "thisMonth",
  "lastMonth",
  "lifetime",
  "custom",
])

const analyticsQuerySchema = z.object({
  preset: analyticsPresetSchema.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(5).max(100).optional(),
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
})

const analyticsEventsQuerySchema = analyticsQuerySchema.extend({
  eventType: z.string().optional(),
  actorType: z.enum(["all", "guest", "customer"]).optional(),
  search: z.string().optional(),
  customerId: z.string().optional(),
  anonymousId: z.string().optional(),
  sessionId: z.string().optional(),
  path: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().min(5).max(100).optional(),
})

const analyticsActorQuerySchema = analyticsQuerySchema.extend({
  customerId: z.string().optional(),
  anonymousId: z.string().optional(),
}).refine((query) => Boolean(query.customerId || query.anonymousId), {
  message: "customerId or anonymousId is required",
})

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export const getAdminCustomerAnalyticsOverviewController = asyncHandler(
  async (req: Request, res: Response) => {
    const query = analyticsQuerySchema.parse({
      preset: normalizeOptionalString(req.query.preset),
      from: normalizeOptionalString(req.query.from),
      to: normalizeOptionalString(req.query.to),
      limit: normalizeOptionalString(req.query.limit),
      zoneId: normalizeOptionalString(req.query.zoneId),
      districtId: normalizeOptionalString(req.query.districtId),
    })
    const data = await getAdminCustomerAnalyticsOverview(query)
    return sendSuccess(res, { data })
  },
)

export const getAdminCustomerAnalyticsFunnelsController = asyncHandler(
  async (req: Request, res: Response) => {
    const query = analyticsQuerySchema.parse({
      preset: normalizeOptionalString(req.query.preset),
      from: normalizeOptionalString(req.query.from),
      to: normalizeOptionalString(req.query.to),
      limit: normalizeOptionalString(req.query.limit),
      zoneId: normalizeOptionalString(req.query.zoneId),
      districtId: normalizeOptionalString(req.query.districtId),
    })
    const data = await getAdminCustomerAnalyticsFunnels(query)
    return sendSuccess(res, { data })
  },
)

export const getAdminCustomerAnalyticsCustomersController = asyncHandler(
  async (req: Request, res: Response) => {
    const query = analyticsQuerySchema.parse({
      preset: normalizeOptionalString(req.query.preset),
      from: normalizeOptionalString(req.query.from),
      to: normalizeOptionalString(req.query.to),
      limit: normalizeOptionalString(req.query.limit),
      zoneId: normalizeOptionalString(req.query.zoneId),
      districtId: normalizeOptionalString(req.query.districtId),
    })
    const data = await getAdminCustomerAnalyticsCustomers(query)
    return sendSuccess(res, { data })
  },
)

export const getAdminCustomerAnalyticsPaymentsController = asyncHandler(
  async (req: Request, res: Response) => {
    const query = analyticsQuerySchema.parse({
      preset: normalizeOptionalString(req.query.preset),
      from: normalizeOptionalString(req.query.from),
      to: normalizeOptionalString(req.query.to),
      limit: normalizeOptionalString(req.query.limit),
      zoneId: normalizeOptionalString(req.query.zoneId),
      districtId: normalizeOptionalString(req.query.districtId),
    })
    const data = await getAdminCustomerAnalyticsPayments(query)
    return sendSuccess(res, { data })
  },
)

export const getAdminCustomerAnalyticsEventsController = asyncHandler(
  async (req: Request, res: Response) => {
    const query = analyticsEventsQuerySchema.parse({
      preset: normalizeOptionalString(req.query.preset),
      from: normalizeOptionalString(req.query.from),
      to: normalizeOptionalString(req.query.to),
      limit: normalizeOptionalString(req.query.limit),
      zoneId: normalizeOptionalString(req.query.zoneId),
      districtId: normalizeOptionalString(req.query.districtId),
      eventType: normalizeOptionalString(req.query.eventType),
      actorType: normalizeOptionalString(req.query.actorType),
      search: normalizeOptionalString(req.query.search),
      customerId: normalizeOptionalString(req.query.customerId),
      anonymousId: normalizeOptionalString(req.query.anonymousId),
      sessionId: normalizeOptionalString(req.query.sessionId),
      path: normalizeOptionalString(req.query.path),
      page: normalizeOptionalString(req.query.page),
      pageSize: normalizeOptionalString(req.query.pageSize),
    })
    const data = await getAdminCustomerAnalyticsEvents(query)
    return sendSuccess(res, { data })
  },
)

export const getAdminCustomerAnalyticsActorDetailController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = analyticsActorQuerySchema.parse({
      preset: normalizeOptionalString(req.query.preset),
      from: normalizeOptionalString(req.query.from),
      to: normalizeOptionalString(req.query.to),
      limit: normalizeOptionalString(req.query.limit),
      zoneId: normalizeOptionalString(req.query.zoneId),
      districtId: normalizeOptionalString(req.query.districtId),
      customerId: normalizeOptionalString(req.query.customerId),
      anonymousId: normalizeOptionalString(req.query.anonymousId),
    })
    const data = await getAdminCustomerAnalyticsActorDetail(query)
    return sendSuccess(res, { data })
  },
)

const restaurantViewStatsQuerySchema = z.object({
  restaurantId: z.string().trim().min(1).max(120),
  window: z.enum(["5m", "10m", "20m", "1h", "24h", "today"]).optional(),
})

export const getAdminRestaurantViewStatsController = asyncHandler(
  async (req: Request, res: Response) => {
    const query = restaurantViewStatsQuerySchema.parse({
      restaurantId: normalizeOptionalString(req.query.restaurantId),
      window: normalizeOptionalString(req.query.window),
    })
    const data = await getAdminRestaurantViewStats(query)
    return sendSuccess(res, { data })
  },
)
