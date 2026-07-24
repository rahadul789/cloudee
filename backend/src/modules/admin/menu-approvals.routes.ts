import { Router } from "express";

import { requireAuth, requireRole } from "../../common/middleware/auth";
import {
  getAdminMenuApproval,
  getAdminMenuApprovalHistory,
  getAdminMenuApprovals,
  postAdminMenuApprovalApprove,
  postAdminMenuApprovalReject,
} from "./menu-approvals.controller";

export const adminMenuApprovalsRouter = Router();

adminMenuApprovalsRouter.use(requireAuth, requireRole("admin"));

adminMenuApprovalsRouter.get("/menu-approvals", getAdminMenuApprovals);
adminMenuApprovalsRouter.get("/menu-approvals/history", getAdminMenuApprovalHistory);
adminMenuApprovalsRouter.get("/menu-approvals/:requestId", getAdminMenuApproval);
adminMenuApprovalsRouter.post(
  "/menu-approvals/:requestId/approve",
  postAdminMenuApprovalApprove,
);
adminMenuApprovalsRouter.post(
  "/menu-approvals/:requestId/reject",
  postAdminMenuApprovalReject,
);
