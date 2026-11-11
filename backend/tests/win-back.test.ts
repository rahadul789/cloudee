import {
  buildWinBackMessage,
  checkWinBackEligibility,
  dhakaClock,
  fitToBudget,
  isControlCustomer,
  segmentForOrderCount,
  sortByPriority,
} from "../src/modules/win-back/win-back.rules"

const DAY = 86_400_000
const now = Date.UTC(2026, 10, 9, 6, 30) // 12:30 Dhaka

describe("win-back rules", () => {
  it("segments by delivered orders", () => {
    expect(segmentForOrderCount(1)).toBe("one_time")
    expect(segmentForOrderCount(3)).toBe("regular")
    expect(segmentForOrderCount(7)).toBe("loyal")
  })

  it("only lapsed customers are eligible", () => {
    const base = { now, lapsedDays: 30, previousAttemptsAt: [], maxAttemptsPer90Days: 2 }
    expect(checkWinBackEligibility({ ...base, lastOrderAt: now - 10 * DAY }).reason).toBe("still_active")
    expect(checkWinBackEligibility({ ...base, lastOrderAt: now - 40 * DAY }).eligible).toBe(true)
  })

  it("max 2 tries per 90 days, 14 days apart, and an order resets the cycle", () => {
    const lastOrderAt = now - 80 * DAY
    const base = { now, lapsedDays: 30, lastOrderAt, maxAttemptsPer90Days: 2 }
    expect(checkWinBackEligibility({ ...base, previousAttemptsAt: [now - 5 * DAY] }).reason).toBe("recently_tried")
    expect(checkWinBackEligibility({ ...base, previousAttemptsAt: [now - 20 * DAY] }).eligible).toBe(true)
    expect(
      checkWinBackEligibility({ ...base, previousAttemptsAt: [now - 20 * DAY, now - 40 * DAY] }).reason,
    ).toBe("limit_reached")
    // tries before their latest order don't count
    expect(
      checkWinBackEligibility({ ...base, previousAttemptsAt: [lastOrderAt - 5 * DAY, lastOrderAt - 30 * DAY] }).eligible,
    ).toBe(true)
  })

  it("control group is stable and roughly the asked share", () => {
    expect(isControlCustomer("abc", 10)).toBe(isControlCustomer("abc", 10))
    expect(isControlCustomer("abc", 0)).toBe(false)
    const picked = Array.from({ length: 2000 }, (_, i) => isControlCustomer(`c${i}`, 10)).filter(Boolean).length
    expect(picked).toBeGreaterThan(120)
    expect(picked).toBeLessThan(280)
  })

  it("prioritises loyal customers and respects the budget", () => {
    const rows = sortByPriority([
      { id: "a", segment: "one_time" as const, daysSinceOrder: 50, amount: 20 },
      { id: "b", segment: "loyal" as const, daysSinceOrder: 35, amount: 50 },
      { id: "c", segment: "regular" as const, daysSinceOrder: 40, amount: 35 },
    ])
    expect(rows.map((r) => r.id)).toEqual(["b", "c", "a"])
    const fit = fitToBudget(rows, 70)
    expect(fit.picked.map((r) => r.id)).toEqual(["b", "a"])
    expect(fit.spent).toBe(70)
    expect(fit.skipped).toBe(1)
  })

  it("builds a personal message and a Dhaka clock", () => {
    expect(buildWinBackMessage({ amount: 35, favouriteRestaurantName: "Kacchi Bhai", validityDays: 7, minOrder: 250 }).body).toContain(
      "Kacchi Bhai misses you",
    )
    expect(dhakaClock(now)).toEqual({ dateKey: "2026-11-09", minuteOfDay: 12 * 60 + 30 })
  })
})
