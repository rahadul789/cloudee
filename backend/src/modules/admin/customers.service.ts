import mongoose from "mongoose";
import { StatusCodes } from "http-status-codes";

import { AppError } from "../../common/utils/app-error";
import {
  CustomerModel,
  CustomerRefreshTokenSessionModel,
} from "../customer/customer.model";
import { sendPushToCustomer } from "../customer/push.service";
import { RestaurantModel } from "../auth/auth.model";
import { ReviewModel } from "../owner/experience.model";
import { OrderModel } from "../owner/operational.model";
import {
  buildCustomerServiceAreaScopeFilter,
  buildOrderServiceAreaScopeFilter,
  buildRestaurantServiceAreaScopeFilter,
} from "../service-area/service-area.service";
import { AdminAuditLogModel, AdminModel } from "./admin.model";
import { AdminCustomerGroupModel } from "./customer-group.model";

const LIVE_ORDER_STATUSES = [
  "New",
  "Accepted",
  "Preparing",
  "ReadyForPickup",
  "PickedUp",
];

type CustomerListParams = {
  search?: string;
  status?: "all" | "active" | "suspended" | "locked";
  requestStatus?: "all" | "pending" | "cancelled" | "reviewed" | "completed" | "none";
  customerGroupKey?: string;
  zoneId?: string;
  districtId?: string;
  preset?: string;
  from?: string;
  to?: string;
  sortBy?: "newest" | "recentLogin" | "mostOrders" | "highestSpend";
  page?: number;
  pageSize?: number;
};

type CreateCustomerGroupParams = {
  name: string;
  description?: string;
  sourceFilter?: CustomerListParams;
  customerIds?: string[];
  adminId?: string;
};

type UpdateCustomerGroupParams = {
  groupId: string;
  name?: string;
  description?: string;
};

type UpdateCustomerGroupMembersParams = {
  groupId: string;
  customerIds: string[];
};

type CustomerOrdersParams = {
  preset?: string;
  from?: string;
  to?: string;
  restaurantId?: string;
  zoneId?: string;
  districtId?: string;
  status?: "all" | "live" | "delivered" | "cancelled";
  search?: string;
  sortBy?: "newest" | "oldest" | "highestValue";
  page?: number;
  pageSize?: number;
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

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
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

function objectIdValues(values: unknown[]) {
  return values
    .map((value) => {
      if (value instanceof mongoose.Types.ObjectId) return value;
      const stringId = objectIdString(value);
      return mongoose.Types.ObjectId.isValid(stringId)
        ? new mongoose.Types.ObjectId(stringId)
        : null;
    })
    .filter((value): value is mongoose.Types.ObjectId => Boolean(value));
}

function getCustomerOfferStatus(notification: Record<string, any>) {
  const expiresAt = notification.voucherExpiresAt
    ? new Date(notification.voucherExpiresAt)
    : null;
  if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) {
    return "expired";
  }
  return notification.personalOffer === true ? "active" : "inactive";
}

function mapCustomerNotificationSnapshot(notification: Record<string, any>) {
  return {
    id: objectIdString(notification._id),
    type: stringValue(notification.type),
    title: stringValue(notification.title),
    description: stringValue(notification.description),
    path: stringValue(notification.path),
    campaignId: stringValue(notification.campaignId),
    ctaLabel: stringValue(notification.ctaLabel),
    ctaPath: stringValue(notification.ctaPath),
    contentType: stringValue(notification.contentType, "text"),
    imageUrl: stringValue(notification.imageUrl),
    voucherId: stringValue(notification.voucherId),
    voucherCode: stringValue(notification.voucherCode),
    voucherLabel: stringValue(notification.voucherLabel),
    voucherExpiresAt: serializeDate(notification.voucherExpiresAt),
    voucherMinOrder:
      typeof notification.voucherMinOrder === "number" ? notification.voucherMinOrder : null,
    personalOffer: notification.personalOffer === true,
    offerStatus: getCustomerOfferStatus(notification),
    isRead: notification.isRead === true,
    createdAt: serializeDate(notification.createdAt),
  };
}

function toObjectIdOrThrow(value: string, label: string) {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new AppError(StatusCodes.BAD_REQUEST, "INVALID_ID", `${label} id is invalid`);
  }

  return new mongoose.Types.ObjectId(value);
}

function buildDateWindow(params?: { preset?: string; from?: string; to?: string }) {
  const now = new Date();
  let from: Date | null = null;
  let to: Date | null = null;
  const preset = params?.preset ?? "last7Days";

  if (preset === "lifetime") {
    return { preset, from: null, to: null, match: null };
  }

  if (preset === "today") {
    from = new Date(now);
    from.setHours(0, 0, 0, 0);
    to = new Date(now);
    to.setHours(23, 59, 59, 999);
  } else if (preset === "yesterday") {
    from = new Date(now);
    from.setDate(from.getDate() - 1);
    from.setHours(0, 0, 0, 0);
    to = new Date(from);
    to.setHours(23, 59, 59, 999);
  } else if (preset === "last30Days") {
    from = new Date(now);
    from.setDate(from.getDate() - 30);
  } else if (preset === "last90Days") {
    from = new Date(now);
    from.setDate(from.getDate() - 90);
  } else if (preset === "thisWeek") {
    from = new Date(now);
    const day = from.getDay();
    const diff = from.getDate() - day + (day === 0 ? -6 : 1);
    from.setDate(diff);
    from.setHours(0, 0, 0, 0);
    to = new Date(from);
    to.setDate(from.getDate() + 6);
    to.setHours(23, 59, 59, 999);
  } else if (preset === "thisMonth") {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  } else if (preset === "lastMonth") {
    from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  } else if (preset === "custom") {
    from = params?.from ? new Date(params.from) : null;
    to = params?.to ? new Date(params.to) : null;
  } else {
    from = new Date(now);
    from.setDate(from.getDate() - 7);
  }

  const match: Record<string, Date> = {};
  if (from && !Number.isNaN(from.getTime())) match.$gte = from;
  if (to && !Number.isNaN(to.getTime())) match.$lte = to;

  return {
    preset,
    from: from && !Number.isNaN(from.getTime()) ? from : null,
    to: to && !Number.isNaN(to.getTime()) ? to : null,
    match: Object.keys(match).length ? match : null,
  };
}

function buildDateMatch(params?: { preset?: string; from?: string; to?: string }) {
  return buildDateWindow(params).match;
}

function buildCustomerQuery(params: CustomerListParams = {}) {
  const query: Record<string, unknown> = {};

  if (params.search?.trim()) {
    const search = params.search.trim();
    query.$or = [
      { fullName: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  if (params.status && params.status !== "all") query.status = params.status;

  if (params.requestStatus && params.requestStatus !== "all") {
    if (params.requestStatus === "none") {
      query.$and = [
        ...(Array.isArray(query.$and) ? query.$and : []),
        {
          $or: [
            { "accountRequest.type": null },
            { "accountRequest.type": { $exists: false } },
            { "accountRequest.status": null },
            { "accountRequest.status": { $exists: false } },
          ],
        },
      ];
    } else {
      query["accountRequest.status"] = params.requestStatus;
    }
  }

  return query;
}

function asRecordArray(value: unknown): Array<Record<string, any>> {
  return Array.isArray(value) ? (value as Array<Record<string, any>>) : [];
}

function addCustomerIdInFilter(query: Record<string, unknown>, ids: unknown[]) {
  const objectIds = objectIdValues(ids);
  const current = query._id as Record<string, unknown> | undefined;
  if (current && typeof current === "object" && Array.isArray(current.$in)) {
    const allowed = new Set(objectIds.map((id) => id.toString()));
    current.$in = objectIdValues(current.$in).filter((id) =>
      allowed.has(id.toString()),
    );
    query._id = current;
    return;
  }
  query._id =
    current && typeof current === "object"
      ? { ...current, $in: objectIds }
      : { $in: objectIds };
}

function addCustomerIdNinFilter(query: Record<string, unknown>, ids: unknown[]) {
  const objectIds = objectIdValues(ids);
  const current = query._id as Record<string, unknown> | undefined;
  query._id =
    current && typeof current === "object"
      ? { ...current, $nin: objectIds }
      : { $nin: objectIds };
}

async function getScopedCustomerObjectIds(params: {
  zoneId?: string;
  districtId?: string;
}) {
  const orderScopeFilter = buildOrderServiceAreaScopeFilter(params);
  const customerScopeFilter = buildCustomerServiceAreaScopeFilter(params);
  if (!Object.keys(orderScopeFilter).length && !Object.keys(customerScopeFilter).length) {
    return null;
  }
  const [orderCustomerIds, profileCustomerIds] = await Promise.all([
    Object.keys(orderScopeFilter).length
      ? OrderModel.distinct("customerId", {
          ...orderScopeFilter,
          customerId: { $type: "string", $ne: "" },
        })
      : [],
    Object.keys(customerScopeFilter).length
      ? CustomerModel.distinct("_id", {
          status: "active",
          ...customerScopeFilter,
        })
      : [],
  ]);
  return objectIdValues([...orderCustomerIds, ...profileCustomerIds]);
}

async function applyCustomerServiceAreaFilter(
  query: Record<string, unknown>,
  params: CustomerListParams,
) {
  const customerIds = await getScopedCustomerObjectIds(params);
  if (customerIds === null) return;
  addCustomerIdInFilter(query, customerIds);
}

async function applyCustomerGroupFilter(
  query: Record<string, unknown>,
  customerGroupKey?: string,
  params: CustomerListParams = {},
) {
  if (!customerGroupKey || customerGroupKey === "none") return;
  const orderScopeFilter = buildOrderServiceAreaScopeFilter(params);

  if (customerGroupKey.startsWith("manual:")) {
    const groupId = customerGroupKey.replace("manual:", "").trim();
    const group = mongoose.Types.ObjectId.isValid(groupId)
      ? await AdminCustomerGroupModel.findOne({
          _id: groupId,
          archivedAt: null,
        }).lean()
      : null;
    addCustomerIdInFilter(query, group?.customerIds ?? []);
    return;
  }

  if (customerGroupKey === "has_push_token") {
    query.pushTokens = {
      $elemMatch: {
        token: { $exists: true, $ne: "" },
        disabledAt: null,
      },
    };
    return;
  }

  if (customerGroupKey === "new_users") {
    addCustomerIdNinFilter(query, await OrderModel.distinct("customerId", orderScopeFilter));
    return;
  }

  if (customerGroupKey === "returning_users") {
    addCustomerIdInFilter(query, await OrderModel.distinct("customerId", orderScopeFilter));
    return;
  }

  if (customerGroupKey === "ordered_last_30_days") {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    addCustomerIdInFilter(
      query,
      await OrderModel.distinct("customerId", {
        ...orderScopeFilter,
        createdAt: { $gte: since },
      }),
    );
    return;
  }

  if (customerGroupKey === "inactive_30_days") {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    addCustomerIdNinFilter(
      query,
      await OrderModel.distinct("customerId", {
        ...orderScopeFilter,
        createdAt: { $gte: since },
      }),
    );
    return;
  }

  if (customerGroupKey === "high_value_customers") {
    const rows = await OrderModel.aggregate<{ _id: string; totalSpend: number }>([
      { $match: { status: "Delivered", ...orderScopeFilter } },
      {
        $group: {
          _id: "$customerId",
          totalSpend: {
            $sum: { $toDouble: { $ifNull: ["$pricing.total", 0] } },
          },
        },
      },
      { $match: { totalSpend: { $gte: 1000 } } },
      { $limit: 5000 },
    ]);
    addCustomerIdInFilter(query, rows.map((row) => row._id));
  }
}

function mapCustomerGroup(group: Record<string, any>) {
  return {
    id: objectIdString(group._id),
    name: stringValue(group.name),
    description: stringValue(group.description),
    memberCount: Array.isArray(group.customerIds) ? group.customerIds.length : 0,
    sourceFilter: group.sourceFilter ?? {},
    createdAt: serializeDate(group.createdAt),
    updatedAt: serializeDate(group.updatedAt),
  };
}

function mapCustomerServiceAreaSnapshot(serviceArea?: Record<string, any> | null) {
  const zoneId = stringValue(serviceArea?.zoneId);
  const districtId = stringValue(serviceArea?.districtId);
  if (!zoneId && !districtId) return null;
  return {
    districtId,
    districtName: stringValue(serviceArea?.districtName),
    zoneId,
    zoneSlug: stringValue(serviceArea?.zoneSlug),
    zoneName: stringValue(serviceArea?.zoneName),
    radiusKm: typeof serviceArea?.radiusKm === "number" ? serviceArea.radiusKm : null,
  };
}

function mapCustomerLastKnownLocation(location?: Record<string, any> | null) {
  const latitude = numberValue(location?.latitude, Number.NaN);
  const longitude = numberValue(location?.longitude, Number.NaN);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    label: stringValue(location?.label),
    address: stringValue(location?.address),
    addressDetails: stringValue(location?.addressDetails),
    latitude,
    longitude,
    source: stringValue(location?.source, "manual"),
    updatedAt: serializeDate(location?.updatedAt),
  };
}

function buildCustomerSort(sortBy?: CustomerListParams["sortBy"]): Record<string, 1 | -1> {
  if (sortBy === "recentLogin") return { lastLoginAt: -1, createdAt: -1 };
  if (sortBy === "mostOrders") return { totalOrders: -1, createdAt: -1 };
  if (sortBy === "highestSpend") return { deliveredSpend: -1, createdAt: -1 };
  return { createdAt: -1 };
}

function mapCustomerSummary(customer: Record<string, any>) {
  const activePushTokens = Array.isArray(customer.pushTokens)
    ? customer.pushTokens.filter((token: Record<string, unknown>) => !token.disabledAt).length
    : 0;
  const unreadNotifications = Array.isArray(customer.notifications)
    ? customer.notifications.filter((item: Record<string, unknown>) => item.isRead !== true).length
    : 0;

  return {
    id: objectIdString(customer._id),
    fullName: stringValue(customer.fullName, "Customer"),
    phone: stringValue(customer.phone),
    email: stringValue(customer.email),
    status: stringValue(customer.status, "active"),
    authProviders: Array.isArray(customer.authProviders) ? customer.authProviders : [],
    lastLoginAt: serializeDate(customer.lastLoginAt),
    createdAt: serializeDate(customer.createdAt),
    updatedAt: serializeDate(customer.updatedAt),
    savedLocationsCount: Array.isArray(customer.savedLocations)
      ? customer.savedLocations.length
      : 0,
    serviceArea: mapCustomerServiceAreaSnapshot(customer.serviceArea),
    lastKnownLocation: mapCustomerLastKnownLocation(customer.lastKnownLocation),
    hasPushToken: activePushTokens > 0,
    unreadNotifications,
    requestStatus: customer.accountRequest?.status ?? null,
    requestType: customer.accountRequest?.type ?? null,
    requestRequestedAt: serializeDate(customer.accountRequest?.requestedAt),
    totalOrders: numberValue(customer.totalOrders),
    liveOrders: numberValue(customer.liveOrders),
    deliveredOrders: numberValue(customer.deliveredOrders),
    deliveredSpend: numberValue(customer.deliveredSpend),
    lastOrderAt: serializeDate(customer.lastOrderAt),
  };
}

function buildChartDateMatch(dateWindow: ReturnType<typeof buildDateWindow>) {
  if (dateWindow.match) return dateWindow.match;
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { $gte: from };
}

async function buildCustomerBehaviorSummary(
  params: CustomerListParams,
  customerQuery: Record<string, unknown>,
) {
  const dateWindow = buildDateWindow(params);
  const orderScopeFilter = buildOrderServiceAreaScopeFilter(params);
  const scopedCustomers = await CustomerModel.find(customerQuery, { _id: 1 })
    .limit(50000)
    .lean();
  const customerIdStrings = scopedCustomers.map((customer) =>
    objectIdString(customer._id),
  );
  const customerIdMatch = customerIdStrings.length
    ? { $in: customerIdStrings }
    : { $in: ["__no_matching_customers__"] };
  const orderDateFilter = dateWindow.match ? { createdAt: dateWindow.match } : {};
  const orderMatch: Record<string, unknown> = {
    ...orderScopeFilter,
    ...orderDateFilter,
    status: "Delivered",
    customerId: customerIdMatch,
  };
  const chartDateMatch = buildChartDateMatch(dateWindow);
  const chartOrderMatch: Record<string, unknown> = {
    ...orderScopeFilter,
    createdAt: chartDateMatch,
    status: "Delivered",
    customerId: customerIdMatch,
  };
  const newCustomerQuery: Record<string, unknown> = { ...customerQuery };
  if (dateWindow.match) newCustomerQuery.createdAt = dateWindow.match;
  const chartNewCustomerQuery: Record<string, unknown> = {
    ...customerQuery,
    createdAt: chartDateMatch,
  };

  const [
    newCustomers,
    orderingRows,
    repeatRows,
    firstTimeRows,
    orderTrendRows,
    newTrendRows,
  ] = await Promise.all([
    CustomerModel.countDocuments(newCustomerQuery),
    OrderModel.aggregate<{ _id: string }>([
      { $match: orderMatch },
      { $group: { _id: "$customerId" } },
    ]),
    OrderModel.aggregate<{ _id: string; orders: number; spend: number }>([
      { $match: orderMatch },
      {
        $group: {
          _id: "$customerId",
          orders: { $sum: 1 },
          spend: { $sum: { $ifNull: ["$pricing.total", 0] } },
        },
      },
      { $match: { orders: { $gte: 2 } } },
    ]),
    OrderModel.aggregate<{ _id: string; firstDeliveredAt: Date }>([
      {
        $match: {
          ...orderScopeFilter,
          status: "Delivered",
          customerId: customerIdMatch,
        },
      },
      { $group: { _id: "$customerId", firstDeliveredAt: { $min: "$createdAt" } } },
      ...(dateWindow.match ? [{ $match: { firstDeliveredAt: dateWindow.match } }] : []),
    ]),
    OrderModel.aggregate<{
      _id: string;
      orders: number;
      orderingCustomers: number;
      repeatCustomers: number;
    }>([
      { $match: chartOrderMatch },
      {
        $group: {
          _id: {
            day: {
              $dateToString: {
                date: "$createdAt",
                format: "%Y-%m-%d",
                timezone: "Asia/Dhaka",
              },
            },
            customerId: "$customerId",
          },
          orders: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: "$_id.day",
          orders: { $sum: "$orders" },
          orderingCustomers: { $sum: 1 },
          repeatCustomers: {
            $sum: { $cond: [{ $gte: ["$orders", 2] }, 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 120 },
    ]),
    CustomerModel.aggregate<{ _id: string; newCustomers: number }>([
      { $match: chartNewCustomerQuery },
      {
        $group: {
          _id: {
            $dateToString: {
              date: "$createdAt",
              format: "%Y-%m-%d",
              timezone: "Asia/Dhaka",
            },
          },
          newCustomers: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 120 },
    ]),
  ]);

  const trendByDate = new Map<
    string,
    {
      date: string;
      orders: number;
      orderingCustomers: number;
      repeatCustomers: number;
      newCustomers: number;
    }
  >();
  orderTrendRows.forEach((row) => {
    trendByDate.set(row._id, {
      date: row._id,
      orders: numberValue(row.orders),
      orderingCustomers: numberValue(row.orderingCustomers),
      repeatCustomers: numberValue(row.repeatCustomers),
      newCustomers: 0,
    });
  });
  newTrendRows.forEach((row) => {
    const existing =
      trendByDate.get(row._id) ?? {
        date: row._id,
        orders: 0,
        orderingCustomers: 0,
        repeatCustomers: 0,
        newCustomers: 0,
      };
    existing.newCustomers = numberValue(row.newCustomers);
    trendByDate.set(row._id, existing);
  });

  const orderingCustomers = orderingRows.length;
  const repeatCustomers = repeatRows.length;

  return {
    preset: dateWindow.preset,
    from: serializeDate(dateWindow.from),
    to: serializeDate(dateWindow.to),
    newCustomers,
    orderingCustomers,
    repeatCustomers,
    firstTimeOrderingCustomers: firstTimeRows.length,
    repeatRate:
      orderingCustomers > 0
        ? Math.round((repeatCustomers / orderingCustomers) * 1000) / 10
        : 0,
    trend: Array.from(trendByDate.values()).sort((left, right) =>
      left.date.localeCompare(right.date),
    ),
  };
}

async function createAdminAuditLog(params: {
  adminId?: string;
  customerId: string;
  action: string;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
}) {
  const admin = params.adminId ? await AdminModel.findById(params.adminId).lean() : null;

  await AdminAuditLogModel.create({
    actorAdminId: params.adminId ?? "",
    actorName: stringValue(admin?.fullName, "Admin"),
    actorRole: stringValue(admin?.role, "admin"),
    entityType: "customer",
    entityId: params.customerId,
    action: params.action,
    title: params.title,
    description: params.description ?? "",
    metadata: params.metadata ?? {},
  });
}

async function getCustomerOrThrow(customerId: string) {
  const safeCustomerId = toObjectIdOrThrow(customerId, "Customer");
  const customer = await CustomerModel.findById(safeCustomerId);

  if (!customer) {
    throw new AppError(StatusCodes.NOT_FOUND, "CUSTOMER_NOT_FOUND", "Customer not found");
  }

  return customer;
}

export async function listAdminCustomers(params: CustomerListParams = {}) {
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const query = buildCustomerQuery(params);
  await applyCustomerServiceAreaFilter(query, params);
  await applyCustomerGroupFilter(query, params.customerGroupKey, params);
  const sort = buildCustomerSort(params.sortBy);
  const [items, total, summaryRows, behavior] = await Promise.all([
    CustomerModel.aggregate<Record<string, any>>([
      { $match: query },
      { $addFields: { customerIdString: { $toString: "$_id" } } },
      {
        $lookup: {
          from: OrderModel.collection.name,
          localField: "customerIdString",
          foreignField: "customerId",
          as: "orders",
        },
      },
      {
        $addFields: {
          totalOrders: { $size: "$orders" },
          lastOrderAt: { $max: "$orders.createdAt" },
          liveOrders: {
            $size: {
              $filter: {
                input: "$orders",
                as: "order",
                cond: { $in: ["$$order.status", LIVE_ORDER_STATUSES] },
              },
            },
          },
          deliveredOrders: {
            $size: {
              $filter: {
                input: "$orders",
                as: "order",
                cond: { $eq: ["$$order.status", "Delivered"] },
              },
            },
          },
          deliveredSpend: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: "$orders",
                    as: "order",
                    cond: { $eq: ["$$order.status", "Delivered"] },
                  },
                },
                as: "order",
                in: { $ifNull: ["$$order.pricing.total", 0] },
              },
            },
          },
        },
      },
      { $sort: sort },
      { $skip: (page - 1) * pageSize },
      { $limit: pageSize },
      { $project: { orders: 0, customerIdString: 0 } },
    ]),
    CustomerModel.countDocuments(query),
    CustomerModel.aggregate<{
      _id: null;
      total: number;
      active: number;
      suspended: number;
      locked: number;
      pendingRequests: number;
    }>([
      { $match: query },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
          suspended: { $sum: { $cond: [{ $eq: ["$status", "suspended"] }, 1, 0] } },
          locked: { $sum: { $cond: [{ $eq: ["$status", "locked"] }, 1, 0] } },
          pendingRequests: {
            $sum: { $cond: [{ $eq: ["$accountRequest.status", "pending"] }, 1, 0] },
          },
        },
      },
    ]),
    buildCustomerBehaviorSummary(params, query),
  ]);
  const summary = summaryRows[0] ?? {
    total: 0,
    active: 0,
    suspended: 0,
    locked: 0,
    pendingRequests: 0,
  };

  return {
    items: items.map(mapCustomerSummary),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    summary: { ...summary, behavior },
  };
}

export async function listAdminCustomerGroups(params: Pick<CustomerListParams, "zoneId" | "districtId"> = {}) {
  const query: Record<string, unknown> = { archivedAt: null };
  if (params.zoneId?.trim()) {
    query["sourceFilter.zoneId"] = params.zoneId.trim();
  } else if (params.districtId?.trim()) {
    query["sourceFilter.districtId"] = params.districtId.trim();
  }
  const groups = await AdminCustomerGroupModel.find(query)
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  return {
    items: groups.map(mapCustomerGroup),
    total: groups.length,
  };
}

async function resolveCustomerIdsForGroup(params: CustomerListParams = {}) {
  const query = buildCustomerQuery(params);
  await applyCustomerServiceAreaFilter(query, params);
  await applyCustomerGroupFilter(query, params.customerGroupKey, params);
  const customers = await CustomerModel.find(query, { _id: 1 })
    .limit(5000)
    .lean();
  return customers.map((customer) => customer._id);
}

export async function createAdminCustomerGroup(params: CreateCustomerGroupParams) {
  const name = params.name.trim();
  if (name.length < 2) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "INVALID_GROUP_NAME",
      "Group name is required",
    );
  }

  const customerIds = params.customerIds?.length
    ? objectIdValues(params.customerIds)
    : await resolveCustomerIdsForGroup(params.sourceFilter ?? {});

  if (!customerIds.length) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "EMPTY_CUSTOMER_GROUP",
      "No customers match this group",
    );
  }

  const group = await AdminCustomerGroupModel.create({
    name,
    description: params.description?.trim() ?? "",
    customerIds,
    sourceFilter: params.sourceFilter ?? {},
    createdByAdminId: params.adminId ?? "",
  });

  return mapCustomerGroup(group.toObject());
}

export async function updateAdminCustomerGroup(params: UpdateCustomerGroupParams) {
  const groupId = toObjectIdOrThrow(params.groupId, "Customer group");
  const updates: Record<string, unknown> = {};

  if (params.name !== undefined) {
    const name = params.name.trim();
    if (name.length < 2) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "INVALID_GROUP_NAME",
        "Group name is required",
      );
    }
    updates.name = name;
  }

  if (params.description !== undefined) {
    updates.description = params.description.trim();
  }

  const group = await AdminCustomerGroupModel.findOneAndUpdate(
    { _id: groupId, archivedAt: null },
    { $set: updates },
    { new: true },
  ).lean();

  if (!group) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "CUSTOMER_GROUP_NOT_FOUND",
      "Customer group not found",
    );
  }

  return mapCustomerGroup(group);
}

export async function archiveAdminCustomerGroup(groupId: string) {
  const safeGroupId = toObjectIdOrThrow(groupId, "Customer group");
  const group = await AdminCustomerGroupModel.findOneAndUpdate(
    { _id: safeGroupId, archivedAt: null },
    { $set: { archivedAt: new Date() } },
    { new: true },
  ).lean();

  if (!group) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "CUSTOMER_GROUP_NOT_FOUND",
      "Customer group not found",
    );
  }

  return { deleted: true, group: mapCustomerGroup(group) };
}

export async function addAdminCustomerGroupMembers(
  params: UpdateCustomerGroupMembersParams,
) {
  const groupId = toObjectIdOrThrow(params.groupId, "Customer group");
  const customerIds = objectIdValues(params.customerIds);

  if (!customerIds.length) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "CUSTOMER_GROUP_MEMBERS_REQUIRED",
      "Choose at least one customer",
    );
  }

  const groupBeforeUpdate = await AdminCustomerGroupModel.findOne({
    _id: groupId,
    archivedAt: null,
  }).lean();
  if (!groupBeforeUpdate) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "CUSTOMER_GROUP_NOT_FOUND",
      "Customer group not found",
    );
  }
  const memberQuery: Record<string, unknown> = { _id: { $in: customerIds } };
  const groupScope = (groupBeforeUpdate.sourceFilter ?? {}) as CustomerListParams;
  await applyCustomerServiceAreaFilter(memberQuery, groupScope);

  const existingCustomers = await CustomerModel.find(
    memberQuery,
    { _id: 1 },
  ).lean();
  const existingIds = existingCustomers.map((customer) => customer._id);

  if (!existingIds.length) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "CUSTOMER_GROUP_MEMBERS_NOT_FOUND",
      "Selected customers were not found",
    );
  }

  const group = await AdminCustomerGroupModel.findOneAndUpdate(
    { _id: groupId, archivedAt: null },
    { $addToSet: { customerIds: { $each: existingIds } } },
    { new: true },
  ).lean();

  if (!group) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "CUSTOMER_GROUP_NOT_FOUND",
      "Customer group not found",
    );
  }

  return mapCustomerGroup(group);
}

export async function removeAdminCustomerGroupMember(params: {
  groupId: string;
  customerId: string;
}) {
  const groupId = toObjectIdOrThrow(params.groupId, "Customer group");
  const customerId = toObjectIdOrThrow(params.customerId, "Customer");

  const group = await AdminCustomerGroupModel.findOneAndUpdate(
    { _id: groupId, archivedAt: null },
    { $pull: { customerIds: customerId } },
    { new: true },
  ).lean();

  if (!group) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "CUSTOMER_GROUP_NOT_FOUND",
      "Customer group not found",
    );
  }

  return mapCustomerGroup(group);
}

export async function getAdminCustomerDetails(
  customerId: string,
  params?: { preset?: string; from?: string; to?: string; zoneId?: string; districtId?: string },
) {
  const safeCustomerId = toObjectIdOrThrow(customerId, "Customer");
  const customer = await CustomerModel.findById(safeCustomerId).lean();

  if (!customer) {
    throw new AppError(StatusCodes.NOT_FOUND, "CUSTOMER_NOT_FOUND", "Customer not found");
  }

  const customerIdString = safeCustomerId.toString();
  const dateMatch = buildDateMatch(params);
  const serviceAreaFilter = buildOrderServiceAreaScopeFilter(params ?? {});
  const restaurantServiceAreaFilter = buildRestaurantServiceAreaScopeFilter(params ?? {});
  const scopedReviewRestaurantIds = Object.keys(restaurantServiceAreaFilter).length
    ? await RestaurantModel.distinct("_id", restaurantServiceAreaFilter)
    : null;
  const orderCustomerMatch: Record<string, unknown> = {
    ...serviceAreaFilter,
    customerId: customerIdString,
  };
  const reviewCustomerMatch: Record<string, unknown> = { customerId: customerIdString };
  if (scopedReviewRestaurantIds) {
    reviewCustomerMatch.restaurantId = { $in: scopedReviewRestaurantIds };
  }
  const windowMatch: Record<string, unknown> = { ...orderCustomerMatch };
  if (dateMatch) windowMatch.createdAt = dateMatch;

  const [
    lifetimeRows,
    windowRows,
    reviewRows,
    topRestaurants,
    orderRestaurants,
    recentOrders,
    recentReviews,
    auditLogs,
  ] = await Promise.all([
    OrderModel.aggregate<Record<string, any>>([
      { $match: orderCustomerMatch },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          liveOrders: {
            $sum: { $cond: [{ $in: ["$status", LIVE_ORDER_STATUSES] }, 1, 0] },
          },
          deliveredOrders: { $sum: { $cond: [{ $eq: ["$status", "Delivered"] }, 1, 0] } },
          deliveredSpend: {
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
    OrderModel.aggregate<Record<string, any>>([
      { $match: windowMatch },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          liveOrders: {
            $sum: { $cond: [{ $in: ["$status", LIVE_ORDER_STATUSES] }, 1, 0] },
          },
          deliveredOrders: { $sum: { $cond: [{ $eq: ["$status", "Delivered"] }, 1, 0] } },
          deliveredSpend: {
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
    ReviewModel.aggregate<{ _id: null; reviewsGiven: number; averageReviewRating: number }>([
      { $match: orderCustomerMatch },
      {
        $group: {
          _id: null,
          reviewsGiven: { $sum: 1 },
          averageReviewRating: { $avg: "$rating" },
        },
      },
    ]),
    OrderModel.aggregate<Record<string, any>>([
      { $match: orderCustomerMatch },
      {
        $group: {
          _id: "$restaurantId",
          orders: { $sum: 1 },
          deliveredOrders: { $sum: { $cond: [{ $eq: ["$status", "Delivered"] }, 1, 0] } },
          spend: {
            $sum: {
              $cond: [
                { $eq: ["$status", "Delivered"] },
                { $ifNull: ["$pricing.total", 0] },
                0,
              ],
            },
          },
          lastOrderedAt: { $max: "$createdAt" },
        },
      },
      { $sort: { spend: -1, orders: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: RestaurantModel.collection.name,
          localField: "_id",
          foreignField: "_id",
          as: "restaurantDocs",
        },
      },
      { $addFields: { restaurant: { $arrayElemAt: ["$restaurantDocs", 0] } } },
    ]),
    OrderModel.aggregate<Record<string, any>>([
      { $match: orderCustomerMatch },
      { $group: { _id: "$restaurantId", restaurantName: { $first: "$restaurantSnapshot.name" } } },
      {
        $lookup: {
          from: RestaurantModel.collection.name,
          localField: "_id",
          foreignField: "_id",
          as: "restaurantDocs",
        },
      },
      { $addFields: { restaurant: { $arrayElemAt: ["$restaurantDocs", 0] } } },
      { $sort: { "restaurant.name": 1 } },
    ]),
    OrderModel.aggregate<Record<string, any>>([
      { $match: reviewCustomerMatch },
      { $sort: { createdAt: -1 } },
      { $limit: 8 },
      {
        $lookup: {
          from: RestaurantModel.collection.name,
          localField: "restaurantId",
          foreignField: "_id",
          as: "restaurantDocs",
        },
      },
      { $addFields: { restaurant: { $arrayElemAt: ["$restaurantDocs", 0] } } },
    ]),
    ReviewModel.aggregate<Record<string, any>>([
      { $match: reviewCustomerMatch },
      { $sort: { createdAt: -1 } },
      { $limit: 8 },
      {
        $lookup: {
          from: RestaurantModel.collection.name,
          localField: "restaurantId",
          foreignField: "_id",
          as: "restaurantDocs",
        },
      },
      { $addFields: { restaurant: { $arrayElemAt: ["$restaurantDocs", 0] } } },
    ]),
    AdminAuditLogModel.find({ entityType: "customer", entityId: customerIdString })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
  ]);

  const lifetime = lifetimeRows[0] ?? {
    totalOrders: 0,
    liveOrders: 0,
    deliveredOrders: 0,
    deliveredSpend: 0,
  };
  const overview = windowRows[0] ?? {
    totalOrders: 0,
    liveOrders: 0,
    deliveredOrders: 0,
    deliveredSpend: 0,
  };
  const reviewStats = reviewRows[0] ?? {
    reviewsGiven: 0,
    averageReviewRating: 0,
  };
  const customerSavedLocations = asRecordArray(customer.savedLocations);
  const customerNotifications = asRecordArray(customer.notifications);
  const personalOfferNotifications = customerNotifications
    .filter((notification) => notification.personalOffer === true)
    .sort((left, right) => {
      const leftTime = new Date(left.createdAt ?? 0).getTime();
      const rightTime = new Date(right.createdAt ?? 0).getTime();
      return rightTime - leftTime;
    })
    .slice(0, 30)
    .map(mapCustomerNotificationSnapshot);
  const customerPushTokens = asRecordArray(customer.pushTokens);
  const customerPreviousPhones = asRecordArray(customer.previousPhones);
  const accountRequestHistory = asRecordArray(customer.accountRequest?.history);

  return {
    ...mapCustomerSummary({
      ...customer,
      totalOrders: lifetime.totalOrders,
      liveOrders: lifetime.liveOrders,
      deliveredOrders: lifetime.deliveredOrders,
      deliveredSpend: lifetime.deliveredSpend,
    }),
    profileImageUrl: stringValue(customer.profileImage?.url),
    notificationSettings: {
      orderUpdates: customer.notificationSettings?.orderUpdates ?? true,
      restaurantStatus: customer.notificationSettings?.restaurantStatus ?? true,
      reviewReplies: customer.notificationSettings?.reviewReplies ?? true,
    },
    overview: {
      totalOrders: numberValue(overview.totalOrders),
      liveOrders: numberValue(overview.liveOrders),
      deliveredOrders: numberValue(overview.deliveredOrders),
      deliveredSpend: numberValue(overview.deliveredSpend),
      averageDeliveredValue:
        numberValue(overview.deliveredOrders) > 0
          ? Math.round(numberValue(overview.deliveredSpend) / numberValue(overview.deliveredOrders))
          : 0,
      reviewsGiven: numberValue(reviewStats.reviewsGiven),
      averageReviewRating: Number(numberValue(reviewStats.averageReviewRating).toFixed(1)),
    },
    lifetime: {
      totalOrders: numberValue(lifetime.totalOrders),
      liveOrders: numberValue(lifetime.liveOrders),
      deliveredOrders: numberValue(lifetime.deliveredOrders),
      deliveredSpend: numberValue(lifetime.deliveredSpend),
      averageDeliveredValue:
        numberValue(lifetime.deliveredOrders) > 0
          ? Math.round(numberValue(lifetime.deliveredSpend) / numberValue(lifetime.deliveredOrders))
          : 0,
    },
    account: {
      savedLocationsCount: customerSavedLocations.length,
      unreadNotifications: customerNotifications.filter((item) => item.isRead !== true).length,
      pushTokensCount: customerPushTokens.length,
      activePushTokensCount: customerPushTokens.filter((token) => !token.disabledAt).length,
      previousPhones: customerPreviousPhones.map((entry) => ({
        phone: stringValue(entry.phone),
        changedAt: serializeDate(entry.changedAt),
      })),
    },
    accountRequest: customer.accountRequest?.type
      ? {
          type: customer.accountRequest.type ?? null,
          status: customer.accountRequest.status ?? null,
          requestedAt: serializeDate(customer.accountRequest.requestedAt),
          reason: stringValue(customer.accountRequest.reason),
          reviewNote: stringValue(customer.accountRequest.reviewNote),
          reviewedByAdminName: stringValue(customer.accountRequest.reviewedByAdminName),
          reviewedAt: serializeDate(customer.accountRequest.reviewedAt),
          history: accountRequestHistory.map((entry) => ({
            action: stringValue(entry.action),
            note: stringValue(entry.note),
            actorName: stringValue(entry.actorName),
            createdAt: serializeDate(entry.createdAt),
          })),
        }
      : null,
    topRestaurants: topRestaurants.map((row) => ({
      restaurantId: objectIdString(row._id),
      restaurantName: stringValue(row.restaurant?.name, "Restaurant"),
      orders: numberValue(row.orders),
      deliveredOrders: numberValue(row.deliveredOrders),
      spend: numberValue(row.spend),
      lastOrderedAt: serializeDate(row.lastOrderedAt),
    })),
    orderRestaurants: orderRestaurants.map((row) => ({
      restaurantId: objectIdString(row._id),
      restaurantName: stringValue(row.restaurant?.name, stringValue(row.restaurantName, "Restaurant")),
    })),
    savedLocations: customerSavedLocations.map((location) => ({
      id: objectIdString(location._id),
      label: stringValue(location.label),
      address: stringValue(location.address),
      addressDetails: stringValue(location.addressDetails),
      isDefault: location.isDefault === true,
      serviceArea: mapCustomerServiceAreaSnapshot(location.serviceArea),
      lastUsedAt: serializeDate(location.lastUsedAt),
    })),
    devices: customerPushTokens.map((token) => ({
      expoPushToken: stringValue(token.expoPushToken),
      platform: stringValue(token.platform),
      appVersion: stringValue(token.appVersion),
      deviceId: stringValue(token.deviceId),
      lastSeenAt: serializeDate(token.lastSeenAt),
      disabledAt: serializeDate(token.disabledAt),
    })),
    recentNotifications: customerNotifications
      .slice(-8)
      .reverse()
      .map(mapCustomerNotificationSnapshot),
    personalOffers: personalOfferNotifications,
    recentOrders: recentOrders.map((order) => ({
      id: objectIdString(order._id),
      orderNumber: stringValue(order.orderNumber),
      restaurantId: objectIdString(order.restaurantId),
      restaurantName: stringValue(order.restaurant?.name, "Restaurant"),
      status: stringValue(order.status),
      paymentMethod: stringValue(order.paymentMethod),
      paymentStatus: stringValue(order.paymentStatus),
      total: numberValue(order.pricing?.total),
      createdAt: serializeDate(order.createdAt),
      deliveredAt: serializeDate(order.timestamps?.Delivered ?? order.timestamps?.deliveredAt),
    })),
    recentReviews: recentReviews.map((review) => ({
      id: objectIdString(review._id),
      restaurantId: objectIdString(review.restaurantId),
      restaurantName: stringValue(review.restaurant?.name, "Restaurant"),
      rating: numberValue(review.rating),
      comment: stringValue(review.comment),
      ownerReplyMessage: stringValue(review.ownerReply?.message),
      moderationStatus: stringValue(review.moderationStatus, "visible"),
      isHidden: review.isHidden === true,
      hiddenAt: serializeDate(review.hiddenAt),
      hiddenReason: stringValue(review.hiddenReason),
      createdAt: serializeDate(review.createdAt),
    })),
    auditLogs: auditLogs.map((log) => ({
      id: objectIdString(log._id),
      action: stringValue(log.action),
      title: stringValue(log.title),
      description: stringValue(log.description),
      actorName: stringValue(log.actorName, "Admin"),
      actorRole: stringValue(log.actorRole, "admin"),
      createdAt: serializeDate(log.createdAt),
      metadata: log.metadata && typeof log.metadata === "object" ? log.metadata : {},
    })),
  };
}

export async function listAdminCustomerOrders(
  customerId: string,
  params: CustomerOrdersParams = {},
) {
  const safeCustomerId = toObjectIdOrThrow(customerId, "Customer");
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const query: Record<string, unknown> = {
    ...buildOrderServiceAreaScopeFilter(params),
    customerId: safeCustomerId.toString(),
  };
  const dateMatch = buildDateMatch(params);

  if (dateMatch) query.createdAt = dateMatch;
  if (params.restaurantId) {
    query.restaurantId = toObjectIdOrThrow(params.restaurantId, "Restaurant");
  }
  if (params.status === "live") query.status = { $in: LIVE_ORDER_STATUSES };
  if (params.status === "delivered") query.status = "Delivered";
  if (params.status === "cancelled") query.status = { $in: ["Cancelled", "Rejected"] };
  if (params.search?.trim()) {
    const search = params.search.trim();
    query.$or = [
      { orderNumber: { $regex: search, $options: "i" } },
      { "customerSnapshot.fullName": { $regex: search, $options: "i" } },
      { "customerSnapshot.phone": { $regex: search, $options: "i" } },
    ];
  }

  const sort: Record<string, 1 | -1> =
    params.sortBy === "oldest"
      ? { createdAt: 1 }
      : params.sortBy === "highestValue"
        ? { "pricing.total": -1, createdAt: -1 }
        : { createdAt: -1 };
  const [orders, total] = await Promise.all([
    OrderModel.aggregate<Record<string, any>>([
      { $match: query },
      { $sort: sort },
      { $skip: (page - 1) * pageSize },
      { $limit: pageSize },
      {
        $lookup: {
          from: RestaurantModel.collection.name,
          localField: "restaurantId",
          foreignField: "_id",
          as: "restaurantDocs",
        },
      },
      { $addFields: { restaurant: { $arrayElemAt: ["$restaurantDocs", 0] } } },
    ]),
    OrderModel.countDocuments(query),
  ]);

  return {
    items: orders.map((order) => ({
      id: objectIdString(order._id),
      orderNumber: stringValue(order.orderNumber),
      restaurantId: objectIdString(order.restaurantId),
      restaurantName: stringValue(order.restaurant?.name, "Restaurant"),
      status: stringValue(order.status),
      paymentMethod: stringValue(order.paymentMethod),
      paymentStatus: stringValue(order.paymentStatus),
      total: numberValue(order.pricing?.total),
      subtotal: numberValue(order.pricing?.subtotal),
      deliveryFee: numberValue(order.pricing?.deliveryFee),
      createdAt: serializeDate(order.createdAt),
      acceptedAt: serializeDate(order.timestamps?.Accepted ?? order.timestamps?.acceptedAt),
      readyAt: serializeDate(order.timestamps?.ReadyForPickup ?? order.timestamps?.readyForPickupAt),
      deliveredAt: serializeDate(order.timestamps?.Delivered ?? order.timestamps?.deliveredAt),
      cancelledAt: serializeDate(order.timestamps?.Cancelled ?? order.timestamps?.cancelledAt),
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function updateAdminCustomerStatus(params: {
  customerId: string;
  status: "active" | "suspended" | "locked";
  note?: string;
  adminId?: string;
}) {
  const customer = await getCustomerOrThrow(params.customerId);
  const previousStatus = customer.status;
  customer.status = params.status;
  await customer.save();
  let revokedSessions = 0;

  if (params.status !== "active" && params.status !== previousStatus) {
    const result = await CustomerRefreshTokenSessionModel.updateMany(
      {
        customerId: customer._id,
        revokedAt: null,
      },
      {
        $set: {
          revokedAt: new Date(),
        },
      }
    );
    revokedSessions = result.modifiedCount ?? result.matchedCount ?? 0;
  }

  await createAdminAuditLog({
    adminId: params.adminId,
    customerId: customer.id,
    action: "status.updated",
    title: "Customer status updated",
    description: `${customer.fullName || customer.phone || "Customer"} changed from ${previousStatus} to ${params.status}.`,
    metadata: {
      previousStatus,
      status: params.status,
      note: params.note?.trim() ?? "",
      revokedSessions,
    },
  });

  if (params.status !== previousStatus) {
    try {
      await sendPushToCustomer({
        customerId: customer.id,
        payload: {
          title: "Account status updated",
          body:
            params.status === "active"
              ? "Your account is active again."
              : params.status === "locked"
                ? "Your account has been locked. Contact support for help."
                : "Your account has been suspended. Contact support for help.",
          data: {
            type: "account_status",
            path: "/account",
          },
        },
      });
    } catch {
      // Admin moderation should not roll back because external push delivery is down.
    }
  }

  return {
    id: customer.id,
    fullName: customer.fullName || "Customer",
    status: customer.status,
    updatedAt: serializeDate(customer.updatedAt),
  };
}

export async function deleteAdminCustomerPersonalOffer(params: {
  customerId: string;
  notificationId: string;
  adminId?: string;
}) {
  const safeCustomerId = toObjectIdOrThrow(params.customerId, "Customer");
  const safeNotificationId = toObjectIdOrThrow(params.notificationId, "Offer");
  const customer = await CustomerModel.findById(safeCustomerId).lean();

  if (!customer) {
    throw new AppError(StatusCodes.NOT_FOUND, "CUSTOMER_NOT_FOUND", "Customer not found");
  }

  const notifications = asRecordArray(customer.notifications);
  const offer = notifications.find(
    (notification) => objectIdString(notification._id) === safeNotificationId.toString(),
  );

  if (!offer || offer.personalOffer !== true) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "CUSTOMER_OFFER_NOT_FOUND",
      "Personal offer was not found for this customer",
    );
  }

  await CustomerModel.updateOne(
    { _id: safeCustomerId },
    { $pull: { notifications: { _id: safeNotificationId } } },
  );

  const voucherId = stringValue(offer.voucherId);
  await createAdminAuditLog({
    adminId: params.adminId,
    customerId: safeCustomerId.toString(),
    action: "offer.deleted",
    title: "Personal offer removed",
    description: `${stringValue(offer.voucherLabel) || stringValue(offer.title) || "Personal offer"} removed from customer.`,
    metadata: {
      notificationId: safeNotificationId.toString(),
      voucherId,
      voucherCode: stringValue(offer.voucherCode),
    },
  });

  return {
    deleted: true,
    notificationId: safeNotificationId.toString(),
    voucherId,
  };
}
