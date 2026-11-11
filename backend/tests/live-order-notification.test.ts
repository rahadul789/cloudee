import {
  claimLiveOrderPush,
  decorateLiveOrderPush,
  liveOrderProgressLine,
  liveOrderSlotKey,
  liveOrderStep,
  shouldSendLiveOrderPush,
} from "../src/modules/customer/live-order-notification"

describe("live order notification", () => {
  it("gives every progress push of one order the same slot", () => {
    expect(liveOrderSlotKey("order_status", "abc")).toBe("order-abc")
    expect(liveOrderSlotKey("rider_near", "abc")).toBe("order-abc")
    expect(liveOrderSlotKey("promotion", "abc")).toBeNull()
    expect(liveOrderSlotKey("order_chat", "abc")).toBeNull() // chat keeps its own notifications
    expect(liveOrderSlotKey("order_status", "")).toBeNull()
  })

  it("maps pushes to progress steps", () => {
    expect(liveOrderStep("order_status", "Preparing")).toBe("Preparing")
    expect(liveOrderStep("rider_near")).toBe("PickedUp")
    expect(liveOrderStep("order_status", "Cancelled")).toBeNull()
  })

  it("draws a progress line", () => {
    expect(liveOrderProgressLine("Accepted")).toBe("●○○○○  Confirmed")
    expect(liveOrderProgressLine("PickedUp")).toBe("●●●●○  On the way")
    expect(liveOrderProgressLine("Delivered")).toBe("●●●●●  Delivered")
  })

  it("decorates live pushes and leaves others untouched", () => {
    const live = decorateLiveOrderPush({
      title: "🍳 Food is preparing",
      body: "Your food is being prepared now.",
      data: { type: "order_status", status: "Preparing", orderId: "o1" },
    })
    expect(live.slot).toBe("order-o1")
    expect(live.body).toBe("Your food is being prepared now.\n●●○○○  Preparing")

    const cancelled = decorateLiveOrderPush({
      title: "❌ Order cancelled",
      body: "Your order was cancelled.",
      data: { type: "order_status", status: "Cancelled", orderId: "o1" },
    })
    expect(cancelled.slot).toBe("order-o1") // replaces the live one
    expect(cancelled.body).toBe("Your order was cancelled.")

    const promo = decorateLiveOrderPush({ title: "Deal", body: "x", data: { type: "promotion" } })
    expect(promo.slot).toBeNull()
    expect(promo.body).toBe("x")
  })
})


describe("live order push budget", () => {
  const MIN = 60_000

  it("a normal order buzzes 4 times: Accepted, On the way, Nearby, Delivered", () => {
    const t0 = Date.UTC(2026, 10, 9, 7, 0)
    const sent = [
      ["Accepted", 0],
      ["Preparing", 2], // admin accepted, kitchen started 2 min later → quiet
      ["ReadyForPickup", 9], // still within 10 min → quiet
      ["rider_assigned", 9],
      ["PickedUp", 15],
      ["rider_live_tracking", 15], // same moment as pickup → quiet
      ["rider_near", 28],
      ["Delivered", 31],
    ].filter(([key, minute]) => claimLiveOrderPush("order-a", key as string, t0 + (minute as number) * MIN))
    expect(sent.map(([key]) => key)).toEqual(["Accepted", "PickedUp", "rider_near", "Delivered"])
  })

  it("never pushes New (e.g. an admin moving an order back)", () => {
    expect(shouldSendLiveOrderPush({ eventKey: "New", now: 0, last: null })).toBe(false)
  })

  it("a slow kitchen still gets a Preparing update", () => {
    expect(
      shouldSendLiveOrderPush({ eventKey: "Preparing", now: 15 * MIN, last: { at: 0, eventKey: "Accepted" } }),
    ).toBe(true)
  })

  it("never repeats the same step and always sends cancellations", () => {
    expect(shouldSendLiveOrderPush({ eventKey: "Accepted", now: 1, last: { at: 0, eventKey: "Accepted" } })).toBe(false)
    expect(shouldSendLiveOrderPush({ eventKey: "Cancelled", now: 1, last: { at: 0, eventKey: "Preparing" } })).toBe(true)
  })
})
