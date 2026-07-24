import { StatusCodes } from "http-status-codes";
import mongoose, { type SortOrder } from "mongoose";

import { emitSocketEvent } from "../../config/socket";
import { AppError } from "../../common/utils/app-error";
import { slugify } from "../../common/utils/slugify";
import { createAdminOperationalAlert, resolveAdminOperationalAlertByDedupeKey } from "../admin/admin-alert.service";
import { OwnerModel, RestaurantModel } from "../auth/auth.model";
import { invalidateCustomerRestaurantAvailabilityCaches } from "../customer/customer.service";
import {
  CategoryModel,
  MenuApprovalRequestModel,
  MenuItemModel,
  NotificationModel,
} from "./operational.model";

type MenuApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "superseded";
type MenuApprovalType = "new_item" | "price_update";

type MenuItemSnapshot = {
  categoryId: string;
  name: string;
  slug: string;
  description: string;
  images: Array<{ url?: string; publicId?: string }>;
  status: "active" | "archived";
  availability: "available" | "unavailable";
  kind: "simple" | "variant";
  basePrice: number;
  variants: unknown[];
  addOnGroups: unknown[];
  recommendedItemIds: string[];
  isPopular: boolean;
};

type PriceDiff = {
  path: string;
  label: string;
  oldPrice: number | null;
  newPrice: number | null;
  delta: number;
  percentDelta: number | null;
};

type MenuApprovalEnrichment = {
  restaurantName?: string;
  ownerName?: string;
  ownerPhone?: string;
};

function stringValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function idValue(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && "_id" in value) {
    return stringValue((value as { _id?: unknown })._id);
  }
  return stringValue(value);
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function plainObject<T>(value: T): T {
  if (value && typeof value === "object" && "toObject" in value) {
    return (value as { toObject: () => T }).toObject();
  }
  return value;
}

function serializeMenuItemSnapshot(item: Record<string, any>): MenuItemSnapshot {
  return {
    categoryId: idValue(item.categoryId),
    name: stringValue(item.name),
    slug: stringValue(item.slug),
    description: stringValue(item.description),
    images: arrayValue(item.images).map((image) => ({
      url: stringValue((image as Record<string, unknown>)?.url),
      publicId: stringValue((image as Record<string, unknown>)?.publicId),
    })),
    status: item.status === "archived" ? "archived" : "active",
    availability:
      item.availability === "unavailable" ? "unavailable" : "available",
    kind: item.kind === "variant" ? "variant" : "simple",
    basePrice: numberValue(item.basePrice),
    variants: arrayValue(item.variants),
    addOnGroups: arrayValue(item.addOnGroups),
    recommendedItemIds: arrayValue(item.recommendedItemIds).map(idValue).filter(Boolean),
    isPopular: item.isPopular === true,
  };
}

export function buildMenuItemSnapshot(params: {
  categoryId: string;
  name: string;
  description?: string;
  images?: Array<{ url?: string; publicId?: string }>;
  status: "active" | "archived";
  availability: "available" | "unavailable";
  kind: "simple" | "variant";
  basePrice: number;
  variants?: unknown[];
  addOnGroups?: unknown[];
  recommendedItemIds?: string[];
  isPopular?: boolean;
}): MenuItemSnapshot {
  return {
    categoryId: params.categoryId,
    name: params.name,
    slug: slugify(params.name),
    description: params.description ?? "",
    images: params.images ?? [],
    status: params.status,
    availability: params.availability,
    kind: params.kind,
    basePrice: numberValue(params.basePrice),
    variants: params.variants ?? [],
    addOnGroups: params.addOnGroups ?? [],
    recommendedItemIds: params.recommendedItemIds ?? [],
    isPopular: params.isPopular ?? false,
  };
}

export function buildProposedMenuItemSnapshot(params: {
  current: Record<string, any>;
  categoryId?: string;
  name?: string;
  description?: string;
  images?: Array<{ url?: string; publicId?: string }>;
  status?: "active" | "archived";
  availability?: "available" | "unavailable";
  kind?: "simple" | "variant";
  basePrice?: number;
  variants?: unknown[];
  addOnGroups?: unknown[];
  recommendedItemIds?: string[];
  isPopular?: boolean;
}) {
  const current = serializeMenuItemSnapshot(plainObject(params.current));
  const nextName = params.name ?? current.name;
  return {
    ...current,
    categoryId: params.categoryId ?? current.categoryId,
    name: nextName,
    slug: params.name !== undefined ? slugify(nextName) : current.slug,
    description: params.description ?? current.description,
    images: params.images ?? current.images,
    status: params.status ?? current.status,
    availability: params.availability ?? current.availability,
    kind: params.kind ?? current.kind,
    basePrice:
      params.basePrice !== undefined
        ? numberValue(params.basePrice)
        : current.basePrice,
    variants: params.variants ?? current.variants,
    addOnGroups: params.addOnGroups ?? current.addOnGroups,
    recommendedItemIds:
      params.recommendedItemIds ?? current.recommendedItemIds,
    isPopular: params.isPopular ?? current.isPopular,
  };
}

function pricingFingerprint(snapshot: MenuItemSnapshot) {
  return JSON.stringify({
    kind: snapshot.kind,
    basePrice: numberValue(snapshot.basePrice),
    variants: snapshot.variants,
    addOnGroups: snapshot.addOnGroups,
  });
}

export function hasMenuPricingPayload(params: {
  kind?: unknown;
  basePrice?: unknown;
  variants?: unknown;
  addOnGroups?: unknown;
}) {
  return (
    params.kind !== undefined ||
    params.basePrice !== undefined ||
    params.variants !== undefined ||
    params.addOnGroups !== undefined
  );
}

export function hasMenuPricingChange(
  current: MenuItemSnapshot,
  proposed: MenuItemSnapshot,
) {
  return pricingFingerprint(current) !== pricingFingerprint(proposed);
}

type PricePoint = {
  path: string;
  label: string;
  price: number;
};

function labelValue(value: unknown, fallback: string) {
  const text = stringValue(value);
  return text || fallback;
}

function collectPricePoints(snapshot: MenuItemSnapshot) {
  const points: PricePoint[] = [];
  if (snapshot.kind !== "variant") {
    points.push({
      path: "basePrice",
      label: "Base price",
      price: numberValue(snapshot.basePrice),
    });
  }

  arrayValue(snapshot.variants).forEach((group, groupIndex) => {
    const groupRecord = (group ?? {}) as Record<string, unknown>;
    const groupName = labelValue(groupRecord.name, `Variant group ${groupIndex + 1}`);
    arrayValue(groupRecord.options).forEach((option, optionIndex) => {
      const optionRecord = (option ?? {}) as Record<string, unknown>;
      const optionLabel = labelValue(optionRecord.label, `Option ${optionIndex + 1}`);
      points.push({
        path: `variants.${groupIndex}.options.${optionIndex}.price`,
        label: `${groupName} / ${optionLabel}`,
        price: numberValue(snapshot.basePrice) + numberValue(optionRecord.priceDelta),
      });
    });
  });

  arrayValue(snapshot.addOnGroups).forEach((group, groupIndex) => {
    const groupRecord = (group ?? {}) as Record<string, unknown>;
    const groupName = labelValue(groupRecord.name, `Add-on group ${groupIndex + 1}`);
    arrayValue(groupRecord.options).forEach((option, optionIndex) => {
      const optionRecord = (option ?? {}) as Record<string, unknown>;
      const optionLabel = labelValue(optionRecord.label, `Option ${optionIndex + 1}`);
      points.push({
        path: `addOnGroups.${groupIndex}.options.${optionIndex}.price`,
        label: `${groupName} / ${optionLabel}`,
        price: numberValue(optionRecord.price),
      });
    });
  });

  return points;
}

export function buildMenuPriceDiffs(
  current: MenuItemSnapshot | null,
  proposed: MenuItemSnapshot,
) {
  const currentPoints = current ? collectPricePoints(current) : [];
  const proposedPoints = collectPricePoints(proposed);
  const paths = Array.from(
    new Set([
      ...currentPoints.map((point) => point.path),
      ...proposedPoints.map((point) => point.path),
    ]),
  );
  const currentByPath = new Map(currentPoints.map((point) => [point.path, point]));
  const proposedByPath = new Map(proposedPoints.map((point) => [point.path, point]));

  return paths
    .map<PriceDiff | null>((path) => {
      const oldPoint = currentByPath.get(path);
      const newPoint = proposedByPath.get(path);
      const oldPrice = oldPoint ? oldPoint.price : null;
      const newPrice = newPoint ? newPoint.price : null;
      if (oldPrice === newPrice) return null;
      const delta = numberValue(newPrice) - numberValue(oldPrice);
      const percentDelta =
        oldPrice && oldPrice > 0 && newPrice !== null
          ? Number(((delta / oldPrice) * 100).toFixed(2))
          : null;
      return {
        path,
        label: newPoint?.label ?? oldPoint?.label ?? path,
        oldPrice,
        newPrice,
        delta,
        percentDelta,
      };
    })
    .filter((diff): diff is PriceDiff => Boolean(diff));
}

function serializeOwnerApproval(request: Record<string, any>) {
  const row = plainObject(request);
  return {
    id: stringValue(row._id ?? row.id),
    type: stringValue(row.type) as MenuApprovalType,
    status: stringValue(row.status) as MenuApprovalStatus,
    menuItemId: idValue(row.menuItemId) || null,
    proposedName: stringValue(row.proposedSnapshot?.name),
    currentName: stringValue(row.currentSnapshot?.name),
    priceDiffCount: arrayValue(row.priceDiffs).length,
    priceDiffs: arrayValue(row.priceDiffs),
    ownerReason: stringValue(row.ownerReason),
    submittedAt: row.submittedAt ? new Date(row.submittedAt).toISOString() : null,
    reviewedAt: row.reviewedAt ? new Date(row.reviewedAt).toISOString() : null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

function serializeAdminApproval(
  request: Record<string, any>,
  enrichment: MenuApprovalEnrichment = {},
) {
  const row = plainObject(request);
  return {
    ...serializeOwnerApproval(row),
    _id: stringValue(row._id ?? row.id),
    restaurantId: idValue(row.restaurantId),
    restaurantName: enrichment.restaurantName ?? "",
    ownerId: idValue(row.ownerId),
    ownerName: enrichment.ownerName ?? "",
    ownerPhone: enrichment.ownerPhone ?? "",
    currentSnapshot: row.currentSnapshot ?? {},
    proposedSnapshot: row.proposedSnapshot ?? {},
    ownerNote: stringValue(row.ownerNote),
    internalNote: stringValue(row.internalNote),
    reviewedByAdminId: stringValue(row.reviewedByAdminId),
    allowResubmit: row.allowResubmit !== false,
  };
}

function menuApprovalDedupeKey(requestId: string) {
  return `menu-approval:${requestId}`;
}

async function createMenuApprovalAdminAlert(request: Record<string, any>) {
  const row = plainObject(request);
  const restaurant = await RestaurantModel.findById(row.restaurantId)
    .select("name")
    .lean();
  const requestId = stringValue(row._id ?? row.id);
  const restaurantName = stringValue(restaurant?.name) || "Restaurant";
  const requestType =
    row.type === "new_item" ? "new menu item" : "menu price update";

  await createAdminOperationalAlert({
    alertType: "restaurant_menu_approval",
    severity: "warning",
    title: "Menu approval needed",
    description: `${restaurantName} submitted a ${requestType} for admin review.`,
    source: restaurantName,
    entityType: "menu_approval_request",
    entityId: requestId,
    path: "/menu-approvals",
    iconKey: "utensils",
    dedupeKey: menuApprovalDedupeKey(requestId),
    metadata: {
      requestId,
      requestType: row.type,
      restaurantId: idValue(row.restaurantId),
      ownerId: idValue(row.ownerId),
      menuItemId: idValue(row.menuItemId),
      proposedName: stringValue(row.proposedSnapshot?.name),
      priceDiffCount: arrayValue(row.priceDiffs).length,
    },
  });
}

async function notifyOwnerMenuApproval(params: {
  ownerId: string;
  restaurantId: string;
  requestId: string;
  status: "approved" | "rejected";
  requestType: MenuApprovalType;
  itemName: string;
  reason?: string;
}) {
  const isApproved = params.status === "approved";
  const title = isApproved
    ? "Menu change approved"
    : "Menu change rejected";
  const description = isApproved
    ? `${params.itemName} is now updated in your live menu.`
    : `${params.itemName} was not approved.${params.reason ? ` Reason: ${params.reason}` : ""}`;
  const titleBn = isApproved
    ? "মেনু পরিবর্তন অনুমোদিত হয়েছে"
    : "মেনু পরিবর্তন অনুমোদিত হয়নি";
  const descriptionBn = isApproved
    ? `${params.itemName} এখন লাইভ মেনুতে আপডেট হয়েছে।`
    : `${params.itemName} অনুমোদন করা হয়নি।${params.reason ? ` কারণ: ${params.reason}` : ""}`;

  const owner = await OwnerModel.findById(params.ownerId)
    .select("preferredLanguage")
    .lean();
  const useBangla = owner?.preferredLanguage !== "en";
  const notification = await NotificationModel.create({
    ownerId: params.ownerId,
    restaurantId: params.restaurantId,
    type: "system",
    eventType: `menu_approval.${params.status}`,
    entityType: "menu_approval_request",
    entityId: params.requestId,
    title: useBangla ? titleBn : title,
    description: useBangla ? descriptionBn : description,
    actionPath: "/menu",
  });

  emitSocketEvent(
    `owner:${params.ownerId}`,
    "notification.created",
    notification.toObject(),
  );
}

async function getOwnerRestaurantApprovalContext(ownerId: string) {
  const owner = await OwnerModel.findById(ownerId);

  if (!owner) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "OWNER_NOT_FOUND",
      "Owner not found",
    );
  }

  if (!owner.activeRestaurantId || owner.restaurantLifecycleStatus !== "approved") {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "RESTAURANT_NOT_READY",
      "Restaurant operational data is only available after approval",
    );
  }

  return {
    owner,
    restaurantId: owner.activeRestaurantId.toString(),
  };
}

async function assertNoLiveMenuItemSlug(params: {
  restaurantId: string;
  slug: string;
}) {
  const existing = await MenuItemModel.findOne({
    restaurantId: params.restaurantId,
    slug: params.slug,
  })
    .select("_id")
    .lean();
  if (existing) {
    throw new AppError(
      StatusCodes.CONFLICT,
      "MENU_ITEM_ALREADY_EXISTS",
      "A menu item with this name already exists.",
    );
  }
}

export async function submitNewMenuItemApproval(params: {
  ownerId: string;
  restaurantId: string;
  proposedSnapshot: MenuItemSnapshot;
}) {
  await assertNoLiveMenuItemSlug({
    restaurantId: params.restaurantId,
    slug: params.proposedSnapshot.slug,
  });

  const existingPending = await MenuApprovalRequestModel.findOne({
    restaurantId: params.restaurantId,
    ownerId: params.ownerId,
    type: "new_item",
    status: "pending",
    "proposedSnapshot.slug": params.proposedSnapshot.slug,
  });

  const priceDiffs = buildMenuPriceDiffs(null, params.proposedSnapshot);
  const request =
    existingPending ??
    new MenuApprovalRequestModel({
      restaurantId: params.restaurantId,
      ownerId: params.ownerId,
      type: "new_item",
      menuItemId: null,
    });

  request.currentSnapshot = {};
  request.proposedSnapshot = params.proposedSnapshot;
  request.set("priceDiffs", priceDiffs);
  request.submittedAt = new Date();
  request.status = "pending";
  request.ownerReason = "";
  request.internalNote = "";
  request.reviewedAt = null;
  request.reviewedByAdminId = "";
  await request.save();

  await createMenuApprovalAdminAlert(request.toObject());
  emitSocketEvent(`owner:${params.ownerId}`, "menu.approval.updated", {
    request: serializeOwnerApproval(request.toObject()),
  });

  return {
    approvalRequired: true,
    approvalRequest: serializeOwnerApproval(request.toObject()),
  };
}

export async function submitMenuPriceUpdateApproval(params: {
  ownerId: string;
  restaurantId: string;
  menuItemId: string;
  currentSnapshot: MenuItemSnapshot;
  proposedSnapshot: MenuItemSnapshot;
}) {
  const request =
    (await MenuApprovalRequestModel.findOne({
      restaurantId: params.restaurantId,
      ownerId: params.ownerId,
      menuItemId: params.menuItemId,
      type: "price_update",
      status: "pending",
    })) ??
    new MenuApprovalRequestModel({
      restaurantId: params.restaurantId,
      ownerId: params.ownerId,
      menuItemId: params.menuItemId,
      type: "price_update",
    });

  request.currentSnapshot = params.currentSnapshot;
  request.proposedSnapshot = params.proposedSnapshot;
  request.set(
    "priceDiffs",
    buildMenuPriceDiffs(params.currentSnapshot, params.proposedSnapshot),
  );
  request.submittedAt = new Date();
  request.status = "pending";
  request.ownerReason = "";
  request.internalNote = "";
  request.reviewedAt = null;
  request.reviewedByAdminId = "";
  await request.save();

  await createMenuApprovalAdminAlert(request.toObject());
  emitSocketEvent(`owner:${params.ownerId}`, "menu.approval.updated", {
    request: serializeOwnerApproval(request.toObject()),
  });

  return serializeOwnerApproval(request.toObject());
}

export async function decorateMenuItemsWithApprovals(items: unknown[]) {
  const rows = items.map((item) => plainObject(item as Record<string, any>));
  const itemIds = rows.map((item) => idValue(item._id)).filter(Boolean);
  if (!itemIds.length) return rows;

  const approvals = await MenuApprovalRequestModel.find({
    menuItemId: { $in: itemIds },
    status: { $in: ["pending", "rejected"] },
  })
    .sort({ createdAt: -1 })
    .lean();

  const approvalByItemId = new Map<string, ReturnType<typeof serializeOwnerApproval>>();
  approvals.forEach((approval) => {
    const itemId = idValue(approval.menuItemId);
    if (!itemId || approvalByItemId.has(itemId)) return;
    approvalByItemId.set(itemId, serializeOwnerApproval(approval));
  });

  return rows.map((item) => ({
    ...item,
    approval: approvalByItemId.get(idValue(item._id)) ?? null,
  }));
}

export async function listOwnerMenuApprovalRequests(params: {
  ownerId: string;
  status?: MenuApprovalStatus | "active";
}) {
  const { restaurantId } = await getOwnerRestaurantApprovalContext(params.ownerId);
  const query: Record<string, unknown> = {
    ownerId: params.ownerId,
    restaurantId,
  };
  if (params.status === "active" || !params.status) {
    query.status = { $in: ["pending", "rejected"] };
  } else {
    query.status = params.status;
  }

  const items = await MenuApprovalRequestModel.find(query)
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return {
    items: items.map(serializeOwnerApproval),
    total: items.length,
  };
}

async function enrichAdminApprovalRows(rows: Array<Record<string, any>>) {
  const restaurantIds = Array.from(
    new Set(rows.map((row) => idValue(row.restaurantId)).filter(Boolean)),
  );
  const ownerIds = Array.from(
    new Set(rows.map((row) => idValue(row.ownerId)).filter(Boolean)),
  );
  const [restaurants, owners] = await Promise.all([
    RestaurantModel.find({ _id: { $in: restaurantIds } })
      .select("name")
      .lean(),
    OwnerModel.find({ _id: { $in: ownerIds } })
      .select("fullName phone")
      .lean(),
  ]);
  const restaurantById = new Map(
    restaurants.map((restaurant) => [
      idValue(restaurant._id),
      stringValue(restaurant.name),
    ]),
  );
  const ownerById = new Map(
    owners.map((owner) => [
      idValue(owner._id),
      {
        ownerName: stringValue(owner.fullName),
        ownerPhone: stringValue(owner.phone),
      },
    ]),
  );

  return rows.map((row) =>
    serializeAdminApproval(row, {
      restaurantName: restaurantById.get(idValue(row.restaurantId)) ?? "",
      ...(ownerById.get(idValue(row.ownerId)) ?? {}),
    }),
  );
}

export async function listAdminMenuApprovalRequests(params: {
  status?: MenuApprovalStatus | "all";
  type?: MenuApprovalType | "all";
  search?: string;
  restaurantId?: string;
  menuItemId?: string;
  from?: string;
  to?: string;
  sortBy?: "newest" | "oldest";
  page?: number;
  pageSize?: number;
}) {
  const query = await buildAdminMenuApprovalQuery(params);
  return listAdminMenuApprovalsWithQuery({
    query,
    sortBy: params.sortBy,
    page: params.page,
    pageSize: params.pageSize,
  });
}

async function buildAdminMenuApprovalQuery(params: {
  status?: MenuApprovalStatus | "all";
  type?: MenuApprovalType | "all";
  search?: string;
  restaurantId?: string;
  menuItemId?: string;
  from?: string;
  to?: string;
}) {
  const query: Record<string, unknown> = {};
  if (params.status && params.status !== "all") {
    query.status = params.status;
  }
  if (params.type && params.type !== "all") {
    query.type = params.type;
  }
  if (params.restaurantId && mongoose.Types.ObjectId.isValid(params.restaurantId)) {
    query.restaurantId = new mongoose.Types.ObjectId(params.restaurantId);
  }
  if (params.menuItemId && mongoose.Types.ObjectId.isValid(params.menuItemId)) {
    query.menuItemId = new mongoose.Types.ObjectId(params.menuItemId);
  }
  const dateQuery: Record<string, Date> = {};
  const from = params.from ? new Date(params.from) : null;
  const to = params.to ? new Date(params.to) : null;
  if (from && Number.isFinite(from.getTime())) dateQuery.$gte = from;
  if (to && Number.isFinite(to.getTime())) dateQuery.$lte = to;
  if (Object.keys(dateQuery).length) {
    query.submittedAt = dateQuery;
  }

  const search = stringValue(params.search);
  if (search) {
    const regex = { $regex: search, $options: "i" };
    const [restaurants, owners] = await Promise.all([
      RestaurantModel.find({ name: regex }).select("_id").lean(),
      OwnerModel.find({
        $or: [{ fullName: regex }, { phone: regex }],
      })
        .select("_id")
        .lean(),
    ]);
    query.$or = [
      { "proposedSnapshot.name": regex },
      { "proposedSnapshot.slug": regex },
      { restaurantId: { $in: restaurants.map((restaurant) => restaurant._id) } },
      { ownerId: { $in: owners.map((owner) => owner._id) } },
    ];
  }

  return query;
}

async function listAdminMenuApprovalsWithQuery(params: {
  query: Record<string, unknown>;
  sortBy?: "newest" | "oldest";
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const sort: Record<string, SortOrder> =
    params.sortBy === "oldest" ? { createdAt: 1 } : { createdAt: -1 };
  const [rows, total, summaryRows] = await Promise.all([
    MenuApprovalRequestModel.find(params.query)
      .sort(sort)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    MenuApprovalRequestModel.countDocuments(params.query),
    MenuApprovalRequestModel.aggregate<{ _id: MenuApprovalStatus; count: number }>([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const items = await enrichAdminApprovalRows(rows);
  const summary = summaryRows.reduce<Record<string, number>>(
    (acc, row) => ({ ...acc, [row._id]: row.count }),
    {},
  );

  return {
    items,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    summary: {
      pending: summary.pending ?? 0,
      approved: summary.approved ?? 0,
      rejected: summary.rejected ?? 0,
    },
  };
}

async function buildMenuApprovalHistorySummary(query: Record<string, unknown>) {
  const [
    statusRows,
    topRestaurantRows,
    topItemRows,
  ] = await Promise.all([
    MenuApprovalRequestModel.aggregate<{ _id: MenuApprovalStatus; count: number }>([
      { $match: query },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    MenuApprovalRequestModel.aggregate<{
      _id: mongoose.Types.ObjectId;
      requestCount: number;
      pending: number;
      approved: number;
      rejected: number;
    }>([
      { $match: query },
      {
        $group: {
          _id: "$restaurantId",
          requestCount: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
          approved: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } },
        },
      },
      { $sort: { requestCount: -1, approved: -1, rejected: -1 } },
      { $limit: 5 },
    ]),
    MenuApprovalRequestModel.aggregate<{
      _id: {
        restaurantId: mongoose.Types.ObjectId;
        menuItemId: mongoose.Types.ObjectId | null;
        proposedSlug: string;
        proposedName: string;
      };
      requestCount: number;
      pending: number;
      approved: number;
      rejected: number;
    }>([
      { $match: query },
      {
        $group: {
          _id: {
            restaurantId: "$restaurantId",
            menuItemId: "$menuItemId",
            proposedSlug: "$proposedSnapshot.slug",
            proposedName: "$proposedSnapshot.name",
          },
          requestCount: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
          approved: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } },
        },
      },
      { $sort: { requestCount: -1, approved: -1, rejected: -1 } },
      { $limit: 5 },
    ]),
  ]);

  const statusCounts = statusRows.reduce<Record<string, number>>(
    (acc, row) => ({ ...acc, [row._id]: row.count }),
    {},
  );
  const total = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);
  const approved = statusCounts.approved ?? 0;
  const rejected = statusCounts.rejected ?? 0;
  const reviewedTotal = approved + rejected;

  const restaurantIds = Array.from(
    new Set([
      ...topRestaurantRows.map((row) => idValue(row._id)),
      ...topItemRows.map((row) => idValue(row._id.restaurantId)),
    ].filter(Boolean)),
  );
  const restaurants = await RestaurantModel.find({ _id: { $in: restaurantIds } })
    .select("name")
    .lean();
  const restaurantById = new Map(
    restaurants.map((restaurant) => [
      idValue(restaurant._id),
      stringValue(restaurant.name),
    ]),
  );

  return {
    total,
    pending: statusCounts.pending ?? 0,
    approved,
    rejected,
    approvalRate: reviewedTotal > 0 ? Math.round((approved / reviewedTotal) * 100) : 0,
    rejectionRate: reviewedTotal > 0 ? Math.round((rejected / reviewedTotal) * 100) : 0,
    mostRequestedRestaurants: topRestaurantRows.map((row) => {
      const restaurantId = idValue(row._id);
      return {
        restaurantId,
        restaurantName: restaurantById.get(restaurantId) ?? "Restaurant",
        requestCount: row.requestCount,
        pending: row.pending,
        approved: row.approved,
        rejected: row.rejected,
      };
    }),
    mostRequestedItems: topItemRows.map((row) => {
      const restaurantId = idValue(row._id.restaurantId);
      return {
        restaurantId,
        restaurantName: restaurantById.get(restaurantId) ?? "Restaurant",
        menuItemId: idValue(row._id.menuItemId) || null,
        itemName: stringValue(row._id.proposedName) || "Menu item",
        itemSlug: stringValue(row._id.proposedSlug),
        requestCount: row.requestCount,
        pending: row.pending,
        approved: row.approved,
        rejected: row.rejected,
      };
    }),
  };
}

export async function listAdminMenuApprovalHistory(params: {
  status?: MenuApprovalStatus | "all";
  type?: MenuApprovalType | "all";
  search?: string;
  restaurantId?: string;
  menuItemId?: string;
  from?: string;
  to?: string;
  sortBy?: "newest" | "oldest";
  page?: number;
  pageSize?: number;
}) {
  const query = await buildAdminMenuApprovalQuery(params);
  const [list, historySummary] = await Promise.all([
    listAdminMenuApprovalsWithQuery({
      query,
      sortBy: params.sortBy,
      page: params.page,
      pageSize: params.pageSize,
    }),
    buildMenuApprovalHistorySummary(query),
  ]);

  return {
    ...list,
    historySummary,
  };
}

export async function getAdminMenuApprovalRequest(requestId: string) {
  const request = await MenuApprovalRequestModel.findById(requestId).lean();
  if (!request) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "MENU_APPROVAL_NOT_FOUND",
      "Menu approval request not found",
    );
  }
  const [item] = await enrichAdminApprovalRows([request]);
  return item;
}

async function resolveApprovedRecommendedMenuIds(params: {
  restaurantId: string;
  itemIds: string[];
  currentItemId?: string;
}) {
  const uniqueIds = [
    ...new Set(
      (params.itemIds ?? [])
        .map((id) => id.trim())
        .filter(
          (id) =>
            id &&
            mongoose.Types.ObjectId.isValid(id) &&
            id !== params.currentItemId,
        ),
    ),
  ];
  if (!uniqueIds.length) return [];
  const rows = await MenuItemModel.find({
    _id: { $in: uniqueIds.map((id) => new mongoose.Types.ObjectId(id)) },
    restaurantId: params.restaurantId,
    status: "active",
  })
    .select("_id")
    .lean();
  const validIds = new Set(rows.map((row) => idValue(row._id)));
  return uniqueIds.filter((id) => validIds.has(id));
}

function assertPendingApproval(request: Record<string, any>) {
  if (request.status !== "pending") {
    throw new AppError(
      StatusCodes.CONFLICT,
      "MENU_APPROVAL_ALREADY_REVIEWED",
      "This menu approval request has already been reviewed.",
    );
  }
}

async function assertApprovalCategoryIsActive(snapshot: MenuItemSnapshot, restaurantId: string) {
  const category = await CategoryModel.findOne({
    _id: snapshot.categoryId,
    restaurantId,
    status: "active",
  })
    .select("_id")
    .lean();
  if (!category) {
    throw new AppError(
      StatusCodes.CONFLICT,
      "MENU_APPROVAL_CATEGORY_UNAVAILABLE",
      "The selected category is no longer active.",
    );
  }
}

export async function approveAdminMenuApprovalRequest(params: {
  requestId: string;
  adminId: string;
  note?: string;
}) {
  const request = await MenuApprovalRequestModel.findById(params.requestId);
  if (!request) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "MENU_APPROVAL_NOT_FOUND",
      "Menu approval request not found",
    );
  }
  assertPendingApproval(request.toObject());

  const proposed = serializeMenuItemSnapshot(request.proposedSnapshot ?? {});
  const restaurantId = idValue(request.restaurantId);
  const ownerId = idValue(request.ownerId);
  await assertApprovalCategoryIsActive(proposed, restaurantId);

  let liveItem: any = null;
  if (request.type === "new_item") {
    await assertNoLiveMenuItemSlug({ restaurantId, slug: proposed.slug });
    const recommendedItemIds = await resolveApprovedRecommendedMenuIds({
      restaurantId,
      itemIds: proposed.recommendedItemIds,
    });
    liveItem = await MenuItemModel.create({
      restaurantId,
      categoryId: proposed.categoryId,
      name: proposed.name,
      slug: proposed.slug,
      description: proposed.description,
      images: proposed.images,
      status: proposed.status,
      availability: proposed.availability,
      kind: proposed.kind,
      basePrice: proposed.basePrice,
      variants: proposed.variants,
      addOnGroups: proposed.addOnGroups,
      recommendedItemIds,
      isPopular: proposed.isPopular,
    });
    request.menuItemId = liveItem._id;
  } else {
    liveItem = await MenuItemModel.findOne({
      _id: request.menuItemId,
      restaurantId,
    });
    if (!liveItem) {
      throw new AppError(
        StatusCodes.NOT_FOUND,
        "MENU_ITEM_NOT_FOUND",
        "Menu item not found",
      );
    }
    const liveSnapshot = serializeMenuItemSnapshot(liveItem.toObject());
    const originalSnapshot = serializeMenuItemSnapshot(request.currentSnapshot ?? {});
    if (pricingFingerprint(liveSnapshot) !== pricingFingerprint(originalSnapshot)) {
      throw new AppError(
        StatusCodes.CONFLICT,
        "MENU_APPROVAL_CONFLICT",
        "Live menu pricing changed after this request was submitted. Ask the owner to submit the price change again.",
      );
    }
    liveItem.kind = proposed.kind;
    liveItem.basePrice = proposed.basePrice;
    liveItem.set("variants", proposed.variants);
    liveItem.set("addOnGroups", proposed.addOnGroups);
    await liveItem.save();
  }

  const reviewedAt = new Date();
  request.status = "approved";
  request.reviewedAt = reviewedAt;
  request.reviewedByAdminId = params.adminId;
  request.internalNote = stringValue(params.note);
  request.ownerReason = "";
  await request.save();

  await resolveAdminOperationalAlertByDedupeKey(menuApprovalDedupeKey(params.requestId));
  await notifyOwnerMenuApproval({
    ownerId,
    restaurantId,
    requestId: params.requestId,
    status: "approved",
    requestType: request.type,
    itemName: proposed.name,
  });
  emitSocketEvent(`owner:${ownerId}`, "menu.approval.updated", {
    request: serializeOwnerApproval(request.toObject()),
  });
  if (liveItem) {
    emitSocketEvent(`owner:${ownerId}`, "menu.updated", liveItem.toObject());
    emitSocketEvent(`restaurant:${restaurantId}`, "menu.updated", liveItem.toObject());
  }
  invalidateCustomerRestaurantAvailabilityCaches();

  return getAdminMenuApprovalRequest(params.requestId);
}

export async function rejectAdminMenuApprovalRequest(params: {
  requestId: string;
  adminId: string;
  ownerReason: string;
  internalNote?: string;
}) {
  const request = await MenuApprovalRequestModel.findById(params.requestId);
  if (!request) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "MENU_APPROVAL_NOT_FOUND",
      "Menu approval request not found",
    );
  }
  assertPendingApproval(request.toObject());

  const ownerReason = stringValue(params.ownerReason);
  if (!ownerReason) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "OWNER_REASON_REQUIRED",
      "Owner-facing rejection reason is required.",
    );
  }

  const reviewedAt = new Date();
  const proposed = serializeMenuItemSnapshot(request.proposedSnapshot ?? {});
  request.status = "rejected";
  request.reviewedAt = reviewedAt;
  request.reviewedByAdminId = params.adminId;
  request.ownerReason = ownerReason;
  request.internalNote = stringValue(params.internalNote);
  await request.save();

  const ownerId = idValue(request.ownerId);
  const restaurantId = idValue(request.restaurantId);
  await resolveAdminOperationalAlertByDedupeKey(menuApprovalDedupeKey(params.requestId));
  await notifyOwnerMenuApproval({
    ownerId,
    restaurantId,
    requestId: params.requestId,
    status: "rejected",
    requestType: request.type,
    itemName: proposed.name,
    reason: ownerReason,
  });
  emitSocketEvent(`owner:${ownerId}`, "menu.approval.updated", {
    request: serializeOwnerApproval(request.toObject()),
  });

  return getAdminMenuApprovalRequest(params.requestId);
}
