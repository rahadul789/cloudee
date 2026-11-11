// Pure rider↔customer chat rules (no DB/socket imports) — unit-tested.

export type ChatRole = "customer" | "rider"

// Chat opens once a rider is assigned and stays writable until the order is finished.
// After that the thread is read-only (history stays visible to both sides + admin).
export const CHAT_OPEN_STATUSES = new Set(["Accepted", "Preparing", "ReadyForPickup", "PickedUp"])
export const CHAT_MAX_LENGTH = 500
const SEND_WINDOW_MS = 60_000
const SEND_LIMIT_PER_WINDOW = 20
const PUSH_COALESCE_MS = 45_000

export function normalizeChatText(raw: unknown) {
  return String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, CHAT_MAX_LENGTH)
}

export function getChatAvailability(order: { status: string; riderId: string }) {
  if (!order.riderId) return { canSend: false, closedReason: "no_rider" as const }
  if (!CHAT_OPEN_STATUSES.has(order.status)) {
    return { canSend: false, closedReason: "order_finished" as const }
  }
  return { canSend: true, closedReason: null }
}

// Sliding-window send limiter (per sender). In-memory is fine: it only guards against spam
// bursts; a multi-instance deployment just gets a per-instance budget.
const sendLog = new Map<string, number[]>()
export function consumeChatSendBudget(senderId: string, now = Date.now()) {
  const recent = (sendLog.get(senderId) ?? []).filter((at) => now - at < SEND_WINDOW_MS)
  if (recent.length >= SEND_LIMIT_PER_WINDOW) {
    sendLog.set(senderId, recent)
    return false
  }
  recent.push(now)
  sendLog.set(senderId, recent)
  return true
}

const lastPushAt = new Map<string, number>()
export function shouldSendChatPush(key: string, now = Date.now()) {
  const last = lastPushAt.get(key)
  if (last !== undefined && now - last < PUSH_COALESCE_MS) return false
  lastPushAt.set(key, now)
  return true
}

