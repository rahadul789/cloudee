import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  Banknote,
  BookOpenText,
  Download,
  Landmark,
  Loader2,
  ReceiptText,
  RefreshCcw,
  ShieldAlert,
  TrendingUp,
  WalletCards,
} from "lucide-react"
import { toast } from "sonner"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import {
  closeAdminDailyFinance,
  createAdminPlatformWalletEntry,
  getAdminPlatformFinance,
  updateAdminOrderCodCollection,
  type AdminPlatformFinanceResponse,
  type AdminReportsPreset,
} from "@/lib/admin-api"
import { downloadCsv } from "@/lib/export-utils"
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
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

function formatCurrency(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0
  const sign = safeValue < 0 ? "-" : ""
  return `${sign}Tk ${Math.round(Math.abs(safeValue)).toLocaleString()}`
}

function formatNumber(value: number) {
  return Math.round(Number.isFinite(value) ? value : 0).toLocaleString()
}

function formatDate(value?: string | null) {
  if (!value) return "N/A"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "N/A"
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date)
}

function formatWalletCategory(value: string) {
  if (value === "deploy_hosting") return "Deploy / hosting"
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function healthBadgeClass(health: AdminPlatformFinanceResponse["health"]) {
  if (health === "healthy") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (health === "watch") return "border-amber-200 bg-amber-50 text-amber-700"
  return "border-rose-200 bg-rose-50 text-rose-700"
}

function healthLabel(health: AdminPlatformFinanceResponse["health"]) {
  if (health === "healthy") return "Healthy"
  if (health === "watch") return "Needs watch"
  return "Cash risk"
}

function alertClass(type: string) {
  if (type === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900"
  if (type === "danger") return "border-rose-200 bg-rose-50 text-rose-900"
  if (type === "warning") return "border-amber-200 bg-amber-50 text-amber-900"
  return "border-sky-200 bg-sky-50 text-sky-900"
}

function alertIconClass(type: string) {
  if (type === "success") return "bg-emerald-100 text-emerald-700"
  if (type === "danger") return "bg-rose-100 text-rose-700"
  if (type === "warning") return "bg-amber-100 text-amber-700"
  return "bg-sky-100 text-sky-700"
}

function MetricCard({
  label,
  value,
  helper,
  icon,
  tone = "slate",
  badge,
}: {
  label: string
  value: React.ReactNode
  helper: string
  icon: React.ReactNode
  tone?: "emerald" | "sky" | "amber" | "rose" | "violet" | "slate"
  badge?: React.ReactNode
}) {
  const toneClass =
    tone === "emerald"
      ? "bg-emerald-100 text-emerald-700"
      : tone === "sky"
        ? "bg-sky-100 text-sky-700"
        : tone === "amber"
          ? "bg-amber-100 text-amber-700"
          : tone === "rose"
            ? "bg-rose-100 text-rose-700"
            : tone === "violet"
              ? "bg-violet-100 text-violet-700"
              : "bg-slate-100 text-slate-700"

  return (
    <Card>
      <CardContent className="pt-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 truncate text-2xl font-semibold">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
          </div>
          <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>
            {icon}
          </span>
        </div>
        {badge ? <div className="mt-3">{badge}</div> : null}
      </CardContent>
    </Card>
  )
}

function AmountRow({
  label,
  value,
  helper,
  valueClassName,
}: {
  label: string
  value: number
  helper?: string
  valueClassName?: string
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border bg-background px-3 py-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
      </div>
      <p className={`whitespace-nowrap text-sm font-semibold ${valueClassName ?? ""}`}>
        {formatCurrency(value)}
      </p>
    </div>
  )
}

function exportPlatformFinance(data?: AdminPlatformFinanceResponse) {
  if (!data) return
  downloadCsv("platform-finance.csv", [
    ["section", "metric", "value"],
    ["timeframe", "start", data.timeframe.start],
    ["timeframe", "end", data.timeframe.end],
    ["revenue", "platform_commission", data.revenue.platformCommission],
    ["revenue", "delivery_fee_revenue", data.revenue.deliveryFeeRevenue],
    ["revenue", "platform_gross_revenue", data.revenue.platformGrossRevenue],
    ["expense", "platform_voucher_cost", data.expenses.platformVoucherCost],
    ["expense", "rider_payroll_expense", data.expenses.riderPayrollExpense],
    ["expense", "manual_expense", data.expenses.manualExpense],
    ["profit_loss", "net_profit", data.profitLoss.netProfit],
    ["cash", "cash_in", data.cash.cashIn],
    ["cash", "cash_out", data.cash.cashOut],
    ["cash", "wallet_net_adjustment", data.cash.walletNetAdjustment],
    ["cash", "estimated_platform_cash", data.cash.estimatedPlatformCash],
    ["liability", "total_liabilities", data.liabilities.totalLiabilities],
    ["liability", "net_position_after_liabilities", data.cash.netPositionAfterLiabilities],
    ...data.profitByRestaurant.map((row) => ["restaurant_profit", row.name, row.platformProfit]),
    ...data.riderProfitability.map((row) => ["rider_profitability", row.name, row.contribution]),
    ...data.promotionCosts.map((row) => ["voucher_roi", row.code || row.name, row.roi]),
    ...data.series.map((point) => [
      "series",
      point.date,
      `revenue=${point.revenue};expense=${point.operatingExpense};profit=${point.profit};cashIn=${point.cashIn};cashOut=${point.cashOut}`,
    ]),
  ])
}

function PlatformWalletEntryDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [direction, setDirection] = React.useState<"credit" | "debit">("debit")
  const [category, setCategory] = React.useState<"cod_deposit" | "deploy_hosting" | "manual_expense" | "manual_income" | "adjustment" | "other">("manual_expense")
  const [amount, setAmount] = React.useState("")
  const [occurredAt, setOccurredAt] = React.useState(new Date().toISOString().slice(0, 10))
  const [reference, setReference] = React.useState("")
  const [proofUrl, setProofUrl] = React.useState("")
  const [note, setNote] = React.useState("")

  React.useEffect(() => {
    if (!open) return
    setDirection("debit")
    setCategory("manual_expense")
    setAmount("")
    setOccurredAt(new Date().toISOString().slice(0, 10))
    setReference("")
    setProofUrl("")
    setNote("")
  }, [open])

  React.useEffect(() => {
    if (category === "manual_expense" || category === "deploy_hosting") setDirection("debit")
    if (category === "manual_income" || category === "cod_deposit") setDirection("credit")
  }, [category])

  const mutation = useMutation({
    mutationFn: () =>
      createAdminPlatformWalletEntry({
        direction,
        category,
        amount: Number(amount),
        occurredAt,
        reference,
        proofUrl,
        note,
      }),
    onSuccess: () => {
      toast.success("Platform wallet entry added.")
      void queryClient.invalidateQueries({ queryKey: ["admin-platform-finance"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-money-transactions"] })
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Wallet entry failed.")
    },
  })

  const isInvalid = !Number.isFinite(Number(amount)) || Number(amount) <= 0 || !note.trim()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl lg:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add wallet entry</DialogTitle>
          <DialogDescription>
            Record manual income, expense, deploy/hosting cost, COD deposit, or accounting adjustment.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
          Deploy / hosting entries are saved as money out and included in platform operating cost.
        </div>
        <div className="grid gap-5">
          <div className="grid gap-3 lg:grid-cols-[1.1fr_0.8fr_0.8fr]">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={(value) => setCategory(value as typeof category)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual_expense">Manual expense</SelectItem>
                  <SelectItem value="deploy_hosting">Deploy / hosting</SelectItem>
                  <SelectItem value="manual_income">Manual income</SelectItem>
                  <SelectItem value="cod_deposit">COD deposit</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Direction</Label>
              <Select value={direction} onValueChange={(value) => setDirection(value as "credit" | "debit")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit">Credit</SelectItem>
                  <SelectItem value="debit">Debit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wallet-amount">Amount</Label>
              <Input id="wallet-amount" type="number" min={1} value={amount} onChange={(event) => setAmount(event.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="wallet-date">Date</Label>
              <Input id="wallet-date" type="date" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="wallet-reference">Reference</Label>
              <Input id="wallet-reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="bKash trx, bank ref, invoice" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wallet-proof">Proof URL</Label>
              <Input id="wallet-proof" value={proofUrl} onChange={(event) => setProofUrl(event.target.value)} placeholder="Screenshot or document URL" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="wallet-note">Note</Label>
            <Textarea id="wallet-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why this entry exists" />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={isInvalid || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Banknote className="size-4" />}
            Add entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DailyClosingDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = React.useState("")
  const mutation = useMutation({
    mutationFn: () => closeAdminDailyFinance({ date, note }),
    onSuccess: () => {
      toast.success("Daily finance snapshot closed.")
      void queryClient.invalidateQueries({ queryKey: ["admin-platform-finance"] })
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Daily closing failed.")
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close daily finance</DialogTitle>
          <DialogDescription>
            Save a locked snapshot for this date so later changes can be audited.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="closing-date">Date</Label>
            <Input id="closing-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="closing-note">Closing note</Label>
            <Textarea id="closing-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional finance note" />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <ReceiptText className="size-4" />}
            Close day
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function FinancePlatformPage() {
  const [preset, setPreset] = React.useState<AdminReportsPreset>("last30Days")
  const [from, setFrom] = React.useState("")
  const [to, setTo] = React.useState("")
  const [walletDialogOpen, setWalletDialogOpen] = React.useState(false)
  const [closingDialogOpen, setClosingDialogOpen] = React.useState(false)

  React.useEffect(() => {
    if (preset !== "custom") {
      setFrom("")
      setTo("")
    }
  }, [preset])

  const platformQuery = useQuery({
    queryKey: ["admin-platform-finance", preset, from, to],
    queryFn: () =>
      getAdminPlatformFinance({
        preset,
        from: preset === "custom" ? from : undefined,
        to: preset === "custom" ? to : undefined,
      }),
  })

  const data = platformQuery.data

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <Landmark className="size-5" />
            </span>
            Platform Finance
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Platform earning, cash movement, restaurant payout liabilities, refunds, rider payroll, and finance alerts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setWalletDialogOpen(true)}>
            <Banknote className="size-4" />
            Add wallet entry
          </Button>
          <Button type="button" variant="outline" onClick={() => setClosingDialogOpen(true)}>
            <ReceiptText className="size-4" />
            Close day
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => exportPlatformFinance(data)}
            disabled={!data}
          >
            <Download className="size-4" />
            CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void platformQuery.refetch()}
            disabled={platformQuery.isFetching}
          >
            {platformQuery.isFetching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCcw className="size-4" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-2 lg:grid-cols-[minmax(280px,1fr)_auto]">
          <AdminDateRangeFilter<AdminReportsPreset>
            value={preset}
            from={from}
            to={to}
            label="Timeframe"
            onPresetChange={setPreset}
            onRangeChange={(range) => {
              setFrom(range.from)
              setTo(range.to)
            }}
          />
          <div className="flex flex-wrap items-end gap-2">
            <Badge
              variant="outline"
              className={`h-10 px-3 ${data ? healthBadgeClass(data.health) : ""}`}
            >
              {data ? healthLabel(data.health) : "Loading health"}
            </Badge>
            <Badge variant="outline" className="h-10 px-3">
              {data
                ? `${formatDate(data.timeframe.start)} - ${formatDate(data.timeframe.end)}`
                : "Loading timeframe"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {platformQuery.isLoading ? (
        <div className="grid min-h-[360px] place-items-center rounded-lg border border-dashed">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading platform finance...
          </div>
        </div>
      ) : data ? (
        <PlatformFinanceContent data={data} />
      ) : (
        <Empty className="min-h-[360px]">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldAlert className="size-4" />
            </EmptyMedia>
            <EmptyTitle>Platform finance is unavailable</EmptyTitle>
            <EmptyDescription>Refresh the page or check backend logs.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      <PlatformWalletEntryDialog open={walletDialogOpen} onOpenChange={setWalletDialogOpen} />
      <DailyClosingDialog open={closingDialogOpen} onOpenChange={setClosingDialogOpen} />
    </>
  )
}

function PlatformFinanceContent({ data }: { data: AdminPlatformFinanceResponse }) {
  const queryClient = useQueryClient()
  const codMutation = useMutation({
    mutationFn: updateAdminOrderCodCollection,
    onSuccess: () => {
      toast.success("COD marked collected.")
      void queryClient.invalidateQueries({ queryKey: ["admin-platform-finance"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-payments"] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "COD update failed.")
    },
  })
  const liabilityCoverage =
    data.liabilities.totalLiabilities > 0
      ? Math.max(
          0,
          Math.min(
            100,
            (data.cash.estimatedPlatformCash / data.liabilities.totalLiabilities) * 100
          )
        )
      : 100
  const hasTrend =
    data.series.some(
      (point) =>
        point.revenue ||
        point.operatingExpense ||
        point.profit ||
        point.cashIn ||
        point.cashOut
    )

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Platform gross revenue"
          value={formatCurrency(data.revenue.platformGrossRevenue)}
          helper="Commission + delivery fee"
          icon={<BadgeDollarSign className="size-5" />}
          tone="emerald"
        />
        <MetricCard
          label="Net profit / loss"
          value={formatCurrency(data.profitLoss.netProfit)}
          helper={`${data.profitLoss.marginPercent}% margin`}
          icon={
            data.profitLoss.netProfit >= 0 ? (
              <ArrowUpRight className="size-5" />
            ) : (
              <ArrowDownRight className="size-5" />
            )
          }
          tone={data.profitLoss.netProfit >= 0 ? "emerald" : "rose"}
          badge={
            <Badge
              variant="outline"
              className={
                data.profitLoss.status === "profit"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              }
            >
              {data.profitLoss.status === "profit" ? "Profit" : "Loss"}
            </Badge>
          }
        />
        <MetricCard
          label="Estimated platform cash"
          value={formatCurrency(data.cash.estimatedPlatformCash)}
          helper="Cash in minus payouts/refunds/payroll"
          icon={<Banknote className="size-5" />}
          tone={data.cash.estimatedPlatformCash >= 0 ? "sky" : "rose"}
        />
        <MetricCard
          label="Current liabilities"
          value={formatCurrency(data.liabilities.totalLiabilities)}
          helper="Payables, refunds, active payouts, payroll"
          icon={<ReceiptText className="size-5" />}
          tone={data.liabilities.totalLiabilities > 0 ? "amber" : "emerald"}
        />
        <MetricCard
          label="Net after liabilities"
          value={formatCurrency(data.cash.netPositionAfterLiabilities)}
          helper="Estimated cash after all open obligations"
          icon={<WalletCards className="size-5" />}
          tone={data.cash.netPositionAfterLiabilities >= 0 ? "emerald" : "rose"}
        />
      </div>

      <Card className={data.health === "risk" ? "border-rose-300 bg-rose-50/40" : data.health === "watch" ? "border-amber-300 bg-amber-50/40" : "border-emerald-200 bg-emerald-50/30"}>
        <CardContent className="grid gap-4 pt-2 lg:grid-cols-[1fr_340px]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={healthBadgeClass(data.health)}>
                {healthLabel(data.health)}
              </Badge>
              <Badge variant="outline">
                {formatNumber(data.revenue.deliveredOrders)} delivered orders
              </Badge>
              <Badge variant="outline">
                Reconciliation {data.reconciliation.status}
              </Badge>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {data.reconciliation.alerts.map((alert) => (
                <div key={`${alert.title}-${alert.type}`} className={`rounded-lg border p-3 ${alertClass(alert.type)}`}>
                  <div className="flex items-start gap-3">
                    <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${alertIconClass(alert.type)}`}>
                      <AlertTriangle className="size-4" />
                    </span>
                    <div>
                      <p className="font-medium">{alert.title}</p>
                      <p className="text-sm opacity-80">{alert.message}</p>
                      {typeof alert.amount === "number" ? (
                        <p className="mt-1 text-sm font-semibold">{formatCurrency(alert.amount)}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border bg-background p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Liability coverage</p>
                <p className="text-xs text-muted-foreground">
                  Estimated cash vs current obligations
                </p>
              </div>
              <p className="text-lg font-semibold">{Math.round(liabilityCoverage)}%</p>
            </div>
            <Progress value={liabilityCoverage} className="mt-4" />
            <p className="mt-3 text-xs text-muted-foreground">
              This is an operational estimate. Match it with bank/bKash statement before final accounting.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="size-4" />
              Profit trend
            </CardTitle>
            <CardDescription>Revenue, operating cost, and profit by day.</CardDescription>
          </CardHeader>
          <CardContent>
            {hasTrend ? <ProfitTrendChart data={data.series} /> : <ChartEmpty title="No finance trend yet" />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Banknote className="size-4" />
              Cash movement
            </CardTitle>
            <CardDescription>Cash in vs payouts, refunds, and payroll cash out.</CardDescription>
          </CardHeader>
          <CardContent>
            {hasTrend ? <CashFlowChart data={data.series} /> : <ChartEmpty title="No cash movement yet" />}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profit / loss breakdown</CardTitle>
            <CardDescription>Restaurant payouts are liability settlement, not platform expense.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <AmountRow label="Commission revenue" value={data.revenue.platformCommission} helper="Delivered restaurant ledger commission" />
            <AmountRow label="Delivery fee revenue" value={data.revenue.deliveryFeeRevenue} helper="Delivered delivery fees" />
            <AmountRow label="Manual income" value={data.wallet.manualIncome} helper="Admin recorded income" valueClassName="text-emerald-700" />
            <AmountRow label="Platform-funded vouchers" value={data.expenses.platformVoucherCost} helper="Foodbela funded discounts/referrals" valueClassName="text-rose-700" />
            <AmountRow label="Rider payroll expense" value={data.expenses.riderPayrollExpense} helper="Only salary records marked paid" valueClassName="text-rose-700" />
            <AmountRow label="Manual expense" value={data.expenses.manualExpense} helper="Admin recorded expense, deploy, and hosting cost" valueClassName="text-rose-700" />
            <AmountRow label="Net profit / loss" value={data.profitLoss.netProfit} helper="Revenue minus platform operating cost" valueClassName={data.profitLoss.netProfit >= 0 ? "text-emerald-700" : "text-rose-700"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cash position</CardTitle>
            <CardDescription>Useful for knowing whether the platform can pay everyone now.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <AmountRow label="bKash collected" value={data.cash.onlineCollected} helper="All successful online payments" />
            <AmountRow label="COD collected" value={data.cash.codCollected} helper={`${formatCurrency(data.cash.codUncollected)} not marked collected`} />
            <AmountRow label="Wallet credits" value={data.cash.walletCreditAmount} helper="Manual income, COD deposit, adjustments" valueClassName="text-emerald-700" />
            <AmountRow label="Restaurant payouts paid" value={data.cash.payoutsPaid} helper="Completed payout batches" valueClassName="text-rose-700" />
            <AmountRow label="Refunds paid" value={data.cash.refundsPaid} helper="Refunded online orders" valueClassName="text-rose-700" />
            <AmountRow label="Rider payroll paid" value={data.cash.riderPayrollPaid} helper="Paid payroll cycles" valueClassName="text-rose-700" />
            <AmountRow label="Wallet debits" value={data.cash.walletDebitAmount} helper="Manual expense, deploy/hosting, and debit adjustments" valueClassName="text-rose-700" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Open liabilities</CardTitle>
            <CardDescription>Money the platform still owes or must reserve.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <AmountRow label="Available restaurant payable" value={data.liabilities.restaurantAvailablePayable} helper="Can be paid now" />
            <AmountRow label="Pending restaurant payable" value={data.liabilities.restaurantPendingPayable} helper="Settlement delay not finished" />
            <AmountRow label="Active payout reserved" value={data.liabilities.activePayoutReserved} helper="Pending/processing payout batches" />
            <AmountRow label="Refund pending" value={data.liabilities.refundPendingAmount} helper={`${formatNumber(data.liabilities.refundPendingCount)} bKash orders`} />
            <AmountRow label="Rider payroll pending" value={data.liabilities.riderPayrollPending} helper="Salary defaults are not auto-counted" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick actions</CardTitle>
            <CardDescription>Jump to the exact finance workflow when a number looks risky.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" asChild>
              <Link to="/payouts">
                <WalletCards className="size-4" />
                Review payouts
              </Link>
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link to="/ledger">
                <BookOpenText className="size-4" />
                Audit ledger
              </Link>
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link to="/refunds">
                <RefreshCcw className="size-4" />
                Refund queue
              </Link>
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link to="/riders?tab=earnings">
                <ReceiptText className="size-4" />
                Rider payroll
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment split</CardTitle>
            <CardDescription>Delivered order payments in the selected timeframe.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.riderSalaryNotices.length ? (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="font-medium">Salary notice</div>
                <div className="mt-1 text-xs">
                  {data.riderSalaryNotices.length} rider salary cycle(s) are due within 3 days. These are reminders only; finance counts salary after admin marks a payment as paid.
                </div>
              </div>
            ) : null}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.paymentBreakdown.length ? (
                  data.paymentBreakdown.map((row) => (
                    <TableRow key={row.method}>
                      <TableCell>
                        <Badge variant="outline">{row.method || "Unknown"}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatNumber(row.orders)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.amount)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(row.collected)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      No delivered payment rows yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">COD reconciliation</CardTitle>
            <CardDescription>
              Delivered cash orders that are not marked collected yet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap gap-2">
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                {formatNumber(data.codReconciliation.pendingCount)} pending shown
              </Badge>
              <Badge variant="outline">
                {formatCurrency(data.codReconciliation.pendingAmount)} pending cash
              </Badge>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Restaurant / rider</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.codReconciliation.recentPending.length ? (
                  data.codReconciliation.recentPending.map((row) => (
                    <TableRow key={row.orderId}>
                      <TableCell>
                        <div className="font-medium">{row.orderNumber}</div>
                        <div className="text-xs text-muted-foreground">{formatDate(row.updatedAt)}</div>
                      </TableCell>
                      <TableCell>
                        <div>{row.restaurantName}</div>
                        <div className="text-xs text-muted-foreground">{row.riderName} {row.riderPhone ? `- ${row.riderPhone}` : ""}</div>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(row.total)}</TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={codMutation.isPending}
                          onClick={() =>
                            codMutation.mutate({
                              orderId: row.orderId,
                              expectedPaymentStatus: row.paymentStatus,
                              note: "Marked collected from Platform Finance COD reconciliation",
                            })
                          }
                        >
                          Mark paid
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      COD collection is clear.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Platform wallet ledger</CardTitle>
            <CardDescription>Manual cash entries and accounting adjustments.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 grid gap-2 sm:grid-cols-3">
              <AmountRow label="Credits" value={data.wallet.creditAmount} />
              <AmountRow label="Debits" value={data.wallet.debitAmount} valueClassName="text-rose-700" />
              <AmountRow label="Net" value={data.wallet.netAdjustment} valueClassName={data.wallet.netAdjustment >= 0 ? "text-emerald-700" : "text-rose-700"} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.wallet.recentEntries.length ? (
                  data.wallet.recentEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{formatDate(entry.occurredAt)}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            entry.direction === "credit"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-rose-200 bg-rose-50 text-rose-700"
                          }
                        >
                          {formatWalletCategory(entry.category)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>{entry.reference || "N/A"}</div>
                        <div className="text-xs text-muted-foreground">{entry.note || "No note"}</div>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(entry.amount)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      No manual wallet entries in this timeframe.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profit by restaurant</CardTitle>
            <CardDescription>Platform revenue and voucher cost by restaurant.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Restaurant</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.profitByRestaurant.length ? (
                  data.profitByRestaurant.map((row) => (
                    <TableRow key={row.restaurantId}>
                      <TableCell>
                        <div className="font-medium">{row.name}</div>
                        <div className="text-xs text-muted-foreground">{row.city}</div>
                      </TableCell>
                      <TableCell className="text-right">{formatNumber(row.deliveredOrders)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.platformRevenue)}</TableCell>
                      <TableCell className="text-right text-rose-700">{formatCurrency(row.platformDiscountCost)}</TableCell>
                      <TableCell className={`text-right font-medium ${row.platformProfit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                        {formatCurrency(row.platformProfit)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      No restaurant profit rows yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rider profitability</CardTitle>
            <CardDescription>Delivery fee contribution vs rider payroll cost.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rider</TableHead>
                  <TableHead className="text-right">Trips</TableHead>
                  <TableHead className="text-right">Fees</TableHead>
                  <TableHead className="text-right">Payroll</TableHead>
                  <TableHead className="text-right">Contribution</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.riderProfitability.length ? (
                  data.riderProfitability.map((row) => (
                    <TableRow key={row.riderId}>
                      <TableCell>
                        <div className="font-medium">{row.name}</div>
                        <div className="text-xs text-muted-foreground">{row.phone || "No phone"} - {formatCurrency(row.costPerTrip)} / trip</div>
                      </TableCell>
                      <TableCell className="text-right">{formatNumber(row.deliveredTrips)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.deliveryFees)}</TableCell>
                      <TableCell className="text-right text-rose-700">{formatCurrency(row.payrollExpense)}</TableCell>
                      <TableCell className={`text-right font-medium ${row.contribution >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                        {formatCurrency(row.contribution)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      No delivered rider rows yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily closing snapshots</CardTitle>
          <CardDescription>Saved daily finance snapshots for audit comparison.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Health</TableHead>
                <TableHead className="text-right">Profit</TableHead>
                <TableHead className="text-right">Cash</TableHead>
                <TableHead className="text-right">Liabilities</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.dailyClosing.recent.length ? (
                data.dailyClosing.recent.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.dateKey}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={row.health === "healthy" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : row.health === "risk" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-amber-200 bg-amber-50 text-amber-700"}>
                        {row.health || "closed"}
                      </Badge>
                    </TableCell>
                    <TableCell className={`text-right ${row.netProfit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{formatCurrency(row.netProfit)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.platformCash)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.liabilities)}</TableCell>
                    <TableCell>{row.note || "N/A"}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No daily closing snapshot saved yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Voucher ROI</CardTitle>
          <CardDescription>Top voucher costs attached to delivered orders, with revenue return.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Voucher</TableHead>
                <TableHead>Funding</TableHead>
                <TableHead className="text-right">Uses</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead className="text-right">Platform cost</TableHead>
                <TableHead className="text-right">Owner cost</TableHead>
                <TableHead className="text-right">Delivered revenue</TableHead>
                <TableHead className="text-right">ROI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.promotionCosts.length ? (
                data.promotionCosts.map((row) => (
                  <TableRow key={`${row.code}-${row.name}`}>
                    <TableCell>
                      <div className="font-medium">{row.name || row.code || "Voucher"}</div>
                      <div className="text-xs text-muted-foreground">{row.code || "No code"}</div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          row.fundedBy === "platform"
                            ? "border-sky-200 bg-sky-50 text-sky-700"
                            : row.fundedBy === "shared"
                              ? "border-violet-200 bg-violet-50 text-violet-700"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700"
                        }
                      >
                        {row.fundedBy}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatNumber(row.uses)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.discount)}</TableCell>
                    <TableCell className="text-right font-medium text-rose-700">{formatCurrency(row.platformCost)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.ownerCost)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                    <TableCell className={`text-right font-medium ${row.roi >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                      {formatCurrency(row.roi)}
                      <div className="text-xs text-muted-foreground">{row.costToRevenuePercent}% cost</div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    No voucher cost in this timeframe.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accounting notes</CardTitle>
          <CardDescription>Why these numbers may differ from a bank statement.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          {data.notes.map((note) => (
            <div key={note} className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              {note}
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  )
}

function ProfitTrendChart({
  data,
}: {
  data: AdminPlatformFinanceResponse["series"]
}) {
  return (
    <div className="h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
          <Tooltip formatter={(value) => formatCurrency(Number(value))} />
          <Legend />
          <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#059669" fill="#bbf7d0" fillOpacity={0.55} />
          <Area type="monotone" dataKey="operatingExpense" name="Operating cost" stroke="#e11d48" fill="#fecdd3" fillOpacity={0.45} />
          <Area type="monotone" dataKey="profit" name="Profit" stroke="#0284c7" fill="#bae6fd" fillOpacity={0.4} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function CashFlowChart({
  data,
}: {
  data: AdminPlatformFinanceResponse["series"]
}) {
  return (
    <div className="h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
          <Tooltip formatter={(value) => formatCurrency(Number(value))} />
          <Legend />
          <Bar dataKey="cashIn" name="Cash in" fill="#0f766e" radius={[4, 4, 0, 0]} />
          <Bar dataKey="cashOut" name="Cash out" fill="#f59e0b" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function ChartEmpty({ title }: { title: string }) {
  return (
    <Empty className="min-h-[320px]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <TrendingUp className="size-4" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>Delivered orders, payouts, or refunds will appear here once data exists.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
