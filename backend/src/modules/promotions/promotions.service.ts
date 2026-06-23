import { StatusCodes } from "http-status-codes"
import mongoose from "mongoose"

import { AppError } from "../../common/utils/app-error"
import { emitSocketEvent } from "../../config/socket"
import { VoucherAuditModel, VoucherModel, VoucherRedemptionModel } from "../customer/customer.model"
import { CustomerModel } from "../customer/customer.model"
import { sendPushToCustomer } from "../customer/push.service"
import { CategoryModel, MenuItemModel, OrderModel } from "../owner/operational.model"
import { OwnerModel } from "../auth/auth.model"
import { RestaurantModel } from "../auth/auth.model"
import { buildRestaurantServiceAreaScopeFilter } from "../service-area/service-area.service"

type VoucherListParams = {
  restaurantId?: string
  zoneId?: string
  districtId?: string
  scopeType?: string
  surface?: string
  search?: string
  lifecycle?: string
  mode?: string
  type?: string
  sortBy?: string
  page?: number
  pageSize?: number
}

type VoucherAnalytics = {
  totalUses: number
  appliedCount: number
  deliveredCount: number
  uniqueUsers: number
  repeatUsage: number
  totalDiscountGiven: number
  totalOrdersUsingVoucher: number
  revenueGenerated: number
  remainingUsage: number | null
  totalDeliveryCostCovered: number
  points: Array<{
    label: string
    uses: number
    discount: number
  }>
  usageRows: Array<{
    id: string
    orderId: string
    orderNumber: string
    customerId: string
    customerName: string
    customerPhone: string
    status: string
    appliedAt: string | null
    deliveredAt: string | null
    discountAmount: number
    ownerDiscountCost: number
    platformDiscountCost: number
    revenue: number
    released: boolean
  }>
}

function emitOwnerVoucherChanged(params: {
  ownerId: string
  restaurantId: string
  action: "created" | "updated" | "deleted"
  voucherId?: string
}) {
  const payload = {
    restaurantId: params.restaurantId,
    voucherId: params.voucherId ?? "",
    action: params.action
  }
  emitSocketEvent(`owner:${params.ownerId}`, "promotion.updated", payload)
  emitSocketEvent(`restaurant:${params.restaurantId}`, "promotion.updated", payload)
}

type VoucherMutationParams = {
  restaurantId?: string
  scopeType?: "restaurant" | "selected_restaurants" | "all_restaurants"
  selectedRestaurantIds?: string[]
  audienceType?: "all_users" | "new_users" | "returning_users" | "selected_users"
  selectedCustomerIds?: string[]
  customerGroupKey?: string
  display?: {
    showOnHome?: boolean
    showInOfferStrip?: boolean
    placement?: "top" | "after_banner" | "offers_row"
    variant?: "chip" | "block" | "image" | "carousel"
    position?: number
    title?: string
    subtitle?: string
    imageUrl?: string
    carouselImageUrls?: string[]
    openInModal?: boolean
    ctaLabel?: string
    ctaPath?: string
    backgroundColor?: string
    textColor?: string
    accentColor?: string
  }
  pushCampaign?: {
    enabled?: boolean
    title?: string
    body?: string
    path?: string
  }
  fundedBy: "owner" | "platform" | "shared"
  ownerSharePercent?: number
  platformSharePercent?: number
  stackingRule: "exclusive" | "stackable"
  priority?: number
  surface?: "checkout" | "menu_markdown"
  mode: "auto" | "coupon"
  type: "flat" | "percentage" | "free_delivery"
  name: string
  code?: string
  discountValue?: number
  maxDiscountAmount?: number
  minimumOrderAmount?: number
  minItemPrice?: number
  maxTotalUses?: number
  maxUsesPerUser?: number
  allowRepeatUsage?: boolean
  maxTotalDiscountBudget?: number
  status?: "Draft" | "Active"
  applicability?: "all" | "categories" | "items"
  categoryIds?: string[]
  itemIds?: string[]
  cuisineTypes?: string[]
  zoneIds?: string[]
  districtIds?: string[]
  startsAt: string
  endsAt: string
}

type VoucherPatchParams = Partial<VoucherMutationParams>

type VoucherArchiveParams = {
  adminId: string
  voucherId: string
  reason?: string
}

type VoucherPushParams = {
  adminId: string
  voucherId: string
}

const DAY_MS = 24 * 60 * 60 * 1000

async function getOwnerRestaurant(ownerId: string) {
  const owner = await OwnerModel.findById(ownerId)

  if (!owner || !owner.activeRestaurantId || owner.restaurantLifecycleStatus !== "approved") {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "RESTAURANT_NOT_READY",
      "Restaurant must be approved before managing promotions"
    )
  }

  const restaurant = await RestaurantModel.findById(owner.activeRestaurantId)

  if (!restaurant) {
    throw new AppError(StatusCodes.NOT_FOUND, "RESTAURANT_NOT_FOUND", "Restaurant not found")
  }

  return restaurant
}

async function getAdminTargetRestaurant(restaurantId: string) {
  const restaurantObjectId = toObjectIdOrThrow(restaurantId, "Restaurant")
  const restaurant = await RestaurantModel.findById(restaurantObjectId)

  if (!restaurant) {
    throw new AppError(StatusCodes.NOT_FOUND, "RESTAURANT_NOT_FOUND", "Restaurant not found")
  }

  return restaurant
}

async function validateVoucherTargets(params: {
  restaurantId: string
  applicability: "all" | "categories" | "items"
  categoryIds?: string[]
  itemIds?: string[]
}) {
  if (params.applicability === "categories" && params.categoryIds?.length) {
    const categoriesCount = await CategoryModel.countDocuments({
      _id: { $in: params.categoryIds },
      restaurantId: params.restaurantId
    })

    if (categoriesCount !== params.categoryIds.length) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "INVALID_CATEGORY_TARGETS",
        "One or more selected categories are invalid"
      )
    }
  }

  if (params.applicability === "items" && params.itemIds?.length) {
    const itemsCount = await MenuItemModel.countDocuments({
      _id: { $in: params.itemIds },
      restaurantId: params.restaurantId
    })

    if (itemsCount !== params.itemIds.length) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "INVALID_ITEM_TARGETS",
        "One or more selected menu items are invalid"
      )
    }
  }
}

function clampPage(value?: number) {
  if (!value || Number.isNaN(value)) return 1
  return Math.max(1, Math.floor(value))
}

function clampPageSize(value?: number) {
  if (!value || Number.isNaN(value)) return 20
  return Math.min(100, Math.max(1, Math.floor(value)))
}

function toObjectIdOrThrow(value: string, label: string) {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new AppError(StatusCodes.BAD_REQUEST, "INVALID_ID", `${label} id is invalid`)
  }

  return new mongoose.Types.ObjectId(value)
}

function objectIdString(value: unknown) {
  if (!value) return ""
  if (typeof value === "string") return value
  if (value instanceof mongoose.Types.ObjectId) return value.toString()
  if (typeof value === "object" && "toString" in value) return String(value)
  return ""
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function normalizeFundingSplit(params: {
  fundedBy: "owner" | "platform" | "shared"
  ownerSharePercent?: number
  platformSharePercent?: number
}) {
  if (params.fundedBy === "owner") {
    return { ownerSharePercent: 100, platformSharePercent: 0 }
  }
  if (params.fundedBy === "platform") {
    return { ownerSharePercent: 0, platformSharePercent: 100 }
  }

  const ownerSharePercent = Math.round(numberValue(params.ownerSharePercent, 50))
  const clampedOwnerShare = Math.min(100, Math.max(0, ownerSharePercent))
  const platformSharePercent =
    params.platformSharePercent !== undefined
      ? Math.round(numberValue(params.platformSharePercent))
      : 100 - clampedOwnerShare
  const clampedPlatformShare = Math.min(100, Math.max(0, platformSharePercent))

  if (clampedOwnerShare + clampedPlatformShare !== 100) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "INVALID_FUNDING_SPLIT",
      "Owner and platform funding split must equal 100%"
    )
  }

  return {
    ownerSharePercent: clampedOwnerShare,
    platformSharePercent: clampedPlatformShare
  }
}

function assertAdminCreatedVoucherFunding(params: { fundedBy?: string }) {
  if (params.fundedBy === "owner") {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "ADMIN_VOUCHER_OWNER_FUNDED_NOT_ALLOWED",
      "Admin-created vouchers must be platform-funded or shared-funded"
    )
  }
}

function assertOwnerVoucherType(params: { type?: string }) {
  if (params.type === "free_delivery") {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "OWNER_FREE_DELIVERY_NOT_ALLOWED",
      "Restaurant owners can create flat or percentage discounts only"
    )
  }
}

function assertNotMarkdownSurface(params: { surface?: string }) {
  if (params.surface === "menu_markdown") {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "MENU_MARKDOWN_OWNER_NOT_ALLOWED",
      "Menu price markdowns are platform-funded and can only be managed by admins"
    )
  }
}

/**
 * Menu markdowns are platform-funded, code-less, and only flat/percentage. Coerce funding
 * and mode so callers can't accidentally create an owner-funded or coupon-coded markdown,
 * and reject free_delivery which makes no sense as an item price reduction.
 */
function normalizeMarkdownMutation<
  T extends Partial<VoucherMutationParams>
>(params: T): T {
  if (params.surface !== "menu_markdown") return params
  if (params.type === "free_delivery") {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "MENU_MARKDOWN_TYPE_INVALID",
      "Menu markdowns must be a flat or percentage discount"
    )
  }
  return {
    ...params,
    fundedBy: "platform",
    ownerSharePercent: 0,
    platformSharePercent: 100,
    mode: "auto",
    code: "",
    // A markdown is a shelf price, not a one-per-customer coupon: default to unlimited
    // per-user reuse unless an admin deliberately caps it.
    maxUsesPerUser: params.maxUsesPerUser ?? 0,
    allowRepeatUsage: params.allowRepeatUsage ?? true
  }
}

async function validateVoucherCuisines(params: {
  restaurantId?: string
  cuisineTypes?: string[]
}) {
  if (!params.cuisineTypes?.length) return
  if (!params.restaurantId) return
  const restaurant = await RestaurantModel.findById(params.restaurantId, {
    cuisineTypes: 1
  }).lean()
  const available = new Set((restaurant?.cuisineTypes ?? []).map((value) => String(value)))
  const invalid = params.cuisineTypes.filter((value) => !available.has(value))
  if (invalid.length) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "INVALID_CUISINE_TARGETS",
      "One or more selected cuisines are not offered by this restaurant"
    )
  }
}

function buildVoucherAuditSnapshot(voucher: Record<string, any> | null) {
  if (!voucher) return null
  return {
    fundedBy: voucher.fundedBy,
    scopeType: voucher.scopeType,
    restaurantId: objectIdString(voucher.restaurantId),
    selectedRestaurantIds: (voucher.selectedRestaurantIds ?? []).map(objectIdString),
    audienceType: voucher.audienceType,
    selectedCustomerIds: (voucher.selectedCustomerIds ?? []).map(objectIdString),
    customerGroupKey: voucher.customerGroupKey,
    display: voucher.display,
    displayAnalytics: voucher.displayAnalytics,
    pushCampaign: voucher.pushCampaign,
    ownerSharePercent: voucher.ownerSharePercent,
    platformSharePercent: voucher.platformSharePercent,
    stackingRule: voucher.stackingRule,
    priority: voucher.priority,
    surface: voucher.surface,
    mode: voucher.mode,
    type: voucher.type,
    name: voucher.name,
    code: voucher.code,
    discountValue: voucher.discountValue,
    maxDiscountAmount: voucher.maxDiscountAmount,
    minimumOrderAmount: voucher.minimumOrderAmount,
    minItemPrice: voucher.minItemPrice,
    maxTotalUses: voucher.maxTotalUses,
    maxUsesPerUser: voucher.maxUsesPerUser,
    allowRepeatUsage: voucher.allowRepeatUsage,
    maxTotalDiscountBudget: voucher.maxTotalDiscountBudget,
    status: voucher.status,
    applicability: voucher.applicability,
    categoryIds: (voucher.categoryIds ?? []).map(objectIdString),
    itemIds: (voucher.itemIds ?? []).map(objectIdString),
    cuisineTypes: voucher.cuisineTypes ?? [],
    zoneIds: voucher.zoneIds ?? [],
    districtIds: voucher.districtIds ?? [],
    startsAt: voucher.startsAt,
    endsAt: voucher.endsAt,
    archivedAt: voucher.archivedAt,
    archiveReason: voucher.archiveReason
  }
}

async function recordVoucherAudit(params: {
  voucher: Record<string, any>
  actorType: "admin" | "owner" | "system"
  actorId: string
  action: "created" | "updated" | "archived" | "restored"
  before?: Record<string, any> | null
  after?: Record<string, any> | null
  note?: string
}) {
  await VoucherAuditModel.create({
    voucherId: params.voucher._id,
    restaurantId: params.voucher.restaurantId ?? null,
    actorType: params.actorType,
    actorId: params.actorId,
    action: params.action,
    before: buildVoucherAuditSnapshot(params.before ?? null),
    after: buildVoucherAuditSnapshot(params.after ?? params.voucher),
    note: params.note ?? ""
  })
}

function formatPointLabel(value: Date) {
  return value.toLocaleDateString("en-US", { weekday: "short" })
}

function buildLastSevenPointSeed() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today.getTime() - (6 - index) * DAY_MS)
    const key = date.toISOString().slice(0, 10)

    return {
      key,
      label: formatPointLabel(date),
      uses: 0,
      discount: 0
    }
  })
}

async function buildVoucherQuery(params: VoucherListParams) {
  const query: Record<string, unknown> = {}
  const now = new Date()

  if (params.restaurantId) query.restaurantId = toObjectIdOrThrow(params.restaurantId, "Restaurant")
  if (!params.restaurantId && (params.zoneId?.trim() || params.districtId?.trim())) {
    const restaurantIds = await RestaurantModel.distinct("_id", buildRestaurantServiceAreaScopeFilter(params))
    query.$or = [
      { scopeType: "all_restaurants" },
      { restaurantId: { $in: restaurantIds } },
      { selectedRestaurantIds: { $in: restaurantIds } },
    ]
  }
  if (params.scopeType && params.scopeType !== "all") query.scopeType = params.scopeType
  if (params.surface === "all") {
    // Explicit "all" shows every surface (checkout vouchers + menu markdowns together).
  } else if (params.surface) {
    query.surface = params.surface
  } else {
    // No surface param = legacy/default behaviour: classic checkout vouchers only.
    query.surface = { $ne: "menu_markdown" }
  }
  if (params.mode && params.mode !== "all") query.mode = params.mode
  if (params.type && params.type !== "all") {
    query.type = params.type === "free-delivery" ? "free_delivery" : params.type
  }
  if (params.search?.trim()) {
    const search = params.search.trim()
    query.$and = [
      ...((query.$and as Record<string, unknown>[] | undefined) ?? []),
      {
        $or: [
          { name: { $regex: search, $options: "i" } },
          { code: { $regex: search, $options: "i" } }
        ]
      }
    ]
  }
  if (params.lifecycle && params.lifecycle !== "all") {
    if (params.lifecycle === "Archived") {
      query.archivedAt = { $ne: null }
    } else if (params.lifecycle === "Draft") {
      query.archivedAt = null
      query.status = "Draft"
    } else if (params.lifecycle === "Active") {
      query.archivedAt = null
      query.status = "Active"
      query.startsAt = { $lte: now }
      query.endsAt = { $gte: now }
    } else if (params.lifecycle === "Scheduled") {
      query.archivedAt = null
      query.status = "Active"
      query.startsAt = { $gt: now }
    } else if (params.lifecycle === "Expired") {
      query.archivedAt = null
      query.endsAt = { $lt: now }
    }
  } else {
    query.archivedAt = null
  }

  return query
}

function buildVoucherSort(sortBy?: string): Record<string, 1 | -1> {
  if (sortBy === "highestUses") return { maxTotalUses: -1, updatedAt: -1 }
  if (sortBy === "highestDiscount") return { discountValue: -1, updatedAt: -1 }
  if (sortBy === "endingSoon") return { endsAt: 1, updatedAt: -1 }
  return { updatedAt: -1 }
}

async function attachVoucherAnalytics(vouchers: Array<Record<string, any>>) {
  if (!vouchers.length) return []

  const voucherIds = vouchers.map((voucher) => voucher._id)
  const categoryIds = [
    ...new Set(vouchers.flatMap((voucher) => (voucher.categoryIds ?? []).map(objectIdString)))
  ].filter(Boolean)
  const itemIds = [
    ...new Set(vouchers.flatMap((voucher) => (voucher.itemIds ?? []).map(objectIdString)))
  ].filter(Boolean)
  const restaurantIds = [
    ...new Set(
      vouchers.flatMap((voucher) => [
        objectIdString(voucher.restaurantId),
        ...(voucher.selectedRestaurantIds ?? []).map(objectIdString)
      ])
    )
  ].filter(Boolean)

  const [redemptions, categories, items, restaurants, auditRows] = await Promise.all([
    VoucherRedemptionModel.aggregate<Record<string, any>>([
      { $match: { voucherId: { $in: voucherIds } } },
      {
        $lookup: {
          from: OrderModel.collection.name,
          localField: "orderId",
          foreignField: "_id",
          as: "orderDocs"
        }
      },
      {
        $addFields: {
          order: { $arrayElemAt: ["$orderDocs", 0] }
        }
      },
      {
        $project: {
          voucherId: 1,
          voucherSnapshot: 1,
          discountBreakdown: 1,
          releasedAt: 1,
          appliedAt: 1,
          createdAt: 1,
          "order.status": 1,
          "order.orderNumber": 1,
          "order.customerId": 1,
          "order.customerSnapshot": 1,
          "order.pricing": 1,
          "order.timestamps": 1
        }
      }
    ]),
    categoryIds.length
      ? CategoryModel.find({ _id: { $in: categoryIds } }, { name: 1 }).lean()
      : [],
    itemIds.length
      ? MenuItemModel.find({ _id: { $in: itemIds } }, { name: 1 }).lean()
      : [],
    restaurantIds.length
      ? RestaurantModel.find(
          { _id: { $in: restaurantIds } },
          { name: 1, city: 1, address: 1 }
        ).lean()
      : [],
    VoucherAuditModel.find({ voucherId: { $in: voucherIds } })
      .sort({ createdAt: -1 })
      .limit(voucherIds.length * 5)
      .lean()
  ])

  const categoryNameMap = new Map(categories.map((category) => [objectIdString(category._id), category.name]))
  const itemNameMap = new Map(items.map((item) => [objectIdString(item._id), item.name]))
  const restaurantMap = new Map(
    restaurants.map((restaurant) => [
      objectIdString(restaurant._id),
      {
        id: objectIdString(restaurant._id),
        name: restaurant.name ?? "Restaurant",
        city: restaurant.address?.city ?? "",
        address: restaurant.address?.address ?? ""
      }
    ])
  )
  const redemptionsByVoucher = new Map<string, Array<Record<string, any>>>()
  const auditsByVoucher = new Map<string, Array<Record<string, any>>>()

  redemptions.forEach((redemption) => {
    const voucherId = objectIdString(redemption.voucherId)
    const current = redemptionsByVoucher.get(voucherId) ?? []
    current.push(redemption)
    redemptionsByVoucher.set(voucherId, current)
  })

  auditRows.forEach((audit) => {
    const voucherId = objectIdString(audit.voucherId)
    const current = auditsByVoucher.get(voucherId) ?? []
    current.push({
      id: objectIdString(audit._id),
      actorType: audit.actorType,
      actorId: audit.actorId,
      action: audit.action,
      note: audit.note,
      createdAt: audit.createdAt
    })
    auditsByVoucher.set(voucherId, current)
  })

  return vouchers.map((voucher) => {
    const voucherId = objectIdString(voucher._id)
    const voucherRedemptions = redemptionsByVoucher.get(voucherId) ?? []
    const uniqueUsers = new Set<string>()
    const pointSeed = buildLastSevenPointSeed()
    const pointsByKey = new Map(pointSeed.map((point) => [point.key, point]))
    let totalDiscountGiven = 0
    let totalOrdersUsingVoucher = 0
    let revenueGenerated = 0
    let totalDeliveryCostCovered = 0
    let totalUses = 0
    const usageRows: VoucherAnalytics["usageRows"] = []

    voucherRedemptions.forEach((redemption) => {
      const discountAmount = numberValue(
        redemption.discountBreakdown?.discountAmount,
        numberValue(redemption.order?.pricing?.discountAmount)
      )
      const ownerDiscountCost = numberValue(
        redemption.discountBreakdown?.ownerDiscountCost,
        numberValue(redemption.discountBreakdown?.ownerFundedAmount)
      )
      const platformDiscountCost = numberValue(
        redemption.discountBreakdown?.platformDiscountCost,
        numberValue(redemption.discountBreakdown?.platformFundedAmount)
      )
      const customerId =
        objectIdString(redemption.voucherSnapshot?.customerId) ||
        objectIdString(redemption.order?.customerId)
      const appliedAt = redemption.appliedAt ?? redemption.createdAt
      usageRows.push({
        id: objectIdString(redemption._id),
        orderId: objectIdString(redemption.orderId),
        orderNumber: String(redemption.order?.orderNumber ?? ""),
        customerId,
        customerName: String(
          redemption.order?.customerSnapshot?.fullName ??
            redemption.order?.customerSnapshot?.name ??
            "Customer"
        ),
        customerPhone: String(redemption.order?.customerSnapshot?.phone ?? ""),
        status: String(redemption.order?.status ?? ""),
        appliedAt:
          appliedAt && !Number.isNaN(new Date(appliedAt).getTime())
            ? new Date(appliedAt).toISOString()
            : null,
        deliveredAt: redemption.order?.timestamps?.deliveredAt
          ? new Date(redemption.order.timestamps.deliveredAt).toISOString()
          : redemption.order?.timestamps?.Delivered
            ? new Date(redemption.order.timestamps.Delivered).toISOString()
            : null,
        discountAmount,
        ownerDiscountCost,
        platformDiscountCost,
        revenue: numberValue(redemption.order?.pricing?.total),
        released: Boolean(redemption.releasedAt)
      })

      if (
        redemption.releasedAt ||
        ["Cancelled", "Rejected"].includes(redemption.order?.status)
      ) {
        return
      }

      totalUses += 1
      if (customerId) uniqueUsers.add(customerId)

      const appliedDate = appliedAt ? new Date(appliedAt) : null
      const pointKey =
        appliedDate && !Number.isNaN(appliedDate.getTime())
          ? appliedDate.toISOString().slice(0, 10)
          : ""
      const point = pointsByKey.get(pointKey)
      if (point) point.uses += 1

      if (redemption.order?.status !== "Delivered") return

      totalDiscountGiven += discountAmount
      totalOrdersUsingVoucher += 1
      revenueGenerated += numberValue(redemption.order?.pricing?.total)
      if (voucher.type === "free_delivery") totalDeliveryCostCovered += discountAmount
      if (point) point.discount += discountAmount
    })

    const maxTotalUses = numberValue(voucher.maxTotalUses)
    const remainingUsage = maxTotalUses > 0 ? Math.max(0, maxTotalUses - totalUses) : null
    const analytics: VoucherAnalytics = {
      totalUses,
      appliedCount: totalUses,
      deliveredCount: totalOrdersUsingVoucher,
      uniqueUsers: uniqueUsers.size,
      repeatUsage: Math.max(0, totalUses - uniqueUsers.size),
      totalDiscountGiven,
      totalOrdersUsingVoucher,
      revenueGenerated,
      remainingUsage,
      totalDeliveryCostCovered,
      points: pointSeed.map(({ label, uses, discount }) => ({ label, uses, discount })),
      usageRows: usageRows
        .sort((left, right) => {
          const leftTime = left.appliedAt ? new Date(left.appliedAt).getTime() : 0
          const rightTime = right.appliedAt ? new Date(right.appliedAt).getTime() : 0
          return rightTime - leftTime
        })
        .slice(0, 50)
    }

    return {
      ...voucher,
      maxTotalUses: maxTotalUses > 0 ? maxTotalUses : null,
      maxDiscountAmount: numberValue(voucher.maxDiscountAmount),
      restaurant: restaurantMap.get(objectIdString(voucher.restaurantId)) ?? null,
      selectedRestaurants: (voucher.selectedRestaurantIds ?? []).map((id: unknown) =>
        restaurantMap.get(objectIdString(id))
      ).filter(Boolean),
      display: voucher.display ?? {},
      displayAnalytics: voucher.displayAnalytics ?? {},
      pushCampaign: voucher.pushCampaign ?? {},
      recentAudits: auditsByVoucher.get(voucherId) ?? [],
      analytics,
      targetCategories: (voucher.categoryIds ?? []).map((id: unknown) => ({
        id: objectIdString(id),
        name: categoryNameMap.get(objectIdString(id)) ?? "Category"
      })),
      targetItems: (voucher.itemIds ?? []).map((id: unknown) => ({
        id: objectIdString(id),
        name: itemNameMap.get(objectIdString(id)) ?? "Menu item"
      }))
    }
  })
}

function buildVoucherCreatePayload(params: VoucherMutationParams & {
  restaurantId?: string
  createdByType: "owner" | "admin"
  createdById: string
}) {
  const scopeType = params.scopeType ?? "restaurant"
  const applicability = params.applicability ?? "all"
  const fundingSplit = normalizeFundingSplit({
    fundedBy: params.fundedBy,
    ownerSharePercent: params.ownerSharePercent,
    platformSharePercent: params.platformSharePercent
  })

  return {
    restaurantId: scopeType === "restaurant" ? params.restaurantId : null,
    scopeType,
    selectedRestaurantIds:
      scopeType === "selected_restaurants" ? params.selectedRestaurantIds ?? [] : [],
    audienceType: params.audienceType ?? "all_users",
    selectedCustomerIds: params.audienceType === "selected_users" ? params.selectedCustomerIds ?? [] : [],
    customerGroupKey: params.customerGroupKey ?? "",
    display: {
      showOnHome: params.display?.showOnHome ?? false,
      showInOfferStrip: params.display?.showInOfferStrip ?? true,
      placement: params.display?.placement ?? "offers_row",
      variant: params.display?.variant ?? "chip",
      position: params.display?.position ?? 0,
      title: params.display?.title ?? "",
      subtitle: params.display?.subtitle ?? "",
      imageUrl: params.display?.imageUrl ?? "",
      carouselImageUrls: params.display?.carouselImageUrls ?? [],
      openInModal: params.display?.openInModal ?? false,
      ctaLabel: params.display?.ctaLabel ?? "",
      ctaPath: params.display?.ctaPath ?? "",
      backgroundColor: params.display?.backgroundColor ?? "#FFF0F6",
      textColor: params.display?.textColor ?? "#3F2432",
      accentColor: params.display?.accentColor ?? "#FF5C93"
    },
    pushCampaign: {
      enabled: params.pushCampaign?.enabled ?? false,
      title: params.pushCampaign?.title ?? "",
      body: params.pushCampaign?.body ?? "",
      path: params.pushCampaign?.path ?? ""
    },
    createdByType: params.createdByType,
    createdById: params.createdById,
    fundedBy: params.fundedBy,
    ownerSharePercent: fundingSplit.ownerSharePercent,
    platformSharePercent: fundingSplit.platformSharePercent,
    stackingRule: params.stackingRule,
    priority: params.priority ?? 0,
    surface: params.surface ?? "checkout",
    mode: params.mode,
    type: params.type,
    name: params.name,
    code: params.mode === "coupon" ? params.code ?? "" : "",
    discountValue: params.discountValue ?? 0,
    maxDiscountAmount: params.maxDiscountAmount ?? 0,
    minimumOrderAmount: params.minimumOrderAmount ?? 0,
    minItemPrice: params.minItemPrice ?? 0,
    maxTotalUses: params.maxTotalUses ?? 0,
    maxUsesPerUser: params.maxUsesPerUser ?? 1,
    allowRepeatUsage: params.allowRepeatUsage ?? false,
    maxTotalDiscountBudget: params.maxTotalDiscountBudget ?? 0,
    consumedDiscountBudget: 0,
    status: params.status ?? "Draft",
    applicability: scopeType === "restaurant" ? applicability : "all",
    categoryIds: scopeType === "restaurant" && applicability === "categories" ? params.categoryIds ?? [] : [],
    itemIds: scopeType === "restaurant" && applicability === "items" ? params.itemIds ?? [] : [],
    cuisineTypes: params.cuisineTypes ?? [],
    zoneIds: params.zoneIds ?? [],
    districtIds: params.districtIds ?? [],
    startsAt: new Date(params.startsAt),
    endsAt: new Date(params.endsAt)
  }
}

async function applyVoucherPatch(
  voucher: any,
  params: VoucherPatchParams,
  restaurantId: string
) {
  if (!voucher) {
    throw new AppError(StatusCodes.NOT_FOUND, "VOUCHER_NOT_FOUND", "Voucher not found")
  }

  const scopeType = params.scopeType ?? voucher.scopeType ?? "restaurant"
  const applicability = params.applicability ?? voucher.applicability
  const categoryIds =
    params.categoryIds ??
    (Array.isArray(voucher.categoryIds) ? voucher.categoryIds.map(objectIdString) : [])
  const itemIds =
    params.itemIds ??
    (Array.isArray(voucher.itemIds) ? voucher.itemIds.map(objectIdString) : [])
  if (scopeType === "restaurant") {
    await validateVoucherTargets({
      restaurantId,
      applicability,
      categoryIds,
      itemIds
    })
  }

  if (params.fundedBy !== undefined) voucher.fundedBy = params.fundedBy
  if (
    params.fundedBy !== undefined ||
    params.ownerSharePercent !== undefined ||
    params.platformSharePercent !== undefined
  ) {
    const split = normalizeFundingSplit({
      fundedBy: params.fundedBy ?? voucher.fundedBy,
      ownerSharePercent: params.ownerSharePercent ?? voucher.ownerSharePercent,
      platformSharePercent: params.platformSharePercent ?? voucher.platformSharePercent
    })
    voucher.ownerSharePercent = split.ownerSharePercent
    voucher.platformSharePercent = split.platformSharePercent
  }
  if (params.stackingRule !== undefined) voucher.stackingRule = params.stackingRule
  if (params.priority !== undefined) voucher.priority = params.priority
  if (params.surface !== undefined) voucher.surface = params.surface
  if (params.mode !== undefined) voucher.mode = params.mode
  if (params.type !== undefined) voucher.type = params.type
  if (params.name !== undefined) voucher.name = params.name
  if (params.code !== undefined) voucher.code = voucher.mode === "coupon" ? params.code : ""
  if (params.discountValue !== undefined) voucher.discountValue = params.discountValue
  if (params.maxDiscountAmount !== undefined) voucher.maxDiscountAmount = params.maxDiscountAmount
  if (params.minimumOrderAmount !== undefined)
    voucher.minimumOrderAmount = params.minimumOrderAmount
  if (params.minItemPrice !== undefined) voucher.minItemPrice = params.minItemPrice
  if (params.maxTotalUses !== undefined) voucher.maxTotalUses = params.maxTotalUses
  if (params.maxUsesPerUser !== undefined) voucher.maxUsesPerUser = params.maxUsesPerUser
  if (params.allowRepeatUsage !== undefined) voucher.allowRepeatUsage = params.allowRepeatUsage
  if (params.maxTotalDiscountBudget !== undefined)
    voucher.maxTotalDiscountBudget = params.maxTotalDiscountBudget
  if (params.cuisineTypes !== undefined) voucher.cuisineTypes = params.cuisineTypes
  if (params.zoneIds !== undefined) voucher.zoneIds = params.zoneIds
  if (params.districtIds !== undefined) voucher.districtIds = params.districtIds
  if (params.status !== undefined) voucher.status = params.status
  if (params.scopeType !== undefined) voucher.scopeType = params.scopeType
  if (params.selectedRestaurantIds !== undefined) voucher.selectedRestaurantIds = params.selectedRestaurantIds
  if (params.audienceType !== undefined) voucher.audienceType = params.audienceType
  if (params.selectedCustomerIds !== undefined) voucher.selectedCustomerIds = params.selectedCustomerIds
  if (params.customerGroupKey !== undefined) voucher.customerGroupKey = params.customerGroupKey
  if (params.display !== undefined) voucher.display = { ...(voucher.display?.toObject?.() ?? voucher.display ?? {}), ...params.display }
  if (params.pushCampaign !== undefined)
    voucher.pushCampaign = { ...(voucher.pushCampaign?.toObject?.() ?? voucher.pushCampaign ?? {}), ...params.pushCampaign }
  voucher.applicability = scopeType === "restaurant" ? applicability : "all"
  voucher.categoryIds =
    scopeType === "restaurant" && applicability === "categories"
      ? categoryIds as never[]
      : []
  voucher.itemIds =
    scopeType === "restaurant" && applicability === "items"
      ? itemIds as never[]
      : []
  if (params.startsAt !== undefined) voucher.startsAt = new Date(params.startsAt)
  if (params.endsAt !== undefined) voucher.endsAt = new Date(params.endsAt)

  await voucher.save()
  return voucher
}

export async function listOwnerVouchers(ownerId: string) {
  return listOwnerVouchersWithFilters({ ownerId })
}

export async function listOwnerVouchersWithFilters(params: {
  ownerId: string
  search?: string
  lifecycle?: string
  mode?: string
  type?: string
  sortBy?: string
  page?: number
  pageSize?: number
}) {
  const restaurant = await getOwnerRestaurant(params.ownerId)
  const query = await buildVoucherQuery({
    ...params,
    restaurantId: restaurant.id
  })
  query.createdByType = "owner"
  query.createdById = params.ownerId
  const page = clampPage(params.page)
  const pageSize = clampPageSize(params.pageSize)
  const [items, total] = await Promise.all([
    VoucherModel.find(query).sort(buildVoucherSort(params.sortBy)).skip((page - 1) * pageSize).limit(pageSize).lean(),
    VoucherModel.countDocuments(query)
  ])

  return {
    items: await attachVoucherAnalytics(items),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize))
  }
}

export async function createOwnerVoucher(params: VoucherMutationParams & { ownerId: string }) {
  assertOwnerVoucherType({ type: params.type })
  assertNotMarkdownSurface(params)
  const restaurant = await getOwnerRestaurant(params.ownerId)
  const applicability = params.applicability ?? "all"
  await validateVoucherTargets({
    restaurantId: restaurant.id,
    applicability,
    categoryIds: params.categoryIds,
    itemIds: params.itemIds
  })

  const voucher = await VoucherModel.create(
    buildVoucherCreatePayload({
      ...params,
      restaurantId: restaurant.id,
      scopeType: "restaurant",
      selectedRestaurantIds: [],
      fundedBy: "owner",
      ownerSharePercent: 100,
      platformSharePercent: 0,
      createdByType: "owner",
      createdById: params.ownerId
    })
  )
  await recordVoucherAudit({
    voucher: voucher.toObject(),
    actorType: "owner",
    actorId: params.ownerId,
    action: "created"
  })
  emitOwnerVoucherChanged({
    ownerId: params.ownerId,
    restaurantId: restaurant.id,
    action: "created",
    voucherId: voucher.id
  })
  return voucher
}

export async function updateOwnerVoucher(params: VoucherPatchParams & {
  ownerId: string
  voucherId: string
}) {
  assertOwnerVoucherType({ type: params.type })
  assertNotMarkdownSurface(params)
  const restaurant = await getOwnerRestaurant(params.ownerId)
  const voucher = await VoucherModel.findOne({
    _id: params.voucherId,
    restaurantId: restaurant.id,
    createdByType: "owner",
    createdById: params.ownerId
  })

  const before = voucher?.toObject()
  const updated = await applyVoucherPatch(
    voucher,
    {
      ...params,
      scopeType: "restaurant",
      selectedRestaurantIds: [],
      fundedBy: "owner",
      ownerSharePercent: 100,
      platformSharePercent: 0
    },
    restaurant.id
  )
  await recordVoucherAudit({
    voucher: updated.toObject(),
    actorType: "owner",
    actorId: params.ownerId,
    action: "updated",
    before,
    after: updated.toObject()
  })
  emitOwnerVoucherChanged({
    ownerId: params.ownerId,
    restaurantId: restaurant.id,
    action: "updated",
    voucherId: updated.id
  })
  return updated
}

export async function createAdminVoucher(params: VoucherMutationParams & {
  adminId: string
}) {
  params = normalizeMarkdownMutation(params)
  assertAdminCreatedVoucherFunding({ fundedBy: params.fundedBy })
  const scopeType = params.scopeType ?? "restaurant"
  const restaurant =
    scopeType === "restaurant" && params.restaurantId
      ? await getAdminTargetRestaurant(params.restaurantId)
      : null
  if (scopeType === "restaurant" && !restaurant) {
    throw new AppError(StatusCodes.BAD_REQUEST, "RESTAURANT_REQUIRED", "Restaurant is required")
  }
  if (scopeType === "selected_restaurants" && !params.selectedRestaurantIds?.length) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "RESTAURANTS_REQUIRED",
      "Select at least one restaurant"
    )
  }
  if (params.audienceType === "selected_users" && !params.selectedCustomerIds?.length) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "CUSTOMERS_REQUIRED",
      "Select at least one customer"
    )
  }
  const applicability = params.applicability ?? "all"
  if (restaurant) {
    await validateVoucherTargets({
      restaurantId: restaurant.id,
      applicability,
      categoryIds: params.categoryIds,
      itemIds: params.itemIds
    })
    await validateVoucherCuisines({
      restaurantId: restaurant.id,
      cuisineTypes: params.cuisineTypes
    })
  }

  const voucher = await VoucherModel.create(
    buildVoucherCreatePayload({
      ...params,
      restaurantId: restaurant?.id,
      scopeType,
      createdByType: "admin",
      createdById: params.adminId
    })
  )
  await recordVoucherAudit({
    voucher: voucher.toObject(),
    actorType: "admin",
    actorId: params.adminId,
    action: "created"
  })
  return voucher
}

export async function updateAdminVoucher(params: VoucherPatchParams & {
  adminId: string
  voucherId: string
}) {
  const voucher = await VoucherModel.findById(params.voucherId)

  if (!voucher) {
    throw new AppError(StatusCodes.NOT_FOUND, "VOUCHER_NOT_FOUND", "Voucher not found")
  }

  const before = voucher.toObject()
  const effectiveSurface = params.surface ?? voucher.surface
  if (effectiveSurface === "menu_markdown") {
    params = normalizeMarkdownMutation({ ...params, surface: "menu_markdown" })
  }
  if (voucher.createdByType === "admin") {
    assertAdminCreatedVoucherFunding({ fundedBy: params.fundedBy })
  }
  await validateVoucherCuisines({
    restaurantId: objectIdString(voucher.restaurantId),
    cuisineTypes: params.cuisineTypes
  })
  const updated = await applyVoucherPatch(voucher, params, objectIdString(voucher.restaurantId))
  await recordVoucherAudit({
    voucher: updated.toObject(),
    actorType: "admin",
    actorId: params.adminId,
    action: "updated",
    before,
    after: updated.toObject()
  })
  return updated
}

export async function archiveAdminVoucher(params: VoucherArchiveParams) {
  const voucher = await VoucherModel.findById(params.voucherId)
  if (!voucher) {
    throw new AppError(StatusCodes.NOT_FOUND, "VOUCHER_NOT_FOUND", "Voucher not found")
  }
  const before = voucher.toObject()
  const archivedAt = new Date()
  voucher.archivedAt = archivedAt
  voucher.archivedByAdminId = params.adminId
  voucher.archiveReason = params.reason ?? ""
  await voucher.save()
  await CustomerModel.updateMany(
    {
      notifications: {
        $elemMatch: {
          personalOffer: true,
          voucherId: objectIdString(voucher._id)
        }
      }
    },
    {
      $set: {
        "notifications.$[offer].voucherExpiresAt": archivedAt
      }
    },
    {
      arrayFilters: [
        {
          "offer.personalOffer": true,
          "offer.voucherId": objectIdString(voucher._id)
        }
      ]
    }
  )
  await recordVoucherAudit({
    voucher: voucher.toObject(),
    actorType: "admin",
    actorId: params.adminId,
    action: "archived",
    before,
    after: voucher.toObject(),
    note: params.reason
  })
  return voucher
}

export async function restoreAdminVoucher(params: VoucherArchiveParams) {
  const voucher = await VoucherModel.findById(params.voucherId)
  if (!voucher) {
    throw new AppError(StatusCodes.NOT_FOUND, "VOUCHER_NOT_FOUND", "Voucher not found")
  }
  const before = voucher.toObject()
  voucher.archivedAt = null
  voucher.archivedByAdminId = ""
  voucher.archiveReason = ""
  await voucher.save()
  await recordVoucherAudit({
    voucher: voucher.toObject(),
    actorType: "admin",
    actorId: params.adminId,
    action: "restored",
    before,
    after: voucher.toObject()
  })
  return voucher
}

async function buildVoucherPushCustomerQuery(voucher: Record<string, any>) {
  const query: Record<string, any> = { status: "active" }
  if (voucher.audienceType === "selected_users") {
    query._id = { $in: voucher.selectedCustomerIds ?? [] }
  } else if (voucher.audienceType === "new_users") {
    query._id = {
      $nin: await OrderModel.distinct("customerId", {})
    }
  } else if (voucher.audienceType === "returning_users") {
    query._id = {
      $in: await OrderModel.distinct("customerId", {})
    }
  } else if (voucher.customerGroupKey === "has_push_token") {
    query["pushTokens.0"] = { $exists: true }
  }
  return query
}

export async function sendAdminVoucherPushCampaign(params: VoucherPushParams) {
  const voucher = await VoucherModel.findById(params.voucherId).lean()
  if (!voucher) {
    throw new AppError(StatusCodes.NOT_FOUND, "VOUCHER_NOT_FOUND", "Voucher not found")
  }
  const campaign = (voucher as any).pushCampaign ?? {}
  if (!campaign.enabled || !campaign.title || !campaign.body) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "PUSH_CAMPAIGN_NOT_READY",
      "Push campaign title and body are required"
    )
  }
  const customerQuery = await buildVoucherPushCustomerQuery(voucher as any)
  const customers = await CustomerModel.find(customerQuery, { _id: 1 }).limit(5000).lean()
  let sentCount = 0
  let disabledCount = 0
  const sentExpoTokens = new Set<string>()
  for (const customer of customers) {
    const result = await sendPushToCustomer({
      customerId: objectIdString(customer._id),
      excludeExpoTokens: sentExpoTokens,
      payload: {
        title: campaign.title,
        body: campaign.body,
        data: {
          type: "promotion",
          path: campaign.path || (voucher as any).display?.ctaPath || "/(tabs)/browse",
          voucherId: objectIdString((voucher as any)._id)
        }
      }
    })
    sentCount += result.sent
    disabledCount += result.disabled
    result.sentExpoTokens.forEach((token) => sentExpoTokens.add(token))
  }
  await VoucherModel.updateOne(
    { _id: params.voucherId },
    {
      $set: {
        "pushCampaign.sentAt": new Date(),
        "pushCampaign.sentByAdminId": params.adminId,
        "pushCampaign.totalTargets": customers.length,
        "pushCampaign.sentCount": sentCount,
        "pushCampaign.disabledCount": disabledCount
      }
    }
  )
  return {
    totalTargets: customers.length,
    sentCount,
    disabledCount
  }
}

export async function recordVoucherDisplayEvent(params: {
  voucherId: string
  eventType: "impression" | "click" | "modal_open" | "strip_click"
}) {
  if (!mongoose.Types.ObjectId.isValid(params.voucherId)) {
    return { recorded: false }
  }
  const incrementKey =
    params.eventType === "modal_open"
      ? "displayAnalytics.modalOpens"
      : params.eventType === "strip_click"
        ? "displayAnalytics.stripClicks"
        : params.eventType === "click"
          ? "displayAnalytics.clicks"
          : "displayAnalytics.impressions"

  await VoucherModel.updateOne(
    { _id: params.voucherId },
    {
      $inc: { [incrementKey]: 1 },
      $set: { "displayAnalytics.lastEventAt": new Date() }
    }
  )
  return { recorded: true }
}

export async function recordVoucherPushOpenEvent(params: {
  voucherId: string
  customerId: string
  path?: string
}) {
  if (!mongoose.Types.ObjectId.isValid(params.voucherId)) {
    return { recorded: false }
  }
  const customer = await CustomerModel.findById(params.customerId)
    .select("fullName phone")
    .lean()
  await VoucherModel.updateOne(
    { _id: params.voucherId },
    {
      $inc: { "pushCampaign.openCount": 1 },
      $push: {
        "pushCampaign.openEvents": {
          $each: [
            {
              customerId: params.customerId,
              customerName: String(customer?.fullName ?? ""),
              customerPhone: String(customer?.phone ?? ""),
              openedAt: new Date(),
              path: params.path ?? "",
            },
          ],
          $position: 0,
          $slice: 100,
        },
      },
    }
  )
  return { recorded: true }
}

export async function listAdminVouchers(params: VoucherListParams = {}) {
  const page = clampPage(params.page)
  const pageSize = clampPageSize(params.pageSize)
  const query = await buildVoucherQuery(params)
  const [items, total] = await Promise.all([
    VoucherModel.find(query).sort(buildVoucherSort(params.sortBy)).skip((page - 1) * pageSize).limit(pageSize).lean(),
    VoucherModel.countDocuments(query)
  ])

  return {
    items: await attachVoucherAnalytics(items),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize))
  }
}

export async function deleteOwnerVoucher(params: { ownerId: string; voucherId: string }) {
  const restaurant = await getOwnerRestaurant(params.ownerId)
  const voucher = await VoucherModel.findOne({
    _id: params.voucherId,
    restaurantId: restaurant.id,
    createdByType: "owner",
    createdById: params.ownerId
  })

  if (!voucher) {
    throw new AppError(StatusCodes.NOT_FOUND, "VOUCHER_NOT_FOUND", "Voucher not found")
  }

  await VoucherModel.deleteOne({
    _id: params.voucherId,
    restaurantId: restaurant.id,
    createdByType: "owner",
    createdById: params.ownerId
  })
  emitOwnerVoucherChanged({
    ownerId: params.ownerId,
    restaurantId: restaurant.id,
    action: "deleted",
    voucherId: params.voucherId
  })
  return { deleted: true }
}
