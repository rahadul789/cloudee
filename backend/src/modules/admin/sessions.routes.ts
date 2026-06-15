import { Router } from "express"

import { requireAuth, requireRole } from "../../common/middleware/auth"
import {
  getAdminSessionsController,
  postAdminActorSessionsRevokeController,
  postAdminSessionRevokeController,
} from "./sessions.controller"

export const adminSessionsRouter = Router()

adminSessionsRouter.use(requireAuth, requireRole("admin"))
adminSessionsRouter.get("/sessions", getAdminSessionsController)
adminSessionsRouter.post(
  "/sessions/:role/:sessionId/revoke",
  postAdminSessionRevokeController
)
adminSessionsRouter.post(
  "/sessions/:role/users/:actorId/revoke",
  postAdminActorSessionsRevokeController
)
