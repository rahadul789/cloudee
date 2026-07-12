import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, Download, KeyRound, Phone, RefreshCw, Wallet } from "lucide-react"

import {
  getAdminOtpMonitor,
  markAdminOtpHandled,
  type AdminOtpMonitorItem,
} from "@/lib/admin-api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type MonitorStatus = "all" | "stuck" | "verified" | "call_requested"

const STATUS_TONE: Record<string, string> = {
  logged_in: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  verified: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  call_requested: "bg-red-100 text-red-700 hover:bg-red-100",
  resent: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  requested: "bg-slate-100 text-slate-700 hover:bg-slate-100",
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: string
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone ?? ""}`}>{value}</p>
    </div>
  )
}

function fmt(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—"
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

export function OtpMonitorPage() {
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [phone, setPhone] = useState("")
  const [status, setStatus] = useState<MonitorStatus>("all")
  const [applied, setApplied] = useState<{
    from: string
    to: string
    phone: string
    status: MonitorStatus
  }>({ from: "", to: "", phone: "", status: "all" })
  const [selected, setSelected] = useState<AdminOtpMonitorItem | null>(null)

  const query = useQuery({
    queryKey: ["admin-otp-monitor", applied],
    queryFn: () => getAdminOtpMonitor({ ...applied, pageSize: 100 }),
    refetchInterval: 15000,
  })
  const data = query.data
  const items = data?.items ?? []
  const trend = data?.trend ?? []
  const trendMax = Math.max(1, ...trend.map((t) => t.requested))

  const queryClient = useQueryClient()
  const handledMutation = useMutation({
    mutationFn: (id: string) => markAdminOtpHandled(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-otp-monitor"] })
      setSelected(null)
    },
  })

  function exportCsv() {
    const header = [
      "phone",
      "code",
      "status",
      "resends",
      "channel",
      "ip",
      "requested",
      "verified",
      "callRequested",
    ]
    const rows = items.map((i) => [
      i.phone,
      i.code,
      i.status,
      i.resendCount,
      i.channel,
      i.ipAddress,
      i.requestedAt ?? "",
      i.verifiedAt ?? "",
      i.callRequestedAt ?? "",
    ])
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `otp-attempts-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <KeyRound className="size-6" />
          <div>
            <h1 className="text-2xl font-semibold">OTP Monitor</h1>
            <p className="text-sm text-muted-foreground">
              Login OTP funnel + live codes for support relay (auto-refreshes).
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data?.smsBalance ? (
            <Badge variant="outline" className="gap-1">
              <Wallet className="size-3.5" />
              SMS balance: {data.smsBalance.balance ?? "—"}
            </Badge>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw
              className={`size-4 ${query.isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {trend.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Hourly trend (requested vs verified)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-24 items-end gap-1 overflow-x-auto">
              {trend.map((bucket, index) => (
                <div
                  key={index}
                  className="flex min-w-2.5 flex-1 flex-col items-center justify-end gap-0.5"
                  title={`${bucket.hour ? new Date(bucket.hour).toLocaleString() : ""}\nRequested: ${bucket.requested}\nVerified: ${bucket.verified}`}
                >
                  <div className="flex w-full items-end justify-center gap-0.5">
                    <div
                      className="w-1/2 rounded-t bg-slate-300"
                      style={{
                        height: `${(bucket.requested / trendMax) * 72}px`,
                      }}
                    />
                    <div
                      className="w-1/2 rounded-t bg-emerald-500"
                      style={{
                        height: `${(bucket.verified / trendMax) * 72}px`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block size-2 rounded-sm bg-slate-300" />
                Requested
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block size-2 rounded-sm bg-emerald-500" />
                Verified
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Requested" value={data?.funnel.requested ?? 0} />
        <StatCard
          label="Resent"
          value={data?.funnel.resent ?? 0}
          tone="text-amber-600"
        />
        <StatCard
          label="Call requested"
          value={data?.funnel.callRequested ?? 0}
          tone="text-red-600"
        />
        <StatCard
          label="Verified"
          value={data?.funnel.verified ?? 0}
          tone="text-emerald-600"
        />
        <StatCard
          label="Logged in"
          value={data?.funnel.loggedIn ?? 0}
          tone="text-emerald-600"
        />
        <StatCard
          label="Stuck"
          value={data?.funnel.stuck ?? 0}
          tone="text-red-600"
        />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-4">
          <div>
            <label className="text-xs text-muted-foreground">From</label>
            <Input
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-52"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">To</label>
            <Input
              type="datetime-local"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-52"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Phone</label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01…"
              className="w-40"
            />
          </div>
          <div className="flex gap-1">
            {(["all", "stuck", "verified", "call_requested"] as const).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={status === s ? "default" : "outline"}
                onClick={() => setStatus(s)}
              >
                {s === "call_requested"
                  ? "Call req."
                  : s.charAt(0).toUpperCase() + s.slice(1)}
              </Button>
            ))}
          </div>
          <Button
            size="sm"
            onClick={() =>
              setApplied({
                from: from ? new Date(from).toISOString() : "",
                to: to ? new Date(to).toISOString() : "",
                phone,
                status,
              })
            }
          >
            Apply
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Attempts ({data?.total ?? 0})</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={exportCsv}
            disabled={items.length === 0}
          >
            <Download className="size-4" />
            CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phone</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Resends</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Requested</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      No OTP attempts in this window.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow
                      key={item.id}
                      className="cursor-pointer"
                      onClick={() => setSelected(item)}
                    >
                      <TableCell className="font-mono font-medium">
                        {item.phone}
                      </TableCell>
                      <TableCell>
                        {item.code ? (
                          <Badge
                            variant="outline"
                            className="font-mono text-base"
                          >
                            {item.code}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Badge className={STATUS_TONE[item.status] ?? ""}>
                            {item.status.replace("_", " ")}
                          </Badge>
                          {item.callRequestedAt ? (
                            <Phone className="size-4 text-red-500" />
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{item.resendCount}</TableCell>
                      <TableCell className="capitalize">{item.channel}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {fmt(item.requestedAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-md">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 font-mono">
                  {selected.phone}
                  {selected.code ? (
                    <Badge variant="outline" className="font-mono text-base">
                      {selected.code}
                    </Badge>
                  ) : null}
                </SheetTitle>
                <SheetDescription>OTP attempt details</SheetDescription>
              </SheetHeader>
              <div className="mt-4 px-1">
                <DetailRow
                  label="Status"
                  value={
                    <Badge className={STATUS_TONE[selected.status] ?? ""}>
                      {selected.status.replace("_", " ")}
                    </Badge>
                  }
                />
                <DetailRow label="Purpose" value={selected.purpose || "—"} />
                <DetailRow label="Channel" value={selected.channel} />
                <DetailRow label="Resends" value={selected.resendCount} />
                <DetailRow label="IP address" value={selected.ipAddress || "—"} />
                <DetailRow label="Requested" value={fmt(selected.requestedAt)} />
                <DetailRow label="Last sent" value={fmt(selected.lastSentAt)} />
                <DetailRow
                  label="Call requested"
                  value={fmt(selected.callRequestedAt)}
                />
                <DetailRow label="Verified" value={fmt(selected.verifiedAt)} />
                <DetailRow label="Logged in" value={fmt(selected.loggedInAt)} />

                {selected.handledAt ? (
                  <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-center text-sm text-emerald-700">
                    ✓ Marked handled at {fmt(selected.handledAt)}
                  </div>
                ) : (
                  <Button
                    className="mt-4 w-full"
                    onClick={() => handledMutation.mutate(selected.id)}
                    disabled={handledMutation.isPending}
                  >
                    <Check className="size-4" />
                    {handledMutation.isPending ? "Saving…" : "Mark as handled"}
                  </Button>
                )}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
