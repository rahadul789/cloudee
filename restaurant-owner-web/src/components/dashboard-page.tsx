import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfDay,
  format,
  isWithinInterval,
  startOfDay,
  startOfWeek,
  subDays,
} from "date-fns"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  ArrowRight,
  BadgeDollarSign,
  Ban,
  CheckCircle2,
  ClipboardList,
  Clock3,
  LoaderCircle,
  MessageSquareText,
  PackageOpen,
  Percent,
  ShoppingBag,
  Star,
  Tags,
  UtensilsCrossed,
  Wallet,
} from "lucide-react"
import { Link } from "react-router-dom"

import { EnforcementBanner } from "@/components/enforcement-banner"
import { ServiceHoursBanner } from "@/components/service-hours-banner"
import { useOpeningHours } from "@/components/hours/opening-hours-context"
import { useMenuItems } from "@/components/menu/menu-items-context"
import {
  buildOrderDateFilterQuery,
  defaultOrderDateFilter,
  getOrderDateFilterInterval,
  getPreviousOrderDateFilterInterval,
  OrderDateFilter,
  type OrderDateFilterValue,
} from "@/components/orders/order-date-filter"
import { useOrders } from "@/components/orders/orders-context"
import { liveOrderStatuses, orderStatusLabels } from "@/components/orders/types"
import { usePayouts } from "@/components/payouts/payouts-context"
import { usePromotions } from "@/components/promotions/promotions-context"
import { useReviews } from "@/components/reviews/reviews-context"
import { useRestaurantStatus } from "@/components/restaurant-status-context"
import {
  useOwnerDashboardSummaryQuery,
  useOwnerOrderTransitionMutation,
} from "@/hooks/use-owner-api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { calculateProfileCompletion } from "@/lib/store-profile"
import { formatHourLabel12 } from "@/lib/time"
import { cn } from "@/lib/utils"
import { patchOwnerOrderQueryCaches } from "@/lib/owner-order-cache"
import { calculateEarningsSummary } from "@/domain/financials"
import { getStoreOperationalStatus } from "@/domain/store-runtime"
import { useAppStore } from "@/store/app-store"

function formatCompactMoney(amount: number) {
  return `${Math.round(amount).toLocaleString()} tk`
}

function toPercent(current: number, previous: number) {
  if (previous === 0) return current === 0 ? null : 100
  return Number((((current - previous) / previous) * 100).toFixed(1))
}

function getTrendLabel(current: number, previous: number) {
  return getTrendMeta(current, previous).label
}

function getTrendMeta(current: number, previous: number) {
  const percent = toPercent(current, previous)
  if (percent === null || percent === 0) {
    return { label: "No change", tone: "flat" as const }
  }
  return {
    label: `${percent > 0 ? "+" : ""}${percent}% vs previous`,
    tone: percent > 0 ? ("positive" as const) : ("negative" as const),
  }
}

function isDateInInterval(
  value: string | null | undefined,
  interval: { start: Date; end: Date }
) {
  if (!value) return false
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  return isWithinInterval(date, interval)
}

type DashboardOrderMetrics = {
  totalOrders: number
  pendingOrders: number
  customerPhones: Set<string>
}

function createDashboardOrderMetrics(): DashboardOrderMetrics {
  return {
    totalOrders: 0,
    pendingOrders: 0,
    customerPhones: new Set<string>(),
  }
}

function getDashboardTrendKey(date: Date, useWeeklyBuckets: boolean) {
  const bucketDate = useWeeklyBuckets
    ? startOfWeek(date, { weekStartsOn: 1 })
    : date
  return format(bucketDate, "yyyy-MM-dd")
}

function createDashboardTrendSeed(interval: { start: Date; end: Date }) {
  const days = differenceInCalendarDays(interval.end, interval.start) + 1
  const useWeeklyBuckets = days > 45
  const trendByKey = new Map<string, DashboardTrendPoint>()

  eachDayOfInterval(interval).forEach((day) => {
    const key = getDashboardTrendKey(day, useWeeklyBuckets)
    if (!trendByKey.has(key)) {
      const bucketDate = useWeeklyBuckets
        ? startOfWeek(day, { weekStartsOn: 1 })
        : day
      trendByKey.set(key, {
        date: key,
        label: useWeeklyBuckets
          ? `Wk ${format(bucketDate, "dd MMM")}`
          : format(day, "dd MMM"),
        orders: 0,
        revenue: 0,
        placedValue: 0,
        deliveredValue: 0,
        netEarnings: 0,
        activeOrders: 0,
        failedOrders: 0,
        failedValue: 0,
        cancelledOrders: 0,
        rejectedOrders: 0,
      })
    }
  })

  return {
    useWeeklyBuckets,
    trendByKey,
  }
}

type DashboardTrendPoint = {
  date?: string
  label: string
  orders: number
  revenue: number
  placedValue?: number
  deliveredValue?: number
  netEarnings?: number
  activeOrders?: number
  failedOrders?: number
  failedValue?: number
  cancelledOrders?: number
  rejectedOrders?: number
}

function normalizeDashboardTrendSeries(
  interval: { start: Date; end: Date },
  rawSeries: DashboardTrendPoint[]
) {
  const sourceInterval =
    rawSeries.length > 1
      ? interval
      : {
          start: subDays(startOfDay(interval.end), 6),
          end: startOfDay(interval.end),
        }
  const { trendByKey, useWeeklyBuckets } =
    createDashboardTrendSeed(sourceInterval)

  rawSeries.forEach((entry) => {
    const key = entry.date
      ? getDashboardTrendKey(
          new Date(`${entry.date}T00:00:00`),
          useWeeklyBuckets
        )
      : entry.label
    const target = trendByKey.get(key) ?? {
      date: key,
      label: entry.label,
      orders: 0,
      revenue: 0,
      placedValue: 0,
      deliveredValue: 0,
      netEarnings: 0,
      activeOrders: 0,
      failedOrders: 0,
      failedValue: 0,
      cancelledOrders: 0,
      rejectedOrders: 0,
    }

    target.orders += entry.orders ?? 0
    target.revenue += entry.revenue ?? 0
    target.placedValue = (target.placedValue ?? 0) + (entry.placedValue ?? 0)
    target.deliveredValue =
      (target.deliveredValue ?? 0) +
      (entry.deliveredValue ?? entry.revenue ?? 0)
    target.netEarnings = (target.netEarnings ?? 0) + (entry.netEarnings ?? 0)
    target.activeOrders = (target.activeOrders ?? 0) + (entry.activeOrders ?? 0)
    target.failedOrders = (target.failedOrders ?? 0) + (entry.failedOrders ?? 0)
    target.failedValue = (target.failedValue ?? 0) + (entry.failedValue ?? 0)
    target.cancelledOrders =
      (target.cancelledOrders ?? 0) + (entry.cancelledOrders ?? 0)
    target.rejectedOrders =
      (target.rejectedOrders ?? 0) + (entry.rejectedOrders ?? 0)
    trendByKey.set(key, target)
  })

  return Array.from(trendByKey.values())
}

function trendAxisMax(dataMax: number) {
  if (!Number.isFinite(dataMax) || dataMax <= 0) return 1000
  return Math.max(1000, Math.ceil(dataMax / 250) * 250)
}

function kpiSparklineAxisMax(dataMax: number) {
  if (!Number.isFinite(dataMax) || dataMax <= 0) return 1
  if (dataMax <= 10) return Math.max(1, Math.ceil(dataMax))
  if (dataMax <= 100) return Math.ceil(dataMax / 10) * 10
  return Math.ceil(dataMax / 100) * 100
}

function buildKpiSparklineData(
  rows: DashboardTrendPoint[],
  chartKey: string,
  fallbackValue = 0
) {
  const data = rows.map((row) => ({
    label: row.label,
    value: Number.isFinite(Number(row[chartKey as keyof DashboardTrendPoint]))
      ? Number(row[chartKey as keyof DashboardTrendPoint])
      : 0,
  }))
  const hasValue = data.some((entry) => entry.value > 0)

  if (!hasValue && fallbackValue > 0) {
    const fallbackRows = data.length
      ? [...data]
      : [
          { label: "Start", value: 0 },
          { label: "Mid", value: 0 },
          {
            label: "Near now",
            value: Math.max(1, Math.round(fallbackValue * 0.45)),
          },
          { label: "Now", value: fallbackValue },
        ]
    const lastIndex = fallbackRows.length - 1
    fallbackRows[lastIndex] = {
      ...fallbackRows[lastIndex],
      value: fallbackValue,
    }
    return fallbackRows
  }

  return data
}

function profileSectionRoute(sectionId: string) {
  if (sectionId === "payoutSetup") return "/payouts"
  if (sectionId === "openingHours") return "/hours"
  return "/settings"
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4 px-4 lg:px-6">
      <Skeleton className="h-20 rounded-2xl" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-32 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Skeleton className="h-[360px] rounded-2xl" />
        <Skeleton className="h-[360px] rounded-2xl" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-[340px] rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

function DashboardEmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  action?: { label: string; to: string }
}) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-4 py-8 text-center">
      <div className="flex size-11 items-center justify-center rounded-2xl bg-background shadow-sm">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <div className="mt-3 text-sm font-semibold">{title}</div>
      <div className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
        {description}
      </div>
      {action ? (
        <Button variant="outline" size="sm" className="mt-4" asChild>
          <Link to={action.to}>{action.label}</Link>
        </Button>
      ) : null}
    </div>
  )
}

const dashboardKpiLinks: Record<string, string> = {
  placed: "/orders?tab=history",
  delivered: "/orders?tab=history&status=Delivered",
  net: "/payouts",
  active: "/orders?tab=live",
  cancelled: "/orders?tab=history",
}

export function DashboardPage() {
  const { orders } = useOrders()
  const { reviews } = useReviews()
  const { vouchers } = usePromotions()
  const { payoutTransactions, payouts, payoutMethod } = usePayouts()
  const { items: menuItems } = useMenuItems()
  const { openingHours } = useOpeningHours()
  const { isOnline } = useRestaurantStatus()
  const storeSettings = useAppStore((state) => state.storeSettings)
  const ownerAccount = useAppStore((state) => state.ownerAccount)
  const queryClient = useQueryClient()

  const [transitioningOrderId, setTransitioningOrderId] = React.useState<
    string | null
  >(null)
  const [dateFilter, setDateFilter] = React.useState<OrderDateFilterValue>({
    ...defaultOrderDateFilter,
    preset: "today",
  })
  const dashboardResetDisabled =
    dateFilter.preset === defaultOrderDateFilter.preset && !dateFilter.range
  const dashboardQueryParams = React.useMemo(
    () => buildOrderDateFilterQuery(dateFilter),
    [dateFilter]
  )

  const dashboardSummaryQuery = useOwnerDashboardSummaryQuery(
    ownerAccount.isAuthenticated,
    dashboardQueryParams
  )
  const orderTransitionMutation = useOwnerOrderTransitionMutation()

  const currentInterval = React.useMemo(
    () => getOrderDateFilterInterval(dateFilter),
    [dateFilter]
  )
  const previousInterval = React.useMemo(
    () => getPreviousOrderDateFilterInterval(dateFilter),
    [dateFilter]
  )

  const filteredOrders = React.useMemo(
    () =>
      orders.filter((order) =>
        isWithinInterval(new Date(order.timestamps.placedAt), currentInterval)
      ),
    [currentInterval, orders]
  )

  const previousOrders = React.useMemo(
    () =>
      orders.filter((order) =>
        isWithinInterval(new Date(order.timestamps.placedAt), previousInterval)
      ),
    [orders, previousInterval]
  )

  const orderById = React.useMemo(
    () => new Map(orders.map((order) => [order.id, order])),
    [orders]
  )

  const deliveredOrdersInCurrentInterval = React.useMemo(
    () =>
      orders.filter(
        (order) =>
          order.currentStatus === "Delivered" &&
          order.timestamps.deliveredAt &&
          isWithinInterval(
            new Date(order.timestamps.deliveredAt),
            currentInterval
          )
      ),
    [currentInterval, orders]
  )

  const deliveredOrdersInPreviousInterval = React.useMemo(
    () =>
      orders.filter(
        (order) =>
          order.currentStatus === "Delivered" &&
          order.timestamps.deliveredAt &&
          isWithinInterval(
            new Date(order.timestamps.deliveredAt),
            previousInterval
          )
      ),
    [orders, previousInterval]
  )

  const liveOrders = React.useMemo(
    () =>
      orders
        .filter((order) => liveOrderStatuses.includes(order.currentStatus))
        .slice()
        .sort(
          (a, b) =>
            new Date(b.timestamps.placedAt).getTime() -
            new Date(a.timestamps.placedAt).getTime()
        )
        .slice(0, 6),
    [orders]
  )

  const currentOrderMetrics = React.useMemo(
    () =>
      filteredOrders.reduce<DashboardOrderMetrics>((metrics, order) => {
        metrics.totalOrders += 1
        metrics.customerPhones.add(order.customer.phone)
        if (liveOrderStatuses.includes(order.currentStatus)) {
          metrics.pendingOrders += 1
        }
        return metrics
      }, createDashboardOrderMetrics()),
    [filteredOrders]
  )

  const todayAndTrendMetrics = React.useMemo(() => {
    const todayInterval = {
      start: startOfDay(new Date()),
      end: endOfDay(new Date()),
    }
    const { trendByKey, useWeeklyBuckets } =
      createDashboardTrendSeed(currentInterval)
    const todayHourCounts = Array.from({ length: 24 }, () => 0)

    orders.forEach((order) => {
      const placedAt = new Date(order.timestamps.placedAt)

      if (isWithinInterval(placedAt, currentInterval)) {
        const trendEntry = trendByKey.get(
          getDashboardTrendKey(placedAt, useWeeklyBuckets)
        )
        if (trendEntry) {
          if (
            order.currentStatus !== "Cancelled" &&
            order.currentStatus !== "Rejected"
          ) {
            trendEntry.orders += 1
            trendEntry.placedValue = (trendEntry.placedValue ?? 0) + order.total
          }
          if (liveOrderStatuses.includes(order.currentStatus)) {
            trendEntry.activeOrders = (trendEntry.activeOrders ?? 0) + 1
          }
        }
      }

      if (order.currentStatus === "Delivered" && order.timestamps.deliveredAt) {
        const deliveredAt = new Date(order.timestamps.deliveredAt)
        if (isWithinInterval(deliveredAt, currentInterval)) {
          const deliveredTrendEntry = trendByKey.get(
            getDashboardTrendKey(deliveredAt, useWeeklyBuckets)
          )
          if (deliveredTrendEntry) {
            deliveredTrendEntry.revenue += order.total
            deliveredTrendEntry.deliveredValue =
              (deliveredTrendEntry.deliveredValue ?? 0) + order.total
            deliveredTrendEntry.netEarnings =
              (deliveredTrendEntry.netEarnings ?? 0) + order.total
          }
        }
      }

      if (order.currentStatus === "Cancelled" && order.timestamps.cancelledAt) {
        const cancelledAt = new Date(order.timestamps.cancelledAt)
        if (isWithinInterval(cancelledAt, currentInterval)) {
          const failedTrendEntry = trendByKey.get(
            getDashboardTrendKey(cancelledAt, useWeeklyBuckets)
          )
          if (failedTrendEntry) {
            failedTrendEntry.failedOrders =
              (failedTrendEntry.failedOrders ?? 0) + 1
            failedTrendEntry.cancelledOrders =
              (failedTrendEntry.cancelledOrders ?? 0) + 1
            failedTrendEntry.failedValue =
              (failedTrendEntry.failedValue ?? 0) + order.total
          }
        }
      }

      if (order.currentStatus === "Rejected" && order.timestamps.rejectedAt) {
        const rejectedAt = new Date(order.timestamps.rejectedAt)
        if (isWithinInterval(rejectedAt, currentInterval)) {
          const failedTrendEntry = trendByKey.get(
            getDashboardTrendKey(rejectedAt, useWeeklyBuckets)
          )
          if (failedTrendEntry) {
            failedTrendEntry.failedOrders =
              (failedTrendEntry.failedOrders ?? 0) + 1
            failedTrendEntry.rejectedOrders =
              (failedTrendEntry.rejectedOrders ?? 0) + 1
            failedTrendEntry.failedValue =
              (failedTrendEntry.failedValue ?? 0) + order.total
          }
        }
      }

      if (isWithinInterval(placedAt, todayInterval)) {
        todayHourCounts[placedAt.getHours()] += 1
      }
    })

    return {
      orderTrend: Array.from(trendByKey.values()).map(
        ({
          label,
          orders,
          revenue,
          placedValue,
          deliveredValue,
          netEarnings,
          activeOrders,
          failedOrders,
          failedValue,
          cancelledOrders,
          rejectedOrders,
        }) => ({
          label,
          orders,
          revenue,
          placedValue,
          deliveredValue,
          netEarnings,
          activeOrders,
          failedOrders,
          failedValue,
          cancelledOrders,
          rejectedOrders,
        })
      ),
      todayHourCounts,
    }
  }, [currentInterval, orders])

  const currentRevenue = deliveredOrdersInCurrentInterval.reduce(
    (sum, order) => sum + order.total,
    0
  )
  const previousRevenue = deliveredOrdersInPreviousInterval.reduce(
    (sum, order) => sum + order.total,
    0
  )
  const currentNet = payoutTransactions
    .filter((transaction) => {
      if (transaction.type !== "earning") return false
      const relatedOrder = orderById.get(transaction.orderId)
      return Boolean(
        relatedOrder?.currentStatus === "Delivered" &&
        relatedOrder.timestamps.deliveredAt &&
        isWithinInterval(
          new Date(relatedOrder.timestamps.deliveredAt),
          currentInterval
        )
      )
    })
    .reduce((sum, transaction) => sum + transaction.netAmount, 0)
  const previousNet = payoutTransactions
    .filter((transaction) => {
      if (transaction.type !== "earning") return false
      const relatedOrder = orderById.get(transaction.orderId)
      return Boolean(
        relatedOrder?.currentStatus === "Delivered" &&
        relatedOrder.timestamps.deliveredAt &&
        isWithinInterval(
          new Date(relatedOrder.timestamps.deliveredAt),
          previousInterval
        )
      )
    })
    .reduce((sum, transaction) => sum + transaction.netAmount, 0)
  const currentCustomers = currentOrderMetrics.customerPhones.size
  const currentPending = currentOrderMetrics.pendingOrders
  const currentPlacedValue = filteredOrders
    .filter(
      (order) =>
        order.currentStatus !== "Cancelled" &&
        order.currentStatus !== "Rejected"
    )
    .reduce((sum, order) => sum + order.total, 0)
  const previousPlacedValue = previousOrders
    .filter(
      (order) =>
        order.currentStatus !== "Cancelled" &&
        order.currentStatus !== "Rejected"
    )
    .reduce((sum, order) => sum + order.total, 0)
  const currentCancelledOrders = orders.filter(
    (order) =>
      order.currentStatus === "Cancelled" &&
      isDateInInterval(order.timestamps.cancelledAt, currentInterval)
  )
  const previousCancelledOrders = orders.filter(
    (order) =>
      order.currentStatus === "Cancelled" &&
      isDateInInterval(order.timestamps.cancelledAt, previousInterval)
  )
  const currentRejectedOrders = orders.filter(
    (order) =>
      order.currentStatus === "Rejected" &&
      isDateInInterval(order.timestamps.rejectedAt, currentInterval)
  )
  const previousRejectedOrders = orders.filter(
    (order) =>
      order.currentStatus === "Rejected" &&
      isDateInInterval(order.timestamps.rejectedAt, previousInterval)
  )
  const currentCancelledValue = currentCancelledOrders.reduce(
    (sum, order) => sum + order.total,
    0
  )
  const currentRejectedValue = currentRejectedOrders.reduce(
    (sum, order) => sum + order.total,
    0
  )
  const currentFailedOrders =
    currentCancelledOrders.length + currentRejectedOrders.length
  const previousFailedOrders =
    previousCancelledOrders.length + previousRejectedOrders.length
  const currentFailedValue = currentCancelledValue + currentRejectedValue

  const kpis = [
    {
      key: "placed",
      label: "Placed food sales",
      value: formatCompactMoney(currentPlacedValue),
      trend: getTrendLabel(currentPlacedValue, previousPlacedValue),
      trendTone: getTrendMeta(currentPlacedValue, previousPlacedValue).tone,
      icon: ShoppingBag,
      helper: "Food subtotal minus owner discounts",
      chartKey: "placedValue",
    },
    {
      key: "delivered",
      label: "Delivered sales",
      value: formatCompactMoney(currentRevenue),
      trend: getTrendLabel(currentRevenue, previousRevenue),
      trendTone: getTrendMeta(currentRevenue, previousRevenue).tone,
      icon: BadgeDollarSign,
      helper: "Only successfully delivered orders",
      chartKey: "deliveredValue",
    },
    {
      key: "net",
      label: "Net Earnings",
      value: formatCompactMoney(currentNet),
      trend: getTrendLabel(currentNet, previousNet),
      trendTone: getTrendMeta(currentNet, previousNet).tone,
      icon: Wallet,
      helper: "After commission and owner discounts",
      chartKey: "netEarnings",
    },
    {
      key: "active",
      label: "Active orders",
      value: `${currentPending}`,
      trend: "Live right now",
      trendTone: "flat" as const,
      icon: Clock3,
      helper: "Needs kitchen or delivery attention",
      chartKey: "activeOrders",
      chartFallbackValue: currentPending,
    },
    {
      key: "cancelled",
      label: "Cancelled / rejected",
      value: `${currentFailedOrders}`,
      trend: getTrendLabel(currentFailedOrders, previousFailedOrders),
      trendTone: getTrendMeta(currentFailedOrders, previousFailedOrders).tone,
      icon: Ban,
      helper: `${formatCompactMoney(currentFailedValue)} failed order value`,
      chartKey: "failedOrders",
      chartFallbackValue: currentFailedOrders,
    },
  ]

  const dashboardSummary = dashboardSummaryQuery.data
  const kpisToRender = dashboardSummary
    ? [
        {
          key: "placed",
          label: "Placed food sales",
          value: formatCompactMoney(dashboardSummary.metrics.placedOrderValue),
          trend: getTrendLabel(
            dashboardSummary.metrics.placedOrderValue,
            dashboardSummary.metrics.previousPlacedOrderValue
          ),
          trendTone: getTrendMeta(
            dashboardSummary.metrics.placedOrderValue,
            dashboardSummary.metrics.previousPlacedOrderValue
          ).tone,
          icon: ShoppingBag,
          helper: "Food subtotal minus owner discounts",
          chartKey: "placedValue",
        },
        {
          key: "delivered",
          label: "Delivered sales",
          value: formatCompactMoney(
            dashboardSummary.metrics.deliveredOrderValue
          ),
          trend: getTrendLabel(
            dashboardSummary.metrics.deliveredOrderValue,
            dashboardSummary.metrics.previousDeliveredOrderValue
          ),
          trendTone: getTrendMeta(
            dashboardSummary.metrics.deliveredOrderValue,
            dashboardSummary.metrics.previousDeliveredOrderValue
          ).tone,
          icon: BadgeDollarSign,
          helper: "Only successfully delivered orders",
          chartKey: "deliveredValue",
        },
        {
          key: "net",
          label: "Net Earnings",
          value: formatCompactMoney(dashboardSummary.metrics.totalNetEarnings),
          trend: getTrendLabel(
            dashboardSummary.metrics.totalNetEarnings,
            dashboardSummary.metrics.previousTotalNetEarnings
          ),
          trendTone: getTrendMeta(
            dashboardSummary.metrics.totalNetEarnings,
            dashboardSummary.metrics.previousTotalNetEarnings
          ).tone,
          icon: Wallet,
          helper: "After commission and owner discounts",
          chartKey: "netEarnings",
        },
        {
          key: "active",
          label: "Active orders",
          value: `${dashboardSummary.metrics.pendingOrders}`,
          trend: "Live right now",
          trendTone: "flat" as const,
          icon: Clock3,
          helper: "Needs kitchen or delivery attention",
          chartKey: "activeOrders",
          chartFallbackValue: dashboardSummary.metrics.pendingOrders,
        },
        {
          key: "cancelled",
          label: "Cancelled / rejected",
          value: `${
            dashboardSummary.metrics.cancelledOrders +
            dashboardSummary.metrics.rejectedOrders
          }`,
          trend: getTrendLabel(
            dashboardSummary.metrics.cancelledOrders +
              dashboardSummary.metrics.rejectedOrders,
            dashboardSummary.metrics.previousCancelledOrders +
              dashboardSummary.metrics.previousRejectedOrders
          ),
          trendTone: getTrendMeta(
            dashboardSummary.metrics.cancelledOrders +
              dashboardSummary.metrics.rejectedOrders,
            dashboardSummary.metrics.previousCancelledOrders +
              dashboardSummary.metrics.previousRejectedOrders
          ).tone,
          icon: Ban,
          helper: `${formatCompactMoney(
            dashboardSummary.metrics.cancelledOrderValue +
              (dashboardSummary.metrics.rejectedOrderValue ?? 0)
          )} failed order value`,
          chartKey: "failedOrders",
          chartFallbackValue:
            dashboardSummary.metrics.cancelledOrders +
            dashboardSummary.metrics.rejectedOrders,
        },
      ]
    : kpis

  const orderTrend = React.useMemo(
    () =>
      normalizeDashboardTrendSeries(
        currentInterval,
        dashboardSummary?.salesTrend?.length
          ? dashboardSummary.salesTrend
          : todayAndTrendMetrics.orderTrend
      ),
    [currentInterval, dashboardSummary?.salesTrend, todayAndTrendMetrics]
  )

  const peakHours = React.useMemo(
    () =>
      Array.from({ length: 24 }, (_, hour) => {
        const count = todayAndTrendMetrics.todayHourCounts[hour] ?? 0
        return { label: formatHourLabel12(hour), orders: count }
      }).filter((entry) => entry.orders > 0),
    [todayAndTrendMetrics]
  )

  const topItems = React.useMemo(() => {
    const byName = filteredOrders.reduce<
      Record<string, { name: string; quantity: number; revenue: number }>
    >((accumulator, order) => {
      order.items.forEach((item) => {
        if (!accumulator[item.name]) {
          accumulator[item.name] = { name: item.name, quantity: 0, revenue: 0 }
        }
        accumulator[item.name].quantity += item.quantity
        accumulator[item.name].revenue += item.quantity * item.unitPrice
      })
      return accumulator
    }, {})

    return Object.values(byName)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 6)
  }, [filteredOrders])

  const recentReviews = React.useMemo(
    () =>
      reviews
        .slice()
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        .slice(0, 4),
    [reviews]
  )
  const liveOrdersToRender = React.useMemo(
    () =>
      dashboardSummary?.liveOrders?.length
        ? dashboardSummary.liveOrders
        : liveOrders.map((order) => ({
            id: order.id,
            orderNumber: order.orderNumber,
            customerName: order.customer.name,
            status: order.currentStatus,
            placedAt: order.timestamps.placedAt,
            value: order.total,
          })),
    [dashboardSummary, liveOrders]
  )
  const topItemsToRender = React.useMemo(
    () =>
      dashboardSummary?.topItems?.length
        ? dashboardSummary.topItems
        : topItems.map((item) => ({
            id: item.name,
            name: item.name,
            quantity: item.quantity,
            revenue: item.revenue,
          })),
    [dashboardSummary, topItems]
  )
  const recentReviewsToRender = React.useMemo(
    () =>
      dashboardSummary?.recentReviews?.length
        ? dashboardSummary.recentReviews
        : recentReviews.map((review) => ({
            id: review.id,
            customerName: review.user.name,
            rating: review.rating,
            comment: review.comment,
            createdAt: review.createdAt,
          })),
    [dashboardSummary, recentReviews]
  )

  const voucherSnapshot = React.useMemo(() => {
    const active = vouchers.filter(
      (voucher) => voucher.status === "Active"
    ).length
    const totalUsage = vouchers.reduce(
      (sum, voucher) => sum + voucher.analytics.totalUses,
      0
    )
    const revenueImpact = vouchers.reduce(
      (sum, voucher) => sum + voucher.analytics.revenueGenerated,
      0
    )
    return { active, totalUsage, revenueImpact }
  }, [vouchers])

  const earningsSummary = React.useMemo(
    () => calculateEarningsSummary(payoutTransactions, payouts),
    [payoutTransactions, payouts]
  )

  const payoutSummary = React.useMemo(() => {
    const lastPayout = payouts
      .filter((payout) => payout.status === "completed")
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0]

    return {
      available: earningsSummary.available,
      pending: earningsSummary.pending,
      lastPayout,
    }
  }, [earningsSummary.available, earningsSummary.pending, payouts])

  const statusSummary = React.useMemo(
    () => getStoreOperationalStatus(openingHours, isOnline),
    [isOnline, openingHours]
  )
  const profileCompletion = React.useMemo(
    () =>
      calculateProfileCompletion({
        storeSettings,
        openingHours,
        payoutMethod,
      }),
    [openingHours, payoutMethod, storeSettings]
  )

  function handleAcceptOrder(orderId: string) {
    setTransitioningOrderId(orderId)
    orderTransitionMutation.mutate(
      {
        orderId,
        nextStatus: "Accepted",
        actor: "owner",
      },
      {
        onSuccess: (updated) => {
          patchOwnerOrderQueryCaches(queryClient, updated)
          queryClient.invalidateQueries({ queryKey: ["owner", "orders"] })
          queryClient.invalidateQueries({
            queryKey: ["owner", "sidebar-summary"],
          })
          queryClient.invalidateQueries({
            queryKey: ["owner", "dashboard", "summary"],
          })
          queryClient.invalidateQueries({
            queryKey: ["owner", "payouts", "summary"],
          })
          queryClient.invalidateQueries({
            queryKey: ["owner", "payouts", "transactions"],
          })
          toast.success("Order accepted", {
            description: "The order moved to Accepted and synced with backend.",
          })
        },
        onError: (error) => {
          toast.error("Could not accept order", {
            description:
              error instanceof Error ? error.message : "Please try again.",
          })
        },
        onSettled: () => {
          setTransitioningOrderId(null)
        },
      }
    )
  }

  if (dashboardSummaryQuery.isPending && !dashboardSummaryQuery.data) {
    return <DashboardSkeleton />
  }

  return (
    <div className="space-y-4 px-4 lg:px-6">
      <EnforcementBanner />
      <ServiceHoursBanner />
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <OrderDateFilter
            value={dateFilter}
            onChange={setDateFilter}
            onReset={() => setDateFilter(defaultOrderDateFilter)}
            resetDisabled={dashboardResetDisabled}
          />
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/menu">
                <UtensilsCrossed className="size-4" />
                Add Menu Item
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/promotions">
                <Percent className="size-4" />
                Create Voucher
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/hours">
                <Clock3 className="size-4" />
                Update Opening Hours
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {kpisToRender.map((kpi) => {
          const sparklineData = buildKpiSparklineData(
            orderTrend,
            kpi.chartKey,
            kpi.chartFallbackValue
          )
          const sparklineMax = Math.max(
            ...sparklineData.map((entry) => entry.value),
            0
          )

          return (
            <Card key={kpi.key} className="rounded-2xl shadow-sm">
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">
                    {kpi.label}
                  </div>
                  <div className="text-3xl font-semibold">{kpi.value}</div>
                </div>
                <div className="inline-flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <kpi.icon className="size-5" />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div
                  className={cn(
                    "text-sm font-medium",
                    kpi.trendTone === "positive" && "text-emerald-600",
                    kpi.trendTone === "negative" && "text-rose-600",
                    kpi.trendTone === "flat" && "text-muted-foreground"
                  )}
                >
                  {kpi.trend}
                </div>
                <div className="mt-1 min-h-8 text-xs text-muted-foreground">
                  {kpi.helper}
                </div>
                <div className="mt-3 h-10">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sparklineData}>
                      <YAxis
                        hide
                        domain={[0, kpiSparklineAxisMax(sparklineMax)]}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#0f766e"
                        fill="#ccfbf1"
                        strokeWidth={2}
                        dot={false}
                        activeDot={false}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <Button
                  asChild
                  variant="ghost"
                  className="mt-2 -ml-3 h-auto justify-start rounded-2xl px-3 text-sm text-muted-foreground hover:text-foreground"
                >
                  <Link to={dashboardKpiLinks[kpi.key] ?? "/"}>
                    View details
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BadgeDollarSign className="size-4 text-muted-foreground" />
              Delivered Sales Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={orderTrend}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    domain={[0, trendAxisMax]}
                  />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#2563eb"
                    fill="#dbeafe"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock3 className="size-4 text-muted-foreground" />
              Quick Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">
                    Restaurant
                  </div>
                  <div className="mt-1 text-xl font-semibold">
                    {statusSummary.title}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {statusSummary.subtitle}
                  </div>
                </div>
                <Badge
                  className={
                    isOnline
                      ? "bg-emerald-600 text-white hover:bg-emerald-600"
                      : "bg-slate-900 text-white hover:bg-slate-900"
                  }
                >
                  {(dashboardSummary?.restaurant.isOnline ?? isOnline)
                    ? "Live"
                    : "Offline"}
                </Badge>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">
                  Active Orders
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  {dashboardSummary?.metrics.pendingOrders ?? liveOrders.length}
                </div>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Customers</div>
                <div className="mt-1 text-2xl font-semibold">
                  {dashboardSummary?.metrics.uniqueCustomers ??
                    currentCustomers}
                </div>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Next Payout</div>
                <div className="mt-1 text-lg font-semibold">
                  {dashboardSummary?.metrics.nextEstimatedPayoutAt
                    ? format(
                        new Date(
                          dashboardSummary.metrics.nextEstimatedPayoutAt
                        ),
                        "dd MMM"
                      )
                    : payoutSummary.lastPayout
                      ? format(
                          subDays(
                            new Date(payoutSummary.lastPayout.createdAt),
                            -7
                          ),
                          "dd MMM"
                        )
                      : "--"}
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="mb-2 text-sm font-medium">Peak Hours Today</div>
              <div className="space-y-2">
                {peakHours.length ? (
                  peakHours.slice(0, 4).map((entry) => (
                    <div key={entry.label} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span>{entry.label}</span>
                        <span>{entry.orders} orders</span>
                      </div>
                      <Progress
                        value={
                          peakHours[0]?.orders
                            ? (entry.orders / peakHours[0].orders) * 100
                            : 0
                        }
                        className="h-2"
                      />
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed bg-background px-3 py-4 text-xs text-muted-foreground">
                    Peak hour data will appear after today&apos;s first order.
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">Profile Completion</CardTitle>
              <div className="mt-1 text-sm text-muted-foreground">
                Complete your profile gradually to improve trust and visibility.
              </div>
            </div>
            <Badge variant="outline">
              {profileCompletion.percentage}% complete
            </Badge>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">
                  {profileCompletion.completedWeight}/100
                </span>
              </div>
              <Progress
                value={profileCompletion.percentage}
                className="h-2.5"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {profileCompletion.sections.map((section) => (
                <div
                  key={section.id}
                  className="rounded-xl border bg-muted/20 px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{section.label}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {section.benefit}
                      </div>
                    </div>
                    {section.isComplete ? (
                      <CheckCircle2 className="size-4 text-emerald-600" />
                    ) : (
                      <Badge variant="outline">{section.weight}%</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {profileCompletion.incompleteSections.length ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="text-sm font-medium text-amber-950">
                  Recommended next improvements
                </div>
                <div className="mt-3 space-y-2">
                  {profileCompletion.incompleteSections
                    .slice(0, 3)
                    .map((section) => (
                      <div
                        key={section.id}
                        className="flex items-start justify-between gap-3 rounded-lg bg-white/70 px-3 py-2"
                      >
                        <div>
                          <div className="text-sm font-medium text-amber-950">
                            {section.hint}
                          </div>
                          <div className="text-xs text-amber-800/80">
                            {section.benefit}
                          </div>
                        </div>
                        <Button size="sm" variant="outline" asChild>
                          <Link to={profileSectionRoute(section.id)}>
                            Update
                          </Link>
                        </Button>
                      </div>
                    ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="rounded-2xl shadow-sm xl:col-span-2">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">Live Orders Snapshot</CardTitle>
            <Button variant="outline" asChild>
              <Link to="/orders">
                View all orders
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {liveOrdersToRender.length ? (
              liveOrdersToRender.map((order) => (
                <div
                  key={order.id}
                  className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="grid gap-2 sm:grid-cols-4 sm:items-center lg:flex-1">
                    <div>
                      <div className="font-medium">{order.orderNumber}</div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(order.placedAt), "hh:mm a")}
                      </div>
                    </div>
                    <div className="font-medium">{order.customerName}</div>
                    <div>{formatCompactMoney(order.value)}</div>
                    <Badge variant="outline">
                      {orderStatusLabels[
                        order.status as keyof typeof orderStatusLabels
                      ] ?? order.status}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    {order.status === "New" ? (
                      <Button
                        size="sm"
                        onClick={() => handleAcceptOrder(order.id)}
                        disabled={
                          orderTransitionMutation.isPending &&
                          transitioningOrderId === order.id
                        }
                      >
                        {orderTransitionMutation.isPending &&
                        transitioningOrderId === order.id ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="size-4" />
                        )}
                        {orderTransitionMutation.isPending &&
                        transitioningOrderId === order.id
                          ? "Accepting..."
                          : "Accept"}
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/orders">View</Link>
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <DashboardEmptyState
                icon={ClipboardList}
                title="No live orders right now"
                description="New, accepted, preparing, ready, and picked-up orders will appear here immediately."
                action={{ label: "Open orders", to: "/orders" }}
              />
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button variant="outline" className="justify-between" asChild>
              <Link to="/menu">
                <span className="inline-flex items-center gap-2">
                  <UtensilsCrossed className="size-4" />
                  Add Menu Item
                </span>
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button variant="outline" className="justify-between" asChild>
              <Link to="/promotions">
                <span className="inline-flex items-center gap-2">
                  <Percent className="size-4" />
                  Create Voucher
                </span>
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button variant="outline" className="justify-between" asChild>
              <Link to="/categories">
                <span className="inline-flex items-center gap-2">
                  <Tags className="size-4" />
                  Manage Categories
                </span>
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button variant="outline" className="justify-between" asChild>
              <Link to="/orders">
                <span className="inline-flex items-center gap-2">
                  <ShoppingBag className="size-4" />
                  View Orders
                </span>
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button variant="outline" className="justify-between" asChild>
              <Link to="/hours">
                <span className="inline-flex items-center gap-2">
                  <Clock3 className="size-4" />
                  Update Opening Hours
                </span>
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Top Selling Items</CardTitle>
            <Badge variant="outline">{menuItems.length} menu items</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {topItemsToRender.length ? (
              topItemsToRender.map((item) => (
                <div
                  key={item.id || item.name}
                  className="flex items-center justify-between rounded-xl border bg-muted/20 px-3 py-2"
                >
                  <div>
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.quantity} orders
                    </div>
                  </div>
                  <div className="text-sm font-semibold">
                    {formatCompactMoney(item.revenue)}
                  </div>
                </div>
              ))
            ) : (
              <DashboardEmptyState
                icon={PackageOpen}
                title="No item sales yet"
                description="Top items will rank themselves here after customers place orders in this date range."
                action={{ label: "Review menu", to: "/menu" }}
              />
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Reviews</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/reviews">View all reviews</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentReviewsToRender.length ? (
              recentReviewsToRender.map((review) => (
                <div
                  key={review.id}
                  className="rounded-xl border bg-muted/20 p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{review.customerName}</div>
                    <div className="inline-flex items-center gap-1 text-amber-600">
                      <Star className="size-4 fill-current" />
                      {review.rating}
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    {review.comment ||
                      "Customer left a rating without comment."}
                  </div>
                </div>
              ))
            ) : (
              <DashboardEmptyState
                icon={MessageSquareText}
                title="No recent reviews"
                description="Customer ratings and review comments will appear here after delivered orders are reviewed."
                action={{ label: "Open reviews", to: "/reviews" }}
              />
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">
              Payout & Promotion Snapshot
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Available</div>
                <div className="mt-1 text-2xl font-semibold text-emerald-700">
                  {formatCompactMoney(payoutSummary.available)}
                </div>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Pending</div>
                <div className="mt-1 text-2xl font-semibold text-amber-700">
                  {formatCompactMoney(payoutSummary.pending)}
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="text-sm font-medium">Voucher Snapshot</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <div className="text-xs text-muted-foreground">Active</div>
                  <div className="text-lg font-semibold">
                    {voucherSnapshot.active}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">
                    Total Usage
                  </div>
                  <div className="text-lg font-semibold">
                    {voucherSnapshot.totalUsage}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Impact</div>
                  <div className="text-lg font-semibold">
                    {formatCompactMoney(voucherSnapshot.revenueImpact)}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="text-sm font-medium">Last Payout</div>
              <div className="mt-2 text-lg font-semibold">
                {payoutSummary.lastPayout
                  ? formatCompactMoney(payoutSummary.lastPayout.amount)
                  : "--"}
              </div>
              <div className="text-sm text-muted-foreground">
                {payoutSummary.lastPayout
                  ? format(
                      new Date(payoutSummary.lastPayout.createdAt),
                      "dd MMM yyyy"
                    )
                  : "No completed payout yet"}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
