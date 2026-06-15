import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedRequest } from "../../common/middleware/auth";
import { sendSuccess } from "../../common/utils/api-response";
import { asyncHandler } from "../../common/utils/async-handler";
import {
  bulkUpdateAdminCategoryStatus,
  getAdminCategoryDetails,
  listAdminCategories,
  updateAdminCategoryStatus,
} from "./categories.service";

const listCategoriesQuerySchema = z.object({
  search: z.string().optional(),
  restaurantId: z.string().optional(),
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
  status: z.enum(["all", "active", "archived"]).optional(),
  health: z.enum(["all", "empty", "needs_review", "duplicate", "healthy"]).optional(),
  sortBy: z.enum(["newest", "oldest", "mostItems", "emptyFirst", "name"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

const updateCategoryStatusSchema = z.object({
  status: z.enum(["active", "archived"]),
  reason: z.string().trim().max(500).optional(),
  notifyOwner: z.boolean().optional(),
});

const bulkUpdateCategoryStatusSchema = updateCategoryStatusSchema.extend({
  categoryIds: z.array(z.string().trim().min(1)).min(1),
});

function getStringParam(value: unknown) {
  return typeof value === "string" ? value : "";
}

export const getAdminCategories = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const query = listCategoriesQuerySchema.parse(req.query);
  const data = await listAdminCategories(query);
  return sendSuccess(res, { data });
});

export const getAdminCategory = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = await getAdminCategoryDetails(getStringParam(req.params.categoryId));
  return sendSuccess(res, { data });
});

export const patchAdminCategoryStatus = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const payload = updateCategoryStatusSchema.parse(req.body);
  const data = await updateAdminCategoryStatus({
    categoryId: getStringParam(req.params.categoryId),
    status: payload.status,
    reason: payload.reason,
    notifyOwner: payload.notifyOwner,
    adminId: req.user?.id ?? "",
  });

  return sendSuccess(res, {
    message: payload.status === "archived" ? "Category archived" : "Category restored",
    data,
  });
});

export const patchAdminCategoriesBulkStatus = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const payload = bulkUpdateCategoryStatusSchema.parse(req.body);
  const data = await bulkUpdateAdminCategoryStatus({
    categoryIds: payload.categoryIds,
    status: payload.status,
    reason: payload.reason,
    notifyOwner: payload.notifyOwner,
    adminId: req.user?.id ?? "",
  });

  return sendSuccess(res, {
    message: payload.status === "archived" ? "Categories archived" : "Categories restored",
    data,
  });
});
