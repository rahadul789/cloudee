import {
  CHAT_MAX_LENGTH,
  consumeChatSendBudget,
  getChatAvailability,
  normalizeChatText,
  shouldSendChatPush,
} from "../src/modules/order-chat/order-chat.rules"

describe("order chat rules", () => {
  it("opens only after a rider is assigned and while the order is live", () => {
    expect(getChatAvailability({ status: "Preparing", riderId: "" })).toEqual({
      canSend: false,
      closedReason: "no_rider",
    })
    for (const status of ["Accepted", "Preparing", "ReadyForPickup", "PickedUp"]) {
      expect(getChatAvailability({ status, riderId: "r1" }).canSend).toBe(true)
    }
    for (const status of ["Delivered", "Cancelled", "Rejected", "New"]) {
      expect(getChatAvailability({ status, riderId: "r1" })).toEqual({
        canSend: false,
        closedReason: "order_finished",
      })
    }
  })

  it("cleans and caps message text", () => {
    expect(normalizeChatText("  hello\u0007 there \n\n\n\nok ")).toBe("hello there \n\nok")
    expect(normalizeChatText(null)).toBe("")
    expect(normalizeChatText("x".repeat(900))).toHaveLength(CHAT_MAX_LENGTH)
  })

  it("rate-limits a sender to 20 messages per minute", () => {
    const start = 1_000_000
    for (let i = 0; i < 20; i += 1) {
      expect(consumeChatSendBudget("spammer", start + i)).toBe(true)
    }
    expect(consumeChatSendBudget("spammer", start + 100)).toBe(false)
    // window slides: a minute later they can send again
    expect(consumeChatSendBudget("spammer", start + 61_000)).toBe(true)
  })

  it("coalesces chat pushes per recipient+order", () => {
    expect(shouldSendChatPush("customer:c1:o1", 0)).toBe(true)
    expect(shouldSendChatPush("customer:c1:o1", 10_000)).toBe(false)
    expect(shouldSendChatPush("customer:c1:o2", 10_000)).toBe(true)
    expect(shouldSendChatPush("customer:c1:o1", 50_000)).toBe(true)
  })
})
