export function formatTime12Hour(value: string) {
  const [hourText = "0", minuteText = "00"] = value.split(":")
  const hour = Number(hourText)
  const minute = Number(minuteText)

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return value
  }

  const suffix = hour >= 12 ? "PM" : "AM"
  const normalizedHour = hour % 12 || 12

  return `${normalizedHour}:${String(minute).padStart(2, "0")} ${suffix}`
}

export function formatHourLabel12(hour: number) {
  const safeHour = ((hour % 24) + 24) % 24
  return formatTime12Hour(`${String(safeHour).padStart(2, "0")}:00`)
}
