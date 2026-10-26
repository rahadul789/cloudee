import { randomUUID } from "node:crypto"
import { Schema, model } from "mongoose"
import { StatusCodes } from "http-status-codes"
import { AppError } from "../../common/utils/app-error"
import { logger } from "../../config/logger"
import { emitSocketEvent } from "../../config/socket"
import { OpeningHoursModel, RestaurantModel } from "../auth/auth.model"
import { computeRestaurantAvailability } from "../customer/restaurant-availability"
import { invalidateCustomerRestaurantAvailabilityCaches } from "../customer/customer.service"
import { isRestaurantOrderingRestricted } from "../restaurant-enforcement"
import { getPlatformServiceHours } from "../public/content.service"
import { getServiceHoursOverrideForZone } from "../service-area/service-area.service"
import { resolveServiceHoursConfig } from "../service-area/service-hours"
import { syncRestaurantAvailabilitySession } from "./restaurant-availability-session.service"
import { OrderModel } from "./operational.model"
import { createAdminOperationalAlert } from "../admin/admin-alert.service"

const Lease = model("RestaurantAutomationLease", new Schema({
  _id: String, token: String, until: Date,
}))
const History = model("RestaurantAutomationHistory", new Schema({
  restaurantId: { type: String, required: true, index: true },
  isOnline: Boolean, reason: String, source: String,
  createdAt: { type: Date, default: Date.now, index: true },
}))

export function listRestaurantAutomationHistory(restaurantId: string) {
  return History.find({ restaurantId }).sort({ createdAt: -1 }).limit(100).lean()
}

export async function getLiveRestaurantAvailability(restaurant: Record<string, any>) {
  const [hours, platform, override] = await Promise.all([
    OpeningHoursModel.findOne({ restaurantId: restaurant._id }).lean(),
    getPlatformServiceHours(),
    getServiceHoursOverrideForZone(restaurant.serviceArea?.zoneId),
  ])
  return computeRestaurantAvailability({
    openingHours: hours,
    serviceHours: resolveServiceHoursConfig(override, platform),
    isOnline: restaurant.runtime?.isOnline === true,
    restricted: isRestaurantOrderingRestricted(restaurant),
  })
}

/** Deliberately outside cart pricing caches. Used again at checkout. */
export async function assertRestaurantAcceptingOrders(restaurantId: string) {
  const restaurant = await RestaurantModel.findById(restaurantId).lean()
  if (!restaurant || restaurant.runtime?.isVisible !== true || !(await getLiveRestaurantAvailability(restaurant)).isOpen) {
    throw new AppError(StatusCodes.CONFLICT, "RESTAURANT_OUTSIDE_SERVICE_HOURS", "This restaurant is closed right now. Please try again during opening hours.")
  }
}

export async function reconcileRestaurantAutomation(restaurantId: string, source: "system" | "admin" | "owner_app" | "owner_web" | "unknown" = "system") {
  const token = randomUUID()
  const now = new Date()
  let lease
  try {
    lease = await Lease.findOneAndUpdate({ _id: restaurantId, until: { $lte: now } },
      { $set: { token, until: new Date(now.getTime() + 60000) } }, { upsert: true, new: true })
  } catch (error: any) {
    if (error?.code === 11000) return // another process owns the lease
    throw error
  }
  if (!lease) return
  try {
    const hours = await OpeningHoursModel.findOne({ restaurantId, automationMode: "auto" }).lean()
    if (!hours) return
    const restaurant = await RestaurantModel.findById(restaurantId).lean()
    if (!restaurant) return
    const availability = await getLiveRestaurantAvailability(restaurant)
    const isOnline = restaurant.runtime?.isVisible === true && availability.isOpen
    // CAS protects a concurrent owner/admin update. The next cycle retries conflicts.
    const changed = await RestaurantModel.updateOne({ _id: restaurant._id, updatedAt: restaurant.updatedAt,
      "runtime.isOnline": { $ne: isOnline } }, {
      $set: { "runtime.isOnline": isOnline, "runtime.currentOperationalStatus": isOnline ? "open" : "closed" },
    })
    if (!changed.modifiedCount && (restaurant.runtime?.isOnline === true) !== isOnline) return
    // Session sync is idempotent and also repairs a previous partially completed cycle.
    const orders = await OrderModel.find({ restaurantId, status: { $in: ["New", "Accepted", "Preparing", "ReadyForPickup", "PickedUp"] } }).select("orderNumber").lean()
    await syncRestaurantAvailabilitySession({ restaurantId, ownerId: String(restaurant.ownerId ?? ""),
      isOnline, source, endReason: ["schedule", "service_window"].includes(availability.closedReason ?? "") ? "scheduled_close" : source === "admin" ? "admin_offline" : source === "system" ? "system" : "manual_offline", activeOrderCount: orders.length,
      activeOrderNumbers: orders.map((order) => String(order.orderNumber)) })
    if (!changed.modifiedCount) return
    invalidateCustomerRestaurantAvailabilityCaches()
    if (!isOnline && source !== "system" && orders.length > 0 && !["schedule", "service_window"].includes(availability.closedReason ?? "")) {
      await createAdminOperationalAlert({
        alertType: "restaurant_offline_active_orders", severity: "critical",
        title: `${restaurant.name} went offline with active orders`,
        description: `${orders.length} live orders may need admin follow-up.`,
        source: "Restaurants", entityType: "restaurant", entityId: restaurantId,
        path: `/restaurants?restaurantId=${restaurantId}`, iconKey: "store",
        dedupeKey: `restaurant:${restaurantId}:offline_active_orders`,
        metadata: { restaurantId, activeOrderCount: orders.length, orderNumbers: orders.map((order) => String(order.orderNumber)).slice(0, 20) },
      })
    }
    emitSocketEvent(`owner:${restaurant.ownerId}`, "store.updated", { restaurantId, type: "status_updated", isOnline })
    emitSocketEvent(`restaurant:${restaurantId}`, "store.updated", { restaurantId, type: "status_updated", isOnline })
    await History.create({ restaurantId, isOnline, reason: availability.closedReason ?? "scheduled_open", source })
  } finally {
    await Lease.deleteOne({ _id: restaurantId, token })
  }
}

let timer: NodeJS.Timeout | null = null
let running = false
export async function runRestaurantAutomationCycle() {
  if (running) return
  running = true
  try {
    const cursor = OpeningHoursModel.find({ automationMode: "auto" }).select("restaurantId").lean().cursor()
    for await (const hours of cursor) {
      try { await reconcileRestaurantAutomation(String(hours.restaurantId)) }
      catch (error) { logger.error({ error, restaurantId: hours.restaurantId }, "Restaurant automation failed") }
    }
  } finally { running = false }
}
export function startRestaurantAutomationScheduler() {
  if (timer) return
  const run = () => { void runRestaurantAutomationCycle().catch((error) => logger.error(error, "Restaurant automation cycle failed")) }
  run()
  timer = setInterval(run, 15000)
  timer.unref()
}
export function stopRestaurantAutomationScheduler() {
  if (timer) clearInterval(timer)
  timer = null
}
