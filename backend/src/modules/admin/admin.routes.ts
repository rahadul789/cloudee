import { Router } from "express"
import { createRefreshLimiter, createSigninLimiter } from "../../common/middleware/rate-limit"

import {
  postAdminBootstrap,
  postAdminLogout,
  postAdminRefresh,
  postAdminSignin
} from "./admin.controller"

export const adminAuthRouter = Router()
const adminSigninLimiter = createSigninLimiter()
const adminRefreshLimiter = createRefreshLimiter()

adminAuthRouter.post("/bootstrap", postAdminBootstrap)
adminAuthRouter.post("/signin", adminSigninLimiter, postAdminSignin)
adminAuthRouter.post("/refresh", adminRefreshLimiter, postAdminRefresh)
adminAuthRouter.post("/logout", postAdminLogout)
