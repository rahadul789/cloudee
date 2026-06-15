import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import {
  AlertTriangle,
  BarChart3,
  Download,
  Loader2,
  RefreshCcw,
  TrendingUp,
} from "lucide-react"

import {
  getAdminReports,
  type AdminReportsPreset,
  type AdminReportsResponse,
} from "@/lib/admin-api"
import { AdminDateRangeFilter } from "@/components/admin-date-range-filter"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

function formatCurrency(value: number) {
  return `Tk ${Math.round(value || 0).toLocaleString()}`
}

function formatNumber(value: number) {
  return Math.round(value || 0).toLocaleString()
}

function formatDate(value?: string | null) {
  if (!value) return "N/A"
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value))
}

function MetricCard({
  label,
  value,
  helper,
  accent,
}: {
  label: string
  value: React.ReactNode
  helper: string
  accent?: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="pt-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
          </div>
          {accent}
        </div>
      </CardContent>
    </Card>
  )
}

export function ReportsPage() {
  const [preset, setPreset] = React.useState<AdminReportsPreset>("last30Days")
  const [from, setFrom] = React.useState("")
  const [to, setTo] = React.useState("")

  const reportsQuery = useQuery({
    queryKey: ["admin-reports", preset, from, to],
    queryFn: () => getAdminReports({ preset, from: preset === "custom" ? from : undefined, to: preset === "custom" ? to : undefined }),
  })

  const data = reportsQuery.data

  React.useEffect(() => {
    if (preset !== "custom") {
      setFrom("")
      setTo("")
    }
  }, [preset])

  const resetFilters = () => {
    setPreset("last30Days")
    setFrom("")
    setTo("")
  }

  const exportCsv = () => {
    if (!data) return
    const rows = [
      ["section", "metric", "value"],
      ["overview", "deliveredRevenue", data.overview.deliveredRevenue],
      ["overview", "deliveredOrders", data.overview.deliveredOrders],
      ["overview", "averageOrderValue", data.overview.averageOrderValue],
      ["overview", "platformCommission", data.overview.platformCommission],
      ["overview", "restaurantPayable", data.overview.restaurantPayable],
      ["overview", "platformDiscountCost", data.overview.platformDiscountCost],
      ["overview", "riderPayrollExpense", data.overview.riderPayrollExpense],
      ["overview", "platformOperatingExpense", data.overview.platformOperatingExpense],
      ["overview", "estimatedPlatformMargin", data.overview.estimatedPlatformMargin],
      ["reconciliation", "difference", data.reconciliation.difference],
      ...data.sales.trend.map((point) => ["sales_trend", point.date, point.revenue]),
      ...data.sales.hourly.map((point) => ["hourly", point.label, point.revenue]),
      ...data.orders.statusDistribution.map((row) => ["order_status", row.status, row.count]),
      ...data.payments.map((row) => ["payment", row.method, row.amount]),
      ...data.restaurants.map((row) => ["restaurant", row.name, row.deliveredRevenue]),
    ]
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "admin-reports.csv"
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <BarChart3 className="size-5" />
            </span>
            Reports
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Delivered-order revenue, orders, payments, restaurants, customers, riders, and promotion performance.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={exportCsv} disabled={!data}>
            <Download className="size-4" />
            Export report
          </Button>
          <Button type="button" variant="outline" onClick={resetFilters}>
            <RefreshCcw className="size-4" />
            Reset filters
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-2 md:grid-cols-[minmax(280px,1fr)_auto]">
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
          <div className="flex items-end">
            <Badge variant="outline" className="h-10 px-3">
              {data
                ? preset === "lifetime"
                  ? `Lifetime - ${formatDate(data.timeframe.end)}`
                  : `${formatDate(data.timeframe.start)} - ${formatDate(data.timeframe.end)}`
                : "Loading timeframe"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {reportsQuery.isLoading ? (
        <div className="grid min-h-[360px] place-items-center rounded-lg border border-dashed">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading reports...
          </div>
        </div>
      ) : data ? (
        <ReportsContent data={data} />
      ) : (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Report data is unavailable.
        </div>
      )}
    </>
  )
}

function ReportsContent({ data }: { data: AdminReportsResponse }) {
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard
          label="Delivered revenue"
          value={formatCurrency(data.overview.deliveredRevenue)}
          helper="Only delivered orders"
          accent={<Badge variant={data.overview.revenueChangePercent >= 0 ? "default" : "destructive"}>{data.overview.revenueChangePercent}%</Badge>}
        />
        <MetricCard label="Delivered orders" value={formatNumber(data.overview.deliveredOrders)} helper="Completed orders" />
        <MetricCard
          label="Average order value"
          value={formatCurrency(data.overview.averageOrderValue)}
          helper="Delivered revenue / orders"
          accent={<Badge variant={data.overview.aovChangePercent >= 0 ? "default" : "destructive"}>{data.overview.aovChangePercent}%</Badge>}
        />
        <MetricCard label="Platform commission" value={formatCurrency(data.overview.platformCommission)} helper="Ledger commission" />
        <MetricCard label="Restaurant payable" value={formatCurrency(data.overview.restaurantPayable)} helper="Ledger net payable" />
        <MetricCard label="New customers" value={formatNumber(data.overview.newCustomers)} helper={`${formatNumber(data.overview.totalCustomers)} total customers`} />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Platform gross income"
          value={formatCurrency(data.overview.platformGrossIncome)}
          helper="Commission + delivery fee"
        />
        <MetricCard
          label="Platform-funded voucher cost"
          value={formatCurrency(data.overview.platformDiscountCost)}
          helper="Referral rewards and platform-funded promos"
        />
        <MetricCard
          label="Rider payroll expense"
          value={formatCurrency(data.overview.riderPayrollExpense)}
          helper="Salary + platform bonus - penalty"
        />
        <MetricCard
          label="Operating expense"
          value={formatCurrency(data.overview.platformOperatingExpense)}
          helper="Platform promo + rider payroll"
        />
        <MetricCard
          label="Estimated margin"
          value={formatCurrency(data.overview.estimatedPlatformMargin)}
          helper="Before other business costs"
        />
      </div>

      <Card className={data.reconciliation.status === "warning" ? "border-amber-300 bg-amber-50/40" : ""}>
        <CardContent className="flex flex-col gap-3 pt-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 flex size-9 items-center justify-center rounded-lg ${data.reconciliation.status === "warning" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
              <AlertTriangle className="size-5" />
            </span>
            <div>
              <p className="font-medium">Finance reconciliation</p>
              <p className="text-sm text-muted-foreground">{data.reconciliation.message}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Customer collected includes discounts and delivery fee; ledger gross uses menu subtotal.
              </p>
            </div>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <AmountPill label="Order subtotal" value={data.reconciliation.orderSubtotalGross} />
            <AmountPill label="Ledger gross" value={data.reconciliation.ledgerGrossAmount} />
            <AmountPill label="Difference" value={data.reconciliation.difference} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard
          label="Revenue comparison"
          value={formatCurrency(data.comparison.previousDeliveredRevenue)}
          helper={`Previous timeframe, ${data.comparison.revenueChangePercent}% change now`}
        />
        <MetricCard
          label="Order comparison"
          value={formatNumber(data.comparison.previousDeliveredOrders)}
          helper={`Previous timeframe, ${data.comparison.ordersChangePercent}% change now`}
        />
        <MetricCard
          label="AOV comparison"
          value={formatCurrency(data.comparison.previousAverageOrderValue)}
          helper={`Previous timeframe, ${data.comparison.aovChangePercent}% change now`}
        />
      </div>

      <Tabs defaultValue="sales" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="refunds">Refunds</TabsTrigger>
          <TabsTrigger value="restaurants">Restaurants</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="riders">Riders</TabsTrigger>
          <TabsTrigger value="finance">Finance</TabsTrigger>
          <TabsTrigger value="promotions">Promotions</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="size-4" />
                  Daily delivered sales
                </CardTitle>
                <CardDescription>Revenue trend uses delivered order timestamps.</CardDescription>
              </CardHeader>
              <CardContent>
                <SimpleTrend points={data.sales.trend} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Settlement ledger</CardTitle>
                <CardDescription>Finance numbers come from restaurant ledger entries.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <AmountRow label="Gross amount" value={data.sales.ledger.grossAmount} />
                <AmountRow label="Commission base before discount" value={data.sales.ledger.commissionBase} />
                <AmountRow label="Platform commission" value={data.sales.ledger.platformCommission} />
                <AmountRow label="Restaurant payable" value={data.sales.ledger.restaurantPayable} />
                <AmountRow label="Owner-funded discount cost" value={data.sales.ledger.discountCost} />
                <AmountRow label="Platform-funded voucher cost" value={data.sales.ledger.platformDiscountCost} />
                <AmountRow label="Available payout" value={data.sales.ledger.available} />
                <AmountRow label="Pending payout" value={data.sales.ledger.pending} />
                <AmountRow label="Paid out" value={data.sales.ledger.paidOut} />
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ReportTable
              title="Peak hours"
              description="Delivered orders by hour."
              headers={["Hour", "Orders", "Revenue"]}
              rows={data.sales.hourly.map((row) => [row.label, formatNumber(row.orders), formatCurrency(row.revenue)])}
            />
            <ReportTable
              title="Day-of-week breakdown"
              description="Delivered orders by weekday."
              headers={["Day", "Orders", "Revenue"]}
              rows={data.sales.dayOfWeek.map((row) => [row.day, formatNumber(row.orders), formatCurrency(row.revenue)])}
            />
          </div>
        </TabsContent>

        <TabsContent value="orders" className="grid gap-4 lg:grid-cols-2">
          <ReportTable
            title="Order status distribution"
            description="Revenue column counts delivered revenue only."
            headers={["Status", "Orders", "Delivered revenue"]}
            rows={data.orders.statusDistribution.map((row) => [row.status, formatNumber(row.count), formatCurrency(row.revenue)])}
          />
          <ReportTable
            title="Cancellation reasons"
            description="Cancelled and rejected orders in the selected timeframe."
            headers={["Reason", "Count"]}
            rows={data.orders.cancellationReasons.map((row) => [row.reason || "Unknown", formatNumber(row.count)])}
          />
          <ReportTable
            title="Cancellation by actor"
            description="Who cancelled or rejected orders."
            headers={["Actor", "Count"]}
            rows={data.orders.cancellationByActor.map((row) => [row.actor || "unknown", formatNumber(row.count)])}
          />
        </TabsContent>

        <TabsContent value="refunds" className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Refund overview</CardTitle>
              <CardDescription>Refund status comes from order payment status and ledger refund rows.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <AmountRow label="Pending refund amount" value={data.orders.refunds.pendingAmount} />
              <AmountRow label="Refunded order amount" value={data.orders.refunds.refundedAmount} />
              <AmountRow label="Ledger refund amount" value={data.orders.refunds.ledgerRefundAmount} />
              <div className="grid gap-2 sm:grid-cols-3">
                <Badge variant="secondary">{data.orders.refunds.pendingCount} pending</Badge>
                <Badge variant="outline">{data.orders.refunds.refundedCount} refunded</Badge>
                <Badge variant="outline">{data.orders.refunds.rejectedCount} rejected</Badge>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Refund accuracy note</CardTitle>
              <CardDescription>Use this to verify payment operations against settlement rows.</CardDescription>
            </CardHeader>
            <CardContent className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              If order refunded amount and ledger refund amount diverge, run payment reconciliation before payout.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="finance" className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Platform margin</CardTitle>
              <CardDescription>High-level operating estimate for the selected timeframe.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <AmountRow label="Platform commission" value={data.sales.platformMargin.platformCommission} />
              <AmountRow label="Delivery fees" value={data.sales.platformMargin.deliveryFees} />
              <AmountRow label="Platform gross income" value={data.sales.platformMargin.platformGrossIncome} />
              <AmountRow label="Platform-funded voucher/referral expense" value={data.sales.platformMargin.platformDiscountCost} />
              <AmountRow label="Rider payroll expense" value={data.sales.platformMargin.riderPayrollExpense} />
              <AmountRow label="Total operating expense" value={data.sales.platformMargin.platformOperatingExpense} />
              <AmountRow label="Estimated platform margin" value={data.sales.platformMargin.estimatedPlatformMargin} />
              <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                Platform-funded vouchers include referral reward vouchers and admin promos funded by Foodbela. These do not reduce restaurant payout.
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rider payroll</CardTitle>
              <CardDescription>Payroll months: {data.sales.platformMargin.payrollMonths.join(", ") || "N/A"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <AmountRow label="Base salary" value={data.sales.platformMargin.riderBaseSalary} />
              <AmountRow label="Platform bonus / tips" value={data.sales.platformMargin.riderPlatformBonus} />
              <AmountRow label="Penalties / deductions" value={data.sales.platformMargin.riderPenalties} />
              <AmountRow label="Payroll pending" value={data.sales.platformMargin.riderPayrollPending} />
              <AmountRow label="Payroll paid" value={data.sales.platformMargin.riderPayrollPaid} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="restaurants">
          <ReportTable
            title="Restaurant performance"
            description="Top restaurants by delivered revenue."
            headers={["Restaurant", "City", "Delivered orders", "Revenue", "AOV"]}
            rows={data.restaurants.map((row) => [row.name, row.city || "N/A", formatNumber(row.deliveredOrders), formatCurrency(row.deliveredRevenue), formatCurrency(row.averageOrderValue)])}
          />
        </TabsContent>

        <TabsContent value="payments">
          <ReportTable
            title="Payment split"
            description="Delivered orders grouped by payment method."
            headers={["Method", "Orders", "Amount", "Paid amount"]}
            rows={data.payments.map((row) => [row.method || "Unknown", formatNumber(row.orders), formatCurrency(row.amount), formatCurrency(row.paid)])}
          />
        </TabsContent>

        <TabsContent value="customers">
          <ReportTable
            title="Top customers"
            description="Customers ranked by delivered spend."
            headers={["Customer", "Phone", "Delivered orders", "Spend", "Last order"]}
            rows={data.customers.topCustomers.map((row) => [row.name, row.phone || "N/A", formatNumber(row.deliveredOrders), formatCurrency(row.spend), formatDate(row.lastOrderedAt)])}
          />
        </TabsContent>

        <TabsContent value="riders">
          <ReportTable
            title="Rider performance"
            description="Delivered trips are performance metrics; payout comes from platform payroll."
            headers={["Rider", "Phone", "Delivered trips", "Payroll expense", "Pending", "Paid"]}
            rows={data.riders.map((row) => [
              row.name,
              row.phone || "N/A",
              formatNumber(row.deliveredTrips),
              formatCurrency(row.payrollExpense),
              formatCurrency(row.payrollPending),
              formatCurrency(row.payrollPaid),
            ])}
          />
        </TabsContent>

        <TabsContent value="promotions">
          <ReportTable
            title="Promotion impact"
            description="Voucher usage attached to delivered orders, split by funding source."
            headers={["Voucher", "Funded by", "Uses", "Discount", "Owner funded", "Platform funded", "Revenue"]}
            rows={data.promotions.map((row) => [
              row.name || row.code || row.voucherId || "Voucher",
              row.fundedBy,
              formatNumber(row.uses),
              formatCurrency(row.discount),
              formatCurrency(row.ownerFundedDiscount),
              formatCurrency(row.platformFundedDiscount),
              formatCurrency(row.deliveredRevenue),
            ])}
          />
        </TabsContent>
      </Tabs>
    </>
  )
}

function SimpleTrend({ points }: { points: Array<{ label: string; orders: number; revenue: number }> }) {
  const maxRevenue = Math.max(1, ...points.map((point) => point.revenue))
  return (
    <div className="space-y-3">
      <div className="flex h-48 items-end gap-1 rounded-lg border bg-muted/20 p-3">
        {points.map((point) => (
          <div key={point.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div
              className="w-full rounded-t bg-primary/80"
              style={{ height: `${Math.max(3, (point.revenue / maxRevenue) * 160)}px` }}
              title={`${point.label}: ${formatCurrency(point.revenue)}`}
            />
          </div>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {points.slice(-3).map((point) => (
          <div key={point.label} className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{point.label}</p>
            <p className="font-medium">{formatCurrency(point.revenue)}</p>
            <p className="text-xs text-muted-foreground">{formatNumber(point.orders)} orders</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function AmountRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{formatCurrency(value)}</span>
    </div>
  )
}

function AmountPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{formatCurrency(value)}</p>
    </div>
  )
}

function ReportTable({
  title,
  description,
  headers,
  rows,
}: {
  title: string
  description: string
  headers: string[]
  rows: Array<Array<React.ReactNode>>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                {headers.map((header) => (
                  <TableHead key={header}>{header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length ? (
                rows.map((row, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <TableCell key={cellIndex}>{cell}</TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={headers.length} className="h-24 text-center text-muted-foreground">
                    No report rows for this timeframe.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
