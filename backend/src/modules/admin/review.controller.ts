import type { Response } from "express"
import { z } from "zod"

import type { AuthenticatedRequest } from "../../common/middleware/auth"
import { asyncHandler } from "../../common/utils/async-handler"
import { sendSuccess } from "../../common/utils/api-response"
import {
  approveReviewHideRequest,
  approveReviewCase,
  bulkUpdateAdminReviews,
  getAdminReviewDetails,
  listReviewCases,
  listAdminReviews,
  moveReviewCaseToUnderReview,
  rejectReviewHideRequest,
  rejectReviewCase,
  updateAdminReviewModeration
} from "./review.service"

const listReviewCasesQuerySchema = z.object({
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
  status: z.enum(["submitted", "under_review", "approved", "rejected"]).optional()
})

const rejectReviewCaseSchema = z.object({
  reviewNote: z.string().min(1),
  reviewIssues: z.array(
    z.object({
      section: z.string().min(1),
      title: z.string().min(1),
      fields: z.array(z.string()).optional(),
      note: z.string().optional()
    })
  )
})

const listAdminReviewsQuerySchema = z.object({
  search: z.string().optional(),
  restaurantId: z.string().optional(),
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
  status: z.enum(["all", "visible", "hidden", "flagged"]).optional(),
  hideRequest: z.enum(["all", "none", "pending", "approved", "rejected", "cancelled"]).optional(),
  rating: z.enum(["all", "1", "2", "3", "4", "5"]).optional(),
  reply: z.enum(["all", "replied", "not_replied"]).optional(),
  comment: z.enum(["all", "with_comment", "without_comment"]).optional(),
  sortBy: z.enum(["newest", "oldest", "highest", "lowest"]).optional(),
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional()
})

const updateAdminReviewModerationSchema = z.object({
  status: z.enum(["visible", "hidden", "flagged"]),
  reason: z.string().optional()
})

const bulkUpdateAdminReviewsSchema = updateAdminReviewModerationSchema.extend({
  reviewIds: z.array(z.string().trim().min(1)).min(1)
})

const reviewHideRequestDecisionSchema = z.object({
  adminNote: z.string().trim().max(500).optional()
})

function getAdminId(req: AuthenticatedRequest) {
  return req.user?.id ?? "system-admin"
}

function getStringParam(value: unknown) {
  if (typeof value === "string") {
    return value
  }

  if (Array.isArray(value)) {
    const firstValue = value[0]
    return typeof firstValue === "string" ? firstValue : ""
  }

  return ""
}

function getOptionalStringParam(value: unknown) {
  const normalized = getStringParam(value).trim()
  return normalized.length > 0 ? normalized : undefined
}

function getAdminAreaScope(req: AuthenticatedRequest) {
  return listAdminReviewsQuerySchema.pick({ zoneId: true, districtId: true }).parse({
    zoneId: getOptionalStringParam(req.query.zoneId),
    districtId: getOptionalStringParam(req.query.districtId),
  })
}

export const getAdminReviewCases = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = listReviewCasesQuerySchema.parse({
      zoneId: getOptionalStringParam(req.query.zoneId),
      districtId: getOptionalStringParam(req.query.districtId),
      status: getOptionalStringParam(req.query.status)
    })
    const reviewCases = await listReviewCases(query.status, {
      zoneId: query.zoneId,
      districtId: query.districtId,
    })

    return sendSuccess(res, {
      data: reviewCases
    })
  }
)

export const getAdminReviews = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const query = listAdminReviewsQuerySchema.parse({
    search: getOptionalStringParam(req.query.search),
    restaurantId: getOptionalStringParam(req.query.restaurantId),
    zoneId: getOptionalStringParam(req.query.zoneId),
    districtId: getOptionalStringParam(req.query.districtId),
    status: getOptionalStringParam(req.query.status),
    hideRequest: getOptionalStringParam(req.query.hideRequest),
    rating: getOptionalStringParam(req.query.rating),
    reply: getOptionalStringParam(req.query.reply),
    comment: getOptionalStringParam(req.query.comment),
    sortBy: getOptionalStringParam(req.query.sortBy),
    page: req.query.page,
    pageSize: req.query.pageSize
  })
  const data = await listAdminReviews(query)
  return sendSuccess(res, { data })
})

export const getAdminReview = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = await getAdminReviewDetails(
    getStringParam(req.params.reviewId),
    getAdminAreaScope(req),
  )
  return sendSuccess(res, { data })
})

export const patchAdminReviewModeration = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const payload = updateAdminReviewModerationSchema.parse(req.body)
  const data = await updateAdminReviewModeration({
    reviewId: getStringParam(req.params.reviewId),
    status: payload.status,
    reason: payload.reason,
    adminId: getAdminId(req),
    ...getAdminAreaScope(req),
  })
  return sendSuccess(res, { message: "Review moderation updated", data })
})

export const patchAdminReviewsBulkModeration = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const payload = bulkUpdateAdminReviewsSchema.parse(req.body)
  const data = await bulkUpdateAdminReviews({
    reviewIds: payload.reviewIds,
    status: payload.status,
    reason: payload.reason,
    adminId: getAdminId(req),
    ...getAdminAreaScope(req),
  })
  return sendSuccess(res, { message: "Reviews updated", data })
})

export const postAdminReviewHideRequestApprove = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = reviewHideRequestDecisionSchema.parse(req.body)
    const data = await approveReviewHideRequest({
      reviewId: getStringParam(req.params.reviewId),
      adminId: getAdminId(req),
      adminNote: payload.adminNote,
      ...getAdminAreaScope(req),
    })
    return sendSuccess(res, { message: "Review hide request approved", data })
  }
)

export const postAdminReviewHideRequestReject = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = reviewHideRequestDecisionSchema.parse(req.body)
    const data = await rejectReviewHideRequest({
      reviewId: getStringParam(req.params.reviewId),
      adminId: getAdminId(req),
      adminNote: payload.adminNote,
      ...getAdminAreaScope(req),
    })
    return sendSuccess(res, { message: "Review hide request rejected", data })
  }
)

export const startAdminReview = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await moveReviewCaseToUnderReview(
    getStringParam(req.params.reviewCaseId),
    getAdminId(req),
    getAdminAreaScope(req)
  )

  return sendSuccess(res, {
    message: "Review moved to under review",
    data: result
  })
})

export const rejectAdminReview = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const payload = rejectReviewCaseSchema.parse(req.body)
  const result = await rejectReviewCase({
    reviewCaseId: getStringParam(req.params.reviewCaseId),
    adminId: getAdminId(req),
    ...getAdminAreaScope(req),
    reviewNote: payload.reviewNote,
    reviewIssues: payload.reviewIssues
  })

  return sendSuccess(res, {
    message: "Review rejected successfully",
    data: result
  })
})

export const approveAdminReview = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await approveReviewCase(
    getStringParam(req.params.reviewCaseId),
    getAdminId(req),
    getAdminAreaScope(req),
  )

  return sendSuccess(res, {
    message: "Review approved and restaurant published successfully",
    data: result
  })
})
