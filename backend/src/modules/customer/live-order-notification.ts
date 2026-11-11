// "Live order notification": every push about one order shares the same Android `tag` and
// iOS `collapseId`, so the phone REPLACES the previous one instead of stacking 5–7 separate
// notifications — the customer sees ONE notification that updates as the order moves.
// Pure (unit-tested); applied centrally in sendPushToCustomer.

/** Pushes that describe an order's progress (they share the order's live slot). */
const LIVE_ORDER_TYPES = new Set([
  "order_status",
  "rider_assigned",
  "rider_near",
  "rider_live_tracking",
])

const STEPS = ["Accepted", "Preparing", "ReadyForPickup", "PickedUp", "Delivered"] as const
const STEP_LABEL: Record<(typeof STEPS)[number], string> = {
  Accepted: "Confirmed",
  Preparing: "Preparing",
  ReadyForPickup: "Packed",
  PickedUp: "On the way",
  Delivered: "Delivered",
}

export function liveOrderSlotKey(type: string, orderId: unknown) {
  if (!LIVE_ORDER_TYPES.has(type)) return null
  const id = typeof orderId === "string" ? orderId.trim() : ""
  return id ? `order-${id}` : null
}

/** Which progress step a push represents (null = no progress line, e.g. cancelled). */
export function liveOrderStep(type: string, status?: unknown): (typeof STEPS)[number] | null {
  if (type === "rider_near" || type === "rider_live_tracking") return "PickedUp"
  if (type === "rider_assigned") return "ReadyForPickup"
  if (type === "order_status" && typeof status === "string") {
    return (STEPS as readonly string[]).includes(status) ? (status as (typeof STEPS)[number]) : null
  }
  return null
}

/** "●●●○○  On the way" */
export function liveOrderProgressLine(step: (typeof STEPS)[number]) {
  const index = STEPS.indexOf(step)
  const dots = STEPS.map((_, i) => (i <= index ? "●" : "○")).join("")
  return `${dots}  ${STEP_LABEL[step]}`
}

/** Decorates a live-order push: slot key + a progress line under the message. */
export function decorateLiveOrderPush(payload: {
  title: string
  body: string
  data?: Record<string, unknown>
}) {
  const type = String(payload.data?.type ?? "")
  const slot = liveOrderSlotKey(type, payload.data?.orderId)
  if (!slot) return { ...payload, slot: null as string | null }
  const step = liveOrderStep(type, payload.data?.status)
  const body = step ? `${payload.body}\n${liveOrderProgressLine(step)}` : payload.body
  return { ...payload, body, slot }
}

// ── How many pushes per order (anti-annoyance) ──
// The app's tracking screen shows every step live; the phone only needs to buzz when it
// matters. Typical order ⇒ 4 pushes: Accepted → On the way → Rider nearby → Delivered.
// Minor steps (Preparing, Packed, rider assigned, live tracking started) only buzz when
// nothing was sent for this order in the last 10 minutes (e.g. a slow kitchen).

/** Steps the customer always hears about. */
const CRITICAL = new Set(["Accepted", "PickedUp", "rider_near", "Delivered", "Cancelled", "Rejected"])
const TERMINAL = new Set(["Delivered", "Cancelled", "Rejected"])
export const LIVE_ORDER_QUIET_MS = 10 * 60 * 1000

/** "Accepted" / "rider_near" … — the identity of one live-order push. */
export function liveOrderEventKey(type: string, status?: unknown) {
  return type === "order_status" ? String(status ?? "") : type
}

export function shouldSendLiveOrderPush(params: {
  eventKey: string
  now: number
  last?: { at: number; eventKey: string } | null
}) {
  const { eventKey, now, last } = params
  if (eventKey === "New") return false // the customer just placed it — nothing to tell
  if (last && last.eventKey === eventKey) return false // never the same step twice
  if (CRITICAL.has(eventKey)) return true
  if (!last) return true // first word about this order
  return now - last.at >= LIVE_ORDER_QUIET_MS
}

// Last live push per order (single backend instance; cleared at the end of the order).
const lastLivePush = new Map<string, { at: number; eventKey: string }>()

/** Decide + record. Returns false when this push should be skipped. */
export function claimLiveOrderPush(orderId: string, eventKey: string, now = Date.now()) {
  const last = lastLivePush.get(orderId) ?? null
  if (!shouldSendLiveOrderPush({ eventKey, now, last })) return false
  if (TERMINAL.has(eventKey)) lastLivePush.delete(orderId)
  else {
    lastLivePush.set(orderId, { at: now, eventKey })
    if (lastLivePush.size > 5000) lastLivePush.delete(lastLivePush.keys().next().value as string)
  }
  return true
}
