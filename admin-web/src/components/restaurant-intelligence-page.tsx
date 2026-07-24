import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowLeft,
  ArrowUpRight,
  Banknote,
  BarChart3,
  CheckCircle2,
  Clock3,
  CircleAlert,
  Eye,
  Filter,
  Loader2,
  Package,
  Power,
  RefreshCw,
  ShieldAlert,
  Star,
  Store,
  Users,
  WalletCards,
} from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useNavigate, useParams } from "react-router-dom"

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  getAdminRestaurantIntelligence,
  type AdminRestaurantIntelligence,
  type AdminRestaurantOrderDateFilterPreset,
} from "@/lib/admin-api"

type IntelligenceStatusFilter =
  | "all"
  | "live"
  | "delivered"
  | "cancelled"
  | "rejected"
type CustomerTierFilter = "all" | "new" | "repeat"
type AvailabilityEventFilter = "all" | "online" | "offline"
type AvailabilitySourceFilter =
  | "all"
  | "owner_app"
  | "owner_web"
  | "admin"
  | "system"
  | "unknown"
type AvailabilityReasonFilter =
  | "all"
  | "manual_offline"
  | "admin_offline"
  | "enforcement"
  | "restaurant_hidden"
  | "replaced"
  | "system"
type AvailabilityRiskFilter = "all" | "offline_with_live_orders"
type IntelligenceTab =
  | "overview"
  | "availability"
  | "performance"
  | "sales"
  | "benchmark"
  | "menu"
  | "customers"
  | "finance"
  | "quality"
  | "timeline"
type RestaurantNextAction = AdminRestaurantIntelligence["actions"][number]
type BenchmarkMetric = AdminRestaurantIntelligence["benchmark"]["metrics"][number]

const presetOptions: readonly AdminRestaurantOrderDateFilterPreset[] = [
  "today",
  "yesterday",
  "last7Days",
  "last30Days",
  "last90Days",
  "thisMonth",
  "lastMonth",
  "lifetime",
  "custom",
]

const money = new Intl.NumberFormat("en-BD", {
  maximumFractionDigits: 0,
})

function formatMoney(value: number) {
  return `${money.format(Math.round(value || 0))}tk`
}

function formatNumber(value: number) {
  return money.format(Math.round(value || 0))
}

function formatDateTime(value: string | null) {
  if (!value) return "Not available"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Not available"
  return date.toLocaleString("en-BD", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatMinutes(value: number) {
  return `${Number(value || 0).toFixed(value % 1 === 0 ? 0 : 1)} min`
}

function formatDuration(seconds: number) {
  const normalized = Math.max(0, Math.round(seconds || 0))
  const days = Math.floor(normalized / 86400)
  const hours = Math.floor(normalized / 3600)
  const minutes = Math.floor((normalized % 3600) / 60)
  if (days > 0) {
    const remainingHours = Math.floor((normalized % 86400) / 3600)
    const remainingMinutes = Math.floor((normalized % 3600) / 60)
    if (remainingMinutes > 0) {
      return `${days}d ${remainingHours}h ${remainingMinutes}m`
    }
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`
  }
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function sourceLabel(source: string) {
  if (source === "owner_app") return "Owner app"
  if (source === "owner_web") return "Owner web"
  if (source === "admin") return "Admin"
  if (source === "system") return "System"
  return "Unknown"
}

function reasonLabel(reason: string) {
  if (!reason) return "-"
  return reason.replaceAll("_", " ")
}

function statusTone(status: string) {
  if (status === "active" || status === "Delivered" || status === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  }
  if (
    status === "under_review" ||
    status === "processing" ||
    status === "Preparing" ||
    status === "Accepted"
  ) {
    return "border-amber-200 bg-amber-50 text-amber-700"
  }
  if (
    status === "quality_hold" ||
    status === "temporarily_suspended" ||
    status === "permanently_disabled" ||
    status === "failed" ||
    status === "Cancelled" ||
    status === "Rejected"
  ) {
    return "border-rose-200 bg-rose-50 text-rose-700"
  }
  return "border-slate-200 bg-slate-50 text-slate-700"
}

function alertTone(severity: "info" | "warning" | "critical") {
  if (severity === "critical") {
    return "border-rose-200 bg-rose-50 text-rose-700"
  }
  if (severity === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-700"
  }
  return "border-sky-200 bg-sky-50 text-sky-700"
}

function nextActionTone(priority: RestaurantNextAction["priority"]) {
  if (priority === "critical") {
    return "border-rose-200 bg-rose-50 text-rose-700"
  }
  if (priority === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-700"
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700"
}

function nextActionPanelTone(priority: RestaurantNextAction["priority"]) {
  if (priority === "critical") return "border-l-rose-500"
  if (priority === "warning") return "border-l-amber-500"
  return "border-l-emerald-500"
}

function domainLabel(domain: RestaurantNextAction["domain"]) {
  if (domain === "availability") return "Availability"
  if (domain === "orders") return "Orders"
  if (domain === "finance") return "Finance"
  if (domain === "menu") return "Menu"
  if (domain === "reviews") return "Reviews"
  if (domain === "support") return "Support"
  if (domain === "growth") return "Growth"
  return "Profile"
}

function benchmarkStatusTone(status: BenchmarkMetric["status"]) {
  if (status === "excellent" || status === "good") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  }
  if (status === "watch") {
    return "border-amber-200 bg-amber-50 text-amber-700"
  }
  if (status === "needs_attention") {
    return "border-rose-200 bg-rose-50 text-rose-700"
  }
  return "border-slate-200 bg-slate-50 text-slate-700"
}

function benchmarkStatusLabel(status: BenchmarkMetric["status"]) {
  if (status === "needs_attention") return "Needs attention"
  if (status === "not_available") return "Not enough data"
  return status.replaceAll("_", " ")
}

function formatBenchmarkValue(metric: BenchmarkMetric, value: number) {
  if (metric.unit === "money") return formatMoney(value)
  if (metric.unit === "percent") return `${Math.round(value || 0)}%`
  if (metric.unit === "minutes") return formatMinutes(value)
  if (metric.unit === "hours") return formatDuration(value * 3600)
  if (metric.unit === "rating") return Number(value || 0).toFixed(1)
  return formatNumber(value)
}

function formatBenchmarkDelta(metric: BenchmarkMetric, value: number) {
  if (!value) return formatBenchmarkValue(metric, 0)
  const sign = value > 0 ? "+" : "-"
  return `${sign}${formatBenchmarkValue(metric, Math.abs(value))}`
}

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string
  value: string
  note?: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card>
      <CardContent className="flex min-h-28 items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 truncate text-2xl font-semibold tracking-normal">
            {value}
          </p>
          {note ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {note}
            </p>
          ) : null}
        </div>
        <div className="flex size-11 shrink-0 items-center justify-center rounded-md border bg-muted/40">
          <Icon className="size-5 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyBlock({ label }: { label: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed bg-muted/20 text-sm text-muted-foreground">
      {label}
    </div>
  )
}

function RevenueChart({
  data,
}: {
  data: AdminRestaurantIntelligence["sales"]["trend"]
}) {
  if (!data.length) return <EmptyBlock label="No trend data in this window." />

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: 4, right: 12, top: 12 }}>
          <defs>
            <linearGradient id="revenueFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="#0f766e" stopOpacity={0.28} />
              <stop offset="95%" stopColor="#0f766e" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} width={58} />
          <Tooltip
            formatter={(value, name) => [
              name === "revenue"
                ? formatMoney(Number(value))
                : formatNumber(Number(value)),
              name,
            ]}
          />
          <Area
            dataKey="revenue"
            stroke="#0f766e"
            fill="url(#revenueFill)"
            strokeWidth={2}
            type="monotone"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function StatusChart({
  data,
}: {
  data: AdminRestaurantIntelligence["sales"]["statusDistribution"]
}) {
  if (!data.length) return <EmptyBlock label="No status data yet." />

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 4, right: 12, top: 12 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} width={42} />
          <Tooltip formatter={(value) => formatNumber(Number(value))} />
          <Bar dataKey="count" fill="#2563eb" radius={[5, 5, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function AvailabilityChart({
  data,
}: {
  data: AdminRestaurantIntelligence["availability"]["daily"]
}) {
  if (!data.length) return <EmptyBlock label="No availability sessions in this window." />

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 4, right: 12, top: 12 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} width={42} />
          <Tooltip
            formatter={(value, name) => [
              name === "onlineHours" || name === "scheduledHours"
                ? `${Number(value).toFixed(2)}h`
                : formatNumber(Number(value)),
              name === "onlineHours"
                ? "Actual online"
                : name === "scheduledHours"
                  ? "Scheduled open"
                  : name,
            ]}
          />
          <Bar dataKey="scheduledHours" fill="#cbd5e1" radius={[5, 5, 0, 0]} />
          <Bar dataKey="onlineHours" fill="#16a34a" radius={[5, 5, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function NextActionsPanel({
  actions,
  onOpenAction,
}: {
  actions: RestaurantNextAction[]
  onOpenAction: (action: RestaurantNextAction) => void
}) {
  const criticalCount = actions.filter(
    (action) => action.priority === "critical"
  ).length
  const warningCount = actions.filter(
    (action) => action.priority === "warning"
  ).length
  const opportunityCount = actions.filter(
    (action) => action.priority === "opportunity"
  ).length

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CircleAlert className="size-4 text-muted-foreground" />
              Action required
            </CardTitle>
            <CardDescription>
              Prioritized next steps from availability, orders, finance, menu,
              and quality signals.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge
              variant="outline"
              className="border-rose-200 bg-rose-50 text-rose-700"
            >
              {criticalCount} critical
            </Badge>
            <Badge
              variant="outline"
              className="border-amber-200 bg-amber-50 text-amber-700"
            >
              {warningCount} warning
            </Badge>
            <Badge
              variant="outline"
              className="border-emerald-200 bg-emerald-50 text-emerald-700"
            >
              {opportunityCount} opportunity
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {actions.length ? (
          actions.map((action) => (
            <div
              key={action.id}
              className={`rounded-md border border-l-4 p-3 ${nextActionPanelTone(
                action.priority
              )}`}
            >
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={nextActionTone(action.priority)}
                    >
                      {action.priority}
                    </Badge>
                    <Badge variant="secondary">
                      {domainLabel(action.domain)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {action.metricLabel}: {action.metricValue}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold">{action.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {action.description}
                    </p>
                  </div>
                  <div className="grid gap-2 text-sm md:grid-cols-2">
                    <div className="rounded-md bg-muted/40 p-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        Impact
                      </p>
                      <p className="mt-1">{action.impact}</p>
                    </div>
                    <div className="rounded-md bg-muted/40 p-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        Recommended action
                      </p>
                      <p className="mt-1">{action.recommendation}</p>
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={action.priority === "critical" ? "default" : "outline"}
                  className="w-full xl:w-auto"
                  onClick={() => onOpenAction(action)}
                >
                  {action.actionLabel}
                  <ArrowUpRight className="size-3.5" />
                </Button>
              </div>
            </div>
          ))
        ) : (
          <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-medium">No immediate action required</p>
              <p className="mt-1 text-sm">
                Availability, order timing, menu review, finance, and quality
                signals do not show an urgent issue in this window.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function BenchmarkPanel({
  benchmark,
}: {
  benchmark: AdminRestaurantIntelligence["benchmark"]
}) {
  const needsAttention = benchmark.metrics.filter(
    (metric) => metric.status === "needs_attention" || metric.status === "watch"
  ).length
  const goodSignals = benchmark.metrics.filter(
    (metric) => metric.status === "excellent" || metric.status === "good"
  ).length

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Benchmark scope"
          value={
            benchmark.scope === "platform"
              ? "Platform"
              : benchmark.scope === "district"
                ? "District"
                : "Zone"
          }
          note={benchmark.scopeLabel}
          icon={BarChart3}
        />
        <MetricCard
          label="Peer restaurants"
          value={formatNumber(benchmark.peerCount)}
          note={`Minimum ${formatNumber(benchmark.minimumPeers)} peers`}
          icon={Store}
        />
        <MetricCard
          label="Signals needing attention"
          value={formatNumber(needsAttention)}
          note={`${formatNumber(goodSignals)} healthy signals`}
          icon={ShieldAlert}
        />
        <MetricCard
          label="Order sample"
          value={formatNumber(benchmark.orderSample.loadedOrders)}
          note={
            benchmark.orderSample.truncated
              ? "Sample truncated"
              : "Peer orders loaded"
          }
          icon={Package}
        />
      </div>

      {benchmark.status === "insufficient_data" ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Benchmark is shown with limited confidence because this cohort has
          fewer than {formatNumber(benchmark.minimumPeers)} peer restaurants.
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Peer benchmark</CardTitle>
          <CardDescription>
            Compared with {formatNumber(benchmark.peerCount)} restaurants in{" "}
            {benchmark.scopeLabel}. Generated{" "}
            {formatDateTime(benchmark.generatedAt)}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {benchmark.metrics.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead>This restaurant</TableHead>
                  <TableHead>Peer median</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Recommended action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {benchmark.metrics.map((metric) => (
                  <TableRow key={metric.key}>
                    <TableCell>
                      <div className="font-medium">{metric.label}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {domainLabel(metric.domain)} ·{" "}
                        {metric.direction === "higher_better"
                          ? "Higher is better"
                          : "Lower is better"}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatBenchmarkValue(metric, metric.current)}
                    </TableCell>
                    <TableCell>
                      <div>{formatBenchmarkValue(metric, metric.peerMedian)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Avg {formatBenchmarkValue(metric, metric.peerAverage)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {metric.status === "not_available" ? (
                        <span className="text-sm text-muted-foreground">-</span>
                      ) : (
                        <div>
                          <div className="font-medium">
                            Better than {metric.percentile}%
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Δ median{" "}
                            {formatBenchmarkDelta(metric, metric.deltaFromMedian)}
                          </div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`capitalize ${benchmarkStatusTone(
                          metric.status
                        )}`}
                      >
                        {benchmarkStatusLabel(metric.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-md">
                      <div className="text-sm">{metric.recommendation}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {metric.summary}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyBlock label="No benchmark data available yet." />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function InsightRail({ data }: { data: AdminRestaurantIntelligence }) {
  const restaurant = data.restaurant

  return (
    <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
      <Card>
        <CardHeader className="space-y-3 pb-3">
          <div className="flex items-start gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
              {restaurant.logoUrl ? (
                <img
                  src={restaurant.logoUrl}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                <Store className="size-5 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate text-base">
                {restaurant.name}
              </CardTitle>
              <CardDescription className="line-clamp-2">
                {restaurant.address || restaurant.city || "No address"}
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge
              variant="outline"
              className={
                data.health.isOnline
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-slate-50 text-slate-700"
              }
            >
              {data.health.isOnline ? "Online" : "Offline"}
            </Badge>
            <Badge
              variant="outline"
              className={
                data.health.isVisible
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              }
            >
              {data.health.isVisible ? "Visible" : "Hidden"}
            </Badge>
            <Badge variant="outline" className={statusTone(data.health.enforcementStatus)}>
              {data.health.enforcementStatus.replaceAll("_", " ")}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Profile completion</span>
              <span className="font-medium">
                {data.health.profileCompletionPercentage}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-emerald-600"
                style={{
                  width: `${Math.min(100, data.health.profileCompletionPercentage)}%`,
                }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-md border p-3">
              <p className="text-muted-foreground">Open support</p>
              <p className="mt-1 text-lg font-semibold">
                {data.health.openSupportCases}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-muted-foreground">Late live</p>
              <p className="mt-1 text-lg font-semibold">
                {data.health.lateLiveOrders}
              </p>
            </div>
          </div>
          {data.health.riskItems.length ? (
            <div className="space-y-2">
              {data.health.riskItems.map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800"
                >
                  <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              No critical restaurant risk in this window.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Finance source</CardTitle>
          <CardDescription>Reconciled restaurant ledger</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Available</span>
            <span className="font-medium">
              {formatMoney(data.finance.availableBalance)}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Pending</span>
            <span className="font-medium">
              {formatMoney(data.finance.pendingBalance)}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Paid out</span>
            <span className="font-medium">
              {formatMoney(data.finance.paidOutBalance)}
            </span>
          </div>
        </CardContent>
      </Card>
    </aside>
  )
}

export function RestaurantIntelligencePage() {
  const navigate = useNavigate()
  const { restaurantId = "" } = useParams()
  const [preset, setPreset] =
    React.useState<AdminRestaurantOrderDateFilterPreset>("last30Days")
  const [from, setFrom] = React.useState("")
  const [to, setTo] = React.useState("")
  const [status, setStatus] = React.useState<IntelligenceStatusFilter>("all")
  const [paymentMethod, setPaymentMethod] = React.useState("all")
  const [categoryId, setCategoryId] = React.useState("all")
  const [itemId, setItemId] = React.useState("all")
  const [customerTier, setCustomerTier] =
    React.useState<CustomerTierFilter>("all")
  const [activeTab, setActiveTab] = React.useState<IntelligenceTab>("overview")
  const [availabilityEvent, setAvailabilityEvent] =
    React.useState<AvailabilityEventFilter>("all")
  const [availabilitySource, setAvailabilitySource] =
    React.useState<AvailabilitySourceFilter>("all")
  const [availabilityReason, setAvailabilityReason] =
    React.useState<AvailabilityReasonFilter>("all")
  const [availabilityRisk, setAvailabilityRisk] =
    React.useState<AvailabilityRiskFilter>("all")

  const intelligenceQuery = useQuery({
    queryKey: [
      "admin-restaurant-intelligence",
      restaurantId,
      preset,
      from,
      to,
      status,
      paymentMethod,
      categoryId,
      itemId,
      customerTier,
      availabilityEvent,
      availabilitySource,
      availabilityReason,
      availabilityRisk,
    ],
    enabled: Boolean(restaurantId),
    queryFn: () =>
      getAdminRestaurantIntelligence(restaurantId, {
        preset,
        from,
        to,
        status,
        paymentMethod,
        categoryId,
        itemId,
        customerTier,
        availabilityEvent,
        availabilitySource,
        availabilityReason,
        availabilityRisk,
      }),
  })

  const data = intelligenceQuery.data
  const filteredItems = React.useMemo(() => {
    const items = data?.menu.items ?? []
    if (categoryId === "all") return items
    return items.filter((item) => item.categoryId === categoryId)
  }, [categoryId, data?.menu.items])
  const handleOpenAction = React.useCallback(
    (action: RestaurantNextAction) => {
      if (action.targetTab) {
        setActiveTab(action.targetTab)
        return
      }
      if (action.path) {
        navigate(action.path)
      }
    },
    [navigate]
  )

  if (intelligenceQuery.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Restaurant intelligence unavailable</CardTitle>
          <CardDescription>
            The restaurant may have been removed or is outside your service
            area.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" onClick={() => navigate("/restaurants")}>
            <ArrowLeft className="size-4" />
            Back to restaurants
          </Button>
        </CardContent>
      </Card>
    )
  }

  const restaurant = data.restaurant

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <Button
            type="button"
            variant="ghost"
            className="px-0"
            onClick={() => navigate("/restaurants")}
          >
            <ArrowLeft className="size-4" />
            Restaurants
          </Button>
          <div>
            <h1 className="truncate text-3xl font-semibold tracking-normal">
              {restaurant.name}
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Full restaurant performance, menu, customer, quality, and finance
              intelligence.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => intelligenceQuery.refetch()}
          >
            <RefreshCw className="size-4" />
            Refresh
          </Button>
          <Button type="button" onClick={() => navigate("/finance")}>
            <WalletCards className="size-4" />
            Finance
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Filter className="size-4 text-muted-foreground" />
            Analysis filters
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:flex xl:flex-wrap xl:justify-end">
            <AdminDateRangeFilter
              value={preset}
              from={from}
              to={to}
              allowedPresets={presetOptions}
              triggerClassName="lg:w-36"
              onPresetChange={setPreset}
              onRangeChange={(range) => {
                setFrom(range.from)
                setTo(range.to)
              }}
            />
            <Select
              value={status}
              onValueChange={(value) =>
                setStatus(value as IntelligenceStatusFilter)
              }
            >
              <SelectTrigger className="w-full xl:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All orders</SelectItem>
                <SelectItem value="live">Live orders</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger className="w-full xl:w-40">
                <SelectValue placeholder="Payment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All payments</SelectItem>
                <SelectItem value="Cash">COD</SelectItem>
                <SelectItem value="bKash">bKash</SelectItem>
                <SelectItem value="Bkash">Bkash</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={categoryId}
              onValueChange={(value) => {
                setCategoryId(value)
                setItemId("all")
              }}
            >
              <SelectTrigger className="w-full xl:w-48">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {data.menu.categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={itemId} onValueChange={setItemId}>
              <SelectTrigger className="w-full xl:w-52">
                <SelectValue placeholder="Menu item" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All items</SelectItem>
                {filteredItems.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={customerTier}
              onValueChange={(value) =>
                setCustomerTier(value as CustomerTierFilter)
              }
            >
              <SelectTrigger className="w-full xl:w-40">
                <SelectValue placeholder="Customers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All customers</SelectItem>
                <SelectItem value="new">New only</SelectItem>
                <SelectItem value="repeat">Repeat only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {data.sample.truncated ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Showing {formatNumber(data.sample.loadedOrders)} of{" "}
          {formatNumber(data.sample.matchingOrders)} matching orders. Narrow the
          date range for deeper item/customer analysis.
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <InsightRail data={data} />

        <div className="min-w-0 space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Gross sales"
              value={formatMoney(data.sales.summary.grossRevenue)}
              note={`${formatNumber(data.sales.summary.deliveredOrders)} delivered`}
              icon={Banknote}
            />
            <MetricCard
              label="Net earnings"
              value={formatMoney(data.finance.windowNetEarnings)}
              note="Ledger synced"
              icon={WalletCards}
            />
            <MetricCard
              label="Avg acceptance"
              value={formatMinutes(data.performance.averageAcceptanceMinutes)}
              note={`${data.performance.acceptedWithin5MinutesRate}% within 5 min`}
              icon={Clock3}
            />
            <MetricCard
              label="Repeat customers"
              value={`${data.customers.repeatRate}%`}
              note={`${formatNumber(data.customers.repeatCustomers)} repeat customers`}
              icon={Users}
            />
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as IntelligenceTab)}
            className="space-y-4"
          >
            <TabsList className="flex h-auto flex-wrap justify-start">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="availability">Availability</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
              <TabsTrigger value="sales">Sales</TabsTrigger>
              <TabsTrigger value="benchmark">Benchmark</TabsTrigger>
              <TabsTrigger value="menu">Menu</TabsTrigger>
              <TabsTrigger value="customers">Customers</TabsTrigger>
              <TabsTrigger value="finance">Finance</TabsTrigger>
              <TabsTrigger value="quality">Quality</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <NextActionsPanel
                actions={data.actions ?? []}
                onOpenAction={handleOpenAction}
              />
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Sales trend</CardTitle>
                    <CardDescription>
                      Delivered revenue by order activity window.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <RevenueChart data={data.sales.trend} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Order mix</CardTitle>
                    <CardDescription>Status distribution</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <StatusChart data={data.sales.statusDistribution} />
                  </CardContent>
                </Card>
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle>Hero product</CardTitle>
                    <CardDescription>Best revenue item in window</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.menu.heroProduct ? (
                      <div className="flex items-center gap-4">
                        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                          {data.menu.heroProduct.imageUrl ? (
                            <img
                              src={data.menu.heroProduct.imageUrl}
                              alt=""
                              className="size-full object-cover"
                            />
                          ) : (
                            <Package className="size-6 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">
                            {data.menu.heroProduct.name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {formatNumber(data.menu.heroProduct.quantity)} sold
                            · {formatMoney(data.menu.heroProduct.revenue)}
                          </p>
                          <Badge
                            variant="outline"
                            className="mt-2 capitalize"
                          >
                            {data.menu.heroProduct.availability}
                          </Badge>
                        </div>
                      </div>
                    ) : (
                      <EmptyBlock label="No delivered item data yet." />
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Menu health</CardTitle>
                    <CardDescription>Coverage and availability</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-md border p-3">
                      <p className="text-muted-foreground">Active items</p>
                      <p className="mt-1 text-xl font-semibold">
                        {data.menu.counts.activeItems}
                      </p>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-muted-foreground">Unavailable</p>
                      <p className="mt-1 text-xl font-semibold">
                        {data.menu.counts.unavailableItems}
                      </p>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-muted-foreground">Categories</p>
                      <p className="mt-1 text-xl font-semibold">
                        {data.menu.counts.totalCategories}
                      </p>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-muted-foreground">Popular</p>
                      <p className="mt-1 text-xl font-semibold">
                        {data.menu.counts.popularItems}
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Owner</CardTitle>
                    <CardDescription>Account and contact</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div>
                      <p className="font-medium">{restaurant.owner.fullName}</p>
                      <p className="text-muted-foreground">
                        {restaurant.owner.phone || restaurant.owner.email}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{restaurant.owner.status}</Badge>
                      <Badge variant="outline">
                        {restaurant.owner.restaurantLifecycleStatus}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground">
                      Last login: {formatDateTime(restaurant.owner.lastLoginAt)}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="availability" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                <MetricCard
                  label="Current status"
                  value={data.health.isOnline ? "Online" : "Offline"}
                  note={
                    data.health.isOnline &&
                    data.availability.summary.currentSessionStartedAt
                      ? `Since ${formatDateTime(data.availability.summary.currentSessionStartedAt)}`
                      : `Last offline ${formatDateTime(data.availability.summary.lastOfflineAt)}`
                  }
                  icon={Power}
                />
                <MetricCard
                  label="Today online"
                  value={formatDuration(data.availability.summary.todayOnlineSeconds)}
                  note="Actual availability"
                  icon={Clock3}
                />
                <MetricCard
                  label="Window online"
                  value={formatDuration(
                    data.availability.summary.windowOnlineSeconds
                  )}
                  note={`${formatNumber(data.availability.summary.sessionCount)} sessions`}
                  icon={BarChart3}
                />
                <MetricCard
                  label="Schedule compliance"
                  value={`${data.availability.summary.scheduledComplianceRate}%`}
                  note={`${formatDuration(
                    data.availability.summary.scheduledWindowSeconds
                  )} scheduled`}
                  icon={BarChart3}
                />
                <MetricCard
                  label="Missed scheduled"
                  value={formatDuration(
                    data.availability.summary.missedScheduledSeconds
                  )}
                  note={
                    data.availability.summary.temporaryClosureActive
                      ? "Temporary closure"
                      : data.availability.summary.scheduledOpenNow
                        ? "Scheduled open now"
                        : "Not scheduled now"
                  }
                  icon={Clock3}
                />
                <MetricCard
                  label="Offline with live orders"
                  value={formatNumber(
                    data.availability.summary.offlineWithLiveOrdersCount
                  )}
                  note={`${formatNumber(data.availability.summary.shortSessionCount)} short sessions`}
                  icon={ShieldAlert}
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Availability alerts</CardTitle>
                  <CardDescription>
                    Active schedule and live-order risks for this restaurant.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.availability.alerts.map((alert) => (
                    <div
                      key={alert.key}
                      className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{alert.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {alert.description}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={alertTone(alert.severity)}
                      >
                        {alert.severity}
                      </Badge>
                    </div>
                  ))}
                  {!data.availability.alerts.length ? (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                      No active availability alerts in this window.
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <CardTitle>Availability filters</CardTitle>
                      <CardDescription>
                        Filter online/offline events by surface, reason, and
                        risk.
                      </CardDescription>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setAvailabilityEvent("all")
                        setAvailabilitySource("all")
                        setAvailabilityReason("all")
                        setAvailabilityRisk("all")
                      }}
                    >
                      Reset
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Select
                    value={availabilityEvent}
                    onValueChange={(value) =>
                      setAvailabilityEvent(value as AvailabilityEventFilter)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Event" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All events</SelectItem>
                      <SelectItem value="online">Online events</SelectItem>
                      <SelectItem value="offline">Offline events</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={availabilitySource}
                    onValueChange={(value) =>
                      setAvailabilitySource(value as AvailabilitySourceFilter)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All sources</SelectItem>
                      <SelectItem value="owner_app">Owner app</SelectItem>
                      <SelectItem value="owner_web">Owner web</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                      <SelectItem value="unknown">Unknown</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={availabilityReason}
                    onValueChange={(value) =>
                      setAvailabilityReason(value as AvailabilityReasonFilter)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Reason" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All reasons</SelectItem>
                      <SelectItem value="manual_offline">Manual offline</SelectItem>
                      <SelectItem value="admin_offline">Admin offline</SelectItem>
                      <SelectItem value="enforcement">Enforcement</SelectItem>
                      <SelectItem value="restaurant_hidden">
                        Restaurant hidden
                      </SelectItem>
                      <SelectItem value="replaced">Replaced</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={availabilityRisk}
                    onValueChange={(value) =>
                      setAvailabilityRisk(value as AvailabilityRiskFilter)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Risk" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All risk</SelectItem>
                      <SelectItem value="offline_with_live_orders">
                        Offline with live orders
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <Card>
                  <CardHeader>
                    <CardTitle>Scheduled vs actual online hours</CardTitle>
                    <CardDescription>
                      Compare expected opening hours with actual restaurant
                      online duration by day.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AvailabilityChart data={data.availability.daily} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Source mix</CardTitle>
                    <CardDescription>
                      Where status changes came from.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {data.availability.sourceBreakdown.map((source) => (
                      <div
                        key={source.source}
                        className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
                      >
                        <span>{sourceLabel(source.source)}</span>
                        <Badge variant="secondary">{source.count}</Badge>
                      </div>
                    ))}
                    {!data.availability.sourceBreakdown.length ? (
                      <p className="text-sm text-muted-foreground">
                        No matching events.
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Online/offline events</CardTitle>
                  <CardDescription>
                    Latest status changes for the selected window.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Event</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Session duration</TableHead>
                        <TableHead>Live orders</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.availability.events.map((event) => (
                        <TableRow key={event.id}>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                event.type === "online"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : event.activeOrderCount > 0
                                    ? "border-rose-200 bg-rose-50 text-rose-700"
                                    : "border-slate-200 bg-slate-50 text-slate-700"
                              }
                            >
                              {event.type}
                            </Badge>
                          </TableCell>
                          <TableCell>{sourceLabel(event.source)}</TableCell>
                          <TableCell className="capitalize">
                            {reasonLabel(event.reason)}
                          </TableCell>
                          <TableCell>{formatDateTime(event.occurredAt)}</TableCell>
                          <TableCell>
                            {event.type === "offline"
                              ? formatDuration(event.durationSeconds)
                              : "-"}
                          </TableCell>
                          <TableCell>
                            <div>{formatNumber(event.activeOrderCount)}</div>
                            {event.activeOrderNumbers.length ? (
                              <div className="max-w-72 truncate text-xs text-muted-foreground">
                                {event.activeOrderNumbers.join(", ")}
                              </div>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                      {!data.availability.events.length ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-24 text-center">
                            No matching availability events.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent sessions</CardTitle>
                  <CardDescription>
                    Open and closed availability sessions.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Started</TableHead>
                        <TableHead>Ended</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Start source</TableHead>
                        <TableHead>End source</TableHead>
                        <TableHead>End reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.availability.sessions.map((session) => (
                        <TableRow key={session.id}>
                          <TableCell>{formatDateTime(session.startedAt)}</TableCell>
                          <TableCell>
                            {session.status === "online"
                              ? "Still online"
                              : formatDateTime(session.endedAt)}
                          </TableCell>
                          <TableCell>
                            {formatDuration(session.durationSeconds)}
                          </TableCell>
                          <TableCell>{sourceLabel(session.startSource)}</TableCell>
                          <TableCell>{sourceLabel(session.endSource)}</TableCell>
                          <TableCell className="capitalize">
                            {reasonLabel(session.endReason)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {!data.availability.sessions.length ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-24 text-center">
                            No availability session has been recorded yet.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="performance" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Accept avg"
                  value={formatMinutes(data.performance.averageAcceptanceMinutes)}
                  note={`Median ${formatMinutes(data.performance.medianAcceptanceMinutes)}`}
                  icon={Clock3}
                />
                <MetricCard
                  label="Prep avg"
                  value={formatMinutes(data.performance.averagePreparationMinutes)}
                  note={`Target ${data.performance.preparationTargetMinutes} min`}
                  icon={Clock3}
                />
                <MetricCard
                  label="Ready from order"
                  value={formatMinutes(data.performance.averageReadyFromOrderMinutes)}
                  note="Order to ready"
                  icon={BarChart3}
                />
                <MetricCard
                  label="Late prep"
                  value={formatNumber(data.performance.latePreparationOrders)}
                  note={`${data.performance.readyWithinEstimateRate}% within target`}
                  icon={ShieldAlert}
                />
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>Slowest orders</CardTitle>
                  <CardDescription>
                    Orders with the longest service or preparation time.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Accept</TableHead>
                        <TableHead>Prep</TableHead>
                        <TableHead>Total service</TableHead>
                        <TableHead>Placed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.performance.slowestOrders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">
                            {order.orderNumber}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={statusTone(order.status)}
                            >
                              {order.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {order.acceptanceMinutes === null
                              ? "-"
                              : formatMinutes(order.acceptanceMinutes)}
                          </TableCell>
                          <TableCell>
                            {order.preparationMinutes === null
                              ? "-"
                              : formatMinutes(order.preparationMinutes)}
                          </TableCell>
                          <TableCell>
                            {order.totalServiceMinutes === null
                              ? "-"
                              : formatMinutes(order.totalServiceMinutes)}
                          </TableCell>
                          <TableCell>{formatDateTime(order.createdAt)}</TableCell>
                        </TableRow>
                      ))}
                      {!data.performance.slowestOrders.length ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-24 text-center">
                            No timing samples in this window.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sales" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Total orders"
                  value={formatNumber(data.sales.summary.orders)}
                  note={`${formatNumber(data.sales.summary.liveOrders)} live`}
                  icon={Store}
                />
                <MetricCard
                  label="AOV"
                  value={formatMoney(data.sales.summary.averageOrderValue)}
                  note="Average delivered order"
                  icon={Banknote}
                />
                <MetricCard
                  label="Cancelled"
                  value={formatNumber(data.sales.summary.cancelledOrders)}
                  note={`${data.sales.summary.cancellationRate}% cancel or reject`}
                  icon={ShieldAlert}
                />
                <MetricCard
                  label="Payments"
                  value={formatNumber(data.sales.paymentMethods.length)}
                  note="Methods used"
                  icon={WalletCards}
                />
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>Daily revenue</CardTitle>
                  <CardDescription>Revenue trend for selected filters</CardDescription>
                </CardHeader>
                <CardContent>
                  <RevenueChart data={data.sales.trend} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Payment methods</CardTitle>
                  <CardDescription>Orders and delivered revenue</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Method</TableHead>
                        <TableHead>Orders</TableHead>
                        <TableHead>Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.sales.paymentMethods.map((method) => (
                        <TableRow key={method.method}>
                          <TableCell className="font-medium">
                            {method.method}
                          </TableCell>
                          <TableCell>{formatNumber(method.orders)}</TableCell>
                          <TableCell>{formatMoney(method.revenue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="benchmark" className="space-y-4">
              {data.benchmark ? (
                <BenchmarkPanel benchmark={data.benchmark} />
              ) : (
                <EmptyBlock label="Benchmark data is not available yet." />
              )}
            </TabsContent>

            <TabsContent value="menu" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Top selling products</CardTitle>
                  <CardDescription>
                    Item revenue, order count, and category.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Orders</TableHead>
                        <TableHead>Revenue</TableHead>
                        <TableHead>Last sold</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.menu.topItems.map((item) => (
                        <TableRow key={item.itemId}>
                          <TableCell className="font-medium">
                            {item.name}
                          </TableCell>
                          <TableCell>{item.categoryName}</TableCell>
                          <TableCell>{formatNumber(item.quantity)}</TableCell>
                          <TableCell>{formatNumber(item.orders)}</TableCell>
                          <TableCell>{formatMoney(item.revenue)}</TableCell>
                          <TableCell>{formatDateTime(item.lastSoldAt)}</TableCell>
                        </TableRow>
                      ))}
                      {!data.menu.topItems.length ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-24 text-center">
                            No delivered menu sales yet.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Unavailable items</CardTitle>
                  <CardDescription>Items currently unavailable</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2 md:grid-cols-2">
                    {data.menu.unavailableItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
                      >
                        <span className="truncate font-medium">{item.name}</span>
                        <span className="text-muted-foreground">
                          {formatMoney(item.basePrice)}
                        </span>
                      </div>
                    ))}
                    {!data.menu.unavailableItems.length ? (
                      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                        No unavailable item in the current menu sample.
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="customers" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <MetricCard
                  label="Ordering customers"
                  value={formatNumber(data.customers.totalCustomers)}
                  note="Selected window"
                  icon={Users}
                />
                <MetricCard
                  label="New customers"
                  value={formatNumber(data.customers.newCustomers)}
                  note="One order in window"
                  icon={Users}
                />
                <MetricCard
                  label="Repeat customers"
                  value={formatNumber(data.customers.repeatCustomers)}
                  note={`${data.customers.repeatRate}% repeat rate`}
                  icon={Users}
                />
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>Top customers</CardTitle>
                  <CardDescription>Spend and order behavior</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead>Orders</TableHead>
                        <TableHead>Delivered</TableHead>
                        <TableHead>Spend</TableHead>
                        <TableHead>AOV</TableHead>
                        <TableHead>Last order</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.customers.topCustomers.map((customer) => (
                        <TableRow key={customer.customerId}>
                          <TableCell>
                            <div className="font-medium">{customer.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {customer.phone || "No phone"}
                            </div>
                          </TableCell>
                          <TableCell>{formatNumber(customer.orders)}</TableCell>
                          <TableCell>
                            {formatNumber(customer.deliveredOrders)}
                          </TableCell>
                          <TableCell>{formatMoney(customer.totalSpend)}</TableCell>
                          <TableCell>
                            {formatMoney(customer.averageOrderValue)}
                          </TableCell>
                          <TableCell>
                            {formatDateTime(customer.lastOrderedAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {!data.customers.topCustomers.length ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-24 text-center">
                            No customer history in this window.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="finance" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Lifetime gross"
                  value={formatMoney(data.finance.grossDeliveredRevenue)}
                  note="Delivered orders"
                  icon={Banknote}
                />
                <MetricCard
                  label="Lifetime net"
                  value={formatMoney(data.finance.totalNetEarnings)}
                  note="After commission"
                  icon={WalletCards}
                />
                <MetricCard
                  label="Outstanding"
                  value={formatMoney(data.finance.totalOutstandingToRestaurant)}
                  note="Available + pending"
                  icon={WalletCards}
                />
                <MetricCard
                  label="Commission"
                  value={formatMoney(data.finance.totalCommission)}
                  note={`${restaurant.commissionRate}% current rate`}
                  icon={Banknote}
                />
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>Payout history</CardTitle>
                  <CardDescription>
                    Recent payouts from the reconciled finance ledger.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Batch</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Provider ref</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead>Processed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.finance.recentPayouts.map((payout) => (
                        <TableRow key={payout.id}>
                          <TableCell className="font-medium">
                            {payout.batchReference || payout.id}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={statusTone(payout.status)}
                            >
                              {payout.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatMoney(payout.amount)}</TableCell>
                          <TableCell>
                            {payout.providerReference ||
                              payout.providerTransactionId ||
                              "-"}
                          </TableCell>
                          <TableCell>{formatDateTime(payout.requestedAt)}</TableCell>
                          <TableCell>{formatDateTime(payout.processedAt)}</TableCell>
                        </TableRow>
                      ))}
                      {!data.finance.recentPayouts.length ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-24 text-center">
                            No payout history yet.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="quality" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <MetricCard
                  label="Average rating"
                  value={data.quality.averageRating.toFixed(1)}
                  note={`${formatNumber(data.quality.reviewCount)} reviews`}
                  icon={Star}
                />
                <MetricCard
                  label="Hidden reviews"
                  value={formatNumber(data.quality.hiddenReviews)}
                  note="Recent moderation sample"
                  icon={Eye}
                />
                <MetricCard
                  label="Support cases"
                  value={formatNumber(data.quality.support.summary.total)}
                  note={`${data.quality.support.summary.open} open`}
                  icon={ShieldAlert}
                />
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>Recent reviews</CardTitle>
                  <CardDescription>Moderation and owner reply status</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.quality.recentReviews.map((review) => (
                    <div key={review.id} className="rounded-md border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{review.rating} star</Badge>
                        {review.isHidden ? (
                          <Badge
                            variant="outline"
                            className="border-rose-200 bg-rose-50 text-rose-700"
                          >
                            Hidden
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-emerald-200 bg-emerald-50 text-emerald-700"
                          >
                            Visible
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(review.createdAt)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm">{review.comment || "No comment"}</p>
                      {review.ownerReplyMessage ? (
                        <p className="mt-2 rounded-md bg-muted p-2 text-xs">
                          Owner reply: {review.ownerReplyMessage}
                        </p>
                      ) : null}
                    </div>
                  ))}
                  {!data.quality.recentReviews.length ? (
                    <EmptyBlock label="No recent reviews." />
                  ) : null}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="timeline" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Recent orders</CardTitle>
                  <CardDescription>Latest operational order events</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Placed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.operations.recentOrders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">
                            {order.orderNumber}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={statusTone(order.status)}
                            >
                              {order.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{order.customerName || "-"}</TableCell>
                          <TableCell>{formatMoney(order.total)}</TableCell>
                          <TableCell>{formatDateTime(order.createdAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Admin audit trail</CardTitle>
                  <CardDescription>Recent admin actions on restaurant</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.operations.auditLogs.map((log) => (
                    <div key={log.id} className="rounded-md border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{log.title || log.action}</p>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(log.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {log.description || "No description"}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        By {log.actorName}
                      </p>
                    </div>
                  ))}
                  {!data.operations.auditLogs.length ? (
                    <EmptyBlock label="No admin audit events yet." />
                  ) : null}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
