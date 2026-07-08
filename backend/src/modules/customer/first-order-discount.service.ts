import mongoose from "mongoose"

import { OrderModel } from "../owner/operational.model"
import { getPlatformContent } from "../public/content.service"
import { CustomerModel, FirstOrderDiscountClaimModel } from "./customer.model"

export type FirstOrderDiscountSettings = {
  enabled: boolean
  discountAmountTaka: number
  minimumOrderAmountTaka: number
  paymentRestriction: "any" | "bkash_only"
  maxRedemptionsPerDevicePerDay: number
  startsAt: string
  endsAt: string
  bannerTitle: string
  bannerSubtitle: string
}

const DEFAULTS: FirstOrderDiscountSettings = {
  enabled: false,
  discountAmountTaka: 50,
  minimumOrderAmountTaka: 350,
  paymentRestriction: "any",
  maxRedemptionsPerDevicePerDay: 3,
  startsAt: "",
  endsAt: "",
  bannerTitle: "৳{{amount}} off your first order",
  bannerSubtitle: "On your first order over ৳{{minimum}}. Auto-applied at checkout.",
}

export async function getFirstOrderDiscountSettings(): Promise<FirstOrderDiscountSettings> {
  const content = await getPlatformContent()
  const s = (content.operations as Record<string, any>)?.firstOrderDiscount ?? {}
  return {
    enabled: s.enabled === true,
    discountAmountTaka: Number.isFinite(s.discountAmountTaka)
      ? Number(s.discountAmountTaka)
      : DEFAULTS.discountAmountTaka,
    minimumOrderAmountTaka: Number.isFinite(s.minimumOrderAmountTaka)
      ? Number(s.minimumOrderAmountTaka)
      : DEFAULTS.minimumOrderAmountTaka,
    paymentRestriction: s.paymentRestriction === "bkash_only" ? "bkash_only" : "any",
    maxRedemptionsPerDevicePerDay: Number.isFinite(s.maxRedemptionsPerDevicePerDay)
      ? Number(s.maxRedemptionsPerDevicePerDay)
      : DEFAULTS.maxRedemptionsPerDevicePerDay,
    startsAt: String(s.startsAt ?? ""),
    endsAt: String(s.endsAt ?? ""),
    bannerTitle: String(s.bannerTitle ?? DEFAULTS.bannerTitle),
    bannerSubtitle: String(s.bannerSubtitle ?? DEFAULTS.bannerSubtitle),
  }
}

function isWithinWindow(settings: FirstOrderDiscountSettings, now: Date) {
  if (settings.startsAt) {
    const start = new Date(settings.startsAt)
    if (!Number.isNaN(start.getTime()) && now < start) return false
  }
  if (settings.endsAt) {
    const end = new Date(settings.endsAt)
    if (!Number.isNaN(end.getTime()) && now > end) return false
  }
  return true
}

function normalizePhone(value: unknown) {
  return String(value ?? "").replace(/\D/g, "")
}

export function collectFirstOrderPhones(customer: Record<string, any>) {
  const phones = new Set<string>()
  const current = normalizePhone(customer.phone)
  if (current) phones.add(current)
  for (const entry of customer.previousPhones ?? []) {
    const normalized = normalizePhone(entry?.phone)
    if (normalized) phones.add(normalized)
  }
  return [...phones]
}

export function collectFirstOrderDeviceIds(
  customer: Record<string, any>,
  extra?: string,
) {
  const ids = new Set<string>()
  for (const value of [
    customer.lastKnownDeviceId,
    customer.referralSignupDeviceId,
    extra,
  ]) {
    const normalized = String(value ?? "").trim()
    if (normalized) ids.add(normalized)
  }
  return [...ids]
}

export type FirstOrderDiscountEvaluation = {
  eligible: boolean // grantable right now (threshold met + all fraud checks pass)
  candidate: boolean // a genuine first-order customer who WOULD get it on reaching the
  // threshold — drives the "add X more" progress hint below the minimum
  amount: number
  minimumOrderAmount: number
  remaining: number // subtotal still needed to reach the threshold (0 once met)
  reason: string
  settings: FirstOrderDiscountSettings
  fingerprints: {
    deviceIds: string[]
    phones: string[]
    walletNumber: string
  }
}

// Full eligibility + amount for the instant first-order (welcome) discount. Runs the
// fraud gate (device/phone/wallet fingerprint + per-device/day velocity) so the quote
// preview reflects exactly what placement will grant to a legitimate first-order
// customer. Placement re-locks atomically on the customer doc to win any race.
export async function evaluateFirstOrderDiscount(params: {
  customerId?: string
  subtotalTaka: number
  paymentMethod?: string
  deviceId?: string
  walletNumber?: string
  customer?: Record<string, any> | null
}): Promise<FirstOrderDiscountEvaluation> {
  const settings = await getFirstOrderDiscountSettings()
  const minimumOrderAmount = settings.minimumOrderAmountTaka
  const noFingerprints = {
    deviceIds: [] as string[],
    phones: [] as string[],
    walletNumber: "",
  }
  const fail = (reason: string): FirstOrderDiscountEvaluation => ({
    eligible: false,
    candidate: false,
    amount: 0,
    minimumOrderAmount,
    remaining: 0,
    reason,
    settings,
    fingerprints: noFingerprints,
  })

  if (!settings.enabled) return fail("disabled")
  if (!params.customerId) return fail("no_customer")
  if (!isWithinWindow(settings, new Date())) return fail("outside_window")
  if (
    settings.paymentRestriction === "bkash_only" &&
    params.paymentMethod &&
    params.paymentMethod !== "Bkash"
  ) {
    return fail("payment_restricted")
  }

  const customer =
    params.customer ??
    (await CustomerModel.findById(params.customerId)
      .select(
        "phone previousPhones lastKnownDeviceId referralSignupDeviceId firstOrderDiscountRedeemedAt status",
      )
      .lean<Record<string, any>>())

  if (!customer || customer.status !== "active") return fail("customer_unavailable")
  if (customer.firstOrderDiscountRedeemedAt) return fail("already_redeemed")

  const deliveredCount = await OrderModel.countDocuments({
    customerId: new mongoose.Types.ObjectId(params.customerId),
    status: "Delivered",
  })
  if (deliveredCount > 0) return fail("not_first_order")

  // Genuine first-order candidate. Below the threshold, return a candidate hint (drives
  // the "add X more to unlock" progress bar) and skip the heavier fraud gate — nothing
  // is granted yet, so there's nothing to protect.
  if (params.subtotalTaka < minimumOrderAmount) {
    return {
      eligible: false,
      candidate: true,
      amount: settings.discountAmountTaka,
      minimumOrderAmount,
      remaining: Math.max(0, minimumOrderAmount - params.subtotalTaka),
      reason: "below_minimum",
      settings,
      fingerprints: noFingerprints,
    }
  }

  const phones = collectFirstOrderPhones(customer)
  const deviceIds = collectFirstOrderDeviceIds(customer, params.deviceId)
  const walletNumber = String(params.walletNumber ?? "").trim()

  // Cross-account block: any OTHER account with an active claim sharing our device,
  // phone (incl. previous), or wallet means this is the same person on a fresh account.
  const fingerprintOr: Record<string, unknown>[] = []
  if (deviceIds.length) fingerprintOr.push({ deviceId: { $in: deviceIds } })
  if (phones.length) fingerprintOr.push({ phone: { $in: phones } })
  if (walletNumber) fingerprintOr.push({ walletNumber })

  if (fingerprintOr.length) {
    const conflict = await FirstOrderDiscountClaimModel.exists({
      status: { $in: ["reserved", "confirmed"] },
      customerId: { $ne: new mongoose.Types.ObjectId(params.customerId) },
      $or: fingerprintOr,
    })
    if (conflict) return fail("fingerprint_conflict")
  }

  // Per-device/day velocity — counts EVERY claim (including released), so rapid
  // place-cancel farming across fresh accounts on one device still trips the cap.
  const primaryDevice = deviceIds[0]
  if (primaryDevice && settings.maxRedemptionsPerDevicePerDay > 0) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recent = await FirstOrderDiscountClaimModel.countDocuments({
      deviceId: primaryDevice,
      createdAt: { $gte: since },
    })
    if (recent >= settings.maxRedemptionsPerDevicePerDay) return fail("velocity_capped")
  }

  const amount = Math.min(
    settings.discountAmountTaka,
    Math.max(0, Math.floor(params.subtotalTaka)),
  )
  if (amount <= 0) return fail("zero_amount")

  return {
    eligible: true,
    candidate: true,
    amount,
    minimumOrderAmount,
    remaining: 0,
    reason: "eligible",
    settings,
    fingerprints: { deviceIds, phones, walletNumber },
  }
}

// Give the first-order discount eligibility back to a customer whose qualifying order
// was cancelled/rejected before delivery, so an honest cancel doesn't burn their
// welcome offer. The claim row is marked "released" (still counted for per-device/day
// velocity so rapid place-cancel farming can't reset the cap). No-op if this order
// isn't the one that consumed the discount.
export async function releaseFirstOrderDiscountForOrder(params: {
  orderId: mongoose.Types.ObjectId | string
  customerId: mongoose.Types.ObjectId | string
  reason: string
  session?: mongoose.ClientSession
}) {
  const orderId =
    typeof params.orderId === "string"
      ? new mongoose.Types.ObjectId(params.orderId)
      : params.orderId
  const options = params.session ? { session: params.session } : {}

  await CustomerModel.updateOne(
    { _id: params.customerId, firstOrderDiscountOrderId: orderId },
    {
      $set: {
        firstOrderDiscountRedeemedAt: null,
        firstOrderDiscountOrderId: null,
        firstOrderDiscountAmount: 0,
      },
    },
    options,
  )

  await FirstOrderDiscountClaimModel.updateOne(
    { orderId, status: { $ne: "released" } },
    {
      $set: {
        status: "released",
        releasedAt: new Date(),
        releasedReason: params.reason,
      },
    },
    options,
  )
}

