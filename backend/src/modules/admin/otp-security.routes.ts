import { Router } from "express"

import { requireAuth, requireRole } from "../../common/middleware/auth"
import {
  deleteAdminOtpBlockController,
  getAdminOtpMonitorController,
  getAdminOtpSecurityController,
  postAdminOtpBlockController,
  postAdminOtpHandledController,
} from "./otp-security.controller"

export const adminOtpSecurityRouter = Router()

adminOtpSecurityRouter.use(requireAuth, requireRole("admin"))
adminOtpSecurityRouter.get("/otp-security", getAdminOtpSecurityController)
adminOtpSecurityRouter.get("/otp-monitor", getAdminOtpMonitorController)
adminOtpSecurityRouter.post("/otp-monitor/handled", postAdminOtpHandledController)
adminOtpSecurityRouter.post("/otp-security/blocks", postAdminOtpBlockController)
adminOtpSecurityRouter.delete("/otp-security/blocks/:blockId", deleteAdminOtpBlockController)
