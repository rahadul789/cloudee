import {
  deliveryCodeFromOrderNumber,
  forRider,
  isDeliveryCodeCorrect,
  maskOrderNumbersDeep,
  setDeliveryCodeEnabled,
} from "../src/common/utils/delivery-code"

describe("delivery code", () => {
  afterEach(() => setDeliveryCodeEnabled(false))

  it("is the last 4 digits of the order number", () => {
    expect(deliveryCodeFromOrderNumber("FB-1731400000000-4821")).toBe("4821")
    expect(deliveryCodeFromOrderNumber("weird")).toBe("")
  })

  it("accepts the right code with stray spaces, rejects wrong/short ones", () => {
    expect(isDeliveryCodeCorrect("FB-1731400000000-4821", " 48 21 ")).toBe(true)
    expect(isDeliveryCodeCorrect("FB-1731400000000-4821", "4822")).toBe(false)
    expect(isDeliveryCodeCorrect("FB-1731400000000-4821", "")).toBe(false)
    expect(isDeliveryCodeCorrect("broken", "")).toBe(false)
  })

  it("masks order numbers everywhere in a payload, keeping other values intact", () => {
    const at = new Date("2026-11-12T00:00:00Z")
    const masked = maskOrderNumbersDeep({
      orderNumber: "FB-1731400000000-4821",
      body: "অর্ডার FB-1731400000000-4821 পিকআপের জন্য রেডি।",
      list: [{ orderNumber: "FB-1731400000001-1234" }],
      createdAt: at,
      phone: "01712345678",
    })
    expect(masked.orderNumber).toBe("FB-1731400000000-••••")
    expect(masked.body).toBe("অর্ডার FB-1731400000000-•••• পিকআপের জন্য রেডি।")
    expect(masked.list[0].orderNumber).toBe("FB-1731400000001-••••")
    expect(masked.createdAt).toBe(at)
    expect(masked.phone).toBe("01712345678")
  })

  it("only masks rider payloads while the code is ON", () => {
    const payload = { orderNumber: "FB-1731400000000-4821" }
    expect(forRider(payload)).toBe(payload)
    setDeliveryCodeEnabled(true)
    expect(forRider(payload).orderNumber).toBe("FB-1731400000000-••••")
  })
})
