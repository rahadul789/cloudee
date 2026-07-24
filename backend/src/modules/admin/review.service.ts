import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import { emitSocketEvent } from "../../config/socket";
import { AppError } from "../../common/utils/app-error";
import { slugify } from "../../common/utils/slugify";
import { resolveAdminOperationalAlertByDedupeKey } from "./admin-alert.service";
import { AdminAuditLogModel, AdminModel } from "./admin.model";
import {
  OnboardingDraftModel,
  PayoutMethodModel,
  RestaurantModel,
  ReviewCaseModel,
  OwnerModel,
} from "../auth/auth.model";
import { CustomerModel } from "../customer/customer.model";
import { ReviewModel } from "../owner/experience.model";
import { OrderModel } from "../owner/operational.model";
import {
  buildRestaurantServiceAreaScopeFilter,
  isServiceAreaModeEnabled,
  resolveServiceZoneForCoordinates,
  serviceAreaSnapshotMatchesScope,
} from "../service-area/service-area.service";
import { createOwnerNotification } from "../owner/operational.service";

type AdminReviewModerationStatus = "visible" | "hidden" | "flagged";
type OwnerHideRequestStatus = "none" | "pending" | "approved" | "rejected" | "cancelled";
type OwnerHideReasonCategory =
  | ""
  | "fake_spam"
  | "abusive_language"
  | "wrong_restaurant_or_order"
  | "unfair_misleading"
  | "other";

type ListAdminReviewsParams = {
  search?: string;
  restaurantId?: string;
  zoneId?: string;
  districtId?: string;
  status?: "all" | AdminReviewModerationStatus;
  hideRequest?: "all" | OwnerHideRequestStatus;
  rating?: "all" | "1" | "2" | "3" | "4" | "5";
  reply?: "all" | "replied" | "not_replied";
  comment?: "all" | "with_comment" | "without_comment";
  sortBy?: "newest" | "oldest" | "highest" | "lowest";
  page?: number;
  pageSize?: number;
};

type AdminAreaScopeParams = {
  zoneId?: string;
  districtId?: string;
};

function objectIdString(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof mongoose.Types.ObjectId) return value.toString();
  if (typeof value === "object" && "toString" in value) return String(value);
  return "";
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function serializeDate(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function reviewHideRequestDedupeKey(reviewId: string) {
  return `review:${reviewId}:owner_hide_request`;
}

function ownerHideRequestStatus(value: unknown): OwnerHideRequestStatus {
  if (
    value === "pending" ||
    value === "approved" ||
    value === "rejected" ||
    value === "cancelled"
  ) {
    return value;
  }
  return "none";
}

function ownerHideReasonCategory(value: unknown): OwnerHideReasonCategory {
  if (
    value === "fake_spam" ||
    value === "abusive_language" ||
    value === "wrong_restaurant_or_order" ||
    value === "unfair_misleading" ||
    value === "other"
  ) {
    return value;
  }
  return "";
}

function mapOwnerHideRequest(value: unknown) {
  const request = value && typeof value === "object" ? (value as Record<string, any>) : {};
  return {
    status: ownerHideRequestStatus(request.status),
    reasonCategory: ownerHideReasonCategory(request.reasonCategory),
    note: stringValue(request.note),
    requestedAt: serializeDate(request.requestedAt),
    reviewedAt: serializeDate(request.reviewedAt),
    reviewedByAdminId: stringValue(request.reviewedByAdminId),
    adminNote: stringValue(request.adminNote),
  };
}

function labelReviewHideReason(reasonCategory: string) {
  if (reasonCategory === "fake_spam") return "Fake or spam review";
  if (reasonCategory === "abusive_language") return "Abusive language";
  if (reasonCategory === "wrong_restaurant_or_order") return "Wrong restaurant or order";
  if (reasonCategory === "unfair_misleading") return "Unfair or misleading review";
  return "Other review concern";
}

function clampPage(value?: number) {
  if (!value || Number.isNaN(value)) return 1;
  return Math.max(1, Math.floor(value));
}

function clampPageSize(value?: number) {
  if (!value || Number.isNaN(value)) return 20;
  return Math.min(100, Math.max(5, Math.floor(value)));
}

async function getAdminName(adminId?: string) {
  if (!adminId) return { name: "Admin", role: "admin" };
  const admin = await AdminModel.findById(adminId, {
    fullName: 1,
    role: 1,
  }).lean();
  return {
    name: stringValue(admin?.fullName, "Admin"),
    role: stringValue(admin?.role, "admin"),
  };
}

async function writeReviewAudit(params: {
  adminId?: string;
  reviewId: string;
  action: string;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
}) {
  const admin = await getAdminName(params.adminId);
  await AdminAuditLogModel.create({
    actorAdminId: params.adminId ?? "",
    actorName: admin.name,
    actorRole: admin.role,
    entityType: "review",
    entityId: params.reviewId,
    action: params.action,
    title: params.title,
    description: params.description ?? "",
    metadata: params.metadata ?? {},
  });
}

async function buildReviewQuery(params: ListAdminReviewsParams) {
  const query: Record<string, any> = {};
  if (
    params.restaurantId &&
    params.restaurantId !== "all" &&
    mongoose.Types.ObjectId.isValid(params.restaurantId)
  ) {
    query.restaurantId = new mongoose.Types.ObjectId(params.restaurantId);
  } else {
    const restaurantScopeFilter = buildRestaurantServiceAreaScopeFilter(params);
    if (Object.keys(restaurantScopeFilter).length) {
      const restaurantIds = await RestaurantModel.distinct("_id", restaurantScopeFilter);
      query.restaurantId = { $in: restaurantIds };
    }
  }
  if (params.status && params.status !== "all") {
    query.moderationStatus = params.status;
    if (params.status === "hidden") query.isHidden = true;
    if (params.status === "visible") query.isHidden = { $ne: true };
  }
  if (params.hideRequest && params.hideRequest !== "all") {
    if (params.hideRequest === "none") {
      query.$and = [
        ...(query.$and ?? []),
        {
          $or: [
            { ownerHideRequest: { $exists: false } },
            { "ownerHideRequest.status": { $exists: false } },
            { "ownerHideRequest.status": "none" },
            { "ownerHideRequest.status": "" },
          ],
        },
      ];
    } else {
      query["ownerHideRequest.status"] = params.hideRequest;
    }
  }
  if (params.rating && params.rating !== "all")
    query.rating = Number(params.rating);
  if (params.reply === "replied") {
    query["ownerReply.message"] = { $exists: true, $ne: "" };
  }
  if (params.reply === "not_replied") {
    query.$or = [
      { "ownerReply.message": { $exists: false } },
      { "ownerReply.message": "" },
    ];
  }
  if (params.comment === "with_comment") {
    query.comment = { $exists: true, $ne: "" };
  }
  if (params.comment === "without_comment") {
    query.$and = [
      ...(query.$and ?? []),
      { $or: [{ comment: { $exists: false } }, { comment: "" }] },
    ];
  }
  if (params.search?.trim()) {
    const search = params.search.trim();
    query.$and = [
      ...(query.$and ?? []),
      {
        $or: [
          { comment: { $regex: search, $options: "i" } },
          { hiddenReason: { $regex: search, $options: "i" } },
          { flaggedReason: { $regex: search, $options: "i" } },
          { "ownerHideRequest.note": { $regex: search, $options: "i" } },
          { "ownerHideRequest.adminNote": { $regex: search, $options: "i" } },
          { customerId: { $regex: search, $options: "i" } },
        ],
      },
    ];
  }
  return query;
}

async function assertReviewInAdminScope(
  review: { restaurantId?: unknown } | null | undefined,
  params?: { zoneId?: string; districtId?: string },
) {
  if (!params?.zoneId?.trim() && !params?.districtId?.trim()) return;
  const restaurantScopeFilter = buildRestaurantServiceAreaScopeFilter(params);
  const exists = await RestaurantModel.exists({
    _id: review?.restaurantId,
    ...restaurantScopeFilter,
  });
  if (exists) return;
  throw new AppError(
    StatusCodes.NOT_FOUND,
    "REVIEW_NOT_FOUND",
    "Review not found",
  );
}

function mapReview(params: {
  review: Record<string, any>;
  restaurant?: Record<string, any>;
  customer?: Record<string, any>;
  order?: Record<string, any>;
}) {
  const review = params.review;
  const customerName =
    stringValue(params.customer?.fullName) ||
    stringValue(params.order?.customerSnapshot?.fullName) ||
    stringValue(params.order?.customerSnapshot?.name) ||
    "Foodbela customer";
  return {
    id: objectIdString(review._id),
    restaurantId: objectIdString(review.restaurantId),
    restaurantName: stringValue(params.restaurant?.name, "Restaurant"),
    restaurantCity: stringValue(params.restaurant?.address?.city),
    customerId: stringValue(review.customerId),
    customerName,
    customerPhone:
      stringValue(params.customer?.phone) ||
      stringValue(params.order?.customerSnapshot?.phone),
    orderId: objectIdString(review.orderId),
    orderNumber: stringValue(params.order?.orderNumber),
    orderStatus: stringValue(params.order?.status),
    rating: numberValue(review.rating),
    comment: stringValue(review.comment),
    ownerReplyMessage: stringValue(review.ownerReply?.message),
    ownerReplyCreatedAt: serializeDate(review.ownerReply?.createdAt),
    ownerReplyUpdatedAt: serializeDate(review.ownerReply?.updatedAt),
    moderationStatus: stringValue(
      review.moderationStatus,
      "visible",
    ) as AdminReviewModerationStatus,
    isHidden: review.isHidden === true,
    hiddenAt: serializeDate(review.hiddenAt),
    hiddenByAdminId: stringValue(review.hiddenByAdminId),
    hiddenReason: stringValue(review.hiddenReason),
    flaggedAt: serializeDate(review.flaggedAt),
    flaggedByAdminId: stringValue(review.flaggedByAdminId),
    flaggedReason: stringValue(review.flaggedReason),
    ownerHideRequest: mapOwnerHideRequest(review.ownerHideRequest),
    createdAt: serializeDate(review.createdAt),
    updatedAt: serializeDate(review.updatedAt),
  };
}

async function hydrateReviewRows(reviews: Array<Record<string, any>>) {
  const restaurantIds = [
    ...new Set(
      reviews
        .map((review) => objectIdString(review.restaurantId))
        .filter(Boolean),
    ),
  ];
  const customerIds = [
    ...new Set(
      reviews
        .map((review) => stringValue(review.customerId))
        .filter((id) => mongoose.Types.ObjectId.isValid(id)),
    ),
  ];
  const orderIds = [
    ...new Set(
      reviews.map((review) => objectIdString(review.orderId)).filter(Boolean),
    ),
  ];
  const [restaurants, customers, orders] = await Promise.all([
    restaurantIds.length
      ? RestaurantModel.find(
          { _id: { $in: restaurantIds } },
          { name: 1, address: 1 },
        ).lean()
      : [],
    customerIds.length
      ? CustomerModel.find(
          { _id: { $in: customerIds } },
          { fullName: 1, phone: 1, email: 1 },
        ).lean()
      : [],
    orderIds.length
      ? OrderModel.find(
          { _id: { $in: orderIds } },
          {
            orderNumber: 1,
            status: 1,
            customerSnapshot: 1,
            pricing: 1,
            createdAt: 1,
            timestamps: 1,
          },
        ).lean()
      : [],
  ]);
  const restaurantMap = new Map(
    restaurants.map((restaurant) => [
      objectIdString(restaurant._id),
      restaurant,
    ]),
  );
  const customerMap = new Map(
    customers.map((customer) => [objectIdString(customer._id), customer]),
  );
  const orderMap = new Map(
    orders.map((order) => [objectIdString(order._id), order]),
  );
  return reviews.map((review) =>
    mapReview({
      review,
      restaurant: restaurantMap.get(objectIdString(review.restaurantId)),
      customer: customerMap.get(stringValue(review.customerId)),
      order: orderMap.get(objectIdString(review.orderId)),
    }),
  );
}

function buildRestaurantLocationPoint(
  latitude?: number | null,
  longitude?: number | null,
) {
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return null;
  }

  return {
    type: "Point" as const,
    coordinates: [longitude, latitude],
  };
}

async function getReviewCaseOrThrow(reviewCaseId: string) {
  const reviewCase = await ReviewCaseModel.findById(reviewCaseId);

  if (!reviewCase) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "REVIEW_CASE_NOT_FOUND",
      "Review case not found",
    );
  }

  return reviewCase;
}

async function assertReviewCaseInAdminScope(
  reviewCase: Record<string, any>,
  params: AdminAreaScopeParams = {},
) {
  if (!params.zoneId?.trim() && !params.districtId?.trim()) return;
  const draftId = objectIdString(reviewCase.draftId);
  const draft = draftId ? await OnboardingDraftModel.findById(draftId).lean() : null;
  const serviceArea = await resolveServiceZoneForCoordinates({
    latitude: draft?.location?.latitude,
    longitude: draft?.location?.longitude,
  });
  if (!serviceAreaSnapshotMatchesScope(serviceArea?.snapshot, params)) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "REVIEW_CASE_NOT_FOUND",
      "Review case not found in this area",
    );
  }
}

async function filterReviewCasesByAdminScope(
  reviewCases: Array<Record<string, any>>,
  params: AdminAreaScopeParams = {},
) {
  if (!params.zoneId?.trim() && !params.districtId?.trim()) return reviewCases;
  const filtered = [];
  for (const reviewCase of reviewCases) {
    const draftId = objectIdString(reviewCase.draftId);
    const draft = draftId ? await OnboardingDraftModel.findById(draftId).lean() : null;
    const serviceArea = await resolveServiceZoneForCoordinates({
      latitude: draft?.location?.latitude,
      longitude: draft?.location?.longitude,
    });
    if (serviceAreaSnapshotMatchesScope(serviceArea?.snapshot, params)) {
      filtered.push(reviewCase);
    }
  }
  return filtered;
}

export async function listReviewCases(
  status?: string,
  params: AdminAreaScopeParams = {},
) {
  const query = status ? { status } : {};
  const reviewCases = await ReviewCaseModel.find(query).sort({ createdAt: -1 }).lean();
  return filterReviewCasesByAdminScope(reviewCases, params);
}

export async function listAdminReviews(params: ListAdminReviewsParams) {
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const query = await buildReviewQuery(params);
  const sort: Record<string, 1 | -1> =
    params.sortBy === "oldest"
      ? { createdAt: 1 }
      : params.sortBy === "highest"
        ? { rating: -1, createdAt: -1 }
        : params.sortBy === "lowest"
          ? { rating: 1, createdAt: -1 }
          : { createdAt: -1 };

  const summaryMatch =
    params.restaurantId &&
    params.restaurantId !== "all" &&
    mongoose.Types.ObjectId.isValid(params.restaurantId)
      ? { restaurantId: new mongoose.Types.ObjectId(params.restaurantId) }
      : query.restaurantId
        ? { restaurantId: query.restaurantId }
        : {};
  const restaurantScopeFilter = buildRestaurantServiceAreaScopeFilter(params);

  const [reviews, total, summaryRows, restaurants] = await Promise.all([
    ReviewModel.find(query)
      .sort(sort)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    ReviewModel.countDocuments(query),
    ReviewModel.aggregate<Record<string, any>>([
      { $match: summaryMatch },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          visible: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$moderationStatus", "visible"] },
                    { $ne: ["$isHidden", true] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          hidden: { $sum: { $cond: [{ $eq: ["$isHidden", true] }, 1, 0] } },
          flagged: {
            $sum: { $cond: [{ $eq: ["$moderationStatus", "flagged"] }, 1, 0] },
          },
          hideRequestsPending: {
            $sum: {
              $cond: [{ $eq: ["$ownerHideRequest.status", "pending"] }, 1, 0],
            },
          },
          withComments: {
            $sum: {
              $cond: [
                { $gt: [{ $strLenCP: { $ifNull: ["$comment", ""] } }, 0] },
                1,
                0,
              ],
            },
          },
          unanswered: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    { $strLenCP: { $ifNull: ["$ownerReply.message", ""] } },
                    0,
                  ],
                },
                1,
                0,
              ],
            },
          },
          visibleRatingSum: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$moderationStatus", "visible"] },
                    { $ne: ["$isHidden", true] },
                  ],
                },
                "$rating",
                0,
              ],
            },
          },
          visibleRatingCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$moderationStatus", "visible"] },
                    { $ne: ["$isHidden", true] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
    RestaurantModel.find(restaurantScopeFilter, { name: 1, address: 1 })
      .sort({ name: 1 })
      .limit(500)
      .lean(),
  ]);

  const items = await hydrateReviewRows(reviews);
  const summary = summaryRows[0] ?? {};
  const visibleRatingCount = numberValue(summary.visibleRatingCount);

  return {
    items,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    summary: {
      total: numberValue(summary.total),
      visible: numberValue(summary.visible),
      hidden: numberValue(summary.hidden),
      flagged: numberValue(summary.flagged),
      hideRequestsPending: numberValue(summary.hideRequestsPending),
      withComments: numberValue(summary.withComments),
      unanswered: numberValue(summary.unanswered),
      averageVisibleRating:
        visibleRatingCount > 0
          ? Number(
              (
                numberValue(summary.visibleRatingSum) / visibleRatingCount
              ).toFixed(1),
            )
          : 0,
    },
    restaurants: restaurants.map((restaurant) => ({
      id: objectIdString(restaurant._id),
      name: stringValue(restaurant.name, "Restaurant"),
      city: stringValue(
        (restaurant.address as { city?: string } | undefined)?.city,
      ),
    })),
  };
}

export async function getAdminReviewDetails(
  reviewId: string,
  params: { zoneId?: string; districtId?: string } = {},
) {
  if (!mongoose.Types.ObjectId.isValid(reviewId)) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "REVIEW_NOT_FOUND",
      "Review not found",
    );
  }
  const review = await ReviewModel.findById(reviewId).lean();
  if (!review) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "REVIEW_NOT_FOUND",
      "Review not found",
    );
  }
  await assertReviewInAdminScope(review, params);

  const [mappedReview] = await hydrateReviewRows([review]);
  const [auditLogs, order] = await Promise.all([
    AdminAuditLogModel.find({ entityType: "review", entityId: reviewId })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean(),
    review.orderId
      ? OrderModel.findById(review.orderId, {
          orderNumber: 1,
          status: 1,
          pricing: 1,
          itemsSnapshot: 1,
          paymentMethod: 1,
          paymentStatus: 1,
          createdAt: 1,
          timestamps: 1,
        }).lean()
      : null,
  ]);

  return {
    review: mappedReview,
    order: order
      ? {
          id: objectIdString(order._id),
          orderNumber: stringValue(order.orderNumber),
          status: stringValue(order.status),
          total: numberValue(
            (order.pricing as { total?: number } | undefined)?.total,
          ),
          paymentMethod: stringValue(order.paymentMethod),
          paymentStatus: stringValue(order.paymentStatus),
          itemCount: Array.isArray(order.itemsSnapshot)
            ? order.itemsSnapshot.reduce(
                (sum: number, item: Record<string, any>) =>
                  sum + numberValue(item.quantity, 1),
                0,
              )
            : 0,
          createdAt: serializeDate(order.createdAt),
          deliveredAt: serializeDate(
            order.timestamps?.Delivered ?? order.timestamps?.deliveredAt,
          ),
        }
      : null,
    moderationHistory: Array.isArray(
      (review as Record<string, any>).moderationHistory,
    )
      ? (
          (review as Record<string, any>).moderationHistory as Array<
            Record<string, any>
          >
        ).map((entry) => ({
          action: stringValue(entry.action),
          reason: stringValue(entry.reason),
          adminId: stringValue(entry.adminId),
          createdAt: serializeDate(entry.createdAt),
        }))
      : [],
    auditLogs: auditLogs.map((log) => ({
      id: objectIdString(log._id),
      action: stringValue(log.action),
      title: stringValue(log.title),
      description: stringValue(log.description),
      actorName: stringValue(log.actorName, "Admin"),
      createdAt: serializeDate(log.createdAt),
      metadata: log.metadata ?? {},
    })),
  };
}

export async function updateAdminReviewModeration(params: {
  reviewId: string;
  status: AdminReviewModerationStatus;
  reason?: string;
  adminId?: string;
  zoneId?: string;
  districtId?: string;
}) {
  if (!mongoose.Types.ObjectId.isValid(params.reviewId)) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "REVIEW_NOT_FOUND",
      "Review not found",
    );
  }
  const review = await ReviewModel.findById(params.reviewId);
  if (!review) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "REVIEW_NOT_FOUND",
      "Review not found",
    );
  }
  await assertReviewInAdminScope(review, params);

  const now = new Date();
  const previousStatus = stringValue(review.moderationStatus, "visible");
  review.moderationStatus = params.status;
  review.isHidden = params.status === "hidden";
  if (params.status === "hidden") {
    review.hiddenAt = now;
    review.hiddenByAdminId = params.adminId ?? "";
    review.hiddenReason = params.reason ?? "Hidden by admin";
  }
  if (params.status === "visible") {
    review.hiddenAt = null;
    review.hiddenByAdminId = "";
    review.hiddenReason = "";
    review.flaggedAt = null;
    review.flaggedByAdminId = "";
    review.flaggedReason = "";
  }
  if (params.status === "flagged") {
    review.isHidden = false;
    review.flaggedAt = now;
    review.flaggedByAdminId = params.adminId ?? "";
    review.flaggedReason = params.reason ?? "Flagged for review";
  }
  review.moderationHistory.push({
    action: params.status,
    reason: params.reason ?? "",
    adminId: params.adminId ?? "",
    createdAt: now,
  });
  await review.save();

  await writeReviewAudit({
    adminId: params.adminId,
    reviewId: params.reviewId,
    action: `review.${params.status}`,
    title:
      params.status === "hidden"
        ? "Review hidden"
        : params.status === "flagged"
          ? "Review flagged"
          : "Review restored",
    description:
      params.reason ||
      (params.status === "hidden"
        ? "Review hidden from public ratings."
        : params.status === "flagged"
          ? "Review flagged for admin follow-up."
          : "Review restored to public ratings."),
    metadata: {
      previousStatus,
      nextStatus: params.status,
      restaurantId: objectIdString(review.restaurantId),
      rating: numberValue(review.rating),
    },
  });

  const restaurant = await RestaurantModel.findById(review.restaurantId, {
    ownerId: 1,
  }).lean();
  const ownerId = objectIdString(restaurant?.ownerId);
  if (ownerId) {
    emitSocketEvent(`owner:${ownerId}`, "review.updated", {
      reviewId: review.id,
      status: params.status,
    });
  }
  emitSocketEvent("admin:ops", "admin.review.updated", {
    reviewId: review.id,
    status: params.status,
  });

  const [item] = await hydrateReviewRows([review.toObject()]);
  return item;
}

export async function approveReviewHideRequest(params: {
  reviewId: string;
  adminNote?: string;
  adminId?: string;
  zoneId?: string;
  districtId?: string;
}) {
  if (!mongoose.Types.ObjectId.isValid(params.reviewId)) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "REVIEW_NOT_FOUND",
      "Review not found",
    );
  }
  const review = await ReviewModel.findById(params.reviewId);
  if (!review) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "REVIEW_NOT_FOUND",
      "Review not found",
    );
  }
  await assertReviewInAdminScope(review, params);

  const request = mapOwnerHideRequest(review.ownerHideRequest);
  if (request.status !== "pending") {
    throw new AppError(
      StatusCodes.CONFLICT,
      "REVIEW_HIDE_REQUEST_NOT_PENDING",
      "This review does not have a pending hide request",
    );
  }

  const now = new Date();
  const adminNote = String(params.adminNote ?? "").trim();
  const reason = adminNote || request.note || labelReviewHideReason(request.reasonCategory);
  const previousStatus = stringValue(review.moderationStatus, "visible");
  review.moderationStatus = "hidden";
  review.isHidden = true;
  review.hiddenAt = now;
  review.hiddenByAdminId = params.adminId ?? "";
  review.hiddenReason = reason || "Owner hide request approved";
  review.ownerHideRequest = {
    status: "approved",
    reasonCategory: request.reasonCategory,
    note: request.note,
    requestedAt: request.requestedAt ? new Date(request.requestedAt) : null,
    reviewedAt: now,
    reviewedByAdminId: params.adminId ?? "",
    adminNote,
  };
  review.moderationHistory.push({
    action: "owner_hide_approved",
    reason,
    adminId: params.adminId ?? "",
    createdAt: now,
  });
  await review.save();

  const restaurant = await RestaurantModel.findById(review.restaurantId, {
    ownerId: 1,
    name: 1,
  }).lean();
  const ownerId = objectIdString(restaurant?.ownerId);

  await writeReviewAudit({
    adminId: params.adminId,
    reviewId: params.reviewId,
    action: "review.owner_hide_approved",
    title: "Owner review hide request approved",
    description: reason,
    metadata: {
      previousStatus,
      nextStatus: "hidden",
      restaurantId: objectIdString(review.restaurantId),
      ownerId,
      rating: numberValue(review.rating),
      reasonCategory: request.reasonCategory,
    },
  });
  await resolveAdminOperationalAlertByDedupeKey(reviewHideRequestDedupeKey(review.id));
  emitSocketEvent("admin:ops", "admin.review.updated", {
    reviewId: review.id,
    status: "hide_request_approved",
  });

  if (ownerId) {
    await createOwnerNotification({
      ownerId,
      restaurantId: objectIdString(review.restaurantId),
      type: "review",
      eventType: "review.hide_request.approved",
      entityType: "review",
      entityId: review.id,
      title: "Review hide request approved",
      description: "Admin approved your request. The review is hidden from customer-facing ratings.",
      actionPath: `/reviews?review=${review.id}`,
    });
    emitSocketEvent(`owner:${ownerId}`, "review.updated", {
      reviewId: review.id,
      status: "hide_request_approved",
    });
  }

  const [item] = await hydrateReviewRows([review.toObject()]);
  return item;
}

export async function rejectReviewHideRequest(params: {
  reviewId: string;
  adminNote?: string;
  adminId?: string;
  zoneId?: string;
  districtId?: string;
}) {
  if (!mongoose.Types.ObjectId.isValid(params.reviewId)) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "REVIEW_NOT_FOUND",
      "Review not found",
    );
  }
  const review = await ReviewModel.findById(params.reviewId);
  if (!review) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "REVIEW_NOT_FOUND",
      "Review not found",
    );
  }
  await assertReviewInAdminScope(review, params);

  const request = mapOwnerHideRequest(review.ownerHideRequest);
  if (request.status !== "pending") {
    throw new AppError(
      StatusCodes.CONFLICT,
      "REVIEW_HIDE_REQUEST_NOT_PENDING",
      "This review does not have a pending hide request",
    );
  }

  const now = new Date();
  const adminNote = String(params.adminNote ?? "").trim();
  const reason = adminNote || "Admin reviewed the request and kept the review visible.";
  review.ownerHideRequest = {
    status: "rejected",
    reasonCategory: request.reasonCategory,
    note: request.note,
    requestedAt: request.requestedAt ? new Date(request.requestedAt) : null,
    reviewedAt: now,
    reviewedByAdminId: params.adminId ?? "",
    adminNote: reason,
  };
  review.moderationHistory.push({
    action: "owner_hide_rejected",
    reason,
    adminId: params.adminId ?? "",
    createdAt: now,
  });
  await review.save();

  const restaurant = await RestaurantModel.findById(review.restaurantId, {
    ownerId: 1,
    name: 1,
  }).lean();
  const ownerId = objectIdString(restaurant?.ownerId);

  await writeReviewAudit({
    adminId: params.adminId,
    reviewId: params.reviewId,
    action: "review.owner_hide_rejected",
    title: "Owner review hide request rejected",
    description: reason,
    metadata: {
      restaurantId: objectIdString(review.restaurantId),
      ownerId,
      rating: numberValue(review.rating),
      reasonCategory: request.reasonCategory,
    },
  });
  await resolveAdminOperationalAlertByDedupeKey(reviewHideRequestDedupeKey(review.id));
  emitSocketEvent("admin:ops", "admin.review.updated", {
    reviewId: review.id,
    status: "hide_request_rejected",
  });

  if (ownerId) {
    await createOwnerNotification({
      ownerId,
      restaurantId: objectIdString(review.restaurantId),
      type: "review",
      eventType: "review.hide_request.rejected",
      entityType: "review",
      entityId: review.id,
      title: "Review hide request reviewed",
      description: reason,
      actionPath: `/reviews?review=${review.id}`,
    });
    emitSocketEvent(`owner:${ownerId}`, "review.updated", {
      reviewId: review.id,
      status: "hide_request_rejected",
    });
  }

  const [item] = await hydrateReviewRows([review.toObject()]);
  return item;
}

export async function bulkUpdateAdminReviews(params: {
  reviewIds: string[];
  status: AdminReviewModerationStatus;
  reason?: string;
  adminId?: string;
  zoneId?: string;
  districtId?: string;
}) {
  const ids = [...new Set(params.reviewIds)].filter((id) =>
    mongoose.Types.ObjectId.isValid(id),
  );
  if (!ids.length) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "REVIEW_SELECTION_REQUIRED",
      "Select at least one valid review",
    );
  }
  const items = [];
  for (const reviewId of ids) {
    items.push(
      await updateAdminReviewModeration({
        reviewId,
        status: params.status,
        reason: params.reason,
        adminId: params.adminId,
        zoneId: params.zoneId,
        districtId: params.districtId,
      }),
    );
  }
  return { updated: items.length, items };
}

export async function moveReviewCaseToUnderReview(
  reviewCaseId: string,
  adminId: string,
  params: AdminAreaScopeParams = {},
) {
  const reviewCase = await getReviewCaseOrThrow(reviewCaseId);
  await assertReviewCaseInAdminScope(reviewCase.toObject(), params);
  const owner = await OwnerModel.findById(reviewCase.ownerId);

  if (!owner) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "OWNER_NOT_FOUND",
      "Owner not found",
    );
  }

  reviewCase.status = "under_review";
  reviewCase.reviewedByAdminId = adminId;
  reviewCase.reviewedAt = new Date();
  await reviewCase.save();

  owner.restaurantLifecycleStatus = "under_review";
  await owner.save();

  return reviewCase;
}

export async function rejectReviewCase(params: {
  reviewCaseId: string;
  adminId: string;
  zoneId?: string;
  districtId?: string;
  reviewNote: string;
  reviewIssues: Array<{
    section: string;
    title: string;
    fields?: string[];
    note?: string;
  }>;
}) {
  const reviewCase = await getReviewCaseOrThrow(params.reviewCaseId);
  await assertReviewCaseInAdminScope(reviewCase.toObject(), params);
  const owner = await OwnerModel.findById(reviewCase.ownerId);

  if (!owner) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "OWNER_NOT_FOUND",
      "Owner not found",
    );
  }

  reviewCase.status = "rejected";
  reviewCase.reviewNote = params.reviewNote;
  reviewCase.reviewedByAdminId = params.adminId;
  reviewCase.reviewedAt = new Date();
  await reviewCase.save();
  await ReviewCaseModel.updateOne(
    { _id: reviewCase._id },
    {
      $set: {
        reviewIssues: params.reviewIssues,
      },
    },
  );

  owner.restaurantLifecycleStatus = "rejected";
  await owner.save();

  return reviewCase;
}

export async function approveReviewCase(
  reviewCaseId: string,
  adminId: string,
  params: AdminAreaScopeParams = {},
) {
  const reviewCase = await getReviewCaseOrThrow(reviewCaseId);
  await assertReviewCaseInAdminScope(reviewCase.toObject(), params);
  const owner = await OwnerModel.findById(reviewCase.ownerId);
  const draft = await OnboardingDraftModel.findById(reviewCase.draftId);

  if (!owner || !draft) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "APPROVAL_DATA_NOT_FOUND",
      "Approval data not found",
    );
  }

  const restaurantName = draft.basicInfo?.restaurantName?.trim();

  if (!restaurantName) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "INVALID_RESTAURANT_NAME",
      "Restaurant name is required to publish the restaurant profile",
    );
  }

  const serviceArea = await resolveServiceZoneForCoordinates({
    latitude: draft.location?.latitude,
    longitude: draft.location?.longitude,
  });
  if (isServiceAreaModeEnabled() && !serviceArea?.snapshot?.zoneId) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "RESTAURANT_SERVICE_AREA_REQUIRED",
      "Restaurant location must be inside an active service area before approval.",
    );
  }
  const restaurantPayload = {
    ownerId: owner._id,
    name: restaurantName,
    slug: slugify(restaurantName),
    description: draft.basicInfo?.description ?? "",
    preparationTimeMinutes: draft.basicInfo?.preparationTimeMinutes ?? null,
    cuisineTypes: draft.basicInfo?.cuisineTypes ?? [],
    tags: draft.basicInfo?.tags ?? [],
    logo: draft.basicInfo?.logo ?? { url: "", publicId: "" },
    coverImage: draft.basicInfo?.coverImage ?? { url: "", publicId: "" },
    contact: {
      phone: draft.basicInfo?.phone ?? owner.phone,
      email: draft.basicInfo?.email ?? owner.email ?? "",
    },
    address: {
      address: draft.location?.address ?? "",
      city: draft.location?.city ?? "Netrokona",
    },
    location: {
      latitude: draft.location?.latitude ?? null,
      longitude: draft.location?.longitude ?? null,
    },
    locationPoint: buildRestaurantLocationPoint(
      draft.location?.latitude,
      draft.location?.longitude,
    ),
    serviceArea: serviceArea?.snapshot ?? {},
    runtime: {
      isOnline: false,
      isVisible: true,
      currentOperationalStatus: "closed",
    },
    discovery: {
      isFeatured: false,
      featuredSortOrder: null,
      collectionIds: [],
    },
    commercial: {
      commissionRate: 15,
      commissionHistory: [
        {
          previousRate: null,
          rate: 15,
          changedByAdminId: adminId,
          note: "Initial approval commission",
          createdAt: new Date(),
        },
      ],
    },
    profileCompletion: {
      percentage: 0,
      completedWeight: 0,
    },
  };

  const restaurant = draft.restaurantId
    ? await RestaurantModel.findByIdAndUpdate(
        draft.restaurantId,
        restaurantPayload,
        {
          new: true,
        },
      )
    : await RestaurantModel.create(restaurantPayload);

  if (!restaurant) {
    throw new AppError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      "RESTAURANT_PUBLISH_FAILED",
      "Failed to publish restaurant profile",
    );
  }

  draft.restaurantId = restaurant._id;
  await draft.save();

  reviewCase.restaurantId = restaurant._id;
  reviewCase.status = "approved";
  reviewCase.reviewNote = "";
  reviewCase.reviewedByAdminId = adminId;
  reviewCase.reviewedAt = new Date();
  await reviewCase.save();
  await ReviewCaseModel.updateOne(
    { _id: reviewCase._id },
    {
      $set: {
        reviewIssues: [],
      },
    },
  );

  owner.activeRestaurantId = restaurant._id;
  owner.restaurantLifecycleStatus = "approved";
  await owner.save();

  const payoutAccountNumber = draft.payoutSetup?.accountNumber ?? "";
  const payoutType = draft.payoutSetup?.type;

  if (payoutType && payoutAccountNumber) {
    await PayoutMethodModel.findOneAndUpdate(
      { restaurantId: restaurant._id },
      {
        restaurantId: restaurant._id,
        type: payoutType,
        accountName: draft.payoutSetup?.accountName ?? restaurantName,
        accountNumber: payoutAccountNumber,
        isVerified:
          draft.payoutSetup?.isVerified ?? payoutAccountNumber === owner.phone,
        pendingAccountNumber: null,
        verificationSource:
          (draft.payoutSetup?.isVerified ?? payoutAccountNumber === owner.phone)
            ? "owner_phone"
            : null,
        verifiedAt:
          (draft.payoutSetup?.isVerified ?? payoutAccountNumber === owner.phone)
            ? new Date()
            : null,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  return {
    reviewCase,
    restaurant,
  };
}
