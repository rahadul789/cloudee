import { Router } from "express";

import { requireAuth, requireRole } from "../../common/middleware/auth";
import {
  getAdminCategories,
  getAdminCategory,
  getAdminDeletedMenu,
  patchAdminCategoriesBulkStatus,
  patchAdminCategoryStatus,
  postAdminRestoreCategory,
  postAdminRestoreMenuItem,
} from "./categories.controller";

export const adminCategoriesRouter = Router();

adminCategoriesRouter.use(requireAuth, requireRole("admin"));

adminCategoriesRouter.get("/menu/trash", getAdminDeletedMenu);
adminCategoriesRouter.post("/menu/trash/categories/:categoryId/restore", postAdminRestoreCategory);
adminCategoriesRouter.post("/menu/trash/items/:itemId/restore", postAdminRestoreMenuItem);
adminCategoriesRouter.get("/categories", getAdminCategories);
adminCategoriesRouter.patch("/categories/bulk-status", patchAdminCategoriesBulkStatus);
adminCategoriesRouter.get("/categories/:categoryId", getAdminCategory);
adminCategoriesRouter.patch("/categories/:categoryId/status", patchAdminCategoryStatus);
