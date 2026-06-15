import type { QueryClient, QueryKey } from "@tanstack/react-query"

import type {
  OwnerListResponse,
  OwnerOrderResponse,
} from "@/lib/backend-mappers"
import {
  historyOrderStatuses,
  liveOrderStatuses,
  orderStatusTimestampKey,
  type OrderStatus,
} from "@/components/orders/types"

const DHAKA_TIME_ZONE = "Asia/Dhaka"
const DHAKA_UTC_OFFSET = "+06:00"

type DateParts = {
  year: number
  month: number
  day: number
}

type OwnerOrderQueryParams = {
  tab?: "live" | "history"
  status?: string
  search?: string
  paymentMethod?: string
  sortBy?: string
  preset?: string
  from?: string
  to?: string
  dateBasis?: "created" | "history" | "activity"
  page?: number
  pageSize?: number
}

function getPlacedAt(order: OwnerOrderResponse) {
  return new Date(order.timestamps?.placedAt ?? 0).getTime()
}

function getHistoryTimestamp(order: OwnerOrderResponse) {
  const status = order.status as OrderStatus
  const timestampKey = orderStatusTimestampKey[status]
  if (!historyOrderStatuses.includes(status)) {
    return getPlacedAt(order)
  }

  return new Date(
    order.timestamps?.[status] ??
      order.timestamps?.[timestampKey] ??
      order.timestamps?.placedAt ??
      0
  ).getTime()
}

function getTotal(order: OwnerOrderResponse) {
  return (
    order.pricing?.restaurantNetSales ??
    Math.max(
      0,
      (order.pricing?.restaurantSubtotal ?? order.pricing?.subtotal ?? 0) -
        (order.pricing?.ownerDiscountCost ?? order.pricing?.ownerVisibleDiscount ?? 0)
    )
  )
}

function getDhakaDateParts(date: Date): DateParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: DHAKA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  const parts = formatter.formatToParts(date)
  const year = parts.find((part) => part.type === "year")?.value ?? "1970"
  const month = parts.find((part) => part.type === "month")?.value ?? "01"
  const day = parts.find((part) => part.type === "day")?.value ?? "01"

  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
  }
}

function parseDateOnlyParts(value?: string): DateParts | null {
  if (!value) return null
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  }
}

function shiftDateParts(parts: DateParts, offsetDays: number): DateParts {
  const anchor = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  anchor.setUTCDate(anchor.getUTCDate() + offsetDays)

  return {
    year: anchor.getUTCFullYear(),
    month: anchor.getUTCMonth() + 1,
    day: anchor.getUTCDate(),
  }
}

function getDatePartsWeekday(parts: DateParts) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
}

function buildDhakaDayRange(parts: DateParts) {
  const month = String(parts.month).padStart(2, "0")
  const day = String(parts.day).padStart(2, "0")
  const isoDate = `${parts.year}-${month}-${day}`

  return {
    start: new Date(`${isoDate}T00:00:00.000${DHAKA_UTC_OFFSET}`),
    end: new Date(`${isoDate}T23:59:59.999${DHAKA_UTC_OFFSET}`),
  }
}

function buildDateRange(params?: OwnerOrderQueryParams) {
  if (!params?.preset) return null

  const todayParts = getDhakaDateParts(new Date())

  switch (params.preset) {
    case "today":
      return buildDhakaDayRange(todayParts)
    case "yesterday":
      return buildDhakaDayRange(shiftDateParts(todayParts, -1))
    case "last7Days":
      return {
        start: buildDhakaDayRange(shiftDateParts(todayParts, -6)).start,
        end: buildDhakaDayRange(todayParts).end,
      }
    case "last30Days":
      return {
        start: buildDhakaDayRange(shiftDateParts(todayParts, -29)).start,
        end: buildDhakaDayRange(todayParts).end,
      }
    case "last90Days":
      return {
        start: buildDhakaDayRange(shiftDateParts(todayParts, -89)).start,
        end: buildDhakaDayRange(todayParts).end,
      }
    case "lastMonth": {
      const start = new Date(Date.UTC(todayParts.year, todayParts.month - 2, 1))
      const end = new Date(Date.UTC(todayParts.year, todayParts.month - 1, 0))
      return {
        start: buildDhakaDayRange({
          year: start.getUTCFullYear(),
          month: start.getUTCMonth() + 1,
          day: start.getUTCDate(),
        }).start,
        end: buildDhakaDayRange({
          year: end.getUTCFullYear(),
          month: end.getUTCMonth() + 1,
          day: end.getUTCDate(),
        }).end,
      }
    }
    case "lifetime":
      return null
    case "thisWeek": {
      const weekStartParts = shiftDateParts(todayParts, -getDatePartsWeekday(todayParts))
      return {
        start: buildDhakaDayRange(weekStartParts).start,
        end: buildDhakaDayRange(todayParts).end,
      }
    }
    case "thisMonth":
      return {
        start: buildDhakaDayRange({
          year: todayParts.year,
          month: todayParts.month,
          day: 1,
        }).start,
        end: buildDhakaDayRange(todayParts).end,
      }
    case "custom": {
      if (!params.from) return null
      const fromParts = parseDateOnlyParts(params.from)
      if (!fromParts) return null
      const toParts = parseDateOnlyParts(params.to ?? params.from) ?? fromParts
      return {
        start: buildDhakaDayRange(fromParts).start,
        end: buildDhakaDayRange(toParts).end,
      }
    }
    default:
      return null
  }
}

function matchesSearch(order: OwnerOrderResponse, search?: string) {
  if (!search) return true
  const normalized = search.trim().toLowerCase()
  if (!normalized) return true

  return [
    order.orderNumber,
    order.customerSnapshot?.fullName,
    order.customerSnapshot?.phone,
  ]
    .filter(Boolean)
    .some((value) => value!.toLowerCase().includes(normalized))
}

function matchesTabStatus(order: OwnerOrderResponse, params?: OwnerOrderQueryParams) {
  const status = order.status as OrderStatus

  if (params?.status) {
    return status === params.status
  }

  if (params?.tab === "live") {
    return liveOrderStatuses.includes(status)
  }

  if (params?.tab === "history") {
    return historyOrderStatuses.includes(status)
  }

  return true
}

function matchesDate(order: OwnerOrderResponse, params?: OwnerOrderQueryParams) {
  const range = buildDateRange(params)
  if (!range) return true

  const status = order.status as OrderStatus
  const placedAt = new Date(order.timestamps?.placedAt ?? 0)
  const historyAt = new Date(getHistoryTimestamp(order))
  const dateBasis =
    params?.dateBasis ??
    (params?.tab === "history" || historyOrderStatuses.includes(status)
      ? "history"
      : "created")

  if (dateBasis === "activity") {
    return (
      (placedAt >= range.start && placedAt <= range.end) ||
      (historyAt >= range.start && historyAt <= range.end)
    )
  }

  const effectiveDate = dateBasis === "history" ? historyAt : placedAt

  return effectiveDate >= range.start && effectiveDate <= range.end
}

function matchesOwnerOrderQuery(order: OwnerOrderResponse, params?: OwnerOrderQueryParams) {
  if (!matchesTabStatus(order, params)) return false
  if (params?.paymentMethod && order.paymentMethod !== params.paymentMethod) return false
  if (!matchesSearch(order, params?.search)) return false
  if (!matchesDate(order, params)) return false
  return true
}

function sortOwnerOrders(
  orders: OwnerOrderResponse[],
  sortBy?: string
) {
  return [...orders].sort((left, right) => {
    if (sortBy === "oldest") {
      return getPlacedAt(left) - getPlacedAt(right)
    }

    if (sortBy === "highestValue") {
      const totalDiff = getTotal(right) - getTotal(left)
      return totalDiff !== 0 ? totalDiff : getPlacedAt(right) - getPlacedAt(left)
    }

    return getPlacedAt(right) - getPlacedAt(left)
  })
}

function extractOwnerOrderQueryParams(queryKey: QueryKey) {
  if (!Array.isArray(queryKey) || queryKey.length < 3) return undefined
  const params = queryKey[2]
  return params && typeof params === "object"
    ? (params as OwnerOrderQueryParams)
    : undefined
}

function patchOwnerOrderListCache(
  current: unknown,
  payload: OwnerOrderResponse,
  params?: OwnerOrderQueryParams,
  options?: { paginated?: boolean }
) {
  if (
    !current ||
    typeof current !== "object" ||
    !("items" in (current as Record<string, unknown>))
  ) {
    return current
  }

  const result = current as OwnerListResponse<OwnerOrderResponse>
  const items = Array.isArray(result.items) ? result.items : []
  const exists = items.some((item) => item._id === payload._id)
  const matches = matchesOwnerOrderQuery(payload, params)
  const page = Math.max(1, params?.page ?? 1)
  const pageSize = Math.max(1, params?.pageSize ?? (items.length || 1))
  const isPaginated = options?.paginated ?? false

  let nextItems = items

  if (exists) {
    nextItems = matches
      ? items.map((item) => (item._id === payload._id ? payload : item))
      : items.filter((item) => item._id !== payload._id)
  } else if (matches && (!isPaginated || page === 1)) {
    nextItems = [payload, ...items]
  }

  nextItems = sortOwnerOrders(nextItems, params?.sortBy)

  if (isPaginated && page === 1 && nextItems.length > pageSize) {
    nextItems = nextItems.slice(0, pageSize)
  }

  const currentTotal = result.total ?? items.length
  let nextTotal = currentTotal

  if (!exists && matches) {
    nextTotal += 1
  } else if (exists && !matches) {
    nextTotal = Math.max(0, currentTotal - 1)
  }

  return {
    ...result,
    items: nextItems,
    total: nextTotal,
  } satisfies OwnerListResponse<OwnerOrderResponse>
}

export function patchOwnerOrderQueryCaches(
  queryClient: QueryClient,
  payload: OwnerOrderResponse
) {
  const queryCache = queryClient.getQueryCache()

  queryCache.findAll({ queryKey: ["owner", "orders"] }).forEach((query) => {
    const params = extractOwnerOrderQueryParams(query.queryKey)
    queryClient.setQueryData(query.queryKey, (current: unknown) =>
      patchOwnerOrderListCache(current, payload, params, { paginated: true })
    )
  })

  queryCache
    .findAll({ queryKey: ["owner", "analytics", "orders"] })
    .forEach((query) => {
      const params = extractOwnerOrderQueryParams(query.queryKey)
      queryClient.setQueryData(query.queryKey, (current: unknown) =>
        patchOwnerOrderListCache(current, payload, params, { paginated: false })
      )
    })
}
