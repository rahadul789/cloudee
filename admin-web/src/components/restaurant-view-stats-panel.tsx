import * as React from "react"
import { useQuery } from "@tanstack/react-query"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import {
  getAdminRestaurantViewStats,
  type AdminRestaurantViewWindowKey,
} from "@/lib/customer-analytics-api"

const WINDOW_OPTIONS: Array<{
  value: AdminRestaurantViewWindowKey
  label: string
}> = [
  { value: "5m", label: "Last 5 min" },
  { value: "10m", label: "Last 10 min" },
  { value: "20m", label: "Last 20 min" },
  { value: "1h", label: "Last 1 hour" },
  { value: "24h", label: "Last 24 hours" },
  { value: "today", label: "Today" },
]

const REFRESH_INTERVAL_MS = 15_000

function formatCount(value: number) {
  return value.toLocaleString()
}

/**
 * Live restaurant-view analytics for a single restaurant: how many times it was viewed across
 * rolling time windows (5m / 10m / 20m / 1h / 24h / today), where those views came from inside the
 * app (carousel / featured / search / …), and a 14-day daily series. Auto-refreshes so admins can
 * watch traffic in near real time.
 */
export function RestaurantViewStatsPanel({
  restaurantId,
}: {
  restaurantId: string
}) {
  const [windowKey, setWindowKey] =
    React.useState<AdminRestaurantViewWindowKey>("24h")

  const statsQuery = useQuery({
    queryKey: ["admin", "restaurant-view-stats", restaurantId, windowKey],
    queryFn: () =>
      getAdminRestaurantViewStats({ restaurantId, window: windowKey }),
    enabled: Boolean(restaurantId),
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: true,
  })

  const stats = statsQuery.data
  const windows =
    stats?.windows ??
    WINDOW_OPTIONS.map((option) => ({
      key: option.value,
      label: option.label,
      views: 0,
      visitors: 0,
    }))
  const selectedWindowLabel =
    stats?.window.label ??
    WINDOW_OPTIONS.find((option) => option.value === windowKey)?.label ??
    "window"

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <span className="text-sm font-medium text-muted-foreground">
            Live · refreshes every 15s
          </span>
          {statsQuery.isFetching ? (
            <span className="text-xs text-muted-foreground">updating…</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Source window
          </span>
          <Select
            value={windowKey}
            onValueChange={(value) =>
              setWindowKey(value as AdminRestaurantViewWindowKey)
            }
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WINDOW_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {statsQuery.isError ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            Could not load view stats. It will retry automatically.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {windows.map((window) => (
          <Card
            key={window.key}
            className={
              window.key === windowKey ? "border-primary shadow-sm" : undefined
            }
          >
            <CardContent className="space-y-1 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                {window.label}
              </p>
              <p className="text-2xl font-bold tabular-nums">
                {formatCount(window.views)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatCount(window.visitors)} unique
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Where views came from · {selectedWindowLabel}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(stats?.bySource.length ?? 0) === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No views in this window yet.
            </p>
          ) : (
            <div className="space-y-3">
              {stats?.bySource.map((row) => (
                <div key={row.source} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">{row.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatCount(row.views)} views · {formatCount(row.visitors)}{" "}
                      people · {row.sharePct}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.min(100, row.sharePct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Daily views (last 14 days)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Views</TableHead>
                <TableHead className="text-right">Unique visitors</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(stats?.byDate ?? []).map((row) => (
                <TableRow key={row.date}>
                  <TableCell className="font-medium">{row.date}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCount(row.views)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCount(row.visitors)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
