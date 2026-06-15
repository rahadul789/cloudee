const DHAKA_TIME_ZONE = "Asia/Dhaka"
const DHAKA_UTC_OFFSET = "+06:00"

type DateParts = {
  year: number
  month: number
  day: number
}

export type OwnerDateRange = {
  start: Date
  end: Date
}

function getDhakaDateParts(date: Date): DateParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: DHAKA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
  const parts = formatter.formatToParts(date)
  const year = parts.find((part) => part.type === "year")?.value ?? "1970"
  const month = parts.find((part) => part.type === "month")?.value ?? "01"
  const day = parts.find((part) => part.type === "day")?.value ?? "01"

  return {
    year: Number(year),
    month: Number(month),
    day: Number(day)
  }
}

function parseDateOnlyParts(value?: string): DateParts | null {
  if (!value) return null
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    const parsedDate = new Date(value)
    return Number.isNaN(parsedDate.getTime()) ? null : getDhakaDateParts(parsedDate)
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  }
}

function shiftDateParts(parts: DateParts, offsetDays: number): DateParts {
  const anchor = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  anchor.setUTCDate(anchor.getUTCDate() + offsetDays)

  return {
    year: anchor.getUTCFullYear(),
    month: anchor.getUTCMonth() + 1,
    day: anchor.getUTCDate()
  }
}

function getDatePartsWeekday(parts: DateParts) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
}

function buildDhakaDayRange(parts: DateParts): OwnerDateRange {
  const month = String(parts.month).padStart(2, "0")
  const day = String(parts.day).padStart(2, "0")
  const isoDate = `${parts.year}-${month}-${day}`

  return {
    start: new Date(`${isoDate}T00:00:00.000${DHAKA_UTC_OFFSET}`),
    end: new Date(`${isoDate}T23:59:59.999${DHAKA_UTC_OFFSET}`)
  }
}

export function buildDhakaPresetRange(params: {
  preset?: string
  from?: string
  to?: string
}): OwnerDateRange | null {
  if (!params.preset) return null

  const todayParts = getDhakaDateParts(new Date())

  switch (params.preset) {
    case "today":
      return buildDhakaDayRange(todayParts)
    case "yesterday":
      return buildDhakaDayRange(shiftDateParts(todayParts, -1))
    case "last7Days":
      return {
        start: buildDhakaDayRange(shiftDateParts(todayParts, -6)).start,
        end: buildDhakaDayRange(todayParts).end
      }
    case "last30Days":
      return {
        start: buildDhakaDayRange(shiftDateParts(todayParts, -29)).start,
        end: buildDhakaDayRange(todayParts).end
      }
    case "last90Days":
      return {
        start: buildDhakaDayRange(shiftDateParts(todayParts, -89)).start,
        end: buildDhakaDayRange(todayParts).end
      }
    case "lastMonth": {
      const start = new Date(Date.UTC(todayParts.year, todayParts.month - 2, 1))
      const end = new Date(Date.UTC(todayParts.year, todayParts.month - 1, 0))
      return {
        start: buildDhakaDayRange({
          year: start.getUTCFullYear(),
          month: start.getUTCMonth() + 1,
          day: start.getUTCDate()
        }).start,
        end: buildDhakaDayRange({
          year: end.getUTCFullYear(),
          month: end.getUTCMonth() + 1,
          day: end.getUTCDate()
        }).end
      }
    }
    case "lifetime":
      return null
    case "thisWeek": {
      const weekStartParts = shiftDateParts(todayParts, -getDatePartsWeekday(todayParts))
      return {
        start: buildDhakaDayRange(weekStartParts).start,
        end: buildDhakaDayRange(todayParts).end
      }
    }
    case "thisMonth":
      return {
        start: buildDhakaDayRange({
          year: todayParts.year,
          month: todayParts.month,
          day: 1
        }).start,
        end: buildDhakaDayRange(todayParts).end
      }
    case "custom": {
      const fromParts = parseDateOnlyParts(params.from)
      if (!fromParts) return null
      const toParts = parseDateOnlyParts(params.to ?? params.from) ?? fromParts
      return {
        start: buildDhakaDayRange(fromParts).start,
        end: buildDhakaDayRange(toParts).end
      }
    }
    default:
      return null
  }
}

export function buildDhakaTodayRange() {
  return buildDhakaDayRange(getDhakaDateParts(new Date()))
}

export function buildPreviousRange(range: OwnerDateRange): OwnerDateRange {
  return {
    start: new Date(range.start.getTime() - (range.end.getTime() - range.start.getTime() + 1)),
    end: new Date(range.start.getTime() - 1)
  }
}
