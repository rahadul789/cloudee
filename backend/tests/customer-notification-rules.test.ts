import {
  customerNotificationGroup,
  isTransientCustomerNotification,
} from "../src/modules/customer/customer-notification-rules"

describe("customer notification inbox rules", () => {
  it("keeps live order progress out of the inbox", () => {
    for (const status of ["Accepted", "Preparing", "ReadyForPickup", "PickedUp", "Delivered"]) {
      expect(isTransientCustomerNotification("order_status", status)).toBe(true)
    }
    expect(isTransientCustomerNotification("order_status", undefined)).toBe(true)
    for (const type of ["rider_near", "rider_assigned", "rider_live_tracking", "order_chat", "open_notify"]) {
      expect(isTransientCustomerNotification(type)).toBe(true)
    }
  })

  it("keeps bad order outcomes and everything else", () => {
    expect(isTransientCustomerNotification("order_status", "Cancelled")).toBe(false)
    expect(isTransientCustomerNotification("order_status", "Rejected")).toBe(false)
    for (const type of ["refund_completed", "review_reply", "review_request", "support", "promotion", "voucher", "account_status"]) {
      expect(isTransientCustomerNotification(type)).toBe(false)
    }
  })

  it("groups offers vs updates", () => {
    expect(customerNotificationGroup("promotion")).toBe("offers")
    expect(customerNotificationGroup("voucher")).toBe("offers")
    expect(customerNotificationGroup("custom_offer_qualified")).toBe("offers")
    expect(customerNotificationGroup("order_status")).toBe("updates")
    expect(customerNotificationGroup("refund_completed")).toBe("updates")
  })
})
