import { Router } from "express"

import { requireAuth, requireRole } from "../../common/middleware/auth"
import {
  getAdminAccountDeletionRequests,
  patchAdminAccountDeletionRequest,
} from "./account-deletion.controller"

export const adminAccountDeletionRouter = Router()

adminAccountDeletionRouter.use(requireAuth, requireRole("admin"))
adminAccountDeletionRouter.get(
  "/account-deletion-requests",
  getAdminAccountDeletionRequests,
)
adminAccountDeletionRouter.patch(
  "/account-deletion-requests/:id",
  patchAdminAccountDeletionRequest,
)
