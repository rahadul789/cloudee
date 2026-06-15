import crypto from "node:crypto"
import type { Request } from "express"

import type { AuthenticatedRequest } from "../../common/middleware/auth"
import { env } from "../../config/env"
import { logger } from "../../config/logger"
import {
  CustomerAnalyticsEventModel,
  customerAnalyticsEventTypes,
} from "./customer-analytics.model"

export type CustomerAnalyticsEventType =
  (typeof customerAnalyticsEventTypes)[number]

type CustomerAnalyticsInput = {
  eventType: CustomerAnalyticsEventType
  anonymousId?: string
  sessionId?: string
  sourceApp?: string
  path: string
  screenName?: string
  entityType?: string
  entityId?: string
  occurredAt?: string
  metadata?: Record<string, unknown>
}

const blockedMetadataKeys = new Set([
  "authorization",
  "accesstoken",
  "refreshtoken",
  "token",
  "password",
  "otp",
  "otpcode",
  "email",
  "phone",
  "address",
  "deliveryaddress",
])

function trimString(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value
}

function sanitizeMetadataValue(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === "string") return trimString(value, 200)
  if (typeof value === "number" || typeof value === "boolean") return value
  if (Array.isArray(value)) return value.slice(0, 20).map(sanitizeMetadataValue)
  if (typeof value === "object") return sanitizeMetadata(value as Record<string, unknown>, 2)
  return String(value).slice(0, 200)
}

function sanitizeMetadata(
  metadata: Record<string, unknown> = {},
  depth = 1
): Record<string, unknown> {
  if (depth < 0) return {}

  return Object.entries(metadata)
    .slice(0, 30)
    .reduce<Record<string, unknown>>((safe, [key, value]) => {
      const normalizedKey = key.trim()
      if (!normalizedKey || blockedMetadataKeys.has(normalizedKey.toLowerCase())) return safe
      safe[trimString(normalizedKey, 80)] = sanitizeMetadataValue(value)
      return safe
    }, {})
}

function getClientIp(req: Request) {
  const forwardedFor = req.headers["x-forwarded-for"]
  const rawIp = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor?.split(",")[0]?.trim() || req.ip || ""

  return rawIp.replace(/^::ffff:/, "")
}

function hashIpAddress(ipAddress: string) {
  if (!ipAddress) return ""

  return crypto
    .createHmac("sha256", env.JWT_ACCESS_SECRET)
    .update(ipAddress)
    .digest("hex")
}

async function recordCustomerAnalyticsEvent(params: {
  input: CustomerAnalyticsInput
  req: AuthenticatedRequest
}) {
  const { input, req } = params
  const authCustomer =
    req.user?.role === "customer" && req.user.id ? req.user : null
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date()
  const isValidOccurredAt = Number.isFinite(occurredAt.getTime())

  await CustomerAnalyticsEventModel.create({
    eventType: input.eventType,
    actorType: authCustomer ? "customer" : "guest",
    customerId: authCustomer?.id ?? "",
    anonymousId: input.anonymousId ?? req.header("x-anonymous-id") ?? "",
    sessionId: input.sessionId ?? req.header("x-session-id") ?? "",
    sourceApp: input.sourceApp ?? "customer-app",
    path: trimString(input.path, 300),
    screenName: trimString(input.screenName ?? "", 120),
    entityType: trimString(input.entityType ?? "", 80),
    entityId: trimString(input.entityId ?? "", 120),
    metadata: sanitizeMetadata(input.metadata),
    userAgent: trimString(req.header("user-agent") ?? "", 300),
    ipHash: hashIpAddress(getClientIp(req)),
    occurredAt: isValidOccurredAt ? occurredAt : new Date(),
  })
}

export function fireCustomerAnalyticsEvent(params: {
  input: CustomerAnalyticsInput
  req: AuthenticatedRequest
}) {
  void recordCustomerAnalyticsEvent(params).catch((error) => {
    logger.warn({ error }, "Customer analytics event persistence failed")
  })
}
