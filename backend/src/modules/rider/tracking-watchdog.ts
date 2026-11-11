import { logger } from "../../config/logger"
import { OrderModel } from "../owner/operational.model"
import { sendPushToRider } from "./push.service"

// Live-tracking watchdog. Android OEM battery savers (Samsung/Xiaomi…) can silently stop a
// rider's background location while the phone is locked; the app can only self-heal when
// it is opened. So when a picked-up order has had no rider location for STALE_MS, nudge the
// rider with a high-priority push — tapping it brings the app to the foreground, which
// restarts the location service, and the customer's map goes live again.
const CYCLE_MS = 60_000
export const TRACKING_STALE_MS = 90_000
export const TRACKING_NUDGE_EVERY_MS = 5 * 60_000

let intervalHandle: ReturnType<typeof setInterval> | null = null
let running = false
const lastNudgeAt = new Map<string, number>()

/** One nudge per order per 5 minutes (pure; exported for tests). */
export function shouldNudgeStaleTracking(orderId: string, now = Date.now()) {
  const last = lastNudgeAt.get(orderId)
  if (last !== undefined && now - last < TRACKING_NUDGE_EVERY_MS) return false
  lastNudgeAt.set(orderId, now)
  return true
}

export async function runTrackingWatchdogCycle(now = Date.now()) {
  if (running) return
  running = true
  try {
    const cutoff = new Date(now - TRACKING_STALE_MS)
    const staleOrders = await OrderModel.find({
      status: "PickedUp",
      riderId: { $ne: null },
      // give a fresh pickup time to send its first fix
      "timestamps.PickedUp": { $lt: cutoff },
      $or: [
        { "riderTracking.lastUpdatedAt": { $lt: cutoff } },
        { "riderTracking.lastUpdatedAt": null },
      ],
    })
      .select("_id orderNumber riderId")
      .limit(200)
      .lean<Array<Record<string, any>>>()

    const liveIds = new Set(staleOrders.map((order) => String(order._id)))
    for (const key of lastNudgeAt.keys()) if (!liveIds.has(key)) lastNudgeAt.delete(key)

    for (const order of staleOrders) {
      const orderId = String(order._id)
      if (!shouldNudgeStaleTracking(orderId, now)) continue
      await sendPushToRider({
        riderId: String(order.riderId),
        payload: {
          title: "লাইভ লোকেশন বন্ধ হয়ে গেছে",
          body: `অর্ডার #${order.orderNumber ?? ""} — গ্রাহক আপনার লোকেশন দেখতে পাচ্ছেন না। অ্যাপটি একবার খুলুন, লোকেশন আবার চালু হবে।`,
          data: { type: "tracking_resume", orderId },
          channelId: "delivery-late",
        },
      }).catch((error) =>
        logger.warn({ err: error, orderId }, "Tracking watchdog push failed"),
      )
    }
  } catch (error) {
    logger.warn({ err: error }, "Tracking watchdog cycle failed")
  } finally {
    running = false
  }
}

export function startTrackingWatchdog() {
  if (intervalHandle) return
  intervalHandle = setInterval(() => void runTrackingWatchdogCycle(), CYCLE_MS)
}

export function stopTrackingWatchdog() {
  if (intervalHandle) clearInterval(intervalHandle)
  intervalHandle = null
}
