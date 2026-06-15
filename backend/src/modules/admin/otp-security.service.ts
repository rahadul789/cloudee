import { StatusCodes } from "http-status-codes"

import { createInMemoryAsyncCache } from "../../common/utils/in-memory-cache"
import { AppError } from "../../common/utils/app-error"
import { OtpAbuseBlockModel, OtpSecurityEventModel, OtpSessionModel } from "../auth/auth.model"

type ListOtpSecurityParams = {
  phone?: string
  hours?: number
  page?: number
  pageSize?: number
}

type OtpBlockTargetType = "phone" | "ip" | "device"

type UpsertOtpBlockParams = {
  targetType: OtpBlockTargetType
  targetValue: string
  durationMinutes?: number
  permanent?: boolean
  reason?: string
  adminId?: string
}

type UnblockOtpBlockParams = {
  blockId: string
  reason?: string
  adminId?: string
}

function serializeDate(value: unknown) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function normalizeBlockValue(targetType: OtpBlockTargetType, value: string) {
  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    throw new AppError(StatusCodes.BAD_REQUEST, "OTP_BLOCK_VALUE_REQUIRED", "Block target is required")
  }

  if (targetType === "phone" && !/^01\d{9}$/.test(normalized)) {
    throw new AppError(StatusCodes.BAD_REQUEST, "INVALID_PHONE", "Enter a valid phone number")
  }

  return normalized.slice(0, targetType === "device" ? 320 : 120)
}

function displayBlockValue(targetType: OtpBlockTargetType, targetValue: string) {
  if (targetType === "phone") return targetValue
  if (targetType === "device") {
    const [ipAddress] = targetValue.split("|")
    return `${ipAddress || "device"} fingerprint`
  }
  return targetValue
}

function serializeBlock(block: Record<string, any>) {
  const targetType = String(block.targetType ?? "")
  const targetValue = String(block.targetValue ?? "")

  return {
    id: String(block._id ?? block.id ?? ""),
    targetType,
    targetValue,
    displayValue:
      targetType === "phone" ? targetValue : String(block.displayValue ?? ""),
    reason: String(block.reason ?? ""),
    isPermanent: block.isPermanent === true,
    isActive: block.isActive === true,
    lockedUntilAt: serializeDate(block.lockedUntilAt),
    liftedAt: serializeDate(block.liftedAt),
    createdByAdminId: String(block.createdByAdminId ?? ""),
    updatedByAdminId: String(block.updatedByAdminId ?? ""),
    liftedByAdminId: String(block.liftedByAdminId ?? ""),
    createdAt: serializeDate(block.createdAt),
    updatedAt: serializeDate(block.updatedAt),
  }
}

const otpSecurityEventsCache = createInMemoryAsyncCache<any>({
  ttlMs: 30_000,
  staleWhileRevalidateMs: 60_000,
  maxEntries: 24,
})

export async function listOtpSecurityEvents(params: ListOtpSecurityParams = {}) {
  const hours = Math.min(168, Math.max(1, params.hours ?? 24))
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(10, params.pageSize ?? 50))
  const since = new Date(Date.now() - hours * 60 * 60 * 1000)
  const query: Record<string, unknown> = {
    createdAt: { $gte: since },
  }
  const cacheKey = [params.phone ?? "", hours, page, pageSize].join("|")

  if (params.phone?.trim()) {
    query.phone = params.phone.trim()
  }

  return otpSecurityEventsCache.getOrSet(cacheKey, async () => {
  const [total, events, summaryRows, phoneRows, lockedSessionCount, blocks] = await Promise.all([
    OtpSecurityEventModel.countDocuments(query),
    OtpSecurityEventModel.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    OtpSecurityEventModel.aggregate<Record<string, any>>([
      { $match: query },
      {
        $group: {
          _id: null,
          sent: { $sum: { $cond: [{ $eq: ["$event", "send_sent"] }, 1, 0] } },
          reused: { $sum: { $cond: [{ $eq: ["$event", "send_reused"] }, 1, 0] } },
          blocked: { $sum: { $cond: [{ $eq: ["$event", "send_blocked"] }, 1, 0] } },
          sendFailed: { $sum: { $cond: [{ $eq: ["$event", "send_failed"] }, 1, 0] } },
          verifyFailed: { $sum: { $cond: [{ $eq: ["$event", "verify_failed"] }, 1, 0] } },
          verifyBlocked: { $sum: { $cond: [{ $eq: ["$event", "verify_blocked"] }, 1, 0] } },
          uniquePhones: { $addToSet: "$phone" },
          uniqueIps: { $addToSet: "$ipAddress" },
        },
      },
    ]),
    OtpSecurityEventModel.aggregate<Record<string, any>>([
      { $match: query },
      {
        $group: {
          _id: "$phone",
          sent: { $sum: { $cond: [{ $eq: ["$event", "send_sent"] }, 1, 0] } },
          reused: { $sum: { $cond: [{ $eq: ["$event", "send_reused"] }, 1, 0] } },
          blocked: { $sum: { $cond: [{ $eq: ["$event", "send_blocked"] }, 1, 0] } },
          verifyFailed: { $sum: { $cond: [{ $eq: ["$event", "verify_failed"] }, 1, 0] } },
          verifyBlocked: { $sum: { $cond: [{ $eq: ["$event", "verify_blocked"] }, 1, 0] } },
          purposes: { $addToSet: "$purpose" },
          ipAddresses: { $addToSet: "$ipAddress" },
          lastSeenAt: { $max: "$createdAt" },
        },
      },
      { $sort: { lastSeenAt: -1 } },
      { $limit: 50 },
    ]),
    OtpSessionModel.countDocuments({
      lockedUntilAt: { $gt: new Date() },
    }),
    OtpAbuseBlockModel.find({
      isActive: true,
      $or: [
        { isPermanent: true },
        { lockedUntilAt: { $gt: new Date() } },
      ],
    })
      .sort({ isPermanent: -1, lockedUntilAt: -1, updatedAt: -1 })
      .limit(100)
      .lean(),
  ])

  const summary = summaryRows[0] ?? {}
  const uniquePhones = Array.isArray(summary.uniquePhones)
    ? summary.uniquePhones.filter(Boolean).length
    : 0
  const uniqueIps = Array.isArray(summary.uniqueIps)
    ? summary.uniqueIps.filter(Boolean).length
    : 0

  return {
    timeframe: {
      hours,
      since: since.toISOString(),
    },
    summary: {
      sent: numberValue(summary.sent),
      reused: numberValue(summary.reused),
      blocked: numberValue(summary.blocked),
      sendFailed: numberValue(summary.sendFailed),
      verifyFailed: numberValue(summary.verifyFailed),
      verifyBlocked: numberValue(summary.verifyBlocked),
      uniquePhones,
      uniqueIps,
      lockedSessions: lockedSessionCount,
      activeBlocks: blocks.length,
    },
    blocks: blocks.map((block) => serializeBlock(block)),
    phones: phoneRows.map((row) => ({
      phone: String(row._id ?? ""),
      sent: numberValue(row.sent),
      reused: numberValue(row.reused),
      blocked: numberValue(row.blocked),
      verifyFailed: numberValue(row.verifyFailed),
      verifyBlocked: numberValue(row.verifyBlocked),
      purposes: Array.isArray(row.purposes) ? row.purposes.filter(Boolean).map(String) : [],
      ipAddresses: Array.isArray(row.ipAddresses)
        ? row.ipAddresses.filter(Boolean).map(String).slice(0, 5)
        : [],
      lastSeenAt: serializeDate(row.lastSeenAt),
    })),
    items: events.map((event) => ({
      id: String(event._id),
      phone: String(event.phone ?? ""),
      purpose: String(event.purpose ?? ""),
      referenceId: String(event.referenceId ?? ""),
      verificationSessionId: String(event.verificationSessionId ?? ""),
      event: String(event.event ?? ""),
      blockReason: String(event.blockReason ?? ""),
      ipAddress: String(event.ipAddress ?? ""),
      userAgent: String(event.userAgent ?? ""),
      metadata:
        event.metadata && typeof event.metadata === "object"
          ? event.metadata
          : {},
      createdAt: serializeDate(event.createdAt),
    })),
    total,
    page,
    pageSize,
  }
  })
}

export async function upsertOtpAbuseBlock(params: UpsertOtpBlockParams) {
  const targetValue = normalizeBlockValue(params.targetType, params.targetValue)
  const isPermanent = params.permanent === true
  const durationMinutes = Math.min(
    60 * 24 * 30,
    Math.max(5, Math.round(params.durationMinutes ?? 15)),
  )
  const lockedUntilAt = isPermanent
    ? null
    : new Date(Date.now() + durationMinutes * 60 * 1000)
  const note = (params.reason ?? "").trim().slice(0, 300)

  let block = await OtpAbuseBlockModel.findOne({
    targetType: params.targetType,
    targetValue,
  })

  const auditEntry = {
    action: block ? "updated" : "created",
    adminId: params.adminId ?? "",
    note,
    lockedUntilAt,
    isPermanent,
    createdAt: new Date(),
  }

  if (!block) {
    block = await OtpAbuseBlockModel.create({
      targetType: params.targetType,
      targetValue,
      displayValue: displayBlockValue(params.targetType, targetValue),
      reason: note,
      isPermanent,
      lockedUntilAt,
      isActive: true,
      liftedAt: null,
      createdByAdminId: params.adminId ?? "",
      updatedByAdminId: params.adminId ?? "",
      audit: [auditEntry],
    })
  } else {
    block.displayValue = displayBlockValue(params.targetType, targetValue)
    block.reason = note || block.reason
    block.isPermanent = isPermanent
    block.lockedUntilAt = lockedUntilAt
    block.isActive = true
    block.liftedAt = null
    block.liftedByAdminId = ""
    block.updatedByAdminId = params.adminId ?? ""
    block.audit.push(auditEntry)
    if (block.audit.length > 30) {
      block.audit.splice(0, block.audit.length - 30)
    }
    await block.save()
  }

  otpSecurityEventsCache.clear()
  return serializeBlock(block.toObject())
}

export async function unblockOtpAbuseBlock(params: UnblockOtpBlockParams) {
  const block = await OtpAbuseBlockModel.findById(params.blockId)
  if (!block) {
    throw new AppError(StatusCodes.NOT_FOUND, "OTP_BLOCK_NOT_FOUND", "OTP block was not found")
  }

  const liftedAt = new Date()
  block.isActive = false
  block.isPermanent = false
  block.lockedUntilAt = null
  block.liftedAt = liftedAt
  block.liftedByAdminId = params.adminId ?? ""
  block.updatedByAdminId = params.adminId ?? ""
  block.audit.push({
    action: "unblocked",
    adminId: params.adminId ?? "",
    note: (params.reason ?? "").trim().slice(0, 300),
    lockedUntilAt: null,
    isPermanent: false,
    createdAt: liftedAt,
  })
  if (block.audit.length > 30) {
    block.audit.splice(0, block.audit.length - 30)
  }
  await block.save()
  otpSecurityEventsCache.clear()

  return serializeBlock(block.toObject())
}
