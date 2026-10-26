jest.mock("../src/modules/owner/restaurant-automation.service", () => ({ reconcileRestaurantAutomation: jest.fn() }))
jest.mock("../src/modules/customer/customer.service", () => ({ invalidateCustomerRestaurantAvailabilityCaches: jest.fn() }))
jest.mock("../src/config/socket", () => ({ emitSocketEvent: jest.fn() }))
jest.mock("../src/modules/customer/push.service", () => ({ sendPushToCustomer: jest.fn() }))

import { OpeningHoursModel, OwnerModel, RestaurantModel } from "../src/modules/auth/auth.model"
import { updateOpeningHours, updateRestaurantStatus, setRestaurantAvailabilityByAdmin } from "../src/modules/owner/business.service"
import { reconcileRestaurantAutomation } from "../src/modules/owner/restaurant-automation.service"

describe("automation controls persist restaurant policy", () => {
  let hours: any
  let restaurant: any
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-21T15:00:00+06:00"))
    hours = { automationMode: "auto", adminPaused: false, timezone: "Asia/Dhaka",
      weeklySchedule: ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].map((day) => ({ day, isOpen: true, timeSlots: [{ startTime: "14:00", endTime: "21:30" }] })),
      exceptions: [], temporaryClosure: { isPaused: false }, save: jest.fn().mockResolvedValue(undefined), markModified: jest.fn() }
    restaurant = { id: "restaurant", _id: "restaurant", ownerId: "owner", runtime: { isOnline: true, isVisible: true },
      save: jest.fn().mockResolvedValue(undefined) }
    jest.spyOn(OwnerModel, "findById").mockResolvedValue({ activeRestaurantId: "restaurant", restaurantLifecycleStatus: "approved" } as any)
    jest.spyOn(RestaurantModel, "findById").mockResolvedValue(restaurant)
    jest.spyOn(OpeningHoursModel, "findOne").mockResolvedValue(hours)
    jest.spyOn(OpeningHoursModel, "findOneAndUpdate").mockResolvedValue(hours)
  })
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers() })

  it("saves auto mode and immediately reconciles the selected restaurant", async () => {
    hours.automationMode = "manual"
    await updateOpeningHours({ ownerId: "admin", restaurantId: "restaurant", automationMode: "auto" })
    expect(hours.automationMode).toBe("auto")
    expect(hours.save).toHaveBeenCalled()
    expect(reconcileRestaurantAutomation).toHaveBeenCalledWith("restaurant")
  })
  it("rejects automatic enrollment without a weekly schedule", async () => {
    hours.weeklySchedule = []
    await expect(updateOpeningHours({ ownerId: "admin", restaurantId: "restaurant", automationMode: "auto" })).rejects.toMatchObject({ code: "SCHEDULE_REQUIRED" })
    expect(hours.save).not.toHaveBeenCalled()
  })
  it("owner off persists a pause until the following opening", async () => {
    await updateRestaurantStatus({ ownerId: "owner", isOnline: false, source: "owner_web" })
    expect(hours.temporaryClosure).toMatchObject({ isPaused: true, mode: "shift", resumeAt: new Date("2026-07-22T14:00:00+06:00") })
    expect(reconcileRestaurantAutomation).toHaveBeenCalledWith("restaurant", "owner_web")
  })
  it("owner resume clears only the owner pause", async () => {
    hours.temporaryClosure = { isPaused: true, resumeAt: null }
    await updateRestaurantStatus({ ownerId: "owner", isOnline: true, source: "owner_web" })
    expect(hours.temporaryClosure.isPaused).toBe(false)
  })
  it("owner cannot remove an admin hold", async () => {
    hours.adminPaused = true
    await expect(updateRestaurantStatus({ ownerId: "owner", isOnline: true, source: "owner_web" })).rejects.toMatchObject({ code: "RESTAURANT_ADMIN_PAUSED" })
    expect(hours.adminPaused).toBe(true)
  })
  it("admin hold and release preserve an owner's independent pause", async () => {
    hours.temporaryClosure = { isPaused: true, resumeAt: null }
    await setRestaurantAvailabilityByAdmin({ restaurantId: "restaurant", isOnline: false })
    expect(hours.adminPaused).toBe(true)
    await setRestaurantAvailabilityByAdmin({ restaurantId: "restaurant", isOnline: true })
    expect(hours.adminPaused).toBe(false)
    expect(hours.temporaryClosure.isPaused).toBe(true)
  })
  it("normalizes full-day and indefinite pauses without retaining a stale expiry", async () => {
    await updateOpeningHours({ ownerId: "admin", restaurantId: "restaurant", temporaryClosure: { isPaused: true, mode: "fullDay" } })
    expect(hours.temporaryClosure.resumeAt).toEqual(new Date("2026-07-22T00:00:00+06:00"))
    await updateOpeningHours({ ownerId: "admin", restaurantId: "restaurant", temporaryClosure: { isPaused: true, mode: "indefinite" } })
    expect(hours.temporaryClosure.resumeAt).toBeNull()
  })
})
