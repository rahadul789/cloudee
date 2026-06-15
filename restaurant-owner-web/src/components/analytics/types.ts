export type AnalyticsGranularity = "daily" | "weekly" | "monthly"

export type AnalyticsOrderTypeFilter = "all" | "delivery" | "pickup"

export type AnalyticsPaymentFilter = "all" | "Cash" | "Bkash"

export type AnalyticsKpi = {
  key:
    | "orders"
    | "revenue"
    | "net"
    | "aov"
    | "customers"
    | "repeat"
  label: string
  value: string
  comparisonLabel: string
  trendPercent: number | null
  direction: "up" | "down" | "flat"
}

export type RevenueSeriesPoint = {
  label: string
  gross: number
  net: number
}

export type OrderSeriesPoint = {
  label: string
  orders: number
}

export type MenuPerformanceRow = {
  name: string
  categoryName: string
  quantitySold: number
  revenue: number
}

export type CategoryPerformanceRow = {
  name: string
  orders: number
  revenue: number
}

export type TopCustomerRow = {
  name: string
  orders: number
  revenue: number
}
