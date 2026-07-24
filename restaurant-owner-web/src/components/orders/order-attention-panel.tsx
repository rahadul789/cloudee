import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { formatDistanceToNowStrict } from "date-fns"
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  LoaderCircle,
  PackageCheck,
} from "lucide-react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"

import {
  formatOrderMoney,
  liveOrderStatuses,
  orderStatusLabels,
  type Order,
  type OrderStatus,
} from "@/components/orders/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useOwnerOrderTransitionMutation } from "@/hooks/use-owner-api"
import { mapOwnerOrder } from "@/lib/backend-mappers"
import { playOwnerWarningSound } from "@/lib/owner-notification-sound"
import { patchOwnerOrderQueryCaches } from "@/lib/owner-order-cache"
import {
  formatDurationFromSeconds,
  getOrderOperationalTiming,
} from "@/lib/order-operational-timing"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/store/app-store"

type AttentionActionStatus = Extract<
  OrderStatus,
  "Accepted" | "Preparing" | "ReadyForPickup"
>

type OrderAttentionAlert = {
  key: string
  order: Order
  tone: "warning" | "critical"
  title: string
  badgeLabel: string
  description: string
  actionLabel: string | null
  actionStatus: AttentionActionStatus | null
  urgencyScore: number
}

function getPlacedAtMs(order: Order) {
  const placedAt = new Date(order.timestamps.placedAt).getTime()
  return Number.isFinite(placedAt) ? placedAt : 0
}

function formatPlacedDistance(order: Order) {
  const placedAt = getPlacedAtMs(order)
  if (!placedAt) return "recently"

  return formatDistanceToNowStrict(new Date(placedAt), { addSuffix: true })
}

function getAttentionAction(status: OrderStatus): {
  label: string
  nextStatus: AttentionActionStatus
} | null {
  if (status === "New") {
    return { label: "Accept now", nextStatus: "Accepted" }
  }
  if (status === "Accepted") {
    return { label: "Start prep", nextStatus: "Preparing" }
  }
  if (status === "Preparing") {
    return { label: "Mark ready", nextStatus: "ReadyForPickup" }
  }
  return null
}

function getStatusTitle(order: Order, tone: OrderAttentionAlert["tone"]) {
  if (order.currentStatus === "New") {
    return tone === "critical" ? "Accept order now" : "Order waiting"
  }
  if (order.currentStatus === "Accepted") {
    return tone === "critical" ? "Prep is late to start" : "Prep not started"
  }
  if (order.currentStatus === "Preparing") {
    return tone === "critical" ? "Kitchen is behind" : "Prep taking longer"
  }
  if (order.currentStatus === "ReadyForPickup") {
    return tone === "critical" ? "Pickup is waiting" : "Ready order waiting"
  }
  return "Order needs attention"
}

function getStatusIcon(status: OrderStatus) {
  if (status === "New") return CheckCircle2
  if (status === "Accepted") return Clock3
  if (status === "Preparing" || status === "ReadyForPickup") {
    return PackageCheck
  }
  return AlertTriangle
}

function buildAttentionAlert(
  order: Order,
  averagePreparationMinutes: number,
  now: number
): OrderAttentionAlert | null {
  if (!liveOrderStatuses.includes(order.currentStatus)) return null

  const timing = getOrderOperationalTiming(
    order,
    averagePreparationMinutes,
    now
  )

  if (timing.tone !== "warning" && timing.tone !== "critical") return null

  const action = getAttentionAction(order.currentStatus)
  const remainingLabel =
    order.currentStatus === "New" && typeof timing.remainingSeconds === "number"
      ? timing.remainingSeconds === 0
        ? "Auto-cancel due"
        : `${formatDurationFromSeconds(timing.remainingSeconds)} left`
      : timing.lateByMinutes !== null
        ? `${timing.lateByMinutes} min late`
        : orderStatusLabels[order.currentStatus]

  const remainingUrgency =
    typeof timing.remainingSeconds === "number"
      ? Math.max(0, 600 - timing.remainingSeconds)
      : 0
  const lateUrgency = (timing.lateByMinutes ?? 0) * 60
  const statusWeight =
    order.currentStatus === "New"
      ? 400
      : order.currentStatus === "Accepted"
        ? 300
        : order.currentStatus === "Preparing"
          ? 200
          : 100

  return {
    key: `${order.id}:${order.currentStatus}:${timing.tone}`,
    order,
    tone: timing.tone,
    title: getStatusTitle(order, timing.tone),
    badgeLabel: remainingLabel,
    description: `${timing.primaryLabel}. ${timing.secondaryLabel} Placed ${formatPlacedDistance(
      order
    )}.`,
    actionLabel: action?.label ?? null,
    actionStatus: action?.nextStatus ?? null,
    urgencyScore:
      (timing.tone === "critical" ? 10_000 : 5_000) +
      statusWeight +
      remainingUrgency +
      lateUrgency,
  }
}

export function OrderAttentionPanel() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const orders = useAppStore((state) => state.orders)
  const setOrders = useAppStore((state) => state.setOrders)
  const averagePreparationMinutes = useAppStore((state) =>
    Math.max(5, state.storeSettings.orderSettings.preparationTimeMinutes ?? 20)
  )
  const orderTransitionMutation = useOwnerOrderTransitionMutation()
  const [clockTick, setClockTick] = React.useState(() => Date.now())
  const [pendingOrderId, setPendingOrderId] = React.useState<string | null>(null)
  const previousAlertKeysRef = React.useRef<Set<string>>(new Set())
  const hasInitializedAlertsRef = React.useRef(false)

  const hasAutoCancelCountdown = React.useMemo(
    () =>
      orders.some(
        (order) => order.currentStatus === "New" && order.autoCancel?.applies
      ),
    [orders]
  )

  React.useEffect(() => {
    setClockTick(Date.now())
    const timer = window.setInterval(
      () => setClockTick(Date.now()),
      hasAutoCancelCountdown ? 1000 : 30000
    )
    return () => window.clearInterval(timer)
  }, [hasAutoCancelCountdown])

  const alerts = React.useMemo(
    () =>
      orders
        .map((order) =>
          buildAttentionAlert(order, averagePreparationMinutes, clockTick)
        )
        .filter((alert): alert is OrderAttentionAlert => Boolean(alert))
        .sort((left, right) => {
          if (right.urgencyScore !== left.urgencyScore) {
            return right.urgencyScore - left.urgencyScore
          }
          return getPlacedAtMs(left.order) - getPlacedAtMs(right.order)
        }),
    [averagePreparationMinutes, clockTick, orders]
  )

  React.useEffect(() => {
    const currentKeys = new Set(alerts.map((alert) => alert.key))

    if (!hasInitializedAlertsRef.current) {
      hasInitializedAlertsRef.current = true
      previousAlertKeysRef.current = currentKeys
      return
    }

    const hasNewAudibleAlert = alerts.some(
      (alert) =>
        (alert.tone === "warning" || alert.tone === "critical") &&
        !previousAlertKeysRef.current.has(alert.key)
    )
    previousAlertKeysRef.current = currentKeys

    if (hasNewAudibleAlert) {
      window.setTimeout(() => {
        void playOwnerWarningSound()
      }, 0)
    }
  }, [alerts])

  async function updateOrderStatus(
    order: Order,
    nextStatus: AttentionActionStatus
  ) {
    setPendingOrderId(order.id)

    try {
      const updated = await orderTransitionMutation.mutateAsync({
        orderId: order.id,
        nextStatus,
        actor: "owner",
      })
      const mapped = mapOwnerOrder(updated)
      setOrders((current) => {
        const exists = current.some((item) => item.id === mapped.id)
        return exists
          ? current.map((item) => (item.id === mapped.id ? mapped : item))
          : [mapped, ...current]
      })
      patchOwnerOrderQueryCaches(queryClient, updated)
      void queryClient.invalidateQueries({ queryKey: ["owner", "orders"] })
      void queryClient.refetchQueries({
        queryKey: ["owner", "orders"],
        type: "active",
      })
      void queryClient.invalidateQueries({
        queryKey: ["owner", "sidebar-summary"],
      })
      void queryClient.refetchQueries({
        queryKey: ["owner", "sidebar-summary"],
        type: "active",
      })
      void queryClient.invalidateQueries({
        queryKey: ["owner", "dashboard", "summary"],
      })
      toast.success(`Order marked as ${orderStatusLabels[nextStatus]}.`)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update the order."
      toast.error("Order update failed", { description: message })
    } finally {
      setPendingOrderId((current) => (current === order.id ? null : current))
    }
  }

  function handleAttentionAction(
    order: Order,
    nextStatus: AttentionActionStatus | null
  ) {
    if (!nextStatus) return
    void updateOrderStatus(order, nextStatus)
  }

  function viewOrder(order: Order) {
    navigate(`/orders?order=${order.id}`)
  }

  if (!alerts.length) return null

  const visibleAlerts = alerts.slice(0, 3)
  const hiddenCount = alerts.length - visibleAlerts.length

  return (
    <div className="pointer-events-none fixed right-4 top-[4.5rem] z-40 w-[min(440px,calc(100vw-2rem))]">
      <div className="pointer-events-auto overflow-hidden rounded-xl border border-rose-200/80 bg-background shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b bg-rose-50 px-3.5 py-3 text-rose-900">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
              <AlertTriangle className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                Kitchen attention
              </div>
              <div className="text-xs text-rose-700">
                {alerts.length} order{alerts.length === 1 ? "" : "s"} needs action
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="xs"
            className="border-rose-200 bg-background text-rose-700 hover:bg-rose-50 hover:text-rose-800"
            onClick={() => navigate("/orders?tab=live")}
          >
            View all
          </Button>
        </div>

        <div className="divide-y">
          {visibleAlerts.map((alert) => {
            const Icon = getStatusIcon(alert.order.currentStatus)
            const isPending = pendingOrderId === alert.order.id
            const actionStatus = alert.actionStatus

            return (
              <div
                key={alert.key}
                className={cn(
                  "space-y-3 px-3.5 py-3",
                  alert.tone === "critical" ? "bg-rose-50/55" : "bg-amber-50/50"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-2.5">
                    <div
                      className={cn(
                        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
                        alert.tone === "critical"
                          ? "bg-rose-100 text-rose-700"
                          : "bg-amber-100 text-amber-700"
                      )}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {alert.title}
                      </div>
                      <div className="text-xs font-medium text-muted-foreground">
                        #{alert.order.orderNumber} - {alert.order.customer.name}
                      </div>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0",
                      alert.tone === "critical"
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    )}
                  >
                    {alert.badgeLabel}
                  </Badge>
                </div>

                <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {alert.description}
                </p>

                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">
                    {formatOrderMoney(alert.order.total)}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => viewOrder(alert.order)}
                    >
                      <Eye className="size-3.5" />
                      View
                    </Button>
                    {actionStatus ? (
                      <Button
                        size="xs"
                        onClick={() =>
                          handleAttentionAction(alert.order, actionStatus)
                        }
                        disabled={isPending}
                      >
                        {isPending ? (
                          <LoaderCircle className="size-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="size-3.5" />
                        )}
                        {alert.actionLabel}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {hiddenCount > 0 ? (
          <div className="border-t bg-muted/30 px-3.5 py-2 text-xs font-medium text-muted-foreground">
            +{hiddenCount} more order{hiddenCount === 1 ? "" : "s"} waiting in live
            orders.
          </div>
        ) : null}
      </div>
    </div>
  )
}
