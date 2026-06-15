import { Router } from "express"

import { requireAuth, requireRole } from "../../common/middleware/auth"
import {
  deleteAdminOtpBlockController,
  getAdminOtpSecurityController,
  postAdminOtpBlockController,
} from "./otp-security.controller"

export const adminOtpSecurityRouter = Router()

adminOtpSecurityRouter.use(requireAuth, requireRole("admin"))
adminOtpSecurityRouter.get("/otp-security", getAdminOtpSecurityController)
adminOtpSecurityRouter.post("/otp-security/blocks", postAdminOtpBlockController)
adminOtpSecurityRouter.delete("/otp-security/blocks/:blockId", deleteAdminOtpBlockController)
