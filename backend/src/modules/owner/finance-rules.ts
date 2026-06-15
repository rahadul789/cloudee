export const restaurantPayoutFinalStatuses = ["Delivered"] as const

const payoutBlockedPaymentStatuses = ["failed", "refund_pending", "refunded"] as const
const payoutPaidLikePaymentStatuses = ["paid", "refund_rejected"] as const

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback
}

export function isRestaurantPayoutEligibleOrder(order?: {
  status?: unknown
  paymentMethod?: unknown
  paymentStatus?: unknown
} | null) {
  const status = stringValue(order?.status)
  if (!restaurantPayoutFinalStatuses.includes(status as typeof restaurantPayoutFinalStatuses[number])) {
    return false
  }

  const paymentMethod = stringValue(order?.paymentMethod, "Cash")
  const paymentStatus = stringValue(order?.paymentStatus)

  if (payoutBlockedPaymentStatuses.includes(paymentStatus as typeof payoutBlockedPaymentStatuses[number])) {
    return false
  }

  if (paymentMethod === "Bkash") {
    return payoutPaidLikePaymentStatuses.includes(paymentStatus as typeof payoutPaidLikePaymentStatuses[number])
  }

  if (paymentMethod === "Cash") {
    return true
  }

  return (
    !paymentStatus ||
    payoutPaidLikePaymentStatuses.includes(paymentStatus as typeof payoutPaidLikePaymentStatuses[number])
  )
}

export function buildRelatedOrderPayoutEligibilityMatch(
  extraMatch: Record<string, unknown> = {}
) {
  return {
    relatedOrderStatus: { $in: [...restaurantPayoutFinalStatuses] },
    $or: [
      { relatedOrderPaymentStatus: { $in: [...payoutPaidLikePaymentStatuses] } },
      {
        relatedOrderPaymentMethod: "Cash",
        relatedOrderPaymentStatus: { $nin: [...payoutBlockedPaymentStatuses] }
      },
      {
        relatedOrderPaymentMethod: { $in: [null, ""] },
        relatedOrderPaymentStatus: { $nin: [...payoutBlockedPaymentStatuses] }
      }
    ],
    ...extraMatch
  }
}
