import { Router } from "express"

import { getHealth, getReadiness } from "./health.controller"

export const healthRouter = Router()

healthRouter.get("/", getHealth)
healthRouter.get("/ready", getReadiness)
