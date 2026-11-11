import crypto from "node:crypto"
import mongoose from "mongoose"

import { logger } from "../../config/logger"
import { CustomerModel, VoucherAuditModel, VoucherModel, VoucherRedemptionModel } from "../customer/customer.model"
import { sendPushToCustomer } from "../customer/push.service"
import { OrderModel } from "../owner/operational.model"
import { RestaurantModel } from "../auth/auth.model"
import { WinBackAttemptModel, WinBackSettingsModel } from "./win-back.model"
import {
  buildWinBackMessage,
  checkWinBackEligibility,
  dhakaClock,
  fitToBudget,
  isControlCustomer,
  segmentForOrderCount,
  sortByPriority,
  type WinBackSegment,
} from "./win-back.rules"

const DAY = 24 * 60 * 60 * 1000

export type WinBackSettings = {
  enabled: boolean
  mode: "approval" | "auto"
  lapsedDays: number
  amounts: Record<WinBackSegment, number>
  minOrderAmount: number
  validityDays: number
  monthlyBudget: number
  maxAttemptsPer90Days: number
  controlPercent: number
  sendMinuteOfDay: number
}

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback
}

function toSettings(doc: Record<string, any> | null): WinBackSettings {
  return {
    enabled: doc?.enabled === true,
    mode: doc?.mode === "auto" ? "auto" : "approval",
    lapsedDays: clamp(doc?.lapsedDays, 14, 180, 30),
    amounts: {
      one_time: clamp(doc?.amounts?.one_time, 5, 300, 20),
      regular: clamp(doc?.amounts?.regular, 5, 300, 35),
      loyal: clamp(doc?.amounts?.loyal, 5, 300, 50),
    },
    minOrderAmount: clamp(doc?.minOrderAmount, 0, 2000, 250),
    validityDays: clamp(doc?.validityDays, 1, 30, 7),
    monthlyBudget: clamp(doc?.monthlyBudget, 0, 500000, 3000),
    maxAttemptsPer90Days: clamp(doc?.maxAttemptsPer90Days, 1, 4, 2),
    controlPercent: clamp(doc?.controlPercent, 0, 50, 10),
    sendMinuteOfDay: clamp(doc?.sendMinuteOfDay, 0, 1439, 12 * 60 + 30),
  }
}

export async function getWinBackSettings() {
  return toSettings(await WinBackSettingsModel.findOne({ key: "default" }).lean())
}

export async function updateWinBackSettings(patch: Partial<WinBackSettings>) {
  const current = await getWinBackSettings()
  const next = toSettings({ ...current, ...patch, amounts: { ...current.amounts, ...(patch.amounts ?? {}) } })
  await WinBackSettingsModel.updateOne({ key: "default" }, { $set: next }, { upsert: true })
  return next
}

function monthStart(now = Date.now()) {
  // Dhaka calendar month
  const { dateKey } = dhakaClock(now)
  return new Date(`${dateKey.slice(0, 7)}-01T00:00:00+06:00`)
}

async function monthSpent(now = Date.now()) {
  const [row] = await WinBackAttemptModel.aggregate<{ total: number }>([
    { $match: { status: "sent", createdAt: { $gte: monthStart(now) } } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ])
  return row?.total ?? 0
}

export type WinBackCandidate = {
  customerId: string
  name: string
  phoneTail: string
  segment: WinBackSegment
  deliveredOrders: number
  daysSinceOrder: number
  favouriteRestaurantId: string
  favouriteRestaurantName: string
  amount: number
  isControl: boolean
}

/** Today's list: lapsed customers who may get a win-back voucher right now. */
export async function listWinBackCandidates(now = Date.now()) {
  const settings = await getWinBackSettings()
  const lapsedBefore = new Date(now - settings.lapsedDays * DAY)

  const rows = await OrderModel.aggregate<{
    _id: string
    orders: number
    lastOrderAt: Date
    favouriteRestaurantId: unknown
  }>([
    { $match: { status: "Delivered", source: { $ne: "external" }, customerId: { $type: "string", $ne: "" } } },
    { $group: { _id: { customerId: "$customerId", restaurantId: "$restaurantId" }, n: { $sum: 1 }, last: { $max: "$createdAt" } } },
    { $sort: { n: -1, last: -1 } },
    {
      $group: {
        _id: "$_id.customerId",
        orders: { $sum: "$n" },
        lastOrderAt: { $max: "$last" },
        favouriteRestaurantId: { $first: "$_id.restaurantId" },
      },
    },
    { $match: { lastOrderAt: { $lte: lapsedBefore } } },
    { $limit: 2000 },
  ])

  const ids = rows.map((row) => row._id)
  const validIds = ids.filter((id) => mongoose.isValidObjectId(id))
  const [customers, attempts, restaurants] = await Promise.all([
    CustomerModel.find({ _id: { $in: validIds }, status: "active" }).select("fullName phone").lean(),
    WinBackAttemptModel.find({ customerId: { $in: ids }, status: { $in: ["sent", "control"] } })
      .select("customerId createdAt")
      .lean(),
    RestaurantModel.find({ _id: { $in: rows.map((row) => row.favouriteRestaurantId).filter(Boolean) } })
      .select("name")
      .lean(),
  ])
  const customerById = new Map(customers.map((customer) => [String(customer._id), customer]))
  const attemptsByCustomer = new Map<string, number[]>()
  for (const attempt of attempts) {
    const list = attemptsByCustomer.get(attempt.customerId) ?? []
    list.push(new Date(attempt.createdAt as Date).getTime())
    attemptsByCustomer.set(attempt.customerId, list)
  }
  const restaurantName = new Map(restaurants.map((r) => [String(r._id), String((r as any).name ?? "")]))

  const candidates: WinBackCandidate[] = []
  const skipped = { not_active_account: 0, still_active: 0, limit_reached: 0, recently_tried: 0 }
  for (const row of rows) {
    const customer = customerById.get(row._id)
    if (!customer) {
      skipped.not_active_account += 1
      continue
    }
    const check = checkWinBackEligibility({
      now,
      lastOrderAt: new Date(row.lastOrderAt).getTime(),
      lapsedDays: settings.lapsedDays,
      previousAttemptsAt: attemptsByCustomer.get(row._id) ?? [],
      maxAttemptsPer90Days: settings.maxAttemptsPer90Days,
    })
    if (!check.eligible) {
      skipped[check.reason] += 1
      continue
    }
    const segment = segmentForOrderCount(row.orders)
    const phone = String((customer as any).phone ?? "")
    candidates.push({
      customerId: row._id,
      name: String((customer as any).fullName ?? "").trim() || "Customer",
      phoneTail: phone ? `…${phone.slice(-3)}` : "",
      segment,
      deliveredOrders: row.orders,
      daysSinceOrder: check.daysSinceOrder,
      favouriteRestaurantId: String(row.favouriteRestaurantId ?? ""),
      favouriteRestaurantName: restaurantName.get(String(row.favouriteRestaurantId ?? "")) ?? "",
      amount: settings.amounts[segment],
      isControl: isControlCustomer(row._id, settings.controlPercent),
    })
  }

  const sorted = sortByPriority(candidates)
  const spentThisMonth = await monthSpent(now)
  const remainingBudget = Math.max(0, settings.monthlyBudget - spentThisMonth)
  const toSend = sorted.filter((candidate) => !candidate.isControl)
  const fit = fitToBudget(toSend, remainingBudget)
  return {
    settings,
    candidates: sorted,
    summary: {
      total: sorted.length,
      willReceive: fit.picked.length,
      controlGroup: sorted.filter((c) => c.isControl).length,
      overBudget: fit.skipped,
      batchCost: fit.spent,
      spentThisMonth,
      remainingBudget,
      bySegment: {
        one_time: sorted.filter((c) => c.segment === "one_time").length,
        regular: sorted.filter((c) => c.segment === "regular").length,
        loyal: sorted.filter((c) => c.segment === "loyal").length,
      },
      skipped,
    },
  }
}

async function createWinBackVoucher(candidate: WinBackCandidate, settings: WinBackSettings, now: number) {
  const voucherId = new mongoose.Types.ObjectId()
  const code = `WB${crypto.randomBytes(3).toString("hex").toUpperCase()}`
  const expiresAt = new Date(now + settings.validityDays * DAY)
  const label = `৳${candidate.amount} welcome-back offer`
  await VoucherModel.create({
    _id: voucherId,
    restaurantId: null,
    scopeType: "all_restaurants",
    selectedRestaurantIds: [],
    audienceType: "selected_users",
    selectedCustomerIds: [new mongoose.Types.ObjectId(candidate.customerId)],
    createdByType: "system",
    createdById: "win-back",
    fundedBy: "platform",
    ownerSharePercent: 0,
    platformSharePercent: 100,
    stackingRule: "exclusive",
    priority: 80,
    mode: "coupon",
    type: "flat",
    name: "Welcome back",
    code,
    discountValue: candidate.amount,
    maxDiscountAmount: candidate.amount,
    minimumOrderAmount: settings.minOrderAmount,
    maxTotalUses: 1,
    maxUsesPerUser: 1,
    allowRepeatUsage: false,
    status: "Active",
    applicability: "all",
    startsAt: new Date(now),
    endsAt: expiresAt,
    display: {
      showOnHome: true,
      showInOfferStrip: true,
      placement: "offers_row",
      variant: "chip",
      title: label,
      subtitle: `On orders over ৳${settings.minOrderAmount}`,
      ctaLabel: "Order now",
      ctaPath: "/(tabs)",
      backgroundColor: "#FFF4E0",
      textColor: "#3A2A10",
      accentColor: "#FFB84C",
    },
  })
  await VoucherAuditModel.create({
    voucherId,
    restaurantId: null,
    actorType: "system",
    actorId: "win-back",
    action: "created",
    before: null,
    after: { customerId: candidate.customerId, segment: candidate.segment, amount: candidate.amount },
    note: "Win-back voucher for a customer who stopped ordering",
  })
  return { voucherId, code, expiresAt, label }
}

/**
 * Send win-back vouchers to today's candidates (optionally only `customerIds`).
 * Control-group customers are recorded but get nothing. Stops at the monthly budget.
 */
export async function sendWinBack(params: { trigger: "admin" | "auto"; triggeredBy?: string; customerIds?: string[] }) {
  const now = Date.now()
  const { settings, candidates, summary } = await listWinBackCandidates(now)
  const allowed = params.customerIds?.length ? new Set(params.customerIds) : null
  const chosen = candidates.filter((c) => !allowed || allowed.has(c.customerId))
  const control = chosen.filter((c) => c.isControl)
  const fit = fitToBudget(chosen.filter((c) => !c.isControl), summary.remainingBudget)

  for (const candidate of control) {
    await WinBackAttemptModel.create({
      customerId: candidate.customerId,
      segment: candidate.segment,
      status: "control",
      amount: 0,
      daysSinceOrder: candidate.daysSinceOrder,
      favouriteRestaurantId: candidate.favouriteRestaurantId,
      trigger: params.trigger,
      triggeredBy: params.triggeredBy ?? "",
    })
  }

  let sent = 0
  let failed = 0
  for (const candidate of fit.picked) {
    try {
      const voucher = await createWinBackVoucher(candidate, settings, now)
      await WinBackAttemptModel.create({
        customerId: candidate.customerId,
        segment: candidate.segment,
        status: "sent",
        amount: candidate.amount,
        voucherId: voucher.voucherId,
        voucherCode: voucher.code,
        daysSinceOrder: candidate.daysSinceOrder,
        favouriteRestaurantId: candidate.favouriteRestaurantId,
        trigger: params.trigger,
        triggeredBy: params.triggeredBy ?? "",
      })
      const message = buildWinBackMessage({
        amount: candidate.amount,
        favouriteRestaurantName: candidate.favouriteRestaurantName,
        validityDays: settings.validityDays,
        minOrder: settings.minOrderAmount,
      })
      // One call = push + the personal offer in the customer's inbox / "My offers".
      await sendPushToCustomer({
        customerId: candidate.customerId,
        payload: {
          title: message.title,
          body: message.body,
          data: {
            type: "promotion",
            personalOffer: true,
            voucherId: String(voucher.voucherId),
            voucherCode: voucher.code,
            voucherLabel: voucher.label,
            voucherExpiresAt: voucher.expiresAt.toISOString(),
            voucherMinOrder: settings.minOrderAmount,
            path: "/offers",
            source: "win_back",
          },
        },
      }).catch((error) => logger.warn({ err: error, customerId: candidate.customerId }, "Win-back push failed"))
      sent += 1
    } catch (error) {
      failed += 1
      logger.warn({ err: error, customerId: candidate.customerId }, "Win-back send failed")
      await WinBackAttemptModel.create({
        customerId: candidate.customerId,
        segment: candidate.segment,
        status: "failed",
        amount: 0,
        daysSinceOrder: candidate.daysSinceOrder,
        trigger: params.trigger,
        triggeredBy: params.triggeredBy ?? "",
      }).catch(() => undefined)
    }
  }
  return { sent, control: control.length, failed, overBudget: fit.skipped, cost: fit.spent }
}

/** Results: did vouchers bring people back (vs the control group)? */
export async function getWinBackStats(days = 90) {
  const since = new Date(Date.now() - days * DAY)
  const attempts = await WinBackAttemptModel.find({ createdAt: { $gte: since }, status: { $in: ["sent", "control"] } })
    .select("customerId status amount voucherId segment createdAt")
    .lean()
  const sentRows = attempts.filter((a) => a.status === "sent")
  const controlRows = attempts.filter((a) => a.status === "control")

  // "Came back" = a delivered order within 14 days after the attempt.
  const cameBack = async (rows: typeof attempts) => {
    let count = 0
    let revenue = 0
    for (const row of rows) {
      const from = new Date(row.createdAt as Date)
      const to = new Date(from.getTime() + 14 * DAY)
      const orders = await OrderModel.find({
        customerId: row.customerId,
        status: "Delivered",
        createdAt: { $gt: from, $lte: to },
      })
        .select("pricing.total")
        .lean()
      if (orders.length) {
        count += 1
        revenue += orders.reduce((sum, order) => sum + Number((order as any).pricing?.total ?? 0), 0)
      }
    }
    return { count, revenue }
  }
  const [treated, control] = await Promise.all([cameBack(sentRows), cameBack(controlRows)])
  const voucherIds = sentRows.map((row) => row.voucherId).filter(Boolean)
  const redeemed = voucherIds.length
    ? await VoucherRedemptionModel.countDocuments({ voucherId: { $in: voucherIds }, releasedAt: null })
    : 0
  const redeemedCost = voucherIds.length
    ? (
        await VoucherRedemptionModel.find({ voucherId: { $in: voucherIds }, releasedAt: null })
          .select("voucherId")
          .lean()
      ).reduce((sum, row) => sum + (sentRows.find((s) => String(s.voucherId) === String(row.voucherId))?.amount ?? 0), 0)
    : 0
  const rate = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0)
  return {
    days,
    sent: sentRows.length,
    control: controlRows.length,
    cameBack: treated.count,
    cameBackRate: rate(treated.count, sentRows.length),
    controlCameBack: control.count,
    controlCameBackRate: rate(control.count, controlRows.length),
    revenueFromReturned: Math.round(treated.revenue),
    vouchersRedeemed: redeemed,
    voucherCost: redeemedCost,
    spentThisMonth: await monthSpent(),
  }
}

// ── Daily auto send (only in "auto" mode) ──
let intervalHandle: ReturnType<typeof setInterval> | null = null
let running = false

export async function runWinBackAutoCycle(now = Date.now()) {
  if (running) return
  running = true
  try {
    const doc = await WinBackSettingsModel.findOne({ key: "default" }).lean()
    const settings = toSettings(doc)
    if (!settings.enabled || settings.mode !== "auto") return
    const clock = dhakaClock(now)
    if (clock.minuteOfDay < settings.sendMinuteOfDay) return
    if (doc?.lastAutoRunDate === clock.dateKey) return
    // Claim today's run first so two cycles/instances can't double-send.
    const claimed = await WinBackSettingsModel.updateOne(
      { key: "default", lastAutoRunDate: { $ne: clock.dateKey } },
      { $set: { lastAutoRunDate: clock.dateKey } },
    )
    if (!claimed.modifiedCount) return
    const result = await sendWinBack({ trigger: "auto", triggeredBy: "system" })
    logger.info({ result }, "Win-back auto send finished")
  } catch (error) {
    logger.warn({ err: error }, "Win-back auto cycle failed")
  } finally {
    running = false
  }
}

export function startWinBackWorker() {
  if (intervalHandle) return
  intervalHandle = setInterval(() => void runWinBackAutoCycle(), 5 * 60_000)
}

export function stopWinBackWorker() {
  if (intervalHandle) clearInterval(intervalHandle)
  intervalHandle = null
}
