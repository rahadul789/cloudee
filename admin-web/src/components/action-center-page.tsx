import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  CreditCard,
  ExternalLink,
  Loader2,
  ReceiptText,
  RefreshCcw,
  Settings,
  ShieldCheck,
} from "lucide-react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"

import {
  getAdminOperationalHealth,
  listAdminActivityLogs,
  listAdminBkashPaymentAttempts,
  reconcileAdminBkashPaymentAttempt,
  resolveAdminOperationalAlert,
  snoozeAdminOperationalAlert,
} from "@/lib/admin-api"
import { printTableReport } from "@/lib/export-utils"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

function formatNumber(value?: number | null) {
  return Math.round(value ?? 0).toLocaleString()
}

function formatCurrency(value?: number | null) {
  return `Tk ${Math.round(value ?? 0).toLocaleString()}`
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

function titleCase(value: string) {
  return value
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function severityClass(value: string) {
  if (value === "critical") return "border-rose-200 bg-rose-50 text-rose-700"
  if (value === "warning") return "border-amber-200 bg-amber-50 text-amber-700"
  return "border-sky-200 bg-sky-50 text-sky-700"
}

function ActionMetric({
  label,
  value,
  helper,
  tone,
}: {
  label: string
  value: React.ReactNode
  helper: string
  tone: string
}) {
  return (
    <Card className="border-muted/60">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <div className="mt-2 text-2xl font-semibold">{value}</div>
            <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
          </div>
          <div className={`rounded-lg border p-2 ${tone}`}>
            <ShieldCheck className="size-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const exceptionPlaybook = [
  {
    name: "Owner rejected/cancelled",
    severity: "Warning",
    control: "Order acceptance / auto-cancel alerts",
    action: "Open order and call owner/customer when needed.",
  },
  {
    name: "bKash refund required",
    severity: "Critical",
    control: "Payment exception alerts",
    action: "Review order payment, refund, then resolve the alert.",
  },
  {
    name: "bKash paid without order",
    severity: "Critical",
    control: "Payment exception alerts",
    action: "Reconcile gateway attempt or create/refund manually.",
  },
  {
    name: "Restaurant offline with live orders",
    severity: "Critical",
    control: "Order acceptance / auto-cancel alerts",
    action: "Contact restaurant and monitor affected orders.",
  },
  {
    name: "Rider/dispatch delays",
    severity: "Warning/Critical",
    control: "Rider and delivery alerts",
    action: "Assign rider, follow stale location, or call rider.",
  },
]

export function ActionCenterPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const healthQuery = useQuery({
    queryKey: ["admin-action-center", "health"],
    queryFn: getAdminOperationalHealth,
  })
  const bkashExceptionQuery = useQuery({
    queryKey: ["admin-action-center", "bkash-exceptions"],
    queryFn: () =>
      listAdminBkashPaymentAttempts({
        paymentStatus: "paid",
        orderState: "missing",
        page: 1,
        pageSize: 10,
      }),
  })
  const activityQuery = useQuery({
    queryKey: ["admin-action-center", "activity-logs"],
    queryFn: () => listAdminActivityLogs({ page: 1, pageSize: 12 }),
  })

  const resolveMutation = useMutation({
    mutationFn: resolveAdminOperationalAlert,
    onSuccess: () => {
      toast.success("Alert resolved.")
      void queryClient.invalidateQueries({ queryKey: ["admin-action-center"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-operational-health"] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Resolve failed.")
    },
  })
  const snoozeMutation = useMutation({
    mutationFn: (alertId: string) =>
      snoozeAdminOperationalAlert({ alertId, minutes: 30 }),
    onSuccess: () => {
      toast.success("Alert snoozed for 30 minutes.")
      void queryClient.invalidateQueries({ queryKey: ["admin-action-center"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-operational-health"] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Snooze failed.")
    },
  })
  const reconcileMutation = useMutation({
    mutationFn: (attemptId: string) =>
      reconcileAdminBkashPaymentAttempt({
        attemptId,
        note: "Manual reconciliation from Action Center",
      }),
    onSuccess: () => {
      toast.success("bKash attempt reconciled.")
      void queryClient.invalidateQueries({ queryKey: ["admin-action-center"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-bkash-payment-attempts"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-payments"] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Reconcile failed.")
    },
  })

  const health = healthQuery.data
  const alerts = health?.activeAlerts ?? []
  const paymentExceptions = bkashExceptionQuery.data?.items ?? []
  const activityLogs = activityQuery.data?.items ?? []
  const criticalAlerts = alerts.filter((alert) => alert.severity === "critical")
  const warningAlerts = alerts.filter((alert) => alert.severity === "warning")

  function exportActionCenterPdf() {
    const ok = printTableReport({
      title: "Foodbela action center",
      subtitle: "Operational exceptions, bKash exceptions, and recent admin activity.",
      metrics: [
        { label: "Active alerts", value: alerts.length },
        { label: "Critical alerts", value: criticalAlerts.length },
        {
          label: "Paid without order",
          value: formatCurrency(
            bkashExceptionQuery.data?.summary.paidWithoutOrderAmount ?? 0,
          ),
        },
        { label: "Recent actions", value: activityLogs.length },
      ],
      headers: ["Type", "Title", "Status", "When"],
      rows: [
        ...alerts.map((alert) => [
          "Alert",
          alert.title,
          titleCase(alert.severity),
          formatDateTime(alert.lastSeenAt),
        ]),
        ...paymentExceptions.map((attempt) => [
          "bKash",
          attempt.paymentID || attempt.sessionId || attempt.customerName,
          `${attempt.paymentStatus} / ${attempt.orderFinalizationStatus}`,
          formatDateTime(attempt.createdAt),
        ]),
        ...activityLogs.map((log) => [
          "Activity",
          log.title || log.action,
          log.entityType,
          formatDateTime(log.createdAt),
        ]),
      ],
    })
    if (!ok) toast.error("Allow popups to export the PDF report.")
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Action Center
            </h1>
            <Badge variant="outline">Exceptions first</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            One place for operational alerts, payment exceptions, audit trail,
            and retention visibility before production review.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void healthQuery.refetch()
              void bkashExceptionQuery.refetch()
              void activityQuery.refetch()
            }}
          >
            <RefreshCcw className="size-4" />
            Refresh
          </Button>
          <Button type="button" variant="outline" onClick={exportActionCenterPdf}>
            <ReceiptText className="size-4" />
            Export PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ActionMetric
          label="Active alerts"
          value={formatNumber(alerts.length)}
          helper={`${formatNumber(criticalAlerts.length)} critical, ${formatNumber(
            warningAlerts.length,
          )} warning`}
          tone="border-sky-100 bg-sky-50 text-sky-700"
        />
        <ActionMetric
          label="System status"
          value={titleCase(health?.systemStatus ?? "loading")}
          helper={`Attention score ${formatNumber(health?.attentionScore)}`}
          tone="border-emerald-100 bg-emerald-50 text-emerald-700"
        />
        <ActionMetric
          label="Paid without order"
          value={formatCurrency(
            bkashExceptionQuery.data?.summary.paidWithoutOrderAmount ?? 0,
          )}
          helper={`${formatNumber(
            bkashExceptionQuery.data?.summary.paidWithoutOrderCount,
          )} bKash attempts need review`}
          tone="border-amber-100 bg-amber-50 text-amber-700"
        />
        <ActionMetric
          label="Recent admin actions"
          value={formatNumber(activityQuery.data?.total)}
          helper="Latest audit log records"
          tone="border-violet-100 bg-violet-50 text-violet-700"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Exception routing</CardTitle>
            <CardDescription>
              High-signal cases that create admin alerts. Toggle categories from Settings when you need less noise.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" onClick={() => navigate("/settings")}>
            <Settings className="size-4" />
            Notification settings
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 lg:grid-cols-5">
            {exceptionPlaybook.map((item) => (
              <div key={item.name} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      item.severity.includes("Critical")
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }
                  >
                    {item.severity}
                  </Badge>
                </div>
                <div className="mt-2 font-medium">{item.name}</div>
                <p className="mt-1 text-xs text-muted-foreground">{item.control}</p>
                <p className="mt-2 text-sm text-muted-foreground">{item.action}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4" />
              Operational queue
            </CardTitle>
            <CardDescription>
              Alerts generated by order flow, dispatch, scheduler, security, and notifications.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {healthQuery.isLoading ? (
              <div className="flex h-24 items-center justify-center">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : null}
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex flex-col gap-3 rounded-lg border p-3 lg:flex-row lg:items-start lg:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={severityClass(alert.severity)}>
                      {titleCase(alert.severity)}
                    </Badge>
                    <span className="font-medium">{alert.title}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {alert.description || titleCase(alert.alertType)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{titleCase(alert.source)}</span>
                    <span>{formatDateTime(alert.lastSeenAt)}</span>
                    {alert.entityType ? <span>{titleCase(alert.entityType)}</span> : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {alert.path ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(alert.path)}
                    >
                      <ExternalLink className="size-4" />
                      Open
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={snoozeMutation.isPending || resolveMutation.isPending}
                    onClick={() => snoozeMutation.mutate(alert.id)}
                  >
                    Snooze
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={snoozeMutation.isPending || resolveMutation.isPending}
                    onClick={() => resolveMutation.mutate(alert.id)}
                  >
                    Resolve
                  </Button>
                </div>
              </div>
            ))}
            {!healthQuery.isLoading && alerts.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-emerald-50/40 p-8 text-center">
                <CheckCircle2 className="mx-auto size-8 text-emerald-700" />
                <div className="mt-3 font-medium text-emerald-800">
                  No active operational alerts
                </div>
                <p className="mx-auto mt-1 max-w-lg text-sm text-emerald-700/80">
                  Late orders, dispatch issues, failed scheduled jobs, and payment
                  exceptions will appear here when they need admin attention.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="size-4" />
              bKash exceptions
            </CardTitle>
            <CardDescription>
              Paid attempts that do not have a finalized order yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {paymentExceptions.map((attempt) => (
              <div key={attempt.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {attempt.paymentID || attempt.sessionId || "bKash attempt"}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {attempt.customerName || "Customer"} -{" "}
                      {attempt.restaurantName || "Restaurant"}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="outline">Paid</Badge>
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                        No order
                      </Badge>
                      <Badge variant="secondary">{formatCurrency(attempt.amount)}</Badge>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      reconcileMutation.isPending &&
                      reconcileMutation.variables === attempt.id
                    }
                    onClick={() => reconcileMutation.mutate(attempt.id)}
                  >
                    {reconcileMutation.isPending &&
                    reconcileMutation.variables === attempt.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RefreshCcw className="size-4" />
                    )}
                    Reconcile
                  </Button>
                </div>
              </div>
            ))}
            {!bkashExceptionQuery.isLoading && paymentExceptions.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No paid-without-order bKash attempt is open right now.
              </div>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => navigate("/payments")}
            >
              Open full payments log
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Recent admin activity</CardTitle>
            <CardDescription>
              Audit trail for finance, settings, order, payout, rider, and payment actions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activityLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <div className="font-medium">{log.title || titleCase(log.action)}</div>
                        <div className="text-xs text-muted-foreground">
                          {log.description || log.action}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{titleCase(log.entityType)}</Badge>
                        <div className="mt-1 max-w-[180px] truncate text-xs text-muted-foreground">
                          {log.entityId || "N/A"}
                        </div>
                      </TableCell>
                      <TableCell>{log.adminName || "System"}</TableCell>
                      <TableCell>{formatDateTime(log.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                  {!activityQuery.isLoading && activityLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                        No admin activity has been recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data retention and cleanup</CardTitle>
            <CardDescription>
              What is automatically cleaned today and what is retained for audit.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2 font-medium">
                <Clock3 className="size-4" />
                Customer analytics
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Event rows auto-expire after 180 days through the MongoDB TTL index.
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2 font-medium">
                <Clock3 className="size-4" />
                Admin activity logs
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Activity audit logs auto-expire after 180 days. Important finance
                records stay in ledger/payment collections.
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2 font-medium">
                <Clock3 className="size-4" />
                Resolved alerts
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Resolved operational alerts expire after 90 days. Active alerts
                stay until resolved or snoozed.
              </p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              bKash attempts and finance transactions are retained as payment
              audit records. Do not auto-delete them before accounting export.
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="text-xs text-muted-foreground">
        Last generated {formatDateTime(health?.generatedAt)}
      </div>
    </div>
  )
}
