jest.mock("../src/modules/customer/customer.service", () => ({ invalidateCustomerRestaurantAvailabilityCaches: jest.fn() }))
jest.mock("../src/config/socket", () => ({ emitSocketEvent: jest.fn() }))
jest.mock("../src/modules/public/content.service", () => ({ getPlatformServiceHours: jest.fn(async () => ({ enabled: true, openMinute: 720, closeMinute: 1380, timezone: "Asia/Dhaka" })) }))
jest.mock("../src/modules/service-area/service-area.service", () => ({ getServiceHoursOverrideForZone: jest.fn(async () => null) }))
jest.mock("../src/modules/owner/restaurant-availability-session.service", () => ({ syncRestaurantAvailabilitySession: jest.fn() }))
jest.mock("../src/modules/admin/admin-alert.service", () => ({ createAdminOperationalAlert: jest.fn() }))

import mongoose from "mongoose"
import { OpeningHoursModel, RestaurantModel } from "../src/modules/auth/auth.model"
import { OrderModel } from "../src/modules/owner/operational.model"
import { assertRestaurantAcceptingOrders, reconcileRestaurantAutomation } from "../src/modules/owner/restaurant-automation.service"
import { syncRestaurantAvailabilitySession } from "../src/modules/owner/restaurant-availability-session.service"
import { invalidateCustomerRestaurantAvailabilityCaches } from "../src/modules/customer/customer.service"
import { createAdminOperationalAlert } from "../src/modules/admin/admin-alert.service"

describe("restaurant automation reconciliation and checkout guard", () => {
  let hours: any, restaurant: any
  const Lease = mongoose.model("RestaurantAutomationLease")
  const History = mongoose.model("RestaurantAutomationHistory")
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-21T15:00:00+06:00"))
    hours = { automationMode: "auto", weeklySchedule: [{ day: "tuesday", isOpen: true, timeSlots: [{ startTime: "14:00", endTime: "21:30" }] }] }
    restaurant = { _id: "restaurant", ownerId: "owner", updatedAt: new Date(), runtime: { isOnline: false, isVisible: true } }
    jest.spyOn(OpeningHoursModel, "findOne").mockImplementation(((filter: any) => ({ lean: async () => filter.automationMode && hours.automationMode !== "auto" ? null : hours })) as any)
    jest.spyOn(RestaurantModel, "findById").mockReturnValue({ lean: async () => restaurant } as any)
    jest.spyOn(RestaurantModel, "updateOne").mockResolvedValue({ modifiedCount: 1 } as any)
    jest.spyOn(OrderModel, "find").mockReturnValue({ select: () => ({ lean: async () => [{ orderNumber: "FB-1" }] }) } as any)
    jest.spyOn(Lease, "findOneAndUpdate").mockResolvedValue({ token: "claimed" } as any)
    jest.spyOn(Lease, "deleteOne").mockResolvedValue({ deletedCount: 1 } as any)
    jest.spyOn(History, "create").mockResolvedValue({} as never)
  })
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers() })

  it("allows an auto opening even when a delayed worker left the stored flag offline", async () => {
    await expect(assertRestaurantAcceptingOrders("restaurant")).resolves.toBeUndefined()
  })
  it("rejects closed schedules even if the stored flag says online", async () => {
    restaurant.runtime.isOnline = true
    jest.setSystemTime(new Date("2026-07-21T21:30:00+06:00"))
    await expect(assertRestaurantAcceptingOrders("restaurant")).rejects.toMatchObject({ code: "RESTAURANT_OUTSIDE_SERVICE_HOURS" })
  })
  it("keeps manual offline and hidden restaurants unavailable", async () => {
    hours.automationMode = "manual"
    await expect(assertRestaurantAcceptingOrders("restaurant")).rejects.toMatchObject({ code: "RESTAURANT_OUTSIDE_SERVICE_HOURS" })
    hours.automationMode = "auto"
    restaurant.runtime.isVisible = false
    await expect(assertRestaurantAcceptingOrders("restaurant")).rejects.toMatchObject({ code: "RESTAURANT_OUTSIDE_SERVICE_HOURS" })
  })
  it("reconciles missed openings after restart, records a session and invalidates caches", async () => {
    await reconcileRestaurantAutomation("restaurant")
    expect(RestaurantModel.updateOne).toHaveBeenCalledWith(expect.objectContaining({ updatedAt: restaurant.updatedAt }), expect.objectContaining({ $set: expect.objectContaining({ "runtime.isOnline": true }) }))
    expect(syncRestaurantAvailabilitySession).toHaveBeenCalledWith(expect.objectContaining({ isOnline: true, source: "system", activeOrderCount: 1 }))
    expect(invalidateCustomerRestaurantAvailabilityCaches).toHaveBeenCalled()
    expect(History.create).toHaveBeenCalledWith(expect.objectContaining({ isOnline: true, reason: "scheduled_open" }))
    expect(Lease.deleteOne).toHaveBeenCalledWith(expect.objectContaining({ _id: "restaurant", token: expect.any(String) }))
  })
  it("marks scheduled closing with active orders without changing those orders", async () => {
    restaurant.runtime.isOnline = true
    jest.setSystemTime(new Date("2026-07-21T21:30:00+06:00"))
    await reconcileRestaurantAutomation("restaurant")
    expect(syncRestaurantAvailabilitySession).toHaveBeenCalledWith(expect.objectContaining({ isOnline: false, endReason: "scheduled_close", activeOrderNumbers: ["FB-1"] }))
    expect(createAdminOperationalAlert).not.toHaveBeenCalled()
  })
  it("retains the active-order alert for an unscheduled manual pause", async () => {
    restaurant.runtime.isOnline = true
    hours.temporaryClosure = { isPaused: true, resumeAt: null }
    await reconcileRestaurantAutomation("restaurant", "owner_web")
    expect(createAdminOperationalAlert).toHaveBeenCalledWith(expect.objectContaining({ alertType: "restaurant_offline_active_orders", severity: "critical" }))
    expect(syncRestaurantAvailabilitySession).toHaveBeenCalledWith(expect.objectContaining({ source: "owner_web", endReason: "manual_offline" }))
  })
  it("a second backend cannot process a restaurant with an active lease", async () => {
    jest.mocked(Lease.findOneAndUpdate).mockRejectedValue({ code: 11000 })
    await reconcileRestaurantAutomation("restaurant")
    expect(RestaurantModel.updateOne).not.toHaveBeenCalled()
    expect(Lease.deleteOne).not.toHaveBeenCalled()
  })
  it("a CAS conflict does not write a conflicting availability session", async () => {
    jest.mocked(RestaurantModel.updateOne).mockResolvedValue({ modifiedCount: 0 } as any)
    await reconcileRestaurantAutomation("restaurant")
    expect(syncRestaurantAvailabilitySession).not.toHaveBeenCalled()
  })
  it("an unchanged runtime repairs sessions without duplicate transition events", async () => {
    restaurant.runtime.isOnline = true
    jest.mocked(RestaurantModel.updateOne).mockResolvedValue({ modifiedCount: 0 } as any)
    await reconcileRestaurantAutomation("restaurant")
    expect(syncRestaurantAvailabilitySession).toHaveBeenCalled()
    expect(History.create).not.toHaveBeenCalled()
  })
  it("manual restaurants are not enrolled by reconciliation", async () => {
    hours.automationMode = "manual"
    await reconcileRestaurantAutomation("restaurant")
    expect(RestaurantModel.updateOne).not.toHaveBeenCalled()
  })
})
