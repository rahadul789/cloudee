import { Router } from "express"

import { requireAuth, requireRole } from "../../common/middleware/auth"
import {
  approveAdminOwnerVoucher,
  archiveAdminVoucherById,
  deleteOwnerVoucherById,
  getAdminVouchers,
  getOwnerVouchers,
  patchAdminVoucher,
  postVoucherDisplayEvent,
  patchOwnerVoucher,
  postAdminVoucher,
  rejectAdminOwnerVoucher,
  restoreAdminVoucherById,
  sendAdminVoucherPushCampaignById,
  postOwnerVoucher
} from "./promotions.controller"

export const ownerPromotionsRouter = Router()
export const adminPromotionsRouter = Router()

ownerPromotionsRouter.use(requireAuth, requireRole("owner"))
ownerPromotionsRouter.get("/vouchers", getOwnerVouchers)
ownerPromotionsRouter.post("/vouchers", postOwnerVoucher)
ownerPromotionsRouter.patch("/vouchers/:voucherId", patchOwnerVoucher)
ownerPromotionsRouter.delete("/vouchers/:voucherId", deleteOwnerVoucherById)

adminPromotionsRouter.use(requireAuth, requireRole("admin"))
adminPromotionsRouter.get("/vouchers", getAdminVouchers)
adminPromotionsRouter.post("/vouchers", postAdminVoucher)
adminPromotionsRouter.patch("/vouchers/:voucherId", patchAdminVoucher)
adminPromotionsRouter.patch("/vouchers/:voucherId/approve", approveAdminOwnerVoucher)
adminPromotionsRouter.patch("/vouchers/:voucherId/reject", rejectAdminOwnerVoucher)
adminPromotionsRouter.patch("/vouchers/:voucherId/archive", archiveAdminVoucherById)
adminPromotionsRouter.patch("/vouchers/:voucherId/restore", restoreAdminVoucherById)
adminPromotionsRouter.post("/vouchers/:voucherId/send-push", sendAdminVoucherPushCampaignById)
adminPromotionsRouter.post("/vouchers/display-event", postVoucherDisplayEvent)
