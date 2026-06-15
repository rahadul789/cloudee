import { Router } from "express"

import { requireAuth, requireRole } from "../../common/middleware/auth"
import {
  deleteMediaAssetRecord,
  getMediaAssets,
  postMediaAsset,
} from "./media.controller"
import { deleteMediaAsset, postMediaUploadSignature } from "../owner/business.controller"

export const mediaRouter = Router()

mediaRouter.use(requireAuth, requireRole("owner", "admin", "customer"))

mediaRouter.post("/upload-signature", postMediaUploadSignature)
mediaRouter.post("/delete", deleteMediaAsset)
mediaRouter.get("/assets", requireRole("admin"), getMediaAssets)
mediaRouter.post("/assets", requireRole("admin"), postMediaAsset)
mediaRouter.delete("/assets/:assetId", requireRole("admin"), deleteMediaAssetRecord)
