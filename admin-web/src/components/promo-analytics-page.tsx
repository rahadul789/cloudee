import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2, RefreshCcw, TicketPercent } from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  getAdminZoneScope,
  getAdminZoneScopeQueryParams,
  subscribeAdminZoneScope,
} from "@/lib/admin-zone-scope"
import {
  getAdminPromoAnalytics,
  type AdminPromoAnalyticsPreset,
} from "@/lib/promo-analytics-api"

const FUNDED_BY_COLORS: Record<string, string> = {
  owner: "#2563eb",
  platform: "#16a34a",
  shared: "#f59e0b",
}

const FUNDED_BY_LABELS: Record<string, string> = {
  owner: "Restaurant funded",
  platform: "Platform funded",
  shared: "Shared",
}

function formatNumber(value?: number) {
  return Math.round(value || 0).toLocaleString()
}

function formatCurrency(value?: number) {
  return `Tk ${Math.round(value || 0).toLocaleString()}`
}

function formatDate(value?: string | null) {
  if (!value) return "N/A"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "N/A"
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

function formatDayLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date)
}

function fundedByBadgeClass(fundedBy: string) {
  if (fundedBy === "platform")
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (fundedBy === "shared")
    return "border-amber-200 bg-amber-50 text-amber-700"
  return "border-sky-200 bg-sky-50 text-sky-700"
}

function StatCard({
  label,
  value,
  helper,
}: {
  label: string
  value: string
  helper?: string
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
        {helper ? (
          <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function PromoAnalyticsPage() {
  const [preset, setPreset] = React.useState<AdminPromoAnalyticsPreset>("last30Days")
  const [from, setFrom] = React.useState("")
  const [to, setTo] = React.useState("")
  const [scope, setScope] = React.useState(() => getAdminZoneScope())
  const scopeKey = `${scope.type}:${scope.id}`

  React.useEffect(
    () => subscribeAdminZoneScope(() => setScope(getAdminZoneScope())),
    []
  )

  const promoQuery = useQuery({
    queryKey: ["admin-promo-analytics", preset, from, to, scopeKey],
    queryFn: () =>
      getAdminPromoAnalytics({
        preset,
        from: preset === "custom" ? from : undefined,
        to: preset === "custom" ? to : undefined,
        ...getAdminZoneScopeQueryParams(),
      }),
    placeholderData: (previous) => previous,
  })

  const data = promoQuery.data
  const summary = data?.summary
  const fundedByData = (data?.fundedBy ?? []).filter((row) => row.redemptions > 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <TicketPercent className="size-5" />
            Offer &amp; Promo Tracking
          </h1>
          <p className="text-sm text-muted-foreground">
            Coupon usage, restaurant vs platform-funded offers, top redeemers, and
            push-campaign performance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AdminDateRangeFilter
            value={preset}
            from={from}
            to={to}
            onPresetChange={(value) => setPreset(value)}
            onRangeChange={(range) => {
              setFrom(range.from)
              setTo(range.to)
            }}
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => void promoQuery.refetch()}
            aria-label="Refresh promo analytics"
          >
            {promoQuery.isFetching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCcw className="size-4" />
            )}
          </Button>
        </div>
      </div>

      {promoQuery.isLoading ? (
        <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total redemptions"
              value={formatNumber(summary?.totalRedemptions)}
              helper={`${formatNumber(summary?.activeOffers)} offers used`}
            />
            <StatCard
              label="Unique customers"
              value={formatNumber(summary?.uniqueCustomers)}
              helper="Distinct redeemers in range"
            />
            <StatCard
              label="Total discount cost"
              value={formatCurrency(summary?.totalDiscount)}
              helper={`Restaurant ${formatCurrency(summary?.ownerFundedDiscount)} · Platform ${formatCurrency(summary?.platformFundedDiscount)}`}
            />
            <StatCard
              label="Influenced revenue"
              value={formatCurrency(summary?.influencedRevenue)}
              helper="Delivered orders that used an offer"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Redemption &amp; discount trend</CardTitle>
                <CardDescription>
                  Daily offer usage and discount spend.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(data?.trend?.length ?? 0) > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={data?.trend ?? []}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11 }}
                        tickFormatter={formatDayLabel}
                      />
                      <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(value) => formatCurrency(Number(value))}
                      />
                      <Tooltip
                        labelFormatter={(value) => formatDayLabel(String(value))}
                        formatter={(value: unknown, name) => [
                          String(name).toLowerCase().includes("discount")
                            ? formatCurrency(Number(value ?? 0))
                            : formatNumber(Number(value ?? 0)),
                          name,
                        ]}
                      />
                      <Bar
                        yAxisId="left"
                        dataKey="redemptions"
                        name="Redemptions"
                        fill="#2563eb"
                        maxBarSize={28}
                        radius={[4, 4, 0, 0]}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="discount"
                        name="Discount"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dot={(data?.trend?.length ?? 0) <= 2 ? { r: 2 } : false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-[280px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                    No redemptions in this timeframe.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Who funds the discount</CardTitle>
                <CardDescription>
                  Restaurant vs platform vs shared funding.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {fundedByData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={fundedByData}
                        dataKey="discount"
                        nameKey="key"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                      >
                        {fundedByData.map((row) => (
                          <Cell
                            key={row.key}
                            fill={FUNDED_BY_COLORS[row.key] ?? "#94a3b8"}
                          />
                        ))}
                      </Pie>
                      <Legend
                        formatter={(value) => FUNDED_BY_LABELS[String(value)] ?? value}
                      />
                      <Tooltip
                        formatter={(value: unknown, name) => [
                          formatCurrency(Number(value ?? 0)),
                          FUNDED_BY_LABELS[String(name)] ?? name,
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-[280px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                    No funded discount yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Offer leaderboard</CardTitle>
              <CardDescription>
                Most-used offers with funding source and influenced revenue.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Offer</TableHead>
                      <TableHead>Funding</TableHead>
                      <TableHead>Scope</TableHead>
                      <TableHead className="text-right">Redemptions</TableHead>
                      <TableHead className="text-right">Customers</TableHead>
                      <TableHead className="text-right">Discount</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Last used</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.offers ?? []).map((offer) => (
                      <TableRow key={offer.voucherId}>
                        <TableCell>
                          <div className="font-medium">{offer.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {offer.code ? `${offer.code} · ` : ""}
                            {offer.restaurantName || "All restaurants"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={fundedByBadgeClass(offer.fundedBy)}
                          >
                            {FUNDED_BY_LABELS[offer.fundedBy] ?? offer.fundedBy}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {offer.scopeType.replace(/_/g, " ")}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatNumber(offer.redemptions)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatNumber(offer.uniqueCustomers)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(offer.discount)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(offer.influencedRevenue)}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {formatDate(offer.lastUsedAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(data?.offers?.length ?? 0) === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="py-8 text-center text-sm text-muted-foreground"
                        >
                          No offers used in this timeframe.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Top offer redeemers</CardTitle>
                <CardDescription>
                  Customers using the most offers and the discount they captured.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">Redemptions</TableHead>
                        <TableHead className="text-right">Distinct offers</TableHead>
                        <TableHead className="text-right">Discount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(data?.topCustomers ?? []).map((customer) => (
                        <TableRow key={customer.customerId}>
                          <TableCell>
                            <div className="font-medium">{customer.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {customer.phone || "No phone"}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatNumber(customer.redemptions)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(customer.distinctOffers)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(customer.discount)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {(data?.topCustomers?.length ?? 0) === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="py-8 text-center text-sm text-muted-foreground"
                          >
                            No redeemers in this timeframe.
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
                <CardTitle>Push campaign performance</CardTitle>
                <CardDescription>
                  Promotion push notifications and their open rate.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campaign</TableHead>
                        <TableHead className="text-right">Sent</TableHead>
                        <TableHead className="text-right">Opened</TableHead>
                        <TableHead className="text-right">Open rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(data?.pushPromos ?? []).map((promo) => (
                        <TableRow key={promo.voucherId}>
                          <TableCell>
                            <div className="font-medium">
                              {promo.title || promo.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {promo.code ? `${promo.code} · ` : ""}
                              {formatDate(promo.sentAt)}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(promo.sentCount)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(promo.openCount)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {promo.openRate}%
                          </TableCell>
                        </TableRow>
                      ))}
                      {(data?.pushPromos?.length ?? 0) === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="py-8 text-center text-sm text-muted-foreground"
                          >
                            No push campaigns sent yet.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Offers by discount type</CardTitle>
              <CardDescription>
                Redemptions split across flat, percentage, and free-delivery offers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(data?.byType?.length ?? 0) > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data?.byType ?? []}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="type"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(value) => String(value).replace(/_/g, " ")}
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value: unknown, name) => [
                        String(name).toLowerCase().includes("discount")
                          ? formatCurrency(Number(value ?? 0))
                          : formatNumber(Number(value ?? 0)),
                        name,
                      ]}
                    />
                    <Bar
                      dataKey="redemptions"
                      name="Redemptions"
                      fill="#7c3aed"
                      maxBarSize={48}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[240px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                  No offer types used yet.
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
