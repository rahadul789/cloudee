import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Activity,
  AlertTriangle,
  Clock3,
  KeyRound,
  Loader2,
  MonitorSmartphone,
  RefreshCcw,
  ShieldOff,
  UserCheck,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import {
  LOGOUT_ALL_CUSTOMERS_PHRASE,
  listAdminSessions,
  revokeAdminActorSessions,
  revokeAdminSession,
  revokeAllCustomerSessions,
  type AdminSessionFilterStatus,
  type AdminSessionItem,
  type AdminSessionRole,
  type AdminSessionStatus,
} from "@/lib/admin-api"
import {
  getAdminZoneScope,
  subscribeAdminZoneScope,
} from "@/lib/admin-zone-scope"
import { useAdminRefreshPolicy } from "@/lib/refresh-policy"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
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

type RoleFilter = AdminSessionRole | "all"
type StatusFilter = AdminSessionFilterStatus
type PendingRevokeAction =
  | { type: "session"; session: AdminSessionItem }
  | { type: "actor"; session: AdminSessionItem }

const roleLabels: Record<RoleFilter, string> = {
  all: "All apps",
  admin: "Admin",
  owner: "Owner",
  customer: "Customer",
  rider: "Delivery",
}

const statusLabels: Record<StatusFilter, string> = {
  all: "All sessions",
  active: "Valid",
  recent: "Recently active",
  stale: "Stale valid",
  revoked: "Revoked",
  expired: "Expired",
}

function formatDate(value: string | null) {
  if (!value) return "Never"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Never"
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

function statusBadgeVariant(status: AdminSessionStatus) {
  if (status === "active") return "default" as const
  if (status === "revoked") return "destructive" as const
  return "secondary" as const
}

function summarizeDevice(userAgent: string) {
  const normalized = userAgent.toLowerCase()
  if (!userAgent.trim()) return "Unknown device"
  if (normalized.includes("android")) return "Android app"
  if (normalized.includes("iphone") || normalized.includes("ipad")) return "iOS app"
  if (normalized.includes("chrome")) return "Chrome browser"
  if (normalized.includes("firefox")) return "Firefox browser"
  if (normalized.includes("safari")) return "Safari browser"
  return userAgent.slice(0, 80)
}

function minutesSince(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000))
}

function isRecentlyActive(session: AdminSessionItem, windowMinutes: number) {
  return session.status === "active" && minutesSince(session.lastSeenAt) <= windowMinutes
}

function isStaleSession(session: AdminSessionItem, staleAfterDays: number) {
  return (
    session.status === "active" &&
    minutesSince(session.lastSeenAt) >= staleAfterDays * 24 * 60
  )
}

function SessionRow({
  session,
  onRevokeSession,
  onRevokeActor,
  isMutating,
  recentWindowMinutes,
  staleAfterDays,
}: {
  session: AdminSessionItem
  onRevokeSession: (session: AdminSessionItem) => void
  onRevokeActor: (session: AdminSessionItem) => void
  isMutating: boolean
  recentWindowMinutes: number
  staleAfterDays: number
}) {
  const recentlyActive = isRecentlyActive(session, recentWindowMinutes)
  const stale = isStaleSession(session, staleAfterDays)

  return (
    <TableRow className={stale ? "bg-amber-50/60" : undefined}>
      <TableCell>
        <div className="space-y-1">
          <div className="font-medium">{session.actor.name}</div>
          <div className="text-xs text-muted-foreground">
            {session.actor.contact || session.actor.id}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline">{roleLabels[session.role]}</Badge>
      </TableCell>
      <TableCell>
        <Badge variant={statusBadgeVariant(session.status)}>
          {statusLabels[session.status]}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <MonitorSmartphone className="size-4 text-muted-foreground" />
          <div>
            <div className="text-sm">{summarizeDevice(session.userAgent)}</div>
            <div className="text-xs text-muted-foreground">
              {session.ipAddress || "No IP captured"}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>{formatDate(session.createdAt)}</TableCell>
      <TableCell>
        <div className="space-y-1">
          <div>{formatDate(session.lastSeenAt)}</div>
          {recentlyActive ? (
            <Badge variant="outline" className="border-emerald-200 text-emerald-700">
              Recent
            </Badge>
          ) : stale ? (
            <Badge variant="secondary" className="bg-amber-100 text-amber-800">
              Stale
            </Badge>
          ) : null}
        </div>
      </TableCell>
      <TableCell>{formatDate(session.expiresAt)}</TableCell>
      <TableCell>
        {session.status === "active" ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRevokeSession(session)}
              disabled={isMutating}
            >
              Revoke
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onRevokeActor(session)}
              disabled={isMutating}
            >
              Revoke all
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            {session.revokedAt ? `Revoked ${formatDate(session.revokedAt)}` : "Closed"}
          </span>
        )}
      </TableCell>
    </TableRow>
  )
}

export function SessionsPage() {
  const queryClient = useQueryClient()
  const { policy: refreshPolicy } = useAdminRefreshPolicy()
  const [role, setRole] = React.useState<RoleFilter>("all")
  const [status, setStatus] = React.useState<StatusFilter>("active")
  const [page, setPage] = React.useState(1)
  const [adminZoneScope, setAdminZoneScope] = React.useState(() =>
    getAdminZoneScope()
  )
  const [pendingRevoke, setPendingRevoke] =
    React.useState<PendingRevokeAction | null>(null)
  const [isLogoutAllOpen, setIsLogoutAllOpen] = React.useState(false)
  const [logoutAllConfirm, setLogoutAllConfirm] = React.useState("")
  const pageSize = 50
  const adminScopeKey = `${adminZoneScope.type}:${adminZoneScope.id || "all"}`

  React.useEffect(
    () =>
      subscribeAdminZoneScope(() => {
        setAdminZoneScope(getAdminZoneScope())
        setPage(1)
      }),
    []
  )

  const sessionsQuery = useQuery({
    queryKey: ["admin-sessions", role, status, page, pageSize, adminScopeKey],
    queryFn: () =>
      listAdminSessions({
        role,
        status,
        page,
        pageSize,
      }),
    refetchInterval: refreshPolicy.sessionsMs || false,
  })

  const invalidateSessions = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-sessions"] })

  const revokeSessionMutation = useMutation({
    mutationFn: revokeAdminSession,
    onSuccess: () => {
      toast.success("Session revoked")
      void invalidateSessions()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not revoke session")
    },
  })

  const revokeActorMutation = useMutation({
    mutationFn: revokeAdminActorSessions,
    onSuccess: (data) => {
      toast.success(`${data.revoked} valid session(s) revoked`)
      void invalidateSessions()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not revoke sessions")
    },
  })

  const logoutAllMutation = useMutation({
    mutationFn: revokeAllCustomerSessions,
    onSuccess: (data) => {
      if (!data.confirmed) {
        toast.error("Confirmation did not match")
        return
      }
      toast.success(`Logged out ${data.revoked} customer session(s)`)
      setIsLogoutAllOpen(false)
      setLogoutAllConfirm("")
      void invalidateSessions()
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not log out customers"
      )
    },
  })

  const scopeLabel =
    adminZoneScope.type === "all" ? "all areas" : adminZoneScope.label

  const sessions = sessionsQuery.data?.items ?? []
  const total = sessionsQuery.data?.total ?? 0
  const summary = sessionsQuery.data?.summary
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const isMutating =
    revokeSessionMutation.isPending || revokeActorMutation.isPending

  function updateRole(nextRole: RoleFilter) {
    setRole(nextRole)
    setPage(1)
  }

  function updateStatus(nextStatus: StatusFilter) {
    setStatus(nextStatus)
    setPage(1)
  }

  function revokeSession(session: AdminSessionItem) {
    setPendingRevoke({ type: "session", session })
  }

  function revokeActor(session: AdminSessionItem) {
    setPendingRevoke({ type: "actor", session })
  }

  function confirmRevoke() {
    if (!pendingRevoke) {
      return
    }

    const { session } = pendingRevoke
    if (pendingRevoke.type === "session") {
      revokeSessionMutation.mutate({
        role: session.role,
        sessionId: session.id,
      })
    } else {
      revokeActorMutation.mutate({
        role: session.role,
        actorId: session.actor.id,
      })
    }
    setPendingRevoke(null)
  }

  const pendingRevokeTitle =
    pendingRevoke?.type === "actor"
      ? `Logout ${pendingRevoke.session.actor.name} everywhere?`
      : "Logout this session?"
  const pendingRevokeDescription =
    pendingRevoke?.type === "actor"
      ? `This will revoke every valid ${roleLabels[pendingRevoke.session.role]} session for ${pendingRevoke.session.actor.name}.`
      : pendingRevoke
        ? `This will revoke the selected ${roleLabels[pendingRevoke.session.role]} session on ${summarizeDevice(pendingRevoke.session.userAgent)}.`
        : ""

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">Sessions</h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            See who is signed in across admin, restaurant owner, customer, and
            delivery apps. Revoke a single device or every valid session for an
            account.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => {
              setLogoutAllConfirm("")
              setIsLogoutAllOpen(true)
            }}
          >
            <ShieldOff className="size-4" />
            Log out all customers
          </Button>
          <Button
            variant="outline"
            onClick={() => void sessionsQuery.refetch()}
            disabled={sessionsQuery.isFetching}
          >
            {sessionsQuery.isFetching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCcw className="size-4" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Valid sessions</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Users className="size-5 text-primary" />
              {summary?.valid ?? summary?.active ?? 0}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Not expired and not revoked
            </p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unique accounts</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <UserCheck className="size-5 text-emerald-600" />
              {summary?.uniqueValidAccounts ?? 0}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Accounts with valid sessions
            </p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Recently active</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Activity className="size-5 text-sky-600" />
              {summary?.recentlyActive ?? 0}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Last {summary?.recentWindowMinutes ?? 60} minutes
            </p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Stale valid sessions</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <AlertTriangle className="size-5 text-amber-600" />
              {summary?.stale ?? 0}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              No activity for {summary?.staleAfterDays ?? 30}+ days
            </p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Closed sessions</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <ShieldOff className="size-5 text-destructive" />
              {(summary?.revoked ?? 0) + (summary?.expired ?? 0)}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {summary?.revoked ?? 0} revoked, {summary?.expired ?? 0} expired
            </p>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-sky-200 bg-sky-50/50">
        <CardContent className="flex flex-col gap-3 pt-4 text-sm text-sky-900 md:flex-row md:items-center">
          <Clock3 className="size-5 shrink-0" />
          <p>
            Valid sessions are login tokens that can still refresh access. They
            are not the same as currently online users; use Recently active and
            Last seen for live activity.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Signed-in sessions</CardTitle>
            <CardDescription>
              Valid sessions remain usable until logout, expiry, or admin
              revoke.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={role} onValueChange={(value) => updateRole(value as RoleFilter)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(roleLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={status}
              onValueChange={(value) => updateStatus(value as StatusFilter)}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>App</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Signed in</TableHead>
                  <TableHead>Last seen</TableHead>
                  <TableHead>Session limit</TableHead>
                  <TableHead className="w-[190px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessionsQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center">
                      <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : sessions.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="h-32 text-center text-sm text-muted-foreground"
                    >
                      No sessions match this filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  sessions.map((session) => (
                    <SessionRow
                      key={`${session.role}-${session.id}`}
                      session={session}
                      onRevokeSession={revokeSession}
                      onRevokeActor={revokeActor}
                      isMutating={isMutating}
                      recentWindowMinutes={summary?.recentWindowMinutes ?? 60}
                      staleAfterDays={summary?.staleAfterDays ?? 30}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Page {page} of {pageCount}, {total} session(s)
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setPage((current) => Math.min(pageCount, current + 1))
                }
                disabled={page >= pageCount}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <AlertDialog
        open={Boolean(pendingRevoke)}
        onOpenChange={(open) => {
          if (!open && !isMutating) setPendingRevoke(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <ShieldOff className="size-5" />
            </AlertDialogMedia>
            <AlertDialogTitle>{pendingRevokeTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRevokeDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMutating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isMutating}
              onClick={confirmRevoke}
            >
              {isMutating ? <Loader2 className="size-4 animate-spin" /> : null}
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={isLogoutAllOpen}
        onOpenChange={(open) => {
          if (!open && !logoutAllMutation.isPending) {
            setIsLogoutAllOpen(false)
            setLogoutAllConfirm("")
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <ShieldOff className="size-5" />
            </AlertDialogMedia>
            <AlertDialogTitle>Log out every customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This revokes the active sessions of <strong>every customer in {scopeLabel}</strong>,
              forcing them to sign in again. It does not delete anything or change
              any account. Customers with an active session may stay in for up to
              45 minutes until their access token expires.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Type <strong>{LOGOUT_ALL_CUSTOMERS_PHRASE}</strong> to confirm.
            </p>
            <Input
              value={logoutAllConfirm}
              onChange={(event) => setLogoutAllConfirm(event.target.value)}
              placeholder={LOGOUT_ALL_CUSTOMERS_PHRASE}
              autoFocus
              disabled={logoutAllMutation.isPending}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={logoutAllMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={
                logoutAllMutation.isPending ||
                logoutAllConfirm.trim() !== LOGOUT_ALL_CUSTOMERS_PHRASE
              }
              onClick={(event) => {
                event.preventDefault()
                logoutAllMutation.mutate()
              }}
            >
              {logoutAllMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Log out all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
