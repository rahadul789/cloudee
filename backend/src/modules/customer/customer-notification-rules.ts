// What belongs in the customer's notification inbox (pure; unit-tested).
//
// Push ≠ inbox. Live order progress (accepted, preparing, picked up, rider near, chat…) is a
// moment-in-time ping — the Orders tab / tracking screen is the source of truth, so those
// pushes are NOT stored. The inbox keeps offers plus updates worth finding later:
// cancellations/failed deliveries, refunds, support replies, vouchers, rewards, etc.

/** Order statuses that ARE worth keeping (bad outcomes the customer may need to revisit). */
const KEEP_ORDER_STATUSES = new Set(["Cancelled", "Rejected"])

/** Pure live-progress pushes — never stored in the inbox. */
const TRANSIENT_TYPES = new Set([
  "rider_near",
  "rider_assigned",
  "rider_live_tracking",
  "order_chat",
  "open_notify",
])

const OFFER_TYPES = new Set([
  "promotion",
  "voucher",
  "campaign",
  "custom_offer",
  "custom_offer_qualified",
])

export function isTransientCustomerNotification(type: string, status?: unknown) {
  if (TRANSIENT_TYPES.has(type)) return true
  if (type === "order_status") {
    return !(typeof status === "string" && KEEP_ORDER_STATUSES.has(status))
  }
  return false
}

export type CustomerNotificationGroup = "offers" | "updates"

export function customerNotificationGroup(type: string): CustomerNotificationGroup {
  return OFFER_TYPES.has(type) ? "offers" : "updates"
}
