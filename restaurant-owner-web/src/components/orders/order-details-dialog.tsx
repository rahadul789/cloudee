import * as React from "react"

import { format, formatDistanceToNowStrict } from "date-fns"
import {
  Ban,
  Bike,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  MapPin,
  Package,
  PackageCheck,
  Phone,
  Printer,
  ReceiptText,
  User2,
  X,
} from "lucide-react"

import {
  type Order,
  type OrderActor,
  type OrderOperationalTiming,
  type OrderStatus,
  formatOrderMoney,
  getOwnerOrderNetSales,
  getOwnerOrderSubtotal,
  getOrderItemsCount,
  orderStatusLabels,
} from "@/components/orders/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"

function getStatusBadgeClass(status: Order["currentStatus"]) {
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

function getActorLabel(actor: OrderActor) {
  if (actor === "owner") return "Restaurant"
  if (actor === "rider") return "Rider"
  if (actor === "customer") return "Customer"
  return "System"
}

function getPaymentMethodLabel(paymentMethod: Order["paymentMethod"]) {
  return paymentMethod === "Bkash" ? "Bkash" : "Cash"
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

export function OrderDetailsDialog({
  order,
  open,
  onOpenChange,
  onUpdateStatus,
  onReject,
  onSaveKitchenNote,
  pendingOrderAction,
  averagePreparationMinutes,
  operationalTiming,
}: {
  order: Order | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdateStatus: (orderId: string, nextStatus: OrderStatus) => void
  onReject: (order: Order) => void
  onSaveKitchenNote: (orderId: string, note: string) => void
  pendingOrderAction?: "status" | "reject" | null
  averagePreparationMinutes: number
  operationalTiming: OrderOperationalTiming
}) {
  const [noteDraft, setNoteDraft] = React.useState("")
  const [nowMs, setNowMs] = React.useState(() => Date.now())

  React.useEffect(() => {
    setNoteDraft(order?.kitchenNote ?? "")
  }, [order])

  React.useEffect(() => {
    if (
      !open ||
      !order?.autoCancel?.applies ||
      !order.autoCancel.autoCancelAt
    ) {
      return
    }
    setNowMs(Date.now())
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [order?.autoCancel?.applies, order?.autoCancel?.autoCancelAt, open])

  if (!order) return null
  const currentOrder = order

  const totalItems = getOrderItemsCount(currentOrder)
  const isStatusPending = pendingOrderAction === "status"
  const isRejectPending = pendingOrderAction === "reject"
  const primaryAction =
    currentOrder.currentStatus === "New"
      ? {
          label: "Accept Order",
          status: "Accepted" as const,
          icon: CheckCircle2,
        }
      : currentOrder.currentStatus === "Accepted"
        ? {
            label: "Mark Preparing",
            status: "Preparing" as const,
            icon: Clock3,
          }
        : currentOrder.currentStatus === "Preparing"
          ? {
              label: "Ready for Pickup",
              status: "ReadyForPickup" as const,
              icon: PackageCheck,
            }
          : null
  const canCancelOrder =
    currentOrder.currentStatus === "Accepted" ||
    currentOrder.currentStatus === "Preparing"
  const prepTiming = currentOrder.preparationTiming
  const extraPrepMinutes = Math.max(
    0,
    Math.round(prepTiming?.extraMinutes ?? 0)
  )
  const autoCancelRemainingSeconds =
    currentOrder.autoCancel?.applies && currentOrder.autoCancel.autoCancelAt
      ? Math.max(
          0,
          Math.ceil(
            (new Date(currentOrder.autoCancel.autoCancelAt).getTime() - nowMs) /
              1000
          )
        )
      : currentOrder.autoCancel?.remainingSeconds

  function handlePrint() {
    const receiptWindow = window.open("", "_blank", "width=420,height=720")
    if (!receiptWindow) return

    const receiptHtml = `
      <html>
        <head><title>${currentOrder.orderNumber}</title></head>
        <body style="font-family: Arial, sans-serif; padding: 24px;">
          <h2>Foodbela - Meet Point</h2>
          <p><strong>Order:</strong> ${currentOrder.orderNumber}</p>
          <p><strong>Customer:</strong> ${currentOrder.customer.name}</p>
          <p><strong>Phone:</strong> ${currentOrder.customer.phone}</p>
          <hr />
          ${currentOrder.items
            .map(
              (item) =>
                `<p>${item.quantity}x ${item.name} - ${formatOrderMoney(
                  item.unitPrice
                )}</p>`
            )
            .join("")}
          <hr />
          <p><strong>Restaurant sales:</strong> ${formatOrderMoney(
            getOwnerOrderNetSales(currentOrder)
          )}</p>
        </body>
      </html>
    `

    receiptWindow.document.write(receiptHtml)
    receiptWindow.document.close()
    receiptWindow.focus()
    receiptWindow.print()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl! md:max-w-4xl!"
      >
        <SheetHeader className="sticky top-0 z-10 border-b bg-popover px-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <SheetTitle>Order {currentOrder.orderNumber}</SheetTitle>
                {currentOrder.isUrgent ? (
                  <Badge
                    variant="outline"
                    className="border-amber-300 bg-amber-50 font-semibold text-amber-800"
                  >
                    ⚡ Urgent
                  </Badge>
                ) : null}
                <Badge
                  variant="outline"
                  className={getStatusBadgeClass(currentOrder.currentStatus)}
                >
                  {orderStatusLabels[currentOrder.currentStatus]}
                </Badge>
                <Badge variant="secondary">
                  {getPaymentMethodLabel(currentOrder.paymentMethod)}
                </Badge>
                {extraPrepMinutes > 0 ? (
                  <Badge
                    variant="outline"
                    className="border-amber-200 bg-amber-50 text-amber-700"
                  >
                    <Clock3 className="mr-1 size-3" />
                    +{extraPrepMinutes} min prep
                  </Badge>
                ) : null}
              </div>
              <SheetDescription>
                Placed{" "}
                {formatDistanceToNowStrict(
                  new Date(currentOrder.timestamps.placedAt),
                  {
                    addSuffix: true,
                  }
                )}{" "}
                with {totalItems} item{totalItems === 1 ? "" : "s"}.
              </SheetDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
            >
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-6 pb-24">
          <section className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border bg-sky-50/60 p-4">
              <div className="flex items-center gap-3">
                <Clock3 className="size-5 text-sky-700" />
                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase">
                    Order placed
                  </div>
                  <div className="text-sm font-semibold">
                    {format(
                      new Date(currentOrder.timestamps.placedAt),
                      "dd MMM yyyy, hh:mm a"
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div
              className={`rounded-2xl border p-4 ${
                operationalTiming.tone === "critical"
                  ? "border-rose-200 bg-rose-50/70"
                  : operationalTiming.tone === "warning"
                    ? "border-amber-200 bg-amber-50/70"
                    : operationalTiming.tone === "success"
                      ? "border-emerald-200 bg-emerald-50/70"
                      : "bg-muted/20"
              }`}
            >
              <div className="flex items-center gap-3">
                <Clock3 className="size-5 text-slate-700" />
                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase">
                    {operationalTiming.phaseLabel}
                  </div>
                  <div className="text-sm font-semibold">
                    {operationalTiming.primaryLabel}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {operationalTiming.secondaryLabel}
                  </div>
                </div>
              </div>
            </div>
            <div
              className={
                currentOrder.autoCancel?.applies
                  ? "rounded-2xl border border-amber-200 bg-amber-50/70 p-4"
                  : "rounded-2xl border bg-muted/20 p-4"
              }
            >
              <div className="flex items-center gap-3">
                <Clock3 className="size-5 text-amber-700" />
                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase">
                    Auto-cancel timer
                  </div>
                  <div className="text-sm font-semibold">
                    {currentOrder.autoCancel?.applies
                      ? autoCancelRemainingSeconds === 0
                        ? "Due now"
                        : `${formatDurationFromSeconds(autoCancelRemainingSeconds)} remaining`
                      : currentOrder.autoCancel?.enabled
                        ? "Not active for this status"
                        : "Disabled by admin"}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border bg-muted/20 p-4">
            <div className="flex items-center gap-3">
              <Clock3 className="size-5 text-muted-foreground" />
              <div>
                <div className="text-xs font-medium text-muted-foreground uppercase">
                  Prep target
                </div>
                <div className="text-sm font-semibold">
                  {prepTiming?.totalMinutes ?? averagePreparationMinutes} min
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {extraPrepMinutes > 0
                    ? `${prepTiming?.baseMinutes ?? averagePreparationMinutes} min base + ${extraPrepMinutes} min added`
                    : "No extra preparation time added"}
                  {prepTiming?.targetReadyAt
                    ? ` - ready target ${format(
                        new Date(prepTiming.targetReadyAt),
                        "hh:mm a"
                      )}`
                    : ""}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border bg-muted/20 p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 font-semibold">
                  <User2 className="size-4 text-muted-foreground" />
                  Customer Details
                </div>
                <div className="font-medium">{currentOrder.customer.name}</div>
                {currentOrder.customer.phone ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="size-4" />
                    {currentOrder.customer.phone}
                  </div>
                ) : null}
                <div className="flex items-start gap-2 text-muted-foreground">
                  <MapPin className="mt-0.5 size-4 shrink-0" />
                  <span>{currentOrder.customer.address}</span>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 font-semibold">
                  <Bike className="size-4 text-muted-foreground" />
                  Delivery
                </div>
                {currentOrder.rider ? (
                  <>
                    <div className="font-medium">{currentOrder.rider.name}</div>
                    <div className="text-muted-foreground">
                      {currentOrder.rider.phone}
                    </div>
                  </>
                ) : (
                  <div className="text-muted-foreground">
                    Rider has not been assigned yet.
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  Payment method:{" "}
                  {getPaymentMethodLabel(currentOrder.paymentMethod)}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border bg-muted/20 p-4">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <ReceiptText className="size-4 text-muted-foreground" />
              Order Items
            </div>
            <div className="space-y-4">
              {currentOrder.items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border bg-background p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">
                        {item.quantity}x {item.name}
                      </div>
                      {item.variantLabel ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Variant: {item.variantLabel}
                        </div>
                      ) : null}
                      {item.addOns.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {item.addOns.map((addOn) => (
                            <Badge key={addOn.id} variant="secondary">
                              {addOn.name} +{formatOrderMoney(addOn.price)}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="text-sm font-semibold">
                      {formatOrderMoney(
                        item.quantity * item.unitPrice +
                          item.addOns.reduce(
                            (sum, addOn) => sum + addOn.price,
                            0
                          )
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border bg-muted/20 p-4">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <Clock3 className="size-4 text-muted-foreground" />
              Kitchen Note
            </div>
            <div className="space-y-3">
              <Textarea
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                placeholder="Add internal kitchen instruction"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onSaveKitchenNote(currentOrder.id, noteDraft.trim())
                  }
                  disabled={isStatusPending}
                >
                  Save Note
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border bg-muted/20 p-4">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <Package className="size-4 text-muted-foreground" />
              Restaurant Summary
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Food subtotal</span>
                <span>{formatOrderMoney(getOwnerOrderSubtotal(currentOrder))}</span>
              </div>
              {currentOrder.ownerDiscountCost > 0 ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Owner voucher/discount</span>
                  <span>-{formatOrderMoney(currentOrder.ownerDiscountCost)}</span>
                </div>
              ) : null}
              <Separator />
              <div className="flex items-center justify-between font-semibold">
                <span>Restaurant net sales</span>
                <span>{formatOrderMoney(getOwnerOrderNetSales(currentOrder))}</span>
              </div>
            </div>
            {currentOrder.appliedVouchers.length ? (
              <div className="mt-4 space-y-2 rounded-xl bg-background/70 p-3 text-xs">
                {currentOrder.appliedVouchers.map((voucher, index) => (
                  <div
                    key={`${voucher.id ?? voucher.code ?? voucher.name ?? "voucher"}-${index}`}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="truncate text-muted-foreground">
                      {voucher.name || voucher.code || "Owner voucher"}
                    </span>
                    <span className="font-medium">
                      -{formatOrderMoney(voucher.ownerDiscountCost ?? voucher.discountAmount ?? 0)}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border bg-muted/20 p-4">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <PackageCheck className="size-4 text-muted-foreground" />
              Status Timeline
            </div>
            <div className="space-y-4">
              {currentOrder.history.map((entry, index) => (
                <div key={entry.id} className="relative flex gap-3">
                  <div className="relative flex flex-col items-center">
                    <span className="mt-1 inline-flex size-2.5 rounded-full bg-primary" />
                    {index < currentOrder.history.length - 1 ? (
                      <span className="mt-1 h-full w-px bg-border" />
                    ) : null}
                  </div>
                  <div className="pb-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {orderStatusLabels[entry.status]}
                      </span>
                      <Badge variant="secondary">
                        {getActorLabel(entry.updatedBy)}
                      </Badge>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {format(
                        new Date(entry.updatedAt),
                        "dd MMM yyyy, hh:mm a"
                      )}
                    </div>
                    {entry.note ? (
                      <div className="mt-1 text-sm text-muted-foreground">
                        {entry.note}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
        <SheetFooter className="sticky bottom-0 z-10 border-t bg-popover/95 px-6 py-4 backdrop-blur">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {currentOrder.customer.phone ? (
              <Button asChild variant="outline">
                <a href={`tel:${currentOrder.customer.phone}`}>
                  <Phone className="size-4" />
                  Call Customer
                </a>
              </Button>
            ) : null}
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="size-4" />
              Print Receipt
            </Button>
            {currentOrder.currentStatus === "New" ? (
              <Button
                variant="outline"
                onClick={() => {
                  onOpenChange(false)
                  onReject(currentOrder)
                }}
                disabled={isStatusPending || isRejectPending}
              >
                {isRejectPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Ban className="size-4" />
                )}
                {isRejectPending ? "Rejecting..." : "Reject Order"}
              </Button>
            ) : null}
            {canCancelOrder ? (
              <Button
                variant="outline"
                onClick={() => onUpdateStatus(currentOrder.id, "Cancelled")}
                disabled={isStatusPending || isRejectPending}
              >
                {isStatusPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Ban className="size-4" />
                )}
                {isStatusPending ? "Cancelling..." : "Cancel Order"}
              </Button>
            ) : null}
            {primaryAction ? (
              <Button
                onClick={() =>
                  onUpdateStatus(currentOrder.id, primaryAction.status)
                }
                disabled={isStatusPending || isRejectPending}
              >
                {isStatusPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <primaryAction.icon className="size-4" />
                )}
                {isStatusPending ? "Updating..." : primaryAction.label}
              </Button>
            ) : null}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
