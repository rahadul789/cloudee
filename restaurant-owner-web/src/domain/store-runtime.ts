import type { OpeningHoursSettings } from "@/components/hours/types"

const weekDays = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const

function formatTime(value: string) {
  const [hour, minute] = value.split(":").map(Number)
  const normalizedHour = ((hour + 11) % 12) + 1
  const meridiem = hour >= 12 ? "PM" : "AM"
  return `${normalizedHour}:${String(minute).padStart(2, "0")} ${meridiem}`
}

function slotEndMinutes(startTime: string, endTime: string) {
  const [startHour, startMinute] = startTime.split(":").map(Number)
  const [endHour, endMinute] = endTime.split(":").map(Number)
  const start = startHour * 60 + startMinute
  const end = endHour * 60 + endMinute
  return end <= start ? end + 24 * 60 : end
}

function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function isNowWithinSlot(nowMinutes: number, startTime: string, endTime: string) {
  const [startHour, startMinute] = startTime.split(":").map(Number)
  const [endHour, endMinute] = endTime.split(":").map(Number)
  const start = startHour * 60 + startMinute
  const rawEnd = endHour * 60 + endMinute
  const end = slotEndMinutes(startTime, endTime)
  const effectiveNow = rawEnd <= start && nowMinutes < start ? nowMinutes + 24 * 60 : nowMinutes

  return effectiveNow >= start && effectiveNow < end
}

export type StoreOperationalStatus = {
  isOpen: boolean
  title: "Open" | "Closed"
  subtitle: string
}

export function getStoreOperationalStatus(
  openingHours: OpeningHoursSettings,
  isOnline: boolean,
  now = new Date()
): StoreOperationalStatus {
  const dayIndex = (now.getDay() + 6) % 7
  const todayKey = weekDays[dayIndex]
  const today = openingHours.weeklySchedule.find((day) => day.day === todayKey)
  const todayException = openingHours.exceptions.find(
    (exception) => exception.date === formatDateKey(now)
  )
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  if (!isOnline) {
    return {
      isOpen: false,
      title: "Closed",
      subtitle: "Store is offline right now",
    }
  }

  if (openingHours.temporaryClosure.isPaused) {
    return {
      isOpen: false,
      title: "Closed",
      subtitle: openingHours.temporaryClosure.reason?.trim()
        ? openingHours.temporaryClosure.reason.trim()
        : "Store is temporarily paused",
    }
  }

  const scheduleForToday = todayException ?? today

  if (!scheduleForToday || !scheduleForToday.isOpen || scheduleForToday.timeSlots.length === 0) {
    return {
      isOpen: false,
      title: "Closed",
      subtitle: todayException
        ? "Closed today for a special schedule change"
        : "No schedule configured for today",
    }
  }

  const slot = scheduleForToday.timeSlots[0]
  const [endHour, endMinute] = slot.endTime.split(":").map(Number)
  const endMinutes = endHour * 60 + endMinute
  const isOpenNow = isNowWithinSlot(currentMinutes, slot.startTime, slot.endTime)

  if (isOpenNow) {
    return {
      isOpen: true,
      title: "Open",
      subtitle: `Closes at ${formatTime(slot.endTime)}${
        endMinutes <=
        Number(slot.startTime.split(":")[0]) * 60 +
          Number(slot.startTime.split(":")[1])
          ? " next day"
          : ""
      }`,
    }
  }

  return {
    isOpen: false,
    title: "Closed",
    subtitle: `Opens at ${formatTime(slot.startTime)}`,
  }
}
