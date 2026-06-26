import { Router } from "express";

import { requireAuth, requireRole } from "../../common/middleware/auth";
import {
  getAdminDispatchConfig,
  getAdminDispatchLogs,
  getAdminActivityLogs,
  getAdminLiveMapSnapshot,
  getAdminOrderMonitor,
  getAdminOrders,
  getAdminOrdersMonitor,
  getAdminBkashPaymentAttempts,
  getAdminPayments,
  getAdminPaymentsExport,
  getAdminRiderAssignmentCandidates,
  getAdminRiderDetails,
  getAdminRiderPayroll,
  getAdminRiders,
  getAdminRidersAssignmentOptions,
  patchAdminRiderAvailability,
  postAdminRiderActiveTrip,
  patchAdminRiderStatus,
  patchAdminRiderVerification,
  patchAdminDispatchConfig,
  patchAdminOrderRefundStatus,
  patchAdminOrderCodCollection,
  patchAdminOrderStatus,
  patchAdminRiderPayrollSettings,
  patchAdminRiderPayrollStatus,
  postAdminBkashPaymentAttemptReconcile,
  postAdminBulkAssignRiders,
  postAdminRiderPayrollAdjustment,
  postAdminRider,
  postAdminRunAutoDispatch,
  postAdminPaymentsReconcileLedger,
  postAdminOrderAssignRider,
} from "./orders-monitor.controller";

export const adminOrdersMonitorRouter = Router();

adminOrdersMonitorRouter.use(requireAuth, requireRole("admin"));
adminOrdersMonitorRouter.get("/orders-monitor", getAdminOrdersMonitor);
adminOrdersMonitorRouter.get(
  "/riders-assignment-options",
  getAdminRidersAssignmentOptions,
);
adminOrdersMonitorRouter.get("/dispatch-settings", getAdminDispatchConfig);
adminOrdersMonitorRouter.patch("/dispatch-settings", patchAdminDispatchConfig);
adminOrdersMonitorRouter.get("/dispatch-logs", getAdminDispatchLogs);
adminOrdersMonitorRouter.get("/activity-logs", getAdminActivityLogs);
adminOrdersMonitorRouter.post("/dispatch/run", postAdminRunAutoDispatch);
adminOrdersMonitorRouter.get("/live-map", getAdminLiveMapSnapshot);
adminOrdersMonitorRouter.get("/riders", getAdminRiders);
adminOrdersMonitorRouter.post("/riders", postAdminRider);
adminOrdersMonitorRouter.get("/rider-payroll", getAdminRiderPayroll);
adminOrdersMonitorRouter.get("/riders/:riderId", getAdminRiderDetails);
adminOrdersMonitorRouter.patch(
  "/riders/:riderId/payroll-settings",
  patchAdminRiderPayrollSettings,
);
adminOrdersMonitorRouter.post(
  "/riders/:riderId/payroll-adjustments",
  postAdminRiderPayrollAdjustment,
);
adminOrdersMonitorRouter.patch(
  "/riders/:riderId/payroll-status",
  patchAdminRiderPayrollStatus,
);
adminOrdersMonitorRouter.patch(
  "/riders/:riderId/availability",
  patchAdminRiderAvailability,
);
adminOrdersMonitorRouter.post(
  "/riders/:riderId/active-trip",
  postAdminRiderActiveTrip,
);
adminOrdersMonitorRouter.patch(
  "/riders/:riderId/status",
  patchAdminRiderStatus,
);
adminOrdersMonitorRouter.patch(
  "/riders/:riderId/verification",
  patchAdminRiderVerification,
);
adminOrdersMonitorRouter.get("/orders", getAdminOrders);
adminOrdersMonitorRouter.get("/payments", getAdminPayments);
adminOrdersMonitorRouter.get("/payments/bkash-attempts", getAdminBkashPaymentAttempts);
adminOrdersMonitorRouter.post(
  "/payments/bkash-attempts/:attemptId/reconcile",
  postAdminBkashPaymentAttemptReconcile,
);
adminOrdersMonitorRouter.get("/payments/export", getAdminPaymentsExport);
adminOrdersMonitorRouter.post(
  "/payments/reconcile-ledger",
  postAdminPaymentsReconcileLedger,
);
adminOrdersMonitorRouter.get(
  "/orders/assignment-candidates",
  getAdminRiderAssignmentCandidates,
);
adminOrdersMonitorRouter.post(
  "/orders/bulk-assign-riders",
  postAdminBulkAssignRiders,
);
adminOrdersMonitorRouter.get("/orders/:orderId", getAdminOrderMonitor);
adminOrdersMonitorRouter.patch(
  "/orders/:orderId/status",
  patchAdminOrderStatus,
);
adminOrdersMonitorRouter.patch(
  "/orders/:orderId/refund",
  patchAdminOrderRefundStatus,
);
adminOrdersMonitorRouter.patch(
  "/orders/:orderId/cod-collection",
  patchAdminOrderCodCollection,
);
adminOrdersMonitorRouter.post(
  "/orders/:orderId/assign-rider",
  postAdminOrderAssignRider,
);
