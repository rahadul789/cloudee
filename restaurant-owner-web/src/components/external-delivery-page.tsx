import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Bike, Loader2, PackagePlus, RefreshCcw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  cancelExternalDelivery,
  createExternalDelivery,
  getExternalDeliveryConfig,
  listExternalDeliveries,
  type ExternalSettlementStatus,
  type OwnerExternalDelivery,
} from "@/lib/external-delivery-api"

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

const OWNER_SETTLEMENT_LABEL: Record<ExternalSettlementStatus, string> = {
  pending: "In progress",
  collected: "Delivered — payout processing",
  reconciled: "Payout processing",
  settled: "Paid to you",
  held: "On hold",
  cancelled: "Cancelled",
}

function settlementBadgeClass(status: ExternalSettlementStatus) {
  switch (status) {
    case "settled":
      return "border-emerald-300 bg-emerald-50 text-emerald-700"
    case "reconciled":
    case "collected":
      return "border-sky-300 bg-sky-50 text-sky-700"
    case "cancelled":
      return "border-rose-300 bg-rose-50 text-rose-700"
    case "held":
      return "border-purple-300 bg-purple-50 text-purple-700"
    default:
      return "border-slate-300 bg-slate-50 text-slate-600"
  }
}

const EMPTY_FORM = {
  customerName: "",
  customerPhone: "",
  dropAddress: "",
  orderValue: "",
  paymentMode: "cod" as "cod" | "online",
}

function NewRequestForm({ deliveryFee }: { deliveryFee: number }) {
  const queryClient = useQueryClient()
  const [form, setForm] = React.useState(EMPTY_FORM)

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  const orderValue = Number(form.orderValue)
  const hasValidValue = form.orderValue.trim() !== "" && orderValue > 0

  const createMutation = useMutation({
    mutationFn: () =>
      createExternalDelivery({
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim(),
        dropAddress: form.dropAddress.trim(),
        orderValue,
        paymentMode: form.paymentMode,
      }),
    onSuccess: (result) => {
      toast.success(
        `Delivery requested — ${result.orderNumber}. A rider will be assigned shortly.`
      )
      setForm(EMPTY_FORM)
      void queryClient.invalidateQueries({ queryKey: ["owner-external-deliveries"] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to request delivery")
    },
  })

  const canSubmit =
    form.customerName.trim() !== "" &&
    form.customerPhone.trim() !== "" &&
    form.dropAddress.trim() !== "" &&
    hasValidValue

  // Customer always pays the delivery fee on top; the owner receives the order value.
  const collectAmount = hasValidValue ? orderValue + deliveryFee : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PackagePlus className="size-4" />
          Request a delivery
        </CardTitle>
        <CardDescription>
          Got an order on your own channel? Ask Foodbela to deliver it. We collect the
          payment and pay your share back. Foodbela delivery fee:{" "}
          <span className="font-semibold text-foreground">{formatTk(deliveryFee)}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Customer name</Label>
            <Input
              value={form.customerName}
              onChange={(event) => update("customerName", event.target.value)}
              placeholder="e.g. Rahim Uddin"
            />
          </div>
          <div className="space-y-2">
            <Label>Customer phone</Label>
            <Input
              value={form.customerPhone}
              onChange={(event) => update("customerPhone", event.target.value)}
              placeholder="01XXXXXXXXX"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Delivery address</Label>
          <Input
            value={form.dropAddress}
            onChange={(event) => update("dropAddress", event.target.value)}
            placeholder="House, road, area…"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Order value (food)</Label>
            <Input
              type="number"
              min={0}
              value={form.orderValue}
              onChange={(event) => update("orderValue", event.target.value)}
              placeholder="What the customer pays for food"
            />
          </div>
          <div className="space-y-2">
            <Label>Payment method</Label>
            <Select
              value={form.paymentMode}
              onValueChange={(value) => update("paymentMode", value as "cod" | "online")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cod">Cash on delivery</SelectItem>
                <SelectItem value="online">Online payment</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {collectAmount != null ? (
          <div className="grid gap-2 rounded-lg border bg-background p-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Rider collects</p>
              <p className="font-semibold">{formatTk(collectAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Foodbela delivery fee</p>
              <p className="font-semibold text-rose-600">− {formatTk(deliveryFee)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">You receive</p>
              <p className="font-semibold text-emerald-600">{formatTk(orderValue)}</p>
            </div>
          </div>
        ) : null}

        <Button
          className="w-full sm:w-auto"
          disabled={!canSubmit || createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          {createMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <PackagePlus className="size-4" />
          )}
          Request delivery
        </Button>
      </CardContent>
    </Card>
  )
}

function DeliveryRow({
  order,
  onCancel,
  cancelling,
}: {
  order: OwnerExternalDelivery
  onCancel: (order: OwnerExternalDelivery) => void
  cancelling: boolean
}) {
  const canCancel = order.status === "ReadyForPickup" && !order.riderId
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{order.orderNumber}</span>
          <Badge
            variant="outline"
            className={settlementBadgeClass(order.settlementStatus)}
          >
            {OWNER_SETTLEMENT_LABEL[order.settlementStatus]}
          </Badge>
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {order.customerName} · {order.customerPhone}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {order.drop.address || "—"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatDateTime(order.createdAt)} · {order.status}
          {order.riderName ? ` · Rider: ${order.riderName}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-4 sm:flex-col sm:items-end sm:gap-1">
        <div className="text-right">
          <p className="text-xs text-muted-foreground">You receive</p>
          <p className="font-semibold text-emerald-600">{formatTk(order.netToOwner)}</p>
        </div>
        {canCancel ? (
          <Button
            size="sm"
            variant="outline"
            disabled={cancelling}
            onClick={() => onCancel(order)}
          >
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export function ExternalDeliveryPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = React.useState<"live" | "history">("live")

  const configQuery = useQuery({
    queryKey: ["owner-external-delivery-config"],
    queryFn: getExternalDeliveryConfig,
    staleTime: 30_000,
  })

  const listQuery = useQuery({
    queryKey: ["owner-external-deliveries", tab],
    queryFn: () => listExternalDeliveries({ tab, pageSize: 50 }),
    staleTime: 10_000,
    enabled: configQuery.data?.enabled === true,
  })

  const cancelMutation = useMutation({
    mutationFn: (orderId: string) => cancelExternalDelivery(orderId),
    onSuccess: () => {
      toast.success("Delivery request cancelled")
      void queryClient.invalidateQueries({ queryKey: ["owner-external-deliveries"] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to cancel")
    },
  })

  const orders = listQuery.data?.items ?? []

  function handleCancel(order: OwnerExternalDelivery) {
    if (window.confirm(`Cancel delivery ${order.orderNumber}?`)) {
      cancelMutation.mutate(order.orderId)
    }
  }

  const enabled = configQuery.data?.enabled === true

  return (
    <div className="space-y-6 px-4 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Bike className="size-5" />
            Foodbela Delivery
          </h1>
          <p className="text-sm text-muted-foreground">
            Send Foodbela riders to deliver the orders you take on your own channels.
          </p>
        </div>
        <Button variant="outline" onClick={() => void listQuery.refetch()}>
          <RefreshCcw className="size-4" />
          Refresh
        </Button>
      </div>

      {configQuery.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : !enabled ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            External delivery is not enabled for your restaurant yet. Please contact
            Foodbela support to turn it on.
          </CardContent>
        </Card>
      ) : (
        <>
          <NewRequestForm deliveryFee={configQuery.data?.deliveryFeeTaka ?? 0} />

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="text-base">Your requests</CardTitle>
                <CardDescription>
                  Foodbela pays your share after each delivery is completed.
                </CardDescription>
              </div>
              <Tabs value={tab} onValueChange={(value) => setTab(value as "live" | "history")}>
                <TabsList>
                  <TabsTrigger value="live">Live</TabsTrigger>
                  <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent className="space-y-3">
              {listQuery.isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : orders.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {tab === "live"
                    ? "No active delivery requests."
                    : "No past delivery requests yet."}
                </p>
              ) : (
                orders.map((order) => (
                  <DeliveryRow
                    key={order.orderId}
                    order={order}
                    onCancel={handleCancel}
                    cancelling={cancelMutation.isPending}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
