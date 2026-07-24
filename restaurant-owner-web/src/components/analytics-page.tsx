import * as React from "react"

import {
  format,
  isWithinInterval,
  startOfWeek,
} from "date-fns"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  BadgeDollarSign,
  BarChart3,
  CreditCard,
  RotateCcw,
  Repeat2,
  ShoppingBag,
  Star,
  Tag,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react"

import {
  type AnalyticsGranularity,
  type AnalyticsKpi,
  type AnalyticsOrderTypeFilter,
  type AnalyticsPaymentFilter,
  type MenuPerformanceRow,
  type OrderSeriesPoint,
  type TopCustomerRow,
} from "@/components/analytics/types"
import { useCategories } from "@/components/categories/categories-context"
import { useMenuItems } from "@/components/menu/menu-items-context"
import {
  defaultOrderDateFilter,
  getOrderDateFilterInterval,
  getPreviousOrderDateFilterInterval,
  OrderDateFilter,
  type OrderDateFilterValue,
} from "@/components/orders/order-date-filter"
import { useOrders } from "@/components/orders/orders-context"
import { orderStatusLabels, type Order } from "@/components/orders/types"
import { usePayouts } from "@/components/payouts/payouts-context"
import { usePromotions } from "@/components/promotions/promotions-context"
import { useReviews } from "@/components/reviews/reviews-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { calculateEarningsSummary } from "@/domain/financials"
import { formatHourLabel12 } from "@/lib/time"
import { useOwnerAnalyticsOverviewQuery } from "@/hooks/use-owner-api"
import { useAppStore } from "@/store/app-store"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const pageSizeOptions = [5, 10, 15]

function AnalyticsSkeleton() {
  return (
    <div className="space-y-4 px-4 lg:px-6">
      <div className="rounded-2xl border bg-card p-4">
        <div className="grid gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-10 rounded-xl" />
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-32 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-[340px] rounded-2xl" />
        <Skeleton className="h-[340px] rounded-2xl" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-[360px] rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

function toPercent(current: number, previous: number) {
  if (previous === 0) return current === 0 ? null : 100
  return Number((((current - previous) / previous) * 100).toFixed(1))
}

function getTrendDirection(percent: number | null): "up" | "down" | "flat" {
  if (percent === null || percent === 0) return "flat"
  return percent > 0 ? "up" : "down"
}

function formatCompactMoney(amount: number) {
  return `${Math.round(amount).toLocaleString()} tk`
}

function formatMetricValue(key: AnalyticsKpi["key"], value: number) {
  if (key === "orders" || key === "customers" || key === "repeat") {
    return `${value}`
  }

  if (key === "aov") {
    return `${Math.round(value).toLocaleString()} tk`
  }

  return formatCompactMoney(value)
}

function getOrderType(order: Order) {
  return order.rider ? "delivery" : "pickup"
}

function makeSeriesLabel(date: Date, granularity: AnalyticsGranularity) {
  if (granularity === "monthly") return format(date, "MMM yyyy")
  if (granularity === "weekly") return `Wk ${format(date, "dd MMM")}`
  return format(date, "dd MMM")
}

function groupBySeries<T, TSeed extends Record<string, number>>(
  entries: T[],
  granularity: AnalyticsGranularity,
  getDate: (entry: T) => Date,
  getSeed: () => TSeed,
  reducer: (seed: TSeed, entry: T) => void
) {
  const grouped = new Map<string, TSeed & { label: string }>()

  entries.forEach((entry) => {
    const date = getDate(entry)
    const key =
      granularity === "monthly"
        ? format(date, "yyyy-MM")
        : granularity === "weekly"
          ? format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd")
          : format(date, "yyyy-MM-dd")

    if (!grouped.has(key)) {
      grouped.set(key, {
        label: makeSeriesLabel(
          granularity === "weekly"
            ? startOfWeek(date, { weekStartsOn: 1 })
            : date,
          granularity
        ),
        ...getSeed(),
      } as TSeed & { label: string })
    }

    reducer(grouped.get(key)! as TSeed, entry)
  })

  return Array.from(grouped.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, value]) => value)
}

type OrderAggregate = {
  totalOrders: number
  deliveredCount: number
  deliveredRevenue: number
  discountedOrdersCount: number
  discountedRevenue: number
  discountGiven: number
  statusCounts: Record<string, number>
  weekdayCounts: number[]
  hourCounts: number[]
  customerMap: Map<string, TopCustomerRow>
  menuMap: Map<string, MenuPerformanceRow>
}

function createOrderAggregate(): OrderAggregate {
  return {
    totalOrders: 0,
    deliveredCount: 0,
    deliveredRevenue: 0,
    discountedOrdersCount: 0,
    discountedRevenue: 0,
    discountGiven: 0,
    statusCounts: {},
    weekdayCounts: [0, 0, 0, 0, 0, 0, 0],
    hourCounts: Array.from({ length: 24 }, () => 0),
    customerMap: new Map(),
    menuMap: new Map(),
  }
}

type ReviewAggregate = {
  total: number
  ratingSum: number
  positive: number
  negative: number
  counts: Record<number, number>
}

function createReviewAggregate(): ReviewAggregate {
  return {
    total: 0,
    ratingSum: 0,
    positive: 0,
    negative: 0,
    counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  }
}

function getRepeatCustomerCount(rows: TopCustomerRow[]) {
  return rows.reduce(
    (count, customer) => count + (customer.orders > 1 ? 1 : 0),
    0
  )
}

function KpiCard({
  label,
  value,
  comparisonLabel,
  trendPercent,
  direction,
  icon: Icon,
}: Omit<AnalyticsKpi, "key"> & {
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <div className="text-sm font-medium text-muted-foreground">
            {label}
          </div>
          <div className="text-3xl font-semibold tracking-tight">{value}</div>
        </div>
        <div className="inline-flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3 pt-0">
        <div className="text-sm text-muted-foreground">{comparisonLabel}</div>
        <div
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
            direction === "up"
              ? "bg-emerald-50 text-emerald-700"
              : direction === "down"
                ? "bg-rose-50 text-rose-700"
                : "bg-slate-100 text-slate-700"
          }`}
        >
          {direction === "up" ? (
            <TrendingUp className="size-3.5" />
          ) : direction === "down" ? (
            <TrendingDown className="size-3.5" />
          ) : null}
          {trendPercent === null ? "No change" : `${Math.abs(trendPercent)}%`}
        </div>
      </CardContent>
    </Card>
  )
}

export function AnalyticsPage() {
  const { orders: storeOrders } = useOrders()
  const ownerAccount = useAppStore((state) => state.ownerAccount)
  const { items: menuItems } = useMenuItems()
  const { categories } = useCategories()
  const { vouchers } = usePromotions()
  const { reviews } = useReviews()
  const { payouts, payoutTransactions } = usePayouts()

  const [dateFilter, setDateFilter] = React.useState<OrderDateFilterValue>({
    ...defaultOrderDateFilter,
    preset: "last7Days",
  })
  const [paymentFilter, setPaymentFilter] =
    React.useState<AnalyticsPaymentFilter>("all")
  const [categoryFilter, setCategoryFilter] = React.useState<string>("all")
  const [orderTypeFilter, setOrderTypeFilter] =
    React.useState<AnalyticsOrderTypeFilter>("all")
  const [granularity, setGranularity] =
    React.useState<AnalyticsGranularity>("daily")
  const [menuPageIndex, setMenuPageIndex] = React.useState(0)
  const [menuPageSize, setMenuPageSize] = React.useState(5)
  const resetDisabled =
    dateFilter.preset === "last7Days" &&
    !dateFilter.range &&
    paymentFilter === "all" &&
    categoryFilter === "all" &&
    orderTypeFilter === "all"
  const currentInterval = React.useMemo(
    () => getOrderDateFilterInterval(dateFilter),
    [dateFilter]
  )
  const previousInterval = React.useMemo(
    () => getPreviousOrderDateFilterInterval(dateFilter),
    [dateFilter]
  )
  const analyticsOverviewQueryParams = React.useMemo(
    () => ({
      paymentMethod: paymentFilter !== "all" ? paymentFilter : undefined,
      orderType: orderTypeFilter !== "all" ? orderTypeFilter : undefined,
      categoryId: categoryFilter !== "all" ? categoryFilter : undefined,
      preset: "custom",
      from: format(currentInterval.start, "yyyy-MM-dd"),
      to: format(currentInterval.end, "yyyy-MM-dd"),
    }),
    [
      categoryFilter,
      currentInterval.end,
      currentInterval.start,
      orderTypeFilter,
      paymentFilter,
    ]
  )
  const analyticsOverviewQuery = useOwnerAnalyticsOverviewQuery(
    ownerAccount.isAuthenticated,
    analyticsOverviewQueryParams
  )
  const analyticsOverview = analyticsOverviewQuery.data
  const initialLoading =
    analyticsOverviewQuery.isPending && !analyticsOverview

  const orders = storeOrders
  const analyticsPayouts = payouts
  const analyticsPayoutTransactions = payoutTransactions

  const menuItemByName = React.useMemo(
    () => new Map(menuItems.map((item) => [item.name, item])),
    [menuItems]
  )

  const orderById = React.useMemo(
    () => new Map(orders.map((order) => [order.id, order])),
    [orders]
  )

  const matchesOrderFiltersWithoutDate = React.useCallback(
    (order: Order) => {
      if (paymentFilter !== "all" && order.paymentMethod !== paymentFilter) {
        return false
      }

      if (
        orderTypeFilter !== "all" &&
        getOrderType(order) !== orderTypeFilter
      ) {
        return false
      }

      if (categoryFilter !== "all") {
        const hasCategory = order.items.some((item) => {
          const menuItem = menuItemByName.get(item.name)
          return menuItem?.categoryId === categoryFilter
        })

        if (!hasCategory) return false
      }

      return true
    },
    [categoryFilter, menuItemByName, orderTypeFilter, paymentFilter]
  )

  const matchesCommonFilters = React.useCallback(
    (order: Order, interval = currentInterval) => {
      if (!isWithinInterval(new Date(order.timestamps.placedAt), interval)) {
        return false
      }

      return matchesOrderFiltersWithoutDate(order)
    },
    [currentInterval, matchesOrderFiltersWithoutDate]
  )

  const matchesDeliveredFilters = React.useCallback(
    (order: Order, interval = currentInterval) => {
      if (
        order.currentStatus !== "Delivered" ||
        !order.timestamps.deliveredAt
      ) {
        return false
      }

      if (!isWithinInterval(new Date(order.timestamps.deliveredAt), interval)) {
        return false
      }

      return matchesOrderFiltersWithoutDate(order)
    },
    [currentInterval, matchesOrderFiltersWithoutDate]
  )

  const filteredOrders = React.useMemo(
    () => orders.filter((order) => matchesCommonFilters(order)),
    [matchesCommonFilters, orders]
  )

  const filteredDeliveredOrders = React.useMemo(
    () => orders.filter((order) => matchesDeliveredFilters(order)),
    [matchesDeliveredFilters, orders]
  )

  const previousOrders = React.useMemo(
    () =>
      orders.filter((order) => matchesCommonFilters(order, previousInterval)),
    [matchesCommonFilters, orders, previousInterval]
  )

  const previousDeliveredOrders = React.useMemo(
    () =>
      orders.filter((order) =>
        matchesDeliveredFilters(order, previousInterval)
      ),
    [matchesDeliveredFilters, orders, previousInterval]
  )
  const orderAggregate = React.useMemo(() => {
    return filteredOrders.reduce<OrderAggregate>((aggregate, order) => {
      aggregate.totalOrders += 1
      aggregate.statusCounts[order.currentStatus] =
        (aggregate.statusCounts[order.currentStatus] ?? 0) + 1

      const placedAt = new Date(order.timestamps.placedAt)
      const jsDay = placedAt.getDay()
      const mondayFirst = (jsDay + 6) % 7
      aggregate.weekdayCounts[mondayFirst] += 1
      aggregate.hourCounts[placedAt.getHours()] += 1

      return aggregate
    }, createOrderAggregate())
  }, [filteredOrders])

  const enrichedOrderAggregate = React.useMemo(() => {
    const aggregateSeed: OrderAggregate = {
      ...orderAggregate,
      statusCounts: { ...orderAggregate.statusCounts },
      weekdayCounts: [...orderAggregate.weekdayCounts],
      hourCounts: [...orderAggregate.hourCounts],
      customerMap: new Map(orderAggregate.customerMap),
      menuMap: new Map(orderAggregate.menuMap),
    }

    return filteredDeliveredOrders.reduce<OrderAggregate>(
      (aggregate, order) => {
        aggregate.deliveredCount += 1
        aggregate.deliveredRevenue += order.total

        const existingCustomer = aggregate.customerMap.get(order.customer.phone)
        if (existingCustomer) {
          existingCustomer.orders += 1
          existingCustomer.revenue += order.total
        } else {
          aggregate.customerMap.set(order.customer.phone, {
            name: order.customer.name,
            orders: 1,
            revenue: order.total,
          })
        }

        if (order.discount > 0) {
          aggregate.discountedOrdersCount += 1
          aggregate.discountedRevenue += order.total
          aggregate.discountGiven += order.discount
        }

        order.items.forEach((item) => {
          const menuItem = menuItemByName.get(item.name)
          const key = menuItem?.id ?? item.name
          const existingMenuItem = aggregate.menuMap.get(key)
          const row =
            existingMenuItem ??
            ({
              name: item.name,
              categoryName: menuItem?.categoryName ?? "Unassigned",
              quantitySold: 0,
              revenue: 0,
            } satisfies MenuPerformanceRow)

          row.quantitySold += item.quantity
          row.revenue +=
            item.quantity *
            (item.unitPrice +
              item.addOns.reduce((sum, addOn) => sum + addOn.price, 0))

          if (!existingMenuItem) {
            aggregate.menuMap.set(key, row)
          }
        })

        return aggregate
      },
      aggregateSeed
    )
  }, [filteredDeliveredOrders, menuItemByName, orderAggregate])

  const previousOrderAggregate = React.useMemo(() => {
    return previousOrders.reduce<OrderAggregate>((aggregate) => {
      aggregate.totalOrders += 1
      return aggregate
    }, createOrderAggregate())
  }, [previousOrders])

  const enrichedPreviousOrderAggregate = React.useMemo(() => {
    const aggregateSeed: OrderAggregate = {
      ...previousOrderAggregate,
      statusCounts: { ...previousOrderAggregate.statusCounts },
      weekdayCounts: [...previousOrderAggregate.weekdayCounts],
      hourCounts: [...previousOrderAggregate.hourCounts],
      customerMap: new Map(previousOrderAggregate.customerMap),
      menuMap: new Map(previousOrderAggregate.menuMap),
    }

    return previousDeliveredOrders.reduce<OrderAggregate>(
      (aggregate, order) => {
        aggregate.deliveredCount += 1
        aggregate.deliveredRevenue += order.total

        const existingCustomer = aggregate.customerMap.get(order.customer.phone)
        if (existingCustomer) {
          existingCustomer.orders += 1
          existingCustomer.revenue += order.total
        } else {
          aggregate.customerMap.set(order.customer.phone, {
            name: order.customer.name,
            orders: 1,
            revenue: order.total,
          })
        }

        return aggregate
      },
      aggregateSeed
    )
  }, [previousDeliveredOrders, previousOrderAggregate])

  const filteredTransactions = React.useMemo(
    () =>
      analyticsPayoutTransactions.filter((transaction) => {
        const order = orderById.get(transaction.orderId)
        if (transaction.type !== "earning" || !order) return false
        return matchesDeliveredFilters(order)
      }),
    [analyticsPayoutTransactions, matchesDeliveredFilters, orderById]
  )

  const previousTransactions = React.useMemo(
    () =>
      analyticsPayoutTransactions.filter((transaction) => {
        const order = orderById.get(transaction.orderId)
        if (transaction.type !== "earning" || !order) return false
        return matchesDeliveredFilters(order, previousInterval)
      }),
    [analyticsPayoutTransactions, matchesDeliveredFilters, orderById, previousInterval]
  )

  const filteredReviews = React.useMemo(
    () =>
      reviews.filter((review) => {
        if (!isWithinInterval(new Date(review.createdAt), currentInterval)) {
          return false
        }

        if (
          categoryFilter !== "all" ||
          paymentFilter !== "all" ||
          orderTypeFilter !== "all"
        ) {
          if (!review.orderInfo?.id) return false
          const order = orderById.get(review.orderInfo.id)
          if (!order) return false
          return matchesCommonFilters(order)
        }

        return true
      }),
    [
      categoryFilter,
      currentInterval,
      matchesCommonFilters,
      orderById,
      orderTypeFilter,
      paymentFilter,
      reviews,
    ]
  )
  const reviewAggregate = React.useMemo(() => {
    return filteredReviews.reduce<ReviewAggregate>((aggregate, review) => {
      aggregate.total += 1
      aggregate.ratingSum += review.rating
      aggregate.counts[review.rating] =
        (aggregate.counts[review.rating] ?? 0) + 1
      if (review.rating >= 4) aggregate.positive += 1
      if (review.rating <= 2) aggregate.negative += 1
      return aggregate
    }, createReviewAggregate())
  }, [filteredReviews])

  const filteredPayouts = React.useMemo(
    () =>
      analyticsPayouts.filter((payout) =>
        isWithinInterval(new Date(payout.createdAt), currentInterval)
      ),
    [analyticsPayouts, currentInterval]
  )

  const customerRows = React.useMemo(
    () =>
      Array.from(enrichedOrderAggregate.customerMap.values()).sort(
        (left, right) => right.revenue - left.revenue
      ),
    [enrichedOrderAggregate.customerMap]
  )

  const previousCustomerRows = React.useMemo(
    () =>
      Array.from(enrichedPreviousOrderAggregate.customerMap.values()).sort(
        (left, right) => right.revenue - left.revenue
      ),
    [enrichedPreviousOrderAggregate.customerMap]
  )

  const repeatCustomerCount = React.useMemo(
    () => getRepeatCustomerCount(customerRows),
    [customerRows]
  )

  const previousRepeatCustomerCount = React.useMemo(
    () => getRepeatCustomerCount(previousCustomerRows),
    [previousCustomerRows]
  )

  const menuRows = React.useMemo(
    () =>
      Array.from(enrichedOrderAggregate.menuMap.values()).sort(
        (left, right) => right.revenue - left.revenue
      ),
    [enrichedOrderAggregate.menuMap]
  )

  const stats = React.useMemo(() => {
    const totalOrders =
      analyticsOverview?.metrics.totalOrders ?? orderAggregate.totalOrders
    const totalRevenue =
      analyticsOverview?.metrics.deliveredRevenue ??
      enrichedOrderAggregate.deliveredRevenue
    const netEarnings =
      analyticsOverview?.metrics.netEarnings ??
      filteredTransactions.reduce(
        (sum, transaction) =>
          transaction.type === "payout" ? sum : sum + transaction.netAmount,
        0
      )
    const avgOrderValue =
      analyticsOverview?.metrics.averageOrderValue ??
      (enrichedOrderAggregate.deliveredCount > 0
        ? totalRevenue / enrichedOrderAggregate.deliveredCount
        : 0)

    const previousTotalOrders =
      analyticsOverview?.metrics.previousTotalOrders ??
      previousOrderAggregate.totalOrders
    const previousRevenue =
      analyticsOverview?.metrics.previousDeliveredRevenue ??
      enrichedPreviousOrderAggregate.deliveredRevenue
    const previousNet =
      analyticsOverview?.metrics.previousNetEarnings ??
      previousTransactions.reduce(
        (sum, transaction) =>
          transaction.type === "payout" ? sum : sum + transaction.netAmount,
        0
      )
    const uniqueCustomers =
      analyticsOverview?.metrics.uniqueCustomers ?? customerRows.length
    const previousUniqueCustomers =
      analyticsOverview?.metrics.previousUniqueCustomers ??
      previousCustomerRows.length
    const repeatCustomers =
      analyticsOverview?.metrics.repeatCustomers ?? repeatCustomerCount
    const previousRepeatCustomers =
      analyticsOverview?.metrics.previousRepeatCustomers ??
      previousRepeatCustomerCount

    const metricConfig = [
      {
        key: "orders",
        label: "Total Orders",
        current: totalOrders,
        previous: previousTotalOrders,
      },
      {
        key: "revenue",
        label: "Food Sales",
        current: totalRevenue,
        previous: previousRevenue,
      },
      {
        key: "net",
        label: "Net Earnings",
        current: netEarnings,
        previous: previousNet,
      },
      {
        key: "aov",
        label: "Average Order Value",
        current: avgOrderValue,
        previous:
          enrichedPreviousOrderAggregate.deliveredCount > 0
            ? previousRevenue / enrichedPreviousOrderAggregate.deliveredCount
            : 0,
      },
      {
        key: "customers",
        label: "Total Customers",
        current: uniqueCustomers,
        previous: previousUniqueCustomers,
      },
      {
        key: "repeat",
        label: "Repeat Customers",
        current: repeatCustomers,
        previous: previousRepeatCustomers,
      },
    ] as const

    return metricConfig.map((metric) => {
      const trendPercent = toPercent(metric.current, metric.previous)
      return {
        key: metric.key,
        label: metric.label,
        value: formatMetricValue(metric.key, metric.current),
        comparisonLabel: `Prev ${formatMetricValue(metric.key, metric.previous)}`,
        trendPercent,
        direction: getTrendDirection(trendPercent),
      } satisfies AnalyticsKpi
    })
  }, [
    analyticsOverview,
    customerRows.length,
    enrichedOrderAggregate,
    enrichedPreviousOrderAggregate,
    filteredTransactions,
    orderAggregate,
    previousOrderAggregate,
    previousCustomerRows.length,
    previousRepeatCustomerCount,
    previousTransactions,
    repeatCustomerCount,
  ])

  const orderSeries = React.useMemo<OrderSeriesPoint[]>(
    () => {
      if (analyticsOverview) {
        if (granularity === "daily") {
          return analyticsOverview.orderSeries.map((point) => ({
            label: point.label,
            orders: point.orders,
          }))
        }

        return groupBySeries(
          analyticsOverview.orderSeries,
          granularity,
          (point) => new Date(`${point.date}T00:00:00+06:00`),
          () => ({ orders: 0 }),
          (seed, point) => {
            seed.orders += point.orders
          }
        )
      }

      return groupBySeries(
        filteredOrders,
        granularity,
        (order) => new Date(order.timestamps.placedAt),
        () => ({ orders: 0 }),
        (seed) => {
          seed.orders += 1
        }
      )
    },
    [analyticsOverview, filteredOrders, granularity]
  )

  const peakHours = React.useMemo(
    () => {
      if (analyticsOverview) return analyticsOverview.peakHours

      return Array.from({ length: 24 }, (_, hour) => {
        const count = orderAggregate.hourCounts[hour] ?? 0
        return { label: formatHourLabel12(hour), orders: count }
      })
        .filter((entry) => entry.orders > 0)
        .sort((a, b) => b.orders - a.orders)
    },
    [analyticsOverview, orderAggregate.hourCounts]
  )

  const statusPerformance = React.useMemo(() => {
    const statusColors: Record<string, string> = {
      New: "#3b82f6",
      Accepted: "#0f766e",
      Preparing: "#f59e0b",
      ReadyForPickup: "#8b5cf6",
      PickedUp: "#06b6d4",
      Delivered: "#10b981",
      Rejected: "#ef4444",
      Cancelled: "#f97316",
    }

    const rows = Object.entries(orderStatusLabels).map(([status, label]) => ({
      status,
      label,
      count:
        analyticsOverview?.statusCounts[status] ??
        orderAggregate.statusCounts[status] ??
        0,
      color: statusColors[status] ?? "#64748b",
    }))

    const max = Math.max(...rows.map((row) => row.count), 0)

    return {
      rows,
      max,
    }
  }, [analyticsOverview, orderAggregate.statusCounts])

  const weekdayOrders = React.useMemo(() => {
    if (analyticsOverview) return analyticsOverview.weekdayOrders

    const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    return labels.map((label, index) => ({
      label,
      orders: orderAggregate.weekdayCounts[index] ?? 0,
    }))
  }, [analyticsOverview, orderAggregate.weekdayCounts])

  const customerInsights = React.useMemo(() => {
    if (analyticsOverview) return analyticsOverview.customerInsights

    return {
      unique: customerRows.length,
      repeat: repeatCustomerCount,
      repeatRate:
        customerRows.length > 0
          ? (repeatCustomerCount / customerRows.length) * 100
          : 0,
      rows: customerRows.slice(0, 5),
      donut: [
        {
          name: "New",
          value: Math.max(customerRows.length - repeatCustomerCount, 0),
          color: "#60a5fa",
        },
        { name: "Repeat", value: repeatCustomerCount, color: "#10b981" },
      ],
    }
  }, [analyticsOverview, customerRows, repeatCustomerCount])

  const menuPerformance = React.useMemo(() => {
    if (analyticsOverview) return analyticsOverview.menuPerformance

    const lowPerformers = [...menuRows]
      .sort((a, b) => a.quantitySold - b.quantitySold)
      .slice(0, 3)
    const categories = Array.from(
      menuRows
        .reduce<Map<string, { name: string; revenue: number }>>(
          (accumulator, row) => {
            const existing = accumulator.get(row.categoryName)
            accumulator.set(row.categoryName, {
              name: row.categoryName,
              revenue: (existing?.revenue ?? 0) + row.revenue,
            })
            return accumulator
          },
          new Map()
        )
        .values()
    ).sort((a, b) => b.revenue - a.revenue)

    return { rows: menuRows, lowPerformers, categories }
  }, [analyticsOverview, menuRows])

  const voucherImpact = React.useMemo(() => {
    const activeVouchers = vouchers.filter((voucher) => {
      const startsAt = new Date(voucher.startsAt)
      const endsAt = new Date(voucher.endsAt)
      return startsAt <= currentInterval.end && endsAt >= currentInterval.start
    }).length

    return {
      ordersUsingVouchers:
        analyticsOverview?.metrics.discountedOrdersCount ??
        enrichedOrderAggregate.discountedOrdersCount,
      discountGiven:
        analyticsOverview?.metrics.discountGiven ??
        enrichedOrderAggregate.discountGiven,
      revenueFromDiscounted:
        analyticsOverview?.metrics.discountedRevenue ??
        enrichedOrderAggregate.discountedRevenue,
      activeVouchers,
      discountedRate:
        (analyticsOverview?.metrics.deliveredCount ??
          enrichedOrderAggregate.deliveredCount) > 0
          ? ((analyticsOverview?.metrics.discountedOrdersCount ??
              enrichedOrderAggregate.discountedOrdersCount) /
              (analyticsOverview?.metrics.deliveredCount ??
                enrichedOrderAggregate.deliveredCount)) *
            100
          : 0,
    }
  }, [
    analyticsOverview,
    currentInterval.end,
    currentInterval.start,
    enrichedOrderAggregate,
    vouchers,
  ])

  const ratingInsights = React.useMemo(() => {
    const total = reviewAggregate.total
    const average = total > 0 ? reviewAggregate.ratingSum / total : 0

    const counts = [5, 4, 3, 2, 1].map((rating) => ({
      rating,
      count: reviewAggregate.counts[rating] ?? 0,
    }))

    const trend = groupBySeries(
      filteredReviews,
      "daily",
      (review) => new Date(review.createdAt),
      () => ({ average: 0, count: 0 }),
      (seed, review) => {
        seed.average += review.rating
        seed.count += 1
      }
    ).map((point) => ({
      label: point.label,
      average:
        point.count > 0 ? Number((point.average / point.count).toFixed(1)) : 0,
    }))

    return {
      average,
      total,
      counts,
      positiveRatio: total > 0 ? (reviewAggregate.positive / total) * 100 : 0,
      negativeRatio: total > 0 ? (reviewAggregate.negative / total) * 100 : 0,
      trend,
    }
  }, [filteredReviews, reviewAggregate])

  const payoutInsights = React.useMemo(() => {
    if (analyticsOverview) return analyticsOverview.payoutInsights
    return calculateEarningsSummary(filteredTransactions, filteredPayouts)
  }, [analyticsOverview, filteredPayouts, filteredTransactions])

  const safeMenuPageCount = Math.max(
    1,
    Math.ceil(menuPerformance.rows.length / menuPageSize)
  )
  const safeMenuPageIndex = Math.min(menuPageIndex, safeMenuPageCount - 1)

  React.useEffect(() => {
    setMenuPageIndex(0)
  }, [categoryFilter, dateFilter, menuPageSize, orderTypeFilter, paymentFilter])

  const paginatedMenuRows = React.useMemo(
    () =>
      menuPerformance.rows.slice(
        safeMenuPageIndex * menuPageSize,
        safeMenuPageIndex * menuPageSize + menuPageSize
      ),
    [menuPerformance.rows, menuPageSize, safeMenuPageIndex]
  )

  const spotlightInsights = React.useMemo(() => {
    const bestDay =
      [...weekdayOrders].sort((a, b) => b.orders - a.orders)[0] ?? null
    const topItem = menuPerformance.rows[0] ?? null
    const peakHour = peakHours[0] ?? null

    return { bestDay, topItem, peakHour }
  }, [menuPerformance.rows, peakHours, weekdayOrders])

  if (initialLoading) {
    return <AnalyticsSkeleton />
  }

  const iconMap = {
    orders: ShoppingBag,
    revenue: BadgeDollarSign,
    net: Wallet,
    aov: CreditCard,
    customers: Users,
    repeat: Repeat2,
  } satisfies Record<
    AnalyticsKpi["key"],
    React.ComponentType<{ className?: string }>
  >

  return (
    <div className="relative space-y-4 px-4 lg:px-6">
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:flex-wrap">
          <OrderDateFilter value={dateFilter} onChange={setDateFilter} />

          <Select
            value={orderTypeFilter}
            onValueChange={(value) =>
              setOrderTypeFilter(value as AnalyticsOrderTypeFilter)
            }
          >
            <SelectTrigger className="w-full xl:w-40">
              <SelectValue placeholder="Order type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="delivery">Delivery</SelectItem>
              <SelectItem value="pickup">Pickup</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={paymentFilter}
            onValueChange={(value) =>
              setPaymentFilter(value as AnalyticsPaymentFilter)
            }
          >
            <SelectTrigger className="w-full xl:w-40">
              <SelectValue placeholder="Payment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Payments</SelectItem>
              <SelectItem value="Cash">Cash</SelectItem>
              <SelectItem value="Bkash">bKash</SelectItem>
            </SelectContent>
          </Select>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full xl:w-48">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            disabled={resetDisabled}
            onClick={() => {
              setDateFilter({ ...defaultOrderDateFilter, preset: "last7Days" })
              setOrderTypeFilter("all")
              setPaymentFilter("all")
              setCategoryFilter("all")
            }}
          >
            <RotateCcw className="size-4" />
            Reset
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {stats.map((stat) => {
          const { key, ...rest } = stat
          return <KpiCard key={key} {...rest} icon={iconMap[key]} />
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="size-4 text-muted-foreground" />
              Order Status Performance
            </CardTitle>
            <div className="mt-1 text-sm text-muted-foreground">
              Track how orders are moving through the workflow and spot
              bottlenecks faster.
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-3">
              {statusPerformance.rows.map((row) => (
                <div key={row.status} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: row.color }}
                      />
                      <span>{row.label}</span>
                    </div>
                    <span className="font-medium">{row.count}</span>
                  </div>
                  <Progress
                    value={
                      statusPerformance.max > 0
                        ? (row.count / statusPerformance.max) * 100
                        : 0
                    }
                    className="h-2"
                  />
                </div>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Best Day</div>
                <div className="mt-1 text-lg font-semibold">
                  {spotlightInsights.bestDay?.label ?? "--"}
                </div>
                <div className="text-sm text-muted-foreground">
                  {spotlightInsights.bestDay?.orders ?? 0} orders
                </div>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Peak Hour</div>
                <div className="mt-1 text-lg font-semibold">
                  {spotlightInsights.peakHour?.label ?? "--"}
                </div>
                <div className="text-sm text-muted-foreground">
                  {spotlightInsights.peakHour?.orders ?? 0} orders
                </div>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Top Item</div>
                <div className="mt-1 text-lg font-semibold">
                  {spotlightInsights.topItem?.name ?? "--"}
                </div>
                <div className="text-sm text-muted-foreground">
                  {spotlightInsights.topItem?.quantitySold ?? 0} sold
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingBag className="size-4 text-muted-foreground" />
                Orders Analytics
              </CardTitle>
              <div className="mt-1 text-sm text-muted-foreground">
                Understand how order demand changes over time and when it peaks.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["daily", "weekly", "monthly"] as AnalyticsGranularity[]).map(
                (value) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={granularity === value ? "default" : "outline"}
                    onClick={() => setGranularity(value)}
                  >
                    {value[0].toUpperCase() + value.slice(1)}
                  </Button>
                )
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="mb-3 text-sm font-medium">Orders Over Time</div>
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={orderSeries}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Bar
                      dataKey="orders"
                      fill="#0f766e"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div>
              <div className="mb-3 text-sm font-medium">Peak Hours</div>
              <div className="space-y-2">
                {peakHours.slice(0, 5).map((slot) => (
                  <div key={slot.label} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{slot.label}</span>
                      <span className="font-medium">{slot.orders} orders</span>
                    </div>
                    <Progress
                      value={
                        peakHours[0]?.orders
                          ? (slot.orders / peakHours[0].orders) * 100
                          : 0
                      }
                      className="h-2"
                    />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4 text-muted-foreground" />
              Customer Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Unique</div>
                <div className="mt-1 text-2xl font-semibold">
                  {customerInsights.unique}
                </div>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Repeat</div>
                <div className="mt-1 text-2xl font-semibold text-emerald-700">
                  {customerInsights.repeat}
                </div>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Repeat Rate</div>
                <div className="mt-1 text-2xl font-semibold text-sky-700">
                  {customerInsights.repeatRate.toFixed(0)}%
                </div>
              </div>
            </div>

            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={customerInsights.donut}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={54}
                    outerRadius={80}
                    paddingAngle={3}
                  >
                    {customerInsights.donut.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-2">
              {customerInsights.rows.map((customer) => (
                <div
                  key={customer.name}
                  className="flex items-center justify-between rounded-xl border bg-muted/20 px-3 py-2"
                >
                  <div>
                    <div className="font-medium">{customer.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {customer.orders} orders
                    </div>
                  </div>
                  <div className="text-sm font-semibold">
                    {formatCompactMoney(customer.revenue)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Tag className="size-4 text-muted-foreground" />
              Promotion Impact
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">
                  Voucher Orders
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  {voucherImpact.ordersUsingVouchers}
                </div>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">
                  Discount Given
                </div>
                <div className="mt-1 text-2xl font-semibold text-rose-700">
                  {formatCompactMoney(voucherImpact.discountGiven)}
                </div>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">
                  Discounted Revenue
                </div>
                <div className="mt-1 text-2xl font-semibold text-emerald-700">
                  {formatCompactMoney(voucherImpact.revenueFromDiscounted)}
                </div>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">
                  Active Offers
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  {voucherImpact.activeVouchers}
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center justify-between text-sm">
                <span>Voucher adoption rate</span>
                <span className="font-medium">
                  {voucherImpact.discountedRate.toFixed(0)}%
                </span>
              </div>
              <Progress
                value={voucherImpact.discountedRate}
                className="mt-3 h-2"
              />
            </div>

            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Coupon vs auto offers</span>
                <span className="font-medium text-foreground">
                  {
                    vouchers.filter((voucher) => voucher.mode === "coupon")
                      .length
                  }{" "}
                  /{" "}
                  {vouchers.filter((voucher) => voucher.mode === "auto").length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Free delivery campaigns</span>
                <span className="font-medium text-foreground">
                  {
                    vouchers.filter(
                      (voucher) => voucher.type === "free-delivery"
                    ).length
                  }
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Star className="size-4 text-muted-foreground" />
              Ratings & Reviews
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-3xl font-semibold">
                  {ratingInsights.average.toFixed(1)}
                </div>
                <div className="text-sm text-muted-foreground">
                  Average rating from {ratingInsights.total} reviews
                </div>
              </div>
              <div className="text-right text-sm">
                <div className="font-medium text-emerald-700">
                  {ratingInsights.positiveRatio.toFixed(0)}% positive
                </div>
                <div className="text-rose-700">
                  {ratingInsights.negativeRatio.toFixed(0)}% negative
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {ratingInsights.counts.map((entry) => (
                <div
                  key={entry.rating}
                  className="grid grid-cols-[44px_1fr_36px] items-center gap-3 text-sm"
                >
                  <span>{entry.rating}★</span>
                  <Progress
                    value={
                      ratingInsights.total > 0
                        ? (entry.count / ratingInsights.total) * 100
                        : 0
                    }
                    className="h-2"
                  />
                  <span className="text-right text-muted-foreground">
                    {entry.count}
                  </span>
                </div>
              ))}
            </div>

            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ratingInsights.trend}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} domain={[0, 5]} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="average"
                    stroke="#f59e0b"
                    fill="#fef3c7"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingBag className="size-4 text-muted-foreground" />
                Menu Performance
              </CardTitle>
              <div className="mt-1 text-sm text-muted-foreground">
                Best sellers, high-revenue items, and low-performing items.
              </div>
            </div>
            <Badge variant="outline" className="w-fit">
              {menuPerformance.rows.length} tracked items
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-hidden rounded-2xl border">
              <div className="overflow-x-auto">
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Item</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Units Sold</TableHead>
                      <TableHead>Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedMenuRows.map((row) => (
                      <TableRow key={row.name}>
                        <TableCell className="font-medium">
                          {row.name}
                        </TableCell>
                        <TableCell>{row.categoryName}</TableCell>
                        <TableCell>{row.quantitySold}</TableCell>
                        <TableCell>{formatCompactMoney(row.revenue)}</TableCell>
                      </TableRow>
                    ))}
                    {paginatedMenuRows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="py-10 text-center text-sm text-muted-foreground"
                        >
                          No menu performance data for the current filters.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border bg-card px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                Showing {paginatedMenuRows.length} of{" "}
                {menuPerformance.rows.length} item(s)
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Select
                  value={`${menuPageSize}`}
                  onValueChange={(value) => setMenuPageSize(Number(value))}
                >
                  <SelectTrigger className="w-full sm:w-32">
                    <SelectValue placeholder="Rows" />
                  </SelectTrigger>
                  <SelectContent side="top">
                    {pageSizeOptions.map((size) => (
                      <SelectItem key={size} value={`${size}`}>
                        {size} / page
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="text-sm font-medium">
                  Page {safeMenuPageIndex + 1} of {safeMenuPageCount}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setMenuPageIndex((current) => Math.max(0, current - 1))
                    }
                    disabled={safeMenuPageIndex === 0}
                  >
                    Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setMenuPageIndex((current) =>
                        Math.min(safeMenuPageCount - 1, current + 1)
                      )
                    }
                    disabled={safeMenuPageIndex >= safeMenuPageCount - 1}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border bg-muted/20 p-4">
                <div className="mb-3 text-sm font-medium">
                  Low Performing Items
                </div>
                <div className="space-y-2">
                  {menuPerformance.lowPerformers.map((item) => (
                    <div
                      key={item.name}
                      className="flex items-center justify-between rounded-xl bg-background px-3 py-2"
                    >
                      <span className="font-medium">{item.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {item.quantitySold} sold
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border bg-muted/20 p-4">
                <div className="mb-3 text-sm font-medium">
                  Category Performance
                </div>
                <div className="space-y-3">
                  {menuPerformance.categories.map((category) => (
                    <div key={category.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span>{category.name}</span>
                        <span className="font-medium">
                          {formatCompactMoney(category.revenue)}
                        </span>
                      </div>
                      <Progress
                        value={
                          menuPerformance.categories[0]?.revenue
                            ? (category.revenue /
                                menuPerformance.categories[0].revenue) *
                              100
                            : 0
                        }
                        className="h-2"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="size-4 text-muted-foreground" />
              Payout & Earnings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Gross</div>
                <div className="mt-1 text-2xl font-semibold">
                  {formatCompactMoney(payoutInsights.gross)}
                </div>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Net</div>
                <div className="mt-1 text-2xl font-semibold text-emerald-700">
                  {formatCompactMoney(payoutInsights.net)}
                </div>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Commission</div>
                <div className="mt-1 text-2xl font-semibold text-rose-700">
                  {formatCompactMoney(payoutInsights.commission)}
                </div>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">
                  Total Payouts
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  {formatCompactMoney(payoutInsights.totalPayouts)}
                </div>
              </div>
            </div>

            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    {
                      label: "Wallet",
                      available: payoutInsights.available,
                      pending: payoutInsights.pending,
                    },
                  ]}
                >
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Bar
                    dataKey="available"
                    stackId="wallet"
                    fill="#10b981"
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="pending"
                    stackId="wallet"
                    fill="#f59e0b"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-xl border bg-muted/20 px-3 py-2">
                <span className="text-sm text-muted-foreground">
                  Available Balance
                </span>
                <span className="font-medium text-emerald-700">
                  {formatCompactMoney(payoutInsights.available)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border bg-muted/20 px-3 py-2">
                <span className="text-sm text-muted-foreground">
                  Pending Balance
                </span>
                <span className="font-medium text-amber-700">
                  {formatCompactMoney(payoutInsights.pending)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Orders by Day of Week</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekdayOrders}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="orders" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
