import { shouldNudgeStaleTracking } from "../src/modules/rider/tracking-watchdog"

describe("tracking watchdog nudges", () => {
  it("nudges once, then waits 5 minutes per order", () => {
    expect(shouldNudgeStaleTracking("o1", 0)).toBe(true)
    expect(shouldNudgeStaleTracking("o1", 60_000)).toBe(false)
    expect(shouldNudgeStaleTracking("o2", 60_000)).toBe(true)
    expect(shouldNudgeStaleTracking("o1", 5 * 60_000 + 1)).toBe(true)
  })
})
