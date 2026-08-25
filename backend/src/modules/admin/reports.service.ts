import mongoose from "mongoose";

import { RestaurantModel, RiderModel } from "../auth/auth.model";
import { CustomerModel, VoucherRedemptionModel } from "../customer/customer.model";
import { CustomerAnalyticsEventModel } from "../customer/customer-analytics.model";
import { LedgerEntryModel } from "../owner/finance.model";
import { aggregateFinalizedLedgerEntries } from "../owner/finance.service";
import { ReviewModel } from "../owner/experience.model";
import { OrderModel } from "../owner/operational.model";
import { RiderPayrollCycleModel } from "./rider-payroll.model";
import {
  buildOrderServiceAreaScopeFilter,
  buildRestaurantServiceAreaScopeFilter,
  buildRiderServiceAreaScopeFilter,
} from "../service-area/service-area.service";

type ReportPreset =
  | "today"
  | "yesterday"
  | "last7Days"
  | "last30Days"
  | "last90Days"
  | "thisMonth"
  | "lastMonth"
  | "lifetime"
  | "custom";

type ReportParams = {
  preset?: ReportPreset;
  from?: string;
  to?: string;
  zoneId?: string;
  districtId?: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function parseDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildRange(params: ReportParams) {
  const now = new Date();
  const preset = params.preset ?? "last30Days";
  if (preset === "custom") {
    const from = parseDate(params.from);
    const to = parseDate(params.to);
    return {
      preset,
      start: startOfDay(from ?? new Date(now.getTime() - 29 * DAY_MS)),
      end: endOfDay(to ?? now),
    };
  }
  if (preset === "today") return { preset, start: startOfDay(now), end: endOfDay(now) };
  if (preset === "yesterday") {
    const yesterday = new Date(now.getTime() - DAY_MS);
    return { preset, start: startOfDay(yesterday), end: endOfDay(yesterday) };
  }
  if (preset === "last7Days") return { preset, start: startOfDay(new Date(now.getTime() - 6 * DAY_MS)), end: endOfDay(now) };
  if (preset === "last90Days") return { preset, start: startOfDay(new Date(now.getTime() - 89 * DAY_MS)), end: endOfDay(now) };
  if (preset === "thisMonth") return { preset, start: new Date(now.getFullYear(), now.getMonth(), 1), end: endOfDay(now) };
  if (preset === "lastMonth") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { preset, start, end };
  }
  if (preset === "lifetime") {
    return { preset, start: new Date(0), end: endOfDay(now) };
  }
  return { preset: "last30Days" as const, start: startOfDay(new Date(now.getTime() - 29 * DAY_MS)), end: endOfDay(now) };
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function objectIdString(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof mongoose.Types.ObjectId) return value.toString();
  if (typeof value === "object" && "toString" in value) return String(value);
  return "";
}

function serializeDate(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function deliveredDateExpression() {
  return {
    $ifNull: [
      "$timestamps.Delivered",
      {
        $ifNull: ["$timestamps.deliveredAt", "$createdAt"],
      },
    ],
  };
}

function terminalDateExpression() {
  return {
    $ifNull: [
      "$timestamps.Cancelled",
      {
        $ifNull: [
          "$timestamps.cancelledAt",
          {
            $ifNull: [
              "$timestamps.Rejected",
              {
                $ifNull: ["$timestamps.rejectedAt", "$createdAt"],
              },
            ],
          },
        ],
      },
    ],
  };
}

function rangeMatchOn(field: string, start: Date, end: Date) {
  return { [field]: { $gte: start, $lte: end } };
}

function daysBetween(start: Date, end: Date) {
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / DAY_MS));
}

function trendLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function fillDailyTrend(rows: Array<{ _id: string; orders: number; revenue: number }>, start: Date, end: Date) {
  const rowMap = new Map(rows.map((row) => [row._id, row]));
  const points = [];
  for (let cursor = startOfDay(start); cursor <= end; cursor = new Date(cursor.getTime() + DAY_MS)) {
    const key = cursor.toISOString().slice(0, 10);
    const row = rowMap.get(key);
    points.push({
      date: key,
      label: trendLabel(cursor),
      orders: numberValue(row?.orders),
      revenue: numberValue(row?.revenue),
    });
  }
  return points;
}

function monthKeysBetween(start: Date, end: Date) {
  const keys: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= last) {
    keys.push(cursor.toISOString().slice(0, 7));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
}

function summarizePayrollAmount(rider: Record<string, any>, cycle?: Record<string, any> | null) {
  const baseSalary = numberValue(cycle?.baseSalary, numberValue(rider.payroll?.monthlySalary));
  const adjustments = Array.isArray(cycle?.adjustments) ? cycle.adjustments : [];
  const platformBonus = adjustments.reduce((total: number, adjustment: Record<string, any>) => {
    const type = stringValue(adjustment.type);
    return ["bonus", "tip", "reimbursement"].includes(type)
      ? total + numberValue(adjustment.amount)
      : total;
  }, 0);
  const penalties = adjustments.reduce((total: number, adjustment: Record<string, any>) => {
    const type = stringValue(adjustment.type);
    return ["penalty", "deduction"].includes(type)
      ? total + numberValue(adjustment.amount)
      : total;
  }, 0);
  const netPayable = Math.max(baseSalary + platformBonus - penalties, 0);
  return {
    baseSalary,
    platformBonus,
    penalties,
    netPayable,
    pending: cycle?.status === "paid" ? 0 : netPayable,
    paid: cycle?.status === "paid" ? netPayable : 0,
  };
}

export async function getAdminReports(params: ReportParams) {
  const range = buildRange(params);
  const deliveredDate = deliveredDateExpression();
  const terminalDate = terminalDateExpression();
  // External deliveries are off-platform (owner-initiated, settled separately). They must NOT
  // enter any platform report/dashboard KPI (revenue, orders, trend, margin, reconciliation).
  // `source` is absent on regular orders and on ledger/review docs, so `$ne "external"` matches
  // those (missing field ≠ "external") and only drops the explicit external orders.
  const orderScopeFilter = {
    ...buildOrderServiceAreaScopeFilter(params),
    source: { $ne: "external" },
  };
  // Raw area scope (no source constraint) — used to measure external deliveries on their own.
  const externalOrderScopeFilter = {
    ...buildOrderServiceAreaScopeFilter(params),
    source: "external",
  };
  const restaurantScopeFilter = buildRestaurantServiceAreaScopeFilter(params);
  const riderScopeFilter = buildRiderServiceAreaScopeFilter(params);
  const [scopedRestaurantIds, scopedRiderIds, scopedCustomerIds] = await Promise.all([
    Object.keys(restaurantScopeFilter).length
      ? RestaurantModel.find(restaurantScopeFilter).select({ _id: 1 }).lean()
      : Promise.resolve(null),
    Object.keys(riderScopeFilter).length
      ? RiderModel.find(riderScopeFilter).select({ _id: 1 }).lean()
      : Promise.resolve(null),
    Object.keys(orderScopeFilter).length
      ? OrderModel.distinct("customerId", {
          ...orderScopeFilter,
          customerId: { $type: "string", $ne: "" },
        })
      : Promise.resolve(null),
  ]);
  const scopedRestaurantObjectIds = scopedRestaurantIds
    ? scopedRestaurantIds.map((restaurant) => restaurant._id)
    : null;
  const scopedRiderObjectIds = scopedRiderIds
    ? scopedRiderIds.map((rider) => rider._id)
    : null;
  const scopedCustomerObjectIds = scopedCustomerIds
    ? scopedCustomerIds
        .filter((customerId) => mongoose.Types.ObjectId.isValid(String(customerId)))
        .map((customerId) => new mongoose.Types.ObjectId(String(customerId)))
    : null;
  const customerScopeFilter = scopedCustomerObjectIds
    ? { _id: { $in: scopedCustomerObjectIds } }
    : {};
  const voucherRedemptionOrderScopeFilter = Object.fromEntries(
    Object.entries(orderScopeFilter).map(([key, value]) => [`order.${key}`, value]),
  );
  const scopedReviewFilter = scopedRestaurantObjectIds
    ? { restaurantId: { $in: scopedRestaurantObjectIds } }
    : {};
  const days = daysBetween(range.start, range.end);
  const trendStart =
    range.preset === "lifetime"
      ? startOfDay(new Date(range.end.getTime() - 29 * DAY_MS))
      : range.start;
  const payrollMonths = monthKeysBetween(range.start, range.end);

  // Active-user windows are fixed (today / trailing 30 days) regardless of the
  // selected report range, so DAU/MAU stay meaningful on every preset.
  const activeUsersNow = new Date();
  const activeUsersTodayStart = startOfDay(activeUsersNow);
  const activeUsersMonthStart = new Date(activeUsersNow.getTime() - 29 * DAY_MS);
  const analyticsCustomerScope = scopedCustomerIds
    ? { customerId: { $in: scopedCustomerIds } }
    : { customerId: { $type: "string", $ne: "" } };

  const [
    deliveredRows,
    previousDeliveredRows,
    trendRows,
    hourlyRows,
    dayOfWeekRows,
    orderStatusRows,
    cancelledRows,
    cancelledByRows,
    ledgerRows,
    refundLedgerRows,
    refundOrderRows,
    paymentRows,
    restaurantRows,
    topCustomerRows,
    riderRows,
    topItemRows,
    promotionRows,
    newCustomers,
    totalCustomers,
    activeRestaurants,
    reviewRows,
    payrollCycles,
    activeUsersTodayIds,
    activeUsersMonthIds,
    repeatCustomerRows,
    externalDeliveredRows,
  ] = await Promise.all([
    OrderModel.aggregate<Record<string, any>>([
      { $match: { status: "Delivered", ...orderScopeFilter } },
      { $addFields: { reportDeliveredAt: deliveredDate } },
      { $match: rangeMatchOn("reportDeliveredAt", range.start, range.end) },
      {
        $group: {
          _id: null,
          deliveredOrders: { $sum: 1 },
          deliveredRevenue: { $sum: { $ifNull: ["$pricing.total", 0] } },
          deliveredSubtotalGross: { $sum: { $ifNull: ["$pricing.subtotal", 0] } },
          deliveryFees: { $sum: { $ifNull: ["$pricing.deliveryFee", 0] } },
          discountAmount: { $sum: { $ifNull: ["$pricing.discountAmount", { $ifNull: ["$pricing.discount", 0] }] } },
          averageServiceMinutes: {
            $avg: {
              $divide: [{ $subtract: ["$reportDeliveredAt", "$createdAt"] }, 60000],
            },
          },
        },
      },
    ]),
    OrderModel.aggregate<Record<string, any>>([
      { $match: { status: "Delivered", ...orderScopeFilter } },
      { $addFields: { reportDeliveredAt: deliveredDate } },
      {
        $match: rangeMatchOn(
          "reportDeliveredAt",
          new Date(range.start.getTime() - days * DAY_MS),
          new Date(range.start.getTime() - 1),
        ),
      },
      {
        $group: {
          _id: null,
          deliveredOrders: { $sum: 1 },
          deliveredRevenue: { $sum: { $ifNull: ["$pricing.total", 0] } },
        },
      },
    ]),
    OrderModel.aggregate<{ _id: string; orders: number; revenue: number }>([
      { $match: { status: "Delivered", ...orderScopeFilter } },
      { $addFields: { reportDeliveredAt: deliveredDate } },
      { $match: rangeMatchOn("reportDeliveredAt", trendStart, range.end) },
      {
        $group: {
          _id: { $dateToString: { date: "$reportDeliveredAt", format: "%Y-%m-%d" } },
          orders: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$pricing.total", 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    OrderModel.aggregate<{ _id: number; orders: number; revenue: number }>([
      { $match: { status: "Delivered", ...orderScopeFilter } },
      { $addFields: { reportDeliveredAt: deliveredDate } },
      { $match: rangeMatchOn("reportDeliveredAt", range.start, range.end) },
      {
        $group: {
          _id: { $hour: "$reportDeliveredAt" },
          orders: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$pricing.total", 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    OrderModel.aggregate<{ _id: number; orders: number; revenue: number }>([
      { $match: { status: "Delivered", ...orderScopeFilter } },
      { $addFields: { reportDeliveredAt: deliveredDate } },
      { $match: rangeMatchOn("reportDeliveredAt", range.start, range.end) },
      {
        $group: {
          _id: { $dayOfWeek: "$reportDeliveredAt" },
          orders: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$pricing.total", 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    OrderModel.aggregate<{ _id: string; count: number; revenue: number }>([
      {
        $match: {
          ...orderScopeFilter,
          $or: [
            { createdAt: { $gte: range.start, $lte: range.end } },
            { "timestamps.Delivered": { $gte: range.start, $lte: range.end } },
            { "timestamps.deliveredAt": { $gte: range.start, $lte: range.end } },
          ],
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          revenue: { $sum: { $cond: [{ $eq: ["$status", "Delivered"] }, { $ifNull: ["$pricing.total", 0] }, 0] } },
        },
      },
      { $sort: { count: -1 } },
    ]),
    OrderModel.aggregate<{ _id: string; count: number }>([
      { $match: { status: { $in: ["Cancelled", "Rejected"] }, ...orderScopeFilter } },
      { $addFields: { reportTerminalAt: terminalDate } },
      { $match: rangeMatchOn("reportTerminalAt", range.start, range.end) },
      {
        $group: {
          _id: { $ifNull: ["$terminalReason", { $ifNull: ["$rejectionReason", "Unknown"] }] },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    OrderModel.aggregate<{ _id: string; count: number }>([
      { $match: { status: { $in: ["Cancelled", "Rejected"] }, ...orderScopeFilter } },
      { $addFields: { reportTerminalAt: terminalDate } },
      { $match: rangeMatchOn("reportTerminalAt", range.start, range.end) },
      {
        $group: {
          _id: { $ifNull: ["$cancelledBy", "unknown"] },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]),
    aggregateFinalizedLedgerEntries(
      { entryType: "earning", ...orderScopeFilter },
      [
      { $match: rangeMatchOn("effectiveAt", range.start, range.end) },
      {
        $group: {
          _id: null,
          grossAmount: { $sum: { $ifNull: ["$grossAmount", 0] } },
          commissionBase: { $sum: { $ifNull: ["$commissionBase", "$grossAmount"] } },
          platformCommission: { $sum: { $ifNull: ["$commission", 0] } },
          restaurantPayable: { $sum: { $ifNull: ["$netAmount", 0] } },
          discountCost: { $sum: { $ifNull: ["$discountCost", 0] } },
          platformDiscountCost: { $sum: { $ifNull: ["$platformDiscountCost", 0] } },
          deliveryCost: { $sum: { $ifNull: ["$deliveryCost", 0] } },
          pending: { $sum: { $cond: [{ $eq: ["$settlementStatus", "pending"] }, "$netAmount", 0] } },
          available: { $sum: { $cond: [{ $eq: ["$settlementStatus", "available"] }, "$netAmount", 0] } },
          paidOut: { $sum: { $cond: [{ $eq: ["$settlementStatus", "paid_out"] }, { $abs: "$netAmount" }, 0] } },
        },
      },
      ],
    ),
    LedgerEntryModel.aggregate<Record<string, any>>([
      { $match: { entryType: "refund", createdAt: { $gte: range.start, $lte: range.end }, ...orderScopeFilter } },
      {
        $group: {
          _id: null,
          refundLedgerAmount: { $sum: { $abs: "$netAmount" } },
          refundLedgerCount: { $sum: 1 },
        },
      },
    ]),
    OrderModel.aggregate<Record<string, any>>([
      {
        $match: {
          paymentStatus: { $in: ["refund_pending", "refunded", "refund_rejected"] },
          updatedAt: { $gte: range.start, $lte: range.end },
          ...orderScopeFilter,
        },
      },
      {
        $group: {
          _id: null,
          pendingCount: { $sum: { $cond: [{ $eq: ["$paymentStatus", "refund_pending"] }, 1, 0] } },
          pendingAmount: {
            $sum: {
              $cond: [{ $eq: ["$paymentStatus", "refund_pending"] }, { $ifNull: ["$pricing.total", 0] }, 0],
            },
          },
          refundedCount: { $sum: { $cond: [{ $eq: ["$paymentStatus", "refunded"] }, 1, 0] } },
          refundedAmount: {
            $sum: {
              $cond: [{ $eq: ["$paymentStatus", "refunded"] }, { $ifNull: ["$pricing.total", 0] }, 0],
            },
          },
          rejectedCount: { $sum: { $cond: [{ $eq: ["$paymentStatus", "refund_rejected"] }, 1, 0] } },
        },
      },
    ]),
    OrderModel.aggregate<Record<string, any>>([
      { $match: { status: "Delivered", ...orderScopeFilter } },
      { $addFields: { reportDeliveredAt: deliveredDate } },
      { $match: rangeMatchOn("reportDeliveredAt", range.start, range.end) },
      {
        $group: {
          _id: "$paymentMethod",
          orders: { $sum: 1 },
          amount: { $sum: { $ifNull: ["$pricing.total", 0] } },
          paid: { $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, { $ifNull: ["$pricing.total", 0] }, 0] } },
        },
      },
      { $sort: { amount: -1 } },
    ]),
    OrderModel.aggregate<Record<string, any>>([
      { $match: { status: "Delivered", ...orderScopeFilter } },
      { $addFields: { reportDeliveredAt: deliveredDate } },
      { $match: rangeMatchOn("reportDeliveredAt", range.start, range.end) },
      {
        $group: {
          _id: "$restaurantId",
          deliveredOrders: { $sum: 1 },
          deliveredRevenue: { $sum: { $ifNull: ["$pricing.total", 0] } },
          averageOrderValue: { $avg: { $ifNull: ["$pricing.total", 0] } },
        },
      },
      { $sort: { deliveredRevenue: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: RestaurantModel.collection.name,
          localField: "_id",
          foreignField: "_id",
          as: "restaurant",
        },
      },
      { $addFields: { restaurant: { $arrayElemAt: ["$restaurant", 0] } } },
    ]),
    OrderModel.aggregate<Record<string, any>>([
      { $match: { status: "Delivered", customerId: { $ne: "" }, ...orderScopeFilter } },
      { $addFields: { reportDeliveredAt: deliveredDate } },
      { $match: rangeMatchOn("reportDeliveredAt", range.start, range.end) },
      {
        $group: {
          _id: "$customerId",
          deliveredOrders: { $sum: 1 },
          spend: { $sum: { $ifNull: ["$pricing.total", 0] } },
          lastOrderedAt: { $max: "$reportDeliveredAt" },
          name: { $last: "$customerSnapshot.fullName" },
          phone: { $last: "$customerSnapshot.phone" },
        },
      },
      { $sort: { spend: -1 } },
      { $limit: 10 },
    ]),
    OrderModel.aggregate<Record<string, any>>([
      { $match: { status: "Delivered", riderId: { $ne: "" }, ...orderScopeFilter } },
      { $addFields: { reportDeliveredAt: deliveredDate } },
      { $match: rangeMatchOn("reportDeliveredAt", range.start, range.end) },
      {
        $group: {
          _id: "$riderId",
          deliveredTrips: { $sum: 1 },
          deliveryFees: { $sum: { $ifNull: ["$pricing.deliveryFee", 0] } },
          riderName: { $last: "$riderSnapshot.name" },
          riderPhone: { $last: "$riderSnapshot.phone" },
        },
      },
      { $sort: { deliveredTrips: -1 } },
      { $limit: 10 },
    ]),
    OrderModel.aggregate<Record<string, any>>([
      { $match: { status: "Delivered", ...orderScopeFilter } },
      { $addFields: { reportDeliveredAt: deliveredDate } },
      { $match: rangeMatchOn("reportDeliveredAt", range.start, range.end) },
      { $unwind: "$itemsSnapshot" },
      {
        $group: {
          _id: "$itemsSnapshot.itemId",
          name: {
            $last: {
              $ifNull: ["$itemsSnapshot.itemName", "$itemsSnapshot.name"],
            },
          },
          categoryName: { $last: "$itemsSnapshot.categoryName" },
          quantity: { $sum: { $ifNull: ["$itemsSnapshot.quantity", 0] } },
          revenue: { $sum: { $ifNull: ["$itemsSnapshot.lineTotal", 0] } },
          orders: { $addToSet: "$_id" },
        },
      },
      {
        $project: {
          itemId: "$_id",
          name: 1,
          categoryName: 1,
          quantity: 1,
          revenue: 1,
          orders: { $size: "$orders" },
        },
      },
      { $sort: { quantity: -1, revenue: -1 } },
      { $limit: 5 },
    ]),
    VoucherRedemptionModel.aggregate<Record<string, any>>([
      {
        $lookup: {
          from: OrderModel.collection.name,
          localField: "orderId",
          foreignField: "_id",
          as: "order",
        },
      },
      { $addFields: { order: { $arrayElemAt: ["$order", 0] } } },
      { $match: { "order.status": "Delivered", ...voucherRedemptionOrderScopeFilter } },
      { $addFields: { reportDeliveredAt: { $ifNull: ["$order.timestamps.Delivered", { $ifNull: ["$order.timestamps.deliveredAt", "$order.createdAt"] }] } } },
      { $match: rangeMatchOn("reportDeliveredAt", range.start, range.end) },
      {
        $group: {
          _id: "$voucherId",
          uses: { $sum: 1 },
          discount: {
            $sum: {
              $ifNull: [
                "$discountBreakdown.discountAmount",
                { $ifNull: ["$discountAmount", 0] },
              ],
            },
          },
          ownerFundedDiscount: {
            $sum: {
              $ifNull: [
                "$discountBreakdown.ownerDiscountCost",
                { $ifNull: ["$discountBreakdown.ownerFundedAmount", 0] },
              ],
            },
          },
          platformFundedDiscount: {
            $sum: {
              $ifNull: [
                "$discountBreakdown.platformDiscountCost",
                { $ifNull: ["$discountBreakdown.platformFundedAmount", 0] },
              ],
            },
          },
          revenue: { $sum: { $ifNull: ["$order.pricing.total", 0] } },
          fundedBy: { $last: "$voucherSnapshot.fundedBy" },
          name: { $last: "$voucherSnapshot.name" },
          code: { $last: "$voucherSnapshot.code" },
        },
      },
      { $sort: { uses: -1 } },
      { $limit: 8 },
    ]),
    CustomerModel.countDocuments({
      ...customerScopeFilter,
      createdAt: { $gte: range.start, $lte: range.end },
    }),
    CustomerModel.countDocuments(customerScopeFilter),
    RestaurantModel.countDocuments({ "runtime.isVisible": true, ...restaurantScopeFilter }),
    ReviewModel.aggregate<Record<string, any>>([
      { $match: { isHidden: { $ne: true }, moderationStatus: "visible", createdAt: { $gte: range.start, $lte: range.end }, ...scopedReviewFilter } },
      { $group: { _id: null, count: { $sum: 1 }, averageRating: { $avg: "$rating" } } },
    ]),
    scopedRiderObjectIds && scopedRiderObjectIds.length === 0
      ? Promise.resolve([])
      : RiderPayrollCycleModel.find({
          status: "paid",
          paidAt: { $gte: range.start, $lte: range.end },
          ...(scopedRiderObjectIds ? { riderId: { $in: scopedRiderObjectIds } } : {}),
        }).lean(),
    CustomerAnalyticsEventModel.distinct("customerId", {
      ...analyticsCustomerScope,
      occurredAt: { $gte: activeUsersTodayStart },
    }),
    CustomerAnalyticsEventModel.distinct("customerId", {
      ...analyticsCustomerScope,
      occurredAt: { $gte: activeUsersMonthStart },
    }),
    OrderModel.aggregate<Record<string, any>>([
      { $match: { status: "Delivered", ...orderScopeFilter } },
      { $addFields: { reportDeliveredAt: deliveredDate } },
      { $match: rangeMatchOn("reportDeliveredAt", range.start, range.end) },
      { $group: { _id: "$customerId", orders: { $sum: 1 } } },
      {
        $group: {
          _id: null,
          orderingCustomers: { $sum: 1 },
          repeatCustomers: {
            $sum: { $cond: [{ $gte: ["$orders", 2] }, 1, 0] },
          },
        },
      },
    ]),
    // External deliveries in this timeframe — tracked separately, never mixed into platform KPIs.
    OrderModel.aggregate<Record<string, any>>([
      { $match: { status: "Delivered", ...externalOrderScopeFilter } },
      { $addFields: { reportDeliveredAt: deliveredDate } },
      { $match: rangeMatchOn("reportDeliveredAt", range.start, range.end) },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$pricing.total", 0] } },
        },
      },
    ]),
  ]);

  const activeUsersToday = Array.isArray(activeUsersTodayIds)
    ? activeUsersTodayIds.filter(Boolean).length
    : 0;
  const activeUsersMonth = Array.isArray(activeUsersMonthIds)
    ? activeUsersMonthIds.filter(Boolean).length
    : 0;
  const repeatStats = repeatCustomerRows[0] ?? {};
  const orderingCustomers = numberValue(repeatStats.orderingCustomers);
  const repeatCustomers = numberValue(repeatStats.repeatCustomers);
  const repeatRate =
    orderingCustomers > 0
      ? Math.round((repeatCustomers / orderingCustomers) * 1000) / 10
      : 0;

  const delivered = deliveredRows[0] ?? {};
  const externalDelivered = externalDeliveredRows[0] ?? {};
  const externalDeliveries = {
    count: numberValue(externalDelivered.count),
    revenue: numberValue(externalDelivered.revenue),
  };
  const previousDelivered = previousDeliveredRows[0] ?? {};
  const ledger = ledgerRows[0] ?? {};
  const refundLedger = refundLedgerRows[0] ?? {};
  const refundOrders = refundOrderRows[0] ?? {};
  const reviews = reviewRows[0] ?? {};
  const paidPayrollCyclesByRider = new Map<string, Array<Record<string, any>>>();
  payrollCycles.forEach((cycle) => {
    const riderId = objectIdString(cycle.riderId);
    paidPayrollCyclesByRider.set(riderId, [
      ...(paidPayrollCyclesByRider.get(riderId) ?? []),
      cycle,
    ]);
  });
  const payrollSummary = payrollCycles.reduce(
    (total, cycle) => {
      const amount = summarizePayrollAmount(
        { payroll: { monthlySalary: numberValue(cycle.baseSalary) } },
        cycle,
      );
      return {
        months: payrollMonths.length,
        baseSalary: total.baseSalary + amount.baseSalary,
        platformBonus: total.platformBonus + amount.platformBonus,
        penalties: total.penalties + amount.penalties,
        netPayable: total.netPayable + amount.netPayable,
        pending: 0,
        paid: total.paid + amount.netPayable,
      };
    },
    { months: payrollMonths.length, baseSalary: 0, platformBonus: 0, penalties: 0, netPayable: 0, pending: 0, paid: 0 },
  );
  const deliveredOrders = numberValue(delivered.deliveredOrders);
  const deliveredRevenue = numberValue(delivered.deliveredRevenue);
  const deliveredSubtotalGross = numberValue(delivered.deliveredSubtotalGross);
  const previousDeliveredOrders = numberValue(previousDelivered.deliveredOrders);
  const previousRevenue = numberValue(previousDelivered.deliveredRevenue);
  const revenueChangePercent = previousRevenue > 0 ? Math.round(((deliveredRevenue - previousRevenue) / previousRevenue) * 100) : 0;
  const ordersChangePercent =
    previousDeliveredOrders > 0 ? Math.round(((deliveredOrders - previousDeliveredOrders) / previousDeliveredOrders) * 100) : 0;
  const previousAov = previousDeliveredOrders > 0 ? previousRevenue / previousDeliveredOrders : 0;
  const currentAov = deliveredOrders > 0 ? deliveredRevenue / deliveredOrders : 0;
  const aovChangePercent = previousAov > 0 ? Math.round(((currentAov - previousAov) / previousAov) * 100) : 0;
  const ledgerGrossAmount = numberValue(ledger.grossAmount);
  const platformGrossIncome = numberValue(ledger.platformCommission) + numberValue(delivered.deliveryFees);
  const platformOperatingExpense = numberValue(ledger.platformDiscountCost) + payrollSummary.netPayable;
  const estimatedPlatformMargin = platformGrossIncome - platformOperatingExpense;
  const reconciliationDifference = Math.round(deliveredSubtotalGross - ledgerGrossAmount);
  const reconciliationTolerance = Math.max(5, Math.round(deliveredSubtotalGross * 0.005));
  const hasReconciliationWarning = Math.abs(reconciliationDifference) > reconciliationTolerance;
  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const hourlyMap = new Map(hourlyRows.map((row) => [numberValue(row._id), row]));
  const dayMap = new Map(dayOfWeekRows.map((row) => [numberValue(row._id), row]));

  return {
    timeframe: {
      preset: range.preset,
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      days,
    },
    overview: {
      deliveredRevenue,
      deliveredSubtotalGross,
      deliveredOrders,
      averageOrderValue: deliveredOrders > 0 ? Math.round(deliveredRevenue / deliveredOrders) : 0,
      revenueChangePercent,
      ordersChangePercent,
      aovChangePercent,
      platformCommission: numberValue(ledger.platformCommission),
      restaurantPayable: numberValue(ledger.restaurantPayable),
      discountCost: numberValue(ledger.discountCost),
      platformDiscountCost: numberValue(ledger.platformDiscountCost),
      deliveryFees: numberValue(delivered.deliveryFees),
      riderPayrollExpense: payrollSummary.netPayable,
      platformGrossIncome,
      platformOperatingExpense,
      estimatedPlatformMargin,
      newCustomers,
      totalCustomers,
      activeUsersToday,
      activeUsersMonth,
      orderingCustomers,
      repeatCustomers,
      repeatRate,
      activeRestaurants,
      averageServiceMinutes: Number(numberValue(delivered.averageServiceMinutes).toFixed(1)),
      reviewCount: numberValue(reviews.count),
      averageRating: Number(numberValue(reviews.averageRating).toFixed(1)),
      externalDeliveries,
    },
    comparison: {
      previousDeliveredRevenue: previousRevenue,
      previousDeliveredOrders,
      previousAverageOrderValue: Math.round(previousAov),
      revenueChangePercent,
      ordersChangePercent,
      aovChangePercent,
    },
    reconciliation: {
      orderSubtotalGross: deliveredSubtotalGross,
      customerCollected: deliveredRevenue,
      ledgerGrossAmount,
      difference: reconciliationDifference,
      tolerance: reconciliationTolerance,
      status: hasReconciliationWarning ? "warning" : "ok",
      message: hasReconciliationWarning
        ? "Delivered order subtotal and settlement ledger gross do not match for this timeframe."
        : "Delivered order subtotal and settlement ledger gross are within tolerance.",
    },
    sales: {
      trend: fillDailyTrend(trendRows, trendStart, range.end),
      hourly: Array.from({ length: 24 }).map((_, hour) => {
        const row = hourlyMap.get(hour);
        return {
          hour,
          label: `${String(hour).padStart(2, "0")}:00`,
          orders: numberValue(row?.orders),
          revenue: numberValue(row?.revenue),
        };
      }),
      dayOfWeek: Array.from({ length: 7 }).map((_, index) => {
        const mongoDay = index + 1;
        const row = dayMap.get(mongoDay);
        return {
          day: weekdayLabels[index],
          orders: numberValue(row?.orders),
          revenue: numberValue(row?.revenue),
        };
      }),
      ledger: {
        grossAmount: numberValue(ledger.grossAmount),
        commissionBase: numberValue(ledger.commissionBase),
        platformCommission: numberValue(ledger.platformCommission),
        restaurantPayable: numberValue(ledger.restaurantPayable),
        discountCost: numberValue(ledger.discountCost),
        platformDiscountCost: numberValue(ledger.platformDiscountCost),
        deliveryCost: numberValue(ledger.deliveryCost),
        pending: numberValue(ledger.pending),
        available: numberValue(ledger.available),
        paidOut: numberValue(ledger.paidOut),
      },
      platformMargin: {
        platformCommission: numberValue(ledger.platformCommission),
        deliveryFees: numberValue(delivered.deliveryFees),
        platformGrossIncome,
        platformDiscountCost: numberValue(ledger.platformDiscountCost),
        riderPayrollExpense: payrollSummary.netPayable,
        riderBaseSalary: payrollSummary.baseSalary,
        riderPlatformBonus: payrollSummary.platformBonus,
        riderPenalties: payrollSummary.penalties,
        riderPayrollPending: payrollSummary.pending,
        riderPayrollPaid: payrollSummary.paid,
        platformOperatingExpense,
        estimatedPlatformMargin,
        payrollMonths,
      },
    },
    orders: {
      statusDistribution: orderStatusRows.map((row) => ({
        status: stringValue(row._id, "Unknown"),
        count: numberValue(row.count),
        revenue: numberValue(row.revenue),
      })),
      cancellationReasons: cancelledRows.map((row) => ({
        reason: stringValue(row._id, "Unknown"),
        count: numberValue(row.count),
      })),
      cancellationByActor: cancelledByRows.map((row) => ({
        actor: stringValue(row._id, "unknown"),
        count: numberValue(row.count),
      })),
      refunds: {
        pendingCount: numberValue(refundOrders.pendingCount),
        pendingAmount: numberValue(refundOrders.pendingAmount),
        refundedCount: numberValue(refundOrders.refundedCount),
        refundedAmount: numberValue(refundOrders.refundedAmount),
        rejectedCount: numberValue(refundOrders.rejectedCount),
        ledgerRefundCount: numberValue(refundLedger.refundLedgerCount),
        ledgerRefundAmount: numberValue(refundLedger.refundLedgerAmount),
      },
    },
    payments: paymentRows.map((row) => ({
      method: stringValue(row._id, "Unknown"),
      orders: numberValue(row.orders),
      amount: numberValue(row.amount),
      paid: numberValue(row.paid),
    })),
    restaurants: restaurantRows.map((row) => ({
      restaurantId: objectIdString(row._id),
      name: stringValue(row.restaurant?.name, "Restaurant"),
      city: stringValue(row.restaurant?.address?.city),
      deliveredOrders: numberValue(row.deliveredOrders),
      deliveredRevenue: numberValue(row.deliveredRevenue),
      averageOrderValue: Math.round(numberValue(row.averageOrderValue)),
    })),
    customers: {
      newCustomers,
      totalCustomers,
      topCustomers: topCustomerRows.map((row) => ({
        customerId: stringValue(row._id),
        name: stringValue(row.name, "Customer"),
        phone: stringValue(row.phone),
        deliveredOrders: numberValue(row.deliveredOrders),
        spend: numberValue(row.spend),
        lastOrderedAt: serializeDate(row.lastOrderedAt),
      })),
    },
    riders: riderRows.map((row) => ({
      riderId: stringValue(row._id),
      name: stringValue(row.riderName, "Rider"),
      phone: stringValue(row.riderPhone),
      deliveredTrips: numberValue(row.deliveredTrips),
      ...(paidPayrollCyclesByRider.get(stringValue(row._id)) ?? []).reduce(
        (total, cycle) => {
          const amount = summarizePayrollAmount(
            { payroll: { monthlySalary: numberValue(cycle.baseSalary) } },
            cycle,
          );
          return {
            payrollExpense: total.payrollExpense + amount.netPayable,
            payrollPending: 0,
            payrollPaid: total.payrollPaid + amount.netPayable,
          };
        },
        { payrollExpense: 0, payrollPending: 0, payrollPaid: 0 },
      ),
    })),
    topItems: topItemRows.map((row) => ({
      itemId: stringValue(row.itemId),
      name: stringValue(row.name, "Item"),
      categoryName: stringValue(row.categoryName),
      quantity: numberValue(row.quantity),
      revenue: numberValue(row.revenue),
      orders: numberValue(row.orders),
    })),
    promotions: promotionRows.map((row) => ({
      voucherId: objectIdString(row._id),
      name: stringValue(row.name, "Voucher"),
      code: stringValue(row.code),
      fundedBy: stringValue(row.fundedBy, "owner"),
      uses: numberValue(row.uses),
      discount: numberValue(row.discount),
      ownerFundedDiscount: numberValue(row.ownerFundedDiscount),
      platformFundedDiscount: numberValue(row.platformFundedDiscount),
      deliveredRevenue: numberValue(row.revenue),
    })),
  };
}
