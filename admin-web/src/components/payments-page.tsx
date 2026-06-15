import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Loader2,
  MoreHorizontal,
  ReceiptText,
  RotateCcw,
  Search,
  WalletCards,
} from "lucide-react"
import { toast } from "sonner"

import { useDebouncedValue } from "@/hooks/use-debounced-value"
import {
  exportAdminPayments,
  getAdminOrder,
  listAdminBkashPaymentAttempts,
  listAdminPayments,
  reconcileAdminBkashPaymentAttempt,
  reconcileAdminPaymentsLedger,
  updateAdminOrderCodCollection,
  updateAdminOrderRefundStatus,
  type AdminBkashPaymentAttempt,
  type AdminPaymentTransaction,
  type AdminRefundNotificationChannelAudit,
  type AdminRefundNotificationAudit,
  type AdminRestaurantOrderDateFilterPreset,
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
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

type PaymentPreset = Extract<
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
type PaymentMethodFilter = "all" | "Cash" | "Bkash"
type PaymentStatusFilter =
  | "all"
  | "pending"
  | "paid"
  | "refund_pending"
  | "refunded"
  | "refund_rejected"
type SettlementFilter = "all" | "delivered" | "refund_queue" | "online" | "cod"
type PaymentSort = "newest" | "oldest" | "highestValue" | "recentlyUpdated"
type RefundStatus = "refund_pending" | "refunded" | "refund_rejected"
type BkashAttemptStatusFilter =
  | "all"
  | "initiated"
  | "provider_created"
  | "provider_create_failed"
  | "callback_success"
  | "customer_cancelled"
  | "callback_failed"
  | "execute_failed"
  | "confirmed_paid"
  | "order_finalized"
  | "order_finalize_failed"
  | "expired"
type BkashAttemptPaymentStatusFilter =
  | "all"
  | "unpaid"
  | "paid"
  | "cancelled"
  | "failed"
  | "expired"
type BkashAttemptOrderStateFilter = "all" | "finalized" | "missing" | "failed"

const pageSizeOptions = [10, 20, 50]

function formatCurrency(value: number) {
  return `Tk ${Math.round(Number.isFinite(value) ? value : 0).toLocaleString()}`
}

function formatDate(value?: string | null) {
  if (!value) return "N/A"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "N/A"
  return date.toLocaleString()
}

function formatShortDate(value?: string | null) {
  if (!value) return "N/A"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "N/A"
  return date.toLocaleDateString()
}

function getPaymentBadgeClass(status: string) {
  if (status === "cancelled") {
    return "border-rose-200 bg-rose-50 text-rose-700"
  }
  if (status === "paid" || status === "refunded") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  }
  if (status === "refund_pending") {
    return "border-amber-200 bg-amber-50 text-amber-700"
  }
  if (status === "refund_rejected") {
    return "border-rose-200 bg-rose-50 text-rose-700"
  }
  return ""
}

function getOrderBadgeClass(status: string) {
  if (status === "Delivered") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (["Cancelled", "Rejected"].includes(status)) {
    return "border-rose-200 bg-rose-50 text-rose-700"
  }
  return "border-sky-200 bg-sky-50 text-sky-700"
}

function getDisplayPaymentStatus(transaction: {
  status: string
  paymentMethod: string
  paymentStatus: string
}) {
  if (
    ["Cancelled", "Rejected"].includes(transaction.status) &&
    transaction.paymentMethod === "Cash" &&
    transaction.paymentStatus !== "paid"
  ) {
    return "cancelled"
  }
  return transaction.paymentStatus || "N/A"
}

function getReconciliationState(transaction: AdminPaymentTransaction) {
  if (["Cancelled", "Rejected"].includes(transaction.status)) {
    if (transaction.paymentMethod === "Bkash") {
      if (transaction.paymentStatus === "refunded") {
        return { label: "Refunded", tone: "success" }
      }
      if (transaction.paymentStatus === "refund_rejected") {
        return { label: "Refund rejected", tone: "danger" }
      }
      if (["paid", "refund_pending"].includes(transaction.paymentStatus)) {
        return { label: "Refund review", tone: "warning" }
      }
    }
    return { label: "Cancelled", tone: "danger" }
  }

  if (transaction.paymentMethod === "Bkash") {
    if (transaction.paymentStatus === "paid" && !transaction.transactionId) {
      return { label: "Missing trx", tone: "warning" }
    }
    if (transaction.paymentStatus === "paid") {
      return { label: "Matched", tone: "success" }
    }
    return { label: "Provider pending", tone: "muted" }
  }

  if (transaction.paymentMethod === "Cash") {
    if (transaction.status === "Delivered" && transaction.paymentStatus === "paid") {
      return { label: "Cash collected", tone: "success" }
    }
    if (transaction.status === "Delivered") {
      return { label: "Cash due", tone: "warning" }
    }
    return { label: "COD pending", tone: "muted" }
  }

  return { label: "Review", tone: "muted" }
}

function getReconciliationBadgeClass(tone: string) {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-700"
  if (tone === "danger") return "border-rose-200 bg-rose-50 text-rose-700"
  return ""
}

function getBkashAttemptBadgeClass(status: string) {
  if (["paid", "order_finalized", "confirmed_paid"].includes(status)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  }
  if (["unpaid", "initiated", "provider_created", "callback_success"].includes(status)) {
    return "border-amber-200 bg-amber-50 text-amber-700"
  }
  if (["cancelled", "customer_cancelled", "expired"].includes(status)) {
    return "border-slate-200 bg-slate-50 text-slate-700"
  }
  if (
    [
      "failed",
      "provider_create_failed",
      "callback_failed",
      "execute_failed",
      "order_finalize_failed",
    ].includes(status)
  ) {
    return "border-rose-200 bg-rose-50 text-rose-700"
  }
  return ""
}

function formatAttemptLabel(value: string) {
  if (!value) return "N/A"
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function getBkashAttemptPayerNumber(attempt: AdminBkashPaymentAttempt) {
  return (
    attempt.payerPhone ||
    attempt.customerMsisdn ||
    attempt.walletNumber ||
    attempt.payerReference ||
    ""
  )
}

function getNotificationStatusBadgeClass(status: string) {
  if (status === "sent") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (status === "in_app_only" || status === "skipped" || status === "not_configured" || status === "disabled") {
    return "border-amber-200 bg-amber-50 text-amber-700"
  }
  if (status === "failed") return "border-rose-200 bg-rose-50 text-rose-700"
  return "border-slate-200 bg-slate-50 text-slate-700"
}

function formatNotificationStatus(status: string) {
  return formatAttemptLabel(status || "not_attempted")
}

function readRefundNotificationAudit(
  value: unknown,
): AdminRefundNotificationAudit | null {
  if (!value || typeof value !== "object") return null
  const audit = value as Partial<AdminRefundNotificationAudit>
  const normalizeChannel = (
    channel: Partial<AdminRefundNotificationChannelAudit> | undefined,
  ): AdminRefundNotificationChannelAudit => {
    const ticketIds = Array.isArray(channel?.ticketIds)
      ? channel?.ticketIds ?? []
      : []
    return {
      status: String(channel?.status || "not_attempted"),
      attemptedAt: channel?.attemptedAt ?? null,
      deliveredAt: channel?.deliveredAt ?? null,
      provider: String(channel?.provider || ""),
      recipient: String(channel?.recipient || ""),
      requestId: String(channel?.requestId || ""),
      error: String(channel?.error || ""),
      sent: Number(channel?.sent || 0),
      inAppCreated: Number(channel?.inAppCreated || 0),
      ticketIds,
    }
  }

  return {
    message: String(audit.message || ""),
    updatedAt: audit.updatedAt ?? null,
    push: normalizeChannel(audit.push),
    sms: normalizeChannel(audit.sms),
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

function InlineMetric({
  label,
  value,
  helper,
}: {
  label: string
  value: React.ReactNode
  helper: string
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
    </div>
  )
}

function RefundDialog({
  target,
  onOpenChange,
}: {
  target: null | {
    transaction: AdminPaymentTransaction
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
      void queryClient.invalidateQueries({ queryKey: ["admin-payments"] })
      void queryClient.invalidateQueries({
        queryKey: ["admin-order", target?.transaction.orderId],
      })
      setNote("")
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Refund update failed.")
      void queryClient.invalidateQueries({ queryKey: ["admin-payments"] })
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
            Payment status for {target?.transaction.orderNumber} will become{" "}
            {target?.paymentStatus}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="payment-refund-note">Refund note</Label>
          <Textarea
            id="payment-refund-note"
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
                orderId: target.transaction.orderId,
                expectedPaymentStatus: target.transaction.paymentStatus,
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

function CodCollectionDialog({
  target,
  onOpenChange,
}: {
  target: AdminPaymentTransaction | null
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [note, setNote] = React.useState("")
  const mutation = useMutation({
    mutationFn: updateAdminOrderCodCollection,
    onSuccess: () => {
      toast.success("COD payment marked as collected.")
      void queryClient.invalidateQueries({ queryKey: ["admin-payments"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-order", target?.orderId] })
      setNote("")
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "COD update failed.")
      void queryClient.invalidateQueries({ queryKey: ["admin-payments"] })
    },
  })

  React.useEffect(() => {
    if (!target) setNote("")
  }, [target])

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark COD collected</DialogTitle>
          <DialogDescription>
            Confirm cash collection for {target?.orderNumber}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="cod-note">Collection note</Label>
          <Textarea
            id="cod-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Cash received by rider/admin reference"
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!target || mutation.isPending}
            onClick={() => {
              if (!target) return
              mutation.mutate({
                orderId: target.orderId,
                expectedPaymentStatus: target.paymentStatus,
                note,
              })
            }}
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <WalletCards className="size-4" />
            )}
            Confirm collection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BkashAttemptDetailsSheet({
  attempt,
  onOpenChange,
  onOpenOrder,
}: {
  attempt: AdminBkashPaymentAttempt | null
  onOpenChange: (open: boolean) => void
  onOpenOrder: (orderId: string) => void
}) {
  return (
    <Sheet open={Boolean(attempt)} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-2xl! md:max-w-4xl!">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle>bKash gateway log</SheetTitle>
          <SheetDescription>
            Checkout attempt, callback, execute, and order finalization timeline.
          </SheetDescription>
        </SheetHeader>
        {attempt ? (
          <div className="flex-1 space-y-4 overflow-y-auto p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={getBkashAttemptBadgeClass(attempt.paymentStatus)}
              >
                {formatAttemptLabel(attempt.paymentStatus)}
              </Badge>
              <Badge
                variant="outline"
                className={getBkashAttemptBadgeClass(attempt.status)}
              >
                {formatAttemptLabel(attempt.status)}
              </Badge>
              <Badge variant="secondary">{formatCurrency(attempt.amount)}</Badge>
              {attempt.paymentID ? (
                <Badge variant="outline">Payment ID {attempt.paymentID}</Badge>
              ) : null}
              {attempt.transactionId ? (
                <Badge variant="outline">Trx {attempt.transactionId}</Badge>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border p-3">
                <div className="text-sm font-medium">Customer</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {attempt.customerName || "Unknown"} -{" "}
                  {attempt.customerPhone || "No phone"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  bKash number {getBkashAttemptPayerNumber(attempt) || "N/A"}
                </div>
                <div className="mt-1 text-xs font-medium text-foreground">
                  Payer reference {attempt.payerReference || "N/A"}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-sm font-medium">Restaurant</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {attempt.restaurantName || "Unknown restaurant"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Session {attempt.sessionId || "N/A"}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-sm font-medium">Order finalization</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge
                    variant="outline"
                    className={getBkashAttemptBadgeClass(
                      attempt.orderFinalizationStatus,
                    )}
                  >
                    {formatAttemptLabel(attempt.orderFinalizationStatus || "missing")}
                  </Badge>
                  {attempt.orderId ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onOpenOrder(attempt.orderId)}
                    >
                      <Eye className="size-4" />
                      Open order
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-sm font-medium">Gateway message</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {attempt.failureReason ||
                    attempt.providerMessage ||
                    attempt.latestNote ||
                    "No gateway message recorded."}
                </div>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Event timeline</CardTitle>
                <CardDescription>
                  Latest gateway and backend events for this checkout attempt.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Event</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Note</TableHead>
                        <TableHead>When</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attempt.events.map((event, index) => (
                        <TableRow key={`${event.event}-${event.occurredAt}-${index}`}>
                          <TableCell className="font-medium">
                            {formatAttemptLabel(event.event)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {event.status ? (
                                <Badge
                                  variant="outline"
                                  className={getBkashAttemptBadgeClass(event.status)}
                                >
                                  {formatAttemptLabel(event.status)}
                                </Badge>
                              ) : null}
                              {event.paymentStatus ? (
                                <Badge
                                  variant="outline"
                                  className={getBkashAttemptBadgeClass(
                                    event.paymentStatus,
                                  )}
                                >
                                  {formatAttemptLabel(event.paymentStatus)}
                                </Badge>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[320px]">
                            <div className="truncate text-sm">
                              {event.reason ||
                                event.providerMessage ||
                                event.note ||
                                "No note"}
                            </div>
                            {event.providerCode ? (
                              <div className="text-xs text-muted-foreground">
                                Provider code {event.providerCode}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell>{formatDate(event.occurredAt)}</TableCell>
                        </TableRow>
                      ))}
                      {attempt.events.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="h-24 text-center text-muted-foreground"
                          >
                            No gateway timeline has been recorded for this attempt.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function PaymentDetailsSheet({
  orderId,
  onRefund,
  onCollectCod,
  onOpenChange,
}: {
  orderId: string
  onRefund: (
    transaction: AdminPaymentTransaction,
    paymentStatus: RefundStatus,
    label: string
  ) => void
  onCollectCod: (transaction: AdminPaymentTransaction) => void
  onOpenChange: (open: boolean) => void
}) {
  const detailsQuery = useQuery({
    queryKey: ["admin-order", orderId],
    queryFn: () => getAdminOrder(orderId),
    enabled: Boolean(orderId),
  })
  const details = detailsQuery.data
  const transaction = details
    ? ({
        id: details.id,
        orderId: details.id,
        orderNumber: details.orderNumber,
        status: details.status,
        restaurantId: details.restaurantId,
        restaurantName: details.restaurantName,
        customerName: details.customerName,
        customerPhone: details.customerPhone,
        paymentMethod: details.paymentMethod,
        paymentStatus: details.paymentStatus,
        provider: details.paymentMethod,
        bkashPayerPhone: "",
        transactionId: "",
        amount: details.pricing.total,
        subtotal: details.pricing.subtotal,
        deliveryFee: details.pricing.deliveryFee,
        discount: details.pricing.discount,
        refundStatus: details.paymentStatus,
        refundNote: "",
        refundRequestedAt: null,
        refundReviewedAt: null,
        refundNotificationAudit: null,
        voucherCodes: details.appliedVouchers?.map((voucher) => voucher.code || voucher.name).filter(Boolean) ?? [],
        createdAt: details.timestamps.createdAt,
        updatedAt: null,
        deliveredAt: details.timestamps.deliveredAt,
        cancelledAt: details.timestamps.cancelledAt,
        isRefundCandidate:
          ["Cancelled", "Rejected"].includes(details.status) &&
          details.paymentMethod === "Bkash" &&
          ["paid", "refund_pending"].includes(details.paymentStatus),
      } satisfies AdminPaymentTransaction)
    : null
  const paymentSnapshot = (details?.paymentSnapshot ?? {}) as Record<
    string,
    unknown
  >
  const provider =
    typeof paymentSnapshot.provider === "string"
      ? paymentSnapshot.provider
      : details?.paymentMethod
  const transactionId =
    typeof paymentSnapshot.transactionId === "string"
      ? paymentSnapshot.transactionId
      : typeof paymentSnapshot.trxID === "string"
        ? paymentSnapshot.trxID
        : ""
  const bkashPayerPhone =
    typeof paymentSnapshot.customerMsisdn === "string" && paymentSnapshot.customerMsisdn
      ? paymentSnapshot.customerMsisdn
      : typeof paymentSnapshot.walletNumber === "string" && paymentSnapshot.walletNumber
        ? paymentSnapshot.walletNumber
        : typeof paymentSnapshot.payerReference === "string"
          ? paymentSnapshot.payerReference
          : transaction?.bkashPayerPhone || ""
  const refundStatus =
    typeof paymentSnapshot.refundStatus === "string"
      ? paymentSnapshot.refundStatus
      : details?.paymentStatus
  const refundNote =
    typeof paymentSnapshot.refundNote === "string" ? paymentSnapshot.refundNote : ""
  const refundRequestedAt =
    typeof paymentSnapshot.refundRequestedAt === "string"
      ? paymentSnapshot.refundRequestedAt
      : null
  const refundReviewedAt =
    typeof paymentSnapshot.refundReviewedAt === "string"
      ? paymentSnapshot.refundReviewedAt
      : null
  const refundNotificationAudit =
    readRefundNotificationAudit(paymentSnapshot.refundNotificationAudit) ??
    transaction?.refundNotificationAudit ??
    null

  return (
    <Sheet open={Boolean(orderId)} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl! md:max-w-6xl!">
        <div className="border-b px-6 py-5">
          <SheetHeader>
            <SheetTitle>{details?.orderNumber ?? "Payment details"}</SheetTitle>
            <SheetDescription>
              Order payment, refund, customer, and restaurant context.
            </SheetDescription>
          </SheetHeader>
          {details ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="outline" className={getOrderBadgeClass(details.status)}>
                {details.status}
              </Badge>
              <Badge
                variant="outline"
                className={getPaymentBadgeClass(getDisplayPaymentStatus(details))}
              >
                {getDisplayPaymentStatus(details)}
              </Badge>
              <Badge variant="secondary">{details.paymentMethod}</Badge>
              {details.appliedVouchers?.length ? (
                <Badge variant="outline" className="border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700">
                  Voucher applied
                </Badge>
              ) : null}
              {transactionId ? (
                <Badge variant="outline">Trx {transactionId}</Badge>
              ) : null}
              <div className="ml-auto flex flex-wrap gap-2">
                {transaction?.paymentMethod === "Bkash" &&
                transaction.paymentStatus === "paid" &&
                ["Cancelled", "Rejected"].includes(transaction.status) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onRefund(
                        transaction,
                        "refund_pending",
                        "Mark refund pending"
                      )
                    }
                  >
                    Mark refund pending
                  </Button>
                ) : null}
                {transaction?.paymentStatus === "refund_pending" ? (
                  <>
                    <Button
                      size="sm"
                      onClick={() =>
                        onRefund(transaction, "refunded", "Mark refunded")
                      }
                    >
                      Mark refunded
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        onRefund(transaction, "refund_rejected", "Reject refund")
                      }
                    >
                      Reject refund
                    </Button>
                  </>
                ) : null}
                {transaction?.paymentMethod === "Cash" &&
                transaction.status === "Delivered" &&
                transaction.paymentStatus !== "paid" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onCollectCod(transaction)}
                  >
                    Mark COD collected
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        {detailsQuery.isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : details ? (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Payment</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 text-sm">
                    <InfoRow label="Method" value={details.paymentMethod} />
                    <InfoRow label="Status" value={getDisplayPaymentStatus(details)} />
                    <InfoRow label="Provider" value={provider || "N/A"} />
                    {details.paymentMethod === "Bkash" ? (
                      <InfoRow label="bKash payer number" value={bkashPayerPhone || "N/A"} />
                    ) : null}
                    <InfoRow label="Transaction ID" value={transactionId || "N/A"} />
                    <InfoRow label="Total" value={formatCurrency(details.pricing.total)} />
                    <InfoRow label="Subtotal" value={formatCurrency(details.pricing.subtotal)} />
                    <InfoRow label="Delivery fee" value={formatCurrency(details.pricing.deliveryFee)} />
                    <InfoRow label="Discount" value={formatCurrency(details.pricing.discount)} />
                    {details.appliedVouchers?.length ? (
                      <InfoRow
                        label="Voucher"
                        value={
                          <div className="flex flex-wrap justify-end gap-1">
                            {details.appliedVouchers.map((voucher, index) => (
                              <Badge
                                key={`${voucher.id || voucher.code || index}`}
                                variant="outline"
                                className="border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700"
                              >
                                {voucher.code || voucher.name || "Applied"}
                              </Badge>
                            ))}
                          </div>
                        }
                      />
                    ) : null}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Settlement math</CardTitle>
                    <CardDescription>
                      Customer total can differ from restaurant payable.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 text-sm">
                    <InfoRow
                      label="Customer paid total"
                      value={formatCurrency(details.pricing.total)}
                    />
                    <InfoRow
                      label="Item subtotal"
                      value={formatCurrency(details.pricing.subtotal)}
                    />
                    <InfoRow
                      label="Discount"
                      value={formatCurrency(details.pricing.discount)}
                    />
                    <InfoRow
                      label="Delivery fee"
                      value={formatCurrency(details.pricing.deliveryFee)}
                    />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Order items</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {details.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                      >
                        <div>
                          <div className="font-medium">{item.name}</div>
                          <div className="text-xs text-muted-foreground">
                            Qty {item.quantity}
                          </div>
                        </div>
                        <div className="font-medium">
                          {formatCurrency(item.lineTotal)}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Order context</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 text-sm">
                    <InfoRow label="Status" value={details.status} />
                    <InfoRow label="Restaurant" value={details.restaurantName} />
                    <InfoRow label="Customer" value={details.customerName} />
                    <InfoRow label="Phone" value={details.customerPhone} />
                    <InfoRow label="Rider" value={details.riderName || "N/A"} />
                    <InfoRow
                      label="Delivery address"
                      value={details.deliveryAddress || "N/A"}
                    />
                  </CardContent>
                </Card>
                {details.paymentMethod === "Bkash" ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>Refund</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3 text-sm">
                      <InfoRow label="Refund status" value={refundStatus || "N/A"} />
                      <InfoRow
                        label="Requested at"
                        value={formatDate(refundRequestedAt)}
                      />
                      <InfoRow
                        label="Reviewed at"
                        value={formatDate(refundReviewedAt)}
                      />
                      <InfoRow label="Note" value={refundNote || "N/A"} />
                      {refundNotificationAudit ? (
                        <>
                          <InfoRow
                            label="Refund message"
                            value={refundNotificationAudit.message || "N/A"}
                          />
                          <InfoRow
                            label="Push status"
                            value={
                              <div className="flex flex-col items-end gap-1 text-right">
                                <Badge
                                  variant="outline"
                                  className={getNotificationStatusBadgeClass(
                                    refundNotificationAudit.push.status,
                                  )}
                                >
                                  {formatNotificationStatus(refundNotificationAudit.push.status)}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {refundNotificationAudit.push.sent
                                    ? `${refundNotificationAudit.push.sent} device push accepted`
                                    : refundNotificationAudit.push.inAppCreated
                                      ? "In-app notification created"
                                      : refundNotificationAudit.push.error || "No push delivery"}
                                </span>
                              </div>
                            }
                          />
                          <InfoRow
                            label="SMS status"
                            value={
                              <div className="flex flex-col items-end gap-1 text-right">
                                <Badge
                                  variant="outline"
                                  className={getNotificationStatusBadgeClass(
                                    refundNotificationAudit.sms.status,
                                  )}
                                >
                                  {formatNotificationStatus(refundNotificationAudit.sms.status)}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {refundNotificationAudit.sms.recipient || "No phone"}
                                  {refundNotificationAudit.sms.requestId
                                    ? ` - request ${refundNotificationAudit.sms.requestId}`
                                    : ""}
                                </span>
                                {refundNotificationAudit.sms.error ? (
                                  <span className="text-xs text-rose-600">
                                    {refundNotificationAudit.sms.error}
                                  </span>
                                ) : null}
                              </div>
                            }
                          />
                        </>
                      ) : (
                        <InfoRow label="Notification audit" value="Not sent yet" />
                      )}
                    </CardContent>
                  </Card>
                ) : null}
                <Card>
                  <CardHeader>
                    <CardTitle>Payment audit</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {details.history
                      .filter((entry) =>
                        entry.note.toLowerCase().includes("refund") ||
                        entry.note.toLowerCase().includes("cod") ||
                        entry.note.toLowerCase().includes("payment")
                      )
                      .map((entry, index) => (
                        <div
                          key={`${entry.createdAt}-${index}`}
                          className="rounded-md border px-3 py-2"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium">{entry.actor}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(entry.createdAt)}
                            </span>
                          </div>
                          <div className="mt-1 text-muted-foreground">
                            {entry.note || entry.status}
                          </div>
                        </div>
                      ))}
                    {details.history.filter((entry) =>
                      entry.note.toLowerCase().includes("refund") ||
                      entry.note.toLowerCase().includes("cod") ||
                      entry.note.toLowerCase().includes("payment")
                    ).length === 0 ? (
                      <div className="text-muted-foreground">
                        No payment audit entries yet.
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Timeline</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 text-sm">
                    <InfoRow
                      label="Created"
                      value={formatDate(details.timestamps.createdAt)}
                    />
                    <InfoRow
                      label="Accepted"
                      value={formatDate(details.timestamps.acceptedAt)}
                    />
                    <InfoRow
                      label="Ready"
                      value={formatDate(details.timestamps.readyAt)}
                    />
                    <InfoRow
                      label="Delivered"
                      value={formatDate(details.timestamps.deliveredAt)}
                    />
                    <InfoRow
                      label="Cancelled"
                      value={formatDate(details.timestamps.cancelledAt)}
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Payment details not found.
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

function exportTransactionsCsv(
  transactions: AdminPaymentTransaction[],
  filename = `admin-payments-${new Date().toISOString().slice(0, 10)}.csv`
) {
  const rows = transactions.map((transaction) => ({
    orderNumber: transaction.orderNumber,
    restaurant: transaction.restaurantName,
    customer: transaction.customerName,
    method: transaction.paymentMethod,
    bkashPayerPhone: transaction.bkashPayerPhone,
    paymentStatus: getDisplayPaymentStatus(transaction),
    orderStatus: transaction.status,
    amount: transaction.amount,
    transactionId: transaction.transactionId,
    createdAt: transaction.createdAt ?? "",
  }))
  const headers = Object.keys(rows[0] ?? { orderNumber: "" })
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => `"${String(row[header as keyof typeof row] ?? "").replace(/"/g, '""')}"`)
        .join(",")
    ),
  ].join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function PaymentsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = React.useState("")
  const [preset, setPreset] = React.useState<PaymentPreset>("last7Days")
  const [from, setFrom] = React.useState("")
  const [to, setTo] = React.useState("")
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethodFilter>("all")
  const [paymentStatus, setPaymentStatus] = React.useState<PaymentStatusFilter>("all")
  const [settlement, setSettlement] = React.useState<SettlementFilter>("all")
  const [sortBy, setSortBy] = React.useState<PaymentSort>("newest")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)
  const [attemptStatus, setAttemptStatus] =
    React.useState<BkashAttemptStatusFilter>("all")
  const [attemptPaymentStatus, setAttemptPaymentStatus] =
    React.useState<BkashAttemptPaymentStatusFilter>("all")
  const [attemptOrderState, setAttemptOrderState] =
    React.useState<BkashAttemptOrderStateFilter>("all")
  const [attemptPage, setAttemptPage] = React.useState(1)
  const [attemptPageSize, setAttemptPageSize] = React.useState(10)
  const [attemptDetails, setAttemptDetails] =
    React.useState<AdminBkashPaymentAttempt | null>(null)
  const [detailsOrderId, setDetailsOrderId] = React.useState("")
  const [codTarget, setCodTarget] = React.useState<AdminPaymentTransaction | null>(null)
  const [refundTarget, setRefundTarget] = React.useState<null | {
    transaction: AdminPaymentTransaction
    paymentStatus: RefundStatus
    label: string
  }>(null)
  const debouncedSearch = useDebouncedValue(search, 350)
  const paymentFilterParams = React.useMemo(
    () => ({
      search: debouncedSearch,
      preset,
      from: preset === "custom" ? from : "",
      to: preset === "custom" ? to : "",
      paymentMethod,
      paymentStatus,
      settlement,
      sortBy,
    }),
    [
      debouncedSearch,
      preset,
      from,
      to,
      paymentMethod,
      paymentStatus,
      settlement,
      sortBy,
    ]
  )

  const paymentsQuery = useQuery({
    queryKey: [
      "admin-payments",
      {
        search: debouncedSearch,
        preset,
        from,
        to,
        paymentMethod,
        paymentStatus,
        settlement,
        sortBy,
        page,
        pageSize,
      },
    ],
    queryFn: () =>
      listAdminPayments({
        ...paymentFilterParams,
        page,
        pageSize,
      }),
  })
  const bkashAttemptsQuery = useQuery({
    queryKey: [
      "admin-bkash-payment-attempts",
      {
        search: debouncedSearch,
        preset,
        from,
        to,
        attemptStatus,
        attemptPaymentStatus,
        attemptOrderState,
        attemptPage,
        attemptPageSize,
      },
    ],
    queryFn: () =>
      listAdminBkashPaymentAttempts({
        search: debouncedSearch,
        preset,
        from: preset === "custom" ? from : "",
        to: preset === "custom" ? to : "",
        status: attemptStatus,
        paymentStatus: attemptPaymentStatus,
        orderState: attemptOrderState,
        page: attemptPage,
        pageSize: attemptPageSize,
      }),
  })
  const exportMutation = useMutation({
    mutationFn: () => exportAdminPayments(paymentFilterParams),
    onSuccess: (data) => {
      exportTransactionsCsv(
        data.items,
        `admin-payments-filtered-${new Date().toISOString().slice(0, 10)}.csv`
      )
      if (data.truncated) {
        toast.warning("Export limited to the latest 5,000 matching transactions.")
      } else {
        toast.success(`Exported ${data.items.length} transactions.`)
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Export failed.")
    },
  })
  const reconcileMutation = useMutation({
    mutationFn: reconcileAdminPaymentsLedger,
    onSuccess: (result) => {
      toast.success(
        `Ledger reconciled. ${result.created} created, ${result.updated} updated.`
      )
      void queryClient.invalidateQueries({ queryKey: ["admin-payments"] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Ledger reconcile failed.")
    },
  })
  const reconcileBkashAttemptMutation = useMutation({
    mutationFn: (attemptId: string) =>
      reconcileAdminBkashPaymentAttempt({
        attemptId,
        note: "Manual admin reconciliation from Payments page",
      }),
    onSuccess: (result) => {
      toast.success(
        result.orderId
          ? "bKash payment reconciled and order is linked."
          : `bKash payment reconciled: ${formatAttemptLabel(result.status)}.`
      )
      void queryClient.invalidateQueries({ queryKey: ["admin-bkash-payment-attempts"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-payments"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-orders"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "bKash reconciliation failed."
      )
    },
  })

  function exportPaymentsPdf() {
    const ok = printTableReport({
      title: "Foodbela payments report",
      subtitle: "Current filtered order payment transactions.",
      metrics: [
        { label: "Online collected", value: formatCurrency(summary?.onlineCollected ?? 0) },
        { label: "Refund pending", value: formatCurrency(summary?.refundPendingAmount ?? 0) },
        { label: "Restaurant payable", value: formatCurrency(summary?.restaurantPayable ?? 0) },
      ],
      headers: ["Order", "Restaurant", "Customer", "Method", "bKash payer", "Status", "Amount", "Created"],
      rows: transactions.map((transaction) => [
        transaction.orderNumber,
        transaction.restaurantName,
        `${transaction.customerName} ${transaction.customerPhone ? `(${transaction.customerPhone})` : ""}`,
        transaction.paymentMethod,
        transaction.bkashPayerPhone || "N/A",
        getDisplayPaymentStatus(transaction),
        formatCurrency(transaction.amount),
        formatDate(transaction.createdAt),
      ]),
    })
    if (!ok) toast.error("Allow popups to export the PDF report.")
  }

  function exportBkashAttemptsPdf() {
    const ok = printTableReport({
      title: "Foodbela bKash checkout attempts",
      subtitle: "Current filtered bKash checkout audit records.",
      metrics: [
        { label: "Attempts", value: bkashAttemptSummary?.attemptCount ?? 0 },
        { label: "Paid", value: formatCurrency(bkashAttemptSummary?.paidAmount ?? 0) },
        {
          label: "Paid without order",
          value: formatCurrency(bkashAttemptSummary?.paidWithoutOrderAmount ?? 0),
        },
      ],
      headers: ["Payment ID", "Customer", "Restaurant", "bKash number", "Payer reference", "Status", "Amount", "Created"],
      rows: bkashAttempts.map((attempt) => [
        attempt.paymentID || attempt.sessionId,
        `${attempt.customerName} ${attempt.customerPhone ? `(${attempt.customerPhone})` : ""}`,
        attempt.restaurantName,
        getBkashAttemptPayerNumber(attempt) || "N/A",
        attempt.payerReference || "N/A",
        `${formatAttemptLabel(attempt.paymentStatus)} / ${formatAttemptLabel(attempt.status)}`,
        formatCurrency(attempt.amount),
        formatDate(attempt.createdAt),
      ]),
    })
    if (!ok) toast.error("Allow popups to export the PDF report.")
  }

  const transactions = paymentsQuery.data?.items ?? []
  const summary = paymentsQuery.data?.summary
  const pageCount = paymentsQuery.data?.pageCount ?? 1
  const safePage = Math.min(page, pageCount)
  const bkashAttempts = bkashAttemptsQuery.data?.items ?? []
  const bkashAttemptSummary = bkashAttemptsQuery.data?.summary
  const attemptPageCount = bkashAttemptsQuery.data?.pageCount ?? 1
  const safeAttemptPage = Math.min(attemptPage, attemptPageCount)

  React.useEffect(() => {
    setPage(1)
  }, [
    debouncedSearch,
    preset,
    from,
    to,
    paymentMethod,
    paymentStatus,
    settlement,
    sortBy,
    pageSize,
  ])

  React.useEffect(() => {
    setAttemptPage(1)
  }, [
    debouncedSearch,
    preset,
    from,
    to,
    attemptStatus,
    attemptPaymentStatus,
    attemptOrderState,
    attemptPageSize,
  ])

  React.useEffect(() => {
    if (preset !== "custom") {
      setFrom("")
      setTo("")
    }
  }, [preset])

  React.useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  React.useEffect(() => {
    if (attemptPage > attemptPageCount) setAttemptPage(attemptPageCount)
  }, [attemptPage, attemptPageCount])

  function resetFilters() {
    setSearch("")
    setPreset("last7Days")
    setFrom("")
    setTo("")
    setPaymentMethod("all")
    setPaymentStatus("all")
    setSettlement("all")
    setSortBy("newest")
    setPage(1)
    setAttemptStatus("all")
    setAttemptPaymentStatus("all")
    setAttemptOrderState("all")
    setAttemptPage(1)
  }

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor online payment, cash on delivery, refunds, and transaction history.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={resetFilters}>
            <RotateCcw className="size-4" />
            Reset filters
          </Button>
          <Button
            variant="outline"
            onClick={() => reconcileMutation.mutate()}
            disabled={reconcileMutation.isPending}
          >
            {reconcileMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <WalletCards className="size-4" />
            )}
            Reconcile ledger
          </Button>
          <Button
            variant="outline"
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
          >
            {exportMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Export filtered
          </Button>
          <Button
            variant="outline"
            onClick={exportPaymentsPdf}
            disabled={transactions.length === 0}
          >
            <Download className="size-4" />
            Export PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Customer paid delivered"
          value={formatCurrency(summary?.deliveredRevenue ?? 0)}
          helper="Delivered order totals"
        />
        <StatCard
          label="Online collected"
          value={formatCurrency(summary?.onlineCollected ?? 0)}
          helper="Paid bKash orders"
        />
        <StatCard
          label="COD delivered"
          value={formatCurrency(summary?.codDelivered ?? 0)}
          helper="Delivered cash orders"
        />
        <StatCard
          label="Refund pending"
          value={formatCurrency(summary?.refundPendingAmount ?? 0)}
          helper={`${summary?.refundPendingCount ?? 0} orders need review`}
        />
        <StatCard
          label="Refunded"
          value={formatCurrency(summary?.refundedAmount ?? 0)}
          helper={`${summary?.refundedCount ?? 0} completed refunds`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Restaurant settlement breakdown</CardTitle>
            <CardDescription>
              Payout math for restaurants. This is different from customer paid total.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <InfoRow
              label="Customer paid delivered"
              value={formatCurrency(summary?.deliveredRevenue ?? 0)}
            />
            <InfoRow
              label="Item subtotal before discount"
              value={formatCurrency(summary?.settlementGrossAmount ?? 0)}
            />
            <InfoRow
              label="Commission base before restaurant discount"
              value={formatCurrency(summary?.settlementCommissionBase ?? 0)}
            />
            <InfoRow
              label="Minus platform commission"
              value={formatCurrency(summary?.platformCommission ?? 0)}
            />
            <InfoRow
              label="Minus discount funded by restaurant"
              value={formatCurrency(summary?.discountCost ?? 0)}
            />
            <InfoRow
              label="Platform promo expense"
              value={formatCurrency(summary?.platformDiscountCost ?? 0)}
            />
            <InfoRow
              label="Restaurant payable"
              value={formatCurrency(summary?.restaurantPayable ?? 0)}
            />
            <InfoRow
              label="Delivery fee shown separately"
              value={formatCurrency(summary?.deliveryCost ?? 0)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payout readiness</CardTitle>
            <CardDescription>
              Available, requested, and completed restaurant payout balances.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <InfoRow
              label="Ready to payout"
              value={formatCurrency(summary?.payoutReadyAmount ?? 0)}
            />
            <InfoRow
              label="Requested payout"
              value={formatCurrency(summary?.payoutRequestedAmount ?? 0)}
            />
            <InfoRow
              label="Reserved by requests"
              value={formatCurrency(summary?.payoutReservedAmount ?? 0)}
            />
            <InfoRow
              label="Pending settlement"
              value={formatCurrency(summary?.payoutPendingAmount ?? 0)}
            />
            <InfoRow
              label="Already paid out"
              value={formatCurrency(summary?.paidOutAmount ?? 0)}
            />
            <InfoRow
              label="Failed payout"
              value={formatCurrency(summary?.payoutFailedAmount ?? 0)}
            />
            <InfoRow
              label="Pending COD"
              value={formatCurrency(summary?.pendingCod ?? 0)}
            />
            <InfoRow
              label="Next payout date"
              value={formatShortDate(summary?.nextPayoutDate)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Platform margin estimate</CardTitle>
            <CardDescription>
              Commission and delivery fee minus platform promo and rider payroll.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <InfoRow
              label="Platform gross income"
              value={formatCurrency(summary?.platformGrossIncome ?? 0)}
            />
            <InfoRow
              label="Rider payroll expense"
              value={formatCurrency(summary?.riderPayrollExpense ?? 0)}
            />
            <InfoRow
              label="Payroll pending"
              value={formatCurrency(summary?.riderPayrollPending ?? 0)}
            />
            <InfoRow
              label="Payroll paid"
              value={formatCurrency(summary?.riderPayrollPaid ?? 0)}
            />
            <InfoRow
              label="Operating expense"
              value={formatCurrency(summary?.platformOperatingExpense ?? 0)}
            />
            <InfoRow
              label="Estimated margin"
              value={formatCurrency(summary?.estimatedPlatformMargin ?? 0)}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>bKash checkout attempts</CardTitle>
              <CardDescription>
                Tracks customers who opened bKash, completed payment, cancelled, failed, or paid without an order.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={exportBkashAttemptsPdf}
              disabled={bkashAttempts.length === 0}
              className="w-full sm:w-auto"
            >
              <Download className="size-4" />
              Export PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <InlineMetric
              label="Attempts"
              value={bkashAttemptSummary?.attemptCount ?? 0}
              helper="All bKash checkout starts"
            />
            <InlineMetric
              label="Paid"
              value={formatCurrency(bkashAttemptSummary?.paidAmount ?? 0)}
              helper={`${bkashAttemptSummary?.paidCount ?? 0} successful payments`}
            />
            <InlineMetric
              label="Open unpaid"
              value={bkashAttemptSummary?.unpaidCount ?? 0}
              helper={`${bkashAttemptSummary?.staleUnpaidCount ?? 0} expired or abandoned`}
            />
            <InlineMetric
              label="Failed or cancelled"
              value={
                (bkashAttemptSummary?.failedCount ?? 0) +
                (bkashAttemptSummary?.cancelledCount ?? 0) +
                (bkashAttemptSummary?.expiredCount ?? 0)
              }
              helper="Gateway fail, user cancel, or timeout"
            />
            <InlineMetric
              label="Paid without order"
              value={formatCurrency(bkashAttemptSummary?.paidWithoutOrderAmount ?? 0)}
              helper={`${bkashAttemptSummary?.paidWithoutOrderCount ?? 0} needs urgent review`}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-64 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 pl-9"
                placeholder="Search bKash payment, customer, restaurant, wallet"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <AdminDateRangeFilter<PaymentPreset>
              value={preset}
              from={from}
              to={to}
              label="Date"
              triggerClassName="h-9 sm:w-44"
              onPresetChange={setPreset}
              onRangeChange={(range) => {
                setFrom(range.from)
                setTo(range.to)
              }}
            />
            <Select
              value={attemptPaymentStatus}
              onValueChange={(value) =>
                setAttemptPaymentStatus(value as BkashAttemptPaymentStatusFilter)
              }
            >
              <SelectTrigger className="h-9 w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All payments</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={attemptStatus}
              onValueChange={(value) => setAttemptStatus(value as BkashAttemptStatusFilter)}
            >
              <SelectTrigger className="h-9 w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All events</SelectItem>
                <SelectItem value="provider_created">Checkout created</SelectItem>
                <SelectItem value="customer_cancelled">Customer cancelled</SelectItem>
                <SelectItem value="execute_failed">Execute failed</SelectItem>
                <SelectItem value="order_finalize_failed">Order finalize failed</SelectItem>
                <SelectItem value="order_finalized">Order finalized</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={attemptOrderState}
              onValueChange={(value) =>
                setAttemptOrderState(value as BkashAttemptOrderStateFilter)
              }
            >
              <SelectTrigger className="h-9 w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All order states</SelectItem>
                <SelectItem value="finalized">Order finalized</SelectItem>
                <SelectItem value="missing">Paid without order</SelectItem>
                <SelectItem value="failed">Finalize failed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Checkout</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Latest event</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {bkashAttemptsQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : null}
                {bkashAttempts.map((attempt: AdminBkashPaymentAttempt) => (
                  <TableRow key={attempt.id}>
                    <TableCell>
                      <div className="font-medium">
                        {attempt.paymentID || attempt.sessionId || "Pending provider id"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {getBkashAttemptPayerNumber(attempt) || "No bKash number"} - {formatDate(attempt.createdAt)}
                      </div>
                      <div className="text-xs font-medium">
                        Payer ref {attempt.payerReference || "N/A"}
                      </div>
                      {attempt.voucherCode ? (
                        <Badge variant="outline" className="mt-1 border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700">
                          Voucher {attempt.voucherCode}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{attempt.restaurantName}</div>
                      <div className="text-xs text-muted-foreground">
                        {attempt.customerName} - {attempt.customerPhone || "N/A"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge
                          variant="outline"
                          className={getBkashAttemptBadgeClass(attempt.paymentStatus)}
                        >
                          {formatAttemptLabel(attempt.paymentStatus)}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={getBkashAttemptBadgeClass(attempt.status)}
                        >
                          {formatAttemptLabel(attempt.status)}
                        </Badge>
                        {attempt.orderFinalizationStatus === "failed" ? (
                          <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
                            Order needs review
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(attempt.amount)}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {formatAttemptLabel(attempt.latestEvent || attempt.status)}
                      </div>
                      <div className="max-w-[280px] truncate text-xs text-muted-foreground">
                        {attempt.failureReason ||
                          attempt.providerMessage ||
                          attempt.latestNote ||
                          attempt.transactionId ||
                          "No gateway note"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setAttemptDetails(attempt)}
                          title="Open gateway log"
                        >
                          <ReceiptText className="size-4" />
                        </Button>
                        {attempt.paymentID ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              reconcileBkashAttemptMutation.mutate(attempt.id)
                            }
                            disabled={
                              reconcileBkashAttemptMutation.isPending &&
                              reconcileBkashAttemptMutation.variables === attempt.id
                            }
                            title="Reconcile with bKash"
                          >
                            {reconcileBkashAttemptMutation.isPending &&
                            reconcileBkashAttemptMutation.variables === attempt.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <RotateCcw className="size-4" />
                            )}
                          </Button>
                        ) : null}
                        {attempt.orderId ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDetailsOrderId(attempt.orderId)}
                          title="Open order"
                        >
                          <Eye className="size-4" />
                        </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!bkashAttemptsQuery.isLoading && bkashAttempts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No bKash checkout attempts match this filter.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {bkashAttempts.length} of {bkashAttemptsQuery.data?.total ?? bkashAttempts.length} attempts
              {bkashAttemptsQuery.isFetching && !bkashAttemptsQuery.isLoading ? " - refreshing" : ""}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Select
                value={`${attemptPageSize}`}
                onValueChange={(value) => setAttemptPageSize(Number(value))}
              >
                <SelectTrigger className="w-full sm:w-32">
                  <SelectValue />
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
                Page {safeAttemptPage} of {attemptPageCount}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setAttemptPage((current) => Math.max(1, current - 1))}
                  disabled={safeAttemptPage <= 1 || bkashAttemptsQuery.isFetching}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setAttemptPage((current) => Math.min(attemptPageCount, current + 1))
                  }
                  disabled={
                    safeAttemptPage >= attemptPageCount || bkashAttemptsQuery.isFetching
                  }
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transaction history</CardTitle>
          <CardDescription>
            Real platform orders with payment and refund status.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-64 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 pl-9"
                placeholder="Search order, customer, restaurant, trx"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <AdminDateRangeFilter<PaymentPreset>
              value={preset}
              from={from}
              to={to}
              label="Date"
              triggerClassName="h-9 sm:w-44"
              onPresetChange={setPreset}
              onRangeChange={(range) => {
                setFrom(range.from)
                setTo(range.to)
              }}
            />
            <Select
              value={paymentMethod}
              onValueChange={(value) => setPaymentMethod(value as PaymentMethodFilter)}
            >
              <SelectTrigger className="h-9 w-full sm:w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All methods</SelectItem>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="Bkash">bKash</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={paymentStatus}
              onValueChange={(value) => setPaymentStatus(value as PaymentStatusFilter)}
            >
              <SelectTrigger className="h-9 w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="refund_pending">Refund pending</SelectItem>
                <SelectItem value="refunded">Refunded</SelectItem>
                <SelectItem value="refund_rejected">Refund rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={settlement}
              onValueChange={(value) => setSettlement(value as SettlementFilter)}
            >
              <SelectTrigger className="h-9 w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All settlements</SelectItem>
                <SelectItem value="delivered">Delivered revenue</SelectItem>
                <SelectItem value="online">Online payment</SelectItem>
                <SelectItem value="cod">Cash on delivery</SelectItem>
                <SelectItem value="refund_queue">Refund queue</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={sortBy}
              onValueChange={(value) => setSortBy(value as PaymentSort)}
            >
              <SelectTrigger className="h-9 w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="oldest">Oldest</SelectItem>
                <SelectItem value="highestValue">Highest value</SelectItem>
                <SelectItem value="recentlyUpdated">Recently updated</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentsQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : null}
                {transactions.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell>
                      <div className="font-medium">{transaction.orderNumber}</div>
                      <Badge variant="outline" className={getOrderBadgeClass(transaction.status)}>
                        {transaction.status}
                      </Badge>
                      {transaction.voucherCodes?.length ? (
                        <Badge variant="outline" className="ml-1 border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700">
                          Voucher applied
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{transaction.restaurantName}</div>
                      <div className="text-xs text-muted-foreground">
                        {transaction.customerName} - {transaction.customerPhone || "N/A"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>{transaction.paymentMethod}</div>
                      <div className="text-xs text-muted-foreground">
                        {transaction.transactionId || transaction.provider || "No trx id"}
                      </div>
                      {transaction.paymentMethod === "Bkash" ? (
                        <div className="text-xs font-medium">
                          Payer {transaction.bkashPayerPhone || "N/A"}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={getPaymentBadgeClass(getDisplayPaymentStatus(transaction))}
                      >
                        {getDisplayPaymentStatus(transaction)}
                      </Badge>
                      {(() => {
                        const state = getReconciliationState(transaction)
                        return (
                          <Badge
                            variant="outline"
                            className={getReconciliationBadgeClass(state.tone)}
                          >
                            {state.label}
                          </Badge>
                        )
                      })()}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(transaction.amount)}
                    </TableCell>
                    <TableCell>{formatDate(transaction.createdAt)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setDetailsOrderId(transaction.orderId)}>
                            <Eye className="size-4" />
                            View details
                          </DropdownMenuItem>
                          {transaction.paymentMethod === "Bkash" &&
                          transaction.paymentStatus === "paid" &&
                          ["Cancelled", "Rejected"].includes(transaction.status) ? (
                            <DropdownMenuItem
                              onClick={() =>
                                setRefundTarget({
                                  transaction,
                                  paymentStatus: "refund_pending",
                                  label: "Mark refund pending",
                                })
                              }
                            >
                              <WalletCards className="size-4" />
                              Mark refund pending
                            </DropdownMenuItem>
                          ) : null}
                          {transaction.paymentStatus === "refund_pending" ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() =>
                                  setRefundTarget({
                                    transaction,
                                    paymentStatus: "refunded",
                                    label: "Mark refunded",
                                  })
                                }
                              >
                                <CheckCircle2 className="size-4" />
                                Mark refunded
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  setRefundTarget({
                                    transaction,
                                    paymentStatus: "refund_rejected",
                                    label: "Reject refund",
                                  })
                                }
                              >
                                <WalletCards className="size-4" />
                                Reject refund
                              </DropdownMenuItem>
                            </>
                          ) : null}
                          {transaction.paymentMethod === "Cash" &&
                          transaction.status === "Delivered" &&
                          transaction.paymentStatus !== "paid" ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setCodTarget(transaction)}
                              >
                                <WalletCards className="size-4" />
                                Mark COD collected
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {!paymentsQuery.isLoading && transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      No payment transactions match this filter.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {transactions.length} of {paymentsQuery.data?.total ?? transactions.length} transactions
              {paymentsQuery.isFetching && !paymentsQuery.isLoading ? " - refreshing" : ""}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Select
                value={`${pageSize}`}
                onValueChange={(value) => setPageSize(Number(value))}
              >
                <SelectTrigger className="w-full sm:w-32">
                  <SelectValue />
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
                  disabled={safePage <= 1 || paymentsQuery.isFetching}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setPage((current) => Math.min(pageCount, current + 1))
                  }
                  disabled={safePage >= pageCount || paymentsQuery.isFetching}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <PaymentDetailsSheet
        orderId={detailsOrderId}
        onRefund={(transaction, paymentStatus, label) =>
          setRefundTarget({ transaction, paymentStatus, label })
        }
        onCollectCod={setCodTarget}
        onOpenChange={(open) => {
          if (!open) setDetailsOrderId("")
        }}
      />
      <BkashAttemptDetailsSheet
        attempt={attemptDetails}
        onOpenOrder={(orderId) => {
          setDetailsOrderId(orderId)
          setAttemptDetails(null)
        }}
        onOpenChange={(open) => {
          if (!open) setAttemptDetails(null)
        }}
      />
      <RefundDialog
        target={refundTarget}
        onOpenChange={(open) => {
          if (!open) setRefundTarget(null)
        }}
      />
      <CodCollectionDialog
        target={codTarget}
        onOpenChange={(open) => {
          if (!open) setCodTarget(null)
        }}
      />
    </>
  )
}
