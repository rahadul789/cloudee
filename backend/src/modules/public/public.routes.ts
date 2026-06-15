import { Router } from "express"

import { getPlatformContentPayload, postCustomerHomeCmsEvent } from "./public.controller"

export const publicRouter = Router()

publicRouter.get("/content", getPlatformContentPayload)
publicRouter.post("/content/customer-home-event", postCustomerHomeCmsEvent)
