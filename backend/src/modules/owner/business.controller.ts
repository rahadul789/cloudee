import type { Response } from "express"
import { z } from "zod"

import type { AuthenticatedRequest } from "../../common/middleware/auth"
import { MAX_PREPARATION_TIME_MINUTES } from "../../common/constants/preparation"
import { asyncHandler } from "../../common/utils/async-handler"
import { sendSuccess } from "../../common/utils/api-response"
import {
  createSupportCase,
  deleteCloudinaryAsset,
  createUploadSignature,
  getOpeningHours,
  getStoreSettings,
  listReviews,
  listReviewsWithFilters,
  listSupportCases,
  listSupportCasesWithFilters,
  requestReviewHide,
  replyToReview,
  updateRestaurantStatus,
  updateOpeningHours,
  updateStoreSettings
} from "./business.service"

const mediaAssetSchema = z.object({
  url: z.string().optional(),
  publicId: z.string().optional()
})

const restaurantDocumentSchema = z.object({
  type: z.enum(["nid", "trade_license", "tin", "bin_vat"]),
  label: z.string().trim().max(80).optional(),
  url: z.string().trim().min(1),
  publicId: z.string().trim().optional(),
  fileName: z.string().trim().max(180).optional(),
  fileType: z.string().trim().max(120).optional(),
  resourceType: z.string().trim().max(40).optional(),
  uploadedAt: z.string().datetime().nullable().optional()
})

const storeSettingsUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  phone: z.string().regex(/^01\d{9}$/).optional(),
  preparationTimeMinutes: z
    .number()
    .int()
    .min(5)
    .max(MAX_PREPARATION_TIME_MINUTES)
    .nullable()
    .optional(),
  autoAcceptOrders: z.boolean().optional(),
  cuisineTypes: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  logo: mediaAssetSchema.optional(),
  coverImage: mediaAssetSchema.optional(),
  documents: z.array(restaurantDocumentSchema).max(4).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  notifications: z
    .object({
      newOrder: z.boolean().optional(),
      cancellation: z.boolean().optional(),
      payouts: z.boolean().optional(),
      support: z.boolean().optional()
    })
    .optional()
})

const openingHoursUpdateSchema = z.object({
  timezone: z.string().optional(),
  weeklySchedule: z.array(z.unknown()).optional(),
  exceptions: z.array(z.unknown()).optional(),
  temporaryClosure: z
    .object({
      isPaused: z.boolean().optional(),
      mode: z.string().nullable().optional(),
      resumeAt: z.string().nullable().optional(),
      reason: z.string().optional()
    })
    .optional()
})

const restaurantStatusSchema = z.object({
  isOnline: z.boolean(),
  source: z.enum(["owner_app", "owner_web"]).optional()
})

const reviewReplySchema = z.object({
  message: z.string().optional()
})

const reviewHideRequestSchema = z.object({
  reasonCategory: z.enum([
    "fake_spam",
    "abusive_language",
    "wrong_restaurant_or_order",
    "unfair_misleading",
    "other"
  ]),
  note: z.string().trim().max(500).optional()
})

const reviewsQuerySchema = z.object({
  search: z.string().optional(),
  rating: z.string().optional(),
  datePreset: z
    .enum(["today", "yesterday", "last7Days", "last30Days", "last90Days", "thisWeek", "thisMonth", "lastMonth", "lifetime", "custom"])
    .optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  commentFilter: z.enum(["all", "with-comments", "without-comments"]).optional(),
  replyFilter: z.enum(["all", "replied", "not-replied"]).optional(),
  sortBy: z.enum(["latest", "highest", "lowest"]).optional(),
  showNewOnly: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional()
})

const supportCaseCreateSchema = z.object({
  kind: z.enum(["report", "question"]).default("report"),
  subject: z.string().min(1),
  categoryId: z.string().min(1),
  message: z.string().min(1),
  priority: z.enum(["low", "medium", "high"]).optional(),
  attachments: z
    .array(
      mediaAssetSchema.extend({
        fileName: z.string().optional(),
        fileType: z.string().optional()
      })
    )
    .optional()
})

const supportCasesQuerySchema = z.object({
  search: z.string().optional(),
  categoryId: z.string().optional(),
  status: z.enum(["all", "open", "in_progress", "resolved", "closed"]).optional(),
  sortBy: z.enum(["latest", "oldest", "updated"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional()
})

const uploadSignatureSchema = z.object({
  folder: z.string().min(1).default("foodbela/owner"),
  resourceType: z.string().optional()
})

const deleteMediaSchema = z.object({
  publicId: z.string().min(1),
  resourceType: z.string().optional()
})

function getOwnerId(req: AuthenticatedRequest) {
  return req.user?.id ?? ""
}

function getStringParam(value: unknown) {
  if (typeof value === "string") return value
  if (Array.isArray(value)) {
    const firstValue = value[0]
    return typeof firstValue === "string" ? firstValue : ""
  }
  return ""
}

function inferRestaurantStatusSource(req: AuthenticatedRequest) {
  const userAgent = String(req.headers["user-agent"] ?? "").toLowerCase()
  if (
    userAgent.includes("expo") ||
    userAgent.includes("reactnative") ||
    userAgent.includes("okhttp")
  ) {
    return "owner_app" as const
  }
  return "owner_web" as const
}

export const getOwnerStoreSettings = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const data = await getStoreSettings(getOwnerId(req))
    return sendSuccess(res, { data })
  }
)

export const patchOwnerStoreSettings = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = storeSettingsUpdateSchema.parse(req.body)
    const data = await updateStoreSettings({
      ownerId: getOwnerId(req),
      ...payload
    })
    return sendSuccess(res, { message: "Store settings updated successfully", data })
  }
)

export const patchOwnerRestaurantStatus = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = restaurantStatusSchema.parse(req.body)
    const data = await updateRestaurantStatus({
      ownerId: getOwnerId(req),
      isOnline: payload.isOnline,
      source: payload.source ?? inferRestaurantStatusSource(req)
    })

    return sendSuccess(res, {
      message: payload.isOnline ? "Restaurant is now online" : "Restaurant is now offline",
      data
    })
  }
)

export const getOwnerOpeningHours = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const data = await getOpeningHours(getOwnerId(req))
    return sendSuccess(res, { data })
  }
)

export const putOwnerOpeningHours = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = openingHoursUpdateSchema.parse(req.body)
    const data = await updateOpeningHours({
      ownerId: getOwnerId(req),
      ...payload
    })
    return sendSuccess(res, { message: "Opening hours updated successfully", data })
  }
)

export const getOwnerReviews = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const query = reviewsQuerySchema.parse({
    search: getStringParam(req.query.search) || undefined,
    rating: getStringParam(req.query.rating) || undefined,
    datePreset: getStringParam(req.query.datePreset) || undefined,
    from: getStringParam(req.query.from) || undefined,
    to: getStringParam(req.query.to) || undefined,
    commentFilter: getStringParam(req.query.commentFilter) || undefined,
    replyFilter: getStringParam(req.query.replyFilter) || undefined,
    sortBy: getStringParam(req.query.sortBy) || undefined,
    showNewOnly: getStringParam(req.query.showNewOnly) || undefined,
    page: getStringParam(req.query.page) || undefined,
    pageSize: getStringParam(req.query.pageSize) || undefined
  })
  const data =
    query.search || query.rating || query.datePreset || query.commentFilter || query.replyFilter || query.sortBy || query.showNewOnly || query.page || query.pageSize
      ? await listReviewsWithFilters({
          ownerId: getOwnerId(req),
          ...query
        })
      : await listReviews(getOwnerId(req))
  return sendSuccess(res, { data })
})

export const postOwnerReviewReply = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = reviewReplySchema.parse(req.body)
    const data = await replyToReview({
      ownerId: getOwnerId(req),
      reviewId: getStringParam(req.params.reviewId),
      message: payload.message ?? ""
    })
    return sendSuccess(res, { message: "Review reply saved successfully", data })
  }
)

export const postOwnerReviewHideRequest = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = reviewHideRequestSchema.parse(req.body)
    const data = await requestReviewHide({
      ownerId: getOwnerId(req),
      reviewId: getStringParam(req.params.reviewId),
      reasonCategory: payload.reasonCategory,
      note: payload.note
    })
    return sendSuccess(res, { message: "Review hide request submitted", data })
  }
)

export const getOwnerSupportCases = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = supportCasesQuerySchema.parse({
      search: getStringParam(req.query.search) || undefined,
      categoryId: getStringParam(req.query.categoryId) || undefined,
      status: getStringParam(req.query.status) || undefined,
      sortBy: getStringParam(req.query.sortBy) || undefined,
      page: getStringParam(req.query.page) || undefined,
      pageSize: getStringParam(req.query.pageSize) || undefined
    })
    const data =
      query.search || query.categoryId || query.status || query.sortBy || query.page || query.pageSize
        ? await listSupportCasesWithFilters({
            ownerId: getOwnerId(req),
            ...query
          })
        : await listSupportCases(getOwnerId(req))
    return sendSuccess(res, { data })
  }
)

export const postOwnerSupportCase = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = supportCaseCreateSchema.parse(req.body)
    const data = await createSupportCase({
      ownerId: getOwnerId(req),
      ...payload
    })
    return sendSuccess(res, { message: "Support case created successfully", data })
  }
)

export const postMediaUploadSignature = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = uploadSignatureSchema.parse(req.body)
    const data = createUploadSignature(payload)
    return sendSuccess(res, { data })
  }
)

export const deleteMediaAsset = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = deleteMediaSchema.parse(req.body)
    const data = await deleteCloudinaryAsset(payload)
    return sendSuccess(res, { message: "Media asset deleted", data })
  }
)
