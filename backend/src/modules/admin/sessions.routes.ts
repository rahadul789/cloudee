import { Router } from "express"

import { requireAuth, requireRole } from "../../common/middleware/auth"
import {
  getAdminSessionsController,
  postAdminActorSessionsRevokeController,
  postAdminRevokeAllCustomerSessionsController,
  postAdminSessionRevokeController,
} from "./sessions.controller"

export const adminSessionsRouter = Router()

adminSessionsRouter.use(requireAuth, requireRole("admin"))
adminSessionsRouter.get("/sessions", getAdminSessionsController)
// Bulk force-logout of all customers — registered BEFORE the parameterised :role/:sessionId
// route so "customers" is never captured as a role/sessionId pair.
adminSessionsRouter.post(
  "/sessions/customers/logout-all",
  postAdminRevokeAllCustomerSessionsController
)
adminSessionsRouter.post(
  "/sessions/:role/:sessionId/revoke",
  postAdminSessionRevokeController
)
adminSessionsRouter.post(
  "/sessions/:role/users/:actorId/revoke",
  postAdminActorSessionsRevokeController
)
