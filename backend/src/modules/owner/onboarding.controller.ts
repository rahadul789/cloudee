import type { Response } from "express"
import { StatusCodes } from "http-status-codes"
import { z } from "zod"

import type { AuthenticatedRequest } from "../../common/middleware/auth"
import { asyncHandler } from "../../common/utils/async-handler"
import { sendSuccess } from "../../common/utils/api-response"
import { AppError } from "../../common/utils/app-error"
import { OnboardingDraftModel, OwnerModel, ReviewCaseModel } from "../auth/auth.model"
import { assertLocationInsideServiceArea } from "../service-area/service-area.service"

const onboardingDraftUpdateSchema = z.object({
  currentStep: z.string().optional(),
  completedSteps: z.array(z.string()).optional(),
  skippedSteps: z.array(z.string()).optional(),
  basicInfo: z
    .object({
      restaurantName: z.string().optional(),
      fullName: z.string().optional(),
      phone: z.string().regex(/^01\d{9}$/).or(z.literal("")).optional(),
      email: z.string().email().or(z.literal("")).optional(),
      description: z.string().optional(),
      preparationTimeMinutes: z.number().int().min(5).max(120).optional(),
      cuisineTypes: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
      logo: z
        .object({
          url: z.string().optional(),
          publicId: z.string().optional()
        })
        .optional(),
      coverImage: z
        .object({
          url: z.string().optional(),
          publicId: z.string().optional()
        })
        .optional()
    })
    .optional(),
  location: z
    .object({
      address: z.string().optional(),
      city: z.string().optional(),
      latitude: z.number().nullable().optional(),
      longitude: z.number().nullable().optional()
    })
    .optional(),
  openingHours: z.record(z.string(), z.unknown()).optional(),
  payoutSetup: z
    .object({
      type: z.enum(["bkash", "bank"]).optional(),
      accountName: z.string().optional(),
      accountNumber: z.string().optional(),
      isVerified: z.boolean().optional()
    })
    .optional()
})

function assertOwnerId(req: AuthenticatedRequest) {
  if (!req.user?.id) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "UNAUTHORIZED", "Authentication required")
  }

  return req.user.id
}

function mergeNestedObject<T extends object, U extends object>(
  currentValue: T,
  nextValue?: U
) {
  if (!nextValue) {
    return currentValue
  }

  return {
    ...currentValue,
    ...nextValue
  } as T & U
}

export const getOnboardingDraft = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const ownerId = assertOwnerId(req)
  const owner = await OwnerModel.findById(ownerId)
  const draft = await OnboardingDraftModel.findOne({ ownerId })

  if (!owner || !draft) {
    throw new AppError(StatusCodes.NOT_FOUND, "ONBOARDING_DRAFT_NOT_FOUND", "Draft not found")
  }

  return sendSuccess(res, {
    data: {
      lifecycleStatus: owner.restaurantLifecycleStatus,
      draft
    }
  })
})

export const updateOnboardingDraft = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const ownerId = assertOwnerId(req)
    const payload = onboardingDraftUpdateSchema.parse(req.body)
    const owner = await OwnerModel.findById(ownerId)
    const draft = await OnboardingDraftModel.findOne({ ownerId })

    if (!owner || !draft) {
      throw new AppError(StatusCodes.NOT_FOUND, "ONBOARDING_DRAFT_NOT_FOUND", "Draft not found")
    }

    if (payload.currentStep !== undefined) {
      draft.currentStep = payload.currentStep
    }

    if (payload.completedSteps !== undefined) {
      draft.completedSteps = [...new Set(payload.completedSteps)]
    }

    if (payload.skippedSteps !== undefined) {
      draft.skippedSteps = [...new Set(payload.skippedSteps)]
    }

    draft.basicInfo = mergeNestedObject(draft.basicInfo ?? {}, payload.basicInfo)
    draft.location = mergeNestedObject(draft.location ?? {}, payload.location)
    draft.openingHours = mergeNestedObject(draft.openingHours ?? {}, payload.openingHours)
    draft.payoutSetup = mergeNestedObject(draft.payoutSetup ?? {}, payload.payoutSetup)
    draft.draftSavedAt = new Date()

    if (owner.restaurantLifecycleStatus === "phone_verified") {
      owner.restaurantLifecycleStatus = "onboarding_in_progress"
      await owner.save()
    }

    await draft.save()

    return sendSuccess(res, {
      message: "Onboarding draft saved",
      data: {
        lifecycleStatus: owner.restaurantLifecycleStatus,
        draft
      }
    })
  }
)

export const submitOnboardingDraft = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const ownerId = assertOwnerId(req)
    const owner = await OwnerModel.findById(ownerId)
    const draft = await OnboardingDraftModel.findOne({ ownerId })

    if (!owner || !draft) {
      throw new AppError(StatusCodes.NOT_FOUND, "ONBOARDING_DRAFT_NOT_FOUND", "Draft not found")
    }

    if (!draft.basicInfo?.restaurantName || !draft.location?.address) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "ONBOARDING_INCOMPLETE",
        "Complete the required onboarding fields before submitting"
      )
    }

    await assertLocationInsideServiceArea({
      latitude: draft.location?.latitude,
      longitude: draft.location?.longitude,
      required: true
    })

    draft.submittedAt = new Date()
    if (owner.restaurantLifecycleStatus === "rejected") {
      draft.resubmissionCount += 1
    }
    await draft.save()

    await ReviewCaseModel.findOneAndUpdate(
      { ownerId, draftId: draft._id },
      {
        ownerId,
        draftId: draft._id,
        restaurantId: draft.restaurantId,
        status: "submitted",
        submittedSnapshot: draft.toObject(),
        reviewNote: "",
        reviewIssues: [],
        submittedAt: draft.submittedAt
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )

    owner.restaurantLifecycleStatus = "submitted"
    await owner.save()

    return sendSuccess(res, {
      message: "Submitted for review",
      data: {
        restaurantLifecycleStatus: owner.restaurantLifecycleStatus,
        submittedAt: draft.submittedAt,
        resubmissionCount: draft.resubmissionCount
      }
    })
  }
)

export const getReviewStatus = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const ownerId = assertOwnerId(req)
  const owner = await OwnerModel.findById(ownerId)
  const draft = await OnboardingDraftModel.findOne({ ownerId })
  const reviewCase = await ReviewCaseModel.findOne({ ownerId }).sort({ createdAt: -1 })

  if (!owner) {
    throw new AppError(StatusCodes.NOT_FOUND, "OWNER_NOT_FOUND", "Owner not found")
  }

  return sendSuccess(res, {
    data: {
      restaurantLifecycleStatus: owner.restaurantLifecycleStatus,
      submittedAt: draft?.submittedAt ?? null,
      estimatedReviewTimeHours: 24,
      reviewNote: reviewCase?.reviewNote ?? "",
      reviewIssues: reviewCase?.reviewIssues ?? [],
      resubmissionCount: draft?.resubmissionCount ?? 0,
      draft: draft ?? null
    }
  })
})
