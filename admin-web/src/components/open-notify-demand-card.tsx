import { useQuery } from "@tanstack/react-query"
import { BellRing } from "lucide-react"

import { getAdminOpenNotifyStats } from "@/lib/admin-api"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

// Demand while Foodbela is closed: customers who tapped "Notify me when open" in the app.
// Step 1 of the pre-order plan — if many people ask every day, pre-orders are worth it.
export function OpenNotifyDemandCard() {
  const statsQuery = useQuery({
    queryKey: ["admin", "open-notify", "stats", 14],
    queryFn: () => getAdminOpenNotifyStats(14),
    staleTime: 60_000,
  })
  const stats = statsQuery.data
  const maxRequests = Math.max(1, ...(stats?.byDay.map((day) => day.requests) ?? [1]))
  const avgPerDay = stats && stats.byDay.length ? Math.round(stats.requests / stats.byDay.length) : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="size-4" />
          Demand while closed
        </CardTitle>
        <CardDescription>
          Customers who tapped “Notify me when open” on the closed home screen (last 14 days). They
          get a push the moment their area reopens. Use this to decide on pre-orders or longer
          hours.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {statsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : statsQuery.isError || !stats ? (
          <p className="text-sm text-destructive">Couldn’t load the stats.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Requests (14d)" value={stats.requests} />
              <Stat label="Avg / day" value={avgPerDay} />
              <Stat label="Waiting now" value={stats.pending} />
              <Stat label="Notified" value={stats.sent} />
            </div>
            {stats.byDay.length ? (
              <div className="space-y-1.5">
                {stats.byDay.map((day) => (
                  <div key={day.date} className="flex items-center gap-3 text-xs">
                    <span className="w-20 shrink-0 tabular-nums text-muted-foreground">{day.date}</span>
                    <div className="h-2 flex-1 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-amber-400"
                        style={{ width: `${Math.round((day.requests / maxRequests) * 100)}%` }}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right tabular-nums">
                      {day.requests} · {day.customers} ppl
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No requests yet — they appear once customers tap the button while you’re closed.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
