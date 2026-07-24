import { format } from "date-fns"
import { AlertTriangle, CreditCard, LoaderCircle, Printer, ReceiptText, WalletCards, X } from "lucide-react"

import {
  type EarningTransaction,
  formatPayoutMoney,
  getPayoutStatusLabel,
  getTransactionTypeLabel,
  type Payout,
} from "@/components/payouts/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
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

function getStatusBadge(status: Payout["status"]) {
  if (status === "completed") {
    return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Completed</Badge>
  }
  if (status === "processing") {
    return <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">Processing</Badge>
  }
  if (status === "pending") {
    return <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Pending</Badge>
  }
  return <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">Failed</Badge>
}

function getTransactionBadge(type: EarningTransaction["type"]) {
  if (type === "earning") {
    return <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Earning</Badge>
  }
  if (type === "payout") {
    return <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">Payout</Badge>
  }
  return <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">Refund</Badge>
}

function getSettlementBadge(status: EarningTransaction["status"]) {
  if (status === "paid_out") {
    return <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-700">Paid Out</Badge>
  }
  if (status === "available") {
    return <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Available</Badge>
  }
  return <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Pending</Badge>
}

function formatOptionalDate(value?: string | null) {
  if (!value) return "--"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "--"
  return format(date, "dd MMM yyyy, hh:mm a")
}

function summarizeTransactions(transactions: EarningTransaction[]) {
  return transactions.reduce(
    (totals, transaction) => ({
      grossAmount: totals.grossAmount + transaction.grossAmount,
      commission: totals.commission + transaction.commission,
      discountCost: totals.discountCost + transaction.discountCost,
      deliveryCost: totals.deliveryCost + transaction.deliveryCost,
      netAmount: totals.netAmount + transaction.netAmount,
    }),
    {
      grossAmount: 0,
      commission: 0,
      discountCost: 0,
      deliveryCost: 0,
      netAmount: 0,
    }
  )
}

export function PayoutDetailsDrawer({
  payout,
  open,
  onOpenChange,
  onPrintStatement,
  transactions = [],
  isTransactionsLoading = false,
}: {
  payout: Payout | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onPrintStatement?: (payout: Payout, transactions: EarningTransaction[]) => void
  transactions?: EarningTransaction[]
  isTransactionsLoading?: boolean
}) {
  if (!payout) return null

  const orderTransactions = transactions.filter(
    (transaction) => transaction.type !== "payout"
  )
  const payoutMovements = transactions.filter(
    (transaction) => transaction.type === "payout"
  )
  const totals = summarizeTransactions(orderTransactions)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full max-w-none! gap-0 overflow-hidden p-0 sm:max-w-2xl! md:max-w-4xl!"
      >
        <SheetHeader className="sticky top-0 z-10 border-b bg-popover px-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <ReceiptText className="size-4 text-muted-foreground" />
                Payout Details
              </SheetTitle>
              <SheetDescription>
                {payout.id} • {format(new Date(payout.createdAt), "dd MMM yyyy, hh:mm a")}
              </SheetDescription>
            </div>
            <div className="flex items-center gap-2">
              {onPrintStatement ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isTransactionsLoading}
                  onClick={() => onPrintStatement(payout, transactions)}
                >
                  {isTransactionsLoading ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Printer className="size-4" />
                  )}
                  Save PDF
                </Button>
              ) : null}
              <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
                <X className="size-4" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-2xl font-semibold leading-tight">
                    {formatPayoutMoney(payout.amount)}
                  </p>
                  {getStatusBadge(payout.status)}
                  <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {payout.method === "bank" ? <CreditCard className="size-3" /> : <WalletCards className="size-3" />}
                    {payout.method === "bank" ? "Bank" : "bKash"}
                  </span>
                </div>
                <div className="mt-2 grid gap-x-5 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <span className="font-medium text-foreground">Requested:</span>{" "}
                    {format(new Date(payout.createdAt), "dd MMM yyyy, hh:mm a")}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Processed:</span>{" "}
                    {payout.processedAt
                      ? format(new Date(payout.processedAt), "dd MMM yyyy, hh:mm a")
                      : getPayoutStatusLabel(payout.status)}
                  </div>
                  <div className="truncate">
                    <span className="font-medium text-foreground">Transaction:</span>{" "}
                    <span className="font-mono">{payout.transactionId || "--"}</span>
                  </div>
                  <div className="truncate">
                    <span className="font-medium text-foreground">Batch:</span>{" "}
                    <span className="font-mono">{payout.batchReference || "--"}</span>
                  </div>
                  {payout.providerReference ? (
                    <div className="truncate">
                      <span className="font-medium text-foreground">Provider ref:</span>{" "}
                      <span className="font-mono">{payout.providerReference}</span>
                    </div>
                  ) : null}
                  {payout.providerPayoutId ? (
                    <div className="truncate">
                      <span className="font-medium text-foreground">Provider payout:</span>{" "}
                      <span className="font-mono">{payout.providerPayoutId}</span>
                    </div>
                  ) : null}
                  {payout.paymentProofUrl ? (
                    <a
                      href={payout.paymentProofUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Payment proof
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
            {payout.failureReason ? (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2 text-xs text-rose-800">
                <div className="mb-1 flex items-center gap-2 font-medium">
                  <AlertTriangle className="size-3.5" />
                  Failure reason
                </div>
                {payout.failureReason}
              </div>
            ) : null}
          </div>

          <Card className="rounded-2xl shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Included order transactions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-5">
                <div className="rounded-xl border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Orders</div>
                  <div className="mt-1 text-lg font-semibold">{orderTransactions.length}</div>
                </div>
                <div className="rounded-xl border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Food sales</div>
                  <div className="mt-1 font-semibold">{formatPayoutMoney(totals.grossAmount)}</div>
                </div>
                <div className="rounded-xl border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Commission</div>
                  <div className="mt-1 font-semibold text-rose-700">-{formatPayoutMoney(totals.commission)}</div>
                </div>
                <div className="rounded-xl border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Owner discount</div>
                  <div className="mt-1 font-semibold text-amber-700">-{formatPayoutMoney(totals.discountCost)}</div>
                </div>
                <div className="rounded-xl border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Owner earning</div>
                  <div className="mt-1 font-semibold text-emerald-700">{formatPayoutMoney(totals.netAmount)}</div>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Delivered</TableHead>
                      <TableHead className="text-right">Food sales</TableHead>
                      <TableHead className="text-right">Commission</TableHead>
                      <TableHead className="text-right">Discount</TableHead>
                      <TableHead className="text-right">Delivery</TableHead>
                      <TableHead className="text-right">Owner earning</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isTransactionsLoading ? (
                      Array.from({ length: 3 }).map((_, index) => (
                        <TableRow key={index}>
                          <TableCell colSpan={9}>
                            <Skeleton className="h-8 w-full" />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : orderTransactions.length ? (
                      orderTransactions.map((transaction) => (
                        <TableRow key={transaction.id}>
                          <TableCell>
                            <div className="font-medium">{transaction.orderNumber}</div>
                            {transaction.orderStatus ? (
                              <div className="text-xs text-muted-foreground">{transaction.orderStatus}</div>
                            ) : null}
                          </TableCell>
                          <TableCell>{getTransactionBadge(transaction.type)}</TableCell>
                          <TableCell>
                            <div className="text-sm">{transaction.paymentMethod || "--"}</div>
                            {transaction.paymentStatus ? (
                              <div className="text-xs text-muted-foreground">{transaction.paymentStatus}</div>
                            ) : null}
                          </TableCell>
                          <TableCell>{formatOptionalDate(transaction.deliveredAt)}</TableCell>
                          <TableCell className="text-right">{formatPayoutMoney(transaction.grossAmount)}</TableCell>
                          <TableCell className="text-right text-rose-700">-{formatPayoutMoney(transaction.commission)}</TableCell>
                          <TableCell className="text-right text-amber-700">-{formatPayoutMoney(transaction.discountCost)}</TableCell>
                          <TableCell className="text-right">{formatPayoutMoney(transaction.deliveryCost)}</TableCell>
                          <TableCell className="text-right font-semibold text-emerald-700">{formatPayoutMoney(transaction.netAmount)}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={9} className="h-24 text-center text-sm text-muted-foreground">
                          No included order transaction rows were found for this payout.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Payout ledger movement</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ledger row</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Settlement</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Net movement</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isTransactionsLoading ? (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <Skeleton className="h-8 w-full" />
                        </TableCell>
                      </TableRow>
                    ) : payoutMovements.length ? (
                      payoutMovements.map((transaction) => (
                        <TableRow key={transaction.id}>
                          <TableCell className="font-mono text-xs">{transaction.id}</TableCell>
                          <TableCell>{getTransactionTypeLabel(transaction.type)}</TableCell>
                          <TableCell>{getSettlementBadge(transaction.status)}</TableCell>
                          <TableCell>{formatOptionalDate(transaction.createdAt)}</TableCell>
                          <TableCell className="text-right font-semibold">{formatPayoutMoney(transaction.netAmount)}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="h-20 text-center text-sm text-muted-foreground">
                          No payout debit row was returned for this statement.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  )
}
