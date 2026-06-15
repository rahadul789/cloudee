import type { JwtPayload } from "./auth.types"
import type { Model } from "mongoose"
import {
  RefreshTokenSessionModel,
  RiderRefreshTokenSessionModel,
} from "./auth.model"
import { AdminRefreshTokenSessionModel } from "../admin/admin.model"
import { CustomerRefreshTokenSessionModel } from "../customer/customer.model"

const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000
const SESSION_ACTIVE_CACHE_TTL_MS = 5 * 1000
const accessSessionActiveCache = new Map<string, { expiresAt: number; value: boolean }>()

function buildSessionCacheKey(payload: JwtPayload) {
  return `${payload.role}:${payload.sub}:${payload.tokenId ?? ""}`
}

function pruneSessionActiveCache(nowMs: number) {
  if (accessSessionActiveCache.size <= 10_000) return
  for (const [key, entry] of accessSessionActiveCache) {
    if (entry.expiresAt <= nowMs) {
      accessSessionActiveCache.delete(key)
    }
  }
}

async function isActiveSessionAndTouch(params: {
  model: Model<any>
  actorField: string
  payload: JwtPayload
}) {
  const now = new Date()
  pruneSessionActiveCache(now.getTime())
  const cacheKey = buildSessionCacheKey(params.payload)
  const cached = accessSessionActiveCache.get(cacheKey)
  if (cached && cached.expiresAt > now.getTime()) {
    return cached.value
  }

  const session = (await params.model
    .findOne({
      tokenId: params.payload.tokenId,
      [params.actorField]: params.payload.sub,
      revokedAt: null,
      expiresAt: { $gt: now },
    })
    .select({ _id: 1, updatedAt: 1 })
    .lean()) as { _id: unknown; updatedAt?: Date | string | null } | null

  if (!session) {
    accessSessionActiveCache.set(cacheKey, {
      value: false,
      expiresAt: now.getTime() + SESSION_ACTIVE_CACHE_TTL_MS,
    })
    return false
  }

  const updatedAt =
    session.updatedAt instanceof Date
      ? session.updatedAt
      : new Date(String(session.updatedAt ?? 0))
  if (
    Number.isNaN(updatedAt.getTime()) ||
    now.getTime() - updatedAt.getTime() >= SESSION_TOUCH_INTERVAL_MS
  ) {
    await params.model.updateOne(
      { _id: session._id },
      { $set: { updatedAt: now } },
    )
  }

  accessSessionActiveCache.set(cacheKey, {
    value: true,
    expiresAt: now.getTime() + SESSION_ACTIVE_CACHE_TTL_MS,
  })
  return true
}

export async function isAccessSessionActive(payload: JwtPayload) {
  if (!payload.tokenId) return true

  if (payload.role === "admin") {
    return isActiveSessionAndTouch({
      model: AdminRefreshTokenSessionModel,
      actorField: "adminId",
      payload,
    })
  }

  if (payload.role === "owner") {
    return isActiveSessionAndTouch({
      model: RefreshTokenSessionModel,
      actorField: "ownerId",
      payload,
    })
  }

  if (payload.role === "customer") {
    return isActiveSessionAndTouch({
      model: CustomerRefreshTokenSessionModel,
      actorField: "customerId",
      payload,
    })
  }

  if (payload.role === "rider") {
    return isActiveSessionAndTouch({
      model: RiderRefreshTokenSessionModel,
      actorField: "riderId",
      payload,
    })
  }

  return true
}
