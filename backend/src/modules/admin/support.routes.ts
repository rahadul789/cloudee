import { Router } from "express"

import { requireAuth, requireRole } from "../../common/middleware/auth"
import {
  getAdminSupportCase,
  getAdminSupportCases,
  patchAdminSupportCase,
  postAdminSupportInternalNote,
  postAdminSupportReply,
} from "./support.controller"

export const adminSupportRouter = Router()

adminSupportRouter.use(requireAuth, requireRole("admin"))
adminSupportRouter.get("/support-cases", getAdminSupportCases)
adminSupportRouter.get("/support-cases/:supportCaseId", getAdminSupportCase)
adminSupportRouter.patch("/support-cases/:supportCaseId", patchAdminSupportCase)
adminSupportRouter.post("/support-cases/:supportCaseId/reply", postAdminSupportReply)
adminSupportRouter.post("/support-cases/:supportCaseId/internal-notes", postAdminSupportInternalNote)
