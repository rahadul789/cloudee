import { Types } from "mongoose"

import { logger } from "../../config/logger"
import { getAreaServiceWindowForCoordinates } from "../customer/customer.service"
import { sendPushToCustomer } from "../customer/push.service"
import { OpenNotifyRequestModel } from "./open-notify.model"
import { buildOpenNotifyPush, planOpenNotify } from "./open-notify.rules"

function toStatus(row: { notifyAt?: Date | null; opensAtLabel?: string | null } | null) {
  return row
    ? {
        subscribed: true,
        notifyAt: row.notifyAt ? new Date(row.notifyAt).toISOString() : null,
        opensAtLabel: row.opensAtLabel || null,
      }
    : { subscribed: false, notifyAt: null, opensAtLabel: null }
}

export async function getOpenNotifyStatus(customerId: string) {
  const row = await OpenNotifyRequestModel.findOne({
    customerId: new Types.ObjectId(customerId),
    status: "pending",
  })
    .sort({ createdAt: -1 })
    .lean()
  return toStatus(row)
}

export async function subscribeOpenNotify(params: {
  customerId: string
  latitude: number
  longitude: number
}) {
  const window = await getAreaServiceWindowForCoordinates({
    latitude: params.latitude,
    longitude: params.longitude,
  })
  const plan = planOpenNotify(window)
  if (plan.kind !== "schedule") {
    return { ...toStatus(null), result: plan.kind }
  }
  // One pending request per customer — re-tapping just moves it to the new reopen time.
  const row = await OpenNotifyRequestModel.findOneAndUpdate(
    { customerId: new Types.ObjectId(params.customerId), status: "pending" },
    {
      $set: {
        zoneId: window.zoneId,
        latitude: params.latitude,
        longitude: params.longitude,
        notifyAt: plan.notifyAt,
        opensAtLabel: plan.opensAtLabel,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean()
  return { ...toStatus(row), result: "scheduled" as const }
}

export async function cancelOpenNotify(customerId: string) {
  await OpenNotifyRequestModel.updateMany(
    { customerId: new Types.ObjectId(customerId), status: "pending" },
    { $set: { status: "cancelled" } },
  )
  return toStatus(null)
}

/** Admin: how many people want to order while closed (the pre-order decision metric). */
export async function getOpenNotifyStats(days = 14) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const [pending, byDay, totals] = await Promise.all([
    OpenNotifyRequestModel.countDocuments({ status: "pending" }),
    OpenNotifyRequestModel.aggregate<{ _id: string; requests: number; customers: number }>([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Dhaka" } },
          requests: { $sum: 1 },
          customerSet: { $addToSet: "$customerId" },
        },
      },
      { $project: { requests: 1, customers: { $size: "$customerSet" } } },
      { $sort: { _id: 1 } },
    ]),
    OpenNotifyRequestModel.aggregate<{ _id: string; count: number }>([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ])
  const byStatus = Object.fromEntries(totals.map((row) => [row._id, row.count]))
  return {
    days,
    pending,
    requests: totals.reduce((sum, row) => sum + row.count, 0),
    sent: byStatus.sent ?? 0,
    cancelled: byStatus.cancelled ?? 0,
    byDay: byDay.map((row) => ({ date: row._id, requests: row.requests, customers: row.customers })),
  }
}

// ── Worker: send the "we're open" push when each area reopens ──
const CYCLE_MS = 60_000
let intervalHandle: ReturnType<typeof setInterval> | null = null
let running = false

export async function runOpenNotifyCycle(now = Date.now()) {
  if (running) return
  running = true
  try {
    const due = await OpenNotifyRequestModel.find({
      status: "pending",
      notifyAt: { $lte: new Date(now + 5_000) },
    })
      .sort({ notifyAt: 1 })
      .limit(500)
      .lean()
    const payload = buildOpenNotifyPush()
    for (const row of due) {
      // Claim first so a second instance/cycle can never double-send.
      const claimed = await OpenNotifyRequestModel.updateOne(
        { _id: row._id, status: "pending" },
        { $set: { status: "sent", sentAt: new Date(now) } },
      )
      if (!claimed.modifiedCount) continue
      await sendPushToCustomer({
        customerId: String(row.customerId),
        payload,
        zoneId: row.zoneId || undefined,
      }).catch(async (error) => {
        logger.warn({ err: error, requestId: String(row._id) }, "Open-notify push failed")
        await OpenNotifyRequestModel.updateOne({ _id: row._id }, { $set: { status: "failed" } })
      })
    }
  } catch (error) {
    logger.warn({ err: error }, "Open-notify cycle failed")
  } finally {
    running = false
  }
}

export function startOpenNotifyWorker() {
  if (intervalHandle) return
  intervalHandle = setInterval(() => void runOpenNotifyCycle(), CYCLE_MS)
}

export function stopOpenNotifyWorker() {
  if (intervalHandle) clearInterval(intervalHandle)
  intervalHandle = null
}
