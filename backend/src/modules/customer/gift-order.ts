import { StatusCodes } from "http-status-codes"

import { AppError } from "../../common/utils/app-error"

// "Send food home": someone (often in Dhaka or abroad) orders for family in Netrakona.
// The ORDER still belongs to the sender (customerId, pushes, history, payment); only the
// hand-off changes — the rider/restaurant contact is the RECIPIENT. Pure + unit-tested.

export type GiftInput = {
  recipientName?: string
  recipientPhone?: string
  message?: string
}

export type OrderGift = {
  isGift: true
  recipientName: string
  recipientPhone: string
  message: string
  senderName: string
}

const BD_MOBILE = /^01[3-9]\d{8}$/

function normalizePhone(value: string) {
  const digits = value.replace(/[^\d+]/g, "")
  if (digits.startsWith("+880")) return `0${digits.slice(4)}`
  if (digits.startsWith("880")) return `0${digits.slice(3)}`
  return digits
}

/** null = not a gift. Throws a friendly 400 for a half-filled or invalid gift. */
export function normalizeGiftInput(
  input: GiftInput | null | undefined,
  sender: { fullName?: string | null; phone?: string | null },
): OrderGift | null {
  if (!input) return null
  const recipientName = String(input.recipientName ?? "").trim().slice(0, 60)
  const recipientPhone = normalizePhone(String(input.recipientPhone ?? "").trim())
  const message = String(input.message ?? "").trim().slice(0, 160)
  if (!recipientName && !recipientPhone && !message) return null
  if (!recipientName) {
    throw new AppError(StatusCodes.BAD_REQUEST, "GIFT_NAME_REQUIRED", "Add the name of the person receiving the gift")
  }
  if (!BD_MOBILE.test(recipientPhone)) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "GIFT_PHONE_INVALID",
      "Enter the receiver's Bangladeshi mobile number (01XXXXXXXXX)",
    )
  }
  return {
    isGift: true,
    recipientName,
    recipientPhone,
    message,
    senderName: String(sender.fullName ?? "").trim() || "Someone",
  }
}

/** A gift must be prepaid — the receiver never pays. */
export function assertGiftPayment(gift: OrderGift | null, paymentMethod: string) {
  if (gift && paymentMethod !== "Bkash") {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "GIFT_REQUIRES_ONLINE_PAYMENT",
      "Gifts must be paid online so the receiver pays nothing",
    )
  }
}

/** Who the rider/restaurant should call and hand the food to. */
export function deliveryContactOf(order: {
  gift?: Partial<OrderGift> | null
  customerSnapshot?: { name?: string; fullName?: string; phone?: string } | null
}) {
  if (order.gift?.isGift && order.gift.recipientPhone) {
    return {
      name: order.gift.recipientName || "Gift receiver",
      phone: order.gift.recipientPhone,
      isGift: true,
      giftFrom: order.gift.senderName ?? "",
      giftMessage: order.gift.message ?? "",
    }
  }
  return {
    name: order.customerSnapshot?.name ?? order.customerSnapshot?.fullName ?? "",
    phone: order.customerSnapshot?.phone ?? "",
    isGift: false,
    giftFrom: "",
    giftMessage: "",
  }
}
