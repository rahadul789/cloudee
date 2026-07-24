import { Router } from "express"

import { requireAuth, requireRole } from "../../common/middleware/auth"
import {
  approveAdminReview,
  getAdminReview,
  getAdminReviewCases,
  getAdminReviews,
  patchAdminReviewModeration,
  patchAdminReviewsBulkModeration,
  postAdminReviewHideRequestApprove,
  postAdminReviewHideRequestReject,
  rejectAdminReview,
  startAdminReview
} from "./review.controller"

export const adminReviewRouter = Router()

adminReviewRouter.use(requireAuth, requireRole("admin"))

adminReviewRouter.get("/reviews", getAdminReviews)
adminReviewRouter.patch("/reviews/bulk-moderation", patchAdminReviewsBulkModeration)
adminReviewRouter.get("/reviews/:reviewId", getAdminReview)
adminReviewRouter.patch("/reviews/:reviewId/moderation", patchAdminReviewModeration)
adminReviewRouter.post("/reviews/:reviewId/hide-request/approve", postAdminReviewHideRequestApprove)
adminReviewRouter.post("/reviews/:reviewId/hide-request/reject", postAdminReviewHideRequestReject)
adminReviewRouter.get("/review-cases", getAdminReviewCases)
adminReviewRouter.post("/review-cases/:reviewCaseId/start-review", startAdminReview)
adminReviewRouter.post("/review-cases/:reviewCaseId/reject", rejectAdminReview)
adminReviewRouter.post("/review-cases/:reviewCaseId/approve", approveAdminReview)
