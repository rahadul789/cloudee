import type { Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import type { AuthenticatedRequest } from "../../common/middleware/auth";
import { asyncHandler } from "../../common/utils/async-handler";
import { sendSuccess } from "../../common/utils/api-response";
import {
  createAdminRestaurant,
  deleteAdminRestaurant,
  deleteAdminRestaurantReview,
  getAdminRestaurantDetails,
  listAdminRestaurantPromotionTargets,
  listAdminRestaurantOrders,
  listAdminRestaurants,
  reconcileAdminRestaurantFinance,
  restoreAdminRestaurantReview,
  updateAdminRestaurantCommission,
  updateAdminRestaurantDeliveryPricing,
  updateAdminRestaurantEnforcement,
  updateAdminRestaurantMerchandising,
  updateAdminRestaurantPayoutStatus,
  updateAdminRestaurantVisibility,
} from "./restaurants.service";

const listRestaurantsQuerySchema = z.object({
  search: z.string().optional(),
  visibility: z.enum(["all", "visible", "hidden"]).optional(),
  runtime: z.enum(["all", "online", "offline"]).optional(),
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
  sortBy: z
    .enum(["newestUpdated", "mostOrders", "highestRating", "completionHigh"])
    .optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

const createRestaurantSchema = z.object({
  ownerFullName: z.string().min(2),
  ownerPhone: z.string().regex(/^01\d{9}$/),
  ownerEmail: z.string().email().optional().or(z.literal("")),
  temporaryPassword: z.string().min(6),
  name: z.string().min(2),
  description: z.string().optional(),
  phone: z.string().regex(/^01\d{9}$/).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  payoutBkashNumber: z.string().regex(/^01\d{9}$/).optional().or(z.literal("")),
  cuisineTypes: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  preparationTimeMinutes: z.number().int().positive().nullable().optional(),
  serviceZoneId: z.string().trim().optional(),
  commissionRate: z.number().min(0).max(100).optional(),
  isVisible: z.boolean().optional(),
});

const detailsQuerySchema = z.object({
  preset: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const listRestaurantOrdersQuerySchema = detailsQuerySchema.extend({
  status: z.enum(["all", "live", "delivered", "cancelled"]).optional(),
  paymentMethod: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.enum(["newest", "oldest", "highestValue"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

const visibilitySchema = z.object({
  isVisible: z.boolean(),
});

const enforcementSchema = z.object({
  status: z.enum([
    "active",
    "under_review",
    "quality_hold",
    "temporarily_suspended",
    "permanently_disabled",
  ]),
  reason: z.string().trim().max(160).optional(),
  ownerNote: z.string().trim().max(500).optional(),
  customerMessage: z.string().trim().max(240).optional(),
  internalNote: z.string().trim().max(1000).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

const merchandisingSchema = z.object({
  isFeatured: z.boolean(),
  featuredPosition: z.number().int().positive().nullable().optional(),
  customerNote: z
    .object({
      enabled: z.boolean(),
      label: z.string().trim().max(80).optional(),
      placeholder: z.string().trim().max(160).optional(),
    })
    .optional(),
});

const commissionSchema = z.object({
  commissionRate: z.number().min(0).max(100),
});

const deliveryPricingSchema = z.object({
  enabled: z.boolean(),
  baseFeeTaka: z.number().min(0).optional(),
  distanceSurchargeEnabled: z.boolean().optional(),
  surchargeStartsAfterKm: z.number().min(0).optional(),
  surchargeStepMeters: z.number().positive().optional(),
  surchargeAmountTaka: z.number().min(0).optional(),
});

const payoutStatusSchema = z.object({
  status: z.enum(["processing", "completed", "failed"]),
  expectedStatus: z.string().optional(),
  failureReason: z.string().optional(),
  providerReference: z.string().trim().max(120).optional(),
  providerPayoutId: z.string().trim().max(120).optional(),
  providerTransactionId: z.string().trim().max(120).optional(),
  paymentProofUrl: z.string().trim().max(500).optional(),
  processingNote: z.string().trim().max(500).optional(),
  notifyOwnerSms: z.boolean().optional(),
});

function getStringParam(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getAdminId(req: AuthenticatedRequest) {
  return req.user?.id ?? "";
}

export const getAdminRestaurants = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = listRestaurantsQuerySchema.parse(req.query);
    const data = await listAdminRestaurants(query);

    return sendSuccess(res, { data });
  },
);

export const postAdminRestaurant = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = createRestaurantSchema.parse(req.body);
    const data = await createAdminRestaurant({
      ...payload,
      ownerEmail: payload.ownerEmail || undefined,
      email: payload.email || undefined,
    });

    return sendSuccess(res, {
      statusCode: StatusCodes.CREATED,
      message: "Restaurant added successfully",
      data,
    });
  },
);

export const getAdminRestaurant = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = detailsQuerySchema.parse(req.query);
    const data = await getAdminRestaurantDetails(
      getStringParam(req.params.restaurantId),
      query,
    );

    return sendSuccess(res, { data });
  },
);

export const getAdminRestaurantOrders = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = listRestaurantOrdersQuerySchema.parse(req.query);
    const data = await listAdminRestaurantOrders(
      getStringParam(req.params.restaurantId),
      query,
    );

    return sendSuccess(res, { data });
  },
);

export const getAdminRestaurantPromotionTargets = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const data = await listAdminRestaurantPromotionTargets(
      getStringParam(req.params.restaurantId),
    );

    return sendSuccess(res, { data });
  },
);

export const deleteAdminRestaurantReviewController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const data = await deleteAdminRestaurantReview({
      restaurantId: getStringParam(req.params.restaurantId),
      reviewId: getStringParam(req.params.reviewId),
      adminId: getAdminId(req),
    });

    return sendSuccess(res, {
      message: "Review hidden successfully",
      data,
    });
  },
);

export const restoreAdminRestaurantReviewController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const data = await restoreAdminRestaurantReview({
      restaurantId: getStringParam(req.params.restaurantId),
      reviewId: getStringParam(req.params.reviewId),
      adminId: getAdminId(req),
    });

    return sendSuccess(res, {
      message: "Review restored successfully",
      data,
    });
  },
);

export const patchAdminRestaurantVisibility = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = visibilitySchema.parse(req.body);
    const data = await updateAdminRestaurantVisibility({
      restaurantId: getStringParam(req.params.restaurantId),
      isVisible: payload.isVisible,
    });

    return sendSuccess(res, {
      message: payload.isVisible
        ? "Restaurant is visible to customers"
        : "Restaurant is hidden from customers",
      data,
    });
  },
);

export const patchAdminRestaurantEnforcement = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = enforcementSchema.parse(req.body);
    const data = await updateAdminRestaurantEnforcement({
      restaurantId: getStringParam(req.params.restaurantId),
      adminId: getAdminId(req),
      ...payload,
    });

    return sendSuccess(res, {
      message: "Restaurant enforcement updated",
      data,
    });
  },
);

export const patchAdminRestaurantMerchandising = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = merchandisingSchema.parse(req.body);
    const data = await updateAdminRestaurantMerchandising({
      restaurantId: getStringParam(req.params.restaurantId),
      isFeatured: payload.isFeatured,
      featuredPosition: payload.featuredPosition ?? null,
      customerNote: payload.customerNote,
    });

    return sendSuccess(res, {
      message: payload.isFeatured
        ? "Restaurant is featured"
        : "Restaurant feature placement removed",
      data,
    });
  },
);

export const patchAdminRestaurantCommission = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = commissionSchema.parse(req.body);
    const data = await updateAdminRestaurantCommission({
      restaurantId: getStringParam(req.params.restaurantId),
      commissionRate: payload.commissionRate,
      adminId: getAdminId(req),
    });

    return sendSuccess(res, {
      message: "Restaurant commission updated",
      data,
    });
  },
);

export const patchAdminRestaurantDeliveryPricing = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = deliveryPricingSchema.parse(req.body);
    const data = await updateAdminRestaurantDeliveryPricing({
      restaurantId: getStringParam(req.params.restaurantId),
      adminId: getAdminId(req),
      override: payload,
    });

    return sendSuccess(res, {
      message: payload.enabled
        ? "Restaurant delivery pricing override updated"
        : "Restaurant delivery pricing override disabled",
      data,
    });
  },
);

export const postAdminRestaurantFinanceReconcile = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const data = await reconcileAdminRestaurantFinance({
      restaurantId: getStringParam(req.params.restaurantId),
      adminId: getAdminId(req),
    });

    return sendSuccess(res, {
      message: "Restaurant finance reconciled",
      data,
    });
  },
);

export const patchAdminRestaurantPayoutStatus = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = payoutStatusSchema.parse(req.body);
    const data = await updateAdminRestaurantPayoutStatus({
      restaurantId: getStringParam(req.params.restaurantId),
      payoutId: getStringParam(req.params.payoutId),
      status: payload.status,
      expectedStatus: payload.expectedStatus,
      failureReason: payload.failureReason,
      providerReference: payload.providerReference,
      providerPayoutId: payload.providerPayoutId,
      providerTransactionId: payload.providerTransactionId,
      paymentProofUrl: payload.paymentProofUrl,
      processingNote: payload.processingNote,
      notifyOwnerSms: payload.notifyOwnerSms,
      adminId: getAdminId(req),
    });

    return sendSuccess(res, {
      message: "Payout status updated",
      data,
    });
  },
);

export const deleteAdminRestaurantController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const data = await deleteAdminRestaurant(
      getStringParam(req.params.restaurantId),
    );

    return sendSuccess(res, {
      message:
        data.mode === "deleted"
          ? "Restaurant deleted successfully"
          : "Restaurant has order history, so it was hidden instead",
      data,
    });
  },
);
