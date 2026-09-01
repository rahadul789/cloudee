import type { Request, Response } from "express";
import { z } from "zod";

import { asyncHandler } from "../../common/utils/async-handler";
import { sendSuccess } from "../../common/utils/api-response";
import { listAdminActivityLogs } from "./activity-log.service";
import { reconcileAdminPlatformFinance } from "./restaurants.service";
import { sendReviewRequestForOrder } from "../customer/push.service";
import {
  assignAdminRiderToOrder,
  bulkAssignAdminRidersToOrders,
  createAdminRider,
  getAdminDispatchSettings,
  listAdminDispatchDecisionLogs,
  listAdminBkashPaymentAttempts,
  reconcileAdminBkashPaymentAttempt,
  getAdminLiveMap,
  getAdminOrderMonitorDetails,
  getAdminRiderDetails as getAdminRiderDetailsService,
  listAdminRiderPayroll,
  listAdminOrders,
  listAdminOrdersMonitor,
  listAdminPayments,
  listAdminRiderAssignmentCandidates,
  listAdminRiders,
  listAdminRidersForAssignment,
  runAutoDispatchForReadyOrders,
  updateAdminOrderRefundStatus,
  updateAdminOrderStatus,
  updateAdminOrderCodCollection,
  updateAdminDispatchSettings,
  updateAdminRiderAvailability,
  setAdminRiderActiveTrip,
  addAdminRiderPayrollAdjustment,
  updateAdminRiderPayrollSettings,
  updateAdminRiderPayrollStatus,
  updateAdminRiderStatus,
  updateAdminRiderVerification,
} from "./orders-monitor.service";

const ordersMonitorQuerySchema = z.object({
  scope: z.enum(["all", "live", "stale"]).optional(),
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
});

const activityLogsQuerySchema = z.object({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
  includeTotal: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

const adminAreaScopeQuerySchema = z.object({
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
});

function getStringParam(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : "";
  }

  return "";
}

function getBooleanParam(value: unknown) {
  const normalized = getStringParam(value).trim().toLowerCase();
  if (!normalized) return undefined;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function getAdminAreaScope(query: unknown) {
  return adminAreaScopeQuerySchema.parse(query);
}

const ordersQuerySchema = z.object({
  search: z.string().optional(),
  preset: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  status: z
    .enum([
      "all",
      "new",
      "live",
      "ready",
      "pickedUp",
      "delivered",
      "cancelled",
      "refund",
    ])
    .optional(),
  paymentMethod: z.enum(["all", "Cash", "Bkash"]).optional(),
  paymentStatus: z
    .enum(["all", "pending", "paid", "refund_pending", "refunded"])
    .optional(),
  assignment: z.enum(["all", "assigned", "unassigned", "stale"]).optional(),
  attention: z.enum(["all", "riderDelay", "extraTime"]).optional(),
  reviewState: z.enum(["all", "reviewed", "requested", "pending"]).optional(),
  source: z.enum(["all", "platform", "external"]).optional(),
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
  sortBy: z.enum(["newest", "oldest", "highestValue", "recentlyUpdated"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

const paymentsQuerySchema = z.object({
  search: z.string().optional(),
  preset: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  paymentMethod: z.enum(["all", "Cash", "Bkash"]).optional(),
  paymentStatus: z
    .enum([
      "all",
      "pending",
      "paid",
      "refund_pending",
      "refunded",
      "refund_rejected",
    ])
    .optional(),
  settlement: z
    .enum(["all", "delivered", "refund_queue", "online", "cod"])
    .optional(),
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
  sortBy: z.enum(["newest", "oldest", "highestValue", "recentlyUpdated"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

const bkashPaymentAttemptsQuerySchema = z.object({
  search: z.string().optional(),
  preset: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  status: z
    .enum([
      "all",
      "initiated",
      "provider_created",
      "provider_create_failed",
      "callback_success",
      "customer_cancelled",
      "callback_failed",
      "execute_failed",
      "confirmed_paid",
      "order_finalized",
      "order_finalize_failed",
      "expired",
    ])
    .optional(),
  paymentStatus: z
    .enum(["all", "unpaid", "paid", "cancelled", "failed", "expired"])
    .optional(),
  orderState: z.enum(["all", "finalized", "missing", "failed"]).optional(),
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

const assignRiderSchema = z.object({
  riderId: z.string().min(1),
});

const ridersQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(["all", "active", "suspended", "locked"]).optional(),
  availability: z.enum(["all", "available", "unavailable"]).optional(),
  verification: z
    .enum(["all", "pending", "approved", "rejected", "missing"])
    .optional(),
  sortBy: z
    .enum(["newest", "recentLogin", "mostActive", "mostDelivered"])
    .optional(),
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

const createRiderSchema = z.object({
  fullName: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  temporaryPassword: z.string().regex(/^\d{6}$/),
  status: z.enum(["active", "suspended", "locked"]).optional(),
  isAvailableForAssignments: z.boolean().optional(),
  verificationStatus: z.enum(["pending", "approved", "rejected"]).optional(),
  nationalIdNumber: z.string().trim().optional(),
  monthlySalary: z.coerce.number().min(0).optional(),
  payoutDay: z.coerce.number().int().min(1).max(28).optional(),
  primaryZoneId: z.string().trim().optional(),
  assignedZoneIds: z.array(z.string().trim()).optional(),
});

const payrollQuerySchema = z.object({
  month: z.string().optional(),
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
});

const updateRiderPayrollSettingsSchema = z.object({
  monthlySalary: z.coerce.number().min(0),
  payoutDay: z.coerce.number().int().min(1).max(28),
  isPayrollEnabled: z.boolean().optional(),
  note: z.string().optional(),
});

const riderPayrollAdjustmentSchema = z.object({
  month: z.string().optional(),
  type: z.enum(["bonus", "tip", "reimbursement", "penalty", "deduction"]),
  amount: z.coerce.number().positive(),
  note: z.string().optional(),
});

const riderPayrollStatusSchema = z.object({
  month: z.string().optional(),
  status: z.enum(["draft", "approved", "paid"]),
  paymentReference: z.string().optional(),
  note: z.string().optional(),
});

const updateRiderAvailabilitySchema = z.object({
  isAvailableForAssignments: z.boolean(),
});

const riderActiveTripSchema = z.object({
  orderId: z.string().min(1),
});

const updateRiderStatusSchema = z.object({
  expectedStatus: z.string().optional(),
  status: z.enum(["active", "suspended", "locked"]),
});

const updateRiderVerificationSchema = z.object({
  expectedStatus: z.string().optional(),
  status: z.enum(["pending", "approved", "rejected"]),
  note: z.string().optional(),
});

const bulkAssignRidersSchema = z.object({
  orderIds: z.array(z.string().min(1)).min(1).max(50),
});

const updateOrderStatusSchema = z.object({
  expectedStatus: z.string().optional(),
  nextStatus: z.enum([
    "Accepted",
    "Rejected",
    "Preparing",
    "ReadyForPickup",
    "Cancelled",
  ]),
  note: z.string().optional(),
});

const updateOrderRefundStatusSchema = z.object({
  expectedPaymentStatus: z.string().optional(),
  paymentStatus: z.enum(["refund_pending", "refunded", "refund_rejected"]),
  note: z.string().optional(),
  providerReference: z.string().trim().max(160).optional(),
  proofUrl: z.string().trim().max(500).optional(),
});

const updateCodCollectionSchema = z.object({
  expectedPaymentStatus: z.string().optional(),
  note: z.string().optional(),
});

const reconcileBkashPaymentAttemptSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

const dispatchSettingsSchema = z.object({
  autoAssignmentEnabled: z.boolean(),
  autoReassignTimedOutOrders: z.boolean(),
  dispatchMode: z.enum(["fleet", "primary_rider"]),
  primaryRiderId: z.string().optional().default(""),
  primaryRiderFallbackEnabled: z.boolean(),
  algorithm: z.enum(["balanced_rotation", "nearest_eligible_balanced", "least_loaded_first"]),
  ownerAcceptanceTimeoutMinutes: z.number().int().min(1).max(180),
  maxActiveOrdersPerRider: z.number().int().min(1).max(50),
  staleLocationCutoffMinutes: z.number().int().min(1).max(180),
  assignmentTimeoutMinutes: z.number().int().min(1).max(180),
  prepStartGraceMinutes: z.number().int().min(1).max(180),
  preparationMaxExtraMinutes: z.number().int().min(0).max(180),
  prepLateGraceMinutes: z.number().int().min(0).max(180),
  pickupLateGraceMinutes: z.number().int().min(1).max(180),
  deliveryLateGraceMinutes: z.number().int().min(1).max(180),
  deliveryWatchAfterPickupMinutes: z.number().int().min(1).max(240).optional().default(20),
  deliveryLateAfterPickupMinutes: z.number().int().min(1).max(240).optional().default(25),
  deliveryCriticalAfterPickupMinutes: z.number().int().min(1).max(240).optional().default(30),
  retryCooldownMinutes: z.number().int().min(1).max(60),
  surgeReadyOrderThreshold: z.number().int().min(1).max(100),
  surgeUnassignedOrderThreshold: z.number().int().min(1).max(100),
  autoCancelUnacceptedOrdersEnabled: z.boolean(),
  autoCancelAfterMinutes: z.number().int().min(2).max(240),
  autoCancelNotifyBeforeMinutes: z.number().int().min(1).max(60),
});

const dispatchLogsQuerySchema = z.object({
  search: z.string().optional(),
  outcome: z
    .enum(["all", "assigned", "reassigned", "no_match", "skipped"])
    .optional(),
  source: z.enum(["all", "manual_admin", "auto_dispatch"]).optional(),
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

const dispatchConfigQuerySchema = z.object({
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
});

export const getAdminOrdersMonitor = asyncHandler(
  async (req: Request, res: Response) => {
    const query = ordersMonitorQuerySchema.parse(req.query);
    const data = await listAdminOrdersMonitor({
      scope: query.scope,
      zoneId: query.zoneId,
      districtId: query.districtId,
    });

    return sendSuccess(res, { data });
  },
);

export const getAdminOrders = asyncHandler(
  async (req: Request, res: Response) => {
    const query = ordersQuerySchema.parse(req.query);
    const data = await listAdminOrders(query);

    return sendSuccess(res, { data });
  },
);

export const getAdminPayments = asyncHandler(
  async (req: Request, res: Response) => {
    const query = paymentsQuerySchema.parse(req.query);
    const data = await listAdminPayments(query);

    return sendSuccess(res, { data });
  },
);

export const getAdminBkashPaymentAttempts = asyncHandler(
  async (req: Request, res: Response) => {
    const query = bkashPaymentAttemptsQuerySchema.parse(req.query);
    const data = await listAdminBkashPaymentAttempts(query);

    return sendSuccess(res, { data });
  },
);

export const postAdminBkashPaymentAttemptReconcile = asyncHandler(
  async (req: Request, res: Response) => {
    const body = reconcileBkashPaymentAttemptSchema.parse(req.body);
    const data = await reconcileAdminBkashPaymentAttempt({
      attemptId: String(req.params.attemptId ?? ""),
      adminId: req.user?.id ?? "",
      note: body.note,
    });

    return sendSuccess(res, {
      message: "bKash payment reconciled successfully",
      data,
    });
  },
);

export const getAdminPaymentsExport = asyncHandler(
  async (req: Request, res: Response) => {
    const query = paymentsQuerySchema.parse(req.query);
    const data = await listAdminPayments({
      ...query,
      page: 1,
      pageSize: 5000,
    });

    return sendSuccess(res, {
      data: {
        ...data,
        truncated: data.total > data.items.length,
      },
    });
  },
);

export const postAdminPaymentsReconcileLedger = asyncHandler(
  async (req: Request, res: Response) => {
    const data = await reconcileAdminPlatformFinance({
      adminId: req.user?.id ?? "",
    });

    return sendSuccess(res, {
      message: "Payment ledger reconciled successfully",
      data,
    });
  },
);

export const getAdminOrderMonitor = asyncHandler(
  async (req: Request, res: Response) => {
    const scope = getAdminAreaScope(req.query);
    const data = await getAdminOrderMonitorDetails(
      String(req.params.orderId ?? ""),
      scope,
    );

    return sendSuccess(res, { data });
  },
);

export const postAdminOrderReviewRequest = asyncHandler(
  async (req: Request, res: Response) => {
    const scope = getAdminAreaScope(req.query);
    await getAdminOrderMonitorDetails(String(req.params.orderId ?? ""), scope);
    const data = await sendReviewRequestForOrder({
      orderId: String(req.params.orderId ?? ""),
      force: req.body?.force === true,
    });

    return sendSuccess(res, {
      data,
      message: "Review request sent to the customer",
    });
  },
);

export const getAdminRiders = asyncHandler(
  async (req: Request, res: Response) => {
    const query = ridersQuerySchema.parse(req.query);
    const data = await listAdminRiders(query);

    return sendSuccess(res, { data });
  },
);

export const postAdminRider = asyncHandler(
  async (req: Request, res: Response) => {
    const payload = createRiderSchema.parse(req.body);
    const data = await createAdminRider(payload);

    return sendSuccess(res, {
      message: "Rider created successfully",
      data,
    });
  },
);

const dayString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

export const getAdminRiderDetails = asyncHandler(
  async (req: Request, res: Response) => {
    const scope = getAdminAreaScope(req.query);
    const dateRange = z
      .object({ from: dayString, to: dayString })
      .parse({
        from: typeof req.query.from === "string" ? req.query.from : undefined,
        to: typeof req.query.to === "string" ? req.query.to : undefined,
      });
    const data = await getAdminRiderDetailsService(
      String(req.params.riderId ?? ""),
      scope,
      dateRange,
    );

    return sendSuccess(res, { data });
  },
);

export const getAdminRiderPayroll = asyncHandler(
  async (req: Request, res: Response) => {
    const query = payrollQuerySchema.parse(req.query);
    const data = await listAdminRiderPayroll(query);

    return sendSuccess(res, { data });
  },
);

export const patchAdminRiderPayrollSettings = asyncHandler(
  async (req: Request, res: Response) => {
    const payload = updateRiderPayrollSettingsSchema.parse(req.body);
    const scope = getAdminAreaScope(req.query);
    const data = await updateAdminRiderPayrollSettings({
      riderId: String(req.params.riderId ?? ""),
      monthlySalary: payload.monthlySalary,
      payoutDay: payload.payoutDay,
      isPayrollEnabled: payload.isPayrollEnabled,
      note: payload.note,
      adminId: req.user?.id ?? "",
      ...scope,
    });

    return sendSuccess(res, {
      message: "Rider payroll settings updated successfully",
      data,
    });
  },
);

export const postAdminRiderPayrollAdjustment = asyncHandler(
  async (req: Request, res: Response) => {
    const payload = riderPayrollAdjustmentSchema.parse(req.body);
    const scope = getAdminAreaScope(req.query);
    const data = await addAdminRiderPayrollAdjustment({
      riderId: String(req.params.riderId ?? ""),
      month: payload.month,
      type: payload.type,
      amount: payload.amount,
      note: payload.note,
      adminId: req.user?.id ?? "",
      ...scope,
    });

    return sendSuccess(res, {
      message: "Rider payroll adjustment added successfully",
      data,
    });
  },
);

export const patchAdminRiderPayrollStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const payload = riderPayrollStatusSchema.parse(req.body);
    const scope = getAdminAreaScope(req.query);
    const data = await updateAdminRiderPayrollStatus({
      riderId: String(req.params.riderId ?? ""),
      month: payload.month,
      status: payload.status,
      paymentReference: payload.paymentReference,
      note: payload.note,
      adminId: req.user?.id ?? "",
      ...scope,
    });

    return sendSuccess(res, {
      message: "Rider payroll status updated successfully",
      data,
    });
  },
);

export const getAdminLiveMapSnapshot = asyncHandler(
  async (req: Request, res: Response) => {
    const query = z
      .object({
        zoneId: z.string().optional(),
        districtId: z.string().optional(),
      })
      .parse(req.query);
    const data = await getAdminLiveMap(query);

    return sendSuccess(res, { data });
  },
);

export const getAdminRiderAssignmentCandidates = asyncHandler(
  async (req: Request, res: Response) => {
    const query = z
      .object({
        zoneId: z.string().optional(),
        districtId: z.string().optional(),
      })
      .parse(req.query);
    const data = await listAdminRiderAssignmentCandidates(query);

    return sendSuccess(res, { data });
  },
);

export const postAdminBulkAssignRiders = asyncHandler(
  async (req: Request, res: Response) => {
    const payload = bulkAssignRidersSchema.parse(req.body);
    const scope = getAdminAreaScope(req.query);
    const data = await bulkAssignAdminRidersToOrders({
      orderIds: payload.orderIds,
      ...scope,
    });

    return sendSuccess(res, {
      message: "Bulk rider assignment completed",
      data,
    });
  },
);

export const getAdminRidersAssignmentOptions = asyncHandler(
  async (req: Request, res: Response) => {
    const query = z
      .object({
        zoneId: z.string().optional(),
        districtId: z.string().optional(),
      })
      .parse(req.query);
    const data = await listAdminRidersForAssignment(query);

    return sendSuccess(res, { data });
  },
);

export const patchAdminRiderAvailability = asyncHandler(
  async (req: Request, res: Response) => {
    const payload = updateRiderAvailabilitySchema.parse(req.body);
    const scope = getAdminAreaScope(req.query);
    const data = await updateAdminRiderAvailability({
      riderId: String(req.params.riderId ?? ""),
      isAvailableForAssignments: payload.isAvailableForAssignments,
      ...scope,
    });

    return sendSuccess(res, {
      message: "Rider availability updated successfully",
      data,
    });
  },
);

export const postAdminRiderActiveTrip = asyncHandler(
  async (req: Request, res: Response) => {
    const payload = riderActiveTripSchema.parse(req.body);
    const scope = getAdminAreaScope(req.query);
    const data = await setAdminRiderActiveTrip({
      riderId: String(req.params.riderId ?? ""),
      orderId: payload.orderId,
      ...scope,
    });

    return sendSuccess(res, {
      message: "Rider live trip updated successfully",
      data,
    });
  },
);

export const patchAdminRiderStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const payload = updateRiderStatusSchema.parse(req.body);
    const scope = getAdminAreaScope(req.query);
    const data = await updateAdminRiderStatus({
      riderId: String(req.params.riderId ?? ""),
      expectedStatus: payload.expectedStatus,
      status: payload.status,
      ...scope,
    });

    return sendSuccess(res, {
      message: "Rider status updated successfully",
      data,
    });
  },
);

export const patchAdminRiderVerification = asyncHandler(
  async (req: Request, res: Response) => {
    const payload = updateRiderVerificationSchema.parse(req.body);
    const scope = getAdminAreaScope(req.query);
    const data = await updateAdminRiderVerification({
      riderId: String(req.params.riderId ?? ""),
      expectedStatus: payload.expectedStatus,
      status: payload.status,
      note: payload.note,
      adminId: req.user?.id ?? "",
      ...scope,
    });

    return sendSuccess(res, {
      message: "Rider KYC status updated successfully",
      data,
    });
  },
);

export const getAdminDispatchConfig = asyncHandler(
  async (req: Request, res: Response) => {
    const query = dispatchConfigQuerySchema.parse(req.query);
    const data = await getAdminDispatchSettings(query);

    return sendSuccess(res, { data });
  },
);

export const getAdminDispatchLogs = asyncHandler(
  async (req: Request, res: Response) => {
    const query = dispatchLogsQuerySchema.parse(req.query);
    const data = await listAdminDispatchDecisionLogs(query);

    return sendSuccess(res, { data });
  },
);

export const getAdminActivityLogs = asyncHandler(
  async (req: Request, res: Response) => {
    const query = activityLogsQuerySchema.parse(req.query);
    const data = await listAdminActivityLogs({
      entityType: query.entityType,
      entityId: query.entityId,
      page: query.page,
      pageSize: query.pageSize,
      includeTotal: getBooleanParam(query.includeTotal),
      zoneId: query.zoneId,
      districtId: query.districtId,
    });
    return sendSuccess(res, { data });
  }
);

export const patchAdminDispatchConfig = asyncHandler(
  async (req: Request, res: Response) => {
    const payload = dispatchSettingsSchema.parse(req.body);
    const query = dispatchConfigQuerySchema.parse(req.query);
    const data = await updateAdminDispatchSettings({
      adminId: req.user?.id ?? "",
      settings: payload,
      zoneId: query.zoneId,
      districtId: query.districtId,
    });

    return sendSuccess(res, {
      message: "Dispatch settings updated successfully",
      data,
    });
  },
);

export const postAdminRunAutoDispatch = asyncHandler(
  async (req: Request, res: Response) => {
    const query = dispatchConfigQuerySchema.parse(req.query);
    const data = await runAutoDispatchForReadyOrders({
      zoneId: query.zoneId,
      districtId: query.districtId,
    });

    return sendSuccess(res, {
      message: "Auto dispatch run completed",
      data,
    });
  },
);

export const postAdminOrderAssignRider = asyncHandler(
  async (req: Request, res: Response) => {
    const payload = assignRiderSchema.parse(req.body);
    const scope = getAdminAreaScope(req.query);
    const data = await assignAdminRiderToOrder({
      orderId: String(req.params.orderId ?? ""),
      riderId: payload.riderId,
      ...scope,
    });

    return sendSuccess(res, {
      message: "Rider assigned successfully",
      data,
    });
  },
);

export const patchAdminOrderStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const payload = updateOrderStatusSchema.parse(req.body);
    const scope = getAdminAreaScope(req.query);
    const data = await updateAdminOrderStatus({
      orderId: String(req.params.orderId ?? ""),
      expectedStatus: payload.expectedStatus,
      nextStatus: payload.nextStatus,
      note: payload.note,
      adminId: req.user?.id ?? "",
      ...scope,
    });

    return sendSuccess(res, {
      message: "Order status updated successfully",
      data,
    });
  },
);

export const patchAdminOrderRefundStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const payload = updateOrderRefundStatusSchema.parse(req.body);
    const scope = getAdminAreaScope(req.query);
    const data = await updateAdminOrderRefundStatus({
      orderId: String(req.params.orderId ?? ""),
      expectedPaymentStatus: payload.expectedPaymentStatus,
      paymentStatus: payload.paymentStatus,
      note: payload.note,
      providerReference: payload.providerReference,
      proofUrl: payload.proofUrl,
      adminId: req.user?.id ?? "",
      ...scope,
    });

    return sendSuccess(res, {
      message: "Order refund status updated successfully",
      data,
    });
  },
);

export const patchAdminOrderCodCollection = asyncHandler(
  async (req: Request, res: Response) => {
    const payload = updateCodCollectionSchema.parse(req.body);
    const scope = getAdminAreaScope(req.query);
    const data = await updateAdminOrderCodCollection({
      orderId: String(req.params.orderId ?? ""),
      expectedPaymentStatus: payload.expectedPaymentStatus,
      note: payload.note,
      adminId: req.user?.id ?? "",
      ...scope,
    });

    return sendSuccess(res, {
      message: "COD collection marked successfully",
      data,
    });
  },
);
