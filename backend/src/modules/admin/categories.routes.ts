import { Router } from "express";

import { requireAuth, requireRole } from "../../common/middleware/auth";
import {
  getAdminCategories,
  getAdminCategory,
  patchAdminCategoriesBulkStatus,
  patchAdminCategoryStatus,
} from "./categories.controller";

export const adminCategoriesRouter = Router();

adminCategoriesRouter.use(requireAuth, requireRole("admin"));

adminCategoriesRouter.get("/categories", getAdminCategories);
adminCategoriesRouter.patch("/categories/bulk-status", patchAdminCategoriesBulkStatus);
adminCategoriesRouter.get("/categories/:categoryId", getAdminCategory);
adminCategoriesRouter.patch("/categories/:categoryId/status", patchAdminCategoryStatus);
