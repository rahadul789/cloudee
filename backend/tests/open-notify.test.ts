import {
  OPEN_NOTIFY_MAX_AHEAD_MS,
  buildOpenNotifyPush,
  isOpenNotifyDue,
  planOpenNotify,
} from "../src/modules/open-notify/open-notify.rules"

describe("open-notify rules", () => {
  const now = Date.UTC(2026, 10, 8, 16, 0, 0)

  it("does nothing when the area is already open", () => {
    expect(planOpenNotify({ isOpen: true, opensAtEpochMs: null, opensAtLabel: null }, now)).toEqual({
      kind: "already_open",
    })
  })

  it("schedules at the reopen time", () => {
    const at = now + 14 * 60 * 60 * 1000
    const plan = planOpenNotify({ isOpen: false, opensAtEpochMs: at, opensAtLabel: "12:00 PM" }, now)
    expect(plan).toEqual({ kind: "schedule", notifyAt: new Date(at), opensAtLabel: "12:00 PM" })
  })

  it("refuses unknown, past or absurdly far reopen times", () => {
    expect(planOpenNotify({ isOpen: false, opensAtEpochMs: null, opensAtLabel: null }, now).kind).toBe(
      "unknown_reopen",
    )
    expect(planOpenNotify({ isOpen: false, opensAtEpochMs: now - 1, opensAtLabel: null }, now).kind).toBe(
      "unknown_reopen",
    )
    expect(
      planOpenNotify(
        { isOpen: false, opensAtEpochMs: now + OPEN_NOTIFY_MAX_AHEAD_MS + 1, opensAtLabel: null },
        now,
      ).kind,
    ).toBe("unknown_reopen")
  })

  it("marks rows due at (or a moment before) the reopen time", () => {
    expect(isOpenNotifyDue(new Date(now), now)).toBe(true)
    expect(isOpenNotifyDue(new Date(now + 3_000), now)).toBe(true)
    expect(isOpenNotifyDue(new Date(now + 60_000), now)).toBe(false)
  })

  it("push opens the home tab and bypasses the promo opt-out (customer asked for it)", () => {
    const push = buildOpenNotifyPush()
    expect(push.data).toMatchObject({ type: "open_notify", path: "/(tabs)", personalOffer: true })
  })
})
