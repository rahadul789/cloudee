import crypto from "node:crypto"

import { StatusCodes } from "http-status-codes"
import mongoose from "mongoose"

import type { OtpPurpose, RestaurantLifecycleStatus } from "../../common/constants/lifecycle"
import { AppError } from "../../common/utils/app-error"
import { env } from "../../config/env"
import { logger } from "../../config/logger"
import { emitSocketEvent } from "../../config/socket"
import {
  OtpAbuseBlockModel,
  OnboardingDraftModel,
  OtpSecurityEventModel,
  OtpSessionModel,
  OwnerModel,
  PayoutMethodModel,
  RestaurantModel,
  RefreshTokenSessionModel
} from "./auth.model"
import type { SendOtpParams } from "./auth.types"
import {
  compareOtpCode,
  comparePassword,
  hashOtpCode,
  hashPassword,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken
} from "./auth.utils"
import { getMockOtpCode } from "./mock-otp"
import {
  getFallbackOtpDeliveryConfig,
  getOtpDeliveryConfig,
  sendOtpSms,
  type OtpDeliveryConfig
} from "./otp-sms.service"
import { OtpAttemptModel } from "./otp-monitor.model"
import { sendOtpToTelegram } from "./otp-telegram.service"
import { sendOtpWhatsApp } from "./otp-whatsapp.service"
import { maybeAlertOtpDeliveryDegraded } from "../admin/otp-monitor.service"
import { createAdminOperationalAlert } from "../admin/admin-alert.service"
import {
  defaultAuthRateLimitSettings,
  getAuthRateLimitSettings,
  type AuthRateLimitSettings,
} from "../public/content.service"

export const OWNER_REFRESH_SESSION_EXPIRY_DAYS = 3650
const OTP_SUSPICIOUS_DEVICE_PHONE_THRESHOLD = 5
const OTP_SUSPICIOUS_DEVICE_LOOKBACK_MINUTES = 60

type OtpSecurityContext = {
  ipAddress?: string
  userAgent?: string
}

type OtpSecurityEvent =
  | "send_sent"
  | "send_reused"
  | "send_blocked"
  | "send_failed"
  | "verify_success"
  | "verify_failed"
  | "verify_blocked"

type OtpSessionTimingSource = {
  expiresAt?: Date | string | null
  lastSentAt?: Date | string | null
  createdAt?: Date | string | null
  updatedAt?: Date | string | null
  expiresInSeconds?: number
  resendAvailableInSeconds?: number
  failedVerifyCount?: number
  lockedUntilAt?: Date | string | null
}

function buildInitialDraft(ownerId: mongoose.Types.ObjectId, fullName: string, phone: string) {
  return {
    ownerId,
    basicInfo: {
      fullName,
      phone
    }
  }
}

function buildAuthResponse(params: {
  ownerId: string
  role: "owner"
  restaurantId?: string
  lifecycleStatus: RestaurantLifecycleStatus
  fullName: string
  phone: string
  isPhoneVerified: boolean
  refreshToken: string
  tokenId: string
}) {
  return {
    accessToken: signAccessToken({
      subject: params.ownerId,
      role: params.role,
      restaurantId: params.restaurantId,
      tokenId: params.tokenId
    }),
    refreshToken: params.refreshToken,
    owner: {
      id: params.ownerId,
      fullName: params.fullName,
      phone: params.phone,
      isPhoneVerified: params.isPhoneVerified
    },
    restaurantLifecycleStatus: params.lifecycleStatus
  }
}

async function createRefreshTokenSession(params: {
  ownerId: string
  role: "owner"
  restaurantId?: string
  userAgent?: string
  ipAddress?: string
}) {
  const tokenId = crypto.randomUUID()
  const refreshToken = signRefreshToken({
    subject: params.ownerId,
    role: params.role,
    restaurantId: params.restaurantId,
    tokenId
  })

  const tokenHash = await hashPassword(refreshToken)

  await RefreshTokenSessionModel.create({
    ownerId: params.ownerId,
    tokenId,
    tokenHash,
    userAgent: params.userAgent ?? "",
    ipAddress: params.ipAddress ?? "",
    expiresAt: new Date(Date.now() + OWNER_REFRESH_SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
  })

  return { refreshToken, tokenId }
}

function getDateValue(value: unknown) {
  if (value instanceof Date) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

function getOtpCodeLength(purpose?: OtpPurpose) {
  return purpose === "customer_phone_signin" ||
    purpose === "customer_password_reset" ||
    purpose === "owner_signup_verify" ||
    purpose === "owner_phone_change" ||
    purpose === "owner_payout_verify" ||
    purpose === "owner_phone_signin" ||
    purpose === "owner_password_reset" ||
    purpose === "password_reset" ||
    purpose === "rider_phone_signin" ||
    purpose === "rider_password_reset"
    ? 4
    : 6
}

function generateOtpCode(purpose?: OtpPurpose) {
  const length = getOtpCodeLength(purpose)
  if (env.MOCK_OTP_ENABLED) {
    const mockCode = env.MOCK_OTP_CODE.replace(/\D/g, "")
    return mockCode.length >= length
      ? mockCode.slice(0, length)
      : mockCode.padStart(length, "0")
  }

  const min = 10 ** (length - 1)
  const max = 10 ** length
  return crypto.randomInt(min, max).toString()
}

function normalizeAuditText(value: unknown, maxLength = 300) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : ""
}

function hashOtpSecurityValue(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24)
}

function normalizeOtpBlockTargetValue(value: unknown, maxLength = 300) {
  return normalizeAuditText(value, maxLength).toLowerCase()
}

function buildOtpDeviceValue(context?: OtpSecurityContext) {
  const ipAddress = normalizeOtpBlockTargetValue(context?.ipAddress, 80)
  const userAgent = normalizeOtpBlockTargetValue(context?.userAgent, 220)

  if (!ipAddress || !userAgent) return ""

  return `${ipAddress}|${userAgent}`
}

function maskOtpPhone(phone: string) {
  return phone.length <= 6 ? phone : `${phone.slice(0, 5)}***${phone.slice(-3)}`
}

async function getOtpSecurityLimits(): Promise<AuthRateLimitSettings> {
  try {
    return await getAuthRateLimitSettings()
  } catch (error) {
    logger.warn({ error }, "Using fallback OTP security limits")
    return defaultAuthRateLimitSettings
  }
}

function buildOtpBlockTargets(phone: string, context?: OtpSecurityContext) {
  const targets: Array<{
    targetType: "phone" | "ip" | "device"
    targetValue: string
    displayValue: string
  }> = []
  const normalizedPhone = normalizeOtpBlockTargetValue(phone, 32)
  const ipAddress = normalizeOtpBlockTargetValue(context?.ipAddress, 80)
  const deviceValue = buildOtpDeviceValue(context)

  if (normalizedPhone) {
    targets.push({
      targetType: "phone",
      targetValue: normalizedPhone,
      displayValue: maskOtpPhone(normalizedPhone)
    })
  }

  if (ipAddress) {
    targets.push({
      targetType: "ip",
      targetValue: ipAddress,
      displayValue: ipAddress
    })
  }

  if (deviceValue) {
    targets.push({
      targetType: "device",
      targetValue: deviceValue,
      displayValue: `${ipAddress} / ${hashOtpSecurityValue(deviceValue)}`
    })
  }

  return targets
}

async function recordOtpSecurityEvent(params: {
  phone: string
  purpose: OtpPurpose
  referenceId?: string
  verificationSessionId?: string
  event: OtpSecurityEvent
  blockReason?: string
  context?: OtpSecurityContext
  metadata?: Record<string, unknown>
}) {
  try {
    await OtpSecurityEventModel.create({
      phone: params.phone,
      purpose: params.purpose,
      referenceId: normalizeAuditText(params.referenceId, 120),
      verificationSessionId: normalizeAuditText(params.verificationSessionId, 80),
      event: params.event,
      blockReason: normalizeAuditText(params.blockReason, 120),
      ipAddress: normalizeAuditText(params.context?.ipAddress, 80),
      userAgent: normalizeAuditText(params.context?.userAgent, 300),
      metadata: params.metadata ?? {}
    })
  } catch (error) {
    logger.warn(
      { err: error, event: "otp.security_event.write_failed" },
      "Failed to record OTP security event"
    )
  }
}

async function findActiveOtpBlock(phone: string, context?: OtpSecurityContext) {
  const targets = buildOtpBlockTargets(phone, context)
  if (!targets.length) return null
  const now = new Date()

  return OtpAbuseBlockModel.findOne({
    isActive: true,
    $or: targets.map((target) => ({
      targetType: target.targetType,
      targetValue: target.targetValue
    })),
    $and: [
      {
        $or: [
          { isPermanent: true },
          { lockedUntilAt: { $gt: now } }
        ]
      }
    ]
  }).lean()
}

async function assertOtpAbuseBlockAllowed(params: {
  phone: string
  purpose: OtpPurpose
  referenceId?: string
  verificationSessionId?: string
  event: "send_blocked" | "verify_blocked"
  context?: OtpSecurityContext
}) {
  const block = await findActiveOtpBlock(params.phone, params.context)
  if (!block) return

  const blockReason = block.isPermanent ? "admin_permanent_block" : "admin_temporary_block"
  await recordOtpSecurityEvent({
    phone: params.phone,
    purpose: params.purpose,
    referenceId: params.referenceId,
    verificationSessionId: params.verificationSessionId,
    event: params.event,
    blockReason,
    context: params.context,
    metadata: {
      blockId: String(block._id),
      targetType: String(block.targetType ?? ""),
      displayValue: String(block.displayValue ?? ""),
      lockedUntilAt: block.lockedUntilAt
        ? new Date(block.lockedUntilAt).toISOString()
        : null,
      isPermanent: block.isPermanent === true,
      reason: String(block.reason ?? "")
    }
  })

  throw new AppError(
    StatusCodes.TOO_MANY_REQUESTS,
    "OTP_ADMIN_BLOCKED",
    block.isPermanent
      ? "OTP access is blocked for this device or phone number."
      : "OTP access is temporarily blocked for this device or phone number."
  )
}

async function maybeCreateSuspiciousOtpAlert(params: {
  otpSession: InstanceType<typeof OtpSessionModel>
  context?: OtpSecurityContext
  failedVerifyCount: number
  failedVerifyLimit: number
}) {
  const ipAddress = normalizeAuditText(params.context?.ipAddress, 80)
  const userAgent = normalizeAuditText(params.context?.userAgent, 300)
  if (!ipAddress || !userAgent) return

  const since = new Date(Date.now() - OTP_SUSPICIOUS_DEVICE_LOOKBACK_MINUTES * 60 * 1000)
  const phones = await OtpSecurityEventModel.distinct("phone", {
    ipAddress,
    userAgent,
    event: { $in: ["send_sent", "send_reused"] },
    createdAt: { $gte: since }
  })
  const uniquePhones = phones.filter(Boolean).map(String)

  if (uniquePhones.length < OTP_SUSPICIOUS_DEVICE_PHONE_THRESHOLD) {
    return
  }

  const deviceValue = buildOtpDeviceValue(params.context)
  const deviceHash = hashOtpSecurityValue(deviceValue)
  const severity =
    params.failedVerifyCount >= params.failedVerifyLimit ? "critical" : "warning"

  await createAdminOperationalAlert({
    alertType: "otp_abuse",
    severity,
    title: "Suspicious OTP activity detected",
    description: `${uniquePhones.length} phone numbers requested OTP from the same device, followed by a wrong OTP attempt.`,
    source: "security",
    entityType: "otp_device",
    entityId: deviceHash,
    path: "/settings?tab=security",
    iconKey: "shield-alert",
    dedupeKey: `otp-abuse:${deviceHash}`,
    metadata: {
      ipAddress,
      userAgent,
      deviceHash,
      attemptedPhone: maskOtpPhone(params.otpSession.phone),
      uniquePhoneCount: uniquePhones.length,
      samplePhones: uniquePhones.slice(0, 8).map(maskOtpPhone),
      failedVerifyCount: params.failedVerifyCount,
      failedVerifyLimit: params.failedVerifyLimit,
      lookbackMinutes: OTP_SUSPICIOUS_DEVICE_LOOKBACK_MINUTES,
      suggestedTargets: {
        device: deviceValue,
        ip: ipAddress,
        phone: params.otpSession.phone
      }
    }
  })
}

async function assertOtpSendAllowed(params: SendOtpParams) {
  const limits = await getOtpSecurityLimits()
  const now = Date.now()
  const hourAgo = new Date(now - 60 * 60 * 1000)
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000)
  const phone = params.phone.trim()
  const ipAddress = normalizeAuditText(params.ipAddress, 80)

  const [phoneHourlyCount, phoneDailyCount, ipDailyCount] = await Promise.all([
    OtpSecurityEventModel.countDocuments({
      phone,
      event: "send_sent",
      createdAt: { $gte: hourAgo }
    }),
    OtpSecurityEventModel.countDocuments({
      phone,
      event: "send_sent",
      createdAt: { $gte: dayAgo }
    }),
    ipAddress
      ? OtpSecurityEventModel.countDocuments({
          ipAddress,
          event: "send_sent",
          createdAt: { $gte: dayAgo }
        })
      : Promise.resolve(0)
  ])

  let blockReason = ""
  if (phoneHourlyCount >= limits.otpPhoneHourlySendLimit) {
    blockReason = "phone_hourly_limit"
  } else if (phoneDailyCount >= limits.otpPhoneDailySendLimit) {
    blockReason = "phone_daily_limit"
  } else if (ipDailyCount >= limits.otpIpDailySendLimit) {
    blockReason = "ip_daily_limit"
  }

  if (!blockReason) return

  await recordOtpSecurityEvent({
    phone,
    purpose: params.purpose,
    referenceId: params.referenceId,
    event: "send_blocked",
    blockReason,
    context: params,
    metadata: {
      phoneHourlyCount,
      phoneDailyCount,
      ipDailyCount,
      limits: {
        phoneHourly: limits.otpPhoneHourlySendLimit,
        phoneDaily: limits.otpPhoneDailySendLimit,
        ipDaily: limits.otpIpDailySendLimit
      }
    }
  })

  throw new AppError(
    StatusCodes.TOO_MANY_REQUESTS,
    "OTP_SEND_RATE_LIMITED",
    "Too many OTP requests. Please wait before requesting another code."
  )
}

function getRemainingOtpSeconds(otpSession: OtpSessionTimingSource) {
  const expiresAt = getDateValue(otpSession.expiresAt)
  return Math.max(0, Math.floor(((expiresAt?.getTime() ?? Date.now()) - Date.now()) / 1000))
}

function getResendAvailableSeconds(
  otpSession: OtpSessionTimingSource,
  resendCooldownSeconds = getFallbackOtpDeliveryConfig().resendCooldownSeconds
) {
  const lastSentAt =
    getDateValue(otpSession.lastSentAt) ??
    getDateValue(otpSession.updatedAt) ??
    getDateValue(otpSession.createdAt)

  if (!lastSentAt || resendCooldownSeconds <= 0) {
    return 0
  }

  const elapsedSeconds = Math.floor((Date.now() - lastSentAt.getTime()) / 1000)
  return Math.max(0, resendCooldownSeconds - elapsedSeconds)
}

// The initial auto-send uses resendCooldownSeconds; from the first MANUAL resend onward
// (resendCount >= 1) every wait uses the longer manualResendCooldownSeconds, giving support
// time to read the code from the OTP Monitor / Telegram and deliver it by hand.
function getEffectiveResendCooldownSeconds(
  config: OtpDeliveryConfig,
  resendCount: number
) {
  return resendCount >= 1
    ? config.manualResendCooldownSeconds ?? config.resendCooldownSeconds
    : config.resendCooldownSeconds
}

function attachOtpDeliveryMeta<T extends OtpSessionTimingSource>(
  otpSession: T,
  otpSent: boolean,
  config: OtpDeliveryConfig,
  resendCount = 0
) {
  const sessionWithMeta = otpSession as T & {
    otpSent?: boolean
    expiresInSeconds?: number
    resendAvailableInSeconds?: number
  }
  sessionWithMeta.otpSent = otpSent
  sessionWithMeta.expiresInSeconds = getRemainingOtpSeconds(otpSession)
  sessionWithMeta.resendAvailableInSeconds = getResendAvailableSeconds(
    otpSession,
    getEffectiveResendCooldownSeconds(config, resendCount)
  )
  return sessionWithMeta
}

export function getOtpSessionTiming(otpSession: OtpSessionTimingSource) {
  return {
    expiresInSeconds:
      typeof otpSession.expiresInSeconds === "number"
        ? otpSession.expiresInSeconds
        : getRemainingOtpSeconds(otpSession),
    resendAvailableInSeconds:
      typeof otpSession.resendAvailableInSeconds === "number"
        ? otpSession.resendAvailableInSeconds
        : getResendAvailableSeconds(otpSession)
  }
}

// What the client needs to decide whether to show "Call for instant OTP" after N resends.
export function buildOtpFallbackClientConfig(config: OtpDeliveryConfig) {
  return {
    telegramFallbackEnabled: config.telegramFallbackEnabled,
    callButtonAfterResends: config.callButtonAfterResends,
    supportCallNumber: config.telegramFallbackEnabled ? config.supportCallNumber : "",
    whatsappOtpEnabled: config.whatsappOtpEnabled,
    whatsappAfterResends: config.whatsappAfterResends
  }
}

export async function getOtpFallbackClientConfig() {
  return buildOtpFallbackClientConfig(await getOtpDeliveryConfig())
}

// "Call for instant OTP": flag the attempt + fire a high-priority Telegram heads-up (with the
// live code) so support is primed to answer, then hand the support number back to dial.
export async function requestOtpSupportCall(params: {
  verificationSessionId: string
}) {
  const config = await getOtpDeliveryConfig()
  const attempt = await OtpAttemptModel.findOneAndUpdate(
    { verificationSessionId: params.verificationSessionId },
    { $set: { callRequestedAt: new Date() } },
    { new: true }
  ).lean<{ phone?: string; plainCode?: string; resendCount?: number }>()

  if (attempt?.phone && config.telegramFallbackEnabled) {
    void sendOtpToTelegram({
      phone: attempt.phone,
      code: attempt.plainCode ?? "",
      kind: "call_request",
      resendCount: attempt.resendCount
    })
  }

  return { supportCallNumber: config.supportCallNumber }
}

// "Get code on WhatsApp": re-send the CURRENT valid OTP through WhatsApp (reads the live
// plaintext from the monitor row). Gated by the admin flag; inert until credentials are set.
export async function requestOtpWhatsApp(params: {
  verificationSessionId: string
}) {
  const config = await getOtpDeliveryConfig()
  if (!config.whatsappOtpEnabled) {
    return { sent: false, reason: "disabled" as const }
  }

  const attempt = await OtpAttemptModel.findOne({
    verificationSessionId: params.verificationSessionId
  }).lean<{ phone?: string; plainCode?: string }>()

  if (!attempt?.phone || !attempt.plainCode) {
    return { sent: false, reason: "no_active_code" as const }
  }

  const result = await sendOtpWhatsApp({
    phone: attempt.phone,
    code: attempt.plainCode
  })

  if (result.sent) {
    await OtpAttemptModel.updateOne(
      { verificationSessionId: params.verificationSessionId },
      { $set: { channel: "whatsapp" } }
    ).catch(() => undefined)
  }

  return { sent: result.sent, reason: result.sent ? "sent" : result.reason }
}

export async function assertOtpVerificationAllowed(
  otpSession: InstanceType<typeof OtpSessionModel>,
  context?: OtpSecurityContext
) {
  await assertOtpAbuseBlockAllowed({
    phone: otpSession.phone,
    purpose: otpSession.purpose,
    referenceId: otpSession.referenceId,
    verificationSessionId: otpSession.id,
    event: "verify_blocked",
    context
  })

  const lockedUntilAt = getDateValue(otpSession.lockedUntilAt)
  if (!lockedUntilAt || lockedUntilAt.getTime() <= Date.now()) {
    return
  }

  await recordOtpSecurityEvent({
    phone: otpSession.phone,
    purpose: otpSession.purpose,
    referenceId: otpSession.referenceId,
    verificationSessionId: otpSession.id,
    event: "verify_blocked",
    blockReason: "session_locked",
    context,
    metadata: {
      lockedUntilAt: lockedUntilAt.toISOString(),
      failedVerifyCount: otpSession.failedVerifyCount ?? 0
    }
  })

  throw new AppError(
    StatusCodes.TOO_MANY_REQUESTS,
    "OTP_VERIFICATION_LOCKED",
    "Too many incorrect OTP attempts. Please request a new code later."
  )
}

export async function rejectInvalidOtpAttempt(
  otpSession: InstanceType<typeof OtpSessionModel>,
  context?: OtpSecurityContext
) {
  const limits = await getOtpSecurityLimits()
  const nextFailedCount = (otpSession.failedVerifyCount ?? 0) + 1
  otpSession.failedVerifyCount = nextFailedCount

  if (nextFailedCount >= limits.otpFailedVerifyLimit) {
    otpSession.lockedUntilAt = new Date(Date.now() + limits.otpVerifyLockMinutes * 60 * 1000)
  }

  await otpSession.save()
  await recordOtpSecurityEvent({
    phone: otpSession.phone,
    purpose: otpSession.purpose,
    referenceId: otpSession.referenceId,
    verificationSessionId: otpSession.id,
    event: "verify_failed",
    blockReason: nextFailedCount >= limits.otpFailedVerifyLimit ? "session_locked" : "",
    context,
    metadata: {
      failedVerifyCount: nextFailedCount,
      failedVerifyLimit: limits.otpFailedVerifyLimit,
      lockedUntilAt: getDateValue(otpSession.lockedUntilAt)?.toISOString() ?? null
    }
  })
  await maybeCreateSuspiciousOtpAlert({
    otpSession,
    context,
    failedVerifyCount: nextFailedCount,
    failedVerifyLimit: limits.otpFailedVerifyLimit
  })

  if (nextFailedCount >= limits.otpFailedVerifyLimit) {
    throw new AppError(
      StatusCodes.TOO_MANY_REQUESTS,
      "OTP_VERIFICATION_LOCKED",
      "Too many incorrect OTP attempts. Please request a new code later."
    )
  }

  throw new AppError(StatusCodes.BAD_REQUEST, "INVALID_OTP", "Invalid OTP code")
}

function clearOtpVerificationFailures(otpSession: InstanceType<typeof OtpSessionModel>) {
  otpSession.failedVerifyCount = 0
  otpSession.lockedUntilAt = null
}

export async function recordOtpVerificationSuccess(
  otpSession: InstanceType<typeof OtpSessionModel>,
  context?: OtpSecurityContext
) {
  clearOtpVerificationFailures(otpSession)
  await recordOtpSecurityEvent({
    phone: otpSession.phone,
    purpose: otpSession.purpose,
    referenceId: otpSession.referenceId,
    verificationSessionId: otpSession.id,
    event: "verify_success",
    context
  })
  // Close the OTP-monitor funnel row (verify == login for OTP sign-in). Non-fatal.
  await OtpAttemptModel.updateOne(
    { verificationSessionId: otpSession.id },
    { $set: { verifiedAt: new Date(), loggedInAt: new Date(), plainCode: "" } }
  ).catch(() => undefined)
}

async function saveOtpSessionWithCode(
  otpSession: InstanceType<typeof OtpSessionModel>,
  params: {
    otpCode: string
    isNewSession: boolean
    config: OtpDeliveryConfig
    context?: OtpSecurityContext
  }
) {
  const originalOtpCodeHash = otpSession.otpCodeHash
  const originalExpiresAt = otpSession.expiresAt
  const originalLastSentAt = otpSession.lastSentAt
  const now = new Date()

  otpSession.otpCodeHash = await hashOtpCode(params.otpCode)
  otpSession.expiresAt = new Date(now.getTime() + params.config.expiresInSeconds * 1000)
  otpSession.lastSentAt = now
  otpSession.failedVerifyCount = 0
  otpSession.lockedUntilAt = null
  await otpSession.save()

  try {
    await sendOtpSms({
      phone: otpSession.phone,
      otpCode: params.otpCode,
      config: params.config
    })
  } catch (error) {
    await recordOtpSecurityEvent({
      phone: otpSession.phone,
      purpose: otpSession.purpose,
      referenceId: otpSession.referenceId,
      verificationSessionId: otpSession.id,
      event: "send_failed",
      context: params.context,
      metadata: {
        message: error instanceof Error ? error.message.slice(0, 160) : "OTP SMS failed"
      }
    })

    if (params.isNewSession) {
      await otpSession.deleteOne().catch(() => undefined)
    } else {
      otpSession.otpCodeHash = originalOtpCodeHash
      otpSession.expiresAt = originalExpiresAt
      otpSession.lastSentAt = originalLastSentAt
      await otpSession.save().catch(() => undefined)
    }

    throw error
  }

  await recordOtpSecurityEvent({
    phone: otpSession.phone,
    purpose: otpSession.purpose,
    referenceId: otpSession.referenceId,
    verificationSessionId: otpSession.id,
    event: "send_sent",
    context: params.context,
    metadata: {
      expiresInSeconds: params.config.expiresInSeconds,
      resendCooldownSeconds: params.config.resendCooldownSeconds
    }
  })

  // How many manual resends have happened for this session (0 = initial auto-send). Drives
  // the effective resend cooldown below. Falls back to 1 for a resend if logging fails.
  let resendCount = params.isNewSession ? 0 : 1

  // OTP monitor + Telegram relay (non-fatal — never breaks login). Keeps a plaintext-code
  // funnel row for the admin "OTP Monitor", and on RESEND relays the code to the "Foodbela
  // OTP" bot so support can read it out when SMS is slow.
  try {
    const attempt = await OtpAttemptModel.findOneAndUpdate(
      { verificationSessionId: otpSession.id },
      {
        $set: {
          phone: otpSession.phone,
          purpose: otpSession.purpose,
          plainCode: params.otpCode,
          lastSentAt: now,
          ipAddress: params.context?.ipAddress ?? ""
        },
        ...(params.isNewSession
          ? { $setOnInsert: { requestedAt: now, resendCount: 0 } }
          : { $inc: { resendCount: 1 } })
      },
      { new: true, upsert: true }
    ).lean<{ resendCount?: number }>()

    resendCount = attempt?.resendCount ?? resendCount

    if (!params.isNewSession) {
      if (params.config.telegramFallbackEnabled) {
        void sendOtpToTelegram({
          phone: otpSession.phone,
          code: params.otpCode,
          kind: "resend",
          resendCount: attempt?.resendCount ?? 1
        })
      }
      // A resend is a "SMS didn't arrive" signal — watch for a degraded-delivery burst.
      void maybeAlertOtpDeliveryDegraded()
    }
  } catch (error) {
    logger.warn({ error }, "OTP attempt logging failed")
  }

  return attachOtpDeliveryMeta(otpSession, true, params.config, resendCount)
}

export async function createOtpSession(params: SendOtpParams) {
  const otpConfig = await getOtpDeliveryConfig()
  const context = {
    ipAddress: params.ipAddress,
    userAgent: params.userAgent
  }
  await assertOtpAbuseBlockAllowed({
    phone: params.phone,
    purpose: params.purpose,
    referenceId: params.referenceId,
    event: "send_blocked",
    context
  })
  const duplicatePending = await OtpSessionModel.findOne({
    phone: params.phone,
    purpose: params.purpose,
    status: "pending",
    expiresAt: { $gt: new Date() }
  })

  if (duplicatePending) {
    const lockedUntilAt = getDateValue(duplicatePending.lockedUntilAt)
    if (lockedUntilAt && lockedUntilAt.getTime() > Date.now()) {
      await recordOtpSecurityEvent({
        phone: duplicatePending.phone,
        purpose: duplicatePending.purpose,
        referenceId: duplicatePending.referenceId,
        verificationSessionId: duplicatePending.id,
        event: "send_blocked",
        blockReason: "verification_locked",
        context,
        metadata: {
          lockedUntilAt: lockedUntilAt.toISOString(),
          failedVerifyCount: duplicatePending.failedVerifyCount ?? 0
        }
      })

      throw new AppError(
        StatusCodes.TOO_MANY_REQUESTS,
        "OTP_VERIFICATION_LOCKED",
        "Too many incorrect OTP attempts. Please wait before requesting another code."
      )
    }

    // Same effective cooldown the client is counting down against: longer once the user has
    // manually resent at least once (resendCount lives on the OTP attempt row).
    const pendingAttempt = await OtpAttemptModel.findOne({
      verificationSessionId: duplicatePending.id
    }).lean<{ resendCount?: number }>()
    const pendingResendCount = pendingAttempt?.resendCount ?? 0

    const resendAvailableInSeconds = getResendAvailableSeconds(
      duplicatePending,
      getEffectiveResendCooldownSeconds(otpConfig, pendingResendCount)
    )

    if (resendAvailableInSeconds > 0) {
      await recordOtpSecurityEvent({
        phone: duplicatePending.phone,
        purpose: duplicatePending.purpose,
        referenceId: duplicatePending.referenceId,
        verificationSessionId: duplicatePending.id,
        event: "send_reused",
        context,
        metadata: {
          resendAvailableInSeconds
        }
      })
      return attachOtpDeliveryMeta(
        duplicatePending,
        false,
        otpConfig,
        pendingResendCount
      )
    }

    await assertOtpSendAllowed(params)
    return saveOtpSessionWithCode(duplicatePending, {
      otpCode: generateOtpCode(params.purpose),
      isNewSession: false,
      config: otpConfig,
      context
    })
  }

  await assertOtpSendAllowed(params)
  const otpSession = new OtpSessionModel({
    ownerId: params.ownerId ?? null,
    referenceId: params.referenceId,
    phone: params.phone,
    purpose: params.purpose,
    otpCodeHash: "pending",
    expiresAt: new Date(Date.now() + otpConfig.expiresInSeconds * 1000)
  })

  return saveOtpSessionWithCode(otpSession, {
    otpCode: generateOtpCode(params.purpose),
    isNewSession: true,
    config: otpConfig,
    context
  })
}

export async function signupOwner(params: {
  fullName: string
  phone: string
  password: string
  userAgent?: string
  ipAddress?: string
}) {
  const existingOwner = await OwnerModel.findOne({
    $or: [{ phone: params.phone }, { pendingPhone: params.phone }]
  })

  if (existingOwner) {
    throw new AppError(
      StatusCodes.CONFLICT,
      "PHONE_ALREADY_IN_USE",
      "An account already exists with this phone number"
    )
  }

  const passwordHash = await hashPassword(params.password)

  const owner = await OwnerModel.create({
    fullName: params.fullName,
    phone: params.phone,
    passwordHash
  })

  await OnboardingDraftModel.create(buildInitialDraft(owner._id, params.fullName, params.phone))

  const verificationSession = await createOtpSession({
    ownerId: owner.id,
    phone: params.phone,
    purpose: "owner_signup_verify",
    referenceId: owner.id,
    userAgent: params.userAgent,
    ipAddress: params.ipAddress
  })

  return {
    ownerId: owner.id,
    verificationSessionId: verificationSession.id,
    nextStatus: owner.restaurantLifecycleStatus,
    ...getOtpSessionTiming(verificationSession),
    mockCode: getMockOtpCode()
  }
}

export async function signinOwner(params: {
  phone: string
  password: string
  userAgent?: string
  ipAddress?: string
}) {
  const owner = await OwnerModel.findOne({ phone: params.phone })

  if (!owner) {
    throw new AppError(
      StatusCodes.UNAUTHORIZED,
      "INVALID_CREDENTIALS",
      "Invalid phone number or password"
    )
  }

  if (owner.status !== "active") {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "ACCOUNT_UNAVAILABLE",
      "This account is not available for sign in"
    )
  }

  if (!owner.isPhoneVerified) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "PHONE_NOT_VERIFIED",
      "Please verify your phone number before signing in"
    )
  }

  const isPasswordValid = await comparePassword(params.password, owner.passwordHash)

  if (!isPasswordValid) {
    throw new AppError(
      StatusCodes.UNAUTHORIZED,
      "INVALID_CREDENTIALS",
      "Invalid phone number or password"
    )
  }

  owner.lastLoginAt = new Date()
  await owner.save()

  const refreshSession = await createRefreshTokenSession({
    ownerId: owner.id,
    role: "owner",
    restaurantId: owner.activeRestaurantId?.toString(),
    userAgent: params.userAgent,
    ipAddress: params.ipAddress
  })

  return buildAuthResponse({
    ownerId: owner.id,
    role: "owner",
    restaurantId: owner.activeRestaurantId?.toString(),
    lifecycleStatus: owner.restaurantLifecycleStatus,
    fullName: owner.fullName,
    phone: owner.phone,
    isPhoneVerified: owner.isPhoneVerified
    ,
    refreshToken: refreshSession.refreshToken,
    tokenId: refreshSession.tokenId
  })
}

async function getOwnerForOtpSignin(phone: string) {
  const owner = await OwnerModel.findOne({ phone })

  if (!owner) {
    throw new AppError(
      StatusCodes.UNAUTHORIZED,
      "OWNER_NOT_FOUND",
      "No owner account was found for this phone number"
    )
  }

  if (owner.status !== "active") {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "ACCOUNT_UNAVAILABLE",
      "This account is not available for sign in"
    )
  }

  if (!owner.isPhoneVerified) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "PHONE_NOT_VERIFIED",
      "Please verify your phone number before signing in"
    )
  }

  return owner
}

export async function requestOwnerOtpSignin(params: {
  phone: string
  userAgent?: string
  ipAddress?: string
}) {
  const owner = await getOwnerForOtpSignin(params.phone)

  return sendOtpForPurpose({
    ownerId: owner.id,
    phone: params.phone,
    purpose: "owner_phone_signin",
    referenceId: owner.id,
    userAgent: params.userAgent,
    ipAddress: params.ipAddress
  })
}

export async function verifyOwnerOtpSignin(params: {
  verificationSessionId: string
  otpCode: string
  userAgent?: string
  ipAddress?: string
}) {
  let otpSession = await OtpSessionModel.findById(params.verificationSessionId)
  if (!otpSession || otpSession.purpose !== "owner_phone_signin") {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "OTP_SIGNIN_SESSION_NOT_FOUND",
      "OTP sign in session not found"
    )
  }

  await verifyOtpSession(params)
  otpSession = await OtpSessionModel.findById(params.verificationSessionId)
  if (!otpSession) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "OTP_SIGNIN_SESSION_NOT_FOUND",
      "OTP sign in session not found"
    )
  }

  const owner = await getOwnerForOtpSignin(otpSession.phone)
  owner.lastLoginAt = new Date()
  await owner.save()

  const refreshSession = await createRefreshTokenSession({
    ownerId: owner.id,
    role: "owner",
    restaurantId: owner.activeRestaurantId?.toString(),
    userAgent: params.userAgent,
    ipAddress: params.ipAddress
  })

  return buildAuthResponse({
    ownerId: owner.id,
    role: "owner",
    restaurantId: owner.activeRestaurantId?.toString(),
    lifecycleStatus: owner.restaurantLifecycleStatus,
    fullName: owner.fullName,
    phone: owner.phone,
    isPhoneVerified: owner.isPhoneVerified,
    refreshToken: refreshSession.refreshToken,
    tokenId: refreshSession.tokenId
  })
}

export async function sendOtpForPurpose(params: SendOtpParams) {
  if (params.purpose === "owner_signup_verify") {
    const owner = await OwnerModel.findById(params.referenceId)

    if (!owner) {
      throw new AppError(StatusCodes.NOT_FOUND, "OWNER_NOT_FOUND", "Owner not found")
    }
  }

  if (params.purpose === "owner_phone_change") {
    const owner = await OwnerModel.findById(params.referenceId)

    if (!owner || owner.pendingPhone !== params.phone) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "INVALID_PHONE_CHANGE",
        "No pending phone change found for this phone number"
      )
    }
  }

  if (params.purpose === "owner_payout_verify") {
    const payoutMethod = await PayoutMethodModel.findById(params.referenceId)

    if (
      !payoutMethod ||
      payoutMethod.pendingAccountNumber !== params.phone ||
      payoutMethod.pendingVerificationStatus !== "otp_pending"
    ) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "INVALID_PAYOUT_VERIFICATION",
        "No pending payout verification found for this phone number"
      )
    }
  }

  const otpSession = await createOtpSession(params)

  return {
    verificationSessionId: otpSession.id,
    ...getOtpSessionTiming(otpSession),
    mockCode: getMockOtpCode()
  }
}

function resolveNextStatus(
  currentStatus: RestaurantLifecycleStatus,
  purpose: OtpPurpose
): RestaurantLifecycleStatus {
  if (purpose === "owner_signup_verify" && currentStatus === "account_created") {
    return "phone_verified"
  }

  return currentStatus
}

export async function verifyOtpSession(params: {
  verificationSessionId: string
  otpCode: string
  userAgent?: string
  ipAddress?: string
}) {
  const otpSession = await OtpSessionModel.findById(params.verificationSessionId)

  if (!otpSession) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "OTP_SESSION_NOT_FOUND",
      "Verification session not found"
    )
  }

  if (otpSession.status !== "pending") {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "OTP_ALREADY_USED",
      "This verification session is no longer active"
    )
  }

  if (otpSession.expiresAt.getTime() < Date.now()) {
    otpSession.status = "expired"
    await otpSession.save()
    throw new AppError(StatusCodes.BAD_REQUEST, "OTP_EXPIRED", "OTP has expired")
  }

  await assertOtpVerificationAllowed(otpSession, params)
  const isValidOtp = await compareOtpCode(params.otpCode, otpSession.otpCodeHash)

  if (!isValidOtp) {
    await rejectInvalidOtpAttempt(otpSession, params)
  }

  let nextStatus: RestaurantLifecycleStatus | undefined

  if (otpSession.purpose === "owner_signup_verify" || otpSession.purpose === "owner_phone_change") {
    const owner = await OwnerModel.findById(otpSession.referenceId)

    if (!owner) {
      throw new AppError(StatusCodes.NOT_FOUND, "OWNER_NOT_FOUND", "Owner not found")
    }

    if (otpSession.purpose === "owner_signup_verify") {
      owner.isPhoneVerified = true
    }

    if (otpSession.purpose === "owner_phone_change") {
      if (owner.pendingPhone !== otpSession.phone) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          "PHONE_CHANGE_MISMATCH",
          "Pending phone number does not match verification request"
        )
      }

      owner.phone = otpSession.phone
      owner.pendingPhone = null
      owner.isPhoneVerified = true
    }

    nextStatus = resolveNextStatus(owner.restaurantLifecycleStatus, otpSession.purpose)
    owner.restaurantLifecycleStatus = nextStatus
    await owner.save()
  }

  if (otpSession.purpose === "owner_payout_verify") {
    const payoutMethod = await PayoutMethodModel.findById(otpSession.referenceId)

    if (!payoutMethod) {
      throw new AppError(StatusCodes.NOT_FOUND, "PAYOUT_METHOD_NOT_FOUND", "Payout method not found")
    }

    if (payoutMethod.pendingAccountNumber !== otpSession.phone) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "PAYOUT_NUMBER_MISMATCH",
        "Pending payout account number does not match the verification request"
      )
    }

    if (payoutMethod.pendingVerificationStatus !== "otp_pending") {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "PAYOUT_VERIFICATION_NOT_PENDING",
        "This payout verification request is no longer pending OTP"
      )
    }

    payoutMethod.pendingVerificationStatus = "admin_pending"
    payoutMethod.pendingVerifiedAt = new Date()
    payoutMethod.pendingAdminNote = ""
    payoutMethod.verificationSource = "otp_verified_pending_admin"
    await payoutMethod.save()

    const restaurant = await RestaurantModel.findById(payoutMethod.restaurantId)
      .select({ ownerId: 1, name: 1, serviceArea: 1 })
      .lean()
    const serviceArea = (restaurant?.serviceArea ?? {}) as Record<string, unknown>

    await createAdminOperationalAlert({
      alertType: "payout_method_approval",
      severity: "info",
      title: "Payout bKash approval needed",
      description: `${restaurant?.name ?? "Restaurant"} owner verified new bKash number ${otpSession.phone}. Review it before the number is used for payouts.`,
      source: "finance",
      entityType: "payout_method",
      entityId: payoutMethod._id.toString(),
      path: "/payouts",
      iconKey: "wallet",
      dedupeKey: `payout-method-approval:${payoutMethod._id.toString()}:${otpSession.phone}`,
      metadata: {
        restaurantId: payoutMethod.restaurantId?.toString?.() ?? "",
        restaurantName: restaurant?.name ?? "",
        ownerId: restaurant?.ownerId?.toString?.() ?? "",
        methodId: payoutMethod._id.toString(),
        pendingAccountNumber: payoutMethod.pendingAccountNumber,
        pendingAccountName: payoutMethod.pendingAccountName,
        serviceAreaSnapshot: serviceArea,
        zoneId: serviceArea.zoneId,
        districtId: serviceArea.districtId,
      },
    })

    if (restaurant?.ownerId) {
      emitSocketEvent(`owner:${restaurant.ownerId.toString()}`, "payout.method.updated", {
        methodId: payoutMethod._id.toString(),
        restaurantId: payoutMethod.restaurantId?.toString?.() ?? "",
        status: payoutMethod.pendingVerificationStatus,
      })
    }
  }

  otpSession.status =
    otpSession.purpose === "password_reset" || otpSession.purpose === "owner_password_reset"
      ? "verified"
      : "consumed"
  otpSession.verifiedAt = new Date()
  await recordOtpVerificationSuccess(otpSession, params)
  await otpSession.save()

  return {
    verified: true,
    purpose: otpSession.purpose,
    nextStatus
  }
}

async function getVerifiedPasswordResetSession(verificationSessionId: string) {
  const otpSession = await OtpSessionModel.findById(verificationSessionId)

  if (
    !otpSession ||
    (otpSession.purpose !== "password_reset" && otpSession.purpose !== "owner_password_reset")
  ) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "RESET_SESSION_NOT_FOUND",
      "Password reset session not found"
    )
  }

  if (otpSession.status !== "verified") {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "RESET_SESSION_NOT_VERIFIED",
      "Verify OTP before resetting the password"
    )
  }

  return otpSession
}

export async function requestPasswordReset(params: {
  phone: string
  userAgent?: string
  ipAddress?: string
}) {
  const owner = await OwnerModel.findOne({ phone: params.phone })

  if (!owner) {
    throw new AppError(StatusCodes.NOT_FOUND, "OWNER_NOT_FOUND", "Owner not found")
  }

  return sendOtpForPurpose({
    ownerId: owner.id,
    phone: params.phone,
    purpose: "password_reset",
    referenceId: owner.id,
    userAgent: params.userAgent,
    ipAddress: params.ipAddress
  })
}

export async function requestOwnerMobilePasswordReset(params: {
  phone: string
  userAgent?: string
  ipAddress?: string
}) {
  const owner = await OwnerModel.findOne({ phone: params.phone })

  if (!owner) {
    throw new AppError(StatusCodes.NOT_FOUND, "OWNER_NOT_FOUND", "Owner not found")
  }

  if (owner.status !== "active") {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "ACCOUNT_UNAVAILABLE",
      "This account is not available for password reset"
    )
  }

  if (!owner.isPhoneVerified) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "PHONE_NOT_VERIFIED",
      "Please verify your phone number before resetting the password"
    )
  }

  return sendOtpForPurpose({
    ownerId: owner.id,
    phone: params.phone,
    purpose: "owner_password_reset",
    referenceId: owner.id,
    userAgent: params.userAgent,
    ipAddress: params.ipAddress
  })
}

export async function resetPassword(params: {
  verificationSessionId: string
  newPassword: string
}) {
  const otpSession = await getVerifiedPasswordResetSession(params.verificationSessionId)
  const owner = await OwnerModel.findById(otpSession.referenceId)

  if (!owner) {
    throw new AppError(StatusCodes.NOT_FOUND, "OWNER_NOT_FOUND", "Owner not found")
  }

  owner.passwordHash = await hashPassword(params.newPassword)
  await owner.save()

  otpSession.status = "consumed"
  await otpSession.save()

  return { reset: true }
}

export async function refreshOwnerSession(params: {
  refreshToken: string
  userAgent?: string
  ipAddress?: string
}) {
  const payload = verifyRefreshToken(params.refreshToken)

  if (!payload.tokenId) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "INVALID_REFRESH_TOKEN", "Invalid refresh token")
  }

  const refreshSession = await RefreshTokenSessionModel.findOne({
    tokenId: payload.tokenId,
    ownerId: payload.sub
  })

  if (!refreshSession || refreshSession.revokedAt) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "SESSION_REVOKED", "Refresh session is not active")
  }

  if (refreshSession.expiresAt.getTime() < Date.now()) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "SESSION_EXPIRED", "Refresh session has expired")
  }

  const isTokenValid = await comparePassword(params.refreshToken, refreshSession.tokenHash)

  if (!isTokenValid) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "INVALID_REFRESH_TOKEN", "Invalid refresh token")
  }

  const owner = await OwnerModel.findById(payload.sub)

  if (!owner) {
    throw new AppError(StatusCodes.NOT_FOUND, "OWNER_NOT_FOUND", "Owner not found")
  }

  // Do NOT rotate the owner refresh token. Owners can have the web dashboard open in
  // several tabs (plus the mobile app); rotating (revoke-old + issue-new) revokes the
  // tokenId the instant another tab/request still holds it, so its next refresh hits
  // SESSION_REVOKED (401) and the owner is force-logged-out at random. Reusing the
  // long-lived (10y) session keeps every client valid; it stays revocable by tokenId
  // on explicit logout. (Same fix as customer, and now admin.)
  return buildAuthResponse({
    ownerId: owner.id,
    role: "owner",
    restaurantId: owner.activeRestaurantId?.toString(),
    lifecycleStatus: owner.restaurantLifecycleStatus,
    fullName: owner.fullName,
    phone: owner.phone,
    isPhoneVerified: owner.isPhoneVerified,
    refreshToken: params.refreshToken,
    tokenId: refreshSession.tokenId
  })
}

export async function logoutOwnerSession(refreshToken: string) {
  const payload = verifyRefreshToken(refreshToken)

  if (!payload.tokenId) {
    return { revoked: true }
  }

  await RefreshTokenSessionModel.findOneAndUpdate(
    { tokenId: payload.tokenId, ownerId: payload.sub, revokedAt: null },
    { revokedAt: new Date() }
  )

  return { revoked: true }
}
