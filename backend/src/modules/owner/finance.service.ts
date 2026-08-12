import { StatusCodes } from "http-status-codes"
import mongoose, { type PipelineStage, type SortOrder } from "mongoose"

import { emitSocketEvent } from "../../config/socket"
import { AppError } from "../../common/utils/app-error"
import { createInMemoryAsyncCache } from "../../common/utils/in-memory-cache"
import { OwnerModel, PayoutMethodModel, RestaurantModel } from "../auth/auth.model"
import { createOtpSession, getOtpSessionTiming } from "../auth/auth.service"
import { createAdminOperationalAlert } from "../admin/admin-alert.service"
import { getOperationalFinanceSettings } from "../public/content.service"
import {
  buildRelatedOrderPayoutEligibilityMatch,
  isRestaurantPayoutEligibleOrder
} from "./finance-rules"
import { LedgerEntryModel, PayoutBatchModel } from "./finance.model"
import { ReviewModel } from "./experience.model"
import { OrderModel } from "./operational.model"
import {
  buildDhakaPresetRange,
  buildDhakaTodayRange,
  buildPreviousRange,
  type OwnerDateRange
} from "./date-ranges"

type DashboardPreset =
  | "today"
  | "yesterday"
  | "last7Days"
  | "last30Days"
  | "last90Days"
  | "thisWeek"
  | "thisMonth"
  | "lastMonth"
  | "lifetime"
  | "custom"

const walletLedgerEntryTypes = ["earning", "refund", "adjustment"] as const
const payoutResidualSourceTypes = ["payout_residual", "payout_residual_reversal"] as const
const ledgerFreshnessTtlMs = 15 * 60_000
const ledgerFreshnessMaxEntries = 500
const OWNER_FINANCE_CACHE_TTL_MS = 10_000
const OWNER_FINANCE_STALE_REVALIDATE_MS = 30_000
const ledgerFreshnessByRestaurant = new Map<
  string,
  { checkedAt: number; promise?: Promise<void> }
>()
const ownerDashboardSummaryCache = createInMemoryAsyncCache<any>({
  ttlMs: OWNER_FINANCE_CACHE_TTL_MS,
  staleWhileRevalidateMs: OWNER_FINANCE_STALE_REVALIDATE_MS,
  maxEntries: 300,
})
const ownerAnalyticsOverviewCache = createInMemoryAsyncCache<any>({
  ttlMs: OWNER_FINANCE_CACHE_TTL_MS,
  staleWhileRevalidateMs: OWNER_FINANCE_STALE_REVALIDATE_MS,
  maxEntries: 300,
})

function pruneLedgerFreshnessCache(now = Date.now()) {
  for (const [key, entry] of ledgerFreshnessByRestaurant) {
    if (!entry.promise && now - entry.checkedAt > ledgerFreshnessTtlMs) {
      ledgerFreshnessByRestaurant.delete(key)
    }
  }

  if (ledgerFreshnessByRestaurant.size <= ledgerFreshnessMaxEntries) {
    return
  }

  for (const [key, entry] of ledgerFreshnessByRestaurant) {
    if (entry.promise) continue
    ledgerFreshnessByRestaurant.delete(key)
    if (ledgerFreshnessByRestaurant.size <= ledgerFreshnessMaxEntries) {
      break
    }
  }
}

function touchLedgerFreshnessEntry(
  cacheKey: string,
  entry: { checkedAt: number; promise?: Promise<void> },
) {
  ledgerFreshnessByRestaurant.delete(cacheKey)
  ledgerFreshnessByRestaurant.set(cacheKey, entry)
}

export function invalidateOwnerFinanceCaches(restaurantId?: string) {
  ownerDashboardSummaryCache.clear()
  ownerAnalyticsOverviewCache.clear()

  if (restaurantId) {
    ledgerFreshnessByRestaurant.delete(String(restaurantId))
  } else {
    ledgerFreshnessByRestaurant.clear()
  }
}

function normalizeFinanceCacheString(value?: string) {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

function buildOwnerFinanceCacheKey(
  prefix: string,
  params: {
    ownerId: string
    preset?: string
    from?: string
    to?: string
    paymentMethod?: string
    orderType?: string
    categoryId?: string
  },
) {
  return `${prefix}:${JSON.stringify({
    ownerId: params.ownerId,
    preset: normalizeFinanceCacheString(params.preset),
    from: normalizeFinanceCacheString(params.from),
    to: normalizeFinanceCacheString(params.to),
    paymentMethod: normalizeFinanceCacheString(params.paymentMethod),
    orderType: normalizeFinanceCacheString(params.orderType),
    categoryId: normalizeFinanceCacheString(params.categoryId),
  })}`
}

function toObjectId(value: string) {
  return mongoose.Types.ObjectId.isValid(value)
    ? new mongoose.Types.ObjectId(value)
    : value
}

function normalizeAggregateMatch(match: Record<string, unknown>) {
  if (typeof match.restaurantId !== "string") {
    return match
  }

  return {
    ...match,
    restaurantId: toObjectId(match.restaurantId)
  }
}

function getSettlementAvailableAt(deliveredAt: Date, settlementDelayDays: number) {
  return new Date(
    deliveredAt.getTime() + settlementDelayDays * 24 * 60 * 60 * 1000
  )
}

function getOrderDeliveredAt(order: {
  timestamps?: Record<string, unknown>
  updatedAt?: Date | string | null
}) {
  const timestamp =
    order.timestamps?.deliveredAt ?? order.timestamps?.Delivered ?? order.updatedAt
  const deliveredAt = timestamp ? new Date(timestamp as Date | string) : new Date()
  return Number.isNaN(deliveredAt.getTime()) ? new Date() : deliveredAt
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function normalizeCommissionRate(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return 15
  return Math.min(100, Math.max(0, value))
}

function resolveCommissionRateForDate(restaurant: Record<string, any>, date: Date) {
  const currentRate = normalizeCommissionRate(restaurant.commercial?.commissionRate)
  const history = Array.isArray(restaurant.commercial?.commissionHistory)
    ? [...restaurant.commercial.commissionHistory]
        .map((entry) => ({
          previousRate:
            typeof entry.previousRate === "number"
              ? normalizeCommissionRate(entry.previousRate)
              : null,
          rate: normalizeCommissionRate(entry.rate),
          createdAt: entry.createdAt ? new Date(entry.createdAt) : null
        }))
        .filter((entry) => entry.createdAt && !Number.isNaN(entry.createdAt.getTime()))
        .sort((a, b) => a.createdAt!.getTime() - b.createdAt!.getTime())
    : []

  if (!history.length) return currentRate

  let rate = history[0]?.previousRate ?? history[0]?.rate ?? currentRate
  for (const entry of history) {
    if (entry.createdAt!.getTime() <= date.getTime()) {
      rate = entry.rate
    }
  }

  return rate
}

function getOrderDiscountAmount(order: Record<string, any>) {
  return numberValue(
    order.pricing?.discountAmount,
    numberValue(order.pricing?.discount)
  )
}

function getAppliedVoucherDiscountSplit(order: Record<string, any>) {
  const vouchers = Array.isArray(order.appliedVouchers) ? order.appliedVouchers : []

  if (!vouchers.length) {
    return null
  }

  return vouchers.reduce(
    (summary, voucher) => {
      const discountAmount = numberValue(voucher?.discountAmount)
      const fundedBy = String(voucher?.fundedBy ?? "owner").toLowerCase()
      const ownerSharePercent =
        fundedBy === "platform"
          ? 0
          : fundedBy === "owner"
            ? 100
            : Math.min(100, Math.max(0, numberValue(voucher?.ownerSharePercent)))
      const ownerDiscountCost = numberValue(
        voucher?.ownerDiscountCost,
        Math.round(discountAmount * (ownerSharePercent / 100))
      )
      const platformDiscountCost = numberValue(
        voucher?.platformDiscountCost,
        Math.max(0, discountAmount - ownerDiscountCost)
      )

      summary.ownerDiscountCost += ownerDiscountCost
      summary.platformDiscountCost += platformDiscountCost
      return summary
    },
    { ownerDiscountCost: 0, platformDiscountCost: 0 }
  )
}

function getOrderOwnerDiscountCost(order: Record<string, any>) {
  const voucherSplit = getAppliedVoucherDiscountSplit(order)
  return numberValue(
    order.pricing?.ownerDiscountCost,
    voucherSplit?.ownerDiscountCost ?? getOrderDiscountAmount(order)
  )
}

function getOrderPlatformDiscountCost(order: Record<string, any>) {
  const voucherSplit = getAppliedVoucherDiscountSplit(order)
  return numberValue(
    order.pricing?.platformDiscountCost,
    voucherSplit?.platformDiscountCost ?? 0
  )
}

function getOrderSubtotalForOwner(order: Record<string, any>) {
  if (typeof order.pricing?.subtotal === "number" && Number.isFinite(order.pricing.subtotal)) {
    return Math.max(0, order.pricing.subtotal)
  }

  const total = numberValue(order.pricing?.total)
  const deliveryFee = numberValue(order.pricing?.deliveryFee)
  return Math.max(0, total - deliveryFee + getOrderDiscountAmount(order))
}

function getOrderRestaurantNetSalesForOwner(order: Record<string, any>) {
  return Math.max(0, getOrderSubtotalForOwner(order) - getOrderOwnerDiscountCost(order))
}

function getOrderNetEarnings(order: Record<string, any>, restaurant: Record<string, any>) {
  const deliveredAt = getOrderDeliveredAt(order)
  const grossAmount = getOrderSubtotalForOwner(order)
  const commissionRate = resolveCommissionRateForDate(restaurant, deliveredAt)
  const commission = Math.round(grossAmount * (commissionRate / 100))
  const discountCost = getOrderOwnerDiscountCost(order)

  return {
    grossAmount,
    commission,
    discountCost,
    platformDiscountCost: getOrderPlatformDiscountCost(order),
    deliveryCost: numberValue(order.pricing?.deliveryFee),
    netAmount: grossAmount - commission - discountCost
  }
}

function ownerSubtotalAggregateExpression() {
  return {
    $ifNull: [
      "$pricing.subtotal",
      {
        $add: [
          {
            $subtract: [
              { $ifNull: ["$pricing.total", 0] },
              { $ifNull: ["$pricing.deliveryFee", 0] }
            ]
          },
          totalDiscountAggregateExpression()
        ]
      }
    ]
  }
}

function totalDiscountAggregateExpression() {
  return {
    $ifNull: [
      "$pricing.discountAmount",
      { $ifNull: ["$pricing.discount", 0] }
    ]
  }
}

function ownerDiscountAggregateExpression() {
  return {
    $ifNull: [
      "$pricing.ownerDiscountCost",
      totalDiscountAggregateExpression()
    ]
  }
}

function ownerNetSalesAggregateExpression() {
  return {
    $subtract: [
      ownerSubtotalAggregateExpression(),
      ownerDiscountAggregateExpression()
    ]
  }
}

function summarizeDeliveredOrdersForOwner(
  orders: Array<Record<string, any>>,
  restaurant: Record<string, any>
) {
  return orders.reduce(
    (summary, order) => {
      const values = getOrderNetEarnings(order, restaurant)
      summary.gross += values.grossAmount
      summary.net += values.netAmount
      summary.commission += values.commission
      summary.discountCost += values.discountCost
      summary.deliveryCost += values.deliveryCost
      summary.platformDiscountCost += values.platformDiscountCost
      return summary
    },
    {
      gross: 0,
      net: 0,
      commission: 0,
      discountCost: 0,
      deliveryCost: 0,
      platformDiscountCost: 0,
      available: 0,
      pending: 0,
      paidOutBalance: 0
    }
  )
}

function dateTimeValue(value: unknown) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value as Date | string)
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

async function ensureRestaurantEarningLedgerEntries(
  restaurantId: string,
  settlementDelayDays: number
) {
  const restaurantObjectId = toObjectId(restaurantId)
  const restaurant = await RestaurantModel.findById(restaurantObjectId).lean()
  if (!restaurant) return

  const deliveredOrders = await OrderModel.find({
    restaurantId: restaurantObjectId,
    status: "Delivered",
    // External deliveries settle through their own flow, never the commission payout.
    source: { $ne: "external" }
  })
    .select({
      pricing: 1,
      appliedVouchers: 1,
      timestamps: 1,
      updatedAt: 1,
      paymentMethod: 1,
      paymentStatus: 1,
      serviceAreaSnapshot: 1
    })
    .lean()
  const deliveredOrderIds = deliveredOrders.map((order) => order._id)
  const existingLedgerEntries = deliveredOrderIds.length
    ? await LedgerEntryModel.find({
        restaurantId: restaurantObjectId,
        orderId: { $in: deliveredOrderIds },
        entryType: "earning"
      })
    : []
  const ledgerByOrderId = new Map(
    existingLedgerEntries.map((entry) => [String(entry.orderId), entry])
  )
  const now = new Date()

  for (const order of deliveredOrders) {
    const deliveredAt = getOrderDeliveredAt(order)
    const isEligible = isRestaurantPayoutEligibleOrder(order)
    const availableAt = isEligible
      ? getSettlementAvailableAt(deliveredAt, settlementDelayDays)
      : null
    const settlementStatus = isEligible
      ? availableAt && availableAt <= now
        ? "available"
        : "pending"
      : "pending"
    const grossAmount = numberValue(order.pricing?.subtotal)
    const commissionRate = resolveCommissionRateForDate(restaurant, deliveredAt)
    const discountCost = getOrderOwnerDiscountCost(order)
    const platformDiscountCost = getOrderPlatformDiscountCost(order)
    const commissionBase = grossAmount
    const commission = Math.round(commissionBase * (commissionRate / 100))
    const deliveryCost = numberValue(order.pricing?.deliveryFee)
    const netAmount = grossAmount - commission - discountCost
    const existingLedger = ledgerByOrderId.get(String(order._id))

    if (!existingLedger) {
      await LedgerEntryModel.create({
        restaurantId: restaurantObjectId,
        orderId: order._id,
        sourceEntityType: "order",
        sourceEntityId: String(order._id),
        entryType: "earning",
        grossAmount,
        commissionBase,
        commission,
        discountCost,
        platformDiscountCost,
        deliveryCost,
        netAmount,
        serviceAreaSnapshot: order.serviceAreaSnapshot ?? {},
        settlementStatus,
        availableAt
      })
      continue
    }

    if (existingLedger.settlementStatus === "paid_out") {
      continue
    }

    const hasChanges =
      numberValue(existingLedger.grossAmount) !== grossAmount ||
      numberValue(existingLedger.commissionBase, grossAmount) !== commissionBase ||
      numberValue(existingLedger.commission) !== commission ||
      numberValue(existingLedger.discountCost) !== discountCost ||
      numberValue(existingLedger.platformDiscountCost) !== platformDiscountCost ||
      numberValue(existingLedger.deliveryCost) !== deliveryCost ||
      numberValue(existingLedger.netAmount) !== netAmount ||
      JSON.stringify(existingLedger.serviceAreaSnapshot ?? {}) !==
        JSON.stringify(order.serviceAreaSnapshot ?? {}) ||
      existingLedger.settlementStatus !== settlementStatus ||
      dateTimeValue(existingLedger.availableAt) !== dateTimeValue(availableAt)

    if (hasChanges) {
      existingLedger.grossAmount = grossAmount
      existingLedger.commissionBase = commissionBase
      existingLedger.commission = commission
      existingLedger.discountCost = discountCost
      existingLedger.platformDiscountCost = platformDiscountCost
      existingLedger.deliveryCost = deliveryCost
      existingLedger.netAmount = netAmount
      existingLedger.serviceAreaSnapshot = order.serviceAreaSnapshot ?? {}
      existingLedger.settlementStatus = settlementStatus
      existingLedger.availableAt = availableAt
      await existingLedger.save()
    }
  }

  await LedgerEntryModel.deleteMany(
    {
      restaurantId: restaurantObjectId,
      entryType: "earning",
      settlementStatus: { $ne: "paid_out" },
      orderId: { $nin: deliveredOrderIds }
    }
  )
}

async function _ensureRestaurantLedgerFresh(
  restaurantId: string,
  settlementDelayDays: number,
  options: { force?: boolean } = {}
) {
  const cacheKey = String(restaurantId)
  pruneLedgerFreshnessCache()
  const cached = ledgerFreshnessByRestaurant.get(cacheKey)
  const now = Date.now()

  if (!options.force && cached?.promise) {
    return cached.promise
  }

  if (
    !options.force &&
    cached &&
    now - cached.checkedAt < ledgerFreshnessTtlMs
  ) {
    touchLedgerFreshnessEntry(cacheKey, cached)
    return
  }

  const promise = (async () => {
    await ensureRestaurantEarningLedgerEntries(restaurantId, settlementDelayDays)
    await reconcileRestaurantLedgerStatuses(restaurantId, settlementDelayDays)
  })()

  touchLedgerFreshnessEntry(cacheKey, {
    checkedAt: cached?.checkedAt ?? 0,
    promise
  })

  try {
    await promise
    touchLedgerFreshnessEntry(cacheKey, {
      checkedAt: Date.now()
    })
  } catch (error) {
    ledgerFreshnessByRestaurant.delete(cacheKey)
    throw error
  }

  pruneLedgerFreshnessCache()
}

async function promoteMatureLedgerEntries(restaurantId: string) {
  await LedgerEntryModel.updateMany(
    {
      restaurantId: toObjectId(restaurantId),
      entryType: { $in: [...walletLedgerEntryTypes] },
      settlementStatus: "pending",
      availableAt: { $lte: new Date() }
    },
    {
      $set: {
        settlementStatus: "available"
      }
    }
  )
}

function buildDeliveredRangeClause(range: OwnerDateRange) {
  return {
    $or: [
      { "timestamps.Delivered": { $gte: range.start, $lte: range.end } },
      { "timestamps.deliveredAt": { $gte: range.start, $lte: range.end } }
    ]
  }
}

function buildCancelledRangeClause(range: OwnerDateRange) {
  return {
    $or: [
      { "timestamps.Cancelled": { $gte: range.start, $lte: range.end } },
      { "timestamps.cancelledAt": { $gte: range.start, $lte: range.end } }
    ]
  }
}

function buildRejectedRangeClause(range: OwnerDateRange) {
  return {
    $or: [
      { "timestamps.Rejected": { $gte: range.start, $lte: range.end } },
      { "timestamps.rejectedAt": { $gte: range.start, $lte: range.end } }
    ]
  }
}

function getDashboardRange(params?: {
  preset?: DashboardPreset
  from?: string
  to?: string
}) {
  if (params?.preset === "lifetime") {
    return { start: new Date(0), end: buildDhakaTodayRange().end }
  }

  return buildDhakaPresetRange(params ?? { preset: "today" }) ?? buildDhakaTodayRange()
}

async function getOwnerFinanceContext(ownerId: string) {
  const owner = await OwnerModel.findById(ownerId)

  if (!owner) {
    throw new AppError(StatusCodes.NOT_FOUND, "OWNER_NOT_FOUND", "Owner not found")
  }

  if (!owner.activeRestaurantId || owner.restaurantLifecycleStatus !== "approved") {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "RESTAURANT_NOT_READY",
      "Financial data is only available after restaurant approval"
    )
  }

  const restaurant = await RestaurantModel.findById(owner.activeRestaurantId)

  if (!restaurant) {
    throw new AppError(StatusCodes.NOT_FOUND, "RESTAURANT_NOT_FOUND", "Restaurant not found")
  }

  return {
    owner,
    restaurant,
    restaurantId: restaurant.id
  }
}

export async function getLedgerSummary(restaurantId: string) {
  const financeSettings = await getOperationalFinanceSettings()
  await promoteMatureLedgerEntries(restaurantId)
  const [
    pendingAggregate,
    availableAggregate,
    paidOutAggregate,
    requestedPayoutAggregate,
    activePayoutRequest,
    lifetimeAggregate,
    nextSettlementAggregate
  ] = await Promise.all([
    aggregateFinalizedLedgerEntries({
      restaurantId,
      entryType: { $in: [...walletLedgerEntryTypes] },
      settlementStatus: "pending"
    }, [{ $group: { _id: null, total: { $sum: "$netAmount" } } }]),
    aggregateFinalizedLedgerEntries({
      restaurantId,
      entryType: { $in: [...walletLedgerEntryTypes] },
      settlementStatus: "available"
    }, [{ $group: { _id: null, total: { $sum: "$netAmount" } } }]),
    PayoutBatchModel.aggregate([
      { $match: { restaurantId: toObjectId(restaurantId), status: "completed" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]),
    PayoutBatchModel.aggregate([
      { $match: { restaurantId: toObjectId(restaurantId), status: { $in: ["pending", "processing"] } } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]),
    PayoutBatchModel.exists({
      restaurantId: toObjectId(restaurantId),
      status: { $in: ["pending", "processing"] }
    }),
    aggregateFinalizedLedgerEntries(
      {
        restaurantId,
        entryType: { $in: [...walletLedgerEntryTypes] },
        sourceEntityType: { $nin: [...payoutResidualSourceTypes] }
      },
      [
        {
          $group: {
            _id: null,
            grossAmount: { $sum: { $ifNull: ["$grossAmount", 0] } },
            netAmount: { $sum: { $ifNull: ["$netAmount", 0] } },
            commission: { $sum: { $ifNull: ["$commission", 0] } },
            discountCost: { $sum: { $ifNull: ["$discountCost", 0] } },
            deliveryCost: { $sum: { $ifNull: ["$deliveryCost", 0] } }
          }
        }
      ]
    ),
    aggregateFinalizedLedgerEntries(
      {
        restaurantId,
        entryType: { $in: [...walletLedgerEntryTypes] },
        settlementStatus: "pending",
        availableAt: { $ne: null }
      },
      [
        {
          $group: {
            _id: null,
            earliestAvailableAt: { $min: "$availableAt" }
          }
        }
      ]
    )
  ])

  const lifetimeTotals = lifetimeAggregate[0]
  const nextSettlement = nextSettlementAggregate[0]?.earliestAvailableAt ?? null

  return {
    pendingBalance: pendingAggregate[0]?.total ?? 0,
    availableBalance: availableAggregate[0]?.total ?? 0,
    paidOutBalance: paidOutAggregate[0]?.total ?? 0,
    requestedPayoutBalance: requestedPayoutAggregate[0]?.total ?? 0,
    lifetimeGrossAmount: lifetimeTotals?.grossAmount ?? 0,
    lifetimeNetEarnings: lifetimeTotals?.netAmount ?? 0,
    lifetimeCommission: lifetimeTotals?.commission ?? 0,
    lifetimeDiscountCost: lifetimeTotals?.discountCost ?? 0,
    lifetimeDeliveryCost: lifetimeTotals?.deliveryCost ?? 0,
    nextSettlementAvailableAt: nextSettlement?.toISOString?.() ?? null,
    settlementDelayDays: financeSettings.settlementDelayDays,
    minimumPayoutAmountTaka: financeSettings.minimumPayoutAmountTaka,
    oneActivePayoutRequest: financeSettings.oneActivePayoutRequest,
    hasActivePayoutRequest: Boolean(activePayoutRequest)
  }
}

export async function reconcileRestaurantLedgerStatuses(
  restaurantId: string,
  settlementDelayDays?: number
) {
  const delayDays =
    settlementDelayDays ?? (await getOperationalFinanceSettings()).settlementDelayDays
  const now = new Date()
  const settlementEntries = await LedgerEntryModel.find({
    restaurantId: toObjectId(restaurantId),
    entryType: { $in: [...walletLedgerEntryTypes] },
    settlementStatus: { $in: ["pending", "available"] },
    orderId: { $ne: null }
  }).select({ orderId: 1, settlementStatus: 1, availableAt: 1 })

  const orderIds = settlementEntries
    .map((entry) => entry.orderId)
    .filter(Boolean)

  if (orderIds.length) {
    const orders = await OrderModel.find({ _id: { $in: orderIds } })
      .select({ status: 1, paymentMethod: 1, paymentStatus: 1, timestamps: 1, updatedAt: 1 })
      .lean()
    const orderById = new Map(orders.map((order) => [String(order._id), order]))
    const updates: any[] = settlementEntries.flatMap((entry): any[] => {
      const order = orderById.get(String(entry.orderId))
      const isPayoutEligibleOrder = isRestaurantPayoutEligibleOrder(order)
      if (!isPayoutEligibleOrder) {
        return [
          {
            deleteOne: {
              filter: { _id: entry._id }
            }
          }
        ]
      }
      const nextAvailableAt = order
        ? getSettlementAvailableAt(getOrderDeliveredAt(order), delayDays)
        : null
      const nextSettlementStatus: "pending" | "available" =
        nextAvailableAt && nextAvailableAt <= now ? "available" : "pending"
      const currentAvailableAt = entry.availableAt
        ? new Date(entry.availableAt).getTime()
        : null
      const nextAvailableTime = nextAvailableAt?.getTime() ?? null

      if (
        entry.settlementStatus === nextSettlementStatus &&
        currentAvailableAt === nextAvailableTime
      ) {
        return []
      }

      return [
        {
          updateOne: {
            filter: { _id: entry._id },
            update: {
              $set: {
                settlementStatus: nextSettlementStatus,
                availableAt: nextAvailableAt
              }
            }
          }
        }
      ]
    })

    if (updates.length) {
      await LedgerEntryModel.bulkWrite(updates)
    }
  }

  await LedgerEntryModel.updateMany(
    {
      restaurantId: toObjectId(restaurantId),
      entryType: { $in: [...walletLedgerEntryTypes] },
      settlementStatus: "pending",
      availableAt: { $lte: now }
    },
    {
      $set: {
        settlementStatus: "available"
      }
    }
  )
}

export async function syncOrderLedgerForFinalStatus(params: {
  restaurantId: string
  orderId: string
  nextStatus: "Delivered" | "Cancelled" | "Rejected"
  finalizedAt?: Date
}) {
  const ledgerEntry = await LedgerEntryModel.findOne({
    restaurantId: params.restaurantId,
    orderId: params.orderId,
    entryType: "earning"
  })

  if (!ledgerEntry) {
    invalidateOwnerFinanceCaches(params.restaurantId)
    return null
  }

  if (params.nextStatus === "Delivered") {
    const financeSettings = await getOperationalFinanceSettings()
    const deliveredAt = params.finalizedAt ?? new Date()
    ledgerEntry.settlementStatus =
      getSettlementAvailableAt(deliveredAt, financeSettings.settlementDelayDays) <= new Date()
        ? "available"
        : "pending"
    ledgerEntry.availableAt = getSettlementAvailableAt(
      deliveredAt,
      financeSettings.settlementDelayDays
    )
    await ledgerEntry.save()
    invalidateOwnerFinanceCaches(params.restaurantId)
    return ledgerEntry
  }

  if (ledgerEntry.settlementStatus !== "paid_out") {
    await ledgerEntry.deleteOne()
  } else {
    ledgerEntry.settlementStatus = "pending"
    ledgerEntry.availableAt = null
    await ledgerEntry.save()
  }
  invalidateOwnerFinanceCaches(params.restaurantId)
  return ledgerEntry
}

function buildFinalizedLedgerPipeline(
  match: Record<string, unknown>,
  extraStages: PipelineStage[] = []
): PipelineStage[] {
  return [
    { $match: normalizeAggregateMatch(match) },
    {
      $lookup: {
        from: "orders",
        localField: "orderId",
        foreignField: "_id",
        as: "orderDocs"
      }
    },
    {
      $addFields: {
        relatedOrderStatus: {
          $let: {
            vars: {
              relatedOrder: { $arrayElemAt: ["$orderDocs", 0] }
            },
            in: "$$relatedOrder.status"
          }
        },
        relatedOrderNumber: {
          $let: {
            vars: {
              relatedOrder: { $arrayElemAt: ["$orderDocs", 0] }
            },
            in: "$$relatedOrder.orderNumber"
          }
        },
        relatedOrderDeliveredAt: {
          $let: {
            vars: {
              relatedOrder: { $arrayElemAt: ["$orderDocs", 0] }
            },
            in: {
              $ifNull: ["$$relatedOrder.timestamps.deliveredAt", "$$relatedOrder.timestamps.Delivered"]
            }
          }
        },
        relatedOrderPaymentStatus: {
          $let: {
            vars: {
              relatedOrder: { $arrayElemAt: ["$orderDocs", 0] }
            },
            in: "$$relatedOrder.paymentStatus"
          }
        },
        relatedOrderPaymentMethod: {
          $let: {
            vars: {
              relatedOrder: { $arrayElemAt: ["$orderDocs", 0] }
            },
            in: "$$relatedOrder.paymentMethod"
          }
        },
        relatedOrderCreatedAt: {
          $let: {
            vars: {
              relatedOrder: { $arrayElemAt: ["$orderDocs", 0] }
            },
            in: "$$relatedOrder.createdAt"
          }
        },
        orderIdString: {
          $cond: [{ $ifNull: ["$orderId", false] }, { $toString: "$orderId" }, ""]
        },
        payoutBatchIdString: {
          $cond: [{ $ifNull: ["$payoutBatchId", false] }, { $toString: "$payoutBatchId" }, ""]
        },
        effectiveAt: {
          $switch: {
            branches: [
              {
                case: { $eq: ["$entryType", "payout"] },
                then: "$createdAt"
              },
              {
                case: { $ifNull: ["$relatedOrderDeliveredAt", false] },
                then: "$relatedOrderDeliveredAt"
              }
            ],
            default: "$createdAt"
          }
        }
      }
    },
    {
      $match: {
        $or: [
          { entryType: "payout" },
          { orderId: null },
          buildRelatedOrderPayoutEligibilityMatch()
        ]
      }
    },
    ...extraStages
  ]
}

export async function aggregateFinalizedLedgerEntries(
  match: Record<string, unknown>,
  extraStages: PipelineStage[] = []
) {
  return LedgerEntryModel.aggregate(buildFinalizedLedgerPipeline(match, extraStages))
}

function _aggregateLedgerEntries(
  match: Record<string, unknown>,
  extraStages: PipelineStage[] = []
) {
  return LedgerEntryModel.aggregate([
    { $match: normalizeAggregateMatch(match) },
    ...extraStages
  ])
}

function getListRange(params?: {
  preset?: string
  from?: string
  to?: string
}) {
  return buildDhakaPresetRange(params ?? {})
}

export async function getPayoutSummary(ownerId: string) {
  const { restaurantId } = await getOwnerFinanceContext(ownerId)
  const [ledgerSummary, latestBatch, payoutMethod] = await Promise.all([
    getLedgerSummary(restaurantId),
    PayoutBatchModel.findOne({ restaurantId }).sort({ createdAt: -1 }),
    PayoutMethodModel.findOne({ restaurantId })
  ])

  return {
    ...ledgerSummary,
    lastPayout: latestBatch,
    payoutMethod
  }
}

export async function requestOwnerPayout(ownerId: string) {
  const { owner, restaurant, restaurantId } = await getOwnerFinanceContext(ownerId)
  const financeSettings = await getOperationalFinanceSettings()
  const restaurantObjectId = toObjectId(restaurantId)
  const payoutMethod = await PayoutMethodModel.findOne({ restaurantId }).lean()

  if (!payoutMethod || !String(payoutMethod.accountNumber ?? "").trim()) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "PAYOUT_METHOD_REQUIRED",
      "Add a payout method before requesting payout"
    )
  }

  if (payoutMethod.isVerified !== true) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "PAYOUT_METHOD_NOT_VERIFIED",
      "Your payout method must be verified before requesting payout"
    )
  }

  if (financeSettings.oneActivePayoutRequest) {
    const activePayout = await PayoutBatchModel.exists({
      restaurantId: restaurantObjectId,
      status: { $in: ["pending", "processing"] }
    })
    if (activePayout) {
      throw new AppError(
        StatusCodes.CONFLICT,
        "ACTIVE_PAYOUT_REQUEST_EXISTS",
        "A payout request is already pending or processing"
      )
    }
  }

  const session = await mongoose.startSession()
  let createdPayout: Record<string, any> | null = null

  try {
    await session.withTransaction(async () => {
      await reconcileRestaurantLedgerStatuses(
        restaurantId,
        financeSettings.settlementDelayDays
      )

      const availableEntries = await LedgerEntryModel.find({
        restaurantId: restaurantObjectId,
        entryType: { $in: [...walletLedgerEntryTypes] },
        settlementStatus: "available",
        netAmount: { $gt: 0 }
      })
        .sort({ availableAt: 1, createdAt: 1 })
        .select({ _id: 1, netAmount: 1 })
        .session(session)

      const amount = Math.round(
        availableEntries.reduce(
          (sum, entry) => sum + numberValue(entry.netAmount),
          0
        )
      )

      if (amount <= 0 || availableEntries.length === 0) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          "NO_PAYOUT_BALANCE",
          "No available payout balance right now"
        )
      }

      if (amount < financeSettings.minimumPayoutAmountTaka) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          "PAYOUT_BELOW_MINIMUM",
          `Available balance is below ${financeSettings.minimumPayoutAmountTaka}tk minimum payout`
        )
      }

      const now = new Date()
      const [payoutBatch] = await PayoutBatchModel.create(
        [
          {
            restaurantId: restaurantObjectId,
            methodId: payoutMethod._id,
            amount,
            status: "pending",
            provider: payoutMethod.type === "bkash" ? "bkash" : "bank",
            batchReference: `OWN-PO-${Date.now()}`,
            processingNote: "Requested by restaurant owner",
            requestedAt: now
          }
        ],
        { session }
      )

      const entryIds = availableEntries.map((entry) => entry._id)
      const reserveResult = await LedgerEntryModel.updateMany(
        {
          _id: { $in: entryIds },
          restaurantId: restaurantObjectId,
          settlementStatus: "available"
        },
        {
          $set: {
            settlementStatus: "paid_out",
            payoutBatchId: payoutBatch._id
          }
        },
        { session }
      )

      if (reserveResult.modifiedCount !== entryIds.length) {
        throw new AppError(
          StatusCodes.CONFLICT,
          "PAYOUT_BALANCE_CHANGED",
          "Available balance changed. Please try again"
        )
      }

      await LedgerEntryModel.create(
        [
          {
            restaurantId: restaurantObjectId,
            payoutBatchId: payoutBatch._id,
            sourceEntityType: "payout_batch",
            sourceEntityId: payoutBatch.id,
            entryType: "payout",
            netAmount: -amount,
            settlementStatus: "pending",
            availableAt: now
          }
        ],
        { session }
      )

      createdPayout = payoutBatch.toObject()
    })
  } finally {
    await session.endSession()
  }

  const savedPayout = createdPayout as Record<string, any> | null

  if (!savedPayout) {
    throw new AppError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      "PAYOUT_REQUEST_FAILED",
      "Payout request could not be created"
    )
  }

  invalidateOwnerFinanceCaches(restaurantId)

  const payoutId = String(savedPayout._id ?? "")
  const amount = numberValue(savedPayout.amount)
  const restaurantName = String(restaurant.name ?? "Restaurant")
  const ownerName = String(owner.fullName ?? "Owner")

  emitSocketEvent(`owner:${ownerId}`, "payout.updated", {
    payoutId,
    restaurantId,
    status: "pending",
    amount
  })
  emitSocketEvent(`restaurant:${restaurantId}`, "payout.updated", {
    payoutId,
    restaurantId,
    status: "pending",
    amount
  })

  await createAdminOperationalAlert({
    alertType: "payout_request",
    severity: "info",
    title: "Payout request submitted",
    description: `${restaurantName} requested ${amount.toLocaleString("en-US")}tk payout.`,
    source: "Owner payout",
    entityType: "payout",
    entityId: payoutId,
    path: `/payouts?restaurantId=${restaurantId}&payoutId=${payoutId}`,
    iconKey: "credit-card",
    dedupeKey: `payout:${payoutId}:owner_request`,
    metadata: {
      payoutId,
      restaurantId,
      restaurantName,
      ownerId,
      ownerName,
      amount,
      provider: payoutMethod.type
    }
  })

  return createdPayout
}

export async function listPayoutHistory(ownerId: string) {
  return listPayoutHistoryWithFilters({ ownerId })
}

export async function listPayoutTransactions(ownerId: string) {
  return listPayoutTransactionsWithFilters({ ownerId })
}

export async function listPayoutHistoryWithFilters(params: {
  ownerId: string
  search?: string
  status?: string
  sortBy?: string
  preset?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
}) {
  const { restaurantId } = await getOwnerFinanceContext(params.ownerId)
  const query: Record<string, unknown> = { restaurantId }
  const range = getListRange(params)

  if (params.status && params.status !== "all") query.status = params.status
  if (range) {
    query.createdAt = { $gte: range.start, $lte: range.end }
  }
  if (params.search) {
    query.$or = [
      { batchReference: { $regex: params.search, $options: "i" } },
      { failureReason: { $regex: params.search, $options: "i" } }
    ]
  }

  const sort: Record<string, SortOrder> =
    params.sortBy === "oldest"
      ? { createdAt: 1 }
      : params.sortBy === "highestNet"
        ? { amount: -1, createdAt: -1 }
        : { createdAt: -1 }
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(500, Math.max(1, params.pageSize ?? 20))

  const [items, total] = await Promise.all([
    PayoutBatchModel.find(query).sort(sort).skip((page - 1) * pageSize).limit(pageSize),
    PayoutBatchModel.countDocuments(query)
  ])

  return { items, total }
}

export async function listPayoutTransactionsWithFilters(params: {
  ownerId: string
  search?: string
  payoutId?: string
  type?: string
  sortBy?: string
  preset?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
}) {
  const { restaurantId } = await getOwnerFinanceContext(params.ownerId)
  await promoteMatureLedgerEntries(restaurantId)
  const range = getListRange(params)

  const query: Record<string, unknown> = { restaurantId }
  if (params.type && params.type !== "all") query.entryType = params.type
  if (params.payoutId) query.payoutBatchId = toObjectId(params.payoutId)

  const sort: Record<string, 1 | -1> =
    params.sortBy === "oldest"
      ? { effectiveAt: 1, createdAt: 1 }
      : params.sortBy === "highestNet"
        ? { netAmount: -1, effectiveAt: -1, createdAt: -1 }
        : { effectiveAt: -1, createdAt: -1 }
  const page = Math.max(1, params.page ?? 1)
  const maxPageSize = params.payoutId ? 2000 : 500
  const pageSize = Math.min(maxPageSize, Math.max(1, params.pageSize ?? 20))
  const searchRegex = params.search ? new RegExp(params.search, "i") : null
  const searchStage = searchRegex
    ? [{
        $match: {
          $or: [
            { orderIdString: { $regex: searchRegex } },
            { payoutBatchIdString: { $regex: searchRegex } }
          ]
        }
      }]
    : []
  const rangeStage = range
    ? [{ $match: { effectiveAt: { $gte: range.start, $lte: range.end } } }]
    : []

  const [result] = await aggregateFinalizedLedgerEntries(query, [
    ...searchStage,
    ...rangeStage,
    { $sort: sort },
    {
      $facet: {
        items: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }],
        meta: [{ $count: "total" }]
      }
    }
  ])

  return {
    items: result?.items ?? [],
    total: result?.meta?.[0]?.total ?? 0
  }
}

export async function updatePayoutMethod(params: {
  ownerId: string
  type: "bkash" | "bank"
  accountName: string
  accountNumber: string
  bankName?: string
  branchName?: string
}) {
  const { owner, restaurantId } = await getOwnerFinanceContext(params.ownerId)

  if (params.type === "bkash") {
    const existingPayoutMethod = await PayoutMethodModel.findOne({ restaurantId }).lean()
    const isSameAsActiveNumber =
      existingPayoutMethod?.type === "bkash" &&
      existingPayoutMethod.accountNumber === params.accountNumber &&
      existingPayoutMethod.isVerified === true

    if (isSameAsActiveNumber) {
      const payoutMethod = await PayoutMethodModel.findOneAndUpdate(
        { restaurantId },
        {
          restaurantId,
          type: "bkash",
          accountName: params.accountName,
          accountNumber: params.accountNumber,
          bankName: "",
          branchName: "",
          isVerified: true,
          pendingType: null,
          pendingAccountName: "",
          pendingAccountNumber: null,
          pendingBankName: "",
          pendingBranchName: "",
          pendingVerificationStatus: null,
          pendingVerifiedAt: null,
          pendingAdminNote: "",
          verificationSource: existingPayoutMethod.verificationSource ?? "admin_approved",
          verifiedAt: existingPayoutMethod.verifiedAt ?? new Date()
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
      invalidateOwnerFinanceCaches(restaurantId)

      return {
        payoutMethod,
        verificationSessionId: null
      }
    }

    const payoutMethod = await PayoutMethodModel.findOneAndUpdate(
      { restaurantId },
      {
        restaurantId,
        type: existingPayoutMethod?.type ?? "bkash",
        accountName: existingPayoutMethod?.accountName || params.accountName,
        accountNumber: existingPayoutMethod?.accountNumber ?? "",
        bankName: "",
        branchName: "",
        isVerified: Boolean(existingPayoutMethod?.isVerified && existingPayoutMethod.accountNumber),
        pendingType: "bkash",
        pendingAccountName: params.accountName,
        pendingAccountNumber: params.accountNumber,
        pendingBankName: "",
        pendingBranchName: "",
        pendingVerificationStatus: "otp_pending",
        pendingVerifiedAt: null,
        pendingAdminNote: "",
        verificationSource: "payout_change",
        verifiedAt: existingPayoutMethod?.verifiedAt ?? null
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    invalidateOwnerFinanceCaches(restaurantId)

    const otpSession = await createOtpSession({
      ownerId: owner.id,
      phone: params.accountNumber,
      purpose: "owner_payout_verify",
      referenceId: payoutMethod.id
    })

    return {
      payoutMethod,
      verificationSessionId: otpSession.id,
      ...getOtpSessionTiming(otpSession)
    }
  }

  const payoutMethod = await PayoutMethodModel.findOneAndUpdate(
    { restaurantId },
    {
      restaurantId,
      type: params.type,
      accountName: params.accountName,
      accountNumber: params.accountNumber,
      bankName: params.bankName ?? "",
      branchName: params.branchName ?? "",
      isVerified: true,
      pendingType: null,
      pendingAccountName: "",
      pendingAccountNumber: null,
      pendingBankName: "",
      pendingBranchName: "",
      pendingVerificationStatus: null,
      pendingVerifiedAt: null,
      pendingAdminNote: "",
      verificationSource: "manual_bank",
      verifiedAt: new Date()
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
  invalidateOwnerFinanceCaches(restaurantId)

  return {
    payoutMethod,
    verificationSessionId: null
  }
}

type AnalyticsOverviewParams = {
  ownerId: string
  preset?: DashboardPreset
  from?: string
  to?: string
  paymentMethod?: "Cash" | "Bkash"
  orderType?: "delivery" | "pickup"
  categoryId?: string
}

type AnalyticsCustomerRow = {
  name: string
  orders: number
  revenue: number
}

type AnalyticsMenuRow = {
  name: string
  categoryName: string
  quantitySold: number
  revenue: number
}

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const dhakaDateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Dhaka"
})
const dhakaDateLabelFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "short",
  timeZone: "Asia/Dhaka"
})

function formatDailySeriesKey(date: Date) {
  const parts = dhakaDateKeyFormatter
    .formatToParts(date)
    .reduce<Record<string, string>>((accumulator, part) => {
      accumulator[part.type] = part.value
      return accumulator
    }, {})
  return `${parts.year}-${parts.month}-${parts.day}`
}

function formatHourLabel(hour: number) {
  const normalizedHour = ((hour % 24) + 24) % 24
  const suffix = normalizedHour >= 12 ? "PM" : "AM"
  const hour12 = normalizedHour % 12 === 0 ? 12 : normalizedHour % 12
  return `${hour12} ${suffix}`
}

function formatDailySeriesLabel(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00+06:00`)
  return Number.isNaN(date.getTime())
    ? dateKey
    : dhakaDateLabelFormatter.format(date)
}

type OwnerDashboardTrendPoint = {
  date: string
  label: string
  orders: number
  revenue: number
  placedValue: number
  deliveredValue: number
  netEarnings: number
  activeOrders: number
  failedOrders: number
  failedValue: number
  cancelledOrders: number
  rejectedOrders: number
}

function createDashboardTrendPoint(dateKey: string): OwnerDashboardTrendPoint {
  return {
    date: dateKey,
    label: formatDailySeriesLabel(dateKey),
    orders: 0,
    revenue: 0,
    placedValue: 0,
    deliveredValue: 0,
    netEarnings: 0,
    activeOrders: 0,
    failedOrders: 0,
    failedValue: 0,
    cancelledOrders: 0,
    rejectedOrders: 0
  }
}

function getOrderStatusTimestamp(
  order: Record<string, any>,
  status: "Delivered" | "Cancelled" | "Rejected"
) {
  const lowerKey =
    status === "Delivered"
      ? "deliveredAt"
      : status === "Cancelled"
        ? "cancelledAt"
        : "rejectedAt"
  const value = order.timestamps?.[status] ?? order.timestamps?.[lowerKey] ?? order.updatedAt ?? order.createdAt
  const parsed = value ? new Date(value) : null
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null
}

function getOrCreateDashboardTrendPoint(
  trendByDate: Map<string, OwnerDashboardTrendPoint>,
  date: Date | null | undefined
) {
  if (!date || Number.isNaN(date.getTime())) return null
  const dateKey = formatDailySeriesKey(date)
  const existing = trendByDate.get(dateKey)
  if (existing) return existing

  const next = createDashboardTrendPoint(dateKey)
  trendByDate.set(dateKey, next)
  return next
}

function buildOwnerDashboardTrend(params: {
  placedOrders: Array<Record<string, any>>
  deliveredOrders: Array<Record<string, any>>
  cancelledOrders: Array<Record<string, any>>
  rejectedOrders: Array<Record<string, any>>
  restaurant: Record<string, any>
}) {
  const trendByDate = new Map<string, OwnerDashboardTrendPoint>()

  params.placedOrders.forEach((order) => {
    const point = getOrCreateDashboardTrendPoint(trendByDate, new Date(order.createdAt))
    if (!point) return
    const placedValue = getOrderRestaurantNetSalesForOwner(order)
    point.orders += 1
    point.placedValue += placedValue
    if (["New", "Accepted", "Preparing", "ReadyForPickup", "PickedUp"].includes(order.status)) {
      point.activeOrders += 1
    }
  })

  params.deliveredOrders.forEach((order) => {
    const point = getOrCreateDashboardTrendPoint(
      trendByDate,
      getOrderStatusTimestamp(order, "Delivered")
    )
    if (!point) return
    const deliveredValue = getOrderRestaurantNetSalesForOwner(order)
    point.revenue += deliveredValue
    point.deliveredValue += deliveredValue
    point.netEarnings += getOrderNetEarnings(order, params.restaurant).netAmount
  })

  params.cancelledOrders.forEach((order) => {
    const point = getOrCreateDashboardTrendPoint(
      trendByDate,
      getOrderStatusTimestamp(order, "Cancelled")
    )
    if (!point) return
    const failedValue = getOrderRestaurantNetSalesForOwner(order)
    point.failedOrders += 1
    point.cancelledOrders += 1
    point.failedValue += failedValue
  })

  params.rejectedOrders.forEach((order) => {
    const point = getOrCreateDashboardTrendPoint(
      trendByDate,
      getOrderStatusTimestamp(order, "Rejected")
    )
    if (!point) return
    const failedValue = getOrderRestaurantNetSalesForOwner(order)
    point.failedOrders += 1
    point.rejectedOrders += 1
    point.failedValue += failedValue
  })

  return [...trendByDate.values()].sort((left, right) => left.date.localeCompare(right.date))
}

function buildAnalyticsOrderFilter(params: AnalyticsOverviewParams, restaurantId: string) {
  // Off-platform (external) deliveries are a separate revenue stream with their own page
  // and settlement — never mix them into the in-app restaurant analytics. ($ne also keeps
  // legacy orders that predate the `source` field.)
  const clauses: Record<string, unknown>[] = [
    { restaurantId: toObjectId(restaurantId) },
    { source: { $ne: "external" } },
  ]

  if (params.paymentMethod) {
    clauses.push({ paymentMethod: params.paymentMethod })
  }

  if (params.categoryId && params.categoryId !== "all") {
    clauses.push({ "itemsSnapshot.categoryId": params.categoryId })
  }

  if (params.orderType === "delivery") {
    clauses.push({
      riderId: { $exists: true, $nin: ["", null] }
    })
  } else if (params.orderType === "pickup") {
    clauses.push({
      $or: [
        { riderId: { $exists: false } },
        { riderId: null },
        { riderId: "" }
      ]
    })
  }

  return clauses.length === 1 ? clauses[0] : { $and: clauses }
}

function buildCreatedAtMatch(range: OwnerDateRange) {
  return {
    createdAt: { $gte: range.start, $lte: range.end }
  }
}

function buildDeliveredAtMatch(range: OwnerDateRange) {
  return {
    $or: [
      { "timestamps.Delivered": { $gte: range.start, $lte: range.end } },
      { "timestamps.deliveredAt": { $gte: range.start, $lte: range.end } }
    ]
  }
}

function combineMatchClauses(...clauses: Record<string, unknown>[]) {
  return clauses.length === 1 ? clauses[0] : { $and: clauses }
}

function mapCountRows(rows: Array<{ _id: string; count: number }>) {
  return rows.reduce<Record<string, number>>((accumulator, row) => {
    accumulator[String(row._id)] = Number(row.count ?? 0)
    return accumulator
  }, {})
}

function mapNumberRows(rows: Array<{ _id: number; count: number }>, size: number) {
  const values = Array.from({ length: size }, () => 0)
  rows.forEach((row) => {
    const index = Number(row._id)
    if (Number.isInteger(index) && index >= 0 && index < size) {
      values[index] = Number(row.count ?? 0)
    }
  })
  return values
}

export async function getAnalyticsOverview(params: AnalyticsOverviewParams) {
  return ownerAnalyticsOverviewCache.getOrSet(
    buildOwnerFinanceCacheKey("owner-analytics-overview", params),
    () => buildAnalyticsOverview(params),
  )
}

async function buildAnalyticsOverview(params: AnalyticsOverviewParams) {
  const { restaurant, restaurantId } = await getOwnerFinanceContext(params.ownerId)

  const currentRange = getDashboardRange(params)
  const previousRange = buildPreviousRange(currentRange)
  const baseMatch = buildAnalyticsOrderFilter(params, restaurantId)
  const currentPlacedMatch = combineMatchClauses(
    baseMatch,
    buildCreatedAtMatch(currentRange)
  )
  const previousPlacedMatch = combineMatchClauses(
    baseMatch,
    buildCreatedAtMatch(previousRange)
  )
  const currentDeliveredMatch = combineMatchClauses(
    baseMatch,
    { status: "Delivered" },
    buildDeliveredAtMatch(currentRange)
  )
  const previousDeliveredMatch = combineMatchClauses(
    baseMatch,
    { status: "Delivered" },
    buildDeliveredAtMatch(previousRange)
  )

  const [
    placedFacet,
    previousPlacedFacet,
    deliveredFacet,
    previousDeliveredFacet,
    deliveredOrdersForNet,
    previousDeliveredOrdersForNet,
    payoutAggregate
  ] = await Promise.all([
    OrderModel.aggregate([
      { $match: currentPlacedMatch },
      {
        $facet: {
          total: [{ $count: "count" }],
          status: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
          weekday: [
            {
              $group: {
                _id: {
                  $subtract: [
                    { $isoDayOfWeek: { date: "$createdAt", timezone: "Asia/Dhaka" } },
                    1
                  ]
                },
                count: { $sum: 1 }
              }
            }
          ],
          hour: [
            {
              $group: {
                _id: { $hour: { date: "$createdAt", timezone: "Asia/Dhaka" } },
                count: { $sum: 1 }
              }
            }
          ],
          dailySeries: [
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: "%Y-%m-%d",
                    date: "$createdAt",
                    timezone: "Asia/Dhaka"
                  }
                },
                orders: { $sum: 1 }
              }
            },
            { $sort: { _id: 1 } }
          ]
        }
      }
    ]),
    OrderModel.aggregate([
      { $match: previousPlacedMatch },
      { $count: "count" }
    ]),
    OrderModel.aggregate([
      { $match: currentDeliveredMatch },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                revenue: { $sum: ownerNetSalesAggregateExpression() },
                discountedOrdersCount: {
                  $sum: {
                    $cond: [
                      {
                        $gt: [ownerDiscountAggregateExpression(), 0]
                      },
                      1,
                      0
                    ]
                  }
                },
                discountedRevenue: {
                  $sum: {
                    $cond: [
                      {
                        $gt: [ownerDiscountAggregateExpression(), 0]
                      },
                      ownerNetSalesAggregateExpression(),
                      0
                    ]
                  }
                },
                discountGiven: {
                  $sum: ownerDiscountAggregateExpression()
                }
              }
            }
          ],
          customers: [
            {
              $group: {
                _id: "$customerSnapshot.phone",
                name: { $first: "$customerSnapshot.fullName" },
                orders: { $sum: 1 },
                revenue: { $sum: ownerNetSalesAggregateExpression() }
              }
            },
            { $match: { _id: { $nin: ["", null] } } },
            { $sort: { revenue: -1 } }
          ],
          menu: [
            { $unwind: "$itemsSnapshot" },
            {
              $group: {
                _id: {
                  itemId: "$itemsSnapshot.itemId",
                  name: { $ifNull: ["$itemsSnapshot.name", "$itemsSnapshot.itemName"] },
                  categoryName: "$itemsSnapshot.categoryName"
                },
                quantitySold: { $sum: { $ifNull: ["$itemsSnapshot.quantity", 0] } },
                revenue: {
                  $sum: {
                    $ifNull: [
                      "$itemsSnapshot.lineTotal",
                      {
                        $multiply: [
                          { $ifNull: ["$itemsSnapshot.quantity", 0] },
                          { $ifNull: ["$itemsSnapshot.unitPrice", 0] }
                        ]
                      }
                    ]
                  }
                }
              }
            },
            { $sort: { revenue: -1 } }
          ]
        }
      }
    ]),
    OrderModel.aggregate([
      { $match: previousDeliveredMatch },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                revenue: { $sum: ownerNetSalesAggregateExpression() }
              }
            }
          ],
          customers: [
            {
              $group: {
                _id: "$customerSnapshot.phone",
                name: { $first: "$customerSnapshot.fullName" },
                orders: { $sum: 1 },
                revenue: { $sum: ownerNetSalesAggregateExpression() }
              }
            },
            { $match: { _id: { $nin: ["", null] } } }
          ]
        }
      }
    ]),
    OrderModel.find(currentDeliveredMatch)
      .select({ pricing: 1, timestamps: 1, updatedAt: 1 })
      .lean(),
    OrderModel.find(previousDeliveredMatch)
      .select({ pricing: 1, timestamps: 1, updatedAt: 1 })
      .lean(),
    PayoutBatchModel.aggregate([
      {
        $match: {
          restaurantId: toObjectId(restaurantId),
          status: "completed",
          createdAt: { $gte: currentRange.start, $lte: currentRange.end }
        }
      },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ])
  ])

  const placed = placedFacet[0] ?? {}
  const delivered = deliveredFacet[0] ?? {}
  const previousDelivered = previousDeliveredFacet[0] ?? {}
  const deliveredTotals = delivered.totals?.[0] ?? {}
  const previousDeliveredTotals = previousDelivered.totals?.[0] ?? {}
  const customerRows: AnalyticsCustomerRow[] = ((delivered.customers ?? []) as any[]).map((row) => ({
    name: row.name || "Customer",
    orders: Number(row.orders ?? 0),
    revenue: Number(row.revenue ?? 0)
  }))
  const previousCustomerRows: AnalyticsCustomerRow[] = ((previousDelivered.customers ?? []) as any[]).map((row) => ({
    name: row.name || "Customer",
    orders: Number(row.orders ?? 0),
    revenue: Number(row.revenue ?? 0)
  }))
  const repeatCustomers = customerRows.filter((customer) => customer.orders > 1).length
  const previousRepeatCustomers = previousCustomerRows.filter(
    (customer) => customer.orders > 1
  ).length
  const menuRows: AnalyticsMenuRow[] = ((delivered.menu ?? []) as any[]).map((row) => ({
    name: row._id?.name || "Item",
    categoryName: row._id?.categoryName || "Unassigned",
    quantitySold: Number(row.quantitySold ?? 0),
    revenue: Number(row.revenue ?? 0)
  }))
  const weekdayCounts = mapNumberRows(placed.weekday ?? [], 7)
  const hourCounts = mapNumberRows(placed.hour ?? [], 24)
  const ledgerTotals = summarizeDeliveredOrdersForOwner(
    deliveredOrdersForNet as Array<Record<string, any>>,
    restaurant
  )
  const previousLedgerTotals = summarizeDeliveredOrdersForOwner(
    previousDeliveredOrdersForNet as Array<Record<string, any>>,
    restaurant
  )

  return {
    filter: {
      current: {
        from: currentRange.start.toISOString(),
        to: currentRange.end.toISOString()
      },
      previous: {
        from: previousRange.start.toISOString(),
        to: previousRange.end.toISOString()
      }
    },
    metrics: {
      totalOrders: Number(placed.total?.[0]?.count ?? 0),
      previousTotalOrders: Number(previousPlacedFacet[0]?.count ?? 0),
      deliveredRevenue: Number(deliveredTotals.revenue ?? 0),
      previousDeliveredRevenue: Number(previousDeliveredTotals.revenue ?? 0),
      netEarnings: ledgerTotals.net,
      previousNetEarnings: previousLedgerTotals.net,
      deliveredCount: Number(deliveredTotals.count ?? 0),
      previousDeliveredCount: Number(previousDeliveredTotals.count ?? 0),
      averageOrderValue:
        Number(deliveredTotals.count ?? 0) > 0
          ? Number(deliveredTotals.revenue ?? 0) / Number(deliveredTotals.count ?? 0)
          : 0,
      previousAverageOrderValue:
        Number(previousDeliveredTotals.count ?? 0) > 0
          ? Number(previousDeliveredTotals.revenue ?? 0) /
            Number(previousDeliveredTotals.count ?? 0)
          : 0,
      uniqueCustomers: customerRows.length,
      previousUniqueCustomers: previousCustomerRows.length,
      repeatCustomers,
      previousRepeatCustomers,
      discountedOrdersCount: Number(deliveredTotals.discountedOrdersCount ?? 0),
      discountedRevenue: Number(deliveredTotals.discountedRevenue ?? 0),
      discountGiven: Number(deliveredTotals.discountGiven ?? 0)
    },
    statusCounts: mapCountRows(placed.status ?? []),
    weekdayOrders: weekdayLabels.map((label, index) => ({
      label,
      orders: weekdayCounts[index] ?? 0
    })),
    peakHours: hourCounts
      .map((orders, hour) => ({ label: formatHourLabel(hour), orders }))
      .filter((entry) => entry.orders > 0)
      .sort((left, right) => right.orders - left.orders),
    orderSeries: (placed.dailySeries ?? []).map((row: any) => ({
      date: String(row._id),
      label: formatDailySeriesLabel(String(row._id)),
      orders: Number(row.orders ?? 0)
    })),
    customerInsights: {
      unique: customerRows.length,
      repeat: repeatCustomers,
      repeatRate: customerRows.length > 0 ? (repeatCustomers / customerRows.length) * 100 : 0,
      rows: customerRows.slice(0, 5),
      donut: [
        {
          name: "New",
          value: Math.max(customerRows.length - repeatCustomers, 0),
          color: "#60a5fa"
        },
        { name: "Repeat", value: repeatCustomers, color: "#10b981" }
      ]
    },
    menuPerformance: {
      rows: menuRows,
      lowPerformers: [...menuRows]
        .sort((left, right) => left.quantitySold - right.quantitySold)
        .slice(0, 3),
      categories: Array.from(
        menuRows
          .reduce<Map<string, { name: string; revenue: number }>>((accumulator, row) => {
            const existing = accumulator.get(row.categoryName)
            accumulator.set(row.categoryName, {
              name: row.categoryName,
              revenue: (existing?.revenue ?? 0) + row.revenue
            })
            return accumulator
          }, new Map())
          .values()
      ).sort((left, right) => right.revenue - left.revenue)
    },
    payoutInsights: {
      ...ledgerTotals,
      totalPayouts: Number(payoutAggregate[0]?.total ?? 0),
      lifetimeEarnings: ledgerTotals.net,
      availableSoon: ledgerTotals.pending
    }
  }
}

export async function getDashboardSummary(params: {
  ownerId: string
  preset?: DashboardPreset
  from?: string
  to?: string
}) {
  return ownerDashboardSummaryCache.getOrSet(
    buildOwnerFinanceCacheKey("owner-dashboard-summary", params),
    () => buildDashboardSummary(params),
  )
}

async function buildDashboardSummary(params: {
  ownerId: string
  preset?: DashboardPreset
  from?: string
  to?: string
}) {
  const { restaurant, restaurantId } = await getOwnerFinanceContext(params.ownerId)
  const range = getDashboardRange(params)
  const previousRange = buildPreviousRange(range)

  const [
    filteredOrders,
    deliveredOrdersInRange,
    previousOrders,
    previousDeliveredOrders,
    cancelledOrdersInRange,
    previousCancelledOrdersInRange,
    rejectedOrdersInRange,
    previousRejectedOrdersInRange,
    activeOrders,
    previousActiveOrders,
    latestPayout,
    dashboardFacet,
    liveOrderRows,
    recentReviewRows,
    ratingAggregate
  ] = await Promise.all([
    OrderModel.find({
      restaurantId,
      createdAt: { $gte: range.start, $lte: range.end }
    })
      .select({ status: 1, pricing: 1, customerSnapshot: 1, createdAt: 1 })
      .lean(),
    OrderModel.find({
      restaurantId,
      status: "Delivered",
      ...buildDeliveredRangeClause(range)
    })
      .select({ status: 1, pricing: 1, timestamps: 1 })
      .lean(),
    OrderModel.find({
      restaurantId,
      createdAt: { $gte: previousRange.start, $lte: previousRange.end }
    })
      .select({ status: 1, pricing: 1, createdAt: 1 })
      .lean(),
    OrderModel.find({
      restaurantId,
      status: "Delivered",
      ...buildDeliveredRangeClause(previousRange)
    })
      .select({ status: 1, pricing: 1, timestamps: 1 })
      .lean(),
    OrderModel.find({
      restaurantId,
      status: "Cancelled",
      ...buildCancelledRangeClause(range)
    })
      .select({ status: 1, pricing: 1, timestamps: 1 })
      .lean(),
    OrderModel.find({
      restaurantId,
      status: "Cancelled",
      ...buildCancelledRangeClause(previousRange)
    })
      .select({ status: 1, pricing: 1, timestamps: 1 })
      .lean(),
    OrderModel.find({
      restaurantId,
      status: "Rejected",
      ...buildRejectedRangeClause(range)
    })
      .select({ status: 1, pricing: 1, timestamps: 1 })
      .lean(),
    OrderModel.find({
      restaurantId,
      status: "Rejected",
      ...buildRejectedRangeClause(previousRange)
    })
      .select({ status: 1, pricing: 1, timestamps: 1 })
      .lean(),
    OrderModel.countDocuments({
      restaurantId,
      status: { $in: ["New", "Accepted", "Preparing", "ReadyForPickup", "PickedUp"] }
    }),
    OrderModel.countDocuments({
      restaurantId,
      status: { $in: ["New", "Accepted", "Preparing", "ReadyForPickup", "PickedUp"] },
      createdAt: { $gte: previousRange.start, $lte: previousRange.end }
    }),
    PayoutBatchModel.findOne({ restaurantId, status: "completed" })
      .sort({ createdAt: -1 })
      .select({ createdAt: 1 })
      .lean(),
    OrderModel.aggregate([
      {
        $match: {
          restaurantId: toObjectId(restaurantId),
          createdAt: { $gte: range.start, $lte: range.end },
          status: { $nin: ["Cancelled", "Rejected"] }
        }
      },
      {
        $facet: {
          topItems: [
            { $unwind: "$itemsSnapshot" },
            {
              $group: {
                _id: {
                  itemId: "$itemsSnapshot.itemId",
                  name: { $ifNull: ["$itemsSnapshot.name", "$itemsSnapshot.itemName"] }
                },
                quantity: { $sum: { $ifNull: ["$itemsSnapshot.quantity", 0] } },
                revenue: {
                  $sum: {
                    $ifNull: [
                      "$itemsSnapshot.lineTotal",
                      {
                        $multiply: [
                          { $ifNull: ["$itemsSnapshot.quantity", 0] },
                          { $ifNull: ["$itemsSnapshot.unitPrice", 0] }
                        ]
                      }
                    ]
                  }
                }
              }
            },
            { $sort: { quantity: -1, revenue: -1 } },
            { $limit: 6 }
          ]
        }
      }
    ]),
    OrderModel.find({
      restaurantId,
      status: { $in: ["New", "Accepted", "Preparing", "ReadyForPickup", "PickedUp"] }
    })
      .sort({ createdAt: -1 })
      .limit(6)
      .select({ orderNumber: 1, status: 1, pricing: 1, customerSnapshot: 1, createdAt: 1 })
      .lean(),
    ReviewModel.find({
      restaurantId,
      isHidden: { $ne: true },
      moderationStatus: { $ne: "hidden" }
    })
      .sort({ createdAt: -1 })
      .limit(4)
      .select({ customerId: 1, rating: 1, comment: 1, createdAt: 1 })
      .lean(),
    // Lifetime rating for the owner's header KPI — not range-scoped, since a star
    // rating is an all-time reputation figure, not a "today" metric.
    // `restaurantId` is a string here and aggregate() does not cast it the way find()
    // does, so it must go through toObjectId or the $match silently returns nothing.
    ReviewModel.aggregate([
      {
        $match: {
          restaurantId: toObjectId(restaurantId),
          isHidden: { $ne: true },
          moderationStatus: { $ne: "hidden" }
        }
      },
      {
        $group: {
          _id: null,
          average: { $avg: "$rating" },
          count: { $sum: 1 }
        }
      }
    ])
  ])

  const filteredRevenue = deliveredOrdersInRange.reduce(
    (sum, order) => sum + getOrderRestaurantNetSalesForOwner(order),
    0
  )
  const previousRevenue = previousDeliveredOrders.reduce(
    (sum, order) => sum + getOrderRestaurantNetSalesForOwner(order),
    0
  )
  const netAggregate = summarizeDeliveredOrdersForOwner(
    deliveredOrdersInRange as Array<Record<string, any>>,
    restaurant
  )
  const previousNetAggregate = summarizeDeliveredOrdersForOwner(
    previousDeliveredOrders as Array<Record<string, any>>,
    restaurant
  )
  const placedOrdersInRange = filteredOrders.filter(
    (order) => order.status !== "Cancelled" && order.status !== "Rejected"
  )
  const previousPlacedOrders = previousOrders.filter(
    (order) => order.status !== "Cancelled" && order.status !== "Rejected"
  )
  const placedOrderValue = placedOrdersInRange.reduce(
    (sum, order) => sum + getOrderRestaurantNetSalesForOwner(order),
    0
  )
  const previousPlacedOrderValue = previousPlacedOrders.reduce(
    (sum, order) => sum + getOrderRestaurantNetSalesForOwner(order),
    0
  )
  const cancelledOrderValue = cancelledOrdersInRange.reduce(
    (sum, order) => sum + getOrderRestaurantNetSalesForOwner(order),
    0
  )
  const previousCancelledOrderValue = previousCancelledOrdersInRange.reduce(
    (sum, order) => sum + getOrderRestaurantNetSalesForOwner(order),
    0
  )
  const rejectedOrderValue = rejectedOrdersInRange.reduce(
    (sum, order) => sum + getOrderRestaurantNetSalesForOwner(order),
    0
  )
  const previousRejectedOrderValue = previousRejectedOrdersInRange.reduce(
    (sum, order) => sum + getOrderRestaurantNetSalesForOwner(order),
    0
  )
  const totalOrders = placedOrdersInRange.length
  const completedOrders = deliveredOrdersInRange.length
  const previousCompletedOrders = previousDeliveredOrders.length
  const averageOrderValue = completedOrders > 0 ? filteredRevenue / completedOrders : 0
  const previousAverageOrderValue =
    previousCompletedOrders > 0 ? previousRevenue / previousCompletedOrders : 0
  const customerCount = new Set(
    filteredOrders
      .map((order) => order.customerSnapshot?.phone ?? "")
      .filter(Boolean)
  ).size
  const nextEstimatedPayoutAt = latestPayout
    ? new Date(new Date(latestPayout.createdAt).getTime() + 7 * 24 * 60 * 60 * 1000)
    : null
  const dashboardExtras = dashboardFacet[0] ?? { salesTrend: [], topItems: [] }
  const salesTrend = buildOwnerDashboardTrend({
    placedOrders: placedOrdersInRange as Array<Record<string, any>>,
    deliveredOrders: deliveredOrdersInRange as Array<Record<string, any>>,
    cancelledOrders: cancelledOrdersInRange as Array<Record<string, any>>,
    rejectedOrders: rejectedOrdersInRange as Array<Record<string, any>>,
    restaurant
  })

  const ratingRow = (ratingAggregate as Array<Record<string, any>>)[0]
  const ratingCount = Number(ratingRow?.count ?? 0)

  return {
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      isOnline: restaurant.runtime?.isOnline ?? false,
      isVisible: restaurant.runtime?.isVisible ?? false,
      currentOperationalStatus: restaurant.runtime?.currentOperationalStatus ?? "closed",
      // Enforcement is deliberately NOT surfaced here: this summary is served from a
      // TTL cache, so an admin suspension would show up late. `/owner/store-settings`
      // is uncached and stays the single source of truth for enforcement.
      rating: {
        average:
          ratingCount > 0 && typeof ratingRow?.average === "number"
            ? Math.round(ratingRow.average * 10) / 10
            : 0,
        count: ratingCount
      }
    },
    filter: {
      preset: params.preset ?? "today",
      from: range.start.toISOString(),
      to: range.end.toISOString()
    },
    metrics: {
      totalOrders,
      previousTotalOrders: previousPlacedOrders.length,
      totalRevenue: filteredRevenue,
      previousTotalRevenue: previousRevenue,
      placedOrderValue,
      previousPlacedOrderValue,
      deliveredOrderValue: filteredRevenue,
      previousDeliveredOrderValue: previousRevenue,
      totalNetEarnings: netAggregate.net,
      previousTotalNetEarnings: previousNetAggregate.net,
      cancelledOrders: cancelledOrdersInRange.length,
      previousCancelledOrders: previousCancelledOrdersInRange.length,
      cancelledOrderValue,
      previousCancelledOrderValue,
      rejectedOrders: rejectedOrdersInRange.length,
      previousRejectedOrders: previousRejectedOrdersInRange.length,
      rejectedOrderValue,
      previousRejectedOrderValue,
      averageOrderValue,
      previousAverageOrderValue,
      pendingOrders: activeOrders,
      previousPendingOrders: previousActiveOrders,
      completedOrders,
      previousCompletedOrders,
      uniqueCustomers: customerCount,
      nextEstimatedPayoutAt: nextEstimatedPayoutAt?.toISOString() ?? null
    },
    salesTrend,
    topItems: ((dashboardExtras.topItems ?? []) as any[]).map((row) => ({
      id: String(row._id?.itemId ?? row._id?.name ?? ""),
      name: row._id?.name || "Item",
      quantity: Number(row.quantity ?? 0),
      revenue: Number(row.revenue ?? 0)
    })),
    liveOrders: (liveOrderRows as Array<Record<string, any>>).map((order) => ({
      id: String(order._id),
      orderNumber: order.orderNumber,
      customerName: order.customerSnapshot?.fullName ?? "Customer",
      status: order.status,
      placedAt: order.createdAt?.toISOString?.() ?? new Date(order.createdAt).toISOString(),
      value: getOrderRestaurantNetSalesForOwner(order)
    })),
    recentReviews: (recentReviewRows as Array<Record<string, any>>).map((review) => ({
      id: String(review._id),
      customerName: "Customer",
      rating: Number(review.rating ?? 0),
      comment: review.comment ?? "",
      createdAt: review.createdAt?.toISOString?.() ?? new Date(review.createdAt).toISOString()
    }))
  }
}
