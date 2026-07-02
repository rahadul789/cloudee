import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedRequest } from "../../common/middleware/auth";
import { asyncHandler } from "../../common/utils/async-handler";
import { sendSuccess } from "../../common/utils/api-response";
import {
  closeAdminDailyFinance,
  createAdminPlatformWalletEntry,
  createAdminFinancePayout,
  getAdminPlatformFinance,
  getAdminFinancePayoutDetails,
  listAdminCodReconciliation,
  listAdminFinanceLedger,
  listAdminFinancePayouts,
  listAdminPayoutMethodApprovals,
  listAdminFinanceRefunds,
  listAdminMoneyTransactions,
  listAdminPlatformWalletEntries,
  reviewAdminPayoutMethodApproval,
  voidAdminPlatformWalletEntry,
} from "./finance.service";

const pageQuerySchema = {
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
};

const payoutsQuerySchema = z.object({
  ...pageQuerySchema,
  search: z.string().optional(),
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
  eligibility: z
    .enum(["all", "eligible", "blocked", "pending_request"])
    .optional(),
  sortBy: z
    .enum(["available_desc", "pending_desc", "recent_request", "name_asc"])
    .optional(),
});

const ledgerQuerySchema = z.object({
  ...pageQuerySchema,
  search: z.string().optional(),
  restaurantId: z.string().optional(),
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
  entryType: z.enum(["all", "earning", "refund", "payout", "adjustment"]).optional(),
  settlementStatus: z.enum(["all", "pending", "available", "paid_out"]).optional(),
  sortBy: z.enum(["newest", "oldest", "highest_net", "lowest_net"]).optional(),
});

const refundsQuerySchema = z.object({
  ...pageQuerySchema,
  search: z.string().optional(),
  restaurantId: z.string().optional(),
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
  status: z
    .enum(["all", "refund_pending", "refunded", "refund_rejected", "needs_review"])
    .optional(),
  sortBy: z
    .enum(["newest", "oldest", "highest_value", "recently_updated"])
    .optional(),
});

const walletQuerySchema = z.object({
  ...pageQuerySchema,
  preset: z
    .enum(["today", "yesterday", "last7Days", "last30Days", "last90Days", "thisMonth", "lastMonth", "lifetime", "custom"])
    .optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  direction: z.enum(["all", "credit", "debit"]).optional(),
  category: z
    .enum([
      "all",
      "online_payment",
      "cod_deposit",
      "restaurant_payout",
      "customer_refund",
      "rider_payroll",
      "deploy_hosting",
      "manual_expense",
      "manual_income",
      "adjustment",
      "other",
    ])
    .optional(),
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
});

const moneyTransactionsQuerySchema = z.object({
  ...pageQuerySchema,
  preset: z
    .enum(["today", "yesterday", "last7Days", "last30Days", "last90Days", "thisMonth", "lastMonth", "lifetime", "custom"])
    .optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  search: z.string().optional(),
  direction: z.enum(["all", "credit", "debit"]).optional(),
  category: z
    .enum([
      "all",
      "online_payment",
      "cod_collection",
      "restaurant_payout",
      "customer_refund",
      "rider_payroll",
      "deploy_hosting",
      "manual_income",
      "manual_expense",
      "adjustment",
      "other",
    ])
    .optional(),
  source: z.enum(["all", "order", "payout", "refund", "payroll", "wallet"]).optional(),
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
});

const platformFinanceQuerySchema = z.object({
  preset: z
    .enum([
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
    .optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
});

const createPayoutSchema = z.object({
  amount: z.coerce.number().int().positive(),
  status: z.enum(["processing", "completed"]).optional(),
  note: z.string().trim().max(500).optional(),
  providerReference: z.string().trim().max(160).optional(),
  providerPayoutId: z.string().trim().max(160).optional(),
  providerTransactionId: z.string().trim().max(160).optional(),
  paymentProofUrl: z.string().trim().max(500).optional(),
  includePending: z.boolean().optional(),
  notifyOwnerSms: z.boolean().optional(),
});

const payoutMethodApprovalSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(500).optional(),
});

const payoutMethodApprovalsQuerySchema = z.object({
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
});

const createWalletEntrySchema = z.object({
  direction: z.enum(["credit", "debit"]),
  category: z.enum(["cod_deposit", "deploy_hosting", "manual_expense", "manual_income", "adjustment", "other"]),
  amount: z.coerce.number().positive(),
  occurredAt: z.string().optional(),
  paymentMethod: z.string().trim().max(80).optional(),
  reference: z.string().trim().max(160).optional(),
  proofUrl: z.string().trim().max(500).optional(),
  note: z.string().trim().max(500).optional(),
});

const adminAreaScopeQuerySchema = z.object({
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
});

const closeDailyFinanceSchema = z.object({
  date: z.string().optional(),
  note: z.string().trim().max(500).optional(),
});

function getStringParam(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return "";
}

export const getAdminFinancePayoutsController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = payoutsQuerySchema.parse(req.query);
    const data = await listAdminFinancePayouts(query);
    return sendSuccess(res, { data });
  },
);

export const getAdminPayoutMethodApprovalsController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = payoutMethodApprovalsQuerySchema.parse(req.query);
    const data = await listAdminPayoutMethodApprovals(query);
    return sendSuccess(res, { data });
  },
);

export const patchAdminPayoutMethodApprovalController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = payoutMethodApprovalSchema.parse(req.body);
    const data = await reviewAdminPayoutMethodApproval({
      methodId: getStringParam(req.params.methodId),
      decision: payload.decision,
      note: payload.note,
      adminId: req.user?.id,
    });
    return sendSuccess(res, { data });
  },
);

export const getAdminPlatformFinanceController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = platformFinanceQuerySchema.parse(req.query);
    const data = await getAdminPlatformFinance(query);
    return sendSuccess(res, { data });
  },
);

export const getAdminPlatformWalletController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = walletQuerySchema.parse(req.query);
    const data = await listAdminPlatformWalletEntries(query);
    return sendSuccess(res, { data });
  },
);

export const getAdminMoneyTransactionsController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = moneyTransactionsQuerySchema.parse(req.query);
    const data = await listAdminMoneyTransactions(query);
    return sendSuccess(res, { data });
  },
);

export const postAdminPlatformWalletController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = createWalletEntrySchema.parse(req.body);
    const scope = adminAreaScopeQuerySchema.parse(req.query);
    const data = await createAdminPlatformWalletEntry({
      ...payload,
      adminId: req.user?.id,
      ...scope,
    });
    return sendSuccess(res, { data });
  },
);

export const postAdminPlatformWalletVoidController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const scope = adminAreaScopeQuerySchema.parse(req.query);
    const data = await voidAdminPlatformWalletEntry({
      entryId: getStringParam(req.params.entryId),
      adminId: req.user?.id,
      ...scope,
    });
    return sendSuccess(res, { data });
  },
);

export const postAdminDailyFinanceCloseController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = closeDailyFinanceSchema.parse(req.body);
    const data = await closeAdminDailyFinance({
      ...payload,
      adminId: req.user?.id,
    });
    return sendSuccess(res, { data });
  },
);

export const getAdminCodReconciliationController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = z.object(pageQuerySchema).parse(req.query);
    const data = await listAdminCodReconciliation(query);
    return sendSuccess(res, { data });
  },
);

export const getAdminFinancePayoutDetailsController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const scope = adminAreaScopeQuerySchema.parse(req.query);
    const data = await getAdminFinancePayoutDetails(
      getStringParam(req.params.restaurantId),
      scope,
    );
    return sendSuccess(res, { data });
  },
);

export const postAdminFinancePayoutController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = createPayoutSchema.parse(req.body);
    const scope = adminAreaScopeQuerySchema.parse(req.query);
    const data = await createAdminFinancePayout({
      restaurantId: getStringParam(req.params.restaurantId),
      amount: payload.amount,
      status: payload.status,
      note: payload.note,
      providerReference: payload.providerReference,
      providerPayoutId: payload.providerPayoutId,
      providerTransactionId: payload.providerTransactionId,
      paymentProofUrl: payload.paymentProofUrl,
      includePending: payload.includePending,
      notifyOwnerSms: payload.notifyOwnerSms,
      adminId: req.user?.id,
      ...scope,
    });
    return sendSuccess(res, { data });
  },
);

export const getAdminFinanceLedgerController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = ledgerQuerySchema.parse(req.query);
    const data = await listAdminFinanceLedger(query);
    return sendSuccess(res, { data });
  },
);

export const getAdminFinanceRefundsController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = refundsQuerySchema.parse(req.query);
    const data = await listAdminFinanceRefunds(query);
    return sendSuccess(res, { data });
  },
);
