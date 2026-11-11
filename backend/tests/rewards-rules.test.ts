import { dhakaMonthStart, expectedCostPerCard, pickPrize, prizeCost, renderTemplate } from "../src/modules/rewards/rewards.rules"

const prizes = [
  { id: "fun", type: "fun", label: "Fun", weight: 60, amount: 0 },
  { id: "stamp", type: "bonus_stamp", label: "+1", weight: 25, amount: 0 },
  { id: "fd", type: "free_delivery", label: "Free delivery", weight: 10, amount: 0 },
  { id: "ten", type: "discount", label: "৳10", weight: 5, amount: 10 },
]

describe("scratch prizes", () => {
  it("picks by weight", () => {
    expect(pickPrize({ prizes, roll: 0, budgetLeft: null, freeDeliveryCost: 25 }).prize.id).toBe("fun")
    expect(pickPrize({ prizes, roll: 0.7, budgetLeft: null, freeDeliveryCost: 25 }).prize.id).toBe("stamp")
    expect(pickPrize({ prizes, roll: 0.9, budgetLeft: null, freeDeliveryCost: 25 }).prize.id).toBe("fd")
    expect(pickPrize({ prizes, roll: 0.99, budgetLeft: null, freeDeliveryCost: 25 }).prize.id).toBe("ten")
  })

  it("never overspends the budget — falls back to a free prize", () => {
    const result = pickPrize({ prizes, roll: 0.9, budgetLeft: 5, freeDeliveryCost: 25 })
    expect(result).toMatchObject({ cost: 0, budgetCapped: true })
    expect(result.prize.type).toBe("bonus_stamp")
  })

  it("costs and expected cost", () => {
    expect(prizeCost({ type: "discount", amount: 10 }, 25)).toBe(10)
    expect(prizeCost({ type: "free_delivery", amount: 0 }, 25)).toBe(25)
    expect(prizeCost({ type: "fun", amount: 0 }, 25)).toBe(0)
    // 10% × 25 + 5% × 10 = 3
    expect(expectedCostPerCard(prizes, 25)).toBeCloseTo(3)
  })

  it("month start is Dhaka-local", () => {
    // 2026-11-30 20:00 UTC = 2026-12-01 02:00 in Dhaka → December
    const start = dhakaMonthStart(Date.UTC(2026, 10, 30, 20))
    expect(start.toISOString()).toBe("2026-11-30T18:00:00.000Z")
  })

  it("renders templates", () => {
    expect(renderTemplate("{{threshold}} orders, ৳{{amount}}", { threshold: 10, amount: 20 })).toBe("10 orders, ৳20")
  })
})

import { estimateCostPerOrder, expectedBoxValue, pickBoxAmount, stampLedger } from "../src/modules/rewards/rewards.rules"

describe("stamp card v2", () => {
  const box = [
    { amount: 10, weight: 85 },
    { amount: 15, weight: 10 },
    { amount: 20, weight: 4 },
    { amount: 50, weight: 1 },
  ]
  it("box prize pick + expected value", () => {
    expect(pickBoxAmount(box, 0)).toBe(10)
    expect(pickBoxAmount(box, 0.9)).toBe(15)
    expect(pickBoxAmount(box, 0.97)).toBe(20)
    expect(pickBoxAmount(box, 0.995)).toBe(50)
    expect(expectedBoxValue(box)).toBeCloseTo(11.3)
  })
  it("extra stamps carry over", () => {
    // 9 delivered + 1 bonus + 1 bought, one box (7) already used → 4 left
    expect(stampLedger({ delivered: 9, bonus: 1, bought: 1, consumed: 7 })).toEqual({ earned: 11, available: 4 })
    expect(stampLedger({ delivered: 2, bonus: 0, bought: 0, consumed: 7 }).available).toBe(0)
  })
  it("cost per order stays near the old ৳1.7 with the balanced wheel", () => {
    const wheel = [
      { id: "c5", type: "coins", label: "", weight: 25, amount: 5 },
      { id: "c10", type: "coins", label: "", weight: 25, amount: 10 },
      { id: "c20", type: "coins", label: "", weight: 15, amount: 20 },
      { id: "c30", type: "coins", label: "", weight: 10, amount: 30 },
      { id: "c50", type: "coins", label: "", weight: 4, amount: 50 },
      { id: "s", type: "bonus_stamp", label: "", weight: 5, amount: 0 },
      { id: "fd", type: "free_delivery", label: "", weight: 1, amount: 0 },
      { id: "l", type: "fun", label: "", weight: 15, amount: 0 },
    ]
    const result = estimateCostPerOrder({
      segments: wheel,
      freeDeliveryCost: 25,
      target: 7,
      stampCoinPrice: 150,
      maxCoinStampsPerCycle: 2,
      boxValue: expectedBoxValue(box),
    })
    expect(result.coinsPerSpin).toBeCloseTo(11.75)
    expect(result.perOrder).toBeGreaterThan(1.5)
    expect(result.perOrder).toBeLessThan(2.3)
  })
})
