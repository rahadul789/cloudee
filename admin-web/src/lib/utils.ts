import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Admin-wide time display: always 12-hour AM/PM, never 24-hour, and never seconds.
// Use these so every timestamp/timeline reads the same way across the panel.
const DATE_TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
  hour12: true,
})
const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
})

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

// Date + time, e.g. "1 Oct 2026, 7:05 PM".
export function formatDateTime(
  value: string | number | Date | null | undefined,
  fallback = "—",
) {
  const date = toDate(value)
  return date ? DATE_TIME_FORMAT.format(date) : fallback
}

// Time of day only, e.g. "7:05 PM".
export function formatTimeOfDay(
  value: string | number | Date | null | undefined,
  fallback = "—",
) {
  const date = toDate(value)
  return date ? TIME_FORMAT.format(date) : fallback
}
