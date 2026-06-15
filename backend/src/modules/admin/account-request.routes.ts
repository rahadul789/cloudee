import { Router } from "express"

import { requireAuth, requireRole } from "../../common/middleware/auth"
import {
  getAdminCustomerAccountRequests,
  postAdminCustomerAccountRequestReview
} from "./account-request.controller"

export const adminAccountRequestRouter = Router()

adminAccountRequestRouter.use(requireAuth, requireRole("admin"))
adminAccountRequestRouter.get("/customer-account-requests", getAdminCustomerAccountRequests)
adminAccountRequestRouter.post(
  "/customer-account-requests/:customerId/review",
  postAdminCustomerAccountRequestReview
)
