import type { Response } from "express"
import { z } from "zod"

import type { AuthenticatedRequest } from "../../common/middleware/auth"
import { asyncHandler } from "../../common/utils/async-handler"
import { sendSuccess } from "../../common/utils/api-response"
import {
  deleteStoredMediaAsset,
  listMediaAssets,
  recordMediaAsset,
} from "./media.service"

const mediaAssetSchema = z.object({
  url: z.string().trim().min(1),
  publicId: z.string().trim().min(1),
  folder: z.string().trim().optional(),
  resourceType: z.string().trim().optional(),
  context: z.string().trim().optional(),
})

const listMediaAssetsSchema = z.object({
  context: z.string().trim().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
})

const deleteMediaAssetSchema = z.object({
  publicId: z.string().trim().optional(),
  resourceType: z.string().trim().optional(),
})

function getStringParam(value: unknown) {
  return typeof value === "string" ? value : ""
}

export const getMediaAssets = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = listMediaAssetsSchema.parse(req.query)
    const data = await listMediaAssets(query)
    return sendSuccess(res, { data })
  },
)

export const postMediaAsset = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = mediaAssetSchema.parse(req.body)
    const data = await recordMediaAsset({
      ...payload,
      uploadedByRole: req.user?.role ?? "",
      uploadedById: req.user?.id ?? "",
    })
    return sendSuccess(res, { message: "Media asset saved", data })
  },
)

export const deleteMediaAssetRecord = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = deleteMediaAssetSchema.parse(req.body)
    const data = await deleteStoredMediaAsset({
      assetId: getStringParam(req.params.assetId),
      publicId: payload.publicId,
      resourceType: payload.resourceType,
    })
    return sendSuccess(res, { message: "Media asset deleted", data })
  },
)
