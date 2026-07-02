import type { PipelineStage } from "mongoose";
import mongoose from "mongoose";

import { CustomerModel } from "../customer/customer.model";
import { buildCustomerServiceAreaScopeFilter } from "../service-area/service-area.service";

type ReferralStatus =
  | "pending"
  | "rewarded"
  | "capped"
  | "disabled"
  | "under_review"
  | "rejected";

type ReferralListParams = {
  search?: string;
  status?: "all" | ReferralStatus;
  preset?: "today" | "yesterday" | "last7Days" | "last30Days" | "last90Days" | "thisMonth" | "lastMonth" | "lifetime" | "custom";
  from?: string;
  to?: string;
  sortBy?: "newest" | "oldest" | "rewardedAt" | "risk";
  page?: number;
  pageSize?: number;
  zoneId?: string;
  districtId?: string;
};

type ReferralBaseParams = ReferralListParams & {
  skipDefaultDate?: boolean;
};

function clampPage(value?: number) {
  if (!value || Number.isNaN(value)) return 1;
  return Math.max(1, Math.floor(value));
}

function clampPageSize(value?: number) {
  if (!value || Number.isNaN(value)) return 20;
  return Math.min(100, Math.max(5, Math.floor(value)));
}

function serializeDate(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function objectIdString(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && "toString" in value) return String(value);
  return "";
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildDateMatch(params: ReferralBaseParams) {
  const now = new Date();
  let from: Date | null = null;
  let to: Date | null = null;

  if (params.preset === "lifetime") {
    return null;
  }

  if (params.preset === "today") {
    from = new Date(now);
    from.setHours(0, 0, 0, 0);
    to = new Date(now);
    to.setHours(23, 59, 59, 999);
  } else if (params.preset === "yesterday") {
    from = new Date(now);
    from.setDate(from.getDate() - 1);
    from.setHours(0, 0, 0, 0);
    to = new Date(from);
    to.setHours(23, 59, 59, 999);
  } else if (params.preset === "last30Days") {
    from = new Date(now);
    from.setDate(from.getDate() - 30);
  } else if (params.preset === "last90Days") {
    from = new Date(now);
    from.setDate(from.getDate() - 90);
  } else if (params.preset === "thisMonth") {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  } else if (params.preset === "lastMonth") {
    from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  } else if (params.preset === "custom") {
    from = params.from ? new Date(params.from) : null;
    to = params.to ? new Date(params.to) : null;
  } else if (!params.skipDefaultDate) {
    from = new Date(now);
    from.setDate(from.getDate() - 7);
  }

  const match: Record<string, Date> = {};
  if (from && !Number.isNaN(from.getTime())) match.$gte = from;
  if (to && !Number.isNaN(to.getTime())) match.$lte = to;
  return Object.keys(match).length ? match : null;
}

function buildSort(sortBy?: ReferralListParams["sortBy"]) {
  const sort: Record<string, 1 | -1> = {};
  if (sortBy === "oldest") {
    sort.referredAtSort = 1;
    sort._id = 1;
    return sort;
  }
  if (sortBy === "rewardedAt") {
    sort.referralRewardedAt = -1;
    sort.referredAtSort = -1;
    return sort;
  }
  if (sortBy === "risk") {
    sort.riskScore = -1;
    sort.referredAtSort = -1;
    return sort;
  }
  sort.referredAtSort = -1;
  sort._id = -1;
  return sort;
}

function buildBasePipeline(params: ReferralBaseParams): PipelineStage[] {
  const match: Record<string, unknown> = {
    ...buildCustomerServiceAreaScopeFilter(params),
    referredByCustomerId: { $ne: null },
  };
  const dateMatch = buildDateMatch(params);
  if (dateMatch) match.createdAt = dateMatch;

  const pipeline: PipelineStage[] = [
    { $match: match },
    {
      $lookup: {
        from: "customers",
        localField: "referredByCustomerId",
        foreignField: "_id",
        as: "referrerDocs",
      },
    },
    {
      $lookup: {
        from: "orders",
        localField: "referralRewardOrderId",
        foreignField: "_id",
        as: "rewardOrderDocs",
      },
    },
    {
      $lookup: {
        from: "vouchers",
        localField: "referralRewardVoucherId",
        foreignField: "_id",
        as: "rewardVoucherDocs",
      },
    },
    {
      $addFields: {
        referrer: { $arrayElemAt: ["$referrerDocs", 0] },
        rewardOrder: { $arrayElemAt: ["$rewardOrderDocs", 0] },
        rewardVoucher: { $arrayElemAt: ["$rewardVoucherDocs", 0] },
        computedReferralStatus: {
          $cond: [
            { $ifNull: ["$referralRewardedAt", false] },
            "rewarded",
            { $ifNull: ["$referralRewardStatus", "pending"] },
          ],
        },
        referredAtSort: { $ifNull: ["$referredAt", "$createdAt"] },
        hasDeviceFingerprint: {
          $cond: [{ $gt: [{ $strLenCP: { $ifNull: ["$referralSignupDeviceId", ""] } }, 0] }, 1, 0],
        },
        hasIpFingerprint: {
          $cond: [{ $gt: [{ $strLenCP: { $ifNull: ["$referralSignupIpAddress", ""] } }, 0] }, 1, 0],
        },
      },
    },
    {
      $addFields: {
        riskScore: {
          $add: [
            { $cond: [{ $eq: ["$computedReferralStatus", "rejected"] }, 80, 0] },
            { $cond: [{ $eq: ["$computedReferralStatus", "under_review"] }, 55, 0] },
            "$hasDeviceFingerprint",
            "$hasIpFingerprint",
          ],
        },
      },
    },
  ];

  if (params.search?.trim()) {
    const pattern = escapeRegex(params.search.trim());
    pipeline.push({
      $match: {
        $or: [
          { fullName: { $regex: pattern, $options: "i" } },
          { phone: { $regex: pattern, $options: "i" } },
          { referralCode: { $regex: pattern, $options: "i" } },
          { "referrer.fullName": { $regex: pattern, $options: "i" } },
          { "referrer.phone": { $regex: pattern, $options: "i" } },
          { "referrer.referralCode": { $regex: pattern, $options: "i" } },
          { "rewardOrder.orderNumber": { $regex: pattern, $options: "i" } },
          { "rewardVoucher.code": { $regex: pattern, $options: "i" } },
        ],
      },
    });
  }

  return pipeline;
}

function serializeReferralRow(row: Record<string, any>) {
  const referrer = row.referrer ?? {};
  const rewardOrder = row.rewardOrder ?? {};
  const rewardVoucher = row.rewardVoucher ?? {};
  const deliveryAddress = rewardOrder.customerSnapshot?.deliveryAddress ?? {};

  return {
    id: objectIdString(row._id),
    status: stringValue(row.computedReferralStatus, "pending") as ReferralStatus,
    referredAt: serializeDate(row.referredAt ?? row.createdAt),
    skippedAt: serializeDate(row.referralRewardSkippedAt),
    skippedReason: stringValue(row.referralRewardSkippedReason),
    riskScore: numberValue(row.riskScore),
    referrer: {
      id: objectIdString(referrer._id),
      fullName: stringValue(referrer.fullName, "Your name"),
      phone: stringValue(referrer.phone),
      status: stringValue(referrer.status),
      referralCode: stringValue(referrer.referralCode),
    },
    referredCustomer: {
      id: objectIdString(row._id),
      fullName: stringValue(row.fullName, "Your name"),
      phone: stringValue(row.phone),
      status: stringValue(row.status),
      referralCode: stringValue(row.referralCode),
      createdAt: serializeDate(row.createdAt),
    },
    reward: {
      rewardedAt: serializeDate(row.referralRewardedAt),
      voucherId: objectIdString(row.referralRewardVoucherId),
      voucherCode: stringValue(rewardVoucher.code),
      voucherStatus: stringValue(rewardVoucher.status),
      amount: numberValue(rewardVoucher.discountValue),
      minimumOrderAmount: numberValue(rewardVoucher.minimumOrderAmount),
      expiresAt: serializeDate(rewardVoucher.endsAt),
    },
    order: {
      id: objectIdString(rewardOrder._id),
      orderNumber: stringValue(rewardOrder.orderNumber),
      status: stringValue(rewardOrder.status),
      paymentMethod: stringValue(rewardOrder.paymentMethod),
      paymentStatus: stringValue(rewardOrder.paymentStatus),
      total: numberValue(rewardOrder.pricing?.total),
      deliveredAt: serializeDate(rewardOrder.timestamps?.Delivered),
      createdAt: serializeDate(rewardOrder.createdAt),
      deliveryAddress: {
        label: stringValue(deliveryAddress.label),
        addressLine: stringValue(deliveryAddress.addressLine),
      },
    },
    fraud: {
      signupDeviceId: stringValue(row.referralSignupDeviceId),
      signupIpAddress: stringValue(row.referralSignupIpAddress),
      signupUserAgent: stringValue(row.referralSignupUserAgent),
    },
  };
}

function buildSummary(statusRows: Array<Record<string, any>>, totalRewardValue: number) {
  const statusCounts = {
    pending: 0,
    rewarded: 0,
    capped: 0,
    disabled: 0,
    under_review: 0,
    rejected: 0,
  };

  statusRows.forEach((row) => {
    const status = stringValue(row._id, "pending") as keyof typeof statusCounts;
    if (status in statusCounts) statusCounts[status] = numberValue(row.count);
  });

  const totalReferrals = Object.values(statusCounts).reduce(
    (sum, count) => sum + count,
    0,
  );
  const blockedReferrals =
    statusCounts.capped + statusCounts.disabled + statusCounts.rejected;

  return {
    totalReferrals,
    pendingReferrals: statusCounts.pending,
    rewardedReferrals: statusCounts.rewarded,
    underReviewReferrals: statusCounts.under_review,
    blockedReferrals,
    rewardValue: Math.round(totalRewardValue),
    conversionRate: totalReferrals
      ? Math.round((statusCounts.rewarded / totalReferrals) * 10000) / 100
      : 0,
    statusCounts,
  };
}

export async function listAdminReferrals(params: ReferralListParams = {}) {
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const basePipeline = buildBasePipeline(params);
  const statusMatch =
    params.status && params.status !== "all"
      ? [{ $match: { computedReferralStatus: params.status } } as PipelineStage]
      : [];

  const [items, countRows, statusRows, rewardRows, topReferrerRows] =
    await Promise.all([
      CustomerModel.aggregate([
        ...basePipeline,
        ...statusMatch,
        { $sort: buildSort(params.sortBy) },
        { $skip: (page - 1) * pageSize },
        { $limit: pageSize },
      ]),
      CustomerModel.aggregate([
        ...basePipeline,
        ...statusMatch,
        { $count: "count" },
      ]),
      CustomerModel.aggregate([
        ...basePipeline,
        {
          $group: {
            _id: "$computedReferralStatus",
            count: { $sum: 1 },
          },
        },
      ]),
      CustomerModel.aggregate([
        ...basePipeline,
        { $match: { computedReferralStatus: "rewarded" } },
        {
          $group: {
            _id: null,
            totalRewardValue: {
              $sum: { $ifNull: ["$rewardVoucher.discountValue", 0] },
            },
          },
        },
      ]),
      CustomerModel.aggregate([
        ...basePipeline,
        {
          $group: {
            _id: "$referrer._id",
            fullName: { $first: "$referrer.fullName" },
            phone: { $first: "$referrer.phone" },
            referralCode: { $first: "$referrer.referralCode" },
            totalReferrals: { $sum: 1 },
            rewardedReferrals: {
              $sum: {
                $cond: [{ $eq: ["$computedReferralStatus", "rewarded"] }, 1, 0],
              },
            },
            underReviewReferrals: {
              $sum: {
                $cond: [
                  { $eq: ["$computedReferralStatus", "under_review"] },
                  1,
                  0,
                ],
              },
            },
            rejectedReferrals: {
              $sum: {
                $cond: [{ $eq: ["$computedReferralStatus", "rejected"] }, 1, 0],
              },
            },
            rewardValue: {
              $sum: {
                $cond: [
                  { $eq: ["$computedReferralStatus", "rewarded"] },
                  { $ifNull: ["$rewardVoucher.discountValue", 0] },
                  0,
                ],
              },
            },
          },
        },
        { $sort: { rewardedReferrals: -1, totalReferrals: -1 } },
        { $limit: 8 },
      ]),
    ]);

  const total = numberValue(countRows[0]?.count);
  const rewardValue = numberValue(rewardRows[0]?.totalRewardValue);

  return {
    items: items.map(serializeReferralRow),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    summary: buildSummary(statusRows, rewardValue),
    topReferrers: topReferrerRows.map((row) => ({
      id: objectIdString(row._id),
      fullName: stringValue(row.fullName, "Your name"),
      phone: stringValue(row.phone),
      referralCode: stringValue(row.referralCode),
      totalReferrals: numberValue(row.totalReferrals),
      rewardedReferrals: numberValue(row.rewardedReferrals),
      underReviewReferrals: numberValue(row.underReviewReferrals),
      rejectedReferrals: numberValue(row.rejectedReferrals),
      rewardValue: Math.round(numberValue(row.rewardValue)),
    })),
  };
}

export async function getAdminReferralDetails(
  referralId: string,
  params: { zoneId?: string; districtId?: string } = {},
) {
  if (!mongoose.Types.ObjectId.isValid(referralId)) return null;

  const [row] = await CustomerModel.aggregate([
    ...buildBasePipeline({ skipDefaultDate: true, ...params }),
    { $match: { _id: new mongoose.Types.ObjectId(referralId) } },
    { $limit: 1 },
  ]);

  return row ? serializeReferralRow(row) : null;
}
