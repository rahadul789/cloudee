import * as React from "react"
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { format } from "date-fns"
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  CheckCircle2,
  Bike,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Eye,
  Loader2,
  MoreHorizontal,
  PackageCheck,
  Phone,
  RotateCcw,
  Search,
  Star,
  TableConfig,
  Truck,
  WalletCards,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"
import { useSearchParams } from "react-router-dom"

import { useDebouncedValue } from "@/hooks/use-debounced-value"
import {
  assignAdminOrderRider,
  getAdminOrder,
  listAdminActivityLogs,
  listAdminOrders,
  listAdminRidersAssignmentOptions,
  sendAdminOrderReviewRequest,
  updateAdminOrderRefundStatus,
  updateAdminOrderStatus,
  type AdminOrderDetails,
  type AdminOrderListItem,
  type AdminRestaurantOrderDateFilterPreset,
  type AdminRiderAssignmentOption,
} from "@/lib/admin-api"
import { printTableReport } from "@/lib/export-utils"
import { AdminDateRangeFilter } from "@/components/admin-date-range-filter"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

type OrderStatusFilter =
  | "all"
  | "new"
  | "live"
  | "ready"
  | "pickedUp"
  | "delivered"
  | "cancelled"
  | "refund"
type PaymentMethodFilter = "all" | "Cash" | "Bkash"
type PaymentStatusFilter =
  | "all"
  | "pending"
  | "paid"
  | "refund_pending"
  | "refunded"
type AssignmentFilter = "all" | "assigned" | "unassigned" | "stale"
type AttentionFilter = "all" | "riderDelay" | "extraTime"
type ReviewStateFilter = "all" | "reviewed" | "requested" | "pending"
type OrderSort = "newest" | "oldest" | "highestValue" | "recentlyUpdated"
type OrderPreset = Extract<
  AdminRestaurantOrderDateFilterPreset,
  | "today"
  | "yesterday"
  | "last7Days"
  | "last30Days"
  | "last90Days"
  | "thisMonth"
  | "lastMonth"
  | "lifetime"
  | "custom"
>
type AdminOrderNextStatus =
  | "Accepted"
  | "Rejected"
  | "Preparing"
  | "ReadyForPickup"
  | "Cancelled"
type RefundStatus = "refund_pending" | "refunded" | "refund_rejected"
type OrderColumnKey =
  | "order"
  | "status"
  | "restaurant"
  | "customer"
  | "payment"
  | "total"
  | "rider"
  | "timing"

type OrderTarget = {
  id: string
  orderNumber: string
  status: string
  paymentMethod: string
  paymentStatus: string
  riderId?: string
  riderName?: string
}

const ORDER_TABLE_COLUMNS: Array<{ key: OrderColumnKey; label: string }> = [
  { key: "order", label: "Order" },
  { key: "status", label: "Status" },
  { key: "restaurant", label: "Restaurant" },
  { key: "customer", label: "Customer" },
  { key: "payment", label: "Payment" },
  { key: "total", label: "Total" },
  { key: "rider", label: "Rider" },
  { key: "timing", label: "Timing" },
]

const defaultColumnVisibility: Record<OrderColumnKey, boolean> = {
  order: true,
  status: true,
  restaurant: true,
  customer: true,
  payment: true,
  total: true,
  rider: true,
  timing: true,
}
const pageSizeOptions = [10, 20, 50]

function formatDate(value?: string | null) {
  if (!value) return "N/A"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "N/A"
  return date.toLocaleString()
}

function formatCurrency(value: number) {
  return `Tk ${Math.round(Number.isFinite(value) ? value : 0).toLocaleString()}`
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

function getAutoCancelRemainingSeconds(
  order: Pick<AdminOrderListItem, "status" | "autoCancel">,
  nowMs = Date.now()
) {
  if (order.status !== "New" || !order.autoCancel?.applies) return null
  const autoCancelAt = order.autoCancel.autoCancelAt
    ? new Date(order.autoCancel.autoCancelAt).getTime()
    : 0

  if (autoCancelAt > 0 && !Number.isNaN(autoCancelAt)) {
    return Math.max(0, Math.ceil((autoCancelAt - nowMs) / 1000))
  }

  return typeof order.autoCancel.remainingSeconds === "number"
    ? Math.max(0, order.autoCancel.remainingSeconds)
    : null
}

function formatMinutesLabel(value?: number | null, suffix = "min") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/A"
  const safe = Math.max(0, Math.round(value))
  return `${safe} ${suffix}`
}

function getOrderStatusBadgeClass(status: string) {
  if (status === "Delivered")
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (["New", "Accepted", "Preparing"].includes(status)) {
    return "border-sky-200 bg-sky-50 text-sky-700"
  }
  if (["ReadyForPickup", "PickedUp"].includes(status)) {
    return "border-violet-200 bg-violet-50 text-violet-700"
  }
  return "border-rose-200 bg-rose-50 text-rose-700"
}

function getPaymentBadgeClass(status: string) {
  if (status === "paid" || status === "refunded")
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (status === "refund_pending")
    return "border-amber-200 bg-amber-50 text-amber-700"
  return ""
}

function getVoucherFundingBadgeClass(fundedBy: string) {
  if (fundedBy === "platform") return "border-sky-200 bg-sky-50 text-sky-700"
  if (fundedBy === "owner") return "border-amber-200 bg-amber-50 text-amber-700"
  return "border-violet-200 bg-violet-50 text-violet-700"
}

function getLateBadgeClass(order: Pick<AdminOrderListItem, "lateTone">) {
  return order.lateTone === "critical"
    ? "border-rose-200 bg-rose-50 text-rose-700"
    : "border-amber-200 bg-amber-50 text-amber-700"
}

function isRiderDelayedOrder(order: AdminOrderListItem) {
  return order.isLate && ["ReadyForPickup", "PickedUp"].includes(order.status)
}

function getExtraPrepMinutes(
  order: Pick<AdminOrderListItem, "preparationTiming">
) {
  return Math.max(0, Math.round(order.preparationTiming?.extraMinutes ?? 0))
}

function isRefundCandidate(order: {
  status: string
  paymentMethod: string
  paymentStatus: string
}) {
  return (
    ["Cancelled", "Rejected"].includes(order.status) &&
    order.paymentMethod === "Bkash" &&
    ["paid", "refund_pending"].includes(order.paymentStatus)
  )
}

function getStatusActions(status: string) {
  const actions: Array<{
    label: string
    nextStatus: AdminOrderNextStatus
    icon: React.ComponentType<{ className?: string }>
    variant?: "default" | "destructive"
  }> = []

  if (status === "New") {
    actions.push(
      { label: "Accept", nextStatus: "Accepted", icon: CheckCircle2 },
      {
        label: "Reject",
        nextStatus: "Rejected",
        icon: XCircle,
        variant: "destructive",
      },
      {
        label: "Cancel",
        nextStatus: "Cancelled",
        icon: Ban,
        variant: "destructive",
      }
    )
  }
  if (status === "Accepted") {
    actions.push(
      { label: "Start preparing", nextStatus: "Preparing", icon: Clock },
      {
        label: "Cancel",
        nextStatus: "Cancelled",
        icon: Ban,
        variant: "destructive",
      }
    )
  }
  if (status === "Preparing") {
    actions.push(
      {
        label: "Mark ready",
        nextStatus: "ReadyForPickup",
        icon: PackageCheck,
      },
      {
        label: "Cancel",
        nextStatus: "Cancelled",
        icon: Ban,
        variant: "destructive",
      }
    )
  }
  if (status === "ReadyForPickup") {
    actions.push({
      label: "Cancel",
      nextStatus: "Cancelled",
      icon: Ban,
      variant: "destructive",
    })
  }

  return actions
}

function toOrderTarget(
  order: AdminOrderListItem | AdminOrderDetails
): OrderTarget {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    riderId: "riderId" in order ? order.riderId : undefined,
    riderName: order.riderName,
  }
}

function StatCard({
  label,
  value,
  helper,
}: {
  label: string
  value: React.ReactNode
  helper: string
}) {
  return (
    <Card>
      <CardContent className="pt-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-72 text-right font-medium">{value}</span>
    </div>
  )
}

function invalidateOrderQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  orderId?: string
) {
  void queryClient.invalidateQueries({ queryKey: ["admin-orders"] })
  void queryClient.invalidateQueries({ queryKey: ["admin-orders-monitor"] })
  void queryClient.invalidateQueries({
    queryKey: ["admin-rider-assignment-options"],
  })
  if (orderId) {
    void queryClient.invalidateQueries({ queryKey: ["admin-order", orderId] })
  }
}

function OrderStatusDialog({
  target,
  onOpenChange,
}: {
  target: null | {
    order: OrderTarget
    nextStatus: AdminOrderNextStatus
    label: string
  }
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [note, setNote] = React.useState("")
  const mutation = useMutation({
    mutationFn: updateAdminOrderStatus,
    onSuccess: () => {
      toast.success("Order status updated.")
      invalidateOrderQueries(queryClient, target?.order.id)
      setNote("")
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Order status update failed."
      )
      invalidateOrderQueries(queryClient, target?.order.id)
    },
  })

  React.useEffect(() => {
    if (!target) setNote("")
  }, [target])

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{target?.label ?? "Update order"}</DialogTitle>
          <DialogDescription>
            {target?.order.orderNumber} will move from {target?.order.status} to{" "}
            {target?.nextStatus}. The current status is checked before saving.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="order-status-note">Admin note</Label>
          <Textarea
            id="order-status-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Reason or internal note"
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!target || mutation.isPending}
            onClick={() => {
              if (!target) return
              mutation.mutate({
                orderId: target.order.id,
                expectedStatus: target.order.status,
                nextStatus: target.nextStatus,
                note,
              })
            }}
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            Save status
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AssignRiderDialog({
  target,
  onOpenChange,
}: {
  target: OrderTarget | null
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [riderId, setRiderId] = React.useState("")
  const ridersQuery = useQuery({
    queryKey: ["admin-rider-assignment-options"],
    queryFn: listAdminRidersAssignmentOptions,
    enabled: Boolean(target),
  })
  const mutation = useMutation({
    mutationFn: assignAdminOrderRider,
    onSuccess: () => {
      toast.success("Rider assigned.")
      invalidateOrderQueries(queryClient, target?.id)
      setRiderId("")
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Rider assignment failed."
      )
    },
  })

  React.useEffect(() => {
    if (target) setRiderId(target.riderId ?? "")
    else setRiderId("")
  }, [target])

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign rider</DialogTitle>
          <DialogDescription>
            Select an available rider for {target?.orderNumber}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Rider</Label>
          <Select value={riderId || undefined} onValueChange={setRiderId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose rider" />
            </SelectTrigger>
            <SelectContent>
              {(ridersQuery.data ?? []).map(
                (rider: AdminRiderAssignmentOption) => (
                  <SelectItem key={rider.id} value={rider.id}>
                    {rider.fullName} ({rider.activeOrders} active)
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!target || !riderId || mutation.isPending}
            onClick={() => {
              if (!target || !riderId) return
              mutation.mutate({ orderId: target.id, riderId })
            }}
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Truck className="size-4" />
            )}
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RefundDialog({
  target,
  onOpenChange,
}: {
  target: null | {
    order: OrderTarget
    paymentStatus: RefundStatus
    label: string
  }
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [note, setNote] = React.useState("")
  const mutation = useMutation({
    mutationFn: updateAdminOrderRefundStatus,
    onSuccess: () => {
      toast.success("Refund status updated.")
      invalidateOrderQueries(queryClient, target?.order.id)
      setNote("")
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Refund update failed."
      )
      invalidateOrderQueries(queryClient, target?.order.id)
    },
  })

  React.useEffect(() => {
    if (!target) setNote("")
  }, [target])

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{target?.label ?? "Update refund"}</DialogTitle>
          <DialogDescription>
            Payment status for {target?.order.orderNumber} will become{" "}
            {target?.paymentStatus}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="refund-note">Refund note</Label>
          <Textarea
            id="refund-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Refund reference or internal note"
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!target || mutation.isPending}
            onClick={() => {
              if (!target) return
              mutation.mutate({
                orderId: target.order.id,
                expectedPaymentStatus: target.order.paymentStatus,
                paymentStatus: target.paymentStatus,
                note,
              })
            }}
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <WalletCards className="size-4" />
            )}
            Save refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function OrderActionsMenu({
  order,
  onView,
  onStatus,
  onAssign,
  onRefund,
}: {
  order: AdminOrderListItem
  onView: () => void
  onStatus: (
    order: OrderTarget,
    nextStatus: AdminOrderNextStatus,
    label: string
  ) => void
  onAssign: (order: OrderTarget) => void
  onRefund: (order: OrderTarget, paymentStatus: RefundStatus, label: string) => void
}) {
  const statusActions = getStatusActions(order.status)
  const target = toOrderTarget(order)

  const reviewRequestMutation = useMutation({
    mutationFn: () => sendAdminOrderReviewRequest({ orderId: order.id }),
    onSuccess: () => {
      toast.success("Review request sent to the customer")
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not send review request",
      )
    },
  })

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="data-[state=open]:bg-muted"
          aria-label={`Open actions for ${order.orderNumber}`}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem onClick={onView}>
          <Eye className="size-4" />
          View details
        </DropdownMenuItem>
        {order.status === "Delivered" ? (
          <DropdownMenuItem
            onClick={(event) => {
              event.preventDefault()
              if (!reviewRequestMutation.isPending) {
                reviewRequestMutation.mutate()
              }
            }}
          >
            <Star className="size-4" />
            {reviewRequestMutation.isPending
              ? "Sending..."
              : "Send review request"}
          </DropdownMenuItem>
        ) : null}
        {order.status === "ReadyForPickup" ? (
          <DropdownMenuItem onClick={() => onAssign(target)}>
            <Truck className="size-4" />
            {order.riderId ? "Reassign rider" : "Assign rider"}
          </DropdownMenuItem>
        ) : null}
        {statusActions.length ? <DropdownMenuSeparator /> : null}
        {statusActions.map((action) => (
          <DropdownMenuItem
            key={`${order.id}-${action.nextStatus}`}
            variant={action.variant === "destructive" ? "destructive" : "default"}
            onClick={() => onStatus(target, action.nextStatus, action.label)}
          >
            <action.icon className="size-4" />
            {action.label}
          </DropdownMenuItem>
        ))}
        {isRefundCandidate(order) ? (
          <>
            <DropdownMenuSeparator />
            {order.paymentStatus === "paid" ? (
              <DropdownMenuItem
                onClick={() =>
                  onRefund(target, "refund_pending", "Mark refund pending")
                }
              >
                <WalletCards className="size-4" />
                Mark refund pending
              </DropdownMenuItem>
            ) : null}
            {order.paymentStatus === "refund_pending" ? (
              <DropdownMenuItem
                onClick={() => onRefund(target, "refunded", "Mark refunded")}
              >
                <WalletCards className="size-4" />
                Mark refunded
              </DropdownMenuItem>
            ) : null}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function OrderDetailsSheet({
  orderId,
  open,
  onOpenChange,
  onStatus,
  onAssign,
  onRefund,
}: {
  orderId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onStatus: (
    order: OrderTarget,
    nextStatus: AdminOrderNextStatus,
    label: string
  ) => void
  onAssign: (order: OrderTarget) => void
  onRefund: (order: OrderTarget, paymentStatus: RefundStatus, label: string) => void
}) {
  const detailsQuery = useQuery({
    queryKey: ["admin-order", orderId],
    queryFn: () => getAdminOrder(orderId),
    enabled: open && Boolean(orderId),
  })
  const activityLogsQuery = useQuery({
    queryKey: ["admin-activity-logs", "order", orderId],
    queryFn: () =>
      listAdminActivityLogs({
        entityType: "order",
        entityId: orderId,
        pageSize: 20,
      }),
    enabled: open && Boolean(orderId),
  })
  const details = detailsQuery.data
  const [nowMs, setNowMs] = React.useState(() => Date.now())
  const target = details ? toOrderTarget(details) : null
  const statusActions = details ? getStatusActions(details.status) : []
  const reviewRequestMutation = useMutation({
    mutationFn: () => sendAdminOrderReviewRequest({ orderId }),
    onSuccess: () => toast.success("Review request sent to the customer"),
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not send review request",
      ),
  })
  const timing = details?.operationalTiming
  const prepTiming = details?.preparationTiming
  const extraPrepMinutes = Math.max(0, Math.round(prepTiming?.extraMinutes ?? 0))
  const autoCancelRemainingSeconds =
    details?.autoCancel?.applies && details.autoCancel.autoCancelAt
      ? Math.max(
          0,
          Math.ceil((new Date(details.autoCancel.autoCancelAt).getTime() - nowMs) / 1000)
        )
      : details?.autoCancel?.remainingSeconds

  React.useEffect(() => {
    if (!open || !details?.autoCancel?.applies || !details.autoCancel.autoCancelAt) {
      return
    }
    setNowMs(Date.now())
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [details?.autoCancel?.applies, details?.autoCancel?.autoCancelAt, open])

  const combinedTimeline = React.useMemo(() => {
    const historyEntries = (details?.history ?? []).map((entry, index) => ({
      key: `history-${index}-${entry.createdAt ?? index}`,
      title: entry.status,
      actor: entry.actor,
      note: entry.note || "No note",
      createdAt: entry.createdAt,
      kind: "history" as const,
    }))

    const auditEntries = (activityLogsQuery.data?.items ?? []).map((entry) => ({
      key: `audit-${entry.id}`,
      title: entry.title,
      actor: entry.adminName || "Support Team",
      note: entry.description || "No details",
      createdAt: entry.createdAt,
      kind: "audit" as const,
    }))

    return [...auditEntries, ...historyEntries].sort((left, right) => {
      const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0
      const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0
      return rightTime - leftTime
    })
  }, [activityLogsQuery.data?.items, details?.history])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl! md:max-w-6xl!">
        <SheetHeader className="border-b">
          <SheetTitle>{details?.orderNumber ?? "Order details"}</SheetTitle>
          <SheetDescription>
            Full order timeline, customer, payment, rider and refund controls.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          {detailsQuery.isPending ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading order details...
            </div>
          ) : details ? (
            <div className="space-y-5 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={getOrderStatusBadgeClass(details.status)}
                    >
                      {details.status}
                    </Badge>
                    <Badge variant="secondary">
                      {details.paymentMethod || "N/A"}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={getPaymentBadgeClass(details.paymentStatus)}
                    >
                      {details.paymentStatus}
                    </Badge>
                    {details.appliedVouchers?.map((voucher, index) => (
                      <Badge
                        key={`${voucher.id || voucher.code || voucher.name}-${index}`}
                        variant="outline"
                        className={getVoucherFundingBadgeClass(voucher.fundedBy)}
                      >
                        {voucher.fundedBy === "platform"
                          ? "Platform voucher"
                          : voucher.fundedBy === "owner"
                            ? "Owner voucher"
                            : "Shared voucher"}
                      </Badge>
                    ))}
                    {extraPrepMinutes > 0 ? (
                      <Badge
                        variant="outline"
                        className="border-amber-200 bg-amber-50 text-amber-700"
                      >
                        <Clock className="mr-1 size-3" />
                        +{extraPrepMinutes} min prep
                      </Badge>
                    ) : null}
                  </div>
                  <h2 className="mt-2 text-xl font-semibold">
                    {details.restaurantName}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Owner: {details.restaurantOwnerName || "Restaurant owner"} -{" "}
                    {details.restaurantOwnerPhone || "No phone"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {details.status === "Delivered" ? (
                    <Button
                      variant="outline"
                      disabled={reviewRequestMutation.isPending}
                      onClick={() => reviewRequestMutation.mutate()}
                    >
                      <Star className="size-4" />
                      {reviewRequestMutation.isPending
                        ? "Sending..."
                        : "Send review request"}
                    </Button>
                  ) : null}
                  {details.status === "ReadyForPickup" && target ? (
                    <Button variant="outline" onClick={() => onAssign(target)}>
                      <Truck className="size-4" />
                      {details.riderId ? "Reassign rider" : "Assign rider"}
                    </Button>
                  ) : null}
                  {target && isRefundCandidate(target) ? (
                    details.paymentStatus === "paid" ? (
                      <Button
                        variant="outline"
                        onClick={() =>
                          onRefund(target, "refund_pending", "Mark refund pending")
                        }
                      >
                        <WalletCards className="size-4" />
                        Refund pending
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => onRefund(target, "refunded", "Mark refunded")}
                      >
                        <WalletCards className="size-4" />
                        Mark refunded
                      </Button>
                    )
                  ) : null}
                  {target
                    ? statusActions.map((action) => (
                        <Button
                          key={action.nextStatus}
                          variant={
                            action.variant === "destructive"
                              ? "destructive"
                              : "default"
                          }
                          onClick={() =>
                            onStatus(target, action.nextStatus, action.label)
                          }
                        >
                          <action.icon className="size-4" />
                          {action.label}
                        </Button>
                      ))
                    : null}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <Card className="border-pink-100 bg-pink-50/60">
                  <CardContent className="flex items-center gap-3 p-4">
                    <Clock className="size-5 text-pink-700" />
                    <div>
                      <div className="text-xs font-medium uppercase text-muted-foreground">
                        Avg prep time
                      </div>
                      <div className="text-sm font-semibold">
                        {formatMinutesLabel(
                          timing?.averagePreparationMinutes ?? null
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Restaurant average
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-sky-100 bg-sky-50/50">
                  <CardContent className="flex items-center gap-3 p-4">
                    <CalendarClock className="size-5 text-sky-700" />
                    <div>
                      <div className="text-xs font-medium uppercase text-muted-foreground">
                        {timing?.currentPhaseLabel ?? "Current timing"}
                      </div>
                      <div className="text-sm font-semibold">
                        {timing?.primaryLabel ?? "Waiting for the next status"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {timing?.secondaryLabel ?? "No timing signal available"}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card
                  className={
                    (timing?.lateByMinutes ?? 0) > 0
                      ? "border-rose-200 bg-rose-50/70"
                      : details.autoCancel?.applies
                        ? "border-amber-200 bg-amber-50/70"
                        : "border-emerald-200 bg-emerald-50/60"
                  }
                >
                  <CardContent className="flex items-center gap-3 p-4">
                    <Clock
                      className={`size-5 ${
                        (timing?.lateByMinutes ?? 0) > 0
                          ? "text-rose-700"
                          : details.autoCancel?.applies
                            ? "text-amber-700"
                            : "text-emerald-700"
                      }`}
                    />
                    <div>
                      <div className="text-xs font-medium uppercase text-muted-foreground">
                        {(timing?.lateByMinutes ?? 0) > 0
                          ? "Late by"
                          : details.autoCancel?.applies
                            ? "Auto-cancel"
                            : "Target window"}
                      </div>
                      <div className="text-sm font-semibold">
                        {(timing?.lateByMinutes ?? 0) > 0
                          ? formatMinutesLabel(timing?.lateByMinutes)
                          : details.autoCancel?.applies
                            ? autoCancelRemainingSeconds === 0
                              ? "Due now"
                              : `${formatDurationFromSeconds(autoCancelRemainingSeconds)} remaining`
                            : timing?.targetMinutes
                              ? formatMinutesLabel(timing.targetMinutes)
                              : "On track"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {(timing?.lateByMinutes ?? 0) > 0
                          ? "Beyond the current service target"
                          : details.autoCancel?.applies
                            ? "Unaccepted orders close automatically"
                            : timing?.targetAt
                              ? `Target at ${formatDate(timing.targetAt)}`
                              : "No delay right now"}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-violet-100 bg-violet-50/50">
                  <CardContent className="flex items-center gap-3 p-4">
                    {details.restaurantOwnerPhone ? (
                      <Phone className="size-5 text-violet-700" />
                    ) : null}
                    <div>
                      <div className="text-xs font-medium uppercase text-muted-foreground">
                        Restaurant owner
                      </div>
                      <div className="text-sm font-semibold">
                        {details.restaurantOwnerPhone || "No phone available"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {details.restaurantOwnerName || "Restaurant owner"}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <Card className="border-slate-200 bg-slate-50/70">
                  <CardContent className="flex items-center gap-3 p-4">
                    <Clock className="size-5 text-sky-700" />
                    <div>
                      <div className="text-xs font-medium uppercase text-muted-foreground">
                        Order placed
                      </div>
                      <div className="text-sm font-semibold">
                        {formatDate(details.timestamps.createdAt)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-slate-200 bg-slate-50/70">
                  <CardContent className="flex items-center gap-3 p-4">
                    <Clock className="size-5 text-slate-700" />
                    <div>
                      <div className="text-xs font-medium uppercase text-muted-foreground">
                        Auto-cancel timer
                      </div>
                      <div className="text-sm font-semibold">
                        {details.autoCancel?.applies
                          ? autoCancelRemainingSeconds === 0
                            ? "Due now"
                            : `${formatDurationFromSeconds(autoCancelRemainingSeconds)} remaining`
                          : details.autoCancel?.enabled
                            ? "Not active for this status"
                            : "Disabled"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {details.autoCancel?.enabled
                          ? "Dispatch automation setting"
                          : "Order auto-cancel is disabled"}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <StatCard
                  label="Prep target"
                  value={
                    prepTiming?.totalMinutes
                      ? formatMinutesLabel(prepTiming.totalMinutes)
                      : timing?.targetMinutes
                        ? formatMinutesLabel(timing.targetMinutes)
                        : "N/A"
                  }
                  helper={
                    prepTiming?.targetReadyAt
                      ? `Ready target ${formatDate(prepTiming.targetReadyAt)}`
                      : "Current stage target"
                  }
                />
                <StatCard
                  label="Added prep time"
                  value={extraPrepMinutes > 0 ? `+${extraPrepMinutes} min` : "None"}
                  helper={
                    prepTiming?.baseMinutes
                      ? `${formatMinutesLabel(prepTiming.baseMinutes)} base kitchen time`
                      : "No extension recorded"
                  }
                />
                <StatCard
                  label="Remaining"
                  value={
                    typeof timing?.remainingMinutes === "number"
                      ? formatMinutesLabel(timing.remainingMinutes)
                      : "N/A"
                  }
                  helper="Current stage estimate"
                />
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <StatCard
                  label="Total"
                  value={formatCurrency(details.pricing.total)}
                  helper="Customer payable"
                />
                <StatCard
                  label="Subtotal"
                  value={formatCurrency(details.pricing.subtotal)}
                  helper="Items before delivery"
                />
                <StatCard
                  label="Delivery fee"
                  value={formatCurrency(details.pricing.deliveryFee)}
                  helper="Delivery charge"
                />
                <StatCard
                  label="Discount"
                  value={formatCurrency(details.pricing.discount)}
                  helper={`Owner ${formatCurrency(details.pricing.ownerDiscountCost ?? 0)} / Platform ${formatCurrency(details.pricing.platformDiscountCost ?? 0)}`}
                />
              </div>

              <Tabs defaultValue="overview" className="gap-4">
                <TabsList className="flex h-auto w-full flex-wrap justify-start">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="items">Items</TabsTrigger>
                  <TabsTrigger value="delivery">Delivery</TabsTrigger>
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                  <TabsTrigger value="payment">Payment</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4">
                  <div className="grid gap-4 xl:grid-cols-3">
                    <Card>
                      <CardHeader>
                        <CardTitle>Customer</CardTitle>
                        <CardDescription>Contact and address.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm">
                        <InfoRow label="Name" value={details.customerName} />
                        <InfoRow
                          label="Phone"
                          value={details.customerPhone || "N/A"}
                        />
                        <InfoRow
                          label="Address"
                          value={details.deliveryAddress || "N/A"}
                        />
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle>Restaurant</CardTitle>
                        <CardDescription>Order source.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm">
                        <InfoRow
                          label="Restaurant"
                          value={details.restaurantName}
                        />
                        <InfoRow
                          label="Owner"
                          value={details.restaurantOwnerName || "N/A"}
                        />
                        <InfoRow
                          label="Owner phone"
                          value={details.restaurantOwnerPhone || "N/A"}
                        />
                        <InfoRow
                          label="Order number"
                          value={details.orderNumber}
                        />
                        <InfoRow label="Created" value={formatDate(details.timestamps.createdAt)} />
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle>Rider</CardTitle>
                        <CardDescription>Delivery assignment.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm">
                        <InfoRow
                          label="Name"
                          value={details.riderName || "Not assigned"}
                        />
                        <InfoRow
                          label="Phone"
                          value={details.riderPhone || "N/A"}
                        />
                        <InfoRow
                          label="Tracking"
                          value={details.riderTracking?.freshness?.state ?? "N/A"}
                        />
                      </CardContent>
                    </Card>
                  </div>

                  {details.review ? (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Star className="size-4 text-amber-500" />
                          Customer review
                        </CardTitle>
                        <CardDescription>
                          Submitted {formatDate(details.review.createdAt)}.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
                        <div className="space-y-1.5 rounded-lg border bg-background p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">
                              Food rating
                            </span>
                            <Badge
                              variant="outline"
                              className="border-amber-200 bg-amber-50 text-amber-700"
                            >
                              <Star className="mr-1 size-3" />
                              {details.review.rating ?? "—"}/5
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {details.review.comment || "No comment"}
                          </p>
                        </div>
                        <div className="space-y-1.5 rounded-lg border bg-background p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">
                              Rider rating
                            </span>
                            <Badge
                              variant="outline"
                              className="border-sky-200 bg-sky-50 text-sky-700"
                            >
                              <Star className="mr-1 size-3" />
                              {details.review.riderRating
                                ? `${details.review.riderRating}/5`
                                : "Not rated"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {details.review.riderComment || "No comment"}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}
                </TabsContent>

                <TabsContent value="items">
                  <Card>
                    <CardHeader>
                      <CardTitle>Order items</CardTitle>
                      <CardDescription>Food items in this order.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-hidden rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Item</TableHead>
                              <TableHead>Quantity</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {details.items.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell>{item.name}</TableCell>
                                <TableCell>{item.quantity}</TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(item.lineTotal)}
                                </TableCell>
                              </TableRow>
                            ))}
                            {details.items.length === 0 ? (
                              <TableRow>
                                <TableCell
                                  colSpan={3}
                                  className="h-24 text-center text-muted-foreground"
                                >
                                  No item snapshot found.
                                </TableCell>
                              </TableRow>
                            ) : null}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="delivery">
                  <Card>
                    <CardHeader>
                      <CardTitle>Delivery status</CardTitle>
                      <CardDescription>
                        Rider tracking and handoff timestamps.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 text-sm md:grid-cols-2">
                      <InfoRow label="Ready" value={formatDate(details.timestamps.readyAt)} />
                      <InfoRow label="Picked up" value={formatDate(details.timestamps.pickedUpAt)} />
                      <InfoRow label="Delivered" value={formatDate(details.timestamps.deliveredAt)} />
                      <InfoRow
                        label="Tracking freshness"
                        value={details.riderTracking?.freshness?.state ?? "N/A"}
                      />
                      <InfoRow
                        label="Remaining distance"
                        value={`${details.riderTracking?.remainingDistanceKm ?? 0} km`}
                      />
                      <InfoRow
                        label="Remaining time"
                        value={`${details.riderTracking?.remainingDurationMinutes ?? 0} min`}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="timeline">
                  <Card>
                    <CardHeader>
                      <CardTitle>Order timeline</CardTitle>
                      <CardDescription>Status history and admin notes.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {combinedTimeline.map((entry) => (
                        <div key={entry.key} className="rounded-lg border p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-medium">{entry.title}</div>
                            <Badge variant="outline">
                              {entry.kind === "audit" ? "admin" : entry.actor}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {entry.note}
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {formatDate(entry.createdAt)}
                          </p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="payment">
                  <Card>
                    <CardHeader>
                      <CardTitle>Payment & refund</CardTitle>
                      <CardDescription>
                        Payment method, status and terminal reason.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 text-sm md:grid-cols-2">
                      <InfoRow label="Method" value={details.paymentMethod} />
                      <InfoRow label="Status" value={details.paymentStatus} />
                      <InfoRow
                        label="Cancelled by"
                        value={details.cancelledBy || "N/A"}
                      />
                      <InfoRow
                        label="Terminal reason"
                        value={details.terminalReason || details.rejectionReason || "N/A"}
                      />
                    </CardContent>
                  </Card>
                  {details.appliedVouchers?.length ? (
                    <Card className="mt-4">
                      <CardHeader>
                        <CardTitle>Applied vouchers</CardTitle>
                        <CardDescription>
                          Voucher source and discount split for this order.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-hidden rounded-lg border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Voucher</TableHead>
                                <TableHead>Funding</TableHead>
                                <TableHead>Split</TableHead>
                                <TableHead className="text-right">Discount</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {details.appliedVouchers.map((voucher, index) => (
                                <TableRow key={`${voucher.id || voucher.code || voucher.name}-${index}`}>
                                  <TableCell>
                                    <div className="font-medium">{voucher.name || "Voucher"}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {voucher.code || "Auto applied"}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant="outline"
                                      className={getVoucherFundingBadgeClass(voucher.fundedBy)}
                                    >
                                      {voucher.fundedBy || "N/A"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    {voucher.ownerSharePercent}% owner / {voucher.platformSharePercent}% platform
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatCurrency(voucher.discountAmount)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <div className="p-4 text-sm text-muted-foreground">
              Order details are not available.
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

export function OrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = React.useState("")
  const [preset, setPreset] = React.useState<OrderPreset>("last7Days")
  const [from, setFrom] = React.useState("")
  const [to, setTo] = React.useState("")
  const [status, setStatus] = React.useState<OrderStatusFilter>("live")
  const [paymentMethod, setPaymentMethod] =
    React.useState<PaymentMethodFilter>("all")
  const [paymentStatus, setPaymentStatus] =
    React.useState<PaymentStatusFilter>("all")
  const [assignment, setAssignment] = React.useState<AssignmentFilter>("all")
  const [attention, setAttention] = React.useState<AttentionFilter>("all")
  const [reviewState, setReviewState] =
    React.useState<ReviewStateFilter>("all")
  const [sortBy, setSortBy] = React.useState<OrderSort>("newest")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)
  const [selectedOrderId, setSelectedOrderId] = React.useState("")
  const [delayedDrawerOpen, setDelayedDrawerOpen] = React.useState(false)
  const [statusTarget, setStatusTarget] = React.useState<null | {
    order: OrderTarget
    nextStatus: AdminOrderNextStatus
    label: string
  }>(null)
  const [assignTarget, setAssignTarget] = React.useState<OrderTarget | null>(
    null
  )
  const [refundTarget, setRefundTarget] = React.useState<null | {
    order: OrderTarget
    paymentStatus: RefundStatus
    label: string
  }>(null)
  const [columnVisibility, setColumnVisibility] = React.useState(
    defaultColumnVisibility
  )
  const [nowMs, setNowMs] = React.useState(() => Date.now())
  const debouncedSearch = useDebouncedValue(search, 350)
  const ordersQuery = useQuery({
    queryKey: [
      "admin-orders",
      debouncedSearch,
      preset,
      from,
      to,
      status,
      paymentMethod,
      paymentStatus,
      assignment,
      attention,
      reviewState,
      sortBy,
      page,
      pageSize,
    ],
    enabled: preset !== "custom" || (Boolean(from) && Boolean(to)),
    queryFn: () =>
      listAdminOrders({
        search: debouncedSearch,
        preset,
        from: preset === "custom" ? from : undefined,
        to: preset === "custom" ? to : undefined,
        status,
        paymentMethod,
        paymentStatus,
        assignment,
        attention,
        reviewState,
        sortBy,
        page,
        pageSize,
      }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  })

  const orders = React.useMemo(
    () => ordersQuery.data?.items ?? [],
    [ordersQuery.data?.items]
  )
  const hasActiveAutoCancelCountdown = React.useMemo(
    () =>
      orders.some(
        (order) => order.status === "New" && order.autoCancel?.applies
      ),
    [orders]
  )

  React.useEffect(() => {
    setNowMs(Date.now())
    const timer = window.setInterval(
      () => setNowMs(Date.now()),
      hasActiveAutoCancelCountdown ? 1000 : 60000
    )
    return () => window.clearInterval(timer)
  }, [hasActiveAutoCancelCountdown])

  const summary = ordersQuery.data?.summary ?? {}
  const delayedRiderOrders = React.useMemo(
    () => orders.filter(isRiderDelayedOrder),
    [orders]
  )
  const delayedDrawerOrders =
    attention === "riderDelay" ? orders : delayedRiderOrders
  const totalOrders = ordersQuery.data?.total ?? 0
  const pageCount = ordersQuery.data?.pageCount ?? 1
  const safePage = Math.min(page, pageCount)
  const visibleColumnCount =
    ORDER_TABLE_COLUMNS.filter((column) => columnVisibility[column.key])
      .length + 1
  const hasFilters =
    search.trim() !== "" ||
    preset !== "last7Days" ||
    from !== "" ||
    to !== "" ||
    status !== "live" ||
    paymentMethod !== "all" ||
    paymentStatus !== "all" ||
    assignment !== "all" ||
    attention !== "all" ||
    reviewState !== "all" ||
    sortBy !== "newest"

  React.useEffect(() => {
    const orderId = searchParams.get("orderId")
    if (orderId) setSelectedOrderId(orderId)
  }, [searchParams])

  React.useEffect(() => {
    setPage(1)
  }, [
    debouncedSearch,
    preset,
    from,
    to,
    status,
    paymentMethod,
    paymentStatus,
    assignment,
    attention,
    reviewState,
    sortBy,
    pageSize,
  ])

  React.useEffect(() => {
    if (preset !== "custom") {
      setFrom("")
      setTo("")
    }
  }, [preset])

  React.useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount)
    }
  }, [page, pageCount])

  function resetFilters() {
    setSearch("")
    setPreset("last7Days")
    setFrom("")
    setTo("")
    setStatus("live")
    setPaymentMethod("all")
    setPaymentStatus("all")
    setAssignment("all")
    setAttention("all")
    setReviewState("all")
    setSortBy("newest")
    setPage(1)
  }

  function showDelayedRiderOrders() {
    setStatus("live")
    setAssignment("all")
    setAttention("riderDelay")
    setSortBy("recentlyUpdated")
    setPage(1)
    setDelayedDrawerOpen(true)
  }

  function exportOrdersCsv() {
    const headers = [
      "Order",
      "Status",
      "Restaurant",
      "Customer",
      "Phone",
      "Payment Method",
      "Payment Status",
      "Total",
      "Rider",
      "Created At",
    ]
    const rows = orders.map((order) => [
      order.orderNumber,
      order.status,
      order.restaurantName,
      order.customerName,
      order.customerPhone,
      order.paymentMethod,
      order.paymentStatus,
      `${Math.round(order.total)}`,
      order.riderName || "Not assigned",
      order.createdAt ?? "",
    ])
    const csv = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")
      )
      .join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `admin-orders-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  function exportOrdersPdf() {
    const ok = printTableReport({
      title: "Foodbela orders report",
      subtitle: `Generated ${format(new Date(), "PPP p")} from current admin filters.`,
      metrics: [
        { label: "Filtered orders", value: summary.total ?? totalOrders },
        { label: "Live orders", value: summary.liveOrders ?? 0 },
        { label: "Refund queue", value: summary.refundPending ?? 0 },
      ],
      headers: [
        "Order",
        "Status",
        "Restaurant",
        "Customer",
        "Payment",
        "Total",
        "Rider",
        "Created",
      ],
      rows: orders.map((order) => [
        order.orderNumber,
        order.status,
        order.restaurantName,
        `${order.customerName} ${order.customerPhone ? `(${order.customerPhone})` : ""}`,
        `${order.paymentMethod || "N/A"} / ${order.paymentStatus || "N/A"}`,
        formatCurrency(order.total),
        order.riderName || "Not assigned",
        formatDate(order.createdAt),
      ]),
    })
    if (!ok) toast.error("Allow popups to export the PDF report.")
  }

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
              <PackageCheck className="size-4" />
            </div>
            <Badge variant="outline">Core platform module</Badge>
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Orders</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Track live orders, update restaurant-side status, assign riders,
            monitor delivery health, and manage online payment refunds.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard
          label="Filtered orders"
          value={`${summary.total ?? ordersQuery.data?.total ?? 0}`}
          helper="Matching current filters"
        />
        <StatCard
          label="Live orders"
          value={`${summary.liveOrders ?? 0}`}
          helper={`${summary.newOrders ?? 0} new`}
        />
        <StatCard
          label="Delivered revenue"
          value={formatCurrency(summary.deliveredRevenue ?? 0)}
          helper="Delivered orders only"
        />
        <StatCard
          label="Unassigned ready"
          value={`${summary.unassignedReadyOrders ?? 0}`}
          helper="Needs rider assignment"
        />
        <StatCard
          label="Rider delays"
          value={`${summary.delayedRiderOrders ?? delayedRiderOrders.length}`}
          helper="Pickup/trip attention"
        />
        <StatCard
          label="Refund queue"
          value={`${summary.refundPending ?? 0}`}
          helper="Paid cancelled orders"
        />
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <CardTitle>Order operations</CardTitle>
              <CardDescription className="mt-1 max-w-2xl">
                Search, filter, and act on real platform orders.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={attention === "riderDelay" ? "default" : "outline"}
                onClick={showDelayedRiderOrders}
                className="w-full sm:w-auto"
              >
                <AlertTriangle className="size-4" />
                Delayed riders
                {(summary.delayedRiderOrders ?? delayedRiderOrders.length) > 0 ? (
                  <Badge
                    variant="secondary"
                    className="ml-1 rounded-full bg-white/20 px-1.5 text-[10px]"
                  >
                    {summary.delayedRiderOrders ?? delayedRiderOrders.length}
                  </Badge>
                ) : null}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={orders.length === 0}
                onClick={exportOrdersCsv}
                className="w-full sm:w-auto"
              >
                <Download className="size-4" />
                Export CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={orders.length === 0}
                onClick={exportOrdersPdf}
                className="w-full sm:w-auto"
              >
                <Download className="size-4" />
                Export PDF
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full sm:w-auto">
                    <TableConfig className="size-4" />
                    Columns
                    <ChevronDown className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Show columns</DropdownMenuLabel>
                  {ORDER_TABLE_COLUMNS.map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.key}
                      checked={columnVisibility[column.key]}
                      onCheckedChange={(checked) =>
                        setColumnVisibility((current) => ({
                          ...current,
                          [column.key]: Boolean(checked),
                        }))
                      }
                    >
                      {column.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <div className="relative w-full lg:max-w-xs">
                  <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search order, customer, restaurant"
                    className="pl-8"
                  />
                </div>
                <AdminDateRangeFilter<OrderPreset>
                  value={preset}
                  from={from}
                  to={to}
                  label="Date"
                  triggerClassName="sm:w-44"
                  onPresetChange={setPreset}
                  onRangeChange={(range) => {
                    setFrom(range.from)
                    setTo(range.to)
                  }}
                />
                <Select
                  value={status}
                  onValueChange={(value) =>
                    setStatus(value as OrderStatusFilter)
                  }
                >
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All status</SelectItem>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="live">Live</SelectItem>
                    <SelectItem value="ready">Ready</SelectItem>
                    <SelectItem value="pickedUp">Picked up</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="refund">Refund queue</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={paymentMethod}
                  onValueChange={(value) =>
                    setPaymentMethod(value as PaymentMethodFilter)
                  }
                >
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All payment</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Bkash">Bkash</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={paymentStatus}
                  onValueChange={(value) =>
                    setPaymentStatus(value as PaymentStatusFilter)
                  }
                >
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any payment status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="refund_pending">
                      Refund pending
                    </SelectItem>
                    <SelectItem value="refunded">Refunded</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={assignment}
                  onValueChange={(value) =>
                    setAssignment(value as AssignmentFilter)
                  }
                >
                  <SelectTrigger className="w-full sm:w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All assignment</SelectItem>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    <SelectItem value="assigned">Assigned</SelectItem>
                    <SelectItem value="stale">Stale tracking</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={attention}
                  onValueChange={(value) =>
                    setAttention(value as AttentionFilter)
                  }
                >
                  <SelectTrigger className="w-full sm:w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All attention</SelectItem>
                    <SelectItem value="riderDelay">Rider delay</SelectItem>
                    <SelectItem value="extraTime">Extra prep time</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={reviewState}
                  onValueChange={(value) =>
                    setReviewState(value as ReviewStateFilter)
                  }
                >
                  <SelectTrigger className="w-full sm:w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All reviews</SelectItem>
                    <SelectItem value="reviewed">Reviewed</SelectItem>
                    <SelectItem value="requested">Review requested</SelectItem>
                    <SelectItem value="pending">Review pending</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={sortBy}
                  onValueChange={(value) => setSortBy(value as OrderSort)}
                >
                  <SelectTrigger className="w-full sm:w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest</SelectItem>
                    <SelectItem value="oldest">Oldest</SelectItem>
                    <SelectItem value="highestValue">Highest value</SelectItem>
                    <SelectItem value="recentlyUpdated">
                      Recently updated
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!hasFilters}
                  onClick={resetFilters}
                  className="w-full sm:w-auto"
                >
                  <RotateCcw className="size-4" />
                  Reset filter
                </Button>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  {columnVisibility.order ? <TableHead>Order</TableHead> : null}
                  {columnVisibility.status ? (
                    <TableHead>Status</TableHead>
                  ) : null}
                  {columnVisibility.restaurant ? (
                    <TableHead>Restaurant</TableHead>
                  ) : null}
                  {columnVisibility.customer ? (
                    <TableHead>Customer</TableHead>
                  ) : null}
                  {columnVisibility.payment ? (
                    <TableHead>Payment</TableHead>
                  ) : null}
                  {columnVisibility.total ? <TableHead>Total</TableHead> : null}
                  {columnVisibility.rider ? <TableHead>Rider</TableHead> : null}
                  {columnVisibility.timing ? (
                    <TableHead>Timing</TableHead>
                  ) : null}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
              {orders.map((order) => {
                const autoCancelSeconds = getAutoCancelRemainingSeconds(order, nowMs)
                const extraPrepMinutes = getExtraPrepMinutes(order)

                return (
                <TableRow
                  key={order.id}
                    className={
                      order.isLate
                        ? order.lateTone === "critical"
                          ? "bg-rose-50/60 hover:bg-rose-50/70"
                          : "bg-amber-50/60 hover:bg-amber-50/70"
                        : undefined
                    }
                  >
                    {columnVisibility.order ? (
                      <TableCell>
                        <button
                          type="button"
                          className="text-left"
                          onClick={() => setSelectedOrderId(order.id)}
                        >
                          <span className="block font-medium">
                            {order.orderNumber}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {formatDate(order.createdAt)}
                          </span>
                          {order.voucherCodes?.length ? (
                            <Badge
                              variant="outline"
                              className="mt-1 border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700"
                            >
                              Voucher applied
                            </Badge>
                          ) : null}
                        </button>
                      </TableCell>
                    ) : null}
                    {columnVisibility.status ? (
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Badge
                            variant="outline"
                            className={getOrderStatusBadgeClass(order.status)}
                          >
                            {order.status}
                          </Badge>
                        {order.isLate ? (
                            <Badge
                              variant="outline"
                              className={getLateBadgeClass(order)}
                            >
                              {order.lateReason}
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
                            <Clock className="mr-1 size-3" />
                            {autoCancelSeconds === 0
                              ? "Auto-cancel due"
                            : `Accept in ${formatDurationFromSeconds(autoCancelSeconds)}`}
                          </Badge>
                        ) : null}
                        {extraPrepMinutes > 0 ? (
                          <Badge
                            variant="outline"
                            className="border-amber-200 bg-amber-50 text-amber-700"
                          >
                            <Clock className="mr-1 size-3" />
                            +{extraPrepMinutes} min prep
                          </Badge>
                        ) : null}
                        {order.status === "Delivered" &&
                        order.review &&
                        order.review.state !== "none" ? (
                          <>
                            <Badge
                              variant="outline"
                              className={
                                order.review.state === "reviewed"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-sky-200 bg-sky-50 text-sky-700"
                              }
                            >
                              <Star className="mr-1 size-3" />
                              {order.review.state === "reviewed"
                                ? `Food ${order.review.rating ?? ""}★`.trim()
                                : "Review sent"}
                            </Badge>
                            {order.review.state === "reviewed" &&
                            order.review.riderRating ? (
                              <Badge
                                variant="outline"
                                className="border-sky-200 bg-sky-50 text-sky-700"
                              >
                                <Bike className="mr-1 size-3" />
                                {order.review.riderRating}★
                              </Badge>
                            ) : null}
                          </>
                        ) : null}
                        </div>
                      </TableCell>
                    ) : null}
                    {columnVisibility.restaurant ? (
                      <TableCell>{order.restaurantName}</TableCell>
                    ) : null}
                    {columnVisibility.customer ? (
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{order.customerName}</span>
                          {order.customerTier === "vip" ? (
                            <Badge
                              variant="outline"
                              className="h-5 border-amber-200 bg-amber-50 px-1.5 text-[10px] text-amber-700"
                            >
                              VIP
                            </Badge>
                          ) : order.customerTier === "repeat" ? (
                            <Badge
                              variant="outline"
                              className="h-5 border-sky-200 bg-sky-50 px-1.5 text-[10px] text-sky-700"
                            >
                              Repeat
                            </Badge>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {order.customerPhone || "No phone"}
                          {order.customerLifetimeOrders
                            ? ` · ${order.customerLifetimeOrders} lifetime`
                            : ""}
                        </div>
                      </TableCell>
                    ) : null}
                    {columnVisibility.payment ? (
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline">
                            {order.paymentMethod || "N/A"}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={getPaymentBadgeClass(
                              order.paymentStatus
                            )}
                          >
                            {order.paymentStatus || "N/A"}
                          </Badge>
                        </div>
                      </TableCell>
                    ) : null}
                    {columnVisibility.total ? (
                      <TableCell>{formatCurrency(order.total)}</TableCell>
                    ) : null}
                    {columnVisibility.rider ? (
                      <TableCell>
                        <div>{order.riderName || "Not assigned"}</div>
                        <div className="text-xs text-muted-foreground">
                          {order.assignmentState}
                        </div>
                      </TableCell>
                    ) : null}
                    {columnVisibility.timing ? (
                      <TableCell>
                        <div className="text-sm">
                          {order.status === "Delivered"
                            ? formatDate(order.deliveredAt)
                            : order.status === "PickedUp"
                              ? formatDate(order.pickedUpAt)
                              : order.status === "ReadyForPickup"
                                ? formatDate(order.readyAt)
                                : formatDate(order.updatedAt)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {autoCancelSeconds !== null
                            ? autoCancelSeconds === 0
                              ? "Waiting for backend auto-cancel"
                              : `${formatDurationFromSeconds(autoCancelSeconds)} to accept`
                            : extraPrepMinutes > 0
                              ? `${extraPrepMinutes} min extra prep`
                            : order.riderTracking?.freshness?.state ?? "N/A"}
                        </div>
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedOrderId(order.id)}
                        >
                          <Eye className="size-4" />
                          View
                        </Button>
                        <OrderActionsMenu
                          order={order}
                          onView={() => setSelectedOrderId(order.id)}
                          onStatus={(orderTarget, nextStatus, label) =>
                            setStatusTarget({
                              order: orderTarget,
                              nextStatus,
                              label,
                            })
                          }
                          onAssign={setAssignTarget}
                          onRefund={(orderTarget, nextPaymentStatus, label) =>
                            setRefundTarget({
                              order: orderTarget,
                              paymentStatus: nextPaymentStatus,
                              label,
                            })
                          }
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
                {ordersQuery.isPending ? (
                  <TableRow>
                    <TableCell
                      colSpan={visibleColumnCount}
                      className="h-24 text-center"
                    >
                      <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : orders.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={visibleColumnCount}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No orders match this filter.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>

        </CardContent>
      </Card>

      <div className="flex flex-col gap-4 rounded-2xl border bg-card px-4 py-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {orders.length} of {totalOrders} order(s)
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select
            value={`${pageSize}`}
            onValueChange={(value) => {
              setPageSize(Number(value))
              setPage(1)
            }}
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
            Page {safePage} of {pageCount}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={safePage <= 1}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                setPage((current) => Math.min(pageCount, current + 1))
              }
              disabled={safePage >= pageCount}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <Sheet open={delayedDrawerOpen} onOpenChange={setDelayedDrawerOpen}>
        <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl! md:max-w-6xl!">
          <SheetHeader className="border-b px-6 py-5">
            <SheetTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-rose-600" />
              Delayed rider orders
            </SheetTitle>
            <SheetDescription>
              Pickup, assignment, stale tracking, and delivery delay signals.
            </SheetDescription>
          </SheetHeader>
          <div className="border-b bg-muted/30 px-6 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full">
                {totalOrders} matching
              </Badge>
              <Badge variant="outline" className="rounded-full border-rose-200 bg-rose-50 text-rose-700">
                {summary.delayedRiderOrders ?? delayedDrawerOrders.length} delayed
              </Badge>
              {attention === "riderDelay" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setAttention("all")
                    setDelayedDrawerOpen(false)
                  }}
                >
                  Clear delayed filter
                </Button>
              ) : null}
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-3 p-4">
              {ordersQuery.isPending ? (
                <div className="flex h-40 items-center justify-center">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              ) : delayedDrawerOrders.length ? (
                delayedDrawerOrders.map((order) => (
                  <div
                    key={order.id}
                    className="rounded-2xl border bg-card p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold">{order.orderNumber}</div>
                        <div className="mt-1 truncate text-sm text-muted-foreground">
                          {order.restaurantName} to {order.customerName}
                        </div>
                      </div>
                      <Badge variant="outline" className={getLateBadgeClass(order)}>
                        {order.lateReason || "Delayed"}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                      <div>
                        <span className="font-medium text-foreground">Status:</span>{" "}
                        {order.status}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Late:</span>{" "}
                        {formatMinutesLabel(order.lateMinutes)}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Rider:</span>{" "}
                        {order.riderName || "Not assigned"}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Tracking:</span>{" "}
                        {order.riderTracking?.freshness?.state ?? "N/A"}
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap justify-end gap-2">
                      {order.status === "ReadyForPickup" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setAssignTarget(toOrderTarget(order))}
                        >
                          <Truck className="size-4" />
                          {order.riderId ? "Reassign" : "Assign"}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          setSelectedOrderId(order.id)
                          setDelayedDrawerOpen(false)
                        }}
                      >
                        <Eye className="size-4" />
                        Details
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No rider delay found for the current filters.
                </div>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <OrderStatusDialog
        target={statusTarget}
        onOpenChange={(open) => {
          if (!open) setStatusTarget(null)
        }}
      />
      <AssignRiderDialog
        target={assignTarget}
        onOpenChange={(open) => {
          if (!open) setAssignTarget(null)
        }}
      />
      <RefundDialog
        target={refundTarget}
        onOpenChange={(open) => {
          if (!open) setRefundTarget(null)
        }}
      />
      <OrderDetailsSheet
        orderId={selectedOrderId}
        open={Boolean(selectedOrderId)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setSelectedOrderId("")
            setSearchParams((current) => {
              current.delete("orderId")
              return current
            })
          }
        }}
        onStatus={(orderTarget, nextStatus, label) =>
          setStatusTarget({ order: orderTarget, nextStatus, label })
        }
        onAssign={setAssignTarget}
        onRefund={(orderTarget, nextPaymentStatus, label) =>
          setRefundTarget({
            order: orderTarget,
            paymentStatus: nextPaymentStatus,
            label,
          })
        }
      />
    </>
  )
}
