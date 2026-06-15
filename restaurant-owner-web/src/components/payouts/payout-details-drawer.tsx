import { format } from "date-fns"
import { AlertTriangle, CreditCard, Printer, ReceiptText, WalletCards, X } from "lucide-react"

import {
  formatPayoutMoney,
  getPayoutStatusLabel,
  type Payout,
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

export function PayoutDetailsDrawer({
  payout,
  open,
  onOpenChange,
  onPrintStatement,
}: {
  payout: Payout | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onPrintStatement?: (payout: Payout) => void
}) {
  if (!payout) return null

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
                Payout Details
              </SheetTitle>
              <SheetDescription>
                {payout.id} • {format(new Date(payout.createdAt), "dd MMM yyyy, hh:mm a")}
              </SheetDescription>
            </div>
            <div className="flex items-center gap-2">
              {onPrintStatement ? (
                <Button variant="outline" size="sm" onClick={() => onPrintStatement(payout)}>
                  <Printer className="size-4" />
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

        <div className="space-y-6 px-6 py-6">
          <div className="rounded-2xl border bg-muted/20 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Payout statement
                </p>
                <p className="mt-2 text-3xl font-semibold">
                  {formatPayoutMoney(payout.amount)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Requested {format(new Date(payout.createdAt), "dd MMM yyyy, hh:mm a")}
                </p>
              </div>
              <div>{getStatusBadge(payout.status)}</div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="rounded-2xl shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Amount</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{formatPayoutMoney(payout.amount)}</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Status</CardTitle>
              </CardHeader>
              <CardContent>{getStatusBadge(payout.status)}</CardContent>
            </Card>
            <Card className="rounded-2xl shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Transaction ID</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-sm text-muted-foreground">{payout.transactionId}</p>
              </CardContent>
            </Card>
            {payout.providerReference ? (
              <Card className="rounded-2xl shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">Provider Reference</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-mono text-sm text-muted-foreground">{payout.providerReference}</p>
                </CardContent>
              </Card>
            ) : null}
            {payout.providerPayoutId ? (
              <Card className="rounded-2xl shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">Provider Payout ID</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-mono text-sm text-muted-foreground">{payout.providerPayoutId}</p>
                </CardContent>
              </Card>
            ) : null}
            <Card className="rounded-2xl shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Method</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="inline-flex items-center gap-2 text-sm font-medium">
                  {payout.method === "bank" ? <CreditCard className="size-4" /> : <WalletCards className="size-4" />}
                  {payout.method === "bank" ? "Bank" : "bKash"}
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-2xl shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Requested At</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{format(new Date(payout.createdAt), "dd MMM yyyy, hh:mm a")}</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Processed At</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">
                  {payout.processedAt
                    ? format(new Date(payout.processedAt), "dd MMM yyyy, hh:mm a")
                    : getPayoutStatusLabel(payout.status)}
                </p>
              </CardContent>
            </Card>
            {payout.paymentProofUrl ? (
              <Card className="rounded-2xl shadow-none md:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">Payment Proof</CardTitle>
                </CardHeader>
                <CardContent>
                  <a
                    href={payout.paymentProofUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {payout.paymentProofUrl}
                  </a>
                </CardContent>
              </Card>
            ) : null}
            {payout.failureReason ? (
              <Card className="rounded-2xl shadow-none md:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">Failure Reason</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-sm text-rose-800">
                    <div className="mb-2 flex items-center gap-2 font-medium">
                      <AlertTriangle className="size-4" />
                      Action required
                    </div>
                    {payout.failureReason}
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
