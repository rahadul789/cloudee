import crypto from "node:crypto"
import mongoose from "mongoose"
import { StatusCodes } from "http-status-codes"

import { AppError } from "../../common/utils/app-error"
import { enqueueBackgroundTask } from "../../common/utils/background-task"
import { logger } from "../../config/logger"
import { createAdminOperationalAlert } from "../admin/admin-alert.service"
import { OrderModel } from "../owner/operational.model"
import { getPlatformContent } from "../public/content.service"
import {
  CustomerModel,
  VoucherAuditModel,
  VoucherModel,
  VoucherRedemptionModel,
} from "./customer.model"
import { deviceHasFirstOrderWelcome } from "./first-order-discount.service"
import { createCustomerNotification, sendPushToCustomer } from "./push.service"

export const REFERRAL_REWARD_AMOUNT = 50
export const REFERRAL_REWARD_MIN_ORDER_AMOUNT = 250
export const REFERRAL_REWARD_EXPIRY_DAYS = 30
const REFERRAL_SHARE_LINK_TEMPLATE = "foodbela://checkout?ref={{code}}"
const REFERRAL_SHARE_MESSAGE_TEMPLATE =
  "Use my Foodbela referral code {{code}} at checkout before your first delivered order. After your first delivered order, I get a Tk {{rewardAmount}} reward voucher. {{link}}"

const REFERRAL_CODE_LENGTH = 7
const REFERRAL_REWARD_CODE_LENGTH = 8
const REFERRAL_REVIEW_LOOKBACK_DAYS = 30
const REFERRAL_SAME_DEVICE_REVIEW_THRESHOLD = 3
const REFERRAL_SAME_IP_REVIEW_THRESHOLD = 5
const REFERRAL_SAME_ADDRESS_REVIEW_THRESHOLD = 3
const REFERRAL_INELIGIBLE_MESSAGE =
  "Referral reward was blocked by Foodbela rules. This can happen for self-referral, same phone/device, or suspicious activity. If you think this is wrong, please contact support."

type ReferralRewardStatus =
  | "pending"
  | "rewarded"
  | "capped"
  | "disabled"
  | "under_review"
  | "rejected"

type ReferralProgramSettings = {
  enabled: boolean
  rewardAmountTaka: number
  refereeRewardAmountTaka: number
  minimumOrderAmountTaka: number
  voucherExpiryDays: number
  monthlyRewardCapPerCustomer: number
  shareLinkTemplate: string
  shareMessageTemplate: string
}

function normalizeReferralCode(value?: string | null) {
  return (value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16)
}

function normalizeReferralText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : ""
}

function renderReferralShareTemplate(
  template: string,
  values: Record<string, string | number>
) {
  return Object.entries(values).reduce(
    (message, [key, value]) => message.replaceAll(`{{${key}}}`, String(value)),
    template
  )
}

function buildReferralShareContent(params: {
  referralCode: string
  settings: ReferralProgramSettings
}) {
  const encodedCode = encodeURIComponent(params.referralCode)
  const baseValues = {
    code: params.referralCode,
    referralCode: params.referralCode,
    encodedCode,
    rewardAmount: params.settings.rewardAmountTaka,
    minimumOrderAmount: params.settings.minimumOrderAmountTaka,
    rewardExpiryDays: params.settings.voucherExpiryDays,
    monthlyRewardCap: params.settings.monthlyRewardCapPerCustomer,
    platformName: "Foodbela",
  }
  const shareLink =
    renderReferralShareTemplate(params.settings.shareLinkTemplate, {
      ...baseValues,
      link: "",
    }).trim() || renderReferralShareTemplate(REFERRAL_SHARE_LINK_TEMPLATE, baseValues)
  const shareMessage =
    renderReferralShareTemplate(params.settings.shareMessageTemplate, {
      ...baseValues,
      link: shareLink,
    }).trim() ||
    renderReferralShareTemplate(REFERRAL_SHARE_MESSAGE_TEMPLATE, {
      ...baseValues,
      link: shareLink,
    })

  return { shareLink, shareMessage }
}

function normalizePhone(value: unknown) {
  return typeof value === "string" ? value.replace(/\D/g, "") : ""
}

function normalizeDeviceId(value: unknown) {
  return normalizeReferralText(value, 160)
}

function getCustomerId(customer: Record<string, any> | null | undefined) {
  return String(customer?._id ?? customer?.id ?? "")
}

function setReferralField(
  customer: { set?: (path: string, value: unknown) => void } & Record<string, any>,
  path: string,
  value: unknown
) {
  if (customer.set) {
    customer.set(path, value)
    return
  }
  customer[path] = value
}

function collectCustomerPhones(customer: Record<string, any>) {
  const phones = new Set<string>()
  const currentPhone = normalizePhone(customer.phone)
  if (currentPhone) phones.add(currentPhone)
  const previousPhones = Array.isArray(customer.previousPhones)
    ? customer.previousPhones
    : []
  previousPhones.forEach((entry: Record<string, unknown>) => {
    const phone = normalizePhone(entry?.phone)
    if (phone) phones.add(phone)
  })
  return phones
}

function setsOverlap(left: Set<string>, right: Set<string>) {
  for (const value of left) {
    if (right.has(value)) return true
  }
  return false
}

function collectCustomerDeviceIds(customer: Record<string, any>) {
  const deviceIds = new Set<string>()
  const directDeviceIds = [
    customer.lastKnownDeviceId,
    customer.referralSignupDeviceId,
  ]
  directDeviceIds.forEach((value) => {
    const deviceId = normalizeDeviceId(value)
    if (deviceId) deviceIds.add(deviceId)
  })
  const pushTokens = Array.isArray(customer.pushTokens) ? customer.pushTokens : []
  pushTokens.forEach((token: Record<string, unknown>) => {
    const deviceId = normalizeDeviceId(token?.deviceId)
    if (deviceId) deviceIds.add(deviceId)
  })
  return deviceIds
}

async function getWelcomePerkDeviceConflict(params: {
  customer: Record<string, any>
  installId?: string
  excludeCustomerId?: unknown
}) {
  const deviceIds = collectCustomerDeviceIds(params.customer)
  const installDeviceId = normalizeDeviceId(params.installId)
  if (installDeviceId) deviceIds.add(installDeviceId)

  const deviceIdList = [...deviceIds]
  if (!deviceIdList.length) {
    return {
      conflict: false,
      deviceIds: deviceIdList,
      referralWelcomeOnDevice: false,
      firstOrderWelcomeOnDevice: false,
      reasonKey: "",
    }
  }

  const referralWelcomeQuery: Record<string, unknown> = {
    refereeRewardGrantedAt: { $ne: null },
    $or: [
      { referralSignupDeviceId: { $in: deviceIdList } },
      { lastKnownDeviceId: { $in: deviceIdList } },
    ],
  }
  const excludeCustomerId = String(params.excludeCustomerId ?? "").trim()
  if (excludeCustomerId && mongoose.Types.ObjectId.isValid(excludeCustomerId)) {
    referralWelcomeQuery._id = {
      $ne: new mongoose.Types.ObjectId(excludeCustomerId),
    }
  }

  const [referralWelcomeOnDevice, firstOrderWelcomeOnDevice] =
    await Promise.all([
      CustomerModel.exists(referralWelcomeQuery),
      deviceHasFirstOrderWelcome(deviceIdList),
    ])

  const hasReferralConflict = Boolean(referralWelcomeOnDevice)
  const hasFirstOrderConflict = Boolean(firstOrderWelcomeOnDevice)

  return {
    conflict: hasReferralConflict || hasFirstOrderConflict,
    deviceIds: deviceIdList,
    referralWelcomeOnDevice: hasReferralConflict,
    firstOrderWelcomeOnDevice: hasFirstOrderConflict,
    reasonKey: hasReferralConflict
      ? "referral_same_device"
      : hasFirstOrderConflict
        ? "referral_device_used_first_order"
        : "",
  }
}

function buildReferralAlertDedupeKey(params: {
  referredCustomerId: string
  orderId?: string
  reasonKeys: string[]
}) {
  const hash = crypto
    .createHash("sha256")
    .update(
      [
        params.referredCustomerId,
        params.orderId ?? "",
        ...params.reasonKeys,
      ].join("|")
    )
    .digest("hex")
    .slice(0, 24)
  return `referral-fraud:${hash}`
}

async function createReferralFraudAlert(params: {
  severity?: "warning" | "critical"
  title: string
  description: string
  referrerId?: string
  referredCustomerId: string
  orderId?: string
  reasonKeys: string[]
  metadata?: Record<string, unknown>
}) {
  try {
    await createAdminOperationalAlert({
      alertType: "referral_fraud",
      severity: params.severity ?? "warning",
      title: params.title,
      description: params.description,
      source: "security",
      entityType: "customer",
      entityId: params.referredCustomerId,
      path: "/users",
      iconKey: "shield-alert",
      dedupeKey: buildReferralAlertDedupeKey({
        referredCustomerId: params.referredCustomerId,
        orderId: params.orderId,
        reasonKeys: params.reasonKeys,
      }),
      metadata: {
        referrerId: params.referrerId ?? "",
        referredCustomerId: params.referredCustomerId,
        orderId: params.orderId ?? "",
        reasonKeys: params.reasonKeys,
        ...(params.metadata ?? {}),
      },
    })
  } catch (error) {
    logger.warn(
      { error, referredCustomerId: params.referredCustomerId },
      "Referral fraud alert failed"
    )
  }
}

function randomAlphaNumeric(length: number) {
  return crypto
    .randomBytes(Math.ceil(length * 1.4))
    .toString("base64url")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, length)
}

function getCurrentUtcMonthRange(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { start, end }
}

export async function getReferralProgramSettings(): Promise<ReferralProgramSettings> {
  const content = await getPlatformContent()
  const referrals = content.operations?.referrals

  return {
    enabled: referrals?.enabled !== false,
    rewardAmountTaka: referrals?.rewardAmountTaka ?? REFERRAL_REWARD_AMOUNT,
    refereeRewardAmountTaka:
      referrals?.refereeRewardAmountTaka ??
      referrals?.rewardAmountTaka ??
      REFERRAL_REWARD_AMOUNT,
    minimumOrderAmountTaka:
      referrals?.minimumOrderAmountTaka ?? REFERRAL_REWARD_MIN_ORDER_AMOUNT,
    voucherExpiryDays: referrals?.voucherExpiryDays ?? REFERRAL_REWARD_EXPIRY_DAYS,
    monthlyRewardCapPerCustomer: referrals?.monthlyRewardCapPerCustomer ?? 5,
    shareLinkTemplate:
      normalizeReferralText(referrals?.shareLinkTemplate, 500) ||
      REFERRAL_SHARE_LINK_TEMPLATE,
    shareMessageTemplate:
      normalizeReferralText(referrals?.shareMessageTemplate, 700) ||
      REFERRAL_SHARE_MESSAGE_TEMPLATE,
  }
}

async function getReferralApplyEligibility(params: {
  customer: Record<string, any>
  settings?: ReferralProgramSettings
}) {
  const settings = params.settings ?? (await getReferralProgramSettings())
  const deliveredOrderCount = await OrderModel.countDocuments({
    customerId: params.customer._id,
    status: "Delivered",
  })

  if (!settings.enabled) {
    return {
      canApply: false,
      reason: "Referral program is paused right now.",
    }
  }

  if (params.customer.referralDisabledByAdmin) {
    return {
      canApply: false,
      reason: "Referrals are turned off for this account.",
    }
  }

  if (params.customer.referredByCustomerId) {
    return {
      canApply: false,
      reason: "A referral code is already linked to this account.",
    }
  }

  if (deliveredOrderCount > 0) {
    return {
      canApply: false,
      reason: "Referral codes only work before your first delivered order.",
    }
  }

  if (["under_review", "rejected", "capped", "disabled", "rewarded"].includes(
    String(params.customer.referralRewardStatus ?? "")
  )) {
    return {
      canApply: false,
      reason: "Referral codes are not available for this account.",
    }
  }

  return {
    canApply: true,
    reason: "",
  }
}

export async function createCustomerReferralCode() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = `FB${randomAlphaNumeric(REFERRAL_CODE_LENGTH)}`
    const existing = await CustomerModel.exists({ referralCode: candidate })
    if (!existing) return candidate
  }

  throw new AppError(
    StatusCodes.INTERNAL_SERVER_ERROR,
    "REFERRAL_CODE_GENERATION_FAILED",
    "Could not generate a referral code right now"
  )
}

async function createReferralRewardVoucherCode(session?: mongoose.ClientSession) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = `REF${randomAlphaNumeric(REFERRAL_REWARD_CODE_LENGTH)}`
    const existingQuery = VoucherModel.exists({ code: candidate })
    const existing = session ? await existingQuery.session(session) : await existingQuery
    if (!existing) return candidate
  }

  throw new AppError(
    StatusCodes.INTERNAL_SERVER_ERROR,
    "REFERRAL_VOUCHER_CODE_GENERATION_FAILED",
    "Could not generate a reward voucher right now"
  )
}

export async function ensureCustomerReferralCode(customer: {
  id?: string
  _id?: unknown
  referralCode?: string | null
  set?: (path: string, value: unknown) => void
  save?: () => Promise<unknown>
}) {
  const existingCode = normalizeReferralCode(customer.referralCode)
  if (existingCode) return existingCode

  if (!customer.save) {
    return createCustomerReferralCode()
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const nextCode = await createCustomerReferralCode()

    try {
      if (customer.set) {
        customer.set("referralCode", nextCode)
      } else {
        customer.referralCode = nextCode
      }
      await customer.save()
      return nextCode
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: number }).code === 11000
      ) {
        continue
      }
      throw error
    }
  }

  throw new AppError(
    StatusCodes.INTERNAL_SERVER_ERROR,
    "REFERRAL_CODE_GENERATION_FAILED",
    "Could not generate a referral code right now"
  )
}

export async function attachReferralToNewCustomer(params: {
  customer: {
    id?: string
    _id?: unknown
    phone?: string | null
    referredByCustomerId?: unknown
    set?: (path: string, value: unknown) => void
  }
  referralCode?: string
  installId?: string
  ipAddress?: string
  userAgent?: string
}) {
  const referralCode = normalizeReferralCode(params.referralCode)
  if (!referralCode) return null

  const settings = await getReferralProgramSettings()
  if (!settings.enabled) return null

  if (params.customer.referredByCustomerId) {
    return null
  }

  const referrer = await CustomerModel.findOne({
    referralCode,
    status: "active",
  }).select(
    "_id fullName phone status previousPhones pushTokens lastKnownDeviceId referralSignupDeviceId referralDisabledByAdmin"
  )

  if (!referrer) {
    return null
  }

  const customerId = String(params.customer._id ?? params.customer.id ?? "")
  if (referrer.id === customerId) {
    return null
  }

  if (referrer.referralDisabledByAdmin) {
    return null
  }

  const referrerDeliveredOrders = await OrderModel.countDocuments({
    customerId: referrer._id,
    status: "Delivered",
  })
  if (referrerDeliveredOrders < 1) {
    return null
  }

  const referredAt = new Date()
  const signupDeviceId = normalizeDeviceId(params.installId)
  const signupIpAddress = normalizeReferralText(params.ipAddress, 80)
  const signupUserAgent = normalizeReferralText(params.userAgent, 300)
  const referrerPhones = collectCustomerPhones(referrer)
  const referredPhones = new Set<string>()
  const referredPhone = normalizePhone(params.customer.phone)
  if (referredPhone) referredPhones.add(referredPhone)
  const referrerDeviceIds = collectCustomerDeviceIds(referrer)
  const rejectedReasonKeys: string[] = []

  if (referredPhone && setsOverlap(referrerPhones, referredPhones)) {
    rejectedReasonKeys.push("same_or_previous_phone")
  }
  if (signupDeviceId && referrerDeviceIds.has(signupDeviceId)) {
    rejectedReasonKeys.push("same_device")
  }

  const welcomeConflict = await getWelcomePerkDeviceConflict({
    customer: params.customer as Record<string, any>,
    installId: params.installId,
    excludeCustomerId: params.customer._id ?? params.customer.id,
  })
  if (welcomeConflict.conflict) {
    await createReferralFraudAlert({
      severity: "warning",
      title: "Referral blocked (device already used a welcome offer)",
      description:
        "A signup referral code was submitted from a device that had already received a welcome perk. The account was created without linking the referral.",
      referrerId: referrer.id,
      referredCustomerId: customerId || referredPhone || "new-customer",
      reasonKeys: [welcomeConflict.reasonKey || "referral_device_welcome_conflict"],
      metadata: {
        referralCode,
        referrerPhone: referrer.phone ?? "",
        referredPhone: params.customer.phone ?? "",
        signupDeviceId,
        signupIpAddress,
        deviceIds: welcomeConflict.deviceIds,
        referralWelcomeOnDevice: welcomeConflict.referralWelcomeOnDevice,
        firstOrderWelcomeOnDevice: welcomeConflict.firstOrderWelcomeOnDevice,
      },
    })
    return {
      referrerId: referrer.id,
      referrerName: referrer.fullName ?? "",
      rejected: true,
    }
  }

  setReferralField(params.customer, "referredByCustomerId", referrer._id)
  setReferralField(params.customer, "referredAt", referredAt)
  if (signupDeviceId) {
    setReferralField(params.customer, "referralSignupDeviceId", signupDeviceId)
  }
  if (signupIpAddress) {
    setReferralField(params.customer, "referralSignupIpAddress", signupIpAddress)
  }
  if (signupUserAgent) {
    setReferralField(params.customer, "referralSignupUserAgent", signupUserAgent)
  }

  if (rejectedReasonKeys.length) {
    const now = new Date()
    setReferralField(params.customer, "referralRewardStatus", "rejected")
    setReferralField(params.customer, "referralRewardSkippedAt", now)
    setReferralField(
      params.customer,
      "referralRewardSkippedReason",
      REFERRAL_INELIGIBLE_MESSAGE
    )
    await createReferralFraudAlert({
      severity: "critical",
      title: "Referral reward rejected",
      description:
        "A new referral matched self-referral fraud signals and was rejected before reward eligibility.",
      referrerId: referrer.id,
      referredCustomerId: customerId || referredPhone || "new-customer",
      reasonKeys: rejectedReasonKeys,
      metadata: {
        referralCode,
        referrerPhone: referrer.phone ?? "",
        referredPhone: params.customer.phone ?? "",
        signupDeviceId,
        signupIpAddress,
      },
    })
  }

  return {
    referrerId: referrer.id,
    referrerName: referrer.fullName ?? "",
    rejected: rejectedReasonKeys.length > 0,
  }
}

function formatReferralRewardExpiry(date?: Date | string | null) {
  return date ? new Date(date).toISOString() : null
}

export async function grantRefereeWelcomeVoucherToCustomer(params: {
  customer: Record<string, any>
  settings?: ReferralProgramSettings
}) {
  const settings = params.settings ?? (await getReferralProgramSettings())
  if (settings.refereeRewardAmountTaka <= 0) return false

  const customerId = getCustomerId(params.customer)
  if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) return false

  const customerObjectId = new mongoose.Types.ObjectId(customerId)
  const refereeVoucherId = new mongoose.Types.ObjectId()
  const refereeVoucherCode = await createReferralRewardVoucherCode()
  const now = new Date()
  const expiresAt = new Date(
    now.getTime() + settings.voucherExpiryDays * 24 * 60 * 60 * 1000,
  )
  const session = await mongoose.startSession()
  let granted = false

  try {
    await session.withTransaction(async () => {
      const marker = await CustomerModel.updateOne(
        {
          _id: customerObjectId,
          refereeRewardGrantedAt: null,
          refereeRewardVoucherId: null,
        },
        {
          $set: {
            refereeRewardVoucherId: refereeVoucherId,
            refereeRewardGrantedAt: now,
          },
        },
        { session },
      )
      if (marker.modifiedCount === 0) return

      await VoucherModel.create(
        [
          {
            _id: refereeVoucherId,
            restaurantId: null,
            scopeType: "all_restaurants",
            selectedRestaurantIds: [],
            audienceType: "selected_users",
            selectedCustomerIds: [customerObjectId],
            createdByType: "system",
            createdById: "referral-system",
            fundedBy: "platform",
            ownerSharePercent: 0,
            platformSharePercent: 100,
            stackingRule: "exclusive",
            priority: 80,
            mode: "auto",
            type: "flat",
            name: "Welcome referral reward",
            code: refereeVoucherCode,
            discountValue: settings.refereeRewardAmountTaka,
            maxDiscountAmount: settings.refereeRewardAmountTaka,
            minimumOrderAmount: settings.minimumOrderAmountTaka,
            maxTotalUses: 1,
            maxUsesPerUser: 1,
            allowRepeatUsage: false,
            status: "Active",
            applicability: "all",
            startsAt: now,
            endsAt: expiresAt,
            display: {
              showOnHome: true,
              showInOfferStrip: true,
              placement: "offers_row",
              variant: "chip",
              title: `Tk ${settings.refereeRewardAmountTaka} welcome reward`,
              subtitle: `Use on orders over Tk ${settings.minimumOrderAmountTaka}`,
              ctaLabel: "Order now",
              ctaPath: "/(tabs)/browse",
              backgroundColor: "#FFF0F6",
              textColor: "#3F2432",
              accentColor: "#FF5C93",
            },
          },
        ],
        { session },
      )
      granted = true
    })
  } catch (error) {
    logger.warn(
      { error, customerId },
      "Failed to grant referee welcome voucher",
    )
    return false
  } finally {
    await session.endSession()
  }

  if (!granted) return false

  try {
    await createCustomerNotification({
      customerId,
      payload: {
        title: `Tk ${settings.refereeRewardAmountTaka} welcome reward`,
        body: `Your friend's referral gave you Tk ${settings.refereeRewardAmountTaka} off. Use it on orders over Tk ${settings.minimumOrderAmountTaka}.`,
        data: {
          type: "promotion",
          personalOffer: true,
          voucherId: String(refereeVoucherId),
          voucherCode: refereeVoucherCode,
          voucherLabel: `Tk ${settings.refereeRewardAmountTaka} welcome reward`,
          voucherExpiresAt: expiresAt.toISOString(),
          voucherMinOrder: settings.minimumOrderAmountTaka,
          path: "/offers",
        },
      },
    })
  } catch (error) {
    logger.warn(
      { error, customerId },
      "Failed to notify referee welcome voucher",
    )
  }

  return true
}

// Would applying a referral code on THIS device actually grant a welcome voucher? False
// once this physical device has consumed any welcome perk (a prior referee voucher OR the
// first-order discount). Drives the client hint so we never invite a referral on a device
// that can't benefit from one.
async function isDeviceWelcomeEligible(params: {
  customer: Record<string, any>
  installId?: string
}) {
  const conflict = await getWelcomePerkDeviceConflict({
    customer: params.customer,
    installId: params.installId,
    excludeCustomerId: params.customer._id,
  })
  return !conflict.conflict
}

export async function getCustomerReferralSummary(
  customerId: string,
  installId?: string
) {
  const customer = await CustomerModel.findById(customerId)

  if (!customer) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "CUSTOMER_NOT_FOUND",
      "Customer not found"
    )
  }

  const referralCode = await ensureCustomerReferralCode(customer)
  const settings = await getReferralProgramSettings()
  const applyEligibility = await getReferralApplyEligibility({
    customer,
    settings,
  })
  const deviceWelcomeEligible = await isDeviceWelcomeEligible({
    customer,
    installId,
  })
  const shareContent = buildReferralShareContent({ referralCode, settings })
  const monthRange = getCurrentUtcMonthRange()
  const referrals = await CustomerModel.find({
    referredByCustomerId: customer._id,
  })
    .select(
      "fullName phone createdAt referralRewardedAt referralRewardOrderId referralRewardVoucherId referralRewardStatus referralRewardSkippedAt referralRewardSkippedReason"
    )
    .sort({ createdAt: -1 })
    .limit(40)
    .lean()

  const rewardVoucherIds = referrals
    .map((referral) => referral.referralRewardVoucherId)
    .filter(Boolean)

  const vouchers = rewardVoucherIds.length
    ? await VoucherModel.find({ _id: { $in: rewardVoucherIds } })
        .select("code discountValue minimumOrderAmount endsAt status redeemedCount maxTotalUses")
        .lean()
    : []
  const voucherById = new Map(
    vouchers.map((voucher) => [String(voucher._id), voucher])
  )

  const rewardedReferrals = referrals.filter(
    (referral) => referral.referralRewardedAt
  ).length
  const cappedReferrals = referrals.filter(
    (referral) => referral.referralRewardStatus === "capped"
  ).length
  const disabledReferrals = referrals.filter(
    (referral) => referral.referralRewardStatus === "disabled"
  ).length
  const underReviewReferrals = referrals.filter(
    (referral) => referral.referralRewardStatus === "under_review"
  ).length
  const rejectedReferrals = referrals.filter(
    (referral) => referral.referralRewardStatus === "rejected"
  ).length
  const monthlyRewardCount = await CustomerModel.countDocuments({
    referredByCustomerId: customer._id,
    referralRewardedAt: { $gte: monthRange.start, $lt: monthRange.end },
  })

  return {
    enabled: settings.enabled,
    referralCode,
    referralDisabledByAdmin: Boolean(customer.referralDisabledByAdmin),
    canApplyReferralCode: applyEligibility.canApply,
    referralCodeIneligibleReason: applyEligibility.reason,
    deviceWelcomeEligible,
    shareLink: shareContent.shareLink,
    shareMessage: shareContent.shareMessage,
    rewardAmount: settings.rewardAmountTaka,
    refereeRewardAmount: settings.refereeRewardAmountTaka,
    minimumOrderAmount: settings.minimumOrderAmountTaka,
    rewardExpiryDays: settings.voucherExpiryDays,
    monthlyRewardCap: settings.monthlyRewardCapPerCustomer,
    monthlyRewardCount,
    totalReferrals: referrals.length,
    pendingReferrals:
      referrals.length -
      rewardedReferrals -
      cappedReferrals -
      disabledReferrals -
      underReviewReferrals -
      rejectedReferrals,
    rewardedReferrals,
    cappedReferrals,
    disabledReferrals,
    underReviewReferrals,
    rejectedReferrals,
    rewards: referrals.map((referral) => {
      const voucher = referral.referralRewardVoucherId
        ? voucherById.get(String(referral.referralRewardVoucherId))
        : null
      const rawStatus = String(referral.referralRewardStatus ?? "")
      const status =
        rawStatus === "under_review" || rawStatus === "rejected"
          ? rawStatus
          : referral.referralRewardedAt
          ? "rewarded"
          : rawStatus === "capped" || rawStatus === "disabled"
            ? rawStatus
            : "pending"

      const rawPhone = String(referral.phone ?? "").trim()
      const maskedPhone =
        rawPhone.length >= 7
          ? `${rawPhone.slice(0, 3)}***${rawPhone.slice(-4)}`
          : rawPhone

      return {
        referredCustomerName:
          referral.fullName?.trim() &&
          referral.fullName !== "Foodbela User" &&
          referral.fullName !== "Your name"
            ? referral.fullName
            : "Friend",
        referredCustomerPhone: maskedPhone,
        referredAt: referral.createdAt
          ? new Date(referral.createdAt).toISOString()
          : null,
        status,
        rewardedAt: formatReferralRewardExpiry(referral.referralRewardedAt),
        skippedAt: formatReferralRewardExpiry(referral.referralRewardSkippedAt),
        skippedReason: referral.referralRewardSkippedReason ?? "",
        rewardOrderId: referral.referralRewardOrderId
          ? String(referral.referralRewardOrderId)
          : "",
        voucher: status === "rewarded" && voucher
          ? {
              id: String(voucher._id),
              code: voucher.code ?? "",
              amount: voucher.discountValue ?? settings.rewardAmountTaka,
              minimumOrderAmount:
                voucher.minimumOrderAmount ?? settings.minimumOrderAmountTaka,
              expiresAt: formatReferralRewardExpiry(voucher.endsAt),
              status: voucher.status ?? "Active",
              used:
                Number(voucher.redeemedCount ?? 0) >=
                Number(voucher.maxTotalUses ?? 1),
            }
          : null,
      }
    }),
  }
}

export async function applyReferralCodeToCustomer(params: {
  customerId: string
  referralCode: string
  installId?: string
  ipAddress?: string
  userAgent?: string
}) {
  const referralCode = normalizeReferralCode(params.referralCode)
  if (!referralCode) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "REFERRAL_CODE_REQUIRED",
      "Enter a referral code to continue."
    )
  }

  const customer = await CustomerModel.findById(params.customerId)
  if (!customer) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "CUSTOMER_NOT_FOUND",
      "Customer not found"
    )
  }

  if (customer.status !== "active") {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "CUSTOMER_ACCOUNT_UNAVAILABLE",
      "This account cannot use referral codes right now."
    )
  }

  const settings = await getReferralProgramSettings()
  const eligibility = await getReferralApplyEligibility({ customer, settings })
  if (!eligibility.canApply) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "REFERRAL_NOT_ELIGIBLE",
      eligibility.reason || "Referral code is not available for this account."
    )
  }

  if (normalizeReferralCode(customer.referralCode) === referralCode) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "SELF_REFERRAL_NOT_ALLOWED",
      "You cannot use your own referral code."
    )
  }

  const referrer = await CustomerModel.findOne({
    referralCode,
    status: "active",
  }).select("_id fullName referralDisabledByAdmin")

  if (!referrer) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "REFERRAL_CODE_INVALID",
      "Referral code is invalid."
    )
  }

  if (referrer.id === customer.id) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "SELF_REFERRAL_NOT_ALLOWED",
      "You cannot use your own referral code."
    )
  }

  // Admin has turned off referrals for the code owner — treat their code as inactive.
  if (referrer.referralDisabledByAdmin) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "REFERRAL_CODE_NOT_ACTIVE",
      "This referral code isn't active right now."
    )
  }

  // The referrer must have completed at least one delivered order before their code
  // works — this stops brand-new accounts from farming referrals in a chain.
  const referrerDeliveredOrders = await OrderModel.countDocuments({
    customerId: referrer._id,
    status: "Delivered",
  })
  if (referrerDeliveredOrders < 1) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "REFERRAL_CODE_NOT_ACTIVE",
      "This referral code isn't active yet. The person who shared it needs to complete at least one order first."
    )
  }

  // One physical device gets ONE welcome perk total. If this device has ALREADY used a
  // welcome perk — a prior referee voucher (another fresh account here) OR the first-order
  // welcome discount — REJECT the referral outright (symmetric with the first-order block),
  // BEFORE linking. This is what stops "same device + new phone number" from re-running the
  // referral flow. (Doing it after linking only skipped the voucher but still showed the
  // referral as "applied", which read as "allowed on the same device".)
  const welcomeConflict = await getWelcomePerkDeviceConflict({
    customer,
    installId: params.installId,
    excludeCustomerId: customer._id,
  })
  if (welcomeConflict.conflict) {
    await createReferralFraudAlert({
      severity: "warning",
      title: "Referral blocked (device already used a welcome offer)",
      description:
        "A referral code was applied on a device that had already received a welcome perk (referral or first-order). It was rejected to prevent same-device farming.",
      referrerId: referrer.id,
      referredCustomerId: customer.id,
      reasonKeys: [welcomeConflict.reasonKey || "referral_device_welcome_conflict"],
      metadata: {
        deviceIds: welcomeConflict.deviceIds,
        referralWelcomeOnDevice: welcomeConflict.referralWelcomeOnDevice,
        firstOrderWelcomeOnDevice: welcomeConflict.firstOrderWelcomeOnDevice,
      },
    })
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "REFERRAL_DEVICE_ALREADY_REWARDED",
      "This device has already used a welcome offer, so a referral can't be applied here."
    )
  }

  const result = await attachReferralToNewCustomer({
    customer,
    referralCode,
    installId: params.installId,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  })

  await customer.save()

  if (!result) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "REFERRAL_CODE_INVALID",
      "Referral code is invalid."
    )
  }

  if (result.rejected) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "REFERRAL_NOT_ELIGIBLE",
      REFERRAL_INELIGIBLE_MESSAGE
    )
  }

  // The one-welcome-perk-per-device gate ran BEFORE linking (above) and would have thrown,
  // so reaching here means this device is clear. Give the referred friend their welcome
  // voucher right away — platform-funded, single-use, auto-applied. Non-fatal on failure so
  // a voucher hiccup never blocks the (already-linked) referral.
  const refereeRewardGranted = await grantRefereeWelcomeVoucherToCustomer({
    customer,
    settings,
  })

  return {
    applied: true,
    referralCode,
    referrerName: result.referrerName || referrer.fullName || "Foodbela friend",
    welcomeVoucherGranted: refereeRewardGranted,
    welcomeVoucherAmount: refereeRewardGranted ? settings.refereeRewardAmountTaka : 0,
    message: refereeRewardGranted
      ? `Referral applied! Tk ${settings.refereeRewardAmountTaka} welcome reward added to your offers.`
      : "Referral code saved. The reward unlocks after your first delivered order.",
  }
}

function getOrderRefundStatus(order: Record<string, any>) {
  const paymentStatus = String(order.paymentStatus ?? "")
  const refundStatus = String(order.paymentSnapshot?.refundStatus ?? "")
  return { paymentStatus, refundStatus }
}

function isRefundedOrRefundPendingOrder(order: Record<string, any>) {
  const { paymentStatus, refundStatus } = getOrderRefundStatus(order)
  return (
    paymentStatus === "refunded" ||
    paymentStatus === "refund_pending" ||
    refundStatus === "refunded" ||
    refundStatus === "pending"
  )
}

async function markReferralRewardSkipped(params: {
  referredCustomer: Record<string, any>
  referrer?: Record<string, any> | null
  order?: Record<string, any> | null
  status: Exclude<ReferralRewardStatus, "pending" | "rewarded">
  skippedReason: string
  reasonKey: string
  alert?: {
    severity?: "warning" | "critical"
    title: string
    description: string
    metadata?: Record<string, unknown>
  }
}) {
  const now = new Date()
  await CustomerModel.updateOne(
    {
      _id: params.referredCustomer._id,
      referralRewardedAt: null,
      referralRewardVoucherId: null,
    },
    {
      $set: {
        referralRewardStatus: params.status,
        referralRewardSkippedAt: now,
        referralRewardSkippedReason: params.skippedReason,
        ...(params.order?._id ? { referralRewardOrderId: params.order._id } : {}),
      },
    }
  )

  if (params.alert) {
    await createReferralFraudAlert({
      severity: params.alert.severity,
      title: params.alert.title,
      description: params.alert.description,
      referrerId: params.referrer ? getCustomerId(params.referrer) : "",
      referredCustomerId: getCustomerId(params.referredCustomer),
      orderId: params.order?._id ? String(params.order._id) : "",
      reasonKeys: [params.reasonKey],
      metadata: params.alert.metadata,
    })
  }

  return { rewarded: false, reason: params.reasonKey }
}

function buildOrderAddressFingerprint(order: Record<string, any>) {
  const deliveryAddress = order.customerSnapshot?.deliveryAddress ?? {}
  const latitude =
    typeof deliveryAddress.latitude === "number" ? deliveryAddress.latitude : null
  const longitude =
    typeof deliveryAddress.longitude === "number" ? deliveryAddress.longitude : null
  if (latitude !== null && longitude !== null) {
    return `${latitude.toFixed(4)}:${longitude.toFixed(4)}`
  }

  const addressLine = normalizeReferralText(deliveryAddress.addressLine, 240)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
  return addressLine
}

async function countSameReferralAddressOrders(params: {
  referrerId: unknown
  referredCustomerId: unknown
  addressFingerprint: string
  since: Date
}) {
  if (!params.addressFingerprint) return 0
  const referredCustomers = await CustomerModel.find({
    _id: { $ne: params.referredCustomerId },
    referredByCustomerId: params.referrerId,
    createdAt: { $gte: params.since },
  })
    .select("_id")
    .limit(120)
    .lean()

  const referredCustomerIds = referredCustomers
    .map((customer) => String(customer._id))
    .filter(Boolean)

  if (!referredCustomerIds.length) return 0

  const orders = await OrderModel.find({
    customerId: { $in: referredCustomerIds },
    status: "Delivered",
    createdAt: { $gte: params.since },
  })
    .select("customerSnapshot.deliveryAddress")
    .limit(120)
    .lean()

  return orders.filter(
    (order) => buildOrderAddressFingerprint(order) === params.addressFingerprint
  ).length
}

async function collectReferralReviewSignals(params: {
  referrer: Record<string, any>
  referredCustomer: Record<string, any>
  order: Record<string, any>
}) {
  const since = new Date(
    Date.now() - REFERRAL_REVIEW_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  )
  const signals: string[] = []
  const deviceId = normalizeDeviceId(
    params.referredCustomer.referralSignupDeviceId ??
      params.referredCustomer.lastKnownDeviceId
  )
  const ipAddress = normalizeReferralText(
    params.referredCustomer.referralSignupIpAddress ??
      params.referredCustomer.lastKnownIpAddress,
    80
  )

  if (deviceId) {
    const sameDeviceCount = await CustomerModel.countDocuments({
      _id: { $ne: params.referredCustomer._id },
      referredByCustomerId: { $ne: null },
      referralSignupDeviceId: deviceId,
      createdAt: { $gte: since },
    })
    if (sameDeviceCount + 1 >= REFERRAL_SAME_DEVICE_REVIEW_THRESHOLD) {
      signals.push("too_many_referrals_same_device")
    }
  }

  if (ipAddress) {
    const sameIpCount = await CustomerModel.countDocuments({
      _id: { $ne: params.referredCustomer._id },
      referredByCustomerId: { $ne: null },
      referralSignupIpAddress: ipAddress,
      createdAt: { $gte: since },
    })
    if (sameIpCount + 1 >= REFERRAL_SAME_IP_REVIEW_THRESHOLD) {
      signals.push("too_many_referrals_same_ip")
    }
  }

  const addressFingerprint = buildOrderAddressFingerprint(params.order)
  if (addressFingerprint) {
    const sameAddressCount = await countSameReferralAddressOrders({
      referrerId: params.referrer._id,
      referredCustomerId: params.referredCustomer._id,
      addressFingerprint,
      since,
    })
    if (sameAddressCount + 1 >= REFERRAL_SAME_ADDRESS_REVIEW_THRESHOLD) {
      signals.push("too_many_referrals_same_address")
    }
  }

  return {
    signals,
    deviceId,
    ipAddress,
    addressFingerprint,
  }
}

export async function grantReferralRewardForDeliveredOrder(params: {
  orderId: string
}) {
  const order = await OrderModel.findById(params.orderId).lean()

  if (!order || order.status !== "Delivered" || !order.customerId) {
    return { rewarded: false, reason: "order_not_delivered" as const }
  }

  const settings = await getReferralProgramSettings()

  const referredCustomer = await CustomerModel.findById(order.customerId)
  if (
    !referredCustomer ||
    !referredCustomer.referredByCustomerId ||
    referredCustomer.referralRewardedAt ||
    referredCustomer.referralRewardVoucherId ||
    ["capped", "disabled", "under_review", "rejected"].includes(
      String(referredCustomer.referralRewardStatus ?? "")
    )
  ) {
    return { rewarded: false, reason: "not_referred_or_already_rewarded" as const }
  }

  const referrer = await CustomerModel.findById(
    referredCustomer.referredByCustomerId
  ).select(
    "_id fullName status phone previousPhones pushTokens lastKnownDeviceId referralSignupDeviceId referralDisabledByAdmin"
  )

  if (!referrer || referrer.status !== "active") {
    return { rewarded: false, reason: "referrer_inactive" as const }
  }

  if (referrer.referralDisabledByAdmin) {
    return markReferralRewardSkipped({
      referredCustomer,
      referrer,
      order,
      status: "disabled",
      skippedReason: "Referrals are turned off for the referrer's account.",
      reasonKey: "referrer_referral_disabled",
    })
  }

  if (referrer.id === referredCustomer.id) {
    return markReferralRewardSkipped({
      referredCustomer,
      referrer,
      order,
      status: "rejected",
      skippedReason: REFERRAL_INELIGIBLE_MESSAGE,
      reasonKey: "self_referral",
      alert: {
        severity: "critical",
        title: "Referral reward rejected",
        description:
          "A referral reward was blocked because referrer and referred customer matched.",
      },
    })
  }

  if (!settings.enabled) {
    return markReferralRewardSkipped({
      referredCustomer,
      referrer,
      order,
      status: "disabled",
      skippedReason: "Referral program was disabled",
      reasonKey: "referral_program_disabled",
    })
  }

  if (isRefundedOrRefundPendingOrder(order)) {
    return markReferralRewardSkipped({
      referredCustomer,
      referrer,
      order,
      status: "rejected",
      skippedReason:
        "Referral reward was not issued because the qualifying order was refunded.",
      reasonKey: "qualifying_order_refunded",
      alert: {
        title: "Referral reward blocked for refunded order",
        description:
          "A delivered referral order had a refund state before the reward was issued.",
        metadata: getOrderRefundStatus(order),
      },
    })
  }

  const referrerPhones = collectCustomerPhones(referrer)
  const referredPhones = collectCustomerPhones(referredCustomer)
  if (setsOverlap(referrerPhones, referredPhones)) {
    return markReferralRewardSkipped({
      referredCustomer,
      referrer,
      order,
      status: "rejected",
      skippedReason: REFERRAL_INELIGIBLE_MESSAGE,
      reasonKey: "same_or_previous_phone",
      alert: {
        severity: "critical",
        title: "Referral reward rejected",
        description:
          "A referral reward was blocked because current or previous phone numbers overlap.",
      },
    })
  }

  const referrerDeviceIds = collectCustomerDeviceIds(referrer)
  const referredDeviceIds = collectCustomerDeviceIds(referredCustomer)
  if (setsOverlap(referrerDeviceIds, referredDeviceIds)) {
    return markReferralRewardSkipped({
      referredCustomer,
      referrer,
      order,
      status: "rejected",
      skippedReason: REFERRAL_INELIGIBLE_MESSAGE,
      reasonKey: "same_device",
      alert: {
        severity: "critical",
        title: "Referral reward rejected",
        description:
          "A referral reward was blocked because the referrer and referred customer used the same install/device ID.",
      },
    })
  }

  const welcomeConflict = await getWelcomePerkDeviceConflict({
    customer: referredCustomer,
    excludeCustomerId: referredCustomer._id,
  })
  if (welcomeConflict.conflict) {
    return markReferralRewardSkipped({
      referredCustomer,
      referrer,
      order,
      status: "rejected",
      skippedReason: REFERRAL_INELIGIBLE_MESSAGE,
      reasonKey: welcomeConflict.reasonKey || "referral_device_welcome_conflict",
      alert: {
        severity: "critical",
        title: "Referral reward rejected",
        description:
          "A referral reward was blocked because the referred customer's device had already used a welcome offer.",
        metadata: {
          deviceIds: welcomeConflict.deviceIds,
          referralWelcomeOnDevice: welcomeConflict.referralWelcomeOnDevice,
          firstOrderWelcomeOnDevice: welcomeConflict.firstOrderWelcomeOnDevice,
        },
      },
    })
  }

  const deliveredOrders = await OrderModel.find({
    customerId: referredCustomer.id,
    status: "Delivered",
  })
    .select("_id timestamps.Delivered createdAt")
    .sort({ "timestamps.Delivered": 1, createdAt: 1 })
    .limit(2)
    .lean()

  const isCurrentFirstDeliveredOrder =
    deliveredOrders.length === 1 &&
    String(deliveredOrders[0]?._id ?? "") === String(order._id)

  if (!isCurrentFirstDeliveredOrder) {
    return markReferralRewardSkipped({
      referredCustomer,
      referrer,
      order,
      status: "rejected",
      skippedReason: "Referral reward only applies to the first delivered order.",
      reasonKey: "not_first_delivered_order",
    })
  }

  const review = await collectReferralReviewSignals({
    referrer,
    referredCustomer,
    order,
  })

  if (review.signals.length) {
    await CustomerModel.updateOne(
      {
        _id: referredCustomer._id,
        referralRewardedAt: null,
        referralRewardVoucherId: null,
      },
      {
        $set: {
          referralRewardStatus: "under_review",
          referralRewardSkippedAt: new Date(),
          referralRewardSkippedReason: "Referral reward is under admin review.",
          referralRewardOrderId: order._id,
        },
      }
    )
    await createReferralFraudAlert({
      severity: "warning",
      title: "Referral reward needs review",
      description:
        "A referral reward matched repeated device, IP, or delivery address signals and was held for admin review.",
      referrerId: referrer.id,
      referredCustomerId: referredCustomer.id,
      orderId: String(order._id),
      reasonKeys: review.signals,
      metadata: {
        deviceId: review.deviceId,
        ipAddress: review.ipAddress,
        addressFingerprint: review.addressFingerprint,
      },
    })
    return { rewarded: false, reason: "referral_under_review" as const }
  }

  const now = new Date()
  const monthRange = getCurrentUtcMonthRange(now)
  const voucherId = new mongoose.Types.ObjectId()
  const expiresAt = new Date(
    now.getTime() + settings.voucherExpiryDays * 24 * 60 * 60 * 1000
  )
  const session = await mongoose.startSession()
  let voucherCode = ""
  let rewardCreated = false
  let rewardSkippedReason:
    | "monthly_reward_cap_reached"
    | "already_rewarded"
    | null = null

  try {
    await session.withTransaction(async () => {
      voucherCode = await createReferralRewardVoucherCode(session)
      const monthlyRewardCount = await CustomerModel.countDocuments({
        referredByCustomerId: referrer._id,
        referralRewardedAt: { $gte: monthRange.start, $lt: monthRange.end },
      }).session(session)

      if (monthlyRewardCount >= settings.monthlyRewardCapPerCustomer) {
        rewardSkippedReason = "monthly_reward_cap_reached"
        await CustomerModel.updateOne(
          {
            _id: referredCustomer._id,
            referralRewardedAt: null,
            referralRewardVoucherId: null,
          },
          {
            $set: {
              referralRewardStatus: "capped",
              referralRewardSkippedAt: now,
              referralRewardSkippedReason: `Monthly referral reward cap (${settings.monthlyRewardCapPerCustomer}) reached`,
              referralRewardOrderId: order._id,
            },
          },
          { session }
        )
        return
      }

      const lockResult = await CustomerModel.updateOne(
        {
          _id: referredCustomer._id,
          referredByCustomerId: referrer._id,
          referralRewardedAt: null,
          referralRewardVoucherId: null,
          referralRewardStatus: { $nin: ["under_review", "rejected", "capped", "disabled"] },
        },
        {
          $set: {
            referralRewardedAt: now,
            referralRewardOrderId: order._id,
            referralRewardVoucherId: voucherId,
            referralRewardStatus: "rewarded",
            referralRewardSkippedAt: null,
            referralRewardSkippedReason: "",
          },
        },
        { session }
      )

      if (lockResult.modifiedCount === 0) {
        return
      }

      await VoucherModel.create(
        [
          {
            _id: voucherId,
            restaurantId: null,
            scopeType: "all_restaurants",
            selectedRestaurantIds: [],
            audienceType: "selected_users",
            selectedCustomerIds: [referrer._id],
            createdByType: "system",
            createdById: "referral-system",
            fundedBy: "platform",
            ownerSharePercent: 0,
            platformSharePercent: 100,
            stackingRule: "exclusive",
            priority: 80,
            mode: "coupon",
            type: "flat",
            name: "Referral reward",
            code: voucherCode,
            discountValue: settings.rewardAmountTaka,
            maxDiscountAmount: settings.rewardAmountTaka,
            minimumOrderAmount: settings.minimumOrderAmountTaka,
            maxTotalUses: 1,
            maxUsesPerUser: 1,
            allowRepeatUsage: false,
            status: "Active",
            applicability: "all",
            startsAt: now,
            endsAt: expiresAt,
            display: {
              showOnHome: true,
              showInOfferStrip: true,
              placement: "offers_row",
              variant: "chip",
              title: `Tk ${settings.rewardAmountTaka} referral reward`,
              subtitle: `Use on orders over Tk ${settings.minimumOrderAmountTaka}`,
              ctaLabel: "Apply reward",
              ctaPath: "/(tabs)/browse",
              backgroundColor: "#FFF0F6",
              textColor: "#3F2432",
              accentColor: "#FF5C93",
            },
          },
        ],
        { session }
      )

      await VoucherAuditModel.create(
        [
          {
            voucherId,
            restaurantId: null,
            actorType: "system",
            actorId: "referral-system",
            action: "created",
            before: null,
            after: {
              referrerCustomerId: referrer.id,
              referredCustomerId: referredCustomer.id,
              rewardOrderId: String(order._id),
            },
            note: "Created referral reward after referred customer's delivered order",
          },
        ],
        { session }
      )

      rewardCreated = true
    })
  } finally {
    await session.endSession()
  }

  if (!rewardCreated) {
    return { rewarded: false, reason: rewardSkippedReason ?? "already_rewarded" }
  }

  enqueueBackgroundTask("customer.referral_reward.push", async () => {
    await sendPushToCustomer({
      customerId: referrer.id,
      payload: {
        title: "Referral reward unlocked",
        body: `You earned Tk ${settings.rewardAmountTaka}. Use code ${voucherCode} on your next order.`,
        data: {
          type: "promotion",
          path: "/offers",
          voucherCode,
        },
      },
    })
  })

  // Persist it as a personal offer so the referral reward voucher shows up in the
  // customer's "My offers" list (and offer details) with its real expiry date.
  enqueueBackgroundTask("customer.referral_reward.offer", async () => {
    await createCustomerNotification({
      customerId: referrer.id,
      payload: {
        title: `Tk ${settings.rewardAmountTaka} referral reward`,
        body: `Use code ${voucherCode} on orders over Tk ${settings.minimumOrderAmountTaka}.`,
        data: {
          type: "promotion",
          personalOffer: true,
          voucherId: String(voucherId),
          voucherCode,
          voucherLabel: `Tk ${settings.rewardAmountTaka} referral reward`,
          voucherExpiresAt: expiresAt.toISOString(),
          voucherMinOrder: settings.minimumOrderAmountTaka,
          path: "/offers",
        },
      },
    })
  })

  return {
    rewarded: true,
    voucherId: String(voucherId),
    voucherCode,
  }
}

export async function revokeReferralRewardForOrder(params: {
  orderId: string
  reason?: string
}) {
  const order = await OrderModel.findById(params.orderId).lean()
  if (!order?._id) {
    return { revoked: false, reason: "order_not_found" as const }
  }

  const referredCustomer = await CustomerModel.findOne({
    referralRewardOrderId: order._id,
    referralRewardStatus: "rewarded",
  })

  if (!referredCustomer?.referralRewardVoucherId) {
    return { revoked: false, reason: "reward_not_found" as const }
  }

  const now = new Date()
  const voucherId = referredCustomer.referralRewardVoucherId
  const activeRedemption = await VoucherRedemptionModel.findOne({
    voucherId,
    releasedAt: null,
  }).lean()

  await Promise.all([
    VoucherModel.updateOne(
      { _id: voucherId },
      {
        $set: {
          status: "Draft",
          archivedAt: now,
          archivedByAdminId: "referral-system",
          archiveReason:
            params.reason ??
            "Referral reward reversed because qualifying order was refunded",
        },
      }
    ),
    CustomerModel.updateOne(
      { _id: referredCustomer._id },
      {
        $set: {
          referralRewardedAt: null,
          referralRewardStatus: "rejected",
          referralRewardSkippedAt: now,
          referralRewardSkippedReason:
            "Referral reward reversed because the qualifying order was refunded.",
        },
      }
    ),
    VoucherAuditModel.create({
      voucherId,
      restaurantId: null,
      actorType: "system",
      actorId: "referral-system",
      action: "archived",
      before: null,
      after: {
        referredCustomerId: referredCustomer.id,
        rewardOrderId: String(order._id),
        reason: params.reason ?? "qualifying_order_refunded",
      },
      note: "Archived referral reward after qualifying order refund",
    }),
  ])

  if (activeRedemption) {
    await createReferralFraudAlert({
      severity: "critical",
      title: "Referral voucher was already used before reversal",
      description:
        "A referral reward was reversed after its voucher had already been redeemed. Finance/support should review the discount manually.",
      referredCustomerId: referredCustomer.id,
      orderId: String(order._id),
      reasonKeys: ["referral_reward_reversed_after_voucher_use"],
      metadata: {
        voucherId: String(voucherId),
        redemptionOrderId: String(activeRedemption.orderId ?? ""),
      },
    })
  }

  return {
    revoked: true,
    voucherId: String(voucherId),
    voucherAlreadyUsed: Boolean(activeRedemption),
  }
}
