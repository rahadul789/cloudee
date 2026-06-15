import { Router } from "express"

import { requireAuth, requireRole } from "../../common/middleware/auth"
import {
  archiveAdminServiceZoneController,
  createAdminServiceDistrictController,
  createAdminServiceZoneController,
  listAdminServiceAreasController,
  updateAdminServiceDistrictController,
  updateAdminServiceZoneController
} from "./service-areas.controller"

export const adminServiceAreasRouter = Router()

adminServiceAreasRouter.use(requireAuth, requireRole("admin"))

adminServiceAreasRouter.get("/service-areas", listAdminServiceAreasController)
adminServiceAreasRouter.post("/service-areas/districts", createAdminServiceDistrictController)
adminServiceAreasRouter.put(
  "/service-areas/districts/:districtId",
  updateAdminServiceDistrictController
)
adminServiceAreasRouter.post("/service-areas/zones", createAdminServiceZoneController)
adminServiceAreasRouter.put("/service-areas/zones/:zoneId", updateAdminServiceZoneController)
adminServiceAreasRouter.delete(
  "/service-areas/zones/:zoneId",
  archiveAdminServiceZoneController
)
