// Delivery code = the last 4 digits of the order number (FB-<ms>-<4 random digits>).
// The customer already sees them in the app ("ID #…-4821"), so no customer-app change is
// needed. When the admin turns the code ON, every rider-facing surface (HTTP responses,
// socket events, push/in-app text) shows the order number as "FB-…-••••" so the rider
// can't simply type it in themselves. Pure + dependency-free (no circular imports).
//
// NOTE: this is a deterrent, not cryptographic proof — the number can also appear on a
// restaurant receipt/bag. A separate random code can replace it once the customer app
// shows one.

let deliveryCodeEnabled = false

/** Updated whenever platform content is (re)loaded. */
export function setDeliveryCodeEnabled(enabled: boolean) {
  deliveryCodeEnabled = enabled
}

export function isDeliveryCodeEnabled() {
  return deliveryCodeEnabled
}

const ORDER_NUMBER_PATTERN = /\b(FB-\d{6,}-)(\d{4})\b/g

/** The 4-digit code for an order ("" if the number has no 4-digit suffix). */
export function deliveryCodeFromOrderNumber(orderNumber: unknown): string {
  const match = /-(\d{4})$/.exec(String(orderNumber ?? "").trim())
  return match ? match[1] : ""
}

export function isDeliveryCodeCorrect(orderNumber: unknown, input: unknown) {
  const expected = deliveryCodeFromOrderNumber(orderNumber)
  const given = String(input ?? "").replace(/\D/g, "")
  return expected.length === 4 && given === expected
}

export function maskOrderNumberText(text: string) {
  return text.replace(ORDER_NUMBER_PATTERN, "$1••••")
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** Deep copy with order numbers masked. Non-plain objects (Date, ObjectId…) pass through. */
export function maskOrderNumbersDeep<T>(value: T): T {
  if (typeof value === "string") return maskOrderNumberText(value) as unknown as T
  if (Array.isArray(value)) return value.map((item) => maskOrderNumbersDeep(item)) as unknown as T
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) out[key] = maskOrderNumbersDeep(item)
    return out as T
  }
  return value
}

/** Rider-facing payload: masked only while the delivery code is ON. */
export function forRider<T>(value: T): T {
  return deliveryCodeEnabled ? maskOrderNumbersDeep(value) : value
}
