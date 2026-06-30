import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Activity,
  AlertTriangle,
  Clock3,
  Gauge,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  TimerReset,
  UsersRound,
} from "lucide-react"
import { toast } from "sonner"

import {
  getAdminRateLimitSnapshot,
  resetAdminRateLimitBucket,
  type AdminRateLimitSnapshot,
} from "@/lib/admin-api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

const RATE_LIMIT_REFRESH_MS = 10_000

type Limiter = AdminRateLimitSnapshot["limiters"][number]
type Bucket = Limiter["buckets"][number]
type OrderRequestRow = AdminRateLimitSnapshot["orderRequests"]["orders"][number]
type TrafficSnapshot = AdminRateLimitSnapshot["traffic"]
type TrafficRange = TrafficSnapshot["range"]
type TrafficApp = TrafficSnapshot["app"]
type PendingBucketReset = { limiter: Limiter; bucket: Bucket }

const TRAFFIC_RANGE_OPTIONS: Array<{ label: string; value: TrafficRange }> = [
  { label: "60s", value: "60s" },
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "1h", value: "1h" },
  { label: "6h", value: "6h" },
  { label: "24h", value: "24h" },
]

const TRAFFIC_APP_OPTIONS: Array<{ label: string; value: TrafficApp }> = [
  { label: "All", value: "all" },
  { label: "Customer", value: "customer" },
  { label: "Rider", value: "rider" },
  { label: "Owner", value: "owner" },
  { label: "Admin", value: "admin" },
  { label: "Public", value: "public" },
  { label: "System", value: "system" },
]

function formatWindow(ms: number) {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  return `${hours}h`
}

function formatReset(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "now"
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown"
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date)
}

function categoryBadgeVariant(category: Limiter["category"]) {
  if (category === "global") return "default" as const
  if (category === "auth") return "secondary" as const
  return "outline" as const
}

function usageTone(percent: number) {
  if (percent >= 90) return "bg-destructive"
  if (percent >= 70) return "bg-amber-500"
  return "bg-emerald-500"
}

function getTopBucket(limiter: Limiter): Bucket | undefined {
  return limiter.buckets[0]
}

function formatAppCounts(apps: Record<string, number>) {
  const appOrder = ["customer", "rider", "owner", "admin"]
  const ordered = [
    ...appOrder
      .filter((app) => apps[app])
      .map((app) => `${app} ${apps[app]}`),
    ...Object.entries(apps)
      .filter(([app]) => !appOrder.includes(app))
      .map(([app, count]) => `${app} ${count}`),
  ]
  return ordered.length ? ordered.join(" / ") : "-"
}

function formatStatusCounts(statusCounts: Record<string, number>) {
  const entries = Object.entries(statusCounts).sort(([left], [right]) =>
    left.localeCompare(right),
  )
  return entries.length
    ? entries.map(([status, count]) => `${status} ${count}`).join(" / ")
    : "-"
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: React.ElementType
  label: string
  value: string
  detail: string
}) {
  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="truncate text-lg font-semibold">{value}</div>
          <div className="truncate text-xs text-muted-foreground">{detail}</div>
        </div>
      </CardContent>
    </Card>
  )
}

function UsageBar({ percent }: { percent: number }) {
  const width = Math.max(0, Math.min(100, percent))
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full rounded-full ${usageTone(width)}`}
        style={{ width: `${width}%` }}
      />
    </div>
  )
}

function OrderRequestTable({
  orders,
  windowMinutes,
}: {
  orders: OrderRequestRow[]
  windowMinutes: number
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Active Order Request Pressure</CardTitle>
        <CardDescription>
          Rolling {windowMinutes}m API counts for order-specific customer, rider,
          owner, and admin traffic.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {orders.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>By app</TableHead>
                  <TableHead>Top actors</TableHead>
                  <TableHead>Top endpoints</TableHead>
                  <TableHead>Last seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.orderId}>
                    <TableCell className="min-w-44">
                      <div className="font-mono text-xs">{order.orderId}</div>
                      {order.errorRequests ? (
                        <div className="mt-1 text-xs text-destructive">
                          {order.errorRequests} errors
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-semibold">
                      {order.totalRequests}
                    </TableCell>
                    <TableCell className="min-w-52 text-sm">
                      {formatAppCounts(order.apps)}
                    </TableCell>
                    <TableCell className="min-w-56">
                      {order.actors.length ? (
                        <div className="space-y-1">
                          {order.actors.map((actor) => (
                            <div
                              key={actor.key}
                              className="flex items-center justify-between gap-3 text-xs"
                            >
                              <span className="font-mono">{actor.key}</span>
                              <span className="text-muted-foreground">
                                {actor.totalRequests}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          No signed-in actor
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="min-w-72">
                      {order.endpoints.length ? (
                        <div className="space-y-1">
                          {order.endpoints.map((endpoint) => (
                            <div
                              key={endpoint.key}
                              className="flex items-center justify-between gap-3 text-xs"
                            >
                              <span className="truncate">
                                {endpoint.method} {endpoint.route}
                              </span>
                              <span className="shrink-0 text-muted-foreground">
                                {endpoint.totalRequests}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {order.lastSeenAt ? formatDateTime(order.lastSeenAt) : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            No order-specific API traffic captured in this window.
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TrafficVisual({
  app,
  onAppChange,
  onRangeChange,
  range,
  traffic,
}: {
  app: TrafficApp
  onAppChange: (app: TrafficApp) => void
  onRangeChange: (range: TrafficRange) => void
  range: TrafficRange
  traffic: TrafficSnapshot
}) {
  const hottestEndpoint = traffic.endpoints[0]
  const busiestActor = traffic.actors[0]

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <CardTitle>API Traffic Visual</CardTitle>
            <CardDescription>
              All API calls captured by this backend process, including
              background refreshes and automatic app polling.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex flex-wrap gap-1 rounded-lg border bg-background p-1">
              {TRAFFIC_RANGE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={range === option.value ? "default" : "ghost"}
                  onClick={() => onRangeChange(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1 rounded-lg border bg-background p-1">
              {TRAFFIC_APP_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={app === option.value ? "default" : "ghost"}
                  onClick={() => onAppChange(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            icon={Activity}
            label="Total API calls"
            value={String(traffic.summary.totalRequests)}
            detail={`${traffic.summary.requestsPerMinute}/min, ${traffic.summary.requestsPerSecond}/sec`}
          />
          <SummaryCard
            icon={Gauge}
            label="Latency"
            value={`${traffic.summary.p95DurationMs}ms`}
            detail={`avg ${traffic.summary.averageDurationMs}ms`}
          />
          <SummaryCard
            icon={AlertTriangle}
            label="Rate limited"
            value={String(traffic.summary.rateLimitedRequests)}
            detail={`${traffic.summary.errorRequests} total errors`}
          />
          <SummaryCard
            icon={Clock3}
            label="Bucket size"
            value={`${traffic.bucketSeconds}s`}
            detail={`${traffic.retentionHours}h memory retention`}
          />
        </div>

        <div className="rounded-lg border p-3">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium">Request timeline</div>
              <div className="text-xs text-muted-foreground">
                {traffic.range} range, {traffic.bucketSeconds}s buckets
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Generated {formatDateTime(traffic.generatedAt)}
            </div>
          </div>
          <div className="flex h-28 items-end gap-1">
            {traffic.timeline.map((bucket) => {
              const height = bucket.totalRequests
                ? Math.max(8, bucket.intensityPercent)
                : 2
              return (
                <div
                  key={bucket.timestamp}
                  className="group relative flex flex-1 items-end"
                  title={`${formatDateTime(bucket.timestamp)}: ${bucket.totalRequests} requests, ${bucket.rateLimitedRequests} rate limited`}
                >
                  <div
                    className={
                      bucket.rateLimitedRequests
                        ? "w-full rounded-t bg-destructive"
                        : bucket.errorRequests
                          ? "w-full rounded-t bg-amber-500"
                          : "w-full rounded-t bg-primary"
                    }
                    style={{ height: `${height}%` }}
                  />
                </div>
              )
            })}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)]">
          <div className="space-y-4">
            <div className="rounded-lg border p-3">
              <div className="mb-3 text-sm font-medium">By app</div>
              {traffic.byApp.length ? (
                <div className="space-y-2">
                  {traffic.byApp.map((row) => (
                    <div key={row.app} className="space-y-1">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="capitalize">{row.app}</span>
                        <span className="font-medium">{row.totalRequests}</span>
                      </div>
                      <UsageBar
                        percent={
                          traffic.summary.totalRequests
                            ? Math.round(
                                (row.totalRequests /
                                  traffic.summary.totalRequests) *
                                  100,
                              )
                            : 0
                        }
                      />
                      <div className="text-xs text-muted-foreground">
                        {row.rateLimitedRequests} rate limited /{" "}
                        {row.errorRequests} errors
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  No API calls in this range.
                </div>
              )}
            </div>

            <div className="rounded-lg border p-3">
              <div className="mb-3 text-sm font-medium">Busiest actor</div>
              {busiestActor ? (
                <div className="space-y-1 text-sm">
                  <div className="font-mono text-xs">{busiestActor.key}</div>
                  <div className="font-medium">
                    {busiestActor.totalRequests} requests
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatAppCounts(busiestActor.apps)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {busiestActor.rateLimitedRequests} rate limited /{" "}
                    {busiestActor.errorRequests} errors
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  No signed-in or unauthenticated traffic captured.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-medium">Top endpoints</div>
              {hottestEndpoint ? (
                <div className="text-xs text-muted-foreground">
                  busiest: {hottestEndpoint.totalRequests}
                </div>
              ) : null}
            </div>
            {traffic.endpoints.length ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Endpoint</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>429</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>P95</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {traffic.endpoints.slice(0, 12).map((endpoint) => (
                      <TableRow key={endpoint.key}>
                        <TableCell className="min-w-72">
                          <div className="text-xs text-muted-foreground">
                            {endpoint.app}
                          </div>
                          <div className="font-mono text-xs">
                            {endpoint.method} {endpoint.route}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {endpoint.totalRequests}
                        </TableCell>
                        <TableCell
                          className={
                            endpoint.rateLimitedRequests
                              ? "font-medium text-destructive"
                              : ""
                          }
                        >
                          {endpoint.rateLimitedRequests}
                        </TableCell>
                        <TableCell className="min-w-40 text-xs">
                          {formatStatusCounts(endpoint.statusCounts)}
                        </TableCell>
                        <TableCell>{endpoint.p95DurationMs}ms</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                No endpoints captured in this range.
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function LimiterTable({
  limiters,
  onResetBucket,
  resetPending,
}: {
  limiters: Limiter[]
  onResetBucket: (limiter: Limiter, bucket: Bucket) => void
  resetPending: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Limiter Buckets</CardTitle>
        <CardDescription>
          Single-instance memory counters. A server restart clears these buckets.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Limiter</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Limit</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Top buckets</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {limiters.map((limiter) => {
                return (
                  <TableRow key={limiter.id}>
                    <TableCell className="min-w-56">
                      <div className="font-medium">{limiter.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {limiter.id}
                        {limiter.settingKey ? ` / ${limiter.settingKey}` : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={categoryBadgeVariant(limiter.category)}>
                        {limiter.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{limiter.limit}</div>
                      <div className="text-xs text-muted-foreground">
                        per {formatWindow(limiter.windowMs)}
                      </div>
                    </TableCell>
                    <TableCell>{limiter.activeBuckets}</TableCell>
                    <TableCell className="min-w-[34rem]">
                      {limiter.buckets.length ? (
                        <div className="space-y-2">
                          {limiter.buckets.map((bucket) => (
                            <div
                              key={bucket.resetToken}
                              className="rounded-lg border bg-muted/20 p-2"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="truncate font-mono text-xs">
                                      {bucket.key}
                                    </span>
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                      {bucket.totalHits}/{limiter.limit}
                                    </span>
                                  </div>
                                  <UsageBar percent={bucket.usedPercent} />
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    Resets in {formatReset(bucket.resetInSeconds)}
                                    , {bucket.remaining} left
                                  </div>
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={resetPending}
                                  onClick={() => onResetBucket(limiter, bucket)}
                                >
                                  <TimerReset className="size-3.5" />
                                  Reset
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          No active traffic
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

export function RateLimitsPage() {
  const queryClient = useQueryClient()
  const [pendingReset, setPendingReset] =
    React.useState<PendingBucketReset | null>(null)
  const [resetReason, setResetReason] = React.useState("")
  const [trafficRange, setTrafficRange] = React.useState<TrafficRange>("15m")
  const [trafficApp, setTrafficApp] = React.useState<TrafficApp>("all")
  const { data, isError, isFetching, isLoading, refetch } = useQuery({
    queryKey: ["admin-rate-limits", trafficRange, trafficApp],
    queryFn: () =>
      getAdminRateLimitSnapshot({ app: trafficApp, range: trafficRange }),
    refetchInterval: RATE_LIMIT_REFRESH_MS,
  })
  const resetMutation = useMutation({
    mutationFn: resetAdminRateLimitBucket,
    onSuccess: (result) => {
      toast.success(
        result.reset ? "Rate limit bucket reset" : "Bucket already expired",
      )
      setPendingReset(null)
      setResetReason("")
      void queryClient.invalidateQueries({
        queryKey: ["admin-rate-limits"],
      })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not reset rate limit bucket",
      )
    },
  })

  const limiters = data?.limiters ?? []
  const summary = React.useMemo(() => {
    const activeBuckets = limiters.reduce(
      (total, limiter) => total + limiter.activeBuckets,
      0,
    )
    const hotBuckets = limiters.flatMap((limiter) =>
      limiter.buckets.map((bucket) => ({
        ...bucket,
        limiter: limiter.label,
      })),
    )
    const hottestBucket = hotBuckets.sort(
      (left, right) => right.usedPercent - left.usedPercent,
    )[0]

    return { activeBuckets, hottestBucket }
  }, [limiters])
  const trimmedResetReason = resetReason.trim()

  const openResetDialog = React.useCallback(
    (limiter: Limiter, bucket: Bucket) => {
      resetMutation.reset()
      setResetReason("")
      setPendingReset({ limiter, bucket })
    },
    [resetMutation],
  )

  const closeResetDialog = React.useCallback(
    (open: boolean) => {
      if (open || resetMutation.isPending) return
      setPendingReset(null)
      setResetReason("")
    },
    [resetMutation.isPending],
  )

  const submitReset = React.useCallback(() => {
    if (!pendingReset || trimmedResetReason.length < 4) return
    resetMutation.mutate({
      limiterId: pendingReset.limiter.id,
      resetToken: pendingReset.bucket.resetToken,
      reason: trimmedResetReason,
    })
  }, [pendingReset, resetMutation, trimmedResetReason])

  if (isLoading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Rate Limits</h1>
          <p className="text-sm text-muted-foreground">
            Could not load limiter state from the backend.
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCcw className="size-4" />
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Rate Limits</h1>
          <p className="text-sm text-muted-foreground">
            Live counters for global, auth, coupon, order, rider, owner, admin,
            and order-specific API pressure.
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" disabled={isFetching}>
          {isFetching ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCcw className="size-4" />
          )}
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={data.enabled ? ShieldCheck : AlertTriangle}
          label="Limiter status"
          value={data.enabled ? "Enabled" : "Disabled"}
          detail={`Trust proxy hops ${data.trustProxyHops}`}
        />
        <SummaryCard
          icon={Gauge}
          label="Limiters"
          value={String(limiters.length)}
          detail="registered in this process"
        />
        <SummaryCard
          icon={UsersRound}
          label="Active buckets"
          value={String(summary.activeBuckets)}
          detail="user/IP windows currently open"
        />
        <SummaryCard
          icon={Clock3}
          label="Snapshot"
          value={formatDateTime(data.generatedAt)}
          detail={`auto refresh ${formatWindow(RATE_LIMIT_REFRESH_MS)}`}
        />
      </div>

      {summary.hottestBucket ? (
        <Card>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Activity className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {summary.hottestBucket.limiter}
                </div>
                <div className="truncate font-mono text-xs text-muted-foreground">
                  {summary.hottestBucket.key}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-4 text-sm">
              <div>
                <div className="font-semibold">
                  {summary.hottestBucket.usedPercent}%
                </div>
                <div className="text-xs text-muted-foreground">used</div>
              </div>
              <div>
                <div className="font-semibold">
                  {summary.hottestBucket.totalHits}
                </div>
                <div className="text-xs text-muted-foreground">requests</div>
              </div>
              <div>
                <div className="flex items-center gap-1 font-semibold">
                  <TimerReset className="size-3.5" />
                  {formatReset(summary.hottestBucket.resetInSeconds)}
                </div>
                <div className="text-xs text-muted-foreground">reset</div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <TrafficVisual
        app={trafficApp}
        onAppChange={setTrafficApp}
        onRangeChange={setTrafficRange}
        range={trafficRange}
        traffic={data.traffic}
      />

      <OrderRequestTable
        orders={data.orderRequests.orders}
        windowMinutes={data.orderRequests.windowMinutes}
      />

      <LimiterTable
        limiters={limiters}
        onResetBucket={openResetDialog}
        resetPending={resetMutation.isPending}
      />

      <AlertDialog open={Boolean(pendingReset)} onOpenChange={closeResetDialog}>
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Reset rate-limit bucket?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears only the selected in-memory bucket for the current
              backend instance.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {pendingReset ? (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <div className="font-medium">{pendingReset.limiter.label}</div>
                <div className="mt-1 font-mono text-xs text-muted-foreground">
                  {pendingReset.bucket.key}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {pendingReset.bucket.totalHits} requests, reset in{" "}
                  {formatReset(pendingReset.bucket.resetInSeconds)}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="reset-reason">
                  Reason
                </label>
                <Textarea
                  id="reset-reason"
                  value={resetReason}
                  onChange={(event) => setResetReason(event.target.value)}
                  placeholder="Why this bucket should be reset"
                  rows={3}
                  disabled={resetMutation.isPending}
                />
                <p className="text-xs text-muted-foreground">
                  Required for the backend security audit log.
                </p>
              </div>
            </div>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={
                resetMutation.isPending || trimmedResetReason.length < 4
              }
              onClick={submitReset}
            >
              {resetMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <TimerReset className="size-4" />
              )}
              Reset bucket
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
