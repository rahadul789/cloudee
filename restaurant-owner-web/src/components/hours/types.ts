export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday"

export type TimeSlot = {
  id: string
  startTime: string
  endTime: string
}

export type DaySchedule = {
  day: Weekday
  isOpen: boolean
  is24Hours: boolean
  timeSlots: TimeSlot[]
}

export type ScheduleException = {
  id: string
  date: string
  label?: string
  isOpen: boolean
  is24Hours: boolean
  timeSlots: TimeSlot[]
  note?: string
}

export type TemporaryClosure = {
  isPaused: boolean
  mode: "hours" | "fullDay" | null
  resumeAt?: string | null
  reason?: string
}

export type OpeningHoursSettings = {
  timezone: string
  weeklySchedule: DaySchedule[]
  exceptions: ScheduleException[]
  temporaryClosure: TemporaryClosure
  updatedAt: string
}

export const weekdayLabels: Record<Weekday, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
}

export const weekdayOrder: Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]

export function createTimeSlot(
  startTime = "10:00",
  endTime = "23:00"
): TimeSlot {
  return {
    id: `slot-${Math.random().toString(36).slice(2, 10)}`,
    startTime,
    endTime,
  }
}

export function createException(): ScheduleException {
  return {
    id: `exception-${Math.random().toString(36).slice(2, 10)}`,
    date: "",
    label: "",
    isOpen: false,
    is24Hours: false,
    timeSlots: [createTimeSlot()],
    note: "",
  }
}

export const initialOpeningHours: OpeningHoursSettings = {
  timezone: "Asia/Dhaka",
  weeklySchedule: [
    {
      day: "monday",
      isOpen: true,
      is24Hours: false,
      timeSlots: [createTimeSlot("10:00", "23:00")],
    },
    {
      day: "tuesday",
      isOpen: true,
      is24Hours: false,
      timeSlots: [createTimeSlot("10:00", "23:00")],
    },
    {
      day: "wednesday",
      isOpen: true,
      is24Hours: false,
      timeSlots: [createTimeSlot("10:00", "23:00")],
    },
    {
      day: "thursday",
      isOpen: true,
      is24Hours: false,
      timeSlots: [createTimeSlot("10:00", "23:00")],
    },
    {
      day: "friday",
      isOpen: true,
      is24Hours: false,
      timeSlots: [createTimeSlot("10:00", "23:00")],
    },
    {
      day: "saturday",
      isOpen: true,
      is24Hours: false,
      timeSlots: [createTimeSlot("10:00", "23:00")],
    },
    {
      day: "sunday",
      isOpen: true,
      is24Hours: false,
      timeSlots: [createTimeSlot("10:00", "23:00")],
    },
  ],
  exceptions: [
    {
      id: "exception-dec25",
      date: "2026-12-25",
      label: "Holiday closure",
      isOpen: false,
      is24Hours: false,
      timeSlots: [],
      note: "Closed for holiday operations.",
    },
    {
      id: "exception-dec31",
      date: "2026-12-31",
      label: "New Year extended hours",
      isOpen: true,
      is24Hours: false,
      timeSlots: [
        {
          id: "slot-nye",
          startTime: "18:00",
          endTime: "02:00",
        },
      ],
      note: "Special late-night service.",
    },
  ],
  temporaryClosure: {
    isPaused: false,
    mode: null,
    resumeAt: null,
    reason: "",
  },
  updatedAt: "2026-04-11T10:00:00.000Z",
}
