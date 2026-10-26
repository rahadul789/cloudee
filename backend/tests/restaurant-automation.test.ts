import { computeRestaurantAvailability, evaluateSchedule, type OpeningHoursInput } from "../src/modules/customer/restaurant-availability"
import { openingHoursUpdateSchema } from "../src/modules/owner/opening-hours.validation"

const at = (time: string, day = "2026-07-21") => new Date(`${day}T${time}:00+06:00`)
const weeklySchedule = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].map((day) => ({
  day, isOpen: true, timeSlots: [{ startTime: "14:00", endTime: "21:30" }],
}))
const base = { automationMode: "auto" as const, weeklySchedule, exceptions: [] }
const service = { enabled: true, openMinute: 720, closeMinute: 1380, timezone: "Asia/Dhaka" }
const check = (time: string, hours: OpeningHoursInput = base, config = service, day?: string) => computeRestaurantAvailability({
  serviceHours: config, openingHours: hours, isOnline: false, restricted: false, now: at(time, day),
})

describe("restaurant schedule automation", () => {
  it("opens exactly at 2pm without relying on the stored online flag and closes at 9:30pm", () => {
    expect(check("13:59").isOpen).toBe(false)
    expect(check("14:00").isOpen).toBe(true)
    expect(check("21:29").closesAtEpochMs).toBe(at("21:30").getTime())
    expect(check("21:30").isOpen).toBe(false)
  })
  it("uses the intersection for countdowns before the platform opens", () => {
    expect(check("10:00").opensAtEpochMs).toBe(at("14:00").getTime())
    expect(check("20:59", base, { ...service, closeMinute: 1260 }).closesAtEpochMs).toBe(at("21:00").getTime())
    expect(check("21:00", base, { ...service, closeMinute: 1260 }).isOpen).toBe(false)
  })
  it("does not promise an opening when the schedules never overlap", () => {
    expect(check("10:00", base, { ...service, closeMinute: 780 }).opensAtEpochMs).toBeNull()
  })
  it("honours timed pauses and resumes exactly at expiry within the schedule", () => {
    const paused = { ...base, temporaryClosure: { isPaused: true, resumeAt: at("16:00") } }
    expect(check("15:00", paused)).toMatchObject({ isOpen: false, closedReason: "owner_busy", opensAtEpochMs: at("16:00").getTime() })
    expect(check("16:00", paused).isOpen).toBe(true)
  })
  it("does not open at pause expiry outside restaurant hours", () => {
    const paused = { ...base, temporaryClosure: { isPaused: true, resumeAt: at("23:00") } }
    expect(check("15:00", paused).opensAtEpochMs).toBe(at("14:00", "2026-07-22").getTime())
  })
  it("keeps indefinite pauses and admin holds closed", () => {
    expect(check("15:00", { ...base, temporaryClosure: { isPaused: true } }).opensAtEpochMs).toBeNull()
    expect(check("15:00", { ...base, adminPaused: true })).toMatchObject({ isOpen: false, closedReason: "restricted" })
  })
  it("restrictions win over automatic opening", () => {
    expect(computeRestaurantAvailability({ serviceHours: service, openingHours: base, isOnline: true, restricted: true, now: at("15:00") }).isOpen).toBe(false)
  })
  it("handles yesterday's overnight shift even when today is a weekly day off", () => {
    const overnight = { ...base, weeklySchedule: [{ day: "monday", isOpen: true, timeSlots: [{ startTime: "20:00", endTime: "02:00" }] }] }
    expect(check("01:00", overnight, { ...service, enabled: false }).isOpen).toBe(true)
    expect(check("02:00", overnight, { ...service, enabled: false }).isOpen).toBe(false)
    expect(evaluateSchedule(overnight, at("01:00")).openNow).toBe(true)
  })
  it("a date exception closes the whole calendar date including overnight carry", () => {
    const overnight = { ...base, weeklySchedule: [{ day: "monday", isOpen: true, timeSlots: [{ startTime: "20:00", endTime: "02:00" }] }], exceptions: [{ date: "2026-07-21", isOpen: false }] }
    expect(check("01:00", overnight, { ...service, enabled: false }).isOpen).toBe(false)
  })
  it("supports split shifts, exceptions and overnight platform hours", () => {
    const hours = { ...base, exceptions: [{ date: "2026-07-21", isOpen: true, timeSlots: [{ startTime: "12:00", endTime: "15:00" }, { startTime: "17:00", endTime: "23:00" }] }] }
    expect(check("16:00", hours).opensAtEpochMs).toBe(at("17:00").getTime())
    expect(check("22:00", hours, { ...service, openMinute: 1200, closeMinute: 120 }).isOpen).toBe(true)
  })
  it("keeps manual legacy behaviour and treats missing auto schedules as closed", () => {
    expect(check("15:00", { ...base, automationMode: "manual" }).isOpen).toBe(false)
    expect(check("15:00", { automationMode: "auto" }).isOpen).toBe(false)
  })
  it("supports 24 hour days without inventing a daily closing countdown", () => {
    const hours = { ...base, weeklySchedule: weeklySchedule.map((d) => ({ ...d, is24Hours: true })) }
    expect(check("15:00", hours, { ...service, enabled: false })).toMatchObject({ isOpen: true, closesAtEpochMs: null })
  })
})

describe("schedule validation", () => {
  it("accepts overnight times and existing UI metadata", () => {
    expect(openingHoursUpdateSchema.safeParse({ automationMode: "auto", weeklySchedule, exceptions: [{ id: "special", date: "2026-12-25", isOpen: false, label: "Holiday" }] }).success).toBe(true)
  })
  it.each(["25:00", "12:60", "bad"])("rejects invalid time %s", (startTime) => {
    expect(openingHoursUpdateSchema.safeParse({ weeklySchedule: [{ day: "monday", isOpen: true, timeSlots: [{ startTime, endTime: "22:00" }] }] }).success).toBe(false)
  })
  it("rejects duplicate weekdays, invalid dates, overlaps and unsupported timezones", () => {
    expect(openingHoursUpdateSchema.safeParse({ weeklySchedule: [weeklySchedule[0], weeklySchedule[0]] }).success).toBe(false)
    expect(openingHoursUpdateSchema.safeParse({ timezone: "UTC" }).success).toBe(false)
    expect(openingHoursUpdateSchema.safeParse({ exceptions: [{ date: "2026-02-30", isOpen: false }] }).success).toBe(false)
    expect(openingHoursUpdateSchema.safeParse({ weeklySchedule: [{ day: "monday", isOpen: true, timeSlots: [{ startTime: "12:00", endTime: "16:00" }, { startTime: "15:00", endTime: "18:00" }] }] }).success).toBe(false)
  })
})
