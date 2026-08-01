import { Router } from "express"

import { createAccountDeletionLimiter } from "../../common/middleware/rate-limit"
import {
  getPlatformContentPayload,
  postAccountDeletionRequest,
  postCustomerHomeCmsEvent,
} from "./public.controller"

export const publicRouter = Router()

publicRouter.get("/content", getPlatformContentPayload)
publicRouter.post("/content/customer-home-event", postCustomerHomeCmsEvent)
publicRouter.post(
  "/account-deletion-request",
  createAccountDeletionLimiter(),
  postAccountDeletionRequest,
)
