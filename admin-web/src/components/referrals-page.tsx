import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Eye,
  Gift,
  Loader2,
  RefreshCcw,
  Search,
  ShieldAlert,
  TicketPercent,
  TrendingUp,
  Users,
} from "lucide-react"

import { useDebouncedValue } from "@/hooks/use-debounced-value"
import {
  getAdminReferral,
  listAdminReferrals,
  type AdminReferralRow,
  type AdminReferralStatus,
} from "@/lib/admin-api"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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

type ReferralStatusFilter = "all" | AdminReferralStatus
type ReferralPreset =
  | "today"
  | "yesterday"
  | "last7Days"
  | "last30Days"
  | "last90Days"
  | "thisMonth"
  | "lastMonth"
  | "lifetime"
  | "custom"
type ReferralSort = "newest" | "oldest" | "rewardedAt" | "risk"

function formatDate(value?: string | null) {
  if (!value) return "N/A"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "N/A"
  return date.toLocaleString()
}

function formatCurrency(value: number) {
  return `Tk ${Math.round(Number.isFinite(value) ? value : 0).toLocaleString()}`
}

function statusLabel(status: ReferralStatusFilter) {
  if (status === "under_review") return "Under review"
  return status
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ")
}

function statusBadgeClass(status: AdminReferralStatus) {
  if (status === "rewarded")
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (status === "pending")
    return "border-sky-200 bg-sky-50 text-sky-700"
  if (status === "under_review")
    return "border-amber-200 bg-amber-50 text-amber-700"
  if (status === "capped" || status === "disabled")
    return "border-slate-200 bg-slate-50 text-slate-700"
  return "border-rose-200 bg-rose-50 text-rose-700"
}

function compactId(value: string) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "N/A"
}

function StatCard({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string
  value: string
  helper: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
          <p className="text-xs text-muted-foreground">{helper}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export function ReferralsPage() {
  const [search, setSearch] = React.useState("")
  const [status, setStatus] = React.useState<ReferralStatusFilter>("all")
  const [preset, setPreset] = React.useState<ReferralPreset>("last30Days")
  const [from, setFrom] = React.useState("")
  const [to, setTo] = React.useState("")
  const [sortBy, setSortBy] = React.useState<ReferralSort>("newest")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(20)
  const [selectedReferral, setSelectedReferral] =
    React.useState<AdminReferralRow | null>(null)
  const debouncedSearch = useDebouncedValue(search, 300)

  React.useEffect(() => {
    setPage(1)
  }, [debouncedSearch, status, preset, from, to, sortBy, pageSize])

  React.useEffect(() => {
    if (preset !== "custom") {
      setFrom("")
      setTo("")
    }
  }, [preset])

  const referralsQuery = useQuery({
    queryKey: [
      "admin-referrals",
      debouncedSearch,
      status,
      preset,
      from,
      to,
      sortBy,
      page,
      pageSize,
    ],
    queryFn: () =>
      listAdminReferrals({
        search: debouncedSearch,
        status,
        preset,
        from: preset === "custom" ? from : undefined,
        to: preset === "custom" ? to : undefined,
        sortBy,
        page,
        pageSize,
      }),
  })

  const detailsQuery = useQuery({
    queryKey: ["admin-referral", selectedReferral?.id],
    enabled: Boolean(selectedReferral?.id),
    queryFn: () => getAdminReferral(selectedReferral?.id ?? ""),
  })

  const data = referralsQuery.data
  const summary = data?.summary
  const details = detailsQuery.data ?? selectedReferral

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Referral Analytics
          </h1>
          <p className="text-sm text-muted-foreground">
            Track who referred, who applied the code, reward status, fraud review,
            and conversion value.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void referralsQuery.refetch()}
          disabled={referralsQuery.isFetching}
        >
          {referralsQuery.isFetching ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <RefreshCcw className="mr-2 size-4" />
          )}
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Total referrals"
          value={`${summary?.totalReferrals ?? 0}`}
          helper="In selected period"
          icon={Users}
        />
        <StatCard
          label="Rewarded"
          value={`${summary?.rewardedReferrals ?? 0}`}
          helper={formatCurrency(summary?.rewardValue ?? 0)}
          icon={Gift}
        />
        <StatCard
          label="Under review"
          value={`${summary?.underReviewReferrals ?? 0}`}
          helper="Needs admin attention"
          icon={ShieldAlert}
        />
        <StatCard
          label="Blocked"
          value={`${summary?.blockedReferrals ?? 0}`}
          helper="Rejected, capped, or disabled"
          icon={TicketPercent}
        />
        <StatCard
          label="Conversion"
          value={`${summary?.conversionRate ?? 0}%`}
          helper="Rewarded / total"
          icon={TrendingUp}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Search by phone, name, referral code, order number, or voucher code.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <div className="space-y-2 xl:col-span-2">
            <Label>Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, phone, code, order"
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as ReferralStatusFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["all", "pending", "rewarded", "under_review", "rejected", "capped", "disabled"].map((item) => (
                  <SelectItem key={item} value={item}>
                    {statusLabel(item as ReferralStatusFilter)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AdminDateRangeFilter<ReferralPreset>
            value={preset}
            from={from}
            to={to}
            label="Date"
            onPresetChange={setPreset}
            onRangeChange={(range) => {
              setFrom(range.from)
              setTo(range.to)
            }}
          />
          <div className="space-y-2">
            <Label>Sort</Label>
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as ReferralSort)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="oldest">Oldest</SelectItem>
                <SelectItem value="rewardedAt">Rewarded first</SelectItem>
                <SelectItem value="risk">Highest risk</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Rows</Label>
            <Select value={`${pageSize}`} onValueChange={(value) => setPageSize(Number(value))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map((item) => (
                  <SelectItem key={item} value={`${item}`}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Referral Activity</CardTitle>
            <CardDescription>
              {data?.total ?? 0} records found. Click a row to inspect full details.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Referrer</TableHead>
                    <TableHead>Applied customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Reward</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {referralsQuery.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-28 text-center">
                        <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ) : data?.items.length ? (
                    data.items.map((referral) => (
                      <TableRow
                        key={referral.id}
                        className="cursor-pointer"
                        onClick={() => setSelectedReferral(referral)}
                      >
                        <TableCell>
                          <div className="font-medium">{referral.referrer.fullName}</div>
                          <div className="text-xs text-muted-foreground">
                            {referral.referrer.phone || "No phone"} · {referral.referrer.referralCode || "No code"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{referral.referredCustomer.fullName}</div>
                          <div className="text-xs text-muted-foreground">
                            {referral.referredCustomer.phone || "No phone"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusBadgeClass(referral.status)}>
                            {statusLabel(referral.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(referral.referredAt)}</TableCell>
                        <TableCell>
                          <div>{referral.order.orderNumber || "No order yet"}</div>
                          <div className="text-xs text-muted-foreground">
                            {referral.order.status || "Waiting"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>{referral.reward.voucherCode || "N/A"}</div>
                          <div className="text-xs text-muted-foreground">
                            {referral.reward.amount ? formatCurrency(referral.reward.amount) : "No reward"}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation()
                              setSelectedReferral(referral)
                            }}
                          >
                            <Eye className="mr-2 size-4" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                        No referrals match these filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Page {data?.page ?? page} of {data?.pageCount ?? 1}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={page <= 1 || referralsQuery.isFetching}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  disabled={page >= (data?.pageCount ?? 1) || referralsQuery.isFetching}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Referrers</CardTitle>
            <CardDescription>Highest performing referrers in this period.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data?.topReferrers.length ? (
              data.topReferrers.map((referrer) => (
                <div key={referrer.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{referrer.fullName}</p>
                      <p className="text-xs text-muted-foreground">
                        {referrer.phone || "No phone"} · {referrer.referralCode || "No code"}
                      </p>
                    </div>
                    <Badge variant="secondary">{referrer.rewardedReferrals} won</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Total</p>
                      <p className="font-semibold">{referrer.totalReferrals}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Review</p>
                      <p className="font-semibold">{referrer.underReviewReferrals}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Reward</p>
                      <p className="font-semibold">{formatCurrency(referrer.rewardValue)}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No referrer activity yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <ReferralDetailsDrawer
        referral={details}
        loading={detailsQuery.isFetching && Boolean(selectedReferral)}
        open={Boolean(selectedReferral)}
        onOpenChange={(open) => {
          if (!open) setSelectedReferral(null)
        }}
      />
    </div>
  )
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 text-sm">{value || "N/A"}</div>
    </div>
  )
}

function ReferralDetailsDrawer({
  referral,
  loading,
  open,
  onOpenChange,
}: {
  referral: AdminReferralRow | null
  loading: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl! md:max-w-6xl!">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle>Referral details</SheetTitle>
          <SheetDescription>
            Referrer, applied customer, order, reward, and fraud context.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1 p-6">
          {loading && !referral ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : referral ? (
            <div className="space-y-6">
              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Current status</p>
                    <Badge variant="outline" className={statusBadgeClass(referral.status)}>
                      {statusLabel(referral.status)}
                    </Badge>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Risk score</p>
                    <p className="text-lg font-semibold">{referral.riskScore}</p>
                  </div>
                </div>
                {referral.skippedReason ? (
                  <p className="mt-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">
                    {referral.skippedReason}
                  </p>
                ) : null}
              </div>

              <section className="space-y-3">
                <h3 className="font-semibold">People</h3>
                <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                  <DetailItem label="Referrer" value={referral.referrer.fullName} />
                  <DetailItem label="Referrer phone" value={referral.referrer.phone} />
                  <DetailItem label="Referral code" value={referral.referrer.referralCode} />
                  <DetailItem label="Referrer ID" value={compactId(referral.referrer.id)} />
                  <DetailItem label="Applied customer" value={referral.referredCustomer.fullName} />
                  <DetailItem label="Applied phone" value={referral.referredCustomer.phone} />
                  <DetailItem label="Applied date" value={formatDate(referral.referredAt)} />
                  <DetailItem label="Customer ID" value={compactId(referral.referredCustomer.id)} />
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="font-semibold">Reward and Order</h3>
                <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                  <DetailItem label="Order number" value={referral.order.orderNumber} />
                  <DetailItem label="Order status" value={referral.order.status} />
                  <DetailItem label="Payment" value={`${referral.order.paymentMethod || "N/A"} / ${referral.order.paymentStatus || "N/A"}`} />
                  <DetailItem label="Order total" value={formatCurrency(referral.order.total)} />
                  <DetailItem label="Delivered at" value={formatDate(referral.order.deliveredAt)} />
                  <DetailItem label="Voucher code" value={referral.reward.voucherCode} />
                  <DetailItem label="Reward amount" value={formatCurrency(referral.reward.amount)} />
                  <DetailItem label="Rewarded at" value={formatDate(referral.reward.rewardedAt)} />
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="font-semibold">Fraud Context</h3>
                <div className="grid gap-4 rounded-lg border p-4">
                  <DetailItem label="Signup device/install ID" value={referral.fraud.signupDeviceId} />
                  <DetailItem label="Signup IP" value={referral.fraud.signupIpAddress} />
                  <DetailItem label="Signup user agent" value={referral.fraud.signupUserAgent} />
                  <DetailItem
                    label="Delivery address"
                    value={
                      referral.order.deliveryAddress.addressLine ||
                      referral.order.deliveryAddress.label
                    }
                  />
                </div>
              </section>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No referral selected.</p>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
