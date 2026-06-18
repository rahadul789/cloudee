import mongoose from "mongoose";

import { createInMemoryAsyncCache } from "../../common/utils/in-memory-cache";
import { RestaurantModel } from "../auth/auth.model";
import {
  CustomerModel,
  VoucherModel,
  VoucherRedemptionModel,
} from "../customer/customer.model";
import { OrderModel } from "../owner/operational.model";
import { buildOrderServiceAreaScopeFilter } from "../service-area/service-area.service";

type Row = Record<string, any>;

type PromoPreset =
  | "today"
  | "yesterday"
  | "last7Days"
  | "last30Days"
  | "last90Days"
  | "thisMonth"
  | "lastMonth"
  | "lifetime"
  | "custom";

export type AdminPromoAnalyticsQuery = {
  preset?: PromoPreset;
  from?: string;
  to?: string;
  zoneId?: string;
  districtId?: string;
  limit?: number;
};

type Range = { preset: PromoPreset; start: Date; end: Date };

type FundedByKey = "owner" | "platform" | "shared";

export type AdminPromoAnalyticsResponse = {
  timeframe: { preset: PromoPreset; start: string; end: string };
  summary: {
    totalRedemptions: number;
    uniqueCustomers: number;
    activeOffers: number;
    totalDiscount: number;
    ownerFundedDiscount: number;
    platformFundedDiscount: number;
    influencedRevenue: number;
  };
  fundedBy: Array<{ key: FundedByKey; redemptions: number; discount: number }>;
  byType: Array<{ type: string; redemptions: number; discount: number }>;
  offers: Array<{
    voucherId: string;
    name: string;
    code: string;
    fundedBy: string;
    createdByType: string;
    scopeType: string;
    restaurantName: string;
    redemptions: number;
    uniqueCustomers: number;
    discount: number;
    ownerFundedDiscount: number;
    platformFundedDiscount: number;
    influencedRevenue: number;
    lastUsedAt: string | null;
  }>;
  topCustomers: Array<{
    customerId: string;
    name: string;
    phone: string;
    redemptions: number;
    discount: number;
    distinctOffers: number;
  }>;
  pushPromos: Array<{
    voucherId: string;
    name: string;
    code: string;
    title: string;
    sentAt: string | null;
    totalTargets: number;
    sentCount: number;
    openCount: number;
    openRate: number;
  }>;
  trend: Array<{ date: string; redemptions: number; discount: number }>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const promoCache = createInMemoryAsyncCache<AdminPromoAnalyticsResponse>({
  ttlMs: 30_000,
  staleWhileRevalidateMs: 90_000,
  maxEntries: 24,
});

function toIso(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function num(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function str(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfMonth(value: Date) {
  const date = new Date(value);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfMonth(value: Date) {
  const date = new Date(value);
  date.setMonth(date.getMonth() + 1, 0);
  date.setHours(23, 59, 59, 999);
  return date;
}

function resolveRange(params: AdminPromoAnalyticsQuery): Range {
  const now = new Date();
  const preset = params.preset ?? "last30Days";
  if (preset === "custom") {
    const from = params.from ? new Date(params.from) : null;
    const to = params.to ? new Date(params.to) : null;
    if (from && !Number.isNaN(from.getTime()) && to && !Number.isNaN(to.getTime())) {
      return { preset, start: from, end: to };
    }
  }
  if (preset === "today") return { preset, start: startOfDay(now), end: now };
  if (preset === "yesterday") {
    const start = startOfDay(new Date(now.getTime() - DAY_MS));
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { preset, start, end };
  }
  if (preset === "last7Days")
    return { preset, start: new Date(now.getTime() - 6 * DAY_MS), end: now };
  if (preset === "last90Days")
    return { preset, start: new Date(now.getTime() - 89 * DAY_MS), end: now };
  if (preset === "thisMonth")
    return { preset, start: startOfMonth(now), end: now };
  if (preset === "lastMonth") {
    const ref = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { preset, start: startOfMonth(ref), end: endOfMonth(ref) };
  }
  if (preset === "lifetime")
    return { preset, start: new Date("2020-01-01T00:00:00.000Z"), end: now };
  return { preset: "last30Days", start: new Date(now.getTime() - 29 * DAY_MS), end: now };
}

function scopedOrderMatch(params: AdminPromoAnalyticsQuery) {
  const orderScopeFilter = buildOrderServiceAreaScopeFilter(params);
  if (!Object.keys(orderScopeFilter).length) return {};
  // Redemptions join the order as `order`, so scope keys must be re-prefixed.
  return Object.fromEntries(
    Object.entries(orderScopeFilter).map(([key, value]) => [`order.${key}`, value]),
  );
}

async function buildPromoAnalytics(
  params: AdminPromoAnalyticsQuery,
): Promise<AdminPromoAnalyticsResponse> {
  const range = resolveRange(params);
  const limit = Math.min(100, Math.max(5, params.limit ?? 25));
  const orderScopeMatch = scopedOrderMatch(params);

  const baseRedemptionStages: mongoose.PipelineStage[] = [
    {
      $lookup: {
        from: OrderModel.collection.name,
        localField: "orderId",
        foreignField: "_id",
        as: "order",
      },
    },
    { $addFields: { order: { $arrayElemAt: ["$order", 0] } } },
    {
      $match: {
        appliedAt: { $gte: range.start, $lte: range.end },
        ...orderScopeMatch,
      },
    },
    {
      $addFields: {
        discountValue: {
          $ifNull: [
            "$discountBreakdown.discountAmount",
            { $ifNull: ["$discountAmount", 0] },
          ],
        },
        ownerDiscount: {
          $ifNull: [
            "$discountBreakdown.ownerDiscountCost",
            { $ifNull: ["$discountBreakdown.ownerFundedAmount", 0] },
          ],
        },
        platformDiscount: {
          $ifNull: [
            "$discountBreakdown.platformDiscountCost",
            { $ifNull: ["$discountBreakdown.platformFundedAmount", 0] },
          ],
        },
        deliveredRevenue: {
          $cond: [
            { $eq: ["$order.status", "Delivered"] },
            { $ifNull: ["$order.pricing.total", 0] },
            0,
          ],
        },
      },
    },
  ];

  const [
    offerRows,
    customerRows,
    trendRows,
    pushRows,
    uniqueCustomerRows,
    summaryRows,
  ] = await Promise.all([
    VoucherRedemptionModel.aggregate<Row>([
      ...baseRedemptionStages,
      {
        $group: {
          _id: "$voucherId",
          redemptions: { $sum: 1 },
          customers: { $addToSet: "$voucherSnapshot.customerId" },
          discount: { $sum: "$discountValue" },
          ownerFundedDiscount: { $sum: "$ownerDiscount" },
          platformFundedDiscount: { $sum: "$platformDiscount" },
          influencedRevenue: { $sum: "$deliveredRevenue" },
          lastUsedAt: { $max: "$appliedAt" },
        },
      },
      { $sort: { redemptions: -1, discount: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: VoucherModel.collection.name,
          localField: "_id",
          foreignField: "_id",
          as: "voucher",
        },
      },
      { $addFields: { voucher: { $arrayElemAt: ["$voucher", 0] } } },
      {
        $lookup: {
          from: RestaurantModel.collection.name,
          localField: "voucher.restaurantId",
          foreignField: "_id",
          as: "restaurant",
        },
      },
      { $addFields: { restaurant: { $arrayElemAt: ["$restaurant", 0] } } },
    ]),
    VoucherRedemptionModel.aggregate<Row>([
      ...baseRedemptionStages,
      {
        $match: { "voucherSnapshot.customerId": { $type: "string", $ne: "" } },
      },
      {
        $group: {
          _id: "$voucherSnapshot.customerId",
          redemptions: { $sum: 1 },
          discount: { $sum: "$discountValue" },
          offers: { $addToSet: "$voucherId" },
        },
      },
      { $sort: { redemptions: -1, discount: -1 } },
      { $limit: limit },
    ]),
    VoucherRedemptionModel.aggregate<Row>([
      ...baseRedemptionStages,
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$appliedAt" } },
          redemptions: { $sum: 1 },
          discount: { $sum: "$discountValue" },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    VoucherModel.aggregate<Row>([
      { $match: { "pushCampaign.sentCount": { $gt: 0 } } },
      { $sort: { "pushCampaign.sentAt": -1 } },
      { $limit: limit },
    ]),
    VoucherRedemptionModel.aggregate<Row>([
      ...baseRedemptionStages,
      { $match: { "voucherSnapshot.customerId": { $type: "string", $ne: "" } } },
      { $group: { _id: "$voucherSnapshot.customerId" } },
      { $count: "total" },
    ]),
    VoucherRedemptionModel.aggregate<Row>([
      ...baseRedemptionStages,
      {
        $group: {
          _id: "$voucherId",
          redemptions: { $sum: 1 },
          discount: { $sum: "$discountValue" },
          owner: { $sum: "$ownerDiscount" },
          platform: { $sum: "$platformDiscount" },
          revenue: { $sum: "$deliveredRevenue" },
        },
      },
      {
        $group: {
          _id: null,
          activeOffers: { $sum: 1 },
          totalRedemptions: { $sum: "$redemptions" },
          totalDiscount: { $sum: "$discount" },
          ownerFundedDiscount: { $sum: "$owner" },
          platformFundedDiscount: { $sum: "$platform" },
          influencedRevenue: { $sum: "$revenue" },
        },
      },
    ]),
  ]);

  const customerIds = customerRows
    .map((row) => str(row._id))
    .filter((id) => /^[a-f\d]{24}$/i.test(id));
  const customers = customerIds.length
    ? await CustomerModel.find({ _id: { $in: customerIds } })
        .select({ fullName: 1, phone: 1 })
        .lean()
    : [];
  const customerMap = new Map(
    customers.map((customer) => [String(customer._id), customer]),
  );

  const offers = offerRows.map((row) => {
    const voucher = (row.voucher as Row) ?? {};
    const restaurant = (row.restaurant as Row) ?? {};
    const uniqueCustomers = Array.isArray(row.customers)
      ? row.customers.filter(Boolean).length
      : 0;
    return {
      voucherId: str(row._id),
      name: str(voucher.name) || str(row._id),
      code: str(voucher.code),
      fundedBy: str(voucher.fundedBy) || "owner",
      createdByType: str(voucher.createdByType) || "owner",
      scopeType: str(voucher.scopeType) || "restaurant",
      restaurantName: str(restaurant.name),
      redemptions: num(row.redemptions),
      uniqueCustomers,
      discount: Math.round(num(row.discount)),
      ownerFundedDiscount: Math.round(num(row.ownerFundedDiscount)),
      platformFundedDiscount: Math.round(num(row.platformFundedDiscount)),
      influencedRevenue: Math.round(num(row.influencedRevenue)),
      lastUsedAt: toIso(row.lastUsedAt),
    };
  });

  const fundedByMap = new Map<FundedByKey, { redemptions: number; discount: number }>([
    ["owner", { redemptions: 0, discount: 0 }],
    ["platform", { redemptions: 0, discount: 0 }],
    ["shared", { redemptions: 0, discount: 0 }],
  ]);
  const byTypeMap = new Map<string, { redemptions: number; discount: number }>();
  for (const offer of offers) {
    const fundedKey: FundedByKey =
      offer.fundedBy === "platform"
        ? "platform"
        : offer.fundedBy === "shared"
          ? "shared"
          : "owner";
    const fundedEntry = fundedByMap.get(fundedKey)!;
    fundedEntry.redemptions += offer.redemptions;
    fundedEntry.discount += offer.discount;
  }

  // Type breakdown needs the voucher type, which lives on the joined voucher.
  for (const row of offerRows) {
    const voucher = (row.voucher as Row) ?? {};
    const type = str(voucher.type) || "unknown";
    const entry = byTypeMap.get(type) ?? { redemptions: 0, discount: 0 };
    entry.redemptions += num(row.redemptions);
    entry.discount += Math.round(num(row.discount));
    byTypeMap.set(type, entry);
  }

  const summaryRow = summaryRows[0] ?? {};
  const summary = {
    totalRedemptions: num(summaryRow.totalRedemptions),
    totalDiscount: Math.round(num(summaryRow.totalDiscount)),
    ownerFundedDiscount: Math.round(num(summaryRow.ownerFundedDiscount)),
    platformFundedDiscount: Math.round(num(summaryRow.platformFundedDiscount)),
    influencedRevenue: Math.round(num(summaryRow.influencedRevenue)),
    activeOffers: num(summaryRow.activeOffers),
  };
  const uniqueCustomers = num(uniqueCustomerRows[0]?.total);

  return {
    timeframe: {
      preset: range.preset,
      start: range.start.toISOString(),
      end: range.end.toISOString(),
    },
    summary: {
      ...summary,
      uniqueCustomers,
    },
    fundedBy: [...fundedByMap.entries()].map(([key, value]) => ({
      key,
      redemptions: value.redemptions,
      discount: value.discount,
    })),
    byType: [...byTypeMap.entries()]
      .map(([type, value]) => ({ type, ...value }))
      .sort((left, right) => right.redemptions - left.redemptions),
    offers,
    topCustomers: customerRows.map((row) => {
      const customer = customerMap.get(str(row._id));
      return {
        customerId: str(row._id),
        name: str(customer?.fullName) || "Customer",
        phone: str(customer?.phone),
        redemptions: num(row.redemptions),
        discount: Math.round(num(row.discount)),
        distinctOffers: Array.isArray(row.offers)
          ? row.offers.filter(Boolean).length
          : 0,
      };
    }),
    pushPromos: pushRows.map((row) => {
      const push = (row.pushCampaign as Row) ?? {};
      const sentCount = num(push.sentCount);
      const openCount = num(push.openCount);
      return {
        voucherId: str(row._id),
        name: str(row.name) || str(row._id),
        code: str(row.code),
        title: str(push.title),
        sentAt: toIso(push.sentAt),
        totalTargets: num(push.totalTargets),
        sentCount,
        openCount,
        openRate: sentCount > 0 ? Math.round((openCount / sentCount) * 100) : 0,
      };
    }),
    trend: trendRows.map((row) => ({
      date: str(row._id),
      redemptions: num(row.redemptions),
      discount: Math.round(num(row.discount)),
    })),
  };
}

export async function getAdminPromoAnalytics(params: AdminPromoAnalyticsQuery) {
  const cacheKey = [
    params.preset ?? "last30Days",
    params.from ?? "",
    params.to ?? "",
    params.zoneId ?? "",
    params.districtId ?? "",
    params.limit ?? 25,
  ].join("|");
  return promoCache.getOrSet(cacheKey, () => buildPromoAnalytics(params));
}
