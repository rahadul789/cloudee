import mongoose, { type PipelineStage } from "mongoose";
import { StatusCodes } from "http-status-codes";

import { enqueueBackgroundTask } from "../../common/utils/background-task";
import { AppError } from "../../common/utils/app-error";
import { emitSocketEvent } from "../../config/socket";
import {
  OwnerModel,
  PayoutMethodModel,
  RestaurantModel,
  RiderModel,
} from "../auth/auth.model";
import {
  DailyFinanceSnapshotModel,
  LedgerEntryModel,
  PayoutBatchModel,
  PlatformFinanceEntryModel,
} from "../owner/finance.model";
import {
  aggregateFinalizedLedgerEntries,
  invalidateOwnerFinanceCaches,
  reconcileRestaurantLedgerStatuses,
} from "../owner/finance.service";
import { NotificationModel, OrderModel } from "../owner/operational.model";
import { sendPushToOwner } from "../owner/push.service";
import { getOperationalFinanceSettings } from "../public/content.service";
import {
  buildOrderServiceAreaScopeFilter,
  buildRestaurantServiceAreaScopeFilter,
  buildRiderServiceAreaScopeFilter,
} from "../service-area/service-area.service";
import { AdminAuditLogModel, AdminModel } from "./admin.model";
import { resolveAdminOperationalAlertByDedupeKey } from "./admin-alert.service";
import { notifyOwnerPayoutStatus } from "./payout-owner-notifications";
import { RiderPayrollCycleModel } from "./rider-payroll.model";
import {
  clampPage,
  clampPageSize,
  endOfDay,
  escapeRegex,
  numberValue,
  objectIdString,
  parseDate,
  serializeDate,
  startOfDay,
  stringValue,
  toObjectId,
} from "./finance-shared.util";

type PageParams = {
  page?: number;
  pageSize?: number;
};

type FinancePreset =
  | "today"
  | "yesterday"
  | "last7Days"
  | "last30Days"
  | "last90Days"
  | "thisMonth"
  | "lastMonth"
  | "lifetime"
  | "custom";

type PlatformFinanceParams = {
  preset?: FinancePreset;
  from?: string;
  to?: string;
  zoneId?: string;
  districtId?: string;
};

type PayoutListParams = PageParams & {
  search?: string;
  zoneId?: string;
  districtId?: string;
  eligibility?: "all" | "eligible" | "blocked" | "pending_request";
  sortBy?: "available_desc" | "pending_desc" | "recent_request" | "name_asc";
};

type LedgerListParams = PageParams & {
  search?: string;
  restaurantId?: string;
  zoneId?: string;
  districtId?: string;
  entryType?: "all" | "earning" | "refund" | "payout" | "adjustment";
  settlementStatus?: "all" | "pending" | "available" | "paid_out";
  sortBy?: "newest" | "oldest" | "highest_net" | "lowest_net";
};

type RefundListParams = PageParams & {
  search?: string;
  restaurantId?: string;
  zoneId?: string;
  districtId?: string;
  status?: "all" | "refund_pending" | "refunded" | "refund_rejected" | "needs_review";
  sortBy?: "newest" | "oldest" | "highest_value" | "recently_updated";
};

type WalletEntryListParams = PageParams & {
  preset?: FinancePreset;
  from?: string;
  to?: string;
  zoneId?: string;
  districtId?: string;
  direction?: "all" | "credit" | "debit";
  category?:
    | "all"
    | "online_payment"
    | "cod_deposit"
    | "restaurant_payout"
    | "customer_refund"
    | "rider_payroll"
    | "deploy_hosting"
    | "manual_expense"
    | "manual_income"
    | "adjustment"
    | "other";
};

type MoneyTransactionListParams = PageParams & {
  preset?: FinancePreset;
  from?: string;
  to?: string;
  zoneId?: string;
  districtId?: string;
  search?: string;
  direction?: "all" | "credit" | "debit";
  category?:
    | "all"
    | "online_payment"
    | "cod_collection"
    | "restaurant_payout"
    | "customer_refund"
    | "rider_payroll"
    | "deploy_hosting"
    | "manual_income"
    | "manual_expense"
    | "adjustment"
    | "other";
  source?: "all" | "order" | "payout" | "refund" | "payroll" | "wallet";
};

type CreateWalletEntryParams = {
  direction: "credit" | "debit";
  category:
    | "cod_deposit"
    | "deploy_hosting"
    | "manual_expense"
    | "manual_income"
    | "adjustment"
    | "other";
  amount: number;
  occurredAt?: string;
  paymentMethod?: string;
  reference?: string;
  proofUrl?: string;
  note?: string;
  adminId?: string;
};

type CloseDailyFinanceParams = {
  date?: string;
  note?: string;
  adminId?: string;
};

type CreateAdminPayoutParams = {
  restaurantId: string;
  amount: number;
  status?: "processing" | "completed";
  note?: string;
  providerReference?: string;
  providerPayoutId?: string;
  providerTransactionId?: string;
  paymentProofUrl?: string;
  includePending?: boolean;
  notifyOwnerSms?: boolean;
  adminId?: string;
};

const walletLedgerEntryTypes = ["earning", "refund", "adjustment"] as const;
const payoutResidualSourceTypes = ["payout_residual", "payout_residual_reversal"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;


function normalizeRefundNotificationChannel(
  channel: Record<string, any> | null | undefined,
) {
  const ticketIds = Array.isArray(channel?.ticketIds) ? channel?.ticketIds : [];

  return {
    status: stringValue(channel?.status, "not_attempted"),
    attemptedAt: serializeDate(channel?.attemptedAt),
    deliveredAt: serializeDate(channel?.deliveredAt),
    provider: stringValue(channel?.provider),
    recipient: stringValue(channel?.recipient),
    requestId: stringValue(channel?.requestId),
    error: stringValue(channel?.error),
    sent: numberValue(channel?.sent),
    inAppCreated: numberValue(channel?.inAppCreated),
    ticketIds: ticketIds
      .map((ticketId: unknown) => stringValue(ticketId))
      .filter(Boolean),
  };
}

function normalizeRefundNotificationAudit(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const audit = raw as Record<string, any>;
  return {
    message: stringValue(audit.message),
    updatedAt: serializeDate(audit.updatedAt),
    push: normalizeRefundNotificationChannel(audit.push),
    sms: normalizeRefundNotificationChannel(audit.sms),
  };
}


function buildFinanceRange(params: PlatformFinanceParams = {}) {
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

  if (preset === "last7Days") {
    return { preset, start: startOfDay(new Date(now.getTime() - 6 * DAY_MS)), end: endOfDay(now) };
  }

  if (preset === "last90Days") {
    return { preset, start: startOfDay(new Date(now.getTime() - 89 * DAY_MS)), end: endOfDay(now) };
  }

  if (preset === "thisMonth") {
    return { preset, start: new Date(now.getFullYear(), now.getMonth(), 1), end: endOfDay(now) };
  }

  if (preset === "lastMonth") {
    return {
      preset,
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
    };
  }

  if (preset === "lifetime") {
    return { preset, start: new Date(0), end: endOfDay(now) };
  }

  return {
    preset: "last30Days" as const,
    start: startOfDay(new Date(now.getTime() - 29 * DAY_MS)),
    end: endOfDay(now),
  };
}

function daysBetween(start: Date, end: Date) {
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / DAY_MS));
}

function addMonthsClamped(date: Date, months: number) {
  const next = new Date(date);
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

function getRiderSalaryAnchor(rider: Record<string, any>) {
  const explicitStart = parseDate(stringValue(rider.payroll?.startedAt));
  const createdAt = rider.createdAt ? new Date(rider.createdAt) : null;
  const anchor = explicitStart ?? (createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : new Date());
  return startOfDay(anchor);
}

function getRiderNextSalaryDueDate(rider: Record<string, any>, from = new Date()) {
  const anchor = getRiderSalaryAnchor(rider);
  const today = startOfDay(from);
  if (today < anchor) return anchor;

  const roughMonthDiff =
    (today.getFullYear() - anchor.getFullYear()) * 12 +
    (today.getMonth() - anchor.getMonth());
  let cursorMonth = Math.max(0, roughMonthDiff);
  let dueDate = addMonthsClamped(anchor, cursorMonth);

  while (dueDate <= today) {
    cursorMonth += 1;
    dueDate = addMonthsClamped(anchor, cursorMonth);
  }

  return dueDate;
}

function summarizePayrollAdjustments(cycles: Array<Record<string, any>>) {
  return cycles.reduce(
    (total, cycle) => {
      const adjustments = Array.isArray(cycle.adjustments) ? cycle.adjustments : [];
      adjustments.forEach((adjustment: Record<string, any>) => {
        const type = stringValue(adjustment.type);
        if (["bonus", "tip", "reimbursement"].includes(type)) {
          total.platformBonus += numberValue(adjustment.amount);
        }
        if (["penalty", "deduction"].includes(type)) {
          total.penalties += numberValue(adjustment.amount);
        }
      });
      return total;
    },
    { platformBonus: 0, penalties: 0 },
  );
}

function buildRiderSalaryNotice(rider: Record<string, any>, now = new Date()) {
  const dueAt = getRiderNextSalaryDueDate(rider, now);
  const daysUntilDue = Math.ceil(
    (startOfDay(dueAt).getTime() - startOfDay(now).getTime()) / DAY_MS,
  );
  return {
    riderId: objectIdString(rider._id),
    riderName: stringValue(rider.fullName, "Rider"),
    riderPhone: stringValue(rider.phone),
    monthlySalary: numberValue(rider.payroll?.monthlySalary),
    salaryCycleStart: getRiderSalaryAnchor(rider).toISOString(),
    nextDueAt: dueAt.toISOString(),
    daysUntilDue,
    noticeAt: new Date(dueAt.getTime() - 3 * DAY_MS).toISOString(),
    status: daysUntilDue < 0 ? "overdue" : daysUntilDue <= 3 ? "due_soon" : "scheduled",
  };
}

function rangeMatchOn(field: string, start: Date, end: Date) {
  return { [field]: { $gte: start, $lte: end } };
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

function onlinePaymentDateExpression() {
  return {
    $ifNull: [
      "$paymentSnapshot.confirmedAt",
      {
        $ifNull: ["$paymentSnapshot.paidAt", "$createdAt"],
      },
    ],
  };
}

function refundPaidDateExpression() {
  return {
    $ifNull: [
      "$paymentSnapshot.refundReviewedAt",
      {
        $ifNull: ["$paymentSnapshot.refundedAt", "$updatedAt"],
      },
    ],
  };
}

function dateKeyExpression(field: string) {
  return { $dateToString: { date: field, format: "%Y-%m-%d" } };
}

function trendLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
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

function summarizePayrollAmount(
  rider: Record<string, any>,
  cycle?: Record<string, any> | null,
) {
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

async function getPlatformPayrollSummary(
  rangeStart: Date,
  rangeEnd: Date,
  riderScopeFilter: Record<string, unknown> = {},
) {
  const safeMonths = monthKeysBetween(rangeStart, rangeEnd);
  const riders = await RiderModel.find({
    ...riderScopeFilter,
    $or: [
      { "payroll.isPayrollEnabled": { $ne: false } },
      { payroll: { $exists: false } },
    ],
  }).lean();
  const riderIds = riders
    .map((rider) => rider._id)
    .filter((id): id is mongoose.Types.ObjectId => id instanceof mongoose.Types.ObjectId);
  const scopedPayroll = Object.keys(riderScopeFilter).length > 0;
  const cycles =
    scopedPayroll && riderIds.length === 0
      ? []
      : await RiderPayrollCycleModel.find({
          status: "paid",
          paidAt: { $gte: rangeStart, $lte: rangeEnd },
          ...(scopedPayroll ? { riderId: { $in: riderIds } } : {}),
        }).lean();

  const paidSummary = cycles.reduce(
    (total, cycle) => {
      const amount = summarizePayrollAmount(
        { payroll: { monthlySalary: numberValue(cycle.baseSalary) } },
        cycle,
      );
      return {
        baseSalary: total.baseSalary + amount.baseSalary,
        platformBonus: total.platformBonus + amount.platformBonus,
        penalties: total.penalties + amount.penalties,
        netPayable: total.netPayable + amount.netPayable,
        pending: 0,
        paid: total.paid + amount.netPayable,
      };
    },
    {
      baseSalary: 0,
      platformBonus: 0,
      penalties: 0,
      netPayable: 0,
      pending: 0,
      paid: 0,
    },
  );

  const salaryNotices = riders
    .map((rider) => buildRiderSalaryNotice(rider))
    .filter((notice) => notice.status === "due_soon" || notice.status === "overdue");

  return {
    months: safeMonths.length,
    ...paidSummary,
    salaryNotices,
  };
}

async function buildRiderProfitabilityRows(
  orderRows: Array<Record<string, any>>,
  rangeStart: Date,
  rangeEnd: Date,
) {
  const riderIds = orderRows.map((row) => stringValue(row._id)).filter(Boolean);
  const objectIds = riderIds
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  const [riders, cycles] = await Promise.all([
    objectIds.length
      ? RiderModel.find({ _id: { $in: objectIds } }).lean()
      : Promise.resolve([]),
    objectIds.length
      ? RiderPayrollCycleModel.find({
          riderId: { $in: objectIds },
          status: "paid",
          paidAt: { $gte: rangeStart, $lte: rangeEnd },
        }).lean()
      : Promise.resolve([]),
  ]);
  const riderMap = new Map(riders.map((rider) => [objectIdString(rider._id), rider]));

  return orderRows.map((row) => {
    const riderId = stringValue(row._id);
    const rider = riderMap.get(riderId);
    const paidCycles = cycles.filter((cycle) => {
      if (objectIdString(cycle.riderId) !== riderId || cycle.status !== "paid") {
        return false;
      }
      const paidAt = cycle.paidAt ? new Date(cycle.paidAt) : null;
      return !!paidAt && paidAt >= rangeStart && paidAt <= rangeEnd;
    });
    const paid = paidCycles.reduce((total, cycle) => {
      const amount = summarizePayrollAmount(rider ?? {}, cycle);
      return total + amount.netPayable;
    }, 0);
    const adjustments = summarizePayrollAdjustments(paidCycles);
    const deliveryFees = numberValue(row.deliveryFees);

    return {
      riderId,
      name: stringValue(rider?.fullName, stringValue(row.riderName, "Rider")),
      phone: stringValue(rider?.phone, stringValue(row.riderPhone)),
      deliveredTrips: numberValue(row.deliveredTrips),
      deliveryFees,
      deliveredRevenue: numberValue(row.deliveredRevenue),
      payrollExpense: paid,
      payrollPaid: paid,
      payrollPending: 0,
      platformBonus: adjustments.platformBonus,
      contribution: deliveryFees - paid,
    };
  });
}

function fillPlatformDailySeries(params: {
  start: Date;
  end: Date;
  ledgerRows: Array<Record<string, any>>;
  orderRows: Array<Record<string, any>>;
  refundRows: Array<Record<string, any>>;
  onlinePaymentRows?: Array<Record<string, any>>;
  payoutRows: Array<Record<string, any>>;
}) {
  const ledgerMap = new Map(params.ledgerRows.map((row) => [stringValue(row._id), row]));
  const orderMap = new Map(params.orderRows.map((row) => [stringValue(row._id), row]));
  const refundMap = new Map(params.refundRows.map((row) => [stringValue(row._id), row]));
  const onlinePaymentMap = new Map((params.onlinePaymentRows ?? []).map((row) => [stringValue(row._id), row]));
  const payoutMap = new Map(params.payoutRows.map((row) => [stringValue(row._id), row]));
  const points = [];

  for (
    let cursor = startOfDay(params.start);
    cursor <= params.end;
    cursor = new Date(cursor.getTime() + DAY_MS)
  ) {
    const key = cursor.toISOString().slice(0, 10);
    const ledger = ledgerMap.get(key);
    const order = orderMap.get(key);
    const refund = refundMap.get(key);
    const onlinePayment = onlinePaymentMap.get(key);
    const payout = payoutMap.get(key);
    const commission = numberValue(ledger?.commission);
    const deliveryFees = numberValue(order?.deliveryFees);
    const platformDiscountCost = numberValue(ledger?.platformDiscountCost);
    const refundsPaid = numberValue(refund?.refundsPaid);
    const payoutsPaid = numberValue(payout?.payoutsPaid);
    const revenue = commission + deliveryFees;
    const operatingExpense = platformDiscountCost;

    points.push({
      date: key,
      label: trendLabel(cursor),
      deliveredOrders: numberValue(order?.deliveredOrders),
      revenue,
      commission,
      deliveryFees,
      operatingExpense,
      platformDiscountCost,
      refundsPaid,
      payoutsPaid,
      cashIn: numberValue(onlinePayment?.onlineCollected) + numberValue(order?.codCollected),
      cashOut: refundsPaid + payoutsPaid,
      profit: revenue - operatingExpense,
    });
  }

  return points;
}

function buildPagination(total: number, page: number, pageSize: number) {
  return {
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function maskAccountNumber(value?: string | null) {
  const normalized = value?.trim() ?? "";
  if (!normalized) return "";
  if (normalized.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-4)}`;
}

async function matureAvailableLedgerEntries(restaurantId?: mongoose.Types.ObjectId) {
  const query: Record<string, unknown> = {
    entryType: { $in: [...walletLedgerEntryTypes] },
    settlementStatus: "pending",
    availableAt: { $lte: new Date() },
  };
  if (restaurantId) query.restaurantId = restaurantId;

  await LedgerEntryModel.updateMany(query, {
    $set: { settlementStatus: "available" },
  });
}

function aggregatePayableLedgerEntries(
  match: Record<string, unknown>,
  extraStages: PipelineStage[] = [],
) {
  return aggregateFinalizedLedgerEntries(match, extraStages);
}

function emptyFinanceSummary() {
  return {
    grossAmount: 0,
    commissionBase: 0,
    commission: 0,
    discountCost: 0,
    platformDiscountCost: 0,
    deliveryCost: 0,
    netAmount: 0,
    availableBalance: 0,
    pendingBalance: 0,
    paidOutBalance: 0,
    carryForwardBalance: 0,
    carryForwardAvailableBalance: 0,
    carryForwardPendingBalance: 0,
    carryForwardPaidOutBalance: 0,
    payoutRequestedAmount: 0,
    payoutProcessingAmount: 0,
    payoutCompletedAmount: 0,
    payoutFailedAmount: 0,
  };
}

function toFinanceSummary(row?: Record<string, unknown>) {
  const carryForwardAvailableBalance = numberValue(row?.carryForwardAvailableBalance);
  const carryForwardPendingBalance = numberValue(row?.carryForwardPendingBalance);

  return {
    grossAmount: numberValue(row?.grossAmount),
    commissionBase: numberValue(row?.commissionBase),
    commission: numberValue(row?.commission),
    discountCost: numberValue(row?.discountCost),
    platformDiscountCost: numberValue(row?.platformDiscountCost),
    deliveryCost: numberValue(row?.deliveryCost),
    netAmount: numberValue(row?.netAmount),
    availableBalance: numberValue(row?.availableBalance),
    pendingBalance: numberValue(row?.pendingBalance),
    paidOutBalance: numberValue(row?.paidOutBalance),
    carryForwardBalance: carryForwardAvailableBalance + carryForwardPendingBalance,
    carryForwardAvailableBalance,
    carryForwardPendingBalance,
    carryForwardPaidOutBalance: numberValue(row?.carryForwardPaidOutBalance),
    payoutRequestedAmount: numberValue(row?.payoutRequestedAmount),
    payoutProcessingAmount: numberValue(row?.payoutProcessingAmount),
    payoutCompletedAmount: numberValue(row?.payoutCompletedAmount),
    payoutFailedAmount: numberValue(row?.payoutFailedAmount),
  };
}

async function getLedgerSummaryByRestaurant(restaurantIds?: mongoose.Types.ObjectId[]) {
  const match: Record<string, unknown> = {
    entryType: { $in: [...walletLedgerEntryTypes] },
  };
  if (restaurantIds) match.restaurantId = { $in: restaurantIds };

  const rows = (await aggregatePayableLedgerEntries(match, [
    {
      $addFields: {
        countsInSettlementTotals: {
          $not: [
            {
              $in: [
                "$sourceEntityType",
                [...payoutResidualSourceTypes],
              ],
            },
          ],
        },
        isCarryForwardBalance: {
          $in: ["$sourceEntityType", [...payoutResidualSourceTypes]],
        },
      },
    },
    {
      $group: {
        _id: "$restaurantId",
        grossAmount: {
          $sum: {
            $cond: ["$countsInSettlementTotals", { $ifNull: ["$grossAmount", 0] }, 0],
          },
        },
        commissionBase: {
          $sum: {
            $cond: [
              "$countsInSettlementTotals",
              { $ifNull: ["$commissionBase", 0] },
              0,
            ],
          },
        },
        commission: {
          $sum: {
            $cond: ["$countsInSettlementTotals", { $ifNull: ["$commission", 0] }, 0],
          },
        },
        discountCost: {
          $sum: {
            $cond: ["$countsInSettlementTotals", { $ifNull: ["$discountCost", 0] }, 0],
          },
        },
        platformDiscountCost: {
          $sum: {
            $cond: [
              "$countsInSettlementTotals",
              { $ifNull: ["$platformDiscountCost", 0] },
              0,
            ],
          },
        },
        deliveryCost: {
          $sum: {
            $cond: ["$countsInSettlementTotals", { $ifNull: ["$deliveryCost", 0] }, 0],
          },
        },
        netAmount: {
          $sum: {
            $cond: ["$countsInSettlementTotals", { $ifNull: ["$netAmount", 0] }, 0],
          },
        },
        availableBalance: {
          $sum: {
            $cond: [
              { $eq: ["$settlementStatus", "available"] },
              { $ifNull: ["$netAmount", 0] },
              0,
            ],
          },
        },
        pendingBalance: {
          $sum: {
            $cond: [
              { $eq: ["$settlementStatus", "pending"] },
              { $ifNull: ["$netAmount", 0] },
              0,
            ],
          },
        },
        paidOutBalance: {
          $sum: {
            $cond: [
              { $eq: ["$settlementStatus", "paid_out"] },
              { $ifNull: ["$netAmount", 0] },
              0,
            ],
          },
        },
        carryForwardBalance: {
          $sum: {
            $cond: [
              {
                $and: [
                  "$isCarryForwardBalance",
                  { $in: ["$settlementStatus", ["available", "pending"]] },
                ],
              },
              { $ifNull: ["$netAmount", 0] },
              0,
            ],
          },
        },
        carryForwardAvailableBalance: {
          $sum: {
            $cond: [
              {
                $and: [
                  "$isCarryForwardBalance",
                  { $eq: ["$settlementStatus", "available"] },
                ],
              },
              { $ifNull: ["$netAmount", 0] },
              0,
            ],
          },
        },
        carryForwardPendingBalance: {
          $sum: {
            $cond: [
              {
                $and: [
                  "$isCarryForwardBalance",
                  { $eq: ["$settlementStatus", "pending"] },
                ],
              },
              { $ifNull: ["$netAmount", 0] },
              0,
            ],
          },
        },
        carryForwardPaidOutBalance: {
          $sum: {
            $cond: [
              {
                $and: [
                  "$isCarryForwardBalance",
                  { $eq: ["$settlementStatus", "paid_out"] },
                ],
              },
              { $ifNull: ["$netAmount", 0] },
              0,
            ],
          },
        },
      },
    },
  ])) as Record<string, unknown>[];

  return new Map(rows.map((row) => [objectIdString(row._id), toFinanceSummary(row)]));
}

async function getPayoutSummaryByRestaurant(restaurantIds?: mongoose.Types.ObjectId[]) {
  const match: Record<string, unknown> = {};
  if (restaurantIds) match.restaurantId = { $in: restaurantIds };

  const rows = await PayoutBatchModel.aggregate<Record<string, unknown>>([
    { $match: match },
    {
      $group: {
        _id: "$restaurantId",
        payoutRequestedAmount: {
          $sum: {
            $cond: [
              { $eq: ["$status", "pending"] },
              { $ifNull: ["$amount", 0] },
              0,
            ],
          },
        },
        payoutProcessingAmount: {
          $sum: {
            $cond: [
              { $eq: ["$status", "processing"] },
              { $ifNull: ["$amount", 0] },
              0,
            ],
          },
        },
        payoutCompletedAmount: {
          $sum: {
            $cond: [
              { $eq: ["$status", "completed"] },
              { $ifNull: ["$amount", 0] },
              0,
            ],
          },
        },
        payoutFailedAmount: {
          $sum: {
            $cond: [
              { $eq: ["$status", "failed"] },
              { $ifNull: ["$amount", 0] },
              0,
            ],
          },
        },
        totalPayoutRequests: { $sum: 1 },
        lastRequestedAt: { $max: "$requestedAt" },
      },
    },
  ]);

  return new Map(rows.map((row) => [objectIdString(row._id), row]));
}

function mergeFinanceSummary(
  ledger: ReturnType<typeof emptyFinanceSummary>,
  payout?: Record<string, unknown>,
) {
  return {
    ...ledger,
    paidOutBalance: numberValue(payout?.payoutCompletedAmount, ledger.paidOutBalance),
    payoutRequestedAmount: numberValue(payout?.payoutRequestedAmount),
    payoutProcessingAmount: numberValue(payout?.payoutProcessingAmount),
    payoutCompletedAmount: numberValue(payout?.payoutCompletedAmount),
    payoutFailedAmount: numberValue(payout?.payoutFailedAmount),
    totalPayoutRequests: numberValue(payout?.totalPayoutRequests),
    lastRequestedAt: serializeDate(payout?.lastRequestedAt),
  };
}

function getEligibility(params: {
  availableBalance: number;
  minimumPayoutAmountTaka: number;
  hasActivePayout: boolean;
  oneActivePayoutRequest: boolean;
  payoutMethod?: Record<string, any> | null;
}) {
  const reasons: string[] = [];
  const hasVerifiedPayoutMethod =
    params.payoutMethod?.isVerified === true &&
    Boolean(stringValue(params.payoutMethod?.accountNumber).trim());

  if (!hasVerifiedPayoutMethod) {
    reasons.push("Verified payout method is missing");
  }
  if (params.availableBalance < params.minimumPayoutAmountTaka) {
    reasons.push(`Available balance is below Tk ${params.minimumPayoutAmountTaka}`);
  }
  if (params.oneActivePayoutRequest && params.hasActivePayout) {
    reasons.push("A payout is already pending or processing");
  }

  return {
    status:
      reasons.length === 0
        ? ("eligible" as const)
        : params.hasActivePayout
          ? ("pending_request" as const)
          : ("blocked" as const),
    reasons,
    hasVerifiedPayoutMethod,
  };
}

function mapPayoutBatch(payout: Record<string, any>) {
  return {
    id: objectIdString(payout._id),
    restaurantId: objectIdString(payout.restaurantId),
    methodId: objectIdString(payout.methodId),
    amount: numberValue(payout.amount),
    status: stringValue(payout.status, "pending"),
    batchReference: stringValue(payout.batchReference),
    provider: stringValue(payout.provider, "manual"),
    providerReference: stringValue(payout.providerReference),
    providerPayoutId: stringValue(payout.providerPayoutId),
    providerTransactionId: stringValue(payout.providerTransactionId),
    paymentProofUrl: stringValue(payout.paymentProofUrl),
    processingNote: stringValue(payout.processingNote),
    failureReason: stringValue(payout.failureReason),
    requestedAt: serializeDate(payout.requestedAt),
    approvedAt: serializeDate(payout.approvedAt),
    processedAt: serializeDate(payout.processedAt),
    updatedAt: serializeDate(payout.updatedAt),
    createdAt: serializeDate(payout.createdAt),
  };
}

function mapPayoutMethod(payoutMethod?: Record<string, any> | null) {
  if (!payoutMethod) return null;
  return {
    id: objectIdString(payoutMethod._id),
    type: stringValue(payoutMethod.type),
    accountName: stringValue(payoutMethod.accountName),
    accountNumber: stringValue(payoutMethod.accountNumber),
    accountNumberMasked: maskAccountNumber(stringValue(payoutMethod.accountNumber)),
    bankName: stringValue(payoutMethod.bankName),
    branchName: stringValue(payoutMethod.branchName),
    isVerified: payoutMethod.isVerified === true,
    pendingType: stringValue(payoutMethod.pendingType),
    pendingAccountName: stringValue(payoutMethod.pendingAccountName),
    pendingAccountNumber: stringValue(payoutMethod.pendingAccountNumber),
    pendingBankName: stringValue(payoutMethod.pendingBankName),
    pendingBranchName: stringValue(payoutMethod.pendingBranchName),
    pendingVerificationStatus: stringValue(payoutMethod.pendingVerificationStatus),
    pendingVerifiedAt: serializeDate(payoutMethod.pendingVerifiedAt),
    pendingAdminNote: stringValue(payoutMethod.pendingAdminNote),
    verifiedAt: serializeDate(payoutMethod.verifiedAt),
    updatedAt: serializeDate(payoutMethod.updatedAt),
  };
}

function isCarryForwardLedgerEntry(entry: Record<string, any>) {
  return payoutResidualSourceTypes.includes(
    stringValue(entry.sourceEntityType) as typeof payoutResidualSourceTypes[number],
  );
}

function getLedgerSourceLabel(entry: Record<string, any>) {
  const sourceEntityType = stringValue(entry.sourceEntityType);
  if (sourceEntityType === "payout_residual") return "Carry-forward balance";
  if (sourceEntityType === "payout_residual_reversal") return "Carry-forward reversal";
  if (sourceEntityType === "payout_batch") return "Payout transfer";
  if (sourceEntityType === "order") return "Order settlement";
  if (sourceEntityType === "refund") return "Refund adjustment";
  return sourceEntityType || "Ledger entry";
}

function mapPayoutMethodApproval(method: Record<string, any>) {
  const restaurant = method.restaurantId ?? {};
  const owner = restaurant.ownerId ?? {};

  return {
    id: objectIdString(method._id),
    restaurant: {
      id: objectIdString(restaurant._id),
      name: stringValue(restaurant.name),
      city: stringValue(restaurant.address?.city || restaurant.address?.area),
    },
    owner: {
      id: objectIdString(owner._id),
      fullName: stringValue(owner.fullName),
      phone: stringValue(owner.phone),
    },
    current: {
      type: stringValue(method.type),
      accountName: stringValue(method.accountName),
      accountNumber: stringValue(method.accountNumber),
      bankName: stringValue(method.bankName),
      branchName: stringValue(method.branchName),
      isVerified: method.isVerified === true,
      verifiedAt: serializeDate(method.verifiedAt),
    },
    pending: {
      type: stringValue(method.pendingType, "bkash"),
      accountName: stringValue(method.pendingAccountName),
      accountNumber: stringValue(method.pendingAccountNumber),
      bankName: stringValue(method.pendingBankName),
      branchName: stringValue(method.pendingBranchName),
      status: stringValue(method.pendingVerificationStatus),
      verifiedAt: serializeDate(method.pendingVerifiedAt),
      adminNote: stringValue(method.pendingAdminNote),
    },
    createdAt: serializeDate(method.createdAt),
    updatedAt: serializeDate(method.updatedAt),
  };
}

async function createAdminAuditLog(params: {
  adminId?: string;
  entityType: string;
  entityId: string;
  action: string;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
}) {
  const admin = params.adminId
    ? await AdminModel.findById(params.adminId).lean()
    : null;

  await AdminAuditLogModel.create({
    actorAdminId: params.adminId ?? "",
    actorName: stringValue(admin?.fullName, "Admin"),
    actorRole: stringValue(admin?.role, "admin"),
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    title: params.title,
    description: params.description ?? "",
    metadata: params.metadata ?? {},
  });
}

async function notifyOwnerPayoutMethodReview(params: {
  ownerId: string;
  restaurantId: string;
  methodId: string;
  approved: boolean;
  note?: string;
}) {
  const title = params.approved ? "Payout number approved" : "Payout number rejected";
  const description = params.approved
    ? "Your new payout bKash number is now active for future payouts."
    : params.note?.trim()
      ? `Your payout number change was rejected. ${params.note.trim()}`
      : "Your payout number change was rejected. Please review and submit again.";

  const notification = await NotificationModel.create({
    ownerId: params.ownerId,
    restaurantId: params.restaurantId,
    type: "payout",
    eventType: params.approved
      ? "payout_method.approved"
      : "payout_method.rejected",
    entityType: "payout_method",
    entityId: params.methodId,
    title,
    description,
    actionPath: "/payouts",
  });

  emitSocketEvent(`owner:${params.ownerId}`, "payout.method.updated", {
    methodId: params.methodId,
    restaurantId: params.restaurantId,
    status: params.approved ? "approved" : "rejected",
  });
  emitSocketEvent(`owner:${params.ownerId}`, "notification.created", notification.toObject());

  enqueueBackgroundTask("owner.payout_method_review.push", async () => {
    await sendPushToOwner({
      ownerId: params.ownerId,
      payload: {
        title,
        body: description,
        data: {
          path: "/(tabs)/payouts",
          type: "payout_method",
          methodId: params.methodId,
        },
      },
    });
  });
}

function mapPlatformFinanceEntry(entry: Record<string, any>) {
  return {
    id: objectIdString(entry._id),
    direction: stringValue(entry.direction),
    category: stringValue(entry.category),
    amount: numberValue(entry.amount),
    status: stringValue(entry.status, "posted"),
    sourceEntityType: stringValue(entry.sourceEntityType),
    sourceEntityId: stringValue(entry.sourceEntityId),
    paymentMethod: stringValue(entry.paymentMethod),
    reference: stringValue(entry.reference),
    proofUrl: stringValue(entry.proofUrl),
    note: stringValue(entry.note),
    occurredAt: serializeDate(entry.occurredAt),
    createdAt: serializeDate(entry.createdAt),
    updatedAt: serializeDate(entry.updatedAt),
    voidedAt: serializeDate(entry.voidedAt),
  };
}

function mapRestaurantFinanceRow(params: {
  restaurant: Record<string, any>;
  owner?: Record<string, any> | null;
  payoutMethod?: Record<string, any> | null;
  activePayout?: Record<string, any> | null;
  finance: ReturnType<typeof mergeFinanceSummary>;
  minimumPayoutAmountTaka: number;
  oneActivePayoutRequest: boolean;
}) {
  const eligibility = getEligibility({
    availableBalance: params.finance.availableBalance,
    minimumPayoutAmountTaka: params.minimumPayoutAmountTaka,
    hasActivePayout: Boolean(params.activePayout),
    oneActivePayoutRequest: params.oneActivePayoutRequest,
    payoutMethod: params.payoutMethod,
  });

  return {
    restaurant: {
      id: objectIdString(params.restaurant._id),
      name: stringValue(params.restaurant.name),
      slug: stringValue(params.restaurant.slug),
      city: stringValue(params.restaurant.address?.city, "Netrokona"),
      address: stringValue(params.restaurant.address?.address),
      isOnline: params.restaurant.runtime?.isOnline === true,
      isVisible: params.restaurant.runtime?.isVisible !== false,
      serviceArea: params.restaurant.serviceArea ?? {},
      logoUrl: stringValue(params.restaurant.logo?.url),
    },
    owner: {
      id: objectIdString(params.owner?._id ?? params.restaurant.ownerId),
      fullName: stringValue(params.owner?.fullName, "Owner"),
      phone: stringValue(params.owner?.phone),
      email: stringValue(params.owner?.email),
      status: stringValue(params.owner?.status, "active"),
    },
    payoutMethod: mapPayoutMethod(params.payoutMethod),
    finance: params.finance,
    activePayout: params.activePayout ? mapPayoutBatch(params.activePayout) : null,
    eligibility,
  };
}

export async function getAdminPlatformFinance(params: PlatformFinanceParams = {}) {
  const range = buildFinanceRange(params);
  const deliveredDate = deliveredDateExpression();
  const onlinePaymentDate = onlinePaymentDateExpression();
  const refundPaidDate = refundPaidDateExpression();
  const effectiveRangeStage = { $match: rangeMatchOn("effectiveAt", range.start, range.end) };
  const orderScopeFilter = buildOrderServiceAreaScopeFilter(params);
  const restaurantScopeFilter = buildRestaurantServiceAreaScopeFilter(params);
  const hasServiceAreaScope =
    Object.keys(orderScopeFilter).length > 0 ||
    Object.keys(restaurantScopeFilter).length > 0 ||
    Boolean(params.zoneId || params.districtId);
  const scopedRestaurantIds = Object.keys(restaurantScopeFilter).length
    ? (
        await RestaurantModel.find(restaurantScopeFilter)
          .select({ _id: 1 })
          .lean()
      ).map((restaurant) => restaurant._id)
    : null;
  const payoutScopeMatch = scopedRestaurantIds
    ? { restaurantId: { $in: scopedRestaurantIds } }
    : {};
  const riderScopeFilter = buildRiderServiceAreaScopeFilter(params);
  const scopedLedgerEarningMatch = { entryType: "earning", ...orderScopeFilter };
  const scopedWalletLedgerMatch = {
    entryType: { $in: [...walletLedgerEntryTypes] },
    ...orderScopeFilter,
  };

  await matureAvailableLedgerEntries();

  const [
    ledgerRows,
    currentLedgerRows,
    deliveredRows,
    onlinePaymentRows,
    refundRows,
    refundLiabilityRows,
    payoutRows,
    currentPayoutRows,
    dailyLedgerRows,
    dailyOrderRows,
    dailyOnlinePaymentRows,
    dailyRefundRows,
    dailyPayoutRows,
    paymentRows,
    promotionRows,
    profitByRestaurantRows,
    riderProfitOrderRows,
    walletSummaryRows,
    recentWalletRows,
    dailyClosingRows,
    codReconciliationRows,
    payrollSummary,
  ] = await Promise.all([
    aggregatePayableLedgerEntries(
      scopedLedgerEarningMatch,
      [
        effectiveRangeStage,
        {
          $group: {
            _id: null,
            ledgerEntries: { $sum: 1 },
            grossAmount: { $sum: { $ifNull: ["$grossAmount", 0] } },
            commissionBase: { $sum: { $ifNull: ["$commissionBase", "$grossAmount"] } },
            commission: { $sum: { $ifNull: ["$commission", 0] } },
            restaurantPayable: { $sum: { $ifNull: ["$netAmount", 0] } },
            ownerDiscountCost: { $sum: { $ifNull: ["$discountCost", 0] } },
            platformDiscountCost: { $sum: { $ifNull: ["$platformDiscountCost", 0] } },
            deliveryCost: { $sum: { $ifNull: ["$deliveryCost", 0] } },
            availableBalance: {
              $sum: {
                $cond: [
                  { $eq: ["$settlementStatus", "available"] },
                  { $ifNull: ["$netAmount", 0] },
                  0,
                ],
              },
            },
            pendingBalance: {
              $sum: {
                $cond: [
                  { $eq: ["$settlementStatus", "pending"] },
                  { $ifNull: ["$netAmount", 0] },
                  0,
                ],
              },
            },
          },
        },
      ],
    ) as Promise<Array<Record<string, any>>>,
    aggregatePayableLedgerEntries(
      scopedWalletLedgerMatch,
      [
        {
          $group: {
            _id: null,
            currentAvailablePayable: {
              $sum: {
                $cond: [
                  { $eq: ["$settlementStatus", "available"] },
                  { $ifNull: ["$netAmount", 0] },
                  0,
                ],
              },
            },
            currentPendingPayable: {
              $sum: {
                $cond: [
                  { $eq: ["$settlementStatus", "pending"] },
                  { $ifNull: ["$netAmount", 0] },
                  0,
                ],
              },
            },
            currentReservedPayable: {
              $sum: {
                $cond: [
                  { $eq: ["$settlementStatus", "paid_out"] },
                  { $ifNull: ["$netAmount", 0] },
                  0,
                ],
              },
            },
          },
        },
      ],
    ) as Promise<Array<Record<string, any>>>,
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
          onlineCollected: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$paymentMethod", "Bkash"] },
                    { $eq: ["$paymentStatus", "paid"] },
                  ],
                },
                { $ifNull: ["$pricing.total", 0] },
                0,
              ],
            },
          },
          codDelivered: {
            $sum: {
              $cond: [
                { $eq: ["$paymentMethod", "Cash"] },
                { $ifNull: ["$pricing.total", 0] },
                0,
              ],
            },
          },
          codCollected: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$paymentMethod", "Cash"] },
                    { $eq: ["$paymentStatus", "paid"] },
                  ],
                },
                { $ifNull: ["$pricing.total", 0] },
                0,
              ],
            },
          },
          codUncollected: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$paymentMethod", "Cash"] },
                    { $ne: ["$paymentStatus", "paid"] },
                  ],
                },
                { $ifNull: ["$pricing.total", 0] },
                0,
              ],
            },
          },
        },
      },
    ]),
    OrderModel.aggregate<Record<string, any>>([
      {
        $match: {
          paymentMethod: "Bkash",
          paymentStatus: { $in: ["paid", "refund_pending", "refunded", "refund_rejected"] },
          ...orderScopeFilter,
        },
      },
      { $addFields: { reportPaidAt: onlinePaymentDate } },
      { $match: rangeMatchOn("reportPaidAt", range.start, range.end) },
      {
        $group: {
          _id: null,
          onlineCollected: { $sum: { $ifNull: ["$pricing.total", 0] } },
          onlineCollectedCount: { $sum: 1 },
        },
      },
    ]),
    OrderModel.aggregate<Record<string, any>>([
      {
        $match: {
          paymentMethod: "Bkash",
          paymentStatus: "refunded",
          ...orderScopeFilter,
        },
      },
      { $addFields: { reportRefundedAt: refundPaidDate } },
      { $match: rangeMatchOn("reportRefundedAt", range.start, range.end) },
      {
        $group: {
          _id: null,
          refundsPaid: { $sum: { $ifNull: ["$pricing.total", 0] } },
          refundsPaidCount: { $sum: 1 },
        },
      },
    ]),
    OrderModel.aggregate<Record<string, any>>([
      {
        $match: {
          status: { $in: ["Cancelled", "Rejected"] },
          paymentMethod: "Bkash",
          paymentStatus: { $in: ["paid", "refund_pending"] },
          ...orderScopeFilter,
        },
      },
      {
        $group: {
          _id: null,
          refundPendingAmount: { $sum: { $ifNull: ["$pricing.total", 0] } },
          refundPendingCount: { $sum: 1 },
        },
      },
    ]),
    PayoutBatchModel.aggregate<Record<string, any>>([
      {
        $match: {
          status: "completed",
          ...payoutScopeMatch,
          $or: [
            { processedAt: { $gte: range.start, $lte: range.end } },
            {
              processedAt: null,
              updatedAt: { $gte: range.start, $lte: range.end },
            },
          ],
        },
      },
      {
        $group: {
          _id: null,
          payoutsPaid: { $sum: { $ifNull: ["$amount", 0] } },
          payoutsPaidCount: { $sum: 1 },
        },
      },
    ]),
    PayoutBatchModel.aggregate<Record<string, any>>([
      {
        $match: payoutScopeMatch,
      },
      {
        $group: {
          _id: "$status",
          amount: { $sum: { $ifNull: ["$amount", 0] } },
          count: { $sum: 1 },
        },
      },
    ]),
    aggregatePayableLedgerEntries(
      scopedLedgerEarningMatch,
      [
        effectiveRangeStage,
        {
          $group: {
            _id: dateKeyExpression("$effectiveAt"),
            commission: { $sum: { $ifNull: ["$commission", 0] } },
            platformDiscountCost: { $sum: { $ifNull: ["$platformDiscountCost", 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ],
    ) as Promise<Array<Record<string, any>>>,
    OrderModel.aggregate<Record<string, any>>([
      { $match: { status: "Delivered", ...orderScopeFilter } },
      { $addFields: { reportDeliveredAt: deliveredDate } },
      { $match: rangeMatchOn("reportDeliveredAt", range.start, range.end) },
      {
        $group: {
          _id: dateKeyExpression("$reportDeliveredAt"),
          deliveredOrders: { $sum: 1 },
          deliveryFees: { $sum: { $ifNull: ["$pricing.deliveryFee", 0] } },
          onlineCollected: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$paymentMethod", "Bkash"] },
                    { $eq: ["$paymentStatus", "paid"] },
                  ],
                },
                { $ifNull: ["$pricing.total", 0] },
                0,
              ],
            },
          },
          codCollected: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$paymentMethod", "Cash"] },
                    { $eq: ["$paymentStatus", "paid"] },
                  ],
                },
                { $ifNull: ["$pricing.total", 0] },
                0,
              ],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    OrderModel.aggregate<Record<string, any>>([
      {
        $match: {
          paymentMethod: "Bkash",
          paymentStatus: { $in: ["paid", "refund_pending", "refunded", "refund_rejected"] },
          ...orderScopeFilter,
        },
      },
      { $addFields: { reportPaidAt: onlinePaymentDate } },
      { $match: rangeMatchOn("reportPaidAt", range.start, range.end) },
      {
        $group: {
          _id: dateKeyExpression("$reportPaidAt"),
          onlineCollected: { $sum: { $ifNull: ["$pricing.total", 0] } },
          onlineCollectedCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    OrderModel.aggregate<Record<string, any>>([
      {
        $match: {
          paymentMethod: "Bkash",
          paymentStatus: "refunded",
          ...orderScopeFilter,
        },
      },
      { $addFields: { reportRefundedAt: refundPaidDate } },
      { $match: rangeMatchOn("reportRefundedAt", range.start, range.end) },
      {
        $group: {
          _id: dateKeyExpression("$reportRefundedAt"),
          refundsPaid: { $sum: { $ifNull: ["$pricing.total", 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    PayoutBatchModel.aggregate<Record<string, any>>([
      {
        $addFields: {
          payoutCompletedAt: { $ifNull: ["$processedAt", "$updatedAt"] },
        },
      },
      {
        $match: {
          status: "completed",
          payoutCompletedAt: { $gte: range.start, $lte: range.end },
          ...payoutScopeMatch,
        },
      },
      {
        $group: {
          _id: dateKeyExpression("$payoutCompletedAt"),
          payoutsPaid: { $sum: { $ifNull: ["$amount", 0] } },
        },
      },
      { $sort: { _id: 1 } },
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
          collected: {
            $sum: {
              $cond: [
                { $eq: ["$paymentStatus", "paid"] },
                { $ifNull: ["$pricing.total", 0] },
                0,
              ],
            },
          },
        },
      },
      { $sort: { amount: -1 } },
    ]),
    OrderModel.aggregate<Record<string, any>>([
      { $match: { status: "Delivered", ...orderScopeFilter } },
      { $addFields: { reportDeliveredAt: deliveredDate } },
      { $match: rangeMatchOn("reportDeliveredAt", range.start, range.end) },
      { $unwind: { path: "$appliedVouchers", preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: {
            code: "$appliedVouchers.code",
            fundedBy: "$appliedVouchers.fundedBy",
          },
          uses: { $sum: 1 },
          discount: {
            $sum: {
              $ifNull: [
                "$appliedVouchers.discountAmount",
                { $ifNull: ["$pricing.discountAmount", { $ifNull: ["$pricing.discount", 0] }] },
              ],
            },
          },
          platformCost: { $sum: { $ifNull: ["$appliedVouchers.platformDiscountCost", 0] } },
          ownerCost: { $sum: { $ifNull: ["$appliedVouchers.ownerDiscountCost", 0] } },
          revenue: { $sum: { $ifNull: ["$pricing.total", 0] } },
          name: { $last: "$appliedVouchers.name" },
        },
      },
      { $sort: { platformCost: -1, discount: -1 } },
      { $limit: 8 },
    ]),
    aggregatePayableLedgerEntries(
      scopedLedgerEarningMatch,
      [
        effectiveRangeStage,
        {
          $group: {
            _id: "$restaurantId",
            deliveredOrders: { $sum: 1 },
            grossAmount: { $sum: { $ifNull: ["$grossAmount", 0] } },
            commission: { $sum: { $ifNull: ["$commission", 0] } },
            restaurantPayable: { $sum: { $ifNull: ["$netAmount", 0] } },
            ownerDiscountCost: { $sum: { $ifNull: ["$discountCost", 0] } },
            platformDiscountCost: { $sum: { $ifNull: ["$platformDiscountCost", 0] } },
            deliveryFees: { $sum: { $ifNull: ["$deliveryCost", 0] } },
          },
        },
        { $sort: { commission: -1 } },
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
      ],
    ) as Promise<Array<Record<string, any>>>,
    OrderModel.aggregate<Record<string, any>>([
      {
        $match: {
          status: "Delivered",
          riderId: { $type: "string", $ne: "" },
          ...orderScopeFilter,
        },
      },
      { $addFields: { reportDeliveredAt: deliveredDate } },
      { $match: rangeMatchOn("reportDeliveredAt", range.start, range.end) },
      {
        $group: {
          _id: "$riderId",
          deliveredTrips: { $sum: 1 },
          deliveryFees: { $sum: { $ifNull: ["$pricing.deliveryFee", 0] } },
          deliveredRevenue: { $sum: { $ifNull: ["$pricing.total", 0] } },
          riderName: { $last: "$riderSnapshot.name" },
          riderPhone: { $last: "$riderSnapshot.phone" },
        },
      },
      { $sort: { deliveryFees: -1 } },
      { $limit: 10 },
    ]),
    hasServiceAreaScope
      ? Promise.resolve([])
      : PlatformFinanceEntryModel.aggregate<Record<string, any>>([
          {
            $match: {
              status: "posted",
              occurredAt: { $gte: range.start, $lte: range.end },
            },
          },
          {
            $group: {
              _id: null,
              creditAmount: {
                $sum: {
                  $cond: [{ $eq: ["$direction", "credit"] }, { $ifNull: ["$amount", 0] }, 0],
                },
              },
              debitAmount: {
                $sum: {
                  $cond: [{ $eq: ["$direction", "debit"] }, { $ifNull: ["$amount", 0] }, 0],
                },
              },
              manualIncome: {
                $sum: {
                  $cond: [
                    { $and: [{ $eq: ["$direction", "credit"] }, { $eq: ["$category", "manual_income"] }] },
                    { $ifNull: ["$amount", 0] },
                    0,
                  ],
                },
              },
              manualExpense: {
                $sum: {
                  $cond: [
                    { $and: [{ $eq: ["$direction", "debit"] }, { $in: ["$category", ["manual_expense", "deploy_hosting"]] }] },
                    { $ifNull: ["$amount", 0] },
                    0,
                  ],
                },
              },
              adjustmentCredit: {
                $sum: {
                  $cond: [
                    { $and: [{ $eq: ["$direction", "credit"] }, { $eq: ["$category", "adjustment"] }] },
                    { $ifNull: ["$amount", 0] },
                    0,
                  ],
                },
              },
              adjustmentDebit: {
                $sum: {
                  $cond: [
                    { $and: [{ $eq: ["$direction", "debit"] }, { $eq: ["$category", "adjustment"] }] },
                    { $ifNull: ["$amount", 0] },
                    0,
                  ],
                },
              },
              count: { $sum: 1 },
            },
          },
        ]),
    hasServiceAreaScope
      ? Promise.resolve([])
      : PlatformFinanceEntryModel.find({
          status: "posted",
          occurredAt: { $gte: range.start, $lte: range.end },
        })
          .sort({ occurredAt: -1, createdAt: -1 })
          .limit(10)
          .lean(),
    hasServiceAreaScope
      ? Promise.resolve([])
      : DailyFinanceSnapshotModel.find()
          .sort({ dateKey: -1, closedAt: -1 })
          .limit(7)
          .lean(),
    OrderModel.find({
      status: "Delivered",
      paymentMethod: "Cash",
      paymentStatus: { $ne: "paid" },
      ...orderScopeFilter,
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(8)
      .select({
        orderNumber: 1,
        restaurantId: 1,
        riderId: 1,
        riderSnapshot: 1,
        paymentStatus: 1,
        pricing: 1,
        updatedAt: 1,
        createdAt: 1,
      })
      .lean(),
    getPlatformPayrollSummary(range.start, range.end, riderScopeFilter),
  ]);

  const ledger = ledgerRows[0] ?? {};
  const currentLedger = currentLedgerRows[0] ?? {};
  const delivered = deliveredRows[0] ?? {};
  const onlinePayments = onlinePaymentRows[0] ?? {};
  const refunds = refundRows[0] ?? {};
  const refundLiability = refundLiabilityRows[0] ?? {};
  const payout = payoutRows[0] ?? {};
  const payoutByStatus = currentPayoutRows.reduce<Record<string, { amount: number; count: number }>>(
    (accumulator, row) => {
      const status = stringValue(row._id, "unknown");
      accumulator[status] = {
        amount: numberValue(row.amount),
        count: numberValue(row.count),
      };
      return accumulator;
    },
    {},
  );
  const [riderProfitability, codRestaurants] = await Promise.all([
    buildRiderProfitabilityRows(riderProfitOrderRows, range.start, range.end),
    codReconciliationRows.length
      ? RestaurantModel.find({
          _id: {
            $in: codReconciliationRows
              .map((order) => order.restaurantId)
              .filter(Boolean),
          },
        })
          .select({ name: 1, slug: 1, address: 1 })
          .lean()
      : Promise.resolve([]),
  ]);
  const codRestaurantMap = new Map(
    codRestaurants.map((restaurant) => [objectIdString(restaurant._id), restaurant]),
  );
  const wallet = walletSummaryRows[0] ?? {};
  const walletCreditAmount = numberValue(wallet.creditAmount);
  const walletDebitAmount = numberValue(wallet.debitAmount);
  const manualIncome = numberValue(wallet.manualIncome);
  const manualExpense = numberValue(wallet.manualExpense);
  const walletNetAdjustment = walletCreditAmount - walletDebitAmount;

  const platformCommission = numberValue(ledger.commission);
  const deliveryFeeRevenue = numberValue(delivered.deliveryFees);
  const platformGrossRevenue = platformCommission + deliveryFeeRevenue + manualIncome;
  const platformVoucherCost = numberValue(ledger.platformDiscountCost);
  const riderPayrollExpense = payrollSummary.netPayable;
  const operatingExpense = platformVoucherCost + riderPayrollExpense + manualExpense;
  const netProfit = platformGrossRevenue - operatingExpense;
  const marginPercent =
    platformGrossRevenue > 0 ? Math.round((netProfit / platformGrossRevenue) * 1000) / 10 : 0;

  const onlineCollected = numberValue(onlinePayments.onlineCollected);
  const codCollected = numberValue(delivered.codCollected);
  const refundsPaid = numberValue(refunds.refundsPaid);
  const payoutsPaid = numberValue(payout.payoutsPaid);
  const riderPayrollPaid = payrollSummary.paid;
  const cashIn = onlineCollected + codCollected + walletCreditAmount;
  const cashOut = refundsPaid + payoutsPaid + riderPayrollPaid + walletDebitAmount;
  const estimatedPlatformCash = cashIn - cashOut;

  const restaurantAvailablePayable = numberValue(currentLedger.currentAvailablePayable);
  const restaurantPendingPayable = numberValue(currentLedger.currentPendingPayable);
  const activePayoutReserved =
    numberValue(payoutByStatus.pending?.amount) + numberValue(payoutByStatus.processing?.amount);
  const refundPendingAmount = numberValue(refundLiability.refundPendingAmount);
  const riderPayrollPending = payrollSummary.pending;
  const totalLiabilities =
    restaurantAvailablePayable +
    restaurantPendingPayable +
    activePayoutReserved +
    refundPendingAmount +
    riderPayrollPending;
  const netPositionAfterLiabilities = estimatedPlatformCash - totalLiabilities;

  const ledgerGrossAmount = numberValue(ledger.grossAmount);
  const deliveredSubtotalGross = numberValue(delivered.deliveredSubtotalGross);
  const reconciliationDifference = Math.round(deliveredSubtotalGross - ledgerGrossAmount);
  const reconciliationTolerance = Math.max(5, Math.round(deliveredSubtotalGross * 0.005));
  const alerts: Array<{
    type: "success" | "warning" | "danger" | "info";
    title: string;
    message: string;
    amount?: number;
  }> = [];

  if (Math.abs(reconciliationDifference) > reconciliationTolerance) {
    alerts.push({
      type: "warning",
      title: "Ledger mismatch",
      message: "Delivered order subtotal and restaurant ledger gross are not matching in this timeframe.",
      amount: reconciliationDifference,
    });
  }

  if (netProfit < 0) {
    alerts.push({
      type: "danger",
      title: "Loss making timeframe",
      message: "Platform-funded vouchers and rider payroll are higher than commission plus delivery fee.",
      amount: netProfit,
    });
  }

  if (refundPendingAmount > 0) {
    alerts.push({
      type: "warning",
      title: "Refund liability pending",
      message: "Cancelled or rejected bKash orders still need refund review or payout action.",
      amount: refundPendingAmount,
    });
  }

  if (numberValue(delivered.codUncollected) > 0) {
    alerts.push({
      type: "info",
      title: "COD collection not marked paid",
      message: "Delivered cash orders are not fully marked collected yet.",
      amount: numberValue(delivered.codUncollected),
    });
  }

  if (payrollSummary.salaryNotices.length > 0) {
    alerts.push({
      type: "info",
      title: "Rider salary due soon",
      message: `${payrollSummary.salaryNotices.length} rider salary cycle(s) are due within 3 days based on their own start date.`,
      amount: payrollSummary.salaryNotices.reduce(
        (total, notice) => total + numberValue(notice.monthlySalary),
        0,
      ),
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      type: "success",
      title: "Finance looks synced",
      message: "No major mismatch found for the selected timeframe.",
    });
  }

  const health =
    netPositionAfterLiabilities < 0
      ? "risk"
      : netProfit < 0 || alerts.some((alert) => alert.type === "warning")
        ? "watch"
        : "healthy";

  const series = fillPlatformDailySeries({
    start: range.preset === "lifetime"
      ? startOfDay(new Date(range.end.getTime() - 29 * DAY_MS))
      : range.start,
    end: range.end,
    ledgerRows: dailyLedgerRows,
    orderRows: dailyOrderRows,
    refundRows: dailyRefundRows,
    onlinePaymentRows: dailyOnlinePaymentRows,
    payoutRows: dailyPayoutRows,
  });

  return {
    timeframe: {
      preset: range.preset,
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      days: daysBetween(range.start, range.end),
    },
    health,
    revenue: {
      platformCommission,
      deliveryFeeRevenue,
      platformGrossRevenue,
      deliveredOrders: numberValue(delivered.deliveredOrders),
      deliveredRevenue: numberValue(delivered.deliveredRevenue),
      deliveredSubtotalGross,
    },
    expenses: {
      platformVoucherCost,
      riderPayrollExpense,
      riderBaseSalary: payrollSummary.baseSalary,
      riderPlatformBonus: payrollSummary.platformBonus,
      riderPenalties: payrollSummary.penalties,
      manualExpense,
      operatingExpense,
    },
    profitLoss: {
      grossProfit: platformGrossRevenue - platformVoucherCost,
      netProfit,
      marginPercent,
      status: netProfit >= 0 ? "profit" : "loss",
    },
    cash: {
      onlineCollected,
      codDelivered: numberValue(delivered.codDelivered),
      codCollected,
      codUncollected: numberValue(delivered.codUncollected),
      walletCreditAmount,
      walletDebitAmount,
      walletNetAdjustment,
      cashIn,
      refundsPaid,
      payoutsPaid,
      riderPayrollPaid,
      cashOut,
      estimatedPlatformCash,
      netPositionAfterLiabilities,
    },
    liabilities: {
      restaurantAvailablePayable,
      restaurantPendingPayable,
      activePayoutReserved,
      refundPendingAmount,
      refundPendingCount: numberValue(refundLiability.refundPendingCount),
      riderPayrollPending,
      totalLiabilities,
    },
    reconciliation: {
      orderSubtotalGross: deliveredSubtotalGross,
      ledgerGrossAmount,
      difference: reconciliationDifference,
      tolerance: reconciliationTolerance,
      status: Math.abs(reconciliationDifference) > reconciliationTolerance ? "warning" : "ok",
      alerts,
    },
    series,
    paymentBreakdown: paymentRows.map((row) => ({
      method: stringValue(row._id, "Unknown"),
      orders: numberValue(row.orders),
      amount: numberValue(row.amount),
      collected: numberValue(row.collected),
    })),
    promotionCosts: promotionRows.map((row) => ({
      code: stringValue(row._id?.code),
      name: stringValue(row.name),
      fundedBy: stringValue(row._id?.fundedBy, "owner"),
      uses: numberValue(row.uses),
      discount: numberValue(row.discount),
      platformCost: numberValue(row.platformCost),
      ownerCost: numberValue(row.ownerCost),
      revenue: numberValue(row.revenue),
      roi: numberValue(row.revenue) - numberValue(row.platformCost),
      costToRevenuePercent:
        numberValue(row.revenue) > 0
          ? Math.round((numberValue(row.platformCost) / numberValue(row.revenue)) * 1000) / 10
          : 0,
    })),
    profitByRestaurant: profitByRestaurantRows.map((row) => {
      const platformRevenue = numberValue(row.commission) + numberValue(row.deliveryFees);
      const platformCost = numberValue(row.platformDiscountCost);
      return {
        restaurantId: objectIdString(row._id),
        name: stringValue(row.restaurant?.name, "Restaurant"),
        city: stringValue(row.restaurant?.address?.city, "Netrokona"),
        deliveredOrders: numberValue(row.deliveredOrders),
        grossAmount: numberValue(row.grossAmount),
        commission: numberValue(row.commission),
        deliveryFees: numberValue(row.deliveryFees),
        platformDiscountCost: platformCost,
        restaurantPayable: numberValue(row.restaurantPayable),
        platformRevenue,
        platformProfit: platformRevenue - platformCost,
      };
    }),
    riderProfitability: riderProfitability.map((row) => ({
      ...row,
      costPerTrip:
        row.deliveredTrips > 0
          ? Math.round(row.payrollExpense / row.deliveredTrips)
          : row.payrollExpense,
    })),
    riderSalaryNotices: payrollSummary.salaryNotices
      .sort((left, right) => left.daysUntilDue - right.daysUntilDue)
      .slice(0, 8),
    wallet: {
      creditAmount: walletCreditAmount,
      debitAmount: walletDebitAmount,
      netAdjustment: walletNetAdjustment,
      manualIncome,
      manualExpense,
      adjustmentCredit: numberValue(wallet.adjustmentCredit),
      adjustmentDebit: numberValue(wallet.adjustmentDebit),
      count: numberValue(wallet.count),
      recentEntries: recentWalletRows.map(mapPlatformFinanceEntry),
    },
    dailyClosing: {
      latest: dailyClosingRows[0]
        ? {
            id: objectIdString(dailyClosingRows[0]._id),
            dateKey: stringValue(dailyClosingRows[0].dateKey),
            rangeStart: serializeDate(dailyClosingRows[0].rangeStart),
            rangeEnd: serializeDate(dailyClosingRows[0].rangeEnd),
            summary: dailyClosingRows[0].summary ?? {},
            alerts: Array.isArray(dailyClosingRows[0].alerts) ? dailyClosingRows[0].alerts : [],
            note: stringValue(dailyClosingRows[0].note),
            closedAt: serializeDate(dailyClosingRows[0].closedAt),
          }
        : null,
      recent: dailyClosingRows.map((row) => ({
        id: objectIdString(row._id),
        dateKey: stringValue(row.dateKey),
        netProfit: numberValue(row.summary?.profitLoss?.netProfit),
        platformCash: numberValue(row.summary?.cash?.estimatedPlatformCash),
        liabilities: numberValue(row.summary?.liabilities?.totalLiabilities),
        health: stringValue(row.summary?.health),
        note: stringValue(row.note),
        closedAt: serializeDate(row.closedAt),
      })),
    },
    codReconciliation: {
      pendingAmount: codReconciliationRows.reduce(
        (total, order) => total + numberValue(order.pricing?.total),
        0,
      ),
      pendingCount: codReconciliationRows.length,
      recentPending: codReconciliationRows.map((order) => {
        const restaurant = codRestaurantMap.get(objectIdString(order.restaurantId));
        return {
          orderId: objectIdString(order._id),
          orderNumber: stringValue(order.orderNumber),
          restaurantName: stringValue(restaurant?.name, "Restaurant"),
          riderId: stringValue(order.riderId),
          riderName: stringValue(order.riderSnapshot?.name, "Rider"),
          riderPhone: stringValue(order.riderSnapshot?.phone),
          total: numberValue(order.pricing?.total),
          paymentStatus: stringValue(order.paymentStatus),
          updatedAt: serializeDate(order.updatedAt),
          createdAt: serializeDate(order.createdAt),
        };
      }),
    },
    payoutStatus: {
      pending: payoutByStatus.pending ?? { amount: 0, count: 0 },
      processing: payoutByStatus.processing ?? { amount: 0, count: 0 },
      completed: payoutByStatus.completed ?? { amount: 0, count: 0 },
      failed: payoutByStatus.failed ?? { amount: 0, count: 0 },
      selectedPaid: {
        amount: payoutsPaid,
        count: numberValue(payout.payoutsPaidCount),
      },
    },
    notes: [
      "Platform cash is an operational estimate from order payments, refunds, payouts, and rider payroll. It is not a bank statement.",
      "Restaurant payout is a liability, not a platform expense. Platform profit uses commission, delivery fee, platform-funded discounts, and rider payroll.",
      ...(hasServiceAreaScope
        ? ["Manual wallet entries and daily close snapshots are platform-wide, so they are shown only in All areas view."]
        : []),
    ],
  };
}

export async function listAdminPlatformWalletEntries(params: WalletEntryListParams = {}) {
  const range = buildFinanceRange(params);
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const hasServiceAreaScope = Boolean(params.zoneId || params.districtId);
  if (hasServiceAreaScope) {
    return {
      items: [],
      ...buildPagination(0, page, pageSize),
      summary: {
        creditAmount: 0,
        debitAmount: 0,
        netAmount: 0,
        postedCount: 0,
      },
    };
  }

  const query: Record<string, unknown> = {
    occurredAt: { $gte: range.start, $lte: range.end },
  };

  if (params.direction && params.direction !== "all") {
    query.direction = params.direction;
  }
  if (params.category && params.category !== "all") {
    query.category = params.category;
  }

  const [entries, total, summaryRows] = await Promise.all([
    PlatformFinanceEntryModel.find(query)
      .sort({ occurredAt: -1, createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    PlatformFinanceEntryModel.countDocuments(query),
    PlatformFinanceEntryModel.aggregate<Record<string, any>>([
      { $match: { ...query, status: "posted" } },
      {
        $group: {
          _id: null,
          creditAmount: {
            $sum: {
              $cond: [{ $eq: ["$direction", "credit"] }, { $ifNull: ["$amount", 0] }, 0],
            },
          },
          debitAmount: {
            $sum: {
              $cond: [{ $eq: ["$direction", "debit"] }, { $ifNull: ["$amount", 0] }, 0],
            },
          },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const summary = summaryRows[0] ?? {};
  return {
    items: entries.map(mapPlatformFinanceEntry),
    ...buildPagination(total, page, pageSize),
    summary: {
      creditAmount: numberValue(summary.creditAmount),
      debitAmount: numberValue(summary.debitAmount),
      netAmount: numberValue(summary.creditAmount) - numberValue(summary.debitAmount),
      postedCount: numberValue(summary.count),
    },
  };
}

export async function createAdminPlatformWalletEntry(params: CreateWalletEntryParams) {
  const amount = Math.round(numberValue(params.amount));
  if (amount <= 0) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "INVALID_WALLET_AMOUNT",
      "Wallet entry amount must be greater than zero",
    );
  }

  if (["manual_expense", "deploy_hosting"].includes(params.category) && params.direction !== "debit") {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "INVALID_WALLET_DIRECTION",
      "Expense entries must be debit entries",
    );
  }

  if (
    ["manual_income", "cod_deposit"].includes(params.category) &&
    params.direction !== "credit"
  ) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "INVALID_WALLET_DIRECTION",
      "Manual income and COD deposit must be credit entries",
    );
  }

  const occurredAt = params.occurredAt ? new Date(params.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "INVALID_OCCURRENCE_DATE",
      "Wallet entry date is invalid",
    );
  }

  const entry = await PlatformFinanceEntryModel.create({
    direction: params.direction,
    category: params.category,
    amount,
    paymentMethod: params.paymentMethod?.trim() ?? "",
    reference: params.reference?.trim() ?? "",
    proofUrl: params.proofUrl?.trim() ?? "",
    note: params.note?.trim() ?? "",
    createdByAdminId: params.adminId ?? "",
    occurredAt,
  });

  return mapPlatformFinanceEntry(entry.toObject());
}

export async function voidAdminPlatformWalletEntry(params: {
  entryId: string;
  adminId?: string;
}) {
  const entryId = toObjectId(params.entryId);
  if (!entryId) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "INVALID_WALLET_ENTRY_ID",
      "Wallet entry id is invalid",
    );
  }

  const entry = await PlatformFinanceEntryModel.findOneAndUpdate(
    { _id: entryId, status: "posted" },
    {
      $set: {
        status: "void",
        voidedAt: new Date(),
        voidedByAdminId: params.adminId ?? "",
      },
    },
    { new: true },
  ).lean();

  if (!entry) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "WALLET_ENTRY_NOT_FOUND",
      "Wallet entry was not found or already voided",
    );
  }

  return mapPlatformFinanceEntry(entry);
}

export async function closeAdminDailyFinance(params: CloseDailyFinanceParams = {}) {
  const target = parseDate(params.date) ?? new Date();
  const start = startOfDay(target);
  const end = endOfDay(target);
  const dateKey = start.toISOString().slice(0, 10);
  const finance = await getAdminPlatformFinance({
    preset: "custom",
    from: dateKey,
    to: dateKey,
  });
  const summary = {
    health: finance.health,
    revenue: finance.revenue,
    expenses: finance.expenses,
    profitLoss: finance.profitLoss,
    cash: finance.cash,
    liabilities: finance.liabilities,
    reconciliation: {
      orderSubtotalGross: finance.reconciliation.orderSubtotalGross,
      ledgerGrossAmount: finance.reconciliation.ledgerGrossAmount,
      difference: finance.reconciliation.difference,
      tolerance: finance.reconciliation.tolerance,
      status: finance.reconciliation.status,
    },
  };

  const snapshot = await DailyFinanceSnapshotModel.findOneAndUpdate(
    { dateKey },
    {
      $set: {
        dateKey,
        rangeStart: start,
        rangeEnd: end,
        summary,
        alerts: finance.reconciliation.alerts,
        note: params.note?.trim() ?? "",
        closedByAdminId: params.adminId ?? "",
        closedAt: new Date(),
      },
    },
    { upsert: true, new: true },
  ).lean();

  return {
    id: objectIdString(snapshot?._id),
    dateKey,
    rangeStart: start.toISOString(),
    rangeEnd: end.toISOString(),
    summary,
    alerts: finance.reconciliation.alerts,
    note: params.note?.trim() ?? "",
    closedAt: serializeDate(snapshot?.closedAt),
  };
}

function mapMoneyTransaction(params: {
  id: string;
  direction: "credit" | "debit";
  category: string;
  source: string;
  amount: number;
  occurredAt: unknown;
  status?: string;
  reference?: string;
  paymentMethod?: string;
  actorType?: string;
  actorName?: string;
  actorPhone?: string;
  restaurantId?: string;
  restaurantName?: string;
  orderId?: string;
  orderNumber?: string;
  note?: string;
}) {
  return {
    id: params.id,
    direction: params.direction,
    category: params.category,
    source: params.source,
    amount: Math.round(numberValue(params.amount)),
    occurredAt: serializeDate(params.occurredAt),
    status: params.status ?? "posted",
    reference: params.reference ?? "",
    paymentMethod: params.paymentMethod ?? "",
    actorType: params.actorType ?? "",
    actorName: params.actorName ?? "",
    actorPhone: params.actorPhone ?? "",
    restaurantId: params.restaurantId ?? "",
    restaurantName: params.restaurantName ?? "",
    orderId: params.orderId ?? "",
    orderNumber: params.orderNumber ?? "",
    note: params.note ?? "",
  };
}

function moneyTransactionMatches(
  row: ReturnType<typeof mapMoneyTransaction>,
  params: MoneyTransactionListParams,
  search: string,
) {
  if (params.direction && params.direction !== "all" && row.direction !== params.direction) {
    return false;
  }
  if (params.category && params.category !== "all" && row.category !== params.category) {
    return false;
  }
  if (params.source && params.source !== "all" && row.source !== params.source) {
    return false;
  }
  if (!search) return true;

  const haystack = [
    row.reference,
    row.restaurantName,
    row.orderNumber,
    row.actorName,
    row.actorPhone,
    row.paymentMethod,
    row.note,
    row.category,
    row.source,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(search);
}

export async function listAdminMoneyTransactions(params: MoneyTransactionListParams = {}) {
  const range = buildFinanceRange(params);
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const search = params.search?.trim().toLowerCase() ?? "";
  const orderScopeFilter = buildOrderServiceAreaScopeFilter(params);
  const restaurantScopeFilter = buildRestaurantServiceAreaScopeFilter(params);
  const riderScopeFilter = buildRiderServiceAreaScopeFilter(params);
  const hasServiceAreaScope = Boolean(params.zoneId || params.districtId);
  const [scopedRestaurantsForScope, scopedRidersForScope] = await Promise.all([
    Object.keys(restaurantScopeFilter).length
      ? RestaurantModel.find(restaurantScopeFilter).select({ _id: 1 }).lean()
      : Promise.resolve(null),
    Object.keys(riderScopeFilter).length
      ? RiderModel.find(riderScopeFilter).select({ _id: 1 }).lean()
      : Promise.resolve(null),
  ]);
  const scopedRestaurantIds =
    scopedRestaurantsForScope?.map((restaurant) => restaurant._id) ?? null;
  const scopedRiderIds = scopedRidersForScope?.map((rider) => rider._id) ?? null;

  const [
    onlineOrders,
    codOrders,
    refundOrders,
    payouts,
    payrollCycles,
    walletEntries,
  ] = await Promise.all([
    OrderModel.find({
      ...orderScopeFilter,
      paymentMethod: "Bkash",
      paymentStatus: { $in: ["paid", "refund_pending", "refunded", "refund_rejected"] },
      $or: [
        { "paymentSnapshot.confirmedAt": { $gte: range.start, $lte: range.end } },
        {
          "paymentSnapshot.confirmedAt": null,
          createdAt: { $gte: range.start, $lte: range.end },
        },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(5000)
      .select({
        orderNumber: 1,
        restaurantId: 1,
        customerSnapshot: 1,
        paymentMethod: 1,
        paymentStatus: 1,
        pricing: 1,
        paymentSnapshot: 1,
        createdAt: 1,
      })
      .lean(),
    OrderModel.find({
      ...orderScopeFilter,
      status: "Delivered",
      paymentMethod: "Cash",
      paymentStatus: "paid",
      $or: [
        { "paymentSnapshot.cashCollectedAt": { $gte: range.start, $lte: range.end } },
        {
          "paymentSnapshot.cashCollectedAt": null,
          updatedAt: { $gte: range.start, $lte: range.end },
        },
      ],
    })
      .sort({ updatedAt: -1 })
      .limit(5000)
      .select({
        orderNumber: 1,
        restaurantId: 1,
        customerSnapshot: 1,
        riderSnapshot: 1,
        paymentMethod: 1,
        paymentStatus: 1,
        pricing: 1,
        paymentSnapshot: 1,
        updatedAt: 1,
      })
      .lean(),
    OrderModel.find({
      ...orderScopeFilter,
      paymentMethod: "Bkash",
      paymentStatus: "refunded",
      $or: [
        { "paymentSnapshot.refundReviewedAt": { $gte: range.start, $lte: range.end } },
        {
          "paymentSnapshot.refundReviewedAt": null,
          updatedAt: { $gte: range.start, $lte: range.end },
        },
      ],
    })
      .sort({ updatedAt: -1 })
      .limit(5000)
      .select({
        orderNumber: 1,
        restaurantId: 1,
        customerSnapshot: 1,
        paymentMethod: 1,
        paymentStatus: 1,
        pricing: 1,
        paymentSnapshot: 1,
        updatedAt: 1,
      })
      .lean(),
    PayoutBatchModel.find({
      status: "completed",
      ...(scopedRestaurantIds ? { restaurantId: { $in: scopedRestaurantIds } } : {}),
      $or: [
        { processedAt: { $gte: range.start, $lte: range.end } },
        {
          processedAt: null,
          updatedAt: { $gte: range.start, $lte: range.end },
        },
      ],
    })
      .sort({ processedAt: -1, updatedAt: -1 })
      .limit(5000)
      .lean(),
    RiderPayrollCycleModel.find({
      status: "paid",
      paidAt: { $gte: range.start, $lte: range.end },
      ...(scopedRiderIds ? { riderId: { $in: scopedRiderIds } } : {}),
    })
      .sort({ paidAt: -1 })
      .limit(5000)
      .lean(),
    hasServiceAreaScope
      ? Promise.resolve([])
      : PlatformFinanceEntryModel.find({
          status: "posted",
          occurredAt: { $gte: range.start, $lte: range.end },
        })
          .sort({ occurredAt: -1, createdAt: -1 })
          .limit(5000)
          .lean(),
  ]);

  const restaurantIds = [
    ...onlineOrders.map((order) => order.restaurantId),
    ...codOrders.map((order) => order.restaurantId),
    ...refundOrders.map((order) => order.restaurantId),
    ...payouts.map((payout) => payout.restaurantId),
  ].filter(Boolean);
  const riderIds = payrollCycles.map((cycle) => cycle.riderId).filter(Boolean);

  const [restaurants, riders] = await Promise.all([
    restaurantIds.length
      ? RestaurantModel.find({ _id: { $in: restaurantIds } }).select({ name: 1, slug: 1 }).lean()
      : Promise.resolve([]),
    riderIds.length
      ? RiderModel.find({ _id: { $in: riderIds } }).select({ fullName: 1, phone: 1 }).lean()
      : Promise.resolve([]),
  ]);
  const restaurantMap = new Map(
    restaurants.map((restaurant) => [objectIdString(restaurant._id), restaurant]),
  );
  const riderMap = new Map(riders.map((rider) => [objectIdString(rider._id), rider]));

  const rows = [
    ...onlineOrders.map((order) => {
      const restaurant = restaurantMap.get(objectIdString(order.restaurantId));
      return mapMoneyTransaction({
        id: `order-online:${objectIdString(order._id)}`,
        direction: "credit",
        category: "online_payment",
        source: "order",
        amount: numberValue(order.pricing?.total),
        occurredAt: order.paymentSnapshot?.confirmedAt ?? order.createdAt,
        status: stringValue(order.paymentStatus, "paid"),
        reference: stringValue(order.paymentSnapshot?.transactionId ?? order.orderNumber),
        paymentMethod: "Bkash",
        actorType: "customer",
        actorName: stringValue(order.customerSnapshot?.name),
        actorPhone: stringValue(order.customerSnapshot?.phone),
        restaurantId: objectIdString(order.restaurantId),
        restaurantName: stringValue(restaurant?.name, "Restaurant"),
        orderId: objectIdString(order._id),
        orderNumber: stringValue(order.orderNumber),
        note: "Online payment received from customer",
      });
    }),
    ...codOrders.map((order) => {
      const restaurant = restaurantMap.get(objectIdString(order.restaurantId));
      return mapMoneyTransaction({
        id: `order-cod:${objectIdString(order._id)}`,
        direction: "credit",
        category: "cod_collection",
        source: "order",
        amount: numberValue(order.pricing?.total),
        occurredAt: order.paymentSnapshot?.cashCollectedAt ?? order.updatedAt,
        status: "collected",
        reference: stringValue(order.orderNumber),
        paymentMethod: "Cash",
        actorType: "rider",
        actorName: stringValue(order.riderSnapshot?.name),
        actorPhone: stringValue(order.riderSnapshot?.phone),
        restaurantId: objectIdString(order.restaurantId),
        restaurantName: stringValue(restaurant?.name, "Restaurant"),
        orderId: objectIdString(order._id),
        orderNumber: stringValue(order.orderNumber),
        note: stringValue(order.paymentSnapshot?.cashCollectionNote, "COD marked collected"),
      });
    }),
    ...refundOrders.map((order) => {
      const restaurant = restaurantMap.get(objectIdString(order.restaurantId));
      return mapMoneyTransaction({
        id: `refund:${objectIdString(order._id)}`,
        direction: "debit",
        category: "customer_refund",
        source: "refund",
        amount: numberValue(order.pricing?.total),
        occurredAt: order.paymentSnapshot?.refundReviewedAt ?? order.paymentSnapshot?.refundedAt ?? order.updatedAt,
        status: "refunded",
        reference: stringValue(
          order.paymentSnapshot?.refundProviderReference ??
            order.paymentSnapshot?.transactionId ??
            order.orderNumber,
        ),
        paymentMethod: "Bkash",
        actorType: "customer",
        actorName: stringValue(order.customerSnapshot?.name),
        actorPhone: stringValue(order.customerSnapshot?.phone),
        restaurantId: objectIdString(order.restaurantId),
        restaurantName: stringValue(restaurant?.name, "Restaurant"),
        orderId: objectIdString(order._id),
        orderNumber: stringValue(order.orderNumber),
        note: "Refund paid to customer",
      });
    }),
    ...payouts.map((payout) => {
      const restaurant = restaurantMap.get(objectIdString(payout.restaurantId));
      return mapMoneyTransaction({
        id: `payout:${objectIdString(payout._id)}`,
        direction: "debit",
        category: "restaurant_payout",
        source: "payout",
        amount: numberValue(payout.amount),
        occurredAt: payout.processedAt ?? payout.updatedAt,
        status: stringValue(payout.status, "completed"),
        reference: stringValue(
          payout.providerReference ??
            payout.providerPayoutId ??
            payout.providerTransactionId ??
            payout.batchReference,
        ),
        paymentMethod: stringValue(payout.provider),
        actorType: "restaurant",
        actorName: stringValue(restaurant?.name, "Restaurant"),
        restaurantId: objectIdString(payout.restaurantId),
        restaurantName: stringValue(restaurant?.name, "Restaurant"),
        note: stringValue(payout.processingNote, "Restaurant payout completed"),
      });
    }),
    ...payrollCycles.map((cycle) => {
      const rider = riderMap.get(objectIdString(cycle.riderId));
      const amount = summarizePayrollAmount(
        { payroll: { monthlySalary: numberValue(cycle.baseSalary) } },
        cycle,
      );
      return mapMoneyTransaction({
        id: `payroll:${objectIdString(cycle._id)}`,
        direction: "debit",
        category: "rider_payroll",
        source: "payroll",
        amount: amount.netPayable,
        occurredAt: cycle.paidAt,
        status: "paid",
        reference: stringValue(cycle.paymentReference),
        paymentMethod: "Manual",
        actorType: "rider",
        actorName: stringValue(rider?.fullName, "Rider"),
        actorPhone: stringValue(rider?.phone),
        note: `Rider salary cycle ${stringValue(cycle.month)}`,
      });
    }),
    ...walletEntries.map((entry) =>
      mapMoneyTransaction({
        id: `wallet:${objectIdString(entry._id)}`,
        direction: entry.direction === "debit" ? "debit" : "credit",
        category: stringValue(entry.category, "other"),
        source: "wallet",
        amount: numberValue(entry.amount),
        occurredAt: entry.occurredAt,
        status: stringValue(entry.status, "posted"),
        reference: stringValue(entry.reference),
        paymentMethod: stringValue(entry.paymentMethod),
        note: stringValue(entry.note),
      }),
    ),
  ]
    .filter((row) => moneyTransactionMatches(row, params, search))
    .sort((left, right) => {
      const rightTime = new Date(right.occurredAt ?? 0).getTime();
      const leftTime = new Date(left.occurredAt ?? 0).getTime();
      if (rightTime !== leftTime) return rightTime - leftTime;
      return right.id.localeCompare(left.id);
    });

  const total = rows.length;
  const start = (page - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);
  const summary = rows.reduce(
    (totalSummary, row) => {
      if (row.direction === "credit") {
        totalSummary.creditAmount += row.amount;
        totalSummary.creditCount += 1;
      } else {
        totalSummary.debitAmount += row.amount;
        totalSummary.debitCount += 1;
      }
      return totalSummary;
    },
    {
      creditAmount: 0,
      debitAmount: 0,
      creditCount: 0,
      debitCount: 0,
    },
  );

  return {
    items: pageRows,
    ...buildPagination(total, page, pageSize),
    summary: {
      ...summary,
      netAmount: summary.creditAmount - summary.debitAmount,
      transactionCount: total,
    },
  };
}

export async function listAdminCodReconciliation(params: PageParams = {}) {
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const query = {
    status: "Delivered",
    paymentMethod: "Cash",
  };

  const [orders, total, summaryRows] = await Promise.all([
    OrderModel.find(query)
      .sort({ updatedAt: -1, createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    OrderModel.countDocuments(query),
    OrderModel.aggregate<Record<string, any>>([
      { $match: query },
      {
        $group: {
          _id: "$paymentStatus",
          count: { $sum: 1 },
          amount: { $sum: { $ifNull: ["$pricing.total", 0] } },
        },
      },
    ]),
  ]);

  const restaurantIds = orders.map((order) => order.restaurantId).filter(Boolean);
  const restaurants = await RestaurantModel.find({ _id: { $in: restaurantIds } })
    .select({ name: 1, slug: 1, address: 1 })
    .lean();
  const restaurantById = new Map(
    restaurants.map((restaurant) => [objectIdString(restaurant._id), restaurant]),
  );

  return {
    items: orders.map((order) => {
      const restaurant = restaurantById.get(objectIdString(order.restaurantId));
      return {
        orderId: objectIdString(order._id),
        orderNumber: stringValue(order.orderNumber),
        restaurantId: objectIdString(order.restaurantId),
        restaurantName: stringValue(restaurant?.name, "Restaurant"),
        riderId: stringValue(order.riderId),
        riderName: stringValue(order.riderSnapshot?.name, "Rider"),
        riderPhone: stringValue(order.riderSnapshot?.phone),
        paymentStatus: stringValue(order.paymentStatus),
        total: numberValue(order.pricing?.total),
        cashCollected:
          order.paymentStatus === "paid" || order.paymentSnapshot?.cashCollected === true,
        cashCollectedAt: serializeDate(order.paymentSnapshot?.cashCollectedAt),
        cashCollectionNote: stringValue(order.paymentSnapshot?.cashCollectionNote),
        deliveredAt: serializeDate(order.timestamps?.Delivered ?? order.timestamps?.deliveredAt),
        updatedAt: serializeDate(order.updatedAt),
      };
    }),
    ...buildPagination(total, page, pageSize),
    summary: summaryRows.reduce(
      (accumulator, row) => {
        const status = stringValue(row._id, "pending");
        const amount = numberValue(row.amount);
        const count = numberValue(row.count);
        accumulator.totalAmount += amount;
        accumulator.totalCount += count;
        if (status === "paid") {
          accumulator.collectedAmount += amount;
          accumulator.collectedCount += count;
        } else {
          accumulator.pendingAmount += amount;
          accumulator.pendingCount += count;
        }
        return accumulator;
      },
      {
        totalAmount: 0,
        totalCount: 0,
        collectedAmount: 0,
        collectedCount: 0,
        pendingAmount: 0,
        pendingCount: 0,
      },
    ),
  };
}

export async function listAdminFinancePayouts(params: PayoutListParams) {
  await matureAvailableLedgerEntries();

  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const search = params.search?.trim() ?? "";
  const searchRegex = search ? new RegExp(escapeRegex(search), "i") : null;
  const restaurantQuery: Record<string, unknown> = {
    ...buildRestaurantServiceAreaScopeFilter(params),
  };
  if (searchRegex) {
    restaurantQuery.$or = [
      { name: searchRegex },
      { slug: searchRegex },
      { "address.city": searchRegex },
      { "contact.phone": searchRegex },
    ];
  }

  const financeSettings = await getOperationalFinanceSettings();
  const restaurants = await RestaurantModel.find(restaurantQuery)
    .select({
      ownerId: 1,
      name: 1,
      slug: 1,
      address: 1,
      contact: 1,
      runtime: 1,
      serviceArea: 1,
      logo: 1,
      updatedAt: 1,
    })
    .lean();
  const restaurantIds = restaurants.map((restaurant) => restaurant._id);
  const ownerIds = restaurants.map((restaurant) => restaurant.ownerId).filter(Boolean);

  const [
    owners,
    payoutMethods,
    ledgerSummary,
    payoutSummary,
    activePayouts,
  ] = await Promise.all([
    OwnerModel.find({ _id: { $in: ownerIds } })
      .select({ fullName: 1, phone: 1, email: 1, status: 1 })
      .lean(),
    PayoutMethodModel.find({ restaurantId: { $in: restaurantIds } }).lean(),
    getLedgerSummaryByRestaurant(restaurantIds),
    getPayoutSummaryByRestaurant(restaurantIds),
    PayoutBatchModel.find({
      restaurantId: { $in: restaurantIds },
      status: { $in: ["pending", "processing"] },
    })
      .sort({ requestedAt: -1, createdAt: -1 })
      .lean(),
  ]);

  const ownerById = new Map(owners.map((owner) => [objectIdString(owner._id), owner]));
  const payoutMethodByRestaurantId = new Map(
    payoutMethods.map((method) => [objectIdString(method.restaurantId), method]),
  );
  const activePayoutByRestaurantId = new Map(
    activePayouts.map((payout) => [objectIdString(payout.restaurantId), payout]),
  );

  let rows = restaurants.map((restaurant) => {
    const restaurantId = objectIdString(restaurant._id);
    const ledger = ledgerSummary.get(restaurantId) ?? emptyFinanceSummary();
    const finance = mergeFinanceSummary(
      ledger,
      payoutSummary.get(restaurantId),
    );
    return mapRestaurantFinanceRow({
      restaurant,
      owner: ownerById.get(objectIdString(restaurant.ownerId)),
      payoutMethod: payoutMethodByRestaurantId.get(restaurantId),
      activePayout: activePayoutByRestaurantId.get(restaurantId),
      finance,
      minimumPayoutAmountTaka: financeSettings.minimumPayoutAmountTaka,
      oneActivePayoutRequest: financeSettings.oneActivePayoutRequest,
    });
  });

  if (params.eligibility && params.eligibility !== "all") {
    rows = rows.filter((row) => row.eligibility.status === params.eligibility);
  }

  rows.sort((left, right) => {
    switch (params.sortBy) {
      case "pending_desc":
        return right.finance.pendingBalance - left.finance.pendingBalance;
      case "recent_request":
        return (
          new Date(right.finance.lastRequestedAt ?? 0).getTime() -
          new Date(left.finance.lastRequestedAt ?? 0).getTime()
        );
      case "name_asc":
        return left.restaurant.name.localeCompare(right.restaurant.name);
      case "available_desc":
      default:
        return right.finance.availableBalance - left.finance.availableBalance;
    }
  });

  const summary = rows.reduce(
    (accumulator, row) => {
      accumulator.availableBalance += row.finance.availableBalance;
      accumulator.pendingBalance += row.finance.pendingBalance;
      accumulator.paidOutBalance += row.finance.paidOutBalance;
      accumulator.payoutRequestedAmount += row.finance.payoutRequestedAmount;
      accumulator.payoutProcessingAmount += row.finance.payoutProcessingAmount;
      accumulator.payoutCompletedAmount += row.finance.payoutCompletedAmount;
      if (row.eligibility.status === "eligible") accumulator.eligibleRestaurants += 1;
      if (row.eligibility.status === "pending_request") accumulator.pendingRequestRestaurants += 1;
      if (row.eligibility.status === "blocked") accumulator.blockedRestaurants += 1;
      return accumulator;
    },
    {
      restaurants: rows.length,
      eligibleRestaurants: 0,
      blockedRestaurants: 0,
      pendingRequestRestaurants: 0,
      availableBalance: 0,
      pendingBalance: 0,
      paidOutBalance: 0,
      payoutRequestedAmount: 0,
      payoutProcessingAmount: 0,
      payoutCompletedAmount: 0,
    },
  );

  const total = rows.length;
  const start = (page - 1) * pageSize;

  return {
    items: rows.slice(start, start + pageSize),
    ...buildPagination(total, page, pageSize),
    summary,
    settings: {
      settlementDelayDays: financeSettings.settlementDelayDays,
      minimumPayoutAmountEnabled: financeSettings.minimumPayoutAmountEnabled !== false,
      minimumPayoutAmountTaka: financeSettings.minimumPayoutAmountTaka,
      oneActivePayoutRequest: financeSettings.oneActivePayoutRequest,
    },
  };
}

export async function listAdminPayoutMethodApprovals(params: {
  zoneId?: string;
  districtId?: string;
} = {}) {
  const query: Record<string, unknown> = {
    pendingVerificationStatus: "admin_pending",
    pendingAccountNumber: { $nin: [null, ""] },
  };
  const restaurantScopeFilter = buildRestaurantServiceAreaScopeFilter(params);
  if (Object.keys(restaurantScopeFilter).length) {
    const restaurants = await RestaurantModel.find(restaurantScopeFilter)
      .select({ _id: 1 })
      .lean();
    query.restaurantId = { $in: restaurants.map((restaurant) => restaurant._id) };
  }

  const methods = await PayoutMethodModel.find(query)
    .populate({
      path: "restaurantId",
      select: "name address ownerId",
      populate: {
        path: "ownerId",
        select: "fullName phone",
      },
    })
    .sort({ pendingVerifiedAt: 1, updatedAt: 1 })
    .limit(100)
    .lean();

  return {
    items: methods.map(mapPayoutMethodApproval),
    total: methods.length,
  };
}

export async function reviewAdminPayoutMethodApproval(params: {
  methodId: string;
  decision: "approved" | "rejected";
  note?: string;
  adminId?: string;
}) {
  const methodId = toObjectId(params.methodId);
  if (!methodId) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "INVALID_PAYOUT_METHOD_ID",
      "Payout method id is invalid",
    );
  }

  const method = await PayoutMethodModel.findById(methodId);
  if (!method) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "PAYOUT_METHOD_NOT_FOUND",
      "Payout method not found",
    );
  }

  if (
    method.pendingVerificationStatus !== "admin_pending" ||
    !method.pendingAccountNumber
  ) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "PAYOUT_METHOD_APPROVAL_NOT_PENDING",
      "No admin approval is pending for this payout method",
    );
  }

  const restaurant = await RestaurantModel.findById(method.restaurantId)
    .select({ ownerId: 1 })
    .lean();

  if (!restaurant?.ownerId) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "PAYOUT_OWNER_NOT_FOUND",
      "Restaurant owner is missing",
    );
  }

  const note = params.note?.trim() ?? "";
  const approved = params.decision === "approved";
  const previousPendingNumber = method.pendingAccountNumber;

  if (approved) {
    method.type = method.pendingType || "bkash";
    method.accountName = method.pendingAccountName || method.accountName;
    method.accountNumber = method.pendingAccountNumber;
    method.bankName = method.pendingBankName || "";
    method.branchName = method.pendingBranchName || "";
    method.isVerified = true;
    method.verifiedAt = method.pendingVerifiedAt ?? new Date();
    method.verificationSource = "admin_approved";
    method.pendingType = null;
    method.pendingAccountName = "";
    method.pendingAccountNumber = null;
    method.pendingBankName = "";
    method.pendingBranchName = "";
    method.pendingVerificationStatus = null;
    method.pendingVerifiedAt = null;
    method.pendingAdminNote = "";
  } else {
    method.pendingVerificationStatus = "rejected";
    method.pendingAdminNote = note || "Rejected by admin";
    method.verificationSource = "admin_rejected";
  }

  await method.save();
  invalidateOwnerFinanceCaches(objectIdString(method.restaurantId));
  await resolveAdminOperationalAlertByDedupeKey(
    `payout-method-approval:${objectIdString(method._id)}:${previousPendingNumber}`,
  ).catch(() => undefined);

  await createAdminAuditLog({
    adminId: params.adminId,
    entityType: "restaurant",
    entityId: objectIdString(method.restaurantId),
    action: approved ? "payout_method.approved" : "payout_method.rejected",
    title: approved ? "Payout method approved" : "Payout method rejected",
    description: approved
      ? `Approved payout number ${previousPendingNumber}.`
      : `Rejected payout number ${previousPendingNumber}.`,
    metadata: {
      payoutMethodId: objectIdString(method._id),
      pendingAccountNumber: previousPendingNumber,
      note,
    },
  });

  await notifyOwnerPayoutMethodReview({
    ownerId: objectIdString(restaurant.ownerId),
    restaurantId: objectIdString(method.restaurantId),
    methodId: objectIdString(method._id),
    approved,
    note,
  }).catch(() => undefined);

  return mapPayoutMethod(method.toObject());
}

export async function getAdminFinancePayoutDetails(restaurantId: string) {
  const safeRestaurantId = toObjectId(restaurantId);
  if (!safeRestaurantId) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "INVALID_RESTAURANT_ID",
      "Restaurant id is invalid",
    );
  }

  await matureAvailableLedgerEntries(safeRestaurantId);

  const financeSettings = await getOperationalFinanceSettings();
  const restaurant = await RestaurantModel.findById(safeRestaurantId)
    .select({
      ownerId: 1,
      name: 1,
      slug: 1,
      address: 1,
      contact: 1,
      runtime: 1,
      logo: 1,
    })
    .lean();

  if (!restaurant) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "RESTAURANT_NOT_FOUND",
      "Restaurant not found",
    );
  }

  const [
    owner,
    payoutMethod,
    ledgerSummary,
    payoutSummary,
    activePayout,
    recentPayouts,
    recentLedgerEntries,
    availableLedgerEntries,
  ] = await Promise.all([
    OwnerModel.findById(restaurant.ownerId)
      .select({ fullName: 1, phone: 1, email: 1, status: 1 })
      .lean(),
    PayoutMethodModel.findOne({ restaurantId: safeRestaurantId }).lean(),
    getLedgerSummaryByRestaurant([safeRestaurantId]),
    getPayoutSummaryByRestaurant([safeRestaurantId]),
    PayoutBatchModel.findOne({
      restaurantId: safeRestaurantId,
      status: { $in: ["pending", "processing"] },
    })
      .sort({ requestedAt: -1, createdAt: -1 })
      .lean(),
    PayoutBatchModel.find({ restaurantId: safeRestaurantId })
      .sort({ requestedAt: -1, createdAt: -1 })
      .limit(20)
      .lean(),
    aggregatePayableLedgerEntries(
      { restaurantId: safeRestaurantId },
      [{ $sort: { createdAt: -1 } }, { $limit: 50 }],
    ),
    aggregatePayableLedgerEntries(
      {
        restaurantId: safeRestaurantId,
        entryType: { $in: [...walletLedgerEntryTypes] },
        settlementStatus: "available",
      },
      [{ $sort: { availableAt: 1, createdAt: 1 } }, { $limit: 100 }],
    ),
  ]);

  const reservedLedgerEntries = activePayout
    ? await aggregatePayableLedgerEntries(
        {
          restaurantId: safeRestaurantId,
          payoutBatchId: activePayout._id,
          entryType: { $in: [...walletLedgerEntryTypes] },
          settlementStatus: "paid_out",
        },
        [{ $sort: { createdAt: -1 } }, { $limit: 100 }],
      )
    : [];

  const finance = mergeFinanceSummary(
    ledgerSummary.get(restaurantId) ?? emptyFinanceSummary(),
    payoutSummary.get(restaurantId),
  );
  const baseRow = mapRestaurantFinanceRow({
    restaurant,
    owner,
    payoutMethod,
    activePayout,
    finance,
    minimumPayoutAmountTaka: financeSettings.minimumPayoutAmountTaka,
    oneActivePayoutRequest: financeSettings.oneActivePayoutRequest,
  });

  const orderIds = [
    ...recentLedgerEntries.map((entry) => entry.orderId).filter(Boolean),
    ...availableLedgerEntries.map((entry) => entry.orderId).filter(Boolean),
    ...reservedLedgerEntries.map((entry) => entry.orderId).filter(Boolean),
  ];
  const orders = orderIds.length
    ? await OrderModel.find({ _id: { $in: orderIds } })
        .select({ orderNumber: 1, status: 1, paymentMethod: 1, paymentStatus: 1, pricing: 1 })
        .lean()
    : [];
  const orderById = new Map(orders.map((order) => [objectIdString(order._id), order]));

  const mapLedgerEntry = (entry: Record<string, any>) => {
    const order = orderById.get(objectIdString(entry.orderId));
    return {
      id: objectIdString(entry._id),
      restaurantId: objectIdString(entry.restaurantId),
      restaurantName: stringValue(restaurant.name),
      restaurantCity: stringValue(restaurant.address?.city, "Netrokona"),
      orderId: objectIdString(entry.orderId),
      orderNumber: stringValue(order?.orderNumber),
      orderStatus: stringValue(order?.status),
      paymentMethod: stringValue(order?.paymentMethod),
      paymentStatus: stringValue(order?.paymentStatus),
      payoutBatchId: objectIdString(entry.payoutBatchId),
      payoutReference: "",
      payoutStatus: "",
      sourceEntityType: stringValue(entry.sourceEntityType),
      sourceEntityId: stringValue(entry.sourceEntityId),
      sourceLabel: getLedgerSourceLabel(entry),
      isCarryForward: isCarryForwardLedgerEntry(entry),
      serviceArea: entry.serviceAreaSnapshot ?? {},
      entryType: stringValue(entry.entryType),
      grossAmount: numberValue(entry.grossAmount),
      commissionBase: numberValue(entry.commissionBase),
      commission: numberValue(entry.commission),
      discountCost: numberValue(entry.discountCost),
      platformDiscountCost: numberValue(entry.platformDiscountCost),
      deliveryCost: numberValue(entry.deliveryCost),
      netAmount: numberValue(entry.netAmount),
      settlementStatus: stringValue(entry.settlementStatus),
      availableAt: serializeDate(entry.availableAt),
      createdAt: serializeDate(entry.createdAt),
      updatedAt: serializeDate(entry.updatedAt),
    };
  };

  return {
    ...baseRow,
    settings: {
      settlementDelayDays: financeSettings.settlementDelayDays,
      minimumPayoutAmountEnabled: financeSettings.minimumPayoutAmountEnabled !== false,
      minimumPayoutAmountTaka: financeSettings.minimumPayoutAmountTaka,
      oneActivePayoutRequest: financeSettings.oneActivePayoutRequest,
    },
    recentPayouts: recentPayouts.map(mapPayoutBatch),
    recentLedgerEntries: recentLedgerEntries.map(mapLedgerEntry),
    availableLedgerEntries: availableLedgerEntries.map(mapLedgerEntry),
    reservedLedgerEntries: reservedLedgerEntries.map(mapLedgerEntry),
  };
}

export async function createAdminFinancePayout(params: CreateAdminPayoutParams) {
  const restaurantId = toObjectId(params.restaurantId);
  if (!restaurantId) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "INVALID_RESTAURANT_ID",
      "Restaurant id is invalid",
    );
  }

  const amount = Math.round(numberValue(params.amount));
  if (amount <= 0) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "INVALID_PAYOUT_AMOUNT",
      "Payout amount must be greater than zero",
    );
  }

  const status = params.status ?? "processing";
  const reference = params.providerReference?.trim() ?? "";
  const providerPayoutId = params.providerPayoutId?.trim() ?? reference;
  const providerTransactionId = params.providerTransactionId?.trim() ?? reference;
  const now = new Date();

  if (status === "completed" && !reference && !providerPayoutId && !providerTransactionId) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "PAYOUT_REFERENCE_REQUIRED",
      "Add a bKash or bank reference before completing payout",
    );
  }

  if (params.includePending && !params.note?.trim()) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "EARLY_PAYOUT_NOTE_REQUIRED",
      "Add an admin note when paying pending settlement early",
    );
  }

  const [restaurant, payoutMethod, financeSettings] = await Promise.all([
    RestaurantModel.findById(restaurantId).select({ name: 1, ownerId: 1 }).lean(),
    PayoutMethodModel.findOne({ restaurantId }).lean(),
    getOperationalFinanceSettings(),
  ]);

  if (!restaurant) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "RESTAURANT_NOT_FOUND",
      "Restaurant not found",
    );
  }

  if (!payoutMethod || !stringValue(payoutMethod.accountNumber).trim()) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "PAYOUT_METHOD_REQUIRED",
      "Restaurant needs a payout method before admin payout",
    );
  }

  if (payoutMethod.isVerified !== true) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "PAYOUT_METHOD_NOT_VERIFIED",
      "Restaurant payout method must be verified before payout",
    );
  }

  if (financeSettings.oneActivePayoutRequest) {
    const activePayout = await PayoutBatchModel.exists({
      restaurantId,
      status: { $in: ["pending", "processing"] },
    });
    if (activePayout) {
      throw new AppError(
        StatusCodes.CONFLICT,
        "ACTIVE_PAYOUT_REQUEST_EXISTS",
        "A payout is already pending or processing for this restaurant",
      );
    }
  }

  const session = await mongoose.startSession();
  let createdPayout: Record<string, any> | null = null;

  try {
    await session.withTransaction(async () => {
      await reconcileRestaurantLedgerStatuses(
        String(restaurantId),
        financeSettings.settlementDelayDays,
      );

      const selectableEntries = await aggregatePayableLedgerEntries(
        {
          restaurantId,
          entryType: { $in: [...walletLedgerEntryTypes] },
          settlementStatus: params.includePending
            ? { $in: ["available", "pending"] }
            : "available",
          netAmount: { $gt: 0 },
        },
        [
          { $sort: { availableAt: 1, createdAt: 1 } },
          { $project: { _id: 1, netAmount: 1 } },
        ],
      );

      const selectedEntryIds: mongoose.Types.ObjectId[] = [];
      let selectedTotal = 0;

      for (const entry of selectableEntries as Array<{ _id: mongoose.Types.ObjectId; netAmount?: number }>) {
        if (selectedTotal >= amount) break;
        selectedEntryIds.push(entry._id);
        selectedTotal += numberValue(entry.netAmount);
      }

      if (selectedTotal < amount || selectedEntryIds.length === 0) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          "PAYOUT_AMOUNT_EXCEEDS_AVAILABLE",
          "Payout amount exceeds available payable balance",
        );
      }

      const [payoutBatch] = await PayoutBatchModel.create(
        [
          {
            restaurantId,
            methodId: payoutMethod._id,
            amount,
            status,
            provider: payoutMethod.type === "bkash" ? "bkash" : "bank",
            batchReference: `ADM-PO-${Date.now()}`,
            providerReference: reference,
            providerPayoutId,
            providerTransactionId,
            paymentProofUrl: params.paymentProofUrl?.trim() ?? "",
            processingNote: params.note?.trim() ?? "Admin-created payout",
            approvedByAdminId: params.adminId ?? "",
            approvedAt: now,
            processedByAdminId: status === "completed" ? params.adminId ?? "" : "",
            requestedAt: now,
            processedAt: status === "completed" ? now : null,
          },
        ],
        { session },
      );

      const reserveResult = await LedgerEntryModel.updateMany(
        {
          _id: { $in: selectedEntryIds },
          restaurantId,
          settlementStatus: params.includePending
            ? { $in: ["available", "pending"] }
            : "available",
        },
        {
          $set: {
            settlementStatus: "paid_out",
            payoutBatchId: payoutBatch._id,
          },
        },
        { session },
      );

      if (reserveResult.modifiedCount !== selectedEntryIds.length) {
        throw new AppError(
          StatusCodes.CONFLICT,
          "PAYOUT_BALANCE_CHANGED",
          "Available payout balance changed. Please retry",
        );
      }

      await LedgerEntryModel.create(
        [
          {
            restaurantId,
            payoutBatchId: payoutBatch._id,
            sourceEntityType: "payout_batch",
            sourceEntityId: payoutBatch.id,
            entryType: "payout",
            netAmount: -amount,
            settlementStatus: status === "completed" ? "paid_out" : "pending",
            availableAt: now,
          },
        ],
        { session },
      );

      const residualAmount = Number((selectedTotal - amount).toFixed(2));
      if (residualAmount > 0) {
        await LedgerEntryModel.create(
          [
            {
              restaurantId,
              payoutBatchId: payoutBatch._id,
              sourceEntityType: "payout_residual",
              sourceEntityId: payoutBatch.id,
              entryType: "adjustment",
              netAmount: residualAmount,
              settlementStatus: "available",
              availableAt: now,
            },
          ],
          { session },
        );
      }

      createdPayout = payoutBatch.toObject();
    });
  } finally {
    await session.endSession();
  }

  const savedPayout = createdPayout as Record<string, any> | null;

  if (!savedPayout) {
    throw new AppError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      "PAYOUT_CREATE_FAILED",
      "Admin payout could not be created",
    );
  }

  invalidateOwnerFinanceCaches(String(restaurantId));
  if (restaurant.ownerId) {
    await notifyOwnerPayoutStatus({
      ownerId: objectIdString(restaurant.ownerId),
      restaurantId: String(restaurantId),
      payoutId: objectIdString(savedPayout._id),
      amount: numberValue(savedPayout.amount),
      status,
      restaurantName: stringValue(restaurant.name),
      reference:
        providerTransactionId ||
        providerPayoutId ||
        reference ||
        stringValue(savedPayout.batchReference),
      sendSms: params.notifyOwnerSms === true,
    }).catch(() => undefined);
  }

  return mapPayoutBatch(savedPayout);
}

export async function listAdminFinanceLedger(params: LedgerListParams) {
  await matureAvailableLedgerEntries();

  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const query: Record<string, any> = {};
  const restaurantId = toObjectId(params.restaurantId);

  if (restaurantId) query.restaurantId = restaurantId;
  Object.assign(query, buildOrderServiceAreaScopeFilter(params));
  if (params.entryType && params.entryType !== "all") {
    query.entryType = params.entryType;
  }
  if (params.settlementStatus && params.settlementStatus !== "all") {
    query.settlementStatus = params.settlementStatus;
  }

  const search = params.search?.trim() ?? "";
  if (search) {
    const regex = new RegExp(escapeRegex(search), "i");
    const [matchingRestaurants, matchingOrders] = await Promise.all([
      RestaurantModel.find({
        $or: [{ name: regex }, { slug: regex }, { "address.city": regex }],
      })
        .select({ _id: 1 })
        .limit(50)
        .lean(),
      OrderModel.find({ orderNumber: regex })
        .select({ _id: 1 })
        .limit(50)
        .lean(),
    ]);
    query.$or = [
      { sourceEntityId: regex },
      { sourceEntityType: regex },
      { restaurantId: { $in: matchingRestaurants.map((row) => row._id) } },
      { orderId: { $in: matchingOrders.map((row) => row._id) } },
    ];
  }

  const sort: Record<string, 1 | -1> =
    params.sortBy === "oldest"
      ? { createdAt: 1 }
      : params.sortBy === "highest_net"
        ? { netAmount: -1 }
        : params.sortBy === "lowest_net"
          ? { netAmount: 1 }
          : { createdAt: -1 };

  const [entries, totalRows, summaryRows] = await Promise.all([
    aggregatePayableLedgerEntries(query, [
      { $sort: sort },
      { $skip: (page - 1) * pageSize },
      { $limit: pageSize },
    ]) as Promise<Record<string, any>[]>,
    aggregatePayableLedgerEntries(query, [
      { $count: "total" },
    ]) as Promise<Array<{ total: number }>>,
    aggregatePayableLedgerEntries(query, [
      {
        $addFields: {
          countsInSettlementTotals: {
            $not: [
              {
                $in: [
                  "$sourceEntityType",
                  [...payoutResidualSourceTypes],
                ],
              },
            ],
          },
          isCarryForwardBalance: {
            $in: ["$sourceEntityType", [...payoutResidualSourceTypes]],
          },
        },
      },
      {
        $group: {
          _id: null,
          grossAmount: {
            $sum: {
              $cond: ["$countsInSettlementTotals", { $ifNull: ["$grossAmount", 0] }, 0],
            },
          },
          commissionBase: {
            $sum: {
              $cond: [
                "$countsInSettlementTotals",
                { $ifNull: ["$commissionBase", "$grossAmount"] },
                0,
              ],
            },
          },
          commission: {
            $sum: {
              $cond: ["$countsInSettlementTotals", { $ifNull: ["$commission", 0] }, 0],
            },
          },
          discountCost: {
            $sum: {
              $cond: ["$countsInSettlementTotals", { $ifNull: ["$discountCost", 0] }, 0],
            },
          },
          platformDiscountCost: {
            $sum: {
              $cond: [
                "$countsInSettlementTotals",
                { $ifNull: ["$platformDiscountCost", 0] },
                0,
              ],
            },
          },
          deliveryCost: {
            $sum: {
              $cond: ["$countsInSettlementTotals", { $ifNull: ["$deliveryCost", 0] }, 0],
            },
          },
          netAmount: {
            $sum: {
              $cond: ["$countsInSettlementTotals", { $ifNull: ["$netAmount", 0] }, 0],
            },
          },
          carryForwardBalance: {
            $sum: {
              $cond: [
                {
                  $and: [
                    "$isCarryForwardBalance",
                    { $in: ["$settlementStatus", ["available", "pending"]] },
                  ],
                },
                { $ifNull: ["$netAmount", 0] },
                0,
              ],
            },
          },
          carryForwardAvailableBalance: {
            $sum: {
              $cond: [
                {
                  $and: [
                    "$isCarryForwardBalance",
                    { $eq: ["$settlementStatus", "available"] },
                  ],
                },
                { $ifNull: ["$netAmount", 0] },
                0,
              ],
            },
          },
          carryForwardPendingBalance: {
            $sum: {
              $cond: [
                {
                  $and: [
                    "$isCarryForwardBalance",
                    { $eq: ["$settlementStatus", "pending"] },
                  ],
                },
                { $ifNull: ["$netAmount", 0] },
                0,
              ],
            },
          },
          carryForwardPaidOutBalance: {
            $sum: {
              $cond: [
                {
                  $and: [
                    "$isCarryForwardBalance",
                    { $eq: ["$settlementStatus", "paid_out"] },
                  ],
                },
                { $ifNull: ["$netAmount", 0] },
                0,
              ],
            },
          },
          pending: {
            $sum: {
              $cond: [{ $eq: ["$settlementStatus", "pending"] }, 1, 0],
            },
          },
          available: {
            $sum: {
              $cond: [{ $eq: ["$settlementStatus", "available"] }, 1, 0],
            },
          },
          paidOut: {
            $sum: {
              $cond: [{ $eq: ["$settlementStatus", "paid_out"] }, 1, 0],
            },
          },
        },
      },
    ]) as Promise<Record<string, unknown>[]>,
  ]);
  const total = numberValue(totalRows[0]?.total);

  const restaurantIds = entries.map((entry) => entry.restaurantId).filter(Boolean);
  const orderIds = entries.map((entry) => entry.orderId).filter(Boolean);
  const payoutIds = entries.map((entry) => entry.payoutBatchId).filter(Boolean);

  const [restaurants, orders, payouts] = await Promise.all([
    RestaurantModel.find({ _id: { $in: restaurantIds } })
      .select({ name: 1, slug: 1, address: 1 })
      .lean(),
    OrderModel.find({ _id: { $in: orderIds } })
      .select({ orderNumber: 1, status: 1, paymentMethod: 1, paymentStatus: 1 })
      .lean(),
    PayoutBatchModel.find({ _id: { $in: payoutIds } })
      .select({ batchReference: 1, status: 1, amount: 1 })
      .lean(),
  ]);

  const restaurantById = new Map(
    restaurants.map((restaurant) => [objectIdString(restaurant._id), restaurant]),
  );
  const orderById = new Map(orders.map((order) => [objectIdString(order._id), order]));
  const payoutById = new Map(payouts.map((payout) => [objectIdString(payout._id), payout]));

  const items = entries.map((entry) => {
    const restaurant = restaurantById.get(objectIdString(entry.restaurantId));
    const order = orderById.get(objectIdString(entry.orderId));
    const payout = payoutById.get(objectIdString(entry.payoutBatchId));

    return {
      id: objectIdString(entry._id),
      restaurantId: objectIdString(entry.restaurantId),
      restaurantName: stringValue(restaurant?.name),
      restaurantCity: stringValue(restaurant?.address?.city, "Netrokona"),
      orderId: objectIdString(entry.orderId),
      orderNumber: stringValue(order?.orderNumber),
      orderStatus: stringValue(order?.status),
      paymentMethod: stringValue(order?.paymentMethod),
      paymentStatus: stringValue(order?.paymentStatus),
      payoutBatchId: objectIdString(entry.payoutBatchId),
      payoutReference: stringValue(payout?.batchReference),
      payoutStatus: stringValue(payout?.status),
      sourceEntityType: stringValue(entry.sourceEntityType),
      sourceEntityId: stringValue(entry.sourceEntityId),
      sourceLabel: getLedgerSourceLabel(entry),
      isCarryForward: isCarryForwardLedgerEntry(entry),
      entryType: stringValue(entry.entryType),
      grossAmount: numberValue(entry.grossAmount),
      commissionBase: numberValue(entry.commissionBase),
      commission: numberValue(entry.commission),
      discountCost: numberValue(entry.discountCost),
      platformDiscountCost: numberValue(entry.platformDiscountCost),
      deliveryCost: numberValue(entry.deliveryCost),
      netAmount: numberValue(entry.netAmount),
      settlementStatus: stringValue(entry.settlementStatus),
      availableAt: serializeDate(entry.availableAt),
      createdAt: serializeDate(entry.createdAt),
      updatedAt: serializeDate(entry.updatedAt),
    };
  });

  const summary = toFinanceSummary(summaryRows[0]);

  return {
    items,
    ...buildPagination(total, page, pageSize),
    summary: {
      ...summary,
      pendingEntries: numberValue(summaryRows[0]?.pending),
      availableEntries: numberValue(summaryRows[0]?.available),
      paidOutEntries: numberValue(summaryRows[0]?.paidOut),
    },
  };
}

export async function listAdminFinanceRefunds(params: RefundListParams) {
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const restaurantId = toObjectId(params.restaurantId);
  const query: Record<string, any> = {
    $or: [
      {
        paymentMethod: "Bkash",
        paymentStatus: { $in: ["refund_pending", "refunded", "refund_rejected"] },
      },
      {
        status: { $in: ["Cancelled", "Rejected"] },
        paymentMethod: "Bkash",
        paymentStatus: { $in: ["paid", "refund_pending", "refunded", "refund_rejected"] },
      },
    ],
  };

  if (restaurantId) query.restaurantId = restaurantId;
  Object.assign(query, buildOrderServiceAreaScopeFilter(params));

  if (params.status && params.status !== "all") {
    if (params.status === "needs_review") {
      query.paymentStatus = { $in: ["paid", "refund_pending"] };
      query.status = { $in: ["Cancelled", "Rejected"] };
    } else {
      query.paymentStatus = params.status;
    }
  }

  const search = params.search?.trim() ?? "";
  if (search) {
    const regex = new RegExp(escapeRegex(search), "i");
    const matchingRestaurants = await RestaurantModel.find({
      $or: [{ name: regex }, { slug: regex }, { "address.city": regex }],
    })
      .select({ _id: 1 })
      .limit(50)
      .lean();

    query.$and = [
      {
        $or: [
          { orderNumber: regex },
          { "customerSnapshot.fullName": regex },
          { "customerSnapshot.name": regex },
          { "customerSnapshot.phone": regex },
          { restaurantId: { $in: matchingRestaurants.map((row) => row._id) } },
        ],
      },
    ];
  }

  const sort: Record<string, 1 | -1> =
    params.sortBy === "oldest"
      ? { createdAt: 1 }
      : params.sortBy === "highest_value"
        ? { "pricing.total": -1 }
        : params.sortBy === "recently_updated"
          ? { updatedAt: -1 }
          : { createdAt: -1 };

  const [orders, total, summaryRows] = await Promise.all([
    OrderModel.find(query)
      .sort(sort)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    OrderModel.countDocuments(query),
    OrderModel.aggregate<Record<string, unknown>>([
      { $match: query },
      {
        $group: {
          _id: "$paymentStatus",
          count: { $sum: 1 },
          amount: { $sum: { $ifNull: ["$pricing.total", 0] } },
          discount: { $sum: { $ifNull: ["$pricing.discount", 0] } },
        },
      },
    ]),
  ]);

  const restaurantIds = orders.map((order) => order.restaurantId).filter(Boolean);
  const restaurants = await RestaurantModel.find({ _id: { $in: restaurantIds } })
    .select({ name: 1, slug: 1, address: 1 })
    .lean();
  const restaurantById = new Map(
    restaurants.map((restaurant) => [objectIdString(restaurant._id), restaurant]),
  );

  const items = orders.map((order) => {
    const restaurant = restaurantById.get(objectIdString(order.restaurantId));
    return {
      id: objectIdString(order._id),
      orderNumber: stringValue(order.orderNumber),
      restaurantId: objectIdString(order.restaurantId),
      restaurantName: stringValue(restaurant?.name),
      restaurantCity: stringValue(restaurant?.address?.city, "Netrokona"),
      serviceArea: order.serviceAreaSnapshot ?? {},
      customerId: stringValue(order.customerId),
      customerName: stringValue(
        order.customerSnapshot?.fullName,
        stringValue(order.customerSnapshot?.name, "Customer"),
      ),
      customerPhone: stringValue(order.customerSnapshot?.phone),
      status: stringValue(order.status),
      terminalReason: stringValue(order.terminalReason || order.rejectionReason),
      cancelledBy: stringValue(order.cancelledBy),
      paymentMethod: stringValue(order.paymentMethod),
      paymentStatus: stringValue(order.paymentStatus),
      transactionId: stringValue(order.paymentSnapshot?.transactionId),
      subtotal: numberValue(order.pricing?.subtotal),
      deliveryFee: numberValue(order.pricing?.deliveryFee),
      discount: numberValue(order.pricing?.discount),
      total: numberValue(order.pricing?.total),
      voucherCodes: Array.isArray(order.appliedVouchers)
        ? order.appliedVouchers.map((voucher: any) => stringValue(voucher?.code)).filter(Boolean)
        : [],
      refundNotificationAudit: normalizeRefundNotificationAudit(
        order.paymentSnapshot?.refundNotificationAudit,
      ),
      createdAt: serializeDate(order.createdAt),
      updatedAt: serializeDate(order.updatedAt),
    };
  });

  const summary = summaryRows.reduce<{
    total: number;
    pending: number;
    refunded: number;
    rejected: number;
    needsReview: number;
    amount: number;
    discount: number;
  }>(
    (accumulator, row) => {
      const status = stringValue(row._id, "unknown");
      accumulator.total += numberValue(row.count);
      accumulator.amount += numberValue(row.amount);
      accumulator.discount += numberValue(row.discount);
      if (status === "refund_pending") accumulator.pending += numberValue(row.count);
      if (status === "refunded") accumulator.refunded += numberValue(row.count);
      if (status === "refund_rejected") accumulator.rejected += numberValue(row.count);
      if (status === "paid") accumulator.needsReview += numberValue(row.count);
      return accumulator;
    },
    {
      total: 0,
      pending: 0,
      refunded: 0,
      rejected: 0,
      needsReview: 0,
      amount: 0,
      discount: 0,
    },
  );

  return {
    items,
    ...buildPagination(total, page, pageSize),
    summary,
  };
}
