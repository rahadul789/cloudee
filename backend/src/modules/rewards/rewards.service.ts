import crypto from "crypto"
import { StatusCodes } from "http-status-codes"
import mongoose from "mongoose"

import { AppError } from "../../common/utils/app-error"
import { logger } from "../../config/logger"
import { CustomerModel, VoucherModel, VoucherRedemptionModel } from "../customer/customer.model"
import {
  getCustomerCustomOfferSettings,
  getCustomerCustomOfferSummary,
  handleCustomerCustomOfferDeliveredOrder,
  markCustomerCustomOfferFulfilled,
  sendCustomOfferClaimReminders,
} from "../customer/custom-offer.service"
import { createCustomerNotification } from "../customer/push.service"
import { OrderModel } from "../owner/operational.model"
import {
  CoinTxnModel,
  CoinWalletModel,
  MysteryBoxModel,
  PRIZE_TYPES,
  RewardSettingsModel,
  ScratchCardModel,
} from "./rewards.model"
import {
  dhakaMonthStart,
  estimateCostPerOrder,
  expectedBoxValue,
  pickBoxAmount,
  pickPrize,
} from "./rewards.rules"
import { countBoughtStamps, getRewardSettings, isRewardsTester } from "./rewards.settings"

const DAY = 24 * 3_600_000
const HOUR = 3_600_000
const random = () => crypto.randomInt(0, 1_000_000) / 1_000_000

// ─────────────────────────── Coins ───────────────────────────

async function ensureWallet(customerId: string) {
  return CoinWalletModel.findOneAndUpdate(
    { customerId },
    { $setOnInsert: { customerId, balance: 0, earnedTotal: 0, consumedTotal: 0 } },
    { upsert: true, new: true },
  ).lean()
}

async function creditCoins(customerId: string, amount: number, reason: "spin" | "admin", refId: string, isTest = false) {
  if (amount <= 0) return
  const settings = await getRewardSettings()
  await ensureWallet(customerId)
  await CoinTxnModel.create({
    customerId,
    amount,
    reason,
    refId,
    isTest,
    expiresAt: new Date(Date.now() + settings.coinExpiryDays * DAY),
  })
  await CoinWalletModel.updateOne({ customerId }, { $inc: { balance: amount, earnedTotal: amount } })
}

/** Atomic spend: succeeds only if the balance covers it (no overspend under double taps). */
async function spendCoins(customerId: string, amount: number, reason: "buy_stamp" | "skip_spin", refId: string) {
  await ensureWallet(customerId)
  const updated = await CoinWalletModel.findOneAndUpdate(
    { customerId, balance: { $gte: amount } },
    { $inc: { balance: -amount, consumedTotal: amount } },
    { new: true },
  ).lean()
  if (!updated) throw new AppError(StatusCodes.BAD_REQUEST, "NOT_ENOUGH_COINS", "Not enough coins")
  const settings = await getRewardSettings()
  await CoinTxnModel.create({ customerId, amount: -amount, reason, refId, isTest: isRewardsTester(settings, customerId) })
  return updated.balance
}

/**
 * Expire old coin lots (FIFO). A lot's unspent part = its share of earnedTotal that
 * consumedTotal hasn't reached yet. Optimistic on consumedTotal so concurrent spends are safe.
 */
async function expireCoinsFor(customerId: string) {
  const now = new Date()
  const due = await CoinTxnModel.find({ customerId, amount: { $gt: 0 }, expired: false, expiresAt: { $lte: now } })
    .sort({ createdAt: 1 })
    .lean()
  if (!due.length) return
  const wallet = await CoinWalletModel.findOne({ customerId }).lean()
  if (!wallet) return
  const credits = await CoinTxnModel.find({ customerId, amount: { $gt: 0 } }).sort({ createdAt: 1 }).select({ amount: 1 }).lean()
  let cumulative = 0
  let toExpire = 0
  const dueIds = new Set(due.map((lot) => String(lot._id)))
  for (const lot of credits) {
    const before = cumulative
    cumulative += lot.amount
    if (!dueIds.has(String(lot._id))) continue
    const unspent = Math.max(0, Math.min(lot.amount, cumulative - Math.max(wallet.consumedTotal, before)))
    toExpire += unspent
  }
  const amount = Math.min(toExpire, wallet.balance)
  const applied = await CoinWalletModel.updateOne(
    { customerId, consumedTotal: wallet.consumedTotal, balance: { $gte: amount } },
    { $inc: { balance: -amount, consumedTotal: amount } },
  )
  if (!applied.modifiedCount) return // a spend raced us; next run retries
  await CoinTxnModel.updateMany({ _id: { $in: due.map((lot) => lot._id) } }, { $set: { expired: true } })
  if (amount > 0) await CoinTxnModel.create({ customerId, amount: -amount, reason: "expire", refId: "" })
}

// ─────────────────────────── Spins ───────────────────────────

export async function issueScratchCardForDeliveredOrder(order: {
  id?: string
  _id?: unknown
  customerId?: unknown
  orderNumber?: string
  pricing?: { total?: number }
  source?: string
}) {
  const customerId = String(order.customerId ?? "")
  const orderId = String(order.id ?? order._id ?? "")
  if (!mongoose.Types.ObjectId.isValid(customerId) || !mongoose.Types.ObjectId.isValid(orderId)) return null
  if (order.source === "external") return null
  const settings = await getRewardSettings()
  if (!settings.scratchEnabled) return null
  if (Number(order.pricing?.total ?? 0) < settings.minOrderAmount) return null
  const tester = isRewardsTester(settings, customerId)
  const unlocksAt = new Date(
    Date.now() + (tester ? settings.testSpinUnlockMinutes * 60_000 : settings.spinUnlockHours * HOUR),
  )
  try {
    return await ScratchCardModel.create({
      customerId,
      orderId,
      orderNumber: order.orderNumber ?? "",
      isTest: tester,
      unlocksAt,
      expiresAt: new Date(unlocksAt.getTime() + settings.cardExpiryDays * DAY),
    })
  } catch (error: any) {
    if (error?.code === 11000) return null // already issued for this order
    throw error
  }
}

function serializeSpin(card: Record<string, any>) {
  return {
    id: String(card._id),
    orderId: String(card.orderId),
    orderNumber: card.orderNumber ?? "",
    status: card.status,
    unlocksAt: card.unlocksAt ? new Date(card.unlocksAt).toISOString() : null,
    expiresAt: new Date(card.expiresAt).toISOString(),
    spunAt: card.scratchedAt ? new Date(card.scratchedAt).toISOString() : null,
    prize:
      card.status === "scratched"
        ? {
            id: card.prize?.id ?? "",
            type: card.prize?.type ?? "fun",
            label: card.prize?.label ?? "",
            amount: card.prize?.amount ?? 0,
            voucherCode: card.voucherCode ?? "",
          }
        : null,
  }
}

async function spentThisMonth() {
  const [row] = await ScratchCardModel.aggregate([
    { $match: { status: "scratched", isTest: { $ne: true }, scratchedAt: { $gte: dhakaMonthStart(Date.now()) } } },
    { $group: { _id: null, total: { $sum: "$prize.cost" } } },
  ])
  return Number(row?.total ?? 0)
}

async function createPersonalVoucher(params: {
  customerId: string
  type: "flat" | "free_delivery"
  amount: number
  label: string
  minOrder: number
  validityDays: number
  codePrefix: string
  preferredCode?: string
  createdById: string
  notifyTitle: string
  notifyBody: (code: string) => string
  source: string
}) {
  const now = Date.now()
  const voucherId = new mongoose.Types.ObjectId()
  let code = params.preferredCode || `${params.codePrefix}${crypto.randomBytes(3).toString("hex").toUpperCase()}`
  if (await VoucherModel.exists({ restaurantId: null, code })) {
    code = `${code.slice(0, 18)}${crypto.randomBytes(2).toString("hex").toUpperCase()}`
  }
  const expiresAt = new Date(now + params.validityDays * DAY)
  await VoucherModel.create({
    _id: voucherId,
    restaurantId: null,
    scopeType: "all_restaurants",
    selectedRestaurantIds: [],
    audienceType: "selected_users",
    selectedCustomerIds: [new mongoose.Types.ObjectId(params.customerId)],
    createdByType: "system",
    createdById: params.createdById,
    fundedBy: "platform",
    ownerSharePercent: 0,
    platformSharePercent: 100,
    stackingRule: "exclusive",
    priority: 80,
    mode: "coupon",
    type: params.type,
    name: params.label,
    code,
    discountValue: params.type === "flat" ? params.amount : 0,
    maxDiscountAmount: params.type === "flat" ? params.amount : 0,
    minimumOrderAmount: params.minOrder,
    maxTotalUses: 1,
    maxUsesPerUser: 1,
    allowRepeatUsage: false,
    status: "Active",
    applicability: "all",
    startsAt: new Date(now),
    endsAt: expiresAt,
    display: {
      showOnHome: false,
      showInOfferStrip: false,
      title: params.label,
      subtitle: params.minOrder ? `On orders over ৳${params.minOrder}` : "On your next order",
      ctaLabel: "Order now",
      ctaPath: "/(tabs)",
    },
  })
  // Inbox / vouchers list only — rewards never push.
  await createCustomerNotification({
    customerId: params.customerId,
    payload: {
      title: params.notifyTitle,
      body: params.notifyBody(code),
      data: {
        type: "promotion",
        personalOffer: true,
        voucherId: String(voucherId),
        voucherCode: code,
        voucherLabel: params.label,
        voucherExpiresAt: expiresAt.toISOString(),
        voucherMinOrder: params.minOrder,
        path: "/offers",
        source: params.source,
      },
    },
  }).catch(() => undefined)
  return { voucherId, code }
}

/** Spin (optionally paying coins to skip the wait). The prize is decided here, never on the phone. */
export async function spinCustomerCard(customerId: string, cardId: string, useCoins = false) {
  if (!mongoose.Types.ObjectId.isValid(cardId)) {
    throw new AppError(StatusCodes.NOT_FOUND, "SPIN_NOT_FOUND", "Spin not found")
  }
  const existing = await ScratchCardModel.findOne({ _id: cardId, customerId }).lean()
  if (!existing) throw new AppError(StatusCodes.NOT_FOUND, "SPIN_NOT_FOUND", "Spin not found")
  if (existing.status === "scratched") return serializeSpin(existing) // replay-safe
  if (existing.status === "expired" || new Date(existing.expiresAt).getTime() <= Date.now()) {
    await ScratchCardModel.updateOne({ _id: existing._id, status: "unscratched" }, { $set: { status: "expired" } })
    throw new AppError(StatusCodes.GONE, "SPIN_EXPIRED", "This spin has expired")
  }
  const settings = await getRewardSettings()
  const locked = existing.unlocksAt && new Date(existing.unlocksAt).getTime() > Date.now()
  if (locked) {
    if (!useCoins) throw new AppError(StatusCodes.CONFLICT, "SPIN_LOCKED", "This spin isn't ready yet")
    // Pay first, then unlock (a failed unlock refunds below).
    await spendCoins(customerId, settings.skipCoinCost, "skip_spin", String(existing._id))
    const unlocked = await ScratchCardModel.updateOne(
      { _id: existing._id, status: "unscratched" },
      { $set: { unlocksAt: new Date(), skippedWithCoins: settings.skipCoinCost } },
    )
    if (!unlocked.modifiedCount) await creditCoins(customerId, settings.skipCoinCost, "admin", `refund:${existing._id}`)
  }

  // Test spins never touch (or get capped by) the real budget.
  const budgetLeft =
    existing.isTest || settings.monthlyBudget <= 0
      ? null
      : Math.max(0, settings.monthlyBudget - (await spentThisMonth()))
  const { prize, cost, budgetCapped } = pickPrize({
    prizes: (settings.prizes ?? []) as any,
    roll: random(),
    budgetLeft,
    freeDeliveryCost: settings.freeDeliveryCostEstimate,
  })

  // Claim the spin atomically so a double tap can never pay out twice.
  const claimed = await ScratchCardModel.findOneAndUpdate(
    { _id: existing._id, status: "unscratched" },
    {
      $set: {
        status: "scratched",
        scratchedAt: new Date(),
        prize: { id: prize.id, type: prize.type, label: prize.label, amount: prize.amount ?? 0, cost, budgetCapped },
      },
    },
    { new: true },
  ).lean()
  if (!claimed) {
    const again = await ScratchCardModel.findById(existing._id).lean()
    return serializeSpin(again ?? existing)
  }

  try {
    if (prize.type === "coins") {
      await creditCoins(customerId, prize.amount ?? 0, "spin", String(claimed._id), existing.isTest === true)
    } else if (prize.type === "free_delivery" || prize.type === "discount") {
      const voucher = await createPersonalVoucher({
        customerId,
        type: prize.type === "free_delivery" ? "free_delivery" : "flat",
        amount: prize.amount ?? 0,
        label: prize.label,
        minOrder: settings.prizeVoucherMinOrder,
        validityDays: settings.prizeVoucherValidityDays,
        codePrefix: "WIN",
        createdById: existing.isTest ? "spin-test" : "spin",
        notifyTitle: `You won: ${prize.label} 🎉`,
        notifyBody: (code) => `Use code ${code} on your next order.`,
        source: "spin",
      })
      await ScratchCardModel.updateOne({ _id: claimed._id }, { $set: { voucherId: voucher.voucherId, voucherCode: voucher.code } })
      claimed.voucherCode = voucher.code
    } else if (prize.type === "bonus_stamp") {
      // A bonus stamp can fill the card — run the same "unlocked" flow as a delivery.
      await handleCustomerCustomOfferDeliveredOrder({ customerId, orderId: String(existing.orderId) }).catch(() => undefined)
    }
  } catch (error) {
    logger.error({ err: error, customerId, cardId }, "Spin prize payout failed")
  }
  return serializeSpin(claimed)
}

/** Pay coins to open a locked spin NOW — it does not spin; the customer spins it themselves. */
export async function unlockSpinWithCoins(customerId: string, spinId: string) {
  if (!mongoose.Types.ObjectId.isValid(spinId)) throw new AppError(StatusCodes.NOT_FOUND, "SPIN_NOT_FOUND", "Spin not found")
  const spin = await ScratchCardModel.findOne({ _id: spinId, customerId }).lean()
  if (!spin) throw new AppError(StatusCodes.NOT_FOUND, "SPIN_NOT_FOUND", "Spin not found")
  if (spin.status !== "unscratched") throw new AppError(StatusCodes.CONFLICT, "SPIN_USED", "This spin was already used")
  if (!spin.unlocksAt || new Date(spin.unlocksAt).getTime() <= Date.now()) return serializeSpin(spin) // already open
  const settings = await getRewardSettings()
  await spendCoins(customerId, settings.skipCoinCost, "skip_spin", String(spin._id))
  const updated = await ScratchCardModel.findOneAndUpdate(
    { _id: spin._id, status: "unscratched" },
    { $set: { unlocksAt: new Date(), skippedWithCoins: settings.skipCoinCost } },
    { new: true },
  ).lean()
  if (!updated) {
    await creditCoins(customerId, settings.skipCoinCost, "admin", `refund:${spin._id}`, spin.isTest === true)
    throw new AppError(StatusCodes.CONFLICT, "SPIN_USED", "This spin was already used")
  }
  return serializeSpin(updated)
}

// ─────────────────────────── Stamps (buy with coins) ───────────────────────────

export async function buyStampWithCoins(customerId: string) {
  const [settings, customer] = await Promise.all([
    getRewardSettings(),
    CustomerModel.findById(customerId).select({ customOfferRequest: 1, status: 1 }).lean(),
  ])
  if (!customer) throw new AppError(StatusCodes.NOT_FOUND, "CUSTOMER_NOT_FOUND", "Customer not found")
  const summary = await getCustomerCustomOfferSummary(customerId)
  if (summary.completedOrderCount >= summary.targetOrderCount) {
    throw new AppError(StatusCodes.CONFLICT, "CARD_FULL", "Your stamp card is already full — open your box first")
  }
  // Limit per card: count coin stamps since the last box was handed out.
  const request = (customer as any).customOfferRequest ?? {}
  const since = request.fulfilledAt ? new Date(request.fulfilledAt) : null
  const boughtThisCard = await countBoughtStamps(customerId, since)
  if (boughtThisCard >= settings.maxCoinStampsPerCycle) {
    throw new AppError(
      StatusCodes.CONFLICT,
      "STAMP_LIMIT",
      `You can buy up to ${settings.maxCoinStampsPerCycle} stamps per card`,
    )
  }
  await spendCoins(customerId, settings.stampCoinPrice, "buy_stamp", "")
  await handleCustomerCustomOfferDeliveredOrder({ customerId, orderId: "" }).catch(() => undefined)
  return getCustomerRewards(customerId)
}

// ─────────────────────────── Mystery box ───────────────────────────

/** Turns a requested box into a ready one: pick the taka prize, create the voucher, use the stamps. */
async function fulfilMysteryBox(boxId: string, decidedBy: string) {
  const box = await MysteryBoxModel.findOneAndUpdate(
    { _id: boxId, status: "requested" },
    { $set: { decidedBy } },
    { new: true },
  ).lean()
  if (!box) return null
  const settings = await getRewardSettings()
  const amount = pickBoxAmount((settings.boxPrizes ?? []) as any, random())
  const customerId = String(box.customerId)
  const voucher = await createPersonalVoucher({
    customerId,
    type: "flat",
    amount,
    label: `৳${amount} mystery box reward`,
    minOrder: settings.claimMinOrder,
    validityDays: settings.claimValidityDays,
    codePrefix: "BOX",
    preferredCode: box.requestedCode || undefined,
    createdById: box.isTest ? "mystery-box-test" : "mystery-box",
    notifyTitle: "Your mystery box is ready 🎁",
    notifyBody: () => "Open it in Rewards to see what you got!",
    source: "mystery_box",
  })
  await MysteryBoxModel.updateOne(
    { _id: box._id },
    { $set: { prizeAmount: amount, voucherId: voucher.voucherId, voucherCode: voucher.code } },
  )
  // Uses one card of stamps (extras carry over) and marks any requested box ready.
  await markCustomerCustomOfferFulfilled({
    customerId,
    voucherId: String(voucher.voucherId),
    voucherCode: voucher.code,
    voucherLabel: `৳${amount} mystery box reward`,
    adminId: decidedBy,
  })
  return MysteryBoxModel.findById(box._id).lean()
}

/** Called right after a claim: in auto mode the box is ready at once. */
export async function processMysteryBoxClaim(customerId: string) {
  const settings = await getRewardSettings()
  if (settings.claimMode !== "auto") return null
  const box = await MysteryBoxModel.findOne({ customerId, status: "requested" }).sort({ createdAt: -1 }).lean()
  return box ? fulfilMysteryBox(String(box._id), "auto") : null
}

/** The customer taps the box → reveal (the prize was already decided when it became ready). */
export async function openCustomerMysteryBox(customerId: string, boxId: string) {
  if (!mongoose.Types.ObjectId.isValid(boxId)) throw new AppError(StatusCodes.NOT_FOUND, "BOX_NOT_FOUND", "Box not found")
  const box = await MysteryBoxModel.findOneAndUpdate(
    { _id: boxId, customerId, status: { $in: ["ready", "opened"] } },
    [{ $set: { status: "opened", openedAt: { $ifNull: ["$openedAt", "$$NOW"] } } }],
    { new: true },
  ).lean()
  if (!box) throw new AppError(StatusCodes.CONFLICT, "BOX_NOT_READY", "This box isn't ready yet")
  return serializeBox(box)
}

function serializeBox(box: Record<string, any>) {
  return {
    id: String(box._id),
    status: box.status,
    prizeAmount: box.status === "opened" ? box.prizeAmount : null,
    voucherCode: box.status === "opened" ? box.voucherCode : "",
    createdAt: new Date(box.createdAt).toISOString(),
    readyAt: box.readyAt ? new Date(box.readyAt).toISOString() : null,
  }
}

// ─────────────────────────── Customer: everything in one call ───────────────────────────

export async function getCustomerRewards(customerId: string) {
  await expireCoinsFor(customerId).catch(() => undefined)
  const [summary, settings, cards, wallet, boxes, customer] = await Promise.all([
    getCustomerCustomOfferSummary(customerId),
    getRewardSettings(),
    ScratchCardModel.find({
      customerId,
      $or: [
        { status: "unscratched", expiresAt: { $gt: new Date() } },
        { status: "scratched", scratchedAt: { $gt: new Date(Date.now() - 7 * DAY) } },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean(),
    ensureWallet(customerId),
    MysteryBoxModel.find({ customerId, status: { $in: ["requested", "ready", "opened"] } })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    CustomerModel.findById(customerId).select({ customOfferRequest: 1 }).lean(),
  ])
  const request = (customer as any)?.customOfferRequest ?? {}
  const since = request.fulfilledAt ? new Date(request.fulfilledAt) : null
  const boughtThisCard = await countBoughtStamps(customerId, since)
  const segments = ((settings.prizes ?? []) as any[]).filter((segment) => segment.weight > 0)
  const totalWeight = segments.reduce((sum, segment) => sum + segment.weight, 0) || 1
  return {
    testMode: isRewardsTester(settings, customerId),
    coins: {
      balance: wallet?.balance ?? 0,
      stampPrice: settings.stampCoinPrice,
      skipCost: settings.skipCoinCost,
      stampsBoughtThisCard: boughtThisCard,
      maxStampsPerCard: settings.maxCoinStampsPerCycle,
      expiryDays: settings.coinExpiryDays,
    },
    stamps: {
      enabled: summary.enabled !== false,
      status: summary.status,
      completed: Math.min(summary.completedOrderCount, summary.targetOrderCount),
      extra: Math.max(0, summary.completedOrderCount - summary.targetOrderCount),
      target: summary.targetOrderCount,
      remaining: summary.remainingOrderCount,
      claimMode: settings.claimMode,
      requestedCodeMaxLength: summary.requestedCodeMaxLength,
      boxRange: {
        min: Math.min(...((settings.boxPrizes ?? []) as any[]).filter((p) => p.weight > 0).map((p) => p.amount), 10),
        max: Math.max(...((settings.boxPrizes ?? []) as any[]).filter((p) => p.weight > 0).map((p) => p.amount), 10),
      },
    },
    boxes: boxes.map(serializeBox),
    spins: {
      enabled: settings.scratchEnabled,
      minOrderAmount: settings.minOrderAmount,
      unlockHours: settings.spinUnlockHours,
      localNotify: settings.spinReadyLocalNotify,
      wheel: segments.map((segment) => ({
        id: segment.id,
        type: segment.type,
        label: segment.label,
        amount: segment.amount ?? 0,
        chance: Math.round((segment.weight / totalWeight) * 1000) / 10, // % with 1 decimal
      })),
      items: cards.map(serializeSpin),
      readyCount: cards.filter(
        (card) => card.status === "unscratched" && (!card.unlocksAt || new Date(card.unlocksAt).getTime() <= Date.now()),
      ).length,
      lockedCount: cards.filter(
        (card) => card.status === "unscratched" && card.unlocksAt && new Date(card.unlocksAt).getTime() > Date.now(),
      ).length,
    },
  }
}

// ─────────────────────────── Admin ───────────────────────────

export async function getAdminRewardSettings() {
  const settings = await getRewardSettings()
  const offer = await getCustomerCustomOfferSettings()
  const boxValue = expectedBoxValue((settings.boxPrizes ?? []) as any)
  const estimate = estimateCostPerOrder({
    segments: (settings.prizes ?? []) as any,
    freeDeliveryCost: settings.freeDeliveryCostEstimate,
    target: offer.thresholdDeliveredOrders,
    stampCoinPrice: settings.stampCoinPrice,
    maxCoinStampsPerCycle: settings.maxCoinStampsPerCycle,
    boxValue,
  })
  return {
    ...settings,
    stampTarget: offer.thresholdDeliveredOrders,
    estimate: {
      boxValue: Math.round(boxValue * 100) / 100,
      coinsPerSpin: Math.round(estimate.coinsPerSpin * 10) / 10,
      ordersPerBox: Math.round(estimate.ordersPerBox * 10) / 10,
      costPerOrder: Math.round(estimate.perOrder * 100) / 100,
    },
  }
}

export type RewardSettingsInput = Partial<{
  scratchEnabled: boolean
  minOrderAmount: number
  spinUnlockHours: number
  skipCoinCost: number
  cardExpiryDays: number
  prizeVoucherValidityDays: number
  prizeVoucherMinOrder: number
  freeDeliveryCostEstimate: number
  monthlyBudget: number
  prizes: Array<{ id?: string; type: string; label: string; weight: number; amount?: number }>
  stampCoinPrice: number
  maxCoinStampsPerCycle: number
  coinExpiryDays: number
  boxPrizes: Array<{ amount: number; weight: number }>
  claimMode: "auto" | "approval"
  claimMinOrder: number
  claimValidityDays: number
  claimReminderEnabled: boolean
  claimReminderAfterDays: number
  claimReminderTitle: string
  claimReminderBody: string
  spinReadyLocalNotify: boolean
  testModeEnabled: boolean
  testSpinUnlockMinutes: number
}>

export async function updateAdminRewardSettings(input: RewardSettingsInput) {
  const update: Record<string, unknown> = { ...input }
  if (input.prizes) {
    const prizes = input.prizes
      .filter((prize) => (PRIZE_TYPES as readonly string[]).includes(prize.type) && prize.label.trim())
      .slice(0, 10)
      .map((prize, index) => ({
        id: prize.id?.trim() || `p${index + 1}${crypto.randomBytes(2).toString("hex")}`,
        type: prize.type,
        label: prize.label.trim().slice(0, 40),
        weight: Math.max(0, Number(prize.weight) || 0),
        amount: prize.type === "coins" || prize.type === "discount" ? Math.max(1, Number(prize.amount) || 0) : 0,
      }))
    if (!prizes.some((prize) => prize.weight > 0)) {
      throw new AppError(StatusCodes.BAD_REQUEST, "PRIZES_REQUIRED", "At least one wheel slice needs a chance above 0")
    }
    update.prizes = prizes
  }
  if (input.boxPrizes) {
    const boxPrizes = input.boxPrizes
      .map((prize) => ({ amount: Math.max(1, Number(prize.amount) || 0), weight: Math.max(0, Number(prize.weight) || 0) }))
      .slice(0, 8)
    if (!boxPrizes.some((prize) => prize.weight > 0)) {
      throw new AppError(StatusCodes.BAD_REQUEST, "BOX_PRIZES_REQUIRED", "The mystery box needs at least one prize")
    }
    update.boxPrizes = boxPrizes
  }
  await RewardSettingsModel.updateOne({ key: "default" }, { $set: update }, { upsert: true })
  return getAdminRewardSettings()
}

export async function listAdminMysteryBoxes(status: string) {
  // Requests made before mystery boxes existed have no box yet — create them so none are lost.
  const legacy = await CustomerModel.find({ "customOfferRequest.status": "requested" }).select({ _id: 1, customOfferRequest: 1 }).limit(200).lean()
  for (const customer of legacy) {
    const hasBox = await MysteryBoxModel.exists({ customerId: customer._id, status: { $in: ["requested", "ready"] } })
    if (!hasBox) {
      await MysteryBoxModel.create({
        customerId: customer._id,
        status: "requested",
        requestedCode: String((customer as any).customOfferRequest?.requestedCode ?? ""),
      })
    }
  }
  const filter = status === "all" ? {} : { status }
  const rows = await MysteryBoxModel.find(filter).sort({ createdAt: -1 }).limit(100).lean()
  const customers = await CustomerModel.find({ _id: { $in: rows.map((row) => row.customerId) } })
    .select({ fullName: 1, phone: 1 })
    .lean()
  const byId = new Map(customers.map((customer: any) => [String(customer._id), customer]))
  const voucherIds = rows.map((row) => row.voucherId).filter(Boolean)
  const used = voucherIds.length
    ? await VoucherRedemptionModel.find({ voucherId: { $in: voucherIds }, releasedAt: null }).select({ voucherId: 1 }).lean()
    : []
  const usedIds = new Set(used.map((row) => String(row.voucherId)))
  return rows.map((row) => {
    const customer = byId.get(String(row.customerId)) as any
    return {
      id: String(row._id),
      customerId: String(row.customerId),
      customerName: customer?.fullName ?? "",
      customerPhone: customer?.phone ?? "",
      status: row.status,
      requestedCode: row.requestedCode ?? "",
      prizeAmount: row.prizeAmount ?? 0,
      voucherCode: row.voucherCode ?? "",
      voucherUsed: row.voucherId ? usedIds.has(String(row.voucherId)) : false,
      decidedBy: row.decidedBy ?? "",
      rejectReason: row.rejectReason ?? "",
      isTest: row.isTest === true,
      createdAt: new Date(row.createdAt as Date).toISOString(),
    }
  })
}

export async function decideAdminMysteryBox(boxId: string, action: "approve" | "reject", adminId: string, reason?: string) {
  if (!mongoose.Types.ObjectId.isValid(boxId)) throw new AppError(StatusCodes.NOT_FOUND, "BOX_NOT_FOUND", "Box not found")
  if (action === "approve") {
    const box = await fulfilMysteryBox(boxId, adminId || "admin")
    if (!box) throw new AppError(StatusCodes.CONFLICT, "BOX_ALREADY_DECIDED", "This box was already handled")
    return { ok: true }
  }
  const box = await MysteryBoxModel.findOneAndUpdate(
    { _id: boxId, status: "requested" },
    { $set: { status: "rejected", rejectReason: (reason ?? "").slice(0, 200), decidedBy: adminId } },
    { new: true },
  ).lean()
  if (!box) throw new AppError(StatusCodes.CONFLICT, "BOX_ALREADY_DECIDED", "This box was already handled")
  // Stamps are NOT used on a rejection; the customer's request simply goes back to "none".
  await CustomerModel.updateOne(
    { _id: box.customerId, "customOfferRequest.status": "requested" },
    { $set: { "customOfferRequest.status": "none" } },
  )
  return { ok: true }
}

export async function getAdminRewardsOverview(params: { days: number; prizeType?: string; page: number }) {
  const since = new Date(Date.now() - params.days * DAY)
  const monthStart = dhakaMonthStart(Date.now())
  const [issued, spun, expired, monthSpend, byPrize, settings, coinsIssued, coinsSpent, boxesOpened, deliveredOrders] =
    await Promise.all([
      ScratchCardModel.countDocuments({ isTest: { $ne: true }, createdAt: { $gte: since } }),
      ScratchCardModel.countDocuments({ isTest: { $ne: true }, status: "scratched", scratchedAt: { $gte: since } }),
      ScratchCardModel.countDocuments({ isTest: { $ne: true }, status: "expired", updatedAt: { $gte: since } }),
      ScratchCardModel.aggregate([
        { $match: { isTest: { $ne: true }, status: "scratched", scratchedAt: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: "$prize.cost" } } },
      ]),
      ScratchCardModel.aggregate([
        { $match: { isTest: { $ne: true }, status: "scratched", scratchedAt: { $gte: since } } },
        { $group: { _id: "$prize.type", count: { $sum: 1 }, cost: { $sum: "$prize.cost" } } },
      ]),
      getRewardSettings(),
      CoinTxnModel.aggregate([
        { $match: { isTest: { $ne: true }, amount: { $gt: 0 }, reason: "spin", createdAt: { $gte: since } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      CoinTxnModel.aggregate([
        { $match: { isTest: { $ne: true }, reason: { $in: ["buy_stamp", "skip_spin"] }, createdAt: { $gte: since } } },
        { $group: { _id: "$reason", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      MysteryBoxModel.aggregate([
        { $match: { isTest: { $ne: true }, status: { $in: ["ready", "opened"] }, updatedAt: { $gte: since } } },
        { $group: { _id: null, count: { $sum: 1 }, value: { $sum: "$prizeAmount" } } },
      ]),
      OrderModel.countDocuments({ status: "Delivered", updatedAt: { $gte: since } }),
    ])

  // ACTUAL cost: discounts really used on reward vouchers (spin + box) ÷ delivered orders.
  const rewardVoucherIds = [
    ...(await ScratchCardModel.find({ voucherId: { $ne: null }, scratchedAt: { $gte: new Date(since.getTime() - 60 * DAY) } })
      .select({ voucherId: 1 })
      .lean()).map((row) => row.voucherId),
    ...(await MysteryBoxModel.find({ voucherId: { $ne: null }, updatedAt: { $gte: new Date(since.getTime() - 60 * DAY) } })
      .select({ voucherId: 1 })
      .lean()).map((row) => row.voucherId),
  ]
  const redemptions = rewardVoucherIds.length
    ? await VoucherRedemptionModel.find({
        voucherId: { $in: rewardVoucherIds },
        releasedAt: null,
        createdAt: { $gte: since },
      }).lean()
    : []
  const usedValue = redemptions.reduce((sum, row: any) => {
    const breakdown = row.discountBreakdown ?? {}
    const value = Number(
      row.discountAmount ?? breakdown.total ?? breakdown.discountAmount ?? breakdown.deliveryDiscount ?? 0,
    )
    return sum + (Number.isFinite(value) ? value : 0)
  }, 0)

  const filter: Record<string, unknown> = { status: "scratched", isTest: { $ne: true }, scratchedAt: { $gte: since } }
  filter["prize.type"] = params.prizeType && params.prizeType !== "all" ? params.prizeType : { $nin: ["fun", "coins"] }
  const pageSize = 50
  const [rows, total] = await Promise.all([
    ScratchCardModel.find(filter).sort({ scratchedAt: -1 }).skip((params.page - 1) * pageSize).limit(pageSize).lean(),
    ScratchCardModel.countDocuments(filter),
  ])
  const customers = await CustomerModel.find({ _id: { $in: rows.map((row) => row.customerId) } })
    .select({ fullName: 1, phone: 1 })
    .lean()
  const customerById = new Map(customers.map((customer: any) => [String(customer._id), customer]))
  const voucherIds = rows.map((row) => row.voucherId).filter(Boolean)
  const used = voucherIds.length
    ? await VoucherRedemptionModel.find({ voucherId: { $in: voucherIds }, releasedAt: null }).select({ voucherId: 1 }).lean()
    : []
  const usedIds = new Set(used.map((row) => String(row.voucherId)))
  const spentByReason = new Map(coinsSpent.map((row: any) => [row._id, row]))

  return {
    stats: {
      issued,
      scratched: spun,
      expired,
      scratchRate: issued ? Math.round((spun / issued) * 100) : 0,
      spentThisMonth: Number(monthSpend[0]?.total ?? 0),
      monthlyBudget: settings.monthlyBudget,
      byPrize: byPrize.map((row) => ({ type: row._id, count: row.count, cost: row.cost })),
      coinsIssued: Number(coinsIssued[0]?.total ?? 0),
      stampsBought: Number((spentByReason.get("buy_stamp") as any)?.count ?? 0),
      spinsSkipped: Number((spentByReason.get("skip_spin") as any)?.count ?? 0),
      boxesGiven: Number(boxesOpened[0]?.count ?? 0),
      boxValueGiven: Number(boxesOpened[0]?.value ?? 0),
      deliveredOrders,
      actualUsedValue: Math.round(usedValue),
      actualCostPerOrder: deliveredOrders ? Math.round((usedValue / deliveredOrders) * 100) / 100 : 0,
    },
    winners: {
      total,
      page: params.page,
      pageSize,
      items: rows.map((row) => {
        const customer = customerById.get(String(row.customerId)) as any
        return {
          id: String(row._id),
          customerId: String(row.customerId),
          customerName: customer?.fullName ?? "",
          customerPhone: customer?.phone ?? "",
          orderNumber: row.orderNumber,
          prizeType: row.prize?.type ?? "",
          prizeLabel: row.prize?.label ?? "",
          cost: row.prize?.cost ?? 0,
          budgetCapped: row.prize?.budgetCapped === true,
          voucherCode: row.voucherCode ?? "",
          voucherUsed: row.voucherId ? usedIds.has(String(row.voucherId)) : false,
          scratchedAt: row.scratchedAt ? new Date(row.scratchedAt).toISOString() : null,
        }
      }),
    },
  }
}

// ─────────────────────────── Test mode tools (testers only) ───────────────────────────

function normalizePhone(value: string) {
  const digits = value.replace(/[^\d]/g, "")
  if (digits.startsWith("880")) return `0${digits.slice(3)}`
  return digits
}

/** Admin: set testers by phone number. Returns who was found. */
export async function setAdminRewardTesters(phones: string[]) {
  const wanted = [...new Set(phones.map(normalizePhone).filter((phone) => /^01\d{9}$/.test(phone)))].slice(0, 20)
  const customers = wanted.length
    ? await CustomerModel.find({ phone: { $in: wanted } }).select({ _id: 1, phone: 1 }).lean()
    : []
  await RewardSettingsModel.updateOne(
    { key: "default" },
    { $set: { testerCustomerIds: customers.map((customer) => String(customer._id)) } },
    { upsert: true },
  )
  const found = new Set(customers.map((customer: any) => customer.phone))
  return { notFound: wanted.filter((phone) => !found.has(phone)), testers: await listAdminRewardTesters() }
}

export async function listAdminRewardTesters() {
  const settings = await getRewardSettings()
  const ids = (settings.testerCustomerIds ?? []) as string[]
  if (!ids.length) return []
  const customers = await CustomerModel.find({ _id: { $in: ids } }).select({ fullName: 1, phone: 1 }).lean()
  return Promise.all(
    customers.map(async (customer: any) => {
      const customerId = String(customer._id)
      const rewards = await getCustomerRewards(customerId).catch(() => null)
      return {
        customerId,
        name: customer.fullName ?? "",
        phone: customer.phone ?? "",
        coins: rewards?.coins.balance ?? 0,
        stamps: rewards ? `${rewards.stamps.completed}/${rewards.stamps.target}` : "—",
        spinsWaiting: rewards ? rewards.spins.readyCount + rewards.spins.lockedCount : 0,
        boxStatus: rewards?.boxes[0]?.status ?? "",
      }
    }),
  )
}

/** Admin: give a tester something to test with (never touches real customers). */
export async function grantAdminRewardTest(
  customerId: string,
  action: "spin" | "coins" | "stamp" | "fill_card" | "reset",
) {
  const settings = await getRewardSettings()
  if (!isRewardsTester(settings, customerId)) {
    throw new AppError(StatusCodes.FORBIDDEN, "NOT_A_TESTER", "Turn on test mode and add this customer as a tester first")
  }
  const now = Date.now()
  const testStamp = () =>
    ScratchCardModel.create({
      customerId,
      orderId: new mongoose.Types.ObjectId(),
      orderNumber: "TEST",
      status: "scratched",
      isTest: true,
      unlocksAt: new Date(now),
      expiresAt: new Date(now + DAY),
      scratchedAt: new Date(),
      prize: { id: "test-stamp", type: "bonus_stamp", label: "+1 stamp (test)", amount: 0, cost: 0 },
    })

  if (action === "spin") {
    await ScratchCardModel.create({
      customerId,
      orderId: new mongoose.Types.ObjectId(),
      orderNumber: "TEST",
      isTest: true,
      unlocksAt: new Date(now + settings.testSpinUnlockMinutes * 60_000),
      expiresAt: new Date(now + settings.testSpinUnlockMinutes * 60_000 + settings.cardExpiryDays * DAY),
    })
  } else if (action === "coins") {
    await creditCoins(customerId, 100, "admin", "test", true)
  } else if (action === "stamp") {
    await testStamp()
    await handleCustomerCustomOfferDeliveredOrder({ customerId, orderId: "" }).catch(() => undefined)
  } else if (action === "fill_card") {
    const summary = await getCustomerCustomOfferSummary(customerId)
    const missing = Math.max(0, summary.targetOrderCount - summary.completedOrderCount)
    for (let i = 0; i < missing; i++) await testStamp()
    await handleCustomerCustomOfferDeliveredOrder({ customerId, orderId: "" }).catch(() => undefined)
  } else if (action === "reset") {
    const testBoxes = await MysteryBoxModel.find({ customerId, isTest: true, status: { $in: ["ready", "opened"] } }).lean()
    await Promise.all([
      ScratchCardModel.deleteMany({ customerId, isTest: true }),
      MysteryBoxModel.deleteMany({ customerId, isTest: true }),
      CoinTxnModel.deleteMany({ customerId, isTest: true }),
      // Test vouchers stop working.
      VoucherModel.updateMany(
        { selectedCustomerIds: new mongoose.Types.ObjectId(customerId), createdById: { $in: ["spin-test", "mystery-box-test"] } },
        { $set: { status: "Draft", archivedAt: new Date() } },
      ),
    ])
    // Rebuild the wallet from the remaining (real) ledger.
    const [row] = await CoinTxnModel.aggregate([
      { $match: { customerId: new mongoose.Types.ObjectId(customerId) } },
      {
        $group: {
          _id: null,
          balance: { $sum: "$amount" },
          earned: { $sum: { $cond: [{ $gt: ["$amount", 0] }, "$amount", 0] } },
          consumed: { $sum: { $cond: [{ $lt: ["$amount", 0] }, { $multiply: ["$amount", -1] }, 0] } },
        },
      },
    ])
    await CoinWalletModel.updateOne(
      { customerId },
      { $set: { balance: Math.max(0, row?.balance ?? 0), earnedTotal: row?.earned ?? 0, consumedTotal: row?.consumed ?? 0 } },
      { upsert: true },
    )
    // Give back the stamps the test boxes used and clear any test claim.
    const offer = await getCustomerCustomOfferSettings()
    const customer = await CustomerModel.findById(customerId).select({ customOfferRequest: 1 }).lean()
    const consumed = Number((customer as any)?.customOfferRequest?.stampsConsumed ?? 0)
    await CustomerModel.updateOne(
      { _id: customerId },
      {
        $set: {
          "customOfferRequest.stampsConsumed": Math.max(0, consumed - testBoxes.length * offer.thresholdDeliveredOrders),
          "customOfferRequest.status": "none",
          "customOfferRequest.qualificationNotifiedAt": null,
        },
      },
    )
  }
  return listAdminRewardTesters()
}

// ─────────────────────────── Worker ───────────────────────────
let intervalHandle: ReturnType<typeof setInterval> | null = null

export async function runRewardsMaintenance() {
  try {
    await ScratchCardModel.updateMany({ status: "unscratched", expiresAt: { $lte: new Date() } }, { $set: { status: "expired" } })
    // Coin expiry for wallets with due lots (bounded per run).
    const dueCustomers = await CoinTxnModel.distinct("customerId", {
      amount: { $gt: 0 },
      expired: false,
      expiresAt: { $lte: new Date() },
    })
    for (const customerId of dueCustomers.slice(0, 500)) {
      await expireCoinsFor(String(customerId)).catch(() => undefined)
    }
    await sendCustomOfferClaimReminders()
  } catch (error) {
    logger.warn({ err: error }, "Rewards maintenance failed")
  }
}

export function startRewardsWorker() {
  if (intervalHandle) return
  intervalHandle = setInterval(() => void runRewardsMaintenance(), 30 * 60_000)
}

export function stopRewardsWorker() {
  if (intervalHandle) clearInterval(intervalHandle)
  intervalHandle = null
}
