import { format } from "date-fns"
import { Download, ReceiptText, X } from "lucide-react"

import type { AdminFinancePayoutStatement } from "@/lib/admin-api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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

function formatCurrency(value: number) {
  return `${Math.round(Number(value) || 0).toLocaleString("en-BD")}tk`
}

function formatDate(value?: string | null) {
  if (!value) return "N/A"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "N/A"
  return format(date, "dd MMM yyyy, hh:mm a")
}

function settlementBadgeClass(status: string) {
  if (status === "paid_out") return "border-slate-200 bg-slate-100 text-slate-700"
  if (status === "available") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  return "border-amber-200 bg-amber-50 text-amber-700"
}

export function PayoutStatementDrawer({
  statement,
  open,
  onOpenChange,
  onPrint,
}: {
  statement: AdminFinancePayoutStatement | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onPrint?: (statement: AdminFinancePayoutStatement) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl! md:max-w-6xl!">
        <SheetHeader className="border-b">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <ReceiptText className="size-4 text-muted-foreground" />
                Payout transaction breakdown
              </SheetTitle>
              <SheetDescription>
                {statement
                  ? `${statement.restaurant.name} - ${formatDate(statement.generatedAt)}`
                  : "Loading payout statement"}
              </SheetDescription>
            </div>
            <div className="flex items-center gap-2">
              {statement && onPrint ? (
                <Button type="button" variant="outline" size="sm" onClick={() => onPrint(statement)}>
                  <Download className="size-4" />
                  Save PDF
                </Button>
              ) : null}
              <Button type="button" variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
                <X className="size-4" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
          </div>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {!statement ? (
            <div className="grid min-h-[360px] place-items-center text-sm text-muted-foreground">
              Loading statement...
            </div>
          ) : (
            <>
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-2xl font-semibold leading-tight">
                        {formatCurrency(statement.amount)}
                      </p>
                      {statement.payout ? (
                        <Badge variant="outline">{statement.payout.status}</Badge>
                      ) : (
                        <Badge variant="outline">Preview</Badge>
                      )}
                    </div>
                    <div className="mt-2 grid gap-x-5 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <span className="font-medium text-foreground">Owner:</span>{" "}
                        {statement.owner.fullName || "N/A"}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Phone:</span>{" "}
                        {statement.owner.phone || "N/A"}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Method:</span>{" "}
                        {statement.payoutMethod?.type || "N/A"}
                      </div>
                      <div className="truncate">
                        <span className="font-medium text-foreground">Checksum:</span>{" "}
                        <span className="font-mono">{statement.statementChecksum.slice(0, 16)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-5">
                <SummaryTile label="Entries" value={`${statement.summary.entryCount}`} />
                <SummaryTile label="Food sales" value={formatCurrency(statement.summary.grossAmount)} />
                <SummaryTile label="Commission" value={`-${formatCurrency(statement.summary.commission)}`} tone="danger" />
                <SummaryTile label="Owner discount" value={`-${formatCurrency(statement.summary.discountCost)}`} tone="warn" />
                <SummaryTile label="Owner earning" value={formatCurrency(statement.summary.netAmount)} tone="success" />
              </div>

              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">Commission</TableHead>
                      <TableHead className="text-right">Discount</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {statement.entries.length ? (
                      statement.entries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell>
                            <div className="font-medium">{entry.orderNumber || entry.sourceLabel}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatDate(entry.deliveredAt || entry.createdAt)}
                            </div>
                          </TableCell>
                          <TableCell>{entry.sourceLabel || entry.entryType}</TableCell>
                          <TableCell>{entry.paymentMethod || "N/A"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={settlementBadgeClass(entry.settlementStatus)}>
                              {entry.settlementStatus}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(entry.grossAmount)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(entry.commission)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(entry.discountCost)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(entry.netAmount)}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                          No included transaction rows found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <LedgerMiniTable title="Payout movement" rows={statement.payoutEntries} />
                <LedgerMiniTable title="Carry-forward residual" rows={statement.residualEntries} fallbackAmount={statement.summary.residualAmount} />
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function SummaryTile({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: string
  tone?: "default" | "success" | "danger" | "warn"
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-700"
      : tone === "danger"
        ? "text-rose-700"
        : tone === "warn"
          ? "text-amber-700"
          : ""
  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 font-semibold ${toneClass}`}>{value}</div>
    </div>
  )
}

function LedgerMiniTable({
  title,
  rows,
  fallbackAmount,
}: {
  title: string
  rows: AdminFinancePayoutStatement["payoutEntries"]
  fallbackAmount?: number
}) {
  return (
    <div className="rounded-xl border">
      <div className="border-b px-3 py-2 text-sm font-medium">{title}</div>
      <Table>
        <TableBody>
          {rows.length ? (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="font-medium">{row.sourceLabel || row.entryType}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(row.createdAt)}</div>
                </TableCell>
                <TableCell className="text-right font-medium">{formatCurrency(row.netAmount)}</TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell className="py-5 text-sm text-muted-foreground">
                {fallbackAmount && fallbackAmount > 0
                  ? `${formatCurrency(fallbackAmount)} will carry forward.`
                  : "No rows."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
