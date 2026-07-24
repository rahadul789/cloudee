import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "react-router-dom"
import {
  Banknote,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Loader2,
  MoreHorizontal,
  Printer,
  RefreshCcw,
  Search,
  WalletCards,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { useDebouncedValue } from "@/hooks/use-debounced-value"
import {
  createAdminFinancePayout,
  getAdminFinancePayoutBatchStatement,
  getAdminFinancePayoutDetails,
  getAdminFinancePayoutStatementPreview,
  getAdminServiceAreas,
  listAdminPayoutMethodApprovals,
  listAdminFinancePayouts,
  reconcileAdminRestaurantFinance,
  reviewAdminPayoutMethodApproval,
  type AdminPayoutMethodApproval,
  updateAdminRestaurantPayoutStatus,
  type AdminFinanceLedgerEntry,
  type AdminFinancePayoutBatch,
  type AdminFinancePayoutDetails,
  type AdminFinancePayoutEligibility,
  type AdminFinancePayoutRow,
  type AdminFinancePayoutStatement,
} from "@/lib/admin-api"
import { downloadCsv, escapeHtml, printReport, printReportInFrame } from "@/lib/export-utils"
import {
  buildAdminPayoutStatementHtml,
  getAdminPayoutStatementTitle,
} from "@/lib/payout-statement-export"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

type PayoutEligibilityFilter = "all" | AdminFinancePayoutEligibility
type PayoutSort =
  | "available_desc"
  | "pending_desc"
  | "recent_request"
  | "name_asc"
type PayoutStatusAction = "processing" | "completed" | "failed"

function formatCurrency(value: number) {
  return `Tk ${Math.round(Number.isFinite(value) ? value : 0).toLocaleString()}`
}

function formatDate(value?: string | null) {
  if (!value) return "N/A"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "N/A"
  return date.toLocaleString()
}

function eligibilityLabel(value: string) {
  if (value === "eligible") return "Eligible"
  if (value === "pending_request") return "Payout pending"
  return "Blocked"
}

function eligibilityBadgeClass(value: string) {
  if (value === "eligible")
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (value === "pending_request")
    return "border-sky-200 bg-sky-50 text-sky-700"
  return "border-amber-200 bg-amber-50 text-amber-700"
}

function statusBadgeClass(value: string) {
  if (value === "completed")
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (value === "processing") return "border-sky-200 bg-sky-50 text-sky-700"
  if (value === "failed") return "border-rose-200 bg-rose-50 text-rose-700"
  return "border-amber-200 bg-amber-50 text-amber-700"
}

function settlementBadgeClass(value: string) {
  if (value === "available") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (value === "paid_out") return "border-sky-200 bg-sky-50 text-sky-700"
  return "border-amber-200 bg-amber-50 text-amber-700"
}

function ledgerEntryBadgeClass(entry: AdminFinanceLedgerEntry) {
  if (entry.isCarryForward) return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700"
  if (entry.entryType === "earning") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (entry.entryType === "refund") return "border-rose-200 bg-rose-50 text-rose-700"
  if (entry.entryType === "payout") return "border-sky-200 bg-sky-50 text-sky-700"
  return "border-slate-200 bg-slate-50 text-slate-700"
}

function ledgerEntryLabel(entry: AdminFinanceLedgerEntry) {
  if (entry.isCarryForward) return "Carry-forward"
  return entry.entryType
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

function PayoutStatusDialog({
  target,
  onOpenChange,
}: {
  target: null | {
    restaurantId: string
    payout: AdminFinancePayoutBatch
    status: PayoutStatusAction
  }
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [reference, setReference] = React.useState("")
  const [note, setNote] = React.useState("")
  const [notifyOwnerSms, setNotifyOwnerSms] = React.useState(false)
  const [statement, setStatement] =
    React.useState<AdminFinancePayoutStatement | null>(null)
  const [statementReviewed, setStatementReviewed] = React.useState(false)
  const [statementError, setStatementError] = React.useState("")

  React.useEffect(() => {
    if (target) {
      setReference("")
      setNote("")
      setNotifyOwnerSms(false)
      setStatement(null)
      setStatementReviewed(false)
      setStatementError("")
    }
  }, [target])

  const statementMutation = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error("Payout is missing")
      return getAdminFinancePayoutBatchStatement(target.payout.id)
    },
    onSuccess: (data) => {
      const printed = printReportInFrame(
        getAdminPayoutStatementTitle(data),
        buildAdminPayoutStatementHtml(data)
      )
      if (!printed) toast.error("Unable to prepare payout statement.")
      setStatement(data)
      setStatementReviewed(false)
      setStatementError("")
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Payout statement could not be loaded."
      )
    },
  })

  function submitStatusUpdate() {
    if (target?.status === "completed" && (!statement || !statementReviewed)) {
      setStatementError("Download and check the payout statement before completing payout.")
      return
    }
    mutation.mutate()
  }

  const mutation = useMutation({
    mutationFn: () => {
      if (!target) throw new Error("Payout is missing")
      return updateAdminRestaurantPayoutStatus({
        restaurantId: target.restaurantId,
        payoutId: target.payout.id,
        expectedStatus: target.payout.status,
        status: target.status,
        providerReference: reference,
        providerPayoutId: reference,
        providerTransactionId: reference,
        failureReason: target.status === "failed" ? note : undefined,
        processingNote: note,
        statementReviewed: target.status === "completed" ? statementReviewed : undefined,
        statementChecksum:
          target.status === "completed" ? statement?.statementChecksum : undefined,
        notifyOwnerSms: target.status === "completed" ? notifyOwnerSms : false,
      })
    },
    onSuccess: () => {
      toast.success("Payout status updated.")
      void queryClient.invalidateQueries({
        queryKey: ["admin-finance-payouts"],
      })
      void queryClient.invalidateQueries({
        queryKey: ["admin-finance-payout-details", target?.restaurantId],
      })
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Payout update failed."
      )
      void queryClient.invalidateQueries({
        queryKey: ["admin-finance-payouts"],
      })
    },
  })

  const title =
    target?.status === "completed"
      ? "Complete payout"
      : target?.status === "failed"
        ? "Mark payout failed"
        : "Move payout to processing"

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {target
              ? `${formatCurrency(target.payout.amount)} payout request will be updated.`
              : "Payout request will be updated."}
          </DialogDescription>
        </DialogHeader>
        {target?.status === "completed" ? (
          <div className="space-y-2">
            <Label htmlFor="provider-reference">Provider reference</Label>
            <Input
              id="provider-reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="bKash trx or bank reference"
            />
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="processing-note">
            {target?.status === "failed" ? "Failure reason" : "Processing note"}
          </Label>
          <Textarea
            id="processing-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional internal note"
          />
        </div>
        {target?.status === "completed" ? (
          <>
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium">Transaction statement</div>
                  <div className="text-muted-foreground">
                    Download the order breakdown before completing payout.
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={statementMutation.isPending}
                  onClick={() => statementMutation.mutate()}
                >
                  {statementMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Printer className="size-4" />
                  )}
                  Download PDF
                </Button>
              </div>
              <label className="mt-3 flex items-start gap-3">
                <Checkbox
                  checked={statementReviewed}
                  disabled={!statement}
                  onCheckedChange={(checked) => {
                    setStatementReviewed(checked === true)
                    setStatementError("")
                  }}
                />
                <span>
                  <span className="block font-medium">I checked this statement</span>
                  <span className="text-muted-foreground">
                    {statement
                      ? `Checksum ${statement.statementChecksum.slice(0, 16)}`
                      : "Download first to unlock this confirmation."}
                  </span>
                </span>
              </label>
              {statementError ? (
                <p className="mt-2 text-xs font-medium text-destructive">{statementError}</p>
              ) : null}
            </div>
            <label className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
              <Checkbox
                checked={notifyOwnerSms}
                onCheckedChange={(checked) => setNotifyOwnerSms(checked === true)}
              />
              <span>
                <span className="block font-medium">Also send SMS to owner</span>
                <span className="text-muted-foreground">
                  App push is sent automatically. Enable SMS only when this payout needs a phone message.
                </span>
              </span>
            </label>
          </>
        ) : null}
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
            onClick={submitStatusUpdate}
            disabled={
              mutation.isPending ||
              (target?.status === "completed" && !reference.trim())
            }
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            Update payout
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreateAdminPayoutDialog({
  target,
  onOpenChange,
}: {
  target: AdminFinancePayoutRow | AdminFinancePayoutDetails | null
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [amount, setAmount] = React.useState("")
  const [status, setStatus] = React.useState<"processing" | "completed">("processing")
  const [ledgerSource, setLedgerSource] = React.useState<"available" | "include_pending">("available")
  const [reference, setReference] = React.useState("")
  const [note, setNote] = React.useState("")
  const [notifyOwnerSms, setNotifyOwnerSms] = React.useState(false)
  const [statement, setStatement] =
    React.useState<AdminFinancePayoutStatement | null>(null)
  const [statementReviewed, setStatementReviewed] = React.useState(false)
  const [statementError, setStatementError] = React.useState("")

  React.useEffect(() => {
    if (!target) return
    setAmount(`${Math.max(0, Math.floor(target.finance.availableBalance))}`)
    setStatus("processing")
    setLedgerSource("available")
    setReference("")
    setNote("")
    setNotifyOwnerSms(false)
    setStatement(null)
    setStatementReviewed(false)
    setStatementError("")
  }, [target])

  React.useEffect(() => {
    setStatement(null)
    setStatementReviewed(false)
    setStatementError("")
  }, [amount, ledgerSource])

  const statementMutation = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error("Restaurant is missing")
      const numericAmount = Number(amount)
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw new Error("Enter a valid payout amount before downloading statement.")
      }
      return getAdminFinancePayoutStatementPreview({
        restaurantId: target.restaurant.id,
        amount: numericAmount,
        includePending: ledgerSource === "include_pending",
      })
    },
    onSuccess: (data) => {
      const printed = printReportInFrame(
        getAdminPayoutStatementTitle(data),
        buildAdminPayoutStatementHtml(data)
      )
      if (!printed) toast.error("Unable to prepare payout statement.")
      setStatement(data)
      setStatementReviewed(false)
      setStatementError("")
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Payout statement could not be loaded."
      )
    },
  })

  function submitCreatePayout() {
    if (!statement || !statementReviewed) {
      setStatementError("Download and check the payout statement before creating payout.")
      return
    }
    mutation.mutate()
  }

  const mutation = useMutation({
    mutationFn: () => {
      if (!target) throw new Error("Restaurant is missing")
      return createAdminFinancePayout({
        restaurantId: target.restaurant.id,
        amount: Number(amount),
        status,
        providerReference: reference,
        providerPayoutId: reference,
        providerTransactionId: reference,
        includePending: ledgerSource === "include_pending",
        statementReviewed,
        statementChecksum: statement?.statementChecksum,
        note,
        notifyOwnerSms,
      })
    },
    onSuccess: () => {
      toast.success("Admin payout created.")
      void queryClient.invalidateQueries({ queryKey: ["admin-finance-payouts"] })
      void queryClient.invalidateQueries({
        queryKey: ["admin-finance-payout-details", target?.restaurant.id],
      })
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Payout could not be created.")
      void queryClient.invalidateQueries({ queryKey: ["admin-finance-payouts"] })
    },
  })

  const numericAmount = Number(amount)
  const maxPayoutAmount =
    (target?.finance.availableBalance ?? 0) +
    (ledgerSource === "include_pending" ? target?.finance.pendingBalance ?? 0 : 0)
  const requiresReference = status === "completed"
  const isAmountInvalid =
    !target ||
    !Number.isFinite(numericAmount) ||
    numericAmount <= 0 ||
    numericAmount > maxPayoutAmount
  const isInvalid =
    isAmountInvalid ||
    (requiresReference && !reference.trim()) ||
    (ledgerSource === "include_pending" && !note.trim())

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create admin payout</DialogTitle>
          <DialogDescription>
            Pay from available delivered-order ledger for {target?.restaurant.name ?? "this restaurant"}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Available</span>
              <span className="font-medium">{formatCurrency(target?.finance.availableBalance ?? 0)}</span>
            </div>
            <div className="mt-1 flex justify-between gap-3">
              <span className="text-muted-foreground">Payout method</span>
              <span className="font-medium">
                {target?.payoutMethod?.type ?? "N/A"} {target?.payoutMethod?.accountNumber || target?.payoutMethod?.accountNumberMasked || ""}
              </span>
            </div>
            {ledgerSource === "include_pending" ? (
              <div className="mt-1 flex justify-between gap-3">
                <span className="text-muted-foreground">Including pending</span>
                <span className="font-medium">{formatCurrency(target?.finance.pendingBalance ?? 0)}</span>
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-payout-amount">Amount</Label>
            <Input
              id="admin-payout-amount"
              type="number"
              min={1}
              max={Math.floor(maxPayoutAmount)}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Ledger source</Label>
            <Select value={ledgerSource} onValueChange={(value) => setLedgerSource(value as "available" | "include_pending")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="available">Available only</SelectItem>
                <SelectItem value="include_pending">Include pending settlement</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-medium">Transaction statement</div>
                <div className="text-muted-foreground">
                  Download the exact ledger breakdown before creating payout.
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={statementMutation.isPending || isAmountInvalid}
                onClick={() => statementMutation.mutate()}
              >
                {statementMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Printer className="size-4" />
                )}
                Download PDF
              </Button>
            </div>
            <label className="mt-3 flex items-start gap-3">
              <Checkbox
                checked={statementReviewed}
                disabled={!statement}
                onCheckedChange={(checked) => {
                  setStatementReviewed(checked === true)
                  setStatementError("")
                }}
              />
              <span>
                <span className="block font-medium">I checked this statement</span>
                <span className="text-muted-foreground">
                  {statement
                    ? `Checksum ${statement.statementChecksum.slice(0, 16)}`
                    : "Download first to unlock this confirmation."}
                </span>
              </span>
            </label>
            {statementError ? (
              <p className="mt-2 text-xs font-medium text-destructive">{statementError}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as "processing" | "completed")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="processing">Processing now</SelectItem>
                <SelectItem value="completed">Completed now</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {requiresReference ? (
            <div className="space-y-2">
              <Label htmlFor="admin-payout-reference">Payment reference</Label>
              <Input
                id="admin-payout-reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="bKash trx or bank reference"
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="admin-payout-note">Admin note</Label>
            <Textarea
              id="admin-payout-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={ledgerSource === "include_pending" ? "Required early payout reason" : "Reason, early payout exception, or internal note"}
            />
          </div>
          <label className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
            <Checkbox
              checked={notifyOwnerSms}
              onCheckedChange={(checked) => setNotifyOwnerSms(checked === true)}
            />
            <span>
              <span className="block font-medium">Also send SMS to owner</span>
              <span className="text-muted-foreground">
                Owner app push is sent automatically. SMS is optional for special payout notices.
              </span>
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={isInvalid || mutation.isPending} onClick={submitCreatePayout}>
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <WalletCards className="size-4" />}
            Create payout
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PayoutLedgerEntriesCard({
  details,
}: {
  details: AdminFinancePayoutDetails
}) {
  const showingReserved = details.reservedLedgerEntries.length > 0
  const showingAvailable =
    !showingReserved && details.availableLedgerEntries.length > 0
  const rows = showingReserved
    ? details.reservedLedgerEntries.slice(0, 20)
    : showingAvailable
    ? details.availableLedgerEntries.slice(0, 20)
    : details.recentLedgerEntries.slice(0, 20)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {showingReserved
            ? "Reserved payout entries"
            : showingAvailable
              ? "Available ledger entries"
              : "Recent ledger entries"}
        </CardTitle>
        <CardDescription>
          {showingReserved
            ? "Entries already reserved by the active payout request, so they are no longer shown as available."
            : showingAvailable
              ? "Entries that are ready to be included in the next restaurant payout."
              : "No available entries right now, so recent ledger activity is shown for audit context."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <div className="font-medium">
                        {entry.orderNumber || entry.sourceEntityId || "N/A"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(entry.createdAt)}
                      </div>
                      {entry.sourceLabel ? (
                        <div className="mt-1 text-xs font-medium text-muted-foreground">
                          {entry.sourceLabel}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline" className={ledgerEntryBadgeClass(entry)}>
                          {ledgerEntryLabel(entry)}
                        </Badge>
                        {entry.isCarryForward ? (
                          <Badge variant="outline" className="border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700">
                            next payout
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={settlementBadgeClass(entry.settlementStatus)}>
                        {entry.settlementStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(entry.grossAmount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(entry.commission)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(entry.discountCost)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(entry.netAmount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <WalletCards className="size-4" />
              </EmptyMedia>
              <EmptyTitle>No ledger entries yet</EmptyTitle>
              <EmptyDescription>
                Delivered orders will appear here after finance reconciliation
                creates ledger entries.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  )
}

export function FinancePayoutsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = React.useState("")
  const [eligibility, setEligibility] =
    React.useState<PayoutEligibilityFilter>("all")
  const [zoneId, setZoneId] = React.useState("all")
  const [sortBy, setSortBy] = React.useState<PayoutSort>("available_desc")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(20)
  const [selectedRestaurantId, setSelectedRestaurantId] = React.useState<
    string | null
  >(null)
  const [statusTarget, setStatusTarget] = React.useState<null | {
    restaurantId: string
    payout: AdminFinancePayoutBatch
    status: PayoutStatusAction
  }>(null)
  const [createTarget, setCreateTarget] = React.useState<
    AdminFinancePayoutRow | AdminFinancePayoutDetails | null
  >(null)
  const [approvalTarget, setApprovalTarget] = React.useState<null | {
    item: AdminPayoutMethodApproval
    decision: "approved" | "rejected"
  }>(null)
  const [approvalNote, setApprovalNote] = React.useState("")
  const debouncedSearch = useDebouncedValue(search, 350)
  const queryClient = useQueryClient()

  React.useEffect(() => {
    const restaurantId = searchParams.get("restaurantId")
    setSelectedRestaurantId(restaurantId || null)
  }, [searchParams])

  React.useEffect(() => {
    setPage(1)
  }, [debouncedSearch, eligibility, zoneId, sortBy, pageSize])

  function openPayoutDetails(restaurantId: string) {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set("restaurantId", restaurantId)
    setSelectedRestaurantId(restaurantId)
    setSearchParams(nextParams)
  }

  function closePayoutDetails() {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete("restaurantId")
    setSelectedRestaurantId(null)
    setSearchParams(nextParams, { replace: true })
  }

  const payoutsQuery = useQuery({
    queryKey: [
      "admin-finance-payouts",
      debouncedSearch,
      eligibility,
      zoneId,
      sortBy,
      page,
      pageSize,
    ],
    queryFn: () =>
      listAdminFinancePayouts({
        search: debouncedSearch,
        eligibility,
        zoneId: zoneId === "all" ? undefined : zoneId,
        sortBy,
        page,
        pageSize,
      }),
  })

  const serviceAreasQuery = useQuery({
    queryKey: ["admin-service-areas", "finance-payouts-filter"],
    queryFn: getAdminServiceAreas,
  })

  const detailsQuery = useQuery({
    queryKey: ["admin-finance-payout-details", selectedRestaurantId],
    queryFn: () => getAdminFinancePayoutDetails(selectedRestaurantId ?? ""),
    enabled: Boolean(selectedRestaurantId),
  })

  const approvalsQuery = useQuery({
    queryKey: ["admin-payout-method-approvals"],
    queryFn: listAdminPayoutMethodApprovals,
    refetchInterval: 30_000,
  })

  const approvalMutation = useMutation({
    mutationFn: () => {
      if (!approvalTarget) throw new Error("Approval request is missing")
      return reviewAdminPayoutMethodApproval({
        methodId: approvalTarget.item.id,
        decision: approvalTarget.decision,
        note: approvalNote,
      })
    },
    onSuccess: () => {
      toast.success("Payout method review saved.")
      setApprovalTarget(null)
      setApprovalNote("")
      void queryClient.invalidateQueries({
        queryKey: ["admin-payout-method-approvals"],
      })
      void queryClient.invalidateQueries({
        queryKey: ["admin-finance-payouts"],
      })
      void queryClient.invalidateQueries({
        queryKey: ["admin-finance-payout-details", selectedRestaurantId],
      })
      void queryClient.invalidateQueries({ queryKey: ["admin-notifications"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-action-center"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Payout method review failed."
      )
    },
  })

  const reconcileMutation = useMutation({
    mutationFn: (restaurantId: string) =>
      reconcileAdminRestaurantFinance(restaurantId),
    onSuccess: () => {
      toast.success("Restaurant finance reconciled.")
      void queryClient.invalidateQueries({
        queryKey: ["admin-finance-payouts"],
      })
      void queryClient.invalidateQueries({
        queryKey: ["admin-finance-payout-details", selectedRestaurantId],
      })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Reconcile failed.")
    },
  })

  const data = payoutsQuery.data
  const rows = data?.items ?? []

  const exportCsv = () => {
    downloadCsv("finance-payouts.csv", [
      [
        "restaurant",
        "owner",
        "eligibility",
        "available",
        "pending",
        "paid_out",
        "carry_forward",
        "requested",
        "processing",
        "payout_method",
      ],
      ...rows.map((row) => [
        row.restaurant.name,
        row.owner.fullName,
        row.eligibility.status,
        row.finance.availableBalance,
        row.finance.pendingBalance,
        row.finance.paidOutBalance,
        row.finance.carryForwardBalance,
        row.finance.payoutRequestedAmount,
        row.finance.payoutProcessingAmount,
        row.payoutMethod?.type ?? "",
      ]),
    ])
  }

  const exportPdf = () => {
    const printed = printReport(
      "Finance Payouts",
      `
        <div class="grid">
          <div class="metric"><span class="muted">Available</span><strong>${escapeHtml(formatCurrency(data?.summary.availableBalance ?? 0))}</strong></div>
          <div class="metric"><span class="muted">Pending settlement</span><strong>${escapeHtml(formatCurrency(data?.summary.pendingBalance ?? 0))}</strong></div>
          <div class="metric"><span class="muted">Requested</span><strong>${escapeHtml(formatCurrency(data?.summary.payoutRequestedAmount ?? 0))}</strong></div>
          <div class="metric"><span class="muted">Eligible restaurants</span><strong>${escapeHtml(data?.summary.eligibleRestaurants ?? 0)}</strong></div>
        </div>
        <table>
          <thead><tr><th>Restaurant</th><th>Owner</th><th>Status</th><th>Available</th><th>Pending</th><th>Requested</th></tr></thead>
          <tbody>
            ${rows
              .map(
                (row) =>
                  `<tr><td>${escapeHtml(row.restaurant.name)}</td><td>${escapeHtml(row.owner.fullName)}</td><td>${escapeHtml(eligibilityLabel(row.eligibility.status))}</td><td>${escapeHtml(formatCurrency(row.finance.availableBalance))}</td><td>${escapeHtml(formatCurrency(row.finance.pendingBalance))}</td><td>${escapeHtml(formatCurrency(row.finance.payoutRequestedAmount))}</td></tr>`
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
            <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <WalletCards className="size-5" />
            </span>
            Payouts
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Restaurant payable balance, payout readiness, active requests, and
            settlement status.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={exportCsv}
            disabled={!rows.length}
          >
            <Download className="size-4" />
            CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={exportPdf}
            disabled={!rows.length}
          >
            <Printer className="size-4" />
            PDF
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void payoutsQuery.refetch()}
            disabled={payoutsQuery.isFetching}
          >
            {payoutsQuery.isFetching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCcw className="size-4" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Available payout"
          value={formatCurrency(data?.summary.availableBalance ?? 0)}
          helper="Available ledger balance"
        />
        <StatCard
          label="Pending settlement"
          value={formatCurrency(data?.summary.pendingBalance ?? 0)}
          helper={`${data?.settings.settlementDelayDays ?? 0} day settlement delay`}
        />
        <StatCard
          label="Active requests"
          value={formatCurrency(
            (data?.summary.payoutRequestedAmount ?? 0) +
              (data?.summary.payoutProcessingAmount ?? 0)
          )}
          helper="Pending and processing payouts"
        />
        <StatCard
          label="Completed payouts"
          value={formatCurrency(data?.summary.payoutCompletedAmount ?? 0)}
          helper="Lifetime completed batches"
        />
        <StatCard
          label="Eligible restaurants"
          value={`${data?.summary.eligibleRestaurants ?? 0}`}
          helper={
            data?.settings.minimumPayoutAmountEnabled === false ||
            (data?.settings.minimumPayoutAmountTaka ?? 0) <= 0
              ? "No minimum payout"
              : `Minimum ${formatCurrency(data?.settings.minimumPayoutAmountTaka ?? 0)}`
          }
        />
      </div>

      {approvalsQuery.data?.items.length ? (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <WalletCards className="size-4 text-amber-700" />
              Payout number approvals
              <Badge className="border-amber-200 bg-white text-amber-700" variant="outline">
                {approvalsQuery.data.items.length}
              </Badge>
            </CardTitle>
            <CardDescription>
              OTP verified bKash numbers waiting for admin approval before becoming active.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {approvalsQuery.data.items.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="grid gap-3 rounded-xl border bg-background p-3 md:grid-cols-[1.2fr_1fr_auto]"
              >
                <div>
                  <p className="font-medium">{item.restaurant.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.owner.fullName || "Owner"} - {item.owner.phone || "No phone"}
                  </p>
                </div>
                <div className="text-sm">
                  <p>
                    <span className="text-muted-foreground">Current:</span>{" "}
                    {item.current.accountNumber || "Not active"}
                  </p>
                  <p className="font-medium text-amber-700">
                    New: {item.pending.accountNumber}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    OTP verified {formatDate(item.pending.verifiedAt)}
                  </p>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setApprovalNote("")
                      setApprovalTarget({ item, decision: "rejected" })
                    }}
                  >
                    <XCircle className="size-4" />
                    Reject
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setApprovalNote("")
                      setApprovalTarget({ item, decision: "approved" })
                    }}
                  >
                    <CheckCircle2 className="size-4" />
                    Approve
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="grid gap-3 pt-2 md:grid-cols-[minmax(260px,1fr)_180px_180px_190px_120px]">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search restaurant, city, phone"
              className="pl-9"
            />
          </div>
          <Select
            value={eligibility}
            onValueChange={(value) =>
              setEligibility(value as PayoutEligibilityFilter)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Eligibility" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="eligible">Eligible</SelectItem>
              <SelectItem value="pending_request">Payout pending</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
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
          <Select
            value={sortBy}
            onValueChange={(value) => setSortBy(value as PayoutSort)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="available_desc">Highest available</SelectItem>
              <SelectItem value="pending_desc">Highest pending</SelectItem>
              <SelectItem value="recent_request">Recent request</SelectItem>
              <SelectItem value="name_asc">Name A-Z</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => setPageSize(Number(value))}
          >
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
          <CardTitle className="text-base">Restaurant payout queue</CardTitle>
          <CardDescription>
            Unpaid carry-forward remainders are included in available payout but
            excluded from net earnings, so admin and owner balances stay aligned.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {payoutsQuery.isLoading ? (
            <div className="grid min-h-[280px] place-items-center text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Loading payout data...
              </span>
            </div>
          ) : rows.length ? (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Restaurant</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Eligibility</TableHead>
                      <TableHead className="text-right">Available</TableHead>
                      <TableHead className="text-right">Pending</TableHead>
                      <TableHead className="text-right">
                        Active request
                      </TableHead>
                      <TableHead className="w-[64px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.restaurant.id}>
                        <TableCell>
                          <div className="font-medium">
                            {row.restaurant.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {row.restaurant.city}
                          </div>
                          {row.restaurant.serviceArea?.zoneName ? (
                            <Badge variant="outline" className="mt-1 border-violet-200 bg-violet-50 text-violet-700">
                              {row.restaurant.serviceArea.zoneName}
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <div>{row.owner.fullName}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.owner.phone || "No phone"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={eligibilityBadgeClass(
                              row.eligibility.status
                            )}
                          >
                            {eligibilityLabel(row.eligibility.status)}
                          </Badge>
                          {row.eligibility.reasons[0] ? (
                            <div className="mt-1 max-w-[260px] truncate text-xs text-muted-foreground">
                              {row.eligibility.reasons[0]}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(row.finance.availableBalance)}
                          {row.finance.carryForwardAvailableBalance > 0 ? (
                            <div className="mt-1 text-xs font-medium text-fuchsia-700">
                              Includes {formatCurrency(row.finance.carryForwardAvailableBalance)} carry-forward
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(row.finance.pendingBalance)}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.activePayout ? (
                            <div className="space-y-1">
                              <Badge
                                variant="outline"
                                className={statusBadgeClass(
                                  row.activePayout.status
                                )}
                              >
                                {row.activePayout.status}
                              </Badge>
                              <div className="text-xs text-muted-foreground">
                                {formatCurrency(row.activePayout.amount)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">None</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                              >
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => openPayoutDetails(row.restaurant.id)}
                              >
                                <Eye className="size-4" />
                                View details
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  reconcileMutation.mutate(row.restaurant.id)
                                }
                              >
                                <RefreshCcw className="size-4" />
                                Reconcile ledger
                              </DropdownMenuItem>
                              {row.finance.availableBalance > 0 ? (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => setCreateTarget(row)}>
                                    <WalletCards className="size-4" />
                                    Create admin payout
                                  </DropdownMenuItem>
                                </>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((value) => value - 1)}
                  >
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
            <Empty className="min-h-[280px]">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Banknote className="size-4" />
                </EmptyMedia>
                <EmptyTitle>No payout rows found</EmptyTitle>
                <EmptyDescription>
                  Adjust filters or reconcile restaurant finance from details.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      <Sheet
        open={Boolean(selectedRestaurantId)}
        onOpenChange={(open) => !open && closePayoutDetails()}
      >
        <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl! md:max-w-6xl!">
          <SheetHeader>
            <SheetTitle>
              {detailsQuery.data?.restaurant.name ?? "Payout details"}
            </SheetTitle>
            <SheetDescription>
              {detailsQuery.data
                ? `${detailsQuery.data.restaurant.city} - ${eligibilityLabel(detailsQuery.data.eligibility.status)}`
                : "Loading restaurant finance data"}
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="min-h-0 flex-1 px-4 pb-4">
            {detailsQuery.isLoading ? (
              <div className="grid min-h-[420px] place-items-center text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  Loading details...
                </span>
              </div>
            ) : detailsQuery.data ? (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <StatCard
                    label="Available"
                    value={formatCurrency(
                      detailsQuery.data.finance.availableBalance
                    )}
                    helper="Ready for payout"
                  />
                  <StatCard
                    label="Pending"
                    value={formatCurrency(
                      detailsQuery.data.finance.pendingBalance
                    )}
                    helper="Waiting settlement"
                  />
                  <StatCard
                    label="Net earnings"
                    value={formatCurrency(detailsQuery.data.finance.netAmount)}
                    helper="Owner earnings, carry-forward excluded"
                  />
                  <StatCard
                    label="Carry-forward"
                    value={formatCurrency(
                      detailsQuery.data.finance.carryForwardBalance ?? 0
                    )}
                    helper="Unpaid remainder for next payout"
                  />
                </div>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Eligibility</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={eligibilityBadgeClass(
                          detailsQuery.data.eligibility.status
                        )}
                      >
                        {eligibilityLabel(detailsQuery.data.eligibility.status)}
                      </Badge>
                      <Badge variant="outline">
                        {detailsQuery.data.settings.minimumPayoutAmountEnabled === false ||
                        detailsQuery.data.settings.minimumPayoutAmountTaka <= 0
                          ? "No minimum payout"
                          : `Minimum ${formatCurrency(detailsQuery.data.settings.minimumPayoutAmountTaka)}`}
                      </Badge>
                      <Badge variant="outline">
                        Settlement{" "}
                        {detailsQuery.data.settings.settlementDelayDays} days
                      </Badge>
                    </div>
                    {detailsQuery.data.eligibility.reasons.length ? (
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        {detailsQuery.data.eligibility.reasons.map((reason) => (
                          <li key={reason}>- {reason}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Admin can create payout now, or the owner can request it later.
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          reconcileMutation.mutate(
                            detailsQuery.data.restaurant.id
                          )
                        }
                        disabled={reconcileMutation.isPending}
                      >
                        {reconcileMutation.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <RefreshCcw className="size-4" />
                        )}
                        Reconcile
                      </Button>
                      {detailsQuery.data.finance.availableBalance > 0 ? (
                        <Button
                          type="button"
                          onClick={() => setCreateTarget(detailsQuery.data)}
                        >
                          <WalletCards className="size-4" />
                          Create admin payout
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Payout method</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {detailsQuery.data.payoutMethod ? (
                      <div className="grid gap-3 text-sm md:grid-cols-2">
                        <div>
                          <p className="text-muted-foreground">Method</p>
                          <p className="font-medium">
                            {detailsQuery.data.payoutMethod.type}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Account</p>
                          <p className="font-medium">
                            {detailsQuery.data.payoutMethod.accountName ||
                              "N/A"}{" "}
                            {detailsQuery.data.payoutMethod.accountNumber ||
                              detailsQuery.data.payoutMethod.accountNumberMasked}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Bank</p>
                          <p className="font-medium">
                            {detailsQuery.data.payoutMethod.bankName || "N/A"}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Verified</p>
                          <p className="font-medium">
                            {detailsQuery.data.payoutMethod.isVerified
                              ? "Yes"
                              : "No"}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <Empty>
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <XCircle className="size-4" />
                          </EmptyMedia>
                          <EmptyTitle>No payout method</EmptyTitle>
                          <EmptyDescription>
                            The owner must add and verify a payout method.
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                      Recent payout requests
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {detailsQuery.data.recentPayouts.length ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Requested</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">
                                Amount
                              </TableHead>
                              <TableHead>Reference</TableHead>
                              <TableHead className="w-[64px]" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {detailsQuery.data.recentPayouts.map((payout) => (
                              <TableRow key={payout.id}>
                                <TableCell>
                                  {formatDate(payout.requestedAt)}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant="outline"
                                    className={statusBadgeClass(payout.status)}
                                  >
                                    {payout.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {formatCurrency(payout.amount)}
                                </TableCell>
                                <TableCell>
                                  {payout.providerReference ||
                                    payout.providerTransactionId ||
                                    "N/A"}
                                </TableCell>
                                <TableCell>
                                  {payout.status === "completed" ||
                                  payout.status === "failed" ? null : (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon-sm"
                                        >
                                          <MoreHorizontal className="size-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        {payout.status === "pending" ? (
                                          <DropdownMenuItem
                                            onClick={() =>
                                              setStatusTarget({
                                                restaurantId:
                                                  detailsQuery.data.restaurant
                                                    .id,
                                                payout,
                                                status: "processing",
                                              })
                                            }
                                          >
                                            <CheckCircle2 className="size-4" />
                                            Mark processing
                                          </DropdownMenuItem>
                                        ) : null}
                                        <DropdownMenuItem
                                          onClick={() =>
                                            setStatusTarget({
                                              restaurantId:
                                                detailsQuery.data.restaurant.id,
                                              payout,
                                              status: "completed",
                                            })
                                          }
                                        >
                                          <Banknote className="size-4" />
                                          Complete
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          onClick={() =>
                                            setStatusTarget({
                                              restaurantId:
                                                detailsQuery.data.restaurant.id,
                                              payout,
                                              status: "failed",
                                            })
                                          }
                                        >
                                          <XCircle className="size-4" />
                                          Mark failed
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <Empty>
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <FileText className="size-4" />
                          </EmptyMedia>
                          <EmptyTitle>No payout requests</EmptyTitle>
                          <EmptyDescription>
                            No payout request has been created yet.
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    )}
                  </CardContent>
                </Card>

                <PayoutLedgerEntriesCard details={detailsQuery.data} />
              </div>
            ) : (
              <Empty className="min-h-[420px]">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <XCircle className="size-4" />
                  </EmptyMedia>
                  <EmptyTitle>Details unavailable</EmptyTitle>
                  <EmptyDescription>
                    Try reopening the payout row.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <PayoutStatusDialog
        target={statusTarget}
        onOpenChange={(open) => !open && setStatusTarget(null)}
      />
      <CreateAdminPayoutDialog
        target={createTarget}
        onOpenChange={(open) => !open && setCreateTarget(null)}
      />
      <Dialog
        open={Boolean(approvalTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setApprovalTarget(null)
            setApprovalNote("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {approvalTarget?.decision === "approved"
                ? "Approve payout number"
                : "Reject payout number"}
            </DialogTitle>
            <DialogDescription>
              {approvalTarget
                ? `${approvalTarget.item.restaurant.name} requested ${approvalTarget.item.pending.accountNumber}.`
                : "Review the payout number change request."}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Current number</span>
              <span className="font-medium">
                {approvalTarget?.item.current.accountNumber || "Not active"}
              </span>
            </div>
            <div className="mt-1 flex justify-between gap-3">
              <span className="text-muted-foreground">New number</span>
              <span className="font-medium">
                {approvalTarget?.item.pending.accountNumber || "N/A"}
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="payout-method-review-note">
              {approvalTarget?.decision === "rejected"
                ? "Rejection reason"
                : "Admin note"}
            </Label>
            <Textarea
              id="payout-method-review-note"
              value={approvalNote}
              onChange={(event) => setApprovalNote(event.target.value)}
              placeholder={
                approvalTarget?.decision === "rejected"
                  ? "Tell owner what needs to be fixed"
                  : "Optional approval note"
              }
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setApprovalTarget(null)
                setApprovalNote("")
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant={approvalTarget?.decision === "rejected" ? "destructive" : "default"}
              disabled={
                approvalMutation.isPending ||
                (approvalTarget?.decision === "rejected" && !approvalNote.trim())
              }
              onClick={() => approvalMutation.mutate()}
            >
              {approvalMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : approvalTarget?.decision === "rejected" ? (
                <XCircle className="size-4" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
