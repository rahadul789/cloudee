import { StatusCodes } from "http-status-codes"
import mongoose from "mongoose"
import type { Model } from "mongoose"

import { AppError } from "../../common/utils/app-error"
import { createInMemoryAsyncCache } from "../../common/utils/in-memory-cache"
import {
  OwnerModel,
  RefreshTokenSessionModel,
  RestaurantModel,
  RiderModel,
  RiderRefreshTokenSessionModel,
} from "../auth/auth.model"
import {
  CustomerModel,
  CustomerRefreshTokenSessionModel,
} from "../customer/customer.model"
import { AdminModel, AdminRefreshTokenSessionModel } from "./admin.model"
import { OrderModel } from "../owner/operational.model"
import {
  buildOrderServiceAreaScopeFilter,
  buildRestaurantServiceAreaScopeFilter,
  buildRiderServiceAreaScopeFilter,
} from "../service-area/service-area.service"

export type AdminSessionRole = "admin" | "owner" | "customer" | "rider"
export type AdminSessionStatus =
  | "all"
  | "active"
  | "recent"
  | "stale"
  | "revoked"
  | "expired"

type SessionListParams = {
  role?: AdminSessionRole | "all"
  status?: AdminSessionStatus
  zoneId?: string
  districtId?: string
  page?: number
  pageSize?: number
}

type SessionConfig = {
  role: AdminSessionRole
  model: Model<any>
  actorField: string
  actorModel: Model<any>
  actorSelect: Record<string, 1>
}

const DAY_MS = 24 * 60 * 60 * 1000
const RECENT_ACTIVITY_WINDOW_MS = 60 * 60 * 1000
const STALE_SESSION_AFTER_MS = 30 * DAY_MS

const sessionConfigs: SessionConfig[] = [
  {
    role: "admin",
    model: AdminRefreshTokenSessionModel,
    actorField: "adminId",
    actorModel: AdminModel,
    actorSelect: { fullName: 1, email: 1, role: 1, status: 1, lastLoginAt: 1 },
  },
  {
    role: "owner",
    model: RefreshTokenSessionModel,
    actorField: "ownerId",
    actorModel: OwnerModel,
    actorSelect: { fullName: 1, phone: 1, email: 1, status: 1, lastLoginAt: 1 },
  },
  {
    role: "customer",
    model: CustomerRefreshTokenSessionModel,
    actorField: "customerId",
    actorModel: CustomerModel,
    actorSelect: { fullName: 1, phone: 1, email: 1, status: 1, lastLoginAt: 1 },
  },
  {
    role: "rider",
    model: RiderRefreshTokenSessionModel,
    actorField: "riderId",
    actorModel: RiderModel,
    actorSelect: { fullName: 1, phone: 1, status: 1, lastLoginAt: 1 },
  },
]

const adminSessionsCache = createInMemoryAsyncCache<any>({
  ttlMs: 5_000,
  staleWhileRevalidateMs: 15_000,
  maxEntries: 24,
})

function invalidateAdminSessionsCache() {
  adminSessionsCache.clear()
}

function getConfig(role: AdminSessionRole) {
  const config = sessionConfigs.find((item) => item.role === role)
  if (!config) {
    throw new AppError(StatusCodes.BAD_REQUEST, "INVALID_SESSION_ROLE", "Invalid session role")
  }
  return config
}

function buildStatusQuery(status: AdminSessionStatus = "active"): Record<string, any> {
  const now = new Date()
  if (status === "all") return {}
  if (status === "revoked") return { revokedAt: { $ne: null } }
  if (status === "expired") {
    return { revokedAt: null, expiresAt: { $lte: now } }
  }
  if (status === "recent") {
    return {
      revokedAt: null,
      expiresAt: { $gt: now },
      updatedAt: { $gte: new Date(now.getTime() - RECENT_ACTIVITY_WINDOW_MS) },
    }
  }
  if (status === "stale") {
    return {
      revokedAt: null,
      expiresAt: { $gt: now },
      updatedAt: { $lt: new Date(now.getTime() - STALE_SESSION_AFTER_MS) },
    }
  }
  return { revokedAt: null, expiresAt: { $gt: now } }
}

function buildValidSessionQuery() {
  return buildStatusQuery("active")
}

function applyActorScopeToQuery(
  query: Record<string, any>,
  config: SessionConfig,
  scopedActorIds?: Record<string, any[] | null> | null,
) {
  const actorIds = scopedActorIds?.[config.role]
  if (actorIds) query[config.actorField] = { $in: actorIds }
  return query
}

async function countValidUniqueActors(
  config: SessionConfig,
  scopedActorIds?: Record<string, any[] | null> | null,
) {
  const actorIds = await config.model.distinct(
    config.actorField,
    applyActorScopeToQuery(buildValidSessionQuery(), config, scopedActorIds),
  )
  return actorIds.filter(Boolean).length
}

async function buildSessionSummary(
  configs = sessionConfigs,
  scopedActorIds?: Record<string, any[] | null> | null,
) {
  const [activeRows, revokedRows, expiredRows, uniqueRows, recentRows, staleRows] =
    await Promise.all([
      Promise.all(
        configs.map((config) =>
          config.model.countDocuments(
            applyActorScopeToQuery(buildStatusQuery("active"), config, scopedActorIds),
          )
        )
      ),
      Promise.all(
        configs.map((config) =>
          config.model.countDocuments(
            applyActorScopeToQuery(buildStatusQuery("revoked"), config, scopedActorIds),
          )
        )
      ),
      Promise.all(
        configs.map((config) =>
          config.model.countDocuments(
            applyActorScopeToQuery(buildStatusQuery("expired"), config, scopedActorIds),
          )
        )
      ),
      Promise.all(configs.map((config) => countValidUniqueActors(config, scopedActorIds))),
      Promise.all(
        configs.map((config) =>
          config.model.countDocuments(
            applyActorScopeToQuery(buildStatusQuery("recent"), config, scopedActorIds),
          )
        )
      ),
      Promise.all(
        configs.map((config) =>
          config.model.countDocuments(
            applyActorScopeToQuery(buildStatusQuery("stale"), config, scopedActorIds),
          )
        )
      ),
    ])

  const sum = (rows: number[]) => rows.reduce((total, count) => total + count, 0)

  return {
    active: sum(activeRows),
    valid: sum(activeRows),
    revoked: sum(revokedRows),
    expired: sum(expiredRows),
    uniqueValidAccounts: sum(uniqueRows),
    recentlyActive: sum(recentRows),
    stale: sum(staleRows),
    recentWindowMinutes: Math.round(RECENT_ACTIVITY_WINDOW_MS / 60_000),
    staleAfterDays: Math.round(STALE_SESSION_AFTER_MS / DAY_MS),
  }
}

function sessionStatus(session: Record<string, any>) {
  if (session.revokedAt) return "revoked"
  if (session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()) {
    return "expired"
  }
  return "active"
}

function serializeDate(value: unknown) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function mapActor(actor: Record<string, any> | undefined, fallbackId: string) {
  const fullName = String(actor?.fullName ?? "").trim()
  const email = String(actor?.email ?? "").trim()
  const phone = String(actor?.phone ?? "").trim()

  return {
    id: String(actor?._id ?? actor?.id ?? fallbackId),
    name: fullName || email || phone || "Unknown account",
    contact: email || phone,
    status: String(actor?.status ?? ""),
    lastLoginAt: serializeDate(actor?.lastLoginAt),
  }
}

async function listSessionsForConfig(params: {
  config: SessionConfig
  status: AdminSessionStatus
  limit: number
  actorIds?: any[] | null
}) {
  const query = buildStatusQuery(params.status)
  if (params.actorIds) {
    query[params.config.actorField] = { $in: params.actorIds }
  }
  const sessions = await params.config.model
    .find(query)
    .sort({ createdAt: -1 })
    .limit(params.limit)
    .lean()

  const actorIds = [
    ...new Set(
      sessions.map((session) => String(session[params.config.actorField] ?? "")).filter(Boolean)
    ),
  ]
  const actors = actorIds.length
    ? await params.config.actorModel
        .find({ _id: { $in: actorIds } })
        .select(params.config.actorSelect)
        .lean()
    : []
  const actorMap = new Map(actors.map((actor: any) => [String(actor._id), actor]))

  return sessions.map((session) => {
    const actorId = String(session[params.config.actorField] ?? "")
    const actor = mapActor(actorMap.get(actorId), actorId)

    return {
      id: String(session._id),
      role: params.config.role,
      status: sessionStatus(session),
      actor,
      tokenId: String(session.tokenId ?? ""),
      userAgent: String(session.userAgent ?? ""),
      ipAddress: String(session.ipAddress ?? ""),
      createdAt: serializeDate(session.createdAt),
      lastSeenAt: serializeDate(session.updatedAt ?? session.createdAt),
      expiresAt: serializeDate(session.expiresAt),
      revokedAt: serializeDate(session.revokedAt),
    }
  })
}

async function buildScopedActorIds(params: SessionListParams) {
  if (!params.zoneId?.trim() && !params.districtId?.trim()) return null
  const orderScopeFilter = buildOrderServiceAreaScopeFilter(params)
  const restaurantScopeFilter = buildRestaurantServiceAreaScopeFilter(params)
  const riderScopeFilter = buildRiderServiceAreaScopeFilter(params)
  const [customerIds, ownerIds, riderIds] = await Promise.all([
    Object.keys(orderScopeFilter).length
      ? OrderModel.distinct("customerId", {
          ...orderScopeFilter,
          customerId: { $type: "string", $ne: "" },
        })
      : Promise.resolve(null),
    Object.keys(restaurantScopeFilter).length
      ? RestaurantModel.distinct("ownerId", restaurantScopeFilter)
      : Promise.resolve(null),
    Object.keys(riderScopeFilter).length
      ? RiderModel.distinct("_id", riderScopeFilter)
      : Promise.resolve(null),
  ])

  const toObjectIds = (values: unknown[] | null) =>
    values
      ? values
          .filter((value) => mongoose.Types.ObjectId.isValid(String(value)))
          .map((value) => new mongoose.Types.ObjectId(String(value)))
      : null

  return {
    owner: toObjectIds(ownerIds),
    customer: toObjectIds(customerIds),
    rider: toObjectIds(riderIds),
  }
}

export async function listAdminSessions(params: SessionListParams) {
  const page = Math.max(1, Math.floor(Number(params.page ?? 1)) || 1)
  const pageSize = Math.min(100, Math.max(10, Math.floor(Number(params.pageSize ?? 50)) || 50))
  const scopedActorIds = await buildScopedActorIds(params)
  const isAreaScoped = Boolean(scopedActorIds)
  const roles =
    !params.role || params.role === "all"
      ? sessionConfigs
      : [getConfig(params.role)]
  const scopedRoles =
    isAreaScoped && (!params.role || params.role === "all")
      ? roles.filter((config) => config.role !== "admin")
      : roles
  const status = params.status ?? "active"
  const fetchLimit = page * pageSize
  const cacheKey = [
    scopedRoles.map((config) => config.role).join(","),
    status,
    page,
    pageSize,
    params.zoneId ?? "all",
    params.districtId ?? "all",
  ].join("|")

  return adminSessionsCache.getOrSet(cacheKey, async () => {
    const [itemsByRole, counts] = await Promise.all([
      Promise.all(
        scopedRoles.map((config) =>
          listSessionsForConfig({
            config,
            status,
            limit: fetchLimit,
            actorIds: scopedActorIds
              ? scopedActorIds[config.role as keyof typeof scopedActorIds] ?? null
              : null,
          })
        )
      ),
      Promise.all(
        scopedRoles.map((config) => {
          const query = buildStatusQuery(status)
          const actorIds = scopedActorIds
            ? scopedActorIds[config.role as keyof typeof scopedActorIds] ?? null
            : null
          if (actorIds) query[config.actorField] = { $in: actorIds }
          return config.model.countDocuments(query)
        })
      ),
    ])

    const items = itemsByRole
      .flat()
      .sort(
        (left, right) =>
          new Date(right.createdAt ?? 0).getTime() -
          new Date(left.createdAt ?? 0).getTime()
      )
    const total = counts.reduce((sum, count) => sum + count, 0)
    const pagedItems = items.slice((page - 1) * pageSize, page * pageSize)

    return {
      items: pagedItems,
      total,
      page,
      pageSize,
      summary: await buildSessionSummary(
        scopedRoles,
        scopedActorIds as Record<string, any[] | null> | null,
      ),
    }
  })
}

export async function revokeAdminSession(params: {
  role: AdminSessionRole
  sessionId: string
}) {
  const config = getConfig(params.role)
  const session = await config.model.findOneAndUpdate(
    { _id: params.sessionId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
    { new: true }
  )

  if (!session) {
    throw new AppError(StatusCodes.NOT_FOUND, "SESSION_NOT_FOUND", "Valid session not found")
  }

  invalidateAdminSessionsCache()
  return { revoked: true }
}

export async function revokeAdminActorSessions(params: {
  role: AdminSessionRole
  actorId: string
}) {
  const config = getConfig(params.role)
  const result = await config.model.updateMany(
    {
      [config.actorField]: params.actorId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { revokedAt: new Date() } }
  )

  if (result.modifiedCount > 0) {
    invalidateAdminSessionsCache()
  }
  return { revoked: result.modifiedCount }
}

// Force-logs-out every logged-in customer at once by revoking all their active refresh sessions.
// Respects the admin's zone/area scope: with no zone given it is truly platform-wide, with a zone
// it only touches customers who order in that area (same scoping the rest of the sessions view uses).
// Revoking is non-destructive — the customer's next refresh fails and the app logs them out; they
// simply sign in again. (Not instant: an active 45m access token keeps working until it expires.)
export async function revokeAllCustomerSessions(params: {
  zoneId?: string
  districtId?: string
}) {
  const config = getConfig("customer")
  const query: Record<string, unknown> = {
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  }

  const scopedActorIds = await buildScopedActorIds(params as SessionListParams)
  if (scopedActorIds) {
    const customerIds = scopedActorIds.customer
    // Zone given but no in-scope customers resolved → revoke nothing (never widen to all).
    if (!customerIds || customerIds.length === 0) {
      return { revoked: 0, scoped: true }
    }
    query[config.actorField] = { $in: customerIds }
  }

  const result = await config.model.updateMany(query, {
    $set: { revokedAt: new Date() },
  })

  if (result.modifiedCount > 0) {
    invalidateAdminSessionsCache()
  }
  return { revoked: result.modifiedCount, scoped: Boolean(scopedActorIds) }
}
