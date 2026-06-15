import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Activity,
  AlertTriangle,
  Bike,
  CheckCircle2,
  Clock3,
  ClipboardCopy,
  Cpu,
  Database,
  Download,
  Gauge,
  HeartPulse,
  Loader2,
  MapPinned,
  MonitorCog,
  Network,
  RadioTower,
  RefreshCcw,
  ServerCog,
  ShieldAlert,
  SlidersHorizontal,
  Store,
  UsersRound,
  XCircle,
  type LucideIcon,
} from "lucide-react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"

import {
  clearAdminRequestMonitor,
  getAdminOperationalHealth,
  resolveAdminOperationalAlert,
  snoozeAdminOperationalAlert,
  type AdminOperationalHealthSnapshot,
} from "@/lib/admin-api"
import {
  DEFAULT_ADMIN_REFRESH_POLICY,
  formatRefreshInterval,
  useAdminRefreshPolicy,
  type AdminRefreshPolicy,
} from "@/lib/refresh-policy"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type TimelineSeverityFilter = "all" | "critical" | "warning" | "info"
type TimelineCategoryFilter =
  | "all"
  | "orders"
  | "dispatch"
  | "notifications"
  | "scheduler"
  | "security"
  | "system"
type TimelineTimeframeFilter = "24h" | "7d" | "30d"
type RequestAppFilter =
  | "all"
  | "admin"
  | "owner"
  | "rider"
  | "customer"
  | "public"
  | "system"
  | "unknown"

const severityFilters: Array<{
  value: TimelineSeverityFilter
  label: string
}> = [
  { value: "all", label: "All" },
  { value: "critical", label: "Critical" },
  { value: "warning", label: "Warning" },
  { value: "info", label: "Info" },
]

const categoryFilters: Array<{
  value: TimelineCategoryFilter
  label: string
}> = [
  { value: "all", label: "All sources" },
  { value: "orders", label: "Orders" },
  { value: "dispatch", label: "Dispatch" },
  { value: "notifications", label: "Notifications" },
  { value: "scheduler", label: "Scheduler" },
  { value: "security", label: "Security" },
  { value: "system", label: "System" },
]

const timeframeFilters: Array<{
  value: TimelineTimeframeFilter
  label: string
}> = [
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7d" },
  { value: "30d", label: "30d history" },
]

const requestAppFilters: Array<{
  value: RequestAppFilter
  label: string
}> = [
  { value: "all", label: "All apps" },
  { value: "admin", label: "Admin" },
  { value: "owner", label: "Owner" },
  { value: "rider", label: "Rider" },
  { value: "customer", label: "Customer" },
  { value: "public", label: "Public" },
  { value: "system", label: "System" },
]

function formatDateTime(value?: string | null) {
  if (!value) return "Not recorded"
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value))
}

function formatDuration(value?: number | null) {
  if (typeof value !== "number") return "Not run yet"
  if (value < 1000) return `${value} ms`
  return `${Math.round(value / 100) / 10}s`
}

function formatUptime(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours < 24) return `${hours}h ${remainingMinutes}m`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}

function titleCase(value: string) {
  return value
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function statusTone(status: string) {
  if (status === "healthy" || status === "ok" || status === "sent") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  }
  if (
    status === "watching" ||
    status === "running" ||
    status === "scheduled" ||
    status === "sending" ||
    status === "warning"
  ) {
    return "border-amber-200 bg-amber-50 text-amber-700"
  }
  if (
    status === "needs_attention" ||
    status === "failed" ||
    status === "critical"
  ) {
    return "border-rose-200 bg-rose-50 text-rose-700"
  }
  return "border-border bg-muted text-muted-foreground"
}

function requestStatusTone(statusCode: number) {
  if (statusCode >= 500) return "border-rose-200 bg-rose-50 text-rose-700"
  if (statusCode >= 400) return "border-amber-200 bg-amber-50 text-amber-700"
  return "border-emerald-200 bg-emerald-50 text-emerald-700"
}

function endpointHealth(endpoint: {
  actionableErrorRequests?: number
  authSessionRequests?: number
  errorRequests: number
  p95DurationMs: number
  statusCounts?: Record<string, number>
  totalRequests: number
}) {
  const counts = endpoint.statusCounts ?? {}
  const serverErrors = countStatuses(counts, (status) => status >= 500)
  const notFoundErrors = countStatuses(counts, (status) => status === 404)
  const rateLimitedErrors = countStatuses(counts, (status) => status === 429)
  const authErrors = countStatuses(
    counts,
    (status) => status === 401 || status === 403
  )
  const validationErrors = countStatuses(
    counts,
    (status) => status >= 400 && status < 500 && ![401, 403, 404, 429].includes(status)
  )

  if (serverErrors > 0) {
    return {
      label: "Server error",
      className: "border-rose-200 bg-rose-50 text-rose-700",
      note: `${serverErrors} server error${serverErrors === 1 ? "" : "s"}`,
      severity: "critical" as const,
    }
  }
  if (notFoundErrors > 0) {
    return {
      label: "Missing route",
      className: "border-amber-200 bg-amber-50 text-amber-700",
      note: `${notFoundErrors} not found`,
      severity: "warning" as const,
    }
  }
  if (rateLimitedErrors > 0) {
    return {
      label: "Rate limited",
      className: "border-orange-200 bg-orange-50 text-orange-700",
      note: `${rateLimitedErrors} limited request${rateLimitedErrors === 1 ? "" : "s"}`,
      severity: "warning" as const,
    }
  }
  if (validationErrors > 0) {
    return {
      label: "Validation",
      className: "border-amber-200 bg-amber-50 text-amber-700",
      note: `${validationErrors} validation issue${validationErrors === 1 ? "" : "s"}`,
      severity: "warning" as const,
    }
  }
  if (authErrors > 0 && (endpoint.actionableErrorRequests ?? endpoint.errorRequests) === 0) {
    return {
      label: "Unauthorized",
      className: "border-slate-200 bg-slate-50 text-slate-600",
      note: `${authErrors} request${authErrors === 1 ? "" : "s"} without a valid token`,
      severity: "neutral" as const,
    }
  }
  if (endpoint.totalRequests >= 5 && endpoint.p95DurationMs >= 1500) {
    return {
      label: "Slow",
      className: "border-amber-200 bg-amber-50 text-amber-700",
      note: "P95 is high across enough samples",
      severity: "warning" as const,
    }
  }
  if (endpoint.totalRequests >= 60) {
    return {
      label: "Busy",
      className: "border-sky-200 bg-sky-50 text-sky-700",
      note: "High volume",
      severity: "info" as const,
    }
  }
  return {
    label: "Normal",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    note: "Healthy",
    severity: "normal" as const,
  }
}

function severityIcon(severity: string): LucideIcon {
  if (severity === "critical" || severity === "failed") return XCircle
  if (severity === "warning" || severity === "scheduled") return AlertTriangle
  if (severity === "running" || severity === "sending") return Loader2
  return CheckCircle2
}

function SeverityGlyph({
  severity,
  className,
}: {
  severity: string
  className?: string
}) {
  const iconClassName = cn(
    "size-4",
    (severity === "running" || severity === "sending") && "animate-spin",
    className
  )

  if (severity === "critical" || severity === "failed") {
    return <XCircle className={iconClassName} />
  }
  if (severity === "warning" || severity === "scheduled") {
    return <AlertTriangle className={iconClassName} />
  }
  if (severity === "running" || severity === "sending") {
    return <Loader2 className={iconClassName} />
  }
  return <CheckCircle2 className={iconClassName} />
}

function HealthSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-80" />
    </div>
  )
}

function MetricCard({
  title,
  value,
  helper,
  icon: Icon,
  className,
}: {
  title: string
  value: string | number
  helper: string
  icon: LucideIcon
  className?: string
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex size-10 items-center justify-center rounded-lg bg-background/75">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground uppercase">
            {title}
          </div>
          <div className="mt-1 text-2xl font-semibold tracking-tight">
            {value}
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {helper}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function infrastructureTone(status: string) {
  if (status === "healthy") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (status === "warning") return "border-amber-200 bg-amber-50 text-amber-700"
  if (status === "critical") return "border-rose-200 bg-rose-50 text-rose-700"
  return "border-border bg-muted text-muted-foreground"
}

function InfrastructurePanel({
  infrastructure,
}: {
  infrastructure?: AdminOperationalHealthSnapshot["infrastructure"]
}) {
  const components = infrastructure?.components ?? []
  const checkedAt = infrastructure?.checkedAt

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Infrastructure alerts</CardTitle>
            <CardDescription>
              Health-alert worker status for backend, database, errors,
              memory, CPU, and SSL certificates.
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className={infrastructureTone(infrastructure?.status ?? "unknown")}
          >
            {titleCase(infrastructure?.status ?? "unknown")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {components.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {components.map((component) => (
              <div
                key={component.key}
                className={cn(
                  "rounded-lg border p-3",
                  infrastructureTone(component.status)
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">
                      {component.label}
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs opacity-85">
                      {component.message}
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-background/70">
                    {titleCase(component.status)}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {component.value !== undefined ? (
                    <span className="rounded-md bg-background/70 px-2 py-1">
                      Value {String(component.value)}
                    </span>
                  ) : null}
                  {component.threshold !== undefined ? (
                    <span className="rounded-md bg-background/70 px-2 py-1">
                      Threshold {String(component.threshold)}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 text-[11px] opacity-75">
                  Checked {formatDateTime(component.checkedAt)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            Infrastructure status will appear after the health-alert worker
            completes its first check.
          </div>
        )}
        {checkedAt ? (
          <div className="text-xs text-muted-foreground">
            Last worker snapshot {formatDateTime(checkedAt)}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function formatAgeSeconds(value?: number | null) {
  if (typeof value !== "number") return "No update yet"
  if (value < 60) return `${value}s ago`
  const minutes = Math.floor(value / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m ago`
}

function formatCompactNumber(value: number, suffix = "") {
  if (!Number.isFinite(value)) return `0${suffix}`
  if (suffix === " km") return `${Math.round(value * 10) / 10}${suffix}`
  return `${Math.round(value)}${suffix}`
}

function socketRoleTone(role: string) {
  if (role === "admin") return "border-violet-200 bg-violet-50 text-violet-700"
  if (role === "owner") return "border-sky-200 bg-sky-50 text-sky-700"
  if (role === "rider") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (role === "customer") return "border-pink-200 bg-pink-50 text-pink-700"
  return "border-slate-200 bg-slate-50 text-slate-600"
}

function formatSocketRoom(room: string) {
  if (room === "admin:ops") return "Admin ops"
  if (room === "admin:live-map") return "Admin live map"
  if (room === "public:content") return "Public content updates"
  if (room.startsWith("owner:")) return `Owner room ${room.slice("owner:".length).slice(-6)}`
  if (room.startsWith("restaurant:")) {
    return `Restaurant room ${room.slice("restaurant:".length).slice(-6)}`
  }
  if (room.startsWith("customer:")) {
    return `Customer room ${room.slice("customer:".length).slice(-6)}`
  }
  if (room.startsWith("rider:")) return `Rider room ${room.slice("rider:".length).slice(-6)}`
  return room
}

function trackingFreshnessTone(state: string) {
  if (state === "live") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (state === "stale") return "border-amber-200 bg-amber-50 text-amber-700"
  return "border-slate-200 bg-slate-50 text-slate-600"
}

function RealtimeOpsPanel({
  realtime,
}: {
  realtime: AdminOperationalHealthSnapshot["realtime"]
}) {
  const navigate = useNavigate()
  const socket = realtime.socket
  const liveLocation = realtime.liveLocation
  const roleEntries = Object.entries(socket.byRole).sort(([left], [right]) =>
    left.localeCompare(right)
  )
  const activeRooms = Object.entries(socket.roomCounts)
    .filter(([, count]) => count > 0)
    .sort(([, leftCount], [, rightCount]) => rightCount - leftCount)
    .slice(0, 12)

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Sheet>
        <SheetTrigger asChild>
          <button
            type="button"
            className="group rounded-xl border bg-card p-4 text-left shadow-sm transition hover:border-primary/40 hover:bg-primary/5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <RadioTower className="size-5" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase">
                    Socket.IO online
                  </div>
                  <div className="mt-1 text-3xl font-semibold tracking-tight">
                    {socket.totalConnections}
                  </div>
                </div>
              </div>
              <Badge variant="outline" className={statusTone(socket.initialized ? "healthy" : "warning")}>
                {socket.initialized ? "Running" : "Not ready"}
              </Badge>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2 text-xs">
              <span className="rounded-lg bg-muted/60 px-2 py-1 text-center">
                Admin {socket.adminConnections}
              </span>
              <span className="rounded-lg bg-muted/60 px-2 py-1 text-center">
                Owner {socket.ownerConnections}
              </span>
              <span className="rounded-lg bg-muted/60 px-2 py-1 text-center">
                Rider {socket.riderConnections}
              </span>
              <span className="rounded-lg bg-muted/60 px-2 py-1 text-center">
                User {socket.customerConnections}
              </span>
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              Click to inspect connected rooms, users, transports, and IP
              context.
            </div>
          </button>
        </SheetTrigger>
        <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl! md:max-w-6xl!">
          <SheetHeader className="border-b px-6 py-5">
            <SheetTitle className="flex items-center gap-2">
              <RadioTower className="size-5 text-primary" />
              Socket connections
            </SheetTitle>
            <SheetDescription>
              Current Socket.IO clients connected to this backend process.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto p-6">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">Total</div>
                <div className="mt-1 text-2xl font-semibold">
                  {socket.totalConnections}
                </div>
              </div>
              <div className="rounded-xl border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">Signed in</div>
                <div className="mt-1 text-2xl font-semibold">
                  {socket.authenticatedConnections}
                </div>
              </div>
              <div className="rounded-xl border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">Anonymous</div>
                <div className="mt-1 text-2xl font-semibold">
                  {socket.anonymousConnections}
                </div>
              </div>
            </div>

            <div className="rounded-xl border p-3">
              <div className="text-sm font-medium">Role mix</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {roleEntries.length ? (
                  roleEntries.map(([role, count]) => (
                    <Badge key={role} variant="outline" className={socketRoleTone(role)}>
                      {titleCase(role)} {count}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">
                    No connected users yet.
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-xl border p-3">
              <div className="text-sm font-medium">Active rooms</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {activeRooms.length ? (
                  activeRooms.map(([room, count]) => (
                    <Badge key={room} variant="secondary">
                      {formatSocketRoom(room)} - {count}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">
                    No joined rooms yet.
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Connections</div>
              {socket.connections.map((connection) => (
                <div key={connection.id} className="rounded-xl border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={socketRoleTone(connection.role)}
                        >
                          {titleCase(connection.role)}
                        </Badge>
                        {connection.actorLabel ? (
                          <Badge variant="outline">{connection.actorLabel}</Badge>
                        ) : null}
                        <Badge variant="secondary">{connection.transport}</Badge>
                        {typeof connection.connectedForSeconds === "number" ? (
                          <Badge variant="secondary">
                            {formatUptime(connection.connectedForSeconds)} online
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-2 text-sm font-medium">
                        {connection.displayName || connection.userId || connection.id}
                      </div>
                      {connection.contact ? (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {connection.contact}
                        </div>
                      ) : null}
                      <div className="mt-1 break-all text-[11px] text-muted-foreground">
                        User ID {connection.userId || "anonymous"} · Socket {connection.id}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Connected {formatDateTime(connection.connectedAt)} - IP{" "}
                        {connection.ipAddress || "Unknown"}
                      </div>
                    </div>
                    <div className="max-w-full space-y-1 text-right text-xs text-muted-foreground">
                      <div>
                        {connection.primaryRoom
                          ? formatSocketRoom(connection.primaryRoom)
                          : "No room"}
                      </div>
                      {connection.businessRooms?.length ? (
                        <div className="max-w-sm">
                          {connection.businessRooms.slice(0, 3).map(formatSocketRoom).join(", ")}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {connection.lifecycleNote ? (
                    <div className="mt-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      {connection.lifecycleNote}
                    </div>
                  ) : null}
                  {connection.userAgent ? (
                    <div className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                      {connection.userAgent}
                    </div>
                  ) : null}
                </div>
              ))}
              {!socket.connections.length ? (
                <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No active Socket.IO connections in this backend process.
                </div>
              ) : null}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet>
        <SheetTrigger asChild>
          <button
            type="button"
            className="group rounded-xl border bg-card p-4 text-left shadow-sm transition hover:border-primary/40 hover:bg-primary/5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <MapPinned className="size-5" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase">
                    Live location shares
                  </div>
                  <div className="mt-1 text-3xl font-semibold tracking-tight">
                    {liveLocation.activeShares}
                  </div>
                </div>
              </div>
              <Badge
                variant="outline"
                className={
                  liveLocation.staleShares > 0
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                }
              >
                {liveLocation.staleShares > 0 ? "Needs watch" : "Healthy"}
              </Badge>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
              <span className="rounded-lg bg-emerald-50 px-2 py-1 text-center text-emerald-700">
                Live {liveLocation.liveShares}
              </span>
              <span className="rounded-lg bg-amber-50 px-2 py-1 text-center text-amber-700">
                Stale {liveLocation.staleShares}
              </span>
              <span className="rounded-lg bg-sky-50 px-2 py-1 text-center text-sky-700">
                Focused {liveLocation.focusedShares}
              </span>
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              Click to inspect active rider tracking orders and freshness.
            </div>
          </button>
        </SheetTrigger>
        <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl! md:max-w-6xl!">
          <SheetHeader className="border-b px-6 py-5">
            <SheetTitle className="flex items-center gap-2">
              <MapPinned className="size-5 text-emerald-600" />
              Live location sharing
            </SheetTitle>
            <SheetDescription>
              Picked-up orders where rider tracking is currently active.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto p-6">
            <div className="grid gap-2 sm:grid-cols-4">
              <div className="rounded-xl border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">Active</div>
                <div className="mt-1 text-2xl font-semibold">
                  {liveLocation.activeShares}
                </div>
              </div>
              <div className="rounded-xl border bg-emerald-50/60 p-3 text-emerald-700">
                <div className="text-xs">Fresh</div>
                <div className="mt-1 text-2xl font-semibold">
                  {liveLocation.liveShares}
                </div>
              </div>
              <div className="rounded-xl border bg-amber-50/60 p-3 text-amber-700">
                <div className="text-xs">Stale</div>
                <div className="mt-1 text-2xl font-semibold">
                  {liveLocation.staleShares}
                </div>
              </div>
              <div className="rounded-xl border bg-sky-50/60 p-3 text-sky-700">
                <div className="text-xs">Focused</div>
                <div className="mt-1 text-2xl font-semibold">
                  {liveLocation.focusedShares}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {liveLocation.orders.map((order) => (
                <div key={order.id} className="rounded-xl border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{order.orderNumber}</Badge>
                        <Badge
                          variant="outline"
                          className={trackingFreshnessTone(order.freshness.state)}
                        >
                          {titleCase(order.freshness.state)}
                        </Badge>
                        {order.isFocused ? (
                          <Badge variant="outline">Focused trip</Badge>
                        ) : null}
                      </div>
                      <div className="mt-2 font-medium">
                        {order.riderName || "Rider"} to{" "}
                        {order.customerName || "Customer"}
                      </div>
                      <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {order.deliveryAddress || "Delivery address unavailable"}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/orders?orderId=${order.id}`)}
                    >
                      Open order
                    </Button>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                    <span>Updated {formatAgeSeconds(order.freshness.ageSeconds)}</span>
                    <span>
                      ETA{" "}
                      {formatCompactNumber(order.remainingDurationMinutes, " min")}
                    </span>
                    <span>
                      Left {formatCompactNumber(order.remainingDistanceKm, " km")}
                    </span>
                    <span>Speed {formatCompactNumber(order.speedKmph, " km/h")}</span>
                  </div>
                  {order.currentLocation ? (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {order.currentLocation.latitude.toFixed(5)},{" "}
                      {order.currentLocation.longitude.toFixed(5)} - Last{" "}
                      {formatDateTime(order.lastUpdatedAt)}
                    </div>
                  ) : null}
                </div>
              ))}
              {!liveLocation.orders.length ? (
                <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No rider is sharing live location right now.
                </div>
              ) : null}
              {liveLocation.activeShares > liveLocation.sampleSize ? (
                <div className="rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Showing latest {liveLocation.sampleSize} of{" "}
                  {liveLocation.activeShares} active shares.
                </div>
              ) : null}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function requestAppLabel(app: string) {
  if (app === "admin") return "Admin web"
  if (app === "owner") return "Restaurant owner"
  if (app === "rider") return "Delivery app"
  if (app === "customer") return "Customer app"
  if (app === "public") return "Public API"
  if (app === "system") return "System"
  return "Unknown"
}

function requestAppIcon(app: string): LucideIcon {
  if (app === "admin") return MonitorCog
  if (app === "owner") return Store
  if (app === "rider") return Bike
  if (app === "customer") return UsersRound
  if (app === "public") return Network
  return ServerCog
}

function countStatuses(
  statusCounts: Record<string, number> | undefined,
  predicate: (status: number) => boolean
) {
  return Object.entries(statusCounts ?? {}).reduce(
    (total, [status, count]) =>
      total + (predicate(Number(status)) ? count : 0),
    0
  )
}

function summarizeMonitorIssues(
  endpoints: AdminOperationalHealthSnapshot["requestMonitor"]["endpoints"]
) {
  return endpoints.reduce(
    (summary, endpoint) => {
      summary.serverErrors += countStatuses(
        endpoint.statusCounts,
        (status) => status >= 500
      )
      summary.notFound += countStatuses(
        endpoint.statusCounts,
        (status) => status === 404
      )
      summary.rateLimited += countStatuses(
        endpoint.statusCounts,
        (status) => status === 429
      )
      summary.authChecks += countStatuses(
        endpoint.statusCounts,
        (status) => status === 401 || status === 403
      )
      summary.validation += countStatuses(
        endpoint.statusCounts,
        (status) =>
          status >= 400 && status < 500 && ![401, 403, 404, 429].includes(status)
      )
      summary.slowEndpoints +=
        endpoint.totalRequests >= 5 && endpoint.p95DurationMs >= 1500 ? 1 : 0
      return summary
    },
    {
      authChecks: 0,
      notFound: 0,
      rateLimited: 0,
      serverErrors: 0,
      slowEndpoints: 0,
      validation: 0,
    }
  )
}

function formatStatusCounts(statusCounts?: Record<string, number>) {
  const entries = Object.entries(statusCounts ?? {}).sort(
    ([left], [right]) => Number(left) - Number(right)
  )
  if (!entries.length) return "No status data"
  return entries.map(([status, count]) => `${status}: ${count}`).join(" · ")
}

function buildRequestDiagnostics(params: {
  appFilter: RequestAppFilter
  endpoints: AdminOperationalHealthSnapshot["requestMonitor"]["endpoints"]
  issueSummary: ReturnType<typeof summarizeMonitorIssues>
  monitor: AdminOperationalHealthSnapshot["requestMonitor"]
  onlyErrors: boolean
  recent: AdminOperationalHealthSnapshot["requestMonitor"]["recent"]
}) {
  return {
    generatedAt: new Date().toISOString(),
    filters: {
      app: params.appFilter,
      non2xxOnly: params.onlyErrors,
    },
    monitor: {
      startedAt: params.monitor.startedAt,
      lastCapturedAt: params.monitor.lastCapturedAt,
      windowMinutes: params.monitor.windowMinutes,
      summary: params.monitor.summary,
      issueSummary: params.issueSummary,
    },
    endpoints: params.endpoints.map((endpoint) => ({
      app: requestAppLabel(endpoint.app),
      method: endpoint.method,
      route: endpoint.route,
      lastPath: endpoint.lastPath,
      totalRequests: endpoint.totalRequests,
      errorRequests: endpoint.errorRequests,
      statusCounts: endpoint.statusCounts,
      errorSamples: endpoint.errorSamples,
      averageDurationMs: endpoint.averageDurationMs,
      p95DurationMs: endpoint.p95DurationMs,
      lastStatusCode: endpoint.lastStatusCode,
      lastSeenAt: endpoint.lastSeenAt,
      health: endpointHealth(endpoint).label,
    })),
    recent: params.recent,
  }
}

function RequestMonitorPanel({
  monitor,
}: {
  monitor: AdminOperationalHealthSnapshot["requestMonitor"]
}) {
  const queryClient = useQueryClient()
  const [appFilter, setAppFilter] = React.useState<RequestAppFilter>("all")
  const [onlyErrors, setOnlyErrors] = React.useState(false)
  const [showSessionChecks, setShowSessionChecks] = React.useState(false)
  const filteredEndpoints = React.useMemo(
    () =>
      monitor.endpoints.filter((endpoint) => {
        const matchesApp = appFilter === "all" || endpoint.app === appFilter
        const actionableErrors =
          endpoint.actionableErrorRequests ?? endpoint.errorRequests
        const matchesErrors = !onlyErrors || actionableErrors > 0
        const sessionOnly =
          actionableErrors === 0 && (endpoint.authSessionRequests ?? 0) > 0
        return matchesApp && matchesErrors && (showSessionChecks || !sessionOnly)
      }),
    [appFilter, monitor.endpoints, onlyErrors, showSessionChecks],
  )
  const filteredRecent = React.useMemo(
    () =>
      monitor.recent.filter((event) => {
        const matchesApp = appFilter === "all" || event.app === appFilter
        const matchesErrors = !onlyErrors || event.statusCode >= 400
        return matchesApp && matchesErrors
      }),
    [appFilter, monitor.recent, onlyErrors],
  )
  const filteredRecentErrors = React.useMemo(
    () =>
      (monitor.recentErrors ?? monitor.recent.filter((event) => event.statusCode >= 400)).filter(
        (event) => {
          const matchesApp = appFilter === "all" || event.app === appFilter
          const actionable =
            event.statusCode >= 400 && event.statusCode !== 401 && event.statusCode !== 403
          const sessionCheck = event.statusCode === 401 || event.statusCode === 403
          return matchesApp && actionable && (!sessionCheck || showSessionChecks)
        },
      ),
    [appFilter, monitor.recent, monitor.recentErrors, showSessionChecks],
  )
  const issueSummary = React.useMemo(
    () => summarizeMonitorIssues(monitor.endpoints),
    [monitor.endpoints]
  )
  const suspiciousEndpoints = monitor.endpoints.filter((endpoint) => {
    const health = endpointHealth(endpoint)
    return ["critical", "warning"].includes(health.severity)
  })
  const hasActionableIssues =
    issueSummary.serverErrors > 0 ||
    issueSummary.notFound > 0 ||
    issueSummary.rateLimited > 0 ||
    issueSummary.validation > 0
  const hasPerformanceWatch = !hasActionableIssues && issueSummary.slowEndpoints > 0
  const diagnostics = React.useMemo(
    () =>
      buildRequestDiagnostics({
        appFilter,
        endpoints: filteredEndpoints,
        issueSummary,
        monitor,
        onlyErrors,
        recent: filteredRecent,
      }),
    [
      appFilter,
      filteredEndpoints,
      filteredRecent,
      issueSummary,
      monitor,
      onlyErrors,
    ]
  )

  const copyDiagnostics = React.useCallback(() => {
    const text = JSON.stringify(diagnostics, null, 2)
    void navigator.clipboard
      .writeText(text)
      .then(() => toast.success("Request diagnostics copied"))
      .catch(() => toast.error("Could not copy diagnostics"))
  }, [diagnostics])

  const clearMonitorMutation = useMutation({
    mutationFn: clearAdminRequestMonitor,
    onSuccess: () => {
      toast.success("Request monitor cleared")
      void queryClient.invalidateQueries({ queryKey: ["admin-operational-health"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not clear request monitor"
      )
    },
  })

  const downloadDiagnostics = React.useCallback(() => {
    const blob = new Blob([JSON.stringify(diagnostics, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `request-diagnostics-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    toast.success("Request diagnostics downloaded")
  }, [diagnostics])

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard
          title="Requests"
          value={monitor.summary.totalRequests}
          helper={`Last ${monitor.windowMinutes} minutes`}
          icon={Activity}
        />
        <MetricCard
          title="Actionable errors"
          value={
            monitor.summary.actionableErrorRequests ??
            monitor.summary.errorRequests
          }
          helper={`${monitor.summary.authSessionRequests ?? 0} unauthorized requests ignored`}
          icon={ShieldAlert}
          className={
            (monitor.summary.actionableErrorRequests ??
              monitor.summary.errorRequests) > 0
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : undefined
          }
        />
        <MetricCard
          title="Avg response"
          value={formatDuration(monitor.summary.averageDurationMs)}
          helper={`P95 ${formatDuration(monitor.summary.p95DurationMs)}`}
          icon={Gauge}
        />
        <MetricCard
          title="Traffic rate"
          value={`${monitor.summary.requestsPerMinute}/min`}
          helper={`Peak ${formatDuration(monitor.summary.maxDurationMs)}`}
          icon={RadioTower}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Monitoring summary</CardTitle>
              <CardDescription>
                Actionable backend issues are separated from normal auth/session
                checks so the signal stays clean.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={
                  hasActionableIssues
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : hasPerformanceWatch
                      ? "border-sky-200 bg-sky-50 text-sky-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                }
              >
                {hasActionableIssues
                  ? `${suspiciousEndpoints.length} endpoint${suspiciousEndpoints.length === 1 ? "" : "s"} need review`
                  : hasPerformanceWatch
                    ? `${issueSummary.slowEndpoints} endpoint${issueSummary.slowEndpoints === 1 ? "" : "s"} on performance watch`
                  : "Traffic looks normal"}
              </Badge>
              <Button
                size="sm"
                variant="outline"
                onClick={() => clearMonitorMutation.mutate()}
                disabled={
                  !monitor.summary.totalRequests || clearMonitorMutation.isPending
                }
              >
                {clearMonitorMutation.isPending ? (
                  <Loader2 className="mr-2 size-3.5 animate-spin" />
                ) : (
                  <RefreshCcw className="mr-2 size-3.5" />
                )}
                Clear requests
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <div className="rounded-lg border border-rose-100 bg-rose-50/60 p-3">
              <div className="text-xs text-rose-700">Server errors</div>
              <div className="mt-1 text-xl font-semibold text-rose-700">
                {issueSummary.serverErrors}
              </div>
            </div>
            <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-3">
              <div className="text-xs text-amber-700">Missing routes</div>
              <div className="mt-1 text-xl font-semibold text-amber-700">
                {issueSummary.notFound}
              </div>
            </div>
            <div className="rounded-lg border border-orange-100 bg-orange-50/60 p-3">
              <div className="text-xs text-orange-700">Rate limited</div>
              <div className="mt-1 text-xl font-semibold text-orange-700">
                {issueSummary.rateLimited}
              </div>
            </div>
            <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-3">
              <div className="text-xs text-amber-700">Validation</div>
              <div className="mt-1 text-xl font-semibold text-amber-700">
                {issueSummary.validation}
              </div>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="text-xs text-slate-600">Unauthorized requests</div>
              <div className="mt-1 text-xl font-semibold text-slate-700">
                {issueSummary.authChecks}
              </div>
            </div>
            <div className="rounded-lg border border-sky-100 bg-sky-50/60 p-3">
              <div className="text-xs text-sky-700">Slow endpoints</div>
              <div className="mt-1 text-xl font-semibold text-sky-700">
                {issueSummary.slowEndpoints}
              </div>
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            Priority order: fix `Server errors` first, then `Missing routes`,
            then `Validation` or `Rate limited`. `Unauthorized requests` are
            request attempts without a valid admin token; they are counted as
            request noise, not active admin sessions.
          </div>
          <div className="flex flex-wrap gap-2">
            {requestAppFilters.map((filter) => (
              <Button
                key={filter.value}
                size="sm"
                variant={appFilter === filter.value ? "default" : "outline"}
                onClick={() => setAppFilter(filter.value)}
              >
                {filter.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={onlyErrors ? "default" : "outline"}
              onClick={() => setOnlyErrors((value) => !value)}
            >
              {onlyErrors ? "Showing non-2xx only" : "Show non-2xx only"}
            </Button>
            <Button
              size="sm"
              variant={showSessionChecks ? "default" : "outline"}
              onClick={() => setShowSessionChecks((value) => !value)}
            >
              {showSessionChecks ? "Showing unauthorized" : "Show unauthorized"}
            </Button>
            {(appFilter !== "all" || onlyErrors || showSessionChecks) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAppFilter("all")
                  setOnlyErrors(false)
                  setShowSessionChecks(false)
                }}
              >
                Clear filters
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              Showing {filteredEndpoints.length} of {monitor.endpoints.length}{" "}
              endpoints.
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={copyDiagnostics}
                disabled={!monitor.summary.totalRequests}
              >
                <ClipboardCopy className="mr-2 size-3.5" />
                Copy diagnostics
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={downloadDiagnostics}
                disabled={!monitor.summary.totalRequests}
              >
                <Download className="mr-2 size-3.5" />
                Export JSON
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {monitor.byApp.map((row) => {
          const Icon = requestAppIcon(row.app)
          return (
            <Card key={row.app}>
              <CardContent className="flex items-start gap-3 p-4">
                <div className="flex size-10 items-center justify-center rounded-xl border bg-muted/40">
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">{requestAppLabel(row.app)}</div>
                    <Badge
                      variant="outline"
                      className={
                        (row.actionableErrorRequests ?? row.errorRequests) > 0
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : undefined
                      }
                    >
                      {row.totalRequests} hits
                    </Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <span>Errors {row.actionableErrorRequests ?? row.errorRequests}</span>
                    <span>Unauthorized {row.authSessionRequests ?? 0}</span>
                    <span>Avg {formatDuration(row.averageDurationMs)}</span>
                    <span>P95 {formatDuration(row.p95DurationMs)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
        {!monitor.byApp.length ? (
          <div className="rounded-lg border border-dashed p-8 text-center md:col-span-2 xl:col-span-3">
            <div className="text-sm font-medium">Request monitor is waiting</div>
            <div className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
              It starts empty after every backend restart and keeps only the
              latest {monitor.windowMinutes} minutes in memory. Browse any app
              or press refresh again after this page loads.
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              Started {formatDateTime(monitor.startedAt)} · Last captured{" "}
              {formatDateTime(monitor.lastCapturedAt)}
            </div>
          </div>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top endpoints</CardTitle>
          <CardDescription>
            Highest traffic endpoints in the current rolling window. Dynamic
            IDs are grouped so repeated order/user calls are easier to read.
            Monitor active since {formatDateTime(monitor.startedAt)}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {filteredEndpoints.map((endpoint) => {
            const health = endpointHealth(endpoint)
            return (
              <div key={endpoint.key} className="rounded-lg border p-3">
                <div className="grid gap-3 lg:grid-cols-[0.9fr_1.4fr_0.7fr_0.8fr]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">
                        {requestAppLabel(endpoint.app)}
                      </Badge>
                      <Badge variant="outline">{endpoint.method}</Badge>
                      <Badge variant="outline" className={health.className}>
                        {health.label}
                      </Badge>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {health.note} · Last {formatDateTime(endpoint.lastSeenAt)}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="break-all font-medium">{endpoint.route}</div>
                    <div className="mt-1 break-all text-xs text-muted-foreground">
                      Last path: {endpoint.lastPath}
                    </div>
                    {endpoint.errorSamples?.length ? (
                      <div className="mt-2 space-y-1">
                        {endpoint.errorSamples.slice(0, 2).map((sample) => (
                          <div
                            key={`${sample.code}-${sample.message}-${sample.lastSeenAt}`}
                            className="rounded-md border bg-muted/30 px-2 py-1 text-xs"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant="outline"
                                className={requestStatusTone(sample.statusCode)}
                              >
                                {sample.statusCode}
                              </Badge>
                              <span className="font-medium">{sample.code}</span>
                              <span className="text-muted-foreground">
                                {sample.count}x
                              </span>
                            </div>
                            <div className="mt-1 break-words text-muted-foreground">
                              {sample.message}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="text-sm">
                    <div className="font-medium">
                      {endpoint.totalRequests} hits
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {endpoint.actionableErrorRequests ?? endpoint.errorRequests} errors
                      {endpoint.authSessionRequests
                        ? ` · ${endpoint.authSessionRequests} unauthorized`
                        : ""}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatStatusCounts(endpoint.statusCounts)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-start gap-2 lg:justify-end">
                    <Badge
                      variant="outline"
                      className={requestStatusTone(endpoint.lastStatusCode)}
                    >
                      {endpoint.lastStatusCode}
                    </Badge>
                    <Badge variant="outline">
                      Avg {formatDuration(endpoint.averageDurationMs)}
                    </Badge>
                    <Badge variant="outline">
                      P95 {formatDuration(endpoint.p95DurationMs)}
                    </Badge>
                  </div>
                </div>
              </div>
            )
          })}
          {!filteredEndpoints.length ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <div className="text-sm font-medium">
                {monitor.summary.totalRequests
                  ? "No endpoint traffic matches the selected filters."
                  : "No API traffic captured yet."}
              </div>
              <div className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
                {monitor.summary.totalRequests
                  ? "Clear filters or turn off errors-only mode to see more endpoints."
                  : "Use the admin/customer/owner/rider apps, then refresh this page. If this stays empty, restart the backend so the latest request monitor middleware is running."}
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                Started {formatDateTime(monitor.startedAt)} · Last captured{" "}
                {formatDateTime(monitor.lastCapturedAt)}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent actionable error timeline</CardTitle>
          <CardDescription>
            Latest failed API calls that need investigation. Unauthorized admin
            token checks are hidden unless you choose to show them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {filteredRecentErrors.map((event, index) => (
            <div
              key={`${event.timestamp}-${event.method}-${event.path}-${index}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{requestAppLabel(event.app)}</Badge>
                  <Badge variant="outline">{event.method}</Badge>
                  <Badge
                    variant="outline"
                    className={requestStatusTone(event.statusCode)}
                  >
                    {event.statusCode}
                  </Badge>
                </div>
                <div className="mt-2 break-all font-medium">{event.route}</div>
                <div className="mt-1 break-all text-xs text-muted-foreground">
                  {event.path}
                </div>
                {event.statusCode >= 400 ? (
                  <div className="mt-2 rounded-md border bg-muted/30 px-2 py-1 text-xs">
                    <span className="font-medium">
                      {event.errorCode || "REQUEST_ERROR"}
                    </span>
                    <span className="text-muted-foreground">
                      {" "}
                      {event.errorMessage || "Request failed."}
                    </span>
                  </div>
                ) : null}
              </div>
              <div className="text-right text-sm text-muted-foreground">
                <div>{formatDuration(event.durationMs)}</div>
                <div>{formatDateTime(event.timestamp)}</div>
              </div>
            </div>
          ))}
          {!filteredRecentErrors.length ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {(monitor.summary.actionableErrorRequests ?? monitor.summary.errorRequests) > 0
                ? "No recent actionable errors match the selected filters."
                : "No recent actionable request errors captured."}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent request timeline</CardTitle>
          <CardDescription>
            Last few API calls captured by this backend process.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {filteredRecent.map((event, index) => (
            <div
              key={`${event.timestamp}-${event.method}-${event.path}-${index}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{requestAppLabel(event.app)}</Badge>
                  <Badge variant="outline">{event.method}</Badge>
                  <Badge
                    variant="outline"
                    className={requestStatusTone(event.statusCode)}
                  >
                    {event.statusCode}
                  </Badge>
                </div>
                <div className="mt-2 break-all font-medium">{event.route}</div>
                <div className="mt-1 break-all text-xs text-muted-foreground">
                  {event.path}
                </div>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                <div>{formatDuration(event.durationMs)}</div>
                <div>{formatDateTime(event.timestamp)}</div>
              </div>
            </div>
          ))}
          {!filteredRecent.length ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {monitor.summary.totalRequests
                ? "No recent requests match the selected filters."
                : "Recent requests will appear after API traffic reaches this backend process."}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

function TimelineItem({
  item,
}: {
  item: AdminOperationalHealthSnapshot["timeline"][number]
}) {
  return (
    <div className="grid grid-cols-[2.25rem_1fr] gap-3">
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "flex size-8 items-center justify-center rounded-lg border",
            statusTone(item.severity)
          )}
        >
          <SeverityGlyph severity={item.severity} />
        </div>
        <div className="mt-2 h-full w-px bg-border" />
      </div>
      <div className="rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="font-medium">
              {item.title || titleCase(item.event)}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {item.description || titleCase(item.category)}
            </div>
          </div>
          <Badge variant="outline" className={statusTone(item.severity)}>
            {titleCase(item.severity)}
          </Badge>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>{formatDateTime(item.createdAt)}</span>
          <span>{titleCase(item.category)}</span>
          {item.entityType ? <span>{titleCase(item.entityType)}</span> : null}
        </div>
      </div>
    </div>
  )
}

function JobRow({
  job,
}: {
  job: AdminOperationalHealthSnapshot["schedulerJobs"][number]
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={cn(
            "flex size-9 items-center justify-center rounded-lg border",
            statusTone(job.status)
          )}
        >
          <SeverityGlyph severity={job.status} />
        </div>
        <div className="min-w-0">
          <div className="truncate font-medium">{job.label}</div>
          <div className="truncate text-sm text-muted-foreground">
            Finished {formatDateTime(job.lastFinishedAt)}
          </div>
          {job.lastError ? (
            <div className="mt-1 truncate text-xs text-rose-600">
              {job.lastError}
            </div>
          ) : null}
        </div>
      </div>
      <div className="text-right">
        <Badge variant="outline" className={statusTone(job.status)}>
          {titleCase(job.status)}
        </Badge>
        <div className="mt-1 text-xs text-muted-foreground">
          {formatDuration(job.lastDurationMs)}
        </div>
      </div>
    </div>
  )
}

const refreshOptions = [0, 15_000, 30_000, 60_000, 120_000, 300_000]

const refreshPolicyRows: Array<{
  key: keyof AdminRefreshPolicy
  label: string
  helper: string
}> = [
  {
    key: "notificationsMs",
    label: "Admin notifications",
    helper: "Top bar notification count and recent notifications.",
  },
  {
    key: "dashboardMs",
    label: "Dashboard",
    helper: "Dashboard summary, orders, restaurants, and riders.",
  },
  {
    key: "operationsHealthMs",
    label: "Operations Health",
    helper: "Scheduler state, active alerts, and business event history.",
  },
  {
    key: "liveMapMs",
    label: "Live delivery map",
    helper: "Rider markers and active delivery map snapshots.",
  },
  {
    key: "sessionsMs",
    label: "Sessions",
    helper: "Admin session security table while Sessions page is open.",
  },
  {
    key: "riderDetailsMs",
    label: "Rider details drawer",
    helper: "Selected rider profile/payroll/location drawer refresh.",
  },
]

type AutoHitApp = "Admin web" | "Owner web" | "Delivery app" | "Customer app"
type AutoHitMode = "always" | "conditional" | "event_based" | "manual"

const autoHitDefinitions: Array<{
  app: AutoHitApp
  label: string
  endpoint: string
  policyKey?: keyof AdminRefreshPolicy
  intervalMs?: number
  condition: string
  mode: AutoHitMode
  note: string
}> = [
  {
    app: "Admin web",
    label: "Top nav notifications",
    endpoint: "GET /admin/notifications",
    policyKey: "notificationsMs",
    condition: "When an admin is signed in",
    mode: "always",
    note: "Keeps unread count and top notification list fresh.",
  },
  {
    app: "Admin web",
    label: "Dashboard reports",
    endpoint: "GET /admin/reports",
    policyKey: "dashboardMs",
    condition: "Only when Dashboard auto-refresh is enabled",
    mode: "conditional",
    note: "Part of dashboard auto-refresh.",
  },
  {
    app: "Admin web",
    label: "Dashboard live orders",
    endpoint: "GET /admin/orders",
    policyKey: "dashboardMs",
    condition: "Only when Dashboard auto-refresh is enabled",
    mode: "conditional",
    note: "Part of dashboard auto-refresh.",
  },
  {
    app: "Admin web",
    label: "Dashboard restaurants",
    endpoint: "GET /admin/restaurants",
    policyKey: "dashboardMs",
    condition: "Only when Dashboard auto-refresh is enabled",
    mode: "conditional",
    note: "Part of dashboard auto-refresh.",
  },
  {
    app: "Admin web",
    label: "Dashboard riders",
    endpoint: "GET /admin/riders",
    policyKey: "dashboardMs",
    condition: "Only when Dashboard auto-refresh is enabled",
    mode: "conditional",
    note: "Part of dashboard auto-refresh.",
  },
  {
    app: "Admin web",
    label: "Operations Health",
    endpoint: "GET /admin/operations/health",
    policyKey: "operationsHealthMs",
    condition: "Only while Operations Health page is open",
    mode: "conditional",
    note: "Tracks scheduler state, active alerts, and event history.",
  },
  {
    app: "Admin web",
    label: "Live delivery map",
    endpoint: "GET /admin/live-map",
    policyKey: "liveMapMs",
    condition: "Only while Live Map page or Riders live tab is mounted",
    mode: "conditional",
    note: "Keeps rider markers and live delivery map current.",
  },
  {
    app: "Admin web",
    label: "Sessions",
    endpoint: "GET /admin/sessions",
    policyKey: "sessionsMs",
    condition: "Only while Sessions page is open",
    mode: "conditional",
    note: "Refreshes active device/session status for account security.",
  },
  {
    app: "Admin web",
    label: "Rider details drawer",
    endpoint: "GET /admin/riders/:riderId",
    policyKey: "riderDetailsMs",
    condition: "Only while a rider drawer is open",
    mode: "conditional",
    note: "Keeps selected rider payroll, availability, and live status current.",
  },
  {
    app: "Owner web",
    label: "Owner web notifications",
    endpoint: "GET /owner/notifications",
    intervalMs: 30_000,
    condition: "When owner notification query is enabled",
    mode: "conditional",
    note: "Owner order/support notifications. Socket events also invalidate owner data.",
  },
  {
    app: "Owner web",
    label: "Owner app notifications",
    endpoint: "GET /owner/notifications",
    intervalMs: 20_000,
    condition: "When restaurant owner app notification query is enabled",
    mode: "conditional",
    note: "Mobile owner app keeps notification count fresher than web.",
  },
  {
    app: "Owner web",
    label: "Owner live updates",
    endpoint: "Socket invalidation, then relevant owner endpoints",
    intervalMs: 0,
    condition: "Only when backend sends owner socket events",
    mode: "event_based",
    note: "Orders, payouts, support, vouchers, reviews refresh after realtime events.",
  },
  {
    app: "Delivery app",
    label: "Available rider location heartbeat",
    endpoint: "PATCH /rider/profile/location",
    intervalMs: 60_000,
    condition: "Only when rider is online, available, and not on an active trip",
    mode: "conditional",
    note: "Uses Admin Settings live tracking passive heartbeat. Default is 60s.",
  },
  {
    app: "Delivery app",
    label: "Active trip location",
    endpoint: "PATCH /rider/profile/location + order tracking socket fanout",
    intervalMs: 15_000,
    condition: "Only while rider has picked up an order and live tracking is active",
    mode: "conditional",
    note: "Uses Admin Settings live tracking update interval. Default is 15s and movement-gated by distance.",
  },
  {
    app: "Delivery app",
    label: "Rider socket updates",
    endpoint: "Socket invalidation, then rider order/profile endpoints",
    intervalMs: 0,
    condition: "Only when assignment/order/profile socket events arrive",
    mode: "event_based",
    note: "No fixed polling interval; events trigger targeted refresh or cache patching.",
  },
  {
    app: "Customer app",
    label: "Customer realtime updates",
    endpoint: "Socket invalidation, then customer order/notification/support endpoints",
    intervalMs: 0,
    condition: "Only when customer socket events arrive",
    mode: "event_based",
    note: "No fixed polling interval for normal order/support updates.",
  },
  {
    app: "Customer app",
    label: "Customer screens and pull refresh",
    endpoint: "Customer endpoints opened by screen/manual refresh",
    intervalMs: 0,
    condition: "Only when a screen opens, user refreshes, or a mutation invalidates cache",
    mode: "manual",
    note: "TanStack Query uses cache/stale time, not a constant polling loop.",
  },
]

const appOrder: AutoHitApp[] = [
  "Admin web",
  "Owner web",
  "Delivery app",
  "Customer app",
]

const autoHitAppMeta: Record<
  AutoHitApp,
  { icon: LucideIcon; description: string; className: string }
> = {
  "Admin web": {
    icon: MonitorCog,
    description: "Admin dashboard, operations health, notification, and live map refreshes.",
    className: "border-sky-100 bg-sky-50/60 text-sky-700",
  },
  "Owner web": {
    icon: Store,
    description: "Restaurant owner notification polling plus socket-triggered refreshes.",
    className: "border-amber-100 bg-amber-50/70 text-amber-700",
  },
  "Delivery app": {
    icon: Bike,
    description: "Rider location heartbeats, active trip tracking, and rider socket events.",
    className: "border-emerald-100 bg-emerald-50/70 text-emerald-700",
  },
  "Customer app": {
    icon: UsersRound,
    description: "Customer sockets, screen loads, pull refresh, and notification queries.",
    className: "border-pink-100 bg-pink-50/70 text-pink-700",
  },
}

function requestsPerMinute(intervalMs: number) {
  if (!intervalMs) return 0
  return 60_000 / intervalMs
}

function formatRequestsPerMinute(value: number) {
  if (value === 0) return "0/min"
  if (Number.isInteger(value)) return `${value}/min`
  return `${Math.round(value * 10) / 10}/min`
}

function autoHitModeLabel(mode: AutoHitMode) {
  if (mode === "event_based") return "Event based"
  if (mode === "always") return "Always"
  if (mode === "conditional") return "Conditional"
  return "Manual/cache"
}

function autoHitModeTone(mode: AutoHitMode) {
  if (mode === "always") return "default"
  if (mode === "conditional") return "secondary"
  return "outline"
}

function getAutoHitInterval(
  item: (typeof autoHitDefinitions)[number],
  policy: AdminRefreshPolicy
) {
  if (item.policyKey) return policy[item.policyKey]
  return item.intervalMs ?? 0
}

function isAutoHitActive(
  item: (typeof autoHitDefinitions)[number],
  policy: AdminRefreshPolicy
) {
  if (item.mode === "event_based" || item.mode === "manual") return true
  return getAutoHitInterval(item, policy) > 0
}

function RefreshPolicySheet() {
  const { policy, updatePolicy, resetPolicy } = useAdminRefreshPolicy()
  const setPolicyActive = React.useCallback(
    (key: keyof AdminRefreshPolicy, active: boolean) => {
      updatePolicy({
        [key]: active ? DEFAULT_ADMIN_REFRESH_POLICY[key] : 0,
      })
    },
    [updatePolicy],
  )
  const alwaysOnPerMinute = autoHitDefinitions
    .filter((item) => item.mode === "always" && isAutoHitActive(item, policy))
    .reduce(
      (sum, item) => sum + requestsPerMinute(getAutoHitInterval(item, policy)),
      0,
    )
  const maximumVisiblePerMinute = autoHitDefinitions.reduce(
    (sum, item) => sum + requestsPerMinute(getAutoHitInterval(item, policy)),
    0,
  )
  const groupedAutoHits = appOrder.map((app) => ({
    app,
    items: autoHitDefinitions.filter((item) => item.app === app),
  }))
  const pollingRows = autoHitDefinitions.filter(
    (item) => getAutoHitInterval(item, policy) > 0
  ).length

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontal className="mr-2 size-4" />
          Refresh policy
        </Button>
      </SheetTrigger>
      <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl! md:max-w-6xl!">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle>Refresh policy</SheetTitle>
          <SheetDescription>
            Control how often admin panels refresh in this browser. Reset
            returns the professional default values. Auto hits show the whole
            platform so you can understand what is polling, what is
            condition-based, and what is socket/manual.
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="settings" className="flex-1 space-y-4 overflow-y-auto p-6">
          <TabsList className="flex h-auto w-full flex-wrap justify-start">
            <TabsTrigger value="settings">Refresh settings</TabsTrigger>
            <TabsTrigger value="auto-hits">Auto hits</TabsTrigger>
            <TabsTrigger value="docs">Docs</TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {refreshPolicyRows.map((row) => (
                <Card key={row.key}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium">{row.label}</div>
                      <Badge variant={policy[row.key] ? "secondary" : "outline"}>
                        {policy[row.key] ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {row.helper}
                    </div>
                    <Badge variant="outline" className="mt-3">
                      Current: {formatRefreshInterval(policy[row.key])}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="space-y-4">
              {refreshPolicyRows.map((row) => (
                <div key={row.key} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{row.label}</div>
                      <div className="text-sm text-muted-foreground">
                        Default{" "}
                        {formatRefreshInterval(
                          DEFAULT_ADMIN_REFRESH_POLICY[row.key],
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">
                        {policy[row.key] ? "Active" : "Inactive"}
                      </span>
                      <Switch
                        checked={policy[row.key] > 0}
                        onCheckedChange={(checked) => setPolicyActive(row.key, checked)}
                        aria-label={`${row.label} active`}
                      />
                      <Badge variant="secondary">
                        {formatRefreshInterval(policy[row.key])}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {refreshOptions.map((option) => (
                      <Button
                        key={`${row.key}-${option}`}
                        size="sm"
                        variant={
                          policy[row.key] === option ? "default" : "outline"
                        }
                        onClick={() => updatePolicy({ [row.key]: option })}
                      >
                        {formatRefreshInterval(option)}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <Button variant="outline" className="w-full" onClick={resetPolicy}>
              Reset to professional defaults
            </Button>
          </TabsContent>

          <TabsContent value="auto-hits" className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border p-3">
                <div className="text-xs font-medium text-muted-foreground uppercase">
                  Always-on HTTP
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  {formatRequestsPerMinute(alwaysOnPerMinute)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Runs while admin is signed in.
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs font-medium text-muted-foreground uppercase">
                  Max visible HTTP
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  {formatRequestsPerMinute(maximumVisiblePerMinute)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  If every listed panel/session is active.
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs font-medium text-muted-foreground uppercase">
                  Polling rows
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  {pollingRows}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Socket and manual rows are listed separately, but not counted
                  as fixed polling.
                </div>
              </div>
            </div>

            {groupedAutoHits.map((group) => (
              <Card key={group.app}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-xl border",
                          autoHitAppMeta[group.app].className
                        )}
                      >
                        {React.createElement(autoHitAppMeta[group.app].icon, {
                          className: "size-5",
                        })}
                      </div>
                      <div>
                        <CardTitle>{group.app}</CardTitle>
                        <CardDescription>
                          {autoHitAppMeta[group.app].description}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant="outline">{group.items.length} tracked</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {group.items.map((item) => {
                    const interval = getAutoHitInterval(item, policy)
                    const active = isAutoHitActive(item, policy)
                    return (
                      <div
                        key={`${item.app}-${item.label}-${item.endpoint}`}
                        className="rounded-lg border p-3"
                      >
                        <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_0.8fr]">
                          <div className="min-w-0">
                            <div className="font-medium">{item.label}</div>
                            <div className="mt-1 break-all text-xs text-muted-foreground">
                              {item.endpoint}
                            </div>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {item.condition}
                          </div>
                          <div className="flex flex-wrap items-start justify-start gap-2 lg:justify-end">
                            <Badge variant={active ? "secondary" : "outline"}>
                              {active ? "Active" : "Inactive"}
                            </Badge>
                            <Badge variant="outline">
                              {formatRefreshInterval(interval)}
                            </Badge>
                            <Badge variant={autoHitModeTone(item.mode)}>
                              {autoHitModeLabel(item.mode)}
                            </Badge>
                            <Badge variant="outline">
                              {formatRequestsPerMinute(
                                requestsPerMinute(interval),
                              )}
                            </Badge>
                            {item.policyKey ? (
                              <Switch
                                checked={active}
                                onCheckedChange={(checked) =>
                                  setPolicyActive(item.policyKey!, checked)
                                }
                                aria-label={`${item.label} active`}
                              />
                            ) : null}
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          {item.note}
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="docs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>রিফ্রেশ পলিসি ডকস</CardTitle>
                <CardDescription>
                  এই ট্যাবে admin-web, owner, rider এবং customer app এর auto API hit,
                  socket এবং manual refresh behavior বাংলায় ব্যাখ্যা করা হয়েছে।
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border p-3">
                    <div className="font-medium">Auto API hit মানে কী?</div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      কোনো page open থাকলে বা admin signed-in থাকলে fixed interval এ backend থেকে নতুন data আনা হয়। Off করলে ওই interval stop হয়, কিন্তু manual refresh এবং socket event ঠিক থাকবে।
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="font-medium">Socket মানে কী?</div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Order, notification, support বা rider update হলে backend realtime event পাঠায়। এটা fixed polling না, তাই load কম। Event আসলে related query refresh হয়।
                    </p>
                  </div>
                </div>

                <div className="overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Part</TableHead>
                        <TableHead>কি hit হয়</TableHead>
                        <TableHead>কখন হয়</TableHead>
                        <TableHead>দরকার আছে?</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Top nav notifications</TableCell>
                        <TableCell>GET /admin/notifications</TableCell>
                        <TableCell>Admin signed-in থাকলে policy interval অনুযায়ী</TableCell>
                        <TableCell>হ্যাঁ, unread count fresh রাখার জন্য</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Dashboard</TableCell>
                        <TableCell>/admin/reports, /admin/orders, /admin/restaurants, /admin/riders</TableCell>
                        <TableCell>Dashboard auto-refresh toggle ON থাকলে</TableCell>
                        <TableCell>Optional. Busy operations এ useful, normal use এ off রাখা যায়</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Operations Health</TableCell>
                        <TableCell>GET /admin/operations/health</TableCell>
                        <TableCell>Operations Health page open থাকলে</TableCell>
                        <TableCell>হ্যাঁ, monitoring page এর জন্য</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Live map</TableCell>
                        <TableCell>GET /admin/live-map</TableCell>
                        <TableCell>Live Map page বা Riders live tab open থাকলে</TableCell>
                        <TableCell>হ্যাঁ, তবে production এ admin সবসময় open রাখলে 30s safer</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Sessions</TableCell>
                        <TableCell>GET /admin/sessions</TableCell>
                        <TableCell>Sessions page open থাকলে</TableCell>
                        <TableCell>Security এর জন্য useful. Off করলে manual refresh use করা যাবে</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Rider details drawer</TableCell>
                        <TableCell>GET /admin/riders/:riderId</TableCell>
                        <TableCell>Rider drawer open থাকলে</TableCell>
                        <TableCell>Useful, কিন্তু 30s enough. Live map এর সাথে sync থাকে</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Owner web/app</TableCell>
                        <TableCell>GET /owner/notifications + socket invalidation</TableCell>
                        <TableCell>Owner signed-in এবং notification query enabled থাকলে</TableCell>
                        <TableCell>দরকার আছে, কারণ new order/support notification দ্রুত দেখা লাগে</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Delivery app</TableCell>
                        <TableCell>PATCH /rider/profile/location + socket</TableCell>
                        <TableCell>Rider online/active trip থাকলে, Settings live tracking policy অনুযায়ী</TableCell>
                        <TableCell>দরকার আছে, কিন্তু interval/distance setting দিয়ে load control হয়</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Customer app</TableCell>
                        <TableCell>Screen query, pull refresh, socket invalidation</TableCell>
                        <TableCell>Screen open, user refresh, অথবা realtime event হলে</TableCell>
                        <TableCell>Fixed polling কম, তাই current approach healthy</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                <div className="space-y-2">
                  <div className="font-medium">Quick refresh behavior</div>
                  <div className="overflow-hidden rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Feature</TableHead>
                          <TableHead>Always?</TableHead>
                          <TableHead>কখন refresh হয়</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell className="font-medium">Top nav notifications</TableCell>
                          <TableCell>প্রায় always</TableCell>
                          <TableCell>admin logged in থাকলে</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Dashboard</TableCell>
                          <TableCell>না</TableCell>
                          <TableCell>Dashboard open + Dashboard toggle ON</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Operations Health</TableCell>
                          <TableCell>না</TableCell>
                          <TableCell>Operations Health page open থাকলে</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Live Map</TableCell>
                          <TableCell>না</TableCell>
                          <TableCell>Live Map/Riders live tab open থাকলে</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Sessions</TableCell>
                          <TableCell>না</TableCell>
                          <TableCell>Sessions page open থাকলে</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Rider details</TableCell>
                          <TableCell>না</TableCell>
                          <TableCell>Rider drawer open থাকলে</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Owner web/app</TableCell>
                          <TableCell>admin-web না</TableCell>
                          <TableCell>owner app/web open থাকলে</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Delivery app location</TableCell>
                          <TableCell>admin-web না</TableCell>
                          <TableCell>rider online/active trip থাকলে</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Customer app</TableCell>
                          <TableCell>admin-web না</TableCell>
                          <TableCell>screen open/socket/manual refresh হলে</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="font-medium">Rate limiter docs</div>
                  <p className="text-sm text-muted-foreground">
                    Settings &gt; Security থেকে business-specific limiter গুলো change করা যায়। Broad/global limiter .env থেকে থাকে, আর Nginx production এ real IP detect করার জন্য TRUST_PROXY_HOPS=1 রাখা দরকার।
                  </p>
                  <div className="overflow-hidden rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Case</TableHead>
                          <TableHead>Default policy</TableHead>
                          <TableHead>Key</TableHead>
                          <TableHead>কেন দরকার</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell className="font-medium">Global API</TableCell>
                          <TableCell>RATE_LIMIT_MAX / RATE_LIMIT_WINDOW_MS</TableCell>
                          <TableCell>IP</TableCell>
                          <TableCell>Unknown spam, crawler, বা accidental loops থেকে পুরো API protect করে।</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Sign-in / signup</TableCell>
                          <TableCell>10 sign-in / 15m, 5 signup / 30m</TableCell>
                          <TableCell>IP + phone/email</TableCell>
                          <TableCell>Password guessing এবং repeated account creation control করে।</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">OTP send / verify</TableCell>
                          <TableCell>5 phone OTP / 10m, 12 IP OTP / 10m, 8 verify / 10m</TableCell>
                          <TableCell>Phone/session/IP</TableCell>
                          <TableCell>SMS cost, OTP abuse, wrong code brute force কমায়। DB guard daily/hourly count আলাদা করে রাখে।</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Password recovery / refresh</TableCell>
                          <TableCell>5 recovery / 15m, 30 refresh / 15m</TableCell>
                          <TableCell>IP + identity</TableCell>
                          <TableCell>Forgot-password abuse এবং broken token refresh loop থামায়।</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Cart / order / payment</TableCell>
                          <TableCell>300 quote, 12 order, 8 payment / 15m</TableCell>
                          <TableCell>Customer or IP</TableCell>
                          <TableCell>Checkout calculation, order spam, payment session spam control করে।</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Support / analytics</TableCell>
                          <TableCell>20 support, 240 analytics / 15m</TableCell>
                          <TableCell>Customer or anonymous/session</TableCell>
                          <TableCell>Support spam কমায়, analytics endpoint যেন অন্য request block না করে তা আলাদা রাখে।</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Rider location</TableCell>
                          <TableCell>900 updates / 15m</TableCell>
                          <TableCell>Rider account</TableCell>
                          <TableCell>Live tracking healthy রাখে, কিন্তু broken background loop হলে throttle করে।</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Admin / owner writes</TableCell>
                          <TableCell>240 write requests / 15m</TableCell>
                          <TableCell>Logged-in user</TableCell>
                          <TableCell>Settings, finance, menu, order action এর repeated write loops থেকে system safe রাখে। GET/read request count হয় না।</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                  Recommended: notifications 60s, operations health 30s, sessions 30s, rider details 30s, live map 15-30s। High load এর সময় live map 30s এবং dashboard auto-refresh off রাখা best।
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}

export function OperationsHealthPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [timelineSeverity, setTimelineSeverity] =
    React.useState<TimelineSeverityFilter>("all")
  const [timelineCategory, setTimelineCategory] =
    React.useState<TimelineCategoryFilter>("all")
  const [timelineTimeframe, setTimelineTimeframe] =
    React.useState<TimelineTimeframeFilter>("24h")
  const { policy: refreshPolicy } = useAdminRefreshPolicy()
  const healthQuery = useQuery({
    queryKey: ["admin-operational-health"],
    queryFn: getAdminOperationalHealth,
    refetchInterval: refreshPolicy.operationsHealthMs || false,
  })
  const resolveAlertMutation = useMutation({
    mutationFn: resolveAdminOperationalAlert,
    onSuccess: () => {
      toast.success("Operational alert resolved")
      void queryClient.invalidateQueries({
        queryKey: ["admin-operational-health"],
      })
      void queryClient.invalidateQueries({ queryKey: ["admin-notifications"] })
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not resolve alert"
      ),
  })
  const snoozeAlertMutation = useMutation({
    mutationFn: snoozeAdminOperationalAlert,
    onSuccess: () => {
      toast.success("Operational alert snoozed")
      void queryClient.invalidateQueries({
        queryKey: ["admin-operational-health"],
      })
      void queryClient.invalidateQueries({ queryKey: ["admin-notifications"] })
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not snooze alert"
      ),
  })

  const data = healthQuery.data
  const statusLabel = data ? titleCase(data.systemStatus) : "Loading"
  const filteredTimeline = React.useMemo(() => {
    if (!data) return []
    const now = data.generatedAt
      ? new Date(data.generatedAt).getTime()
      : new Date(data.timeline[0]?.createdAt ?? 0).getTime()
    const cutoffMs =
      timelineTimeframe === "24h"
        ? 24 * 60 * 60 * 1000
        : timelineTimeframe === "7d"
          ? 7 * 24 * 60 * 60 * 1000
          : 30 * 24 * 60 * 60 * 1000

    return data.timeline.filter((item) => {
      const createdAt = item.createdAt ? new Date(item.createdAt).getTime() : 0
      const matchesTime = createdAt > 0 && now - createdAt <= cutoffMs
      const matchesSeverity =
        timelineSeverity === "all" || item.severity === timelineSeverity
      const matchesCategory =
        timelineCategory === "all" || item.category === timelineCategory
      return matchesTime && matchesSeverity && matchesCategory
    })
  }, [data, timelineCategory, timelineSeverity, timelineTimeframe])
  const hasTimelineFilters =
    timelineSeverity !== "all" ||
    timelineCategory !== "all" ||
    timelineTimeframe !== "24h"

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <HeartPulse className="size-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Operations Health
              </h1>
              <p className="text-sm text-muted-foreground">
                Live operational signals, scheduler state, alerts, and system
                events.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <RefreshPolicySheet />
          <Button
            variant="outline"
            size="sm"
            onClick={() => void healthQuery.refetch()}
            disabled={healthQuery.isFetching}
          >
            {healthQuery.isFetching ? (
              <Spinner className="mr-2" />
            ) : (
              <RefreshCcw className="mr-2 size-4" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {healthQuery.isLoading ? <HealthSkeleton /> : null}

      {healthQuery.isError ? (
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="flex items-center gap-3 p-4 text-rose-700">
            <ShieldAlert className="size-5" />
            <div>
              <div className="font-medium">
                Could not load operations health
              </div>
              <div className="text-sm">
                Refresh the page or check backend connectivity.
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <MetricCard
              title="System status"
              value={statusLabel}
              helper={`Score ${data.attentionScore}`}
              icon={ServerCog}
              className={statusTone(data.systemStatus)}
            />
            <MetricCard
              title="Open alerts"
              value={
                data.summary.openCriticalAlerts +
                data.summary.openWarningAlerts +
                data.summary.openInfoAlerts
              }
              helper={`${data.summary.openCriticalAlerts} critical, ${data.summary.openWarningAlerts} warning`}
              icon={ShieldAlert}
            />
            <MetricCard
              title="Events today"
              value={data.summary.eventsLast24h}
              helper={`${data.summary.criticalEventsLast24h} critical history, ${data.summary.warningEventsLast24h} warning history`}
              icon={RadioTower}
            />
            <MetricCard
              title="Request p95"
              value={`${data.requestMonitor.summary.p95DurationMs} ms`}
              helper={`${data.requestMonitor.summary.requestsPerMinute}/min in the current window`}
              icon={Gauge}
            />
          </div>

          <InfrastructurePanel infrastructure={data.infrastructure} />

          <RealtimeOpsPanel realtime={data.realtime} />

          <div className="grid gap-3 md:grid-cols-4">
            <MetricCard
              title="Backend ready"
              value={data.runtime.ready ? "Ready" : "Not ready"}
              helper={`PID ${data.runtime.pid} · ${data.runtime.nodeEnv}`}
              icon={ServerCog}
              className={
                data.runtime.ready
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              }
            />
            <MetricCard
              title="Database"
              value={titleCase(data.runtime.database)}
              helper="MongoDB connection state"
              icon={Database}
              className={
                data.runtime.database === "connected"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }
            />
            <MetricCard
              title="Uptime"
              value={formatUptime(data.runtime.uptimeSeconds)}
              helper="Current backend process"
              icon={Clock3}
            />
            <MetricCard
              title="Memory"
              value={`${data.runtime.memory.heapUsedMb} MB`}
              helper={`Heap ${data.runtime.memory.heapTotalMb} MB · RSS ${data.runtime.memory.rssMb} MB`}
              icon={Cpu}
            />
          </div>

          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="flex h-auto w-full flex-wrap justify-start">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="requests">Requests</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="alerts">Alerts</TabsTrigger>
            </TabsList>

            <TabsContent
              value="overview"
              className="grid gap-4 lg:grid-cols-[1fr_0.85fr]"
            >
              <Card>
                <CardHeader>
                  <CardTitle>Scheduler state</CardTitle>
                  <CardDescription>
                    Background jobs running inside the current backend process.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.schedulerJobs.length ? (
                    data.schedulerJobs.map((job) => (
                      <JobRow key={job.key} job={job} />
                    ))
                  ) : (
                    <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                      Scheduler state will appear after the first background
                      cycle.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Attention queue</CardTitle>
                  <CardDescription>
                    Active operational items that still need admin awareness.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.activeAlerts.slice(0, 6).map((alert) => {
                    const Icon = severityIcon(alert.severity)
                    return (
                      <div
                        key={alert.id}
                        className="flex gap-3 rounded-lg border p-3"
                      >
                        <div
                          className={cn(
                            "flex size-8 items-center justify-center rounded-lg border",
                            statusTone(alert.severity)
                          )}
                        >
                          <Icon className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {alert.title}
                          </div>
                          <div className="line-clamp-2 text-sm text-muted-foreground">
                            {alert.description || titleCase(alert.alertType)}
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            {formatDateTime(alert.lastSeenAt)}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {alert.path ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => navigate(alert.path)}
                              >
                                Open
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={
                                resolveAlertMutation.isPending ||
                                snoozeAlertMutation.isPending
                              }
                              onClick={() =>
                                snoozeAlertMutation.mutate({
                                  alertId: alert.id,
                                  minutes: 30,
                                })
                              }
                            >
                              Snooze 30m
                            </Button>
                            <Button
                              size="sm"
                              disabled={
                                resolveAlertMutation.isPending ||
                                snoozeAlertMutation.isPending
                              }
                              onClick={() =>
                                resolveAlertMutation.mutate(alert.id)
                              }
                            >
                              Resolve
                            </Button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {!data.activeAlerts.length ? (
                    <div className="rounded-lg border border-dashed bg-emerald-50/40 p-6 text-center">
                      <div className="mx-auto flex size-10 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700">
                        <CheckCircle2 className="size-5" />
                      </div>
                      <div className="mt-3 font-medium text-emerald-800">
                        Everything looks clear
                      </div>
                      <div className="mx-auto mt-1 max-w-md text-sm text-emerald-700/80">
                        Dispatch delays, failed jobs, late rider pickup, failed
                        scheduled notifications, or auto-cancel problems will
                        appear here when they need admin attention.
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="requests">
              <RequestMonitorPanel monitor={data.requestMonitor} />
            </TabsContent>

            <TabsContent value="timeline">
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle>Business event history</CardTitle>
                      <CardDescription>
                        Historical events are kept for debugging. Current
                        problems are shown in Active alerts.
                      </CardDescription>
                    </div>
                    {hasTimelineFilters ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setTimelineSeverity("all")
                          setTimelineCategory("all")
                          setTimelineTimeframe("24h")
                        }}
                      >
                        Clear filters
                      </Button>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                    <div className="flex flex-wrap gap-2">
                      {timeframeFilters.map((filter) => (
                        <Button
                          key={filter.value}
                          size="sm"
                          variant={
                            timelineTimeframe === filter.value
                              ? "default"
                              : "outline"
                          }
                          onClick={() => setTimelineTimeframe(filter.value)}
                        >
                          {filter.label}
                        </Button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {severityFilters.map((filter) => (
                        <Button
                          key={filter.value}
                          size="sm"
                          variant={
                            timelineSeverity === filter.value
                              ? "default"
                              : "outline"
                          }
                          onClick={() => setTimelineSeverity(filter.value)}
                        >
                          {filter.label}
                        </Button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {categoryFilters.map((filter) => (
                        <Button
                          key={filter.value}
                          size="sm"
                          variant={
                            timelineCategory === filter.value
                              ? "default"
                              : "outline"
                          }
                          onClick={() => setTimelineCategory(filter.value)}
                        >
                          {filter.label}
                        </Button>
                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Showing {filteredTimeline.length} of{" "}
                      {data.timeline.length} retained events.
                    </div>
                  </div>

                  <div className="space-y-3">
                    {filteredTimeline.map((item) => (
                      <TimelineItem key={item.id} item={item} />
                    ))}
                    {!filteredTimeline.length ? (
                      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                        No events match the selected filters.
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="alerts">
              <Card>
                <CardHeader>
                  <CardTitle>Operational alerts</CardTitle>
                  <CardDescription>
                    Unread alerts generated by orders, dispatch, prep timing,
                    and automation.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.activeAlerts.map((alert) => {
                    const Icon = severityIcon(alert.severity)
                    return (
                      <div
                        key={alert.id}
                        className="flex items-start justify-between gap-3 rounded-lg border p-3"
                      >
                        <div className="flex min-w-0 gap-3">
                          <div
                            className={cn(
                              "flex size-9 items-center justify-center rounded-lg border",
                              statusTone(alert.severity)
                            )}
                          >
                            <Icon className="size-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium">{alert.title}</div>
                            <div className="mt-1 text-sm text-muted-foreground">
                              {alert.description}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                              <span>{titleCase(alert.source)}</span>
                              <span>{formatDateTime(alert.lastSeenAt)}</span>
                              {alert.entityType ? (
                                <span>{titleCase(alert.entityType)}</span>
                              ) : null}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {alert.path ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => navigate(alert.path)}
                                >
                                  Open related
                                </Button>
                              ) : null}
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={
                                  resolveAlertMutation.isPending ||
                                  snoozeAlertMutation.isPending
                                }
                                onClick={() =>
                                  snoozeAlertMutation.mutate({
                                    alertId: alert.id,
                                    minutes: 30,
                                  })
                                }
                              >
                                Snooze 30m
                              </Button>
                              <Button
                                size="sm"
                                disabled={
                                  resolveAlertMutation.isPending ||
                                  snoozeAlertMutation.isPending
                                }
                                onClick={() =>
                                  resolveAlertMutation.mutate(alert.id)
                                }
                              >
                                Resolve
                              </Button>
                            </div>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={statusTone(alert.severity)}
                        >
                          {titleCase(alert.severity)}
                        </Badge>
                      </div>
                    )
                  })}
                  {!data.activeAlerts.length ? (
                    <div className="rounded-lg border border-dashed bg-emerald-50/40 p-8 text-center">
                      <div className="mx-auto flex size-11 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700">
                        <CheckCircle2 className="size-5" />
                      </div>
                      <div className="mt-3 font-medium text-emerald-800">
                        No active alerts right now
                      </div>
                      <div className="mx-auto mt-1 max-w-xl text-sm text-emerald-700/80">
                        This is the place for operational issues that need a
                        decision: late preparation, rider assignment delays,
                        pickup delays, failed scheduler jobs, and failed
                        notifications. Clear means the system has nothing urgent
                        for admin right now.
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </TabsContent>

          </Tabs>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock3 className="size-3.5" />
            Last refreshed {formatDateTime(data.generatedAt)}
            <span>
              Auto refresh{" "}
              {formatRefreshInterval(refreshPolicy.operationsHealthMs)}
            </span>
            {healthQuery.isFetching ? <Spinner className="size-3.5" /> : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
