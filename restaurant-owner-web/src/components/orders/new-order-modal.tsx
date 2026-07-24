import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { format, formatDistanceToNowStrict } from "date-fns"
import {
  CheckCircle2,
  Clock3,
  Eye,
  LoaderCircle,
  MapPin,
  ShoppingBag,
  XCircle,
} from "lucide-react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"

import {
  formatOrderMoney,
  getOrderItemsCount,
  type Order,
} from "@/components/orders/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useOwnerOrderTransitionMutation } from "@/hooks/use-owner-api"
import { mapOwnerOrder } from "@/lib/backend-mappers"
import { patchOwnerOrderQueryCaches } from "@/lib/owner-order-cache"
import {
  playOwnerNewOrderSound,
  registerOwnerNotificationSoundUnlock,
} from "@/lib/owner-notification-sound"
import {
  OWNER_NEW_ORDER_EVENT,
  type OwnerNewOrderEventDetail,
} from "@/lib/owner-realtime-events"
import { useAppStore } from "@/store/app-store"

type ModalAction = "accept" | "reject"

function getOrderPreview(order: Order) {
  return order.items
    .slice(0, 2)
    .map((item) => `${item.quantity}x ${item.name}`)
    .join(", ")
}

function formatPlacedTime(placedAt: string) {
  const date = new Date(placedAt)
  if (Number.isNaN(date.getTime())) return "just now"

  return `${format(date, "dd MMM, hh:mm a")} - ${formatDistanceToNowStrict(
    date,
    { addSuffix: true }
  )}`
}

export function NewOrderModal() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const orders = useAppStore((state) => state.orders)
  const setOrders = useAppStore((state) => state.setOrders)
  const orderTransitionMutation = useOwnerOrderTransitionMutation()
  const [queuedOrderIds, setQueuedOrderIds] = React.useState<string[]>([])
  const [pendingAction, setPendingAction] = React.useState<ModalAction | null>(
    null
  )
  const alertedOrderIdsRef = React.useRef<Set<string>>(new Set())
  const knownOrderIdsRef = React.useRef<Set<string>>(new Set())
  const mountedAtRef = React.useRef(Date.now())

  const queueNewOrderAlert = React.useCallback((orderId: string) => {
    setQueuedOrderIds((current) =>
      current.includes(orderId) ? current : [...current, orderId]
    )

    if (alertedOrderIdsRef.current.has(orderId)) return
    alertedOrderIdsRef.current.add(orderId)
    window.setTimeout(() => {
      void playOwnerNewOrderSound()
    }, 0)
  }, [])

  React.useEffect(() => registerOwnerNotificationSoundUnlock(), [])

  React.useEffect(() => {
    const handleNewOrder = (event: Event) => {
      const detail = (event as CustomEvent<OwnerNewOrderEventDetail>).detail
      if (!detail?.orderId) return

      knownOrderIdsRef.current.add(detail.orderId)
      queueNewOrderAlert(detail.orderId)
    }

    window.addEventListener(OWNER_NEW_ORDER_EVENT, handleNewOrder)
    return () => window.removeEventListener(OWNER_NEW_ORDER_EVENT, handleNewOrder)
  }, [queueNewOrderAlert])

  React.useEffect(() => {
    orders.forEach((order) => {
      if (knownOrderIdsRef.current.has(order.id)) return

      knownOrderIdsRef.current.add(order.id)
      if (order.currentStatus !== "New") return

      const placedAt = new Date(order.timestamps.placedAt).getTime()
      const arrivedAfterThisSession =
        Number.isFinite(placedAt) && placedAt >= mountedAtRef.current - 5000

      if (arrivedAfterThisSession) {
        queueNewOrderAlert(order.id)
      }
    })
  }, [orders, queueNewOrderAlert])

  const activeOrderId = queuedOrderIds[0] ?? null
  const activeOrder = React.useMemo(
    () => orders.find((order) => order.id === activeOrderId) ?? null,
    [activeOrderId, orders]
  )

  const dismissCurrentOrder = React.useCallback(() => {
    setQueuedOrderIds((current) => current.slice(1))
    setPendingAction(null)
  }, [])

  React.useEffect(() => {
    if (!activeOrder) return
    if (activeOrder.currentStatus !== "New") {
      dismissCurrentOrder()
    }
  }, [activeOrder, dismissCurrentOrder])

  async function updateOrderStatus(action: ModalAction) {
    if (!activeOrder) return

    const nextStatus = action === "accept" ? "Accepted" : "Rejected"
    setPendingAction(action)

    try {
      const updated = await orderTransitionMutation.mutateAsync({
        orderId: activeOrder.id,
        nextStatus,
        actor: "owner",
        note:
          action === "reject"
            ? "Rejected from the new order alert."
            : undefined,
      })
      const mapped = mapOwnerOrder(updated)
      setOrders((current) => {
        const exists = current.some((order) => order.id === mapped.id)
        return exists
          ? current.map((order) => (order.id === mapped.id ? mapped : order))
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

      toast.success(
        action === "accept" ? "New order accepted." : "New order rejected."
      )
      dismissCurrentOrder()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update the order."
      toast.error("Order update failed", { description: message })
      setPendingAction(null)
    }
  }

  function viewOrder() {
    if (!activeOrder) return
    navigate(`/orders?order=${activeOrder.id}`)
    dismissCurrentOrder()
  }

  if (!activeOrder) return null

  const itemCount = getOrderItemsCount(activeOrder)
  const orderPreview = getOrderPreview(activeOrder)
  const visibleItems = activeOrder.items.slice(0, 4)
  const hiddenItemsCount = Math.max(
    0,
    activeOrder.items.length - visibleItems.length
  )
  const placedTime = formatPlacedTime(activeOrder.timestamps.placedAt)
  const isAccepting = pendingAction === "accept"
  const isRejecting = pendingAction === "reject"
  const isPending = Boolean(pendingAction)

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) dismissCurrentOrder()
      }}
    >
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-start gap-4 pr-6">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <ShoppingBag className="size-6" />
            </div>
            <div className="min-w-0 space-y-1">
              <DialogTitle className="text-xl">New order arrived</DialogTitle>
              <DialogDescription className="text-sm">
                #{activeOrder.orderNumber} from {activeOrder.customer.name}
              </DialogDescription>
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Clock3 className="size-3.5" />
                Placed {placedTime}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-base font-semibold">
                {orderPreview || "Order items"}
              </div>
              <div className="text-sm text-muted-foreground">
                {itemCount} item{itemCount === 1 ? "" : "s"} -{" "}
                {activeOrder.paymentMethod}
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 px-3 py-1 text-sm">
              {formatOrderMoney(activeOrder.total)}
            </Badge>
          </div>

          <div className="rounded-lg border bg-background">
            {visibleItems.map((item, index) => (
              <div
                key={`${item.id}-${index}`}
                className="flex items-start justify-between gap-3 border-b px-3 py-2.5 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {item.quantity}x {item.name}
                  </div>
                  {item.variantLabel ? (
                    <div className="truncate text-xs text-muted-foreground">
                      {item.variantLabel}
                    </div>
                  ) : null}
                </div>
                <div className="shrink-0 text-sm font-semibold">
                  {formatOrderMoney(item.quantity * item.unitPrice)}
                </div>
              </div>
            ))}
            {hiddenItemsCount > 0 ? (
              <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
                +{hiddenItemsCount} more item
                {hiddenItemsCount === 1 ? "" : "s"}
              </div>
            ) : null}
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-background px-3 py-2.5 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" />
            <span className="line-clamp-2">
              {activeOrder.customer.address || "No address provided"}
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="outline"
            onClick={() => updateOrderStatus("reject")}
            disabled={isPending}
          >
            {isRejecting ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <XCircle className="size-4" />
            )}
            Reject
          </Button>
          <Button
            variant="outline"
            className="border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-800"
            onClick={viewOrder}
            disabled={isPending}
          >
            <Eye className="size-4" />
            View
          </Button>
          <Button onClick={() => updateOrderStatus("accept")} disabled={isPending}>
            {isAccepting ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            Accept
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
