import { z } from "zod"

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
const slot = z.object({ id: z.string().optional(), startTime: time, endTime: time })
const day = z.object({
  isOpen: z.boolean(),
  is24Hours: z.boolean().optional(),
  timeSlots: z.array(slot).max(12).default([]),
}).passthrough().superRefine((value, ctx) => {
  if (!value.isOpen || value.is24Hours) return
  if (!value.timeSlots.length) ctx.addIssue({ code: "custom", message: "Open days need a time slot" })
  const minutes = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3))
  const spans = value.timeSlots.map((v) => {
    const start = minutes(v.startTime), end = minutes(v.endTime)
    return [start, end <= start ? end + 1440 : end]
  }).sort((a, b) => a[0] - b[0])
  for (let i = 1; i < spans.length; i++) {
    if (spans[i][0] < spans[i - 1][1]) ctx.addIssue({ code: "custom", message: "Time slots cannot overlap" })
  }
})

export const openingHoursUpdateSchema = z.object({
  timezone: z.literal("Asia/Dhaka").optional(),
  automationMode: z.enum(["manual", "auto"]).optional(),
  weeklySchedule: z.array(day.and(z.object({ day: z.enum(["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]) }))).max(7)
    .refine((rows) => new Set(rows.map((r) => r.day)).size === rows.length, "Duplicate weekdays").optional(),
  exceptions: z.array(day.and(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, "Invalid date") }))).max(366)
    .refine((rows) => new Set(rows.map((r) => r.date)).size === rows.length, "Duplicate exception dates").optional(),
  temporaryClosure: z.object({
    isPaused: z.boolean().optional(),
    mode: z.enum(["hours", "fullDay", "shift", "indefinite"]).nullable().optional(),
    resumeAt: z.string().datetime({ offset: true }).nullable().optional(),
    reason: z.string().max(500).optional(),
  }).optional(),
})
