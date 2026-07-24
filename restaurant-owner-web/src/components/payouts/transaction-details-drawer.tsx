import * as React from "react"

import { format } from "date-fns"
import { CalendarClock, ReceiptText, Wallet, X } from "lucide-react"

import {
  formatPayoutMoney,
  getTransactionTypeLabel,
  type EarningTransaction,
} from "@/components/payouts/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

function getSettlementBadge(status: EarningTransaction["status"]) {
  if (status === "available") {
    return <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Available</Badge>
  }
  if (status === "paid_out") {
    return <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-700">Paid Out</Badge>
  }
  return <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Pending</Badge>
}

export function TransactionDetailsDrawer({
  transaction,
  open,
  onOpenChange,
}: {
  transaction: EarningTransaction | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [now, setNow] = React.useState(() => Date.now())

  React.useEffect(() => {
    if (open) {
      setNow(Date.now())
    }
  }, [open, transaction?.id])

  if (!transaction) return null

  const settlementDeltaDays = Math.max(
    0,
    Math.ceil(
      (new Date(transaction.settlementAvailableAt).getTime() - now) /
        (1000 * 60 * 60 * 24)
    )
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full max-w-none! gap-0 overflow-hidden p-0 sm:max-w-2xl! md:max-w-3xl!"
      >
        <SheetHeader className="sticky top-0 z-10 border-b bg-popover px-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <ReceiptText className="size-4 text-muted-foreground" />
                Transaction Details
              </SheetTitle>
              <SheetDescription>
                {transaction.orderNumber} • {getTransactionTypeLabel(transaction.type)}
              </SheetDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={`text-2xl font-semibold leading-tight ${transaction.netAmount >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    {transaction.netAmount >= 0 ? "+" : ""}
                    {formatPayoutMoney(transaction.netAmount)}
                  </p>
                  {getSettlementBadge(transaction.status)}
                </div>
                <div className="mt-2 grid gap-x-5 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <div>
                    <span className="font-medium text-foreground">Order:</span>{" "}
                    {transaction.orderNumber}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Type:</span>{" "}
                    {getTransactionTypeLabel(transaction.type)}
                  </div>
                  <div className="truncate">
                    <span className="font-medium text-foreground">Order ID:</span>{" "}
                    <span className="font-mono">{transaction.orderId}</span>
                  </div>
                  {transaction.payoutId ? (
                    <div className="truncate">
                      <span className="font-medium text-foreground">Payout:</span>{" "}
                      <span className="font-mono">{transaction.payoutId}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="rounded-xl shadow-none">
              <CardHeader className="p-3 pb-1"><CardTitle className="text-sm">Food Sales</CardTitle></CardHeader>
              <CardContent className="p-3 pt-1"><p className="font-semibold">{formatPayoutMoney(transaction.grossAmount)}</p></CardContent>
            </Card>
            <Card className="rounded-xl shadow-none">
              <CardHeader className="p-3 pb-1"><CardTitle className="text-sm">Commission</CardTitle></CardHeader>
              <CardContent className="p-3 pt-1"><p className="font-semibold text-rose-700">-{formatPayoutMoney(transaction.commission)}</p></CardContent>
            </Card>
            <Card className="rounded-xl shadow-none">
              <CardHeader className="p-3 pb-1"><CardTitle className="text-sm">Owner Discount</CardTitle></CardHeader>
              <CardContent className="p-3 pt-1"><p className="font-semibold text-amber-700">-{formatPayoutMoney(transaction.discountCost)}</p></CardContent>
            </Card>
            <Card className="rounded-xl shadow-none">
              <CardHeader className="p-3 pb-1"><CardTitle className="text-sm">Type</CardTitle></CardHeader>
              <CardContent className="p-3 pt-1">
                <div className="inline-flex items-center gap-2 text-sm font-medium">
                  <Wallet className="size-4" />
                  {getTransactionTypeLabel(transaction.type)}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-xl shadow-none">
            <CardHeader className="p-4 pb-2"><CardTitle className="text-base">Settlement Eligibility</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <CalendarClock className="size-4" />
                Created {format(new Date(transaction.createdAt), "dd MMM yyyy, hh:mm a")}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <CalendarClock className="size-4" />
                Available on {format(new Date(transaction.settlementAvailableAt), "dd MMM yyyy, hh:mm a")}
              </div>
              <div className="rounded-xl border bg-muted/30 px-4 py-3 text-muted-foreground">
                {transaction.status === "pending"
                  ? settlementDeltaDays > 0
                    ? `This earning should move to available balance in approximately ${settlementDeltaDays} day${settlementDeltaDays === 1 ? "" : "s"}.`
                    : "This earning is waiting for settlement processing."
                  : transaction.status === "available"
                    ? "This earning is ready to be included in the next payout."
                    : "This transaction has already been included in a payout or adjusted out of the wallet."}
              </div>
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  )
}
