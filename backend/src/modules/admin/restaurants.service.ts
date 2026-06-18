import mongoose, { type SortOrder } from "mongoose";
import { StatusCodes } from "http-status-codes";

import { AppError } from "../../common/utils/app-error";
import { slugify } from "../../common/utils/slugify";
import { hashPassword } from "../auth/auth.utils";
import { AdminAuditLogModel, AdminModel } from "./admin.model";
import {
  OpeningHoursModel,
  OwnerModel,
  PayoutMethodModel,
  RestaurantModel,
} from "../auth/auth.model";
import { getRestaurantEnforcement } from "../restaurant-enforcement";
import { SupportCaseModel, ReviewModel } from "../owner/experience.model";
import { LedgerEntryModel, PayoutBatchModel } from "../owner/finance.model";
import { invalidateOwnerFinanceCaches } from "../owner/finance.service";
import {
  buildRelatedOrderPayoutEligibilityMatch,
  isRestaurantPayoutEligibleOrder,
} from "../owner/finance-rules";
import { getOperationalFinanceSettings } from "../public/content.service";
import { invalidateCustomerRestaurantAvailabilityCaches } from "../customer/customer.service";
import {
  CategoryModel,
  MenuItemModel,
  OrderModel,
} from "../owner/operational.model";
import {
  buildRestaurantServiceAreaScopeFilter,
  buildServiceAreaSnapshot,
  calculateServiceDistanceKm,
  isServiceAreaModeEnabled,
  resolveServiceZoneForCoordinates,
} from "../service-area/service-area.service";
import { ServiceZoneModel } from "../service-area/service-area.model";
import { notifyOwnerPayoutStatus } from "./payout-owner-notifications";

const LIVE_ORDER_STATUSES = [
  "New",
  "Accepted",
  "Preparing",
  "ReadyForPickup",
  "PickedUp",
];
const walletLedgerEntryTypes = ["earning", "refund", "adjustment"] as const;

type RestaurantListParams = {
  search?: string;
  visibility?: "all" | "visible" | "hidden";
  runtime?: "all" | "online" | "offline";
  zoneId?: string;
  districtId?: string;
  sortBy?: "newestUpdated" | "mostOrders" | "highestRating" | "completionHigh";
  page?: number;
  pageSize?: number;
};

type RestaurantOrderListParams = {
  preset?: string;
  from?: string;
  to?: string;
  status?: "all" | "live" | "delivered" | "cancelled";
  paymentMethod?: string;
  search?: string;
  sortBy?: "newest" | "oldest" | "highestValue";
  page?: number;
  pageSize?: number;
};

type CreateRestaurantParams = {
  ownerFullName: string;
  ownerPhone: string;
  ownerEmail?: string;
  temporaryPassword: string;
  name: string;
  description?: string;
  phone?: string;
  email?: string;
  payoutBkashNumber?: string;
  cuisineTypes?: string[];
  tags?: string[];
  documents?: Array<{
    type?: string;
    label?: string;
    url?: string;
    publicId?: string;
    fileName?: string;
    fileType?: string;
    resourceType?: string;
    uploadedAt?: string | Date | null;
  }>;
  address?: string;
  city?: string;
  latitude?: number | null;
  longitude?: number | null;
  serviceZoneId?: string;
  preparationTimeMinutes?: number | null;
  commissionRate?: number;
  isVisible?: boolean;
};

type RestaurantDeliveryPricingOverrideInput = {
  enabled: boolean;
  baseFeeTaka?: number | null;
  distanceSurchargeEnabled?: boolean | null;
  surchargeStartsAfterKm?: number | null;
  surchargeStepMeters?: number | null;
  surchargeAmountTaka?: number | null;
};

type OrderStats = {
  totalOrders: number;
  liveOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  systemCancelledOrders: number;
  restaurantCancelledOrders: number;
  lateOrders: number;
  totalRevenue: number;
};

type ReviewStats = {
  averageRating: number;
  reviewCount: number;
};

function clampPage(value?: number) {
  if (!value || Number.isNaN(value)) return 1;
  return Math.max(1, Math.floor(value));
}

function clampPageSize(value?: number) {
  if (!value || Number.isNaN(value)) return 20;
  return Math.min(100, Math.max(5, Math.floor(value)));
}

function serializeDate(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const restaurantDocumentTypes = new Set([
  "nid",
  "trade_license",
  "tin",
  "bin_vat",
]);

function normalizeRestaurantDocuments(
  documents?: CreateRestaurantParams["documents"],
) {
  const byType = new Map<string, Record<string, unknown>>();

  for (const document of documents ?? []) {
    const type = String(document.type ?? "").trim();
    const url = String(document.url ?? "").trim();
    if (!restaurantDocumentTypes.has(type) || !url) continue;

    const uploadedAt =
      document.uploadedAt instanceof Date
        ? document.uploadedAt
        : document.uploadedAt
          ? new Date(document.uploadedAt)
          : new Date();

    byType.set(type, {
      type,
      label: String(document.label ?? "").trim(),
      url,
      publicId: String(document.publicId ?? "").trim(),
      fileName: String(document.fileName ?? "").trim(),
      fileType: String(document.fileType ?? "").trim(),
      resourceType: String(document.resourceType ?? "auto").trim() || "auto",
      uploadedAt: Number.isNaN(uploadedAt.getTime()) ? new Date() : uploadedAt,
    });
  }

  return Array.from(byType.values());
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function trimLimitedString(value: unknown, fallback: string, maxLength: number) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return (normalized || fallback).slice(0, maxLength);
}

function getRestaurantCustomerNoteSetting(restaurant: Record<string, any>) {
  const note = restaurant.settings?.orderSettings?.customerNote ?? {};
  return {
    enabled: note.enabled === true,
    label: trimLimitedString(note.label, "Order note", 80),
    placeholder: trimLimitedString(
      note.placeholder,
      "Cake name, message, or any restaurant instruction",
      160,
    ),
  };
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function objectIdString(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof mongoose.Types.ObjectId) return value.toString();
  if (typeof value === "object" && "toString" in value) return String(value);
  return "";
}

function buildLocationPoint(
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

function maskAccountNumber(value?: string | null) {
  const normalized = value?.trim() ?? "";
  if (!normalized) return "";
  if (normalized.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-4)}`;
}

function normalizeCommissionRate(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return 15;
  return Math.min(100, Math.max(0, value));
}

function normalizeMoneyNumber(value: number | null | undefined, fallback: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.round(value));
}

function normalizeDistanceNumber(
  value: number | null | undefined,
  fallback: number,
  minimum = 0,
) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(minimum, Number(value));
}

function getRestaurantDeliveryPricingSnapshot(restaurant: Record<string, any>) {
  const override = restaurant.commercial?.deliveryPricingOverride ?? {};

  return {
    enabled: override.enabled === true,
    baseFeeTaka:
      typeof override.baseFeeTaka === "number" ? override.baseFeeTaka : null,
    distanceSurchargeEnabled:
      typeof override.distanceSurchargeEnabled === "boolean"
        ? override.distanceSurchargeEnabled
        : null,
    surchargeStartsAfterKm:
      typeof override.surchargeStartsAfterKm === "number"
        ? override.surchargeStartsAfterKm
        : null,
    surchargeStepMeters:
      typeof override.surchargeStepMeters === "number"
        ? override.surchargeStepMeters
        : null,
    surchargeAmountTaka:
      typeof override.surchargeAmountTaka === "number"
        ? override.surchargeAmountTaka
        : null,
    updatedAt: serializeDate(override.updatedAt),
  };
}

function getSettlementAvailableAt(deliveredAt: Date, settlementDelayDays: number) {
  return new Date(
    deliveredAt.getTime() + settlementDelayDays * 24 * 60 * 60 * 1000,
  );
}

async function createAdminAuditLog(params: {
  adminId?: string;
  entityType: string;
  entityId: string;
  action: string;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
}) {
  const admin = params.adminId
    ? await AdminModel.findById(params.adminId).lean()
    : null;

  await AdminAuditLogModel.create({
    actorAdminId: params.adminId ?? "",
    actorName: stringValue(admin?.fullName, "Admin"),
    actorRole: stringValue(admin?.role, "admin"),
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    title: params.title,
    description: params.description ?? "",
    metadata: params.metadata ?? {},
  });
}

const ORDER_TIMESTAMP_FIELD_BY_STATUS: Partial<Record<string, string>> = {
  Accepted: "acceptedAt",
  Preparing: "preparingAt",
  ReadyForPickup: "readyForPickupAt",
  PickedUp: "pickedUpAt",
  Delivered: "deliveredAt",
  Rejected: "rejectedAt",
  Cancelled: "cancelledAt",
};

function getOrderTimestamp(
  order: Record<string, any>,
  status: string,
): Date | null {
  const timestamps = (order.timestamps ?? {}) as Record<string, unknown>;
  const normalizedField = ORDER_TIMESTAMP_FIELD_BY_STATUS[status];
  const value =
    timestamps[status] ??
    (normalizedField ? timestamps[normalizedField] : null) ??
    (status === "New" ? order.createdAt : null);

  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function minutesBetween(start: Date | null, end: Date | null) {
  if (!start || !end) return null;
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
}

function averageMinutes(values: Array<number | null>) {
  const numericValues = values.filter(
    (value): value is number => typeof value === "number",
  );
  if (!numericValues.length) return 0;
  return Number(
    (
      numericValues.reduce((sum, value) => sum + value, 0) /
      numericValues.length
    ).toFixed(1),
  );
}

function percentageRate(passed: number, total: number) {
  if (!total) return 0;
  return Math.round((passed / total) * 100);
}

function getRestaurantOrderDelayState(
  order: Record<string, any>,
  preparationTimeMinutes = 30,
) {
  const now = Date.now();

  if (order.status === "New") {
    const createdAt = getOrderTimestamp(order, "New");
    if (!createdAt) return null;
    const minutes = Math.floor((now - createdAt.getTime()) / 60000);
    if (minutes >= 10) {
      return { label: "Acceptance overdue", minutes, tone: "critical" };
    }
    if (minutes >= 5) {
      return { label: "Acceptance delayed", minutes, tone: "warning" };
    }
  }

  if (order.status === "Accepted") {
    const acceptedAt =
      getOrderTimestamp(order, "Accepted") ?? getOrderTimestamp(order, "New");
    if (!acceptedAt) return null;
    const minutes = Math.floor((now - acceptedAt.getTime()) / 60000);
    if (minutes >= 12) {
      return { label: "Prep starting late", minutes, tone: "critical" };
    }
    if (minutes >= 8) {
      return { label: "Prep not started", minutes, tone: "warning" };
    }
  }

  if (order.status === "Preparing") {
    const preparingAt =
      getOrderTimestamp(order, "Preparing") ??
      getOrderTimestamp(order, "Accepted") ??
      getOrderTimestamp(order, "New");
    if (!preparingAt) return null;
    const minutes = Math.floor((now - preparingAt.getTime()) / 60000);
    const warningMinutes = Math.max(18, preparationTimeMinutes);
    const criticalMinutes = Math.max(25, preparationTimeMinutes + 10);
    if (minutes >= criticalMinutes) {
      return { label: "Ready update overdue", minutes, tone: "critical" };
    }
    if (minutes >= warningMinutes) {
      return { label: "Taking longer", minutes, tone: "warning" };
    }
  }

  return null;
}

function buildRestaurantQuery(params: RestaurantListParams) {
  const query: Record<string, unknown> = {
    ...buildRestaurantServiceAreaScopeFilter(params),
  };

  if (params.search?.trim()) {
    const search = params.search.trim();
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { slug: { $regex: search, $options: "i" } },
      { "contact.phone": { $regex: search, $options: "i" } },
      { "contact.email": { $regex: search, $options: "i" } },
      { "address.city": { $regex: search, $options: "i" } },
    ];
  }

  if (params.visibility === "visible") {
    query["runtime.isVisible"] = true;
  }

  if (params.visibility === "hidden") {
    query["runtime.isVisible"] = false;
  }

  if (params.runtime === "online") {
    query["runtime.isOnline"] = true;
  }

  if (params.runtime === "offline") {
    query["runtime.isOnline"] = { $ne: true };
  }

  return query;
}

function sortRestaurants(
  sortBy?: RestaurantListParams["sortBy"],
): Record<string, SortOrder> {
  switch (sortBy) {
    case "completionHigh":
      return { "profileCompletion.percentage": -1, updatedAt: -1 };
    case "mostOrders":
    case "highestRating":
    case "newestUpdated":
    default:
      return { updatedAt: -1, createdAt: -1 };
  }
}

async function getRestaurantOrThrow(restaurantId: string) {
  const safeRestaurantId = toObjectIdOrThrow(restaurantId, "Restaurant");
  const restaurant = await RestaurantModel.findById(safeRestaurantId);

  if (!restaurant) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "RESTAURANT_NOT_FOUND",
      "Restaurant not found",
    );
  }

  return restaurant;
}

function toObjectIdOrThrow(value: string, resourceName: string) {
  if (!mongoose.isValidObjectId(value)) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "INVALID_OBJECT_ID",
      `${resourceName} id is invalid`,
    );
  }

  return new mongoose.Types.ObjectId(value);
}

async function getRestaurantStats(
  restaurantIds: mongoose.Types.ObjectId[],
): Promise<{
  orderStats: Map<string, OrderStats>;
  reviewStats: Map<string, ReviewStats>;
}> {
  if (!restaurantIds.length) {
    return {
      orderStats: new Map<string, OrderStats>(),
      reviewStats: new Map<string, ReviewStats>(),
    };
  }

  const [orders, reviews, restaurants, liveOrders] = await Promise.all([
    OrderModel.aggregate<{
      _id: mongoose.Types.ObjectId;
      totalOrders: number;
      liveOrders: number;
      deliveredOrders: number;
      cancelledOrders: number;
      systemCancelledOrders: number;
      restaurantCancelledOrders: number;
      totalRevenue: number;
    }>([
      { $match: { restaurantId: { $in: restaurantIds } } },
      {
        $group: {
          _id: "$restaurantId",
          totalOrders: { $sum: 1 },
          liveOrders: {
            $sum: {
              $cond: [{ $in: ["$status", LIVE_ORDER_STATUSES] }, 1, 0],
            },
          },
          deliveredOrders: {
            $sum: {
              $cond: [{ $eq: ["$status", "Delivered"] }, 1, 0],
            },
          },
          cancelledOrders: {
            $sum: {
              $cond: [{ $in: ["$status", ["Cancelled", "Rejected"]] }, 1, 0],
            },
          },
          systemCancelledOrders: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$status", "Cancelled"] },
                    { $eq: ["$cancelledBy", "system"] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          restaurantCancelledOrders: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: ["$status", "Rejected"] },
                    { $eq: ["$cancelledBy", "owner"] },
                    { $eq: ["$cancelledBy", "restaurant"] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          totalRevenue: {
            $sum: {
              $cond: [
                { $eq: ["$status", "Delivered"] },
                { $ifNull: ["$pricing.total", 0] },
                0,
              ],
            },
          },
        },
      },
    ]),
    ReviewModel.aggregate<{
      _id: mongoose.Types.ObjectId;
      averageRating: number;
      reviewCount: number;
    }>([
      {
        $match: {
          restaurantId: { $in: restaurantIds },
          isHidden: { $ne: true },
        },
      },
      {
        $group: {
          _id: "$restaurantId",
          averageRating: { $avg: "$rating" },
          reviewCount: { $sum: 1 },
        },
      },
    ]),
    RestaurantModel.find(
      { _id: { $in: restaurantIds } },
      { preparationTimeMinutes: 1 },
    ).lean(),
    OrderModel.find(
      {
        restaurantId: { $in: restaurantIds },
        status: { $in: ["New", "Accepted", "Preparing"] },
      },
      { restaurantId: 1, status: 1, timestamps: 1, createdAt: 1 },
    ).lean(),
  ]);

  const preparationTimeMap = new Map(
    restaurants.map((restaurant) => [
      restaurant._id.toString(),
      typeof restaurant.preparationTimeMinutes === "number"
        ? restaurant.preparationTimeMinutes
        : 30,
    ]),
  );
  const lateOrderMap = new Map<string, number>();
  liveOrders.forEach((order) => {
    const restaurantId = objectIdString(order.restaurantId);
    const delayState = getRestaurantOrderDelayState(
      order,
      preparationTimeMap.get(restaurantId) ?? 30,
    );
    if (!delayState) return;
    lateOrderMap.set(restaurantId, (lateOrderMap.get(restaurantId) ?? 0) + 1);
  });

  return {
    orderStats: new Map<string, OrderStats>(
      orders.map((item) => [
        item._id.toString(),
        {
          totalOrders: item.totalOrders,
          liveOrders: item.liveOrders,
          deliveredOrders: item.deliveredOrders,
          cancelledOrders: item.cancelledOrders,
          systemCancelledOrders: item.systemCancelledOrders,
          restaurantCancelledOrders: item.restaurantCancelledOrders,
          lateOrders: lateOrderMap.get(item._id.toString()) ?? 0,
          totalRevenue: item.totalRevenue,
        },
      ]),
    ),
    reviewStats: new Map<string, ReviewStats>(
      reviews.map((item) => [
        item._id.toString(),
        {
          averageRating: item.averageRating,
          reviewCount: item.reviewCount,
        },
      ]),
    ),
  };
}

function mapRestaurantSummary(params: {
  restaurant: Record<string, any>;
  owner?: Record<string, any> | null;
  orderStats?: OrderStats;
  reviewStats?: ReviewStats;
}) {
  const { restaurant, owner, orderStats, reviewStats } = params;
  const id = objectIdString(restaurant._id);

  return {
    id,
    ownerId: objectIdString(restaurant.ownerId),
    name: stringValue(restaurant.name),
    slug: stringValue(restaurant.slug),
    description: stringValue(restaurant.description),
    preparationTimeMinutes:
      typeof restaurant.preparationTimeMinutes === "number"
        ? restaurant.preparationTimeMinutes
        : null,
    cuisines: Array.isArray(restaurant.cuisineTypes)
      ? restaurant.cuisineTypes
      : [],
    tags: Array.isArray(restaurant.tags) ? restaurant.tags : [],
    city: stringValue(restaurant.address?.city, "Netrokona"),
    address: stringValue(restaurant.address?.address),
    latitude:
      typeof restaurant.location?.latitude === "number"
        ? restaurant.location.latitude
        : null,
    longitude:
      typeof restaurant.location?.longitude === "number"
        ? restaurant.location.longitude
        : null,
    ownerName: stringValue(owner?.fullName, "Owner"),
    ownerPhone: stringValue(owner?.phone),
    ownerEmail: stringValue(owner?.email),
    ownerStatus: stringValue(owner?.status, "active"),
    restaurantLifecycleStatus: stringValue(
      owner?.restaurantLifecycleStatus,
      "approved",
    ),
    enforcement: getRestaurantEnforcement(restaurant),
    isOnline: restaurant.runtime?.isOnline === true,
    isVisible: restaurant.runtime?.isVisible !== false,
    isFeatured: restaurant.discovery?.isFeatured === true,
    featuredPosition:
      typeof restaurant.discovery?.featuredSortOrder === "number"
        ? restaurant.discovery.featuredSortOrder
        : null,
    commissionRate: numberValue(restaurant.commercial?.commissionRate, 15),
    profileCompletionPercentage: numberValue(
      restaurant.profileCompletion?.percentage,
      0,
    ),
    totalOrders: numberValue(orderStats?.totalOrders, 0),
    liveOrders: numberValue(orderStats?.liveOrders, 0),
    deliveredOrders: numberValue(orderStats?.deliveredOrders, 0),
    cancelledOrders: numberValue(orderStats?.cancelledOrders, 0),
    systemCancelledOrders: numberValue(orderStats?.systemCancelledOrders, 0),
    restaurantCancelledOrders: numberValue(
      orderStats?.restaurantCancelledOrders,
      0,
    ),
    lateOrders: numberValue(orderStats?.lateOrders, 0),
    averageRating: Number(
      numberValue(reviewStats?.averageRating, 0).toFixed(1),
    ),
    reviewCount: numberValue(reviewStats?.reviewCount, 0),
    createdAt: serializeDate(restaurant.createdAt),
    updatedAt: serializeDate(restaurant.updatedAt),
    logoUrl: stringValue(restaurant.logo?.url),
    coverImageUrl: stringValue(restaurant.coverImage?.url),
    hasLogo: Boolean(restaurant.logo?.url),
    hasCoverImage: Boolean(restaurant.coverImage?.url),
  };
}

function buildDateMatch(params?: {
  preset?: string;
  from?: string;
  to?: string;
}) {
  const now = new Date();
  let from: Date | null = null;
  let to: Date | null = null;

  if (params?.preset === "lifetime") {
    return null;
  }

  if (params?.preset === "today") {
    from = new Date(now);
    from.setHours(0, 0, 0, 0);
    to = new Date(now);
    to.setHours(23, 59, 59, 999);
  } else if (params?.preset === "yesterday") {
    from = new Date(now);
    from.setDate(from.getDate() - 1);
    from.setHours(0, 0, 0, 0);
    to = new Date(from);
    to.setHours(23, 59, 59, 999);
  } else if (params?.preset === "last30Days") {
    from = new Date(now);
    from.setDate(from.getDate() - 30);
  } else if (params?.preset === "last90Days") {
    from = new Date(now);
    from.setDate(from.getDate() - 90);
  } else if (params?.preset === "thisMonth") {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  } else if (params?.preset === "lastMonth") {
    from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  } else if (params?.preset === "thisWeek") {
    from = new Date(now);
    const day = from.getDay();
    const diff = from.getDate() - day + (day === 0 ? -6 : 1);
    from.setDate(diff);
    from.setHours(0, 0, 0, 0);
    to = new Date(from);
    to.setDate(from.getDate() + 6);
    to.setHours(23, 59, 59, 999);
  } else if (params?.preset === "last7Days" || !params?.preset) {
    from = new Date(now);
    from.setDate(from.getDate() - 7);
  } else if (params?.preset === "custom") {
    from = params.from ? new Date(params.from) : null;
    to = params.to ? new Date(params.to) : null;
  }

  const match: Record<string, Date> = {};
  if (from && !Number.isNaN(from.getTime())) match.$gte = from;
  if (to && !Number.isNaN(to.getTime())) match.$lte = to;

  return Object.keys(match).length ? match : null;
}

function buildDeliveredRangeClause(dateMatch: Record<string, Date> | null) {
  if (!dateMatch) return {};

  return {
    $or: [
      { "timestamps.Delivered": dateMatch },
      { "timestamps.deliveredAt": dateMatch },
    ],
  };
}

function buildFinalizedLedgerPipeline(
  restaurantId: mongoose.Types.ObjectId,
  dateMatch?: Record<string, Date> | null,
) {
  return [
    {
      $match: {
        restaurantId,
        entryType: "earning",
      },
    },
    {
      $lookup: {
        from: "orders",
        localField: "orderId",
        foreignField: "_id",
        as: "orderDocs",
      },
    },
    {
      $addFields: {
        relatedOrderStatus: {
          $let: {
            vars: {
              relatedOrder: { $arrayElemAt: ["$orderDocs", 0] },
            },
            in: "$$relatedOrder.status",
          },
        },
        relatedOrderDeliveredAt: {
          $let: {
            vars: {
              relatedOrder: { $arrayElemAt: ["$orderDocs", 0] },
            },
            in: {
              $ifNull: [
                "$$relatedOrder.timestamps.deliveredAt",
                "$$relatedOrder.timestamps.Delivered",
              ],
            },
          },
        },
        relatedOrderPaymentStatus: {
          $let: {
            vars: {
              relatedOrder: { $arrayElemAt: ["$orderDocs", 0] },
            },
            in: "$$relatedOrder.paymentStatus",
          },
        },
        relatedOrderPaymentMethod: {
          $let: {
            vars: {
              relatedOrder: { $arrayElemAt: ["$orderDocs", 0] },
            },
            in: "$$relatedOrder.paymentMethod",
          },
        },
      },
    },
    { $match: buildRelatedOrderPayoutEligibilityMatch(
      dateMatch ? { relatedOrderDeliveredAt: dateMatch } : {},
    ) },
    {
      $group: {
        _id: null,
        grossAmount: { $sum: { $ifNull: ["$grossAmount", 0] } },
        commissionBase: { $sum: { $ifNull: ["$commissionBase", "$grossAmount"] } },
        netAmount: { $sum: { $ifNull: ["$netAmount", 0] } },
        commission: { $sum: { $ifNull: ["$commission", 0] } },
        discountCost: { $sum: { $ifNull: ["$discountCost", 0] } },
        platformDiscountCost: { $sum: { $ifNull: ["$platformDiscountCost", 0] } },
        deliveryCost: { $sum: { $ifNull: ["$deliveryCost", 0] } },
        availableBalance: {
          $sum: {
            $cond: [
              { $eq: ["$settlementStatus", "available"] },
              { $ifNull: ["$netAmount", 0] },
              0,
            ],
          },
        },
        pendingBalance: {
          $sum: {
            $cond: [
              { $eq: ["$settlementStatus", "pending"] },
              { $ifNull: ["$netAmount", 0] },
              0,
            ],
          },
        },
        paidOutBalance: {
          $sum: {
            $cond: [
              { $eq: ["$settlementStatus", "paid_out"] },
              { $ifNull: ["$netAmount", 0] },
              0,
            ],
          },
        },
      },
    },
  ];
}

async function reconcileRestaurantLedgerStatuses(
  restaurantId: mongoose.Types.ObjectId,
  settlementDelayDays: number,
) {
  const now = new Date();
  const settlementEntries = await LedgerEntryModel.find({
    restaurantId,
    entryType: { $in: ["earning", "refund", "adjustment"] },
    settlementStatus: { $in: ["pending", "available"] },
    orderId: { $ne: null },
  }).select({ orderId: 1, settlementStatus: 1, availableAt: 1 });
  const orderIds = settlementEntries
    .map((entry) => entry.orderId)
    .filter(Boolean);

  if (orderIds.length) {
    const orders = await OrderModel.find({ _id: { $in: orderIds } })
      .select({ status: 1, paymentMethod: 1, paymentStatus: 1, timestamps: 1, updatedAt: 1 })
      .lean();
    const orderById = new Map(orders.map((order) => [objectIdString(order._id), order]));
    const updates: any[] = settlementEntries.flatMap((entry): any[] => {
      const order = orderById.get(objectIdString(entry.orderId));
      const isPayoutEligibleOrder = isRestaurantPayoutEligibleOrder(order);
      if (!isPayoutEligibleOrder) {
        return [
          {
            deleteOne: {
              filter: { _id: entry._id },
            },
          },
        ];
      }
      const deliveredAt = order
        ? getOrderTimestamp(order, "Delivered") ??
          (order.updatedAt ? new Date(order.updatedAt) : now)
        : now;
      const nextAvailableAt = getSettlementAvailableAt(deliveredAt, settlementDelayDays);
      const nextSettlementStatus: "pending" | "available" =
        nextAvailableAt && nextAvailableAt <= now ? "available" : "pending";
      const currentAvailableAt = entry.availableAt
        ? new Date(entry.availableAt).getTime()
        : null;
      const nextAvailableTime = nextAvailableAt?.getTime() ?? null;

      if (
        entry.settlementStatus === nextSettlementStatus &&
        currentAvailableAt === nextAvailableTime
      ) {
        return [];
      }

      return [
        {
          updateOne: {
            filter: { _id: entry._id },
            update: {
              $set: {
                settlementStatus: nextSettlementStatus,
                availableAt: nextAvailableAt,
              },
            },
          },
        },
      ];
    });

    if (updates.length) {
      await LedgerEntryModel.bulkWrite(updates);
    }
  }

  await LedgerEntryModel.updateMany(
    {
      restaurantId,
      entryType: { $in: ["earning", "refund", "adjustment"] },
      settlementStatus: "pending",
      availableAt: { $lte: now },
    },
    {
      $set: {
        settlementStatus: "available",
      },
    },
  );
}

function resolveCommissionRateForDate(
  restaurant: Record<string, any>,
  date: Date,
) {
  const currentRate = normalizeCommissionRate(
    restaurant.commercial?.commissionRate,
  );
  const history = Array.isArray(restaurant.commercial?.commissionHistory)
    ? [...restaurant.commercial.commissionHistory]
        .map((entry) => ({
          previousRate:
            typeof entry.previousRate === "number"
              ? normalizeCommissionRate(entry.previousRate)
              : null,
          rate: normalizeCommissionRate(entry.rate),
          createdAt: entry.createdAt ? new Date(entry.createdAt) : null,
        }))
        .filter(
          (entry) => entry.createdAt && !Number.isNaN(entry.createdAt.getTime()),
        )
        .sort((a, b) => a.createdAt!.getTime() - b.createdAt!.getTime())
    : [];

  if (!history.length) return currentRate;

  let rate = history[0]?.previousRate ?? history[0]?.rate ?? currentRate;
  for (const entry of history) {
    if (entry.createdAt!.getTime() <= date.getTime()) {
      rate = entry.rate;
    }
  }

  return rate;
}

function getOrderDiscountAmount(order: Record<string, any>) {
  return numberValue(
    order.pricing?.discountAmount,
    numberValue(order.pricing?.discount),
  );
}

function getAppliedVoucherDiscountSplit(order: Record<string, any>) {
  const vouchers = Array.isArray(order.appliedVouchers) ? order.appliedVouchers : [];

  if (!vouchers.length) {
    return null;
  }

  return vouchers.reduce(
    (summary, voucher) => {
      const discountAmount = numberValue(voucher?.discountAmount);
      const fundedBy = stringValue(voucher?.fundedBy, "owner").toLowerCase();
      const ownerSharePercent =
        fundedBy === "platform"
          ? 0
          : fundedBy === "owner"
            ? 100
            : Math.min(100, Math.max(0, numberValue(voucher?.ownerSharePercent)));
      const ownerDiscountCost = numberValue(
        voucher?.ownerDiscountCost,
        Math.round(discountAmount * (ownerSharePercent / 100)),
      );
      const platformDiscountCost = numberValue(
        voucher?.platformDiscountCost,
        Math.max(0, discountAmount - ownerDiscountCost),
      );

      summary.ownerDiscountCost += ownerDiscountCost;
      summary.platformDiscountCost += platformDiscountCost;
      return summary;
    },
    { ownerDiscountCost: 0, platformDiscountCost: 0 },
  );
}

function getOrderOwnerDiscountCost(order: Record<string, any>) {
  const voucherSplit = getAppliedVoucherDiscountSplit(order);
  return numberValue(
    order.pricing?.ownerDiscountCost,
    voucherSplit?.ownerDiscountCost ?? getOrderDiscountAmount(order),
  );
}

function getOrderPlatformDiscountCost(order: Record<string, any>) {
  const voucherSplit = getAppliedVoucherDiscountSplit(order);
  return numberValue(
    order.pricing?.platformDiscountCost,
    voucherSplit?.platformDiscountCost ?? 0,
  );
}

function mapRestaurantOrderHistory(
  order: Record<string, any>,
  preparationTimeMinutes = 30,
) {
  const createdAt = getOrderTimestamp(order, "New");
  const acceptedAt = getOrderTimestamp(order, "Accepted");
  const preparingAt = getOrderTimestamp(order, "Preparing");
  const readyAt = getOrderTimestamp(order, "ReadyForPickup");
  const pickedUpAt = getOrderTimestamp(order, "PickedUp");
  const deliveredAt = getOrderTimestamp(order, "Delivered");
  const cancelledAt =
    getOrderTimestamp(order, "Cancelled") ??
    getOrderTimestamp(order, "Rejected");
  const delayState = getRestaurantOrderDelayState(
    order,
    preparationTimeMinutes,
  );

  return {
    id: objectIdString(order._id),
    orderNumber: stringValue(order.orderNumber),
    status: stringValue(order.status),
    paymentMethod: stringValue(order.paymentMethod),
    paymentStatus: stringValue(order.paymentStatus),
    total: numberValue(order.pricing?.total),
    subtotal: numberValue(order.pricing?.subtotal),
    deliveryFee: numberValue(order.pricing?.deliveryFee),
    customerName: stringValue(
      order.customerSnapshot?.fullName ?? order.customerSnapshot?.name,
    ),
    customerPhone: stringValue(order.customerSnapshot?.phone),
    riderId: stringValue(order.riderId),
    riderName: stringValue(order.riderSnapshot?.name),
    riderPhone: stringValue(order.riderSnapshot?.phone),
    createdAt: serializeDate(createdAt),
    acceptedAt: serializeDate(acceptedAt),
    preparingAt: serializeDate(preparingAt),
    readyAt: serializeDate(readyAt),
    pickedUpAt: serializeDate(pickedUpAt),
    deliveredAt: serializeDate(deliveredAt),
    cancelledAt: serializeDate(cancelledAt),
    acceptanceMinutes: minutesBetween(createdAt, acceptedAt),
    preparationMinutes: minutesBetween(preparingAt ?? acceptedAt, readyAt),
    totalServiceMinutes: minutesBetween(createdAt, deliveredAt),
    isLate: Boolean(delayState),
    lateReason: delayState?.label ?? "",
    lateMinutes: delayState?.minutes ?? 0,
    lateTone: delayState?.tone ?? "none",
  };
}

export async function listAdminRestaurants(params: RestaurantListParams = {}) {
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const query = buildRestaurantQuery(params);

  const [restaurants, total, pendingApprovals] = await Promise.all([
    RestaurantModel.find(query)
      .sort(sortRestaurants(params.sortBy))
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    RestaurantModel.countDocuments(query),
    OwnerModel.countDocuments({
      restaurantLifecycleStatus: { $in: ["submitted", "under_review"] },
    }),
  ]);

  const restaurantIds = restaurants.map((restaurant) => restaurant._id);
  const ownerIds = restaurants
    .map((restaurant) => restaurant.ownerId)
    .filter(Boolean);
  const [owners, stats, summaryRows] = await Promise.all([
    ownerIds.length ? OwnerModel.find({ _id: { $in: ownerIds } }).lean() : [],
    getRestaurantStats(restaurantIds),
    RestaurantModel.aggregate<{
      _id: null;
      visible: number;
      hidden: number;
      online: number;
      offline: number;
    }>([
      {
        $group: {
          _id: null,
          visible: {
            $sum: {
              $cond: [{ $ne: ["$runtime.isVisible", false] }, 1, 0],
            },
          },
          hidden: {
            $sum: {
              $cond: [{ $eq: ["$runtime.isVisible", false] }, 1, 0],
            },
          },
          online: {
            $sum: {
              $cond: [{ $eq: ["$runtime.isOnline", true] }, 1, 0],
            },
          },
          offline: {
            $sum: {
              $cond: [{ $ne: ["$runtime.isOnline", true] }, 1, 0],
            },
          },
        },
      },
    ]),
  ]);

  const ownerMap = new Map(
    owners.map((owner) => [owner._id.toString(), owner]),
  );
  const items = restaurants.map((restaurant) => {
    const id = restaurant._id.toString();
    return mapRestaurantSummary({
      restaurant,
      owner: ownerMap.get(objectIdString(restaurant.ownerId)),
      orderStats: stats.orderStats.get(id),
      reviewStats: stats.reviewStats.get(id),
    });
  });

  if (params.sortBy === "mostOrders") {
    items.sort((a, b) => b.totalOrders - a.totalOrders);
  }

  if (params.sortBy === "highestRating") {
    items.sort((a, b) => b.averageRating - a.averageRating);
  }

  const summary = summaryRows[0] ?? {
    visible: 0,
    hidden: 0,
    online: 0,
    offline: 0,
  };

  return {
    items,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    summary: {
      total,
      visible: summary.visible,
      hidden: summary.hidden,
      online: summary.online,
      offline: summary.offline,
      pendingApprovals,
    },
  };
}

export async function createAdminRestaurant(params: CreateRestaurantParams) {
  const existingOwner = await OwnerModel.findOne({ phone: params.ownerPhone });

  if (existingOwner?.activeRestaurantId) {
    throw new AppError(
      StatusCodes.CONFLICT,
      "OWNER_ALREADY_HAS_RESTAURANT",
      "This owner already has an active restaurant",
    );
  }

  const owner =
    existingOwner ??
    (await OwnerModel.create({
      fullName: params.ownerFullName,
      phone: params.ownerPhone,
      email: params.ownerEmail ?? "",
      passwordHash: await hashPassword(params.temporaryPassword),
      isPhoneVerified: true,
      status: "active",
      restaurantLifecycleStatus: "approved",
    }));

  const restaurantName = params.name.trim();
  const commissionRate = normalizeCommissionRate(params.commissionRate);
  const selectedZone =
    params.serviceZoneId?.trim()
      ? await ServiceZoneModel.findOne({
          _id: params.serviceZoneId.trim(),
          status: "active",
        }).lean()
      : null;
  if (params.serviceZoneId?.trim() && !selectedZone) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "SERVICE_ZONE_NOT_FOUND",
      "Selected service zone is not active or was not found.",
    );
  }
  const latitude = params.latitude ?? selectedZone?.center?.latitude ?? null;
  const longitude = params.longitude ?? selectedZone?.center?.longitude ?? null;
  const serviceArea = selectedZone
    ? {
        snapshot: buildServiceAreaSnapshot(
          selectedZone,
          typeof latitude === "number" && typeof longitude === "number"
            ? calculateServiceDistanceKm(
                latitude,
                longitude,
                Number(selectedZone.center?.latitude ?? 0),
                Number(selectedZone.center?.longitude ?? 0),
              )
            : null,
        ),
      }
    : await resolveServiceZoneForCoordinates({
        latitude,
        longitude,
      });
  if (selectedZone && typeof latitude === "number" && typeof longitude === "number") {
    const distanceFromZoneCenterKm = calculateServiceDistanceKm(
      latitude,
      longitude,
      Number(selectedZone.center?.latitude ?? 0),
      Number(selectedZone.center?.longitude ?? 0),
    );
    if (distanceFromZoneCenterKm > Number(selectedZone.radiusKm ?? 0)) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "RESTAURANT_OUTSIDE_SELECTED_SERVICE_ZONE",
        "Restaurant location must be inside the selected service zone.",
      );
    }
  }
  if (isServiceAreaModeEnabled() && !serviceArea?.snapshot?.zoneId) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "RESTAURANT_SERVICE_AREA_REQUIRED",
      "Restaurant location must be inside an active service area.",
    );
  }
  const restaurant = await RestaurantModel.create({
    ownerId: owner._id,
    name: restaurantName,
    slug: slugify(restaurantName),
    description: params.description ?? "",
    preparationTimeMinutes: params.preparationTimeMinutes ?? null,
    cuisineTypes: params.cuisineTypes ?? [],
    tags: params.tags ?? [],
    documents: normalizeRestaurantDocuments(params.documents),
    contact: {
      phone: params.phone ?? params.ownerPhone,
      email: params.email ?? params.ownerEmail ?? "",
    },
    address: {
      address: params.address ?? "",
      city: params.city ?? "Netrokona",
    },
    location: {
      latitude,
      longitude,
    },
    locationPoint: buildLocationPoint(latitude, longitude),
    serviceArea: serviceArea?.snapshot ?? {},
    runtime: {
      isOnline: false,
      isVisible: params.isVisible ?? true,
      currentOperationalStatus: "closed",
    },
    discovery: {
      isFeatured: false,
      featuredSortOrder: null,
      collectionIds: [],
    },
    commercial: {
      commissionRate,
      commissionHistory: [
        {
          previousRate: null,
          rate: commissionRate,
          changedByAdminId: "",
          note: "Initial admin setup",
          createdAt: new Date(),
        },
      ],
    },
    profileCompletion: {
      percentage: 60,
      completedWeight: 60,
    },
  });

  owner.activeRestaurantId = restaurant._id;
  owner.restaurantLifecycleStatus = "approved";
  await owner.save();

  const payoutBkashNumber = params.payoutBkashNumber?.trim();
  if (payoutBkashNumber) {
    const sameAsOwnerPhone = payoutBkashNumber === params.ownerPhone;
    await PayoutMethodModel.findOneAndUpdate(
      { restaurantId: restaurant._id },
      {
        restaurantId: restaurant._id,
        type: "bkash",
        accountName: params.ownerFullName || restaurantName,
        accountNumber: sameAsOwnerPhone ? payoutBkashNumber : "",
        bankName: "",
        branchName: "",
        isVerified: sameAsOwnerPhone,
        pendingAccountNumber: sameAsOwnerPhone ? null : payoutBkashNumber,
        verificationSource: sameAsOwnerPhone ? "owner_phone" : "admin_created",
        verifiedAt: sameAsOwnerPhone ? new Date() : null,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  const stats = await getRestaurantStats([restaurant._id]);

  return mapRestaurantSummary({
    restaurant: restaurant.toObject(),
    owner: owner.toObject(),
    orderStats: stats.orderStats.get(restaurant._id.toString()),
    reviewStats: stats.reviewStats.get(restaurant._id.toString()),
  });
}

export async function getAdminRestaurantDetails(
  restaurantId: string,
  params?: { preset?: string; from?: string; to?: string },
) {
  const safeRestaurantId = toObjectIdOrThrow(restaurantId, "Restaurant");
  const restaurant = await RestaurantModel.findById(safeRestaurantId).lean();

  if (!restaurant) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "RESTAURANT_NOT_FOUND",
      "Restaurant not found",
    );
  }

  const financeSettings = await getOperationalFinanceSettings();
  await reconcileRestaurantLedgerStatuses(
    safeRestaurantId,
    financeSettings.settlementDelayDays,
  );

  const dateMatch = buildDateMatch(params);
  const orderMatch: Record<string, unknown> = {
    restaurantId: safeRestaurantId,
  };
  if (dateMatch) orderMatch.createdAt = dateMatch;
  const deliveredRangeClause = buildDeliveredRangeClause(dateMatch);

  const [
    owner,
    payoutMethod,
    openingHours,
    stats,
    menuCounts,
    lifetimeDeliveredRows,
    windowDeliveredRows,
    lifetimeLedgerRows,
    windowLedgerRows,
    recentOrders,
    recentReviews,
    supportCases,
    supportReasonRows,
    recentPayouts,
    nextSettlementRows,
    auditLogs,
  ] = await Promise.all([
    OwnerModel.findById(restaurant.ownerId).lean(),
    PayoutMethodModel.findOne({ restaurantId: safeRestaurantId }).lean(),
    OpeningHoursModel.findOne({ restaurantId: safeRestaurantId }).lean(),
    getRestaurantStats([safeRestaurantId]),
    Promise.all([
      CategoryModel.countDocuments({ restaurantId: safeRestaurantId }),
      CategoryModel.countDocuments({
        restaurantId: safeRestaurantId,
        status: "active",
      }),
      CategoryModel.countDocuments({
        restaurantId: safeRestaurantId,
        status: "archived",
      }),
      MenuItemModel.countDocuments({ restaurantId: safeRestaurantId }),
      MenuItemModel.countDocuments({
        restaurantId: safeRestaurantId,
        status: "active",
      }),
      MenuItemModel.countDocuments({
        restaurantId: safeRestaurantId,
        status: "archived",
      }),
      MenuItemModel.countDocuments({
        restaurantId: safeRestaurantId,
        availability: "available",
      }),
      MenuItemModel.countDocuments({
        restaurantId: safeRestaurantId,
        availability: "unavailable",
      }),
      MenuItemModel.countDocuments({
        restaurantId: safeRestaurantId,
        isPopular: true,
      }),
    ]),
    OrderModel.aggregate<{
      _id: null;
      deliveredOrders: number;
      totalRevenue: number;
    }>([
      { $match: { restaurantId: safeRestaurantId, status: "Delivered" } },
      {
        $group: {
          _id: null,
          deliveredOrders: { $sum: 1 },
          totalRevenue: { $sum: { $ifNull: ["$pricing.total", 0] } },
        },
      },
    ]),
    OrderModel.aggregate<{
      _id: null;
      deliveredOrders: number;
      totalRevenue: number;
    }>([
      {
        $match: {
          restaurantId: safeRestaurantId,
          status: "Delivered",
          ...deliveredRangeClause,
        },
      },
      {
        $group: {
          _id: null,
          deliveredOrders: { $sum: 1 },
          totalRevenue: { $sum: { $ifNull: ["$pricing.total", 0] } },
        },
      },
    ]),
    LedgerEntryModel.aggregate<{
      _id: null;
      grossAmount: number;
      commissionBase: number;
      netAmount: number;
      commission: number;
      discountCost: number;
      platformDiscountCost: number;
      deliveryCost: number;
      availableBalance: number;
      pendingBalance: number;
      paidOutBalance: number;
    }>(buildFinalizedLedgerPipeline(safeRestaurantId)),
    LedgerEntryModel.aggregate<{
      _id: null;
      grossAmount: number;
      commissionBase: number;
      netAmount: number;
      commission: number;
      discountCost: number;
      platformDiscountCost: number;
      deliveryCost: number;
      availableBalance: number;
      pendingBalance: number;
      paidOutBalance: number;
    }>(buildFinalizedLedgerPipeline(safeRestaurantId, dateMatch)),
    OrderModel.find({ restaurantId: safeRestaurantId })
      .sort({ createdAt: -1 })
      .limit(8)
      .lean(),
    ReviewModel.find({ restaurantId: safeRestaurantId })
      .sort({ createdAt: -1 })
      .limit(8)
      .lean(),
    SupportCaseModel.find({ restaurantId: safeRestaurantId })
      .sort({ createdAt: -1 })
      .limit(8)
      .lean(),
    SupportCaseModel.aggregate<{ _id: string; count: number }>([
      { $match: { restaurantId: safeRestaurantId } },
      { $group: { _id: "$categoryId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]),
    PayoutBatchModel.find({ restaurantId: safeRestaurantId })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    LedgerEntryModel.aggregate<{
      _id: null;
      earliestAvailableAt: Date;
    }>([
      {
        $match: {
          restaurantId: safeRestaurantId,
          entryType: "earning",
          settlementStatus: "pending",
          availableAt: { $ne: null },
        },
      },
      {
        $lookup: {
          from: "orders",
          localField: "orderId",
          foreignField: "_id",
          as: "orderDocs",
        },
      },
      {
        $addFields: {
          relatedOrderStatus: {
            $let: {
              vars: {
                relatedOrder: { $arrayElemAt: ["$orderDocs", 0] },
              },
              in: "$$relatedOrder.status",
            },
          },
          relatedOrderPaymentStatus: {
            $let: {
              vars: {
                relatedOrder: { $arrayElemAt: ["$orderDocs", 0] },
              },
              in: "$$relatedOrder.paymentStatus",
            },
          },
          relatedOrderPaymentMethod: {
            $let: {
              vars: {
                relatedOrder: { $arrayElemAt: ["$orderDocs", 0] },
              },
              in: "$$relatedOrder.paymentMethod",
            },
          },
        },
      },
      { $match: buildRelatedOrderPayoutEligibilityMatch() },
      {
        $group: {
          _id: null,
          earliestAvailableAt: { $min: "$availableAt" },
        },
      },
    ]),
    AdminAuditLogModel.find({
      entityType: "restaurant",
      entityId: safeRestaurantId.toString(),
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
  ]);

  const id = safeRestaurantId.toString();
  const summary = mapRestaurantSummary({
    restaurant,
    owner,
    orderStats: stats.orderStats.get(id),
    reviewStats: stats.reviewStats.get(id),
  });
  const orderStats = stats.orderStats.get(id);
  const lifetimeDelivered = lifetimeDeliveredRows[0] ?? {
    deliveredOrders: 0,
    totalRevenue: 0,
  };
  const windowDelivered = windowDeliveredRows[0] ?? {
    deliveredOrders: 0,
    totalRevenue: 0,
  };
  const lifetimeLedger = lifetimeLedgerRows[0] ?? {
    grossAmount: 0,
    commissionBase: 0,
    netAmount: 0,
    commission: 0,
    discountCost: 0,
    platformDiscountCost: 0,
    deliveryCost: 0,
    availableBalance: 0,
    pendingBalance: 0,
    paidOutBalance: 0,
  };
  const windowLedger = windowLedgerRows[0] ?? {
    grossAmount: 0,
    commissionBase: 0,
    netAmount: 0,
    commission: 0,
    discountCost: 0,
    platformDiscountCost: 0,
    deliveryCost: 0,
    availableBalance: 0,
    pendingBalance: 0,
    paidOutBalance: 0,
  };

  const [
    totalCategories,
    activeCategories,
    archivedCategories,
    totalItems,
    activeItems,
    archivedItems,
    availableItems,
    unavailableItems,
    popularItems,
  ] = menuCounts;
  const supportSummary = {
    total: supportCases.length,
    open: supportCases.filter((item) => item.status === "open").length,
    inProgress: supportCases.filter((item) => item.status === "in_progress")
      .length,
    resolved: supportCases.filter((item) => item.status === "resolved").length,
    closed: supportCases.filter((item) => item.status === "closed").length,
  };
  const preparationTimeMinutes =
    typeof restaurant.preparationTimeMinutes === "number"
      ? restaurant.preparationTimeMinutes
      : 30;
  const operationOrders = recentOrders.map((order) =>
    mapRestaurantOrderHistory(order, preparationTimeMinutes),
  );
  const acceptedOrders = operationOrders.filter(
    (order) => order.acceptanceMinutes !== null,
  );
  const readyOrders = operationOrders.filter(
    (order) => order.preparationMinutes !== null,
  );
  const pickedUpOrders = operationOrders.filter(
    (order) => order.readyAt && order.pickedUpAt,
  );
  const deliveredOrders = operationOrders.filter(
    (order) => order.pickedUpAt && order.deliveredAt,
  );

  return {
    ...summary,
    owner: {
      id: objectIdString(owner?._id),
      fullName: stringValue(owner?.fullName, "Owner"),
      phone: stringValue(owner?.phone),
      email: stringValue(owner?.email),
      status: stringValue(owner?.status, "active"),
      restaurantLifecycleStatus: stringValue(
        owner?.restaurantLifecycleStatus,
        "approved",
      ),
      lastLoginAt: serializeDate(owner?.lastLoginAt),
    },
    payoutMethod: payoutMethod
      ? {
          type: stringValue(payoutMethod.type),
          accountName: stringValue(payoutMethod.accountName),
          accountNumber: stringValue(payoutMethod.accountNumber),
          accountNumberMasked: maskAccountNumber(payoutMethod.accountNumber),
          bankName: stringValue(payoutMethod.bankName),
          branchName: stringValue(payoutMethod.branchName),
          isVerified: payoutMethod.isVerified === true,
          pendingType: stringValue(payoutMethod.pendingType),
          pendingAccountName: stringValue(payoutMethod.pendingAccountName),
          pendingAccountNumber: stringValue(payoutMethod.pendingAccountNumber),
          pendingVerificationStatus: stringValue(payoutMethod.pendingVerificationStatus),
          pendingVerifiedAt: serializeDate(payoutMethod.pendingVerifiedAt),
          pendingAdminNote: stringValue(payoutMethod.pendingAdminNote),
          verifiedAt: serializeDate(payoutMethod.verifiedAt),
        }
      : null,
    openingHours: openingHours
      ? {
          timezone: stringValue(openingHours.timezone, "Asia/Dhaka"),
          weeklySchedule: Array.isArray(openingHours.weeklySchedule)
            ? openingHours.weeklySchedule
            : [],
          openDays: Array.isArray(openingHours.weeklySchedule)
            ? openingHours.weeklySchedule.filter(
                (item: Record<string, unknown>) => item.isOpen !== false,
              ).length
            : 0,
        }
      : null,
    cancelledOrders: numberValue(orderStats?.cancelledOrders, 0),
    merchandising: {
      isFeatured: restaurant.discovery?.isFeatured === true,
      featuredPosition:
        typeof restaurant.discovery?.featuredSortOrder === "number"
          ? restaurant.discovery.featuredSortOrder
          : null,
      customerNote: getRestaurantCustomerNoteSetting(restaurant),
    },
    discovery: {
      isVisible: restaurant.runtime?.isVisible !== false,
      isOnline: restaurant.runtime?.isOnline === true,
      isFeatured: restaurant.discovery?.isFeatured === true,
      featuredPosition:
        typeof restaurant.discovery?.featuredSortOrder === "number"
          ? restaurant.discovery.featuredSortOrder
          : null,
      cuisineTypes: Array.isArray(restaurant.cuisineTypes)
        ? restaurant.cuisineTypes
        : [],
      tags: Array.isArray(restaurant.tags) ? restaurant.tags : [],
      preparationTimeMinutes:
        typeof restaurant.preparationTimeMinutes === "number"
          ? restaurant.preparationTimeMinutes
          : null,
      averageRating: summary.averageRating,
      reviewCount: summary.reviewCount,
      city: summary.city,
      address: summary.address,
      logoUrl: summary.logoUrl,
      coverImageUrl: summary.coverImageUrl,
    },
    deliveryPricing: {
      override: getRestaurantDeliveryPricingSnapshot(restaurant),
    },
    menu: {
      totalCategories,
      activeCategories,
      archivedCategories,
      totalItems,
      activeItems,
      archivedItems,
      availableItems,
      unavailableItems,
      popularItems,
      categoriesPath: `/admin/restaurants/${id}/categories`,
      itemsPath: `/admin/restaurants/${id}/menu-items`,
    },
    finance: {
      totalRevenue: lifetimeDelivered.totalRevenue,
      grossDeliveredRevenue: lifetimeDelivered.totalRevenue,
      windowGrossDeliveredRevenue: windowDelivered.totalRevenue,
      totalNetEarnings: lifetimeLedger.netAmount,
      windowNetEarnings: windowLedger.netAmount,
      availableBalance: lifetimeLedger.availableBalance,
      pendingBalance: lifetimeLedger.pendingBalance,
      paidOutBalance: lifetimeLedger.paidOutBalance,
      totalOutstandingToRestaurant:
        lifetimeLedger.availableBalance + lifetimeLedger.pendingBalance,
      totalCommission: lifetimeLedger.commission,
      windowCommission: windowLedger.commission,
      totalDiscountCost: lifetimeLedger.discountCost,
      windowDiscountCost: windowLedger.discountCost,
      totalDeliveryCost: lifetimeLedger.deliveryCost,
      windowDeliveryCost: windowLedger.deliveryCost,
      averageOrderValue:
        lifetimeDelivered.deliveredOrders > 0
          ? Math.round(
              lifetimeDelivered.totalRevenue /
                lifetimeDelivered.deliveredOrders,
            )
          : 0,
      windowDeliveredOrders: windowDelivered.deliveredOrders,
      windowAverageOrderValue:
        windowDelivered.deliveredOrders > 0
          ? Math.round(
              windowDelivered.totalRevenue / windowDelivered.deliveredOrders,
            )
          : 0,
      lastPayoutAmount: numberValue(recentPayouts[0]?.amount, 0),
      lastPayoutAt: serializeDate(
        recentPayouts[0]?.processedAt ?? recentPayouts[0]?.requestedAt,
      ),
      nextSettlementAvailableAt: serializeDate(
        nextSettlementRows[0]?.earliestAvailableAt,
      ),
      settlementDelayDays: financeSettings.settlementDelayDays,
      minimumPayoutAmountTaka: financeSettings.minimumPayoutAmountTaka,
      oneActivePayoutRequest: financeSettings.oneActivePayoutRequest,
      recentPayouts: recentPayouts.map((payout) => ({
        id: objectIdString(payout._id),
        amount: numberValue(payout.amount),
        status: stringValue(payout.status),
        batchReference: stringValue(payout.batchReference),
        provider: stringValue(payout.provider, "manual"),
        providerReference: stringValue(payout.providerReference),
        providerPayoutId: stringValue(payout.providerPayoutId),
        providerTransactionId: stringValue(payout.providerTransactionId),
        paymentProofUrl: stringValue(payout.paymentProofUrl),
        processingNote: stringValue(payout.processingNote),
        requestedAt: serializeDate(payout.requestedAt),
        approvedAt: serializeDate(payout.approvedAt),
        processedAt: serializeDate(payout.processedAt),
        failureReason: stringValue(payout.failureReason),
      })),
    },
    analytics: {
      totalOrders: summary.totalOrders,
      liveOrders: summary.liveOrders,
      totalDeliveredOrders: summary.deliveredOrders,
      totalCancelledOrders: numberValue(orderStats?.cancelledOrders, 0),
      systemCancelledOrders: numberValue(orderStats?.systemCancelledOrders, 0),
      restaurantCancelledOrders: numberValue(
        orderStats?.restaurantCancelledOrders,
        0,
      ),
      lateOrders: numberValue(orderStats?.lateOrders, 0),
      repeatCustomerCount: 0,
      lastOrderAt: serializeDate(recentOrders[0]?.createdAt),
      deliveredTrend: [],
      statusDistribution: [],
      topItems: [],
      topCustomers: [],
    },
    operations: {
      preset: "last7Days",
      ordersAnalyzed: operationOrders.length,
      averageAcceptanceMinutes: averageMinutes(
        operationOrders.map((order) => order.acceptanceMinutes),
      ),
      averagePreparationMinutes: averageMinutes(
        operationOrders.map((order) => order.preparationMinutes),
      ),
      averageReadyFromOrderMinutes: averageMinutes(
        operationOrders.map((order) =>
          minutesBetween(
            order.createdAt ? new Date(order.createdAt) : null,
            order.readyAt ? new Date(order.readyAt) : null,
          ),
        ),
      ),
      averagePickupWaitMinutes: averageMinutes(
        operationOrders.map((order) =>
          minutesBetween(
            order.readyAt ? new Date(order.readyAt) : null,
            order.pickedUpAt ? new Date(order.pickedUpAt) : null,
          ),
        ),
      ),
      averageDeliveryMinutes: averageMinutes(
        operationOrders.map((order) =>
          minutesBetween(
            order.pickedUpAt ? new Date(order.pickedUpAt) : null,
            order.deliveredAt ? new Date(order.deliveredAt) : null,
          ),
        ),
      ),
      acceptedWithin5MinutesRate: percentageRate(
        acceptedOrders.filter(
          (order) =>
            typeof order.acceptanceMinutes === "number" &&
            order.acceptanceMinutes <= 5,
        ).length,
        acceptedOrders.length,
      ),
      readyWithinEstimateRate: percentageRate(
        readyOrders.filter(
          (order) =>
            typeof order.preparationMinutes === "number" &&
            order.preparationMinutes <= preparationTimeMinutes,
        ).length,
        readyOrders.length,
      ),
      lateOrders: numberValue(orderStats?.lateOrders, 0),
      systemCancelledOrders: numberValue(orderStats?.systemCancelledOrders, 0),
      restaurantCancelledOrders: numberValue(
        orderStats?.restaurantCancelledOrders,
        0,
      ),
      pickedUpSampleOrders: pickedUpOrders.length,
      deliveredSampleOrders: deliveredOrders.length,
      hasLogo: Boolean(summary.logoUrl),
      hasCoverImage: Boolean(summary.coverImageUrl),
    },
    support: {
      summary: supportSummary,
      cases: supportCases.map((supportCase) => ({
        id: objectIdString(supportCase._id),
        subject: stringValue(supportCase.subject),
        categoryId: stringValue(supportCase.categoryId),
        kind: supportCase.kind === "question" ? "question" : "report",
        status: supportCase.status,
        priority: supportCase.priority,
        message: stringValue(supportCase.message),
        createdAt: serializeDate(supportCase.createdAt),
        updatedAt: serializeDate(supportCase.updatedAt),
        replyCount: Array.isArray(supportCase.replies)
          ? supportCase.replies.length
          : 0,
        latestReplyMessage: Array.isArray(supportCase.replies)
          ? stringValue(supportCase.replies.at(-1)?.message)
          : "",
        latestReplyAdminName: Array.isArray(supportCase.replies)
          ? stringValue(supportCase.replies.at(-1)?.senderName)
          : "",
        latestReplyAt: Array.isArray(supportCase.replies)
          ? serializeDate(supportCase.replies.at(-1)?.createdAt)
          : null,
      })),
      topReasons: supportReasonRows.map((item) => ({
        key: item._id,
        label: item._id,
        count: item.count,
      })),
    },
    recentOrders: operationOrders,
    recentReviews: recentReviews.map((review) => ({
      id: objectIdString(review._id),
      rating: numberValue(review.rating),
      comment: stringValue(review.comment),
      customerName: "Customer",
      createdAt: serializeDate(review.createdAt),
      ownerReplyMessage: stringValue(review.ownerReply?.message),
      ownerReplyUpdatedAt: serializeDate(review.ownerReply?.updatedAt),
      moderationStatus: stringValue(review.moderationStatus, "visible"),
      isHidden: review.isHidden === true,
      hiddenAt: serializeDate(review.hiddenAt),
      hiddenByAdminId: stringValue(review.hiddenByAdminId),
      hiddenReason: stringValue(review.hiddenReason),
    })),
    activityTimeline: [
      {
        type: "restaurant",
        title: "Restaurant profile created",
        description: `${summary.name} was added to the platform.`,
        createdAt: summary.createdAt ?? new Date().toISOString(),
      },
      ...recentOrders.slice(0, 3).map((order) => ({
        type: "order",
        title: `Order ${stringValue(order.orderNumber)}`,
        description: `${stringValue(order.status)} order worth Tk ${numberValue(order.pricing?.total).toLocaleString()}.`,
        createdAt: serializeDate(order.createdAt) ?? new Date().toISOString(),
      })),
    ],
    auditLogs: auditLogs.map((log) => ({
      id: objectIdString(log._id),
      action: stringValue(log.action),
      title: stringValue(log.title),
      description: stringValue(log.description),
      actorName: stringValue(log.actorName, "Admin"),
      actorRole: stringValue(log.actorRole, "admin"),
      createdAt: serializeDate(log.createdAt),
      metadata:
        log.metadata && typeof log.metadata === "object" ? log.metadata : {},
    })),
  };
}

export async function listAdminRestaurantOrders(
  restaurantId: string,
  params: RestaurantOrderListParams = {},
) {
  const safeRestaurantId = toObjectIdOrThrow(restaurantId, "Restaurant");
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const query: Record<string, unknown> = { restaurantId: safeRestaurantId };
  const dateMatch = buildDateMatch(params);

  if (dateMatch) query.createdAt = dateMatch;
  if (params.status === "live") query.status = { $in: LIVE_ORDER_STATUSES };
  if (params.status === "delivered") query.status = "Delivered";
  if (params.status === "cancelled")
    query.status = { $in: ["Cancelled", "Rejected"] };
  if (params.paymentMethod && params.paymentMethod !== "all") {
    query.paymentMethod = params.paymentMethod;
  }
  if (params.search?.trim()) {
    const search = params.search.trim();
    query.$or = [
      { orderNumber: { $regex: search, $options: "i" } },
      { "customerSnapshot.fullName": { $regex: search, $options: "i" } },
      { "customerSnapshot.phone": { $regex: search, $options: "i" } },
    ];
  }

  const sort: Record<string, SortOrder> =
    params.sortBy === "oldest"
      ? { createdAt: 1 }
      : params.sortBy === "highestValue"
        ? { "pricing.total": -1, createdAt: -1 }
        : { createdAt: -1 };

  const [orders, total, restaurant] = await Promise.all([
    OrderModel.find(query)
      .sort(sort)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    OrderModel.countDocuments(query),
    RestaurantModel.findById(safeRestaurantId, {
      preparationTimeMinutes: 1,
    }).lean(),
  ]);
  const preparationTimeMinutes =
    typeof restaurant?.preparationTimeMinutes === "number"
      ? restaurant.preparationTimeMinutes
      : 30;

  return {
    items: orders.map((order) =>
      mapRestaurantOrderHistory(order, preparationTimeMinutes),
    ),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function listAdminRestaurantPromotionTargets(restaurantId: string) {
  const safeRestaurantId = toObjectIdOrThrow(restaurantId, "Restaurant");
  const restaurant = await RestaurantModel.findById(safeRestaurantId, { _id: 1 }).lean();

  if (!restaurant) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "RESTAURANT_NOT_FOUND",
      "Restaurant not found",
    );
  }

  const [categories, items] = await Promise.all([
    CategoryModel.find(
      { restaurantId: safeRestaurantId, status: "active" },
      { name: 1, displayOrder: 1 },
    )
      .sort({ displayOrder: 1, name: 1 })
      .lean(),
    MenuItemModel.find(
      { restaurantId: safeRestaurantId, status: "active" },
      { name: 1, categoryId: 1, basePrice: 1, availability: 1 },
    )
      .sort({ name: 1 })
      .lean(),
  ]);

  return {
    categories: categories.map((category) => ({
      id: objectIdString(category._id),
      name: stringValue(category.name, "Category"),
    })),
    items: items.map((item) => ({
      id: objectIdString(item._id),
      name: stringValue(item.name, "Menu item"),
      categoryId: objectIdString(item.categoryId),
      basePrice: numberValue(item.basePrice),
      availability: stringValue(item.availability, "available"),
    })),
  };
}

export async function deleteAdminRestaurantReview(params: {
  restaurantId: string;
  reviewId: string;
  adminId?: string;
}) {
  const safeRestaurantId = toObjectIdOrThrow(params.restaurantId, "Restaurant");
  const safeReviewId = toObjectIdOrThrow(params.reviewId, "Review");
  const review = await ReviewModel.findOne({
    _id: safeReviewId,
    restaurantId: safeRestaurantId,
  });

  if (!review) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "REVIEW_NOT_FOUND",
      "Review not found",
    );
  }

  review.isHidden = true;
  review.moderationStatus = "hidden";
  review.hiddenAt = new Date();
  review.hiddenByAdminId = params.adminId ?? "";
  review.hiddenReason = "Hidden by admin";
  await review.save();

  await createAdminAuditLog({
    adminId: params.adminId,
    entityType: "restaurant",
    entityId: params.restaurantId,
    action: "review.hidden",
    title: "Review hidden",
    description: `A ${numberValue(review.rating)}-star customer review was hidden from public ratings.`,
    metadata: {
      reviewId: params.reviewId,
      rating: numberValue(review.rating),
    },
  });

  return {
    id: params.reviewId,
    restaurantId: params.restaurantId,
    deletedAt: serializeDate(review.hiddenAt) ?? new Date().toISOString(),
    isHidden: true,
  };
}

export async function restoreAdminRestaurantReview(params: {
  restaurantId: string;
  reviewId: string;
  adminId?: string;
}) {
  const safeRestaurantId = toObjectIdOrThrow(params.restaurantId, "Restaurant");
  const safeReviewId = toObjectIdOrThrow(params.reviewId, "Review");
  const review = await ReviewModel.findOne({
    _id: safeReviewId,
    restaurantId: safeRestaurantId,
  });

  if (!review) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "REVIEW_NOT_FOUND",
      "Review not found",
    );
  }

  review.isHidden = false;
  review.moderationStatus = "visible";
  review.hiddenAt = null;
  review.hiddenByAdminId = "";
  review.hiddenReason = "";
  await review.save();

  await createAdminAuditLog({
    adminId: params.adminId,
    entityType: "restaurant",
    entityId: params.restaurantId,
    action: "review.restored",
    title: "Review restored",
    description: `A ${numberValue(review.rating)}-star customer review was restored to public ratings.`,
    metadata: {
      reviewId: params.reviewId,
      rating: numberValue(review.rating),
    },
  });

  return {
    id: params.reviewId,
    restaurantId: params.restaurantId,
    restoredAt: new Date().toISOString(),
    isHidden: false,
  };
}

export async function updateAdminRestaurantVisibility(params: {
  restaurantId: string;
  isVisible: boolean;
}) {
  const restaurant = await getRestaurantOrThrow(params.restaurantId);
  restaurant.runtime = {
    ...(restaurant.runtime ?? {}),
    isVisible: params.isVisible,
  };
  await restaurant.save();
  invalidateCustomerRestaurantAvailabilityCaches();

  return {
    id: restaurant.id,
    name: restaurant.name,
    isVisible: restaurant.runtime?.isVisible !== false,
    updatedAt: serializeDate(restaurant.updatedAt),
  };
}

export async function updateAdminRestaurantEnforcement(params: {
  restaurantId: string;
  adminId?: string;
  status:
    | "active"
    | "under_review"
    | "quality_hold"
    | "temporarily_suspended"
    | "permanently_disabled";
  reason?: string;
  ownerNote?: string;
  customerMessage?: string;
  internalNote?: string;
  expiresAt?: string | null;
}) {
  const restaurant = await getRestaurantOrThrow(params.restaurantId);
  const previous = getRestaurantEnforcement(restaurant);
  const now = new Date();
  const expiresAt =
    params.status === "active" || !params.expiresAt
      ? null
      : new Date(params.expiresAt);
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "INVALID_ENFORCEMENT_EXPIRY",
      "Choose a valid enforcement end time.",
    );
  }

  const current = (restaurant.get("enforcement") as Record<string, any>) ?? {};
  restaurant.set("enforcement", {
    ...current,
    status: params.status,
    reason: params.status === "active" ? "" : params.reason ?? "",
    ownerNote: params.status === "active" ? "" : params.ownerNote ?? "",
    customerMessage: params.status === "active" ? "" : params.customerMessage ?? "",
    internalNote: params.status === "active" ? "" : params.internalNote ?? "",
    startsAt: params.status === "active" ? null : now,
    expiresAt,
    updatedAt: now,
    updatedByAdminId: params.adminId ?? "",
    history: [
      ...previous.history.slice(-19),
      {
        previousStatus: previous.effectiveStatus,
        status: params.status,
        reason: params.reason ?? "",
        ownerNote: params.ownerNote ?? "",
        customerMessage: params.customerMessage ?? "",
        internalNote: params.internalNote ?? "",
        startsAt: params.status === "active" ? null : now,
        expiresAt,
        adminId: params.adminId ?? "",
        createdAt: now,
      },
    ],
  });

  if (
    params.status === "quality_hold" ||
    params.status === "temporarily_suspended" ||
    params.status === "permanently_disabled"
  ) {
    restaurant.runtime = {
      ...(restaurant.runtime ?? {}),
      isOnline: false,
      currentOperationalStatus: "restricted",
    };
  }

  await restaurant.save();
  invalidateCustomerRestaurantAvailabilityCaches();

  await createAdminAuditLog({
    adminId: params.adminId,
    entityType: "restaurant",
    entityId: restaurant.id,
    action: "restaurant.enforcement_updated",
    title: "Restaurant enforcement updated",
    description: `${restaurant.name} enforcement changed from ${previous.effectiveStatus} to ${params.status}.`,
    metadata: {
      previousStatus: previous.effectiveStatus,
      status: params.status,
      reason: params.reason ?? "",
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    },
  });

  return {
    id: restaurant.id,
    name: restaurant.name,
    enforcement: getRestaurantEnforcement(restaurant),
    isOnline: restaurant.runtime?.isOnline === true,
    isVisible: restaurant.runtime?.isVisible !== false,
    updatedAt: serializeDate(restaurant.updatedAt),
  };
}

export async function updateAdminRestaurantMerchandising(params: {
  restaurantId: string;
  isFeatured: boolean;
  featuredPosition: number | null;
  customerNote?: {
    enabled?: boolean;
    label?: string;
    placeholder?: string;
  };
}) {
  const restaurant = await getRestaurantOrThrow(params.restaurantId);
  restaurant.discovery = {
    ...(restaurant.discovery ?? {}),
    isFeatured: params.isFeatured,
    featuredSortOrder: params.isFeatured ? params.featuredPosition : null,
  };
  if (params.customerNote) {
    const currentSettings =
      (restaurant.settings as any)?.toObject?.() ?? restaurant.settings ?? {};
    const currentOrderSettings = currentSettings.orderSettings ?? {};
    restaurant.set("settings", {
      ...currentSettings,
      orderSettings: {
        ...currentOrderSettings,
        customerNote: {
          enabled: params.customerNote.enabled === true,
          label: trimLimitedString(params.customerNote.label, "Order note", 80),
          placeholder: trimLimitedString(
            params.customerNote.placeholder,
            "Cake name, message, or any restaurant instruction",
            160,
          ),
        },
      },
    });
  }
  await restaurant.save();
  invalidateCustomerRestaurantAvailabilityCaches();

  return {
    id: restaurant.id,
    name: restaurant.name,
    isFeatured: restaurant.discovery?.isFeatured === true,
    featuredPosition:
      typeof restaurant.discovery?.featuredSortOrder === "number"
        ? restaurant.discovery.featuredSortOrder
        : null,
    customerNote: getRestaurantCustomerNoteSetting(restaurant),
    updatedAt: serializeDate(restaurant.updatedAt),
  };
}

export async function updateAdminRestaurantCommission(params: {
  restaurantId: string;
  commissionRate: number;
  adminId?: string;
}) {
  const restaurant = await getRestaurantOrThrow(params.restaurantId);
  const previousRate = normalizeCommissionRate(
    restaurant.commercial?.commissionRate,
  );
  const commissionRate = normalizeCommissionRate(params.commissionRate);
  const commercial =
    (restaurant.commercial as any)?.toObject?.() ??
    restaurant.commercial ??
    {};
  const commissionHistory = Array.isArray(commercial.commissionHistory)
    ? commercial.commissionHistory
    : [];
  restaurant.set("commercial", {
    ...commercial,
    commissionRate,
    commissionHistory: [
      ...commissionHistory,
      {
        previousRate,
        rate: commissionRate,
        changedByAdminId: params.adminId ?? "",
        note: "Admin commission update",
        createdAt: new Date(),
      },
    ],
  });
  await restaurant.save();
  invalidateOwnerFinanceCaches(restaurant.id);

  await createAdminAuditLog({
    adminId: params.adminId,
    entityType: "restaurant",
    entityId: restaurant.id,
    action: "commission.updated",
    title: "Commission updated",
    description: `Commission changed from ${previousRate}% to ${commissionRate}%.`,
    metadata: {
      previousRate,
      commissionRate,
    },
  });

  return {
    id: restaurant.id,
    name: restaurant.name,
    commissionRate: numberValue(restaurant.commercial?.commissionRate, 15),
    updatedAt: serializeDate(restaurant.updatedAt),
  };
}

export async function updateAdminRestaurantDeliveryPricing(params: {
  restaurantId: string;
  adminId?: string;
  override: RestaurantDeliveryPricingOverrideInput;
}) {
  const restaurant = await getRestaurantOrThrow(params.restaurantId);
  const commercial =
    (restaurant.commercial as any)?.toObject?.() ??
    restaurant.commercial ??
    {};
  const previousOverride = getRestaurantDeliveryPricingSnapshot(restaurant);
  const nextOverride = {
    enabled: params.override.enabled === true,
    baseFeeTaka: normalizeMoneyNumber(params.override.baseFeeTaka, 20),
    distanceSurchargeEnabled:
      params.override.distanceSurchargeEnabled === true,
    surchargeStartsAfterKm: normalizeDistanceNumber(
      params.override.surchargeStartsAfterKm,
      2,
      0,
    ),
    surchargeStepMeters: normalizeDistanceNumber(
      params.override.surchargeStepMeters,
      500,
      1,
    ),
    surchargeAmountTaka: normalizeMoneyNumber(
      params.override.surchargeAmountTaka,
      5,
    ),
    updatedByAdminId: params.adminId ?? "",
    updatedAt: new Date(),
  };

  restaurant.set("commercial", {
    ...commercial,
    deliveryPricingOverride: nextOverride,
  });
  await restaurant.save();
  invalidateOwnerFinanceCaches(restaurant.id);

  await createAdminAuditLog({
    adminId: params.adminId,
    entityType: "restaurant",
    entityId: restaurant.id,
    action: "delivery_pricing.updated",
    title: "Delivery pricing updated",
    description: nextOverride.enabled
      ? `Restaurant delivery pricing override is active with a Tk ${nextOverride.baseFeeTaka} base fee.`
      : "Restaurant delivery pricing override was turned off.",
    metadata: {
      previousOverride,
      nextOverride: {
        enabled: nextOverride.enabled,
        baseFeeTaka: nextOverride.baseFeeTaka,
        distanceSurchargeEnabled: nextOverride.distanceSurchargeEnabled,
        surchargeStartsAfterKm: nextOverride.surchargeStartsAfterKm,
        surchargeStepMeters: nextOverride.surchargeStepMeters,
        surchargeAmountTaka: nextOverride.surchargeAmountTaka,
      },
    },
  });

  return {
    id: restaurant.id,
    name: restaurant.name,
    override: getRestaurantDeliveryPricingSnapshot(restaurant),
    updatedAt: serializeDate(restaurant.updatedAt),
  };
}

export async function reconcileAdminRestaurantFinance(params: {
  restaurantId: string;
  adminId?: string;
}) {
  const safeRestaurantId = toObjectIdOrThrow(params.restaurantId, "Restaurant");
  const restaurant = await RestaurantModel.findById(safeRestaurantId).lean();

  if (!restaurant) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "RESTAURANT_NOT_FOUND",
      "Restaurant not found",
    );
  }

  const deliveredOrders = await OrderModel.find({
    restaurantId: safeRestaurantId,
    status: "Delivered",
  }).lean();
  const deliveredOrderIds = deliveredOrders.map((order) => order._id);
  const financeSettings = await getOperationalFinanceSettings();
  const existingLedgerEntries = deliveredOrderIds.length
    ? await LedgerEntryModel.find({
        restaurantId: safeRestaurantId,
        orderId: { $in: deliveredOrderIds },
        entryType: "earning",
      })
    : [];
  const ledgerByOrderId = new Map(
    existingLedgerEntries.map((entry) => [objectIdString(entry.orderId), entry]),
  );
  let created = 0;
  let updated = 0;
  let skippedPaidOut = 0;
  let pending = 0;
  let available = 0;
  const now = new Date();

  for (const order of deliveredOrders) {
    const deliveredAt =
      getOrderTimestamp(order, "Delivered") ??
      (order.updatedAt ? new Date(order.updatedAt) : now);
    const isPayoutEligibleOrder = isRestaurantPayoutEligibleOrder(order);
    const availableAt = isPayoutEligibleOrder
      ? getSettlementAvailableAt(
          deliveredAt,
          financeSettings.settlementDelayDays,
        )
      : null;
    const settlementStatus = isPayoutEligibleOrder && availableAt && availableAt <= now
      ? ("available" as const)
      : ("pending" as const);
    const grossAmount = numberValue(order.pricing?.subtotal);
    const commissionRate = resolveCommissionRateForDate(restaurant, deliveredAt);
    const discountCost = getOrderOwnerDiscountCost(order);
    const platformDiscountCost = getOrderPlatformDiscountCost(order);
    const commissionBase = grossAmount;
    const commission = Math.round(commissionBase * (commissionRate / 100));
    const deliveryCost = numberValue(order.pricing?.deliveryFee);
    const netAmount = grossAmount - commission - discountCost;
    const existingLedger = ledgerByOrderId.get(objectIdString(order._id));

    if (!existingLedger) {
      await LedgerEntryModel.create({
        restaurantId: safeRestaurantId,
        orderId: order._id,
        sourceEntityType: "order",
        sourceEntityId: objectIdString(order._id),
        entryType: "earning",
        grossAmount,
        commissionBase,
        commission,
        discountCost,
        platformDiscountCost,
        deliveryCost,
        netAmount,
        serviceAreaSnapshot: order.serviceAreaSnapshot ?? {},
        settlementStatus,
        availableAt,
      });
      created += 1;
      if (settlementStatus === "available") available += 1;
      else pending += 1;
      continue;
    }

    if (existingLedger.settlementStatus === "paid_out") {
      skippedPaidOut += 1;
      continue;
    }

    const hasChanges =
      numberValue(existingLedger.grossAmount) !== grossAmount ||
      numberValue(existingLedger.commissionBase, grossAmount) !== commissionBase ||
      numberValue(existingLedger.commission) !== commission ||
      numberValue(existingLedger.discountCost) !== discountCost ||
      numberValue(existingLedger.platformDiscountCost) !== platformDiscountCost ||
      numberValue(existingLedger.deliveryCost) !== deliveryCost ||
      numberValue(existingLedger.netAmount) !== netAmount ||
      JSON.stringify(existingLedger.serviceAreaSnapshot ?? {}) !==
        JSON.stringify(order.serviceAreaSnapshot ?? {}) ||
      existingLedger.settlementStatus !== settlementStatus ||
      serializeDate(existingLedger.availableAt) !== serializeDate(availableAt);

    if (hasChanges) {
      existingLedger.grossAmount = grossAmount;
      existingLedger.commissionBase = commissionBase;
      existingLedger.commission = commission;
      existingLedger.discountCost = discountCost;
      existingLedger.platformDiscountCost = platformDiscountCost;
      existingLedger.deliveryCost = deliveryCost;
      existingLedger.netAmount = netAmount;
      existingLedger.serviceAreaSnapshot = order.serviceAreaSnapshot ?? {};
      existingLedger.settlementStatus = settlementStatus;
      existingLedger.availableAt = availableAt;
      await existingLedger.save();
      updated += 1;
    }

    if (settlementStatus === "available") available += 1;
    else pending += 1;
  }

  await LedgerEntryModel.deleteMany(
    {
      restaurantId: safeRestaurantId,
      entryType: "earning",
      settlementStatus: { $ne: "paid_out" },
      orderId: { $nin: deliveredOrderIds },
    },
  );

  await createAdminAuditLog({
    adminId: params.adminId,
    entityType: "restaurant",
    entityId: params.restaurantId,
    action: "finance.reconciled",
    title: "Finance reconciled",
    description: "Delivered-order ledger entries were reconciled from platform orders.",
    metadata: {
      scanned: deliveredOrders.length,
      created,
      updated,
      skippedPaidOut,
      pending,
      available,
    },
  });
  invalidateOwnerFinanceCaches(params.restaurantId);

  return {
    restaurantId: params.restaurantId,
    scanned: deliveredOrders.length,
    created,
    updated,
    skippedPaidOut,
    pending,
    available,
    reconciledAt: new Date().toISOString(),
  };
}

export async function updateAdminRestaurantPayoutStatus(params: {
  restaurantId: string;
  payoutId: string;
  status: "processing" | "completed" | "failed";
  expectedStatus?: string;
  failureReason?: string;
  providerReference?: string;
  providerPayoutId?: string;
  providerTransactionId?: string;
  paymentProofUrl?: string;
  processingNote?: string;
  notifyOwnerSms?: boolean;
  adminId?: string;
}) {
  const restaurantId = toObjectIdOrThrow(params.restaurantId, "Restaurant");
  const payoutId = toObjectIdOrThrow(params.payoutId, "Payout");
  const restaurant = await RestaurantModel.findById(restaurantId)
    .select({ ownerId: 1, name: 1 })
    .lean();

  if (!restaurant) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "RESTAURANT_NOT_FOUND",
      "Restaurant not found",
    );
  }

  const now = new Date();
  const session = await mongoose.startSession();
  let updatedBatch: Record<string, any> | null = null;

  try {
    await session.withTransaction(async () => {
      const payoutBatch = await PayoutBatchModel.findOne({
        _id: payoutId,
        restaurantId,
      }).session(session);

      if (!payoutBatch) {
        throw new AppError(
          StatusCodes.NOT_FOUND,
          "PAYOUT_NOT_FOUND",
          "Payout request not found",
        );
      }

      if (
        params.expectedStatus &&
        payoutBatch.status !== params.expectedStatus
      ) {
        throw new AppError(
          StatusCodes.CONFLICT,
          "PAYOUT_STATUS_CHANGED",
          `Payout status is already ${payoutBatch.status}`,
        );
      }

      if (payoutBatch.status === "completed" && params.status !== "completed") {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          "PAYOUT_ALREADY_COMPLETED",
          "Completed payouts cannot be moved back",
        );
      }

      if (payoutBatch.status === "failed" && params.status !== "failed") {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          "PAYOUT_ALREADY_FAILED",
          "Failed payouts cannot be moved back. Create a new payout instead",
        );
      }

      const providerReference = params.providerReference?.trim() ?? "";
      const providerPayoutId = params.providerPayoutId?.trim() ?? "";
      const providerTransactionId = params.providerTransactionId?.trim() ?? "";
      const paymentProofUrl = params.paymentProofUrl?.trim() ?? "";
      const processingNote = params.processingNote?.trim() ?? "";
      const failureReason = params.failureReason?.trim() ?? "";

      if (
        params.status === "completed" &&
        !providerReference &&
        !providerPayoutId &&
        !providerTransactionId
      ) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          "PAYOUT_REFERENCE_REQUIRED",
          "Add a bKash/bank transaction reference before completing payout",
        );
      }

      if (params.status === "failed" && payoutBatch.status !== "failed") {
        await LedgerEntryModel.updateMany(
          {
            restaurantId,
            payoutBatchId: payoutId,
            entryType: { $in: [...walletLedgerEntryTypes] },
            $or: [
              {
                sourceEntityType: {
                  $nin: ["payout_residual", "payout_residual_reversal"],
                },
              },
              {
                sourceEntityType: "payout_residual",
                sourceEntityId: { $ne: payoutBatch.id },
              },
            ],
            settlementStatus: "paid_out",
          },
          {
            $set: { settlementStatus: "available" },
            $unset: { payoutBatchId: "" },
          },
          { session },
        );

        await LedgerEntryModel.deleteMany(
          {
            restaurantId,
            payoutBatchId: payoutId,
            entryType: "adjustment",
            sourceEntityType: "payout_residual",
            sourceEntityId: payoutBatch.id,
          },
          { session },
        );

        await LedgerEntryModel.updateMany(
          {
            restaurantId,
            payoutBatchId: payoutId,
            entryType: "payout",
          },
          {
            $set: { settlementStatus: "pending" },
          },
          { session },
        );
      }

      if (params.status === "completed") {
        await LedgerEntryModel.updateMany(
          {
            restaurantId,
            payoutBatchId: payoutId,
            entryType: "payout",
          },
          {
            $set: { settlementStatus: "paid_out" },
          },
          { session },
        );
      }

      payoutBatch.status = params.status;
      if (providerReference) payoutBatch.providerReference = providerReference;
      if (providerPayoutId) payoutBatch.providerPayoutId = providerPayoutId;
      if (providerTransactionId) payoutBatch.providerTransactionId = providerTransactionId;
      if (paymentProofUrl) payoutBatch.paymentProofUrl = paymentProofUrl;
      if (processingNote) payoutBatch.processingNote = processingNote;
      if (params.status === "processing") {
        payoutBatch.approvedByAdminId = params.adminId ?? "";
        payoutBatch.approvedAt = now;
      }
      payoutBatch.processedAt =
        params.status === "completed" || params.status === "failed"
          ? now
          : null;
      if (params.status === "completed" || params.status === "failed") {
        payoutBatch.processedByAdminId = params.adminId ?? "";
      }
      payoutBatch.failureReason =
        params.status === "failed" ? failureReason || "Marked failed by admin" : "";
      await payoutBatch.save({ session });
      updatedBatch = payoutBatch.toObject();
    });
  } finally {
    await session.endSession();
  }

  const savedBatch = updatedBatch as Record<string, any> | null;

  if (!savedBatch) {
    throw new AppError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      "PAYOUT_STATUS_UPDATE_FAILED",
      "Payout status could not be updated",
    );
  }

  invalidateOwnerFinanceCaches(params.restaurantId);

  await createAdminAuditLog({
    adminId: params.adminId,
    entityType: "restaurant",
    entityId: params.restaurantId,
    action: "payout.status_updated",
    title: "Payout status updated",
    description: `Payout ${objectIdString(savedBatch._id)} marked as ${params.status}.`,
    metadata: {
      payoutId: objectIdString(savedBatch._id),
      status: params.status,
      amount: numberValue(savedBatch.amount),
      providerReference: stringValue(savedBatch.providerReference),
      providerPayoutId: stringValue(savedBatch.providerPayoutId),
      providerTransactionId: stringValue(savedBatch.providerTransactionId),
    },
  });

  if (restaurant.ownerId) {
    await notifyOwnerPayoutStatus({
      ownerId: objectIdString(restaurant.ownerId),
      restaurantId: params.restaurantId,
      payoutId: objectIdString(savedBatch._id),
      amount: numberValue(savedBatch.amount),
      status: params.status,
      restaurantName: stringValue(restaurant.name),
      reference:
        stringValue(savedBatch.providerTransactionId) ||
        stringValue(savedBatch.providerPayoutId) ||
        stringValue(savedBatch.providerReference) ||
        stringValue(savedBatch.batchReference),
      sendSms: params.notifyOwnerSms === true,
    }).catch(() => undefined);
  }

  return {
    id: objectIdString(savedBatch._id),
    amount: numberValue(savedBatch.amount),
    status: stringValue(savedBatch.status),
    batchReference: stringValue(savedBatch.batchReference),
    provider: stringValue(savedBatch.provider, "manual"),
    providerReference: stringValue(savedBatch.providerReference),
    providerPayoutId: stringValue(savedBatch.providerPayoutId),
    providerTransactionId: stringValue(savedBatch.providerTransactionId),
    paymentProofUrl: stringValue(savedBatch.paymentProofUrl),
    processingNote: stringValue(savedBatch.processingNote),
    failureReason: stringValue(savedBatch.failureReason),
    requestedAt: serializeDate(savedBatch.requestedAt),
    approvedAt: serializeDate(savedBatch.approvedAt),
    processedAt: serializeDate(savedBatch.processedAt),
    updatedAt: serializeDate(savedBatch.updatedAt),
  };
}

export async function reconcileAdminPlatformFinance(params: { adminId?: string }) {
  const restaurants = await RestaurantModel.find()
    .select({ _id: 1 })
    .lean();

  const results = [];
  for (const restaurant of restaurants) {
    results.push(
      await reconcileAdminRestaurantFinance({
        restaurantId: objectIdString(restaurant._id),
        adminId: params.adminId,
      }),
    );
  }

  return {
    restaurants: results.length,
    scanned: results.reduce((total, result) => total + result.scanned, 0),
    created: results.reduce((total, result) => total + result.created, 0),
    updated: results.reduce((total, result) => total + result.updated, 0),
    skippedPaidOut: results.reduce(
      (total, result) => total + result.skippedPaidOut,
      0,
    ),
    pending: results.reduce((total, result) => total + result.pending, 0),
    available: results.reduce((total, result) => total + result.available, 0),
    reconciledAt: new Date().toISOString(),
  };
}

export async function deleteAdminRestaurant(restaurantId: string) {
  const restaurant = await getRestaurantOrThrow(restaurantId);
  const orderCount = await OrderModel.countDocuments({
    restaurantId: restaurant._id,
  });

  if (orderCount > 0) {
    restaurant.runtime = {
      ...(restaurant.runtime ?? {}),
      isVisible: false,
      isOnline: false,
      currentOperationalStatus: "closed",
    };
    await restaurant.save();

    return {
      id: restaurant.id,
      name: restaurant.name,
      mode: "hidden" as const,
      orderCount,
      deletedAt: null,
      updatedAt: serializeDate(restaurant.updatedAt),
    };
  }

  await Promise.all([
    CategoryModel.deleteMany({ restaurantId: restaurant._id }),
    MenuItemModel.deleteMany({ restaurantId: restaurant._id }),
    PayoutMethodModel.deleteMany({ restaurantId: restaurant._id }),
    OpeningHoursModel.deleteMany({ restaurantId: restaurant._id }),
  ]);

  await OwnerModel.updateOne(
    { activeRestaurantId: restaurant._id },
    {
      $set: {
        activeRestaurantId: null,
        restaurantLifecycleStatus: "account_created",
      },
    },
  );
  await restaurant.deleteOne();

  return {
    id: restaurant.id,
    name: restaurant.name,
    mode: "deleted" as const,
    orderCount,
    deletedAt: new Date().toISOString(),
    updatedAt: null,
  };
}
