import { Router } from "express";

import { requireAuth, requireRole } from "../../common/middleware/auth";
import { getAdminOpenNotifyStats } from "../open-notify/open-notify.controller";
import {
  getAdminMysteryBoxesController,
  getAdminRewardTestersController,
  postAdminRewardTestGrant,
  putAdminRewardTestersController,
  postAdminMysteryBoxDecision,
  getAdminRewardSettingsController,
  getAdminRewardsOverviewController,
  putAdminRewardSettingsController,
} from "../rewards/rewards.controller";
import {
  deleteAdminHypeItemController,
  getAdminHypeComments,
  getAdminHypeItems,
  postAdminHypeCommentModeration,
  postAdminHypeItem,
  putAdminHypeItem,
} from "../hype/hype.controller";
import {
  getAdminWinBackCandidates,
  getAdminWinBackSettings,
  getAdminWinBackStats,
  postAdminWinBackSend,
  putAdminWinBackSettings,
} from "../win-back/win-back.controller";
import { getAdminOrderChatController } from "../order-chat/order-chat.controller";
import {
  getAdminDispatchConfig,
  getAdminDispatchLogs,
  getAdminActivityLogs,
  getAdminLiveMapSnapshot,
  getAdminOrderMapSnapshot,
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
  postAdminPreparationExtension,
  patchAdminRiderPayrollSettings,
  patchAdminRiderPayrollStatus,
  postAdminBkashPaymentAttemptReconcile,
  postAdminBulkAssignRiders,
  postAdminRiderPayrollAdjustment,
  postAdminRider,
  postAdminRunAutoDispatch,
  postAdminPaymentsReconcileLedger,
  postAdminOrderAssignRider,
  postAdminOrderReviewRequest,
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
adminOrdersMonitorRouter.get("/order-map", getAdminOrderMapSnapshot);
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
// Read-only audit of the rider ↔ customer chat on this order.
adminOrdersMonitorRouter.get("/orders/:orderId/chat", getAdminOrderChatController);
// Demand while closed: how many customers tapped "Notify me when open".
adminOrdersMonitorRouter.get("/open-notify/stats", getAdminOpenNotifyStats);
// Win-back: vouchers for customers who stopped ordering (settings, today's list, send, results).
adminOrdersMonitorRouter.get("/win-back/settings", getAdminWinBackSettings);
adminOrdersMonitorRouter.put("/win-back/settings", putAdminWinBackSettings);
adminOrdersMonitorRouter.get("/win-back/candidates", getAdminWinBackCandidates);
adminOrdersMonitorRouter.post("/win-back/send", postAdminWinBackSend);
adminOrdersMonitorRouter.get("/win-back/stats", getAdminWinBackStats);
// Hype tab content (drops / events / videos).
adminOrdersMonitorRouter.get("/hype/items", getAdminHypeItems);
adminOrdersMonitorRouter.post("/hype/items", postAdminHypeItem);
adminOrdersMonitorRouter.put("/hype/items/:itemId", putAdminHypeItem);
adminOrdersMonitorRouter.delete("/hype/items/:itemId", deleteAdminHypeItemController);
adminOrdersMonitorRouter.get("/hype/items/:itemId/comments", getAdminHypeComments);
// Stamp card / scratch-card rewards.
adminOrdersMonitorRouter.get("/rewards/settings", getAdminRewardSettingsController);
adminOrdersMonitorRouter.put("/rewards/settings", putAdminRewardSettingsController);
adminOrdersMonitorRouter.get("/rewards/overview", getAdminRewardsOverviewController);
adminOrdersMonitorRouter.get("/rewards/boxes", getAdminMysteryBoxesController);
adminOrdersMonitorRouter.post("/rewards/boxes/:boxId/decision", postAdminMysteryBoxDecision);
adminOrdersMonitorRouter.get("/rewards/testers", getAdminRewardTestersController);
adminOrdersMonitorRouter.put("/rewards/testers", putAdminRewardTestersController);
adminOrdersMonitorRouter.post("/rewards/testers/:customerId/grant", postAdminRewardTestGrant);
adminOrdersMonitorRouter.post("/hype/comments/:commentId/moderate", postAdminHypeCommentModeration);
adminOrdersMonitorRouter.post("/orders/:orderId/preparation/extend", postAdminPreparationExtension);
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
adminOrdersMonitorRouter.post(
  "/orders/:orderId/review-request",
  postAdminOrderReviewRequest,
);
