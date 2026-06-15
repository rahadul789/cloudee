import { Router } from "express";

import { requireAuth, requireRole } from "../../common/middleware/auth";
import {
  getAdminCodReconciliationController,
  getAdminFinanceLedgerController,
  getAdminFinancePayoutDetailsController,
  getAdminFinancePayoutsController,
  getAdminFinanceRefundsController,
  getAdminPayoutMethodApprovalsController,
  getAdminMoneyTransactionsController,
  getAdminPlatformFinanceController,
  getAdminPlatformWalletController,
  patchAdminPayoutMethodApprovalController,
  postAdminDailyFinanceCloseController,
  postAdminFinancePayoutController,
  postAdminPlatformWalletController,
  postAdminPlatformWalletVoidController,
} from "./finance.controller";

export const adminFinanceRouter = Router();

adminFinanceRouter.use(requireAuth, requireRole("admin"));

adminFinanceRouter.get("/finance/platform", getAdminPlatformFinanceController);
adminFinanceRouter.get("/finance/transactions", getAdminMoneyTransactionsController);
adminFinanceRouter.get("/finance/wallet", getAdminPlatformWalletController);
adminFinanceRouter.post("/finance/wallet", postAdminPlatformWalletController);
adminFinanceRouter.post(
  "/finance/wallet/:entryId/void",
  postAdminPlatformWalletVoidController,
);
adminFinanceRouter.post(
  "/finance/daily-closing",
  postAdminDailyFinanceCloseController,
);
adminFinanceRouter.get("/finance/cod-reconciliation", getAdminCodReconciliationController);
adminFinanceRouter.get(
  "/finance/payout-method-approvals",
  getAdminPayoutMethodApprovalsController,
);
adminFinanceRouter.patch(
  "/finance/payout-method-approvals/:methodId",
  patchAdminPayoutMethodApprovalController,
);
adminFinanceRouter.get("/finance/payouts", getAdminFinancePayoutsController);
adminFinanceRouter.post(
  "/finance/payouts/:restaurantId",
  postAdminFinancePayoutController,
);
adminFinanceRouter.get(
  "/finance/payouts/:restaurantId",
  getAdminFinancePayoutDetailsController,
);
adminFinanceRouter.get("/finance/ledger", getAdminFinanceLedgerController);
adminFinanceRouter.get("/finance/refunds", getAdminFinanceRefundsController);
