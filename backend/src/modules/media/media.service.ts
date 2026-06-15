import { StatusCodes } from "http-status-codes"

import { AppError } from "../../common/utils/app-error"
import { deleteCloudinaryAsset } from "../owner/business.service"
import { MediaAssetModel } from "./media.model"

function serializeDate(value: unknown) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function objectIdString(value: unknown) {
  if (!value) return ""
  if (typeof value === "string") return value
  if (typeof value === "object" && "toString" in value) return String(value)
  return ""
}

function mapMediaAsset(asset: Record<string, any>) {
  return {
    id: objectIdString(asset._id),
    url: String(asset.url ?? ""),
    publicId: String(asset.publicId ?? ""),
    folder: String(asset.folder ?? ""),
    resourceType: String(asset.resourceType ?? "image"),
    context: String(asset.context ?? "admin_media"),
    uploadedByRole: String(asset.uploadedByRole ?? ""),
    uploadedById: String(asset.uploadedById ?? ""),
    createdAt: serializeDate(asset.createdAt),
    updatedAt: serializeDate(asset.updatedAt),
  }
}

export async function recordMediaAsset(params: {
  url: string
  publicId: string
  folder?: string
  resourceType?: string
  context?: string
  uploadedByRole?: string
  uploadedById?: string
}) {
  const publicId = params.publicId.trim()
  if (!publicId) {
    throw new AppError(StatusCodes.BAD_REQUEST, "MEDIA_PUBLIC_ID_REQUIRED", "Media public ID is required")
  }

  const asset = await MediaAssetModel.findOneAndUpdate(
    { publicId },
    {
      $set: {
        url: params.url.trim(),
        publicId,
        folder: params.folder?.trim() ?? "",
        resourceType: params.resourceType?.trim() || "image",
        context: params.context?.trim() || "admin_media",
        uploadedByRole: params.uploadedByRole ?? "",
        uploadedById: params.uploadedById ?? "",
        deletedAt: null,
      },
    },
    { new: true, upsert: true },
  ).lean()

  return mapMediaAsset(asset as Record<string, any>)
}

export async function listMediaAssets(params?: {
  context?: string
  page?: number
  pageSize?: number
}) {
  const page = Math.max(1, Math.floor(Number(params?.page ?? 1)))
  const pageSize = Math.min(60, Math.max(1, Math.floor(Number(params?.pageSize ?? 24))))
  const query: Record<string, unknown> = { deletedAt: null }
  if (params?.context?.trim()) query.context = params.context.trim()

  const [items, total] = await Promise.all([
    MediaAssetModel.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    MediaAssetModel.countDocuments(query),
  ])

  return {
    items: items.map((item) => mapMediaAsset(item)),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}

export async function deleteStoredMediaAsset(params: {
  assetId?: string
  publicId?: string
  resourceType?: string
}) {
  const query = params.assetId
    ? { _id: params.assetId }
    : params.publicId
      ? { publicId: params.publicId }
      : null

  if (!query) {
    throw new AppError(StatusCodes.BAD_REQUEST, "MEDIA_ASSET_REQUIRED", "Media asset is required")
  }

  const asset = await MediaAssetModel.findOne(query)
  if (!asset) {
    throw new AppError(StatusCodes.NOT_FOUND, "MEDIA_ASSET_NOT_FOUND", "Media asset not found")
  }

  const cloudinaryResult = await deleteCloudinaryAsset({
    publicId: asset.publicId,
    resourceType: params.resourceType || asset.resourceType || "image",
  })

  asset.deletedAt = new Date()
  await asset.save()

  return {
    deleted: true,
    cloudinaryDeleted: cloudinaryResult.deleted,
    asset: mapMediaAsset(asset.toObject()),
  }
}
