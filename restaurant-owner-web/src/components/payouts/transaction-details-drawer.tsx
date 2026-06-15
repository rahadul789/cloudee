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
        className="w-full max-w-none! p-0 sm:max-w-2xl! md:max-w-3xl!"
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

        <div className="space-y-6 px-6 py-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="rounded-2xl shadow-none">
              <CardHeader><CardTitle className="text-base">Order Reference</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="font-medium">{transaction.orderNumber}</div>
                <div className="text-muted-foreground">{transaction.orderId}</div>
              </CardContent>
            </Card>
            <Card className="rounded-2xl shadow-none">
              <CardHeader><CardTitle className="text-base">Settlement Status</CardTitle></CardHeader>
              <CardContent>{getSettlementBadge(transaction.status)}</CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="rounded-2xl shadow-none">
              <CardHeader><CardTitle className="text-base">Food Sales</CardTitle></CardHeader>
              <CardContent><p className="text-lg font-semibold">{formatPayoutMoney(transaction.grossAmount)}</p></CardContent>
            </Card>
            <Card className="rounded-2xl shadow-none">
              <CardHeader><CardTitle className="text-base">Owner Earning</CardTitle></CardHeader>
              <CardContent>
                <p className={`text-lg font-semibold ${transaction.netAmount >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  {transaction.netAmount >= 0 ? "+" : ""}
                  {formatPayoutMoney(transaction.netAmount)}
                </p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl shadow-none">
              <CardHeader><CardTitle className="text-base">Commission</CardTitle></CardHeader>
              <CardContent><p className="text-sm">-{formatPayoutMoney(transaction.commission)}</p></CardContent>
            </Card>
            <Card className="rounded-2xl shadow-none">
              <CardHeader><CardTitle className="text-base">Owner Discount</CardTitle></CardHeader>
              <CardContent><p className="text-sm">-{formatPayoutMoney(transaction.discountCost)}</p></CardContent>
            </Card>
            <Card className="rounded-2xl shadow-none">
              <CardHeader><CardTitle className="text-base">Type</CardTitle></CardHeader>
              <CardContent>
                <div className="inline-flex items-center gap-2 text-sm font-medium">
                  <Wallet className="size-4" />
                  {getTransactionTypeLabel(transaction.type)}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-2xl shadow-none">
            <CardHeader><CardTitle className="text-base">Settlement Eligibility</CardTitle></CardHeader>
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
