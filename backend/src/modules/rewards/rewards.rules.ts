// Pure rules for scratch prizes (unit-tested).

export type PrizeConfig = { id: string; type: string; label: string; weight: number; amount: number }

/** Money a prize can cost the platform. */
export function prizeCost(prize: Pick<PrizeConfig, "type" | "amount">, freeDeliveryCost: number) {
  // coins and bonus stamps are in-game; their value is accounted for by the mystery box.
  if (prize.type === "discount") return Math.max(0, prize.amount)
  if (prize.type === "free_delivery") return Math.max(0, freeDeliveryCost)
  return 0
}

/**
 * Weighted pick. `roll` is a number in [0, 1). If the picked prize would exceed the remaining
 * budget it falls back to the best free prize (bonus stamp > fun) and is flagged budgetCapped.
 */
export function pickPrize(params: {
  prizes: PrizeConfig[]
  roll: number
  budgetLeft: number | null // null = unlimited
  freeDeliveryCost: number
}) {
  const usable = params.prizes.filter((prize) => prize.weight > 0)
  const total = usable.reduce((sum, prize) => sum + prize.weight, 0)
  const fallback =
    usable.find((prize) => prize.type === "bonus_stamp") ??
    usable.find((prize) => prize.type === "fun") ??
    { id: "fun", type: "fun", label: "Better luck next time 😄", weight: 1, amount: 0 }
  if (!total) return { prize: fallback, cost: 0, budgetCapped: false }
  let cursor = Math.min(0.999999, Math.max(0, params.roll)) * total
  let picked = usable[usable.length - 1]
  for (const prize of usable) {
    if (cursor < prize.weight) {
      picked = prize
      break
    }
    cursor -= prize.weight
  }
  const cost = prizeCost(picked, params.freeDeliveryCost)
  if (cost > 0 && params.budgetLeft !== null && cost > params.budgetLeft) {
    return { prize: fallback, cost: 0, budgetCapped: true }
  }
  return { prize: picked, cost, budgetCapped: false }
}

/** Average cost per scratch card with these odds (shown to the admin while editing). */
export function expectedCostPerCard(prizes: PrizeConfig[], freeDeliveryCost: number) {
  const usable = prizes.filter((prize) => prize.weight > 0)
  const total = usable.reduce((sum, prize) => sum + prize.weight, 0)
  if (!total) return 0
  return usable.reduce((sum, prize) => sum + (prize.weight / total) * prizeCost(prize, freeDeliveryCost), 0)
}

/** First day of the current month in Asia/Dhaka (UTC+6, no DST), as a Date. */
export function dhakaMonthStart(now: number) {
  const dhaka = new Date(now + 6 * 3_600_000)
  return new Date(Date.UTC(dhaka.getUTCFullYear(), dhaka.getUTCMonth(), 1) - 6 * 3_600_000)
}

export function renderTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((text, [key, value]) => text.split(`{{${key}}}`).join(String(value)), template)
}

/** Weighted pick of a mystery-box taka prize (`roll` in [0, 1)). */
export function pickBoxAmount(prizes: Array<{ amount: number; weight: number }>, roll: number) {
  const usable = prizes.filter((prize) => prize.weight > 0 && prize.amount > 0)
  if (!usable.length) return 10
  const total = usable.reduce((sum, prize) => sum + prize.weight, 0)
  let cursor = Math.min(0.999999, Math.max(0, roll)) * total
  for (const prize of usable) {
    if (cursor < prize.weight) return prize.amount
    cursor -= prize.weight
  }
  return usable[usable.length - 1].amount
}

export function expectedBoxValue(prizes: Array<{ amount: number; weight: number }>) {
  const usable = prizes.filter((prize) => prize.weight > 0)
  const total = usable.reduce((sum, prize) => sum + prize.weight, 0)
  return total ? usable.reduce((sum, prize) => sum + (prize.weight / total) * prize.amount, 0) : 0
}

/**
 * Stamp ledger: extras carry over. `consumed` = stamps already turned into boxes.
 * available = earned − consumed (never negative).
 */
export function stampLedger(params: { delivered: number; bonus: number; bought: number; consumed: number }) {
  const earned = params.delivered + params.bonus + params.bought
  return { earned, available: Math.max(0, earned - params.consumed) }
}

/**
 * Estimated reward cost per delivered order for given settings (admin preview):
 * stamps/order = 1 + P(bonus stamp) + coins-per-spin / stampPrice (coin stamps capped per cycle),
 * box cost/order = boxValue / (target / stamps-per-order), + direct wheel cost.
 */
export function estimateCostPerOrder(params: {
  segments: PrizeConfig[]
  freeDeliveryCost: number
  target: number
  stampCoinPrice: number
  maxCoinStampsPerCycle: number
  boxValue: number
}) {
  const usable = params.segments.filter((segment) => segment.weight > 0)
  const total = usable.reduce((sum, segment) => sum + segment.weight, 0) || 1
  const pBonus = usable.filter((s) => s.type === "bonus_stamp").reduce((sum, s) => sum + s.weight, 0) / total
  const coinsPerSpin = usable.filter((s) => s.type === "coins").reduce((sum, s) => sum + (s.weight / total) * s.amount, 0)
  const directCost = expectedCostPerCard(usable, params.freeDeliveryCost)
  const ordersPerCycleNoCoins = params.target / (1 + pBonus)
  const coinStamps = Math.min(
    params.maxCoinStampsPerCycle,
    (coinsPerSpin * ordersPerCycleNoCoins) / Math.max(1, params.stampCoinPrice),
  )
  const ordersPerBox = Math.max(1, (params.target - coinStamps) / (1 + pBonus))
  return {
    coinsPerSpin,
    ordersPerBox,
    perOrder: params.boxValue / ordersPerBox + directCost,
  }
}
