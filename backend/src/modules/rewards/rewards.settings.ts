import mongoose from "mongoose"

import { OrderModel } from "../owner/operational.model"
import { CoinTxnModel, RewardSettingsModel, ScratchCardModel } from "./rewards.model"
import { stampLedger } from "./rewards.rules"

// Model-only helpers (no service imports) so custom-offer.service can use them without an
// import cycle (rewards.service → custom-offer.service → here).

// The prizes saved by the first (scratch-card) version — no "coins" slice. A settings doc
// still holding exactly these was never customised for the spin wheel, so it gets the v2 wheel.
const LEGACY_SCRATCH_PRIZE_IDS = ["delivery", "fun", "stamp", "ten"]

export async function getRewardSettings() {
  const doc = await RewardSettingsModel.findOneAndUpdate(
    { key: "default" },
    { $setOnInsert: { key: "default" } },
    { upsert: true, new: true },
  ).lean()
  // A doc created by an older version lacks newer fields (lean() skips schema defaults) —
  // fill every missing field from the schema defaults so callers never see undefined.
  const defaults = new RewardSettingsModel().toObject() as Record<string, unknown>
  const merged: Record<string, unknown> = { ...defaults }
  for (const [key, value] of Object.entries(doc ?? {})) {
    if (value !== undefined && value !== null) merged[key] = value
  }
  const prizes = (merged.prizes ?? []) as Array<{ id: string; type: string }>
  const legacyScratch =
    !prizes.some((prize) => prize.type === "coins") &&
    prizes.map((prize) => prize.id).sort().join(",") === LEGACY_SCRATCH_PRIZE_IDS.join(",")
  if (legacyScratch) {
    merged.prizes = defaults.prizes
    await RewardSettingsModel.updateOne({ key: "default" }, { $set: { prizes: defaults.prizes } }).catch(() => undefined)
  }
  if (!Array.isArray(merged.boxPrizes) || !(merged.boxPrizes as unknown[]).length) merged.boxPrizes = defaults.boxPrizes
  return merged as NonNullable<typeof doc>
}

function deliveredAfter(since: Date | null) {
  if (!since) return {}
  return {
    $or: [
      { "timestamps.Delivered": { $gt: since } },
      { "timestamps.deliveredAt": { $gt: since } },
      { "timestamps.Delivered": { $exists: false }, "timestamps.deliveredAt": { $exists: false }, updatedAt: { $gt: since } },
    ],
  }
}

function deliveredUpTo(since: Date | null, until: Date) {
  const upper = {
    $or: [
      { "timestamps.Delivered": { $lte: until } },
      { "timestamps.deliveredAt": { $lte: until } },
      { "timestamps.Delivered": { $exists: false }, "timestamps.deliveredAt": { $exists: false }, updatedAt: { $lte: until } },
    ],
  }
  return since ? { $and: [deliveredAfter(since), upper] } : upper
}

/** Bonus stamps won on spins (they count toward the card). */
export async function countBonusStamps(customerId: string, since?: Date | null) {
  if (!mongoose.Types.ObjectId.isValid(customerId)) return 0
  return ScratchCardModel.countDocuments({
    customerId,
    status: "scratched",
    "prize.type": "bonus_stamp",
    ...(since ? { scratchedAt: { $gt: since } } : {}),
  })
}

/** Stamps bought with coins (each buy_stamp txn = 1 stamp). */
export async function countBoughtStamps(customerId: string, since?: Date | null) {
  if (!mongoose.Types.ObjectId.isValid(customerId)) return 0
  return CoinTxnModel.countDocuments({
    customerId,
    reason: "buy_stamp",
    ...(since ? { createdAt: { $gt: since } } : {}),
  })
}

/**
 * The stamp ledger for one customer. Extras carry over between cards.
 *  earned   = delivered orders + spin bonus stamps + coin-bought stamps (all since countStartsAt)
 *  consumed = request.stampsConsumed; for customers from the old "cycle" system (no
 *             stampsConsumed yet) it is the delivered orders up to their cycleStartedAt, which
 *             keeps everyone's current progress exactly as it was.
 */
export async function computeStampLedger(params: {
  customerId: string
  request?: Record<string, any> | null
  countStartsAt?: Date | null
}) {
  const startsAt = params.countStartsAt ?? null
  const request = params.request ?? {}
  const statusFilter = { customerId: params.customerId, status: "Delivered" }
  const [delivered, bonus, bought] = await Promise.all([
    OrderModel.countDocuments({ ...statusFilter, ...deliveredAfter(startsAt) }),
    countBonusStamps(params.customerId, startsAt),
    countBoughtStamps(params.customerId, startsAt),
  ])
  let consumed = typeof request.stampsConsumed === "number" ? request.stampsConsumed : null
  if (consumed === null) {
    const cycleStartedAt = request.cycleStartedAt ? new Date(request.cycleStartedAt) : null
    consumed =
      cycleStartedAt && !Number.isNaN(cycleStartedAt.getTime())
        ? await OrderModel.countDocuments({ ...statusFilter, ...deliveredUpTo(startsAt, cycleStartedAt) })
        : 0
  }
  return { ...stampLedger({ delivered, bonus, bought, consumed }), consumed, delivered, bonus, bought }
}

/** True when test mode is on and this customer is a tester. */
export function isRewardsTester(settings: { testModeEnabled?: boolean; testerCustomerIds?: string[] }, customerId: string) {
  return Boolean(settings.testModeEnabled && (settings.testerCustomerIds ?? []).includes(String(customerId)))
}
