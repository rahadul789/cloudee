import {
  assertGiftPayment,
  deliveryContactOf,
  normalizeGiftInput,
} from "../src/modules/customer/gift-order"

const sender = { fullName: "Rahim", phone: "01711111111" }

describe("gift orders", () => {
  it("is not a gift when nothing is filled", () => {
    expect(normalizeGiftInput(undefined, sender)).toBeNull()
    expect(normalizeGiftInput({ recipientName: " ", recipientPhone: "" }, sender)).toBeNull()
  })

  it("normalises the receiver and keeps the sender name", () => {
    expect(
      normalizeGiftInput({ recipientName: "Ammu", recipientPhone: "+8801812345678", message: "Happy birthday" }, sender),
    ).toEqual({
      isGift: true,
      recipientName: "Ammu",
      recipientPhone: "01812345678",
      message: "Happy birthday",
      senderName: "Rahim",
    })
  })

  it("rejects a half-filled or invalid receiver", () => {
    expect(() => normalizeGiftInput({ recipientPhone: "01812345678" }, sender)).toThrow(/name/i)
    expect(() => normalizeGiftInput({ recipientName: "Ammu", recipientPhone: "12345" }, sender)).toThrow(/mobile/i)
  })

  it("only allows prepaid gifts", () => {
    const gift = normalizeGiftInput({ recipientName: "Ammu", recipientPhone: "01812345678" }, sender)
    expect(() => assertGiftPayment(gift, "Cash")).toThrow(/paid online/i)
    expect(() => assertGiftPayment(gift, "Bkash")).not.toThrow()
    expect(() => assertGiftPayment(null, "Cash")).not.toThrow()
  })

  it("hands the rider the receiver for gifts, the customer otherwise", () => {
    const customerSnapshot = { fullName: "Rahim", phone: "01711111111" }
    expect(deliveryContactOf({ customerSnapshot }).phone).toBe("01711111111")
    const gifted = deliveryContactOf({
      customerSnapshot,
      gift: { isGift: true, recipientName: "Ammu", recipientPhone: "01812345678", senderName: "Rahim", message: "" },
    })
    expect(gifted).toMatchObject({ name: "Ammu", phone: "01812345678", isGift: true, giftFrom: "Rahim" })
  })
})
