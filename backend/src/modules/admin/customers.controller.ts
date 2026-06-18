import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedRequest } from "../../common/middleware/auth";
import { asyncHandler } from "../../common/utils/async-handler";
import { sendSuccess } from "../../common/utils/api-response";
import {
  addAdminCustomerGroupMembers,
  archiveAdminCustomerGroup,
  createAdminCustomerGroup,
  deleteAdminCustomerPersonalOffer,
  getAdminCustomerDetails,
  listAdminCustomerGroups,
  listAdminCustomerOrders,
  listAdminCustomers,
  removeAdminCustomerGroupMember,
  updateAdminCustomerGroup,
  updateAdminCustomerStatus,
} from "./customers.service";

const listCustomersQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(["all", "active", "suspended", "locked"]).optional(),
  requestStatus: z
    .enum(["all", "pending", "cancelled", "reviewed", "completed", "none"])
    .optional(),
  customerGroupKey: z.string().trim().optional(),
  zoneId: z.string().trim().optional(),
  districtId: z.string().trim().optional(),
  preset: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  sortBy: z
    .enum(["newest", "recentLogin", "mostOrders", "highestSpend", "repeatFirst"])
    .optional(),
  tier: z.enum(["all", "new", "repeat", "vip", "at_risk"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

const createCustomerGroupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).optional(),
  sourceFilter: listCustomersQuerySchema.partial().optional(),
  customerIds: z.array(z.string()).max(5000).optional(),
});

const updateCustomerGroupSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(240).optional(),
});

const addCustomerGroupMembersSchema = z.object({
  customerIds: z.array(z.string().trim()).min(1).max(100),
});

const detailsQuerySchema = z.object({
  preset: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  zoneId: z.string().trim().optional(),
  districtId: z.string().trim().optional(),
});

const listCustomerOrdersQuerySchema = detailsQuerySchema.extend({
  restaurantId: z.string().optional(),
  zoneId: z.string().trim().optional(),
  districtId: z.string().trim().optional(),
  status: z.enum(["all", "live", "delivered", "cancelled"]).optional(),
  search: z.string().optional(),
  sortBy: z.enum(["newest", "oldest", "highestValue"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

const statusSchema = z.object({
  status: z.enum(["active", "suspended", "locked"]),
  note: z.string().trim().optional(),
});

function getStringParam(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getAdminId(req: AuthenticatedRequest) {
  return req.user?.id ?? "";
}

export const getAdminCustomers = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = listCustomersQuerySchema.parse(req.query);
    const data = await listAdminCustomers(query);

    return sendSuccess(res, { data });
  },
);

export const getAdminCustomerGroups = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = listCustomersQuerySchema
      .pick({ zoneId: true, districtId: true })
      .parse(req.query);
    const data = await listAdminCustomerGroups(query);

    return sendSuccess(res, { data });
  },
);

export const postAdminCustomerGroup = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = createCustomerGroupSchema.parse(req.body);
    const data = await createAdminCustomerGroup({
      ...payload,
      adminId: getAdminId(req),
    });

    return sendSuccess(res, {
      message: "Customer group created",
      data,
    });
  },
);

export const patchAdminCustomerGroup = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = updateCustomerGroupSchema.parse(req.body);
    const data = await updateAdminCustomerGroup({
      groupId: getStringParam(req.params.groupId),
      ...payload,
    });

    return sendSuccess(res, {
      message: "Customer group updated",
      data,
    });
  },
);

export const deleteAdminCustomerGroup = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const data = await archiveAdminCustomerGroup(getStringParam(req.params.groupId));

    return sendSuccess(res, {
      message: "Customer group deleted",
      data,
    });
  },
);

export const postAdminCustomerGroupMembers = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = addCustomerGroupMembersSchema.parse(req.body);
    const data = await addAdminCustomerGroupMembers({
      groupId: getStringParam(req.params.groupId),
      customerIds: payload.customerIds,
    });

    return sendSuccess(res, {
      message: "Customer group members added",
      data,
    });
  },
);

export const deleteAdminCustomerGroupMember = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const data = await removeAdminCustomerGroupMember({
      groupId: getStringParam(req.params.groupId),
      customerId: getStringParam(req.params.customerId),
    });

    return sendSuccess(res, {
      message: "Customer removed from group",
      data,
    });
  },
);

export const getAdminCustomer = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = detailsQuerySchema.parse(req.query);
    const data = await getAdminCustomerDetails(
      getStringParam(req.params.customerId),
      query,
    );

    return sendSuccess(res, { data });
  },
);

export const getAdminCustomerOrders = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = listCustomerOrdersQuerySchema.parse(req.query);
    const data = await listAdminCustomerOrders(
      getStringParam(req.params.customerId),
      query,
    );

    return sendSuccess(res, { data });
  },
);

export const deleteAdminCustomerOffer = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const data = await deleteAdminCustomerPersonalOffer({
      customerId: getStringParam(req.params.customerId),
      notificationId: getStringParam(req.params.notificationId),
      adminId: getAdminId(req),
    });

    return sendSuccess(res, {
      message: "Personal offer removed",
      data,
    });
  },
);

export const patchAdminCustomerStatus = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = statusSchema.parse(req.body);
    const data = await updateAdminCustomerStatus({
      customerId: getStringParam(req.params.customerId),
      status: payload.status,
      note: payload.note,
      adminId: getAdminId(req),
    });

    return sendSuccess(res, {
      message: "Customer status updated",
      data,
    });
  },
);
