import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CheckCircle2,
  Download,
  Loader2,
  MoreHorizontal,
  Printer,
  RefreshCcw,
  RotateCcw,
  Search,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { useDebouncedValue } from "@/hooks/use-debounced-value"
import {
  getAdminServiceAreas,
  listAdminFinanceRefunds,
  updateAdminOrderRefundStatus,
  type AdminFinanceRefundRow,
} from "@/lib/admin-api"
import { downloadCsv, escapeHtml, printReport } from "@/lib/export-utils"
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { Textarea } from "@/components/ui/textarea"

type RefundStatusFilter =
  | "all"
  | "refund_pending"
  | "refunded"
  | "refund_rejected"
  | "needs_review"
type RefundSort = "newest" | "oldest" | "highest_value" | "recently_updated"

function formatCurrency(value: number) {
  return `Tk ${Math.round(Number.isFinite(value) ? value : 0).toLocaleString()}`
}

function formatDate(value?: string | null) {
  if (!value) return "N/A"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "N/A"
  return date.toLocaleString()
}

function refundBadgeClass(value: string) {
  if (value === "refunded") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (value === "refund_pending") return "border-amber-200 bg-amber-50 text-amber-700"
  if (value === "refund_rejected") return "border-rose-200 bg-rose-50 text-rose-700"
  return "border-sky-200 bg-sky-50 text-sky-700"
}

function orderBadgeClass(value: string) {
  if (value === "Delivered") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (value === "Cancelled" || value === "Rejected") return "border-rose-200 bg-rose-50 text-rose-700"
  return "border-sky-200 bg-sky-50 text-sky-700"
}

function notificationBadgeClass(value: string) {
  if (value === "sent") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (value === "in_app_only" || value === "skipped" || value === "not_configured" || value === "disabled") {
    return "border-amber-200 bg-amber-50 text-amber-700"
  }
  if (value === "failed") return "border-rose-200 bg-rose-50 text-rose-700"
  return "border-slate-200 bg-slate-50 text-slate-700"
}

function formatStatus(value: string) {
  if (!value) return "N/A"
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
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

function exportRows(rows: AdminFinanceRefundRow[]) {
  downloadCsv("finance-refunds.csv", [
    [
      "created_at",
      "order_number",
      "restaurant",
      "customer",
      "order_status",
      "payment_method",
      "payment_status",
      "subtotal",
      "delivery_fee",
      "discount",
      "total",
      "voucher_codes",
      "push_status",
      "sms_status",
    ],
    ...rows.map((row) => [
      row.createdAt,
      row.orderNumber,
      row.restaurantName,
      row.customerName,
      row.status,
      row.paymentMethod,
      row.paymentStatus,
      row.subtotal,
      row.deliveryFee,
      row.discount,
      row.total,
      row.voucherCodes.join(" "),
      row.refundNotificationAudit?.push.status ?? "",
      row.refundNotificationAudit?.sms.status ?? "",
    ]),
  ])
}

function RefundProofDialog({
  target,
  onOpenChange,
}: {
  target: AdminFinanceRefundRow | null
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [reference, setReference] = React.useState("")
  const [proofUrl, setProofUrl] = React.useState("")
  const [note, setNote] = React.useState("")

  React.useEffect(() => {
    if (!target) return
    setReference("")
    setProofUrl("")
    setNote("Refund completed from Finance > Refunds")
  }, [target])

  const mutation = useMutation({
    mutationFn: () => {
      if (!target) throw new Error("Refund order missing")
      return updateAdminOrderRefundStatus({
        orderId: target.id,
        expectedPaymentStatus: target.paymentStatus,
        paymentStatus: "refunded",
        providerReference: reference,
        proofUrl,
        note,
      })
    },
    onSuccess: () => {
      toast.success("Refund marked with proof.")
      void queryClient.invalidateQueries({ queryKey: ["admin-finance-refunds"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-payments"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-platform-finance"] })
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Refund update failed.")
    },
  })

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark refund completed</DialogTitle>
          <DialogDescription>
            Add bKash refund reference or proof so finance can audit the settlement.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">{target?.orderNumber}</span>
              <span className="font-medium">{formatCurrency(target?.total ?? 0)}</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="refund-reference">Refund reference</Label>
            <Input id="refund-reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="bKash refund trx id" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="refund-proof">Proof URL</Label>
            <Input id="refund-proof" value={proofUrl} onChange={(event) => setProofUrl(event.target.value)} placeholder="Screenshot or document URL" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="refund-note">Note</Label>
            <Textarea id="refund-note" value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!reference.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            Mark refunded
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function FinanceRefundsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = React.useState("")
  const [status, setStatus] = React.useState<RefundStatusFilter>("all")
  const [zoneId, setZoneId] = React.useState("all")
  const [sortBy, setSortBy] = React.useState<RefundSort>("newest")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(20)
  const [refundProofTarget, setRefundProofTarget] = React.useState<AdminFinanceRefundRow | null>(null)
  const debouncedSearch = useDebouncedValue(search, 350)

  React.useEffect(() => {
    setPage(1)
  }, [debouncedSearch, status, zoneId, sortBy, pageSize])

  const refundsQuery = useQuery({
    queryKey: ["admin-finance-refunds", debouncedSearch, status, zoneId, sortBy, page, pageSize],
    queryFn: () =>
      listAdminFinanceRefunds({
        search: debouncedSearch,
        status,
        zoneId: zoneId === "all" ? undefined : zoneId,
        sortBy,
        page,
        pageSize,
      }),
  })
  const serviceAreasQuery = useQuery({
    queryKey: ["admin-service-areas", "finance-refunds-filter"],
    queryFn: getAdminServiceAreas,
  })
  const refundMutation = useMutation({
    mutationFn: updateAdminOrderRefundStatus,
    onSuccess: () => {
      toast.success("Refund status updated.")
      void queryClient.invalidateQueries({ queryKey: ["admin-finance-refunds"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-payments"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-finance-payouts"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-finance-ledger"] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Refund update failed.")
      void queryClient.invalidateQueries({ queryKey: ["admin-finance-refunds"] })
    },
  })

  const data = refundsQuery.data
  const rows = data?.items ?? []

  const exportPdf = () => {
    const printed = printReport(
      "Finance Refunds",
      `
        <div class="grid">
          <div class="metric"><span class="muted">Refund queue</span><strong>${escapeHtml(data?.summary.pending ?? 0)}</strong></div>
          <div class="metric"><span class="muted">Refunded</span><strong>${escapeHtml(data?.summary.refunded ?? 0)}</strong></div>
          <div class="metric"><span class="muted">Needs review</span><strong>${escapeHtml(data?.summary.needsReview ?? 0)}</strong></div>
          <div class="metric"><span class="muted">Amount</span><strong>${escapeHtml(formatCurrency(data?.summary.amount ?? 0))}</strong></div>
        </div>
        <table>
          <thead><tr><th>Date</th><th>Order</th><th>Restaurant</th><th>Customer</th><th>Payment</th><th>Notice</th><th>Total</th></tr></thead>
          <tbody>
            ${rows
              .map(
                (row) =>
                  `<tr><td>${escapeHtml(formatDate(row.createdAt))}</td><td>${escapeHtml(row.orderNumber)}</td><td>${escapeHtml(row.restaurantName)}</td><td>${escapeHtml(row.customerName)}</td><td>${escapeHtml(row.paymentStatus)}</td><td>${escapeHtml(`${row.refundNotificationAudit?.push.status ?? "N/A"} / ${row.refundNotificationAudit?.sms.status ?? "N/A"}`)}</td><td>${escapeHtml(formatCurrency(row.total))}</td></tr>`
              )
              .join("")}
          </tbody>
        </table>
      `
    )
    if (!printed) toast.error("Popup blocked. Allow popups to print PDF.")
  }

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <span className="flex size-9 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
              <RotateCcw className="size-5" />
            </span>
            Refunds
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cancelled or rejected online payments, refund queue, refunded orders, and rejected refund decisions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => exportRows(rows)} disabled={!rows.length}>
            <Download className="size-4" />
            CSV
          </Button>
          <Button type="button" variant="outline" onClick={exportPdf} disabled={!rows.length}>
            <Printer className="size-4" />
            PDF
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void refundsQuery.refetch()}
            disabled={refundsQuery.isFetching}
          >
            {refundsQuery.isFetching ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Refund queue" value={(data?.summary.pending ?? 0).toLocaleString()} helper="Marked refund pending" />
        <StatCard label="Needs review" value={(data?.summary.needsReview ?? 0).toLocaleString()} helper="Paid online cancelled or rejected" />
        <StatCard label="Refunded" value={(data?.summary.refunded ?? 0).toLocaleString()} helper="Completed refunds" />
        <StatCard label="Rejected" value={(data?.summary.rejected ?? 0).toLocaleString()} helper="Rejected refund requests" />
        <StatCard label="Refund amount" value={formatCurrency(data?.summary.amount ?? 0)} helper="Filtered refund value" />
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-2 md:grid-cols-[minmax(240px,1fr)_180px_180px_180px_120px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search order, restaurant, customer"
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={(value) => setStatus(value as RefundStatusFilter)}>
            <SelectTrigger>
              <SelectValue placeholder="Refund status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All refunds</SelectItem>
              <SelectItem value="needs_review">Needs review</SelectItem>
              <SelectItem value="refund_pending">Refund pending</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
              <SelectItem value="refund_rejected">Refund rejected</SelectItem>
            </SelectContent>
          </Select>
          <Select value={zoneId} onValueChange={setZoneId}>
            <SelectTrigger>
              <SelectValue placeholder="Zone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All zones</SelectItem>
              {(serviceAreasQuery.data?.zones ?? []).map((zone) => (
                <SelectItem key={zone.id} value={zone.id}>
                  {zone.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as RefundSort)}>
            <SelectTrigger>
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
              <SelectItem value="highest_value">Highest value</SelectItem>
              <SelectItem value="recently_updated">Recently updated</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
            <SelectTrigger>
              <SelectValue placeholder="Rows" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 rows</SelectItem>
              <SelectItem value="20">20 rows</SelectItem>
              <SelectItem value="50">50 rows</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Refund orders</CardTitle>
        </CardHeader>
        <CardContent>
          {refundsQuery.isLoading ? (
            <div className="grid min-h-[320px] place-items-center text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Loading refunds...
              </span>
            </div>
          ) : rows.length ? (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>Restaurant</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Customer notice</TableHead>
                      <TableHead className="text-right">Discount</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{formatDate(row.createdAt)}</TableCell>
                        <TableCell>
                          <div className="font-medium">{row.orderNumber}</div>
                          <div className="text-xs text-muted-foreground">{row.paymentMethod}</div>
                        </TableCell>
                        <TableCell>
                          <div>{row.restaurantName || "Unknown"}</div>
                          <div className="text-xs text-muted-foreground">{row.restaurantCity}</div>
                          {row.serviceArea?.zoneName ? (
                            <Badge variant="outline" className="mt-1 border-violet-200 bg-violet-50 text-violet-700">
                              {row.serviceArea.zoneName}
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <div>{row.customerName}</div>
                          <div className="text-xs text-muted-foreground">{row.customerPhone || "No phone"}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={orderBadgeClass(row.status)}>
                            {row.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={refundBadgeClass(row.paymentStatus)}>
                            {row.paymentStatus}
                          </Badge>
                          {row.voucherCodes.length ? (
                            <Badge variant="outline" className="ml-1 border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700">
                              Voucher applied
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {row.refundNotificationAudit ? (
                            <div className="flex flex-col gap-1">
                              <div className="flex flex-wrap gap-1">
                                <Badge
                                  variant="outline"
                                  className={notificationBadgeClass(row.refundNotificationAudit.push.status)}
                                >
                                  Push {formatStatus(row.refundNotificationAudit.push.status)}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className={notificationBadgeClass(row.refundNotificationAudit.sms.status)}
                                >
                                  SMS {formatStatus(row.refundNotificationAudit.sms.status)}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {row.refundNotificationAudit.sms.recipient || "No SMS phone"}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Not sent yet</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(row.discount)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(row.total)}</TableCell>
                        <TableCell>
                          {row.paymentMethod === "Bkash" &&
                          ["paid", "refund_pending"].includes(row.paymentStatus) ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button type="button" variant="ghost" size="icon-sm">
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {row.paymentStatus === "paid" ? (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      refundMutation.mutate({
                                        orderId: row.id,
                                        expectedPaymentStatus: row.paymentStatus,
                                        paymentStatus: "refund_pending",
                                        note: "Marked refund pending from Finance > Refunds",
                                      })
                                    }
                                  >
                                    <RefreshCcw className="size-4" />
                                    Mark pending
                                  </DropdownMenuItem>
                                ) : null}
                                <DropdownMenuItem
                                  onClick={() => setRefundProofTarget(row)}
                                >
                                  <CheckCircle2 className="size-4" />
                                  Mark refunded with proof
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() =>
                                    refundMutation.mutate({
                                      orderId: row.id,
                                      expectedPaymentStatus: row.paymentStatus,
                                      paymentStatus: "refund_rejected",
                                      note: "Refund rejected from Finance > Refunds",
                                    })
                                  }
                                >
                                  <XCircle className="size-4" />
                                  Reject refund
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">
                  Page {data?.page ?? 1} of {data?.pageCount ?? 1}
                </span>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= (data?.pageCount ?? 1)}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <Empty className="min-h-[320px]">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <RotateCcw className="size-4" />
                </EmptyMedia>
                <EmptyTitle>No refund orders found</EmptyTitle>
                <EmptyDescription>Refund queue is empty for the selected filters.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
      <RefundProofDialog
        target={refundProofTarget}
        onOpenChange={(open) => !open && setRefundProofTarget(null)}
      />
    </>
  )
}
