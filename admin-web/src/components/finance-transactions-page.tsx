import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Printer,
  ReceiptText,
  RefreshCcw,
  Search,
} from "lucide-react"
import { toast } from "sonner"

import { useDebouncedValue } from "@/hooks/use-debounced-value"
import {
  listAdminMoneyTransactions,
  type AdminMoneyTransaction,
  type AdminReportsPreset,
} from "@/lib/admin-api"
import { downloadCsv, escapeHtml, printReport } from "@/lib/export-utils"
import { AdminDateRangeFilter } from "@/components/admin-date-range-filter"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
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

type MoneyPreset = Extract<
  AdminReportsPreset,
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

type DirectionFilter = "all" | "credit" | "debit"
type CategoryFilter =
  | "all"
  | "online_payment"
  | "cod_collection"
  | "restaurant_payout"
  | "customer_refund"
  | "rider_payroll"
  | "deploy_hosting"
  | "manual_income"
  | "manual_expense"
  | "adjustment"
  | "other"
type SourceFilter = "all" | "order" | "payout" | "refund" | "payroll" | "wallet"

const pageSizeOptions = [10, 20, 50, 100]

function formatCurrency(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0
  const sign = safeValue < 0 ? "-" : ""
  return `${sign}Tk ${Math.round(Math.abs(safeValue)).toLocaleString()}`
}

function formatDate(value?: string | null) {
  if (!value) return "N/A"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "N/A"
  return date.toLocaleString()
}

function categoryLabel(value: string) {
  if (value === "deploy_hosting") return "Deploy / hosting"
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function directionBadgeClass(value: string) {
  if (value === "credit") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  return "border-rose-200 bg-rose-50 text-rose-700"
}

function categoryBadgeClass(value: string) {
  if (value === "online_payment" || value === "cod_collection" || value === "manual_income") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  }
  if (value === "customer_refund" || value === "restaurant_payout" || value === "rider_payroll" || value === "deploy_hosting") {
    return "border-rose-200 bg-rose-50 text-rose-700"
  }
  return "border-slate-200 bg-slate-50 text-slate-700"
}

function exportTransactions(rows: AdminMoneyTransaction[]) {
  downloadCsv("platform-money-transactions.csv", [
    [
      "occurred_at",
      "direction",
      "category",
      "source",
      "amount",
      "status",
      "reference",
      "payment_method",
      "restaurant",
      "order_number",
      "actor",
      "note",
    ],
    ...rows.map((row) => [
      row.occurredAt,
      row.direction,
      row.category,
      row.source,
      row.amount,
      row.status,
      row.reference,
      row.paymentMethod,
      row.restaurantName,
      row.orderNumber,
      row.actorName || row.actorPhone,
      row.note,
    ]),
  ])
}

function printTransactions(rows: AdminMoneyTransaction[], summary: {
  creditAmount: number
  debitAmount: number
  netAmount: number
  transactionCount: number
}) {
  const body = `
    <div class="grid">
      <div class="metric"><span class="muted">Money in</span><strong>${escapeHtml(formatCurrency(summary.creditAmount))}</strong></div>
      <div class="metric"><span class="muted">Money out</span><strong>${escapeHtml(formatCurrency(summary.debitAmount))}</strong></div>
      <div class="metric"><span class="muted">Net movement</span><strong>${escapeHtml(formatCurrency(summary.netAmount))}</strong></div>
      <div class="metric"><span class="muted">Transactions</span><strong>${summary.transactionCount}</strong></div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Direction</th>
          <th>Category</th>
          <th>Amount</th>
          <th>Reference</th>
          <th>Actor</th>
          <th>Note</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr>
                <td>${escapeHtml(formatDate(row.occurredAt))}</td>
                <td>${escapeHtml(row.direction)}</td>
                <td>${escapeHtml(categoryLabel(row.category))}</td>
                <td>${escapeHtml(formatCurrency(row.amount))}</td>
                <td>${escapeHtml(row.reference || row.orderNumber || row.id)}</td>
                <td>${escapeHtml(row.actorName || row.restaurantName || row.actorPhone || "N/A")}</td>
                <td>${escapeHtml(row.note)}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `
  if (!printReport("Platform Money Transactions", body)) {
    toast.error("Popup blocked. Please allow popups to export PDF.")
  }
}

function StatCard({
  label,
  value,
  helper,
  tone = "default",
}: {
  label: string
  value: string
  helper: string
  tone?: "default" | "credit" | "debit"
}) {
  return (
    <Card>
      <CardContent className="pt-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p
              className={
                tone === "credit"
                  ? "mt-2 text-2xl font-semibold text-emerald-700"
                  : tone === "debit"
                    ? "mt-2 text-2xl font-semibold text-rose-700"
                    : "mt-2 text-2xl font-semibold"
              }
            >
              {value}
            </p>
          </div>
          <div
            className={
              tone === "credit"
                ? "rounded-full bg-emerald-50 p-2 text-emerald-700"
                : tone === "debit"
                  ? "rounded-full bg-rose-50 p-2 text-rose-700"
                  : "rounded-full bg-slate-100 p-2 text-slate-700"
            }
          >
            {tone === "debit" ? <ArrowDownRight className="size-5" /> : <ArrowUpRight className="size-5" />}
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  )
}

export function FinanceTransactionsPage() {
  const [preset, setPreset] = React.useState<MoneyPreset>("last30Days")
  const [from, setFrom] = React.useState("")
  const [to, setTo] = React.useState("")
  const [search, setSearch] = React.useState("")
  const [direction, setDirection] = React.useState<DirectionFilter>("all")
  const [category, setCategory] = React.useState<CategoryFilter>("all")
  const [source, setSource] = React.useState<SourceFilter>("all")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(20)
  const debouncedSearch = useDebouncedValue(search, 350)

  React.useEffect(() => {
    setPage(1)
  }, [preset, from, to, debouncedSearch, direction, category, source, pageSize])

  const query = useQuery({
    queryKey: [
      "admin-money-transactions",
      preset,
      from,
      to,
      debouncedSearch,
      direction,
      category,
      source,
      page,
      pageSize,
    ],
    queryFn: () =>
      listAdminMoneyTransactions({
        preset,
        from,
        to,
        search: debouncedSearch,
        direction,
        category,
        source,
        page,
        pageSize,
      }),
  })

  const data = query.data
  const rows = data?.items ?? []
  const summary = data?.summary ?? {
    creditAmount: 0,
    debitAmount: 0,
    creditCount: 0,
    debitCount: 0,
    netAmount: 0,
    transactionCount: 0,
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ReceiptText className="size-5 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">Money transactions</h1>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Complete platform cash movement: customer money in, restaurant payouts, refunds, rider salary, and manual finance entries.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
            {query.isFetching ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
            Refresh
          </Button>
          <Button variant="outline" onClick={() => exportTransactions(rows)} disabled={!rows.length}>
            <Download className="size-4" />
            CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => printTransactions(rows, summary)}
            disabled={!rows.length}
          >
            <Printer className="size-4" />
            PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Money in"
          value={formatCurrency(summary.creditAmount)}
          helper={`${summary.creditCount} credit transactions`}
          tone="credit"
        />
        <StatCard
          label="Money out"
          value={formatCurrency(summary.debitAmount)}
          helper={`${summary.debitCount} debit transactions`}
          tone="debit"
        />
        <StatCard
          label="Net movement"
          value={formatCurrency(summary.netAmount)}
          helper={summary.netAmount >= 0 ? "Cash movement positive" : "Cash movement negative"}
          tone={summary.netAmount >= 0 ? "credit" : "debit"}
        />
        <StatCard
          label="Total rows"
          value={(data?.total ?? 0).toLocaleString()}
          helper="After current filters"
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <CardTitle>Transaction history</CardTitle>
              <CardDescription>Filter, paginate, export, and audit every platform money movement.</CardDescription>
            </div>
            <AdminDateRangeFilter<MoneyPreset>
              value={preset}
              from={from}
              to={to}
              allowedPresets={[
                "today",
                "yesterday",
                "last7Days",
                "last30Days",
                "last90Days",
                "thisMonth",
                "lastMonth",
                "lifetime",
                "custom",
              ]}
              onPresetChange={setPreset}
              onRangeChange={({ from: nextFrom, to: nextTo }) => {
                setFrom(nextFrom)
                setTo(nextTo)
              }}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[1.3fr_180px_220px_160px_120px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
                placeholder="Search reference, order, restaurant, rider, note"
              />
            </div>
            <Select value={direction} onValueChange={(value) => setDirection(value as DirectionFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All directions</SelectItem>
                <SelectItem value="credit">Money in</SelectItem>
                <SelectItem value="debit">Money out</SelectItem>
              </SelectContent>
            </Select>
            <Select value={category} onValueChange={(value) => setCategory(value as CategoryFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="online_payment">Online payment</SelectItem>
                <SelectItem value="cod_collection">COD collection</SelectItem>
                <SelectItem value="restaurant_payout">Restaurant payout</SelectItem>
                <SelectItem value="customer_refund">Customer refund</SelectItem>
                <SelectItem value="rider_payroll">Rider payroll</SelectItem>
                <SelectItem value="deploy_hosting">Deploy / hosting</SelectItem>
                <SelectItem value="manual_income">Manual income</SelectItem>
                <SelectItem value="manual_expense">Manual expense</SelectItem>
                <SelectItem value="adjustment">Adjustment</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Select value={source} onValueChange={(value) => setSource(value as SourceFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="order">Orders</SelectItem>
                <SelectItem value="payout">Payouts</SelectItem>
                <SelectItem value="refund">Refunds</SelectItem>
                <SelectItem value="payroll">Payroll</SelectItem>
                <SelectItem value="wallet">Wallet</SelectItem>
              </SelectContent>
            </Select>
            <Select value={`${pageSize}`} onValueChange={(value) => setPageSize(Number(value))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((option) => (
                  <SelectItem key={option} value={`${option}`}>
                    {option}/page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      <Loader2 className="mx-auto size-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : rows.length ? (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-sm">{formatDate(row.occurredAt)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="outline" className={directionBadgeClass(row.direction)}>
                            {row.direction === "credit" ? "Money in" : "Money out"}
                          </Badge>
                          <Badge variant="outline" className={categoryBadgeClass(row.category)}>
                            {categoryLabel(row.category)}
                          </Badge>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">{row.source}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{row.reference || row.orderNumber || row.id}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.restaurantName || row.paymentMethod || "Platform"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{row.actorName || row.restaurantName || "Platform"}</div>
                        <div className="text-xs text-muted-foreground">{row.actorPhone || row.note || "N/A"}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.status}</Badge>
                      </TableCell>
                      <TableCell
                        className={
                          row.direction === "credit"
                            ? "text-right font-semibold text-emerald-700"
                            : "text-right font-semibold text-rose-700"
                        }
                      >
                        {row.direction === "credit" ? "+" : "-"}
                        {formatCurrency(row.amount)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Empty className="py-10">
                        <EmptyHeader>
                          <EmptyMedia>
                            <ReceiptText className="size-6" />
                          </EmptyMedia>
                          <EmptyTitle>No transactions found</EmptyTitle>
                          <EmptyDescription>
                            Change the filters or date range to see platform money movement.
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {rows.length} of {(data?.total ?? 0).toLocaleString()} transactions
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || query.isFetching}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft className="size-4" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {data?.page ?? page} of {data?.pageCount ?? 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= (data?.pageCount ?? 1) || query.isFetching}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
