import type { PipelineStage } from "mongoose";
import mongoose from "mongoose";

import {
  CustomerModel,
  FirstOrderDiscountClaimModel,
  FirstOrderDiscountDeviceLockModel,
} from "../customer/customer.model";
import { OrderModel } from "../owner/operational.model";
import { buildCustomerServiceAreaScopeFilter } from "../service-area/service-area.service";

const CUSTOMER_COLLECTION = CustomerModel.collection.name;
const ORDER_COLLECTION = OrderModel.collection.name;
const FIRST_ORDER_CLAIMS_COLLECTION = FirstOrderDiscountClaimModel.collection.name;

type ReferralStatus =
  | "pending"
  | "rewarded"
  | "capped"
  | "disabled"
  | "under_review"
  | "rejected";

type DatePreset =
  | "today"
  | "yesterday"
  | "last7Days"
  | "last30Days"
  | "last90Days"
  | "thisMonth"
  | "lastMonth"
  | "lifetime"
  | "custom";

type ReferralListParams = {
  search?: string;
  status?: "all" | ReferralStatus;
  preset?: DatePreset;
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

type ReferralRiskDeviceStatus = "all" | "clean" | "warning" | "danger";

type ReferralRiskDeviceListParams = {
  search?: string;
  status?: ReferralRiskDeviceStatus;
  preset?: DatePreset;
  from?: string;
  to?: string;
  sortBy?: "risk" | "accounts" | "referrals" | "lastSeen";
  page?: number;
  pageSize?: number;
  zoneId?: string;
  districtId?: string;
};

type FirstOrderOfferClaimStatus = "reserved" | "confirmed" | "released";

type FirstOrderOfferListParams = {
  search?: string;
  status?: "all" | FirstOrderOfferClaimStatus;
  preset?: DatePreset;
  from?: string;
  to?: string;
  risk?: "all" | "suspicious" | "clean";
  paymentMethod?: "all" | "Cash" | "Bkash";
  sortBy?: "newest" | "oldest" | "amount" | "risk";
  page?: number;
  pageSize?: number;
  zoneId?: string;
  districtId?: string;
};

type FirstOrderOfferBaseParams = FirstOrderOfferListParams & {
  skipDefaultDate?: boolean;
};

type FirstOrderOfferDeviceStatus =
  | "all"
  | "clean"
  | "multiple_accounts"
  | "ffo_used"
  | "danger"
  | "admin_blocked";

type FirstOrderOfferDeviceListParams = {
  search?: string;
  status?: FirstOrderOfferDeviceStatus;
  claim?: "all" | "claimed" | "not_claimed";
  preset?: DatePreset;
  from?: string;
  to?: string;
  sortBy?: "lastSeen" | "claims" | "accounts" | "danger";
  page?: number;
  pageSize?: number;
  zoneId?: string;
  districtId?: string;
};

type WelcomeOfferDeviceStatus =
  | "all"
  | "available"
  | "needs_review"
  | "system_blocked"
  | "admin_blocked";

type WelcomeOfferDeviceUsedOffer = "all" | "none" | "ffo" | "referral" | "mixed";

type WelcomeOfferDeviceListParams = {
  search?: string;
  status?: WelcomeOfferDeviceStatus;
  offer?: WelcomeOfferDeviceUsedOffer;
  preset?: DatePreset;
  from?: string;
  to?: string;
  sortBy?: "lastSeen" | "risk" | "accounts" | "ffoClaims" | "referrals";
  page?: number;
  pageSize?: number;
  zoneId?: string;
  districtId?: string;
};

type DateFilterParams = {
  preset?: DatePreset;
  from?: string;
  to?: string;
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

function prefixMatchFields(value: unknown, prefix: string): unknown {
  if (Array.isArray(value)) return value.map((item) => prefixMatchFields(item, prefix));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
      if (key.startsWith("$")) return [key, prefixMatchFields(entry, prefix)];
      return [`${prefix}.${key}`, prefixMatchFields(entry, prefix)];
    }),
  );
}

function buildCustomerScopeMatch(params?: {
  zoneId?: string | null;
  districtId?: string | null;
}) {
  const scopeFilter = buildCustomerServiceAreaScopeFilter(params);
  if (!Object.keys(scopeFilter).length) return null;
  return prefixMatchFields(scopeFilter, "customer") as Record<string, unknown>;
}

function buildDateMatch(params: DateFilterParams) {
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
  } else if (params.preset === "last7Days") {
    from = new Date(now);
    from.setDate(from.getDate() - 7);
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

type ReferralRiskAccount = Record<string, any> & {
  deviceIds: string[];
  referrer?: Record<string, any> | null;
  referrerDeviceIds?: string[];
};

type ReferralRiskDeviceAccumulator = {
  deviceId: string;
  phones: Set<string>;
  accountIds: Set<string>;
  referrerIds: Set<string>;
  accounts: ReferralRiskAccount[];
  lock: Record<string, any> | null;
  activityDates: Date[];
  referralAppliedCount: number;
  refereeVoucherCount: number;
  rewardedReferralCount: number;
  underReviewCount: number;
  rejectedCount: number;
  disabledAccountCount: number;
  sameDeviceReferralCount: number;
};

function createReferralRiskDeviceAccumulator(
  deviceId: string,
): ReferralRiskDeviceAccumulator {
  return {
    deviceId,
    phones: new Set<string>(),
    accountIds: new Set<string>(),
    referrerIds: new Set<string>(),
    accounts: [],
    lock: null,
    activityDates: [],
    referralAppliedCount: 0,
    refereeVoucherCount: 0,
    rewardedReferralCount: 0,
    underReviewCount: 0,
    rejectedCount: 0,
    disabledAccountCount: 0,
    sameDeviceReferralCount: 0,
  };
}

function collectCustomerDeviceIds(account: Record<string, any>) {
  const ids = new Set<string>();
  for (const value of [
    account.lastKnownDeviceId,
    account.referralSignupDeviceId,
    ...(Array.isArray(account.pushTokens)
      ? account.pushTokens.map((token: Record<string, any>) => token?.deviceId)
      : []),
  ]) {
    const normalized = normalizeDeviceId(value);
    if (normalized) ids.add(normalized);
  }
  return [...ids];
}

function referralRiskStatus(row: {
  sameDeviceReferralCount: number;
  refereeVoucherCount: number;
  rewardedReferralCount: number;
  referralAppliedCount: number;
  accountCount: number;
  phoneCount: number;
}) {
  if (
    row.sameDeviceReferralCount > 0 ||
    row.refereeVoucherCount >= 2 ||
    row.rewardedReferralCount >= 2
  ) {
    return "danger" as const;
  }
  if (row.referralAppliedCount >= 2 || row.accountCount >= 3 || row.phoneCount >= 3) {
    return "warning" as const;
  }
  return "clean" as const;
}

function serializeReferralRiskDeviceRow(acc: ReferralRiskDeviceAccumulator) {
  const accountCount = acc.accountIds.size;
  const phoneCount = acc.phones.size;
  const lock = acc.lock ?? {};
  const manuallyBlocked = Boolean(lock.manuallyBlockedAt);
  const autoBlocked = Boolean(lock._id);
  const status = referralRiskStatus({
    sameDeviceReferralCount: acc.sameDeviceReferralCount,
    refereeVoucherCount: acc.refereeVoucherCount,
    rewardedReferralCount: acc.rewardedReferralCount,
    referralAppliedCount: acc.referralAppliedCount,
    accountCount,
    phoneCount,
  });
  const reasons: string[] = [];

  if (acc.sameDeviceReferralCount > 0) {
    reasons.push(`${acc.sameDeviceReferralCount} referral(s) where referrer and referee share this device`);
  }
  if (acc.refereeVoucherCount >= 2) {
    reasons.push(`${acc.refereeVoucherCount} referee welcome vouchers granted on this device`);
  }
  if (acc.rewardedReferralCount >= 2) {
    reasons.push(`${acc.rewardedReferralCount} rewarded referrals tied to accounts on this device`);
  }
  if (acc.referralAppliedCount >= 2) {
    reasons.push(`${acc.referralAppliedCount} referral codes applied from this device`);
  }
  if (accountCount >= 3) {
    reasons.push(`${accountCount} accounts connected to this device`);
  }
  if (phoneCount >= 3) {
    reasons.push(`${phoneCount} phone numbers used on this device`);
  }
  if (acc.disabledAccountCount > 0) {
    reasons.push(`${acc.disabledAccountCount} connected account(s) already have referrals disabled`);
  }
  if (manuallyBlocked) {
    reasons.push("Admin manually blocked this device from future welcome offers");
  } else if (autoBlocked) {
    reasons.push("This device has a permanent welcome-offer lock");
  }

  const firstSeen = earliestDate(...acc.activityDates);
  const lastSeen = latestDate(...acc.activityDates);

  return {
    deviceId: acc.deviceId,
    status,
    danger: status === "danger",
    warning: status === "warning",
    firstSeen: serializeDate(firstSeen),
    lastSeen: serializeDate(lastSeen),
    accountCount,
    phoneCount,
    referralAppliedCount: acc.referralAppliedCount,
    distinctReferrerCount: acc.referrerIds.size,
    refereeVoucherCount: acc.refereeVoucherCount,
    rewardedReferralCount: acc.rewardedReferralCount,
    underReviewCount: acc.underReviewCount,
    rejectedCount: acc.rejectedCount,
    disabledAccountCount: acc.disabledAccountCount,
    sameDeviceReferralCount: acc.sameDeviceReferralCount,
    autoBlocked,
    manuallyBlocked,
    block: {
      locked: autoBlocked,
      source: stringValue(lock.source),
      reason: stringValue(lock.reason),
      note: stringValue(lock.note),
      manuallyBlockedAt: serializeDate(lock.manuallyBlockedAt),
      blockedBy: objectIdString(lock.manuallyBlockedBy),
      createdAt: serializeDate(lock.createdAt),
    },
    phones: [...acc.phones],
    reasons,
  };
}

function referralRiskMatchesSearch(
  acc: ReferralRiskDeviceAccumulator,
  search?: string,
) {
  if (!search?.trim()) return true;
  const needle = search.trim().toLowerCase();
  const haystack = [
    acc.deviceId,
    ...acc.phones,
    ...acc.accounts.flatMap((account) => [
      account.fullName,
      account.phone,
      account.referralCode,
      account.referrer?.fullName,
      account.referrer?.phone,
      account.referrer?.referralCode,
      objectIdString(account._id),
      objectIdString(account.referredByCustomerId),
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function referralRiskMatchesDate(
  acc: ReferralRiskDeviceAccumulator,
  dateMatch: Record<string, Date> | null,
) {
  if (!dateMatch) return true;
  return acc.activityDates.some((date) => dateMatches(date, dateMatch));
}

function referralRiskMatchesFilters(
  row: ReturnType<typeof serializeReferralRiskDeviceRow>,
  params: ReferralRiskDeviceListParams,
) {
  if (params.status && params.status !== "all" && row.status !== params.status) {
    return false;
  }
  return true;
}

function sortReferralRiskDevices(
  rows: Array<ReturnType<typeof serializeReferralRiskDeviceRow>>,
  sortBy?: ReferralRiskDeviceListParams["sortBy"],
) {
  return rows.sort((a, b) => {
    if (sortBy === "accounts") {
      return b.accountCount - a.accountCount || b.phoneCount - a.phoneCount;
    }
    if (sortBy === "referrals") {
      return b.referralAppliedCount - a.referralAppliedCount || b.rewardedReferralCount - a.rewardedReferralCount;
    }
    if (sortBy === "lastSeen") {
      const aTime = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
      const bTime = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
      return bTime - aTime;
    }
    return (
      Number(b.manuallyBlocked) - Number(a.manuallyBlocked) ||
      Number(b.danger) - Number(a.danger) ||
      Number(b.warning) - Number(a.warning) ||
      b.sameDeviceReferralCount - a.sameDeviceReferralCount ||
      b.refereeVoucherCount - a.refereeVoucherCount ||
      b.referralAppliedCount - a.referralAppliedCount
    );
  });
}

async function buildReferralRiskDeviceAccumulators(
  params: Pick<ReferralRiskDeviceListParams, "zoneId" | "districtId"> = {},
) {
  const [customers, lockRows] = await Promise.all([
    CustomerModel.find(buildCustomerServiceAreaScopeFilter(params))
      .select(
        "_id fullName phone status createdAt lastKnownDeviceId referralSignupDeviceId pushTokens referralCode referredByCustomerId referredAt referralRewardedAt referralRewardStatus referralRewardSkippedAt refereeRewardGrantedAt referralDisabledByAdmin",
      )
      .lean<Record<string, any>[]>(),
    FirstOrderDiscountDeviceLockModel.find({}).lean<Record<string, any>[]>(),
  ]);
  const byId = new Map(customers.map((customer) => [objectIdString(customer._id), customer]));
  const deviceIdsByCustomerId = new Map<string, string[]>();
  for (const customer of customers) {
    deviceIdsByCustomerId.set(objectIdString(customer._id), collectCustomerDeviceIds(customer));
  }

  const devices = new Map<string, ReferralRiskDeviceAccumulator>();
  const ensure = (deviceId: string) => {
    const normalized = normalizeDeviceId(deviceId);
    if (!normalized) return null;
    if (!devices.has(normalized)) {
      devices.set(normalized, createReferralRiskDeviceAccumulator(normalized));
    }
    return devices.get(normalized) ?? null;
  };

  for (const customer of customers) {
    const customerId = objectIdString(customer._id);
    const deviceIds = deviceIdsByCustomerId.get(customerId) ?? [];
    const referrerId = objectIdString(customer.referredByCustomerId);
    const referrer = referrerId ? byId.get(referrerId) ?? null : null;
    const referrerDeviceIds = referrer
      ? deviceIdsByCustomerId.get(objectIdString(referrer._id)) ?? []
      : [];
    const isSameDeviceReferral =
      referrerDeviceIds.length > 0 &&
      deviceIds.some((deviceId) => referrerDeviceIds.includes(deviceId));

    for (const deviceId of deviceIds) {
      const acc = ensure(deviceId);
      if (!acc) continue;
      if (!acc.accountIds.has(customerId)) {
        acc.accountIds.add(customerId);
        acc.accounts.push({
          ...customer,
          deviceIds,
          referrer,
          referrerDeviceIds,
          isSameDeviceReferral,
        });
      }
      const phone = stringValue(customer.phone).trim();
      if (phone) acc.phones.add(phone);
      if (referrerId) {
        acc.referrerIds.add(referrerId);
        acc.referralAppliedCount += 1;
      }
      if (customer.refereeRewardGrantedAt) acc.refereeVoucherCount += 1;
      if (customer.referralRewardedAt) acc.rewardedReferralCount += 1;
      if (customer.referralRewardStatus === "under_review") acc.underReviewCount += 1;
      if (customer.referralRewardStatus === "rejected") acc.rejectedCount += 1;
      if (customer.referralDisabledByAdmin) acc.disabledAccountCount += 1;
      if (isSameDeviceReferral) acc.sameDeviceReferralCount += 1;
      for (const value of [
        customer.createdAt,
        customer.referredAt,
        customer.referralRewardedAt,
        customer.refereeRewardGrantedAt,
        customer.referralRewardSkippedAt,
      ]) {
        const date = compactDateValue(value);
        if (date) acc.activityDates.push(date);
      }
    }
  }

  for (const lock of lockRows) {
    const acc = ensure(lock.deviceId);
    if (!acc) continue;
    acc.lock = lock;
    const createdAt = compactDateValue(lock.createdAt);
    if (createdAt) acc.activityDates.push(createdAt);
    const updatedAt = compactDateValue(lock.updatedAt);
    if (updatedAt) acc.activityDates.push(updatedAt);
    const phone = stringValue(lock.phone).trim();
    if (phone) acc.phones.add(phone);
  }

  return [...devices.values()];
}

function buildReferralRiskSummary(
  rows: Array<ReturnType<typeof serializeReferralRiskDeviceRow>>,
) {
  return {
    totalDevices: rows.length,
    dangerDevices: rows.filter((row) => row.danger).length,
    warningDevices: rows.filter((row) => row.warning).length,
    cleanDevices: rows.filter((row) => row.status === "clean").length,
    sameDeviceReferrals: rows.reduce((total, row) => total + row.sameDeviceReferralCount, 0),
    refereeVoucherDevices: rows.filter((row) => row.refereeVoucherCount > 0).length,
    disabledAccounts: rows.reduce((total, row) => total + row.disabledAccountCount, 0),
    lockedDevices: rows.filter((row) => row.autoBlocked).length,
    adminBlockedDevices: rows.filter((row) => row.manuallyBlocked).length,
  };
}

function serializeReferralRiskDeviceDetails(acc: ReferralRiskDeviceAccumulator) {
  const row = serializeReferralRiskDeviceRow(acc);
  const accounts = acc.accounts
    .sort((a, b) => {
      const aTime = compactDateValue(a.createdAt)?.getTime() ?? 0;
      const bTime = compactDateValue(b.createdAt)?.getTime() ?? 0;
      return bTime - aTime;
    })
    .map((account) => ({
      id: objectIdString(account._id),
      fullName: stringValue(account.fullName, "Customer"),
      phone: stringValue(account.phone),
      status: stringValue(account.status),
      referralCode: stringValue(account.referralCode),
      joinedAt: serializeDate(account.createdAt),
      appliedReferral: Boolean(account.referredByCustomerId),
      referredAt: serializeDate(account.referredAt),
      referralRewardStatus: account.referralRewardedAt
        ? "rewarded"
        : stringValue(account.referralRewardStatus, "pending"),
      referralRewardedAt: serializeDate(account.referralRewardedAt),
      gotRefereeVoucher: Boolean(account.refereeRewardGrantedAt),
      refereeRewardGrantedAt: serializeDate(account.refereeRewardGrantedAt),
      referralDisabledByAdmin: Boolean(account.referralDisabledByAdmin),
      sameDeviceReferral: Boolean(account.isSameDeviceReferral),
      referrer: account.referrer
        ? {
            id: objectIdString(account.referrer._id),
            fullName: stringValue(account.referrer.fullName, "Customer"),
            phone: stringValue(account.referrer.phone),
            referralCode: stringValue(account.referrer.referralCode),
            sharesDevice: Boolean(account.isSameDeviceReferral),
          }
        : null,
    }));

  const referrerMap = new Map<string, {
    id: string;
    fullName: string;
    phone: string;
    referralCode: string;
    referredCount: number;
    rewardedCount: number;
    sameDeviceCount: number;
  }>();
  for (const account of acc.accounts) {
    if (!account.referrer) continue;
    const id = objectIdString(account.referrer._id);
    if (!id) continue;
    if (!referrerMap.has(id)) {
      referrerMap.set(id, {
        id,
        fullName: stringValue(account.referrer.fullName, "Customer"),
        phone: stringValue(account.referrer.phone),
        referralCode: stringValue(account.referrer.referralCode),
        referredCount: 0,
        rewardedCount: 0,
        sameDeviceCount: 0,
      });
    }
    const referrer = referrerMap.get(id);
    if (!referrer) continue;
    referrer.referredCount += 1;
    if (account.referralRewardedAt) referrer.rewardedCount += 1;
    if (account.isSameDeviceReferral) referrer.sameDeviceCount += 1;
  }

  return {
    ...row,
    accounts,
    referrers: [...referrerMap.values()].sort(
      (a, b) => b.sameDeviceCount - a.sameDeviceCount || b.referredCount - a.referredCount,
    ),
  };
}

function buildFirstOrderOfferSort(sortBy?: FirstOrderOfferListParams["sortBy"]) {
  const sort: Record<string, 1 | -1> = {};
  if (sortBy === "oldest") {
    sort.createdAt = 1;
    sort._id = 1;
    return sort;
  }
  if (sortBy === "amount") {
    sort.amount = -1;
    sort.createdAt = -1;
    return sort;
  }
  if (sortBy === "risk") {
    sort.riskScore = -1;
    sort.createdAt = -1;
    return sort;
  }
  sort.createdAt = -1;
  sort._id = -1;
  return sort;
}

function buildFirstOrderOfferBasePipeline(
  params: FirstOrderOfferBaseParams,
): PipelineStage[] {
  const match: Record<string, unknown> = {};
  const dateMatch = buildDateMatch(params);
  if (dateMatch) match.createdAt = dateMatch;

  const pipeline: PipelineStage[] = [
    { $match: match },
    {
      $lookup: {
        from: CUSTOMER_COLLECTION,
        localField: "customerId",
        foreignField: "_id",
        as: "customerDocs",
      },
    },
    {
      $lookup: {
        from: ORDER_COLLECTION,
        localField: "orderId",
        foreignField: "_id",
        as: "orderDocs",
      },
    },
    {
      $addFields: {
        customer: { $arrayElemAt: ["$customerDocs", 0] },
        order: { $arrayElemAt: ["$orderDocs", 0] },
      },
    },
  ];

  const scopeMatch = buildCustomerScopeMatch(params);
  if (scopeMatch) pipeline.push({ $match: scopeMatch });

  if (params.paymentMethod && params.paymentMethod !== "all") {
    pipeline.push({ $match: { "order.paymentMethod": params.paymentMethod } });
  }

  if (params.search?.trim()) {
    const pattern = escapeRegex(params.search.trim());
    pipeline.push({
      $match: {
        $or: [
          { "customer.fullName": { $regex: pattern, $options: "i" } },
          { "customer.phone": { $regex: pattern, $options: "i" } },
          { "order.orderNumber": { $regex: pattern, $options: "i" } },
          { deviceId: { $regex: pattern, $options: "i" } },
          { phone: { $regex: pattern, $options: "i" } },
          { walletNumber: { $regex: pattern, $options: "i" } },
          { ipAddress: { $regex: pattern, $options: "i" } },
          { addressFingerprint: { $regex: pattern, $options: "i" } },
        ],
      },
    });
  }

  pipeline.push(
    {
      $lookup: {
        from: FIRST_ORDER_CLAIMS_COLLECTION,
        let: { deviceId: "$deviceId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $gt: [{ $strLenCP: { $ifNull: ["$$deviceId", ""] } }, 0] },
                  { $eq: ["$deviceId", "$$deviceId"] },
                ],
              },
            },
          },
          {
            $group: {
              _id: "$deviceId",
              claimCount: { $sum: 1 },
              confirmedCount: {
                $sum: { $cond: [{ $eq: ["$status", "confirmed"] }, 1, 0] },
              },
              releasedCount: {
                $sum: { $cond: [{ $eq: ["$status", "released"] }, 1, 0] },
              },
              reservedCount: {
                $sum: { $cond: [{ $eq: ["$status", "reserved"] }, 1, 0] },
              },
              phones: { $addToSet: "$phone" },
              customerIds: { $addToSet: "$customerId" },
              totalAmount: { $sum: { $ifNull: ["$amount", 0] } },
            },
          },
        ],
        as: "deviceClaimStatsRows",
      },
    },
    {
      $lookup: {
        from: CUSTOMER_COLLECTION,
        let: { deviceId: "$deviceId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $gt: [{ $strLenCP: { $ifNull: ["$$deviceId", ""] } }, 0] },
                  {
                    $or: [
                      { $eq: ["$lastKnownDeviceId", "$$deviceId"] },
                      { $eq: ["$referralSignupDeviceId", "$$deviceId"] },
                    ],
                  },
                ],
              },
            },
          },
          { $sort: { createdAt: -1 } },
          {
            $project: {
              _id: 1,
              fullName: 1,
              phone: 1,
              createdAt: 1,
              referredByCustomerId: 1,
              refereeRewardGrantedAt: 1,
              firstOrderDiscountRedeemedAt: 1,
              referralDisabledByAdmin: 1,
            },
          },
          { $limit: 20 },
        ],
        as: "deviceAccounts",
      },
    },
    {
      $addFields: {
        deviceClaimStats: {
          $ifNull: [
            { $arrayElemAt: ["$deviceClaimStatsRows", 0] },
            {
              claimCount: 0,
              confirmedCount: 0,
              releasedCount: 0,
              reservedCount: 0,
              phones: [],
              customerIds: [],
              totalAmount: 0,
            },
          ],
        },
        deviceAccountPhones: {
          $map: {
            input: "$deviceAccounts",
            as: "account",
            in: { $ifNull: ["$$account.phone", ""] },
          },
        },
      },
    },
    {
      $addFields: {
        devicePhones: {
          $filter: {
            input: {
              $setUnion: [
                { $ifNull: ["$deviceClaimStats.phones", []] },
                { $ifNull: ["$deviceAccountPhones", []] },
              ],
            },
            as: "phone",
            cond: { $gt: [{ $strLenCP: { $ifNull: ["$$phone", ""] } }, 0] },
          },
        },
      },
    },
    {
      $addFields: {
        distinctPhoneCount: { $size: "$devicePhones" },
        deviceAccountCount: { $size: "$deviceAccounts" },
        deviceClaimCount: { $ifNull: ["$deviceClaimStats.claimCount", 0] },
        confirmedClaimCount: { $ifNull: ["$deviceClaimStats.confirmedCount", 0] },
        releasedClaimCount: { $ifNull: ["$deviceClaimStats.releasedCount", 0] },
        reservedClaimCount: { $ifNull: ["$deviceClaimStats.reservedCount", 0] },
        firstOrderRedeemedAccountCount: {
          $size: {
            $filter: {
              input: "$deviceAccounts",
              as: "account",
              cond: { $ifNull: ["$$account.firstOrderDiscountRedeemedAt", false] },
            },
          },
        },
        refereeVoucherAccountCount: {
          $size: {
            $filter: {
              input: "$deviceAccounts",
              as: "account",
              cond: { $ifNull: ["$$account.refereeRewardGrantedAt", false] },
            },
          },
        },
      },
    },
    {
      $addFields: {
        suspicious: {
          $and: [
            { $gt: [{ $strLenCP: { $ifNull: ["$deviceId", ""] } }, 0] },
            {
              $or: [
                { $gte: ["$distinctPhoneCount", 2] },
                { $gte: ["$deviceClaimCount", 3] },
                { $gte: ["$firstOrderRedeemedAccountCount", 2] },
                {
                  $and: [
                    { $gte: ["$confirmedClaimCount", 1] },
                    { $gte: ["$refereeVoucherAccountCount", 1] },
                  ],
                },
              ],
            },
          ],
        },
      },
    },
    {
      $addFields: {
        riskScore: {
          $add: [
            { $cond: ["$suspicious", 80, 0] },
            { $multiply: ["$distinctPhoneCount", 10] },
            { $multiply: ["$deviceClaimCount", 3] },
            { $multiply: ["$confirmedClaimCount", 8] },
            { $multiply: ["$releasedClaimCount", 2] },
          ],
        },
      },
    },
  );

  if (params.risk === "suspicious") {
    pipeline.push({ $match: { suspicious: true } });
  } else if (params.risk === "clean") {
    pipeline.push({ $match: { suspicious: { $ne: true } } });
  }

  return pipeline;
}

function serializeFirstOrderOfferClaimRow(row: Record<string, any>) {
  const customer = row.customer ?? {};
  const order = row.order ?? {};
  const deliveryAddress =
    order.customerSnapshot?.deliveryAddress ?? order.deliveryAddress ?? {};
  const deviceAccounts = Array.isArray(row.deviceAccounts)
    ? row.deviceAccounts
    : [];
  const reasons: string[] = [];

  if (numberValue(row.distinctPhoneCount) >= 2) {
    reasons.push(`${numberValue(row.distinctPhoneCount)} phone numbers used on this device`);
  }
  if (numberValue(row.deviceClaimCount) >= 3) {
    reasons.push(`${numberValue(row.deviceClaimCount)} first-order claim attempts on this device`);
  }
  if (numberValue(row.firstOrderRedeemedAccountCount) >= 2) {
    reasons.push(
      `${numberValue(row.firstOrderRedeemedAccountCount)} first-order discounts redeemed on this device`,
    );
  }
  if (
    numberValue(row.confirmedClaimCount) >= 1 &&
    numberValue(row.refereeVoucherAccountCount) >= 1
  ) {
    reasons.push("Device has both referral welcome and first-order offer activity");
  }

  return {
    id: objectIdString(row._id),
    status: stringValue(row.status, "reserved") as FirstOrderOfferClaimStatus,
    claimedAt: serializeDate(row.createdAt),
    updatedAt: serializeDate(row.updatedAt),
    releasedAt: serializeDate(row.releasedAt),
    releasedReason: stringValue(row.releasedReason),
    amount: numberValue(row.amount),
    customer: {
      id: objectIdString(row.customerId ?? customer._id),
      fullName: stringValue(customer.fullName, "Customer"),
      phone: stringValue(customer.phone),
      status: stringValue(customer.status),
      createdAt: serializeDate(customer.createdAt),
      firstOrderDiscountRedeemedAt: serializeDate(customer.firstOrderDiscountRedeemedAt),
      referralDisabledByAdmin: Boolean(customer.referralDisabledByAdmin),
    },
    order: {
      id: objectIdString(row.orderId ?? order._id),
      orderNumber: stringValue(order.orderNumber),
      status: stringValue(order.status),
      paymentMethod: stringValue(order.paymentMethod),
      paymentStatus: stringValue(order.paymentStatus),
      total: numberValue(order.pricing?.total),
      firstOrderDiscountAmount: numberValue(order.pricing?.firstOrderDiscountAmount),
      createdAt: serializeDate(order.createdAt),
      deliveredAt: serializeDate(order.timestamps?.Delivered ?? order.timestamps?.deliveredAt),
      deliveryAddress: {
        label: stringValue(deliveryAddress.label),
        addressLine: stringValue(deliveryAddress.addressLine ?? deliveryAddress.address),
      },
    },
    fingerprints: {
      deviceId: stringValue(row.deviceId),
      phone: stringValue(row.phone),
      walletNumber: stringValue(row.walletNumber),
      ipAddress: stringValue(row.ipAddress),
      addressFingerprint: stringValue(row.addressFingerprint),
    },
    risk: {
      suspicious: Boolean(row.suspicious),
      score: numberValue(row.riskScore),
      reasons,
      deviceAccountCount: numberValue(row.deviceAccountCount),
      deviceClaimCount: numberValue(row.deviceClaimCount),
      distinctPhoneCount: numberValue(row.distinctPhoneCount),
      confirmedClaimCount: numberValue(row.confirmedClaimCount),
      releasedClaimCount: numberValue(row.releasedClaimCount),
      reservedClaimCount: numberValue(row.reservedClaimCount),
      firstOrderRedeemedAccountCount: numberValue(row.firstOrderRedeemedAccountCount),
      refereeVoucherAccountCount: numberValue(row.refereeVoucherAccountCount),
      accounts: deviceAccounts.map((account: Record<string, any>) => ({
        id: objectIdString(account._id),
        fullName: stringValue(account.fullName, "Customer"),
        phone: stringValue(account.phone),
        joinedAt: serializeDate(account.createdAt),
        appliedReferral: Boolean(account.referredByCustomerId),
        gotRefereeVoucher: Boolean(account.refereeRewardGrantedAt),
        redeemedFirstOrder: Boolean(account.firstOrderDiscountRedeemedAt),
        referralDisabledByAdmin: Boolean(account.referralDisabledByAdmin),
        isCurrent: objectIdString(account._id) === objectIdString(row.customerId),
      })),
    },
  };
}

function buildFirstOrderOfferSummary(
  statusRows: Array<Record<string, any>>,
  totalDiscountAmount: number,
  totalClaims: number,
  suspiciousClaims: number,
) {
  const statusCounts = {
    reserved: 0,
    confirmed: 0,
    released: 0,
  };

  statusRows.forEach((row) => {
    const status = stringValue(row._id, "reserved") as keyof typeof statusCounts;
    if (status in statusCounts) statusCounts[status] = numberValue(row.count);
  });

  return {
    totalClaims,
    reservedClaims: statusCounts.reserved,
    confirmedClaims: statusCounts.confirmed,
    releasedClaims: statusCounts.released,
    suspiciousClaims,
    totalDiscountAmount: Math.round(totalDiscountAmount),
    statusCounts,
  };
}

function serializeFirstOrderOfferTopDevice(row: Record<string, any>) {
  return {
    deviceId: stringValue(row._id),
    claimCount: numberValue(row.claimCount),
    distinctPhoneCount: numberValue(row.distinctPhoneCount),
    confirmedClaimCount: numberValue(row.confirmedClaimCount),
    releasedClaimCount: numberValue(row.releasedClaimCount),
    riskScore: numberValue(row.riskScore),
    totalAmount: Math.round(numberValue(row.totalAmount)),
  };
}

function normalizeDeviceId(value: unknown) {
  return String(value ?? "").trim();
}

function compactDateValue(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateMatches(date: Date | null, dateMatch: Record<string, Date> | null) {
  if (!dateMatch) return true;
  if (!date) return false;
  if (dateMatch.$gte && date < dateMatch.$gte) return false;
  if (dateMatch.$lte && date > dateMatch.$lte) return false;
  return true;
}

function latestDate(...values: Array<Date | null>) {
  const dates = values.filter((value): value is Date => Boolean(value));
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function earliestDate(...values: Array<Date | null>) {
  const dates = values.filter((value): value is Date => Boolean(value));
  if (!dates.length) return null;
  return new Date(Math.min(...dates.map((date) => date.getTime())));
}

type FirstOrderDeviceAccumulator = {
  deviceId: string;
  phones: Set<string>;
  accountIds: Set<string>;
  accounts: Array<Record<string, any>>;
  claims: Array<Record<string, any>>;
  lock: Record<string, any> | null;
  activityDates: Date[];
  totalAmount: number;
  confirmedClaimCount: number;
  releasedClaimCount: number;
  reservedClaimCount: number;
};

function createFirstOrderDeviceAccumulator(deviceId: string): FirstOrderDeviceAccumulator {
  return {
    deviceId,
    phones: new Set<string>(),
    accountIds: new Set<string>(),
    accounts: [],
    claims: [],
    lock: null,
    activityDates: [],
    totalAmount: 0,
    confirmedClaimCount: 0,
    releasedClaimCount: 0,
    reservedClaimCount: 0,
  };
}

function firstOrderDeviceStatus(row: {
  claimCount: number;
  accountCount: number;
  phoneCount: number;
  manuallyBlocked: boolean;
}) {
  if (row.manuallyBlocked) return "admin_blocked";
  if (row.claimCount >= 2) return "danger";
  if (row.claimCount >= 1) return "ffo_used";
  if (row.accountCount >= 2 || row.phoneCount >= 2) return "multiple_accounts";
  return "clean";
}

function serializeFirstOrderDeviceRow(acc: FirstOrderDeviceAccumulator) {
  const claimCount = acc.claims.length;
  const phoneCount = acc.phones.size;
  const accountCount = acc.accountIds.size;
  const lock = acc.lock ?? {};
  const manuallyBlocked = Boolean(lock.manuallyBlockedAt);
  const autoBlocked = Boolean(lock._id);
  const firstSeen = earliestDate(...acc.activityDates);
  const lastSeen = latestDate(...acc.activityDates);
  const status = firstOrderDeviceStatus({
    claimCount,
    accountCount,
    phoneCount,
    manuallyBlocked,
  });
  const reasons: string[] = [];

  if (claimCount >= 2) {
    reasons.push(`${claimCount} FFO claims used from this device`);
  }
  if (accountCount >= 2) {
    reasons.push(`${accountCount} customer accounts connected to this device`);
  }
  if (phoneCount >= 2) {
    reasons.push(`${phoneCount} phone numbers used on this device`);
  }
  if (manuallyBlocked) {
    reasons.push("Admin manually blocked this device from future FFO claims");
  }

  return {
    deviceId: acc.deviceId,
    status,
    firstSeen: serializeDate(firstSeen),
    lastSeen: serializeDate(lastSeen),
    phoneCount,
    accountCount,
    claimCount,
    confirmedClaimCount: acc.confirmedClaimCount,
    releasedClaimCount: acc.releasedClaimCount,
    reservedClaimCount: acc.reservedClaimCount,
    totalAmount: Math.round(acc.totalAmount),
    danger: claimCount >= 2,
    multipleAccounts: accountCount >= 2 || phoneCount >= 2,
    autoBlocked,
    manuallyBlocked,
    block: {
      locked: autoBlocked,
      source: stringValue(lock.source),
      reason: stringValue(lock.reason),
      note: stringValue(lock.note),
      manuallyBlockedAt: serializeDate(lock.manuallyBlockedAt),
      blockedBy: objectIdString(lock.manuallyBlockedBy),
      createdAt: serializeDate(lock.createdAt),
    },
    phones: [...acc.phones],
    reasons,
  };
}

function firstOrderDeviceMatchesSearch(
  acc: FirstOrderDeviceAccumulator,
  search?: string,
) {
  if (!search?.trim()) return true;
  const needle = search.trim().toLowerCase();
  const haystack = [
    acc.deviceId,
    ...acc.phones,
    ...acc.accounts.flatMap((account) => [
      account.fullName,
      account.phone,
      objectIdString(account._id),
    ]),
    ...acc.claims.flatMap((claim) => [
      claim.phone,
      claim.walletNumber,
      claim.ipAddress,
      claim.addressFingerprint,
      claim.order?.orderNumber,
      claim.customer?.fullName,
      claim.customer?.phone,
      objectIdString(claim.customerId),
    ]),
    acc.lock?.reason,
    acc.lock?.note,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function firstOrderDeviceMatchesDate(
  acc: FirstOrderDeviceAccumulator,
  dateMatch: Record<string, Date> | null,
) {
  if (!dateMatch) return true;
  return acc.activityDates.some((date) => dateMatches(date, dateMatch));
}

function firstOrderDeviceMatchesFilters(
  row: ReturnType<typeof serializeFirstOrderDeviceRow>,
  params: FirstOrderOfferDeviceListParams,
) {
  if (params.status && params.status !== "all" && row.status !== params.status) {
    return false;
  }
  if (params.claim === "claimed" && row.claimCount <= 0) return false;
  if (params.claim === "not_claimed" && row.claimCount > 0) return false;
  return true;
}

function sortFirstOrderDevices(
  rows: Array<ReturnType<typeof serializeFirstOrderDeviceRow>>,
  sortBy?: FirstOrderOfferDeviceListParams["sortBy"],
) {
  return rows.sort((a, b) => {
    if (sortBy === "claims") {
      return b.claimCount - a.claimCount || b.totalAmount - a.totalAmount;
    }
    if (sortBy === "accounts") {
      return b.accountCount - a.accountCount || b.phoneCount - a.phoneCount;
    }
    if (sortBy === "danger") {
      return Number(b.danger) - Number(a.danger) || b.claimCount - a.claimCount;
    }
    const aTime = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
    const bTime = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
    return bTime - aTime;
  });
}

async function buildFirstOrderDeviceAccumulators(
  params: Pick<FirstOrderOfferDeviceListParams, "zoneId" | "districtId"> = {},
) {
  const scopeFilter = buildCustomerServiceAreaScopeFilter(params);
  const scopeMatch = buildCustomerScopeMatch(params);
  const [accountRows, claimRows, lockRows] = await Promise.all([
    CustomerModel.aggregate([
      { $match: scopeFilter },
      {
        $project: {
          _id: 1,
          fullName: 1,
          phone: 1,
          status: 1,
          createdAt: 1,
          referredByCustomerId: 1,
          refereeRewardGrantedAt: 1,
          firstOrderDiscountRedeemedAt: 1,
          referralDisabledByAdmin: 1,
          deviceIds: {
            $setUnion: [
              {
                $cond: [
                  { $gt: [{ $strLenCP: { $ifNull: ["$lastKnownDeviceId", ""] } }, 0] },
                  ["$lastKnownDeviceId"],
                  [],
                ],
              },
              {
                $cond: [
                  {
                    $gt: [
                      { $strLenCP: { $ifNull: ["$referralSignupDeviceId", ""] } },
                      0,
                    ],
                  },
                  ["$referralSignupDeviceId"],
                  [],
                ],
              },
            ],
          },
        },
      },
      { $unwind: "$deviceIds" },
      { $match: { deviceIds: { $ne: "" } } },
    ]),
    FirstOrderDiscountClaimModel.aggregate([
      {
        $lookup: {
          from: CUSTOMER_COLLECTION,
          localField: "customerId",
          foreignField: "_id",
          as: "customerDocs",
        },
      },
      {
        $lookup: {
          from: ORDER_COLLECTION,
          localField: "orderId",
          foreignField: "_id",
          as: "orderDocs",
        },
      },
      {
        $addFields: {
          customer: { $arrayElemAt: ["$customerDocs", 0] },
          order: { $arrayElemAt: ["$orderDocs", 0] },
        },
      },
      ...(scopeMatch ? [{ $match: scopeMatch } as PipelineStage] : []),
    ]),
    FirstOrderDiscountDeviceLockModel.find({}).lean<Record<string, any>[]>(),
  ]);

  const devices = new Map<string, FirstOrderDeviceAccumulator>();
  const ensure = (deviceId: string) => {
    const normalized = normalizeDeviceId(deviceId);
    if (!normalized) return null;
    if (!devices.has(normalized)) {
      devices.set(normalized, createFirstOrderDeviceAccumulator(normalized));
    }
    return devices.get(normalized) ?? null;
  };

  for (const account of accountRows) {
    const acc = ensure(account.deviceIds);
    if (!acc) continue;
    const accountId = objectIdString(account._id);
    if (!acc.accountIds.has(accountId)) {
      acc.accountIds.add(accountId);
      acc.accounts.push(account);
    }
    const phone = stringValue(account.phone).trim();
    if (phone) acc.phones.add(phone);
    const createdAt = compactDateValue(account.createdAt);
    if (createdAt) acc.activityDates.push(createdAt);
  }

  for (const claim of claimRows) {
    const acc = ensure(claim.deviceId);
    if (!acc) continue;
    acc.claims.push(claim);
    const accountId = objectIdString(claim.customerId);
    if (accountId) acc.accountIds.add(accountId);
    const phone = stringValue(claim.phone || claim.customer?.phone).trim();
    if (phone) acc.phones.add(phone);
    acc.totalAmount += numberValue(claim.amount);
    if (claim.status === "confirmed") acc.confirmedClaimCount += 1;
    else if (claim.status === "released") acc.releasedClaimCount += 1;
    else acc.reservedClaimCount += 1;
    const createdAt = compactDateValue(claim.createdAt);
    if (createdAt) acc.activityDates.push(createdAt);
    const updatedAt = compactDateValue(claim.updatedAt);
    if (updatedAt) acc.activityDates.push(updatedAt);
  }

  for (const lock of lockRows) {
    const acc = ensure(lock.deviceId);
    if (!acc) continue;
    acc.lock = lock;
    const createdAt = compactDateValue(lock.createdAt);
    if (createdAt) acc.activityDates.push(createdAt);
    const updatedAt = compactDateValue(lock.updatedAt);
    if (updatedAt) acc.activityDates.push(updatedAt);
  }

  return [...devices.values()];
}

function buildFirstOrderDeviceSummary(
  rows: Array<ReturnType<typeof serializeFirstOrderDeviceRow>>,
) {
  const claimedDevices = rows.filter((row) => row.claimCount > 0).length;
  const dangerDevices = rows.filter((row) => row.danger).length;
  const multipleAccountDevices = rows.filter((row) => row.multipleAccounts).length;
  const adminBlockedDevices = rows.filter((row) => row.manuallyBlocked).length;
  return {
    totalDevices: rows.length,
    claimedDevices,
    cleanDevices: rows.filter((row) => row.status === "clean").length,
    dangerDevices,
    multipleAccountDevices,
    adminBlockedDevices,
    totalClaims: rows.reduce((total, row) => total + row.claimCount, 0),
    totalDiscountAmount: rows.reduce((total, row) => total + row.totalAmount, 0),
  };
}

function serializeFirstOrderDeviceDetails(
  acc: FirstOrderDeviceAccumulator,
) {
  const row = serializeFirstOrderDeviceRow(acc);
  const claimsByCustomerId = new Map<string, number>();
  for (const claim of acc.claims) {
    const id = objectIdString(claim.customerId);
    if (!id) continue;
    claimsByCustomerId.set(id, (claimsByCustomerId.get(id) ?? 0) + 1);
  }

  const accounts = acc.accounts
    .sort((a, b) => {
      const aTime = compactDateValue(a.createdAt)?.getTime() ?? 0;
      const bTime = compactDateValue(b.createdAt)?.getTime() ?? 0;
      return bTime - aTime;
    })
    .map((account) => {
      const id = objectIdString(account._id);
      const claimCount = claimsByCustomerId.get(id) ?? 0;
      return {
        id,
        fullName: stringValue(account.fullName, "Customer"),
        phone: stringValue(account.phone),
        status: stringValue(account.status),
        joinedAt: serializeDate(account.createdAt),
        appliedReferral: Boolean(account.referredByCustomerId),
        gotRefereeVoucher: Boolean(account.refereeRewardGrantedAt),
        ffoClaimed: claimCount > 0 || Boolean(account.firstOrderDiscountRedeemedAt),
        ffoClaimCount: claimCount,
        firstOrderDiscountRedeemedAt: serializeDate(account.firstOrderDiscountRedeemedAt),
        referralDisabledByAdmin: Boolean(account.referralDisabledByAdmin),
      };
    });

  const claims = acc.claims
    .sort((a, b) => {
      const aTime = compactDateValue(a.createdAt)?.getTime() ?? 0;
      const bTime = compactDateValue(b.createdAt)?.getTime() ?? 0;
      return bTime - aTime;
    })
    .map(serializeFirstOrderOfferClaimRow);

  return {
    ...row,
    accounts,
    claims,
  };
}

type FirstOrderDeviceRow = ReturnType<typeof serializeFirstOrderDeviceRow>;
type ReferralRiskDeviceRow = ReturnType<typeof serializeReferralRiskDeviceRow>;

function welcomeUsedOffer(row: {
  ffoClaimCount: number;
  referralAppliedCount: number;
  referralWelcomeCount: number;
}) {
  const usedFfo = row.ffoClaimCount > 0;
  const usedReferral = row.referralAppliedCount > 0 || row.referralWelcomeCount > 0;
  if (usedFfo && usedReferral) return "mixed" as const;
  if (usedFfo) return "ffo" as const;
  if (usedReferral) return "referral" as const;
  return "none" as const;
}

function welcomeDeviceStatus(row: {
  adminBlocked: boolean;
  systemLocked: boolean;
  ffoDanger: boolean;
  referralDanger: boolean;
  referralWarning: boolean;
  accountCount: number;
  phoneCount: number;
}) {
  if (row.adminBlocked) return "admin_blocked" as const;
  if (row.systemLocked) return "system_blocked" as const;
  if (
    row.ffoDanger ||
    row.referralDanger ||
    row.referralWarning ||
    row.accountCount >= 2 ||
    row.phoneCount >= 2
  ) {
    return "needs_review" as const;
  }
  return "available" as const;
}

function serializeWelcomeOfferDeviceRow(params: {
  deviceId: string;
  ffo?: FirstOrderDeviceRow;
  referral?: ReferralRiskDeviceRow;
}) {
  const phoneSet = new Set<string>([
    ...(params.ffo?.phones ?? []),
    ...(params.referral?.phones ?? []),
  ]);
  const ffoClaimCount = numberValue(params.ffo?.claimCount);
  const referralAppliedCount = numberValue(params.referral?.referralAppliedCount);
  const referralWelcomeCount = numberValue(params.referral?.refereeVoucherCount);
  const adminBlocked = Boolean(
    params.ffo?.manuallyBlocked || params.referral?.manuallyBlocked,
  );
  const systemLocked = Boolean(
    params.ffo?.autoBlocked ||
      params.referral?.autoBlocked ||
      ffoClaimCount > 0 ||
      referralWelcomeCount > 0,
  );
  const accountCount = Math.max(
    numberValue(params.ffo?.accountCount),
    numberValue(params.referral?.accountCount),
  );
  const phoneCount = Math.max(
    phoneSet.size,
    numberValue(params.ffo?.phoneCount),
    numberValue(params.referral?.phoneCount),
  );
  const usedOffer = welcomeUsedOffer({
    ffoClaimCount,
    referralAppliedCount,
    referralWelcomeCount,
  });
  const status = welcomeDeviceStatus({
    adminBlocked,
    systemLocked,
    ffoDanger: Boolean(params.ffo?.danger),
    referralDanger: Boolean(params.referral?.danger),
    referralWarning: Boolean(params.referral?.warning),
    accountCount,
    phoneCount,
  });
  const firstSeen = earliestDate(
    compactDateValue(params.ffo?.firstSeen),
    compactDateValue(params.referral?.firstSeen),
  );
  const lastSeen = latestDate(
    compactDateValue(params.ffo?.lastSeen),
    compactDateValue(params.referral?.lastSeen),
  );
  const block =
    params.ffo?.block?.locked || params.ffo?.block?.manuallyBlockedAt
      ? params.ffo.block
      : params.referral?.block ?? {
          locked: false,
          source: "",
          reason: "",
          note: "",
          manuallyBlockedAt: null,
          blockedBy: "",
          createdAt: null,
        };
  const reasons = [
    ...(params.ffo?.reasons ?? []),
    ...(params.referral?.reasons ?? []),
  ];
  if (status === "system_blocked" && !reasons.some((reason) => reason.includes("locked"))) {
    reasons.push("System blocked this device after a welcome offer was used");
  }
  if (adminBlocked && !reasons.some((reason) => reason.includes("Admin manually blocked"))) {
    reasons.push("Admin manually blocked this device from future welcome offers");
  }

  return {
    deviceId: params.deviceId,
    status,
    usedOffer,
    blocked: status === "system_blocked" || status === "admin_blocked",
    systemLocked,
    adminBlocked,
    firstSeen: serializeDate(firstSeen),
    lastSeen: serializeDate(lastSeen),
    accountCount,
    phoneCount,
    phones: [...phoneSet],
    ffo: {
      claimCount: ffoClaimCount,
      confirmedClaimCount: numberValue(params.ffo?.confirmedClaimCount),
      releasedClaimCount: numberValue(params.ffo?.releasedClaimCount),
      reservedClaimCount: numberValue(params.ffo?.reservedClaimCount),
      totalAmount: numberValue(params.ffo?.totalAmount),
      danger: Boolean(params.ffo?.danger),
    },
    referral: {
      appliedCount: referralAppliedCount,
      welcomeCount: referralWelcomeCount,
      rewardedCount: numberValue(params.referral?.rewardedReferralCount),
      sameDeviceCount: numberValue(params.referral?.sameDeviceReferralCount),
      underReviewCount: numberValue(params.referral?.underReviewCount),
      rejectedCount: numberValue(params.referral?.rejectedCount),
      disabledAccountCount: numberValue(params.referral?.disabledAccountCount),
      danger: Boolean(params.referral?.danger),
      warning: Boolean(params.referral?.warning),
    },
    block: {
      locked: Boolean(block.locked) || systemLocked || adminBlocked,
      source: stringValue(block.source),
      reason: stringValue(block.reason),
      note: stringValue(block.note),
      manuallyBlockedAt: serializeDate(block.manuallyBlockedAt),
      blockedBy: stringValue(block.blockedBy),
      createdAt: serializeDate(block.createdAt),
    },
    reasons: [...new Set(reasons)],
  };
}

function welcomeDeviceMatchesSearch(
  row: ReturnType<typeof serializeWelcomeOfferDeviceRow>,
  search?: string,
) {
  if (!search?.trim()) return true;
  const needle = search.trim().toLowerCase();
  const haystack = [
    row.deviceId,
    row.status,
    row.usedOffer,
    row.block.reason,
    row.block.note,
    ...row.phones,
    ...row.reasons,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function welcomeDeviceMatchesDate(
  row: ReturnType<typeof serializeWelcomeOfferDeviceRow>,
  dateMatch: Record<string, Date> | null,
) {
  if (!dateMatch) return true;
  return (
    dateMatches(compactDateValue(row.firstSeen), dateMatch) ||
    dateMatches(compactDateValue(row.lastSeen), dateMatch)
  );
}

function welcomeDeviceMatchesFilters(
  row: ReturnType<typeof serializeWelcomeOfferDeviceRow>,
  params: WelcomeOfferDeviceListParams,
) {
  if (params.status && params.status !== "all" && row.status !== params.status) {
    return false;
  }
  if (params.offer && params.offer !== "all" && row.usedOffer !== params.offer) {
    return false;
  }
  return true;
}

function sortWelcomeDevices(
  rows: Array<ReturnType<typeof serializeWelcomeOfferDeviceRow>>,
  sortBy?: WelcomeOfferDeviceListParams["sortBy"],
) {
  return rows.sort((a, b) => {
    if (sortBy === "accounts") {
      return b.accountCount - a.accountCount || b.phoneCount - a.phoneCount;
    }
    if (sortBy === "ffoClaims") {
      return b.ffo.claimCount - a.ffo.claimCount || b.ffo.totalAmount - a.ffo.totalAmount;
    }
    if (sortBy === "referrals") {
      return (
        b.referral.appliedCount - a.referral.appliedCount ||
        b.referral.welcomeCount - a.referral.welcomeCount
      );
    }
    if (sortBy === "risk") {
      return (
        Number(b.adminBlocked) - Number(a.adminBlocked) ||
        Number(b.systemLocked) - Number(a.systemLocked) ||
        Number(b.ffo.danger || b.referral.danger) -
          Number(a.ffo.danger || a.referral.danger) ||
        b.accountCount - a.accountCount ||
        b.phoneCount - a.phoneCount
      );
    }
    const aTime = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
    const bTime = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
    return bTime - aTime;
  });
}

function buildWelcomeDeviceRows(params: {
  ffoRows: FirstOrderDeviceRow[];
  referralRows: ReferralRiskDeviceRow[];
}) {
  const byDevice = new Map<string, { ffo?: FirstOrderDeviceRow; referral?: ReferralRiskDeviceRow }>();
  for (const ffo of params.ffoRows) {
    if (!byDevice.has(ffo.deviceId)) byDevice.set(ffo.deviceId, {});
    byDevice.get(ffo.deviceId)!.ffo = ffo;
  }
  for (const referral of params.referralRows) {
    if (!byDevice.has(referral.deviceId)) byDevice.set(referral.deviceId, {});
    byDevice.get(referral.deviceId)!.referral = referral;
  }
  return [...byDevice.entries()].map(([deviceId, row]) =>
    serializeWelcomeOfferDeviceRow({ deviceId, ffo: row.ffo, referral: row.referral }),
  );
}

function buildWelcomeDeviceSummary(
  rows: Array<ReturnType<typeof serializeWelcomeOfferDeviceRow>>,
) {
  return {
    totalDevices: rows.length,
    blockedDevices: rows.filter((row) => row.blocked).length,
    systemBlockedDevices: rows.filter((row) => row.status === "system_blocked").length,
    adminBlockedDevices: rows.filter((row) => row.status === "admin_blocked").length,
    needsReviewDevices: rows.filter((row) => row.status === "needs_review").length,
    availableDevices: rows.filter((row) => row.status === "available").length,
    ffoDevices: rows.filter((row) => row.usedOffer === "ffo" || row.usedOffer === "mixed").length,
    referralDevices: rows.filter((row) => row.usedOffer === "referral" || row.usedOffer === "mixed").length,
    totalFfoClaims: rows.reduce((total, row) => total + row.ffo.claimCount, 0),
    totalReferralApplications: rows.reduce(
      (total, row) => total + row.referral.appliedCount,
      0,
    ),
    totalReferralWelcome: rows.reduce(
      (total, row) => total + row.referral.welcomeCount,
      0,
    ),
  };
}

function mergeWelcomeAccountRows(params: {
  ffoAccounts?: Array<Record<string, any>>;
  referralAccounts?: Array<Record<string, any>>;
}) {
  const byId = new Map<string, Record<string, any>>();
  for (const account of params.ffoAccounts ?? []) {
    if (!account.id) continue;
    byId.set(account.id, {
      id: account.id,
      fullName: stringValue(account.fullName, "Customer"),
      phone: stringValue(account.phone),
      status: stringValue(account.status),
      joinedAt: serializeDate(account.joinedAt),
      ffoClaimed: Boolean(account.ffoClaimed),
      ffoClaimCount: numberValue(account.ffoClaimCount),
      firstOrderDiscountRedeemedAt: serializeDate(account.firstOrderDiscountRedeemedAt),
      appliedReferral: Boolean(account.appliedReferral),
      gotRefereeVoucher: Boolean(account.gotRefereeVoucher),
      referralRewardStatus: "",
      referralRewardedAt: null,
      refereeRewardGrantedAt: null,
      referralDisabledByAdmin: Boolean(account.referralDisabledByAdmin),
      sameDeviceReferral: false,
      referrer: null,
    });
  }
  for (const account of params.referralAccounts ?? []) {
    if (!account.id) continue;
    const existing = byId.get(account.id) ?? {
      id: account.id,
      fullName: stringValue(account.fullName, "Customer"),
      phone: stringValue(account.phone),
      status: stringValue(account.status),
      joinedAt: serializeDate(account.joinedAt),
      ffoClaimed: false,
      ffoClaimCount: 0,
      firstOrderDiscountRedeemedAt: null,
      appliedReferral: false,
      gotRefereeVoucher: false,
      referralRewardStatus: "",
      referralRewardedAt: null,
      refereeRewardGrantedAt: null,
      referralDisabledByAdmin: false,
      sameDeviceReferral: false,
      referrer: null,
    };
    byId.set(account.id, {
      ...existing,
      fullName: stringValue(account.fullName, existing.fullName),
      phone: stringValue(account.phone, existing.phone),
      status: stringValue(account.status, existing.status),
      joinedAt: serializeDate(account.joinedAt) ?? existing.joinedAt,
      appliedReferral: existing.appliedReferral || Boolean(account.appliedReferral),
      gotRefereeVoucher: existing.gotRefereeVoucher || Boolean(account.gotRefereeVoucher),
      referralRewardStatus: stringValue(account.referralRewardStatus, existing.referralRewardStatus),
      referralRewardedAt: serializeDate(account.referralRewardedAt) ?? existing.referralRewardedAt,
      refereeRewardGrantedAt:
        serializeDate(account.refereeRewardGrantedAt) ?? existing.refereeRewardGrantedAt,
      referralDisabledByAdmin:
        existing.referralDisabledByAdmin || Boolean(account.referralDisabledByAdmin),
      sameDeviceReferral:
        existing.sameDeviceReferral || Boolean(account.sameDeviceReferral),
      referrer: account.referrer ?? existing.referrer,
    });
  }
  return [...byId.values()].sort((a, b) => {
    const aTime = a.joinedAt ? new Date(a.joinedAt).getTime() : 0;
    const bTime = b.joinedAt ? new Date(b.joinedAt).getTime() : 0;
    return bTime - aTime;
  });
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

export async function listAdminReferralRiskDevices(
  params: ReferralRiskDeviceListParams = {},
) {
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const dateMatch = buildDateMatch(params);
  const accumulators = await buildReferralRiskDeviceAccumulators(params);
  const rows = accumulators
    .filter((acc) => referralRiskMatchesSearch(acc, params.search))
    .filter((acc) => referralRiskMatchesDate(acc, dateMatch))
    .map(serializeReferralRiskDeviceRow)
    .filter((row) => referralRiskMatchesFilters(row, params));
  const sorted = sortReferralRiskDevices(rows, params.sortBy);
  const total = sorted.length;
  const start = (page - 1) * pageSize;

  return {
    items: sorted.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    summary: buildReferralRiskSummary(rows),
  };
}

export async function getAdminReferralRiskDeviceDetails(
  deviceId: string,
  params: { zoneId?: string; districtId?: string } = {},
) {
  const normalized = normalizeDeviceId(deviceId);
  if (!normalized) return null;
  const accumulators = await buildReferralRiskDeviceAccumulators(params);
  const acc = accumulators.find((item) => item.deviceId === normalized);
  return acc ? serializeReferralRiskDeviceDetails(acc) : null;
}

export async function listAdminWelcomeOfferDevices(
  params: WelcomeOfferDeviceListParams = {},
) {
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const dateMatch = buildDateMatch(params);
  const [ffoAccumulators, referralAccumulators] = await Promise.all([
    buildFirstOrderDeviceAccumulators(params),
    buildReferralRiskDeviceAccumulators(params),
  ]);
  const rows = buildWelcomeDeviceRows({
    ffoRows: ffoAccumulators.map(serializeFirstOrderDeviceRow),
    referralRows: referralAccumulators.map(serializeReferralRiskDeviceRow),
  })
    .filter((row) => welcomeDeviceMatchesSearch(row, params.search))
    .filter((row) => welcomeDeviceMatchesDate(row, dateMatch))
    .filter((row) => welcomeDeviceMatchesFilters(row, params));
  const sorted = sortWelcomeDevices(rows, params.sortBy);
  const total = sorted.length;
  const start = (page - 1) * pageSize;

  return {
    items: sorted.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    summary: buildWelcomeDeviceSummary(rows),
  };
}

export async function getAdminWelcomeOfferDeviceDetails(
  deviceId: string,
  params: { zoneId?: string; districtId?: string } = {},
) {
  const normalized = normalizeDeviceId(deviceId);
  if (!normalized) return null;
  const [ffoAccumulators, referralAccumulators] = await Promise.all([
    buildFirstOrderDeviceAccumulators(params),
    buildReferralRiskDeviceAccumulators(params),
  ]);
  const ffoAcc = ffoAccumulators.find((item) => item.deviceId === normalized);
  const referralAcc = referralAccumulators.find((item) => item.deviceId === normalized);
  if (!ffoAcc && !referralAcc) return null;

  const ffoDetails = ffoAcc ? serializeFirstOrderDeviceDetails(ffoAcc) : undefined;
  const referralDetails = referralAcc
    ? serializeReferralRiskDeviceDetails(referralAcc)
    : undefined;

  return {
    ...serializeWelcomeOfferDeviceRow({
      deviceId: normalized,
      ffo: ffoDetails,
      referral: referralDetails,
    }),
    accounts: mergeWelcomeAccountRows({
      ffoAccounts: ffoDetails?.accounts,
      referralAccounts: referralDetails?.accounts,
    }),
    ffoClaims: ffoDetails?.claims ?? [],
    referrers: referralDetails?.referrers ?? [],
  };
}

export async function blockAdminWelcomeOfferDevice(
  deviceId: string,
  params: {
    adminId?: string;
    reason?: string;
    note?: string;
    zoneId?: string;
    districtId?: string;
  } = {},
) {
  const blocked = await blockAdminFirstOrderOfferDevice(deviceId, params);
  if (!blocked) return null;
  return getAdminWelcomeOfferDeviceDetails(deviceId, {
    zoneId: params.zoneId,
    districtId: params.districtId,
  });
}

export async function listAdminFirstOrderOfferDevices(
  params: FirstOrderOfferDeviceListParams = {},
) {
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const dateMatch = buildDateMatch(params);
  const accumulators = await buildFirstOrderDeviceAccumulators(params);
  const rows = accumulators
    .filter((acc) => firstOrderDeviceMatchesSearch(acc, params.search))
    .filter((acc) => firstOrderDeviceMatchesDate(acc, dateMatch))
    .map(serializeFirstOrderDeviceRow)
    .filter((row) => firstOrderDeviceMatchesFilters(row, params));
  const sorted = sortFirstOrderDevices(rows, params.sortBy);
  const total = sorted.length;
  const start = (page - 1) * pageSize;

  return {
    items: sorted.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    summary: buildFirstOrderDeviceSummary(rows),
  };
}

export async function getAdminFirstOrderOfferDeviceDetails(
  deviceId: string,
  params: { zoneId?: string; districtId?: string } = {},
) {
  const normalized = normalizeDeviceId(deviceId);
  if (!normalized) return null;
  const accumulators = await buildFirstOrderDeviceAccumulators(params);
  const acc = accumulators.find((item) => item.deviceId === normalized);
  return acc ? serializeFirstOrderDeviceDetails(acc) : null;
}

export async function blockAdminFirstOrderOfferDevice(
  deviceId: string,
  params: {
    adminId?: string;
    reason?: string;
    note?: string;
    zoneId?: string;
    districtId?: string;
  } = {},
) {
  const normalized = normalizeDeviceId(deviceId);
  if (!normalized) return null;
  const reason = stringValue(params.reason, "Admin manual block").trim().slice(0, 160);
  const note = stringValue(params.note).trim().slice(0, 500);
  const account = await CustomerModel.findOne({
    $or: [
      { lastKnownDeviceId: normalized },
      { referralSignupDeviceId: normalized },
    ],
  })
    .select({ _id: 1 })
    .lean<Record<string, any>>();
  const adminObjectId =
    params.adminId && mongoose.Types.ObjectId.isValid(params.adminId)
      ? new mongoose.Types.ObjectId(params.adminId)
      : null;

  await FirstOrderDiscountDeviceLockModel.findOneAndUpdate(
    { deviceId: normalized },
    {
      $set: {
        manuallyBlockedAt: new Date(),
        manuallyBlockedBy: adminObjectId,
        reason,
        note,
      },
      $setOnInsert: {
        deviceId: normalized,
        customerId: account?._id ?? null,
        orderId: null,
        source: "admin_manual",
      },
    },
    { upsert: true, new: true },
  );

  return getAdminFirstOrderOfferDeviceDetails(normalized, {
    zoneId: params.zoneId,
    districtId: params.districtId,
  });
}

export async function listAdminFirstOrderOffers(
  params: FirstOrderOfferListParams = {},
) {
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const basePipeline = buildFirstOrderOfferBasePipeline(params);
  const statusMatch =
    params.status && params.status !== "all"
      ? [{ $match: { status: params.status } } as PipelineStage]
      : [];

  const [items, countRows, statusRows, amountRows, suspiciousRows, topDeviceRows] =
    await Promise.all([
      FirstOrderDiscountClaimModel.aggregate([
        ...basePipeline,
        ...statusMatch,
        { $sort: buildFirstOrderOfferSort(params.sortBy) },
        { $skip: (page - 1) * pageSize },
        { $limit: pageSize },
      ]),
      FirstOrderDiscountClaimModel.aggregate([
        ...basePipeline,
        ...statusMatch,
        { $count: "count" },
      ]),
      FirstOrderDiscountClaimModel.aggregate([
        ...basePipeline,
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),
      FirstOrderDiscountClaimModel.aggregate([
        ...basePipeline,
        ...statusMatch,
        {
          $group: {
            _id: null,
            totalDiscountAmount: { $sum: { $ifNull: ["$amount", 0] } },
          },
        },
      ]),
      FirstOrderDiscountClaimModel.aggregate([
        ...basePipeline,
        ...statusMatch,
        { $match: { suspicious: true } },
        { $count: "count" },
      ]),
      FirstOrderDiscountClaimModel.aggregate([
        ...basePipeline,
        ...statusMatch,
        {
          $match: {
            suspicious: true,
            deviceId: { $ne: "" },
          },
        },
        {
          $group: {
            _id: "$deviceId",
            claimCount: { $max: "$deviceClaimCount" },
            distinctPhoneCount: { $max: "$distinctPhoneCount" },
            confirmedClaimCount: { $max: "$confirmedClaimCount" },
            releasedClaimCount: { $max: "$releasedClaimCount" },
            riskScore: { $max: "$riskScore" },
            totalAmount: { $sum: { $ifNull: ["$amount", 0] } },
          },
        },
        { $sort: { riskScore: -1, claimCount: -1 } },
        { $limit: 8 },
      ]),
    ]);

  const total = numberValue(countRows[0]?.count);
  const totalDiscountAmount = numberValue(amountRows[0]?.totalDiscountAmount);
  const suspiciousClaims = numberValue(suspiciousRows[0]?.count);

  return {
    items: items.map(serializeFirstOrderOfferClaimRow),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    summary: buildFirstOrderOfferSummary(
      statusRows,
      totalDiscountAmount,
      total,
      suspiciousClaims,
    ),
    topDevices: topDeviceRows.map(serializeFirstOrderOfferTopDevice),
  };
}

export async function getAdminFirstOrderOfferDetails(
  claimId: string,
  params: { zoneId?: string; districtId?: string } = {},
) {
  if (!mongoose.Types.ObjectId.isValid(claimId)) return null;

  const [row] = await FirstOrderDiscountClaimModel.aggregate([
    ...buildFirstOrderOfferBasePipeline({ skipDefaultDate: true, ...params }),
    { $match: { _id: new mongoose.Types.ObjectId(claimId) } },
    { $limit: 1 },
  ]);

  return row ? serializeFirstOrderOfferClaimRow(row) : null;
}
