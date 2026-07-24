import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedRequest } from "../../common/middleware/auth";
import { asyncHandler } from "../../common/utils/async-handler";
import { sendSuccess } from "../../common/utils/api-response";
import {
  approveAdminMenuApprovalRequest,
  getAdminMenuApprovalRequest,
  listAdminMenuApprovalHistory,
  listAdminMenuApprovalRequests,
  rejectAdminMenuApprovalRequest,
} from "../owner/menu-approval.service";

const listMenuApprovalsQuerySchema = z.object({
  status: z
    .enum(["all", "pending", "approved", "rejected", "cancelled", "superseded"])
    .optional(),
  type: z.enum(["all", "new_item", "price_update"]).optional(),
  search: z.string().optional(),
  restaurantId: z.string().optional(),
  menuItemId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  sortBy: z.enum(["newest", "oldest"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const approveMenuApprovalSchema = z.object({
  note: z.string().trim().max(1000).optional(),
});

const rejectMenuApprovalSchema = z.object({
  ownerReason: z.string().trim().min(1).max(500),
  internalNote: z.string().trim().max(1000).optional(),
});

function getStringParam(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const firstValue = value[0];
    return typeof firstValue === "string" ? firstValue : "";
  }
  return "";
}

function getAdminId(req: AuthenticatedRequest) {
  return req.user?.id ?? "";
}

export const getAdminMenuApprovals = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = listMenuApprovalsQuerySchema.parse({
      status: getStringParam(req.query.status) || undefined,
      type: getStringParam(req.query.type) || undefined,
      search: getStringParam(req.query.search) || undefined,
      restaurantId: getStringParam(req.query.restaurantId) || undefined,
      menuItemId: getStringParam(req.query.menuItemId) || undefined,
      from: getStringParam(req.query.from) || undefined,
      to: getStringParam(req.query.to) || undefined,
      sortBy: getStringParam(req.query.sortBy) || undefined,
      page: getStringParam(req.query.page) || undefined,
      pageSize: getStringParam(req.query.pageSize) || undefined,
    });
    const data = await listAdminMenuApprovalRequests(query);
    return sendSuccess(res, { data });
  },
);

export const getAdminMenuApprovalHistory = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = listMenuApprovalsQuerySchema.parse({
      status: getStringParam(req.query.status) || undefined,
      type: getStringParam(req.query.type) || undefined,
      search: getStringParam(req.query.search) || undefined,
      restaurantId: getStringParam(req.query.restaurantId) || undefined,
      menuItemId: getStringParam(req.query.menuItemId) || undefined,
      from: getStringParam(req.query.from) || undefined,
      to: getStringParam(req.query.to) || undefined,
      sortBy: getStringParam(req.query.sortBy) || undefined,
      page: getStringParam(req.query.page) || undefined,
      pageSize: getStringParam(req.query.pageSize) || undefined,
    });
    const data = await listAdminMenuApprovalHistory(query);
    return sendSuccess(res, { data });
  },
);

export const getAdminMenuApproval = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const data = await getAdminMenuApprovalRequest(
      getStringParam(req.params.requestId),
    );
    return sendSuccess(res, { data });
  },
);

export const postAdminMenuApprovalApprove = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = approveMenuApprovalSchema.parse(req.body);
    const data = await approveAdminMenuApprovalRequest({
      requestId: getStringParam(req.params.requestId),
      adminId: getAdminId(req),
      note: payload.note,
    });
    return sendSuccess(res, {
      message: "Menu approval request approved successfully",
      data,
    });
  },
);

export const postAdminMenuApprovalReject = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = rejectMenuApprovalSchema.parse(req.body);
    const data = await rejectAdminMenuApprovalRequest({
      requestId: getStringParam(req.params.requestId),
      adminId: getAdminId(req),
      ownerReason: payload.ownerReason,
      internalNote: payload.internalNote,
    });
    return sendSuccess(res, {
      message: "Menu approval request rejected successfully",
      data,
    });
  },
);
