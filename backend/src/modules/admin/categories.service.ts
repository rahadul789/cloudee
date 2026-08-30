import mongoose from "mongoose";
import { StatusCodes } from "http-status-codes";

import { AppError } from "../../common/utils/app-error";
import { AdminAuditLogModel, AdminModel } from "./admin.model";
import { RestaurantModel } from "../auth/auth.model";
import { CategoryModel, MenuItemModel, NotificationModel, OrderModel } from "../owner/operational.model";
import { buildRestaurantServiceAreaScopeFilter } from "../service-area/service-area.service";
import {
  restoreCategoryForRestaurant,
  restoreMenuItemForRestaurant,
} from "../owner/operational.service";

type CategoryStatus = "active" | "archived";
const BLOCKED_CATEGORY_KEYWORDS = ["fake", "test", "demo", "xxx", "adult"];

type ListAdminCategoriesParams = {
  search?: string;
  restaurantId?: string;
  zoneId?: string;
  districtId?: string;
  status?: "all" | CategoryStatus;
  health?: "all" | "empty" | "needs_review" | "duplicate" | "healthy";
  sortBy?: "newest" | "oldest" | "mostItems" | "emptyFirst" | "name";
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

function objectIdString(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof mongoose.Types.ObjectId) return value.toString();
  if (typeof value === "object" && "toString" in value) return String(value);
  return "";
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

function getReviewFlags(category: Record<string, any>) {
  const flags: Array<{
    key: "empty" | "no_active_items" | "duplicate_name" | "archived" | "blocked_keyword";
    label: string;
    tone: "warning" | "critical" | "neutral";
  }> = [];
  const totalItems = numberValue(category.totalItems);
  const activeItems = numberValue(category.activeItems);

  if (category.status === "archived") {
    flags.push({ key: "archived", label: "Archived", tone: "neutral" });
  }
  if (totalItems === 0) {
    flags.push({ key: "empty", label: "Empty category", tone: "critical" });
  } else if (activeItems === 0) {
    flags.push({ key: "no_active_items", label: "No active items", tone: "warning" });
  }
  if (numberValue(category.duplicateNameCount) > 1) {
    flags.push({ key: "duplicate_name", label: "Duplicate name", tone: "warning" });
  }
  const normalizedName = stringValue(category.name).toLowerCase();
  if (BLOCKED_CATEGORY_KEYWORDS.some((keyword) => normalizedName.includes(keyword))) {
    flags.push({ key: "blocked_keyword", label: "Blocked keyword", tone: "critical" });
  }

  return flags;
}

function mapCategory(row: Record<string, any>) {
  const restaurant = Array.isArray(row.restaurant) ? row.restaurant[0] : row.restaurant;
  const flags = getReviewFlags(row);

  return {
    id: objectIdString(row._id),
    restaurantId: objectIdString(row.restaurantId),
    restaurantName: stringValue(restaurant?.name, "Restaurant"),
    restaurantCity: stringValue(restaurant?.address?.city),
    restaurantAddress: stringValue(restaurant?.address?.address),
    restaurantVisible: Boolean(restaurant?.isVisible ?? true),
    ownerId: objectIdString(restaurant?.ownerId),
    name: stringValue(row.name, "Category"),
    slug: stringValue(row.slug),
    description: stringValue(row.description),
    status: stringValue(row.status, "active") as CategoryStatus,
    displayOrder: numberValue(row.displayOrder),
    totalItems: numberValue(row.totalItems),
    activeItems: numberValue(row.activeItems),
    unavailableItems: numberValue(row.unavailableItems),
    archivedItems: numberValue(row.archivedItems),
    duplicateNameCount: numberValue(row.duplicateNameCount, 1),
    adminModeration: {
      lastAction: stringValue(row.adminModeration?.lastAction),
      reason: stringValue(row.adminModeration?.reason),
      adminId: stringValue(row.adminModeration?.adminId),
      actedAt: serializeDate(row.adminModeration?.actedAt),
      notifyOwner: Boolean(row.adminModeration?.notifyOwner),
    },
    flags,
    needsReview: flags.some((flag) => flag.key !== "archived"),
    createdAt: serializeDate(row.createdAt),
    updatedAt: serializeDate(row.updatedAt),
  };
}

async function writeCategoryAudit(params: {
  adminId?: string;
  categoryId: string;
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
    entityType: "category",
    entityId: params.categoryId,
    action: params.action,
    title: params.title,
    description: params.description ?? "",
    metadata: params.metadata ?? {},
  });
}

function buildBasePipeline(params: ListAdminCategoriesParams) {
  const match: Record<string, unknown> = {};
  const restaurantScopeFilter = buildRestaurantServiceAreaScopeFilter(params);
  const restaurantScopeMatch = Object.fromEntries(
    Object.entries(restaurantScopeFilter).map(([key, value]) => [
      `restaurant.${key}`,
      value,
    ]),
  );
  // Soft-deleted (trashed) categories never appear in the normal admin listing — they live in the
  // dedicated deleted-menu oversight view instead.
  match.isDeleted = { $ne: true };
  if (params.status && params.status !== "all") match.status = params.status;
  if (params.restaurantId && params.restaurantId !== "all" && mongoose.Types.ObjectId.isValid(params.restaurantId)) {
    match.restaurantId = new mongoose.Types.ObjectId(params.restaurantId);
  }
  if (params.search?.trim()) {
    match.$or = [
      { name: { $regex: params.search.trim(), $options: "i" } },
      { description: { $regex: params.search.trim(), $options: "i" } },
      { slug: { $regex: params.search.trim(), $options: "i" } },
    ];
  }

  return [
    { $match: match },
    {
      $lookup: {
        from: "restaurants",
        localField: "restaurantId",
        foreignField: "_id",
        as: "restaurant",
      },
    },
    {
      $lookup: {
        from: "menuitems",
        let: { categoryId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$categoryId", "$$categoryId"] },
              isDeleted: { $ne: true },
            },
          },
          {
            $group: {
              _id: null,
              totalItems: { $sum: 1 },
              activeItems: {
                $sum: {
                  $cond: [
                    { $and: [{ $eq: ["$status", "active"] }, { $eq: ["$availability", "available"] }] },
                    1,
                    0,
                  ],
                },
              },
              unavailableItems: { $sum: { $cond: [{ $eq: ["$availability", "unavailable"] }, 1, 0] } },
              archivedItems: { $sum: { $cond: [{ $eq: ["$status", "archived"] }, 1, 0] } },
            },
          },
        ],
        as: "menuStats",
      },
    },
    {
      $lookup: {
        from: "categories",
        let: { restaurantId: "$restaurantId", categoryName: "$name" },
        pipeline: [
          {
            $match: {
              isDeleted: { $ne: true },
              $expr: {
                $and: [
                  { $eq: ["$restaurantId", "$$restaurantId"] },
                  { $eq: [{ $toLower: "$name" }, { $toLower: "$$categoryName" }] },
                ],
              },
            },
          },
          { $count: "count" },
        ],
        as: "duplicateStats",
      },
    },
    {
      $addFields: {
        restaurant: { $arrayElemAt: ["$restaurant", 0] },
        totalItems: { $ifNull: [{ $arrayElemAt: ["$menuStats.totalItems", 0] }, 0] },
        activeItems: { $ifNull: [{ $arrayElemAt: ["$menuStats.activeItems", 0] }, 0] },
        unavailableItems: { $ifNull: [{ $arrayElemAt: ["$menuStats.unavailableItems", 0] }, 0] },
        archivedItems: { $ifNull: [{ $arrayElemAt: ["$menuStats.archivedItems", 0] }, 0] },
        duplicateNameCount: { $ifNull: [{ $arrayElemAt: ["$duplicateStats.count", 0] }, 1] },
      },
    },
    ...(Object.keys(restaurantScopeMatch).length
      ? [{ $match: restaurantScopeMatch }]
      : []),
  ];
}

function getItemQuantity(item: Record<string, any>) {
  return numberValue(item.quantity ?? item.qty, 1);
}

function getItemTotal(item: Record<string, any>) {
  const directTotal = numberValue(item.lineTotal ?? item.total, NaN);
  if (Number.isFinite(directTotal)) return directTotal;
  const unitPrice = numberValue(item.unitPrice ?? item.totalPrice ?? item.price ?? item.basePrice);
  return unitPrice * getItemQuantity(item);
}

async function getCategorySalesAnalytics(params: {
  categoryId: string;
  menuItems: Array<Record<string, any>>;
}) {
  const itemIds = new Set(params.menuItems.map((item) => objectIdString(item._id)));
  const categoryId = params.categoryId;
  const itemIdList = [...itemIds].filter(Boolean);
  const itemSnapshotMatch = {
    $or: [
      { "itemsSnapshot.categoryId": categoryId },
      ...(itemIdList.length ? [{ "itemsSnapshot.itemId": { $in: itemIdList } }] : []),
    ],
  };
  const orderMatch = {
    status: "Delivered",
    $or: [
      { itemsSnapshot: { $elemMatch: { categoryId } } },
      ...(itemIdList.length ? [{ itemsSnapshot: { $elemMatch: { itemId: { $in: itemIdList } } } }] : []),
    ],
  };
  const [analyticsRows, recentOrderRows] = await Promise.all([
    OrderModel.aggregate<Record<string, any>>([
      { $match: orderMatch },
      { $unwind: "$itemsSnapshot" },
      { $match: itemSnapshotMatch },
      {
        $addFields: {
          matchedQuantity: { $ifNull: ["$itemsSnapshot.quantity", { $ifNull: ["$itemsSnapshot.qty", 1] }] },
          matchedRevenue: {
            $ifNull: [
              "$itemsSnapshot.lineTotal",
              {
                $multiply: [
                  {
                    $ifNull: [
                      "$itemsSnapshot.unitPrice",
                      {
                        $ifNull: [
                          "$itemsSnapshot.totalPrice",
                          {
                            $ifNull: [
                              "$itemsSnapshot.price",
                              { $ifNull: ["$itemsSnapshot.basePrice", 0] },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                  { $ifNull: ["$itemsSnapshot.quantity", { $ifNull: ["$itemsSnapshot.qty", 1] }] },
                ],
              },
            ],
          },
          matchedItemId: { $ifNull: ["$itemsSnapshot.itemId", "$itemsSnapshot.name"] },
          matchedItemName: {
            $ifNull: [
              "$itemsSnapshot.itemName",
              { $ifNull: ["$itemsSnapshot.name", "Menu item"] },
            ],
          },
        },
      },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: "$_id",
                orderRevenue: { $sum: "$matchedRevenue" },
                orderQuantity: { $sum: "$matchedQuantity" },
              },
            },
            {
              $group: {
                _id: null,
                deliveredOrders: { $sum: 1 },
                deliveredRevenue: { $sum: "$orderRevenue" },
                itemQuantity: { $sum: "$orderQuantity" },
              },
            },
          ],
          topItems: [
            {
              $group: {
                _id: { itemId: "$matchedItemId", name: "$matchedItemName" },
                quantity: { $sum: "$matchedQuantity" },
                revenue: { $sum: "$matchedRevenue" },
              },
            },
            { $sort: { revenue: -1, quantity: -1 } },
            { $limit: 1 },
          ],
        },
      },
    ]),
    OrderModel.find(
      orderMatch,
      { orderNumber: 1, customerSnapshot: 1, pricing: 1, itemsSnapshot: 1, timestamps: 1, createdAt: 1 }
    )
      .sort({ "timestamps.Delivered": -1, createdAt: -1 })
      .limit(20)
      .lean(),
  ]);
  const analytics = analyticsRows[0] ?? {};
  const totals = Array.isArray(analytics.totals) ? analytics.totals[0] : null;
  const topItemRow = Array.isArray(analytics.topItems) ? analytics.topItems[0] : null;
  const topItem = topItemRow
    ? {
        name: stringValue(topItemRow._id?.name, "Menu item"),
        quantity: numberValue(topItemRow.quantity),
        revenue: numberValue(topItemRow.revenue),
      }
    : null;

  const recentOrders = recentOrderRows.map((order) => {
    const matchingItems = Array.isArray(order.itemsSnapshot)
      ? order.itemsSnapshot.filter((item: Record<string, any>) => {
          const snapshotCategoryId = stringValue(item.categoryId);
          const snapshotItemId = stringValue(item.itemId);
          return snapshotCategoryId === categoryId || itemIds.has(snapshotItemId);
        })
      : [];
    const categoryRevenue = matchingItems.reduce((sum: number, item: Record<string, any>) => sum + getItemTotal(item), 0);
    return {
      id: objectIdString(order._id),
      orderNumber: stringValue(order.orderNumber),
      customerName: stringValue((order.customerSnapshot as { fullName?: string; name?: string } | undefined)?.fullName ?? (order.customerSnapshot as { name?: string } | undefined)?.name),
      categoryRevenue,
      createdAt: serializeDate(order.timestamps?.Delivered ?? order.createdAt),
    };
  });

  return {
    deliveredOrders: numberValue(totals?.deliveredOrders),
    deliveredRevenue: numberValue(totals?.deliveredRevenue),
    itemQuantity: numberValue(totals?.itemQuantity),
    topItem,
    recentOrders,
  };
}

async function getDuplicateSuggestions(category: Record<string, any>) {
  const duplicates = await CategoryModel.find(
    {
      restaurantId: category.restaurantId,
      _id: { $ne: category._id },
      name: { $regex: `^${stringValue(category.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    },
    { name: 1, status: 1, updatedAt: 1 }
  )
    .limit(10)
    .lean();

  return duplicates.map((duplicate) => ({
    id: objectIdString(duplicate._id),
    name: stringValue(duplicate.name, "Category"),
    status: stringValue(duplicate.status),
    updatedAt: serializeDate(duplicate.updatedAt),
  }));
}

function healthMatch(health?: ListAdminCategoriesParams["health"]) {
  if (!health || health === "all") return null;
  if (health === "empty") return { totalItems: 0 };
  if (health === "duplicate") return { duplicateNameCount: { $gt: 1 } };
  if (health === "healthy") return { totalItems: { $gt: 0 }, activeItems: { $gt: 0 }, duplicateNameCount: { $lte: 1 } };
  return {
    $or: [
      { totalItems: 0 },
      { activeItems: 0 },
      { duplicateNameCount: { $gt: 1 } },
    ],
  };
}

export async function listAdminCategories(params: ListAdminCategoriesParams) {
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const sortStage: Record<string, 1 | -1> =
    params.sortBy === "oldest"
      ? { createdAt: 1 }
      : params.sortBy === "mostItems"
        ? { totalItems: -1, activeItems: -1, updatedAt: -1 }
        : params.sortBy === "emptyFirst"
          ? { totalItems: 1, activeItems: 1, updatedAt: -1 }
          : params.sortBy === "name"
            ? { name: 1 }
            : { updatedAt: -1 };
  const pipeline = buildBasePipeline(params);
  const reviewMatch = healthMatch(params.health);
  const finalPipeline = reviewMatch ? [...pipeline, { $match: reviewMatch }] : pipeline;

  const [rows, countRows, allSummaryRows, restaurants] = await Promise.all([
    CategoryModel.aggregate([
      ...finalPipeline,
      { $sort: sortStage },
      { $skip: (page - 1) * pageSize },
      { $limit: pageSize },
      { $project: { menuStats: 0, duplicateStats: 0 } },
    ]),
    CategoryModel.aggregate([...finalPipeline, { $count: "total" }]),
    CategoryModel.aggregate([
      ...buildBasePipeline({ ...params, status: "all", health: "all" }),
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
          archived: { $sum: { $cond: [{ $eq: ["$status", "archived"] }, 1, 0] } },
          empty: { $sum: { $cond: [{ $eq: ["$totalItems", 0] }, 1, 0] } },
          needsReview: {
            $sum: {
              $cond: [
                { $or: [{ $eq: ["$totalItems", 0] }, { $eq: ["$activeItems", 0] }, { $gt: ["$duplicateNameCount", 1] }] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
    RestaurantModel.find(
      buildRestaurantServiceAreaScopeFilter(params),
      { name: 1, address: 1, city: 1 },
    )
      .sort({ name: 1 })
      .limit(500)
      .lean(),
  ]);

  const total = Number(countRows[0]?.total ?? 0);
  const summary = allSummaryRows[0] ?? {};

  return {
    items: rows.map(mapCategory),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    summary: {
      total: Number(summary.total ?? 0),
      active: Number(summary.active ?? 0),
      archived: Number(summary.archived ?? 0),
      empty: Number(summary.empty ?? 0),
      needsReview: Number(summary.needsReview ?? 0),
    },
    restaurants: restaurants.map((restaurant) => ({
      id: objectIdString(restaurant._id),
      name: stringValue(restaurant.name, "Restaurant"),
      city: stringValue((restaurant.address as { city?: string } | undefined)?.city),
    })),
  };
}

export async function getAdminCategoryDetails(
  categoryId: string,
  params: { zoneId?: string; districtId?: string } = {},
) {
  if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    throw new AppError(StatusCodes.NOT_FOUND, "CATEGORY_NOT_FOUND", "Category not found");
  }

  const rows = await CategoryModel.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(categoryId) } },
    ...buildBasePipeline(params),
    { $limit: 1 },
  ]);
  const category = rows[0];
  if (!category) {
    throw new AppError(StatusCodes.NOT_FOUND, "CATEGORY_NOT_FOUND", "Category not found");
  }

  const [menuItems, auditLogs, duplicateSuggestions] = await Promise.all([
    MenuItemModel.find(
      { categoryId: category._id, isDeleted: { $ne: true } },
      { name: 1, status: 1, availability: 1, basePrice: 1, isPopular: 1, images: 1, updatedAt: 1 },
    )
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean(),
    AdminAuditLogModel.find({ entityType: "category", entityId: categoryId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
    getDuplicateSuggestions(category),
  ]);
  const sales = await getCategorySalesAnalytics({ categoryId, menuItems });

  return {
    category: mapCategory(category),
    sales,
    duplicateSuggestions,
    menuItems: menuItems.map((item) => ({
      id: objectIdString(item._id),
      name: stringValue(item.name, "Menu item"),
      status: stringValue(item.status),
      availability: stringValue(item.availability),
      basePrice: numberValue(item.basePrice),
      isPopular: Boolean(item.isPopular),
      imageUrl: Array.isArray(item.images) ? stringValue(item.images[0]?.url) : "",
      updatedAt: serializeDate(item.updatedAt),
    })),
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

export async function updateAdminCategoryStatus(params: {
  categoryId: string;
  status: CategoryStatus;
  reason?: string;
  adminId?: string;
  notifyOwner?: boolean;
  zoneId?: string;
  districtId?: string;
}) {
  if (!mongoose.Types.ObjectId.isValid(params.categoryId)) {
    throw new AppError(StatusCodes.NOT_FOUND, "CATEGORY_NOT_FOUND", "Category not found");
  }

  const category = await CategoryModel.findById(params.categoryId);
  if (!category) {
    throw new AppError(StatusCodes.NOT_FOUND, "CATEGORY_NOT_FOUND", "Category not found");
  }
  const restaurantScopeFilter = buildRestaurantServiceAreaScopeFilter(params);
  if (
    Object.keys(restaurantScopeFilter).length > 0 &&
    !(await RestaurantModel.exists({ _id: category.restaurantId, ...restaurantScopeFilter }))
  ) {
    throw new AppError(StatusCodes.NOT_FOUND, "CATEGORY_NOT_FOUND", "Category not found");
  }

  const previousStatus = stringValue(category.status);
  category.status = params.status;
  category.set("adminModeration", {
    lastAction: params.status === "archived" ? "archive" : "restore",
    reason: params.reason ?? "",
    adminId: params.adminId ?? "",
    actedAt: new Date(),
    notifyOwner: Boolean(params.notifyOwner),
  });
  await category.save();

  await writeCategoryAudit({
    adminId: params.adminId,
    categoryId: params.categoryId,
    action: params.status === "archived" ? "archive" : "restore",
    title: params.status === "archived" ? "Category archived by admin" : "Category restored by admin",
    description: params.reason ?? "",
    metadata: {
      previousStatus,
      nextStatus: params.status,
      restaurantId: objectIdString(category.restaurantId),
      categoryName: stringValue(category.name),
    },
  });

  if (params.notifyOwner) {
    const restaurant = await RestaurantModel.findById(category.restaurantId, { ownerId: 1 }).lean();
    if (restaurant?.ownerId) {
      await NotificationModel.create({
        ownerId: restaurant.ownerId,
        restaurantId: category.restaurantId,
        type: "system",
        eventType: params.status === "archived" ? "category_archived_by_admin" : "category_restored_by_admin",
        entityType: "category",
        entityId: params.categoryId,
        title: params.status === "archived" ? "Category archived by admin" : "Category restored by admin",
        description:
          params.reason ||
          (params.status === "archived"
            ? `${stringValue(category.name)} was archived after admin review.`
            : `${stringValue(category.name)} was restored after admin review.`),
        actionPath: "/menu",
      });
    }
  }

  return { id: params.categoryId, status: params.status };
}

export async function bulkUpdateAdminCategoryStatus(params: {
  categoryIds: string[];
  status: CategoryStatus;
  reason?: string;
  adminId?: string;
  notifyOwner?: boolean;
  zoneId?: string;
  districtId?: string;
}) {
  const ids = [...new Set(params.categoryIds)].filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (!ids.length) {
    throw new AppError(StatusCodes.BAD_REQUEST, "CATEGORY_SELECTION_REQUIRED", "Select at least one valid category");
  }

  const results = [];
  for (const categoryId of ids) {
    results.push(
      await updateAdminCategoryStatus({
        categoryId,
        status: params.status,
        reason: params.reason,
        adminId: params.adminId,
        notifyOwner: params.notifyOwner,
        zoneId: params.zoneId,
        districtId: params.districtId,
      })
    );
  }

  return { updated: results.length, items: results };
}

type DeletedMenuScope = {
  zoneId?: string;
  districtId?: string;
  restaurantId?: string;
};

// Admin oversight of the owner trash: every soft-deleted category/item across restaurants in the
// admin's service-area scope, so a wrongly-deleted item can be recovered even if the owner does not.
export async function listAdminDeletedMenu(params: DeletedMenuScope) {
  const [deletedCategories, deletedItems] = await Promise.all([
    CategoryModel.find({ isDeleted: true }).sort({ deletedAt: -1 }).lean(),
    MenuItemModel.find({ isDeleted: true }).sort({ deletedAt: -1 }).lean(),
  ]);

  const restaurantIdStrings = new Set<string>();
  for (const category of deletedCategories) restaurantIdStrings.add(objectIdString(category.restaurantId));
  for (const item of deletedItems) restaurantIdStrings.add(objectIdString(item.restaurantId));

  let restaurantIds = [...restaurantIdStrings]
    .filter((id) => id && mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  if (params.restaurantId && mongoose.Types.ObjectId.isValid(params.restaurantId)) {
    const wanted = params.restaurantId;
    restaurantIds = restaurantIds.filter((id) => id.toString() === wanted);
  }

  const restaurantScopeFilter = buildRestaurantServiceAreaScopeFilter(params);
  const restaurants = restaurantIds.length
    ? await RestaurantModel.find(
        { _id: { $in: restaurantIds }, ...restaurantScopeFilter },
        { name: 1 },
      ).lean()
    : [];
  const restaurantNameById = new Map<string, string>();
  for (const restaurant of restaurants) {
    restaurantNameById.set(objectIdString(restaurant._id), stringValue(restaurant.name, "Restaurant"));
  }
  const inScope = (restaurantId: unknown) => restaurantNameById.has(objectIdString(restaurantId));

  const scopedCategories = deletedCategories.filter((category) => inScope(category.restaurantId));
  const scopedItems = deletedItems.filter((item) => inScope(item.restaurantId));
  const deletedCategoryIds = new Set(scopedCategories.map((category) => objectIdString(category._id)));

  return {
    categories: scopedCategories.map((category) => ({
      id: objectIdString(category._id),
      name: stringValue(category.name, "Category"),
      restaurantId: objectIdString(category.restaurantId),
      restaurantName: restaurantNameById.get(objectIdString(category.restaurantId)) ?? "Restaurant",
      itemCount: scopedItems.filter(
        (item) => objectIdString(item.categoryId) === objectIdString(category._id),
      ).length,
      deletedAt: serializeDate(category.deletedAt),
      deletedBy: stringValue(category.deletedBy, "owner"),
    })),
    items: scopedItems.map((item) => ({
      id: objectIdString(item._id),
      name: stringValue(item.name, "Menu item"),
      basePrice: numberValue(item.basePrice),
      imageUrl: Array.isArray(item.images) ? stringValue(item.images[0]?.url) : "",
      restaurantId: objectIdString(item.restaurantId),
      restaurantName: restaurantNameById.get(objectIdString(item.restaurantId)) ?? "Restaurant",
      categoryId: objectIdString(item.categoryId),
      categoryDeleted: deletedCategoryIds.has(objectIdString(item.categoryId)),
      deletedAt: serializeDate(item.deletedAt),
      deletedBy: stringValue(item.deletedBy, "owner"),
    })),
  };
}

async function assertRestaurantInAdminScope(restaurantId: unknown, params: DeletedMenuScope) {
  const restaurantScopeFilter = buildRestaurantServiceAreaScopeFilter(params);
  if (Object.keys(restaurantScopeFilter).length === 0) return;
  const allowed = await RestaurantModel.exists({ _id: restaurantId, ...restaurantScopeFilter });
  if (!allowed) {
    throw new AppError(StatusCodes.NOT_FOUND, "NOT_IN_SCOPE", "Item is outside your area scope");
  }
}

export async function restoreAdminCategory(params: {
  categoryId: string;
  adminId?: string;
  zoneId?: string;
  districtId?: string;
}) {
  if (!mongoose.Types.ObjectId.isValid(params.categoryId)) {
    throw new AppError(StatusCodes.NOT_FOUND, "CATEGORY_NOT_FOUND", "Deleted category not found");
  }
  const category = await CategoryModel.findOne({ _id: params.categoryId, isDeleted: true }).lean();
  if (!category) {
    throw new AppError(StatusCodes.NOT_FOUND, "CATEGORY_NOT_FOUND", "Deleted category not found");
  }
  await assertRestaurantInAdminScope(category.restaurantId, params);

  const result = await restoreCategoryForRestaurant({
    restaurantId: objectIdString(category.restaurantId),
    categoryId: params.categoryId,
  });

  await writeCategoryAudit({
    adminId: params.adminId,
    categoryId: params.categoryId,
    action: "restore",
    title: "Category restored from trash by admin",
    description: "",
    metadata: {
      restaurantId: objectIdString(category.restaurantId),
      categoryName: stringValue(category.name),
    },
  });

  return result;
}

export async function restoreAdminMenuItem(params: {
  itemId: string;
  adminId?: string;
  zoneId?: string;
  districtId?: string;
}) {
  if (!mongoose.Types.ObjectId.isValid(params.itemId)) {
    throw new AppError(StatusCodes.NOT_FOUND, "MENU_ITEM_NOT_FOUND", "Deleted item not found");
  }
  const item = await MenuItemModel.findOne({ _id: params.itemId, isDeleted: true }).lean();
  if (!item) {
    throw new AppError(StatusCodes.NOT_FOUND, "MENU_ITEM_NOT_FOUND", "Deleted item not found");
  }
  await assertRestaurantInAdminScope(item.restaurantId, params);

  return restoreMenuItemForRestaurant({
    restaurantId: objectIdString(item.restaurantId),
    itemId: params.itemId,
  });
}
