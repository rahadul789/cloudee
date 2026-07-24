import type { Response } from "express"
import { z } from "zod"

import type { AuthenticatedRequest } from "../../common/middleware/auth"
import { asyncHandler } from "../../common/utils/async-handler"
import { sendSuccess } from "../../common/utils/api-response"
import {
  getAnalyticsOverview,
  getDashboardSummary,
  getPayoutSummary,
  listPayoutHistory,
  listPayoutHistoryWithFilters,
  listPayoutTransactions,
  listPayoutTransactionsWithFilters,
  requestOwnerPayout,
  updatePayoutMethod
} from "./finance.service"

const payoutMethodUpdateSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("bkash"),
    accountName: z.string().min(1),
    accountNumber: z.string().regex(/^01\d{9}$/)
  }),
  z.object({
    type: z.literal("bank"),
    accountName: z.string().min(1),
    accountNumber: z.string().min(4),
    bankName: z.string().min(1),
    branchName: z.string().min(1)
  })
])

const dashboardSummaryQuerySchema = z.object({
  preset: z
    .enum(["today", "yesterday", "last7Days", "last30Days", "last90Days", "thisWeek", "thisMonth", "lastMonth", "lifetime", "custom"])
    .optional(),
  from: z.string().optional(),
  to: z.string().optional()
})

const analyticsOverviewQuerySchema = dashboardSummaryQuerySchema.extend({
  paymentMethod: z.enum(["Cash", "Bkash"]).optional(),
  orderType: z.enum(["delivery", "pickup"]).optional(),
  categoryId: z.string().optional()
})

const payoutListQuerySchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  type: z.string().optional(),
  sortBy: z.string().optional(),
  preset: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(500).optional()
})

const payoutTransactionListQuerySchema = payoutListQuerySchema.extend({
  payoutId: z.string().optional(),
  pageSize: z.coerce.number().int().min(1).max(2000).optional()
})

function getOwnerId(req: AuthenticatedRequest) {
  return req.user?.id ?? ""
}

function getStringQuery(value: unknown) {
  return typeof value === "string" ? value : undefined
}

export const getOwnerPayoutSummary = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const data = await getPayoutSummary(getOwnerId(req))
    return sendSuccess(res, { data })
  }
)

export const getOwnerPayoutHistory = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = payoutListQuerySchema.parse({
      search: getStringQuery(req.query.search),
      status: getStringQuery(req.query.status),
      sortBy: getStringQuery(req.query.sortBy),
      preset: getStringQuery(req.query.preset),
      from: getStringQuery(req.query.from),
      to: getStringQuery(req.query.to),
      page: getStringQuery(req.query.page),
      pageSize: getStringQuery(req.query.pageSize)
    })
    const data =
      query.search || query.status || query.sortBy || query.preset || query.from || query.to || query.page || query.pageSize
        ? await listPayoutHistoryWithFilters({
            ownerId: getOwnerId(req),
            ...query
          })
        : await listPayoutHistory(getOwnerId(req))
    return sendSuccess(res, { data })
  }
)

export const getOwnerPayoutTransactions = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = payoutTransactionListQuerySchema.parse({
      search: getStringQuery(req.query.search),
      payoutId: getStringQuery(req.query.payoutId),
      type: getStringQuery(req.query.type),
      sortBy: getStringQuery(req.query.sortBy),
      preset: getStringQuery(req.query.preset),
      from: getStringQuery(req.query.from),
      to: getStringQuery(req.query.to),
      page: getStringQuery(req.query.page),
      pageSize: getStringQuery(req.query.pageSize)
    })
    const data =
      query.search || query.payoutId || query.type || query.sortBy || query.preset || query.from || query.to || query.page || query.pageSize
        ? await listPayoutTransactionsWithFilters({
            ownerId: getOwnerId(req),
            ...query
          })
        : await listPayoutTransactions(getOwnerId(req))
    return sendSuccess(res, { data })
  }
)

export const postOwnerPayoutRequest = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const data = await requestOwnerPayout(getOwnerId(req))
    return sendSuccess(res, {
      message: "Payout request submitted for the full available balance",
      data
    })
  }
)

export const putOwnerPayoutMethod = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = payoutMethodUpdateSchema.parse(req.body)
    const data = await updatePayoutMethod({
      ownerId: getOwnerId(req),
      ...payload
    })

    return sendSuccess(res, {
      message: data.verificationSessionId
        ? "Payout method saved. Verification required for this bKash number."
        : "Payout method updated successfully",
      data
    })
  }
)

export const getOwnerDashboardSummary = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = dashboardSummaryQuerySchema.parse(req.query)
    const data = await getDashboardSummary({
      ownerId: getOwnerId(req),
      preset: query.preset,
      from: query.from,
      to: query.to
    })
    return sendSuccess(res, { data })
  }
)

export const getOwnerAnalyticsOverview = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = analyticsOverviewQuerySchema.parse(req.query)
    const data = await getAnalyticsOverview({
      ownerId: getOwnerId(req),
      preset: query.preset,
      from: query.from,
      to: query.to,
      paymentMethod: query.paymentMethod,
      orderType: query.orderType,
      categoryId: query.categoryId
    })
    return sendSuccess(res, { data })
  }
)
