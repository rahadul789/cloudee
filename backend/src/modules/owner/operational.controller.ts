import type { Response } from "express"
import { StatusCodes } from "http-status-codes"
import { z } from "zod"

import type { AuthenticatedRequest } from "../../common/middleware/auth"
import { AppError } from "../../common/utils/app-error"
import { asyncHandler } from "../../common/utils/async-handler"
import { sendSuccess } from "../../common/utils/api-response"
import {
  deleteCategoryPermanently,
  deleteMenuItemPermanently,
  createCategory,
  createMenuItem,
  extendOrderPreparation,
  getOrderById,
  getOwnerSidebarSummary,
  assignOwnerRiderToOrder,
  listCategories,
  listCategoriesWithFilters,
  listMenuItems,
  listMenuItemsWithFilters,
  listNotifications,
  listNotificationsWithFilters,
  listOrders,
  listOwnerRidersForAssignment,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  transitionOrder,
  updateCategory,
  updateMenuItem
} from "./operational.service"
import { listOwnerMenuApprovalRequests } from "./menu-approval.service"
import {
  MAX_CATALOG_DESCRIPTION_LIMIT,
  getCatalogDescriptionLimits,
} from "./catalog-limits"

const categoryCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().max(MAX_CATALOG_DESCRIPTION_LIMIT).optional()
})

const categoryUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().max(MAX_CATALOG_DESCRIPTION_LIMIT).optional(),
  status: z.enum(["active", "archived"]).optional(),
  displayOrder: z.number().int().min(0).optional()
})

const menuItemCreateSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().max(MAX_CATALOG_DESCRIPTION_LIMIT).optional(),
  images: z.array(z.object({ url: z.string().optional(), publicId: z.string().optional() })).optional(),
  status: z.enum(["active", "archived"]).default("active"),
  availability: z.enum(["available", "unavailable"]).default("available"),
  kind: z.enum(["simple", "variant"]).default("simple"),
  basePrice: z.number().min(0),
  variants: z.array(z.unknown()).optional(),
  addOnGroups: z.array(z.unknown()).optional(),
  recommendedItemIds: z.array(z.string().min(1)).optional(),
  isPopular: z.boolean().optional()
})

const menuItemUpdateSchema = z.object({
  categoryId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().max(MAX_CATALOG_DESCRIPTION_LIMIT).optional(),
  images: z.array(z.object({ url: z.string().optional(), publicId: z.string().optional() })).optional(),
  status: z.enum(["active", "archived"]).optional(),
  availability: z.enum(["available", "unavailable"]).optional(),
  kind: z.enum(["simple", "variant"]).optional(),
  basePrice: z.number().min(0).optional(),
  variants: z.array(z.unknown()).optional(),
  addOnGroups: z.array(z.unknown()).optional(),
  recommendedItemIds: z.array(z.string().min(1)).optional(),
  isPopular: z.boolean().optional()
})

const categoryListQuerySchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  sortBy: z
    .enum(["displayOrder", "nameAsc", "nameDesc", "newestUpdated", "oldestCreated", "mostItems"])
    .optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional()
})

const menuItemsListQuerySchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  availability: z.enum(["all", "available", "unavailable"]).optional(),
  categoryId: z.string().optional(),
  popularFilter: z.enum(["all", "popular", "regular"]).optional(),
  sortBy: z.enum(["newestUpdated", "nameAsc", "nameDesc", "priceHigh", "priceLow"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional()
})

const menuApprovalListQuerySchema = z.object({
  status: z
    .enum(["active", "pending", "approved", "rejected", "cancelled", "superseded"])
    .optional()
})

const orderTransitionSchema = z.object({
  nextStatus: z.enum(["Accepted", "Rejected", "Preparing", "ReadyForPickup", "Cancelled"]),
  actor: z.literal("owner"),
  note: z.string().optional()
})

const assignOwnerRiderSchema = z.object({
  riderId: z.string().min(1)
})

const orderPreparationExtendSchema = z.object({
  minutes: z.union([z.literal(5), z.literal(10)])
})

const listOrdersQuerySchema = z.object({
  tab: z.enum(["live", "history"]).optional(),
  status: z.string().optional(),
  search: z.string().optional(),
  paymentMethod: z.string().optional(),
  sortBy: z.enum(["latest", "oldest", "highestValue"]).optional(),
  preset: z.enum(["today", "yesterday", "last7Days", "last30Days", "last90Days", "thisWeek", "thisMonth", "lastMonth", "lifetime", "custom"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  dateBasis: z.enum(["created", "history", "activity"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(500).optional()
})

const listNotificationsQuerySchema = z.object({
  filter: z.enum(["all", "unread", "order", "payout", "system", "promotion", "support", "review"]).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional()
})

function getOwnerId(req: AuthenticatedRequest) {
  return req.user?.id ?? ""
}

function getStringParam(value: unknown) {
  if (typeof value === "string") return value
  if (Array.isArray(value)) {
    const firstValue = value[0]
    return typeof firstValue === "string" ? firstValue : ""
  }
  return ""
}

function assertCatalogDescriptionLimit(
  value: string | undefined,
  maxLength: number,
  label: string
) {
  if (value === undefined || value.length <= maxLength) return

  throw new AppError(
    StatusCodes.BAD_REQUEST,
    "DESCRIPTION_TOO_LONG",
    `${label} description must be ${maxLength} characters or fewer.`
  )
}

export const getOwnerCategories = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const query = categoryListQuerySchema.parse({
    search: getStringParam(req.query.search) || undefined,
    status: getStringParam(req.query.status) || undefined,
    sortBy: getStringParam(req.query.sortBy) || undefined,
    page: getStringParam(req.query.page) || undefined,
    pageSize: getStringParam(req.query.pageSize) || undefined
  })
  const data =
    query.search || query.status || query.sortBy || query.page || query.pageSize
      ? await listCategoriesWithFilters({
          ownerId: getOwnerId(req),
          ...query
        })
      : await listCategories(getOwnerId(req))
  return sendSuccess(res, { data })
})

export const postOwnerCategory = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const payload = categoryCreateSchema.parse(req.body)
  const limits = await getCatalogDescriptionLimits()
  assertCatalogDescriptionLimit(payload.description, limits.category, "Category")
  const data = await createCategory({
    ownerId: getOwnerId(req),
    ...payload
  })
  return sendSuccess(res, { message: "Category created successfully", data })
})

export const patchOwnerCategory = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const payload = categoryUpdateSchema.parse(req.body)
  const limits = await getCatalogDescriptionLimits()
  assertCatalogDescriptionLimit(payload.description, limits.category, "Category")
  const data = await updateCategory({
    ownerId: getOwnerId(req),
    categoryId: getStringParam(req.params.categoryId),
    ...payload
  })
  return sendSuccess(res, { message: "Category updated successfully", data })
})

export const deleteOwnerCategory = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = await deleteCategoryPermanently({
    ownerId: getOwnerId(req),
    categoryId: getStringParam(req.params.categoryId)
  })
  return sendSuccess(res, { message: "Category deleted successfully", data })
})

export const getOwnerMenuItems = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const query = menuItemsListQuerySchema.parse({
    search: getStringParam(req.query.search) || undefined,
    status: getStringParam(req.query.status) || undefined,
    availability: getStringParam(req.query.availability) || undefined,
    categoryId: getStringParam(req.query.categoryId) || undefined,
    popularFilter: getStringParam(req.query.popularFilter) || undefined,
    sortBy: getStringParam(req.query.sortBy) || undefined,
    page: getStringParam(req.query.page) || undefined,
    pageSize: getStringParam(req.query.pageSize) || undefined
  })
  const data =
    query.search ||
    query.status ||
    query.availability ||
    query.categoryId ||
    query.popularFilter ||
    query.sortBy ||
    query.page ||
    query.pageSize
      ? await listMenuItemsWithFilters({
          ownerId: getOwnerId(req),
          ...query
        })
      : await listMenuItems(getOwnerId(req))
  return sendSuccess(res, { data })
})

export const getOwnerMenuApprovalRequests = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = menuApprovalListQuerySchema.parse({
      status: getStringParam(req.query.status) || undefined
    })
    const data = await listOwnerMenuApprovalRequests({
      ownerId: getOwnerId(req),
      status: query.status
    })
    return sendSuccess(res, { data })
  }
)

export const getOwnerSidebarSummaryController = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = await getOwnerSidebarSummary(getOwnerId(req))
  return sendSuccess(res, { data })
})

export const postOwnerMenuItem = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const payload = menuItemCreateSchema.parse(req.body)
  const limits = await getCatalogDescriptionLimits()
  assertCatalogDescriptionLimit(payload.description, limits.menuItem, "Menu item")
  const data = await createMenuItem({
    ownerId: getOwnerId(req),
    ...payload
  })
  return sendSuccess(res, {
    message:
      data && typeof data === "object" && "approvalRequired" in data
        ? "Menu item submitted for admin approval"
        : "Menu item created successfully",
    data
  })
})

export const patchOwnerMenuItem = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const payload = menuItemUpdateSchema.parse(req.body)
  const limits = await getCatalogDescriptionLimits()
  assertCatalogDescriptionLimit(payload.description, limits.menuItem, "Menu item")
  const data = await updateMenuItem({
    ownerId: getOwnerId(req),
    itemId: getStringParam(req.params.itemId),
    ...payload
  })
  return sendSuccess(res, {
    message:
      data && typeof data === "object" && "approvalRequired" in data
        ? "Menu item price change submitted for admin approval"
        : "Menu item updated successfully",
    data
  })
})

export const deleteOwnerMenuItem = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = await deleteMenuItemPermanently({
    ownerId: getOwnerId(req),
    itemId: getStringParam(req.params.itemId)
  })
  return sendSuccess(res, { message: "Menu item deleted successfully", data })
})

export const getOwnerOrders = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const query = listOrdersQuerySchema.parse({
    tab: getStringParam(req.query.tab) || undefined,
    status: getStringParam(req.query.status) || undefined,
    search: getStringParam(req.query.search) || undefined,
    paymentMethod: getStringParam(req.query.paymentMethod) || undefined,
    sortBy: getStringParam(req.query.sortBy) || undefined,
    preset: getStringParam(req.query.preset) || undefined,
    from: getStringParam(req.query.from) || undefined,
    to: getStringParam(req.query.to) || undefined,
    dateBasis: getStringParam(req.query.dateBasis) || undefined,
    page: getStringParam(req.query.page) || undefined,
    pageSize: getStringParam(req.query.pageSize) || undefined
  })
  const data = await listOrders({
    ownerId: getOwnerId(req),
    ...query
  })
  return sendSuccess(res, { data })
})

export const getOwnerOrderById = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = await getOrderById({
    ownerId: getOwnerId(req),
    orderId: getStringParam(req.params.orderId)
  })
  return sendSuccess(res, { data })
})

export const getOwnerRiderAssignmentOptions = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const data = await listOwnerRidersForAssignment(getOwnerId(req))
    return sendSuccess(res, { data })
  }
)

export const postOwnerOrderTransition = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = orderTransitionSchema.parse(req.body)
    const data = await transitionOrder({
      ownerId: getOwnerId(req),
      orderId: getStringParam(req.params.orderId),
      ...payload
    })
    return sendSuccess(res, { message: "Order updated successfully", data })
  }
)

export const postOwnerOrderAssignRider = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = assignOwnerRiderSchema.parse(req.body)
    const data = await assignOwnerRiderToOrder({
      ownerId: getOwnerId(req),
      orderId: getStringParam(req.params.orderId),
      riderId: payload.riderId
    })

    return sendSuccess(res, { message: "Rider assigned successfully", data })
  }
)

export const postOwnerOrderPreparationExtension = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = orderPreparationExtendSchema.parse(req.body)
    const data = await extendOrderPreparation({
      ownerId: getOwnerId(req),
      orderId: getStringParam(req.params.orderId),
      minutes: payload.minutes
    })
    return sendSuccess(res, { message: "Preparation time updated", data })
  }
)

export const getOwnerNotifications = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = listNotificationsQuerySchema.parse({
      filter: getStringParam(req.query.filter) || undefined,
      search: getStringParam(req.query.search) || undefined,
      page: getStringParam(req.query.page) || undefined,
      pageSize: getStringParam(req.query.pageSize) || undefined
    })
    const data =
      query.filter || query.search || query.page || query.pageSize
        ? await listNotificationsWithFilters({
            ownerId: getOwnerId(req),
            ...query
          })
        : await listNotifications(getOwnerId(req))
    return sendSuccess(res, { data })
  }
)

export const patchOwnerNotificationRead = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const data = await markNotificationAsRead({
      ownerId: getOwnerId(req),
      notificationId: getStringParam(req.params.notificationId)
    })
    return sendSuccess(res, { message: "Notification marked as read", data })
  }
)

export const patchOwnerNotificationsReadAll = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const data = await markAllNotificationsAsRead(getOwnerId(req))
    return sendSuccess(res, { message: "All notifications marked as read", data })
  }
)
