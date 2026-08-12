import * as React from "react"
import { useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  BadgeCheck,
  Banknote,
  CheckCircle2,
  Loader2,
  PackageCheck,
  RefreshCcw,
  Wallet,
} from "lucide-react"

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  getAdminExternalDeliveries,
  getAdminExternalDeliverySummary,
  reconcileAdminExternalDelivery,
  settleAdminExternalDeliveries,
  type AdminExternalDeliveryOrder,
  type ExternalSettlementStatus,
} from "@/lib/admin-api"

function formatTk(value?: number | null) {
  return `Tk ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`
}

function formatDateTime(value?: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

const SETTLEMENT_LABEL: Record<ExternalSettlementStatus, string> = {
  pending: "Awaiting delivery",
  collected: "Collected — reconcile",
  reconciled: "Ready to settle",
  settled: "Settled",
  held: "On hold",
  cancelled: "Cancelled",
}

function settlementBadgeClass(status: ExternalSettlementStatus) {
  switch (status) {
    case "settled":
      return "border-emerald-300 bg-emerald-50 text-emerald-700"
    case "reconciled":
      return "border-sky-300 bg-sky-50 text-sky-700"
    case "collected":
      return "border-amber-300 bg-amber-50 text-amber-700"
    case "cancelled":
      return "border-rose-300 bg-rose-50 text-rose-700"
    case "held":
      return "border-purple-300 bg-purple-50 text-purple-700"
    default:
      return "border-slate-300 bg-slate-50 text-slate-600"
  }
}

const STATUS_FILTERS: { value: ExternalSettlementStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "collected", label: "Collected" },
  { value: "reconciled", label: "Ready to settle" },
  { value: "settled", label: "Settled" },
  { value: "pending", label: "In progress" },
  { value: "cancelled", label: "Cancelled" },
]

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
  helper,
}: {
  icon: typeof Wallet
  label: string
  value: string
  tone: string
  helper: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${tone}`}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-lg font-semibold">{value}</p>
          <p className="truncate text-[11px] text-muted-foreground">{helper}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export function ExternalDeliveryPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = React.useState<
    ExternalSettlementStatus | "all"
  >("all")
  const [selected, setSelected] = React.useState<Set<string>>(new Set())

  const summaryQuery = useQuery({
    queryKey: ["admin-external-delivery-summary"],
    queryFn: () => getAdminExternalDeliverySummary(),
    staleTime: 15_000,
  })

  const listQuery = useQuery({
    queryKey: ["admin-external-deliveries", statusFilter],
    queryFn: () =>
      getAdminExternalDeliveries({
        settlementStatus: statusFilter === "all" ? undefined : statusFilter,
        pageSize: 50,
      }),
    staleTime: 10_000,
  })

  const reconcileMutation = useMutation({
    mutationFn: (orderId: string) => reconcileAdminExternalDelivery(orderId),
    onSuccess: () => {
      toast.success("Marked as reconciled")
      refreshAll()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to reconcile")
    },
  })

  const settleMutation = useMutation({
    mutationFn: (orderIds: string[]) => settleAdminExternalDeliveries(orderIds),
    onSuccess: (result) => {
      toast.success(
        `Settled ${result.settledCount} order(s) — ${formatTk(result.totalNetToOwner)} to owners (${result.settlementId})`
      )
      setSelected(new Set())
      refreshAll()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to settle")
    },
  })

  function refreshAll() {
    void queryClient.invalidateQueries({ queryKey: ["admin-external-deliveries"] })
    void queryClient.invalidateQueries({
      queryKey: ["admin-external-delivery-summary"],
    })
  }

  const orders = listQuery.data?.items ?? []
  const summary = summaryQuery.data

  const reconciledSelectable = React.useMemo(
    () => orders.filter((order) => order.settlementStatus === "reconciled"),
    [orders]
  )

  function toggleSelect(order: AdminExternalDeliveryOrder) {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(order.orderId)) next.delete(order.orderId)
      else next.add(order.orderId)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected((previous) => {
      if (previous.size === reconciledSelectable.length) return new Set()
      return new Set(reconciledSelectable.map((order) => order.orderId))
    })
  }

  const selectedIds = [...selected]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <PackageCheck className="size-5" />
            External Delivery — Orders
          </h1>
          <p className="text-sm text-muted-foreground">
            Off-platform orders where Foodbela delivers only. Track collected cash and
            settle each restaurant’s share. Enable + fee are set per restaurant in the
            restaurant’s page.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            void summaryQuery.refetch()
            void listQuery.refetch()
          }}
        >
          <RefreshCcw className="size-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={Wallet}
          label="Owed to owners"
          value={formatTk(summary?.owedToOwners)}
          tone="bg-amber-50 text-amber-600"
          helper="Collected + reconciled, not yet paid"
        />
        <SummaryCard
          icon={Banknote}
          label="Ready to settle"
          value={formatTk(summary?.readyToSettle)}
          tone="bg-sky-50 text-sky-600"
          helper="Reconciled — pay owners now"
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Foodbela revenue"
          value={formatTk(summary?.foodbelaRevenue)}
          tone="bg-emerald-50 text-emerald-600"
          helper="Delivery fees on delivered orders"
        />
        <SummaryCard
          icon={BadgeCheck}
          label="Settled to owners"
          value={formatTk(summary?.settledToOwners)}
          tone="bg-slate-100 text-slate-600"
          helper="Paid out to date"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Delivery orders</CardTitle>
            <CardDescription>
              Reconcile collected cash, then settle reconciled orders to owners.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.length > 0 ? (
              <Button
                onClick={() => settleMutation.mutate(selectedIds)}
                disabled={settleMutation.isPending}
              >
                {settleMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Banknote className="size-4" />
                )}
                Settle {selectedIds.length} selected
              </Button>
            ) : null}
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value as ExternalSettlementStatus | "all")
                setSelected(new Set())
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    {reconciledSelectable.length > 0 ? (
                      <input
                        type="checkbox"
                        aria-label="Select all reconciled"
                        checked={
                          selected.size === reconciledSelectable.length &&
                          reconciledSelectable.length > 0
                        }
                        onChange={toggleSelectAll}
                      />
                    ) : null}
                  </TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Restaurant</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Collect</TableHead>
                  <TableHead className="text-right">Fee</TableHead>
                  <TableHead className="text-right">Owner net</TableHead>
                  <TableHead>Settlement</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center">
                      <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : orders.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      No external delivery orders yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  orders.map((order) => {
                    const isReconciled = order.settlementStatus === "reconciled"
                    const isCollected = order.settlementStatus === "collected"
                    return (
                      <TableRow key={order.orderId}>
                        <TableCell>
                          {isReconciled ? (
                            <input
                              type="checkbox"
                              aria-label={`Select ${order.orderNumber}`}
                              checked={selected.has(order.orderId)}
                              onChange={() => toggleSelect(order)}
                            />
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <span className="block font-medium">{order.orderNumber}</span>
                          <span className="block text-xs text-muted-foreground">
                            {formatDateTime(order.createdAt)} · {order.status}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[160px] truncate">
                          {order.restaurantName || order.restaurantId}
                        </TableCell>
                        <TableCell>
                          <span className="block text-sm">{order.customerName}</span>
                          <span className="block text-xs text-muted-foreground">
                            {order.customerPhone}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatTk(order.collectAmount)}
                          <span className="block text-[11px] font-normal text-muted-foreground uppercase">
                            {order.paymentMode}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-600">
                          {formatTk(order.deliveryFee)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatTk(order.netToOwner)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={settlementBadgeClass(order.settlementStatus)}
                          >
                            {SETTLEMENT_LABEL[order.settlementStatus]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {isCollected ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={reconcileMutation.isPending}
                                onClick={() => reconcileMutation.mutate(order.orderId)}
                              >
                                Reconcile
                              </Button>
                            ) : null}
                            {isReconciled ? (
                              <Button
                                size="sm"
                                disabled={settleMutation.isPending}
                                onClick={() => settleMutation.mutate([order.orderId])}
                              >
                                Settle
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => navigate(`/orders?orderId=${order.orderId}`)}
                            >
                              View
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
