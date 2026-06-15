import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { format } from "date-fns"
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Loader2,
  ReceiptText,
  Route,
  Search,
  ShieldCheck,
  ShoppingBag,
  TrendingUp,
  Users,
  WalletCards,
  type LucideIcon,
} from "lucide-react"
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import {
  getAdminCustomerAnalyticsActorDetail,
  getAdminCustomerAnalyticsCustomers,
  getAdminCustomerAnalyticsEvents,
  getAdminCustomerAnalyticsFunnels,
  getAdminCustomerAnalyticsOverview,
  getAdminCustomerAnalyticsPayments,
  type AdminCustomerAnalyticsPreset,
  type AdminCustomerAnalyticsQueryParams,
} from "@/lib/customer-analytics-api"
import {
  getAdminZoneScope,
  subscribeAdminZoneScope,
} from "@/lib/admin-zone-scope"
import { printTableReport } from "@/lib/export-utils"

type AnalyticsTab = "overview" | "events" | "funnels" | "customers" | "payments" | "trace"
type TraceMode = "customer" | "guest"
type EventActorFilter = "all" | "guest" | "customer"

const eventTypeOptions = [
  "page_view",
  "restaurant_view",
  "menu_item_view",
  "cart_add",
  "cart_view",
  "checkout_start",
  "payment_initiated",
  "payment_completed",
  "payment_failed",
  "payment_cancelled",
  "signup_started",
  "signup_completed",
  "order_created",
  "search",
  "campaign_open",
  "voucher_applied",
  "custom",
]

const pageSizeOptions = [10, 25, 50, 100]

function formatNumber(value?: number | null) {
  return Math.round(value ?? 0).toLocaleString()
}

function formatCurrency(value?: number | null) {
  return `Tk ${Math.round(value ?? 0).toLocaleString()}`
}

function formatPercent(value?: number | null) {
  return `${Math.round(value ?? 0)}%`
}

function formatDateTime(value?: string | null) {
  if (!value) return "N/A"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "N/A"
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

function formatDayLabel(value?: string | null) {
  if (!value) return "N/A"
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return format(date, "MMM d")
}

function formatShortDate(value?: string | null) {
  if (!value) return "N/A"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return format(date, "MMM d")
}

function formatFriendlyText(value: string) {
  return value.replaceAll("_", " ")
}

function formatMetadataPreview(value?: Record<string, unknown>) {
  if (!value || Object.keys(value).length === 0) return "No metadata"
  try {
    return JSON.stringify(value)
  } catch {
    return "Metadata unavailable"
  }
}

function severityBadgeVariant(severity: "info" | "warning" | "critical") {
  if (severity === "critical") return "destructive"
  if (severity === "warning") return "secondary"
  return "outline"
}

function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
  tone,
}: {
  label: string
  value: React.ReactNode
  helper?: string
  icon: LucideIcon
  tone: string
}) {
  return (
    <Card className="border-muted/60">
      <CardContent className="flex items-start justify-between gap-4 pt-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <div className="mt-2 text-2xl font-semibold">{value}</div>
          {helper ? (
            <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
          ) : null}
        </div>
        <div className={`rounded-lg p-2 ${tone}`}>
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1">{description}</p>
    </div>
  )
}

function TraceButton({
  onClick,
  label,
}: {
  onClick: () => void
  label: string
}) {
  return (
    <Button type="button" variant="ghost" size="sm" onClick={onClick}>
      {label}
    </Button>
  )
}

function buildRangeParams(
  preset: AdminCustomerAnalyticsPreset,
  from: string,
  to: string,
  limit: number
): AdminCustomerAnalyticsQueryParams {
  const params: AdminCustomerAnalyticsQueryParams = { preset, limit }
  if (preset === "custom" && from && to) {
    params.from = from
    params.to = to
  }
  return params
}

export function CustomerAnalyticsPage() {
  const [activeTab, setActiveTab] = React.useState<AnalyticsTab>("overview")
  const [preset, setPreset] = React.useState<AdminCustomerAnalyticsPreset>("last7Days")
  const [from, setFrom] = React.useState("")
  const [to, setTo] = React.useState("")
  const [traceMode, setTraceMode] = React.useState<TraceMode>("customer")
  const [traceCustomerDraft, setTraceCustomerDraft] = React.useState("")
  const [traceGuestDraft, setTraceGuestDraft] = React.useState("")
  const [traceCustomerId, setTraceCustomerId] = React.useState("")
  const [traceGuestId, setTraceGuestId] = React.useState("")
  const [recentEventFilter, setRecentEventFilter] = React.useState("all")
  const [traceActivityFilter, setTraceActivityFilter] = React.useState("all")
  const [eventsSearch, setEventsSearch] = React.useState("")
  const [eventsPath, setEventsPath] = React.useState("")
  const [eventsEventType, setEventsEventType] = React.useState("all")
  const [eventsActorType, setEventsActorType] =
    React.useState<EventActorFilter>("all")
  const [eventsPage, setEventsPage] = React.useState(1)
  const [eventsPageSize, setEventsPageSize] = React.useState(25)
  const [adminZoneScope, setAdminZoneScope] = React.useState(() =>
    getAdminZoneScope()
  )
  const debouncedEventsSearch = useDebouncedValue(eventsSearch, 350)
  const adminScopeKey = `${adminZoneScope.type}:${adminZoneScope.id}`

  React.useEffect(
    () =>
      subscribeAdminZoneScope(() => {
        setAdminZoneScope(getAdminZoneScope())
      }),
    []
  )

  const overviewParams = React.useMemo(
    () => buildRangeParams(preset, from, to, 25),
    [preset, from, to]
  )
  const funnelParams = React.useMemo(
    () => buildRangeParams(preset, from, to, 20),
    [preset, from, to]
  )
  const customerParams = React.useMemo(
    () => buildRangeParams(preset, from, to, 12),
    [preset, from, to]
  )
  const paymentParams = React.useMemo(
    () => buildRangeParams(preset, from, to, 20),
    [preset, from, to]
  )
  const eventsParams = React.useMemo(
    () => ({
      ...buildRangeParams(preset, from, to, eventsPageSize),
      search: debouncedEventsSearch,
      path: eventsPath.trim(),
      eventType: eventsEventType,
      actorType: eventsActorType,
      page: eventsPage,
      pageSize: eventsPageSize,
    }),
    [
      preset,
      from,
      to,
      eventsPageSize,
      debouncedEventsSearch,
      eventsPath,
      eventsEventType,
      eventsActorType,
      eventsPage,
    ]
  )
  const traceParams = React.useMemo(
    () => buildRangeParams(preset, from, to, 20),
    [preset, from, to]
  )
  const hasTraceSelection =
    activeTab === "trace" &&
    ((traceMode === "customer" && traceCustomerId.trim().length > 0) ||
      (traceMode === "guest" && traceGuestId.trim().length > 0))

  const overviewQuery = useQuery({
    queryKey: ["admin-customer-analytics-overview", adminScopeKey, preset, from, to],
    queryFn: () => getAdminCustomerAnalyticsOverview(overviewParams),
    enabled: activeTab === "overview",
  })
  const funnelsQuery = useQuery({
    queryKey: ["admin-customer-analytics-funnels", adminScopeKey, preset, from, to],
    queryFn: () => getAdminCustomerAnalyticsFunnels(funnelParams),
    enabled: activeTab === "funnels",
  })
  const customersQuery = useQuery({
    queryKey: ["admin-customer-analytics-customers", adminScopeKey, preset, from, to],
    queryFn: () => getAdminCustomerAnalyticsCustomers(customerParams),
    enabled: activeTab === "customers",
  })
  const paymentsQuery = useQuery({
    queryKey: ["admin-customer-analytics-payments", adminScopeKey, preset, from, to],
    queryFn: () => getAdminCustomerAnalyticsPayments(paymentParams),
    enabled: activeTab === "payments",
  })
  const eventsQuery = useQuery({
    queryKey: [
      "admin-customer-analytics-events",
      adminScopeKey,
      preset,
      from,
      to,
      debouncedEventsSearch,
      eventsPath,
      eventsEventType,
      eventsActorType,
      eventsPage,
      eventsPageSize,
    ],
    queryFn: () => getAdminCustomerAnalyticsEvents(eventsParams),
    enabled: activeTab === "events",
  })
  const traceQuery = useQuery({
    queryKey: [
      "admin-customer-analytics-actor-detail",
      adminScopeKey,
      preset,
      from,
      to,
      traceMode,
      traceMode === "customer" ? traceCustomerId : traceGuestId,
    ],
    queryFn: () =>
      getAdminCustomerAnalyticsActorDetail({
        ...traceParams,
        customerId: traceMode === "customer" ? traceCustomerId : undefined,
        anonymousId: traceMode === "guest" ? traceGuestId : undefined,
      }),
    enabled: hasTraceSelection,
  })

  const overviewResponse = overviewQuery.data
  const overview = overviewResponse?.overview
  const funnelData = funnelsQuery.data
  const customerData = customersQuery.data
  const paymentData = paymentsQuery.data
  const eventsData = eventsQuery.data
  const eventRows = eventsData?.items ?? []
  const eventsPageCount = eventsData?.pageCount ?? 1
  const safeEventsPage = Math.min(eventsPage, eventsPageCount)
  const traceData = hasTraceSelection ? traceQuery.data : undefined
  const recentEventTypes = React.useMemo(
    () => [
      ...new Set(
        (overviewResponse?.recentEvents ?? [])
          .map((event) => event.eventType)
          .filter(Boolean)
      ),
    ].slice(0, 12),
    [overviewResponse?.recentEvents]
  )
  const visibleRecentEvents = React.useMemo(
    () =>
      (overviewResponse?.recentEvents ?? [])
        .filter((event) =>
          recentEventFilter === "all" ? true : event.eventType === recentEventFilter
        )
        .slice(0, 10),
    [overviewResponse?.recentEvents, recentEventFilter]
  )
  const traceActivityTypes = React.useMemo(
    () => [
      ...new Set(
        (traceData?.recentActivities ?? [])
          .map((event) => event.eventType)
          .filter(Boolean)
      ),
    ].slice(0, 12),
    [traceData?.recentActivities]
  )
  const visibleTraceActivities = React.useMemo(
    () =>
      (traceData?.recentActivities ?? [])
        .filter((event) =>
          traceActivityFilter === "all" ? true : event.eventType === traceActivityFilter
        )
        .slice(0, 10),
    [traceData?.recentActivities, traceActivityFilter]
  )

  React.useEffect(() => {
    setEventsPage(1)
  }, [
    adminScopeKey,
    preset,
    from,
    to,
    debouncedEventsSearch,
    eventsPath,
    eventsEventType,
    eventsActorType,
    eventsPageSize,
  ])

  React.useEffect(() => {
    if (eventsPage > eventsPageCount) setEventsPage(eventsPageCount)
  }, [eventsPage, eventsPageCount])

  const openCustomerTrace = React.useCallback((customerId: string) => {
    setTraceMode("customer")
    setTraceCustomerDraft(customerId)
    setTraceCustomerId(customerId)
    setTraceGuestDraft("")
    setTraceGuestId("")
    setActiveTab("trace")
  }, [])

  const openGuestTrace = React.useCallback((anonymousId: string) => {
    setTraceMode("guest")
    setTraceGuestDraft(anonymousId)
    setTraceGuestId(anonymousId)
    setTraceCustomerDraft("")
    setTraceCustomerId("")
    setActiveTab("trace")
  }, [])

  const submitTrace = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (traceMode === "customer") {
      const next = traceCustomerDraft.trim()
      setTraceCustomerId(next)
      setTraceGuestId("")
      if (next) setActiveTab("trace")
      return
    }

    const next = traceGuestDraft.trim()
    setTraceGuestId(next)
    setTraceCustomerId("")
    if (next) setActiveTab("trace")
  }

  function exportAnalyticsPdf() {
    printTableReport({
      title: "Foodbela customer analytics",
      subtitle: `Current ${preset} analytics snapshot.`,
      metrics: [
        { label: "Total events", value: formatNumber(overview?.totalEvents) },
        { label: "Unique customers", value: formatNumber(overview?.uniqueCustomers) },
        { label: "Checkout conversion", value: formatPercent(overview?.checkoutConversionRate) },
        { label: "Payment completion", value: formatPercent(overview?.paymentCompletionRate) },
      ],
      headers: ["Recent event", "Actor", "Path", "When"],
      rows: visibleRecentEvents.map((event) => [
        formatFriendlyText(event.eventType),
        event.customerId || event.anonymousId || event.actorType,
        event.path || event.screenName || "N/A",
        formatDateTime(event.occurredAt),
      ]),
    })
  }

  function exportEventsPdf() {
    const ok = printTableReport({
      title: "Foodbela customer event explorer",
      subtitle: `Filtered customer events for ${preset}.`,
      metrics: [
        { label: "Matching events", value: eventsData?.total ?? 0 },
        { label: "Unique sessions", value: eventsData?.summary.uniqueSessions ?? 0 },
        { label: "Unique customers", value: eventsData?.summary.uniqueCustomers ?? 0 },
        { label: "Unique guests", value: eventsData?.summary.uniqueGuests ?? 0 },
      ],
      headers: ["Event", "Actor", "Session", "Path", "Entity", "When"],
      rows: eventRows.map((event) => [
        formatFriendlyText(event.eventType),
        event.customerId || event.anonymousId || event.actorType,
        event.sessionId,
        event.path || event.screenName || "N/A",
        [event.entityType, event.entityId].filter(Boolean).join(": ") || "N/A",
        formatDateTime(event.occurredAt),
      ]),
    })
    if (!ok) {
      // The print window can be blocked by the browser; keep the UI calm.
      return
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Customer analytics
            </h1>
            <Badge variant="outline">Customer app trace</Badge>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Browse behavior, funnel health, payment flow, repeat customers, and
            actor-level traces in one place.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <AdminDateRangeFilter<AdminCustomerAnalyticsPreset>
            value={preset}
            from={from}
            to={to}
            label="Analytics range"
            className="flex-wrap lg:justify-end"
            onPresetChange={setPreset}
            onRangeChange={(range) => {
              setFrom(range.from)
              setTo(range.to)
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={!overviewResponse}
            onClick={exportAnalyticsPdf}
          >
            <ReceiptText className="size-4" />
            Export PDF
          </Button>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as AnalyticsTab)}
        className="space-y-4"
      >
        <TabsList className="w-full justify-start gap-1 overflow-x-auto">
          <TabsTrigger value="overview" className="min-w-[110px] flex-none">
            Overview
          </TabsTrigger>
          <TabsTrigger value="events" className="min-w-[110px] flex-none">
            Events
          </TabsTrigger>
          <TabsTrigger value="funnels" className="min-w-[110px] flex-none">
            Funnels
          </TabsTrigger>
          <TabsTrigger value="customers" className="min-w-[110px] flex-none">
            Customers
          </TabsTrigger>
          <TabsTrigger value="payments" className="min-w-[110px] flex-none">
            Payments
          </TabsTrigger>
          <TabsTrigger value="trace" className="min-w-[110px] flex-none">
            Trace
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {overviewQuery.isLoading && !overview ? (
            <Card>
              <CardContent className="flex items-center gap-2 pt-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading overview...
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Total events"
              value={formatNumber(overview?.totalEvents)}
              helper="All customer-app tracked events"
              icon={Activity}
              tone="text-sky-600 bg-sky-50"
            />
            <MetricCard
              label="Unique sessions"
              value={formatNumber(overview?.uniqueSessions)}
              helper="Sessions seen in the selected window"
              icon={Route}
              tone="text-violet-600 bg-violet-50"
            />
            <MetricCard
              label="Unique customers"
              value={formatNumber(overview?.uniqueCustomers)}
              helper="Signed-in customers with events"
              icon={Users}
              tone="text-emerald-600 bg-emerald-50"
            />
            <MetricCard
              label="Unique guests"
              value={formatNumber(overview?.uniqueGuests)}
              helper="Anonymous browsing sessions"
              icon={Search}
              tone="text-orange-600 bg-orange-50"
            />
            <MetricCard
              label="Checkout conversion"
              value={formatPercent(overview?.checkoutConversionRate)}
              helper="Orders created per checkout start"
              icon={ShoppingBag}
              tone="text-cyan-600 bg-cyan-50"
            />
            <MetricCard
              label="Payment completion"
              value={formatPercent(overview?.paymentCompletionRate)}
              helper="Completed / initiated payments"
              icon={WalletCards}
              tone="text-rose-600 bg-rose-50"
            />
            <MetricCard
              label="Signup completion"
              value={formatPercent(overview?.signupCompletionRate)}
              helper="Completed / started signups"
              icon={ShieldCheck}
              tone="text-indigo-600 bg-indigo-50"
            />
            <MetricCard
              label="Last event"
              value={formatShortDate(overview?.lastEventAt)}
              helper="Most recent customer-app event"
              icon={Clock3}
              tone="text-amber-600 bg-amber-50"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="size-4" />
                Activity trend
              </CardTitle>
              <CardDescription>
                Events, checkout starts, and orders created across the selected
                time window.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {overviewResponse?.trend.length ? (
                <div className="h-72">
                  <TrendChart data={overviewResponse.trend} />
                </div>
              ) : (
                <EmptyState
                  title="No trend data yet"
                  description="Choose a wider range or wait for customer activity to build up."
                />
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Top paths</CardTitle>
                <CardDescription>
                  Most visited screens and the split between guests and customers.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {overviewResponse?.topPaths.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Path</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                        <TableHead className="text-right">Guests</TableHead>
                        <TableHead className="text-right">Customers</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overviewResponse.topPaths.map((row) => (
                        <TableRow key={row.path}>
                          <TableCell className="max-w-[220px] truncate">
                            {row.path}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(row.count)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(row.guestCount)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(row.customerCount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyState
                    title="No path data"
                    description="Path tracking will appear as soon as customers browse the app."
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="gap-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>Recent events</CardTitle>
                    <CardDescription>
                      Latest customer-app activity with a quick trace entry point.
                    </CardDescription>
                  </div>
                  <Select value={recentEventFilter} onValueChange={setRecentEventFilter}>
                    <SelectTrigger className="h-9 w-full sm:w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All events</SelectItem>
                      {recentEventTypes.map((eventType) => (
                        <SelectItem key={eventType} value={eventType}>
                          {formatFriendlyText(eventType)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {visibleRecentEvents.length ? (
                  <div className="max-h-[420px] overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Event</TableHead>
                        <TableHead>Actor</TableHead>
                        <TableHead>Path</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleRecentEvents.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">
                                {formatFriendlyText(row.eventType)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatDateTime(row.occurredAt)}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <Badge variant="outline" className="capitalize">
                                {row.actorType}
                              </Badge>
                              <div className="text-xs text-muted-foreground">
                                {row.customerId || row.anonymousId || "N/A"}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[220px] truncate">
                            {row.path || row.screenName || "N/A"}
                          </TableCell>
                          <TableCell className="text-right">
                            {row.customerId ? (
                              <TraceButton
                                label="Trace customer"
                                onClick={() => openCustomerTrace(row.customerId)}
                              />
                            ) : row.anonymousId ? (
                              <TraceButton
                                label="Trace guest"
                                onClick={() => openGuestTrace(row.anonymousId)}
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">No trace</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                ) : (
                  <EmptyState
                    title="No recent events"
                    description="Recent customer actions will appear here after the first live requests."
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Search analytics</CardTitle>
                <CardDescription>
                  Search terms, scopes, zero-result hits, and average result counts.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {overviewResponse?.searchAnalytics.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Query</TableHead>
                        <TableHead>Scope</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                        <TableHead className="text-right">Zero results</TableHead>
                        <TableHead className="text-right">Avg results</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overviewResponse.searchAnalytics.map((row) => (
                        <TableRow key={`${row.query}-${row.scope}-${row.restaurantId}`}>
                          <TableCell className="max-w-[180px] truncate">
                            {row.query || "N/A"}
                          </TableCell>
                          <TableCell className="capitalize">{row.scope}</TableCell>
                          <TableCell className="text-right">
                            {formatNumber(row.count)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(row.zeroResultCount)}
                          </TableCell>
                          <TableCell className="text-right">
                            {row.averageResults.toFixed(1)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyState
                    title="No search data"
                    description="Search analytics will populate when customers start searching restaurants and items."
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Coverage and alerts</CardTitle>
                <CardDescription>
                  Event sources and quick signals worth checking first.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Source apps</p>
                  {overviewResponse?.sourceApps.length ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {overviewResponse.sourceApps.map((row) => (
                        <div
                          key={row.label}
                          className="flex items-center justify-between rounded-lg border bg-background px-3 py-2"
                        >
                          <span className="text-sm">{row.label}</span>
                          <Badge variant="outline">{formatNumber(row.count)}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      title="No source data"
                      description="Source app coverage will appear once multiple apps begin sending events."
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Alerts</p>
                  {overviewResponse?.alerts.length ? (
                    <div className="space-y-2">
                      {overviewResponse.alerts.map((alert) => (
                        <div
                          key={alert.key}
                          className="flex items-start justify-between gap-3 rounded-lg border bg-background p-3"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge variant={severityBadgeVariant(alert.severity)}>
                                {alert.severity}
                              </Badge>
                              <span className="font-medium">{alert.title}</span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {alert.description}
                            </p>
                          </div>
                          <div className="text-right text-sm font-semibold">
                            {formatNumber(alert.metric)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      title="No active alerts"
                      description="If conversion, payment, or signup health slips, the first warnings will appear here."
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Event mix</p>
                  {overviewResponse?.eventTypes.length ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {overviewResponse.eventTypes.slice(0, 6).map((row) => (
                        <div
                          key={row.label}
                          className="flex items-center justify-between rounded-lg border bg-background px-3 py-2"
                        >
                          <span className="text-sm capitalize">
                            {row.label}
                          </span>
                          <Badge variant="outline">{formatNumber(row.count)}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      title="No event mix yet"
                      description="Track different event types to see the spread of browsing, checkout, and payments."
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="events" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Matching events"
              value={formatNumber(eventsData?.total)}
              helper="Filtered event rows"
              icon={Activity}
              tone="text-sky-600 bg-sky-50"
            />
            <MetricCard
              label="Unique sessions"
              value={formatNumber(eventsData?.summary.uniqueSessions)}
              helper="Distinct sessions in filter"
              icon={Route}
              tone="text-violet-600 bg-violet-50"
            />
            <MetricCard
              label="Unique customers"
              value={formatNumber(eventsData?.summary.uniqueCustomers)}
              helper="Signed-in actors"
              icon={Users}
              tone="text-emerald-600 bg-emerald-50"
            />
            <MetricCard
              label="Last event"
              value={formatShortDate(eventsData?.summary.lastEventAt)}
              helper="Newest matching event"
              icon={Clock3}
              tone="text-amber-600 bg-amber-50"
            />
          </div>

          <Card>
            <CardHeader className="gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>Events explorer</CardTitle>
                  <CardDescription>
                    Paginated customer-app event log with trace shortcuts and
                    export. This view does not load the full collection at once.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={eventRows.length === 0}
                  onClick={exportEventsPdf}
                  className="w-full sm:w-auto"
                >
                  <Download className="size-4" />
                  Export PDF
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-64 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-9 pl-9"
                    placeholder="Search event, actor, path, session, entity"
                    value={eventsSearch}
                    onChange={(event) => setEventsSearch(event.target.value)}
                  />
                </div>
                <Input
                  className="h-9 w-full sm:w-56"
                  placeholder="Path contains"
                  value={eventsPath}
                  onChange={(event) => setEventsPath(event.target.value)}
                />
                <Select value={eventsEventType} onValueChange={setEventsEventType}>
                  <SelectTrigger className="h-9 w-full sm:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All events</SelectItem>
                    {eventTypeOptions.map((eventType) => (
                      <SelectItem key={eventType} value={eventType}>
                        {formatFriendlyText(eventType)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={eventsActorType}
                  onValueChange={(value) =>
                    setEventsActorType(value as EventActorFilter)
                  }
                >
                  <SelectTrigger className="h-9 w-full sm:w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All actors</SelectItem>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="guest">Guest</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3 lg:grid-cols-[1fr_0.75fr]">
                <div className="overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Event</TableHead>
                        <TableHead>Actor</TableHead>
                        <TableHead>Path</TableHead>
                        <TableHead>Metadata</TableHead>
                        <TableHead>When</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {eventsQuery.isLoading ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-24 text-center">
                            <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      ) : null}
                      {eventRows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">
                                {formatFriendlyText(row.eventType)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {row.summary}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <Badge variant="outline" className="capitalize">
                                {row.actorType}
                              </Badge>
                              <div className="max-w-[180px] truncate text-xs text-muted-foreground">
                                {row.customerId || row.anonymousId || row.sessionId || "N/A"}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[220px] truncate">
                            {row.path || row.screenName || "N/A"}
                          </TableCell>
                          <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground">
                            {formatMetadataPreview(row.metadata)}
                          </TableCell>
                          <TableCell>{formatDateTime(row.occurredAt)}</TableCell>
                          <TableCell className="text-right">
                            {row.customerId ? (
                              <TraceButton
                                label="Trace"
                                onClick={() => openCustomerTrace(row.customerId)}
                              />
                            ) : row.anonymousId ? (
                              <TraceButton
                                label="Trace"
                                onClick={() => openGuestTrace(row.anonymousId)}
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                No trace
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {!eventsQuery.isLoading && eventRows.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="h-24 text-center text-muted-foreground"
                          >
                            No customer events match this filter.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>

                <div className="space-y-3">
                  <Card className="border-muted/60">
                    <CardHeader>
                      <CardTitle className="text-base">Event mix</CardTitle>
                      <CardDescription>
                        Top matching event types for the current filter.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {eventsData?.summary.eventTypes.length ? (
                        eventsData.summary.eventTypes.slice(0, 8).map((row) => (
                          <div
                            key={row.label}
                            className="flex items-center justify-between rounded-lg border bg-background px-3 py-2"
                          >
                            <span className="text-sm capitalize">
                              {formatFriendlyText(row.label)}
                            </span>
                            <Badge variant="outline">{formatNumber(row.count)}</Badge>
                          </div>
                        ))
                      ) : (
                        <EmptyState
                          title="No mix yet"
                          description="Event counts will appear after events match this filter."
                        />
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-muted/60">
                    <CardHeader>
                      <CardTitle className="text-base">Top matching paths</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {eventsData?.summary.topPaths.length ? (
                        eventsData.summary.topPaths.slice(0, 6).map((row) => (
                          <div
                            key={row.path}
                            className="rounded-lg border bg-background px-3 py-2"
                          >
                            <div className="truncate text-sm font-medium">
                              {row.path || "Unknown path"}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                              <span>{formatNumber(row.count)} events</span>
                              <span>{formatNumber(row.customerCount)} customers</span>
                              <span>{formatNumber(row.guestCount)} guests</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <EmptyState
                          title="No paths"
                          description="Top paths will appear when matching rows exist."
                        />
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground">
                  Showing {eventRows.length} of {eventsData?.total ?? eventRows.length} events
                  {eventsQuery.isFetching && !eventsQuery.isLoading ? " - refreshing" : ""}
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Select
                    value={`${eventsPageSize}`}
                    onValueChange={(value) => setEventsPageSize(Number(value))}
                  >
                    <SelectTrigger className="w-full sm:w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent side="top">
                      {pageSizeOptions.map((size) => (
                        <SelectItem key={size} value={`${size}`}>
                          {size} / page
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-sm font-medium">
                    Page {safeEventsPage} of {eventsPageCount}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setEventsPage((current) => Math.max(1, current - 1))}
                      disabled={safeEventsPage <= 1 || eventsQuery.isFetching}
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setEventsPage((current) => Math.min(eventsPageCount, current + 1))
                      }
                      disabled={safeEventsPage >= eventsPageCount || eventsQuery.isFetching}
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="funnels" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Sessions"
              value={formatNumber(funnelData?.sessionSummary.sessions)}
              helper="Tracked sessions in the selected range"
              icon={Route}
              tone="text-sky-600 bg-sky-50"
            />
            <MetricCard
              label="Browse only"
              value={formatNumber(funnelData?.sessionSummary.browseOnlySessions)}
              helper="Browsers that never reached checkout"
              icon={Search}
              tone="text-orange-600 bg-orange-50"
            />
            <MetricCard
              label="Checkout abandoned"
              value={formatNumber(funnelData?.sessionSummary.checkoutAbandonedSessions)}
              helper="Started checkout but no order"
              icon={AlertTriangle}
              tone="text-rose-600 bg-rose-50"
            />
            <MetricCard
              label="Registered no order"
              value={formatNumber(
                funnelData?.sessionSummary.registeredBrowseNoOrderCustomers
              )}
              helper="Logged-in customers who did not order"
              icon={Users}
              tone="text-violet-600 bg-violet-50"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Restaurant funnels</CardTitle>
              <CardDescription>
                Views, orders, delivered orders, revenue, and view-to-order rates.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {funnelData?.restaurantFunnels.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Restaurant</TableHead>
                      <TableHead className="text-right">Views</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Delivered</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">View to order</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {funnelData.restaurantFunnels.map((row) => (
                      <TableRow key={row.restaurantId}>
                        <TableCell className="max-w-[240px] truncate">
                          {row.restaurantName}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatNumber(row.views)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatNumber(row.orders)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatNumber(row.deliveredOrders)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(row.revenue)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatPercent(row.viewToOrderRate)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState
                  title="No funnel data"
                  description="Restaurant funnel rows will appear as soon as real browsing and order data arrives."
                />
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Drop-off paths</CardTitle>
                <CardDescription>
                  Paths where sessions are starting but not converting.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {funnelData?.dropOffPaths.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Path</TableHead>
                        <TableHead className="text-right">Sessions</TableHead>
                        <TableHead className="text-right">Guests</TableHead>
                        <TableHead className="text-right">Customers</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {funnelData.dropOffPaths.map((row) => (
                        <TableRow key={row.path}>
                          <TableCell className="max-w-[220px] truncate">
                            {row.path}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(row.sessions)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(row.guestSessions)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(row.customerSessions)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyState
                    title="No drop-off paths"
                    description="Drop-off paths will show when sessions are tracked with enough depth."
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Session journeys</CardTitle>
                <CardDescription>
                  Recent per-session traces with checkout and order signals.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {funnelData?.sessionJourneys.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Session</TableHead>
                        <TableHead>Actor</TableHead>
                        <TableHead>Journey</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {funnelData.sessionJourneys.map((row) => (
                        <TableRow key={row.sessionId}>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">{row.sessionId}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatDateTime(row.lastSeenAt)}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {row.actorType}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[250px] truncate">
                            {row.startPath || "N/A"}
                            {" -> "}
                            {row.lastPath || "N/A"}
                          </TableCell>
                          <TableCell className="text-right">
                            {row.customerId ? (
                              <TraceButton
                                label="Trace customer"
                                onClick={() => openCustomerTrace(row.customerId)}
                              />
                            ) : row.anonymousId ? (
                              <TraceButton
                                label="Trace guest"
                                onClick={() => openGuestTrace(row.anonymousId)}
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">No trace</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyState
                    title="No session journeys"
                    description="Journey rows will appear when the session tracker sees enough events."
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="customers" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="New customers"
              value={formatNumber(customerData?.retention.newCustomers)}
              helper="Customers created in the window"
              icon={Users}
              tone="text-sky-600 bg-sky-50"
            />
            <MetricCard
              label="Day 1 order rate"
              value={formatPercent(customerData?.retention.day1OrderRate)}
              helper="New customers ordering within 1 day"
              icon={ShoppingBag}
              tone="text-emerald-600 bg-emerald-50"
            />
            <MetricCard
              label="Day 7 order rate"
              value={formatPercent(customerData?.retention.day7OrderRate)}
              helper="New customers ordering within 7 days"
              icon={TrendingUp}
              tone="text-violet-600 bg-violet-50"
            />
            <MetricCard
              label="Repeat customers"
              value={formatNumber(customerData?.retention.repeatCustomers)}
              helper="Customers with two or more orders"
              icon={ReceiptText}
              tone="text-orange-600 bg-orange-50"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Top 10 recent users</CardTitle>
                <CardDescription>
                  Newest customers in the selected area and date range.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {customerData?.recentUsers?.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Joined</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customerData.recentUsers.slice(0, 10).map((row) => (
                        <TableRow key={`recent-${row.customerId}`}>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">{row.fullName || "Unknown"}</div>
                              <div className="text-xs text-muted-foreground">
                                {row.phone || row.customerId}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {row.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {formatDateTime(row.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyState
                    title="No recent users"
                    description="Recent customers will appear here for the selected area."
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top 10 ordering users</CardTitle>
                <CardDescription>
                  Customers with the most orders in the selected area.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {customerData?.topOrderUsers?.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">Spend</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customerData.topOrderUsers.slice(0, 10).map((row) => (
                        <TableRow key={`top-${row.customerId}`}>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">{row.fullName || "Unknown"}</div>
                              <div className="text-xs text-muted-foreground">
                                Last order {formatDateTime(row.lastOrderAt)}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(row.lifetimeOrders)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(row.lifetimeSpend)}
                          </TableCell>
                          <TableCell className="text-right">
                            <TraceButton
                              label="Trace"
                              onClick={() => openCustomerTrace(row.customerId)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyState
                    title="No ordering users"
                    description="Order leaders will appear after customers place orders in this area."
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Repeat customers</CardTitle>
              <CardDescription>
                Customers who are ordering again, with quick trace actions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {customerData?.repeatCustomers.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Spend</TableHead>
                      <TableHead className="text-right">AOV</TableHead>
                      <TableHead>Favorite payment</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerData.repeatCustomers.map((row) => (
                      <TableRow key={row.customerId}>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">{row.fullName || "Unknown"}</div>
                            <div className="text-xs text-muted-foreground">
                              {row.phone || row.customerId}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {row.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatNumber(row.lifetimeOrders)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(row.lifetimeSpend)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(row.averageOrderValue)}
                        </TableCell>
                        <TableCell>{row.favoritePaymentMethod}</TableCell>
                        <TableCell className="text-right">
                          <TraceButton
                            label="Trace"
                            onClick={() => openCustomerTrace(row.customerId)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState
                  title="No repeat customers"
                  description="Repeat customer data will appear when one customer places multiple orders."
                />
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Abandoned checkouts</CardTitle>
                <CardDescription>
                  Checkout sessions that started but did not finish.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {customerData?.abandonedCheckouts.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Actor</TableHead>
                        <TableHead>Restaurant</TableHead>
                        <TableHead className="text-right">Cart</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customerData.abandonedCheckouts.map((row) => (
                        <TableRow key={row.sessionId}>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">
                                {row.fullName || row.customerId || row.anonymousId || "Guest"}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {row.phone || row.sessionId}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div>{row.restaurantName || "Unknown"}</div>
                              <div className="text-xs text-muted-foreground">
                                {row.paymentMethod || "unknown"} | {row.itemCount} items
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(row.estimatedCartValue)}
                          </TableCell>
                          <TableCell className="text-right">
                            {row.customerId ? (
                              <TraceButton
                                label="Trace customer"
                                onClick={() => openCustomerTrace(row.customerId)}
                              />
                            ) : row.anonymousId ? (
                              <TraceButton
                                label="Trace guest"
                                onClick={() => openGuestTrace(row.anonymousId)}
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">No trace</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyState
                    title="No abandoned checkouts"
                    description="Abandoned checkout rows will appear when checkout starts without a completed order."
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Guest sessions</CardTitle>
                <CardDescription>
                  Anonymous browsing sessions and their journey depth.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {customerData?.guestSessions.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Session</TableHead>
                        <TableHead>Path</TableHead>
                        <TableHead className="text-right">Events</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customerData.guestSessions.map((row) => (
                        <TableRow key={row.sessionId}>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">{row.anonymousId || row.sessionId}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatDateTime(row.lastSeenAt)}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {row.lastPath || "N/A"}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(row.eventCount)}
                          </TableCell>
                          <TableCell className="text-right">
                            <TraceButton
                              label="Trace"
                              onClick={() => openGuestTrace(row.anonymousId)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyState
                    title="No guest sessions"
                    description="Guest sessions will appear once anonymous browsing is captured."
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              label="Initiated"
              value={formatNumber(paymentData?.paymentHealth.initiated)}
              helper="Payment starts"
              icon={WalletCards}
              tone="text-sky-600 bg-sky-50"
            />
            <MetricCard
              label="Completed"
              value={formatNumber(paymentData?.paymentHealth.completed)}
              helper="Successful payment completions"
              icon={ShieldCheck}
              tone="text-emerald-600 bg-emerald-50"
            />
            <MetricCard
              label="Failed"
              value={formatNumber(paymentData?.paymentHealth.failed)}
              helper="Failed payment attempts"
              icon={AlertTriangle}
              tone="text-rose-600 bg-rose-50"
            />
            <MetricCard
              label="Cancelled"
              value={formatNumber(paymentData?.paymentHealth.cancelled)}
              helper="User-cancelled payment sessions"
              icon={Clock3}
              tone="text-orange-600 bg-orange-50"
            />
            <MetricCard
              label="Completion rate"
              value={formatPercent(paymentData?.paymentHealth.completionRate)}
              helper="Completed / initiated"
              icon={TrendingUp}
              tone="text-violet-600 bg-violet-50"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Payment events</CardTitle>
                <CardDescription>
                  Payment events grouped by provider and event type.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {paymentData?.paymentHealth.events.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Event</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paymentData.paymentHealth.events.map((row) => (
                        <TableRow key={`${row.eventType}-${row.provider}`}>
                          <TableCell className="capitalize">
                            {formatFriendlyText(row.eventType)}
                          </TableCell>
                          <TableCell>{row.provider}</TableCell>
                          <TableCell className="text-right">
                            {formatNumber(row.count)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyState
                    title="No payment events"
                    description="Payment provider events will appear when customers begin and complete payment flows."
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Failure stages</CardTitle>
                <CardDescription>
                  Where payment attempts fail, so you can tune the flow quickly.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {paymentData?.paymentHealth.failureStages.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Stage</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paymentData.paymentHealth.failureStages.map((row) => (
                        <TableRow key={row.label}>
                          <TableCell className="capitalize">
                            {formatFriendlyText(row.label)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(row.count)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyState
                    title="No payment failures"
                    description="Failure stage data will appear when payment attempts start failing."
                  />
                )}
              </CardContent>
            </Card>

            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Order payment methods</CardTitle>
                <CardDescription>
                  How orders are being paid, grouped by payment method and status.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {paymentData?.orderMethods.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Method</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paymentData.orderMethods.map((row) => (
                        <TableRow key={`${row.paymentMethod}-${row.paymentStatus}`}>
                          <TableCell>{row.paymentMethod}</TableCell>
                          <TableCell className="capitalize">
                            {formatFriendlyText(row.paymentStatus)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(row.orders)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(row.revenue)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyState
                    title="No order payment methods"
                    description="Order payment method summaries will appear as soon as orders are present."
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="trace" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="size-4" />
                Actor trace
              </CardTitle>
              <CardDescription>
                Jump directly to a customer or anonymous session and inspect the
                full event trail, orders, restaurants, and payment mix.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-3 md:grid-cols-[180px_1fr_auto]"
                onSubmit={submitTrace}
              >
                <div className="space-y-2">
                  <Label htmlFor="trace-mode">Trace by</Label>
                  <Select
                    value={traceMode}
                    onValueChange={(value) => setTraceMode(value as TraceMode)}
                  >
                    <SelectTrigger id="trace-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="customer">Customer ID</SelectItem>
                      <SelectItem value="guest">Anonymous ID</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="trace-value">
                    {traceMode === "customer" ? "Customer ID" : "Anonymous ID"}
                  </Label>
                  <Input
                    id="trace-value"
                    value={traceMode === "customer" ? traceCustomerDraft : traceGuestDraft}
                    onChange={(event) =>
                      traceMode === "customer"
                        ? setTraceCustomerDraft(event.target.value)
                        : setTraceGuestDraft(event.target.value)
                    }
                    placeholder={
                      traceMode === "customer"
                        ? "Paste a customerId"
                        : "Paste an anonymousId"
                    }
                  />
                </div>

                <div className="flex items-end gap-2">
                  <Button type="submit" className="w-full md:w-auto">
                    <Search className="size-4" />
                    Load trace
                  </Button>
                </div>
              </form>

              {traceMode === "customer" && !traceCustomerId.trim() ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Paste a customerId from any row above, then load the trace.
                </p>
              ) : traceMode === "guest" && !traceGuestId.trim() ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Paste an anonymousId from browsing or abandoned checkout rows,
                  then load the trace.
                </p>
              ) : null}
            </CardContent>
          </Card>

          {!traceQuery.isLoading && !traceData ? (
            <EmptyState
              title="No trace selected"
              description="Enter a customer ID or anonymous ID to inspect the full event history."
            />
          ) : null}

          {traceQuery.isLoading && !traceData ? (
            <Card>
              <CardContent className="flex items-center gap-2 pt-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading actor trace...
              </CardContent>
            </Card>
          ) : null}

          {traceData ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Lifetime orders"
                  value={formatNumber(traceData.lifetimeOrders)}
                  helper="All orders for this actor"
                  icon={ShoppingBag}
                  tone="text-sky-600 bg-sky-50"
                />
                <MetricCard
                  label="Timeframe orders"
                  value={formatNumber(traceData.timeframeOrders)}
                  helper="Orders in the selected window"
                  icon={Route}
                  tone="text-violet-600 bg-violet-50"
                />
                <MetricCard
                  label="Lifetime spend"
                  value={formatCurrency(traceData.lifetimeSpend)}
                  helper="Orders completed across all time"
                  icon={WalletCards}
                  tone="text-emerald-600 bg-emerald-50"
                />
                <MetricCard
                  label="Average order value"
                  value={formatCurrency(traceData.averageOrderValue)}
                  helper="Lifetime average order size"
                  icon={TrendingUp}
                  tone="text-orange-600 bg-orange-50"
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="size-4" />
                      Order trend
                    </CardTitle>
                    <CardDescription>
                      Order and spend movement for this customer or guest window.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {traceData.orderTrend.length ? (
                      <div className="h-72">
                        <TraceTrendChart data={traceData.orderTrend} />
                      </div>
                    ) : (
                      <EmptyState
                        title="No order trend data"
                        description="The selected actor has not produced enough order history yet."
                      />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Identity</CardTitle>
                    <CardDescription>
                      Core actor details and payment preference.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="rounded-lg border bg-background p-3">
                      <p className="text-sm font-medium">{traceData.fullName || "Anonymous actor"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {traceData.customerId || traceData.anonymousId || "N/A"}
                      </p>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2">
                      <span className="text-sm text-muted-foreground">Actor type</span>
                      <Badge variant="outline" className="capitalize">
                        {traceData.actorType}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2">
                      <span className="text-sm text-muted-foreground">Phone</span>
                      <span className="text-sm font-medium">{traceData.phone || "N/A"}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2">
                      <span className="text-sm text-muted-foreground">Status</span>
                      <span className="text-sm font-medium capitalize">{traceData.status}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2">
                      <span className="text-sm text-muted-foreground">Favorite payment</span>
                      <span className="text-sm font-medium">
                        {traceData.favoritePaymentMethod}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2">
                      <span className="text-sm text-muted-foreground">Last login</span>
                      <span className="text-sm font-medium">
                        {formatDateTime(traceData.lastLoginAt)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Top restaurants</CardTitle>
                    <CardDescription>
                      Restaurants this actor interacts with the most.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {traceData.topRestaurants.length ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Restaurant</TableHead>
                            <TableHead className="text-right">Orders</TableHead>
                            <TableHead className="text-right">Revenue</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {traceData.topRestaurants.map((row) => (
                            <TableRow key={row.restaurantId}>
                              <TableCell>{row.restaurantName}</TableCell>
                              <TableCell className="text-right">
                                {formatNumber(row.orders)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(row.revenue)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <EmptyState
                        title="No restaurant history"
                        description="Restaurant preferences will appear after the actor starts ordering."
                      />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Payment methods</CardTitle>
                    <CardDescription>
                      Method mix observed for this actor.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {traceData.paymentMethods.length ? (
                      traceData.paymentMethods.map((row) => (
                        <div
                          key={row.label}
                          className="flex items-center justify-between rounded-lg border bg-background px-3 py-2"
                        >
                          <span className="text-sm">{row.label}</span>
                          <Badge variant="outline">{formatNumber(row.count)}</Badge>
                        </div>
                      ))
                    ) : (
                      <EmptyState
                        title="No payment methods"
                        description="Payment method preferences will show up after successful checkouts."
                      />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Recent orders</CardTitle>
                    <CardDescription>
                      Latest orders tied to this actor.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {traceData.recentOrders.length ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Order</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {traceData.recentOrders.map((row) => (
                            <TableRow key={row.orderId}>
                              <TableCell>
                                <div className="space-y-1">
                                  <div className="font-medium">{row.orderNumber}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {row.restaurantName || row.restaurantId}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  <Badge variant="outline">{row.status}</Badge>
                                  <div className="text-xs text-muted-foreground">
                                    {row.paymentMethod || "unknown"} | {row.paymentStatus || "unknown"}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(row.total)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <EmptyState
                        title="No recent orders"
                        description="Recent orders will appear once this actor places deliveries."
                      />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="gap-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <CardTitle>Recent activities</CardTitle>
                        <CardDescription>
                          Most recent in-app events for this actor.
                        </CardDescription>
                      </div>
                      <Select value={traceActivityFilter} onValueChange={setTraceActivityFilter}>
                        <SelectTrigger className="h-9 w-full sm:w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All events</SelectItem>
                          {traceActivityTypes.map((eventType) => (
                            <SelectItem key={eventType} value={eventType}>
                              {formatFriendlyText(eventType)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {visibleTraceActivities.length ? (
                      <div className="max-h-[420px] overflow-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Event</TableHead>
                            <TableHead>Path</TableHead>
                            <TableHead className="text-right">When</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visibleTraceActivities.map((row, index) => (
                            <TableRow key={`${row.eventType}-${row.occurredAt ?? index}`}>
                              <TableCell className="capitalize">
                                {formatFriendlyText(row.eventType)}
                              </TableCell>
                              <TableCell className="max-w-[220px] truncate">
                                {row.path || row.screenName || row.entityType || "N/A"}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatDateTime(row.occurredAt)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      </div>
                    ) : (
                      <EmptyState
                        title="No recent activities"
                        description="The event trail will fill as the actor keeps using the app."
                      />
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function TrendChart({
  data,
  compact = false,
}: {
  data: Array<{
    date: string
    totalEvents: number
    pageViews: number
    checkoutStarts: number
    ordersCreated: number
    paymentCompleted: number
  }>
  compact?: boolean
}) {
  return (
    <ResponsiveContainer width="100%" height={compact ? 256 : 288}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tickFormatter={formatDayLabel} />
        <YAxis tickFormatter={formatNumber} />
        <Tooltip
          labelFormatter={(value) => formatDayLabel(String(value))}
          formatter={(value: unknown, name) => [
            formatNumber(Number(value ?? 0)),
            formatFriendlyText(String(name ?? "")),
          ]}
        />
        <Line
          type="monotone"
          dataKey="totalEvents"
          stroke="#2563eb"
          strokeWidth={2}
          dot={data.length <= 2 ? { r: 2 } : false}
          connectNulls
          name="Total events"
        />
        <Line
          type="monotone"
          dataKey="checkoutStarts"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={data.length <= 2 ? { r: 2 } : false}
          connectNulls
          name="Checkout starts"
        />
        <Line
          type="monotone"
          dataKey="ordersCreated"
          stroke="#16a34a"
          strokeWidth={2}
          dot={data.length <= 2 ? { r: 2 } : false}
          connectNulls
          name="Orders created"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

function TraceTrendChart({
  data,
}: {
  data: Array<{
    date: string
    orders: number
    revenue: number
  }>
}) {
  return (
    <ResponsiveContainer width="100%" height={288}>
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tickFormatter={formatDayLabel} />
        <YAxis yAxisId="left" tickFormatter={formatNumber} />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickFormatter={formatCurrency}
        />
        <Tooltip
          labelFormatter={(value) => formatDayLabel(String(value))}
          formatter={(value: unknown, name) => [
            String(name ?? "").toLowerCase().includes("revenue")
              ? formatCurrency(Number(value ?? 0))
              : formatNumber(Number(value ?? 0)),
            formatFriendlyText(String(name ?? "")),
          ]}
        />
        <Bar
          dataKey="orders"
          fill="#2563eb"
          maxBarSize={28}
          radius={[4, 4, 0, 0]}
          name="Orders"
          yAxisId="left"
        />
        <Line
          type="monotone"
          dataKey="revenue"
          stroke="#16a34a"
          strokeWidth={2}
          dot={{ r: 2 }}
          connectNulls
          name="Revenue"
          yAxisId="right"
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

