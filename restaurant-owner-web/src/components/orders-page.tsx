import * as React from "react"

import { format, formatDistanceToNowStrict } from "date-fns"
import {
  BadgeDollarSign,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  Flame,
  Filter,
  LoaderCircle,
  PackageCheck,
  RotateCcw,
  Search,
  ShoppingBag,
  TriangleAlert,
  XCircle,
} from "lucide-react"

import {
  buildOrderDateFilterQuery,
  defaultOrderDateFilter,
  OrderDateFilter,
  type OrderDateFilterValue,
} from "@/components/orders/order-date-filter"
import { OrderDetailsDialog } from "@/components/orders/order-details-dialog"
import { useOrders } from "@/components/orders/orders-context"
import {
  mapOwnerOrder,
  type OwnerListResponse,
  type OwnerOrderResponse,
} from "@/lib/backend-mappers"
import { patchOwnerOrderQueryCaches } from "@/lib/owner-order-cache"
import {
  useOwnerOrderTransitionMutation,
  useOwnerOrdersQuery,
  useOwnerStoreSettingsQuery,
} from "@/hooks/use-owner-api"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import {
  allowedTransitions,
  canActorTransitionOrder,
  type Order,
  type OrderOperationalTiming,
  type OrderPaymentMethod,
  type OrderStatus,
  formatOrderMoney,
  getOrderItemsCount,
  historyOrderStatuses,
  liveOrderStatuses,
  orderStatusLabels,
  orderStatusTimestampKey,
} from "@/components/orders/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { useAppStore } from "@/store/app-store"
import { useQueryClient } from "@tanstack/react-query"

type OrderTab = "live" | "history"
type SortKey = "latest" | "oldest" | "highestValue"
type PaymentFilter = "all" | OrderPaymentMethod
const pageSizeOptions = [5, 10, 20, 30]

function getAutoCancelRemainingSeconds(order: Order, now = Date.now()) {
  if (order.currentStatus !== "New" || !order.autoCancel?.applies) return null
  const autoCancelAt = order.autoCancel.autoCancelAt
    ? new Date(order.autoCancel.autoCancelAt).getTime()
    : 0

  if (autoCancelAt > 0 && !Number.isNaN(autoCancelAt)) {
    return Math.max(0, Math.ceil((autoCancelAt - now) / 1000))
  }

  return typeof order.autoCancel.remainingSeconds === "number"
    ? Math.max(0, order.autoCancel.remainingSeconds)
    : null
}

function formatDurationFromSeconds(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/A"
  const seconds = Math.max(0, Math.ceil(value))
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const extraMinutes = minutes % 60
    return `${hours}h ${extraMinutes}m`
  }
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`
  return `${remainingSeconds}s`
}

function getDelayState(order: Order, now = Date.now()) {
  if (order.currentStatus === "New") {
    const placed = new Date(order.timestamps.placedAt).getTime()
    const minutes = Math.floor((now - placed) / 60000)
    if (minutes >= 10)
      return { label: "Urgent", minutes, tone: "critical" as const }
    if (minutes >= 5)
      return { label: "Delayed", minutes, tone: "warning" as const }
  }

  if (order.currentStatus === "Accepted") {
    const acceptedAt = new Date(
      order.timestamps.acceptedAt ?? order.timestamps.placedAt
    ).getTime()
    const minutes = Math.floor((now - acceptedAt) / 60000)

    if (minutes >= 12)
      return { label: "Prep starting late", minutes, tone: "critical" as const }
    if (minutes >= 8)
      return { label: "Prep not started", minutes, tone: "warning" as const }
  }

  if (order.currentStatus === "Preparing") {
    const preparingAt = new Date(
      order.timestamps.preparingAt ??
        order.timestamps.acceptedAt ??
        order.timestamps.placedAt
    ).getTime()
    const minutes = Math.floor((now - preparingAt) / 60000)

    if (minutes >= 25)
      return { label: "Needs follow-up", minutes, tone: "critical" as const }
    if (minutes >= 18)
      return { label: "Taking longer", minutes, tone: "warning" as const }
  }

  return null
}

function pluralizeMinutes(value: number) {
  return `${value} min${value === 1 ? "" : "s"}`
}

function getOrderOperationalTiming(
  order: Order,
  averagePreparationMinutes: number,
  now = Date.now()
): OrderOperationalTiming {
  const prepTargetMinutes = Math.max(5, averagePreparationMinutes)

  if (order.currentStatus === "New") {
    const autoCancelSeconds = getAutoCancelRemainingSeconds(order, now)
    const placedMinutes = Math.max(
      0,
      Math.floor((now - new Date(order.timestamps.placedAt).getTime()) / 60000)
    )
    if (autoCancelSeconds !== null) {
      return {
        phaseLabel: "Awaiting acceptance",
        primaryLabel:
          autoCancelSeconds === 0
            ? "Auto-cancel due now"
            : `Accept in ${formatDurationFromSeconds(autoCancelSeconds)}`,
        secondaryLabel: `Auto-cancel after ${order.autoCancel?.autoCancelAfterMinutes ?? 0} min if not accepted.`,
        tone:
          autoCancelSeconds <= 60
            ? "critical"
            : autoCancelSeconds <= 180
              ? "warning"
              : "neutral",
        lateByMinutes: autoCancelSeconds === 0 ? placedMinutes : null,
        remainingMinutes: Math.ceil(autoCancelSeconds / 60),
        remainingSeconds: autoCancelSeconds,
      }
    }
    return {
      phaseLabel: "New order",
      primaryLabel: `${pluralizeMinutes(placedMinutes)} since placed`,
      secondaryLabel: "Accept soon to keep the kitchen on track.",
      tone:
        placedMinutes >= 10
          ? "critical"
          : placedMinutes >= 5
            ? "warning"
            : "neutral",
      lateByMinutes: placedMinutes >= 5 ? placedMinutes - 5 : null,
      remainingMinutes: placedMinutes < 5 ? 5 - placedMinutes : null,
      remainingSeconds: placedMinutes < 5 ? (5 - placedMinutes) * 60 : null,
    }
  }

  if (order.currentStatus === "Accepted") {
    const acceptedMinutes = Math.max(
      0,
      Math.floor(
        (now -
          new Date(
            order.timestamps.acceptedAt ?? order.timestamps.placedAt
          ).getTime()) /
          60000
      )
    )
    return {
      phaseLabel: "Prep not started",
      primaryLabel:
        acceptedMinutes >= 8
          ? `${pluralizeMinutes(acceptedMinutes - 8)} late to start`
          : `${pluralizeMinutes(8 - acceptedMinutes)} left to start`,
      secondaryLabel: `Average prep target is ${pluralizeMinutes(prepTargetMinutes)}.`,
      tone:
        acceptedMinutes >= 12
          ? "critical"
          : acceptedMinutes >= 8
            ? "warning"
            : "neutral",
      lateByMinutes: acceptedMinutes >= 8 ? acceptedMinutes - 8 : null,
      remainingMinutes: acceptedMinutes < 8 ? 8 - acceptedMinutes : null,
    }
  }

  if (order.currentStatus === "Preparing") {
    const preparingMinutes = Math.max(
      0,
      Math.floor(
        (now -
          new Date(
            order.timestamps.preparingAt ??
              order.timestamps.acceptedAt ??
              order.timestamps.placedAt
          ).getTime()) /
          60000
      )
    )
    return {
      phaseLabel: "Kitchen timing",
      primaryLabel:
        preparingMinutes > prepTargetMinutes
          ? `${pluralizeMinutes(preparingMinutes - prepTargetMinutes)} behind prep target`
          : `${pluralizeMinutes(prepTargetMinutes - preparingMinutes)} left on average`,
      secondaryLabel: `Average prep target is ${pluralizeMinutes(prepTargetMinutes)}.`,
      tone:
        preparingMinutes >= prepTargetMinutes + 10
          ? "critical"
          : preparingMinutes > prepTargetMinutes
            ? "warning"
            : "success",
      lateByMinutes:
        preparingMinutes > prepTargetMinutes
          ? preparingMinutes - prepTargetMinutes
          : null,
      remainingMinutes:
        preparingMinutes <= prepTargetMinutes
          ? prepTargetMinutes - preparingMinutes
          : null,
    }
  }

  if (order.currentStatus === "ReadyForPickup") {
    const readyMinutes = Math.max(
      0,
      Math.floor(
        (now -
          new Date(
            order.timestamps.readyForPickupAt ??
              order.timestamps.preparingAt ??
              order.timestamps.placedAt
          ).getTime()) /
          60000
      )
    )
    return {
      phaseLabel: "Ready for pickup",
      primaryLabel: `${pluralizeMinutes(readyMinutes)} waiting for pickup`,
      secondaryLabel: order.rider
        ? `${order.rider.name} is assigned for handoff.`
        : "Waiting for a rider handoff.",
      tone:
        readyMinutes >= 15
          ? "critical"
          : readyMinutes >= 8
            ? "warning"
            : "success",
      lateByMinutes: readyMinutes >= 8 ? readyMinutes - 8 : null,
      remainingMinutes: null,
    }
  }

  if (order.currentStatus === "PickedUp") {
    const pickedUpMinutes = Math.max(
      0,
      Math.floor(
        (now -
          new Date(
            order.timestamps.pickedUpAt ??
              order.timestamps.readyForPickupAt ??
              order.timestamps.placedAt
          ).getTime()) /
          60000
      )
    )
    return {
      phaseLabel: "Out for delivery",
      primaryLabel: `${pluralizeMinutes(pickedUpMinutes)} since handoff`,
      secondaryLabel: "The rider is completing the final delivery leg.",
      tone: "neutral",
      lateByMinutes: null,
      remainingMinutes: null,
    }
  }

  if (order.currentStatus === "Delivered") {
    return {
      phaseLabel: "Delivered",
      primaryLabel: order.timestamps.deliveredAt
        ? `Completed at ${format(new Date(order.timestamps.deliveredAt), "hh:mm a")}`
        : "Completed",
      secondaryLabel: `Average prep target was ${pluralizeMinutes(prepTargetMinutes)}.`,
      tone: "success",
      lateByMinutes: null,
      remainingMinutes: null,
    }
  }

  return {
    phaseLabel: order.currentStatus === "Rejected" ? "Rejected" : "Cancelled",
    primaryLabel: "Order closed",
    secondaryLabel: `Average prep target was ${pluralizeMinutes(prepTargetMinutes)}.`,
    tone: "neutral",
    lateByMinutes: null,
    remainingMinutes: null,
  }
}

function OrdersSkeleton() {
  return (
    <div className="space-y-4 px-4 lg:px-6">
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row">
          <Skeleton className="h-10 w-full lg:max-w-xs" />
          <Skeleton className="h-10 w-full lg:w-44" />
          <Skeleton className="h-10 w-full lg:w-40" />
        </div>
      </div>
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="mb-3 h-14 w-full last:mb-0" />
        ))}
      </div>
    </div>
  )
}

function getStatusBadgeClass(status: OrderStatus) {
  if (status === "New") return "border-amber-200 bg-amber-50 text-amber-700"
  if (status === "Accepted" || status === "Preparing") {
    return "border-sky-200 bg-sky-50 text-sky-700"
  }
  if (status === "ReadyForPickup" || status === "PickedUp") {
    return "border-violet-200 bg-violet-50 text-violet-700"
  }
  if (status === "Delivered") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  }
  return "border-rose-200 bg-rose-50 text-rose-700"
}

function getPaymentMethodLabel(paymentMethod: OrderPaymentMethod) {
  return paymentMethod === "Bkash" ? "Bkash" : "Cash"
}

function getSummaryCardTone(
  tone: "warning" | "info" | "success" | "violet" | "rose"
) {
  if (tone === "warning") {
    return {
      card: "border-amber-200/80 bg-amber-50/60",
      iconWrap: "bg-amber-100 text-amber-700",
      value: "text-amber-900",
    }
  }
  if (tone === "info") {
    return {
      card: "border-sky-200/80 bg-sky-50/60",
      iconWrap: "bg-sky-100 text-sky-700",
      value: "text-sky-900",
    }
  }
  if (tone === "success") {
    return {
      card: "border-emerald-200/80 bg-emerald-50/60",
      iconWrap: "bg-emerald-100 text-emerald-700",
      value: "text-emerald-900",
    }
  }
  if (tone === "violet") {
    return {
      card: "border-violet-200/80 bg-violet-50/60",
      iconWrap: "bg-violet-100 text-violet-700",
      value: "text-violet-900",
    }
  }

  return {
    card: "border-rose-200/80 bg-rose-50/60",
    iconWrap: "bg-rose-100 text-rose-700",
    value: "text-rose-900",
  }
}

function getNextPrimaryAction(status: OrderStatus) {
  if (status === "New") {
    return { label: "Accept", status: "Accepted" as const, icon: CheckCircle2 }
  }
  if (status === "Accepted") {
    return {
      label: "Mark Preparing",
      status: "Preparing" as const,
      icon: Clock3,
    }
  }
  if (status === "Preparing") {
    return {
      label: "Ready for Pickup",
      status: "ReadyForPickup" as const,
      icon: PackageCheck,
    }
  }
  return null
}

function canOwnerCancelOrder(status: OrderStatus) {
  return status === "Accepted" || status === "Preparing"
}

function OrdersTable({
  orders,
  emptyTitle,
  emptyDescription,
  onView,
  onUpdateStatus,
  onReject,
  pendingOrderId,
  pendingAction,
  averagePreparationMinutes,
  clockTick,
}: {
  orders: Order[]
  emptyTitle: string
  emptyDescription: string
  onView: (order: Order) => void
  onUpdateStatus: (orderId: string, nextStatus: OrderStatus) => void
  onReject: (order: Order) => void
  pendingOrderId?: string | null
  pendingAction?: "status" | "assign" | "reject" | null
  averagePreparationMinutes: number
  clockTick: number
}) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <Table className="min-w-[980px]">
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow className="hover:bg-transparent">
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Restaurant Sales</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Placed</TableHead>
              <TableHead>Elapsed</TableHead>
              <TableHead className="pr-4 text-right lg:pr-6">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length > 0 ? (
              orders.map((order) => {
                const primaryAction = getNextPrimaryAction(order.currentStatus)
                const delayState = getDelayState(order, clockTick)
                const operationalTiming = getOrderOperationalTiming(
                  order,
                  averagePreparationMinutes,
                  clockTick
                )
                const autoCancelSeconds = getAutoCancelRemainingSeconds(
                  order,
                  clockTick
                )
                const isPendingRow = pendingOrderId === order.id
                const isStatusPending =
                  isPendingRow && pendingAction === "status"
                const isRejectPending =
                  isPendingRow && pendingAction === "reject"

                return (
                  <TableRow
                    key={order.id}
                    className={
                      delayState?.tone === "critical"
                        ? "bg-rose-50/60 hover:bg-rose-50/70"
                        : order.currentStatus === "ReadyForPickup"
                          ? "bg-violet-50/50 hover:bg-violet-50/70"
                          : undefined
                    }
                  >
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{order.orderNumber}</div>
                        <div className="text-xs text-muted-foreground">
                          {getPaymentMethodLabel(order.paymentMethod)}
                        </div>
                        {order.appliedVouchers.length ? (
                          <Badge
                            variant="outline"
                            className="border-amber-200 bg-amber-50 text-amber-700"
                          >
                            Voucher applied
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/90">
                          {operationalTiming.phaseLabel}:
                        </span>{" "}
                        {operationalTiming.primaryLabel}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{order.customer.name}</div>
                        {order.customer.phone ? (
                          <div className="text-xs text-muted-foreground">
                            {order.customer.phone}
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {getOrderItemsCount(order)} items
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {order.items[0]?.name}
                        {order.items.length > 1
                          ? ` +${order.items.length - 1} more`
                          : ""}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatOrderMoney(order.total)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={getStatusBadgeClass(order.currentStatus)}
                        >
                          {orderStatusLabels[order.currentStatus]}
                        </Badge>
                        {delayState ? (
                          <Badge
                            variant="outline"
                            className={
                              delayState.tone === "critical"
                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                            }
                          >
                            <TriangleAlert className="mr-1 size-3" />
                            {delayState.label}
                          </Badge>
                        ) : null}
                        {autoCancelSeconds !== null ? (
                          <Badge
                            variant="outline"
                            className={
                              autoCancelSeconds <= 60
                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                            }
                          >
                            <Clock3 className="mr-1 size-3" />
                            {autoCancelSeconds === 0
                              ? "Auto-cancel due"
                              : `Accept in ${formatDurationFromSeconds(autoCancelSeconds)}`}
                          </Badge>
                        ) : null}
                        {order.currentStatus === "ReadyForPickup" ? (
                          <Badge
                            variant="outline"
                            className={
                              order.rider
                                ? "border-sky-200 bg-sky-50 text-sky-700"
                                : "border-slate-200 bg-slate-50 text-slate-700"
                            }
                          >
                            {order.rider
                              ? `Rider: ${order.rider.name}`
                              : "Awaiting rider"}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div>
                          {format(
                            new Date(order.timestamps.placedAt),
                            "hh:mm a"
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(
                            new Date(order.timestamps.placedAt),
                            "dd MMM"
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div
                        className={
                          delayState
                            ? delayState.tone === "critical"
                              ? "font-medium text-rose-700"
                              : "font-medium text-amber-700"
                            : undefined
                        }
                      >
                        {formatDistanceToNowStrict(
                          new Date(order.timestamps.placedAt)
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="pr-4 text-right lg:pr-6">
                      <div className="flex justify-end gap-2">
                        {order.currentStatus === "New" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onReject(order)}
                            disabled={isPendingRow}
                          >
                            {isRejectPending ? (
                              <LoaderCircle className="size-4 animate-spin" />
                            ) : (
                              <XCircle className="size-4" />
                            )}
                            {isRejectPending ? "Rejecting..." : "Reject"}
                          </Button>
                        ) : null}
                        {canOwnerCancelOrder(order.currentStatus) ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onUpdateStatus(order.id, "Cancelled")}
                            disabled={isPendingRow}
                          >
                            {isStatusPending ? (
                              <LoaderCircle className="size-4 animate-spin" />
                            ) : (
                              <Ban className="size-4" />
                            )}
                            {isStatusPending ? "Cancelling..." : "Cancel"}
                          </Button>
                        ) : null}
                        {primaryAction ? (
                          <Button
                            size="sm"
                            onClick={() =>
                              onUpdateStatus(order.id, primaryAction.status)
                            }
                            disabled={isPendingRow}
                          >
                            {isStatusPending ? (
                              <LoaderCircle className="size-4 animate-spin" />
                            ) : (
                              <primaryAction.icon className="size-4" />
                            )}
                            {isStatusPending
                              ? "Updating..."
                              : primaryAction.label}
                          </Button>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onView(order)}
                          disabled={isPendingRow}
                        >
                          <Eye className="size-4" />
                          View
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="p-10 text-center">
                  <div className="mx-auto max-w-sm space-y-2">
                    <div className="inline-flex size-12 items-center justify-center rounded-full bg-muted">
                      <ShoppingBag className="size-5 text-muted-foreground" />
                    </div>
                    <div className="font-medium">{emptyTitle}</div>
                    <div className="text-sm text-muted-foreground">
                      {emptyDescription}
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export function OrdersPage() {
  const { orders, setOrders, isLoading } = useOrders()
  const ownerAccount = useAppStore((state) => state.ownerAccount)
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = React.useState<OrderTab>("live")
  const [search, setSearch] = React.useState("")
  const [sortBy, setSortBy] = React.useState<SortKey>("latest")
  const [selectedStatus, setSelectedStatus] = React.useState<
    "all" | OrderStatus
  >("all")
  const [viewingOrder, setViewingOrder] = React.useState<Order | null>(null)
  const [rejectingOrder, setRejectingOrder] = React.useState<Order | null>(null)
  const [rejectionReason, setRejectionReason] = React.useState("Kitchen busy")
  const [rejectionNote, setRejectionNote] = React.useState("")
  const [pageSize, setPageSize] = React.useState(10)
  const [pageIndex, setPageIndex] = React.useState(0)
  const [historyDateFilter, setHistoryDateFilter] =
    React.useState<OrderDateFilterValue>(defaultOrderDateFilter)
  const [paymentFilter, setPaymentFilter] = React.useState<PaymentFilter>("all")
  const [showUrgentOnly, setShowUrgentOnly] = React.useState(false)
  const [clockTick, setClockTick] = React.useState(() => Date.now())
  const [pendingOrderAction, setPendingOrderAction] = React.useState<{
    orderId: string
    type: "status" | "reject"
  } | null>(null)
  const orderTransitionMutation = useOwnerOrderTransitionMutation()
  const storeSettingsQuery = useOwnerStoreSettingsQuery(
    ownerAccount.isAuthenticated
  )
  const queryClient = useQueryClient()
  const debouncedSearch = useDebouncedValue(search)
  const historyRangeQuery = React.useMemo(
    () => buildOrderDateFilterQuery(historyDateFilter),
    [historyDateFilter]
  )

  const backendQueryParams = React.useMemo(() => {
    const shouldFilterClientSide = activeTab === "live" && showUrgentOnly

    return {
      tab: activeTab,
      status: selectedStatus === "all" ? undefined : selectedStatus,
      search: debouncedSearch.trim() ? debouncedSearch.trim() : undefined,
      paymentMethod: paymentFilter === "all" ? undefined : paymentFilter,
      sortBy,
      preset: activeTab === "history" ? historyRangeQuery.preset : undefined,
      from: activeTab === "history" ? historyRangeQuery.from : undefined,
      to: activeTab === "history" ? historyRangeQuery.to : undefined,
      page: shouldFilterClientSide ? 1 : pageIndex + 1,
      pageSize: shouldFilterClientSide ? 500 : pageSize,
    }
  }, [
    activeTab,
    debouncedSearch,
    historyRangeQuery,
    pageIndex,
    pageSize,
    paymentFilter,
    selectedStatus,
    showUrgentOnly,
    sortBy,
  ])
  const ordersQuery = useOwnerOrdersQuery(
    ownerAccount.isAuthenticated,
    backendQueryParams
  )
  const liveOrdersCountQuery = useOwnerOrdersQuery(
    ownerAccount.isAuthenticated && activeTab === "history",
    {
      tab: "live",
      page: 1,
      pageSize: 1,
    }
  )
  const initialLoading =
    isLoading ||
    (ordersQuery.isPending && !ordersQuery.data && orders.length === 0)
  const isRefreshing = ordersQuery.isFetching && !initialLoading
  const averagePreparationMinutes = Math.max(
    5,
    storeSettingsQuery.data?.preparationTimeMinutes ?? 20
  )

  const ordersSource = React.useMemo<Order[]>(() => {
    if (!ordersQuery.data) return orders
    return (
      ordersQuery.data as OwnerListResponse<OwnerOrderResponse>
    ).items.map(mapOwnerOrder)
  }, [orders, ordersQuery.data])

  const hasActiveAutoCancelCountdown = React.useMemo(
    () =>
      ordersSource.some(
        (order) => order.currentStatus === "New" && order.autoCancel?.applies
      ),
    [ordersSource]
  )

  React.useEffect(() => {
    setClockTick(Date.now())
    const timer = window.setInterval(
      () => setClockTick(Date.now()),
      hasActiveAutoCancelCountdown ? 1000 : 60000
    )
    return () => window.clearInterval(timer)
  }, [hasActiveAutoCancelCountdown])

  React.useEffect(() => {
    const queryTab = searchParams.get("tab")
    if (queryTab === "live" || queryTab === "history") {
      setActiveTab(queryTab)
    }
  }, [searchParams])

  React.useEffect(() => {
    const queryStatus = searchParams.get("status")
    if (!queryStatus) return

    const validStatuses = [...liveOrderStatuses, ...historyOrderStatuses]
    if (validStatuses.includes(queryStatus as OrderStatus)) {
      setSelectedStatus(queryStatus as OrderStatus)
      setActiveTab(
        historyOrderStatuses.includes(queryStatus as OrderStatus)
          ? "history"
          : "live"
      )
    }
  }, [searchParams])

  React.useEffect(() => {
    const orderId = searchParams.get("order") ?? searchParams.get("orderId")
    if (!orderId) return

    const matchedOrder = ordersSource.find((order) => order.id === orderId)
    if (matchedOrder) {
      setViewingOrder(matchedOrder)
    }
  }, [ordersSource, searchParams])

  React.useEffect(() => {
    if (!viewingOrder) return
    const latestOrder = ordersSource.find(
      (order) => order.id === viewingOrder.id
    )
    if (!latestOrder || latestOrder === viewingOrder) return
    setViewingOrder(latestOrder)
  }, [ordersSource, viewingOrder])

  React.useEffect(() => {
    setSelectedStatus("all")
    setShowUrgentOnly(false)
  }, [activeTab])

  React.useEffect(() => {
    setPageIndex(0)
  }, [
    activeTab,
    debouncedSearch,
    selectedStatus,
    sortBy,
    pageSize,
    historyDateFilter,
    paymentFilter,
    showUrgentOnly,
  ])

  React.useEffect(() => {
    if (!ordersQuery.error) return

    const message =
      ordersQuery.error instanceof Error
        ? ordersQuery.error.message
        : "Unable to load filtered orders."

    toast.error("Orders filter failed", {
      description: message,
    })
  }, [ordersQuery.error])

  const visibleStatuses =
    activeTab === "live" ? liveOrderStatuses : historyOrderStatuses
  const liveStatusCounts = React.useMemo(
    () =>
      ordersSource.reduce<Record<string, number>>((accumulator, order) => {
        accumulator[order.currentStatus] =
          (accumulator[order.currentStatus] ?? 0) + 1
        return accumulator
      }, {}),
    [ordersSource]
  )
  const liveResetDisabled =
    !search &&
    selectedStatus === "all" &&
    paymentFilter === "all" &&
    sortBy === "latest" &&
    !showUrgentOnly
  const historyResetDisabled =
    !search &&
    selectedStatus === "all" &&
    paymentFilter === "all" &&
    sortBy === "latest" &&
    historyDateFilter.preset === defaultOrderDateFilter.preset &&
    !historyDateFilter.range
  function resetLiveFilters() {
    setSearch("")
    setSelectedStatus("all")
    setPaymentFilter("all")
    setSortBy("latest")
    setShowUrgentOnly(false)
  }

  function resetHistoryFilters() {
    setSearch("")
    setSelectedStatus("all")
    setPaymentFilter("all")
    setSortBy("latest")
    setHistoryDateFilter(defaultOrderDateFilter)
  }

  const filteredOrders = React.useMemo(() => {
    if (activeTab === "live" && showUrgentOnly) {
      void clockTick
    }

    return ordersSource.filter((order) => {
      const matchesUrgent =
        activeTab !== "live" || !showUrgentOnly ? true : !!getDelayState(order)

      return matchesUrgent
    })
  }, [activeTab, clockTick, ordersSource, showUrgentOnly])

  const totalOrders =
    activeTab === "history" || showUrgentOnly || !ordersQuery.data
      ? filteredOrders.length
      : ((ordersQuery.data as OwnerListResponse<OwnerOrderResponse> | undefined)
          ?.total ?? filteredOrders.length)
  const liveCount =
    activeTab === "live"
      ? totalOrders
      : ((
          liveOrdersCountQuery.data as
            | OwnerListResponse<OwnerOrderResponse>
            | undefined
        )?.total ??
        orders.filter((order) =>
          liveOrderStatuses.includes(order.currentStatus)
        ).length)

  const pageCount = Math.max(1, Math.ceil(totalOrders / pageSize))
  const safePageIndex = Math.min(pageIndex, pageCount - 1)

  const paginatedOrders = React.useMemo(() => {
    if (activeTab !== "history" && !showUrgentOnly) return filteredOrders
    const start = safePageIndex * pageSize
    return filteredOrders.slice(start, start + pageSize)
  }, [activeTab, filteredOrders, pageSize, safePageIndex, showUrgentOnly])

  const liveSummaryCards = React.useMemo(() => {
    const kitchenAttentionCount = filteredOrders.filter((order) => {
      if (!liveOrderStatuses.includes(order.currentStatus)) return false
      const timing = getOrderOperationalTiming(order, averagePreparationMinutes)
      return timing.tone === "warning" || timing.tone === "critical"
    }).length

    return [
      {
        title: "Avg Prep Target",
        value: pluralizeMinutes(averagePreparationMinutes),
        hint: "Current kitchen timing baseline",
        icon: Clock3,
        tone: "info" as const,
      },
      {
        title: "New",
        value: liveStatusCounts.New ?? 0,
        hint: "Waiting for action",
        icon: Flame,
        tone: "warning" as const,
      },
      {
        title: "Accepted",
        value: liveStatusCounts.Accepted ?? 0,
        hint: "Confirmed by restaurant",
        icon: CheckCircle2,
        tone: "info" as const,
      },
      {
        title: "Kitchen Attention",
        value: kitchenAttentionCount,
        hint: "Orders drifting behind the normal flow",
        icon: TriangleAlert,
        tone:
          kitchenAttentionCount > 0 ? ("rose" as const) : ("success" as const),
      },
      {
        title: "Ready for Pickup",
        value: liveStatusCounts.ReadyForPickup ?? 0,
        hint: "Ready for rider handoff",
        icon: PackageCheck,
        tone: "violet" as const,
      },
      {
        title: "Picked Up",
        value: liveStatusCounts.PickedUp ?? 0,
        hint: "Out for delivery",
        icon: ShoppingBag,
        tone: "success" as const,
      },
    ]
  }, [averagePreparationMinutes, filteredOrders, liveStatusCounts])

  const historySummaryCards = React.useMemo(() => {
    const placedTotal = filteredOrders.reduce(
      (sum, order) => sum + order.total,
      0
    )
    const deliveredOrders = filteredOrders.filter(
      (order) => order.currentStatus === "Delivered"
    )
    const deliveredTotal = deliveredOrders.reduce(
      (sum, order) => sum + order.total,
      0
    )
    const cancelledTotal = filteredOrders
      .filter((order) => order.currentStatus === "Cancelled")
      .reduce((sum, order) => sum + order.total, 0)
    const cancelledOrders = filteredOrders.filter(
      (order) => order.currentStatus === "Cancelled"
    )
    const rejectedCount = filteredOrders.filter(
      (order) => order.currentStatus === "Rejected"
    ).length
    const autoCancelledCount = filteredOrders.filter(
      (order) =>
        order.currentStatus === "Cancelled" &&
        (order.cancelledBy === "system" ||
          order.terminalReason === "system_auto_cancel_unaccepted" ||
          order.terminalReason?.toLowerCase().includes("auto-cancel"))
    ).length

    return [
      {
        title: "Placed Food Sales",
        value: formatOrderMoney(placedTotal),
        hint: "Food subtotal minus owner discounts",
        icon: ShoppingBag,
        tone: "info" as const,
      },
      {
        title: "Delivered Food Sales",
        value: formatOrderMoney(deliveredTotal),
        hint: `${deliveredOrders.length} delivered orders`,
        icon: BadgeDollarSign,
        tone: "success" as const,
      },
      {
        title: "Cancelled Orders",
        value: cancelledOrders.length,
        hint: "Orders cancelled in current filter",
        icon: Ban,
        tone: "rose" as const,
      },
      {
        title: "Cancelled Food Sales",
        value: formatOrderMoney(cancelledTotal),
        hint: "Owner-side cancelled value",
        icon: Ban,
        tone: "rose" as const,
      },
      {
        title: "Rejected Orders",
        value: rejectedCount,
        hint: "Rejected within current filter",
        icon: XCircle,
        tone: "warning" as const,
      },
      {
        title: "Auto Cancelled",
        value: autoCancelledCount,
        hint: "System cancelled in current filter",
        icon: TriangleAlert,
        tone: "rose" as const,
      },
    ]
  }, [filteredOrders])

  const handleUpdateStatus = React.useCallback(
    async (
      orderId: string,
      nextStatus: OrderStatus,
      meta?: { updatedBy?: "owner" | "rider" | "system"; note?: string }
    ) => {
      const actor = meta?.updatedBy ?? "owner"

      const applyLocalTransition = () => {
        setOrders((current) =>
          current.map((order) => {
            if (order.id !== orderId) return order
            if (
              !allowedTransitions[order.currentStatus].includes(nextStatus) ||
              !canActorTransitionOrder(actor, order.currentStatus, nextStatus)
            ) {
              return order
            }

            const nextTimestamp = new Date().toISOString()
            const timestampKey = orderStatusTimestampKey[nextStatus]

            return {
              ...order,
              currentStatus: nextStatus,
              timestamps: {
                ...order.timestamps,
                [timestampKey]: nextTimestamp,
              },
              history: [
                ...order.history,
                {
                  id: `hist-${order.id}-${nextStatus}-${Date.now()}`,
                  status: nextStatus,
                  updatedAt: nextTimestamp,
                  updatedBy: actor,
                  note: meta?.note,
                },
              ],
            }
          })
        )
      }

      if (actor !== "owner") {
        if (!import.meta.env.DEV) return
        applyLocalTransition()
        return true
      }

      setPendingOrderAction({
        orderId,
        type: nextStatus === "Rejected" ? "reject" : "status",
      })
      try {
        const updated = await orderTransitionMutation.mutateAsync({
          orderId,
          nextStatus: nextStatus as
            | "Accepted"
            | "Rejected"
            | "Preparing"
            | "ReadyForPickup"
            | "Cancelled",
          actor: "owner",
          note: meta?.note,
        })
        const mapped = mapOwnerOrder(updated)
        setOrders((current) =>
          current.map((order) => (order.id === orderId ? mapped : order))
        )
        setViewingOrder((current) =>
          current?.id === orderId ? mapped : current
        )
        patchOwnerOrderQueryCaches(queryClient, updated)
        void queryClient.invalidateQueries({
          queryKey: ["owner", "dashboard", "summary"],
        })
        void queryClient.invalidateQueries({
          queryKey: ["owner", "payouts", "summary"],
        })
        void queryClient.invalidateQueries({
          queryKey: ["owner", "payouts", "transactions"],
        })
        toast.success(`Order marked as ${orderStatusLabels[nextStatus]}.`)
        return true
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to update the order."
        toast.error("Update failed", { description: message })
        return false
      } finally {
        setPendingOrderAction((current) =>
          current?.orderId === orderId ? null : current
        )
      }
    },
    [orderTransitionMutation, queryClient, setOrders]
  )

  const handleSaveKitchenNote = React.useCallback(
    (orderId: string, note: string) => {
      setOrders((current) =>
        current.map((order) =>
          order.id === orderId
            ? {
                ...order,
                kitchenNote: note,
              }
            : order
        )
      )
      toast.success("Kitchen note saved", {
        description: "The updated instruction is now attached to the order.",
      })
    },
    [setOrders]
  )

  const handleConfirmReject = React.useCallback(() => {
    if (!rejectingOrder) return
    void (async () => {
      const didUpdate = await handleUpdateStatus(
        rejectingOrder.id,
        "Rejected",
        {
          updatedBy: "owner",
          note: `${rejectionReason}${rejectionNote ? ` - ${rejectionNote.trim()}` : ""}`,
        }
      )
      if (!didUpdate) return
      setRejectingOrder(null)
      setRejectionReason("Kitchen busy")
      setRejectionNote("")
    })()
  }, [handleUpdateStatus, rejectingOrder, rejectionNote, rejectionReason])

  const handleExportHistory = React.useCallback(() => {
    const csvRows = [
      [
        "Order Number",
        "Customer",
        "Status",
        "Payment",
        "Restaurant Sales",
        "Placed At",
      ].join(","),
      ...filteredOrders.map((order) =>
        [
          order.orderNumber,
          `"${order.customer.name}"`,
          orderStatusLabels[order.currentStatus],
          getPaymentMethodLabel(order.paymentMethod),
          order.total,
          order.timestamps.placedAt,
        ].join(",")
      ),
    ]

    const blob = new Blob([csvRows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `foodbela-order-history-${Date.now()}.csv`
    link.click()
    window.URL.revokeObjectURL(url)
  }, [filteredOrders])

  const isRejectingPending =
    pendingOrderAction?.orderId === rejectingOrder?.id &&
    pendingOrderAction?.type === "reject"

  if (initialLoading) {
    return <OrdersSkeleton />
  }

  return (
    <div className="relative space-y-4 px-4 lg:px-6">
      {isRefreshing ? (
        <div className="pointer-events-none fixed right-6 top-20 z-40 inline-flex items-center gap-2 rounded-full border bg-background/95 px-3 py-2 text-sm font-medium text-muted-foreground shadow-sm backdrop-blur">
          <LoaderCircle className="size-4 animate-spin text-primary" />
          Updating orders
        </div>
      ) : null}

      <OrderDetailsDialog
        order={viewingOrder}
        open={!!viewingOrder}
        onOpenChange={(open) => {
          if (!open) {
            setViewingOrder(null)
            if (searchParams.get("order") || searchParams.get("orderId")) {
              setSearchParams((current) => {
                const next = new URLSearchParams(current)
                next.delete("order")
                next.delete("orderId")
                return next
              })
            }
          }
        }}
        onUpdateStatus={handleUpdateStatus}
        onReject={setRejectingOrder}
        onSaveKitchenNote={handleSaveKitchenNote}
        pendingOrderAction={
          viewingOrder && pendingOrderAction?.orderId === viewingOrder.id
            ? pendingOrderAction.type
            : null
        }
        averagePreparationMinutes={averagePreparationMinutes}
        operationalTiming={
          viewingOrder
            ? getOrderOperationalTiming(viewingOrder, averagePreparationMinutes)
            : {
                phaseLabel: "Kitchen timing",
                primaryLabel: "",
                secondaryLabel: "",
                tone: "neutral",
                lateByMinutes: null,
                remainingMinutes: null,
              }
        }
      />

      <Dialog
        open={!!rejectingOrder}
        onOpenChange={(open) => {
          if (!open) {
            setRejectingOrder(null)
            setRejectionReason("Kitchen busy")
            setRejectionNote("")
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Reject Order</DialogTitle>
            <DialogDescription>
              Select a reason before rejecting {rejectingOrder?.orderNumber}. Too many
              rejected orders can reduce customer trust and hurt your reputation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={rejectionReason} onValueChange={setRejectionReason}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Kitchen busy">Kitchen busy</SelectItem>
                <SelectItem value="Item unavailable">
                  Item unavailable
                </SelectItem>
                <SelectItem value="Closing soon">Closing soon</SelectItem>
                <SelectItem value="Capacity issue">Capacity issue</SelectItem>
              </SelectContent>
            </Select>
            <Textarea
              value={rejectionNote}
              onChange={(event) => setRejectionNote(event.target.value)}
              placeholder="Optional internal note"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingOrder(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmReject}
              disabled={isRejectingPending}
            >
              {isRejectingPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <XCircle className="size-4" />
              )}
              {isRejectingPending ? "Rejecting..." : "Reject Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as OrderTab)}
      >
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <TabsList className="w-full justify-start lg:w-fit">
            <TabsTrigger value="live">
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500">
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-75" />
              </span>
              Live Orders
              <span className="ml-1 text-xs text-muted-foreground">
                {liveCount}
              </span>
            </TabsTrigger>
            <TabsTrigger value="history">
              Order History
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="live" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            {liveSummaryCards.map((card) => {
              const tone = getSummaryCardTone(card.tone)
              return (
                <Card
                  key={card.title}
                  className={`rounded-2xl shadow-sm ${tone.card}`}
                >
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        {card.title}
                      </CardTitle>
                      <div
                        className={`inline-flex size-10 items-center justify-center rounded-xl ${tone.iconWrap}`}
                      >
                        <card.icon className="size-5" />
                      </div>
                    </div>
                    <CardContent className="p-0">
                      <div
                        className={`text-3xl font-semibold tracking-tight ${tone.value}`}
                      >
                        {card.value}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {card.hint}
                      </div>
                    </CardContent>
                  </CardHeader>
                </Card>
              )
            })}
          </div>

          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex flex-col gap-4">
              <div className="flex flex-1 flex-col gap-3 2xl:flex-row 2xl:flex-wrap">
                <div className="relative w-full lg:max-w-xs">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search by order ID or customer"
                    className="pl-9"
                  />
                </div>

                <Select
                  value={selectedStatus}
                  onValueChange={(value) =>
                    setSelectedStatus(value as "all" | OrderStatus)
                  }
                >
                  <SelectTrigger className="w-full lg:w-48">
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    {visibleStatuses.map((status) => (
                      <SelectItem key={status} value={status}>
                        {orderStatusLabels[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={paymentFilter}
                  onValueChange={(value) =>
                    setPaymentFilter(value as PaymentFilter)
                  }
                >
                  <SelectTrigger className="w-full lg:w-44">
                    <SelectValue placeholder="Payment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Payments</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Bkash">Bkash</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={sortBy}
                  onValueChange={(value) => setSortBy(value as SortKey)}
                >
                  <SelectTrigger className="w-full lg:w-44">
                    <SelectValue placeholder="Sort orders" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="latest">Latest First</SelectItem>
                    <SelectItem value="oldest">Oldest First</SelectItem>
                    <SelectItem value="highestValue">Highest Value</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  variant={showUrgentOnly ? "default" : "outline"}
                  onClick={() => setShowUrgentOnly((current) => !current)}
                >
                  <Filter className="size-4" />
                  Urgent Only
                </Button>

                <Button
                  variant="outline"
                  onClick={resetLiveFilters}
                  disabled={liveResetDisabled}
                >
                  <RotateCcw className="size-4" />
                  Reset
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <div className="text-sm text-muted-foreground">
                  {totalOrders} active orders
                </div>
              </div>
            </div>
          </div>

          <OrdersTable
            orders={paginatedOrders}
            emptyTitle="No live orders right now"
            emptyDescription="New, accepted, and in-progress orders will appear here."
            onView={setViewingOrder}
            onUpdateStatus={handleUpdateStatus}
            onReject={setRejectingOrder}
            pendingOrderId={pendingOrderAction?.orderId ?? null}
            pendingAction={pendingOrderAction?.type ?? null}
            averagePreparationMinutes={averagePreparationMinutes}
            clockTick={clockTick}
          />
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            {historySummaryCards.map((card) => {
              const tone = getSummaryCardTone(card.tone)
              return (
                <Card
                  key={card.title}
                  className={`rounded-2xl shadow-sm ${tone.card}`}
                >
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        {card.title}
                      </CardTitle>
                      <div
                        className={`inline-flex size-10 items-center justify-center rounded-xl ${tone.iconWrap}`}
                      >
                        <card.icon className="size-5" />
                      </div>
                    </div>
                    <CardContent className="p-0">
                      <div
                        className={`text-3xl font-semibold tracking-tight ${tone.value}`}
                      >
                        {card.value}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {card.hint}
                      </div>
                    </CardContent>
                  </CardHeader>
                </Card>
              )
            })}
          </div>

          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex flex-col gap-4">
              <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:flex-wrap">
                <div className="relative w-full lg:max-w-xs">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search by order ID or customer"
                    className="pl-9"
                  />
                </div>

                <Select
                  value={selectedStatus}
                  onValueChange={(value) =>
                    setSelectedStatus(value as "all" | OrderStatus)
                  }
                >
                  <SelectTrigger className="w-full lg:w-48">
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    {visibleStatuses.map((status) => (
                      <SelectItem key={status} value={status}>
                        {orderStatusLabels[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={paymentFilter}
                  onValueChange={(value) =>
                    setPaymentFilter(value as PaymentFilter)
                  }
                >
                  <SelectTrigger className="w-full lg:w-44">
                    <SelectValue placeholder="Payment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Payments</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Bkash">Bkash</SelectItem>
                  </SelectContent>
                </Select>

                <OrderDateFilter
                  value={historyDateFilter}
                  onChange={setHistoryDateFilter}
                />

                <Select
                  value={sortBy}
                  onValueChange={(value) => setSortBy(value as SortKey)}
                >
                  <SelectTrigger className="w-full lg:w-44">
                    <SelectValue placeholder="Sort orders" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="latest">Latest First</SelectItem>
                    <SelectItem value="oldest">Oldest First</SelectItem>
                    <SelectItem value="highestValue">Highest Value</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  variant="outline"
                  onClick={resetHistoryFilters}
                  disabled={historyResetDisabled}
                >
                  <RotateCcw className="size-4" />
                  Reset
                </Button>
              </div>

              <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground">
                  {totalOrders} history orders
                </div>
                <Button
                  variant="outline"
                  onClick={handleExportHistory}
                  className="w-full sm:w-auto"
                >
                  <Download className="size-4" />
                  Export CSV
                </Button>
              </div>
            </div>
          </div>

          <OrdersTable
            orders={paginatedOrders}
            emptyTitle="No order history yet"
            emptyDescription="Delivered, rejected, and cancelled orders will appear here."
            onView={setViewingOrder}
            onUpdateStatus={handleUpdateStatus}
            onReject={setRejectingOrder}
            pendingOrderId={pendingOrderAction?.orderId ?? null}
            pendingAction={pendingOrderAction?.type ?? null}
            averagePreparationMinutes={averagePreparationMinutes}
            clockTick={clockTick}
          />
        </TabsContent>
      </Tabs>

      <div className="flex flex-col gap-4 rounded-2xl border bg-card px-4 py-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {paginatedOrders.length} of {totalOrders} order(s)
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select
            value={`${pageSize}`}
            onValueChange={(value) => setPageSize(Number(value))}
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
            Page {safePageIndex + 1} of {pageCount}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                setPageIndex((current) => Math.max(0, current - 1))
              }
              disabled={safePageIndex === 0}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                setPageIndex((current) => Math.min(pageCount - 1, current + 1))
              }
              disabled={safePageIndex >= pageCount - 1}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
