import mongoose, { type SortOrder } from "mongoose";
import { StatusCodes } from "http-status-codes";

import { AppError } from "../../common/utils/app-error";
import { slugify } from "../../common/utils/slugify";
import { hashPassword } from "../auth/auth.utils";
import { AdminAuditLogModel, AdminModel } from "./admin.model";
import {
  createAdminOperationalAlert,
  resolveAdminOperationalAlertByDedupeKey,
} from "./admin-alert.service";
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
import { RestaurantAvailabilitySessionModel } from "../owner/restaurant-availability-session.model";
import { syncRestaurantAvailabilitySession } from "../owner/restaurant-availability-session.service";
import {
  buildRelatedOrderPayoutEligibilityMatch,
  isRestaurantPayoutEligibleOrder,
} from "../owner/finance-rules";
import {
  getOrderRestaurantSubtotal,
  isMarkupOrder,
} from "../../common/utils/order-pricing";
import { getOperationalFinanceSettings } from "../public/content.service";
import { invalidateCustomerRestaurantAvailabilityCaches } from "../customer/customer.service";
import {
  CategoryModel,
  MenuApprovalRequestModel,
  MenuItemModel,
  OrderModel,
} from "../owner/operational.model";
import {
  assertServiceAreaSnapshotMatchesScope,
  buildRestaurantServiceAreaScopeFilter,
  buildServiceAreaSnapshot,
  calculateServiceDistanceKm,
  isServiceAreaModeEnabled,
  resolveServiceZoneForCoordinates,
} from "../service-area/service-area.service";
import { ServiceZoneModel } from "../service-area/service-area.model";
import { notifyOwnerPayoutStatus } from "./payout-owner-notifications";
import { assertAdminPayoutBatchStatementReview } from "./finance.service";

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
  zoneId?: string;
  districtId?: string;
  status?: "all" | "live" | "delivered" | "cancelled";
  paymentMethod?: string;
  search?: string;
  sortBy?: "newest" | "oldest" | "highestValue";
  page?: number;
  pageSize?: number;
};

type RestaurantIntelligenceParams = {
  preset?: string;
  from?: string;
  to?: string;
  zoneId?: string;
  districtId?: string;
  status?: "all" | "live" | "delivered" | "cancelled" | "rejected";
  paymentMethod?: string;
  categoryId?: string;
  itemId?: string;
  customerTier?: "all" | "new" | "repeat";
  availabilityEvent?: "all" | "online" | "offline";
  availabilitySource?: "all" | "owner_app" | "owner_web" | "admin" | "system" | "unknown";
  availabilityReason?:
    | "all"
    | "manual_offline"
    | "admin_offline"
    | "enforcement"
    | "restaurant_hidden"
    | "replaced"
    | "system";
  availabilityRisk?: "all" | "offline_with_live_orders";
};

type RestaurantNextActionPriority = "critical" | "warning" | "opportunity";
type RestaurantNextActionDomain =
  | "availability"
  | "orders"
  | "finance"
  | "menu"
  | "reviews"
  | "support"
  | "growth"
  | "profile";
type RestaurantNextActionTargetTab =
  | "overview"
  | "availability"
  | "performance"
  | "sales"
  | "menu"
  | "customers"
  | "finance"
  | "quality"
  | "timeline";

type RestaurantNextAction = {
  id: string;
  priority: RestaurantNextActionPriority;
  domain: RestaurantNextActionDomain;
  title: string;
  description: string;
  impact: string;
  recommendation: string;
  actionLabel: string;
  targetTab?: RestaurantNextActionTargetTab;
  path?: string;
  metricLabel: string;
  metricValue: string;
};

type RestaurantBenchmarkScope = "zone" | "district" | "platform";
type RestaurantBenchmarkMetricUnit =
  | "money"
  | "count"
  | "percent"
  | "minutes"
  | "hours"
  | "rating";
type RestaurantBenchmarkMetricStatus =
  | "excellent"
  | "good"
  | "watch"
  | "needs_attention"
  | "not_available";
type RestaurantBenchmarkDirection = "higher_better" | "lower_better";

type RestaurantBenchmarkMetric = {
  key: string;
  label: string;
  domain: RestaurantNextActionDomain;
  unit: RestaurantBenchmarkMetricUnit;
  direction: RestaurantBenchmarkDirection;
  current: number;
  peerMedian: number;
  peerAverage: number;
  percentile: number;
  deltaFromMedian: number;
  status: RestaurantBenchmarkMetricStatus;
  summary: string;
  recommendation: string;
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

const MAX_RESTAURANT_INTELLIGENCE_ORDERS = 5000;

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

function medianMinutes(values: Array<number | null>) {
  const numericValues = values
    .filter((value): value is number => typeof value === "number")
    .sort((left, right) => left - right);
  if (!numericValues.length) return 0;
  const midpoint = Math.floor(numericValues.length / 2);
  const median =
    numericValues.length % 2 === 0
      ? (numericValues[midpoint - 1] + numericValues[midpoint]) / 2
      : numericValues[midpoint];
  return Number(median.toFixed(1));
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
    isSponsored: restaurant.discovery?.isSponsored === true,
    commissionRate: numberValue(restaurant.commercial?.commissionRate, 15),
    // Zero-commission markup model: "markup" adds platformMarkupPercent% on top of every
    // customer-facing menu price (owner keeps seeing their real price). Default "commission".
    pricingModel:
      restaurant.commercial?.pricingModel === "markup" ? "markup" : "commission",
    platformMarkupPercent: numberValue(
      restaurant.commercial?.platformMarkupPercent,
      0,
    ),
    // Raw per-restaurant override: null = inherit the platform minimumOrderAmount.
    minimumOrderAmount:
      typeof restaurant.commercial?.minimumOrderAmount === "number"
        ? restaurant.commercial.minimumOrderAmount
        : null,
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
    deliveryFee: numberValue(order.pricing?.deliveryFee) + numberValue(order.pricing?.urgentDeliveryFee),
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

  const temporaryPasswordHash = await hashPassword(params.temporaryPassword.trim());
  const owner =
    existingOwner ??
    (await OwnerModel.create({
      fullName: params.ownerFullName,
      phone: params.ownerPhone,
      email: params.ownerEmail ?? "",
      passwordHash: temporaryPasswordHash,
      isPhoneVerified: true,
      status: "active",
      restaurantLifecycleStatus: "approved",
    }));
  if (existingOwner) {
    owner.fullName = params.ownerFullName;
    owner.email = params.ownerEmail ?? owner.email ?? "";
    owner.passwordHash = temporaryPasswordHash;
    owner.isPhoneVerified = true;
    owner.status = "active";
    owner.restaurantLifecycleStatus = "approved";
    await owner.save();
  }

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
  params?: { preset?: string; from?: string; to?: string; zoneId?: string; districtId?: string },
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
  assertServiceAreaSnapshotMatchesScope(restaurant.serviceArea, {
    zoneId: params?.zoneId,
    districtId: params?.districtId,
    code: "RESTAURANT_NOT_FOUND",
    message: "Restaurant not found",
  });

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
      CategoryModel.countDocuments({
        restaurantId: safeRestaurantId,
        isDeleted: { $ne: true },
      }),
      CategoryModel.countDocuments({
        restaurantId: safeRestaurantId,
        status: "active",
      }),
      CategoryModel.countDocuments({
        restaurantId: safeRestaurantId,
        status: "archived",
      }),
      MenuItemModel.countDocuments({
        restaurantId: safeRestaurantId,
        isDeleted: { $ne: true },
      }),
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
        isDeleted: { $ne: true },
      }),
      MenuItemModel.countDocuments({
        restaurantId: safeRestaurantId,
        availability: "unavailable",
        isDeleted: { $ne: true },
      }),
      MenuItemModel.countDocuments({
        restaurantId: safeRestaurantId,
        isPopular: true,
        isDeleted: { $ne: true },
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
      isSponsored: restaurant.discovery?.isSponsored === true,
      customBadge: {
        enabled: restaurant.discovery?.customBadge?.enabled === true,
        label: trimLimitedString(restaurant.discovery?.customBadge?.label, "", 24),
      },
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

function getOrderGroupDate(order: Record<string, any>) {
  return (
    getOrderTimestamp(order, "Delivered") ??
    getOrderTimestamp(order, "Cancelled") ??
    getOrderTimestamp(order, "Rejected") ??
    getOrderTimestamp(order, "New") ??
    new Date()
  );
}

function formatShortDate(date: Date) {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

function buildRestaurantIntelligenceOrderQuery(
  restaurantId: mongoose.Types.ObjectId,
  params: RestaurantIntelligenceParams,
) {
  const query: Record<string, unknown> = { restaurantId };
  const dateMatch = buildDateMatch(params);

  if (dateMatch) query.createdAt = dateMatch;
  if (params.status === "live") query.status = { $in: LIVE_ORDER_STATUSES };
  if (params.status === "delivered") query.status = "Delivered";
  if (params.status === "cancelled")
    query.status = { $in: ["Cancelled", "Rejected"] };
  if (params.status === "rejected") query.status = "Rejected";
  if (params.paymentMethod && params.paymentMethod !== "all") {
    query.paymentMethod = params.paymentMethod;
  }
  if (params.categoryId && params.categoryId !== "all") {
    query["itemsSnapshot.categoryId"] = params.categoryId;
  }
  if (params.itemId && params.itemId !== "all") {
    query["itemsSnapshot.itemId"] = params.itemId;
  }

  return query;
}

function getCustomerKey(order: Record<string, any>) {
  return (
    stringValue(order.customerId) ||
    stringValue(order.customerSnapshot?.phone) ||
    "unknown"
  );
}

function getOrderItemRevenue(item: Record<string, any>) {
  return numberValue(
    item.effectiveLineTotal,
    numberValue(
      item.lineTotal,
      numberValue(item.unitPrice) * numberValue(item.quantity),
    ),
  );
}

function groupRestaurantTrend(orders: Array<Record<string, any>>) {
  const groups = new Map<
    string,
    {
      date: string;
      label: string;
      orders: number;
      revenue: number;
      cancelled: number;
      rejected: number;
      acceptanceSamples: Array<number | null>;
      preparationSamples: Array<number | null>;
    }
  >();

  for (const order of orders) {
    const date = getOrderGroupDate(order);
    const key = date.toISOString().slice(0, 10);
    const group =
      groups.get(key) ??
      {
        date: key,
        label: formatShortDate(date),
        orders: 0,
        revenue: 0,
        cancelled: 0,
        rejected: 0,
        acceptanceSamples: [],
        preparationSamples: [],
      };
    group.orders += 1;
    if (order.status === "Delivered") {
      group.revenue += numberValue(order.pricing?.total);
    }
    if (order.status === "Cancelled") group.cancelled += 1;
    if (order.status === "Rejected") group.rejected += 1;
    group.acceptanceSamples.push(
      minutesBetween(
        getOrderTimestamp(order, "New"),
        getOrderTimestamp(order, "Accepted"),
      ),
    );
    group.preparationSamples.push(
      minutesBetween(
        getOrderTimestamp(order, "Preparing") ??
          getOrderTimestamp(order, "Accepted"),
        getOrderTimestamp(order, "ReadyForPickup"),
      ),
    );
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((group) => ({
      date: group.date,
      label: group.label,
      orders: group.orders,
      revenue: Math.round(group.revenue),
      cancelled: group.cancelled,
      rejected: group.rejected,
      averageAcceptanceMinutes: averageMinutes(group.acceptanceSamples),
      averagePreparationMinutes: averageMinutes(group.preparationSamples),
    }));
}

function groupStatusDistribution(orders: Array<Record<string, any>>) {
  const labels: Record<string, string> = {
    New: "New",
    Accepted: "Accepted",
    Preparing: "Preparing",
    ReadyForPickup: "Ready",
    PickedUp: "Picked up",
    Delivered: "Delivered",
    Rejected: "Rejected",
    Cancelled: "Cancelled",
  };
  const groups = new Map<
    string,
    { key: string; label: string; count: number; revenue: number }
  >();

  for (const order of orders) {
    const key = stringValue(order.status, "Unknown");
    const group = groups.get(key) ?? {
      key,
      label: labels[key] ?? key,
      count: 0,
      revenue: 0,
    };
    group.count += 1;
    if (key === "Delivered") group.revenue += numberValue(order.pricing?.total);
    groups.set(key, group);
  }

  return Array.from(groups.values()).sort(
    (left, right) => right.count - left.count,
  );
}

function groupTopItems(orders: Array<Record<string, any>>) {
  const groups = new Map<
    string,
    {
      itemId: string;
      categoryId: string;
      name: string;
      categoryName: string;
      quantity: number;
      revenue: number;
      orders: number;
      lastSoldAt: string | null;
    }
  >();

  for (const order of orders) {
    if (order.status !== "Delivered" || !Array.isArray(order.itemsSnapshot)) {
      continue;
    }
    const soldAt = serializeDate(
      getOrderTimestamp(order, "Delivered") ?? order.createdAt,
    );
    const seenInOrder = new Set<string>();
    for (const item of order.itemsSnapshot) {
      const itemId = stringValue(item.itemId, stringValue(item.name, "unknown"));
      const group = groups.get(itemId) ?? {
        itemId,
        categoryId: stringValue(item.categoryId),
        name: stringValue(item.itemName ?? item.name, "Menu item"),
        categoryName: stringValue(item.categoryName, "Uncategorized"),
        quantity: 0,
        revenue: 0,
        orders: 0,
        lastSoldAt: null,
      };
      group.quantity += numberValue(item.quantity);
      group.revenue += getOrderItemRevenue(item);
      if (!seenInOrder.has(itemId)) {
        group.orders += 1;
        seenInOrder.add(itemId);
      }
      group.lastSoldAt = soldAt ?? group.lastSoldAt;
      groups.set(itemId, group);
    }
  }

  return Array.from(groups.values())
    .sort((left, right) => right.revenue - left.revenue)
    .slice(0, 12)
    .map((item) => ({
      ...item,
      revenue: Math.round(item.revenue),
    }));
}

function groupTopCustomers(orders: Array<Record<string, any>>) {
  const groups = new Map<
    string,
    {
      customerId: string;
      name: string;
      phone: string;
      orders: number;
      totalSpend: number;
      deliveredOrders: number;
      cancelledOrders: number;
      lastOrderedAt: string | null;
    }
  >();

  for (const order of orders) {
    const key = getCustomerKey(order);
    const group = groups.get(key) ?? {
      customerId: key,
      name: stringValue(
        order.customerSnapshot?.fullName ?? order.customerSnapshot?.name,
        "Customer",
      ),
      phone: stringValue(order.customerSnapshot?.phone),
      orders: 0,
      totalSpend: 0,
      deliveredOrders: 0,
      cancelledOrders: 0,
      lastOrderedAt: null,
    };
    group.orders += 1;
    if (order.status === "Delivered") {
      group.deliveredOrders += 1;
      group.totalSpend += numberValue(order.pricing?.total);
    }
    if (order.status === "Cancelled" || order.status === "Rejected") {
      group.cancelledOrders += 1;
    }
    group.lastOrderedAt = serializeDate(order.createdAt) ?? group.lastOrderedAt;
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .filter((customer) => customer.customerId !== "unknown")
    .sort((left, right) => right.totalSpend - left.totalSpend)
    .slice(0, 12)
    .map((customer) => ({
      ...customer,
      totalSpend: Math.round(customer.totalSpend),
      averageOrderValue:
        customer.deliveredOrders > 0
          ? Math.round(customer.totalSpend / customer.deliveredOrders)
          : 0,
    }));
}

function summarizePaymentMethods(orders: Array<Record<string, any>>) {
  const groups = new Map<
    string,
    { method: string; orders: number; revenue: number }
  >();

  for (const order of orders) {
    const method = stringValue(order.paymentMethod, "Unknown");
    const group = groups.get(method) ?? { method, orders: 0, revenue: 0 };
    group.orders += 1;
    if (order.status === "Delivered") {
      group.revenue += numberValue(order.pricing?.total);
    }
    groups.set(method, group);
  }

  return Array.from(groups.values())
    .sort((left, right) => right.orders - left.orders)
    .map((item) => ({
      ...item,
      revenue: Math.round(item.revenue),
    }));
}

function secondsBetweenDates(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfLocalDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getAvailabilityRange(params: RestaurantIntelligenceParams) {
  const now = new Date();
  const dateMatch = buildDateMatch(params);
  const defaultStart = addDays(startOfLocalDay(now), -29);
  const start = dateMatch?.$gte ?? defaultStart;
  const end = dateMatch?.$lte ?? now;
  return { start, end: end > now ? now : end };
}

function availabilitySessionOverlapSeconds(
  session: { startedAt?: Date | string | null; endedAt?: Date | string | null },
  rangeStart: Date,
  rangeEnd: Date,
) {
  if (!session.startedAt) return 0;
  const startedAt = new Date(session.startedAt);
  const endedAt = session.endedAt ? new Date(session.endedAt) : rangeEnd;
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
    return 0;
  }
  const start = new Date(Math.max(startedAt.getTime(), rangeStart.getTime()));
  const end = new Date(Math.min(endedAt.getTime(), rangeEnd.getTime()));
  return end > start ? secondsBetweenDates(start, end) : 0;
}

const weekdayKeys = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseClockMinutes(value: unknown) {
  if (typeof value !== "string") return null;
  const [rawHour, rawMinute] = value.split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  return hour * 60 + minute;
}

function scheduleForDay(openingHours: Record<string, any> | null, dayStart: Date) {
  if (!openingHours) return null;
  const dayDateKey = dateKey(dayStart);
  const exceptions = Array.isArray(openingHours.exceptions)
    ? openingHours.exceptions
    : [];
  const exception = exceptions.find(
    (item: Record<string, any>) => stringValue(item.date) === dayDateKey,
  );
  if (exception) return exception;

  const weeklySchedule = Array.isArray(openingHours.weeklySchedule)
    ? openingHours.weeklySchedule
    : [];
  const weekday = weekdayKeys[dayStart.getDay()];
  return weeklySchedule.find(
    (item: Record<string, any>) => stringValue(item.day) === weekday,
  ) ?? null;
}

function scheduledSecondsForDay(
  openingHours: Record<string, any> | null,
  dayStart: Date,
  rangeStart: Date,
  rangeEnd: Date,
) {
  const schedule = scheduleForDay(openingHours, dayStart);
  if (!schedule || schedule.isOpen === false) return 0;
  const dayEnd = addDays(dayStart, 1);
  const clipStart = new Date(Math.max(dayStart.getTime(), rangeStart.getTime()));
  const clipEnd = new Date(Math.min(dayEnd.getTime(), rangeEnd.getTime()));
  if (clipEnd <= clipStart) return 0;
  if (schedule.is24Hours === true) {
    return secondsBetweenDates(clipStart, clipEnd);
  }

  const slots = Array.isArray(schedule.timeSlots) ? schedule.timeSlots : [];
  return slots.reduce((total: number, slot: Record<string, any>) => {
    const startMinutes = parseClockMinutes(slot.startTime);
    const endMinutes = parseClockMinutes(slot.endTime);
    if (startMinutes === null || endMinutes === null) return total;
    const slotStart = new Date(dayStart);
    slotStart.setMinutes(startMinutes, 0, 0);
    const slotEnd = new Date(dayStart);
    slotEnd.setMinutes(endMinutes, 0, 0);
    if (slotEnd <= slotStart) {
      slotEnd.setDate(slotEnd.getDate() + 1);
    }
    const start = new Date(Math.max(slotStart.getTime(), rangeStart.getTime()));
    const end = new Date(Math.min(slotEnd.getTime(), rangeEnd.getTime()));
    return end > start ? total + secondsBetweenDates(start, end) : total;
  }, 0);
}

function isTemporaryClosureActive(openingHours: Record<string, any> | null) {
  const closure = openingHours?.temporaryClosure as Record<string, any> | undefined;
  if (!closure?.isPaused) return false;
  const resumeAt = closure.resumeAt ? new Date(closure.resumeAt) : null;
  return !resumeAt || Number.isNaN(resumeAt.getTime()) || resumeAt > new Date();
}

function buildScheduleCompliance(params: {
  openingHours: Record<string, any> | null;
  sessions: Array<Record<string, any>>;
  rangeStart: Date;
  rangeEnd: Date;
}) {
  const temporaryClosureActive = isTemporaryClosureActive(params.openingHours);
  const daily = [];
  let scheduledSeconds = 0;
  let onlineSeconds = 0;
  const now = new Date();

  for (
    let cursor = startOfLocalDay(params.rangeStart);
    cursor <= params.rangeEnd && daily.length < 62;
    cursor = addDays(cursor, 1)
  ) {
    const dayStart = new Date(cursor);
    const dayEnd = addDays(dayStart, 1);
    const expectedSeconds = temporaryClosureActive
      ? 0
      : scheduledSecondsForDay(
          params.openingHours,
          dayStart,
          params.rangeStart,
          params.rangeEnd,
        );
    const actualSeconds = params.sessions.reduce(
      (total, session) =>
        total + availabilitySessionOverlapSeconds(session, dayStart, dayEnd),
      0,
    );
    scheduledSeconds += expectedSeconds;
    onlineSeconds += actualSeconds;
    daily.push({
      date: dateKey(dayStart),
      label: formatShortDate(dayStart),
      scheduledSeconds: expectedSeconds,
      scheduledHours: Number((expectedSeconds / 3600).toFixed(2)),
      onlineSeconds: actualSeconds,
      onlineHours: Number((actualSeconds / 3600).toFixed(2)),
      complianceRate: expectedSeconds
        ? percentageRate(Math.min(actualSeconds, expectedSeconds), expectedSeconds)
        : actualSeconds > 0
          ? 100
          : 0,
      missedSeconds: Math.max(0, expectedSeconds - actualSeconds),
      sessionCount: params.sessions.filter((session) => {
        const startedAt = session.startedAt ? new Date(session.startedAt) : null;
        return startedAt && startedAt >= dayStart && startedAt < dayEnd;
      }).length,
      offlineEvents: params.sessions.filter((session) => {
        const endedAt = session.endedAt ? new Date(session.endedAt) : null;
        return endedAt && endedAt >= dayStart && endedAt < dayEnd;
      }).length,
    });
  }

  const todayStart = startOfLocalDay(now);
  const previousDayStart = addDays(todayStart, -1);
  const scheduledOpenNow =
    !temporaryClosureActive &&
    (scheduledSecondsForDay(
      params.openingHours,
      todayStart,
      now,
      new Date(now.getTime() + 1000),
    ) > 0 ||
      scheduledSecondsForDay(
        params.openingHours,
        previousDayStart,
        now,
        new Date(now.getTime() + 1000),
      ) > 0);

  return {
    temporaryClosureActive,
    scheduledSeconds,
    scheduledHours: Number((scheduledSeconds / 3600).toFixed(2)),
    onlineSeconds,
    onlineHours: Number((onlineSeconds / 3600).toFixed(2)),
    complianceRate: scheduledSeconds
      ? percentageRate(Math.min(onlineSeconds, scheduledSeconds), scheduledSeconds)
      : onlineSeconds > 0
        ? 100
        : 0,
    missedScheduledSeconds: Math.max(0, scheduledSeconds - onlineSeconds),
    missedScheduledHours: Number(
      (Math.max(0, scheduledSeconds - onlineSeconds) / 3600).toFixed(2),
    ),
    scheduledOpenNow,
    daily,
  };
}

function buildAvailabilityEventFilter(
  params: RestaurantIntelligenceParams,
  eventType: "online" | "offline",
  session: Record<string, any>,
) {
  if (
    params.availabilityEvent &&
    params.availabilityEvent !== "all" &&
    params.availabilityEvent !== eventType
  ) {
    return false;
  }
  if (params.availabilitySource && params.availabilitySource !== "all") {
    const source =
      eventType === "online"
        ? stringValue(session.startSource) || "unknown"
        : stringValue(session.endSource) || "unknown";
    if (source !== params.availabilitySource) return false;
  }
  if (
    eventType === "offline" &&
    params.availabilityReason &&
    params.availabilityReason !== "all" &&
    stringValue(session.endReason) !== params.availabilityReason
  ) {
    return false;
  }
  if (
    params.availabilityRisk === "offline_with_live_orders" &&
    (eventType !== "offline" || numberValue(session.activeOrderCountAtEnd) <= 0)
  ) {
    return false;
  }
  return true;
}

async function buildRestaurantAvailabilitySummary(
  restaurantId: string,
  params: RestaurantIntelligenceParams,
) {
  const now = new Date();
  const { start, end } = getAvailabilityRange(params);
  const todayStart = startOfLocalDay(now);
  const tomorrowStart = addDays(todayStart, 1);

  const [sessions, openingHours] = await Promise.all([
    RestaurantAvailabilitySessionModel.find({
      restaurantId,
      startedAt: { $lte: end },
      $or: [{ endedAt: null }, { endedAt: { $gte: start } }],
    })
      .sort({ startedAt: -1 })
      .limit(1000)
      .lean(),
    OpeningHoursModel.findOne({
      restaurantId: toObjectIdOrThrow(restaurantId, "Restaurant"),
    }).lean(),
  ]);

  const openSession = sessions.find((session) => !session.endedAt) ?? null;
  const scheduleCompliance = buildScheduleCompliance({
    openingHours,
    sessions,
    rangeStart: start,
    rangeEnd: end,
  });
  const windowOnlineSeconds = sessions.reduce(
    (total, session) =>
      total + availabilitySessionOverlapSeconds(session, start, end),
    0,
  );
  const todayOnlineSeconds = sessions.reduce(
    (total, session) =>
      total + availabilitySessionOverlapSeconds(session, todayStart, tomorrowStart),
    0,
  );
  const closedSessions = sessions.filter((session) => session.endedAt);

  const events = sessions.flatMap((session) => {
    const startedAt = session.startedAt ? new Date(session.startedAt) : null;
    const endedAt = session.endedAt ? new Date(session.endedAt) : null;
    const onlineEvent =
      startedAt && startedAt >= start && startedAt <= end
        ? [
            {
              id: `${objectIdString(session._id)}:online`,
              type: "online" as const,
              occurredAt: serializeDate(startedAt),
              source: stringValue(session.startSource) || "unknown",
              reason: "",
              durationSeconds: 0,
              activeOrderCount: numberValue(session.activeOrderCountAtStart),
              activeOrderNumbers: [] as string[],
            },
          ]
        : [];
    const offlineEvent =
      endedAt && endedAt >= start && endedAt <= end
        ? [
            {
              id: `${objectIdString(session._id)}:offline`,
              type: "offline" as const,
              occurredAt: serializeDate(endedAt),
              source: stringValue(session.endSource) || "unknown",
              reason: stringValue(session.endReason),
              durationSeconds: numberValue(session.durationSeconds),
              activeOrderCount: numberValue(session.activeOrderCountAtEnd),
              activeOrderNumbers: Array.isArray(session.activeOrderNumbersAtEnd)
                ? session.activeOrderNumbersAtEnd.map((item) => String(item))
                : [],
            },
          ]
        : [];
    return [...onlineEvent, ...offlineEvent].filter((event) =>
      buildAvailabilityEventFilter(params, event.type, session),
    );
  });

  const sourceBreakdown = new Map<string, number>();
  for (const event of events) {
    sourceBreakdown.set(event.source, (sourceBreakdown.get(event.source) ?? 0) + 1);
  }

  return {
    filters: {
      event: params.availabilityEvent ?? "all",
      source: params.availabilitySource ?? "all",
      reason: params.availabilityReason ?? "all",
      risk: params.availabilityRisk ?? "all",
    },
    summary: {
      isOnline: Boolean(openSession),
      currentSessionStartedAt: serializeDate(openSession?.startedAt),
      todayOnlineSeconds,
      windowOnlineSeconds,
      windowOnlineHours: Number((windowOnlineSeconds / 3600).toFixed(2)),
      scheduledWindowSeconds: scheduleCompliance.scheduledSeconds,
      scheduledWindowHours: scheduleCompliance.scheduledHours,
      scheduledComplianceRate: scheduleCompliance.complianceRate,
      missedScheduledSeconds: scheduleCompliance.missedScheduledSeconds,
      missedScheduledHours: scheduleCompliance.missedScheduledHours,
      scheduledOpenNow: scheduleCompliance.scheduledOpenNow,
      temporaryClosureActive: scheduleCompliance.temporaryClosureActive,
      sessionCount: sessions.length,
      averageSessionSeconds: closedSessions.length
        ? Math.round(
            closedSessions.reduce(
              (total, session) => total + numberValue(session.durationSeconds),
              0,
            ) / closedSessions.length,
          )
        : 0,
      offlineWithLiveOrdersCount: closedSessions.filter(
        (session) => numberValue(session.activeOrderCountAtEnd) > 0,
      ).length,
      shortSessionCount: closedSessions.filter(
        (session) => numberValue(session.durationSeconds) > 0 && numberValue(session.durationSeconds) < 300,
      ).length,
      lastOnlineAt: serializeDate(sessions[0]?.startedAt),
      lastOfflineAt: serializeDate(
        closedSessions.sort(
          (left, right) =>
            new Date(right.endedAt ?? 0).getTime() -
            new Date(left.endedAt ?? 0).getTime(),
        )[0]?.endedAt,
      ),
    },
    daily: scheduleCompliance.daily,
    sourceBreakdown: Array.from(sourceBreakdown.entries()).map(([source, count]) => ({
      source,
      count,
    })),
    events: events
      .sort(
        (left, right) =>
          new Date(right.occurredAt ?? 0).getTime() -
          new Date(left.occurredAt ?? 0).getTime(),
      )
      .slice(0, 100),
    sessions: sessions.slice(0, 50).map((session) => ({
      id: objectIdString(session._id),
      startedAt: serializeDate(session.startedAt),
      endedAt: serializeDate(session.endedAt),
      durationSeconds: session.endedAt
        ? numberValue(session.durationSeconds)
        : availabilitySessionOverlapSeconds(
            session,
            new Date(session.startedAt ?? now),
            now,
          ),
      status: session.endedAt ? "closed" : "online",
      startSource: stringValue(session.startSource) || "unknown",
      endSource: stringValue(session.endSource) || "unknown",
      endReason: stringValue(session.endReason),
      activeOrderCountAtStart: numberValue(session.activeOrderCountAtStart),
      activeOrderCountAtEnd: numberValue(session.activeOrderCountAtEnd),
      activeOrderNumbersAtEnd: Array.isArray(session.activeOrderNumbersAtEnd)
        ? session.activeOrderNumbersAtEnd.map((item) => String(item))
        : [],
    })),
  };
}

async function syncRestaurantAvailabilityAlerts(params: {
  restaurantId: string;
  restaurantName: string;
  isOnline: boolean;
  activeOrderCount: number;
  activeOrderNumbers: string[];
  availability: Awaited<ReturnType<typeof buildRestaurantAvailabilitySummary>>;
}) {
  const path = `/restaurants/${params.restaurantId}/details`;
  const alerts: Array<{
    key: string;
    severity: "info" | "warning" | "critical";
    title: string;
    description: string;
  }> = [];

  const scheduledOfflineKey = `restaurant:${params.restaurantId}:scheduled_open_offline`;
  if (
    params.availability.summary.scheduledOpenNow &&
    !params.isOnline &&
    !params.availability.summary.temporaryClosureActive
  ) {
    const title = `${params.restaurantName} is offline during scheduled hours`;
    const description =
      "Restaurant is scheduled to be open now, but customers cannot order because the store is offline.";
    await createAdminOperationalAlert({
      alertType: "restaurant_scheduled_open_offline",
      severity: "warning",
      title,
      description,
      source: "Restaurants",
      entityType: "restaurant",
      entityId: params.restaurantId,
      path,
      iconKey: "store",
      dedupeKey: scheduledOfflineKey,
      metadata: {
        restaurantId: params.restaurantId,
        restaurantName: params.restaurantName,
        scheduledComplianceRate:
          params.availability.summary.scheduledComplianceRate,
        missedScheduledHours: params.availability.summary.missedScheduledHours,
      },
    });
    alerts.push({
      key: scheduledOfflineKey,
      severity: "warning",
      title,
      description,
    });
  } else {
    await resolveAdminOperationalAlertByDedupeKey(scheduledOfflineKey);
  }

  const offlineLiveOrdersKey = `restaurant:${params.restaurantId}:offline_active_orders`;
  if (!params.isOnline && params.activeOrderCount > 0) {
    const title = `${params.restaurantName} is offline with live orders`;
    const description = `${params.activeOrderCount} live order${
      params.activeOrderCount === 1 ? "" : "s"
    } may need admin follow-up.`;
    await createAdminOperationalAlert({
      alertType: "restaurant_offline_active_orders",
      severity: "critical",
      title,
      description,
      source: "Restaurants",
      entityType: "restaurant",
      entityId: params.restaurantId,
      path,
      iconKey: "store",
      dedupeKey: offlineLiveOrdersKey,
      metadata: {
        restaurantId: params.restaurantId,
        restaurantName: params.restaurantName,
        activeOrderCount: params.activeOrderCount,
        orderNumbers: params.activeOrderNumbers.slice(0, 20),
      },
    });
    alerts.push({
      key: offlineLiveOrdersKey,
      severity: "critical",
      title,
      description,
    });
  } else {
    await resolveAdminOperationalAlertByDedupeKey(offlineLiveOrdersKey);
  }

  const frequentToggleKey = `restaurant:${params.restaurantId}:frequent_availability_toggles`;
  const recentEventCount = params.availability.events.filter((event) => {
    if (!event.occurredAt) return false;
    const occurredAt = new Date(event.occurredAt);
    return Date.now() - occurredAt.getTime() <= 60 * 60 * 1000;
  }).length;
  if (recentEventCount >= 6 || params.availability.summary.shortSessionCount >= 5) {
    const title = `${params.restaurantName} has frequent online/offline toggles`;
    const description =
      "Availability changed repeatedly in a short time. This can confuse customers and dispatch.";
    await createAdminOperationalAlert({
      alertType: "restaurant_frequent_availability_toggles",
      severity: "warning",
      title,
      description,
      source: "Restaurants",
      entityType: "restaurant",
      entityId: params.restaurantId,
      path,
      iconKey: "activity",
      dedupeKey: frequentToggleKey,
      metadata: {
        restaurantId: params.restaurantId,
        restaurantName: params.restaurantName,
        recentEventCount,
        shortSessionCount: params.availability.summary.shortSessionCount,
      },
    });
    alerts.push({
      key: frequentToggleKey,
      severity: "warning",
      title,
      description,
    });
  } else {
    await resolveAdminOperationalAlertByDedupeKey(frequentToggleKey);
  }

  return alerts;
}

function formatActionTaka(value: number) {
  return `${Math.round(numberValue(value)).toLocaleString("en-US")}tk`;
}

function buildRestaurantNextActions(params: {
  restaurantId: string;
  details: Record<string, any>;
  availability: Awaited<ReturnType<typeof buildRestaurantAvailabilitySummary>> & {
    alerts: Array<{
      key: string;
      severity: "info" | "warning" | "critical";
      title: string;
      description: string;
    }>;
  };
  salesSummary: Record<string, number>;
  performanceSummary: Record<string, any>;
  customerSummary: Record<string, number>;
  heroProduct: Record<string, any> | null;
  lateLiveOrders: number;
  pendingMenuApprovalCount: number;
  pendingReviewHideRequestCount: number;
}) {
  const actions: RestaurantNextAction[] = [];
  const restaurantPath = `/restaurants/${params.restaurantId}/details`;
  const financePath = `/finance?tab=payouts&restaurantId=${params.restaurantId}`;
  const supportPath = `/support?restaurantId=${params.restaurantId}`;
  const ordersPath = `/orders?restaurantId=${params.restaurantId}&status=live`;
  const reviewsPath = `/reviews?restaurantId=${params.restaurantId}&hideRequest=pending`;
  const menuApprovalsPath = `/menu-approvals?restaurantId=${params.restaurantId}&status=pending`;

  const addAction = (action: RestaurantNextAction) => {
    actions.push(action);
  };

  const isOnline = params.details.discovery?.isOnline === true;
  const isVisible = params.details.discovery?.isVisible !== false;
  const enforcementStatus = stringValue(
    params.details.enforcement?.status,
    "active",
  );
  const profileCompletion = numberValue(
    params.details.profileCompletionPercentage,
  );
  const openSupportCases =
    numberValue(params.details.support?.summary?.open) +
    numberValue(params.details.support?.summary?.inProgress);
  const liveOrders = numberValue(params.salesSummary.liveOrders);
  const deliveredOrders = numberValue(params.salesSummary.deliveredOrders);
  const cancellationRate = numberValue(params.salesSummary.cancellationRate);
  const availableBalance = numberValue(params.details.finance?.availableBalance);
  const pendingBalance = numberValue(params.details.finance?.pendingBalance);
  const minimumPayoutAmount = numberValue(
    params.details.finance?.minimumPayoutAmountTaka,
  );
  const recentPayouts = Array.isArray(params.details.finance?.recentPayouts)
    ? params.details.finance.recentPayouts
    : [];
  const activePayout = recentPayouts.find((payout: Record<string, any>) =>
    ["pending", "processing"].includes(stringValue(payout.status)),
  );
  const payoutMethod = params.details.payoutMethod as
    | Record<string, any>
    | null
    | undefined;

  if (!isVisible) {
    addAction({
      id: "restaurant-hidden",
      priority: "critical",
      domain: "profile",
      title: "Restaurant is hidden from customers",
      description:
        "Customers cannot discover or order from this restaurant while visibility is off.",
      impact: "Sales and availability are blocked.",
      recommendation:
        "Review the restaurant profile, enforcement state, and visibility setting before making it visible again.",
      actionLabel: "Review profile",
      targetTab: "overview",
      path: restaurantPath,
      metricLabel: "Visibility",
      metricValue: "Hidden",
    });
  }

  if (enforcementStatus !== "active") {
    addAction({
      id: "restaurant-enforcement",
      priority: "critical",
      domain: "profile",
      title: "Restaurant has an active enforcement status",
      description:
        "Operational restrictions can keep the restaurant unavailable even when the owner expects it to work.",
      impact: `Status: ${enforcementStatus.replaceAll("_", " ")}`,
      recommendation:
        "Check the enforcement reason, expiry, and owner communication before changing restaurant access.",
      actionLabel: "Review timeline",
      targetTab: "timeline",
      path: restaurantPath,
      metricLabel: "Enforcement",
      metricValue: enforcementStatus.replaceAll("_", " "),
    });
  }

  if (
    params.availability.summary.scheduledOpenNow &&
    !isOnline &&
    !params.availability.summary.temporaryClosureActive
  ) {
    addAction({
      id: "scheduled-open-offline",
      priority: "critical",
      domain: "availability",
      title: "Scheduled open, but currently offline",
      description:
        "The restaurant should be accepting orders now based on opening hours, but it is offline.",
      impact: `${formatActionTaka(params.salesSummary.grossRevenue)} window sales at risk if this repeats.`,
      recommendation:
        "Contact the owner or check whether the restaurant should use a temporary closure instead.",
      actionLabel: "Open availability",
      targetTab: "availability",
      path: restaurantPath,
      metricLabel: "Schedule",
      metricValue: "Offline now",
    });
  }

  if (!isOnline && liveOrders > 0) {
    addAction({
      id: "offline-live-orders",
      priority: "critical",
      domain: "orders",
      title: "Offline with live orders",
      description:
        "Live orders still need attention while the restaurant is offline.",
      impact: `${liveOrders} live order${liveOrders === 1 ? "" : "s"} may be delayed.`,
      recommendation:
        "Open live orders and follow up with the owner before customers are affected.",
      actionLabel: "View live orders",
      path: ordersPath,
      metricLabel: "Live orders",
      metricValue: `${liveOrders}`,
    });
  }

  if (params.lateLiveOrders > 0) {
    addAction({
      id: "late-live-orders",
      priority: "critical",
      domain: "orders",
      title: "Late order risk is active",
      description:
        "One or more live orders appear to be late against the restaurant preparation timing.",
      impact: `${params.lateLiveOrders} order${params.lateLiveOrders === 1 ? "" : "s"} need monitoring.`,
      recommendation:
        "Review live orders and check whether the preparation time needs adjustment.",
      actionLabel: "Review orders",
      path: ordersPath,
      metricLabel: "Late",
      metricValue: `${params.lateLiveOrders}`,
    });
  }

  if (openSupportCases > 0) {
    addAction({
      id: "open-support",
      priority: "warning",
      domain: "support",
      title: "Open restaurant support cases",
      description:
        "Unresolved support cases can explain owner confusion, bad operations, or payout questions.",
      impact: `${openSupportCases} open or in-progress case${openSupportCases === 1 ? "" : "s"}.`,
      recommendation:
        "Review the latest support cases before making operational or finance decisions.",
      actionLabel: "Open support",
      path: supportPath,
      metricLabel: "Support",
      metricValue: `${openSupportCases}`,
    });
  }

  if (params.pendingMenuApprovalCount > 0) {
    addAction({
      id: "pending-menu-approvals",
      priority: "warning",
      domain: "menu",
      title: "Menu approvals are waiting",
      description:
        "Owner-submitted new item or price update requests are waiting for admin review.",
      impact: `${params.pendingMenuApprovalCount} pending request${params.pendingMenuApprovalCount === 1 ? "" : "s"}.`,
      recommendation:
        "Approve or reject pending menu changes so customer-facing prices stay controlled.",
      actionLabel: "Review approvals",
      path: menuApprovalsPath,
      metricLabel: "Approvals",
      metricValue: `${params.pendingMenuApprovalCount}`,
    });
  }

  if (params.pendingReviewHideRequestCount > 0) {
    addAction({
      id: "pending-review-hide-requests",
      priority: "warning",
      domain: "reviews",
      title: "Review hide requests need moderation",
      description:
        "The owner requested review visibility changes that need an admin decision.",
      impact: `${params.pendingReviewHideRequestCount} pending request${params.pendingReviewHideRequestCount === 1 ? "" : "s"}.`,
      recommendation:
        "Approve only valid requests and leave a clear admin note for rejected ones.",
      actionLabel: "Moderate reviews",
      path: reviewsPath,
      metricLabel: "Hide requests",
      metricValue: `${params.pendingReviewHideRequestCount}`,
    });
  }

  if (
    params.availability.summary.scheduledWindowHours >= 4 &&
    params.availability.summary.scheduledComplianceRate < 80
  ) {
    addAction({
      id: "low-schedule-compliance",
      priority: "warning",
      domain: "availability",
      title: "Schedule compliance is low",
      description:
        "The restaurant is not staying online for the expected opening-hours window.",
      impact: `${params.availability.summary.scheduledComplianceRate}% compliance, ${params.availability.summary.missedScheduledHours.toFixed(1)}h missed.`,
      recommendation:
        "Compare daily online hours with opening hours and decide whether the owner needs coaching or schedule changes.",
      actionLabel: "Check availability",
      targetTab: "availability",
      path: restaurantPath,
      metricLabel: "Compliance",
      metricValue: `${params.availability.summary.scheduledComplianceRate}%`,
    });
  }

  if (
    params.availability.summary.shortSessionCount >= 5 ||
    params.availability.alerts.some((alert) =>
      alert.key.includes("frequent_availability_toggles"),
    )
  ) {
    addAction({
      id: "frequent-availability-toggles",
      priority: "warning",
      domain: "availability",
      title: "Frequent online/offline toggles",
      description:
        "Repeated short sessions can confuse customers and make dispatch unreliable.",
      impact: `${params.availability.summary.shortSessionCount} short session${params.availability.summary.shortSessionCount === 1 ? "" : "s"} in the selected window.`,
      recommendation:
        "Check whether toggles came from owner app or web and align the restaurant team on one operating flow.",
      actionLabel: "Inspect events",
      targetTab: "availability",
      path: restaurantPath,
      metricLabel: "Short sessions",
      metricValue: `${params.availability.summary.shortSessionCount}`,
    });
  }

  if (
    params.performanceSummary.ordersAnalyzed >= 5 &&
    numberValue(params.performanceSummary.acceptedWithin5MinutesRate) < 80
  ) {
    addAction({
      id: "slow-acceptance",
      priority: "warning",
      domain: "orders",
      title: "Acceptance time needs attention",
      description:
        "The restaurant is accepting too few orders within the 5 minute target.",
      impact: `${params.performanceSummary.acceptedWithin5MinutesRate}% accepted within 5 min.`,
      recommendation:
        "Review slowest orders and ask the owner to keep app/web notifications active during business hours.",
      actionLabel: "Open performance",
      targetTab: "performance",
      path: restaurantPath,
      metricLabel: "Accept SLA",
      metricValue: `${params.performanceSummary.acceptedWithin5MinutesRate}%`,
    });
  }

  if (
    params.performanceSummary.ordersAnalyzed >= 5 &&
    numberValue(params.performanceSummary.readyWithinEstimateRate) < 80
  ) {
    addAction({
      id: "slow-preparation",
      priority: "warning",
      domain: "orders",
      title: "Preparation time is missing target",
      description:
        "Orders are not becoming ready within the configured preparation estimate often enough.",
      impact: `${params.performanceSummary.readyWithinEstimateRate}% ready within estimate.`,
      recommendation:
        "Check slowest orders and update preparation time if the restaurant consistently needs longer.",
      actionLabel: "Review timing",
      targetTab: "performance",
      path: restaurantPath,
      metricLabel: "Prep SLA",
      metricValue: `${params.performanceSummary.readyWithinEstimateRate}%`,
    });
  }

  if (params.salesSummary.orders >= 5 && cancellationRate >= 20) {
    addAction({
      id: "high-cancellation-rate",
      priority: "warning",
      domain: "orders",
      title: "Cancellation or rejection rate is high",
      description:
        "Too many orders are ending without delivery in the selected window.",
      impact: `${cancellationRate}% cancelled or rejected.`,
      recommendation:
        "Review rejected and cancelled orders to separate restaurant-side issues from customer/payment issues.",
      actionLabel: "Open sales",
      targetTab: "sales",
      path: restaurantPath,
      metricLabel: "Cancel rate",
      metricValue: `${cancellationRate}%`,
    });
  }

  if (
    (availableBalance > 0 || pendingBalance > 0) &&
    (!payoutMethod || payoutMethod.isVerified !== true)
  ) {
    addAction({
      id: "payout-method-not-ready",
      priority: "warning",
      domain: "finance",
      title: "Payout method is not ready",
      description:
        "Restaurant earnings exist, but the payout method is missing or not verified.",
      impact: `${formatActionTaka(availableBalance + pendingBalance)} outstanding cannot be paid smoothly.`,
      recommendation:
        "Review the payout method and pending verification before approving payout movement.",
      actionLabel: "Open finance",
      targetTab: "finance",
      path: restaurantPath,
      metricLabel: "Outstanding",
      metricValue: formatActionTaka(availableBalance + pendingBalance),
    });
  } else if (activePayout) {
    addAction({
      id: "active-payout",
      priority: "warning",
      domain: "finance",
      title: "Payout request is in progress",
      description:
        "A payout request is already pending or processing for this restaurant.",
      impact: `${formatActionTaka(numberValue(activePayout.amount))} ${stringValue(activePayout.status)}.`,
      recommendation:
        "Complete, fail, or review the existing payout before starting another finance action.",
      actionLabel: "Review payout",
      path: financePath,
      metricLabel: "Payout",
      metricValue: stringValue(activePayout.status),
    });
  } else if (availableBalance >= Math.max(1, minimumPayoutAmount)) {
    addAction({
      id: "payout-ready",
      priority: "opportunity",
      domain: "finance",
      title: "Restaurant is payout-ready",
      description:
        "Available ledger balance is above the configured minimum payout amount.",
      impact: `${formatActionTaka(availableBalance)} available now.`,
      recommendation:
        "Generate the payout statement and pay after statement review is complete.",
      actionLabel: "Open payouts",
      path: financePath,
      metricLabel: "Available",
      metricValue: formatActionTaka(availableBalance),
    });
  }

  if (profileCompletion < 90) {
    addAction({
      id: "profile-incomplete",
      priority: "warning",
      domain: "profile",
      title: "Profile completion can be improved",
      description:
        "Incomplete restaurant profile details can hurt customer trust and admin diagnosis.",
      impact: `${profileCompletion}% complete.`,
      recommendation:
        "Check images, address, cuisine tags, opening hours, payout method, and menu coverage.",
      actionLabel: "Review profile",
      targetTab: "overview",
      path: restaurantPath,
      metricLabel: "Profile",
      metricValue: `${profileCompletion}%`,
    });
  }

  if (
    params.heroProduct &&
    stringValue(params.heroProduct.availability) === "unavailable"
  ) {
    addAction({
      id: "hero-product-unavailable",
      priority: "warning",
      domain: "menu",
      title: "Hero product is unavailable",
      description:
        "The top revenue item in this window is currently unavailable.",
      impact: `${formatActionTaka(numberValue(params.heroProduct.revenue))} window revenue item is unavailable.`,
      recommendation:
        "Ask the owner to restock or choose another popular item so customers see a strong menu.",
      actionLabel: "Open menu",
      targetTab: "menu",
      path: restaurantPath,
      metricLabel: "Hero item",
      metricValue: "Unavailable",
    });
  }

  if (deliveredOrders >= 5 && params.salesSummary.grossRevenue <= 0) {
    addAction({
      id: "finance-sales-mismatch",
      priority: "warning",
      domain: "finance",
      title: "Delivered orders need finance review",
      description:
        "Delivered order count exists, but gross revenue for this filtered view is zero.",
      impact: `${deliveredOrders} delivered order${deliveredOrders === 1 ? "" : "s"} in scope.`,
      recommendation:
        "Check ledger sync, order pricing snapshots, and filters before payout decisions.",
      actionLabel: "Open finance",
      targetTab: "finance",
      path: restaurantPath,
      metricLabel: "Delivered",
      metricValue: `${deliveredOrders}`,
    });
  }

  if (
    params.salesSummary.orders < 3 &&
    numberValue(params.details.averageRating) >= 4.3 &&
    numberValue(params.details.reviewCount) >= 3
  ) {
    addAction({
      id: "low-sales-good-rating",
      priority: "opportunity",
      domain: "growth",
      title: "Good rating, low recent sales",
      description:
        "Customer quality signal is strong, but order volume in this window is low.",
      impact: `${numberValue(params.details.averageRating).toFixed(1)} rating with ${params.salesSummary.orders} orders.`,
      recommendation:
        "Review visibility, opening hours, hero product, and whether a promotion should be tested.",
      actionLabel: "Review sales",
      targetTab: "sales",
      path: restaurantPath,
      metricLabel: "Rating",
      metricValue: `${numberValue(params.details.averageRating).toFixed(1)}`,
    });
  }

  if (
    numberValue(params.details.menu?.popularItems) === 0 &&
    numberValue(params.details.menu?.activeItems) >= 3
  ) {
    addAction({
      id: "no-popular-items",
      priority: "opportunity",
      domain: "menu",
      title: "No popular item is marked",
      description:
        "The menu has active items, but none are marked as popular for merchandising.",
      impact: `${numberValue(params.details.menu?.activeItems)} active items available for positioning.`,
      recommendation:
        "Use top-selling data to select one or two popular items and improve menu scanning.",
      actionLabel: "Open menu",
      targetTab: "menu",
      path: restaurantPath,
      metricLabel: "Popular",
      metricValue: "0",
    });
  }

  if (numberValue(params.customerSummary.repeatRate) >= 40) {
    addAction({
      id: "repeat-customer-opportunity",
      priority: "opportunity",
      domain: "growth",
      title: "Strong repeat-customer base",
      description:
        "Repeat customers are a good audience for targeted promotions or retention campaigns.",
      impact: `${numberValue(params.customerSummary.repeatRate)}% repeat rate.`,
      recommendation:
        "Consider a controlled promo for repeat customers instead of broad discounts.",
      actionLabel: "Open customers",
      targetTab: "customers",
      path: restaurantPath,
      metricLabel: "Repeat",
      metricValue: `${numberValue(params.customerSummary.repeatRate)}%`,
    });
  }

  const priorityRank: Record<RestaurantNextActionPriority, number> = {
    critical: 0,
    warning: 1,
    opportunity: 2,
  };

  return actions.sort(
    (left, right) =>
      priorityRank[left.priority] - priorityRank[right.priority] ||
      left.domain.localeCompare(right.domain) ||
      left.title.localeCompare(right.title),
  );
}

const BENCHMARK_MIN_PEERS = 3;
const BENCHMARK_MAX_PEERS = 80;
const BENCHMARK_MAX_ORDERS = 50000;

type BenchmarkOrderSummary = {
  orders: number;
  deliveredOrders: number;
  grossSales: number;
  averageOrderValue: number;
  cancellationRate: number;
  averageAcceptanceMinutes: number;
  acceptedWithin5MinutesRate: number;
  averagePreparationMinutes: number;
  readyWithinEstimateRate: number;
  repeatCustomerRate: number;
  hasAcceptanceSamples: boolean;
  hasPreparationSamples: boolean;
};

function medianNumber(values: number[]) {
  const clean = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (!clean.length) return 0;
  const midpoint = Math.floor(clean.length / 2);
  return clean.length % 2 === 0
    ? Number(((clean[midpoint - 1] + clean[midpoint]) / 2).toFixed(2))
    : Number(clean[midpoint].toFixed(2));
}

function averageNumber(values: number[]) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (!clean.length) return 0;
  return Number(
    (clean.reduce((sum, value) => sum + value, 0) / clean.length).toFixed(2),
  );
}

function formatBenchmarkValue(
  unit: RestaurantBenchmarkMetricUnit,
  value: number,
) {
  if (unit === "money") return formatActionTaka(value);
  if (unit === "percent") return `${Math.round(numberValue(value))}%`;
  if (unit === "minutes") {
    return `${Number(value || 0).toFixed(value % 1 === 0 ? 0 : 1)} min`;
  }
  if (unit === "hours") return `${Number(value || 0).toFixed(1)}h`;
  if (unit === "rating") return `${Number(value || 0).toFixed(1)}`;
  return `${Math.round(numberValue(value))}`;
}

function benchmarkPercentile(params: {
  current: number;
  peers: number[];
  direction: RestaurantBenchmarkDirection;
}) {
  const cleanPeers = params.peers.filter((value) => Number.isFinite(value));
  if (!cleanPeers.length) return 0;
  const betterOrEqual = cleanPeers.filter((value) =>
    params.direction === "higher_better"
      ? params.current >= value
      : params.current <= value,
  ).length;
  return Math.round((betterOrEqual / cleanPeers.length) * 100);
}

function benchmarkStatus(
  percentile: number,
  peerCount: number,
): RestaurantBenchmarkMetricStatus {
  if (!peerCount) return "not_available";
  if (percentile >= 75) return "excellent";
  if (percentile >= 55) return "good";
  if (percentile >= 35) return "watch";
  return "needs_attention";
}

function buildBenchmarkMetric(params: {
  key: string;
  label: string;
  domain: RestaurantNextActionDomain;
  unit: RestaurantBenchmarkMetricUnit;
  direction: RestaurantBenchmarkDirection;
  current: number;
  peers: number[];
  recommendation: string;
}) {
  const peerValues = params.peers.filter((value) => Number.isFinite(value));
  const peerMedian = medianNumber(peerValues);
  const percentile = benchmarkPercentile({
    current: numberValue(params.current),
    peers: peerValues,
    direction: params.direction,
  });
  const status = benchmarkStatus(percentile, peerValues.length);
  const summary =
    status === "not_available"
      ? "Not enough peer data for this metric."
      : `Better than ${percentile}% of peers. Peer median: ${formatBenchmarkValue(
          params.unit,
          peerMedian,
        )}.`;

  return {
    key: params.key,
    label: params.label,
    domain: params.domain,
    unit: params.unit,
    direction: params.direction,
    current: numberValue(params.current),
    peerMedian,
    peerAverage: averageNumber(peerValues),
    percentile,
    deltaFromMedian: Number((numberValue(params.current) - peerMedian).toFixed(2)),
    status,
    summary,
    recommendation: params.recommendation,
  } satisfies RestaurantBenchmarkMetric;
}

function summarizeBenchmarkOrders(
  orders: Array<Record<string, any>>,
  preparationTimeMinutes: number,
): BenchmarkOrderSummary {
  const mappedOrders = orders.map((order) =>
    mapRestaurantOrderHistory(order, preparationTimeMinutes),
  );
  const deliveredOrders = orders.filter((order) => order.status === "Delivered");
  const cancelledOrders = orders.filter(
    (order) => order.status === "Cancelled" || order.status === "Rejected",
  );
  const deliveredRevenue = deliveredOrders.reduce(
    (sum, order) => sum + numberValue(order.pricing?.total),
    0,
  );
  const acceptedOrders = mappedOrders.filter(
    (order) => order.acceptanceMinutes !== null,
  );
  const preparedOrders = mappedOrders.filter(
    (order) => order.preparationMinutes !== null,
  );
  const customerCounts = new Map<string, number>();
  for (const order of orders) {
    const key = getCustomerKey(order);
    if (key === "unknown") continue;
    customerCounts.set(key, (customerCounts.get(key) ?? 0) + 1);
  }
  const repeatCustomers = Array.from(customerCounts.values()).filter(
    (count) => count > 1,
  ).length;

  return {
    orders: orders.length,
    deliveredOrders: deliveredOrders.length,
    grossSales: Math.round(deliveredRevenue),
    averageOrderValue: deliveredOrders.length
      ? Math.round(deliveredRevenue / deliveredOrders.length)
      : 0,
    cancellationRate: percentageRate(cancelledOrders.length, orders.length),
    averageAcceptanceMinutes: averageMinutes(
      mappedOrders.map((order) => order.acceptanceMinutes),
    ),
    acceptedWithin5MinutesRate: percentageRate(
      acceptedOrders.filter(
        (order) =>
          typeof order.acceptanceMinutes === "number" &&
          order.acceptanceMinutes <= 5,
      ).length,
      acceptedOrders.length,
    ),
    averagePreparationMinutes: averageMinutes(
      mappedOrders.map((order) => order.preparationMinutes),
    ),
    readyWithinEstimateRate: percentageRate(
      preparedOrders.filter(
        (order) =>
          typeof order.preparationMinutes === "number" &&
          order.preparationMinutes <= preparationTimeMinutes,
      ).length,
      preparedOrders.length,
    ),
    repeatCustomerRate: percentageRate(repeatCustomers, customerCounts.size),
    hasAcceptanceSamples: acceptedOrders.length > 0,
    hasPreparationSamples: preparedOrders.length > 0,
  };
}

function applyBenchmarkCustomerTier(
  orders: Array<Record<string, any>>,
  customerTier?: RestaurantIntelligenceParams["customerTier"],
) {
  if (!customerTier || customerTier === "all") return orders;

  const countsByRestaurant = new Map<string, Map<string, number>>();
  for (const order of orders) {
    const restaurantId = objectIdString(order.restaurantId);
    const customerKey = getCustomerKey(order);
    if (customerKey === "unknown") continue;
    const counts = countsByRestaurant.get(restaurantId) ?? new Map<string, number>();
    counts.set(customerKey, (counts.get(customerKey) ?? 0) + 1);
    countsByRestaurant.set(restaurantId, counts);
  }

  return orders.filter((order) => {
    const count =
      countsByRestaurant.get(objectIdString(order.restaurantId))?.get(
        getCustomerKey(order),
      ) ?? 0;
    return customerTier === "new" ? count <= 1 : count > 1;
  });
}

function buildBenchmarkOrderQuery(
  restaurantIds: mongoose.Types.ObjectId[],
  params: RestaurantIntelligenceParams,
) {
  const query: Record<string, unknown> = {
    restaurantId: { $in: restaurantIds },
  };
  const dateMatch = buildDateMatch(params);
  if (dateMatch) query.createdAt = dateMatch;
  if (params.status === "live") query.status = { $in: LIVE_ORDER_STATUSES };
  if (params.status === "delivered") query.status = "Delivered";
  if (params.status === "cancelled") {
    query.status = { $in: ["Cancelled", "Rejected"] };
  }
  if (params.status === "rejected") query.status = "Rejected";
  if (params.paymentMethod && params.paymentMethod !== "all") {
    query.paymentMethod = params.paymentMethod;
  }
  if (params.categoryId && params.categoryId !== "all") {
    query["itemsSnapshot.categoryId"] = params.categoryId;
  }
  if (params.itemId && params.itemId !== "all") {
    query["itemsSnapshot.itemId"] = params.itemId;
  }
  return query;
}

async function resolveRestaurantBenchmarkCohort(
  restaurantId: mongoose.Types.ObjectId,
  params: RestaurantIntelligenceParams,
) {
  const restaurant = await RestaurantModel.findById(restaurantId)
    .select({ serviceArea: 1 })
    .lean();
  const zoneId = params.zoneId || stringValue(restaurant?.serviceArea?.zoneId);
  const districtId =
    params.districtId || stringValue(restaurant?.serviceArea?.districtId);
  const zoneName = stringValue(restaurant?.serviceArea?.zoneName, "same zone");
  const districtName = stringValue(
    restaurant?.serviceArea?.districtName,
    "same district",
  );
  const baseQuery: Record<string, unknown> = {
    _id: { $ne: restaurantId },
    "runtime.isVisible": { $ne: false },
  };
  const scopes: Array<{
    scope: RestaurantBenchmarkScope;
    label: string;
    query: Record<string, unknown>;
  }> = [];

  if (zoneId) {
    scopes.push({
      scope: "zone",
      label: zoneName,
      query: { ...baseQuery, "serviceArea.zoneId": zoneId },
    });
  }
  if (districtId) {
    scopes.push({
      scope: "district",
      label: districtName,
      query: { ...baseQuery, "serviceArea.districtId": districtId },
    });
  }
  scopes.push({
    scope: "platform",
    label: "platform",
    query: baseQuery,
  });

  for (let index = 0; index < scopes.length; index += 1) {
    const candidate = scopes[index];
    const peers = await RestaurantModel.find(candidate.query)
      .select({ _id: 1, preparationTimeMinutes: 1 })
      .limit(BENCHMARK_MAX_PEERS)
      .lean();
    if (peers.length >= BENCHMARK_MIN_PEERS || index === scopes.length - 1) {
      return {
        scope: candidate.scope,
        scopeLabel: candidate.label,
        peers,
      };
    }
  }

  return {
    scope: "platform" as const,
    scopeLabel: "platform",
    peers: [],
  };
}

async function buildRestaurantBenchmark(params: {
  restaurantId: mongoose.Types.ObjectId;
  intelligenceParams: RestaurantIntelligenceParams;
  currentOrders: BenchmarkOrderSummary;
  currentAvailability: Awaited<ReturnType<typeof buildRestaurantAvailabilitySummary>> & {
    alerts: Array<{
      key: string;
      severity: "info" | "warning" | "critical";
      title: string;
      description: string;
    }>;
  };
  currentRating: number;
  currentReviewCount: number;
}) {
  const cohort = await resolveRestaurantBenchmarkCohort(
    params.restaurantId,
    params.intelligenceParams,
  );
  const peerIds = cohort.peers.map((restaurant) => restaurant._id);
  const peerIdStrings = peerIds.map((id) => objectIdString(id));
  const peerPreparationById = new Map(
    cohort.peers.map((restaurant) => [
      objectIdString(restaurant._id),
      typeof restaurant.preparationTimeMinutes === "number"
        ? restaurant.preparationTimeMinutes
        : 30,
    ]),
  );
  const { start, end } = getAvailabilityRange(params.intelligenceParams);

  if (!peerIds.length) {
    return {
      status: "insufficient_data",
      scope: cohort.scope,
      scopeLabel: cohort.scopeLabel,
      peerCount: 0,
      minimumPeers: BENCHMARK_MIN_PEERS,
      generatedAt: serializeDate(new Date()),
      orderSample: {
        loadedOrders: 0,
        maxLoadedOrders: BENCHMARK_MAX_ORDERS,
        truncated: false,
      },
      metrics: [] as RestaurantBenchmarkMetric[],
    };
  }

  const [rawPeerOrders, peerOpeningHours, peerSessions, peerReviewRows] =
    await Promise.all([
      OrderModel.find(buildBenchmarkOrderQuery(peerIds, params.intelligenceParams))
        .sort({ createdAt: -1 })
        .limit(BENCHMARK_MAX_ORDERS)
        .select({
          restaurantId: 1,
          status: 1,
          paymentMethod: 1,
          pricing: 1,
          customerId: 1,
          customerSnapshot: 1,
          itemsSnapshot: 1,
          timestamps: 1,
          createdAt: 1,
        })
        .lean(),
      OpeningHoursModel.find({ restaurantId: { $in: peerIds } }).lean(),
      RestaurantAvailabilitySessionModel.find({
        restaurantId: { $in: peerIdStrings },
        startedAt: { $lte: end },
        $or: [{ endedAt: null }, { endedAt: { $gte: start } }],
      })
        .limit(5000)
        .lean(),
      ReviewModel.aggregate<{
        _id: mongoose.Types.ObjectId;
        averageRating: number;
        reviewCount: number;
      }>([
        {
          $match: {
            restaurantId: { $in: peerIds },
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
    ]);

  const peerOrders = applyBenchmarkCustomerTier(
    rawPeerOrders,
    params.intelligenceParams.customerTier,
  );
  const ordersByRestaurant = new Map<string, Array<Record<string, any>>>();
  for (const order of peerOrders) {
    const restaurantId = objectIdString(order.restaurantId);
    const list = ordersByRestaurant.get(restaurantId) ?? [];
    list.push(order);
    ordersByRestaurant.set(restaurantId, list);
  }
  const orderSummaryByRestaurant = new Map<string, BenchmarkOrderSummary>();
  for (const restaurantId of peerIdStrings) {
    orderSummaryByRestaurant.set(
      restaurantId,
      summarizeBenchmarkOrders(
        ordersByRestaurant.get(restaurantId) ?? [],
        peerPreparationById.get(restaurantId) ?? 30,
      ),
    );
  }

  const openingHoursByRestaurant = new Map(
    peerOpeningHours.map((openingHours) => [
      objectIdString(openingHours.restaurantId),
      openingHours,
    ]),
  );
  const sessionsByRestaurant = new Map<string, Array<Record<string, any>>>();
  for (const session of peerSessions) {
    const restaurantId = stringValue(session.restaurantId);
    const list = sessionsByRestaurant.get(restaurantId) ?? [];
    list.push(session);
    sessionsByRestaurant.set(restaurantId, list);
  }
  const availabilityByRestaurant = new Map<
    string,
    ReturnType<typeof buildScheduleCompliance> & {
      offlineWithLiveOrdersCount: number;
      shortSessionCount: number;
    }
  >();
  for (const restaurantId of peerIdStrings) {
    const sessions = sessionsByRestaurant.get(restaurantId) ?? [];
    const compliance = buildScheduleCompliance({
      openingHours: openingHoursByRestaurant.get(restaurantId) ?? null,
      sessions,
      rangeStart: start,
      rangeEnd: end,
    });
    const closedSessions = sessions.filter((session) => session.endedAt);
    availabilityByRestaurant.set(restaurantId, {
      ...compliance,
      offlineWithLiveOrdersCount: closedSessions.filter(
        (session) => numberValue(session.activeOrderCountAtEnd) > 0,
      ).length,
      shortSessionCount: closedSessions.filter(
        (session) =>
          numberValue(session.durationSeconds) > 0 &&
          numberValue(session.durationSeconds) < 300,
      ).length,
    });
  }
  const reviewByRestaurant = new Map(
    peerReviewRows.map((row) => [
      objectIdString(row._id),
      {
        averageRating: Number(numberValue(row.averageRating).toFixed(1)),
        reviewCount: numberValue(row.reviewCount),
      },
    ]),
  );

  const orderValues = (selector: (summary: BenchmarkOrderSummary) => number) =>
    peerIdStrings.map((id) => selector(orderSummaryByRestaurant.get(id)!));
  const sampledOrderValues = (
    selector: (summary: BenchmarkOrderSummary) => number,
    predicate: (summary: BenchmarkOrderSummary) => boolean,
  ) =>
    peerIdStrings
      .map((id) => orderSummaryByRestaurant.get(id)!)
      .filter(predicate)
      .map(selector);
  const availabilityValues = (
    selector: (
      summary: ReturnType<typeof buildScheduleCompliance> & {
        offlineWithLiveOrdersCount: number;
        shortSessionCount: number;
      },
    ) => number,
  ) => peerIdStrings.map((id) => selector(availabilityByRestaurant.get(id)!));
  const reviewValues = (selector: (summary: { averageRating: number; reviewCount: number }) => number) =>
    peerIdStrings
      .map((id) => reviewByRestaurant.get(id))
      .filter((summary): summary is { averageRating: number; reviewCount: number } =>
        Boolean(summary && summary.reviewCount > 0),
      )
      .map(selector);

  const metrics = [
    buildBenchmarkMetric({
      key: "gross_sales",
      label: "Gross sales",
      domain: "finance",
      unit: "money",
      direction: "higher_better",
      current: params.currentOrders.grossSales,
      peers: orderValues((summary) => summary.grossSales),
      recommendation:
        "Use this to judge whether the restaurant is generating enough revenue for its peer group.",
    }),
    buildBenchmarkMetric({
      key: "delivered_orders",
      label: "Delivered orders",
      domain: "orders",
      unit: "count",
      direction: "higher_better",
      current: params.currentOrders.deliveredOrders,
      peers: orderValues((summary) => summary.deliveredOrders),
      recommendation:
        "If this is low, review visibility, availability, menu strength, and order acceptance flow.",
    }),
    buildBenchmarkMetric({
      key: "average_order_value",
      label: "Average order value",
      domain: "finance",
      unit: "money",
      direction: "higher_better",
      current: params.currentOrders.averageOrderValue,
      peers: sampledOrderValues(
        (summary) => summary.averageOrderValue,
        (summary) => summary.deliveredOrders > 0,
      ),
      recommendation:
        "Compare with menu pricing and bundle/add-on opportunities before changing promotions.",
    }),
    buildBenchmarkMetric({
      key: "cancellation_rate",
      label: "Cancellation/rejection rate",
      domain: "orders",
      unit: "percent",
      direction: "lower_better",
      current: params.currentOrders.cancellationRate,
      peers: sampledOrderValues(
        (summary) => summary.cancellationRate,
        (summary) => summary.orders > 0,
      ),
      recommendation:
        "High cancellation needs order history review to separate owner-side issues from customer/payment issues.",
    }),
    buildBenchmarkMetric({
      key: "average_acceptance",
      label: "Avg acceptance",
      domain: "orders",
      unit: "minutes",
      direction: "lower_better",
      current: params.currentOrders.averageAcceptanceMinutes,
      peers: sampledOrderValues(
        (summary) => summary.averageAcceptanceMinutes,
        (summary) => summary.hasAcceptanceSamples,
      ),
      recommendation:
        "Slow acceptance usually means notification, staffing, or owner app/web usage needs attention.",
    }),
    buildBenchmarkMetric({
      key: "acceptance_sla",
      label: "Accepted within 5 min",
      domain: "orders",
      unit: "percent",
      direction: "higher_better",
      current: params.currentOrders.acceptedWithin5MinutesRate,
      peers: sampledOrderValues(
        (summary) => summary.acceptedWithin5MinutesRate,
        (summary) => summary.hasAcceptanceSamples,
      ),
      recommendation:
        "Use this alongside average acceptance time to decide whether the owner needs real-time workflow coaching.",
    }),
    buildBenchmarkMetric({
      key: "average_preparation",
      label: "Avg preparation",
      domain: "orders",
      unit: "minutes",
      direction: "lower_better",
      current: params.currentOrders.averagePreparationMinutes,
      peers: sampledOrderValues(
        (summary) => summary.averagePreparationMinutes,
        (summary) => summary.hasPreparationSamples,
      ),
      recommendation:
        "If preparation is slower than peers, check menu complexity and configured preparation time.",
    }),
    buildBenchmarkMetric({
      key: "ready_within_estimate",
      label: "Ready within estimate",
      domain: "orders",
      unit: "percent",
      direction: "higher_better",
      current: params.currentOrders.readyWithinEstimateRate,
      peers: sampledOrderValues(
        (summary) => summary.readyWithinEstimateRate,
        (summary) => summary.hasPreparationSamples,
      ),
      recommendation:
        "Use this to decide whether the preparation estimate is realistic or operations are slipping.",
    }),
    buildBenchmarkMetric({
      key: "schedule_compliance",
      label: "Schedule compliance",
      domain: "availability",
      unit: "percent",
      direction: "higher_better",
      current: params.currentAvailability.summary.scheduledComplianceRate,
      peers: availabilityValues((summary) => summary.complianceRate),
      recommendation:
        "Low compliance means opening hours and owner online behavior are not aligned.",
    }),
    buildBenchmarkMetric({
      key: "online_hours",
      label: "Online hours",
      domain: "availability",
      unit: "hours",
      direction: "higher_better",
      current: params.currentAvailability.summary.windowOnlineHours,
      peers: availabilityValues((summary) => summary.onlineHours),
      recommendation:
        "Online hours are contextual; compare together with schedule compliance before taking action.",
    }),
    buildBenchmarkMetric({
      key: "offline_live_orders",
      label: "Offline with live orders",
      domain: "availability",
      unit: "count",
      direction: "lower_better",
      current: params.currentAvailability.summary.offlineWithLiveOrdersCount,
      peers: availabilityValues((summary) => summary.offlineWithLiveOrdersCount),
      recommendation:
        "Any value above peers should trigger owner follow-up because it can directly affect customers.",
    }),
    buildBenchmarkMetric({
      key: "rating",
      label: "Visible rating",
      domain: "reviews",
      unit: "rating",
      direction: "higher_better",
      current: params.currentRating,
      peers: reviewValues((summary) => summary.averageRating),
      recommendation:
        "Use rating benchmark with review count and hidden-review moderation before judging quality.",
    }),
    buildBenchmarkMetric({
      key: "repeat_customer_rate",
      label: "Repeat customer rate",
      domain: "growth",
      unit: "percent",
      direction: "higher_better",
      current: params.currentOrders.repeatCustomerRate,
      peers: sampledOrderValues(
        (summary) => summary.repeatCustomerRate,
        (summary) => summary.orders > 0,
      ),
      recommendation:
        "Strong repeat rate supports targeted retention offers; weak repeat rate suggests quality/menu follow-up.",
    }),
  ];

  return {
    status:
      peerIdStrings.length >= BENCHMARK_MIN_PEERS ? "ready" : "insufficient_data",
    scope: cohort.scope,
    scopeLabel: cohort.scopeLabel,
    peerCount: peerIdStrings.length,
    minimumPeers: BENCHMARK_MIN_PEERS,
    generatedAt: serializeDate(new Date()),
    orderSample: {
      loadedOrders: rawPeerOrders.length,
      maxLoadedOrders: BENCHMARK_MAX_ORDERS,
      truncated: rawPeerOrders.length >= BENCHMARK_MAX_ORDERS,
    },
    metrics,
  };
}

export async function getAdminRestaurantIntelligence(
  restaurantId: string,
  params: RestaurantIntelligenceParams = {},
) {
  const safeRestaurantId = toObjectIdOrThrow(restaurantId, "Restaurant");
  const details = await getAdminRestaurantDetails(restaurantId, params);
  const query = buildRestaurantIntelligenceOrderQuery(safeRestaurantId, params);
  const activeAvailabilityOrders = await OrderModel.find({
    restaurantId: safeRestaurantId,
    status: { $in: LIVE_ORDER_STATUSES },
  })
    .select({ orderNumber: 1 })
    .lean();

  await syncRestaurantAvailabilitySession({
    restaurantId: safeRestaurantId.toString(),
    ownerId: details.owner.id,
    isOnline: details.discovery.isOnline,
    source: "system",
    endReason: details.discovery.isOnline ? undefined : "system",
    activeOrderCount: activeAvailabilityOrders.length,
    activeOrderNumbers: activeAvailabilityOrders.map((order) =>
      stringValue(order.orderNumber),
    ),
    fallbackStartedAt: details.discovery.isOnline ? details.updatedAt : null,
  });

  const [
    matchingCount,
    orders,
    categories,
    menuItems,
    availability,
    pendingMenuApprovalCount,
    pendingReviewHideRequestCount,
  ] = await Promise.all([
    OrderModel.countDocuments(query),
    OrderModel.find(query)
      .sort({ createdAt: -1 })
      .limit(MAX_RESTAURANT_INTELLIGENCE_ORDERS)
      .lean(),
    CategoryModel.find(
      { restaurantId: safeRestaurantId, isDeleted: { $ne: true } },
      { name: 1, status: 1, displayOrder: 1 },
    )
      .sort({ displayOrder: 1, name: 1 })
      .lean(),
    MenuItemModel.find(
      { restaurantId: safeRestaurantId, isDeleted: { $ne: true } },
      {
        name: 1,
        categoryId: 1,
        basePrice: 1,
        status: 1,
        availability: 1,
        isPopular: 1,
        images: 1,
      },
    )
      .sort({ name: 1 })
      .limit(250)
      .lean(),
    buildRestaurantAvailabilitySummary(safeRestaurantId.toString(), params),
    MenuApprovalRequestModel.countDocuments({
      restaurantId: safeRestaurantId,
      status: "pending",
    }),
    ReviewModel.countDocuments({
      restaurantId: safeRestaurantId,
      "ownerHideRequest.status": "pending",
    }),
  ]);

  const customerOrderCounts = new Map<string, number>();
  for (const order of orders) {
    const key = getCustomerKey(order);
    if (key === "unknown") continue;
    customerOrderCounts.set(key, (customerOrderCounts.get(key) ?? 0) + 1);
  }

  const filteredOrders =
    params.customerTier === "new"
      ? orders.filter(
          (order) => (customerOrderCounts.get(getCustomerKey(order)) ?? 0) <= 1,
        )
      : params.customerTier === "repeat"
        ? orders.filter(
            (order) =>
              (customerOrderCounts.get(getCustomerKey(order)) ?? 0) > 1,
          )
        : orders;

  const preparationTimeMinutes =
    typeof details.discovery.preparationTimeMinutes === "number"
      ? details.discovery.preparationTimeMinutes
      : 30;
  const mappedOrders = filteredOrders.map((order) =>
    mapRestaurantOrderHistory(order, preparationTimeMinutes),
  );
  const deliveredOrders = filteredOrders.filter(
    (order) => order.status === "Delivered",
  );
  const cancelledOrders = filteredOrders.filter(
    (order) => order.status === "Cancelled",
  );
  const rejectedOrders = filteredOrders.filter(
    (order) => order.status === "Rejected",
  );
  const liveOrders = filteredOrders.filter((order) =>
    LIVE_ORDER_STATUSES.includes(String(order.status)),
  );
  const deliveredRevenue = deliveredOrders.reduce(
    (sum, order) => sum + numberValue(order.pricing?.total),
    0,
  );
  const hasBusinessFilter = Boolean(
    (params.paymentMethod && params.paymentMethod !== "all") ||
      (params.categoryId && params.categoryId !== "all") ||
      (params.itemId && params.itemId !== "all") ||
      (params.customerTier && params.customerTier !== "all") ||
      (params.status && params.status !== "all"),
  );
  const acceptanceSamples = mappedOrders.map((order) => order.acceptanceMinutes);
  const preparationSamples = mappedOrders.map(
    (order) => order.preparationMinutes,
  );
  const readyFromOrderSamples = mappedOrders.map((order) =>
    minutesBetween(
      order.createdAt ? new Date(order.createdAt) : null,
      order.readyAt ? new Date(order.readyAt) : null,
    ),
  );
  const pickupWaitSamples = mappedOrders.map((order) =>
    minutesBetween(
      order.readyAt ? new Date(order.readyAt) : null,
      order.pickedUpAt ? new Date(order.pickedUpAt) : null,
    ),
  );
  const deliverySamples = mappedOrders.map((order) =>
    minutesBetween(
      order.pickedUpAt ? new Date(order.pickedUpAt) : null,
      order.deliveredAt ? new Date(order.deliveredAt) : null,
    ),
  );
  const acceptedOrders = mappedOrders.filter(
    (order) => order.acceptanceMinutes !== null,
  );
  const preparedOrders = mappedOrders.filter(
    (order) => order.preparationMinutes !== null,
  );
  const slowestOrders = [...mappedOrders]
    .filter(
      (order) =>
        order.acceptanceMinutes !== null ||
        order.preparationMinutes !== null ||
        order.totalServiceMinutes !== null,
    )
    .sort(
      (left, right) =>
        (right.totalServiceMinutes ??
          right.preparationMinutes ??
          right.acceptanceMinutes ??
          0) -
        (left.totalServiceMinutes ??
          left.preparationMinutes ??
          left.acceptanceMinutes ??
          0),
    )
    .slice(0, 8);
  const topItems = groupTopItems(filteredOrders);
  const topCustomers = groupTopCustomers(filteredOrders);
  const repeatCustomers = Array.from(customerOrderCounts.values()).filter(
    (count) => count > 1,
  ).length;
  const newCustomers = Array.from(customerOrderCounts.values()).filter(
    (count) => count === 1,
  ).length;
  const heroItem = topItems[0] ?? null;
  const menuItemById = new Map(
    menuItems.map((item) => [objectIdString(item._id), item]),
  );
  const heroProduct = heroItem
    ? {
        ...heroItem,
        imageUrl: stringValue(menuItemById.get(heroItem.itemId)?.images?.[0]?.url),
        availability: stringValue(
          menuItemById.get(heroItem.itemId)?.availability,
          "unknown",
        ),
      }
    : null;
  const unavailableItems = menuItems
    .filter((item) => item.availability === "unavailable")
    .slice(0, 8)
    .map((item) => ({
      id: objectIdString(item._id),
      name: stringValue(item.name, "Menu item"),
      categoryId: objectIdString(item.categoryId),
      basePrice: numberValue(item.basePrice),
    }));
  const availabilityAlerts = await syncRestaurantAvailabilityAlerts({
    restaurantId: safeRestaurantId.toString(),
    restaurantName: details.name,
    isOnline: details.discovery.isOnline,
    activeOrderCount: activeAvailabilityOrders.length,
    activeOrderNumbers: activeAvailabilityOrders.map((order) =>
      stringValue(order.orderNumber),
    ),
    availability,
  });
  const availabilityWithAlerts = {
    ...availability,
    alerts: availabilityAlerts,
  };
  const deliveredOrderCountForSummary = hasBusinessFilter
    ? deliveredOrders.length
    : details.finance.windowDeliveredOrders;
  const grossRevenueForSummary = Math.round(
    hasBusinessFilter
      ? deliveredRevenue
      : details.finance.windowGrossDeliveredRevenue,
  );
  const netEarningsForSummary = Math.round(
    hasBusinessFilter ? deliveredRevenue : details.finance.windowNetEarnings,
  );
  const salesSummary = {
    orders: filteredOrders.length,
    liveOrders: liveOrders.length,
    deliveredOrders: deliveredOrderCountForSummary,
    cancelledOrders: cancelledOrders.length,
    rejectedOrders: rejectedOrders.length,
    grossRevenue: grossRevenueForSummary,
    netEarnings: netEarningsForSummary,
    averageOrderValue:
      deliveredOrderCountForSummary > 0
        ? Math.round(grossRevenueForSummary / deliveredOrderCountForSummary)
        : 0,
    cancellationRate: percentageRate(
      cancelledOrders.length + rejectedOrders.length,
      filteredOrders.length,
    ),
  };
  const performanceSummary = {
    preparationTargetMinutes: preparationTimeMinutes,
    ordersAnalyzed: mappedOrders.length,
    averageAcceptanceMinutes: averageMinutes(acceptanceSamples),
    medianAcceptanceMinutes: medianMinutes(acceptanceSamples),
    averagePreparationMinutes: averageMinutes(preparationSamples),
    medianPreparationMinutes: medianMinutes(preparationSamples),
    averageReadyFromOrderMinutes: averageMinutes(readyFromOrderSamples),
    averagePickupWaitMinutes: averageMinutes(pickupWaitSamples),
    averageDeliveryMinutes: averageMinutes(deliverySamples),
    acceptedWithin5MinutesRate: percentageRate(
      acceptedOrders.filter(
        (order) =>
          typeof order.acceptanceMinutes === "number" &&
          order.acceptanceMinutes <= 5,
      ).length,
      acceptedOrders.length,
    ),
    readyWithinEstimateRate: percentageRate(
      preparedOrders.filter(
        (order) =>
          typeof order.preparationMinutes === "number" &&
          order.preparationMinutes <= preparationTimeMinutes,
      ).length,
      preparedOrders.length,
    ),
    lateAcceptanceOrders: mappedOrders.filter(
      (order) =>
        typeof order.acceptanceMinutes === "number" &&
        order.acceptanceMinutes > 5,
    ).length,
    latePreparationOrders: mappedOrders.filter(
      (order) =>
        typeof order.preparationMinutes === "number" &&
        order.preparationMinutes > preparationTimeMinutes,
    ).length,
    slowestOrders,
  };
  const customerSummary = {
    totalCustomers: customerOrderCounts.size,
    repeatCustomers,
    newCustomers,
    repeatRate: percentageRate(repeatCustomers, customerOrderCounts.size),
  };
  const lateLiveOrders = liveOrders.filter((order) =>
    Boolean(getRestaurantOrderDelayState(order, preparationTimeMinutes)),
  ).length;
  const nextActions = buildRestaurantNextActions({
    restaurantId: safeRestaurantId.toString(),
    details,
    availability: availabilityWithAlerts,
    salesSummary,
    performanceSummary,
    customerSummary,
    heroProduct,
    lateLiveOrders,
    pendingMenuApprovalCount,
    pendingReviewHideRequestCount,
  });
  const benchmark = await buildRestaurantBenchmark({
    restaurantId: safeRestaurantId,
    intelligenceParams: params,
    currentOrders: summarizeBenchmarkOrders(filteredOrders, preparationTimeMinutes),
    currentAvailability: availabilityWithAlerts,
    currentRating: numberValue(details.averageRating),
    currentReviewCount: numberValue(details.reviewCount),
  });

  return {
    restaurant: details,
    filters: {
      preset: params.preset ?? "last30Days",
      from: params.from ?? "",
      to: params.to ?? "",
      status: params.status ?? "all",
      paymentMethod: params.paymentMethod ?? "all",
      categoryId: params.categoryId ?? "all",
      itemId: params.itemId ?? "all",
      customerTier: params.customerTier ?? "all",
    },
    sample: {
      matchingOrders: matchingCount,
      analyzedOrders: filteredOrders.length,
      loadedOrders: orders.length,
      maxLoadedOrders: MAX_RESTAURANT_INTELLIGENCE_ORDERS,
      truncated: matchingCount > orders.length,
    },
    health: {
      isOnline: details.discovery.isOnline,
      isVisible: details.discovery.isVisible,
      enforcementStatus: details.enforcement?.status ?? "active",
      profileCompletionPercentage: details.profileCompletionPercentage,
      openSupportCases:
        details.support.summary.open + details.support.summary.inProgress,
      lateLiveOrders,
      riskItems: [
        ...(details.discovery.isVisible
          ? []
          : ["Restaurant is hidden from customers"]),
        ...(details.discovery.isOnline
          ? []
          : ["Restaurant is currently offline"]),
        ...(details.menu.unavailableItems > 0
          ? [`${details.menu.unavailableItems} unavailable menu items`]
          : []),
        ...(details.support.summary.open + details.support.summary.inProgress >
        0
          ? [
              `${details.support.summary.open + details.support.summary.inProgress} open support cases`,
            ]
          : []),
      ],
    },
    actions: nextActions,
    benchmark,
    availability: availabilityWithAlerts,
    sales: {
      summary: salesSummary,
      trend: groupRestaurantTrend(filteredOrders),
      statusDistribution: groupStatusDistribution(filteredOrders),
      paymentMethods: summarizePaymentMethods(filteredOrders),
    },
    performance: performanceSummary,
    menu: {
      counts: details.menu,
      topItems,
      heroProduct,
      unavailableItems,
      categories: categories.map((category) => ({
        id: objectIdString(category._id),
        name: stringValue(category.name, "Category"),
        status: stringValue(category.status, "active"),
      })),
      items: menuItems.map((item) => ({
        id: objectIdString(item._id),
        name: stringValue(item.name, "Menu item"),
        categoryId: objectIdString(item.categoryId),
        basePrice: numberValue(item.basePrice),
        status: stringValue(item.status, "active"),
        availability: stringValue(item.availability, "available"),
        isPopular: item.isPopular === true,
      })),
    },
    customers: {
      ...customerSummary,
      topCustomers,
    },
    finance: details.finance,
    quality: {
      averageRating: details.averageRating,
      reviewCount: details.reviewCount,
      hiddenReviews: details.recentReviews.filter((review) => review.isHidden)
        .length,
      recentReviews: details.recentReviews,
      support: details.support,
    },
    operations: {
      openingHours: details.openingHours,
      recentOrders: mappedOrders.slice(0, 12),
      activityTimeline: details.activityTimeline,
      auditLogs: details.auditLogs,
    },
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
      serviceArea: 1,
    }).lean(),
  ]);
  if (!restaurant) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "RESTAURANT_NOT_FOUND",
      "Restaurant not found",
    );
  }
  assertServiceAreaSnapshotMatchesScope(restaurant.serviceArea, {
    zoneId: params.zoneId,
    districtId: params.districtId,
    code: "RESTAURANT_NOT_FOUND",
    message: "Restaurant not found",
  });
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
  const previousOnline = restaurant.runtime?.isOnline === true;
  const previousUpdatedAt = restaurant.updatedAt ?? new Date();
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
  if (
    params.status === "quality_hold" ||
    params.status === "temporarily_suspended" ||
    params.status === "permanently_disabled"
  ) {
    const activeOrders = await OrderModel.find({
      restaurantId: restaurant._id,
      status: { $in: LIVE_ORDER_STATUSES },
    })
      .select({ orderNumber: 1 })
      .lean();
    await syncRestaurantAvailabilitySession({
      restaurantId: restaurant.id,
      ownerId: objectIdString(restaurant.ownerId),
      isOnline: false,
      source: "admin",
      endReason: "enforcement",
      adminId: params.adminId,
      activeOrderCount: activeOrders.length,
      activeOrderNumbers: activeOrders.map((order) => stringValue(order.orderNumber)),
      fallbackStartedAt: previousOnline ? previousUpdatedAt : null,
    });
  }
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
  isSponsored?: boolean;
  // Admin-set custom marketing badge shown on this restaurant's customer card.
  customBadge?: {
    enabled?: boolean;
    label?: string;
  };
  customerNote?: {
    enabled?: boolean;
    label?: string;
    placeholder?: string;
  };
}) {
  const restaurant = await getRestaurantOrThrow(params.restaurantId);
  const currentCustomBadge = restaurant.discovery?.customBadge ?? {};
  restaurant.discovery = {
    ...(restaurant.discovery ?? {}),
    isFeatured: params.isFeatured,
    featuredSortOrder: params.isFeatured ? params.featuredPosition : null,
    // Sponsored is independent of featured: it only adds a disclosure badge to the
    // card. Preserve the existing value when a caller omits it.
    isSponsored:
      params.isSponsored === undefined
        ? restaurant.discovery?.isSponsored === true
        : params.isSponsored,
    // Custom badge: admin picks the label + whether it shows. Preserve on omit.
    customBadge:
      params.customBadge === undefined
        ? {
            enabled: currentCustomBadge.enabled === true,
            label: trimLimitedString(currentCustomBadge.label, "", 24),
          }
        : {
            enabled: params.customBadge.enabled === true,
            label: trimLimitedString(params.customBadge.label, "", 24),
          },
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
    isSponsored: restaurant.discovery?.isSponsored === true,
    customBadge: {
      enabled: restaurant.discovery?.customBadge?.enabled === true,
      label: trimLimitedString(restaurant.discovery?.customBadge?.label, "", 24),
    },
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

// Switch a restaurant between the commission model and the zero-commission markup model, and
// set the markup percentage. Markup is applied server-side to customer-facing menu prices; the
// owner always sees their real price. Flushes customer read caches so the new prices show up.
export async function updateAdminRestaurantPricingModel(params: {
  restaurantId: string;
  pricingModel: "commission" | "markup";
  platformMarkupPercent?: number;
  adminId?: string;
}) {
  const restaurant = await getRestaurantOrThrow(params.restaurantId);
  const commercial =
    (restaurant.commercial as any)?.toObject?.() ??
    restaurant.commercial ??
    {};
  const previousModel =
    commercial.pricingModel === "markup" ? "markup" : "commission";
  const previousPercent = numberValue(commercial.platformMarkupPercent, 0);
  const pricingModel =
    params.pricingModel === "markup" ? "markup" : "commission";
  // Only meaningful for markup; clamped to 0–100 and rounded to a whole percent.
  const platformMarkupPercent =
    pricingModel === "markup"
      ? Math.min(
          100,
          Math.max(0, Math.round(numberValue(params.platformMarkupPercent, 0))),
        )
      : 0;

  restaurant.set("commercial", {
    ...commercial,
    pricingModel,
    platformMarkupPercent,
  });
  await restaurant.save();
  invalidateOwnerFinanceCaches(restaurant.id);
  // Customer-visible: menu prices change → flush discovery/home/details/cart caches.
  invalidateCustomerRestaurantAvailabilityCaches();

  await createAdminAuditLog({
    adminId: params.adminId,
    entityType: "restaurant",
    entityId: restaurant.id,
    action: "pricing_model.updated",
    title: "Pricing model updated",
    description:
      pricingModel === "markup"
        ? `Switched to zero-commission markup at ${platformMarkupPercent}%.`
        : "Switched to the commission model.",
    metadata: {
      previousModel,
      previousPercent,
      pricingModel,
      platformMarkupPercent,
    },
  });

  return {
    id: restaurant.id,
    name: restaurant.name,
    pricingModel,
    platformMarkupPercent,
    updatedAt: serializeDate(restaurant.updatedAt),
  };
}

export async function updateAdminRestaurantMinimumOrder(params: {
  restaurantId: string;
  minimumOrderAmount: number | null;
  adminId?: string;
}) {
  const restaurant = await getRestaurantOrThrow(params.restaurantId);
  const commercial =
    (restaurant.commercial as any)?.toObject?.() ??
    restaurant.commercial ??
    {};
  const previous =
    typeof commercial.minimumOrderAmount === "number"
      ? commercial.minimumOrderAmount
      : null;
  // null = clear the override so the restaurant inherits the platform default.
  const next =
    typeof params.minimumOrderAmount === "number" &&
    Number.isFinite(params.minimumOrderAmount)
      ? Math.max(0, Math.round(params.minimumOrderAmount))
      : null;

  restaurant.set("commercial", { ...commercial, minimumOrderAmount: next });
  await restaurant.save();
  // Customer-visible (drives the cart minimum-order gate) → flush customer read caches.
  invalidateCustomerRestaurantAvailabilityCaches();

  await createAdminAuditLog({
    adminId: params.adminId,
    entityType: "restaurant",
    entityId: restaurant.id,
    action: "minimum_order.updated",
    title: "Minimum order updated",
    description:
      next === null
        ? "Minimum order override cleared — uses the platform default."
        : `Minimum order set to ৳${next}.`,
    metadata: { previous, minimumOrderAmount: next },
  });

  return {
    id: restaurant.id,
    name: restaurant.name,
    minimumOrderAmount: next,
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
    // External deliveries settle through their own off-platform flow (no commission, no
    // restaurant payout) — they must NEVER get a standard earning ledger entry. Excluding
    // them here mirrors the owner-side ensureRestaurantEarningLedgerEntries, and the
    // delete-orphans step below cleans up any external earning a previous run created.
    source: { $ne: "external" },
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
    // Real restaurant subtotal drives the ledger; markup orders are zero-commission.
    const grossAmount = getOrderRestaurantSubtotal(order) ?? 0;
    const commissionRate = isMarkupOrder(order)
      ? 0
      : resolveCommissionRateForDate(restaurant, deliveredAt);
    const discountCost = getOrderOwnerDiscountCost(order);
    const platformDiscountCost = getOrderPlatformDiscountCost(order);
    const commissionBase = grossAmount;
    const commission = Math.round(commissionBase * (commissionRate / 100));
    // Total delivery the platform earns = base fee + urgent surcharge.
    const deliveryCost =
      numberValue(order.pricing?.deliveryFee) +
      numberValue(order.pricing?.urgentDeliveryFee);
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
  statementReviewed?: boolean;
  statementChecksum?: string;
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
  const statementReview =
    params.status === "completed"
      ? await assertAdminPayoutBatchStatementReview({
          payoutId: params.payoutId,
          statementReviewed: params.statementReviewed,
          statementChecksum: params.statementChecksum,
          adminId: params.adminId,
        })
      : null;
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
      if (statementReview) payoutBatch.statementReview = statementReview;
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
  const previousOnline = restaurant.runtime?.isOnline === true;
  const previousUpdatedAt = restaurant.updatedAt ?? new Date();
  const orderCount = await OrderModel.countDocuments({
    restaurantId: restaurant._id,
  });

  if (orderCount > 0) {
    const activeOrders = await OrderModel.find({
      restaurantId: restaurant._id,
      status: { $in: LIVE_ORDER_STATUSES },
    })
      .select({ orderNumber: 1 })
      .lean();
    restaurant.runtime = {
      ...(restaurant.runtime ?? {}),
      isVisible: false,
      isOnline: false,
      currentOperationalStatus: "closed",
    };
    await restaurant.save();
    await syncRestaurantAvailabilitySession({
      restaurantId: restaurant.id,
      ownerId: objectIdString(restaurant.ownerId),
      isOnline: false,
      source: "admin",
      endReason: "restaurant_hidden",
      activeOrderCount: activeOrders.length,
      activeOrderNumbers: activeOrders.map((order) => stringValue(order.orderNumber)),
      fallbackStartedAt: previousOnline ? previousUpdatedAt : null,
    });

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
